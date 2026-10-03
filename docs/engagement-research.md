# Engagement research for Voice to Short 1.4 ("Quiet Brain Club")

Research date: 30 Sep 2026. Scope: what makes faceless, animated psychology/self-help Shorts and TikToks hold attention and get comments, and how each finding changed the app. Sources are public web pages (listed at the end). Where sources quote figures, those are the sources' own benchmarks (often vendor data), so treat them as directional, not as science.

## 1. What the top faceless animated psychology channels do

| Channel / style | What works | What we took |
|---|---|---|
| **Psych2Go** (9M+ subs) | One simple, recurring character acting out the exact behaviour being described; handwritten text labels; small constant motion ("adding a little movement… adds life", their animator); names a familiar inner feeling, then gives the psychology label and validation. | Recurring cast (Me + **Brain** sidekick), labelled stickers, constant idle motion, "name the feeling → concept name → validation" script rule. |
| **The School of Life** | Calm, literate voice; illustration as metaphor; big ideas in plain language. | Keep "Calm teacher" / "Soft" tones; metaphor props (social battery, loading bar, tangled yarn). |
| **Improvement Pill / Kurzgesagt-lite** | Stick-figure/flat-vector explainer, fast visual metaphors, a surprising reframe, practical steps. | Classic "hook + 3 steps + CTA" template kept; icon-card metaphors; step badges. |
| **"Your brain be like" / "Me vs my brain" meme accounts** | The brain as a separate, slightly unhinged character arguing with you (3 a.m. cringe replays, "remember that thing from 2014?"). Huge relatability, strong comment bait ("mine does this every night"). | New **Brain character** (pink, face, arms, legs) and the **Brain vs Me** dialogue template; speaker-aware captions. |
| **POV / "Nobody: … Me:" / Expectation vs Reality** meme formats | Instantly recognisable structures; the joke is in the contrast. | Templates: POV, Nobody/Me, Expectation vs Reality (split-screen), Rating your habits (stars), Signs you're secretly…, Things your therapist wants you to know, Myth vs Fact, Storytime. |

## 2. Retention: the first 1–3 seconds

- Most swipe-away decisions happen in the first ~2 s; sources put a healthy 3-second hold at 70–90% (shortsfast, ytshark, fluxnote).
- **Hook = three layers at once:** the first spoken line, the first frame (motion/contrast), and an **on-screen text hook**. ~85% of viewers see the first second muted, so the hook must be readable, not only heard (taletok, shortsfast). Text in the hook is reported as +18% watch time (virvid citing Zebracat).
- **Speak within ~0.3 s.** No logo, greeting, "in this video" or slow music intro (ytshark).
- Good psychology hooks **name a feeling before explaining it** ("You keep checking your phone even when nothing is there…") (facelesslab).

**Changes in the app:** every script gets a `textHook` (≤ 7 words) shown big on the first frame for ~1.6 s and on the exported cover. The lead-in before the voice stays at 0.3 s. Script rules ban greetings, and the hook must be ≤ 12 words and relatable/contrarian.

## 3. Pacing: pattern interrupts every 2–4 s

- "A new beat every 2 to 3 seconds: a visual cut, a text overlay, a zoom, a sound effect" (prepublish). Vendor data: interrupt every ~4 s → 58% vs 41% retention (shortsfast citing Opus Clip); sudden zoom was the single most effective interrupt, then animated text, then jump cuts (edicionvideopro).
- Mid-video dips come from holding one visual for more than ~5 s (fluxnote).
- Simplicity still matters: clarity and low cognitive load beat busy chaos (viralfaceless).

**Changes:** automatic camera moves (**punch-in, whip pan, flash cut, speed ramp, shake, impact punch**), so something changes on screen at least every ~2.5 s. Overlays, shot changes and stickers count too, and long beats get an extra punch-in on a word boundary. Plus per-beat **FX** (zoom-punch, record-scratch freeze-frame, spotlight, impact frame, split-screen, chat, notification, loading bar, XP bar, checklist, rating, before/after, thought-bubble argument), reaction stickers (BRUH, WAIT WHAT, NOT AGAIN, 💀…), and SFX synced to the same frames. An "Energy" setting (Off / Chill ~4 s / Punchy ~2.5 s / Chaotic ~1.7 s) caps how many interrupts are added, so calm videos stay calm. Punchy is the default. An offline test checks that the longest gap between visual changes is ≤ 3.6 s.

## 4. Captions

- Burned-in captions are non-negotiable; large, **1–3 words per caption frame**, synced to speech (taletok). Don't put a wall of text in the first frame (ytshark).
- Styles that dominate: bold white with a thick black outline and one highlighted keyword (TikTok native look), and huge colourful "MrBeast-style" words with pop/rotation.

**Changes:** caption presets **TikTok Bold** (default), **Beast** (huge, coloured, rotating), **Clean**, plus the old Pop/Karaoke. Words pop in; key words get emphasis colours; an auto-emoji appears above keywords; punchlines shake. Captions are chunked into ≤ 3 words for TikTok Bold / Beast.

## 5. Safe zones (9:16, 1080 × 1920)

| Platform | Top | Bottom | Left | Right |
|---|---|---|---|---|
| TikTok (organic) | 130–220 px | 320–484 px | 44 px | 140 px |
| YouTube Shorts | ~150 px | ~350–380 px | ~60 px | 140–216 px |

(uplads, cadenus, dynapictures, playcut; the bottom band grows with longer captions.)

**Changes:** captions, stickers, text hook and CTA are kept inside x 60–900, y 230–1400 in 9:16 (clear of both apps' right rail and bottom caption). "Show safe zones" draws both platforms' overlays on the preview (never in the export).

## 6. Endings, loops and comments

- Loops push average view duration past 100%; replays show as a rise at the end of the retention curve (virvid, fluxnote, prepublish). Replace "thanks for watching" with a line that **feeds back into the hook**.
- Comments are driven by **opinion-provoking, relatable questions** ("comment your 3 a.m. thought", "tag the friend who…", "which one are you?").
- Place the payoff before the final second (viralfaceless).

**Changes:** "Loop ending" option: the script's last line is written to flow back into the hook, and the last ~0.45 s of video cross-fades into the opening frame, so the replay is seamless. CTA sticker variants such as "Follow if your brain does this too", "Comment your 3 a.m. thought 👇", "Send this to your overthinker", "Which one are you? 1 or 2?".

## 7. Sound

- SFX punches on cuts/zooms (whoosh, pop, hit, glitch) are a core interrupt; "audio + visual together = double impact" (edicionvideopro).
- Some guides suggest trending music at 5–10% under a voiceover for discovery (getkoro). Trending sounds are copyrighted and can't be bundled; that has to be done inside TikTok/YouTube when posting. The app bundles only free-licence audio and keeps the voice clearly on top.

**Changes:** bundled SFX (Kenney CC0 packs + one CC BY 3.0 crowd laugh + sounds synthesised in the app: whoosh, vine-boom-style bass hit, record scratch, boing, "bruh"-style trombone womp, heartbeat, typing), auto-placed on FX/punchlines. Background music is **generated on the device** as seamless 4-bar loops (quirky comedy, lo-fi, upbeat, soft pads, suspense) so it has no licence risk, and it's **ducked under the voice** (sidechain-style, from the voice envelope). Toggles and volume sliders for voice, music and SFX. Default music level is low (voice never buried). An offline test checks that the voice stays ≥ 12 dB above the music while it's talking (measured: ~24 dB). For **Brain vs Me** dialogues, the AI voice can use Gemini multi-speaker TTS, with a second contrasting voice for the Brain (or the friend, boss…). It falls back to one voice.

## 8. Platform metadata

- TikTok: search reads the caption, spoken words and on-screen text. Front-load the keyword in the first ~150 characters; 3–5 specific hashtags; avoid #fyp stacks (mediasearchgroup, syncstudio, postjay).
- YouTube Shorts: title is the key search field (< 70 chars, keyword first); description first ~125 chars matter; 3–5 hashtags including #Shorts.

**Changes:** Gemini writes a separate **TikTok caption + 3–5 hashtags** and **YouTube title + description + hashtags (with #Shorts)**; copy buttons for each; platform presets (TikTok / YouTube Shorts / Both → 9:16, 60 s default, 30 s option).

## 9. Humour that stays accurate

- The relatable-meme channels work because the joke is **true to experience**. Psych2Go's autism video backlash shows the cost of getting psychology wrong (Wikitubia).

**Changes:** script rules: sarcasm and jokes at the *situation* (or gently at "you/me"), never at a diagnosis or group; name real concepts (e.g. "Zeigarnik effect", "negativity bias", "decision fatigue", "reward prediction error") only when accurate; no invented statistics or studies; no medical claims. Humour dial 0–3.

## 10. Ideas and trending formats

- Channels that post daily run on a backlog of proven premises and recurring formats. The same format with a new topic is how meme accounts scale (Psych2Go series, "Me vs my brain" accounts).

**Changes:** a 💡 **Idea bank** with 114 funny, psychology-accurate ideas in 14 categories (overthinking, procrastination, sleep, social battery, people-pleasing, relationships and attachment, dopamine and phone, confidence, burnout, habits, school, money…). Each idea comes with a suggested format and length. There's a 🎲 **Surprise me** button and 11 **trending-format cards** that explain why each format works, with an example.

## Sources

- facelesslab.video/blog/en/faceless-psychology-channel
- shortsfast.com/blog/faceless-shorts-hooks-retention-2026
- viralfaceless.io/blog/viral-shorts-psychology-7-retention-levers
- virvid.ai/blog/faceless-youtube-algorithm-retention-2026
- fluxnote.io/guides/faceless-shorts-analytics-guide-2026
- ytshark.com/youtube-shorts-hooks
- taletok.io/blog/how-to-make-viral-youtube-shorts
- prepublish.ai/guides/youtube-shorts-retention
- getkoro.app/blog/create-youtube-shorts
- edicionvideopro.com/en/editing-for-platforms-video-marketing/pattern-interrupts-tiktok-retention-guide
- cadenus.io/resources/blog/tiktok-safe-zone · uplads.com/tools/safe-zone-checker · playcut.ai/tools/safe-zone-checker · dynapictures.com/tools/tiktok-safe-zone-checker
- mediasearchgroup.com/seo/voice-and-video-seo-optimizing-youtube-shorts-and-tiktok · syncstudio.ai/blog/short-form-video-seo · postjay.com/blog/how-many-hashtags-should-you-use-2026
- youtube.fandom.com/wiki/Psych2Go · Psych2Go "We Usually Don't Show This" (animator process) on YouTube
- reddit.com/r/psychologymemes (expectation vs reality examples)
- Audio licences: kenney.nl (CC0 packs), Wikimedia Commons "72844 lonemonk approx-800-laughter-and-clapter-1.wav" (CC BY 3.0)
