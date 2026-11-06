# WESTGATE Decide showcase — quality notes vs @playmalo RED-EYE Part 5

## Deliverable
- `/workspace/decide/decide-showcase.mp4` — 107s, 1080×1920 H.264+AAC, ~19 MB
- Stills: `/workspace/decide/stills/*.jpg`
- Script: `/workspace/decide/script.json` (original mall night-shift; not airplane/RED-EYE)

## What exceeds / matches the reference format
- Full Decide beat structure: opening A/B → short wrong path → REWIND → longer path → cliffhanger A/B + “So… what would you do?”
- On-screen A/B pills (red/green) with pointer dots; lock pills during branches; rewind badge
- Multi-voice cast (Charon / Leda / Orus / Puck via Gemini TTS)
- Big center captions + colored emphasis words
- Readable props: ALL CLEAR / SEE YOU LED, EXIT, safety cards, keypad, name tags, flashlight spots
- Dark cinematic EEVEE lighting, vignette, creepy glowing-smile staff
- Longer than many Shorts (~107s) with series badge “WESTGATE · PART 1”

## What still lags the reference
- Character/set polish: still primitive blocky (Roblox-adjacent) vs reference’s denser props (machinery panels, safety card detail, many flashlight beams, richer materials)
- Faces: glowing grin works for horror, but less expressive freckled “cute horror” faces from the reference
- Camera: fewer polished close-ups / whip pans; motion is mostly dolly + zoompan hold
- Render budget: 648×1152 @ 32 TAA × 8 frames/shot (upscaled to 1080×1920) — not full native 1080 EEVEE cinema
- Staff-door / some corridor framings can read abstract until captions anchor them
- Pointer lines on choice pills are simpler than reference’s long animated tracers
- No full series continuity art (Part 2+), no particle dust/fog volume yet

## Next polish steps
1. Native 1080×1920 EEVEE, 64+ samples, 16–24 frames/shot with walk cycles
2. Better character kits (uniform + badge + freckled faces; smile morph)
3. Volumetric flashlight cones, more storefront neon, food-court props density
4. Animated choice tracers + rewind tape-glitch transition
5. Wire desktop “Render Decide 3D” button to tools/decide from Electron
6. Second Buffer account target once Pedro provides it
