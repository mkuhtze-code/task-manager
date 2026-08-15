package com.dokkit.app.ui.today

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dokkit.app.core.theme.DokkitTheme

/**
 * Today — the app's home surface. Day view: capacity + task list. The
 * actual Today implementation (task list, capacity, capture, timers) is
 * deferred; this is the buildable shell.
 */
@Composable
fun TodayScreen() {
    Box(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Today",
            color = DokkitTheme.colors.ink,
            modifier = Modifier.padding(20.dp),
        )
    }
}