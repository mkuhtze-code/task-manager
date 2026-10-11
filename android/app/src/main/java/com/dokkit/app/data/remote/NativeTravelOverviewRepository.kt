package com.dokkit.app.data.remote

import com.dokkit.app.domain.model.Trip
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order

/**
 * Small read boundary for the first native Travel slice.
 *
 * The query relies on Supabase Auth + the existing trips RLS policies; it
 * never uses a service-role key or accepts a user id from the UI.
 */
class NativeTravelOverviewRepository(
    private val supabaseFactory: SupabaseFactory,
) {
    suspend fun loadTrips(): List<Trip> =
        supabaseFactory.supabase
            .from("trips")
            .select {
                order("start_date", Order.ASCENDING)
            }
            .decodeList<Trip>()
}
