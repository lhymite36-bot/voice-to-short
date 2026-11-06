package com.voicetoshort.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins: device text-to-speech to WAV + keep-screen-on, and the YouTube autopilot.
        registerPlugin(VtsNativePlugin.class);
        registerPlugin(AutopilotPlugin.class);
        super.onCreate(savedInstanceState);
        wakeForAutopilot(getIntent());
        AutopilotScheduler.scheduleNext(this); // re-arm after updates / force-stop
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (wakeForAutopilot(intent)) {
            PluginHandle h = getBridge() != null ? getBridge().getPlugin("Autopilot") : null;
            if (h != null && h.getInstance() instanceof AutopilotPlugin) ((AutopilotPlugin) h.getInstance()).fire();
        }
    }

    /** An autopilot alarm opened us: show over the lock screen and keep the screen on so the WebView can render at full speed. */
    private boolean wakeForAutopilot(Intent intent) {
        if (intent == null || !intent.getBooleanExtra(AutopilotScheduler.EXTRA, false)) return false;
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        return true;
    }
}
