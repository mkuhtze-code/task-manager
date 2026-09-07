// ── Meeting Export (V1): public API ────────────────────────────────────
// Export=resolve+generate+record: Preferences → exported-content resolution
// → per-export review → generation (Meeting Record PDF + Evidence Package)
// → immutable ExportRecord. Use this barrel from the app; reach into the
// submodules only when a test needs internals.

export * from './types';
export * from './preferences';
export * from './plan';
export * from './fingerprint';
export * from './records';
export * from './transcription';
export * from './pdf';
export * from './package';
export * from './engine';
export { optimiseMeetingPhoto } from './image';
export type { MeetingExportPhotoAsset } from './image';