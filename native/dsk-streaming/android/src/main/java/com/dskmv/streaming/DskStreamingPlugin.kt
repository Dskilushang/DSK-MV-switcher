package com.dskmv.streaming

import android.content.Intent
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "DskStreaming")
class DskStreamingPlugin : Plugin() {
    @PluginMethod
    fun startBackgroundService(call: PluginCall) {
        val title = call.getString("title") ?: DskStreamingService.DEFAULT_TITLE
        val text = call.getString("text") ?: DskStreamingService.DEFAULT_TEXT
        val intent = Intent(context, DskStreamingService::class.java).apply {
            putExtra(DskStreamingService.EXTRA_TITLE, title)
            putExtra(DskStreamingService.EXTRA_TEXT, text)
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            call.resolve(JSObject().put("started", true))
        } catch (error: Exception) {
            call.reject("Impossible de démarrer le service LIVE en arrière-plan", error)
        }
    }

    @PluginMethod
    fun stopBackgroundService(call: PluginCall) {
        try {
            context.stopService(Intent(context, DskStreamingService::class.java))
            call.resolve(JSObject().put("stopped", true))
        } catch (error: Exception) {
            call.reject("Impossible d'arrêter le service LIVE", error)
        }
    }

    @PluginMethod
    fun getBackgroundServiceStatus(call: PluginCall) {
        call.resolve(JSObject().put("running", DskStreamingService.isRunning))
    }
}
