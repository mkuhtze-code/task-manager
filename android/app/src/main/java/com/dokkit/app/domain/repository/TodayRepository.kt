package com.dokkit.app.domain.repository

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
}