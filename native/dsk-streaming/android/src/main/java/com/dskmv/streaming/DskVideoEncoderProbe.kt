package com.dskmv.streaming

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.opengl.EGL14
import android.opengl.EGLExt
import android.opengl.GLES20
import android.os.Build
import android.os.SystemClock
import android.view.Surface

/** Encodes generated GPU frames to verify real H.264 output; no camera is opened. */
internal object DskVideoEncoderProbe {
    private const val MIME_TYPE = MediaFormat.MIMETYPE_VIDEO_AVC
    private const val EGL_RECORDABLE_ANDROID = 0x3142
    private const val TEST_FRAME_COUNT = 12

    data class Result(
        val supported: Boolean,
        val codecName: String? = null,
        val hardwareAccelerated: Boolean = false,
        val width: Int,
        val height: Int,
        val frameRate: Int,
        val inputSurfaceCreated: Boolean = false,
        val encodedFrameCount: Int = 0,
        val encodedBytes: Long = 0,
        val outputMimeType: String? = null,
        val detail: String? = null
    )

    fun run(width: Int, height: Int, frameRate: Int, bitRate: Int): Result {
        val candidates = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos
            .filter { info ->
                info.isEncoder &&
                    info.supportedTypes.any { it.equals(MIME_TYPE, ignoreCase = true) } &&
                    info.getCapabilitiesForType(MIME_TYPE).colorFormats.contains(
                        MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface
                    )
            }
            .sortedByDescending { info ->
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && info.isHardwareAccelerated
            }

        if (candidates.isEmpty()) return Result(false, width = width, height = height,
            frameRate = frameRate, detail = "Aucun encodeur H.264 avec entrée Surface n'est disponible.")

        var lastError: String? = null
        for (candidate in candidates) {
            var codec: MediaCodec? = null
            var inputSurface: Surface? = null
            var renderer: EglInputRenderer? = null
            var started = false
            var surfaceCreated = false
            try {
                val format = MediaFormat.createVideoFormat(MIME_TYPE, width, height).apply {
                    setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
                    setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
                    setInteger(MediaFormat.KEY_FRAME_RATE, frameRate)
                    setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
                }
                codec = MediaCodec.createByCodecName(candidate.name)
                codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
                inputSurface = codec.createInputSurface()
                surfaceCreated = true
                codec.start()
                started = true
                renderer = EglInputRenderer(inputSurface, width, height)
                val output = encodeTestFrames(codec, renderer, frameRate)
                val success = output.frames > 0 && output.bytes > 0
                return Result(
                    supported = success,
                    codecName = candidate.name,
                    hardwareAccelerated = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && candidate.isHardwareAccelerated,
                    width = width, height = height, frameRate = frameRate,
                    inputSurfaceCreated = surfaceCreated,
                    encodedFrameCount = output.frames,
                    encodedBytes = output.bytes,
                    outputMimeType = output.mime,
                    detail = if (success) {
                        "Encodage H.264 réel confirmé : ${output.frames} image(s), ${output.bytes} octet(s) produits. Images de test GPU ; aucune caméra utilisée."
                    } else "Codec configuré, mais aucun échantillon vidéo H.264 récupéré."
                )
            } catch (error: Exception) {
                lastError = "${candidate.name}: ${error.message ?: error.javaClass.simpleName}"
            } finally {
                try { renderer?.release() } catch (_: Exception) {}
                try { if (started) codec?.stop() } catch (_: Exception) {}
                try { codec?.release() } catch (_: Exception) {}
                try { inputSurface?.release() } catch (_: Exception) {}
            }
        }
        return Result(false, width = width, height = height, frameRate = frameRate,
            detail = lastError ?: "Les encodeurs H.264 détectés n'ont pas pu produire de vidéo.")
    }

    private data class Output(val frames: Int, val bytes: Long, val mime: String?)

    private fun encodeTestFrames(codec: MediaCodec, renderer: EglInputRenderer, fps: Int): Output {
        val info = MediaCodec.BufferInfo()
        var frames = 0
        var bytes = 0L
        var mime: String? = null
        val intervalNs = 1_000_000_000L / fps
        repeat(TEST_FRAME_COUNT) { frame ->
            renderer.drawFrame(frame)
            EGLExt.eglPresentationTimeANDROID(renderer.display, renderer.surface, (frame + 1L) * intervalNs)
            check(EGL14.eglSwapBuffers(renderer.display, renderer.surface)) { "Envoi d'image à l'encodeur impossible." }
            while (true) {
                val index = codec.dequeueOutputBuffer(info, 0)
                if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    mime = codec.outputFormat.getString(MediaFormat.KEY_MIME)
                    continue
                }
                if (index < 0) break
                if (info.size > 0 && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
                    frames++
                    bytes += info.size
                }
                codec.releaseOutputBuffer(index, false)
            }
        }
        codec.signalEndOfInputStream()
        val deadline = SystemClock.elapsedRealtime() + 3_000L
        var ended = false
        while (!ended && SystemClock.elapsedRealtime() < deadline) {
            val index = codec.dequeueOutputBuffer(info, 10_000)
            when {
                index >= 0 -> {
                    if (info.size > 0 && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
                        frames++
                        bytes += info.size
                    }
                    codec.releaseOutputBuffer(index, false)
                    ended = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                }
                index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED ->
                    mime = codec.outputFormat.getString(MediaFormat.KEY_MIME)
            }
        }
        return Output(frames, bytes, mime ?: MIME_TYPE)
    }

    private class EglInputRenderer(input: Surface, width: Int, height: Int) {
        val display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
        var surface = EGL14.EGL_NO_SURFACE
            private set
        private var context = EGL14.EGL_NO_CONTEXT

        init {
            check(display != EGL14.EGL_NO_DISPLAY) { "EGL display indisponible." }
            val versions = IntArray(2)
            check(EGL14.eglInitialize(display, versions, 0, versions, 1)) { "Initialisation EGL impossible." }
            val attrs = intArrayOf(
                EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8,
                EGL14.EGL_ALPHA_SIZE, 8, EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
                EGL_RECORDABLE_ANDROID, 1, EGL14.EGL_NONE
            )
            val configs = arrayOfNulls<android.opengl.EGLConfig>(1)
            val count = IntArray(1)
            check(EGL14.eglChooseConfig(display, attrs, 0, configs, 0, 1, count, 0) && count[0] > 0) {
                "Configuration EGL compatible introuvable."
            }
            val contextAttrs = intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE)
            context = EGL14.eglCreateContext(display, configs[0], EGL14.EGL_NO_CONTEXT, contextAttrs, 0)
            check(context != EGL14.EGL_NO_CONTEXT) { "Création du contexte OpenGL impossible." }
            surface = EGL14.eglCreateWindowSurface(display, configs[0], input, intArrayOf(EGL14.EGL_NONE), 0)
            check(surface != EGL14.EGL_NO_SURFACE) { "Création de la surface EGL impossible." }
            check(EGL14.eglMakeCurrent(display, surface, surface, context)) { "Activation EGL impossible." }
            GLES20.glViewport(0, 0, width, height)
        }

        fun drawFrame(index: Int) {
            val palette = arrayOf(
                floatArrayOf(0.85f, 0.08f, 0.08f, 1f),
                floatArrayOf(0.05f, 0.65f, 0.25f, 1f),
                floatArrayOf(0.05f, 0.25f, 0.85f, 1f),
                floatArrayOf(0.9f, 0.65f, 0.05f, 1f)
            )
            val color = palette[index % palette.size]
            GLES20.glClearColor(color[0], color[1], color[2], color[3])
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
        }

        fun release() {
            if (display != EGL14.EGL_NO_DISPLAY) {
                EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
                if (surface != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, surface)
                if (context != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(display, context)
                EGL14.eglTerminate(display)
            }
        }
    }
}
