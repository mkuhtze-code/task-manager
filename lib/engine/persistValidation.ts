import type { EngineRequest, MemoryItem, WorkingMemorySnapshot } from './types';

const CONFIDENCE = new Set(['low', 'medium', 'high']);
const MEMORY_ITEM_TYPES = new Set([
  'utterance', 'entity', 'task', 'job', 'location', 'meeting', 'suggestion',
  'action', 'correction', 'request', 'list_item', 'reference',
]);
const REQUEST_ACTIONS = new Set([
  'remind', 'pickup', 'create_task', 'complete', 'append_list', 'create_list',
  'move', 'defer', 'refine', 'query', 'unknown',
]);
const CONSTRAINT_AXES = new Set([
  'temporal', 'location', 'urgency', 'importance', 'commitment', 'flexibility',
  'dependency', 'consequence', 'duration', 'capacity', 'preference', 'object',
]);
const FOCUS_KINDS = new Set(['task', 'job', 'list', 'meeting', 'request', 'none']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isMemoryItem(value: unknown): value is MemoryItem {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== 'string' || !value.id ||
    typeof value.label !== 'string' ||
    typeof value.source !== 'string' ||
    !isTimestamp(value.timestamp) ||
    typeof value.salience !== 'number' || !Number.isFinite(value.salience) ||
    !CONFIDENCE.has(String(value.confidence)) ||
    !MEMORY_ITEM_TYPES.has(String(value.type)) ||
    !isRecord(value.relationships)
  ) return false;

  if (!Object.values(value.relationships).every((v) => typeof v === 'string')) return false;
  return value.payload === undefined || isRecord(value.payload);
}

/** Reject malformed or incompatible JSONB instead of trusting a TypeScript cast. */
export function isWorkingMemorySnapshot(value: unknown): value is WorkingMemorySnapshot {
  if (!isRecord(value) || value.version !== 1 || !isTimestamp(value.updatedAt)) return false;

  const itemArrays = [
    'recentUtterances', 'recentEntities', 'recentTasks', 'recentJobs',
    'recentLocations', 'recentSuggestions', 'recentActions', 'recentCorrections',
    'unresolvedReferences',
  ];
  for (const key of itemArrays) {
    const items = value[key];
    if (!Array.isArray(items) || items.length > 500 || !items.every(isMemoryItem)) return false;
  }

  if (!isRecord(value.currentFocus)) return false;
  const focus = value.currentFocus;
  if (
    !FOCUS_KINDS.has(String(focus.kind)) ||
    !isNullableString(focus.id) ||
    !isNullableString(focus.label) ||
    !isNullableString(value.currentTopic) ||
    !isNullableString(value.currentSurface) ||
    !isNullableString(value.activeRequestId)
  ) return false;

  return true;
}

export function isEngineRequest(value: unknown): value is EngineRequest {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== 'string' || !value.id ||
    !REQUEST_ACTIONS.has(String(value.action)) ||
    !isNullableString(value.objectText) ||
    !isNullableString(value.locationText) ||
    !isNullableString(value.relatedJobText) ||
    !isNullableString(value.relatedMeetingText) ||
    !isNullableString(value.dateHint) ||
    !isNullableString(value.timeHint) ||
    !new Set(['none', 'elevated', 'high']).has(String(value.urgency)) ||
    !new Set(['high', 'medium', 'low']).has(String(value.flexibility)) ||
    !new Set(['weak', 'soft', 'hard']).has(String(value.commitment)) ||
    !isNullableString(value.consequence) ||
    !Array.isArray(value.constraints) ||
    !Array.isArray(value.rawUtterances) ||
    !value.rawUtterances.every((item) => typeof item === 'string') ||
    !isNullableString(value.titleText) ||
    !CONFIDENCE.has(String(value.confidence)) ||
    !isTimestamp(value.updatedAt)
  ) return false;

  if (!value.constraints.every((constraint) =>
    isRecord(constraint) &&
    CONSTRAINT_AXES.has(String(constraint.axis)) &&
    typeof constraint.value === 'string' &&
    CONFIDENCE.has(String(constraint.confidence)) &&
    typeof constraint.source === 'string'
  )) return false;

  for (const key of ['primaryVerb', 'personText', 'purposeText', 'subjectText']) {
    if (value[key] !== undefined && !isNullableString(value[key])) return false;
  }
  return true;
}
