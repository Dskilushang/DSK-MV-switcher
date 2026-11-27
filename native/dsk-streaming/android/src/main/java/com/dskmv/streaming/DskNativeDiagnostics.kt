package com.dskmv.streaming

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

internal object DskNativeDiagnostics {
    private const val FILE_NAME = "dsk-native-diagnostics.log"
    private val lock = Any()

    fun append(context: Context, level: String, message: String, error: Throwable? = null) {
        synchronized(lock) {
            try {
                val file = File(context.filesDir, FILE_NAME)
                val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US).format(Date())
                val stack = error?.stackTraceToString()?.take(24_000)
                file.appendText(buildString {
                    append(timestamp).append(" [").append(level).append("] ").append(message).append('\n')
                    if (error != null) {
                        append(error.javaClass.name).append(": ").append(error.message).append('\n')
                        if (stack != null) append(stack).append('\n')
                    }
                    append("---\n")
                })
            } catch (_: Throwable) {
                // Diagnostics must never cause or worsen an application failure.
            }
        }
    }

    fun read(context: Context): String = synchronized(lock) {
        try {
            val file = File(context.filesDir, FILE_NAME)
            if (!file.exists()) "" else file.readText().takeLast(120_000)
        } catch (_: Throwable) {
            ""
        }
    }

    fun clear(context: Context) = synchronized(lock) {
        try {
            File(context.filesDir, FILE_NAME).delete()
        } catch (_: Throwable) {
            false
        }
    }
}
