'use client';

import { useState } from 'react';
import { apiUrl } from '@/lib/authedFetch';

export default function RequestAccessForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [optIn, setOptIn] = useState(true);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const res = await fetch(apiUrl('/api/request-access'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, marketingOptIn: optIn }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        setStatus('error');
        return;
      }
      setStatus('sent');
    } catch {
      setError('Something went wrong. Please try again.');
      setStatus('error');
    }
  }

  if (status === 'sent') {
    const firstName = name.trim().split(' ')[0] || 'there';
    return <div className="w-form-sent">Thanks, {firstName} — you're on the list.</div>;
  }

  return (
    <form className="w-request-form" onSubmit={handleSubmit}>
      <div className="w-form-row">
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={status === 'sending'}
        />
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={status === 'sending'}
        />
      </div>
      <label className="w-form-checkbox">
        <input
          type="checkbox"
          checked={optIn}
          onChange={(e) => setOptIn(e.target.checked)}
          disabled={status === 'sending'}
        />
        <span>Send me occasional updates about Dokkit</span>
      </label>
      {error && <p className="w-form-error">{error}</p>}
      <button type="submit" className="w-btn w-btn-primary" disabled={status === 'sending'} style={{ width: '100%' }}>
        {status === 'sending' ? 'Sending…' : 'Request access'}
      </button>
    </form>
  );
}
