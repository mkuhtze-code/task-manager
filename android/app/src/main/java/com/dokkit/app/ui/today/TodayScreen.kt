package com.dokkit.app.ui.today

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dokkit.app.core.control.DokkitButton
import com.dokkit.app.core.control.DokkitButtonVariant
import com.dokkit.app.core.control.DokkitCheck
import com.dokkit.app.core.control.DokkitDisclosureChevron
import com.dokkit.app.core.control.DokkitEmptyState
import com.dokkit.app.core.control.DokkitFab
import com.dokkit.app.core.control.DokkitIconButton
import com.dokkit.app.core.control.DokkitProgress
import com.dokkit.app.core.control.DokkitReveal
import com.dokkit.app.core.control.DokkitTag
import com.dokkit.app.core.control.DokkitTextButton
import com.dokkit.app.core.icon.DokkitIcons
import com.dokkit.app.core.surface.DokkitSurface
import com.dokkit.app.core.surface.dokkitSurface
import com.dokkit.app.core.theme.DokkitTheme
import com.dokkit.app.core.theme.DokkitThemePreference
import com.dokkit.app.core.theme.DokkitThemeState
import com.dokkit.app.core.theme.DokkitType
import com.dokkit.app.domain.model.RealityUpdate
import com.dokkit.app.domain.model.Task
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * Representative Today surface — a *visual prototype* of the real grammar.
 * Reality Check is wired so the loop is reachable and testable against
 * sample tasks. Full repository / offline reshape comes next.
 */
@Composable
fun TodayScreen(
    themeState: DokkitThemeState,
    onOpenDesignLab: () -> Unit,
) {
    val colors = DokkitTheme.colors
    var realityCheckOpen by remember { mutableStateOf(false) }
    var reshapeMessage by remember { mutableStateOf<String?>(null) }

    // Prototype samples mapped to domain Tasks for RealityCheckSheet.
    val todayTasks = remember { Samples.asDomainTasks() }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .statusBarsPadding()
                .padding(horizontal = 16.dp),
        ) {
            TodayHeader(
                themeState = themeState,
                onOpenDesignLab = onOpenDesignLab,
                onOpenRealityCheck = { realityCheckOpen = true },
            )
            Spacer(Modifier.height(18.dp))
            CapacityRail()
            Spacer(Modifier.height(8.dp))

            // Quiet entry point — secondary to the day, not a primary CTA.
            DokkitTextButton(
                text = "Reality check",
                onClick = { realityCheckOpen = true },
            )

            reshapeMessage?.let { msg ->
                Spacer(Modifier.height(6.dp))
                BasicText(
                    text = msg,
                    style = DokkitType.caption.copy(color = colors.mossText),
                )
            }

            Spacer(Modifier.height(14.dp))

            Samples.tasks.forEachIndexed { index, sample ->
                TaskRowSample(sample = sample)
                if (index < Samples.tasks.lastIndex) {
                    Spacer(Modifier.height(8.dp))
                }
            }

            Spacer(Modifier.height(26.dp))
            DokkitEmptyState(message = "Nothing scheduled for the evening.")
            Spacer(Modifier.height(30.dp))
        }

        DokkitFab(
            onClick = { /* capture sheet — reserved */ },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .navigationBarsPadding()
                .padding(end = 20.dp, bottom = 20.dp),
        )

        if (realityCheckOpen) {
            RealityCheckSheet(
                tasks = todayTasks,
                onDismiss = { realityCheckOpen = false },
                onReshape = { updates ->
                    realityCheckOpen = false
                    reshapeMessage = formatReshapeConfirmation(updates)
                },
            )
        }
    }
}

// ── Header ──────────────────────────────────────────────────────────────

@Composable
private fun TodayHeader(
    themeState: DokkitThemeState,
    onOpenDesignLab: () -> Unit,
    onOpenRealityCheck: () -> Unit,
) {
    val colors = DokkitTheme.colors
    val today = LocalDate.now()
    val weekday = today.format(DateTimeFormatter.ofPattern("EEEE"))
    val monthDay = today.format(DateTimeFormatter.ofPattern("MMMM d"))

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 18.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            BasicText(
                text = weekday.uppercase(),
                style = DokkitType.overline.copy(
                    color = colors.steelText,
                    letterSpacing = 0.8.sp,
                ),
            )
            BasicText(
                text = monthDay,
                style = DokkitType.displaySmall.copy(color = colors.ink),
            )
        }
        DokkitIconButton(
            icon = DokkitIcons.Fit,
            contentDescription = "Reality check",
            onClick = onOpenRealityCheck,
            tint = colors.inkFaint,
        )
        DokkitIconButton(
            icon = DokkitIcons.Gear,
            contentDescription = "Theme (light / dark / system)",
            onClick = { cycleTheme(themeState) },
            tint = colors.inkFaint,
        )
        DokkitIconButton(
            icon = DokkitIcons.Compass,
            contentDescription = "Design lab",
            onClick = onOpenDesignLab,
            tint = colors.inkFaint,
        )
    }
}

private fun cycleTheme(state: DokkitThemeState) {
    state.onChange(
        when (state.preference) {
            DokkitThemePreference.System -> DokkitThemePreference.Light
            DokkitThemePreference.Light -> DokkitThemePreference.Dark
            DokkitThemePreference.Dark -> DokkitThemePreference.System
        }
    )
}

// ── Capacity rail ───────────────────────────────────────────────────────

@Composable
private fun CapacityRail() {
    val colors = DokkitTheme.colors
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BasicText(
                text = "Fits · 2h 10m spare",
                style = DokkitType.metadata.copy(
                    color = colors.mossText,
                    fontWeight = FontWeight.SemiBold,
                ),
            )
            BasicText(
                text = "3h 50m planned",
                style = DokkitType.monoMicro.copy(color = colors.inkFaint),
            )
        }
        Spacer(Modifier.height(4.dp))
        DokkitProgress(fraction = 0.64f)
    }
}

// ── Task row sample ─────────────────────────────────────────────────────

private data class TaskSample(
    val id: String,
    val text: String,
    val estimateMins: Int,
    val progress: Float,
    val meta: String,
    val due: Boolean,
    val expanded: Boolean,
)

private object Samples {
    val tasks = listOf(
        TaskSample(
            id = "sample-1",
            text = "Review the site-map lightbox",
            estimateMins = 45,
            progress = 0.62f,
            meta = "2h 20m on this today",
            due = true,
            expanded = true,
        ),
        TaskSample(
            id = "sample-2",
            text = "Draft home screen copy",
            estimateMins = 75,
            progress = 0f,
            meta = "At the studio",
            due = false,
            expanded = false,
        ),
        TaskSample(
            id = "sample-3",
            text = "Site visit · Harbour Street",
            estimateMins = 60,
            progress = 0f,
            meta = "Travel 12 min",
            due = true,
            expanded = false,
        ),
    )

    fun asDomainTasks(): List<Task> = tasks.map { sample ->
        Task(
            id = sample.id,
            text = sample.text,
            estimateMins = sample.estimateMins,
            status = "pending",
            dueToday = sample.due,
        )
    }
}

@Composable
private fun TaskRowSample(sample: TaskSample) {
    val colors = DokkitTheme.colors
    var done by remember { mutableStateOf(false) }
    var open by remember { mutableStateOf(sample.expanded) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .dokkitSurface(DokkitSurface.Raised(radius = 16.dp))
            .clickable { open = !open }
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            DokkitCheck(done = done, onClick = { done = !done })
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                BasicText(
                    text = sample.text,
                    style = DokkitType.bodyStrong.copy(color = colors.ink),
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    BasicText(
                        text = sample.meta,
                        style = DokkitType.caption.copy(color = colors.inkFaint),
                    )
                    if (sample.due) {
                        DokkitTag(
                            text = "Due today",
                            wash = colors.steelWash,
                            textColor = colors.steelText,
                        )
                    }
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                BasicText(
                    text = fmtMins(sample.estimateMins),
                    style = DokkitType.monoBody.copy(
                        color = if (sample.progress > 0f) colors.ink else colors.inkFaint,
                        fontWeight = FontWeight.SemiBold,
                    ),
                )
                if (sample.progress > 0f) {
                    BasicText(
                        text = "left",
                        style = DokkitType.caption.copy(color = colors.inkFaint),
                    )
                }
            }
            Spacer(Modifier.width(6.dp))
            DokkitDisclosureChevron(expanded = open)
        }

        DokkitReveal(visible = open) {
            Column(modifier = Modifier.padding(start = 36.dp, top = 10.dp)) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(colors.line),
                )
                Spacer(Modifier.height(10.dp))
                DokkitProgress(
                    fraction = sample.progress,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DokkitButton(
                        text = if (sample.progress > 0f) "Resume" else "Start",
                        onClick = {},
                        variant = DokkitButtonVariant.Ghost,
                    )
                    DokkitTextButton(text = "Complete", onClick = {})
                }
            }
        }
    }
}

private fun formatReshapeConfirmation(updates: List<RealityUpdate>): String {
    val done = updates.count { it.outcome == "done" }
    val carried = updates.count { it.outcome == "carried" || it.outcome == "partial" }
    val skipped = updates.count { it.outcome == "skipped" }
    return buildString {
        append("Plan updated.")
        if (done > 0) append(" $done done.")
        if (carried > 0) append(" $carried carried forward.")
        if (skipped > 0) append(" $skipped skipped.")
    }
}

private fun fmtMins(mins: Int): String {
    if (mins < 60) return "${mins}m"
    val h = mins / 60
    val m = mins % 60
    return if (m == 0) "${h}h" else "${h}h ${m}m"
}
