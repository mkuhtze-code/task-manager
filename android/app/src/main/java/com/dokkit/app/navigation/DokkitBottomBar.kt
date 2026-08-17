package com.dokkit.app.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dokkit.app.core.icon.DokkitIcon
import com.dokkit.app.core.theme.DokkitTheme
import com.dokkit.app.core.theme.DokkitType

/**
 * Dokkit's bottom navigation — deliberately understated. Three modes of the
 * same tool, not three applications: a quiet hairline bar of icons with
 * small labels, active state = ink (not a tonal pill), inactive = ink-faint.
 * No elevation, no emphasized container — the current mode is signalled by
 * weight and colour alone.
 */
@Composable
fun DokkitBottomBar(
    current: DokkitDestination,
    onSelect: (DokkitDestination) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = DokkitTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(colors.paper)
            .windowInsetsPadding(WindowInsets.navigationBars)
            .padding(bottom = 6.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DokkitDestination.entries.forEach { destination ->
            val selected = destination == current
            BasicText(
                text = destination.label,
                modifier = Modifier
                    .weight(1f)
                    .padding(vertical = 8.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(role = Role.Tab) { onSelect(destination) },
                style = DokkitType.metadata.copy(
                    color = if (selected) colors.ink else colors.inkFaint,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                ),
            )
        }
    }
}

// A hairline above the bar: a 1px divider the width of the surface.
/** Draws the bar's top hairline (web: border-top of the floating capsule). */
@Composable
fun DokkitBottomBarDivider() {
    val colors = DokkitTheme.colors
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(colors.line.copy(alpha = 0.6f)),
    )
}