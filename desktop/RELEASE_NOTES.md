# Voice to Short 1.11.0-decide-test

**TEST / pre-release.** Adds **Decide** mode: choose-your-own-adventure horror Shorts.

## What’s in this build
- Mode picker: Voice Short | Comic Recap | **Decide**
- Write a premise → Gemini writes a branching A/B script (wrong path → rewind → longer path → cliffhanger)
- Multi-voice cast labels in the script; export `script.json` for desktop 3D
- Desktop installs include `tools/decide` (Blender EEVEE pipeline README + scripts)

## Phone vs desktop
- **Phone:** Decide script + AI voice + normal in-app render (captions / 2D path). Good for drafting.
- **Desktop (PC):** For the advanced 3D horror look (flashlight beams, LED props, A/B UI overlays like the WESTGATE showcase), export the script and run `tools/decide` with Blender 5.x — see `resources/tools/decide/README.md` next to the app.

## Not in this build
- One-click in-app Blender render button (use tools/decide for now)
- Merge to main / Latest — Pedro must approve first
- Autopilot posting Decide Shorts (Quiet Brain Autopilot unchanged)

Install over 1.10.x-test with the same signing key.
