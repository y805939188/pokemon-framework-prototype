#!/usr/bin/env node
'use strict';

// Own only src/vendor/rpgreactor; project-specific declarations stay in src/types.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [mode, destination, source] = process.argv.slice(2);
const generatedDOM = 'types/compat/lib.dom.generated.d.ts';
const required = [
  'types/globals.d.ts', 'types/reactor-data.d.ts', 'types/reactor-core.d.ts',
  'types/reactor-managers.d.ts', 'types/reactor-objects.d.ts',
  'types/reactor-scenes.d.ts', 'types/reactor-sprites.d.ts',
  'types/reactor-windows.d.ts', 'types/reactor-3d.d.ts',
  'types/compat/@webgpu/types/index.d.ts', 'types/tools/typecheck.cjs', 'LICENSE',
];

function bundleFiles(root) {
  const files = [];
  function walk(relative) {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const file = `${relative}/${entry.name}`;
      if (['types/tests', 'types/examples'].includes(file) || file === generatedDOM) continue;
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && (file.endsWith('.d.ts') || file === 'types/tools/typecheck.cjs')) files.push(file);
    }
  }
  walk('types');
  files.push('LICENSE');
  return files.sort();
}

function hash(root, file) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
}

function sourceManifest(root) {
  for (const file of required) {
    if (!fs.statSync(path.join(root, file), { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Missing ${file}. Select your typed RPGReactor checkout with REACTOR_SOURCE=/path/to/RPGReactor.`);
    }
  }
  if (!fs.readFileSync(path.join(root, 'types/tools/typecheck.cjs'), 'utf8').includes('--compiler-root')) {
    throw new Error('The source types/tools/typecheck.cjs needs --compiler-root support for installed bundles.');
  }
  return Object.fromEntries(bundleFiles(root).map(file => [file, hash(root, file)]));
}

try {
  if (!destination || !['validate', 'sync', 'check'].includes(mode)) throw new Error('Usage: reactor-types.cjs validate|sync|check DEST [SOURCE]');
  if (mode === 'validate') {
    sourceManifest(source);
  } else if (mode === 'check') {
    const manifest = JSON.parse(fs.readFileSync(path.join(destination, 'manifest.json'), 'utf8'));
    const installed = sourceManifest(destination);
    if (JSON.stringify(manifest) !== JSON.stringify(installed)) throw new Error('Installed declaration bundle is missing, modified or stale. Run setup-reactor.sh --install.');
    if (source && JSON.stringify(manifest) !== JSON.stringify(sourceManifest(source))) {
      throw new Error('Source declarations have changed. Run setup-reactor.sh --install.');
    }
    console.log('PASS: Reactor declaration bundle is complete and matches its source hashes.');
  } else {
    const manifest = sourceManifest(source);
    // Stage a complete bundle before replacing the previous managed copy.
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const staging = fs.mkdtempSync(`${destination}.tmp-`);
    try {
      for (const file of Object.keys(manifest)) {
        const target = path.join(staging, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(source, file), target);
      }
      fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
      // Preserve only a generated DOM file; source declarations are always replaced.
      if (fs.existsSync(path.join(destination, generatedDOM))) {
        fs.copyFileSync(path.join(destination, generatedDOM), path.join(staging, generatedDOM));
      }
      fs.rmSync(destination, { recursive: true, force: true });
      fs.renameSync(staging, destination);
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }
    console.log(`Installed ${Object.keys(manifest).length} Reactor type bundle files.`);
  }
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
}
