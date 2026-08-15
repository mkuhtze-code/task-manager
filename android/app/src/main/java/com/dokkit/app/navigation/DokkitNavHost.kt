package com.dokkit.app.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.dokkit.app.core.icon.DokkitIcon
import com.dokkit.app.ui.jobs.JobsPlaceholderScreen
import com.dokkit.app.ui.today.TodayScreen
import com.dokkit.app.ui.travel.TravelScreen

/**
 * Navigation shell. A restrained native bottom bar (three destinations,
 * icons only) — not a web tab bar. Each destination is wired through its
 * own composable entry point so it can be lifted into a separate Gradle
 * feature module later without reworking the graph.
 */
@Composable
fun DokkitNavHost() {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination

    Scaffold(
        containerColor = androidx.compose.material3.MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(tonalElevation = 0.dp) {
                DokkitDestination.entries.forEach { destination ->
                    val selected = currentDestination?.hierarchy?.any {
                        it.route == destination.route
                    } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            navController.navigate(destination.route) {
                                popUpTo(navController.graph.startDestinationId) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = {
                            DokkitIcon(
                                imageVector = destination.selectedIcon,
                                contentDescription = destination.contentDescription,
                                modifier = Modifier
                            )
                        },
                        label = null,
                    )
                }
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
                TodayScreen()
            }
            composable(DokkitDestination.Jobs.route) {
                JobsPlaceholderScreen()
            }
            composable(DokkitDestination.Travel.route) {
                TravelScreen()
            }
        }
    }
}