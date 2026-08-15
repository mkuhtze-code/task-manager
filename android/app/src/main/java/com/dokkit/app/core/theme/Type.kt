package com.dokkit.app.core.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Dokkit typography, ported from the web app's type scale.
 *
 * UI text uses the platform sans (the web uses Inter; the Android system
 * sans is a close metric-compatible stand-in). The web's Space Mono /
 * JetBrains Mono roles collapse into the platform monospace so that only
 * the two places Dokkit actually means "numeric/digital" (durations,
 * capacity numerals, countdowns) use mono — normal UI text stays sans.
 */
object DokkitType {

    // Web scale: --text-2xs 11 / xs 12 / sm 13 / base 15 / md 17 / lg 20.
    val body = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp,
        letterSpacing = 0.1.sp,
    )

    val bodyStrong = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 22.sp,
        letterSpacing = 0.1.sp,
    )

    val metadata = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 13.sp,
        lineHeight = 18.sp,
    )

    val caption = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
    )

    val overline = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Bold,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.4.sp,
    )

    // Headings (--text-display-sm 21 / md 28).
    val displaySmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 21.sp,
        lineHeight = 26.sp,
        letterSpacing = -0.3.sp,
    )

    val displayMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 28.sp,
        lineHeight = 34.sp,
        letterSpacing = -0.5.sp,
    )

    // Mono — durations, capacity numerals, countdowns. Tabular numerals
    // so elapsed/estimate numbers align as they tick.
    val monoCaption = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
    )

    val monoBody = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 18.sp,
    )

    val monoDigit = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.SemiBold,
        fontSize = 17.sp,
        lineHeight = 22.sp,
    )
}

@Immutable
data class DokkitTypography(
    val body: TextStyle = DokkitType.body,
    val bodyStrong: TextStyle = DokkitType.bodyStrong,
    val metadata: TextStyle = DokkitType.metadata,
    val caption: TextStyle = DokkitType.caption,
    val overline: TextStyle = DokkitType.overline,
    val displaySmall: TextStyle = DokkitType.displaySmall,
    val displayMedium: TextStyle = DokkitType.displayMedium,
    val monoCaption: TextStyle = DokkitType.monoCaption,
    val monoBody: TextStyle = DokkitType.monoBody,
    val monoDigit: TextStyle = DokkitType.monoDigit,
)

val LocalDokkitTypography = staticCompositionLocalOf { DokkitTypography() }