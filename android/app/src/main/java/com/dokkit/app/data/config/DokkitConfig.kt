package com.dokkit.app.data.config

/**
 * App-level configuration, populated from BuildConfig at startup.
 *
 * Only public publishable keys live here (an anon key, exactly like the
 * browser uses). Server-side secrets — the service role key, the server
 * Google Maps key, VAPID private key, Redis credentials, CRON secrets —
 * never reach the app; anything that needs them is called on the web app's
 * existing authenticated API routes instead.
 */
object DokkitConfig {

    /** Supabase project URL (NEXT_PUBLIC_SUPABASE_URL). */
    var supabaseUrl: String = ""
        private set

    /** Supabase public anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY). */
    var supabaseAnonKey: String = ""
        private set

    /** Android Maps key placeholder. Blank until a native map is added. */
    var googleMapsApiKey: String = ""
        private set

    val isConfigured: Boolean
        get() = supabaseUrl.isNotBlank() && supabaseAnonKey.isNotBlank()

    fun load(url: String, anonKey: String, mapsKey: String = "") {
        supabaseUrl = url.trim()
        supabaseAnonKey = anonKey.trim()
        googleMapsApiKey = mapsKey.trim()
    }
}