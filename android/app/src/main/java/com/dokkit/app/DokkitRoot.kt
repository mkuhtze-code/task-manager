package com.dokkit.app

import androidx.compose.runtime.Composable
import com.dokkit.app.core.theme.DokkitTheme
import com.dokkit.app.core.theme.DokkitThemePreference
import com.dokkit.app.core.theme.rememberDokkitThemeState
import com.dokkit.app.navigation.DokkitNavHost

/**
 * Root composable: owns the theme preference (light/dark/system) and the
 * navigation shell.
 *
 * Later this becomes the place where the session stream decides between
 * AuthScreen and the main shell — for the foundation stage the shell
 * renders directly so the skeleton is visible and buildable.
 */
@Composable
fun DokkitRoot(
    initialTheme: DokkitThemePreference = DokkitThemePreference.System,
) {
    val themeState = rememberDokkitThemeState(initialTheme)

    DokkitTheme(theme = themeState.preference) {
        DokkitNavHost(themeState = themeState)
    }
}