package com.dokkit.app.core.sheet

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dokkit.app.core.control.DokkitIconButton
import com.dokkit.app.core.icon.DokkitIcon
import com.dokkit.app.core.icon.DokkitIcons
import com.dokkit.app.core.theme.DokkitTheme
import com.dokkit.app.core.theme.DokkitType

/**
 * Dokkit's sheet grammar — ported from the web's .capture-sheet /
 * .task-detail-sheet / .day-sheet.
 *
 * Not a default Material ModalBottomSheet — Dokkit's sheet is:
 *  - glass/material surface, `radius-lg` top corners, soft top shadow
 *  - a quiet header: optional title, close control *at the edge*
 *  - progressive disclosure of fields, not a wall of controls
 *  - restrained spacing; content decides its own rhythm
 *
 * The sheet draws its own scrim and animates up with Dokkit's easing. It is
 * deliberately free of Material chrome (no tonal elevation band, no default
 * drag handle that the design doesn't ask for).
 */
@Composable
fun DokkitSheet(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null,
    headerAction: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val colors = DokkitTheme.colors
    var offsetY by remember { mutableStateOf(1f) }
    LaunchedEffect(Unit) {
        offsetY = 0f
    }
    val animOffsetY by animateFloatAsState(
        targetValue = offsetY,
        animationSpec = spring(dampingRatio = 0.85f, stiffness = 240f),
        label = "sheetOffset",
    )

    Box(modifier = Modifier.fillMaxSize()) {
        // Scrim — ink at the web's ~0.2–0.4.
        Box(
            Modifier
                .fillMaxSize()
                .background(colors.ink.copy(alpha = 0.28f * (1f - animOffsetY)))
                .clickable(onClick = onDismiss),
        )

        Column(
            modifier = modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .navigationBarsPadding()
                .background(
                    colors.glass,
                    RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
                )
                .padding(horizontal = 16.dp)
                .padding(bottom = 16.dp),
        ) {
            Spacer(Modifier.height(4.dp))
            if (title != null || headerAction != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (title != null) {
                        BasicText(
                            text = title,
                            style = DokkitType.bodyStrong.copy(
                                color = colors.ink,
                                fontWeight = FontWeight.Bold,
                            ),
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.size(8.dp))
                    } else {
                        Spacer(Modifier.weight(1f))
                    }
                    if (headerAction != null) {
                        Box(
                            modifier = Modifier,
                            contentAlignment = Alignment.CenterEnd,
                        ) {
                            headerAction()
                        }
                    } else {
                        DokkitIconButton(
                            icon = DokkitIcons.Close,
                            contentDescription = "Close",
                            onClick = onDismiss,
                        )
                    }
                }
            }
            content()
        }
    }
}

/**
 * A sheet link row — web .day-sheet-link: icon + label + chevron, pushes
 * into a secondary surface.
 */
@Composable
fun DokkitSheetLink(
    icon: ImageVector?,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = DokkitTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(48.dp)
            .clickable(enabled = enabled, onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (icon != null) {
            DokkitIcon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = if (enabled) colors.inkFaint else colors.inkFaint.copy(alpha = 0.4f),
            )
        }
        BasicText(
            text = label,
            modifier = Modifier.weight(1f),
            style = DokkitType.metadata.copy(
                color = if (enabled) colors.ink else colors.inkFaint.copy(alpha = 0.6f),
                fontWeight = FontWeight.Medium,
            ),
        )
        if (enabled) {
            DokkitIcon(
                imageVector = DokkitIcons.ChevronRight,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = colors.inkFaint,
            )
        }
    }
}

/**
 * A section header inside a sheet (web .settings-panel-title — the "quiet
 * header" of each block). Minimal: overline label, no decoration.
 */
@Composable
fun DokkitSheetSectionTitle(
    text: String,
    modifier: Modifier = Modifier,
) {
    val colors = DokkitTheme.colors
    Row(modifier = modifier.fillMaxWidth()) {
        BasicText(
            text = text,
            style = DokkitType.bodyStrong.copy(color = colors.ink),
        )
    }
}