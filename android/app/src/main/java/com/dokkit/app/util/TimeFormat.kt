package com.dokkit.app.util

/**
 * Pure time-formatting helpers ported from the web app's lib/timeFormat.ts.
 *
 * Kept dependency-free so they can be unit-tested exactly like the
 * TypeScript originals. More of the web's sort/route logic will be ported
 * into this package in later stages and tested against known behaviour.
 */
object TimeFormat {

    /** Rounds to whole minutes, then "65m" → "1h 5m", "120m" → "2h". */
    fun fmtMins(mins: Int): String {
        val v = kotlin.math.round(mins.toFloat()).toInt()
        if (v < 60) return "${v}m"
        val h = v / 60
        val m = v % 60
        return if (m == 0) "${h}h" else "${h}h ${m}m"
    }

    /**
     * Parses "1h", "90", "45m" into minutes; null when unparseable.
     *
     * Mirrors the web's parseMins exactly, including its dependence on
     * JavaScript's lenient parseFloat: leading digits are parsed and the
     * rest is ignored ("1h15" → 1, "12x" → 12), and only a single trailing
     * unit char is stripped.
     */
    fun parseMins(raw: String): Int? {
        val str = raw.trim().lowercase()
        if (str.isEmpty()) return 0
        val last = str.last()
        var unit = 'm'
        var numStr = str
        if (last == 'h' || last == 'm') {
            unit = last
            numStr = str.dropLast(1)
        }
        val num = jsParseFloat(numStr)
        if (num.isNaN()) return null
        return if (unit == 'h') {
            kotlin.math.round(num * 60).toInt()
        } else {
            kotlin.math.round(num).toInt()
        }
    }

    /** JavaScript's parseFloat: leading digits (and optional sign/point) then stops. */
    private fun jsParseFloat(s: String): Double {
        var i = 0
        var sign = 1.0
        while (i < s.length && s[i].isWhitespace()) i++
        if (i < s.length && (s[i] == '+' || s[i] == '-')) {
            if (s[i] == '-') sign = -1.0
            i++
        }
        var value = 0.0
        var hasDigits = false
        while (i < s.length && s[i].isDigit()) {
            hasDigits = true
            value = value * 10 + (s[i] - '0')
            i++
        }
        if (i < s.length && s[i] == '.') {
            i++
            var factor = 0.1
            while (i < s.length && s[i].isDigit()) {
                hasDigits = true
                value += (s[i] - '0') * factor
                factor /= 10
                i++
            }
        }
        return if (!hasDigits) Double.NaN else sign * value
    }

    /** "hh:mm" → minutes-of-day (web assumes well-formed input). */
    fun timeStringToMinutes(t: String): Int {
        val parts = t.split(":")
        val h = parts.getOrNull(0)?.toIntOrNull() ?: 0
        val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
        return h * 60 + m
    }
}