package com.dokkit.app.core.surface

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.dokkit.app.core.theme.DokkitColors
import com.dokkit.app.core.theme.DokkitTheme

/**
 * Dokkit's surface vocabulary. Not a family of "cards" — Dokkit has a
 * handful of intentional primitives and everything else is built from
 * them. Prefer hairlines and spacing over borders and shadows.
 *
 * Surface kinds:
 *  - [Page]: the app background (paper). No chrome.
 *  - [Raised]: paper-raised, a step above the page (cards, task rows).
 *  - [Hairline]: raised surface with a hairline border — the default
 *    "more than the page, less than a card".
 *  - [Glass]: the frosted sheet surface (capture sheet, today header).
 *  - [Wash]: a filled, flat tint (accent washes, chips, pressed states).
 *  - [Inline]: an inline control surface (input wells, drag handles).
 *
 * All kinds resolve their colours from the active [DokkitColors] at draw
 * time, so light/dark tokens are always one place away.
 */
sealed interface DokkitSurface {
    /** Corner radius. */
    val radius: Dp

    /** Resolve background + optional hairline border for [colors]. */
    fun background(colors: DokkitColors): Color
    fun border(colors: DokkitColors): Color?

    /** Page — the app background (paper). No chrome. */
    data class Page(override val radius: Dp = 0.dp) : DokkitSurface {
        override fun background(colors: DokkitColors) = colors.paper
        override fun border(colors: DokkitColors): Color? = null
    }

    /** Raised — paper-raised, a step above the page. */
    data class Raised(override val radius: Dp = 0.dp) : DokkitSurface {
        override fun background(colors: DokkitColors) = colors.paperRaised
        override fun border(colors: DokkitColors): Color? = null
    }

    /** Hairline — raised surface with a hairline border only. */
    data class Hairline(
        override val radius: Dp = 0.dp,
        val customBorder: Color? = null,
    ) : DokkitSurface {
        override fun background(colors: DokkitColors) = colors.paperRaised
        override fun border(colors: DokkitColors): Color? =
            customBorder ?: colors.inkWithAlpha(0.055f)
    }

    /** Glass — the frosted sheet surface. */
    data class Glass(override val radius: Dp = 0.dp) : DokkitSurface {
        override fun background(colors: DokkitColors) = colors.glass
        override fun border(colors: DokkitColors): Color? = null
    }

    /** Wash — a flat tint (accent washes, chips, pressed states). */
    data class Wash(
        val wash: Color? = null,
        override val radius: Dp = 0.dp,
        val customBorder: Color? = null,
    ) : DokkitSurface {
        override fun background(colors: DokkitColors) = wash ?: colors.paperRaised
        override fun border(colors: DokkitColors): Color? =
            customBorder ?: colors.inkWithAlpha(0.04f)
    }

    /** Inline control surface (quiet well): page-colored, on raised parents. */
    data class Inline(override val radius: Dp = 0.dp) : DokkitSurface {
        override fun background(colors: DokkitColors) = colors.paper
        override fun border(colors: DokkitColors): Color? = colors.line
    }
}

/**
 * Applies a Dokkit [surface] to [Modifier]. Resolves the surface's colors
 * from the active theme and paints background + optional hairline border
 * with the surface's corner radius. Surfaces stay flat — elevation, where
 * genuinely needed (the FAB, sheets), is applied by the owning control, not
 * baked into every surface.
 */
@Composable
fun Modifier.dokkitSurface(surface: DokkitSurface): Modifier = composed {
    val colors = DokkitTheme.colors
    val shape: Shape = if (surface.radius > 0.dp) {
        RoundedCornerShape(surface.radius)
    } else {
        RectangleShape
    }
    var mod = this@composed
    mod = mod.background(surface.background(colors), shape)
    val borderColor = surface.border(colors)
    if (borderColor != null) {
        mod = mod.border(BorderStroke(1.dp, borderColor), shape)
    }
    mod
}