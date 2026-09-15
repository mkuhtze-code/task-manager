package com.dokkit.app.domain.repository

import com.dokkit.app.domain.model.DayClose
import com.dokkit.app.domain.model.RealityUpdate
import com.dokkit.app.domain.model.ReshapeResult
import com.dokkit.app.domain.model.Subtask
import com.dokkit.app.domain.model.Task
import com.dokkit.app.domain.model.UserSettings

/**
 * Boundary for Today's data access. Not wired up yet — this establishes
 * the shape the Today feature will consume so read/write paths, sort
 * logic ports and the eventual Room/Supabase backing all fit cleanly.
 */
interface TodayRepository {
    suspend fun loadToday(): List<Task>
    suspend fun loadSubtasks(taskId: String): List<Subtask>
    suspend fun loadSettings(): UserSettings?

    suspend fun addTask(text: String, estimateMins: Int, source: String, dueToday: Boolean)
    suspend fun updateTask(task: Task)
    suspend fun setTaskStatus(taskId: String, status: String)
    suspend fun startTimer(taskId: String)
    suspend fun stopTimer(taskId: String)
    suspend fun deleteTask(taskId: String)

    // ── Reality Capture ─────────────────────────────────────────────────

    /**
     * Apply a batch of reality updates (status, actual/remaining mins, notes)
     * and write any TimeLog rows. Local-first; queues for sync when offline.
     */
    suspend fun applyRealityUpdates(updates: List<RealityUpdate>)

    /**
     * After updates are applied, reshape remaining capacity, re-order
     * remaining tasks, and carry unfinished work to the next surface date.
     * Returns the updated task list plus an optional calm insight.
     */
    suspend fun reshapePlan(date: String, updates: List<RealityUpdate>): ReshapeResult

    /**
     * Optional persistence of a closed day. Most state is already in tasks +
     * time_logs; this exists only if insight history or offline reconciliation
     * needs an explicit record.
     */
    suspend fun saveDayClose(close: DayClose)
}
