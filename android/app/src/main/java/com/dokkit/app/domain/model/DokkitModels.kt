package com.dokkit.app.domain.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Domain models mirroring the Supabase schema (supabase/schema.sql).
 *
 * Field names are snake_case-mapped through @SerialName to match the
 * PostgREST columns exactly. These are the boundaries the feature
 * screens will consume; repositories (deferred) will map these to/from
 * the wire format.
 */

// ── Today ───────────────────────────────────────────────────────────────

@Serializable
data class UserSettings(
    @SerialName("user_id") val userId: String = "",
    @SerialName("day_length_mins") val dayLengthMins: Int = 480,
    @SerialName("work_start") val workStart: String = "08:00",
    @SerialName("work_end") val workEnd: String = "16:00",
    @SerialName("work_days") val workDays: List<Int> = listOf(1, 2, 3, 4, 5),
    @SerialName("notification_style") val notificationStyle: String = "default",
    @SerialName("sort_mode") val sortMode: String = "capacity_first",
    @SerialName("travel_sort_mode") val travelSortMode: String = "what_fits",
    @SerialName("account_tier") val accountTier: String = "free",
    val onboarded: Boolean = false,
    val theme: String = "system",
    val timezone: String? = null,
    @SerialName("home_location_text") val homeLocationText: String? = null,
    @SerialName("home_lat") val homeLat: Double? = null,
    @SerialName("home_lng") val homeLng: Double? = null,
    @SerialName("work_location_text") val workLocationText: String? = null,
    @SerialName("work_lat") val workLat: Double? = null,
    @SerialName("work_lng") val workLng: Double? = null,
)

@Serializable
data class TaskType(
    val id: String = "",
    @SerialName("user_id") val userId: String = "",
    val name: String = "",
    val keywords: List<String> = emptyList(),
)

@Serializable
data class Task(
    val id: String = "",
    @SerialName("user_id") val userId: String = "",
    val text: String = "",
    val status: String = "pending", // pending | active | done
    val source: String = "planned", // planned | came_up
    @SerialName("estimate_mins") val estimateMins: Int = 15,
    @SerialName("logged_mins") val loggedMins: Double = 0.0,
    @SerialName("actual_mins") val actualMins: Int? = null,
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("due_today") val dueToday: Boolean = false,
    @SerialName("surface_date") val surfaceDate: String? = null,
    @SerialName("location_text") val locationText: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
    @SerialName("task_type_id") val taskTypeId: String? = null,
    @SerialName("order_index") val orderIndex: Int = 0,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("near_notified") val nearNotified: Boolean = false,
    @SerialName("over_notified") val overNotified: Boolean = false,
    @SerialName("last_overdue_ping_at") val lastOverduePingAt: String? = null,
    @SerialName("drive_mins_to_next") val driveMinsToNext: Int = 0,
    @SerialName("route_polyline") val routePolyline: String? = null,
    val info: String = "",
)

@Serializable
data class Subtask(
    val id: String = "",
    @SerialName("user_id") val userId: String = "",
    @SerialName("task_id") val taskId: String = "",
    val text: String = "",
    val mins: Int = 0,
    val done: Boolean = false,
    @SerialName("order_index") val orderIndex: Int = 0,
)

@Serializable
data class Meeting(
    val id: String = "",
    @SerialName("user_id") val userId: String = "",
    val text: String = "",
    @SerialName("duration_mins") val durationMins: Int? = null,
    @SerialName("start_time") val startTime: String? = null,
    val source: String = "manual", // manual | outlook
)

@Serializable
data class TimeLog(
    val id: String = "",
    @SerialName("user_id") val userId: String = "",
    @SerialName("task_id") val taskId: String? = null,
    @SerialName("task_type_id") val taskTypeId: String? = null,
    @SerialName("duration_mins") val durationMins: Int = 0,
    @SerialName("logged_at") val loggedAt: String = "",
)

// ── Reality Capture ─────────────────────────────────────────────────────

/**
 * Outcome of a single task in a Reality Check.
 * Default is [Carried] — unfinished work simply continues.
 */
enum class RealityOutcome {
    /** Task finished. Optional actual duration feeds learning. */
    Done,

    /** Some progress; remaining estimate carries forward. */
    Partial,

    /** Not done. Carries to the next surface date (default). */
    Carried,

    /** Explicitly removed from the plan for today. */
    Skipped,
}

/**
 * One task's update during a Reality Check.
 * Kept local-first; repositories persist as task patches + TimeLog rows.
 */
@Serializable
data class RealityUpdate(
    @SerialName("task_id") val taskId: String,
    /** done | partial | carried | skipped */
    val outcome: String = "carried",
    @SerialName("actual_mins") val actualMins: Int? = null,
    /** Remaining estimate when outcome is partial. */
    @SerialName("remaining_mins") val remainingMins: Int? = null,
    val note: String? = null,
    val timestamp: String = "",
)

/**
 * A closed day after the user has reshaped the plan.
 * Optional persistence; most state can be derived from task + time_log updates.
 */
@Serializable
data class DayClose(
    val date: String, // YYYY-MM-DD
    val updates: List<RealityUpdate> = emptyList(),
    @SerialName("overall_note") val overallNote: String? = null,
    @SerialName("reshaped_at") val reshapedAt: String = "",
)

/**
 * A single calm insight shown after reshape, only when confidence is high.
 * Never a score or productivity judgement.
 */
data class PatternInsight(
    val message: String,
    /** e.g. "Quote revision usually 45m · well known" */
    val detail: String? = null,
)

/**
 * Result of applying a Reality Check and reshaping the plan.
 */
data class ReshapeResult(
    val updatedTasks: List<Task>,
    val carriedCount: Int,
    val doneCount: Int,
    val insight: PatternInsight? = null,
)

// ── Travel ──────────────────────────────────────────────────────────────

@Serializable
data class Trip(
    val id: String = "",
    @SerialName("user_id") val userId: String = "",
    val name: String = "",
    @SerialName("start_date") val startDate: String = "",
    @SerialName("end_date") val endDate: String = "",
)

@Serializable
data class TripDay(
    val id: String = "",
    @SerialName("trip_id") val tripId: String = "",
    val date: String = "",
    @SerialName("day_start") val dayStart: String = "08:00",
    @SerialName("day_end") val dayEnd: String = "20:00",
    @SerialName("base_location_text") val baseLocationText: String? = null,
    @SerialName("base_lat") val baseLat: Double? = null,
    @SerialName("base_lng") val baseLng: Double? = null,
    @SerialName("arrival_time") val arrivalTime: String? = null,
    @SerialName("departure_time") val departureTime: String? = null,
    @SerialName("drive_from_base_mins") val driveFromBaseMins: Int = 0,
    @SerialName("route_polyline") val routePolyline: String? = null,
    val notes: String? = null,
)

@Serializable
data class Activity(
    val id: String = "",
    @SerialName("trip_day_id") val tripDayId: String = "",
    @SerialName("user_id") val userId: String = "",
    val text: String = "",
    @SerialName("activity_type") val activityType: String = "stop", // stop | drive | flight | other
    @SerialName("estimate_mins") val estimateMins: Int = 30,
    @SerialName("drive_mins_to_next") val driveMinsToNext: Int = 0,
    @SerialName("location_text") val locationText: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
    @SerialName("order_index") val orderIndex: Int = 0,
    val status: String = "pending", // pending | done
    @SerialName("time_type") val timeType: String = "flexible", // flexible | fixed
    @SerialName("fixed_time") val fixedTime: String? = null,
    @SerialName("route_polyline") val routePolyline: String? = null,
)

@Serializable
data class Accommodation(
    val id: String = "",
    @SerialName("trip_id") val tripId: String = "",
    @SerialName("user_id") val userId: String = "",
    @SerialName("location_text") val locationText: String = "",
    val lat: Double = 0.0,
    val lng: Double = 0.0,
    @SerialName("check_in_date") val checkInDate: String = "",
    @SerialName("check_out_date") val checkOutDate: String = "",
    @SerialName("arrival_time") val arrivalTime: String? = null,
    @SerialName("departure_time") val departureTime: String? = null,
)
