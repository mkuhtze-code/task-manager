package com.dokkit.app.core.theme

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.Composable
import androidx.compose.runtime.saveable.rememberSaveable

/**
 * Theme preference holder. Mirrors the web's user_settings.theme model as
 * far as practical: light / dark / system, with system as the default.
 *
 * Stage 2 note: the preference is held in memory (rememberSaveable) and
 * intentionally NOT persisted yet — persistence through user_settings is
 * wired in a later stage when the data layer lands. [DokkitThemeState]
 * is where that wiring will plug in without touching any screens.
 */
@Composable
fun rememberDokkitThemeState(initial: DokkitThemePreference = DokkitThemePreference.System): DokkitThemeState {
    var preference by rememberSaveable { mutableStateOf(initial) }
    return rememberDokkitThemeState(preference) { preference = it }
}

@Composable
fun rememberDokkitThemeState(
    preference: DokkitThemePreference,
    onChange: (DokkitThemePreference) -> Unit,
): DokkitThemeState = DokkitThemeState(preference, onChange)

/** An explicit [DokkitThemePreference] selection plus its change callback. */
data class DokkitThemeState(
    val preference: DokkitThemePreference,
    val onChange: (DokkitThemePreference) -> Unit,
)