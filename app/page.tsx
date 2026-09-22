'use client';

/**
 * Today route entry.
 * Auth is established by AuthProvider in the root layout.
 * This file only gates on authReady / session, then mounts TodayPage.
 */

import { AuthScreen } from '@/components/AuthScreen';
import { TodayPage } from '@/components/today/TodayPage';
import { useTodayAuth } from '@/hooks/useTodayAuth';

export default function Home() {
  const {
    session,
    authReady,
    email,
    setEmail,
    password,
    setPassword,
    magicLinkSent,
    setMagicLinkSent,
    forgotPasswordSent,
    setForgotPasswordSent,
    signInError,
    setSignInError,
    hasSignedInBefore,
    isNewUser,
    setIsNewUser,
    showForgotPassword,
    setShowForgotPassword,
    signingInWithGoogle,
    signInWithPassword,
    handleForgotPassword,
    handleMagicLink,
    signInWithGoogle,
  } = useTodayAuth();

  // Avoid login flash: do not treat session===null as signed-out until ready.
  if (!authReady) {
    return (
      <div
        className="auth-shell"
        aria-busy="true"
        aria-label="Loading"
        style={{ minHeight: '100dvh' }}
      />
    );
  }

  if (!session) {
    return (
      <AuthScreen
        hasSignedInBefore={hasSignedInBefore}
        isNewUser={isNewUser}
        setIsNewUser={setIsNewUser}
        showForgotPassword={showForgotPassword}
        setShowForgotPassword={setShowForgotPassword}
        signingInWithGoogle={signingInWithGoogle}
        onGoogleSignIn={signInWithGoogle}
        signInError={signInError}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        onPasswordSignIn={signInWithPassword}
        onForgotPassword={handleForgotPassword}
        forgotPasswordSent={forgotPasswordSent}
        setForgotPasswordSent={setForgotPasswordSent}
        magicLinkSent={magicLinkSent}
        setMagicLinkSent={setMagicLinkSent}
        onMagicLink={handleMagicLink}
      />
    );
  }

  return <TodayPage />;
}
