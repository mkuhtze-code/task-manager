import { describe, expect, it } from 'vitest';
import {
  CAPTURE_CONTRACT_VERSION,
  createCaptureContractSession,
} from '../captureContract';

describe('native capture contract', () => {
  it('uses the same deterministic interpretation for typed and transcript text', () => {
    const typed = createCaptureContractSession().prepare({
      requestId: 'typed-1',
      source: 'typed',
      text: 'Call John tomorrow.',
    });
    const transcript = createCaptureContractSession().prepare({
      requestId: 'transcript-1',
      source: 'transcript',
      text: 'Call John tomorrow.',
    });

    expect(typed.status).toBe('prepared');
    expect(transcript.status).toBe('prepared');
    if (typed.status !== 'prepared' || transcript.status !== 'prepared') return;

    expect(typed.proposal.contractVersion).toBe(CAPTURE_CONTRACT_VERSION);
    expect(typed.proposal.result.outcome).toBe(transcript.proposal.result.outcome);
    expect(typed.proposal.result.proposals.map((p) => p.summary)).toEqual(
      transcript.proposal.result.proposals.map((p) => p.summary),
    );
    expect(typed.proposal.authorizationRequired).toBe(true);
    expect(transcript.proposal.authorizationRequired).toBe(true);
  });

  it('requires explicit confirmation and grants authorization only once', () => {
    const session = createCaptureContractSession();
    const prepared = session.prepare({
      requestId: 'confirm-1',
      source: 'typed',
      text: 'Call John tomorrow.',
    });
    expect(prepared.status).toBe('prepared');
    if (prepared.status !== 'prepared') return;

    expect(session.authorize({
      requestId: 'confirm-1',
      explicitlyConfirmed: false,
    })).toEqual({ status: 'confirmation_required', requestId: 'confirm-1' });

    const authorization = session.authorize({
      requestId: 'confirm-1',
      explicitlyConfirmed: true,
    });
    expect(authorization.status).toBe('authorized');
    if (authorization.status === 'authorized') {
      expect(authorization.operation).toBe('task');
      expect(authorization.proposalSummaries.length).toBeGreaterThan(0);
    }
    expect(session.authorize({
      requestId: 'confirm-1',
      explicitlyConfirmed: true,
    })).toEqual({ status: 'already_authorized', requestId: 'confirm-1' });
  });

  it('cancellation prevents later authorization', () => {
    const session = createCaptureContractSession();
    const prepared = session.prepare({
      requestId: 'cancel-1',
      source: 'transcript',
      text: 'Call John tomorrow.',
    });
    expect(prepared.status).toBe('prepared');
    expect(session.cancel('cancel-1')).toBe(true);
    expect(session.getState('cancel-1')).toBe('cancelled');
    expect(session.authorize({
      requestId: 'cancel-1',
      explicitlyConfirmed: true,
    })).toEqual({ status: 'cancelled', requestId: 'cancel-1' });
    expect(session.cancel('cancel-1')).toBe(false);
  });

  it('non-actions cannot be authorized even when confirmation is requested', () => {
    const session = createCaptureContractSession();
    const prepared = session.prepare({
      requestId: 'non-action-1',
      source: 'transcript',
      text: 'The thingamajig is making a high-pitched noise again.',
    });
    expect(prepared.status).toBe('prepared');
    if (prepared.status !== 'prepared') return;

    expect(prepared.proposal.authorizationRequired).toBe(false);
    expect(session.authorize({
      requestId: 'non-action-1',
      explicitlyConfirmed: true,
    })).toEqual({ status: 'not_authorizable', requestId: 'non-action-1' });
  });

  it('same request ID is idempotent but cannot be reused for different input', () => {
    const session = createCaptureContractSession();
    const input = {
      requestId: 'stable-id',
      source: 'typed' as const,
      text: 'Call John tomorrow.',
    };
    const first = session.prepare(input);
    const retry = session.prepare(input);
    expect(first.status).toBe('prepared');
    expect(retry.status).toBe('prepared');
    if (first.status === 'prepared' && retry.status === 'prepared') {
      expect(retry.proposal).toBe(first.proposal);
    }

    expect(session.prepare({
      ...input,
      text: 'Email Sarah Friday.',
    })).toEqual({ status: 'request_id_conflict' });
  });

  it('keeps collection authorization separate from task creation', () => {
    const session = createCaptureContractSession();
    const prepared = session.prepare({
      requestId: 'collection-1',
      source: 'typed',
      text: 'Grocery list add milk',
    });
    expect(prepared.status).toBe('prepared');
    if (prepared.status !== 'prepared') return;

    if (prepared.proposal.status !== 'collection_confirmation_required') return;
    expect(prepared.proposal.result.outcome).not.toBe('CREATE_TASK');
    expect(session.authorize({
      requestId: 'collection-1',
      explicitlyConfirmed: true,
    })).toMatchObject({ status: 'authorized', operation: 'collection' });
  });

  it('rejects missing IDs and blank input without interpretation', () => {
    const session = createCaptureContractSession();
    expect(session.prepare({
      requestId: '  ',
      source: 'typed',
      text: 'Call John.',
    })).toEqual({ status: 'invalid_request', reason: 'missing_request_id' });
    expect(session.prepare({
      requestId: 'blank-1',
      source: 'typed',
      text: '  ',
    })).toEqual({ status: 'invalid_request', reason: 'missing_text' });
  });

  it('does not treat understanding as persistence or mutate state before authorization', () => {
    const session = createCaptureContractSession();
    const prepared = session.prepare({
      requestId: 'no-auto-commit',
      source: 'typed',
      text: 'Call John tomorrow.',
    });
    expect(prepared.status).toBe('prepared');
    expect(session.getState('no-auto-commit')).toBe('pending');
  });
});
