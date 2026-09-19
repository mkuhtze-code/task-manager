'use client';

import { useEffect } from 'react';

/**
 * EMERGENCY STUB — full Today page was truncated during a tooling push.
 * Full source is in restore/today-page/part0.txt … part4.txt
 *
 * Restore locally:
 *   cat restore/today-page/part*.txt > app/page.tsx
 *   git add app/page.tsx && git commit -m "Restore Today page" && git push
 *
 * Or from git history:
 *   git checkout a00c02ff -- app/page.tsx
 */
export default function Home() {
  useEffect(() => {
    console.error('Dokkit Today is in emergency restore mode. See app/page.tsx.');
  }, []);
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 560 }}>
      <h1 style={{ fontSize: 18, marginBottom: 12 }}>Today is temporarily offline</h1>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: '#444' }}>
        The main page was truncated during a tooling error. Restore from the parts already
        committed under <code>restore/today-page/</code>, or from commit <code>a00c02ff</code>.
      </p>
      <pre
        style={{
          fontSize: 12,
          background: '#f4f4f4',
          padding: 12,
          borderRadius: 8,
          overflow: 'auto',
        }}
      >{`cat restore/today-page/part*.txt > app/page.tsx
git add app/page.tsx
git commit -m "Restore Today page"
git push`}</pre>
    </div>
  );
}
