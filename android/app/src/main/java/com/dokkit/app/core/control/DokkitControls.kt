package com.dokkit.app.core.control

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.dokkit.app.core.icon.DokkitIcon
import com.dokkit.app.core.icon.DokkitIcons
import com.dokkit.app.core.theme.DokkitTheme
import com.dokkit.app.core.theme.DokkitType

/**
 * Dokkit's restrained control set. Each control overrides whatever Material
 * chrome would otherwise leak through (elevation, tonal defaults, min
 * heights) in favour of Dokkit's quiet grammar: hairlines, flat fills,
 * deliberately ranked emphasis.
 */

// ── Buttons ─────────────────────────────────────────────────────────────

/** Variants in Dokkit's button family. */
enum class DokkitButtonVariant {
    /** steel fill, white text — the ONE primary action per surface. */
    Steel,
    /** Quiet bordered — secondary, on-card actions. */
    Ghost,
    /** No chrome at all — text with weight, for tertiary/utility actions. */
    Inline,
}

@Composable
fun DokkitButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: DokkitButtonVariant = DokkitButtonVariant.Steel,
    enabled: Boolean = true,
    icon: @Composable (() -> Unit)? = null,
) {
    val colors = DokkitTheme.colors
    val (bg, fg, border) = when (variant) {
        DokkitButtonVariant.Steel -> Triple(colors.steel, Color.White, null)
        DokkitButtonVariant.Ghost -> Triple(colors.paper, colors.ink, colors.lineStrong)
        DokkitButtonVariant.Inline -> Triple(Color.Transparent, colors.inkSoft, null)
    }
    val shape = CircleShape
    Row(
        modifier = modifier
            .height(42.dp)
            .then(
                if (bg == Color.Transparent) Modifier
                else Modifier.background(if (enabled) bg else colors.line, shape)
            )
            .then(
                if (border != null) Modifier.border(BorderStroke(1.dp, border), shape) else Modifier
            )
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
    ) {
        if (icon != null) {
            icon.invoke()
            Spacer(Modifier.width(8.dp))
        }
        BasicText(
            text = text,
            style = DokkitType.bodyStrong.copy(
                color = if (enabled) fg else colors.inkFaint,
            ),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** Quiet text-only button — the web's .btn-text. */
@Composable
fun DokkitTextButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    color: Color? = null,
) {
    BasicText(
        text = text,
        modifier = modifier
            .height(40.dp)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 8.dp),
        style = DokkitType.metadata.copy(
            color = color ?: DokkitTheme.colors.inkSoft,
            fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
        ),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

/** Round icon button — the web's .gear-btn / .icon-btn. */
@Composable
fun DokkitIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 34.dp,
    tint: Color = DokkitTheme.colors.inkSoft,
    enabled: Boolean = true,
) {
    Box(
        modifier = modifier
            .size(size)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        DokkitIcon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = tint,
            modifier = Modifier.size(20.dp),
        )
    }
}

// ── Completion check ────────────────────────────────────────────────────

/**
 * The completion control (web CheckIcon + .check-btn): a bare circle that
 * fills moss and draws a check in with a stroke animation. No splash, no
 * padding bubble — it IS the row's marker.
 */
@Composable
fun DokkitCheck(
    done: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = DokkitTheme.colors
    // 1.0 = drawn, 0.0 = not. Animate both fill and the check dashoffset.
    val progress by animateFloatAsState(
        targetValue = if (done) 1f else 0f,
        animationSpec = spring(dampingRatio = 0.7f, stiffness = 120f),
        label = "checkProgress",
    )
    Box(
        modifier = modifier
            .size(26.dp)
            .clickable(enabled = enabled, role = Role.Checkbox, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.size(22.dp)) {
            val stroke = 1.6.dp.toPx()
            val r = this.size.minDimension / 2 - stroke / 2
            // Circle outline — line-strong when undone, moss fill when done.
            if (progress < 1f) {
                drawCircle(
                    color = colors.lineStrong,
                    radius = r,
                    center = center,
                    style = Stroke(width = stroke),
                )
                // Fill fades in.
                drawCircle(
                    color = colors.moss,
                    radius = r * progress,
                    center = center,
                )
            } else {
                drawCircle(color = colors.moss, radius = r, center = center)
                val checkColor = Color.White
                // Check mark — path: (5.3,9.3)->(7.7,11.8)->(12.7,6) on 18 grid.
                val scale = this.size.minDimension / 18f
                val p1 = Offset(5.3f * scale, 9.3f * scale)
                val p2 = Offset(7.7f * scale, 11.8f * scale)
                val p3 = Offset(12.7f * scale, 6f * scale)
                val len1 = (p2 - p1).getDistance()
                val len2 = (p3 - p2).getDistance()
                val dashLen = (len1 + len2) * progress
                val strokeW = 1.6.dp.toPx()
                // Draw segment-by-segment with dash.
                drawLine(
                    color = checkColor,
                    start = p1,
                    end = p2,
                    strokeWidth = strokeW,
                    cap = StrokeCap.Round,
                )
                // Second segment clipped by progress beyond first.
                if (dashLen > len1) {
                    val t = (dashLen - len1) / len2
                    drawLine(
                        color = checkColor,
                        start = p2,
                        end = p3,
                        strokeWidth = strokeW,
                        cap = StrokeCap.Round,
                        alpha = t.coerceIn(0f, 1f),
                    )
                }
            }
        }
    }
}