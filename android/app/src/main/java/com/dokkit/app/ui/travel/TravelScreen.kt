package com.dokkit.app.ui.travel

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.dokkit.app.core.control.DokkitEmptyState

/**
 * Travel — trip list → day itinerary → activities & map. The full travel
 * implementation (trips, days, activities, accommodation, map) is deferred;
 * this is the buildable shell with a quiet empty state.
 */
@Composable
fun TravelScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding(),
        contentAlignment = Alignment.Center,
    ) {
        DokkitEmptyState(message = "Trips land in a later stage.")
    }
}