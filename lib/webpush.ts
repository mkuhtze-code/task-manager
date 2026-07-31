import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT as string,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
  process.env.VAPID_PRIVATE_KEY as string
);

export default webpush;

// Sends with high urgency so Android's push service treats it as
// time-sensitive rather than something that can be batched/delayed —
// matters most on phones (Huawei especially) that already restrict
// background delivery by default.
export const HIGH_PRIORITY_OPTIONS = { urgency: 'high' as const };
