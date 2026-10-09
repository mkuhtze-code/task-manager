import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = 'data/intelligence-corpus';
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
const schema = JSON.parse(await readFile(join(root, 'schema.json'), 'utf8'));
const exampleDir = join(root, 'examples');
const files = (await readdir(exampleDir)).filter((name) => name.endsWith('.jsonl'));

const errors = [];
const ids = new Map();
const families = new Map();
const splitCounts = { development: 0, validation: 0, held_out: 0 };
let count = 0;

function requireValue(condition, message) {
  if (!condition) errors.push(message);
}

for (const file of files) {
  const raw = await readFile(join(exampleDir, file), 'utf8');
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith('#')) continue;
    const location = `${file}:${index + 1}`;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      errors.push(`${location}: invalid JSON (${error.message})`);
      continue;
    }
    count += 1;

    for (const key of ['id', 'family_id', 'utterance', 'locale', 'split', 'provenance', 'domains', 'capabilities', 'difficulty', 'expected', 'annotation']) {
      requireValue(Object.hasOwn(record, key), `${location}: missing required field "${key}"`);
    }
    requireValue(typeof record.id === 'string' && /^[a-z0-9][a-z0-9._-]+$/.test(record.id), `${location}: invalid id`);
    if (record.id) {
      requireValue(!ids.has(record.id), `${location}: duplicate id "${record.id}" (also ${ids.get(record.id)})`);
      ids.set(record.id, location);
    }
    requireValue(typeof record.family_id === 'string' && record.family_id.length > 0, `${location}: family_id must be a non-empty string`);
    requireValue(typeof record.utterance === 'string' && record.utterance.trim().length > 0, `${location}: utterance must be non-empty`);
    requireValue(typeof record.locale === 'string' && record.locale.length >= 2, `${location}: locale is required`);
    requireValue(['development', 'validation', 'held_out'].includes(record.split), `${location}: invalid split`);
    if (splitCounts[record.split] !== undefined) splitCounts[record.split] += 1;
    requireValue(['basic', 'intermediate', 'hard', 'adversarial'].includes(record.difficulty), `${location}: invalid difficulty`);
    requireValue(Array.isArray(record.domains) && record.domains.length > 0 && record.domains.every((x) => typeof x === 'string' && x.length > 0), `${location}: domains must be a non-empty string array`);
    requireValue(Array.isArray(record.capabilities) && record.capabilities.length > 0 && record.capabilities.every((x) => typeof x === 'string' && x.length > 0), `${location}: capabilities must be a non-empty string array`);
    requireValue(record.provenance && ['synthetic', 'observed_deidentified', 'curated_public'].includes(record.provenance.kind), `${location}: invalid provenance kind`);
    requireValue(typeof record.provenance?.source_ref === 'string' && record.provenance.source_ref.length > 0, `${location}: provenance.source_ref is required`);
    requireValue(record.expected && ['act', 'preserve', 'answer', 'clarify', 'no_op'].includes(record.expected.interaction_mode), `${location}: invalid expected interaction_mode`);
    requireValue(Array.isArray(record.expected?.semantic_acts), `${location}: expected.semantic_acts must be an array`);
    requireValue(typeof record.expected?.rationale === 'string' && record.expected.rationale.trim().length > 0, `${location}: expected.rationale is required`);
    requireValue(['draft', 'reviewed', 'needs_revision', 'rejected'].includes(record.annotation?.review_status), `${location}: invalid annotation.review_status`);
    requireValue(typeof record.annotation?.review_note === 'string', `${location}: annotation.review_note is required`);

    if (record.family_id && record.split) {
      const previous = families.get(record.family_id);
      if (previous && previous !== record.split) {
        errors.push(`${location}: family "${record.family_id}" crosses split boundary (${previous} vs ${record.split})`);
      } else {
        families.set(record.family_id, record.split);
      }
    }
    for (const [field, values] of [['domains', record.domains], ['capabilities', record.capabilities]]) {
      if (Array.isArray(values)) {
        requireValue(new Set(values).size === values.length, `${location}: duplicate tags in ${field}`);
      }
    }
  }
}

requireValue(count === manifest.current_example_count, `manifest current_example_count is ${manifest.current_example_count}, but found ${count} records`);
requireValue(JSON.stringify(splitCounts) === JSON.stringify(manifest.current_split_counts), `manifest split counts do not match records: ${JSON.stringify(splitCounts)}`);
requireValue(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', 'schema.json must declare JSON Schema 2020-12');

if (errors.length) {
  console.error(`Corpus validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Corpus structure valid: ${count} examples across ${files.length} JSONL file(s).`);
  console.log(`Split counts: ${JSON.stringify(splitCounts)}`);
  console.log('Note: this validates structural consistency only, not semantic-label quality.');
}
