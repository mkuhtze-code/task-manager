package com.dokkit.app

import android.app.Application
import com.dokkit.app.data.config.DokkitConfig
import com.dokkit.app.data.remote.SupabaseFactory

/**
 * Application entry point. Owns the process-scoped singletons the rest of
 * the app receives through a manual dependency graph (no DI framework yet,
 * keeping the foundation explicit and small).
 */
class DokkitApp : Application() {

    lateinit var supabaseFactory: SupabaseFactory
        private set

    override fun onCreate() {
        super.onCreate()
        DokkitConfig.load(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY)
        supabaseFactory = SupabaseFactory(this)
    }
}