package com.dokkit.app.data.remote

import com.dokkit.app.domain.model.Task
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order

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

    suspend fun captureTask(text: String) {
        val cleanText = text.trim()
        require(cleanText.isNotEmpty()) { "Enter something to capture." }
        val userId = supabaseFactory.supabase.auth.currentUserOrNull()?.id
            ?: error("Your session has expired. Sign in again to capture this.")

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
                ),
            )
    }
}
