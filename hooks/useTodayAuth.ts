'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { HAS_SIGNED_IN_KEY } from '@/lib/taskTypes';
import { useAuth } from '@/lib/auth/AuthContext';

/**
 * Today auth UX: session comes from AuthProvider (layout boundary).
 * Form state for AuthScreen stays here so non-Today surfaces stay lean.
 */
export function useTodayAuth() {
  const { session, setSession, authReady } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [signInError, setSignInError] = useState('');
  const [hasSignedInBefore, setHasSignedInBefore] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [signingInWithGoogle, setSigningInWithGoogle] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHasSignedInBefore(window.localStorage.getItem(HAS_SIGNED_IN_KEY) === 'true');
    }
  }, []);

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault();
    setSignInError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setSignInError(error.message);
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setSignInError('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}`,
    });
    if (error) {
      setSignInError(error.message);
      return;
    }
    setForgotPasswordSent(true);
  }

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    setSignInError('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}` },
    });
    if (error) {
      setSignInError(
        'Could not send a sign-in link. Please check the email address and try again.'
      );
      return;
    }
    setMagicLinkSent(true);
  }

  async function signInWithGoogle() {
    setSigningInWithGoogle(true);
    setSignInError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}` },
    });
    if (error) {
      setSignInError('Failed to sign in with Google.');
      setSigningInWithGoogle(false);
    }
  }

  return {
    session,
    setSession,
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
  };
}
