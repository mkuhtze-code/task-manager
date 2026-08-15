package com.dokkit.app

import androidx.compose.runtime.Composable
import com.dokkit.app.core.theme.DokkitTheme
import com.dokkit.app.core.theme.DokkitThemePreference
import com.dokkit.app.navigation.DokkitNavHost

/**
 * Root composable: wires the theme and the auth-gated navigation shell.
 * Later this becomes the place where the session stream decides between
 * AuthScreen and the main DokkitNavHost — for the foundation stage the
 * nav shell renders directly so the skeleton is visible and buildable.
 */
@Composable
fun DokkitRoot(
    themePreference: DokkitThemePreference = DokkitThemePreference.System,
) {
    DokkitTheme(theme = themePreference) {
        DokkitNavHost()
    }
}