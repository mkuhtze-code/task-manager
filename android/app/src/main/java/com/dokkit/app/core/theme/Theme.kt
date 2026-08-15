package com.dokkit.app.core.theme

import android.content.res.Configuration
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp

/**
 * User's theme preference. Mirrors the web app's user_settings.theme and
 * local dokkit-theme semantics: 'system' (default), 'light', 'dark'.
 */
enum class DokkitThemePreference {
    System,
    Light,
    Dark,
}

/**
 * The Dokkit theme. Wraps Material 3 as the underlying component system
 * while supplying the Dokkit token sets through composition locals.
 *
 * Contrast safety:
 *  - Text is rendered with the *ink* / *inkSoft* tokens everywhere. The
 *    M3 scheme's `onSurface` / `onBackground` slots are bound to ink, so
 *    any M3 surface-backed text automatically picks the correct contrast
 *    color — in light mode paperRaised is white and ink is dark; in dark
 *    mode paperRaised is near-black and ink is cream. The web app's
 *    dark-mode white-on-white mistake structurally cannot happen here.
 *  - Accent fills stay saturated in both themes (they hold white text at
 *    4.5:1+); accent *text* always uses the dedicated xxxText tokens.
 */
@Composable
fun DokkitTheme(
    theme: DokkitThemePreference = DokkitThemePreference.System,
    content: @Composable () -> Unit,
) {
    val effectiveDark = when (theme) {
        DokkitThemePreference.System -> isSystemInDarkMode()
        DokkitThemePreference.Light -> false
        DokkitThemePreference.Dark -> true
    }

    val colors = if (effectiveDark) DarkDokkitColors else LightDokkitColors
    val material = if (effectiveDark) DarkMaterialScheme else LightMaterialScheme
    val typography = toMaterialTypography(DokkitTypography())

    CompositionLocalProvider(
        LocalDokkitColors provides colors,
        LocalDokkitTypography provides DokkitTypography(),
        LocalDokkitDimens provides DefaultDokkitDimens,
    ) {
        MaterialTheme(
            colorScheme = material,
            typography = typography,
            shapes = DokkitShapes,
            content = content,
        )
    }
}

// -- Composition locals ---------------------------------------------------

val LocalDokkitColors = staticCompositionLocalOf { LightDokkitColors }

/**
 * Convenience accessor mirroring MaterialTheme.dokkit.colors. Expects a
 * DokkitTheme above in the tree.
 */
object DokkitTheme {
    val colors: DokkitColors
        @Composable
        @ReadOnlyComposable
        get() = LocalDokkitColors.current

    val typography: DokkitTypography
        @Composable
        @ReadOnlyComposable
        get() = LocalDokkitTypography.current

    val dimens: DokkitDimens
        @Composable
        @ReadOnlyComposable
        get() = LocalDokkitDimens.current
}

// -- Material 3 bridge ----------------------------------------------------

private val LightMaterialScheme = lightColorScheme(
    primary = LightDokkitColors.steel,
    onPrimary = Color.White,
    primaryContainer = LightDokkitColors.steelWash,
    onPrimaryContainer = LightDokkitColors.steelDark,
    secondary = LightDokkitColors.moss,
    onSecondary = Color.White,
    secondaryContainer = LightDokkitColors.mossWash,
    onSecondaryContainer = LightDokkitColors.mossText,
    tertiary = LightDokkitColors.overflow,
    onTertiary = Color.White,
    tertiaryContainer = LightDokkitColors.overflowWash,
    onTertiaryContainer = LightDokkitColors.overflow,
    error = LightDokkitColors.danger,
    onError = Color.White,
    errorContainer = LightDokkitColors.dangerWash,
    onErrorContainer = LightDokkitColors.dangerText,
    background = LightDokkitColors.paper,
    onBackground = LightDokkitColors.ink,
    surface = LightDokkitColors.paperRaised,
    onSurface = LightDokkitColors.ink,
    surfaceVariant = LightDokkitColors.paper,
    onSurfaceVariant = LightDokkitColors.inkSoft,
    outline = LightDokkitColors.lineStrong,
    outlineVariant = LightDokkitColors.line,
)

private val DarkMaterialScheme = darkColorScheme(
    primary = DarkDokkitColors.steel,
    onPrimary = Color.White,
    primaryContainer = DarkDokkitColors.steelWash,
    onPrimaryContainer = DarkDokkitColors.steelText,
    secondary = DarkDokkitColors.moss,
    onSecondary = Color.White,
    secondaryContainer = DarkDokkitColors.mossWash,
    onSecondaryContainer = DarkDokkitColors.mossText,
    tertiary = DarkDokkitColors.overflow,
    onTertiary = Color.White,
    tertiaryContainer = DarkDokkitColors.overflowWash,
    onTertiaryContainer = DarkDokkitColors.overflow,
    error = DarkDokkitColors.danger,
    onError = Color.White,
    errorContainer = DarkDokkitColors.dangerWash,
    onErrorContainer = DarkDokkitColors.dangerText,
    background = DarkDokkitColors.paper,
    onBackground = DarkDokkitColors.ink,
    surface = DarkDokkitColors.paperRaised,
    onSurface = DarkDokkitColors.ink,
    surfaceVariant = DarkDokkitColors.paper,
    onSurfaceVariant = DarkDokkitColors.inkSoft,
    outline = DarkDokkitColors.lineStrong,
    outlineVariant = DarkDokkitColors.line,
)

/** Map the Dokkit type styles onto M3's slots so Material components
 *  (buttons, sheets, chips) inherit the same voice. */
private fun toMaterialTypography(t: DokkitTypography): Typography = Typography(
    displayLarge = t.displayMedium,
    displayMedium = t.displayMedium,
    displaySmall = t.displaySmall,
    headlineLarge = t.displaySmall,
    headlineMedium = t.displaySmall,
    headlineSmall = t.bodyStrong,
    titleLarge = t.bodyStrong,
    titleMedium = t.bodyStrong,
    titleSmall = t.metadata,
    bodyLarge = t.body,
    bodyMedium = t.body,
    bodySmall = t.metadata,
    labelLarge = t.bodyStrong,
    labelMedium = t.metadata,
    labelSmall = t.overline,
)

@Composable
private fun isSystemInDarkMode(): Boolean =
    LocalConfiguration.current.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
        Configuration.UI_MODE_NIGHT_YES

private val DokkitShapes = Shapes(
    extraSmall = RoundedCornerShape(DefaultDokkitDimens.radiusSm),
    small = RoundedCornerShape(DefaultDokkitDimens.radiusMd),
    medium = RoundedCornerShape(DefaultDokkitDimens.radiusLg),
    large = RoundedCornerShape(DefaultDokkitDimens.radiusLg),
    extraLarge = RoundedCornerShape(28.dp),
)