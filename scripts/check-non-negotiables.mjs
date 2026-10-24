#!/usr/bin/env node
/**
 * Lightweight guard for high-risk user-facing copy.
 * Scans app/, components/, and lib/ source; ignores comments and test files.
 * This is a copy guard only, not a proof of mutation-authority correctness.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const roots = ['app', 'components', 'lib'];
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const patterns = [
  ['guilt language', /\b(?:you(?:'|’)re|you are) behind\b/gi],
  ['guilt language', /\byou failed\b/gi],
  ['productivity score', /\bproductivity\s+score\b/gi],
  ['gamification', /\bstreaks?\b/gi],
  ['gamification', /\bleaderboards?\b/gi],
  ['celebration theatre', /\bcongratulat(?:e|es|ed|ing|ions?)\b/gi],
  ['celebration theatre', /\bconfetti\b/gi],
  ['first-person product voice', /\bI(?:['’]ve| have)\s+(?:scheduled|moved|optimised|optimized|created|saved|synced|completed|decided)\b/gi],
  ['soliciting agent voice', /\bWould you like me\b/gi],
  ['agent persona', /\bAI assistant\b/gi],
  ['agent persona', /\bcopilot\b/gi],
];

function removeComments(source) {
  // Preserve quoted strings while stripping JS/TS comments.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (s) => '\n'.repeat((s.match(/\n/g) || []).length))
    .replace(/(^|\s)\/\/[^\n]*/g, '$1')
    .replace(/<!--([\s\S]*?)-->/g, '');
}

async function walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return []; }
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.next', '__tests__', '__mocks__', 'fixtures'].includes(entry.name)) continue;
      files.push(...await walk(full));
    } else if (extensions.has(path.extname(entry.name)) && !/(?:\.test|\.spec)\.[^.]+$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const violations = [];
for (const root of roots) {
  for (const file of await walk(root)) {
    const raw = await readFile(file, 'utf8');
    const source = removeComments(raw);
    for (const [category, pattern] of patterns) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split('\n').length;
        violations.push({ file, line, category, match: match[0] });
      }
    }
  }
}

if (violations.length) {
  console.error('Non-negotiables copy guard found possible user-facing violations:');
  for (const item of violations) {
    console.error(`- ${item.file}:${item.line} [${item.category}] “${item.match}”`);
  }
  console.error('\nUse neutral, impersonal copy or add a narrowly scoped, documented exception.');
  process.exitCode = 1;
} else {
  console.log('Non-negotiables copy guard passed.');
}
