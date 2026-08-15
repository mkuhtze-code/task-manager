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
 * Dokkit's icon set, ported from components/icons.tsx.
 *
 * Only the icons the current product actually uses are recreated as
 * ImageVectors (stroke-based, 24dp grid, inheriting color through tint) —
 * exposed via one object so screens tint and size through the single
 * [DokkitIcon] composable instead of instantiating raw vectors.
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

    /** Completion check — CheckIcon (web strokes a circle + check). */
    val Check = stroke(width = 18f, strokeWidth = 1.6f) {
        moveTo(5.2f, 9.4f); lineTo(7.8f, 12f); lineTo(13f, 6.5f)
    }

    /** Timer start — PlayIcon. */
    val Play = stroke(strokeWidth = 1.8f) {
        moveTo(8f, 5.5f); lineTo(17f, 12f); lineTo(8f, 18.5f); close()
    }

    /** Timer stop — StopIcon. */
    val Stop = stroke(strokeWidth = 1.8f) {
        moveTo(8.5f, 8.5f); lineTo(15.5f, 15.5f); moveTo(15.5f, 8.5f); lineTo(8.5f, 15.5f)
    }

    /** Fits well — FitCheckIcon. */
    val Fit = stroke(strokeWidth = 2.4f) {
        moveTo(4.6f, 12.6f); lineTo(9.6f, 16.4f); lineTo(19.4f, 7f)
    }

    /** Won't fit — FitWarnIcon (triangle + exclamation). */
    val Warn = stroke(strokeWidth = 2f, strokeJoin = StrokeJoin.Round) {
        moveTo(12f, 8.6f); lineTo(12f, 12.6f)
        moveTo(12f, 15.6f); lineTo(12f, 16.1f)
        moveTo(10.9f, 4.2f); lineTo(12f, 6.1f); lineTo(13.1f, 4.2f)
        lineTo(13.1f, 4.2f); lineTo(20.1f, 16.9f)
        lineTo(20.1f, 16.9f); lineTo(3.9f, 16.9f); lineTo(10.9f, 4.2f); close()
    }

    /** Back — BackIcon. */
    val Back = stroke(strokeWidth = 2f) {
        moveTo(15.5f, 5f); lineTo(8.5f, 12f); lineTo(15.5f, 19f)
    }

    /** Add — PlusIcon. */
    val Plus = stroke(strokeWidth = 2f) {
        moveTo(12f, 5.5f); lineTo(12f, 18.5f); moveTo(5.5f, 12f); lineTo(18.5f, 12f)
    }

    /** Close — CloseIcon. */
    val Close = stroke(strokeWidth = 2f) {
        moveTo(6.5f, 6.5f); lineTo(17.5f, 17.5f); moveTo(17.5f, 6.5f); lineTo(6.5f, 17.5f)
    }

    /** Delete — TrashIcon. */
    val Trash = stroke(strokeWidth = 1.7f) {
        moveTo(4f, 7f); lineTo(20f, 7f)
        moveTo(9f, 7f); lineTo(9f, 4f); lineTo(15f, 4f); lineTo(15f, 7f)
        moveTo(6.2f, 7f); lineTo(7f, 19f)
        lineTo(7f, 19f); lineTo(17f, 19f); lineTo(17.8f, 7f)
        moveTo(10f, 11f); lineTo(10f, 16f); moveTo(14f, 11f); lineTo(14f, 16f)
    }

    /** Stay / accommodation — BedIcon. */
    val Bed = stroke(strokeWidth = 1.7f) {
        moveTo(3f, 19f); lineTo(3f, 6f)
        moveTo(21f, 19f); lineTo(21f, 12f)
        lineTo(21f, 12f); lineTo(12f, 12f); lineTo(12f, 19f)
        moveTo(3f, 14.5f); lineTo(21f, 14.5f)
    }

    /** Disclosure chevron (down) — ChevronIcon. */
    val Chevron = stroke(strokeWidth = 1.8f) {
        moveTo(6f, 9.5f); lineTo(12f, 15.5f); lineTo(18f, 9.5f)
    }

    /** Location pin — MapPinIcon. */
    val MapPin = stroke(strokeWidth = 1.7f) {
        moveTo(12f, 21f)
        lineTo(12f, 21f)
        lineTo(5.5f, 13.8f)
        lineTo(5.5f, 10.2f)
        lineTo(18.5f, 10.2f)
        lineTo(18.5f, 13.8f)
        lineTo(12f, 21f)
        close()
        moveTo(12f, 12.5f); lineTo(12f, 12.5f)
    }

    /** Recalculate — RefreshIcon (circular arrows). */
    val Refresh = stroke(strokeWidth = 1.7f) {
        moveTo(21f, 12f)
        lineTo(21f, 12f)
        moveTo(3f, 12f)
        lineTo(3f, 12f)
        moveTo(6.9f, 5.9f)
        lineTo(4f, 9.2f); lineTo(7.6f, 11.9f)
        moveTo(17.1f, 18.1f)
        lineTo(20f, 14.8f); lineTo(16.4f, 12.1f)
    }

    /** Nearby exploration — CompassIcon. */
    val Compass = stroke(strokeWidth = 1.7f) {
        moveTo(12f, 3f); lineTo(12f, 21f)
        moveTo(3f, 12f); lineTo(21f, 12f)
        moveTo(12f, 7f); lineTo(12f, 8.5f)
        moveTo(12f, 15.5f); lineTo(12f, 17f)
        moveTo(7f, 12f); lineTo(8.5f, 12f)
        moveTo(15.5f, 12f); lineTo(17f, 12f)
    }

    /** Lock — LockIcon. */
    val Lock = stroke(strokeWidth = 1.7f) {
        moveTo(5f, 11f); lineTo(19f, 11f)
        lineTo(19f, 11f); lineTo(19f, 20f); lineTo(5f, 20f); lineTo(5f, 11f); close()
        moveTo(8f, 11f); lineTo(8f, 7f)
        lineTo(8f, 7f); lineTo(16f, 7f); lineTo(16f, 11f)
    }

    /** Settings — GearIcon (from GearMenu). */
    val Gear = stroke(strokeWidth = 1.7f) {
        moveTo(12f, 8.5f)
        lineTo(12f, 8.5f)
        // Simplified gear: circle + 8 notches approximated by rays.
        moveTo(12f, 3.5f); lineTo(12f, 5.8f); moveTo(12f, 18.2f); lineTo(12f, 20.5f)
        moveTo(3.5f, 12f); lineTo(5.8f, 12f); moveTo(18.2f, 12f); lineTo(20.5f, 12f)
        moveTo(6f, 6f); lineTo(7.7f, 7.7f); moveTo(16.3f, 16.3f); lineTo(18f, 18f)
        moveTo(18f, 6f); lineTo(16.3f, 7.7f); moveTo(7.7f, 16.3f); lineTo(6f, 18f)
    }

    /** Navigation: Today. A day/sun mark. */
    val Today = stroke(strokeWidth = 1.7f) {
        moveTo(12f, 4.5f); lineTo(12f, 6.5f)
        moveTo(12f, 17.5f); lineTo(12f, 19.5f)
        moveTo(4.5f, 12f); lineTo(6.5f, 12f)
        moveTo(17.5f, 12f); lineTo(19.5f, 12f)
    }

    /** Navigation: Jobs. A briefcase mark. */
    val Jobs = stroke(strokeWidth = 1.7f) {
        moveTo(4f, 7.5f); lineTo(20f, 7.5f)
        lineTo(20f, 7.5f); lineTo(20f, 18.5f); lineTo(4f, 18.5f); lineTo(4f, 7.5f); close()
        moveTo(9f, 7.5f); lineTo(9f, 5.5f); lineTo(15f, 5.5f); lineTo(15f, 7.5f)
        moveTo(9f, 12.5f); lineTo(9f, 13.5f); moveTo(15f, 12.5f); lineTo(15f, 13.5f)
    }

    /** Navigation: Travel. A compass/pin mark. */
    val Travel = stroke(strokeWidth = 1.7f) {
        moveTo(4f, 12f); lineTo(7f, 12f)
        moveTo(17f, 12f); lineTo(20f, 12f)
        moveTo(12f, 4f); lineTo(12f, 7f)
        moveTo(12f, 17f); lineTo(12f, 20f)
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