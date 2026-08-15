package com.dokkit.app.domain.model

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Sanity-checks the domain models' column mapping (snake_case → camelCase
 * through @SerialName). This pins the wire contract shared with the
 * PostgREST schema so a later repository can round-trip safely.
 */
class ModelMappingTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `Task maps snake_case columns`() {
        val raw = """
            {
              "id": "t1",
              "user_id": "u1",
              "text": "Ship it",
              "status": "pending",
              "estimate_mins": 20,
              "logged_mins": 4.5,
              "due_today": true,
              "surface_date": null,
              "location_text": "Home",
              "lat": 1.5,
              "drive_mins_to_next": 0,
              "route_polyline": null,
              "info": "notes"
            }
        """
        val task = json.decodeFromString<Task>(raw)
        assertEquals("t1", task.id)
        assertEquals("u1", task.userId)
        assertEquals("Ship it", task.text)
        assertEquals(20, task.estimateMins)
        assertEquals(4.5, task.loggedMins, 0.0)
        assertEquals(true, task.dueToday)
        assertNull(task.surfaceDate)
        assertEquals("Home", task.locationText)
        assertEquals(1.5, task.lat ?: 0.0, 0.0)
        assertEquals("notes", task.info)
    }

    @Test
    fun `TripDay carries trip scoping only`() {
        val raw = """
            { "id": "td1", "trip_id": "tr1", "date": "2026-08-20",
              "day_start": "08:00", "day_end": "20:00",
              "drive_from_base_mins": 0, "route_polyline": null }
        """
        val day = json.decodeFromString<TripDay>(raw)
        assertEquals("tr1", day.tripId)
        assertEquals("08:00", day.dayStart)
        // trip_days has no user_id column by design — ownership flows
        // through the parent trip (mirrors the schema + RLS policy).
    }

    @Test
    fun `Activity defaults are reproduction safe`() {
        val raw = """ { "text": "Hike", "trip_day_id": "td1", "user_id": "u1" } """
        val activity = json.decodeFromString<Activity>(raw)
        assertEquals("Hike", activity.text)
        assertEquals("stop", activity.activityType)
        assertEquals(30, activity.estimateMins)
        assertEquals("pending", activity.status)
        assertEquals("flexible", activity.timeType)
    }
}