#!/usr/bin/env node
/** Restore components/today/TodayPage.tsx from gzip+base64 payload. */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const root = path.join(__dirname, '..');
const payload = path.join(root, 'components/today/_restore/today.tsx.gz.b64');
if (!fs.existsSync(payload)) {
  console.error('Missing', payload);
  process.exit(1);
}
const b64 = fs.readFileSync(payload, 'utf8').replace(/\s+/g, '');
const buf = zlib.gunzipSync(Buffer.from(b64, 'base64'));
fs.writeFileSync(path.join(root, 'components/today/TodayPage.tsx'), buf);
console.log('Restored TodayPage.tsx', buf.length, 'bytes');
