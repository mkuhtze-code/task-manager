package com.dokkit.app.core.control

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.dokkit.app.core.icon.DokkitIcon
import com.dokkit.app.core.icon.DokkitIcons
import com.dokkit.app.core.theme.DokkitTheme
import com.dokkit.app.core.theme.DokkitType

/**
 * Progressive disclosure — Dokkit's core interaction pattern. A restful
 * row carries a [DokkitDisclosure_chevron]; tapping it reveals a layered
 * region (web: .task-reveal with the reveal-in keyframe).
 */

/**
 * The thin disclosure chevron. Rotates from pointing-down to pointing-up as
 * [expanded] — mirroring the web's .task-card-chevron.open transform.
 */
@Composable
fun DokkitDisclosureChevron(
    expanded: Boolean,
    modifier: Modifier = Modifier,
    tint: androidx.compose.ui.graphics.Color = DokkitTheme.colors.inkFaint,
) {
    val rotation by animateFloatAsState(
        targetValue = if (expanded) 180f else 0f,
        animationSpec = spring(dampingRatio = 0.6f, stiffness = 400f),
        label = "chevron",
    )
    DokkitIcon(
        imageVector = DokkitIcons.Chevron,
        contentDescription = if (expanded) "Show less" else "Show more",
        modifier = modifier
            .size(16.dp)
            .rotate(rotation),
        tint = tint,
    )
}

/**
 * The reveal region. Wraps a row of content that appears under a row/gap —
 * matches the web's .task-reveal (border-top + reveal-in animation). No
 * default border is drawn; callers add the hairline when appropriate.
 */
@Composable
fun DokkitReveal(
    visible: Boolean,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = fadeIn() + expandVertically(expandFrom = Alignment.Top),
        exit = fadeOut() + shrinkVertically(shrinkTowards = Alignment.Top),
    ) {
        content()
    }
}

// ── Empty state ─────────────────────────────────────────────────────────

/**
 * The Dokkit empty state — concise, quiet, and action-oriented when
 * appropriate. No illustrations, no editorial copy. One line of what's
 * absent, one optional quiet action.
 */
@Composable
fun DokkitEmptyState(
    message: String,
    modifier: Modifier = Modifier,
    action: (() -> Unit)? = null,
    actionLabel: String? = null,
) {
    val colors = DokkitTheme.colors
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        androidx.compose.foundation.layout.Column(
            modifier = Modifier.weight(1f),
        ) {
            androidx.compose.foundation.text.BasicText(
                text = message,
                style = DokkitType.metadata.copy(
                    color = colors.inkSoft,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                ),
            )
        }
        if (action != null && actionLabel != null) {
            Spacer(Modifier.width(12.dp))
            DokkitTextButton(text = actionLabel, onClick = action, color = colors.steelText)
        }
    }
}

// ── Drag handle ─────────────────────────────────────────────────────────

/**
 * The bare grip (web .DragHandleIcon) — six dots, ink-faint. Used where a
 * row can be manually reordered; it stays quiet until the surface enters
 * edit mode, mirroring the web.
 */
@Composable
fun DokkitDragHandle(
    modifier: Modifier = Modifier,
    tint: androidx.compose.ui.graphics.Color = DokkitTheme.colors.inkFaint,
) {
    DokkitIcon(
        imageVector = DokkitIcons.DragHandle,
        contentDescription = "Drag to reorder",
        modifier = modifier.size(18.dp),
        tint = tint,
    )
}

// ── Row affordance ──────────────────────────────────────────────────────

/**
 * A clickable row with a trailing chevron — the web's chevron affordance on
 * task-card glance/time rows and day-head. Quiet until interacted with.
 */
@Composable
fun DokkitDisclosureRow(
    expanded: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Row(
        modifier = modifier.clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        content()
        Spacer(Modifier.width(8.dp))
        DokkitDisclosureChevron(expanded = expanded)
    }
}