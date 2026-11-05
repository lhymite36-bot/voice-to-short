package com.voicetoshort.app;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.WindowManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Autopilot native side: Keystore-encrypted storage for the YouTube refresh token, the OAuth loopback redirect
 * catcher, AlarmManager scheduling, the foreground service, notifications and the battery-optimisation prompt.
 */
@CapacitorPlugin(name = "Autopilot")
public class AutopilotPlugin extends Plugin {
    private static final String KEY_ALIAS = "vts_autopilot_key";
    private ServerSocket server;
    private PluginCall waitCall;

    // ---------- encrypted storage (AES-GCM key in AndroidKeyStore, never leaves the device) ----------
    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
        return kg.generateKey();
    }
    private SharedPreferences secure() { return getContext().getSharedPreferences("vts_secure", Context.MODE_PRIVATE); }

    @PluginMethod
    public void secureSet(PluginCall call) {
        try {
            String k = call.getString("key"); String v = call.getString("value", "");
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = c.getIV(); byte[] ct = c.doFinal(v.getBytes(StandardCharsets.UTF_8));
            secure().edit().putString(k, Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP)).apply();
            call.resolve();
        } catch (Exception e) { call.reject("Secure storage failed: " + e.getMessage()); }
    }

    @PluginMethod
    public void secureGet(PluginCall call) {
        JSObject r = new JSObject();
        try {
            String raw = secure().getString(call.getString("key"), null);
            if (raw == null) { r.put("value", null); call.resolve(r); return; }
            String[] p = raw.split(":");
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(p[0], Base64.NO_WRAP)));
            r.put("value", new String(c.doFinal(Base64.decode(p[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
            call.resolve(r);
        } catch (Exception e) { r.put("value", null); call.resolve(r); }
    }

    @PluginMethod
    public void secureDel(PluginCall call) { secure().edit().remove(call.getString("key")).apply(); call.resolve(); }

    // ---------- OAuth loopback: listen on 127.0.0.1:<random>, open the browser, catch ?code= ----------
    @PluginMethod
    public void oauthStart(PluginCall call) {
        try {
            closeServer();
            server = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
            JSObject r = new JSObject(); r.put("redirectUri", "http://127.0.0.1:" + server.getLocalPort()); call.resolve(r);
        } catch (Exception e) { call.reject("Could not start sign-in: " + e.getMessage()); }
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(call.getString("url"))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i); call.resolve();
    }

    @PluginMethod(returnType = PluginMethod.RETURN_PROMISE)
    public void oauthWait(PluginCall call) {
        final ServerSocket s = server;
        if (s == null) { call.reject("Sign-in was not started."); return; }
        call.setKeepAlive(true); waitCall = call;
        new Thread(() -> {
            try {
                s.setSoTimeout(5 * 60 * 1000);
                while (true) {
                    Socket sock = s.accept();
                    BufferedReader in = new BufferedReader(new InputStreamReader(sock.getInputStream(), StandardCharsets.UTF_8));
                    String line = in.readLine(); // GET /?code=...&state=... HTTP/1.1
                    String path = line != null && line.split(" ").length > 1 ? line.split(" ")[1] : "/";
                    Uri u = Uri.parse("http://127.0.0.1" + path);
                    String code = u.getQueryParameter("code"); String err = u.getQueryParameter("error");
                    String html = "<html><body style='font-family:sans-serif;padding:24px'><h2>" + (code != null ? "YouTube connected." : "Sign-in failed.") + "</h2><p>You can go back to Voice to Short now.</p></body></html>";
                    OutputStream out = sock.getOutputStream();
                    out.write(("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n" + html).getBytes(StandardCharsets.UTF_8));
                    out.flush(); sock.close();
                    if (code == null && err == null) continue; // favicon etc.
                    JSObject r = new JSObject(); r.put("code", code); r.put("state", u.getQueryParameter("state")); r.put("error", err);
                    call.resolve(r); break;
                }
            } catch (Exception e) { call.reject("Sign-in timed out or was cancelled."); }
            finally { closeServer(); waitCall = null; bringToFront(); }
        }).start();
    }

    private void bringToFront() {
        try { Intent i = new Intent(getContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT); getContext().startActivity(i); } catch (Exception ignored) { }
    }
    private void closeServer() { try { if (server != null) server.close(); } catch (Exception ignored) { } server = null; }


    // ---------- native HTTP (Buffer + GitHub uploads have no CORS for the WebView) ----------
    private static final String[] ALLOWED = { "https://api.buffer.com", "https://api.github.com/", "https://uploads.github.com/" };
    private static boolean allowed(String url) { for (String a : ALLOWED) if (url != null && url.startsWith(a)) return true; return false; }

    private void respond(PluginCall call, HttpURLConnection c) throws Exception {
        int status = c.getResponseCode();
        InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        if (in != null) { byte[] b = new byte[16384]; int n; while ((n = in.read(b)) > 0) bo.write(b, 0, n); in.close(); }
        JSObject r = new JSObject(); r.put("status", status); r.put("body", bo.toString("UTF-8"));
        call.resolve(r);
    }

    private HttpURLConnection open(PluginCall call, String method) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(call.getString("url")).openConnection();
        c.setRequestMethod(method); c.setConnectTimeout(30000); c.setReadTimeout(120000);
        JSObject h = call.getObject("headers", new JSObject());
        for (Iterator<String> it = h.keys(); it.hasNext(); ) { String k = it.next(); c.setRequestProperty(k, h.getString(k)); }
        return c;
    }

    @PluginMethod
    public void http(PluginCall call) {
        if (!allowed(call.getString("url"))) { call.reject("URL not allowed"); return; }
        new Thread(() -> {
            try {
                String method = call.getString("method", "GET");
                HttpURLConnection c = open(call, method);
                String body = call.getString("body");
                if (body != null && !"GET".equals(method)) { c.setDoOutput(true); OutputStream o = c.getOutputStream(); o.write(body.getBytes(StandardCharsets.UTF_8)); o.close(); }
                respond(call, c);
            } catch (Exception e) { call.reject("Network error: " + e.getMessage()); }
        }).start();
    }

    /** Streams a file (written by the app into its cache) to an upload URL. */
    @PluginMethod
    public void uploadFile(PluginCall call) {
        if (!allowed(call.getString("url"))) { call.reject("URL not allowed"); return; }
        new Thread(() -> {
            try {
                String path = call.getString("path", ""); if (path.startsWith("file://")) path = Uri.parse(path).getPath();
                File f = new File(path);
                HttpURLConnection c = open(call, call.getString("method", "POST"));
                c.setDoOutput(true); c.setFixedLengthStreamingMode(f.length()); c.setReadTimeout(600000);
                OutputStream o = c.getOutputStream(); FileInputStream in = new FileInputStream(f);
                byte[] b = new byte[65536]; int n; while ((n = in.read(b)) > 0) o.write(b, 0, n); in.close(); o.close();
                respond(call, c);
                if (call.getBoolean("deleteAfter", false)) f.delete();
            } catch (Exception e) { call.reject("Network error: " + e.getMessage()); }
        }).start();
    }

    // ---------- schedule ----------
    @PluginMethod
    public void schedule(PluginCall call) {
        Context c = getContext();
        AutopilotScheduler.save(c, call.getBoolean("enabled", false), call.getString("times", ""), call.getInt("perDay", 6));
        long at = AutopilotScheduler.scheduleNext(c);
        JSObject r = new JSObject(); r.put("nextAt", at); r.put("exact", AutopilotScheduler.canExact(c)); call.resolve(r);
    }

    /** Extra wake-up for a retry / deferred post. */
    @PluginMethod
    public void wakeAt(PluginCall call) {
        long at = call.getLong("at", 0L);
        long d = at - System.currentTimeMillis();
        if (d > 0) AutopilotScheduler.scheduleCatchUp(getContext(), d);
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        Context c = getContext(); JSObject r = new JSObject();
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        r.put("batteryExempt", Build.VERSION.SDK_INT < 23 || pm.isIgnoringBatteryOptimizations(c.getPackageName()));
        r.put("exact", AutopilotScheduler.canExact(c));
        r.put("notifications", Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
        r.put("nextAt", AutopilotScheduler.prefs(c).getLong("nextAt", -1));
        Activity a = getActivity();
        r.put("launchedByAlarm", a != null && a.getIntent() != null && a.getIntent().getBooleanExtra(AutopilotScheduler.EXTRA, false));
        call.resolve(r);
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        Context c = getContext();
        if (Build.VERSION.SDK_INT >= 23) {
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            if (!pm.isIgnoringBatteryOptimizations(c.getPackageName())) {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + c.getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try { c.startActivity(i); } catch (Exception e) { c.startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
            }
        }
        if (Build.VERSION.SDK_INT >= 33 && getActivity() != null && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            getActivity().requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 7701);
        }
        if (!AutopilotScheduler.canExact(c) && Build.VERSION.SDK_INT >= 31) {
            try { c.startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + c.getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
        }
        call.resolve();
    }

    // ---------- run lifecycle ----------
    @PluginMethod
    public void runStart(PluginCall call) {
        Context c = getContext();
        Intent i = new Intent(c, AutopilotService.class).putExtra("text", call.getString("text", "Making and posting a Short…"));
        try { ContextCompat.startForegroundService(c, i); } catch (Exception ignored) { }
        Activity a = getActivity();
        if (a != null) a.runOnUiThread(() -> a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
        call.resolve();
    }

    @PluginMethod
    public void runEnd(PluginCall call) {
        Context c = getContext();
        c.stopService(new Intent(c, AutopilotService.class));
        AutopilotScheduler.scheduleNext(c);
        Activity a = getActivity();
        boolean byAlarm = a != null && a.getIntent() != null && a.getIntent().getBooleanExtra(AutopilotScheduler.EXTRA, false);
        if (a != null) a.runOnUiThread(() -> {
            a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (byAlarm) { a.getIntent().removeExtra(AutopilotScheduler.EXTRA); if (Build.VERSION.SDK_INT >= 27) { a.setTurnScreenOn(false); a.setShowWhenLocked(false); } a.moveTaskToBack(true); }
        });
        call.resolve();
    }

    @PluginMethod
    public void notify(PluginCall call) {
        Context c = getContext(); AutopilotService.channels(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify((int) (System.currentTimeMillis() % 100000) + 100, AutopilotService.build(c, AutopilotService.CH_DONE, call.getString("title", "Voice to Short"), call.getString("body", ""), false));
        call.resolve();
    }

    /** Called by MainActivity when an alarm brings the app to the front. */
    void fire() { notifyListeners("autopilotFire", new JSObject(), true); }
}
