package com.dokkit.app.ui.travel

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dokkit.app.core.theme.DokkitTheme

/**
 * Travel — trip list → day itinerary → activities & map. The full travel
 * implementation (trips, days, activities, accommodation, map) is
 * deferred; this is the buildable shell.
 */
@Composable
fun TravelScreen() {
    Box(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Travel",
            color = DokkitTheme.colors.ink,
            modifier = Modifier.padding(20.dp),
        )
    }
}