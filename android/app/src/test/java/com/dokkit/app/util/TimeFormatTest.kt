package com.dokkit.app.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Verifies the ported TimeFormat against the exact behaviour of
 * lib/timeFormat.ts. These are the anchor tests that keep a port honest —
 * later ports of taskSort/travelSort/todayRoute get the same treatment.
 */
class TimeFormatTest {

    @Test
    fun `fmtMins under an hour stays minutes`() {
        assertEquals("45m", TimeFormat.fmtMins(45))
        assertEquals("0m", TimeFormat.fmtMins(0))
    }

    @Test
    fun `fmtMins folds to hours`() {
        assertEquals("2h", TimeFormat.fmtMins(120))
        assertEquals("1h", TimeFormat.fmtMins(60))
    }

    @Test
    fun `fmtMins keeps remainder`() {
        assertEquals("1h 30m", TimeFormat.fmtMins(90))
        assertEquals("2h 5m", TimeFormat.fmtMins(125))
        assertEquals("5m", TimeFormat.fmtMins(5))
        assertEquals("2h 16m", TimeFormat.fmtMins(136))
    }

    @Test
    fun `parseMins handles hours and minutes suffixes`() {
        assertEquals(15, TimeFormat.parseMins("15"))
        assertEquals(120, TimeFormat.parseMins("2h"))
        assertEquals(45, TimeFormat.parseMins("45m"))
        assertEquals(0, TimeFormat.parseMins(""))
        // JS-lenient parseFloat: leading digits only.
        assertEquals(1, TimeFormat.parseMins("1h15"))
        assertEquals(1, TimeFormat.parseMins("1h15m"))
    }

    @Test
    fun `parseMins rejects garbage`() {
        // NaN cases only — JS parseFloat returns NaN when no leading digit.
        assertNull(TimeFormat.parseMins("abc"))
        assertNull(TimeFormat.parseMins("  x"))
        // "12x" parses as 12 (lenient), it is NOT rejected.
        assertEquals(12, TimeFormat.parseMins("12x"))
    }

    @Test
    fun `timeStringToMinutes converts clock time`() {
        assertEquals(8 * 60, TimeFormat.timeStringToMinutes("08:00"))
        assertEquals(16 * 60 + 30, TimeFormat.timeStringToMinutes("16:30"))
    }
}