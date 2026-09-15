package com.dokkit.app.ui.today

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dokkit.app.core.control.DokkitButton
import com.dokkit.app.core.control.DokkitButtonVariant
import com.dokkit.app.core.control.DokkitTextButton
import com.dokkit.app.core.sheet.DokkitSheet
import com.dokkit.app.core.theme.DokkitTheme
import com.dokkit.app.core.theme.DokkitType
import com.dokkit.app.domain.model.RealityOutcome
import com.dokkit.app.domain.model.RealityUpdate
import com.dokkit.app.domain.model.Task

/**
 * Reality Check surface — low-friction capture of what actually happened,
 * then reshape the plan. Default outcome for every task is [RealityOutcome.Carried].
 *
 * Language is deliberately non-judgemental: "carried forward", "still needs doing".
 * No scores, streaks, or failure states.
 *
 * This is a skeleton against the real domain models. Wire to [TodayRepository]
 * applyRealityUpdates + reshapePlan when the repository implementation lands.
 */
@Composable
fun RealityCheckSheet(
    tasks: List<Task>,
    onDismiss: () -> Unit,
    onReshape: (List<RealityUpdate>) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = DokkitTheme.colors

    // Default every task to Carried so the user only touches what changed.
    val outcomes = remember {
        mutableStateMapOf<String, RealityOutcome>().apply {
            tasks.forEach { put(it.id, RealityOutcome.Carried) }
        }
    }
    val actualMins = remember { mutableStateMapOf<String, Int?>() }

    DokkitSheet(
        onDismiss = onDismiss,
        title = "Reality check",
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(bottom = 8.dp),
        ) {
            BasicText(
                text = "What happened today? Unfinished work carries forward.",
                style = DokkitType.caption.copy(color = colors.inkFaint),
            )
            Spacer(Modifier.height(16.dp))

            tasks.forEach { task ->
                RealityTaskRow(
                    task = task,
                    outcome = outcomes[task.id] ?: RealityOutcome.Carried,
                    onOutcomeChange = { outcomes[task.id] = it },
                    actualMins = actualMins[task.id],
                    onActualMinsChange = { actualMins[task.id] = it },
                )
                Spacer(Modifier.height(10.dp))
            }

            if (tasks.isEmpty()) {
                BasicText(
                    text = "Nothing on the plan for today.",
                    style = DokkitType.body.copy(color = colors.inkFaint),
                    modifier = Modifier.padding(vertical = 12.dp),
                )
            }

            Spacer(Modifier.height(12.dp))

            DokkitButton(
                text = "Reshape the plan",
                onClick = {
                    val updates = tasks.map { task ->
                        val outcome = outcomes[task.id] ?: RealityOutcome.Carried
                        RealityUpdate(
                            taskId = task.id,
                            outcome = outcome.name.lowercase(),
                            actualMins = actualMins[task.id],
                            remainingMins = when (outcome) {
                                RealityOutcome.Partial -> task.estimateMins / 2 // placeholder; refine later
                                else -> null
                            },
                            note = null,
                        )
                    }
                    onReshape(updates)
                },
                variant = DokkitButtonVariant.Steel,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(8.dp))

            DokkitTextButton(
                text = "Not now",
                onClick = onDismiss,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
        }
    }
}

@Composable
private fun RealityTaskRow(
    task: Task,
    outcome: RealityOutcome,
    onOutcomeChange: (RealityOutcome) -> Unit,
    actualMins: Int?,
    onActualMinsChange: (Int?) -> Unit,
) {
    val colors = DokkitTheme.colors

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(colors.paper)
            .padding(12.dp),
    ) {
        BasicText(
            text = task.text,
            style = DokkitType.bodyStrong.copy(color = colors.ink),
        )
        Spacer(Modifier.height(2.dp))
        BasicText(
            text = fmtMins(task.estimateMins),
            style = DokkitType.monoMicro.copy(color = colors.inkFaint),
        )

        Spacer(Modifier.height(10.dp))

        // Large, equal-weight outcome chips. Default = Carried.
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            OutcomeChip(
                label = "Done",
                selected = outcome == RealityOutcome.Done,
                onClick = { onOutcomeChange(RealityOutcome.Done) },
                modifier = Modifier.weight(1f),
            )
            OutcomeChip(
                label = "Partial",
                selected = outcome == RealityOutcome.Partial,
                onClick = { onOutcomeChange(RealityOutcome.Partial) },
                modifier = Modifier.weight(1f),
            )
            OutcomeChip(
                label = "Carry",
                selected = outcome == RealityOutcome.Carried,
                onClick = { onOutcomeChange(RealityOutcome.Carried) },
                modifier = Modifier.weight(1f),
            )
            OutcomeChip(
                label = "Skip",
                selected = outcome == RealityOutcome.Skipped,
                onClick = { onOutcomeChange(RealityOutcome.Skipped) },
                modifier = Modifier.weight(1f),
            )
        }

        // Optional duration only when Done is selected — keep friction low.
        if (outcome == RealityOutcome.Done) {
            Spacer(Modifier.height(10.dp))
            BasicText(
                text = "How long did it take?",
                style = DokkitType.caption.copy(color = colors.inkFaint),
            )
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                DurationChip("Less", selected = actualMins != null && actualMins < task.estimateMins) {
                    onActualMinsChange((task.estimateMins * 0.7).toInt().coerceAtLeast(5))
                }
                DurationChip("About right", selected = actualMins == task.estimateMins) {
                    onActualMinsChange(task.estimateMins)
                }
                DurationChip("Longer", selected = actualMins != null && actualMins > task.estimateMins) {
                    onActualMinsChange((task.estimateMins * 1.4).toInt())
                }
            }
        }
    }
}

@Composable
private fun OutcomeChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = DokkitTheme.colors
    Box(
        modifier = modifier
            .height(36.dp)
            .clip(CircleShape)
            .background(if (selected) colors.steelWash else colors.line.copy(alpha = 0.35f))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(
            text = label,
            style = DokkitType.caption.copy(
                color = if (selected) colors.steelText else colors.inkSoft,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            ),
        )
    }
}

@Composable
private fun DurationChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val colors = DokkitTheme.colors
    Box(
        modifier = Modifier
            .height(32.dp)
            .clip(CircleShape)
            .background(if (selected) colors.mossWash else colors.line.copy(alpha = 0.3f))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(
            text = label,
            style = DokkitType.caption.copy(
                color = if (selected) colors.mossText else colors.inkSoft,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            ),
        )
    }
}

private fun fmtMins(mins: Int): String {
    if (mins < 60) return "${mins}m"
    val h = mins / 60
    val m = mins % 60
    return if (m == 0) "${h}h" else "${h}h ${m}m"
}
