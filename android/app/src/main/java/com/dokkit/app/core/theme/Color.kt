package com.dokkit.app.core.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance

/**
 * Dokkit color tokens, ported from the web app's design system
 * (app/globals.css :root and [data-theme="dark"]).
 *
 * Dark-mode philosophy (mirrors the web):
 *  - Base surfaces: paper becomes the deep base, paperRaised one step
 *    lighter for the page/card layering.
 *  - Accent fills (steel, moss, hazard, danger, overflow) are deliberately
 *    NOT brightened in dark mode — they stay saturated because they hold
 *    white text at 4.5:1+ already. Brightening them would break contrast.
 *  - Only the wash backgrounds and the text-only accent variants change.
 *  - Every accent the app draws as *text* must use the dedicated
 *    xxxText token, never the fill directly.
 *
 * Contrast rule (the single most important one): **text colour follows the
 * surface, not the global theme**. Dark mode means the *surface* changes.
 * A genuinely light surface (e.g. a fixed-white raised card, or the glass
 * sheet in the light theme) must always carry dark ink text, even while
 * the rest of the app is dark. [DokkitColors.contrastFor] is the one
 * authority for "what text colour sits on this surface"; screens never
 * pick text colours by hand based on the mode.
 */
@Immutable
data class DokkitColors(
    val paper: Color,
    val paperRaised: Color,
    val ink: Color,
    val inkSoft: Color,
    val inkFaint: Color,
    val line: Color,
    val lineStrong: Color,
    val steel: Color,
    val steelDark: Color,
    val steelWash: Color,
    val steelText: Color,
    val hazard: Color,
    val hazardWash: Color,
    val hazardText: Color,
    val danger: Color,
    val dangerDark: Color,
    val dangerWash: Color,
    val dangerText: Color,
    val moss: Color,
    val mossWash: Color,
    val mossText: Color,
    val overflow: Color,
    val overflowWash: Color,
    val glass: Color,
    val markerDefault: Color,
) {
    /** ink tinted by alpha, matching the web's rgba(shadow-rgb, …). */
    fun inkWithAlpha(alpha: Float): Color = ink.copy(alpha = alpha)

    /**
     * The text colour to use on [surface]. This is luminance-based, so it is
     * immune to theme confusion: a light surface always yields dark text and
     * a dark surface always yields light text, regardless of which mode is
     * active. Bright accents also resolve here — a steel fill is bright
     * enough to demand white text while steelWash (light blue) demands dark.
     */
    fun contrastFor(surface: Color): Color =
        if (surface.luminance() > 0.5f) ink else ink.copy(alpha = 1f).let { Color(0xFFF1EFE6) }

    /** The dark text colour for light surfaces — same value in both themes. */
    val inkOnLight: Color = Color(0xFF1A2933)

    /** The light text colour for dark surfaces — the cream ink. */
    val inkOnDark: Color = Color(0xFFF1EFE6)
}

/** Light theme — the unmarked default, matching :root. */
val LightDokkitColors = DokkitColors(
    paper = Color(0xFFF1EFE6),
    paperRaised = Color(0xFFFFFFFF),
    ink = Color(0xFF1A2933),
    inkSoft = Color(0xFF4F606A),
    inkFaint = Color(0xFF93A3AB),
    line = Color(0xFFDDD7C6),
    lineStrong = Color(0xFFC4BCA5),
    steel = Color(0xFF2451D4),
    steelDark = Color(0xFF1B3DA1),
    steelWash = Color(0xFFD7DFF7),
    steelText = Color(0xFF1B3DA1),
    hazard = Color(0xFFB45309),
    hazardWash = Color(0xFFF2E0D3),
    hazardText = Color(0xFFB45309),
    danger = Color(0xFFDC2626),
    dangerDark = Color(0xFFB91C1C),
    dangerWash = Color(0xFFF9D8D8),
    dangerText = Color(0xFFB91C1C),
    moss = Color(0xFF15803D),
    mossWash = Color(0xFFD5E8DC),
    mossText = Color(0xFF0F5C2A),
    overflow = Color(0xFF6D28D9),
    overflowWash = Color(0xFFE5D8F8),
    glass = Color(0xFFFFFFFF),
    markerDefault = Color(0xFFFFFFFF),
)

/** Dark theme — [data-theme="dark"]. */
val DarkDokkitColors = DokkitColors(
    paper = Color(0xFF14181F),
    paperRaised = Color(0xFF1C222C),
    ink = Color(0xFFF1EFE6),
    inkSoft = Color(0xFFA7B3BA),
    inkFaint = Color(0xFF8A939C),
    line = Color(0xFF2A313B),
    lineStrong = Color(0xFF3A4450),
    steel = Color(0xFF2451D4),
    steelDark = Color(0xFF1B3DA1),
    steelWash = Color(0xFF1F2C4D),
    steelText = Color(0xFF83A3F0),
    hazard = Color(0xFFB45309),
    hazardWash = Color(0xFF3D2A18),
    hazardText = Color(0xFFE08A3C),
    danger = Color(0xFFDC2626),
    dangerDark = Color(0xFFB91C1C),
    dangerWash = Color(0xFF3D1F1E),
    dangerText = Color(0xFFF0645C),
    moss = Color(0xFF15803D),
    mossWash = Color(0xFF1A3324),
    mossText = Color(0xFF6EE7A8),
    overflow = Color(0xFFA78BFA),
    overflowWash = Color(0xFF2E2150),
    glass = Color(0xFF14181F),
    markerDefault = Color(0xFF1C222C),
)