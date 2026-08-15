package com.dokkit.app.ui.jobs

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dokkit.app.core.theme.DokkitTheme

/**
 * Jobs placeholder. Deliberately minimal — the Jobs feature is not
 * designed yet and must not be built ahead of its product spec. This
 * screen exists only so the navigation order (Today → Jobs → Travel) is
 * stable and the shell is navigable.
 */
@Composable
fun JobsPlaceholderScreen() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(24.dp),
        ) {
            Text(
                text = "Jobs",
                style = DokkitTheme.typography.displaySmall,
                color = DokkitTheme.colors.ink,
            )
            Text(
                text = "Coming in a later stage",
                style = DokkitTheme.typography.caption,
                color = DokkitTheme.colors.inkFaint,
            )
        }
    }
}