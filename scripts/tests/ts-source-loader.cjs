'use strict';
// Test-only Node 22 loader for suites that intentionally execute the real TS source graph instead of a bundle.
// Production/Vite/distribution resolution is unchanged. Missing files still fail; this is not a fallback to artifacts.
const { register } = require('node:module');
const { pathToFileURL } = require('node:url');

const loader = `
import { statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    const retryable = error?.code === 'ERR_MODULE_NOT_FOUND' || error?.code === 'ERR_UNSUPPORTED_DIR_IMPORT';
    if (!retryable || !specifier.startsWith('.') || !context.parentURL?.startsWith('file:') || specifier.endsWith('.ts')) throw error;
    for (const suffix of ['.ts', '/index.ts']) {
      const url = new URL(specifier + suffix, context.parentURL);
      try {
        if (statSync(fileURLToPath(url)).isFile()) return { url: url.href, shortCircuit: true };
      } catch (candidateError) {
        if (candidateError?.code !== 'ENOENT' && candidateError?.code !== 'ENOTDIR') throw candidateError;
      }
    }
    throw error;
  }
}

export async function load(url, context, next) {
  if (url.endsWith('.ts')) return {
    format: 'module',
    source: stripTypeScriptTypes(await readFile(new URL(url), 'utf8'), { sourceUrl: url }),
    shortCircuit: true,
  };
  return next(url, context);
}
`;

register(`data:text/javascript,${encodeURIComponent(loader)}`, pathToFileURL(__filename));
