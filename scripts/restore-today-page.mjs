#!/usr/bin/env node
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const root = path.join(__dirname, '..');
const parts = [];
for (let i = 0; i < 20; i++) {
  const p = path.join(root, 'components/today/_restore', `p${i}.b64`);
  if (!fs.existsSync(p)) break;
  parts.push(fs.readFileSync(p, 'utf8'));
}
if (parts.length === 0) {
  console.error('No restore parts found');
  process.exit(1);
}
const buf = zlib.gunzipSync(Buffer.from(parts.join(''), 'base64'));
fs.writeFileSync(path.join(root, 'components/today/TodayPage.tsx'), buf);
console.log('Restored TodayPage.tsx', buf.length, 'bytes');
