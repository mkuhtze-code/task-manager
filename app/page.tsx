'use client';

// Temporary entry while full Today page is restored after accidental wipe.
// See git history a186073 / 72fb095 for the complete Home component.
export default function Home() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 18, margin: 0 }}>Dokkit</h1>
      <p style={{ color: '#666', marginTop: 8 }}>
        Today is being restored. Please pull the previous <code>app/page.tsx</code> from commit{' '}
        <code>a186073</code> or <code>72fb095</code> if this message persists.
      </p>
    </div>
  );
}
