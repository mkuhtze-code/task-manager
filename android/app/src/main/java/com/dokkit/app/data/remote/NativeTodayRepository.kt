package com.dokkit.app.data.remote

import com.dokkit.app.domain.model.Task
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order
import java.time.Duration
import java.time.Instant
import kotlin.math.roundToInt

/**
 * Authenticated native task-capture boundary.
 *
 * Uses the app's anon-key client and current Supabase session. Row-level
 * security remains the authority for tenant isolation; no user id is
 * accepted from the UI and no privileged key is present.
 */
class NativeTodayRepository(
    private val supabaseFactory: SupabaseFactory,
) {
    suspend fun loadOpenTasks(): List<Task> =
        supabaseFactory.supabase
            .from("tasks")
            .select {
                order("order_index", Order.ASCENDING)
            }
            .decodeList<Task>()
            .filter { it.status != "done" }

    suspend fun startTask(taskId: String) = updateTask(
        taskId = taskId,
        status = "active",
        startedAt = Instant.now().toString(),
        completedAt = null,
    )

    suspend fun stopTask(task: Task) {
        val measuredMinutes = measuredMinutes(task)
        updateTask(
            taskId = task.id,
            status = "pending",
            startedAt = null,
            completedAt = null,
            loggedMins = measuredMinutes,
            actualMins = null,
        )
    }

    suspend fun completeTask(task: Task) {
        val measuredMinutes = measuredMinutes(task)
        updateTask(
            taskId = task.id,
            status = "done",
            startedAt = null,
            completedAt = Instant.now().toString(),
            loggedMins = measuredMinutes,
            actualMins = measuredMinutes.takeIf { it > 0.0 }?.roundToInt()?.coerceAtLeast(1),
        )
    }

    private fun measuredMinutes(task: Task): Double {
        val activeMinutes = task.startedAt?.let { startedAt ->
            runCatching {
                Duration.between(Instant.parse(startedAt), Instant.now())
                    .toMillis()
                    .coerceAtLeast(0L) / 60_000.0
            }.getOrDefault(0.0)
        } ?: 0.0
        return (task.loggedMins + activeMinutes).coerceAtLeast(0.0)
    }

    private suspend fun updateTask(
        taskId: String,
        status: String,
        startedAt: String?,
        completedAt: String?,
        loggedMins: Double? = null,
        actualMins: Int? = null,
    ) {
        check(supabaseFactory.supabase.auth.currentUserOrNull() != null) {
            "Your session has expired. Sign in again to update this task."
        }
        supabaseFactory.supabase.from("tasks").update({
            set("status", status)
            set("started_at", startedAt)
            set("completed_at", completedAt)
            if (loggedMins != null) set("logged_mins", loggedMins)
            if (status == "done") set("actual_mins", actualMins)
        }) {
            filter { eq("id", taskId) }
        }
    }

    /**
     * Persists one explicitly submitted capture under a stable request ID.
     *
     * The database's (user_id, capture_request_id) unique index is the
     * cross-retry authority. If a request succeeded but its response was lost,
     * a retry resolves to the existing row instead of creating a duplicate.
     * Reusing the same key with different text is rejected.
     */
    suspend fun captureTask(text: String, requestId: String) {
        val cleanText = text.trim()
        require(cleanText.isNotEmpty()) { "Enter something to capture." }
        val cleanRequestId = requestId.trim()
        require(cleanRequestId.isNotEmpty() && cleanRequestId.length <= 128) {
            "This capture needs a valid request ID. Close it and start again."
        }
        val userId = supabaseFactory.supabase.auth.currentUserOrNull()?.id
            ?: error("Your session has expired. Sign in again to capture this.")

        try {
            supabaseFactory.supabase
                .from("tasks")
                .insert(
                    mapOf(
                        "user_id" to userId,
                        "text" to cleanText,
                        "status" to "pending",
                        "source" to "came_up",
                        "estimate_mins" to 15,
                        "due_today" to true,
                        "capture_request_id" to cleanRequestId,
                    ),
                )
        } catch (insertError: Exception) {
            // A uniqueness violation can mean an earlier attempt committed but
            // its response was lost. Verify the existing row under the current
            // user's RLS scope before treating the retry as successful.
            val existing = try {
                supabaseFactory.supabase
                    .from("tasks")
                    .select {
                        filter { eq("capture_request_id", cleanRequestId) }
                    }
                    .decodeList<Task>()
                    .firstOrNull()
            } catch (_: Exception) {
                null
            }

            if (existing != null) {
                check(existing.text == cleanText) {
                    "This capture request was already used for different text. Start a new capture."
                }
                return
            }
            throw insertError
        }
    }
}
