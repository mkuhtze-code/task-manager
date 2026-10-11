package com.dokkit.app.ui.today

import android.content.ActivityNotFoundException
import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.dokkit.app.core.theme.DokkitTheme
import com.dokkit.app.core.theme.DokkitThemeState
import com.dokkit.app.data.remote.NativeTodayRepository
import com.dokkit.app.domain.model.Task
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Native Today capture slice. Tasks are loaded from the shared Supabase
 * table, and capture writes through the authenticated anon-key client.
 * The system speech recognizer is only an input method; interpretation and
 * task persistence remain inside Dokkit's own deterministic code path.
 */
@Composable
fun TodayScreen(
    themeState: DokkitThemeState,
    onOpenDesignLab: () -> Unit,
    repository: NativeTodayRepository,
) {
    val colors = DokkitTheme.colors
    val scope = rememberCoroutineScope()
    var tasks by remember { mutableStateOf<List<Task>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var captureOpen by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf("") }
    var captureError by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    var updatingTaskIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var actionError by remember { mutableStateOf<String?>(null) }

    fun runTaskAction(task: Task, action: suspend () -> Unit) {
        if (task.id in updatingTaskIds) return
        updatingTaskIds = updatingTaskIds + task.id
        actionError = null
        scope.launch {
            try {
                action()
                tasks = repository.loadOpenTasks()
            } catch (e: Exception) {
                actionError = e.message?.takeIf(String::isNotBlank)
                    ?: "Task update failed. Check your connection and retry."
            } finally {
                updatingTaskIds = updatingTaskIds - task.id
            }
        }
    }

    fun refresh() {
        scope.launch {
            loading = true
            loadError = null
            try {
                tasks = repository.loadOpenTasks()
            } catch (e: Exception) {
                loadError = e.message?.takeIf(String::isNotBlank)
                    ?: "Today could not be loaded. Check your connection and retry."
            } finally {
                loading = false
            }
        }
    }

    val speechLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            val spoken = result.data
                ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()
                .orEmpty()
            if (spoken.isNotBlank()) {
                draft = listOf(draft.trim(), spoken.trim())
                    .filter(String::isNotBlank)
                    .joinToString(" ")
                captureError = null
            }
        }
    }

    LaunchedEffect(repository) { refresh() }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp, vertical = 18.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE", Locale.getDefault())).uppercase(),
                        style = MaterialTheme.typography.labelMedium,
                        color = colors.steelText,
                    )
                    Text(
                        LocalDate.now().format(DateTimeFormatter.ofPattern("MMMM d", Locale.getDefault())),
                        style = MaterialTheme.typography.headlineLarge,
                        color = colors.ink,
                    )
                }
                TextButton(onClick = onOpenDesignLab) { Text("Appearance") }
            }
            Spacer(Modifier.height(18.dp))
            Text("Today", style = MaterialTheme.typography.titleMedium, color = colors.ink)
            Spacer(Modifier.height(8.dp))
            actionError?.let { message ->
                Text(message, color = colors.danger, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(6.dp))
            }

            when {
                loading -> Box(
                    modifier = Modifier.fillMaxWidth().padding(28.dp),
                    contentAlignment = Alignment.Center,
                ) { CircularProgressIndicator() }

                loadError != null -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(loadError.orEmpty(), color = colors.danger)
                    Button(onClick = { refresh() }) { Text("Retry") }
                }

                tasks.isEmpty() -> Text(
                    "Nothing captured yet. Add a thought and keep moving.",
                    color = colors.inkSoft,
                    style = MaterialTheme.typography.bodyLarge,
                )

                else -> LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(tasks, key = { it.id }) { task ->
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            color = colors.paperRaised,
                            shape = MaterialTheme.shapes.medium,
                            tonalElevation = 0.dp,
                        ) {
                            Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                                Text(task.text, color = colors.ink, style = MaterialTheme.typography.bodyLarge)
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    "${task.estimateMins} min estimate · ${if (task.dueToday) "Today" else "Flexible"} · ${task.status}",
                                    color = colors.inkSoft,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                                Spacer(Modifier.height(8.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    if (task.status == "active") {
                                        TextButton(
                                            onClick = { runTaskAction(task) { repository.stopTask(task) } },
                                            enabled = task.id !in updatingTaskIds,
                                        ) { Text("Stop") }
                                    } else {
                                        TextButton(
                                            onClick = { runTaskAction(task) { repository.startTask(task.id) } },
                                            enabled = task.id !in updatingTaskIds,
                                        ) { Text("Start") }
                                    }
                                    TextButton(
                                        onClick = { runTaskAction(task) { repository.completeTask(task) } },
                                        enabled = task.id !in updatingTaskIds,
                                    ) {
                                        if (task.id in updatingTaskIds) {
                                            CircularProgressIndicator()
                                        } else {
                                            Text("Complete")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        FloatingActionButton(
            onClick = {
                draft = ""
                captureError = null
                captureOpen = true
            },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .navigationBarsPadding()
                .padding(20.dp),
            containerColor = colors.steelWash,
            contentColor = colors.ink,
        ) {
            Text("+", style = MaterialTheme.typography.headlineMedium)
        }
    }

    if (captureOpen) {
        AlertDialog(
            onDismissRequest = { if (!saving) captureOpen = false },
            title = { Text("Capture a thought") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = draft,
                        onValueChange = { draft = it; captureError = null },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("What do you need to remember?") },
                        placeholder = { Text("Call Jordan about the measurements") },
                        minLines = 2,
                        maxLines = 5,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        enabled = !saving,
                    )
                    TextButton(
                        onClick = {
                            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                                putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
                                putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak your capture")
                            }
                            try {
                                speechLauncher.launch(intent)
                            } catch (_: ActivityNotFoundException) {
                                captureError = "Speech input is not available on this device. You can type instead."
                            }
                        },
                        enabled = !saving,
                    ) { Text("Speak") }
                    captureError?.let { Text(it, color = colors.danger) }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val clean = draft.trim()
                        if (clean.isEmpty()) {
                            captureError = "Enter or speak something first."
                        } else {
                            saving = true
                            captureError = null
                            scope.launch {
                                try {
                                    repository.captureTask(clean)
                                    tasks = repository.loadOpenTasks()
                                    captureOpen = false
                                    draft = ""
                                } catch (e: Exception) {
                                    captureError = e.message?.takeIf(String::isNotBlank)
                                        ?: "Capture failed. Your text is still here; retry when ready."
                                } finally {
                                    saving = false
                                }
                            }
                        }
                    },
                    enabled = !saving,
                ) {
                    if (saving) CircularProgressIndicator() else Text("Capture")
                }
            },
            dismissButton = {
                TextButton(onClick = { captureOpen = false }, enabled = !saving) { Text("Cancel") }
            },
        )
    }
}
