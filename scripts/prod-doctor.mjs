import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

const projectRoot = process.cwd();

function readEnvFile(relativePath) {
  const fullPath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    return {};
  }
  const raw = fs.readFileSync(fullPath, 'utf8');
  return dotenv.parse(raw);
}

function normalize(value = '') {
  return String(value ?? '').trim();
}

function parseUrl(value) {
  try {
    return new URL(normalize(value));
  } catch {
    return null;
  }
}

function hasRenderableCorsOrigin(corsOriginValue, requiredOrigin) {
  const entries = normalize(corsOriginValue)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/\/+$/, ''));

  return entries.includes(requiredOrigin.replace(/\/+$/, ''));
}

function printHeader(message) {
  console.log(`\n=== ${message} ===`);
}

function printOk(message) {
  console.log(`OK   ${message}`);
}

function printWarn(message) {
  console.log(`WARN ${message}`);
}

function printFail(message) {
  console.log(`FAIL ${message}`);
}

function getGitHead() {
  const envSha = normalize(process.env.VERCEL_GIT_COMMIT_SHA || process.env.RENDER_GIT_COMMIT);
  if (envSha) {
    return envSha.slice(0, 12);
  }

  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: true,
    })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

function main() {
  const rootEnv = readEnvFile('.env');
  const clientEnv = readEnvFile(path.join('client', '.env'));
  const mergedRoot = { ...rootEnv, ...process.env };
  const mergedClient = { ...clientEnv, ...process.env };

  const expectedFrontendOrigin = 'https://dpboss-king.vercel.app';
  const expectedRenderHostSuffix = '.onrender.com';
  const failures = [];

  printHeader('DPBOSS Production Doctor');
  const head = getGitHead();
  if (head) {
    printOk(`Current git HEAD: ${head}`);
  } else {
    printWarn('Could not read git HEAD');
  }

  printHeader('Backend env checks');
  const backendRequired = ['CORS_ORIGIN', 'CSRF_TOKEN'];
  for (const key of backendRequired) {
    const value = normalize(mergedRoot[key]);
    if (!value) {
      failures.push(`${key} missing in backend env`);
      printFail(`${key} is missing`);
    } else {
      printOk(`${key} is set`);
    }
  }

  const corsOrigin = normalize(mergedRoot.CORS_ORIGIN);
  if (corsOrigin) {
    if (hasRenderableCorsOrigin(corsOrigin, expectedFrontendOrigin)) {
      printOk(`CORS_ORIGIN includes ${expectedFrontendOrigin}`);
    } else {
      failures.push(`CORS_ORIGIN must include ${expectedFrontendOrigin}`);
      printFail(`CORS_ORIGIN does not include ${expectedFrontendOrigin}`);
    }
  }

  printHeader('Frontend env checks');
  const frontendRequired = [
    'VITE_MATKA_API_BASE_URL',
    'VITE_CONTENT_API_BASE_URL',
    'RENDER_BACKEND_URL',
    'VITE_CSRF_TOKEN',
  ];

  for (const key of frontendRequired) {
    const value = normalize(mergedClient[key]);
    if (!value) {
      failures.push(`${key} missing in frontend env`);
      printFail(`${key} is missing`);
    } else {
      printOk(`${key} is set`);
    }
  }

  for (const key of ['VITE_MATKA_API_BASE_URL', 'VITE_CONTENT_API_BASE_URL', 'RENDER_BACKEND_URL']) {
    const raw = normalize(mergedClient[key]);
    if (!raw) {
      continue;
    }

    const parsed = parseUrl(raw);
    if (!parsed) {
      failures.push(`${key} must be a valid URL`);
      printFail(`${key} is not a valid URL`);
      continue;
    }

    if (parsed.protocol !== 'https:') {
      failures.push(`${key} must use https`);
      printFail(`${key} must use https`);
    } else {
      printOk(`${key} uses https`);
    }

    if (!parsed.host.endsWith(expectedRenderHostSuffix)) {
      failures.push(`${key} should point to Render (.onrender.com)`);
      printFail(`${key} is not pointing to a .onrender.com host`);
    } else {
      printOk(`${key} points to Render host`);
    }

    if (parsed.host.includes('vercel.app')) {
      failures.push(`${key} must not point to Vercel host`);
      printFail(`${key} points to vercel.app (invalid for backend origin)`);
    }
  }

  const backendCsrf = normalize(mergedRoot.CSRF_TOKEN);
  const frontendCsrf = normalize(mergedClient.VITE_CSRF_TOKEN);
  if (backendCsrf && frontendCsrf) {
    if (backendCsrf === frontendCsrf) {
      printOk('CSRF tokens match (backend CSRF_TOKEN == frontend VITE_CSRF_TOKEN)');
    } else {
      failures.push('CSRF_TOKEN and VITE_CSRF_TOKEN must match');
      printFail('CSRF token mismatch between backend and frontend');
    }
  }

  printHeader('Manual dashboard checks');
  printWarn('Vercel Project Root Directory must be set to: client');
  printWarn('Vercel Production Branch must be set to: main');
  printWarn('Redeploy production once with Build Cache disabled');

  printHeader('Result');
  if (failures.length === 0) {
    printOk('Production doctor passed');
    process.exit(0);
  }

  printFail(`Production doctor failed (${failures.length} issue(s))`);
  for (const item of failures) {
    console.log(` - ${item}`);
  }
  process.exit(1);
}

main();
