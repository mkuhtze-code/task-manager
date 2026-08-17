package com.dokkit.app.core.icon

import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * Dokkit's icon set, ported faithfully from components/icons.tsx.
 *
 * Two grammars, matching the web:
 *  - Play/Stop/Gear/Mic are solid-filled marks.
 *  - Everything else is a shared line icon on a 24dp grid, stroke-based,
 *    inheriting color and scaling with its button.
 *
 * The completion check (CheckIcon) is deliberately a *control*, not a bare
 * glyph — see DokkitCheck. Icons are never wrapped in decorative circles by
 * default; Dokkit draws them bare. Semantic sizing (13-16 meta / 16-18
 * inline / ~20 controls) is applied by the calling control, not baked in.
 */
object DokkitIcons {

    private fun stroke(
        width: Float = 24f,
        strokeWidth: Float = 2f,
        strokeCap: StrokeCap = StrokeCap.Round,
        strokeJoin: StrokeJoin = StrokeJoin.Round,
        block: PathBuilder.() -> Unit,
    ): ImageVector = ImageVector.Builder(
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = width,
        viewportHeight = width,
    ).apply {
        path(
            fill = null,
            stroke = SolidColor(Color.Black),
            strokeLineWidth = strokeWidth,
            strokeLineCap = strokeCap,
            strokeLineJoin = strokeJoin,
            pathBuilder = block,
        )
    }.build()

    /** Timer start — PlayIcon (filled triangle). */
    val Play: ImageVector = ImageVector.Builder(
        defaultWidth = 24.dp, defaultHeight = 24.dp,
        viewportWidth = 24f, viewportHeight = 24f,
    ).apply {
        path(fill = SolidColor(Color.Black)) {
            moveTo(7f, 5.5f)
            curveTo(7f, 4.3f, 8.3f, 3.6f, 9.3f, 4.2f)
            lineTo(19.3f, 10.7f)
            curveTo(20.2f, 11.3f, 20.2f, 12.7f, 19.3f, 13.3f)
            lineTo(9.3f, 19.8f)
            curveTo(8.3f, 20.4f, 7f, 19.7f, 7f, 18.5f)
            close()
        }
    }.build()

    /** Timer stop — StopIcon (rounded square). */
    val Stop: ImageVector = ImageVector.Builder(
        defaultWidth = 24.dp, defaultHeight = 24.dp,
        viewportWidth = 24f, viewportHeight = 24f,
    ).apply {
        path(fill = SolidColor(Color.Black)) {
            moveTo(6f, 6f)
            lineTo(18f, 6f)
            curveTo(18.55f, 6f, 19f, 6.45f, 19f, 7f)
            lineTo(19f, 17f)
            curveTo(19f, 17.55f, 18.55f, 18f, 18f, 18f)
            lineTo(6f, 18f)
            curveTo(5.45f, 18f, 5f, 17.55f, 5f, 17f)
            lineTo(5f, 7f)
            curveTo(5f, 6.45f, 5.45f, 6f, 6f, 6f)
            close()
        }
    }.build()

    /** Fits well — FitCheckIcon. */
    val Fit = stroke(strokeWidth = 3f) {
        moveTo(5f, 13f); lineTo(9f, 17f); lineTo(19f, 7f)
    }

    /** Won't fit — FitWarnIcon (triangle with exclamation). */
    val Warn = stroke(strokeWidth = 2f) {
        moveTo(12f, 8.6f); lineTo(12f, 12.6f)
        moveTo(12f, 15.4f); lineTo(12f, 15.9f)
        moveTo(10.9f, 4.2f)
        lineTo(10.9f, 4.2f)
        lineTo(2.72f, 18.2f)
        curveTo(2.25f, 18.96f, 2.8f, 19.5f, 3.68f, 19.5f)
        lineTo(20.32f, 19.5f)
        curveTo(21.2f, 19.5f, 21.75f, 18.96f, 21.28f, 18.2f)
        lineTo(13.1f, 4.2f)
        curveTo(13.1f, 4.2f, 11.16f, 4.2f, 10.9f, 4.2f)
        close()
    }

    /** Reorder grip — DragHandleIcon (six dots). */
    val DragHandle: ImageVector = ImageVector.Builder(
        defaultWidth = 24.dp, defaultHeight = 24.dp,
        viewportWidth = 24f, viewportHeight = 24f,
    ).apply {
        repeat(2) { row ->
            repeat(3) { col ->
                val cx = 9f + col * 6f
                val cy = 6f + row * 6f
                path(fill = SolidColor(Color.Black)) {
                    moveTo(cx, cy - 1.6f)
                    arcToRelative(1.6f, 1.6f, 0f, true, true, 0f, 3.2f)
                    arcToRelative(1.6f, 1.6f, 0f, true, true, 0f, -3.2f)
                    close()
                }
            }
        }
    }.build()

    /** Back — BackIcon. */
    val Back = stroke(strokeWidth = 2f) {
        moveTo(15f, 5.5f); lineTo(8.5f, 12f); lineTo(15f, 18.5f)
    }

    /** Add — PlusIcon. */
    val Plus = stroke(strokeWidth = 2f) {
        moveTo(12f, 5f); lineTo(12f, 19f); moveTo(5f, 12f); lineTo(19f, 12f)
    }

    /** Close — CloseIcon. */
    val Close = stroke(strokeWidth = 2f) {
        moveTo(6.4f, 6.4f); lineTo(17.6f, 17.6f); moveTo(17.6f, 6.4f); lineTo(6.4f, 17.6f)
    }

    /** Delete — TrashIcon. */
    val Trash = stroke(strokeWidth = 1.7f) {
        moveTo(4f, 7f); lineTo(20f, 7f)
        moveTo(9f, 7f); lineTo(9f, 4f); lineTo(15f, 4f); lineTo(15f, 7f)
        moveTo(6f, 7f); lineTo(7f, 20f)
        curveTo(7.1f, 21.1f, 8f, 22f, 9.1f, 22f)
        lineTo(14.9f, 22f)
        curveTo(16f, 22f, 16.9f, 21.1f, 17f, 20f)
        lineTo(18f, 7f)
        moveTo(10f, 11f); lineTo(10f, 17f); moveTo(14f, 11f); lineTo(14f, 17f)
    }

    /** Stay / accommodation — BedIcon. */
    val Bed = stroke(strokeWidth = 1.7f) {
        moveTo(3f, 20f); lineTo(3f, 7f)
        moveTo(21f, 20f); lineTo(21f, 12f)
        curveTo(21f, 10.9f, 20.1f, 10f, 19f, 10f)
        lineTo(10f, 10f); lineTo(10f, 20f)
        moveTo(3f, 15f); lineTo(21f, 15f)
    }

    /** Access / invite — LockIcon. */
    val Lock = stroke(strokeWidth = 1.7f) {
        moveTo(5f, 11f); lineTo(19f, 11f)
        curveTo(20.1f, 11f, 21f, 11.9f, 21f, 13f)
        lineTo(21f, 20f)
        curveTo(21f, 21.1f, 20.1f, 22f, 19f, 22f)
        lineTo(5f, 22f)
        curveTo(3.9f, 22f, 3f, 21.1f, 3f, 20f)
        lineTo(3f, 13f)
        curveTo(3f, 11.9f, 3.9f, 11f, 5f, 11f)
        close()
        moveTo(8f, 11f); lineTo(8f, 7f)
        curveTo(8f, 5.34f, 9.79f, 4f, 12f, 4f)
        curveTo(14.21f, 4f, 16f, 5.34f, 16f, 7f)
        lineTo(16f, 11f)
    }

    /** Disclosure chevron (down) — ChevronIcon. */
    val Chevron = stroke(strokeWidth = 1.8f) {
        moveTo(6f, 9.5f); lineTo(12f, 15.5f); lineTo(18f, 9.5f)
    }

    /** Right-pointing chevron — the travel row's affordance. */
    val ChevronRight = stroke(strokeWidth = 1.8f) {
        moveTo(9.5f, 6f); lineTo(15.5f, 12f); lineTo(9.5f, 18f)
    }

    /** Location pin — MapPinIcon. */
    val MapPin = stroke(strokeWidth = 1.7f) {
        // Teardrop + inner dot approximated from the stroke grammar.
        moveTo(12f, 21f)
        curveTo(12f, 21f, 5.5f, 15.5f, 5.5f, 10f)
        moveTo(5.5f, 10f)
        curveTo(5.5f, 6.4f, 8.4f, 3.5f, 12f, 3.5f)
        curveTo(15.6f, 3.5f, 18.5f, 6.4f, 18.5f, 10f)
        curveTo(18.5f, 15.5f, 12f, 21f, 12f, 21f)
        moveTo(12f, 12.4f)
        curveTo(10.7f, 12.4f, 9.7f, 11.3f, 9.7f, 10f)
        curveTo(9.7f, 8.7f, 10.7f, 7.6f, 12f, 7.6f)
        curveTo(13.3f, 7.6f, 14.3f, 8.7f, 14.3f, 10f)
        curveTo(14.3f, 11.3f, 13.3f, 12.4f, 12f, 12.4f)
    }

    /** Recalculate — RefreshIcon (open circular arrows). */
    val Refresh = stroke(strokeWidth = 1.7f) {
        // Open circle arc + arrow head.
        moveTo(20f, 12f)
        arcToRelative(8f, 8f, 0f, true, true, -2.4f, -5.66f)
        moveTo(20f, 3f); lineTo(20f, 8.5f); lineTo(14.5f, 8.5f)
    }

    /** Nearby exploration — CompassIcon. */
    val Compass = stroke(strokeWidth = 1.7f) {
        moveTo(12f, 3f); arcToRelative(9f, 9f, 0f, true, true, 0f, 18f); arcToRelative(9f, 9f, 0f, true, true, 0f, -18f)
        // Needle (rotated 45°, web draws it filled).
        moveTo(15.5f, 8.5f); lineTo(13.8f, 13.8f); lineTo(8.5f, 15.5f)
        lineTo(10.2f, 10.2f); close()
    }

    /** Settings — GearIcon (from GearMenu, filled). */
    val Gear: ImageVector = ImageVector.Builder(
        defaultWidth = 24.dp, defaultHeight = 24.dp,
        viewportWidth = 24f, viewportHeight = 24f,
    ).apply {
        path(
            fill = SolidColor(Color.Black),
            pathBuilder = {
                moveTo(19.14f, 12.94f)
                curveTo(19.18f, 12.64f, 19.2f, 12.33f, 19.2f, 12f)
                curveTo(19.2f, 11.67f, 19.18f, 11.36f, 19.13f, 11.06f)
                lineTo(21.16f, 9.48f)
                curveTo(21.38f, 9.31f, 21.44f, 9.01f, 21.28f, 8.87f)
                lineTo(19.36f, 5.55f)
                curveTo(19.24f, 5.33f, 18.99f, 5.26f, 18.77f, 5.33f)
                lineTo(16.38f, 6.29f)
                curveTo(15.88f, 5.91f, 15.35f, 5.59f, 14.76f, 5.35f)
                lineTo(14.4f, 2.81f)
                curveTo(14.36f, 2.57f, 14.16f, 2.4f, 13.92f, 2.4f)
                lineTo(10.08f, 2.4f)
                curveTo(9.84f, 2.4f, 9.64f, 2.57f, 9.61f, 2.81f)
                lineTo(9.25f, 5.35f)
                curveTo(8.66f, 5.59f, 8.13f, 5.91f, 7.63f, 6.29f)
                lineTo(5.24f, 5.33f)
                curveTo(5.02f, 5.26f, 4.77f, 5.33f, 4.65f, 5.55f)
                lineTo(2.73f, 8.87f)
                curveTo(2.57f, 9.01f, 2.63f, 9.31f, 2.85f, 9.48f)
                lineTo(4.88f, 11.06f)
                curveTo(4.83f, 11.36f, 4.81f, 11.67f, 4.81f, 12f)
                curveTo(4.81f, 12.33f, 4.83f, 12.64f, 4.88f, 12.94f)
                lineTo(2.85f, 14.52f)
                curveTo(2.63f, 14.69f, 2.57f, 14.99f, 2.73f, 15.13f)
                lineTo(4.65f, 18.45f)
                curveTo(4.77f, 18.67f, 5.02f, 18.74f, 5.24f, 18.67f)
                lineTo(7.63f, 17.71f)
                curveTo(8.13f, 18.09f, 8.66f, 18.41f, 9.25f, 18.65f)
                lineTo(9.61f, 21.19f)
                curveTo(9.65f, 21.43f, 9.85f, 21.6f, 10.09f, 21.6f)
                lineTo(13.93f, 21.6f)
                curveTo(14.17f, 21.6f, 14.37f, 21.43f, 14.4f, 21.19f)
                lineTo(14.76f, 18.65f)
                curveTo(15.35f, 18.41f, 15.88f, 18.09f, 16.38f, 17.71f)
                lineTo(18.77f, 18.67f)
                curveTo(18.99f, 18.74f, 19.24f, 18.67f, 19.36f, 18.45f)
                lineTo(21.28f, 15.13f)
                curveTo(21.44f, 14.99f, 21.38f, 14.69f, 21.16f, 14.52f)
                close()
                // Inner hub: a 3.6r circle centred on (12,12).
                moveTo(12f, 8.4f)
                arcTo(3.6f, 3.6f, 0f, true, true, 12f, 15.6f)
                arcTo(3.6f, 3.6f, 0f, true, true, 12f, 8.4f)
                close()
            },
        )
    }.build()

    /** Voice capture — MicIcon (from MicButton). */
    val Mic: ImageVector = ImageVector.Builder(
        defaultWidth = 24.dp, defaultHeight = 24.dp,
        viewportWidth = 24f, viewportHeight = 24f,
    ).apply {
        path(
            fill = SolidColor(Color.Black),
            pathBuilder = {
                // Mic capsule: rounded top, flat-ish bowl opening upward.
                moveTo(9f, 6f)
                curveTo(9f, 4.34f, 10.34f, 3f, 12f, 3f)
                curveTo(13.66f, 3f, 15f, 4.34f, 15f, 6f)
                lineTo(15f, 12f)
                arcTo(3f, 3f, 0f, false, false, 12f, 15f)
                arcTo(3f, 3f, 0f, false, false, 9f, 12f)
                close()
            },
        )
        path(
            fill = null,
            stroke = SolidColor(Color.Black),
            strokeLineWidth = 2f,
            strokeLineCap = StrokeCap.Round,
            pathBuilder = {
                moveTo(19f, 11f)
                arcTo(7f, 7f, 0f, false, true, 5f, 11f)
                moveTo(12f, 18f); lineTo(12f, 21f)
            },
        )
    }.build()

    /** Navigation: Today. An unadorned day mark. */
    val Today = stroke(strokeWidth = 1.7f) {
        moveTo(12f, 3.5f); arcToRelative(8.5f, 8.5f, 0f, true, true, 0f, 17f); arcToRelative(8.5f, 8.5f, 0f, true, true, 0f, -17f)
        moveTo(12f, 3f); lineTo(12f, 5f)
        moveTo(3f, 12f); lineTo(5f, 12f)
        moveTo(19f, 12f); lineTo(21f, 12f)
        moveTo(12f, 19f); lineTo(12f, 21f)
    }

    /** Navigation: Jobs. A paper stack. */
    val Jobs = stroke(strokeWidth = 1.7f) {
        moveTo(5f, 4f); lineTo(19f, 4f)
        curveTo(19.55f, 4f, 20f, 4.45f, 20f, 5f)
        lineTo(20f, 12f)
        curveTo(20f, 12.55f, 19.55f, 13f, 19f, 13f)
        lineTo(5f, 13f)
        curveTo(4.45f, 13f, 4f, 12.55f, 4f, 12f)
        lineTo(4f, 5f)
        curveTo(4f, 4.45f, 4.45f, 4f, 5f, 4f)
        // baseline ticks
        moveTo(4.5f, 17f); lineTo(19.5f, 17f)
        moveTo(4.5f, 20.5f); lineTo(19.5f, 20.5f)
    }

    /** Navigation: Travel. A paper plane. */
    val Travel = stroke(strokeWidth = 1.7f) {
        moveTo(3f, 11f); lineTo(21f, 3.5f)
        lineTo(16.5f, 21f); lineTo(10.5f, 14.5f); close()
        moveTo(10.5f, 14.5f); lineTo(21f, 3.5f)
    }

}

/**
 * Consistent Dokkit icon composable — sizes, tints and describes any
 * [DokkitIcons] vector using the calling context's content color.
 */
@Composable
fun DokkitIcon(
    imageVector: ImageVector,
    modifier: Modifier = Modifier,
    tint: Color = LocalContentColor.current,
    contentDescription: String? = null,
) {
    Icon(
        imageVector = imageVector,
        contentDescription = contentDescription,
        modifier = modifier,
        tint = tint,
    )
}