import path from 'node:path';
import { buildContentArtifacts } from '../src/services/content/content-artifacts.js';

const projectRoot = path.resolve('.');

const result = buildContentArtifacts({
  projectRoot,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      generatedAt: result.manifest.generatedAt,
      homepageSections: result.manifest.homepageSectionCount,
      jodiCount: result.manifest.jodiCount,
      panelCount: result.manifest.panelCount,
      marketCount: result.manifest.marketCount,
    },
    null,
    2,
  ),
);

