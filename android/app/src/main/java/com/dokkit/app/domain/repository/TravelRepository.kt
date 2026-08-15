package com.dokkit.app.domain.repository

import com.dokkit.app.domain.model.Accommodation
import com.dokkit.app.domain.model.Activity
import com.dokkit.app.domain.model.Trip
import com.dokkit.app.domain.model.TripDay

/**
 * Boundary for Travel's data access. Not wired up yet — TripDay has no
 * user_id column in the schema (ownership flows through the parent trip),
 * so these signatures are shaped around trip-scoped fetches already.
 */
interface TravelRepository {
    suspend fun loadTrips(): List<Trip>
    suspend fun loadTripDays(tripId: String): List<TripDay>
    suspend fun loadActivities(tripDayId: String): List<Activity>
    suspend fun loadAccommodations(tripId: String): List<Accommodation>

    suspend fun addTrip(name: String, startDate: String, endDate: String)
    suspend fun deleteTrip(tripId: String)
    suspend fun addActivity(tripDayId: String, text: String, estimateMins: Int)
    suspend fun updateActivity(activity: Activity)
    suspend fun deleteActivity(activityId: String)
}