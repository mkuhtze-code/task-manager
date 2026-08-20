package com.dokkit.app.core.control

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dokkit.app.core.icon.DokkitIcon
import com.dokkit.app.core.icon.DokkitIcons
import com.dokkit.app.core.theme.DokkitTheme
import com.dokkit.app.core.theme.DokkitType

// ── FAB ─────────────────────────────────────────────────────────────────

/**
 * The capture FAB (web .capture-fab): a steel circle floating above the
 * list, quiet by being the only splash of fill on the surface. No elevation
 * bloat — just the mark, a soft shadow, and a gentle press scale.
 */
@Composable
fun DokkitFab(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: androidx.compose.ui.graphics.vector.ImageVector = DokkitIcons.Plus,
    contentDescription: String = "Add",
) {
    val colors = DokkitTheme.colors
    var pressed by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.94f else 1f,
        animationSpec = spring(dampingRatio = 0.7f, stiffness = 300f),
        label = "fabScale",
    )
    Box(
        modifier = modifier
            .size(56.dp)
            .scale(scale)
            .background(colors.steel, CircleShape)
            .clickable {
                pressed = true
                onClick()
            },
        contentAlignment = Alignment.Center,
    ) {
        DokkitIcon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = Color.White,
            modifier = Modifier.size(24.dp),
        )
    }
}

// ── Compact toggle ──────────────────────────────────────────────────────

/**
 * Dokkit segmented/toggle — the web's .day-toggle-btn. Round when
 * [pill=false] (3-4 tiny day circles), otherwise a labeled pill that fits
 * text. Active = steel fill + white; inactive = paper + ink-soft text with a
 * hairline border.
 */
@Composable
fun DokkitToggle(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    pill: Boolean = false,
    enabled: Boolean = true,
) {
    val colors = DokkitTheme.colors
    val shape = CircleShape
    if (pill) {
        Row(
            modifier = modifier
                .height(34.dp)
                .background(if (selected) colors.steel else colors.paper, shape)
                .then(
                    if (!selected)
                        Modifier.border(
                            width = 1.dp,
                            color = colors.lineStrong,
                            shape = shape,
                        )
                    else Modifier
                )
                .clickable(enabled = enabled, role = Role.RadioButton, onClick = onClick)
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BasicText(
                text = label,
                style = DokkitType.caption.copy(
                    color = if (selected) Color.White else colors.inkSoft,
                    fontWeight = FontWeight.Bold,
                ),
            )
        }
    } else {
        Box(
            modifier = modifier
                .size(34.dp)
                .background(if (selected) colors.steel else colors.paper, shape)
                .then(
                    if (!selected)
                        Modifier.border(
                            width = 1.dp,
                            color = colors.lineStrong,
                            shape = shape,
                        )
                    else Modifier
                )
                .clickable(enabled = enabled, role = Role.RadioButton, onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            BasicText(
                text = label,
                style = DokkitType.caption.copy(
                    color = if (selected) Color.White else colors.inkSoft,
                    fontWeight = FontWeight.Bold,
                ),
            )
        }
    }
}

// ── Tag ─────────────────────────────────────────────────────────────────

/**
 * Quiet tag (web .tag): tiny, mono for numbers, coloured wash for status.
 * A tag is a data point, not a badge — no icon chrome, minimal footprint.
 */
@Composable
fun DokkitTag(
    text: String,
    modifier: Modifier = Modifier,
    mono: Boolean = false,
    wash: Color? = null,
    textColor: Color? = null,
) {
    val colors = DokkitTheme.colors
    Row(
        modifier = modifier
            .background(wash ?: colors.paper, RoundedCornerShape(20.dp))
            .then(
                if (wash == null)
                    Modifier.border(1.dp, colors.inkWithAlpha(0.05f), RoundedCornerShape(20.dp))
                else Modifier
            )
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicText(
            text = text,
            style = (if (mono) DokkitType.monoMicro else DokkitType.overline).copy(
                color = textColor ?: colors.inkSoft,
                fontWeight = FontWeight.Bold,
            ),
        )
    }
}

// ── Progress ────────────────────────────────────────────────────────────

/**
 * Hairline progress (web .task-progress-track/fill): a 4dp rounded track
 * with a steel fill. Quiet — no percentage text baked in; the fill is drawn
 * to a live fraction so it can animate as a timer ticks.
 */
@Composable
fun DokkitProgress(
    fraction: Float,
    modifier: Modifier = Modifier,
    track: Color? = null,
    fill: Color? = null,
) {
    val colors = DokkitTheme.colors
    val trackColor = track ?: colors.line
    val fillColor = fill ?: colors.steel
    val bounded = fraction.coerceIn(0f, 1f)
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(4.dp),
    ) {
        val r = this.size.height / 2
        drawRoundRect(
            color = trackColor,
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(r, r),
        )
        if (bounded > 0f) {
            drawRoundRect(
                color = fillColor,
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(r, r),
                size = androidx.compose.ui.geometry.Size(this.size.width * bounded, this.size.height),
            )
        }
    }
}