package com.voicetoshort.app;

import android.net.Uri;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Renders the phone's own text-to-speech voice into a WAV file (TextToSpeech.synthesizeToFile),
 * so the device voice can be mixed into the rendered video. Browsers cannot capture speechSynthesis audio.
 */
@CapacitorPlugin(name = "VtsNative")
public class VtsNativePlugin extends Plugin {
    private TextToSpeech tts;
    private boolean ready = false;
    private boolean initializing = false;
    private final List<PluginCall> waiting = new ArrayList<>();
    private final Map<String, PluginCall> pending = new HashMap<>();
    private final Map<String, File> files = new HashMap<>();

    @PluginMethod
    public void synthesize(PluginCall call) {
        String text = call.getString("text", "");
        if (text == null || text.trim().isEmpty()) {
            call.reject("No text to speak.");
            return;
        }
        synchronized (this) {
            if (ready && tts != null) {
                doSynthesize(call);
                return;
            }
            waiting.add(call);
            if (initializing) return;
            initializing = true;
        }
        getActivity().runOnUiThread(() -> tts = new TextToSpeech(getContext(), this::onInit));
    }

    private void onInit(int status) {
        List<PluginCall> calls;
        synchronized (this) {
            initializing = false;
            ready = status == TextToSpeech.SUCCESS && tts != null;
            calls = new ArrayList<>(waiting);
            waiting.clear();
        }
        if (ready) {
            tts.setOnUtteranceProgressListener(listener);
            for (PluginCall c : calls) doSynthesize(c);
        } else {
            for (PluginCall c : calls) {
                c.reject("No text-to-speech engine is available. Install \"Speech Recognition & Synthesis\" from Google Play.");
            }
            if (tts != null) tts.shutdown();
            tts = null;
        }
    }

    private final UtteranceProgressListener listener = new UtteranceProgressListener() {
        @Override
        public void onStart(String id) {}

        @Override
        public void onDone(String id) {
            PluginCall call;
            File f;
            synchronized (VtsNativePlugin.this) {
                call = pending.remove(id);
                f = files.remove(id);
            }
            if (call == null) return;
            if (f == null || !f.exists() || f.length() < 100) {
                call.reject("The voice file was empty.");
                return;
            }
            JSObject ret = new JSObject();
            ret.put("path", f.getAbsolutePath());
            ret.put("uri", Uri.fromFile(f).toString());
            ret.put("size", f.length());
            call.resolve(ret);
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onError(String id) {
            fail(id, "Text-to-speech failed.");
        }

        @Override
        public void onError(String id, int errorCode) {
            fail(id, "Text-to-speech failed (code " + errorCode + ").");
        }
    };

    private void fail(String id, String msg) {
        PluginCall call;
        synchronized (this) {
            call = pending.remove(id);
            files.remove(id);
        }
        if (call != null) call.reject(msg);
    }

    private void doSynthesize(PluginCall call) {
        String text = call.getString("text", "");
        String lang = call.getString("lang", "en-US");
        Float rate = call.getFloat("rate", 1.0f);
        Float pitch = call.getFloat("pitch", 1.0f);
        try {
            int avail = tts.setLanguage(Locale.forLanguageTag(lang == null ? "en-US" : lang));
            if (avail == TextToSpeech.LANG_MISSING_DATA || avail == TextToSpeech.LANG_NOT_SUPPORTED) tts.setLanguage(Locale.US);
            tts.setSpeechRate(rate == null ? 1.0f : rate);
            tts.setPitch(pitch == null ? 1.0f : pitch);
            File dir = new File(getContext().getCacheDir(), "tts");
            if (!dir.exists()) dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) {
                for (File o : old) {
                    if (System.currentTimeMillis() - o.lastModified() > 3600000L) o.delete();
                }
            }
            File out = new File(dir, "voice-" + System.currentTimeMillis() + ".wav");
            String id = UUID.randomUUID().toString();
            synchronized (this) {
                pending.put(id, call);
                files.put(id, out);
            }
            int r = tts.synthesizeToFile(text, new Bundle(), out, id);
            if (r != TextToSpeech.SUCCESS) fail(id, "Text-to-speech could not start.");
        } catch (Exception e) {
            call.reject("Text-to-speech error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void keepAwake(PluginCall call) {
        final boolean on = !Boolean.FALSE.equals(call.getBoolean("on", true));
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.shutdown();
            tts = null;
        }
    }
}
