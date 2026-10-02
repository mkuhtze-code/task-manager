/**
 * Golden set: utterances that must NOT be treated as self-corrections.
 * Used by benchmark + unit tests to prevent false-positive correction swaps.
 */

export const MUST_NOT_CORRECT: readonly string[] = [
  'I said no to the Henderson job yesterday.',
  'She told me no when I asked about Friday.',
  'We answered no to the quote request.',
  'No problem, I will call John tomorrow.',
  'There is no meeting on the calendar.',
  'I do not want to reschedule that.',
  'Not sure if Sarah is free.',
  'I am not going to the site today.',
  'Please note: no access until after lunch.',
  'The client said maybe not next week.',
  'I never said I would do the roof myself.',
  'Tell them no more variations without a variation order.',
  'We have no more room in the van.',
  'If they say no, leave it.',
  'I already said no once.',
  'No, wait — that is still not a correction of a prior entity.',
  'The job is not for Henderson Roofing.',
  'Do not create a task for that yet.',
  'I would rather not commit to a date.',
  'There was no time to finish the invoice.',
  'Call John if he says no about the deposit.',
  'Actually I am free — that is not correcting a prior task title.',
  'Sorry I missed your call earlier.',
  'Rather than rush it, leave it for Monday.',
  'Instead of going now, wait for the delivery.',
  'Make that a priority but do not change the address.',
  'I mean the one on Queen Street is already done.',
  'Wait for the concrete to cure.',
  'Change that filter on the invoice template later.',
  'Not the extension — the extension is already booked, this is about the roof only as context.',
];
