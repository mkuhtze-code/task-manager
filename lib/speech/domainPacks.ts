/**
 * Universal domain vocabulary packs for soft STT / interpret scoring.
 * Trades pack kept; expanded for onboarding roles (professional, student, knowledge, personal).
 * Soft nudge only — never forces a repair alone.
 */

export type DomainPackId =
  | 'trades'
  | 'client_services'
  | 'knowledge_ops'
  | 'student'
  | 'creative'
  | 'personal'
  | 'general_work';

export type DomainPack = {
  id: DomainPackId;
  label: string;
  terms: string[];
};

export const DOMAIN_PACKS: DomainPack[] = [
  {
    id: 'trades',
    label: 'Trades & site',
    terms: [
      'flashing', 'fascia', 'soffit', 'gutter', 'gib', 'gyprock', 'plasterboard',
      'eaves', 'weatherboard', 'ridge', 'valley', 'scaffold', 'cladding', 'tiler',
      'builder', 'subcontractor', 'council', 'consent', 'quote', 'variation', 'invoice',
    ],
  },
  {
    id: 'client_services',
    label: 'Client services',
    terms: [
      'client', 'customer', 'proposal', 'retainer', 'onboarding', 'discovery',
      'deliverable', 'scope', 'kickoff', 'follow-up', 'invoice', 'statement',
    ],
  },
  {
    id: 'knowledge_ops',
    label: 'Knowledge work',
    terms: [
      'roadmap', 'backlog', 'sprint', 'standup', 'retrospective', 'spec', 'PR',
      'deploy', 'release', 'ticket', 'blocker', 'dependency', 'milestone',
    ],
  },
  {
    id: 'student',
    label: 'Study',
    terms: [
      'assignment', 'essay', 'lecture', 'tutorial', 'exam', 'lab', 'thesis',
      'citation', 'reading', 'seminar', 'coursework',
    ],
  },
  {
    id: 'creative',
    label: 'Creative',
    terms: [
      'draft', 'edit', 'storyboard', 'mockup', 'portfolio', 'brief', 'cut',
      'render', 'composition', 'revision',
    ],
  },
  {
    id: 'personal',
    label: 'Personal',
    terms: [
      'grocery', 'groceries', 'errand', 'pickup', 'appointment', 'school',
      'daycare', 'pharmacy', 'laundry', 'packing',
    ],
  },
  {
    id: 'general_work',
    label: 'General work',
    terms: [
      'meeting', 'agenda', 'notes', 'action', 'deadline', 'schedule', 'calendar',
      'email', 'call', 'review',
    ],
  },
];

export function allDomainTerms(): Set<string> {
  const s = new Set<string>();
  for (const pack of DOMAIN_PACKS) {
    for (const t of pack.terms) s.add(t.toLowerCase());
  }
  return s;
}

export function domainPackScore(previous: string, next: string): number {
  const terms = allDomainTerms();
  let score = 0;
  if (terms.has(previous.toLowerCase())) score += 0.03;
  if (terms.has(next.toLowerCase())) score += 0.03;
  return score;
}
