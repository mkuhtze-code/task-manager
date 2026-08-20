package com.dokkit.app.ui.lab

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dokkit.app.core.control.DokkitButton
import com.dokkit.app.core.control.DokkitButtonVariant
import com.dokkit.app.core.control.DokkitCheck
import com.dokkit.app.core.control.DokkitDisclosureChevron
import com.dokkit.app.core.control.DokkitDisclosureRow
import com.dokkit.app.core.control.DokkitDragHandle
import com.dokkit.app.core.control.DokkitEmptyState
import com.dokkit.app.core.control.DokkitIconButton
import com.dokkit.app.core.control.DokkitProgress
import com.dokkit.app.core.control.DokkitReveal
import com.dokkit.app.core.control.DokkitTag
import com.dokkit.app.core.control.DokkitTextButton
import com.dokkit.app.core.control.DokkitToggle
import com.dokkit.app.core.icon.DokkitIcon
import com.dokkit.app.core.icon.DokkitIcons
import com.dokkit.app.core.sheet.DokkitSheet
import com.dokkit.app.core.sheet.DokkitSheetLink
import com.dokkit.app.core.sheet.DokkitSheetSectionTitle
import com.dokkit.app.core.surface.DokkitSurface
import com.dokkit.app.core.surface.dokkitSurface
import com.dokkit.app.core.theme.DokkitTheme
import com.dokkit.app.core.theme.DokkitThemePreference
import com.dokkit.app.core.theme.DokkitThemeState
import com.dokkit.app.core.theme.DokkitType

/**
 * Design Lab — an internal (non-user-facing) surface for visually
 * inspecting the Dokkit design system before Today/Travel are implemented.
 *
 * Not reachable from the bottom bar; opened from the Today header's compass
 * button. Shows typography, surfaces, colours, buttons, icons, disclosure,
 * sheets, empty states, task-like rows, travel-leg-like connectors, and
 * theme switching in one place.
 */
@Composable
fun DesignLabScreen(
    themeState: DokkitThemeState,
    onClose: () -> Unit,
) {
    val colors = DokkitTheme.colors
    var sheetOpen by remember { mutableStateOf(false) }
    var legOpen by remember { mutableStateOf(false) }
    var checkDone by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 10.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DokkitIconButton(
                icon = DokkitIcons.Back,
                contentDescription = "Close",
                onClick = onClose,
            )
            Spacer(Modifier.weight(1f))
            BasicText(
                text = "Design Lab",
                style = DokkitType.metadata.copy(
                    color = colors.inkFaint,
                    fontWeight = FontWeight.SemiBold,
                ),
            )
        }

        Section("Theme")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DokkitThemePreference.entries.forEach { pref ->
                DokkitToggle(
                    label = pref.label,
                    selected = themeState.preference == pref,
                    onClick = { themeState.onChange(pref) },
                    pill = true,
                )
            }
        }

        Section("Colour")
        ColorSwatch("paper", colors.paper)
        ColorSwatch("paperRaised", colors.paperRaised)
        ColorSwatch("steel", colors.steel)
        ColorSwatch("steelWash", colors.steelWash)
        ColorSwatch("moss wash", colors.mossWash)
        ColorSwatch("hazard wash", colors.hazardWash)
        ColorSwatch("danger wash", colors.dangerWash)
        ColorSwatch("overflow wash", colors.overflowWash)
        ColorSwatch("glass", colors.glass)
        ColorSwatch("ink", colors.ink)
        ColorSwatch("inkSoft", colors.inkSoft)
        ColorSwatch("inkFaint", colors.inkFaint)

        Section("Typography")
        TypeSample("displayMedium", DokkitType.displayMedium, colors.ink, "28sp / displayMedium")
        TypeSample("displaySmall", DokkitType.displaySmall, colors.ink, "21sp / displaySmall")
        TypeSample("bodyStrong", DokkitType.bodyStrong, colors.ink, "15sp / bodyStrong")
        TypeSample("body", DokkitType.body, colors.ink, "15sp / body")
        TypeSample("metadata", DokkitType.metadata, colors.inkSoft, "13sp / metadata")
        TypeSample("caption", DokkitType.caption, colors.inkFaint, "12sp / caption")
        TypeSample("overline", DokkitType.overline, colors.inkSoft, "11sp / overline")
        TypeSample("monoDigit", DokkitType.monoDigit, colors.ink, "15sp / monoDigit tnum")
        TypeSample("monoDisplay", DokkitType.monoDisplay, colors.ink, "24sp / monoDisplay tnum")

        Section("Surfaces")
        SurfaceDemo("page — paper", DokkitSurface.Page(radius = 14.dp), colors.inkSoft)
        SurfaceDemo("raised — paper-raised", DokkitSurface.Raised(radius = 14.dp), colors.ink)
        SurfaceDemo("hairline — raised + hairline", DokkitSurface.Hairline(radius = 14.dp), colors.ink)
        SurfaceDemo("glass — sheet surface", DokkitSurface.Glass(radius = 14.dp), colors.ink)
        SurfaceDemo(
            "wash — steel wash",
            DokkitSurface.Wash(wash = colors.steelWash, radius = 14.dp),
            colors.steelText,
        )

        Section("Icons")
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
            IconChip(DokkitIcons.Play)
            IconChip(DokkitIcons.Stop)
            IconChip(DokkitIcons.Plus)
            IconChip(DokkitIcons.Close)
            IconChip(DokkitIcons.Back)
            IconChip(DokkitIcons.Bed)
            IconChip(DokkitIcons.MapPin)
            IconChip(DokkitIcons.Compass)
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
            IconChip(DokkitIcons.Lock)
            IconChip(DokkitIcons.Gear)
            IconChip(DokkitIcons.Mic)
            IconChip(DokkitIcons.DragHandle)
            IconChip(DokkitIcons.Fit)
            IconChip(DokkitIcons.Warn)
            IconChip(DokkitIcons.Refresh)
            IconChip(DokkitIcons.Travel)
        }

        Section("Controls")
        Row(verticalAlignment = Alignment.CenterVertically) {
            DokkitCheck(done = checkDone, onClick = { checkDone = !checkDone })
            Spacer(Modifier.width(12.dp))
            DokkitButton(text = "Primary", onClick = {})
            Spacer(Modifier.width(8.dp))
            DokkitButton(text = "Ghost", onClick = {}, variant = DokkitButtonVariant.Ghost)
            Spacer(Modifier.width(8.dp))
            DokkitTextButton(text = "Inline", onClick = {})
        }
        Spacer(Modifier.height(12.dp))
        DokkitProgress(fraction = 0.5f, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DokkitTag(text = "Due today", wash = colors.hazardWash, textColor = colors.hazardText)
            DokkitTag(text = "45m", mono = true)
            DokkitTag(text = "2", wash = colors.steelWash, textColor = colors.steelText)
        }

        Section("Disclosure")
        var rowOpen by remember { mutableStateOf(false) }
        DokkitDisclosureRow(expanded = rowOpen, onClick = { rowOpen = !rowOpen }) {
            BasicText(
                text = if (rowOpen) "Reveal tier is open" else "Tap to reveal",
                style = DokkitType.metadata.copy(color = colors.ink),
            )
        }
        DokkitReveal(visible = rowOpen) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp)
                    .dokkitSurface(DokkitSurface.Wash(wash = colors.paper, radius = 10.dp))
                    .padding(12.dp),
            ) {
                BasicText(
                    text = "A quiet reveal layer appears under the row — the web's .task-reveal.",
                    style = DokkitType.caption.copy(color = colors.inkSoft),
                )
            }
        }

        Section("Sheet")
        DokkitButton(
            text = "Open a sheet",
            onClick = { sheetOpen = true },
            variant = DokkitButtonVariant.Ghost,
        )

        Section("Empty state")
        DokkitEmptyState(
            message = "Nothing scheduled.",
            modifier = Modifier
                .fillMaxWidth()
                .dokkitSurface(DokkitSurface.Raised(radius = 14.dp))
                .padding(16.dp),
        )

        Section("Task-like row")
        TaskLikeRow(done = checkDone)

        Section("Travel leg connector")
        Column(
            Modifier
                .fillMaxWidth()
                .dokkitSurface(DokkitSurface.Raised(radius = 14.dp)),
        ) {
            LegConnector(
                driveMins = 22,
                expanded = legOpen,
                onClick = { legOpen = !legOpen },
            )
            DokkitReveal(visible = legOpen) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(start = 40.dp, end = 12.dp, bottom = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    DokkitIcon(
                        imageVector = DokkitIcons.MapPin,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = colors.inkFaint,
                    )
                    Spacer(Modifier.width(6.dp))
                    BasicText(
                        text = "1st & Main — riverfront",
                        style = DokkitType.caption.copy(color = colors.inkSoft),
                    )
                }
            }
        }
        Spacer(Modifier.height(40.dp))
    }

    if (sheetOpen) {
        DokkitSheet(
            onDismiss = { sheetOpen = false },
            title = "Day overview",
        ) {
            DokkitSheetSectionTitle("where you're staying")
            DokkitSheetLink(icon = DokkitIcons.Bed, label = "Rivermark Hotel", onClick = {})
            Spacer(Modifier.height(10.dp))
            DokkitSheetSectionTitle("arrange")
            DokkitSheetLink(icon = DokkitIcons.Compass, label = "Map of the day", onClick = {})
        }
    }
}

// ── Lab building blocks ─────────────────────────────────────────────────

@Composable
private fun Section(title: String) {
    val colors = DokkitTheme.colors
    Spacer(Modifier.height(22.dp))
    BasicText(
        text = title.uppercase(),
        style = DokkitType.overline.copy(color = colors.inkFaint, fontSize = 10.sp),
    )
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun ColorSwatch(name: String, color: Color) {
    val colors = DokkitTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(22.dp)
                .background(color),
        )
        Spacer(Modifier.width(10.dp))
        BasicText(
            text = name,
            style = DokkitType.caption.copy(color = colors.ink),
        )
    }
}

@Composable
private fun TypeSample(
    name: String,
    style: TextStyle,
    color: Color,
    spec: String,
) {
    val colors = DokkitTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicText(
            text = "Ak",
            modifier = Modifier.width(90.dp),
            style = style.copy(color = color),
        )
        Column {
            BasicText(
                text = name,
                style = DokkitType.metadata.copy(color = colors.ink),
            )
            BasicText(
                text = spec,
                style = DokkitType.caption.copy(color = colors.inkFaint),
            )
        }
    }
}

@Composable
private fun SurfaceDemo(label: String, surface: DokkitSurface, textColor: Color) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .dokkitSurface(surface)
            .padding(12.dp),
    ) {
        BasicText(text = label, style = DokkitType.caption.copy(color = textColor))
    }
}

@Composable
private fun IconChip(vector: ImageVector) {
    val colors = DokkitTheme.colors
    DokkitIcon(
        imageVector = vector,
        contentDescription = null,
        modifier = Modifier.size(20.dp),
        tint = colors.ink,
    )
}

@Composable
private fun TaskLikeRow(done: Boolean) {
    val colors = DokkitTheme.colors
    var open by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .dokkitSurface(DokkitSurface.Raised(radius = 14.dp))
            .clickable { open = !open }
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DokkitCheck(done = done, onClick = {})
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            BasicText(
                text = "File Q3 receipts",
                style = DokkitType.bodyStrong.copy(color = colors.ink),
            )
            BasicText(
                text = "Home",
                style = DokkitType.caption.copy(color = colors.inkFaint),
            )
        }
        BasicText(
            text = "1h 15m",
            style = DokkitType.monoBody.copy(color = colors.inkFaint),
        )
        Spacer(Modifier.width(6.dp))
        DokkitDisclosureChevron(expanded = open)
    }
}

@Composable
private fun LegConnector(
    driveMins: Int,
    expanded: Boolean,
    onClick: () -> Unit,
) {
    val colors = DokkitTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Spacer(Modifier.width(10.dp))
        // The connector hairline with a tiny mono drive-time label.
        Box(
            Modifier
                .weight(1f)
                .height(1.dp)
                .background(colors.line),
        )
        Spacer(Modifier.width(8.dp))
        BasicText(
            text = "${driveMins}m",
            style = DokkitType.monoMicro.copy(color = colors.inkFaint),
        )
        Spacer(Modifier.width(8.dp))
        DokkitDisclosureChevron(expanded = expanded)
        Spacer(Modifier.width(10.dp))
    }
}

private val DokkitThemePreference.label: String
    get() = when (this) {
        DokkitThemePreference.System -> "System"
        DokkitThemePreference.Light -> "Light"
        DokkitThemePreference.Dark -> "Dark"
    }