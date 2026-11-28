package com.dskmv.streaming

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.net.wifi.WifiManager
import androidx.core.app.NotificationCompat

class DskStreamingService : Service() {
    private var cpuLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    override fun onCreate() {
        super.onCreate()
        DskNativeDiagnostics.append(this, "INFO", "Service LIVE Android créé")
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            DskNativeDiagnostics.append(this, "INFO", "Commande arrêt reçue par le service LIVE")
            stopSelf()
            return START_NOT_STICKY
        }

        val title = intent?.getStringExtra(EXTRA_TITLE) ?: DEFAULT_TITLE
        val text = intent?.getStringExtra(EXTRA_TEXT) ?: DEFAULT_TEXT
        try {
            startAsForeground(buildNotification(title, text))
            acquireSessionLocks()
            isRunning = true
            DskNativeDiagnostics.append(this, "INFO", "Service LIVE démarré", null)
            return START_STICKY
        } catch (error: Exception) {
            DskNativeDiagnostics.append(this, "FATAL", "Échec démarrage service LIVE", error)
            throw error
        }
    }

    private fun startAsForeground(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MANIFEST
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(title: String, text: String): Notification {
        val stopIntent = Intent(this, DskStreamingService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this,
            STOP_REQUEST_CODE,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setContentTitle(title)
            .setContentText(text)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .addAction(android.R.drawable.ic_media_pause, "Arrêter", stopPendingIntent)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "DSK-MV Live",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "État du service de diffusion DSK-MV"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun acquireSessionLocks() {
        if (cpuLock == null) {
            val powerManager = getSystemService(POWER_SERVICE) as PowerManager
            cpuLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "DSK-MV:LiveCpuLock"
            ).apply { setReferenceCounted(false); acquire() }
        }
        if (wifiLock == null) {
            val manager = applicationContext.getSystemService(WIFI_SERVICE) as WifiManager
            @Suppress("DEPRECATION")
            wifiLock = manager.createWifiLock(
                WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                "DSK-MV:LiveWifiLock"
            ).apply { setReferenceCounted(false); acquire() }
        }
    }

    private fun releaseSessionLocks() {
        cpuLock?.let { if (it.isHeld) it.release() }
        cpuLock = null
        wifiLock?.let { if (it.isHeld) it.release() }
        wifiLock = null
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        DskNativeDiagnostics.append(this, "WARNING", "Tâche Android retirée des applications récentes")
        super.onTaskRemoved(rootIntent)
    }

    override fun onLowMemory() {
        DskNativeDiagnostics.append(this, "WARNING", "Android signale une mémoire système faible")
        super.onLowMemory()
    }

    override fun onTrimMemory(level: Int) {
        DskNativeDiagnostics.append(this, "WARNING", "Android demande de libérer de la mémoire", null)
        super.onTrimMemory(level)
    }

    override fun onDestroy() {
        DskNativeDiagnostics.append(this, "WARNING", "Service LIVE Android détruit")
        isRunning = false
        releaseSessionLocks()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val ACTION_STOP = "com.dskmv.streaming.STOP"
        const val EXTRA_TITLE = "dsk_stream_title"
        const val EXTRA_TEXT = "dsk_stream_text"
        const val CHANNEL_ID = "dsk_mv_live"
        const val NOTIFICATION_ID = 7318
        const val STOP_REQUEST_CODE = 7319
        const val DEFAULT_TITLE = "DSK-MV — LIVE actif"
        const val DEFAULT_TEXT = "La session de diffusion est maintenue en arrière-plan"
        @Volatile var isRunning: Boolean = false
            private set
    }
}
