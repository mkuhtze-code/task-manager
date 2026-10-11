/**
 * Speech collection bridge — smoke tests (no LLM).
 */
import { describe, it, expect } from 'vitest';
import { detectCaptureCollection } from '../collectionBridge';
import { processCaptureSpeech } from '../captureAdapter';

describe('detectCaptureCollection', () => {
  it('detects grocery create with items', () => {
    const c = detectCaptureCollection('Grocery list — milk, eggs and bread');
    expect(c).not.toBeNull();
    expect(c!.intent.type).toBe('create_collection');
    expect(c!.blocksTaskCreate).toBe(true);
    expect(c!.previewItems.length).toBeGreaterThanOrEqual(2);
  });

  it('detects bare add as append when active', () => {
    const c = detectCaptureCollection('add coffee', {
      activeCollectionId: 'col-1',
      activeCollectionTitle: 'Grocery',
      msSinceLastActivity: 60_000,
    });
    expect(c).not.toBeNull();
    expect(c!.intent.type).toBe('append_collection');
  });

  it('returns null for ordinary task', () => {
    const c = detectCaptureCollection('Call the client about the invoice');
    expect(c).toBeNull();
  });
});

describe('processCaptureSpeech collection path', () => {
  it('blocks task create for list utterance', () => {
    const r = processCaptureSpeech({
      text: 'Start a grocery list. Milk and bread.',
      userId: 'test-user',
    });
    expect(r.collection).not.toBeNull();
    expect(r.mustNotCreateTask).toBe(true);
    expect(r.uiMode).toBe('confirm_collection');
    expect(r.proposals).toHaveLength(0);
    expect(r.wouldMutateWithoutConfirm).toBe(false);
  });

  it('does not route a reminder time correction into the active collection', () => {
    const r = processCaptureSpeech({
      text: 'Set the reminder for 8am, no wait, 9am.',
      collectionContext: {
        activeCollectionId: 'col-1',
        activeCollectionTitle: 'Grocery',
        msSinceLastActivity: 60_000,
      },
    });
    expect(r.collection).toBeNull();
  });

  it('does not route an explicit separate-task instruction into the active collection', () => {
    const r = processCaptureSpeech({
      text: 'Keep that task unchanged and create a separate task to renew the insurance next month.',
      collectionContext: {
        activeCollectionId: 'col-1',
        activeCollectionTitle: 'Grocery',
        msSinceLastActivity: 60_000,
      },
    });
    expect(r.collection).toBeNull();
  });

  it('does not route a supplier pickup with multiple product items into a collection', () => {
    const r = processCaptureSpeech({
      text: 'I need to go to Bunnings to grab 2 cartridges of clear Sika MS and 2 sausages of Sika White MS.',
      collectionContext: {
        activeCollectionId: 'col-1',
        activeCollectionTitle: 'Grocery',
        msSinceLastActivity: 60_000,
      },
    });
    expect(r.collection).toBeNull();
  });

  it('does not force collection on plain task', () => {
    const r = processCaptureSpeech({
      text: 'Email Sarah the quote tomorrow',
      userId: 'test-user',
    });
    expect(r.collection).toBeNull();
  });
});
