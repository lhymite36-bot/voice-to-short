package com.voicetoshort.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugin: device text-to-speech straight to a WAV file + keep-screen-on while rendering.
        registerPlugin(VtsNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
