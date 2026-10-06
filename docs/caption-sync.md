# Caption / voice sync (Oct 2026)

## Problem
Posted Shorts had captions out of step with the voice, by up to ~1 s on average and up to 5 s at worst, usually getting
worse further into the video (Beatrice's report: "the audio plays faster than the captions").

## Measured (posted Shorts, 2026-10-03 / 04 / 05)
Ground truth: wav2vec2 CTC forced alignment of the beat text against the saved `shortN.voice.wav`
(the voice sits at +0.300 s in the MP4; verified by cross-checking the transcribed MP4 audio).
Error = caption word time minus spoken word onset (negative = caption shows before the word is said).

| set | words | mean | mean abs | median abs | p90 abs | worst | beat starts within 100 ms |
|---|---|---|---|---|---|---|---|
| before (10 Shorts, 10-04 + 10-05) | 1127 | -1241 ms | 1293 ms | 1161 ms | 2400 ms | 5071 ms | 5% |
| after (same voices, new timing) | 1127 | -56 ms | 174 ms | 110 ms | 390 ms | 1717 ms | 68% (median 61 ms) |

The 10-03 Shorts (rendered with the in-app real-time recorder) show the same pattern: mean abs 0.46-1.63 s per Short.

## Root cause
Captions were never timed from the audio. `buildTimeline()` spread the beats over the speech span in proportion to
`beat.weight` (Gemini's word count, clamped to 12), then spread words inside a beat by letter count. Only the first and
last word were tied to the real voice (speech start/end). Gemini TTS reads with dramatic pauses ("Nobody. ... Absolutely
nobody."), speaker changes, slow emphatic lines and fast asides, so the word-count estimate ran ahead of or behind the
voice and the error built up beat by beat. The renderer itself was fine: offline renders draw frame k at k/30 s and the
in-app recorder draws from `audioContext.currentTime`; the MP4 audio is exactly where it should be (voice at +0.300 s);
no sample-rate, atempo or remux problem was found (24 kHz TTS WAV, durations match to the ms).

## Fix
`render.js`: `plan()` now returns `speech`, a 10 ms loudness profile of the actual decoded voice. `buildTimeline()` (and
`Renderer.setup({ speech })`) aligns the script to it: pauses are found in the audio, a monotonic dynamic programme decides
which pause belongs after which word (preferring beat ends / punctuation, fitting each stretch to the read's pace), and
words are placed by syllables inside each stretch of real speech. Beats start 60 ms before their first word. Without a
voice (silent / no audio) the old word-count timing is used. Used by the in-app preview + real-time render, long videos
(`segments.planTrack` builds the profile from the disk-backed track; per-section alignment) and the box offline renderer
(`tests/live/preview-offline.js`, so `e2e-live.js` / `run-day.sh` get it too). SFX cues, scene cuts and stickers follow beat
starts, so they move onto the voice as well.

Test: `node tests/caption-sync.js` (offline, synthetic voice with known word onsets).
