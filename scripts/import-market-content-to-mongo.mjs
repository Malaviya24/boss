import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../src/config/env.js';
import { connectMongo, disconnectMongo } from '../src/config/mongo.js';
import { createLogger } from '../src/utils/logger.js';
import { createSlug } from '../src/utils/normalize.js';
import { MarketContentMarketModel } from '../src/models/market-content-market-model.js';
import { MarketMetaModel } from '../src/models/market-meta-model.js';
import { MarketChartRowModel } from '../src/models/market-chart-row-model.js';
import { toStructuredMarketContent } from '../src/services/market-content/market-content-transform.js';

const projectRoot = path.resolve('.');
const generatedRoot = path.join(projectRoot, 'generated', 'content', 'market');

function normalizeText(value = '') {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toMarketName(payload) {
  const fromResult = normalizeText(payload.result?.marketName);
  if (fromResult) {
    return fromResult.toUpperCase();
  }

  const title = normalizeText(payload.hero?.chartTitle)
    .replace(/\b(?:JODI|PANEL)\s+CHART\b/gi, '')
    .trim();
  if (title) {
    return title.toUpperCase();
  }

  const fromSlug = normalizeText(payload.slug).replace(/-/g, ' ');
  return fromSlug.toUpperCase();
}

function listArtifactFiles(type) {
  const typeDir = path.join(generatedRoot, type);
  if (!fs.existsSync(typeDir)) {
    return [];
  }

  return fs
    .readdirSync(typeDir)
    .filter((fileName) => fileName.toLowerCase().endsWith('.json'))
    .map((fileName) => path.join(typeDir, fileName))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function loadArtifactPayload(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function upsertMarketContent(payload, { dryRun = false } = {}) {
  const marketName = toMarketName(payload);
  const safeSlug = createSlug(payload.slug);
  if (!safeSlug) {
    return { skipped: true, reason: 'invalid_slug' };
  }

  if (dryRun) {
    return {
      skipped: false,
      slug: safeSlug,
      type: payload.type,
      rows: payload.table?.rows?.length ?? 0,
    };
  }

  const importedAt = new Date();
  const market = await MarketContentMarketModel.findOneAndUpdate(
    {
      slug: safeSlug,
      type: payload.type,
    },
    {
      $set: {
        name: marketName,
        slug: safeSlug,
        type: payload.type,
        isActive: true,
        status: 'active',
        importSource: 'generated',
        importedAt,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  );

  await MarketMetaModel.findOneAndUpdate(
    {
      marketId: market._id,
      type: payload.type,
    },
    {
      $set: {
        marketId: market._id,
        type: payload.type,
        title: payload.title,
        description: payload.description,
        seo: payload.seo,
        styleUrls: payload.styles?.urls ?? [],
        styleBlocks: payload.styles?.blocks ?? [],
        jsonLdBlocks: payload.styles?.jsonLdBlocks ?? [],
        hero: payload.hero ?? {},
        result: payload.result ?? {},
        controls: payload.controls ?? {},
        table: {
          title: payload.table?.title ?? '',
          columns: payload.table?.columns ?? [],
          attrs:
            payload.table?.attrs && typeof payload.table.attrs === 'object'
              ? { ...payload.table.attrs }
              : {},
          headingAttrs:
            payload.table?.headingAttrs && typeof payload.table.headingAttrs === 'object'
              ? { ...payload.table.headingAttrs }
              : {},
          titleAttrs:
            payload.table?.titleAttrs && typeof payload.table.titleAttrs === 'object'
              ? { ...payload.table.titleAttrs }
              : {},
        },
        footer: payload.footer ?? {},
        headings: [],
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  );

  await MarketChartRowModel.deleteMany({
    marketId: market._id,
    type: payload.type,
  });

  const rows = Array.isArray(payload.table?.rows) ? payload.table.rows : [];
  if (rows.length > 0) {
    await MarketChartRowModel.insertMany(
      rows.map((row, rowIndex) => ({
        marketId: market._id,
        type: payload.type,
        rowIndex: Number.isFinite(row.rowIndex) ? row.rowIndex : rowIndex,
        cells: Array.isArray(row.cells)
          ? row.cells.map((cell) => ({
              column: normalizeText(cell.column),
              text: normalizeText(cell.text),
              isHighlight: Boolean(cell.isHighlight),
              className: normalizeText(cell.className),
              attrs: cell.attrs && typeof cell.attrs === 'object' ? { ...cell.attrs } : {},
            }))
          : [],
      })),
      {
        ordered: true,
      },
    );
  }

  return {
    skipped: false,
    slug: safeSlug,
    type: payload.type,
    rows: rows.length,
  };
}

async function verifyImport() {
  const [marketCount, jodiCount, panelCount] = await Promise.all([
    MarketContentMarketModel.countDocuments({}),
    MarketContentMarketModel.countDocuments({ type: 'jodi' }),
    MarketContentMarketModel.countDocuments({ type: 'panel' }),
  ]);

  const [metaCount, rowsCount] = await Promise.all([
    MarketMetaModel.countDocuments({}),
    MarketChartRowModel.countDocuments({}),
  ]);

  return {
    marketCount,
    jodiCount,
    panelCount,
    metaCount,
    rowsCount,
  };
}

async function run() {
  const dryRun = process.argv.includes('--dry');
  const verifyOnly = process.argv.includes('--verify');

  const env = loadEnv();
  const logger = createLogger('market-import', { level: env.logLevel });
  const mongoState = await connectMongo({
    uri: env.mongoUri,
    logger,
  });

  if (!mongoState.enabled) {
    throw new Error('Mongo connection is required. Set MONGODB_URI first.');
  }

  const filesByType = {
    jodi: listArtifactFiles('jodi'),
    panel: listArtifactFiles('panel'),
  };

  if (verifyOnly) {
    const summary = await verifyImport();
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: 'verify',
          ...summary,
        },
        null,
        2,
      ),
    );
    await disconnectMongo({ logger });
    return;
  }

  const report = {
    dryRun,
    importedAt: new Date().toISOString(),
    files: {
      jodi: filesByType.jodi.length,
      panel: filesByType.panel.length,
    },
    processed: 0,
    skipped: 0,
    rowCount: 0,
    failures: [],
  };

  for (const type of ['jodi', 'panel']) {
    for (const filePath of filesByType[type]) {
      try {
        const artifact = loadArtifactPayload(filePath);
        const payload = toStructuredMarketContent(artifact);
        const result = await upsertMarketContent(payload, { dryRun });
        if (result.skipped) {
          report.skipped += 1;
          continue;
        }
        report.processed += 1;
        report.rowCount += Number(result.rows ?? 0);
      } catch (error) {
        report.failures.push({
          file: path.relative(projectRoot, filePath),
          message: error.message,
        });
      }
    }
  }

  const verification = dryRun ? null : await verifyImport();
  console.log(
    JSON.stringify(
      {
        ok: report.failures.length === 0,
        report,
        verification,
      },
      null,
      2,
    ),
  );

  await disconnectMongo({ logger });

  if (report.failures.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error.message,
        stack: error.stack,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
