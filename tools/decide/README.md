# Decide mode — desktop 3D pipeline

Choose-your-own-adventure horror Shorts for Voice to Short.

## Flow
1. In the app, pick **Decide**, write a premise, tap **Write the Decide script**.
2. **Export script.json** (or use the showcase script here).
3. On a desktop/PC with Blender 5.x:
   ```bash
   export GEMINI_API_KEY=...
   node gen_tts.mjs          # needs script.json beside it
   python3 gen_sfx.py
   blender -b -P render_scenes.py
   python3 assemble.py       # → decide-showcase.mp4
   ```
4. Import the MP4 back into Voice to Short / Buffer as needed.

## Schema
See `schema.md`. Showcase story: WESTGATE — NIGHT SHIFT (original mall horror; not a copy of any TikTok).

## Quality targets vs reference (@playmalo RED-EYE style)
- On-screen A/B pills + pointer dots, rewind beat, cliffhanger A/B
- Multi-voice cast, big captions with colored emphasis
- Richer props: EXIT / LED panels, safety cards, flashlight spots, name tags
- 1080×1920 H.264 + AAC faststart
