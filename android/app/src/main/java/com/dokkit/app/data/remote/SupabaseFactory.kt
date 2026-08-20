package com.dokkit.app.data.remote

import android.content.Context
import com.dokkit.app.data.config.DokkitConfig
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.ktor.client.engine.okhttp.OkHttp

/**
 * Builds and owns the single Supabase client for the process.
 *
 * The client is created with the *anon* key only (parity with the web
 * app's lib/supabaseClient.ts). PostgREST requests are scoped to the
 * signed-in user by the backend's RLS policies — which means the Android
 * app can talk to the exact same tables and rows the web app reads and
 * writes, with no schema changes.
 */
class SupabaseFactory(private val context: Context) {

    private val client = createSupabaseClient(DokkitConfig.supabaseUrl, DokkitConfig.supabaseAnonKey) {
        install(Auth)
        install(Postgrest)
    }

    val supabase = client
    val auth get() = client.auth
}