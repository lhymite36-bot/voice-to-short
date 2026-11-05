# Voice to Short 1.11.1-decide-3d-test

**TEST / pre-release.** Decide now renders the real dark **3D Blender EEVEE** look inside the Windows app.

## New
- **Render Decide 3D** button (Windows app, Decide → Render step). Runs the bundled `tools/decide` pipeline:
  Gemini multi-voice TTS → horror SFX → Blender EEVEE scenes → A/B pills, rewind, captions, audio mix → 1080×1920 MP4.
- Finished MP4 loads into the project like a normal render, so Save / Share work.
- Detects Blender (PATH or Program Files\Blender Foundation), Python, Node. If your ffmpeg is missing/too old, a free ffmpeg build (~90 MB, BtbN) downloads once into the app data folder.
- Clear in-app message if Blender is missing (free from blender.org).
- **Quick 2D draft** stays available as the secondary button (same as phone).
- Pipeline scripts are path-independent (work dir under app data) and auto-generate choice pills from your script.

## Notes
- Uses your Gemini key from Settings for voices. Render time ~5–20 min depending on PC.
- 3D sets are the WESTGATE set library (desk, corridor, food court, staff door, break room); your script's scenes map to the closest set.
- Quiet Brain Autopilot / Buffer unchanged. Not merged to main / Latest.
