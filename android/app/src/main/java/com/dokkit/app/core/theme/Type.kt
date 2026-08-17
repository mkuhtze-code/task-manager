package com.dokkit.app.core.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp

/**
 * Dokkit typography, ported from the web app's type scale.
 *
 * UI text uses the platform sans (the web uses Inter; the Android system
 * sans is a close metric-compatible stand-in). The web's Space Mono /
 * JetBrains Mono roles collapse into the platform monospace so that only
 * the two places Dokkit actually means "numeric/digital" (durations,
 * capacity numerals, countdowns) use mono — normal UI text stays sans.
 *
 * Mono styles carry tabular numerals (font-variant-numeric: tabular-nums
 * in the web) so elapsed/estimate numbers align as they tick.
 *
 * Hierarchy comes from weight and spacing, not font size — Dokkit avoids
 * large headings.
 */
object DokkitType {

    private const val TNUM = "tnum 1"

    /** Body — task text weight is 600 (web: 600 / semibold). */
    val body = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp,
        letterSpacing = 0.1.sp,
    )

    /** Strong inline labels — task names, section leaders. */
    val bodyStrong = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 22.sp,
        letterSpacing = -0.1.sp,
    )

    /** Secondary text — meta lines, dimmed descriptions. */
    val metadata = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 13.sp,
        lineHeight = 18.sp,
    )

    /** Small labels — reveal meta, activity meta. */
    val caption = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
    )

    /** Tiny overline labels — settings labels, stat labels. */
    val overline = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Bold,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.4.sp,
    )

    /** Stat label under a numeral — like the web's 10px uppercase caps. */
    val statLabel = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Bold,
        fontSize = 10.sp,
        lineHeight = 12.sp,
        letterSpacing = 0.6.sp,
        textAlign = TextAlign.Center,
    )

    // Headings — deliberately restrained. displaySmall is the loudest
    // thing in the app and stays 21sp; displayMedium is for empty
    // states/landing moments only.
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
        fontFeatureSettings = TNUM,
    )

    val monoBody = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 18.sp,
        fontFeatureSettings = TNUM,
    )

    /** The capacity numeral voice — 15sp monospace, holds the numbers. */
    val monoDigit = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 18.sp,
        fontFeatureSettings = TNUM,
    )

    /** Lead numeral — the trip-lead countdown / header compare number. */
    val monoDisplay = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Bold,
        fontSize = 24.sp,
        lineHeight = 26.sp,
        letterSpacing = 0.4.sp,
        fontFeatureSettings = TNUM,
    )

    /** Leg connector label — 10sp mono, quiet, tabular. */
    val monoMicro = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Bold,
        fontSize = 10.sp,
        lineHeight = 12.sp,
        letterSpacing = 0.2.sp,
        fontFeatureSettings = TNUM,
    )
}

@Immutable
data class DokkitTypography(
    val body: TextStyle = DokkitType.body,
    val bodyStrong: TextStyle = DokkitType.bodyStrong,
    val metadata: TextStyle = DokkitType.metadata,
    val caption: TextStyle = DokkitType.caption,
    val overline: TextStyle = DokkitType.overline,
    val statLabel: TextStyle = DokkitType.statLabel,
    val displaySmall: TextStyle = DokkitType.displaySmall,
    val displayMedium: TextStyle = DokkitType.displayMedium,
    val monoCaption: TextStyle = DokkitType.monoCaption,
    val monoBody: TextStyle = DokkitType.monoBody,
    val monoDigit: TextStyle = DokkitType.monoDigit,
    val monoDisplay: TextStyle = DokkitType.monoDisplay,
    val monoMicro: TextStyle = DokkitType.monoMicro,
)

val LocalDokkitTypography = staticCompositionLocalOf { DokkitTypography() }