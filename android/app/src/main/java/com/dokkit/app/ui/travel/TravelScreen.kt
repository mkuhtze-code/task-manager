package com.dokkit.app.ui.travel

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dokkit.app.core.theme.DokkitTheme
import com.dokkit.app.data.remote.NativeTravelOverviewRepository
import com.dokkit.app.domain.model.Trip
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * First native Travel slice: authenticated, read-only trip overview.
 * Route editing and day/activity planning stay in the web product until their
 * native repository and offline contracts are implemented.
 */
@Composable
fun TravelScreen(repository: NativeTravelOverviewRepository) {
    val colors = DokkitTheme.colors
    val scope = rememberCoroutineScope()
    var trips by remember { mutableStateOf<List<Trip>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        loading = true
        error = null
        try {
            trips = repository.loadTrips()
        } catch (e: Exception) {
            error = e.message?.takeIf(String::isNotBlank)
                ?: "Travel could not be loaded. Check your connection and retry."
        } finally {
            loading = false
        }
    }

    LaunchedEffect(repository) { load() }

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 18.dp),
    ) {
        Text(
            text = "Travel",
            style = MaterialTheme.typography.headlineLarge,
            color = colors.ink,
        )
        Spacer(Modifier.height(4.dp))
        Text("Movement through time and place", color = colors.inkSoft)
        Spacer(Modifier.height(20.dp))

        when {
            loading -> Box(
                modifier = Modifier.fillMaxWidth().padding(32.dp),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }

            error != null -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(error.orEmpty(), color = colors.danger)
                Button(onClick = { scope.launch { load() } }) { Text("Retry") }
            }

            trips.isEmpty() -> Text(
                "No trips yet. Trips you plan in Dokkit will appear here.",
                color = colors.inkSoft,
            )

            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(trips, key = { it.id }) { trip ->
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = colors.paperRaised,
                        shape = MaterialTheme.shapes.medium,
                        tonalElevation = 0.dp,
                    ) {
                        Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
                            Text(trip.name, color = colors.ink, style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.height(5.dp))
                            Text(
                                dateRange(trip.startDate, trip.endDate),
                                color = colors.inkSoft,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun dateRange(start: String, end: String): String {
    fun format(value: String): String = runCatching {
        LocalDate.parse(value).format(DateTimeFormatter.ofPattern("d MMM yyyy", Locale.getDefault()))
    }.getOrDefault(value)
    return if (start == end) format(start) else "${format(start)} – ${format(end)}"
}
