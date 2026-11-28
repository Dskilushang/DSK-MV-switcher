package com.dskmv.streaming

import android.content.Intent
import android.os.Build
import android.content.ContentValues
import android.os.Environment
import android.provider.MediaStore
import java.io.OutputStream
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import android.os.Process
import kotlin.system.exitProcess

@CapacitorPlugin(name = "DskStreaming")
class DskStreamingPlugin : Plugin() {
    private var previousExceptionHandler: Thread.UncaughtExceptionHandler? = null

    override fun load() {
        super.load()
        DskNativeDiagnostics.append(context, "INFO", "Plugin natif DSK-MV chargé")
        previousExceptionHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            DskNativeDiagnostics.append(context, "FATAL", "Exception non interceptée sur le thread ${thread.name}", error)
            val previous = previousExceptionHandler
            if (previous != null) {
                previous.uncaughtException(thread, error)
            } else {
                Process.killProcess(Process.myPid())
                exitProcess(10)
            }
        }
    }

    @PluginMethod
    fun saveDiagnosticsReport(call: PluginCall) {
        val filename = call.getString("filename")?.replace(Regex("[^A-Za-z0-9._-]"), "_")
            ?.take(100)?.takeIf { it.endsWith(".json") } ?: "DSK-MV-diagnostics.json"
        val content = call.getString("content")
        if (content.isNullOrBlank()) {
            call.reject("Le rapport de diagnostic est vide.")
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("L’export direct vers Téléchargements nécessite Android 10 ou supérieur.")
            return
        }
        try {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                put(MediaStore.MediaColumns.MIME_TYPE, "application/json")
                put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/DSK-MV")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("Android n’a pas créé le fichier dans Téléchargements.")
            try {
                val stream: OutputStream = resolver.openOutputStream(uri)
                    ?: throw IllegalStateException("Impossible d’ouvrir le fichier de rapport.")
                stream.use { it.write(content.toByteArray(Charsets.UTF_8)) }
                values.clear()
                values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            } catch (error: Exception) {
                resolver.delete(uri, null, null)
                throw error
            }
            call.resolve(JSObject().put("saved", true).put("uri", uri.toString()).put("filename", filename))
        } catch (error: Exception) {
            call.reject("Échec de l’enregistrement du rapport JSON dans Téléchargements/DSK-MV.", error)
        }
    }

    @PluginMethod
    fun getNativeCrashLog(call: PluginCall) {
        try {
            call.resolve(JSObject().put("content", DskNativeDiagnostics.read(context)))
        } catch (error: Exception) {
            call.reject("Lecture du journal natif impossible", error)
        }
    }

    @PluginMethod
    fun clearNativeCrashLog(call: PluginCall) {
        DskNativeDiagnostics.clear(context)
        call.resolve(JSObject().put("cleared", true))
    }
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

    /**
     * Checks H.264 Surface-input encoder availability without starting a stream.
     * The probe runs off the UI thread because codec discovery/configuration can block.
     */
    @PluginMethod
    fun probeH264SurfaceEncoder(call: PluginCall) {
        val width = call.getInt("width") ?: 1280
        val height = call.getInt("height") ?: 720
        val frameRate = call.getInt("frameRate") ?: 30
        val bitRate = call.getInt("bitRate") ?: 4_000_000

        if (width !in 320..3840 || height !in 240..2160 ||
            frameRate !in 1..60 || bitRate !in 100_000..30_000_000
        ) {
            call.reject("Paramètres encodeur hors limites.")
            return
        }

        Thread({
            try {
                val result = DskVideoEncoderProbe.run(width, height, frameRate, bitRate)
                val response = JSObject().apply {
                    put("supported", result.supported)
                    put("codecName", result.codecName)
                    put("hardwareAccelerated", result.hardwareAccelerated)
                    put("width", result.width)
                    put("height", result.height)
                    put("frameRate", result.frameRate)
                    put("inputSurfaceCreated", result.inputSurfaceCreated)
                    put("encodedFrameCount", result.encodedFrameCount)
                    put("encodedBytes", result.encodedBytes)
                    put("outputMimeType", result.outputMimeType)
                    put("detail", result.detail)
                }
                call.resolve(response)
            } catch (error: Exception) {
                call.reject("Échec du diagnostic de l'encodeur H.264.", error)
            }
        }, "DSK-H264-Encoder-Probe").start()
    }
}
