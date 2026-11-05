package com.voicetoshort.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Re-arms the autopilot after a reboot, app update or clock change, and checks for a missed slot shortly after boot. */
public class AutopilotBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        AutopilotScheduler.scheduleNext(context);
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || "android.intent.action.QUICKBOOT_POWERON".equals(a)) AutopilotScheduler.scheduleCatchUp(context, 3 * 60 * 1000L);
    }
}
