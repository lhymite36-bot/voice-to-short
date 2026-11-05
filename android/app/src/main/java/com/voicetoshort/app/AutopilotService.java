package com.voicetoshort.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;

/** Foreground service that keeps the app process (and its WebView renderer) alive while a Short is rendered and uploaded. */
public class AutopilotService extends Service {
    static final String CH_RUN = "vts_autopilot_run";
    static final String CH_DONE = "vts_autopilot_done";
    private PowerManager.WakeLock wake;

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CH_RUN, "Autopilot running", NotificationManager.IMPORTANCE_LOW));
        nm.createNotificationChannel(new NotificationChannel(CH_DONE, "Autopilot results", NotificationManager.IMPORTANCE_DEFAULT));
    }

    static Notification build(Context c, String channel, String title, String text, boolean ongoing) {
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 2001, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(c, channel).setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text)).setContentIntent(pi).setOngoing(ongoing).setAutoCancel(!ongoing).build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        channels(this);
        String text = intent != null && intent.getStringExtra("text") != null ? intent.getStringExtra("text") : "Making and posting a Short…";
        Notification n = build(this, CH_RUN, "Voice to Short autopilot", text, true);
        if (Build.VERSION.SDK_INT >= 29) startForeground(42, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC); else startForeground(42, n);
        if (wake == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "vts:autopilot");
            wake.acquire(30 * 60 * 1000L); // hard cap: 30 min per run
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() { if (wake != null && wake.isHeld()) wake.release(); wake = null; super.onDestroy(); }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
