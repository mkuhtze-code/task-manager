package com.dokkit.app.data.auth

import android.content.Context
import android.content.Intent
import com.dokkit.app.data.remote.SupabaseFactory
import io.github.jan.supabase.auth.handleDeeplinks
import io.github.jan.supabase.auth.providers.Google
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.providers.builtin.OTP
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.Flow

/**
 * Single source of truth for authentication, so no feature screen ever
 * talks to Supabase auth directly. This is the foundation the full auth
 * experience (email/password, magic link, Google OAuth, session
 * persistence, sign out, restoration) will be built on.
 *
 * supabase-kt's Auth plugin handles session persistence and refresh for
 * us. On Android, OAuth/OTP callbacks arrive through deeplinks; the
 * app's entry activity routes them to [handleDeeplink].
 */
class AuthRepository(
    private val appContext: Context,
    private val supabase: SupabaseFactory,
) {

    /** Stream of session states: Initializing → Authenticated/NotAuthenticated. */
    val sessionStatus: Flow<SessionStatus> = supabase.auth.sessionStatus

    suspend fun signInWithEmailAndPassword(email: String, password: String) {
        supabase.auth.signInWith(Email) {
            this.email = email.trim()
            this.password = password
        }
    }

    /** Magic link / OTP — mirrors the web app's shouldCreateUser: false gate. */
    suspend fun signInWithMagicLink(email: String) {
        supabase.auth.signInWith(OTP) {
            this.email = email.trim()
            createUser = false
        }
    }

    suspend fun signInWithGoogle() {
        supabase.auth.signInWith(Google)
    }

    suspend fun signOut() {
        supabase.auth.signOut()
    }

    /** Restores a persisted session (fresh launch, cold start). */
    suspend fun restoreSession() {
        // supabase-kt auto-loads the persisted session from storage on
        // init; this hook exists so a future launch flow can await the
        // first Authenticated/NotAuthenticated emission explicitly.
    }

    /** Forwards a deeplink intent (OAuth or OTP callback) to Supabase. */
    @Suppress("OVERRIDE_DEPRECATION")
    fun handleDeeplink(intent: Intent) {
        supabase.supabase.handleDeeplinks(intent)
    }
}