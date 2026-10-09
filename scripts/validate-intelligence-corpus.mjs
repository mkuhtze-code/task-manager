import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = 'data/intelligence-corpus';
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
const schema = JSON.parse(await readFile(join(root, 'schema.json'), 'utf8'));
const exampleDir = join(root, 'examples');
const files = (await readdir(exampleDir)).filter((name) => name.endsWith('.jsonl')).sort();

const errors = [];
const ids = new Map();
const families = new Map();
const splitCounts = { development: 0, validation: 0, held_out: 0 };
const annotationCounts = { draft: 0, reviewed: 0, needs_revision: 0, rejected: 0 };
const ACT_TYPES = ['action', 'state', 'question', 'report', 'condition', 'correction', 'preference', 'unknown'];
const POLARITIES = ['positive', 'negative', 'uncertain'];
const MODALITIES = ['asserted', 'requested', 'intended', 'possible', 'hypothetical', 'prohibited', 'conditional', 'unknown'];
let count = 0;

function requireValue(condition, message) {
  if (!condition) errors.push(message);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
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
    if (isNonEmptyString(record.id)) {
      requireValue(!ids.has(record.id), `${location}: duplicate id "${record.id}" (also ${ids.get(record.id)})`);
      ids.set(record.id, location);
    }
    requireValue(isNonEmptyString(record.family_id), `${location}: family_id must be a non-empty string`);
    requireValue(isNonEmptyString(record.utterance), `${location}: utterance must be non-empty`);
    requireValue(typeof record.locale === 'string' && record.locale.length >= 2, `${location}: locale is required`);
    requireValue(['development', 'validation', 'held_out'].includes(record.split), `${location}: invalid split`);
    if (splitCounts[record.split] !== undefined) splitCounts[record.split] += 1;
    requireValue(['basic', 'intermediate', 'hard', 'adversarial'].includes(record.difficulty), `${location}: invalid difficulty`);

    requireValue(Array.isArray(record.domains) && record.domains.length > 0 && record.domains.every(isNonEmptyString), `${location}: domains must be a non-empty string array`);
    requireValue(Array.isArray(record.capabilities) && record.capabilities.length > 0 && record.capabilities.every(isNonEmptyString), `${location}: capabilities must be a non-empty string array`);
    for (const [field, values, allowed] of [
      ['domains', record.domains, manifest.domains],
      ['capabilities', record.capabilities, manifest.capabilities],
    ]) {
      if (Array.isArray(values)) {
        requireValue(new Set(values).size === values.length, `${location}: duplicate tags in ${field}`);
        for (const value of values) {
          requireValue(allowed.includes(value), `${location}: unknown ${field.slice(0, -1)} tag "${value}" (not declared in manifest)`);
        }
      }
    }

    requireValue(record.provenance && ['synthetic', 'observed_deidentified', 'curated_public'].includes(record.provenance.kind), `${location}: invalid provenance kind`);
    requireValue(isNonEmptyString(record.provenance?.source_ref), `${location}: provenance.source_ref is required`);
    if (record.provenance?.kind === 'synthetic') {
      requireValue(isNonEmptyString(record.provenance?.generation_method), `${location}: synthetic records must state provenance.generation_method`);
    }

    requireValue(record.expected && ['act', 'preserve', 'answer', 'clarify', 'no_op'].includes(record.expected.interaction_mode), `${location}: invalid expected interaction_mode`);
    requireValue(Array.isArray(record.expected?.semantic_acts) && record.expected.semantic_acts.length > 0, `${location}: expected.semantic_acts must be a non-empty array`);
    requireValue(isNonEmptyString(record.expected?.rationale), `${location}: expected.rationale is required`);
    for (const [actIndex, act] of (Array.isArray(record.expected?.semantic_acts) ? record.expected.semantic_acts : []).entries()) {
      const actLocation = `${location}: semantic_acts[${actIndex}]`;
      requireValue(act && ACT_TYPES.includes(act.act_type), `${actLocation}: invalid act_type`);
      requireValue(isNonEmptyString(act?.predicate), `${actLocation}: predicate is required`);
      requireValue(POLARITIES.includes(act?.polarity), `${actLocation}: invalid polarity`);
      requireValue(MODALITIES.includes(act?.modality), `${actLocation}: invalid modality`);
      requireValue(Array.isArray(act?.arguments), `${actLocation}: arguments must be an array`);
      for (const [argumentIndex, argument] of (Array.isArray(act?.arguments) ? act.arguments : []).entries()) {
        requireValue(isNonEmptyString(argument?.role), `${actLocation}: arguments[${argumentIndex}].role is required`);
        requireValue(isNonEmptyString(argument?.value), `${actLocation}: arguments[${argumentIndex}].value is required`);
      }
    }

    requireValue(['draft', 'reviewed', 'needs_revision', 'rejected'].includes(record.annotation?.review_status), `${location}: invalid annotation.review_status`);
    requireValue(typeof record.annotation?.review_note === 'string', `${location}: annotation.review_note is required`);
    if (annotationCounts[record.annotation?.review_status] !== undefined) {
      annotationCounts[record.annotation.review_status] += 1;
    }
    if (record.annotation?.review_status === 'reviewed') {
      requireValue(isNonEmptyString(record.annotation?.reviewer), `${location}: reviewed records must identify a reviewer/team`);
    }

    if (record.family_id && record.split) {
      const previous = families.get(record.family_id);
      if (previous && previous !== record.split) {
        errors.push(`${location}: family "${record.family_id}" crosses split boundary (${previous} vs ${record.split})`);
      } else {
        families.set(record.family_id, record.split);
      }
    }
  }
}

requireValue(count === manifest.current_example_count, `manifest current_example_count is ${manifest.current_example_count}, but found ${count} records`);
requireValue(JSON.stringify(splitCounts) === JSON.stringify(manifest.current_split_counts), `manifest split counts do not match records: ${JSON.stringify(splitCounts)}`);
requireValue(JSON.stringify(annotationCounts) === JSON.stringify(manifest.annotation_status_counts), `manifest annotation-status counts do not match records: ${JSON.stringify(annotationCounts)}`);
requireValue(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', 'schema.json must declare JSON Schema 2020-12');
requireValue(Array.isArray(manifest.domains) && manifest.domains.length > 0, 'manifest.domains must be a non-empty taxonomy');
requireValue(Array.isArray(manifest.capabilities) && manifest.capabilities.length > 0, 'manifest.capabilities must be a non-empty taxonomy');

if (errors.length) {
  console.error(`Corpus validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Corpus structure valid: ${count} examples across ${files.length} JSONL file(s).`);
  console.log(`Split counts: ${JSON.stringify(splitCounts)}`);
  console.log(`Annotation status: ${JSON.stringify(annotationCounts)}`);
  console.log(`Taxonomy coverage: ${manifest.domains.length} declared domains; ${manifest.capabilities.length} declared capabilities.`);
  console.log('Note: structural and taxonomy consistency only; this does not validate semantic-label quality or execute the intelligence engine.');
}
