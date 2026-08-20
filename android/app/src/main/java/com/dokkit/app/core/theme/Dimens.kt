package com.dokkit.app.core.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Spacing and radius scales ported from the web app's --space-* and
 * --radius-* tokens. Theme-independent — structural, not visual.
 */
@Immutable
data class DokkitDimens(
    val space1: Dp = 4.dp,
    val space2: Dp = 8.dp,
    val space3: Dp = 12.dp,
    val space4: Dp = 16.dp,
    val space5: Dp = 20.dp,
    val space6: Dp = 24.dp,
    val space8: Dp = 32.dp,
    val radiusSm: Dp = 8.dp,
    val radiusMd: Dp = 14.dp,
    val radiusLg: Dp = 20.dp,
)

@Immutable
data class DokkitElevation(
    /** Default task-row shadow (light): 0 1px 2px + 0 4px 12px. */
    val rowShadow: List<Dp> = listOf(2.dp, 12.dp),
    /** Soft shadow for lead cards/sheets. */
    val sheetShadow: List<Dp> = listOf(4.dp, 24.dp),
)

/** The app's standard dimension set — used as the default composition. */
val DefaultDokkitDimens = DokkitDimens()

val LocalDokkitDimens = staticCompositionLocalOf { DefaultDokkitDimens }
val LocalDokkitElevation = staticCompositionLocalOf { DokkitElevation() }