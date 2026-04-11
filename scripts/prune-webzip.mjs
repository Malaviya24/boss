import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('webzip');

const TYPE_CONFIG = {
  jodi: {
    dir: path.join(ROOT, 'jodi'),
    folderPattern: /^\d+-jodi-dpboss\.boston-jodi-chart-record-(.+)\.php$/i,
  },
  panel: {
    dir: path.join(ROOT, 'panel'),
    folderPattern: /^\d+-panel-dpboss\.boston-panel-chart-record-(.+)\.php$/i,
  },
};

const SHARED_ASSET_PATHS = [
  'images/logo.png',
  'images/fav/favicon.ico',
];

function getDirSize(dirPath) {
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirSize(fullPath);
      continue;
    }
    total += fs.statSync(fullPath).size;
  }
  return total;
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copySharedAssets(type, marketFolders) {
  const sharedRoot = path.join(ROOT, 'shared', type);
  ensureDirectory(sharedRoot);

  for (const relativeAssetPath of SHARED_ASSET_PATHS) {
    const sourcePath = marketFolders
      .map((marketFolder) => path.join(marketFolder, relativeAssetPath))
      .find((candidate) => fs.existsSync(candidate));

    if (!sourcePath) {
      continue;
    }

    const targetPath = path.join(sharedRoot, relativeAssetPath);
    ensureDirectory(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function getMarketFolders(typeConfig) {
  if (!fs.existsSync(typeConfig.dir)) {
    return [];
  }

  return fs
    .readdirSync(typeConfig.dir, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && typeConfig.folderPattern.test(entry.name),
    )
    .map((entry) => path.join(typeConfig.dir, entry.name))
    .sort();
}

function pruneMarketFolder(marketFolder) {
  const keepFile = path.join(marketFolder, 'index.html');

  for (const entry of fs.readdirSync(marketFolder, { withFileTypes: true })) {
    const fullPath = path.join(marketFolder, entry.name);
    if (fullPath === keepFile) {
      continue;
    }

    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}

function run() {
  if (!fs.existsSync(ROOT)) {
    throw new Error('webzip folder not found');
  }

  const beforeBytes = getDirSize(ROOT);
  let totalPrunedFolders = 0;

  for (const [type, config] of Object.entries(TYPE_CONFIG)) {
    const marketFolders = getMarketFolders(config);
    if (marketFolders.length === 0) {
      continue;
    }

    copySharedAssets(type, marketFolders);

    for (const marketFolder of marketFolders) {
      pruneMarketFolder(marketFolder);
      totalPrunedFolders += 1;
    }
  }

  const afterBytes = getDirSize(ROOT);
  const savedBytes = beforeBytes - afterBytes;

  console.log(
    JSON.stringify(
      {
        beforeBytes,
        afterBytes,
        savedBytes,
        savedMB: Number((savedBytes / (1024 * 1024)).toFixed(2)),
        prunedFolders: totalPrunedFolders,
      },
      null,
      2,
    ),
  );
}

run();
