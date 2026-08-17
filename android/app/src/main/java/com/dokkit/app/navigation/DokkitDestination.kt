package com.dokkit.app.navigation

import androidx.compose.ui.graphics.vector.ImageVector
import com.dokkit.app.core.icon.DokkitIcons

/**
 * Top-level destinations. Order is material: Today is the primary home,
 * Jobs is the work surface (placeholder for now), Travel closes it out —
 * matching the product requirement of Today → Jobs → Travel.
 */
enum class DokkitDestination(
    val route: String,
    val label: String,
    val icon: ImageVector,
) {
    Today("today", "Today", DokkitIcons.Today),
    Jobs("jobs", "Jobs", DokkitIcons.Jobs),
    Travel("travel", "Travel", DokkitIcons.Travel),
}