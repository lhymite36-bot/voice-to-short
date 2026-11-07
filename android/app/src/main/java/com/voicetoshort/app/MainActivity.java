package com.voicetoshort.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
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
        // Keep the WebView renderer at IMPORTANT priority even when the app is not visible, so Android does not
        // deprioritise/kill it mid-render (the default policy waives priority when the view is hidden).
        try { WebView wv = getBridge().getWebView(); if (Build.VERSION.SDK_INT >= 26 && wv != null) wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false); } catch (Exception ignored) { }
    }

    /** During an Autopilot run, undo the WebView pause that backgrounding triggers so JS timers and rendering keep going. */
    void keepWebViewAwake() {
        runOnUiThread(() -> {
            try { WebView wv = getBridge().getWebView(); if (wv != null) { wv.onResume(); wv.resumeTimers(); } } catch (Exception ignored) { }
        });
    }

    @Override
    public void onPause() {
        super.onPause();
        if (AutopilotPlugin.RUN_ACTIVE) keepWebViewAwake();
    }

    @Override
    public void onStop() {
        super.onStop();
        if (AutopilotPlugin.RUN_ACTIVE) keepWebViewAwake();
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
