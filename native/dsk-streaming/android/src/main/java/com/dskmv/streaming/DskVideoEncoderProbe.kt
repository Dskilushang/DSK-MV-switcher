package com.dskmv.streaming

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.os.Build
import android.view.Surface

/**
 * Checks whether this device can configure an H.264 encoder with a Surface input.
 *
 * This is a capability probe only: it does not start encoding or capture camera frames.
 */
internal object DskVideoEncoderProbe {
    private const val MIME_TYPE = MediaFormat.MIMETYPE_VIDEO_AVC

    data class Result(
        val supported: Boolean,
        val codecName: String? = null,
        val hardwareAccelerated: Boolean = false,
        val width: Int,
        val height: Int,
        val frameRate: Int,
        val inputSurfaceCreated: Boolean = false,
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

        if (candidates.isEmpty()) {
            return Result(
                supported = false,
                width = width,
                height = height,
                frameRate = frameRate,
                detail = "Aucun encodeur H.264 avec entrée Surface n'est disponible."
            )
        }

        var lastError: String? = null
        for (candidate in candidates) {
            var codec: MediaCodec? = null
            var inputSurface: Surface? = null
            try {
                val format = MediaFormat.createVideoFormat(MIME_TYPE, width, height).apply {
                    setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
                    setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
                    setInteger(MediaFormat.KEY_FRAME_RATE, frameRate)
                    setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
                }

                codec = MediaCodec.createByCodecName(candidate.name)
                codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
                inputSurface = codec.createInputSurface()

                return Result(
                    supported = true,
                    codecName = candidate.name,
                    hardwareAccelerated = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                        candidate.isHardwareAccelerated,
                    width = width,
                    height = height,
                    frameRate = frameRate,
                    inputSurfaceCreated = true,
                    detail = "Configuration H.264 réussie. Aucun flux vidéo n'a encore été encodé."
                )
            } catch (error: Exception) {
                lastError = "${candidate.name}: ${error.message ?: error.javaClass.simpleName}"
            } finally {
                inputSurface?.release()
                try {
                    codec?.release()
                } catch (_: Exception) {
                    // Continue probing the next advertised encoder.
                }
            }
        }

        return Result(
            supported = false,
            width = width,
            height = height,
            frameRate = frameRate,
            detail = lastError ?: "Les encodeurs H.264 détectés n'ont pas pu être configurés."
        )
    }
}
