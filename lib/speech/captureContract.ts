/**
 * Client-independent capture contract for web and native clients.
 *
 * This module prepares proposals and issues a one-time authorization ticket.
 * It never opens a microphone, transcribes audio, persists tasks, or calls a
 * mutation executor. Transcription and typed entry are equivalent text sources;
 * neither source is permission to act.
 */
import {
  processCaptureSpeech,
  captureIsCollectionMutation,
  captureMustNotCreate,
  type CaptureSpeechResult,
  type ProcessCaptureSpeechInput,
} from './captureAdapter';

export const CAPTURE_CONTRACT_VERSION = 1 as const;

export type CaptureSource = 'typed' | 'transcript';

export type CaptureContractInput = Omit<ProcessCaptureSpeechInput, 'text'> & {
  requestId: string;
  source: CaptureSource;
  text: string;
};

export type CaptureProposalStatus =
  | 'confirmation_required'
  | 'collection_confirmation_required'
  | 'clarification_required'
  | 'observation'
  | 'non_action';

export type PreparedCapture = {
  contractVersion: typeof CAPTURE_CONTRACT_VERSION;
  requestId: string;
  source: CaptureSource;
  status: CaptureProposalStatus;
  authorizationRequired: boolean;
  result: CaptureSpeechResult;
};

export type PrepareCaptureResult =
  | { status: 'prepared'; proposal: PreparedCapture }
  | { status: 'invalid_request'; reason: 'missing_request_id' | 'missing_text' }
  | { status: 'request_id_conflict' };

export type CaptureAuthorizationResult =
  | {
      status: 'authorized';
      requestId: string;
      operation: 'task' | 'context_update' | 'collection';
      proposalSummaries: string[];
    }
  | {
      status:
        | 'confirmation_required'
        | 'cancelled'
        | 'already_authorized'
        | 'not_authorizable'
        | 'unknown_request';
      requestId: string;
    };

type SessionEntry = {
  fingerprint: string;
  proposal: PreparedCapture;
  state: 'pending' | 'cancelled' | 'authorized';
};

function proposalStatus(result: CaptureSpeechResult): CaptureProposalStatus {
  if (captureIsCollectionMutation(result)) return 'collection_confirmation_required';
  if (result.uiMode === 'ask_clarification' || result.uiMode === 'collection_clarification') {
    return 'clarification_required';
  }
  if (result.outcome === 'RECORD_OBSERVATION' || result.outcome === 'NOTE_REPORTED') {
    return 'observation';
  }
  const hasAllowedProposal = result.proposals.some((proposal) => !proposal.blocked);
  if (
    hasAllowedProposal &&
    !captureMustNotCreate(result) &&
    result.requiresConfirmation
  ) {
    return 'confirmation_required';
  }
  return 'non_action';
}

function fingerprint(input: CaptureContractInput): string {
  // Deliberately in-memory only; never log or persist this content-bearing key.
  return JSON.stringify([input.source, input.text]);
}

/**
 * Create an in-memory, single-session coordinator suitable for a native or web
 * adapter. A host must still enforce idempotency at its persistence boundary:
 * this coordinator is not a durable transaction or cross-device lock.
 */
export function createCaptureContractSession() {
  const entries = new Map<string, SessionEntry>();

  function prepare(input: CaptureContractInput): PrepareCaptureResult {
    const requestId = input.requestId.trim();
    if (!requestId || requestId.length > 128) {
      return { status: 'invalid_request', reason: 'missing_request_id' };
    }
    if (!input.text.trim()) {
      return { status: 'invalid_request', reason: 'missing_text' };
    }

    const normalizedInput = { ...input, requestId };
    const key = fingerprint(normalizedInput);
    const existing = entries.get(requestId);
    if (existing) {
      if (existing.fingerprint !== key) return { status: 'request_id_conflict' };
      return { status: 'prepared', proposal: existing.proposal };
    }

    const { requestId: _requestId, source: _source, ...speechInput } = normalizedInput;
    const result = processCaptureSpeech(speechInput);
    const status = proposalStatus(result);
    const proposal: PreparedCapture = {
      contractVersion: CAPTURE_CONTRACT_VERSION,
      requestId,
      source: normalizedInput.source,
      status,
      authorizationRequired:
        status === 'confirmation_required' || status === 'collection_confirmation_required',
      result,
    };

    entries.set(requestId, { fingerprint: key, proposal, state: 'pending' });
    return { status: 'prepared', proposal };
  }

  function authorize(input: {
    requestId: string;
    explicitlyConfirmed: boolean;
  }): CaptureAuthorizationResult {
    const entry = entries.get(input.requestId);
    if (!entry) return { status: 'unknown_request', requestId: input.requestId };
    if (entry.state === 'cancelled') return { status: 'cancelled', requestId: input.requestId };
    if (entry.state === 'authorized') {
      return { status: 'already_authorized', requestId: input.requestId };
    }
    if (!input.explicitlyConfirmed) {
      return { status: 'confirmation_required', requestId: input.requestId };
    }

    const { proposal } = entry;
    if (!proposal.authorizationRequired || captureMustNotCreate(proposal.result)) {
      return { status: 'not_authorizable', requestId: input.requestId };
    }

    let operation: 'task' | 'context_update' | 'collection';
    if (proposal.status === 'collection_confirmation_required') {
      operation = 'collection';
    } else if (proposal.result.outcome === 'UPDATE_EXISTING_CONTEXT') {
      operation = 'context_update';
    } else if (
      proposal.result.outcome === 'CREATE_TASK' ||
      proposal.result.outcome === 'CREATE_MULTIPLE_TASKS'
    ) {
      operation = 'task';
    } else {
      return { status: 'not_authorizable', requestId: input.requestId };
    }

    entry.state = 'authorized';
    return {
      status: 'authorized',
      requestId: input.requestId,
      operation,
      proposalSummaries: proposal.result.proposals
        .filter((item) => !item.blocked)
        .map((item) => item.summary),
    };
  }

  function cancel(requestId: string): boolean {
    const entry = entries.get(requestId);
    if (!entry || entry.state !== 'pending') return false;
    entry.state = 'cancelled';
    return true;
  }

  function getState(requestId: string): 'pending' | 'cancelled' | 'authorized' | 'unknown' {
    return entries.get(requestId)?.state ?? 'unknown';
  }

  return { prepare, authorize, cancel, getState };
}

export type CaptureContractSession = ReturnType<typeof createCaptureContractSession>;
