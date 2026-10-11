package com.dokkit.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.dokkit.app.core.theme.DokkitTheme
import com.dokkit.app.core.theme.DokkitThemePreference
import com.dokkit.app.core.theme.rememberDokkitThemeState
import com.dokkit.app.data.auth.AuthRepository
import com.dokkit.app.data.remote.SupabaseFactory
import com.dokkit.app.navigation.DokkitNavHost
import com.dokkit.app.ui.auth.AuthScreen
import io.github.jan.supabase.auth.status.SessionStatus

/**
 * Root owns theme, auth gating, and the navigation shell. No feature screen
 * is rendered against anonymous/unresolved state; data access still relies
 * on Supabase RLS for tenant isolation.
 */
@Composable
fun DokkitRoot(
    initialTheme: DokkitThemePreference = DokkitThemePreference.System,
) {
    val themeState = rememberDokkitThemeState(initialTheme)
    val app = LocalContext.current.applicationContext as DokkitApp
    val authRepository = remember(app) {
        AuthRepository(app, app.supabaseFactory)
    }
    val sessionStatus by authRepository.sessionStatus.collectAsState(
        initial = SessionStatus.Initializing,
    )

    DokkitTheme(theme = themeState.preference) {
        when (sessionStatus) {
            is SessionStatus.Initializing -> Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }
            is SessionStatus.Authenticated -> DokkitNavHost(
                themeState = themeState,
                supabaseFactory = app.supabaseFactory,
            )
            is SessionStatus.NotAuthenticated,
            is SessionStatus.RefreshFailure -> AuthScreen(repository = authRepository)
        }
    }
}
