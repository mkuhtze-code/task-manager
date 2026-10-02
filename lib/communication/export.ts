import type { ClientMeetingSummary, MeetingUnderstanding, UnderstoodItem } from './types';

export type BuildClientSummaryOptions = {
  projectName?: string | null;
  meetingDate?: string | null;
  location?: string | null;
  participants?: string[];
  title?: string;
};

export function buildClientMeetingSummary(
  understanding: MeetingUnderstanding,
  options: BuildClientSummaryOptions = {}
): ClientMeetingSummary {
  const customerRequirements = unique([
    ...understanding.requirements.map((i) => clean(i.text)),
    ...understanding.preferences.map((i) => clean(i.text)),
  ]);

  const agreed = unique([
    ...understanding.commitments
      .filter((i) => i.certainty === 'CONFIRMED')
      .map((i) => clean(i.text)),
    ...understanding.responses
      .filter((i) => i.certainty === 'CONFIRMED')
      .map((i) => clean(i.text)),
    ...understanding.decisions
      .filter((i) => i.certainty === 'CONFIRMED')
      .map((i) => clean(i.text)),
  ]);

  const toConfirm = unique([
    ...understanding.unresolved.map((i) => clean(formatToConfirm(i))),
    ...understanding.responses
      .filter((i) => i.certainty === 'PROVISIONAL' || i.certainty === 'NEEDS_CHECK')
      .map((i) => clean(formatToConfirm(i))),
    ...understanding.commitments
      .filter((i) => i.certainty === 'PROVISIONAL' || i.certainty === 'NEEDS_CHECK')
      .map((i) => clean(formatToConfirm(i))),
  ]);

  const toConfirmLower = new Set(toConfirm.map((t) => t.toLowerCase()));
  const agreedSafe = agreed.filter((a) => !toConfirmLower.has(a.toLowerCase()));

  return {
    title: options.title ?? 'Project Meeting Summary',
    projectName: options.projectName ?? null,
    meetingDate: options.meetingDate ?? null,
    location: options.location ?? null,
    participants: options.participants ?? [],
    discussed: unique(understanding.observations.map((i) => clean(i.text))),
    customerRequirements,
    agreed: agreedSafe,
    toConfirm,
    nextSteps: unique(understanding.actions.map((i) => clean(i.text))),
  };
}

export function formatClientSummaryPlainText(summary: ClientMeetingSummary): string {
  const lines: string[] = [summary.title, ''];
  if (summary.projectName) lines.push(`Project: ${summary.projectName}`);
  if (summary.meetingDate) lines.push(`Date: ${summary.meetingDate}`);
  if (summary.location) lines.push(`Location: ${summary.location}`);
  if (summary.participants.length) {
    lines.push(`Participants: ${summary.participants.join(', ')}`);
  }
  if (
    summary.projectName ||
    summary.meetingDate ||
    summary.location ||
    summary.participants.length
  ) {
    lines.push('');
  }
  section(lines, 'Discussed', summary.discussed);
  section(lines, 'Customer requirements', summary.customerRequirements);
  section(lines, 'Agreed', summary.agreed);
  section(lines, 'To confirm', summary.toConfirm);
  section(lines, 'Next steps', summary.nextSteps);
  return lines.join('\n').trim() + '\n';
}

export function validateClientSummary(summary: ClientMeetingSummary): string[] {
  const problems: string[] = [];
  const markers = [/\bprobably\b/i, /\bmaybe\b/i, /\bneed to check\b/i, /\bneeds checking\b/i];
  for (const line of summary.agreed) {
    for (const re of markers) {
      if (re.test(line)) problems.push(`Agreed section contains provisional language: "${line}"`);
    }
  }
  const agreedSet = new Set(summary.agreed.map((a) => a.toLowerCase()));
  for (const t of summary.toConfirm) {
    if (agreedSet.has(t.toLowerCase())) {
      problems.push(`Item appears in both Agreed and To confirm: "${t}"`);
    }
  }
  return problems;
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    const t = i.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function formatToConfirm(item: UnderstoodItem): string {
  const t = item.text.trim();
  if (/to be confirmed|subject to confirmation|to confirm/i.test(t)) return t;
  if (item.certainty === 'NEEDS_CHECK') return `${t} — to be confirmed`;
  if (item.certainty === 'PROVISIONAL') return `${t} — subject to confirmation`;
  return t;
}

function section(lines: string[], heading: string, items: string[]): void {
  if (items.length === 0) return;
  lines.push(heading);
  for (const item of items) lines.push(`• ${item}`);
  lines.push('');
}
