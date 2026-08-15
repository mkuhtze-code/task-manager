package com.dokkit.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokkit.app.data.auth.AuthRepository
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** Auth UI state — used by the future full auth experience. */
sealed interface AuthUiState {
    data object Initializing : AuthUiState
    data object SignedOut : AuthUiState
    data object SignedIn : AuthUiState
}

/**
 * Owns the auth state derived from [AuthRepository]'s session stream.
 * Screens observe [state]; the repository owns the actual auth calls.
 * This is the skeleton the full email/password, magic-link and Google
 * flows will hang off — none of the UI is built yet.
 */
class AuthViewModel(
    private val repository: AuthRepository,
) : ViewModel() {

    val state: StateFlow<AuthUiState> = repository.sessionStatus
        .map { status ->
            when (status) {
                is SessionStatus.Initializing -> AuthUiState.Initializing
                is SessionStatus.Authenticated -> AuthUiState.SignedIn
                is SessionStatus.NotAuthenticated -> AuthUiState.SignedOut
                is SessionStatus.RefreshFailure -> AuthUiState.SignedOut
            }
        }
        .stateIn(viewModelScope, SharingStarted.Eagerly, AuthUiState.Initializing)
}