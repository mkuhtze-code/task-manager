// @vitest-environment happy-dom
import { cleanup, render, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UpLink from '@/components/instrument/nav/UpLink';
import UtilityDone from '@/components/instrument/nav/UtilityDone';
import SheetDismiss from '@/components/instrument/nav/SheetDismiss';

afterEach(() => cleanup());

describe('Instrument navigation primitives', () => {
  it('uses an explicit parent href and parent-name label', () => {
    const { getByRole } = render(<UpLink href="/jobs" label="Jobs" />);
    const link = getByRole('link', { name: 'Jobs' });
    expect(link.getAttribute('href')).toBe('/jobs');
    expect(link.textContent).toContain('Jobs');
  });
  it('migrates job detail away from the generic Back label', () => {
    const page = readFileSync('app/jobs/[jobId]/page.tsx', 'utf8');
    expect(page).toContain('<UpLink href="/jobs" label="Jobs" />');
    expect(page).not.toContain('aria-label="Back to jobs"');
  });
  it('migrates Meetings detail to its parent lens without generic Back labels', () => {
    const page = readFileSync('app/meetings/[meetingId]/page.tsx', 'utf8');
    expect(page).toContain('<UpLink href="/meetings" label="Meetings" />');
    expect(page).not.toContain('aria-label="Back"');
    expect(page).not.toContain('aria-label="Back to meetings"');
  });
  it('migrates Travel detail to its parent lens without generic Back labels', () => {
    const page = readFileSync('app/travel/[tripId]/page.tsx', 'utf8');
    expect(page).toContain('<UpLink href="/travel" label="Travel" />');
    expect(page).not.toContain('aria-label="Back to travel"');
    expect(page).not.toContain("router.push('/travel')");
  });
  it('migrates Account and Analytics utility exits to Done', () => {
    const account = readFileSync('app/account/page.tsx', 'utf8');
    const analytics = readFileSync('app/analytics/page.tsx', 'utf8');
    expect(account).toContain('utilityDoneHref="/"');
    expect(account).not.toContain('backHref="/"');
    expect(analytics).toContain('<UtilityDone href="/" />');
    expect(analytics).not.toContain('aria-label="Back"');
  });
  it('uses Up: Account on the change-password section', () => {
    const page = readFileSync('app/account/change-password/page.tsx', 'utf8');
    expect(page).toContain('upHref="/account" upLabel="Account"');
    expect(page).not.toContain('backHref="/account"');
  });
  it('completes a utility surface to its explicit destination', () => {
    const { getByRole } = render(<UtilityDone href="/" />);
    expect(getByRole('link', { name: 'Done' }).getAttribute('href')).toBe('/');
  });
  it('provides an accessible transient dismiss control', () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(<SheetDismiss onDismiss={onDismiss} label="Close" />);
    fireEvent.click(getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('migrates Billing leave chrome without changing feature-query behavior', () => {
    const page = readFileSync('app/account/billing/page.tsx', 'utf8');
    expect(page).toContain('upHref="/account" upLabel="Account"');
    expect(page).not.toContain('backHref="/account"');
    expect(page).toContain("searchParams.get('feature')");
    expect(page).toContain('PRO_FEATURE_COPY[highlightFeature]');
  });
  it('uses shared Admin Up chrome on sections while preserving the hub exit and auth gate', () => {
    const layout = readFileSync('app/admin/layout.tsx', 'utf8');
    const hub = readFileSync('app/admin/page.tsx', 'utf8');
    expect(layout).toContain("pathname !== '/admin' && <UpLink href=\"/admin\" label=\"Admin\" />");
    expect(layout).toContain("if (!session || loading || isAdmin === null || !isAdmin)");
    expect(layout).toContain('href="/" className="adm-action-link"');
    expect(hub).not.toContain('aria-label="Back"');
  });
  it('uses Done for app Contact while preserving Feedback redirect', () => {
    const contact = readFileSync('app/contact/page.tsx', 'utf8');
    const feedback = readFileSync('app/feedback/page.tsx', 'utf8');
    expect(contact).toContain('<AppHeader title="Contact us" utilityDoneHref="/" />');
    expect(contact).not.toContain('backHref="/"');
    expect(feedback).toContain("redirect('/contact')");
  });
  it('uses the shared dismiss primitive for Capture, Depth, Task detail, and Find place headers', () => {
    const capture = readFileSync('components/CaptureSheet.tsx', 'utf8');
    const depth = readFileSync('components/instrument/DepthSheet.tsx', 'utf8');
    const task = readFileSync('components/TaskDetailSheet.tsx', 'utf8');
    const findPlace = readFileSync('components/FindPlaceSheet.tsx', 'utf8');
    expect(capture).toContain('<SheetDismiss onDismiss={onClose} label="Close" />');
    expect(depth).toContain('<SheetDismiss onDismiss={onDismiss} label="Close" autoFocus />');
    expect(task).toContain('<SheetDismiss onDismiss={handleClose} label="Close" />');
    expect(findPlace).toContain('<SheetDismiss onDismiss={onClose} label="Close" />');
    expect(capture).not.toContain('aria-label="Back"');
    expect(depth).not.toContain('aria-label="Back"');
    expect(findPlace).not.toContain('aria-label="Back"');
  });
  it('keeps SheetDismiss independently tested and preserves dialog-owner arbitration', () => {
    const test = readFileSync('components/instrument/nav/__tests__/navigationPrimitives.test.tsx', 'utf8');
    const dialogA11y = readFileSync('hooks/useDialogA11y.ts', 'utf8');
    expect(test).toContain("it('provides an accessible transient dismiss control'");
    expect(dialogA11y).toContain('activeDialogStack');
    expect(dialogA11y).toContain('onCloseRef.current()');
  });
});
