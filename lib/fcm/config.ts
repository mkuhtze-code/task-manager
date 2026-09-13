// Firebase Web Messaging (FCM) public web configuration.
//
// These values are public by design (they ship in every browser client,
// exactly like NEXT_PUBLIC_SUPABASE_*). They are consumed in two places:
//   * the browser registration layer (Next inlines NEXT_PUBLIC_* into the
//     client bundle at build time), and
//   * /api/firebase-config, which emits them as a JS file the Service
//     Worker importScripts at install time (the one code path that cannot
//     use Next's bundle-time inlining).
// Never put Firebase Admin/service-account secrets in here.

export interface FirebaseWebConfig {
  apiKey: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
}

export function getFirebaseWebConfig(): FirebaseWebConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !projectId || !messagingSenderId || !appId) return null;
  return { apiKey, projectId, messagingSenderId, appId };
}

// VAPID key for the FCM web messaging SDK (getToken). This is Firebase's
// own web-push certificate from the Firebase Console (Cloud Messaging →
// Web push certificates), distinct from the legacy VAPID pair used by the
// existing web-push path.
export function getFirebaseVapidKey(): string | null {
  return process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || null;
}