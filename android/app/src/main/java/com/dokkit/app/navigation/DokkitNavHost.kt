package com.dokkit.app.navigation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.compose.navigation
import com.dokkit.app.core.theme.DokkitThemeState
import com.dokkit.app.data.remote.NativeTravelOverviewRepository
import com.dokkit.app.data.remote.SupabaseFactory
import com.dokkit.app.ui.jobs.JobsPlaceholderScreen
import com.dokkit.app.ui.lab.DesignLabScreen
import com.dokkit.app.ui.today.TodayScreen
import com.dokkit.app.ui.travel.TravelScreen

/**
 * Navigation shell. Travel reads the signed-in user's trips through the
 * existing Supabase/RLS boundary; Today and Jobs remain staged prototypes.
 */
@Composable
fun DokkitNavHost(
    themeState: DokkitThemeState,
    supabaseFactory: SupabaseFactory,
) {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination
    val travelRepository = androidx.compose.runtime.remember(supabaseFactory) {
        NativeTravelOverviewRepository(supabaseFactory)
    }

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
            modifier = androidx.compose.ui.Modifier
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
                TravelScreen(repository = travelRepository)
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
