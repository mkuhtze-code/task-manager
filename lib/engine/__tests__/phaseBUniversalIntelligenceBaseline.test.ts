import { describe, expect, it } from 'vitest';
import { textForCaptureField } from '@/hooks/useCaptureSpeech';
import { runCaptureDock, type CaptureDockResult } from '@/lib/engine/captureDock';
import { processCaptureSpeech } from '@/lib/speech/captureAdapter';

/**
 * Phase B diagnostic benchmark.
 *
 * This is deliberately a reporting baseline, not a claim that every current
 * case passes. It records current behavior before semantic architecture changes.
 * Transcript text is held constant: this measures deterministic language /
 * capture handling, not acoustic speech-recognition accuracy.
 */

type ExpectedMode = 'task' | 'non_task' | 'preserve';

type BenchmarkCase = {
  id: string;
  domain: string;
  input: string;
  anchors: string[];
  mode: ExpectedMode;
  note: string;
};

const CASES: BenchmarkCase[] = [
  // Everyday personal life
  { id: 'life-01', domain: 'everyday_personal', input: 'I need to renew my passport before we book flights', anchors: ['renew', 'passport', 'book flights'], mode: 'task', note: 'Two linked actions; preserve both.' },
  { id: 'life-02', domain: 'everyday_personal', input: 'Remind me to take the birthday cake out of the freezer at 3', anchors: ['birthday cake', 'freezer', '3'], mode: 'task', note: 'Reminder with object and time.' },
  { id: 'life-03', domain: 'everyday_personal', input: 'I bought milk and bread already, so do not add them to the shopping list', anchors: ['milk', 'bread', 'do not'], mode: 'non_task', note: 'Completed event plus explicit negated mutation.' },
  { id: 'life-04', domain: 'everyday_personal', input: 'Maybe I should look at getting a better desk chair sometime', anchors: ['desk chair'], mode: 'preserve', note: 'Tentative intention; avoid inventing urgency.' },
  { id: 'life-05', domain: 'everyday_personal', input: 'Cancel the dentist appointment I made for Thursday', anchors: ['cancel', 'dentist', 'Thursday'], mode: 'task', note: 'Destructive/change action must preserve target.' },

  // Communication and relationships
  { id: 'comm-01', domain: 'communication', input: 'Call Priya to ask whether she can move our meeting to Friday', anchors: ['call', 'Priya', 'meeting', 'Friday'], mode: 'task', note: 'Primary action plus purpose and target time.' },
  { id: 'comm-02', domain: 'communication', input: 'I spoke to Daniel yesterday about the budget; nothing else needs doing', anchors: ['Daniel', 'yesterday', 'budget'], mode: 'non_task', note: 'Past report is not a new commitment.' },
  { id: 'comm-03', domain: 'communication', input: 'Do not email the draft to the client until I approve it', anchors: ['email', 'draft', 'client', 'approve'], mode: 'non_task', note: 'Negation and temporal condition must survive.' },
  { id: 'comm-04', domain: 'communication', input: 'Tell Sam I can deliver it Monday, no wait, Tuesday', anchors: ['Sam', 'deliver', 'Tuesday'], mode: 'task', note: 'Correction supersedes earlier date.' },
  { id: 'comm-05', domain: 'communication', input: 'Did Maya say she would send the contract, or was that only a suggestion?', anchors: ['Maya', 'send', 'contract'], mode: 'non_task', note: 'Question about reported commitment.' },

  // Education and research
  { id: 'learn-01', domain: 'learning_research', input: 'Compare the evidence for spaced repetition versus retrieval practice and save the strongest sources', anchors: ['compare', 'spaced repetition', 'retrieval practice', 'sources'], mode: 'task', note: 'Research request with multiple objects.' },
  { id: 'learn-02', domain: 'learning_research', input: 'I wonder why the moon looks larger near the horizon', anchors: ['moon', 'horizon'], mode: 'non_task', note: 'Curiosity/question, not automatically a task.' },
  { id: 'learn-03', domain: 'learning_research', input: 'Find out whether the paper actually supports its conclusion before citing it', anchors: ['paper', 'supports', 'conclusion', 'citing'], mode: 'task', note: 'Verification goal and dependency.' },
  { id: 'learn-04', domain: 'learning_research', input: 'The experiment failed twice; record that result but do not rerun it yet', anchors: ['experiment', 'failed', 'record', 'do not rerun'], mode: 'preserve', note: 'Observation plus separate prohibited action.' },
  { id: 'learn-05', domain: 'learning_research', input: 'What are the main differences between a compiler and an interpreter?', anchors: ['differences', 'compiler', 'interpreter'], mode: 'non_task', note: 'Information question.' },

  // Office and client work
  { id: 'office-01', domain: 'office_client', input: 'Send the revised proposal to Lee after finance signs off', anchors: ['revised proposal', 'Lee', 'finance', 'signs off'], mode: 'task', note: 'Conditional sequencing.' },
  { id: 'office-02', domain: 'office_client', input: 'Prepare a one-page summary of the Q3 numbers for tomorrow morning', anchors: ['one-page summary', 'Q3', 'tomorrow morning'], mode: 'task', note: 'Deliverable, subject and time.' },
  { id: 'office-03', domain: 'office_client', input: 'The client asked for a refund, but I have not agreed to anything', anchors: ['client', 'refund', 'not agreed'], mode: 'non_task', note: 'Reported request is not user commitment.' },
  { id: 'office-04', domain: 'office_client', input: 'Move the review from 2 pm to 3:30, not 4', anchors: ['review', '3:30', 'not 4'], mode: 'task', note: 'Time correction with explicit rejection.' },
  { id: 'office-05', domain: 'office_client', input: 'Can you explain which invoices are overdue and why?', anchors: ['invoices', 'overdue', 'why'], mode: 'non_task', note: 'Question; should not silently become a task.' },

  // Creative activity
  { id: 'creative-01', domain: 'creative', input: 'Sketch three different cover concepts using a limited orange and blue palette', anchors: ['sketch', 'three', 'cover concepts', 'orange', 'blue'], mode: 'task', note: 'Creative action and constraints.' },
  { id: 'creative-02', domain: 'creative', input: 'I like the second version better, but keep the original headline', anchors: ['second version', 'original headline'], mode: 'preserve', note: 'Preference plus preservation constraint.' },
  { id: 'creative-03', domain: 'creative', input: 'Maybe turn this idea into a podcast one day', anchors: ['idea', 'podcast'], mode: 'preserve', note: 'Tentative future possibility.' },
  { id: 'creative-04', domain: 'creative', input: 'Delete the old mockup after exporting the final artwork', anchors: ['delete', 'old mockup', 'exporting', 'final artwork'], mode: 'task', note: 'Destructive action with prerequisite.' },
  { id: 'creative-05', domain: 'creative', input: 'Why does this paragraph feel less clear than the previous one?', anchors: ['paragraph', 'clear', 'previous one'], mode: 'non_task', note: 'Analysis question with a reference.' },

  // Travel and logistics
  { id: 'travel-01', domain: 'travel_logistics', input: 'Check whether the train gets in before the connection leaves', anchors: ['train', 'connection', 'before'], mode: 'task', note: 'Temporal comparison.' },
  { id: 'travel-02', domain: 'travel_logistics', input: 'Pick up the rental car from the airport at 8 tomorrow', anchors: ['rental car', 'airport', '8', 'tomorrow'], mode: 'task', note: 'Pickup, place and time.' },
  { id: 'travel-03', domain: 'travel_logistics', input: 'We arrived in Wellington last night and the bags are already here', anchors: ['Wellington', 'last night', 'bags'], mode: 'non_task', note: 'Past event, not a future action.' },
  { id: 'travel-04', domain: 'travel_logistics', input: 'If the ferry is cancelled, find a route that still gets us there by noon', anchors: ['ferry', 'cancelled', 'route', 'noon'], mode: 'preserve', note: 'Conditional fallback plan.' },
  { id: 'travel-05', domain: 'travel_logistics', input: 'Book a hotel near the conference, but do not pay until I confirm the dates', anchors: ['hotel', 'conference', 'do not pay', 'confirm', 'dates'], mode: 'preserve', note: 'Multiple acts with payment prohibition.' },

  // Construction / site work — one domain among many
  { id: 'site-01', domain: 'construction_site', input: 'Measure the opening and check whether the new frame will fit', anchors: ['measure', 'opening', 'frame', 'fit'], mode: 'task', note: 'Two related actions; not the blueprint for the system.' },
  { id: 'site-02', domain: 'construction_site', input: 'Take the sealant to 18 Kauri Road before the crew arrives at 7', anchors: ['sealant', '18 Kauri Road', 'crew', '7'], mode: 'task', note: 'Delivery, address and temporal dependency.' },
  { id: 'site-03', domain: 'construction_site', input: 'The flashing was repaired yesterday; do not order another one', anchors: ['flashing', 'repaired', 'yesterday', 'do not order'], mode: 'non_task', note: 'Past completion plus negative action.' },
  { id: 'site-04', domain: 'construction_site', input: 'Ask Morgan if the substrate needs another coat before we install the membrane', anchors: ['Morgan', 'substrate', 'coat', 'membrane'], mode: 'task', note: 'Communication action, technical object, prerequisite.' },
  { id: 'site-05', domain: 'construction_site', input: 'The client might want the downpipe moved, but check with the designer first', anchors: ['client', 'downpipe', 'designer', 'first'], mode: 'task', note: 'Reported preference versus explicit user action.' },

  // Unfamiliar vocabulary / compositional meaning
  { id: 'novel-01', domain: 'unfamiliar_vocabulary', input: 'Ask Rowan to rekalibrate the luminance map after the sensor swap', anchors: ['Rowan', 'rekalibrate', 'luminance map', 'sensor swap'], mode: 'task', note: 'Unknown verb should not erase object/relationship.' },
  { id: 'novel-02', domain: 'unfamiliar_vocabulary', input: 'Put the glimmerfold notes beside the atlas, not inside it', anchors: ['glimmerfold notes', 'beside', 'atlas', 'not inside'], mode: 'task', note: 'Novel noun plus spatial contrast.' },
  { id: 'novel-03', domain: 'unfamiliar_vocabulary', input: 'I call the weekly review a “drift check”; add that phrase to my vocabulary', anchors: ['weekly review', 'drift check', 'vocabulary'], mode: 'task', note: 'User-defined term and explicit learning request.' },
  { id: 'novel-04', domain: 'unfamiliar_vocabulary', input: 'The thingamajig is making a high-pitched noise again', anchors: ['thingamajig', 'high-pitched noise', 'again'], mode: 'non_task', note: 'Observation without an explicit action.' },

  // Corrections, uncertainty, and discourse
  { id: 'disc-01', domain: 'correction_discourse', input: 'Email Chris on Wednesday — sorry, Thursday morning', anchors: ['Chris', 'Thursday morning'], mode: 'task', note: 'Correction must supersede Wednesday.' },
  { id: 'disc-02', domain: 'correction_discourse', input: 'I need to send the file. Actually, I already sent it this morning', anchors: ['send', 'file', 'already sent', 'this morning'], mode: 'non_task', note: 'Later clause retracts future action.' },
  { id: 'disc-03', domain: 'correction_discourse', input: 'I might ask Elena to review the draft if she has time', anchors: ['Elena', 'review', 'draft', 'if she has time'], mode: 'preserve', note: 'Tentative conditional action.' },
  { id: 'disc-04', domain: 'correction_discourse', input: 'Do not forget to call Noah, unless he messages me first', anchors: ['call Noah', 'unless', 'messages'], mode: 'preserve', note: 'Conditional negation / exception.' },
  { id: 'disc-05', domain: 'correction_discourse', input: 'No, not the blue folder — the green one from yesterday', anchors: ['blue folder', 'green one', 'yesterday'], mode: 'preserve', note: 'Elliptical correction and contextual reference.' },

  // Cross-domain reference and ambiguity
  { id: 'context-01', domain: 'context_ambiguity', input: 'Move that to Friday', anchors: ['Friday'], mode: 'preserve', note: 'Requires a referent from context; baseline is intentionally context-free.' },
  { id: 'context-02', domain: 'context_ambiguity', input: 'Put it over there after the other one is finished', anchors: ['over there', 'after', 'other one', 'finished'], mode: 'preserve', note: 'Multiple unresolved references; do not invent targets.' },
  { id: 'context-03', domain: 'context_ambiguity', input: 'I need to deal with the thing we discussed', anchors: ['thing', 'discussed'], mode: 'preserve', note: 'Underspecified action and context-dependent reference.' },
  { id: 'context-04', domain: 'context_ambiguity', input: 'Make it more like the first one but keep the new ending', anchors: ['first one', 'new ending'], mode: 'preserve', note: 'Comparative reference and conflicting-looking constraints.' },
];

type Observation = {
  id: string;
  domain: string;
  input: string;
  expectedMode: ExpectedMode;
  anchors: string[];
  speechIntent: string;
  speechOutcome: string;
  speechConfidence: string;
  captureLine: string;
  speechDockKind: string;
  speechDockText: string;
  speechDockLocation: string;
  typedDockKind: string;
  typedDockText: string;
  typedDockLocation: string;
  missingAnchorsInCaptureLine: string[];
  missingAnchorsInSpeechDock: string[];
  missingAnchorsInTypedDock: string[];
  speechModeCorrect: boolean | null;
  typedModeCorrect: boolean | null;
};

function dock(input: string, inputType: 'text' | 'speech_transcript'): CaptureDockResult {
  return runCaptureDock({
    line: input,
    userId: null,
    priorRequest: null,
    jobs: [],
    captureJobId: null,
    captureSurfaceDate: '2026-10-09',
    remainingMinsToday: 240,
    openTaskCount: 0,
    inputType,
  });
}

function isTaskKind(kind: string): boolean {
  return kind === 'act_create' || kind === 'act_update';
}

function searchableDock(result: CaptureDockResult): string {
  if (result.kind === 'act_create' || result.kind === 'act_update') {
    return [
      result.overrides.text,
      result.overrides.locationText,
      result.overrides.surfaceDate,
      result.message,
    ].filter(Boolean).join(' ').toLowerCase();
  }
  return result.message.toLowerCase();
}

function missingAnchors(text: string, anchors: string[]): string[] {
  const haystack = text.toLowerCase();
  return anchors.filter((anchor) => !haystack.includes(anchor.toLowerCase()));
}

function observe(item: BenchmarkCase): Observation {
  const speech = processCaptureSpeech({ text: item.input, todayIso: '2026-10-09' });
  const line = textForCaptureField(speech);
  const speechDock = dock(line, 'speech_transcript');
  const typedDock = dock(item.input, 'text');
  const speechText = searchableDock(speechDock);
  const typedText = searchableDock(typedDock);

  return {
    id: item.id,
    domain: item.domain,
    input: item.input,
    expectedMode: item.mode,
    anchors: item.anchors,
    speechIntent: String(speech.intent),
    speechOutcome: String(speech.outcome),
    speechConfidence: String(speech.confidence?.interpretation ?? ''),
    captureLine: line,
    speechDockKind: speechDock.kind,
    speechDockText: speechDock.kind === 'act_create' || speechDock.kind === 'act_update' ? speechDock.overrides.text : speechDock.message,
    speechDockLocation: speechDock.kind === 'act_create' || speechDock.kind === 'act_update' ? String(speechDock.overrides.locationText ?? '') : '',
    typedDockKind: typedDock.kind,
    typedDockText: typedDock.kind === 'act_create' || typedDock.kind === 'act_update' ? typedDock.overrides.text : typedDock.message,
    typedDockLocation: typedDock.kind === 'act_create' || typedDock.kind === 'act_update' ? String(typedDock.overrides.locationText ?? '') : '',
    missingAnchorsInCaptureLine: missingAnchors(line, item.anchors),
    missingAnchorsInSpeechDock: missingAnchors(speechText, item.anchors),
    missingAnchorsInTypedDock: missingAnchors(typedText, item.anchors),
    speechModeCorrect: item.mode === 'preserve' ? null : isTaskKind(speechDock.kind) === (item.mode === 'task'),
    typedModeCorrect: item.mode === 'preserve' ? null : isTaskKind(typedDock.kind) === (item.mode === 'task'),
  };
}

describe('Phase B — cross-domain intelligence baseline (diagnostic)', () => {
  it('records a reproducible baseline across domains without hiding failures behind narrow acceptance assertions', () => {
    const observations = CASES.map(observe);
    const totalAnchors = CASES.reduce((n, item) => n + item.anchors.length, 0);
    const captureAnchorHits = observations.reduce((n, row) => n + row.anchors.length - row.missingAnchorsInCaptureLine.length, 0);
    const speechDockAnchorHits = observations.reduce((n, row) => n + row.anchors.length - row.missingAnchorsInSpeechDock.length, 0);
    const typedDockAnchorHits = observations.reduce((n, row) => n + row.anchors.length - row.missingAnchorsInTypedDock.length, 0);
    const scored = observations.filter((row) => row.expectedMode !== 'preserve');
    const speechModeCorrect = scored.filter((row) => row.speechModeCorrect).length;
    const typedModeCorrect = scored.filter((row) => row.typedModeCorrect).length;
    const byDomain = [...new Set(CASES.map((item) => item.domain))].map((domain) => {
      const rows = observations.filter((row) => row.domain === domain);
      const anchors = rows.reduce((n, row) => n + row.anchors.length, 0);
      const hits = rows.reduce((n, row) => n + row.anchors.length - row.missingAnchorsInCaptureLine.length, 0);
      return { domain, cases: rows.length, captureAnchorRecall: Number((hits / anchors).toFixed(3)) };
    });

    const report = {
      benchmark: 'phase-b-cross-domain-baseline-v1',
      transcriptSource: 'fixed text input; acoustic ASR excluded',
      totalCases: observations.length,
      domains: byDomain.length,
      scoredModeCases: scored.length,
      anchors: {
        total: totalAnchors,
        captureLine: { hits: captureAnchorHits, recall: Number((captureAnchorHits / totalAnchors).toFixed(3)) },
        speechDock: { hits: speechDockAnchorHits, recall: Number((speechDockAnchorHits / totalAnchors).toFixed(3)) },
        typedDock: { hits: typedDockAnchorHits, recall: Number((typedDockAnchorHits / totalAnchors).toFixed(3)) },
      },
      taskModeAccuracy: {
        speechToDock: { correct: speechModeCorrect, total: scored.length, accuracy: Number((speechModeCorrect / scored.length).toFixed(3)) },
        typedToDock: { correct: typedModeCorrect, total: scored.length, accuracy: Number((typedModeCorrect / scored.length).toFixed(3)) },
      },
      speechTypedModeDisagreements: observations.filter((row) => row.speechModeCorrect !== null && row.typedModeCorrect !== null && row.speechModeCorrect !== row.typedModeCorrect).map((row) => row.id),
      failures: observations.filter((row) => row.missingAnchorsInCaptureLine.length > 0 || row.missingAnchorsInSpeechDock.length > 0 || row.missingAnchorsInTypedDock.length > 0 || row.speechModeCorrect === false || row.typedModeCorrect === false),
      byDomain,
      observations,
    };

    console.info('\nPHASE_B_CROSS_DOMAIN_BASELINE=' + JSON.stringify(report));

    // These assertions validate the benchmark itself, not product performance.
    // Product scores are intentionally reported first rather than hidden as red CI.
    expect(observations).toHaveLength(CASES.length);
    expect(new Set(observations.map((row) => row.id)).size).toBe(CASES.length);
    expect(byDomain.length).toBeGreaterThanOrEqual(8);
    expect(totalAnchors).toBeGreaterThanOrEqual(100);
    expect(observations.every((row) => row.captureLine.length > 0)).toBe(true);
  });
});
