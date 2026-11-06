package com.voicetoshort.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;

/** Schedules the next autopilot slot (IST times) with AlarmManager. The alarm opens MainActivity, which renders + uploads. */
public final class AutopilotScheduler {
    static final String PREFS = "vts_autopilot";
    static final String EXTRA = "vts_autopilot_run";
    private AutopilotScheduler() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static void save(Context c, boolean enabled, String times, int perDay) {
        prefs(c).edit().putBoolean("enabled", enabled).putString("times", times).putInt("perDay", perDay).apply();
    }

    static List<int[]> slots(Context c) {
        List<int[]> out = new ArrayList<>();
        String t = prefs(c).getString("times", "09:00,11:00,13:00,16:00,19:00,21:00");
        int perDay = prefs(c).getInt("perDay", 6);
        for (String s : t.split(",")) {
            String[] p = s.trim().split(":");
            if (p.length != 2) continue;
            try { out.add(new int[] { Integer.parseInt(p[0]), Integer.parseInt(p[1]) }); } catch (NumberFormatException ignored) { }
            if (out.size() >= perDay) break;
        }
        return out;
    }

    /** Next slot after now, in epoch ms (IST wall clock). */
    static long nextAt(Context c, long now) {
        TimeZone ist = TimeZone.getTimeZone("Asia/Kolkata");
        long best = Long.MAX_VALUE;
        for (int day = 0; day < 3; day++) {
            for (int[] hm : slots(c)) {
                Calendar cal = Calendar.getInstance(ist);
                cal.setTimeInMillis(now);
                cal.add(Calendar.DAY_OF_YEAR, day);
                cal.set(Calendar.HOUR_OF_DAY, hm[0]); cal.set(Calendar.MINUTE, hm[1]); cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0);
                long at = cal.getTimeInMillis();
                if (at > now + 30000 && at < best) best = at;
            }
            if (best != Long.MAX_VALUE) break;
        }
        return best == Long.MAX_VALUE ? -1 : best;
    }

    static PendingIntent runIntent(Context c, int req) {
        Intent i = new Intent(c, MainActivity.class).putExtra(EXTRA, true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean canExact(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
    }

    /** Schedules the next slot (or cancels when off). Returns the time scheduled, or -1. */
    static long scheduleNext(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = runIntent(c, 1001);
        am.cancel(pi);
        if (!prefs(c).getBoolean("enabled", false)) return -1;
        long at = nextAt(c, System.currentTimeMillis());
        if (at < 0) return -1;
        setAlarm(c, am, at, pi);
        prefs(c).edit().putLong("nextAt", at).apply();
        return at;
    }

    /** One-off check a few minutes from now (after reboot / missed slot), so the app can catch up. */
    static void scheduleCatchUp(Context c, long delayMs) {
        if (!prefs(c).getBoolean("enabled", false)) return;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        setAlarm(c, am, System.currentTimeMillis() + delayMs, runIntent(c, 1002));
    }

    private static void setAlarm(Context c, AlarmManager am, long at, PendingIntent pi) {
        if (canExact(c)) {
            // AlarmClock alarms fire in Doze and may open an activity from the background.
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, runIntent(c, 1003)), pi);
        } else if (Build.VERSION.SDK_INT >= 23) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } else {
            am.set(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }
}
