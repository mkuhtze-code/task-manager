'use client';

import { DAY_OPTIONS } from '@/lib/taskTypes';
import LocationAutocomplete from '@/components/LocationAutocomplete';

export function AuthScreen(props: {
  hasSignedInBefore: boolean;
  isNewUser: boolean;
  setIsNewUser: (v: boolean) => void;
  showForgotPassword: boolean;
  setShowForgotPassword: (v: boolean) => void;
  signingInWithGoogle: boolean;
  onGoogleSignIn: () => void;
  signInError: string;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  onPasswordSignIn: (e: React.FormEvent) => void;
  onForgotPassword: (e: React.FormEvent) => void;
  forgotPasswordSent: boolean;
  setForgotPasswordSent: (v: boolean) => void;
  magicLinkSent: boolean;
  setMagicLinkSent: (v: boolean) => void;
  onMagicLink: (e: React.FormEvent) => void;
}) {
  const {
    hasSignedInBefore, isNewUser, setIsNewUser, showForgotPassword, setShowForgotPassword,
    signingInWithGoogle, onGoogleSignIn, signInError, email, setEmail, password, setPassword,
    onPasswordSignIn, onForgotPassword, forgotPasswordSent, setForgotPasswordSent,
    magicLinkSent, setMagicLinkSent, onMagicLink,
  } = props;

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-eyebrow">Dokkit</div>
        {hasSignedInBefore && !isNewUser && !showForgotPassword ? (
          <>
            <h1 className="auth-title">Welcome back</h1>
            <p className="auth-sub">Sign in with your email and password.</p>

            <button
              type="button"
              className="btn btn-google"
              onClick={onGoogleSignIn}
              disabled={signingInWithGoogle}
            >
              {signingInWithGoogle ? 'Signing in...' : 'Sign in with Google'}
            </button>

            <div className="auth-divider">or</div>

            <form onSubmit={onPasswordSignIn} className="auth-form">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
              />
              <button type="submit" className="btn btn-steel">Sign in</button>
              {signInError && <p className="auth-error">{signInError}</p>}
            </form>
            <button
              className="btn-text"
              onClick={() => setShowForgotPassword(true)}
              style={{ marginTop: 'var(--space-3)' }}
            >
              Forgot password?
            </button>
            <button
              className="btn-text"
              onClick={() => setIsNewUser(true)}
              style={{ marginTop: 'var(--space-2)' }}
            >
              New user? Sign up
            </button>
          </>
        ) : showForgotPassword ? (
          <>
            <h1 className="auth-title">Reset password</h1>
            <p className="auth-sub">Enter your email to receive a password reset link.</p>
            {forgotPasswordSent ? (
              <>
                <p className="auth-sent">Check your email for a password reset link.</p>
                <button
                  className="btn-text"
                  onClick={() => {
                    setForgotPasswordSent(false);
                    setShowForgotPassword(false);
                    setEmail('');
                  }}
                  style={{ marginTop: 'var(--space-3)' }}
                >
                  Back to sign in
                </button>
              </>
            ) : (
              <>
                <form onSubmit={onForgotPassword} className="auth-form">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                  <button type="submit" className="btn btn-steel">Send reset link</button>
                  {signInError && <p className="auth-error">{signInError}</p>}
                </form>
                <button
                  className="btn-text"
                  onClick={() => setShowForgotPassword(false)}
                  style={{ marginTop: 'var(--space-3)' }}
                >
                  Back to sign in
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <h1 className="auth-title">{isNewUser ? 'Set up Dokkit' : 'Get started'}</h1>
            <p className="auth-sub">
              {isNewUser ? 'Sign up with Google or create a password-protected account.' : 'A personal thinking tool that understands time.'}
            </p>

            <button
              type="button"
              className="btn btn-google"
              onClick={onGoogleSignIn}
              disabled={signingInWithGoogle}
            >
              {signingInWithGoogle ? 'Signing in...' : 'Sign up with Google'}
            </button>

            <div className="auth-divider">or</div>

            {magicLinkSent ? (
              <>
                <p className="auth-sent">Check your email for a sign-in link.</p>
                <button
                  className="btn-text"
                  onClick={() => {
                    setMagicLinkSent(false);
                    setEmail('');
                    setPassword('');
                  }}
                  style={{ marginTop: 'var(--space-3)' }}
                >
                  Back
                </button>
              </>
            ) : (
              <form onSubmit={onMagicLink} className="auth-form">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
                <button type="submit" className="btn btn-steel">Send magic link</button>
                {signInError && <p className="auth-error">{signInError}</p>}
              </form>
            )}
            {isNewUser && hasSignedInBefore && (
              <button
                className="btn-text"
                onClick={() => setIsNewUser(false)}
                style={{ marginTop: 'var(--space-3)' }}
              >
                Already have an account?
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function OnboardingScreen(props: {
  workStart: string;
  setWorkStart: (v: string) => void;
  workEnd: string;
  setWorkEnd: (v: string) => void;
  workDays: number[];
  onToggleWorkDay: (day: number) => void;
  homeLocation: string;
  setHomeLocation: (value: string) => void;
  onHomeSelected: (result: { formattedAddress: string; lat: number; lng: number }) => void;
  workLocation: string;
  setWorkLocation: (value: string) => void;
  onWorkSelected: (result: { formattedAddress: string; lat: number; lng: number }) => void;
  onboardSaving: boolean;
  onComplete: () => void;
}) {
  const {
    workStart, setWorkStart, workEnd, setWorkEnd, workDays, onToggleWorkDay,
    homeLocation, setHomeLocation, onHomeSelected,
    workLocation, setWorkLocation, onWorkSelected,
    onboardSaving, onComplete,
  } = props;

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-eyebrow">Welcome to Dokkit</div>
        <h1 className="auth-title">Let's get set up</h1>
        <p className="auth-sub">
          Dokkit is a personal thinking tool that understands time — a digital sticky note,
          not a productivity scoreboard. Add what's on your plate with a rough time estimate,
          and Dokkit shows you what realistically fits before your day runs out.
        </p>

        <div className="settings-panel-title" style={{ marginBottom: 'var(--space-2)' }}>Work hours</div>
        <div className="settings-row">
          <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
          <span>to</span>
          <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
        </div>

        <span className="settings-label" style={{ display: 'block', marginTop: 'var(--space-3)' }}>Work days</span>
        <div className="day-toggle-row" style={{ marginTop: 'var(--space-2)' }}>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d.value}
              className={workDays.includes(d.value) ? 'day-toggle-btn active' : 'day-toggle-btn'}
              onClick={() => onToggleWorkDay(d.value)}
              aria-label={d.label}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="settings-panel-title" style={{ marginTop: 'var(--space-5)', marginBottom: 'var(--space-2)' }}>Base locations <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>(optional)</span></div>
        <span className="settings-label">Home</span>
        <LocationAutocomplete
          value={homeLocation}
          placeholder="Home address"
          onChange={setHomeLocation}
          onPlaceSelected={onHomeSelected}
        />
        <span className="settings-label" style={{ display: 'block', marginTop: 'var(--space-3)' }}>Work / office</span>
        <LocationAutocomplete
          value={workLocation}
          placeholder="Work address"
          onChange={setWorkLocation}
          onPlaceSelected={onWorkSelected}
        />

        <button
          className="btn btn-steel"
          style={{ width: '100%', marginTop: 'var(--space-5)' }}
          onClick={onComplete}
          disabled={onboardSaving}
        >
          {onboardSaving ? 'Setting up…' : "Let's go"}
        </button>
        <p style={{ fontSize: 12, color: 'var(--ink-faint)', textAlign: 'center', marginTop: 'var(--space-2)' }}>
          You can change these anytime in Settings.
        </p>
      </div>
    </div>
  );
}
