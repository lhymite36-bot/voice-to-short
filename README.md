# Voice to Short

Talk an idea into your phone and get a finished YouTube video: a hook, clear steps, captions, keyword-accurate 2D animated scenes, a colour-graded video and the publishing text. Make a 30–60 s Short or a long video up to 20 minutes, in 9:16, 16:9, 1:1 or 4:5. It's free and runs on your own phone.

It's built for faceless psychology and self-help channels (BetterU-style voiceover over aesthetic visuals).

- **Android app:** download `VoiceToShort-1.3.0.apk` from [Releases](https://github.com/lhymite36-bot/voice-to-short/releases/latest)
- **Web version:** https://lhymite36-bot.github.io/voice-to-short/ (works best in Chrome)

## How it works

1. **Idea.** Tap the mic and ramble for up to 20 minutes. Android's speech recogniser restarts by itself after pauses, and the running transcript is saved as you talk. You can also type or paste an idea or a full outline. Pick the video length: 30–60 s (Short), 2, 5, 10, 15 or 20 min.
2. **Script.** Gemini returns a structured JSON package:
   - 3 hook options. Tap one to use it; it replaces the start of the script and the hook captions.
   - An 80–110 word voiceover: the hook, *One / Two / Three* steps, then a soft call to action. A live word counter and time estimate sit under it.
   - Caption beats. Each has a short phrase, a timing weight, its section (Hook, Step 1–3 or CTA), an emphasis word and a b-roll or visual idea.
   - Title, description, 5–8 hashtags, a pinned comment and thumbnail text.

   You can edit every field. “Update captions from script” rebuilds the beats after you change the script. Tone options are calm teacher, bold and soft. Scripts are in English by default, and 12 other languages are available.
3. **Voice.** Choose one:
   - **Record your own voice.** A full-screen teleprompter scrolls the script at your speed, with a 3-2-1 countdown, pause/resume, playback and retake. Shorts are capped at 60 s. Long videos are recorded section by section.
   - **Device voice (text-to-speech).** In the Android app, “Use Android voice” renders the phone's own TTS voice to a WAV file with `TextToSpeech.synthesizeToFile`, so it goes into the video. See the caveats for the web version.
   - Import an audio file.
   - No voice: a silent track with captions, so you can add a voiceover in the YouTube app.
4. **Render.** Everything happens on the device, in real time:
   - A 1080×1920 canvas shows an animated abstract background with 6 colour grades: Teal & Orange, Moody Film, Warm Soft, Clean Mono, Night Neon and Calm Sage. Each uses a filter curve, split toning, drifting bokeh, film grain and a vignette.
   - Captions are big and bold. Choose word-pop or karaoke style, UPPERCASE or sentence case. The active word is highlighted and emphasis words stay coloured.
   - Caption timing follows the beat weights, spread across the detected speech in the voice track. Silence at the start and end is trimmed automatically.
   - A large animated step number (“STEP 2 / 3”) appears during each step. A “Follow @handle” pill appears on the CTA, and you can add an optional handle watermark and a thin progress bar.
   - `canvas.captureStream()` and the voice track (Web Audio) are recorded together with `MediaRecorder`. The app prefers H.264 MP4 and falls back to WebM (YouTube accepts both). Shorts are capped at 60 s; longer videos use the segmented renderer described below.
   - Tap **Share to YouTube…** to open the Android share sheet, or **Save to phone** to save to `Documents/VoiceToShort/`. There are copy buttons for the title, description, hashtags and pinned comment.
5. **Library.** Projects are stored on the device in IndexedDB: the idea, script, voice, video and a thumbnail. You can edit, render again or delete them.
6. **Settings:**
   - Gemini key, stored only on the device. Get one free at https://aistudio.google.com/apikey.
   - Model picker, plus “Load models from my key”.
   - Channel handle, default tone, script language and default grade.
   - Dictation language and teleprompter speed.
   - Export and import a backup, and delete all.

## Keyword-driven scenes — new in 1.3.0

Every beat's scene now follows its **keywords**, so "grab a pencil and a sketchbook" shows the character drawing with a pencil in a sketchbook, not a generic pose.

- **Gemini plans, the app checks.** The script schema asks for `keywords`, `objects`, an `icon` emoji and the beat's ACTION. An on-device lexicon (about 620 words and phrases, plus their plurals and verb forms) then validates each scene. If the scene doesn't show the line's main keyword, the app replaces it with the matching action, props and setting. A strong action keyword (draw, cook, run…) also replaces a generic pose like "talking".
- **Library.** 40 animated actions, 51 poses in all (drawing, cooking, eating, running, lifting, yoga, typing, studying, shopping, driving, riding the bus, showering, brushing teeth, gaming, singing, painting, gardening, hugging, arguing and more), 310 animated props (drawn in code or from bundled emoji), and 19 settings plus the keyword card (art studio, kitchen, gym, library, bus, stage, shop, living room, bathroom and more).
- **Anything else becomes a keyword card.** Words outside the library ("volcano", "giraffe") get a bobbing icon card from 1,306 bundled Twemoji with the character reacting, never an unrelated scene.
- **Match score.** Each beat shows a keyword-match badge. Beats below 50% are flagged ⚠ with the missing word, and there's an average for the whole script.
- **Keyword picker.** In the scene editor, "Find a keyword, prop or action" searches props, actions and emoji names, then applies the prop, action or icon card.
- **Long videos stay varied.** Settings rotate among each action's valid places, "continuation" lines get gentle varied actions, and camera moves alternate. In the 10-minute test (252 beats) no scene combination repeated more than 6 beats in a row, with 18 settings and 38 actions used.

## Frame shapes — new in 1.3.0

9:16 (1080×1920), 16:9 (1920×1080), 1:1 (1080×1080) or 4:5 (1080×1350). Pick one in Render and set a default in Settings. Each shape gets its own layout: 16:9 puts the scene card on the left with captions on the right, and 1:1 and 4:5 put captions above a rounded scene card. Nothing is letterboxed or cropped.

## Long videos (up to 20 min) — new in 1.3.0

- **Script.** Gemini writes an outline first (about one section per 80 s), then each section in its own call with the outline and the end of the previous section as context. The app stitches the sections into chapters (a "PART n" badge in the video, chapters in the description). Progress is saved after every call. If a call fails, tap Write again to continue from the next section. Quota errors (429) and 5xx errors are retried with backoff, following Gemini's `retryDelay`.
- **AI voice.** Generated per paragraph (≤150 words) with progress. Each finished chunk is cached in IndexedDB, so a failure never restarts the whole voice. Playback joins the parts without decoding them.
- **Your voice.** The teleprompter records long scripts section by section, with pause/resume, a retake per section and "use recorded parts".
- **Rendering.** Videos over 150 s are rendered in parts of about 75 s. Each part is recorded in real time and streamed to app storage (OPFS in Chrome and the Android WebView; the Capacitor Filesystem as a fallback) as it finishes. The screen is kept awake, and progress shows the part and an ETA. If the app is backgrounded, the current part restarts when you come back. If you cancel or it fails, "Resume render" continues from the last finished part. A small streaming WebM remuxer in JS then joins the parts into one file with bounded memory: it re-times clusters and trims overlaps, without re-encoding or loading whole files. If joining isn't possible (for example if a device only records MP4), you get numbered parts to join in any editor.
- **Output.** Long videos are WebM (VP8 + Opus), 720p by default (1080p optional), at 6 Mbps.
- **Tested** in headless Chrome: a 10-min 16:9 render and a 20-min 9:16 render, both ffprobe-checked for full duration, A/V sync at the start, middle and end, and gaps at the joins (see `tests/long.js`).

## Animated scenes (2D cartoon) — new in 1.2.0

Videos are no longer "just talking". Every caption beat gets a **scene**, and a built-in 2D animation engine draws it on the device (canvas, free, no network) in a consistent flat-vector style like faceless psychology channels:

- **Scene planning:** Gemini's structured script now returns a `scene` per beat — `setting`, `pose`, `emotion`, up to 3 `props`, `camera`, optional `callout` sticker, `characters` (1 or 2). Unknown or missing values are repaired (synonyms + keyword heuristics, e.g. "at night … awake" → bedroom-night / lying-awake), and the same setting is kept across beats of one idea.
- **Vocabulary:** 10 settings (bedroom-night, bedroom-day, office, classroom, street, café, park, mind space, phone screen, plain spotlight), 11 poses (lying awake, head in hands, walking, thinking, talking, celebrating, stressed, scrolling phone, sleeping, meditating, running), 8 emotions, 26 animated props (phone, clock, brain, thought bubbles, question marks, lightbulb, heart, notebook, coffee, moon, sun, calendar, alarm, arrows, checklist, battery, cloud, zzz, sparkles, chains, weights, stairs, mirror, speech bubbles, confetti, exclamation) and 4 camera moves.
- **Animation:** a rigged character (head, torso, arms, legs, eyes, brows, mouth) blinks, breathes, bobs, darts its eyes when anxious, lip-flaps while talking, tosses and turns in bed, types, paces; props animate (clock hands spin, phone glow pulses, thought bubbles pop and float, brain pulses with sparks, lightbulb flickers on, zzz rise, heart beats…). Shots change with slide / zoom / wipe / pop transitions timed to the beats. Captions sit in the top zone clear of the character; step badge, grade, grain and vignette stay on top.
- **Edit:** in the Script step tap 🎬 on any beat to change its scene with dropdowns (live preview), "↻ Regenerate scene" (Gemini, with a built-in fallback) or "Same as previous".
- **Visual style:** "Animated scenes" (default) or "Captions only (classic)" — in the Script step, the Render step and Settings.
- **Optional AI illustrations (off by default):** "Use AI-drawn illustrations when available" asks Gemini's image models (`gemini-3.1-flash-lite-image` → `gemini-3.1-flash-image` → `gemini-3-pro-image` → preview names → `gemini-2.5-flash-image`) for one flat 2D illustration per shot (max 8 per video), then animates it with Ken Burns/parallax plus the prop overlays. **Google's image models have no free tier** (≈ $0.03–0.04 per image on a billing-enabled key); on a free key or quota error the app silently uses the built-in scenes.

## AI voice (Gemini text-to-speech) — new in 1.1.0

The recommended voice option. It uses Gemini's native text-to-speech with the same API key (sent only in the `x-goog-api-key` header; `AQ.` keys work).

- **Models, tried in order:** the model that last worked → `gemini-3.8-flash-tts` → `gemini-3.8-flash-lite-tts` → `gemini-3.1-flash-tts-preview` → `gemini-2.5-flash-preview-tts` → `gemini-2.5-pro-preview-tts` → any other TTS models your key lists. When a model returns 404, is unavailable or is out of quota, the app moves to the next one and remembers the one that worked. Errors include a `Details:` line. Settings → AI voice lets you pick a model or load the list from your key.
- **Request:** `generateContent` with `responseModalities: ["AUDIO"]` and `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`.
- **Delivery style:**
  - 3.8 models get the style in `speech_metadata.style`, because they read the text word for word.
  - Older models get a spoken instruction in front of the text instead, like "Say in a calm, warm, confident voice: …".
  - The styles are Match my tone, Calm teacher, Bold, Soft, or a custom style.
- **Voices:** all 30 prebuilt voices. Each has a ▶ preview (a short sample sentence, cached per voice and style). The chosen voice is saved in Settings.
- **Audio:** raw 24 kHz 16-bit mono PCM (or WAV) is wrapped into a WAV file and used as the voiceover track. You can play it back or regenerate it.
- **Long scripts:** split at sentence boundaries into chunks of about 120 words, then joined with short pauses.
- **Quota:** the free tier allows only a limited number of voice generations per minute and per day, and previews count too. When every model is out of quota, the app tells you to try again later or record your own voice.
- **Needs internet.** Nothing except your script goes to Google.

## Gemini

- The app calls `generativelanguage.googleapis.com/v1beta` directly from the device. The key goes in the `x-goog-api-key` header, never in the URL.
- New AI Studio keys start with `AQ.` and work. The default model is `gemini-3.8-flash`.
- If a model isn't available for your key, the app tries these in order and remembers the one that works:
  1. Any replacement model named in the error
  2. `gemini-3.8-flash`, `gemini-flash-latest`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash`
  3. The best models from your key's own model list
- Saved 1.x/2.x model settings are migrated, because 2.x models fail for new keys.
- Errors end with a `Details:` line that shows the raw API status. The key is redacted.
- It uses structured output (`responseMimeType: application/json` plus `responseSchema`). If a model rejects the schema, it retries with JSON-by-prompt.

## Honest caveats

- **TTS in the video.** Browsers can't record `speechSynthesis` audio, so on the web the device voice is preview-only. You can use “Record it through the mic”, which plays the voice aloud and records it (lower quality), or record your own voice. The Android app doesn't have this limit, because it synthesises the voice to a file natively. Some phones have no TTS engine installed. If so, install “Speech Recognition & Synthesis” from Google Play or just record your voice.
- **Video format.** Android's WebView usually records H.264 + AAC MP4. When it can't, you get WebM (VP9/Opus). WebM uploads to YouTube fine, but some gallery apps won't play it. The app writes a proper duration into WebM files so they can be scrubbed.
- **Real-time rendering.** A 40 s Short takes about 40 s to render. Keep the app open and the screen on; the app asks Android to keep the screen awake. Slow phones may drop frames under load.
- **Dictation** uses the phone's speech service, and most phones need internet for it. Raw-audio capture of the idea is off by default, because on many phones the recogniser and the recorder can't share the mic.
- **Animated scenes** are a hand-authored flat style with one main character design (plus a second for conversations) and fixed poses: they illustrate each beat with the closest scene in the vocabulary, not a custom animation. AI illustrations need a paid (billing-enabled) Gemini key and weren't verified against a live key.
- **Long videos** were verified in headless desktop Chrome. On a real phone, a 20-minute real-time render takes over 20 minutes and uses about 6 MB of storage per 10 s at 720p (about 0.9 GB for 20 min). The A/V timing compensation was tuned on desktop Chrome and hasn't been verified on a physical Android phone, and neither has the Capacitor Filesystem storage fallback. Importing one long audio file decodes it in full, so AI voice or recording section by section is lighter. YouTube Shorts can be at most 3 minutes long; longer vertical videos upload as regular videos.
- **Backups** hold text only: ideas, scripts and settings. Audio and video stay on the device, and the API key is never exported.

## Install on Android (6.0+)

1. Download `VoiceToShort-1.3.0.apk` from the latest release.
2. Open it. If Android asks, allow “Install unknown apps” for your browser or Files app.
3. Open **Voice to Short**, go to **Settings**, paste your free Gemini key and tap **Save key**.
4. Allow the microphone when asked. It's used for dictation and voice recording.

To check the download against `SHA256SUMS.txt`, run `sha256sum VoiceToShort-1.3.0.apk`.

## Development

Plain HTML/CSS/JS in `www/`, with no build step. [Capacitor 7](https://capacitorjs.com) wraps it for Android (`android/`).

```bash
npm ci
npm run serve                     # web version at http://localhost:8080
npm run apk:debug                 # needs the Android SDK (JDK 21)
node tests/e2e.js /path/voice.wav # headless Chrome end-to-end test with a mocked Gemini API
node tests/e2e13.js               # v1.3: keyword scenes, picker, 4 frame shapes, long-video flow
node tests/long.js s10 16:9 0.6667 out.webm 3   # long segmented render + resume (see tests/long.html)
```

Plugins:
- `@capacitor-community/speech-recognition` for dictation
- `@capacitor-community/text-to-speech` for TTS preview
- `@capacitor/filesystem` and `@capacitor/share` for saving and sharing
- A small local plugin, `VtsNativePlugin.java`, for TTS-to-WAV and keep-screen-on

### CI

- `.github/workflows/android.yml` builds a signed release APK. It needs these repo secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. Without them, the APK is signed with a debug key.
- `.github/workflows/pages.yml` deploys `www/` to GitHub Pages.

Keyword icons: [Twemoji](https://github.com/jdecked/twemoji) by Twitter/X and contributors, licensed [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) (`www/emoji/LICENSE.txt`). Emoji names and tags: [emojibase](https://github.com/milesj/emojibase) (MIT).

Font: [Montserrat](https://github.com/google/fonts/tree/main/ofl/montserrat) (SIL Open Font License), bundled in `www/fonts/`.

## License

MIT
