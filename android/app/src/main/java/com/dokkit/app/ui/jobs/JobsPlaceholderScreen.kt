package com.dokkit.app.ui.jobs

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dokkit.app.core.control.DokkitEmptyState
import com.dokkit.app.core.theme.DokkitTheme
import com.dokkit.app.core.theme.DokkitType
import androidx.compose.foundation.text.BasicText

/**
 * Jobs placeholder. Deliberately minimal — the Jobs feature is not designed
 * yet and must not be built ahead of its product spec. This screen exists
 * only so the navigation order (Today → Jobs → Travel) is stable and the
 * shell is navigable.
 */
@Composable
fun JobsPlaceholderScreen() {
    val colors = DokkitTheme.colors
    Box(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding(),
        contentAlignment = Alignment.Center,
    ) {
        DokkitEmptyState(message = "Jobs land in a later stage.")
    }
}