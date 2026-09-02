import webpush from 'web-push';

let isVapidConfigured = false;

function ensureVapidConfigured(): typeof webpush {
  if (!isVapidConfigured) {
    const subject = process.env.VAPID_SUBJECT;
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!subject || !publicKey || !privateKey) {
      throw new Error(
        'Missing WebPush VAPID environment variables (VAPID_SUBJECT / NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)'
      );
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
    isVapidConfigured = true;
  }
  return webpush;
}

const webpushProxy = new Proxy(webpush, {
  get(target, prop, receiver) {
    ensureVapidConfigured();
    const value = Reflect.get(target, prop, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

export default webpushProxy;

// Sends with high urgency so Android's push service treats it as
// time-sensitive rather than something that can be batched/delayed —
// matters most on phones (Huawei especially) that already restrict
// background delivery by default.
export const HIGH_PRIORITY_OPTIONS = { urgency: 'high' as const };
