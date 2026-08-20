package com.dokkit.app.navigation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.dokkit.app.core.theme.DokkitThemeState
import com.dokkit.app.ui.jobs.JobsPlaceholderScreen
import com.dokkit.app.ui.lab.DesignLabScreen
import com.dokkit.app.ui.today.TodayScreen
import com.dokkit.app.ui.travel.TravelScreen

/**
 * Navigation shell. A restrained bottom bar (three destinations) — not a
 * web tab bar and not a branded M3 NavigationBar. Each destination is
 * wired through its own composable entry point so it can be lifted into a
 * separate Gradle feature module later without reworking the graph.
 *
 * [DesignLabScreen] is an internal dev surface reachable from the Today
 * header, not a destination in the bar.
 */
@Composable
fun DokkitNavHost(
    themeState: DokkitThemeState,
) {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination

    Scaffold(
        containerColor = androidx.compose.material3.MaterialTheme.colorScheme.background,
        bottomBar = {
            Column {
                DokkitBottomBarDivider()
                DokkitBottomBar(
                    current = DokkitDestination.entries.firstOrNull { d ->
                        currentDestination?.hierarchy?.any { it.route == d.route } == true
                    } ?: DokkitDestination.Today,
                    onSelect = { destination ->
                        navController.navigate(destination.route) {
                            popUpTo(navController.graph.startDestinationId) {
                                saveState = true
                            }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                )
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = DokkitDestination.Today.route,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            composable(DokkitDestination.Today.route) {
                TodayScreen(
                    themeState = themeState,
                    onOpenDesignLab = { navController.navigate("lab") },
                )
            }
            composable(DokkitDestination.Jobs.route) {
                JobsPlaceholderScreen()
            }
            composable(DokkitDestination.Travel.route) {
                TravelScreen()
            }
            composable("lab") {
                DesignLabScreen(
                    themeState = themeState,
                    onClose = { navController.popBackStack() },
                )
            }
        }
    }
}