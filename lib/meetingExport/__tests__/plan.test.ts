import { describe, expect, it } from 'vitest';
import {
  defaultReviewState,
  maskCounts,
  maskFromPlan,
  observationOrdinals,
  planCounts,
  resolvePlanFromReview,
  sectionsFromPlan,
  seedReviewFromRecord,
  seedReviewFromSections,
} from '@/lib/meetingExport/plan';
import { DEFAULT_MEETING_EXPORT_PREFS } from '@/lib/meetingExport/preferences';
import {
  fullSections,
  makeContent,
  makeRecord,
} from './fixtures';

describe('defaultReviewState', () => {
  it('starts from prefs, auto-off when the meeting holds nothing', () => {
    const content = makeContent({
      participants: [],
      observations: [],
      decisions: [],
      actions: [],
      meeting: { id: 'm', user_id: 'u', text: 'T', duration_mins: 10, start_time: null, created_at: '', source: 'manual', job_id: null, location_text: null, lat: null, lng: null, notes: null, summary: null },
    });
    const state = defaultReviewState(content, undefined);
    expect(state.participants).toBe(false);
    expect(state.observationsOn).toBe(false);
    expect(state.decisionsOn).toBe(false);
    expect(state.actionsOn).toBe(false);
    expect(state.observations).toEqual([]);
    expect(state.exportType).toBe('both');
  });

  it('selects observations and their media according to prefs', () => {
    const content = makeContent();
    const state = defaultReviewState(content, { ...DEFAULT_MEETING_EXPORT_PREFS, includePhotos: false });
    expect(state.observationsOn).toBe(true);
    expect(state.observations).toHaveLength(2);
    const [obs1] = state.observations;
    expect(obs1.selected).toBe(true);
    // includePhotos off → the photo is unselected, the voice note stays on.
    expect(obs1.media.map((m) => [m.mediaType, m.selected])).toEqual([
      ['photo', false],
      ['audio', true],
    ]);
  });

  it('keeps media selection in sync when the observation itself is off', () => {
    const state = defaultReviewState(makeContent(), { ...DEFAULT_MEETING_EXPORT_PREFS, includeObservations: false });
    expect(state.observationsOn).toBe(false);
    for (const obs of state.observations) {
      expect(obs.selected).toBe(false);
      for (const m of obs.media) expect(m.selected).toBe(false);
    }
  });
});

describe('resolvePlanFromReview', () => {
  it('builds the full plan from an everything-on state', () => {
    const content = makeContent();
    const state = defaultReviewState(content, { ...DEFAULT_MEETING_EXPORT_PREFS, includeNotes: true });
    state.notes = true;
    const plan = resolvePlanFromReview(content, state);
    expect(plan.exportType).toBe('both');
    expect(plan.includeParticipants).toBe(true);
    expect(plan.includeNotes).toBe(true);
    expect(plan.observations.map((o) => o.id)).toEqual(['obs-1', 'obs-2']);
    expect(plan.observations[0].mediaIds.sort()).toEqual(['media-1', 'media-2']);
    expect(plan.decisions).toEqual(['dec-1']);
    expect(plan.actions).toEqual(['act-1']);
    expect(plan.explicitEmpty).toEqual({ observations: false, decisions: false, actions: false });
  });

  it('marks sections explicitly empty when selected with no content', () => {
    const content = makeContent({ decisions: [], actions: [], observations: [] });
    const state = defaultReviewState(content, undefined);
    state.decisionsOn = true;
    state.actionsOn = true;
    state.observationsOn = true;
    const plan = resolvePlanFromReview(content, state);
    expect(plan.explicitEmpty).toEqual({ observations: true, decisions: true, actions: true });
    expect(plan.observations).toEqual([]);
    expect(plan.decisions).toEqual([]);
    expect(plan.actions).toEqual([]);
  });

  it('drops a section entirely when everything inside was deselected', () => {
    const content = makeContent();
    const state = defaultReviewState(content, undefined);
    state.observations[0].selected = false;
    state.observations[1].selected = false;
    state.decisions[0].selected = false;
    const plan = resolvePlanFromReview(content, state);
    // Section still "on" — but with all items off it covers nothing.
    expect(plan.observations).toEqual([]);
    expect(plan.decisions).toEqual([]);
    expect(plan.explicitEmpty).toEqual({ observations: false, decisions: false, actions: false });
    expect(maskFromPlan(content, plan).observations).toBe(false);
    expect(maskFromPlan(content, plan).decisions).toBe(false);
  });

  it('removes a whole section when observationsOn/decisionsOn/actionsOn is false', () => {
    const content = makeContent();
    const state = defaultReviewState(content, undefined);
    state.observationsOn = false;
    state.actionsOn = false;
    const plan = resolvePlanFromReview(content, state);
    expect(plan.observations).toEqual([]);
    expect(plan.actions).toEqual([]);
    expect(plan.decisions).toEqual(['dec-1']);
  });
});

describe('observationOrdinals', () => {
  it('numbers selected observations 1..N in recorded order', () => {
    const content = makeContent();
    const state = defaultReviewState(content, undefined);
    state.observations[0].selected = false;
    const plan = resolvePlanFromReview(content, state);
    const ordinals = observationOrdinals(plan);
    expect(ordinals.get('obs-2')).toBe(1);
    expect(ordinals.has('obs-1')).toBe(false);
  });
});

describe('sectionsFromPlan + seedReviewFromSections', () => {
  it('round-trips a plan through its stored snapshot', () => {
    const content = makeContent();
    const state = defaultReviewState(content, undefined);
    state.observations[0].selected = false; // obs-1 out, one media of obs-2 off
    state.observations[1].media[0].selected = false;
    const plan = resolvePlanFromReview(content, state);

    const sections = sectionsFromPlan(content, plan);
    expect(sections.includeParticipants).toBe(true);
    expect(sections.observationIds).toEqual(['obs-2']);
    expect(sections.mediaIds).toEqual([]);
    expect(sections.decisionIds).toEqual(['dec-1']);
    expect(sections.actionIds).toEqual(['act-1']);

    const reseeded = seedReviewFromSections(content, undefined, sections);
    expect(reseeded.participants).toBe(true);
    expect(reseeded.observationsOn).toBe(true);
    expect(reseeded.observations.map((o) => o.id)).toEqual(['obs-1', 'obs-2']);
    expect(reseeded.observations[0].selected).toBe(false);
    expect(reseeded.observations[1].selected).toBe(true);
    expect(reseeded.observations[1].media[0].selected).toBe(false);
    expect(reseeded.decisions.map((d) => d.id)).toEqual(['dec-1']);
    expect(reseeded.actions.map((a) => a.id)).toEqual(['act-1']);
  });

  it('restores section flags and ids from stored sections but not exportType/transcribe', () => {
    const content = makeContent();
    const sections = fullSections();
    const seeded = seedReviewFromSections(content, { ...DEFAULT_MEETING_EXPORT_PREFS, exportType: 'pdf' }, sections);
    expect(seeded.exportType).toBe('pdf');
    expect(seeded.observations.map((o) => o.id)).toEqual(['obs-1', 'obs-2']);
    expect(seeded.observations.every((o) => o.selected)).toBe(true);
  });

  it('seedReviewFromRecord restores the failed attempt exportType + transcription flag', () => {
    const content = makeContent();
    const record = makeRecord(
      {
        id: 'rec-failed',
        status: 'failed',
        export_type: 'pdf',
        fingerprint: null,
        transcription_requested: true,
        transcription_status: 'requested',
        file_size: null,
        error_reason: 'zip blew up',
        created_at: '2025-01-02T11:00:00',
      },
      null,
      fullSections()
    );
    const seeded = seedReviewFromRecord(content, undefined, record);
    expect(seeded.exportType).toBe('pdf');
    expect(seeded.transcribe).toBe(true);
    expect(seeded.pdfQuality).toBe('standard');
    expect(seeded.observations).toHaveLength(2);
  });

  it('falls back to prefs when the record or sections are null', () => {
    const seeded = seedReviewFromRecord(makeContent(), DEFAULT_MEETING_EXPORT_PREFS, null);
    expect(seeded.exportType).toBe('both');
    expect(seeded.transcribe).toBe(false);
  });
});

describe('planCounts + maskCounts', () => {
  it('counts what the export actually held', () => {
    const content = makeContent();
    const state = defaultReviewState(content, undefined);
    state.observations[1].selected = false;
    state.observations[0].media[0].selected = false; // photo-1 out
    const plan = resolvePlanFromReview(content, state);
    expect(planCounts(content, plan)).toEqual({
      observations: 1,
      photos: 0,
      audio: 1,
      decisions: 1,
      actions: 1,
      participants: 2,
    });
  });

  it('maskCounts counts the CURRENT content for the covered sections', () => {
    const content = makeContent();
    const mask = { participants: true, notes: false, observations: true, decisions: false, actions: true };
    expect(maskCounts(content, mask)).toEqual({
      observations: 2,
      photos: 2,
      audio: 1,
      decisions: 0,
      actions: 1,
      participants: 2,
    });
  });

  it('an empty explicit section contributes zero to planCounts but keeps its mask', () => {
    const content = makeContent({ decisions: [], observations: [] });
    const state = defaultReviewState(content, undefined);
    state.decisionsOn = true;
    state.observationsOn = true;
    const plan = resolvePlanFromReview(content, state);
    expect(plan.explicitEmpty.observations).toBe(true);
    expect(plan.explicitEmpty.decisions).toBe(true);
    expect(maskFromPlan(content, plan).observations).toBe(true);
    expect(maskFromPlan(content, plan).decisions).toBe(true);
    const counts = planCounts(content, plan);
    expect(counts.observations).toBe(0);
    expect(counts.decisions).toBe(0);
  });
});