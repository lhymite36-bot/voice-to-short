# Decide Mode Schema (Voice to Short)

## Format
Choose-your-own-adventure horror Short (~90–120s, 1080×1920).

## Beat structure
1. **hook** — black or establishing; series title + premise
2. **setup** — place the viewer in the scene (desk / corridor / vehicle)
3. **choice_1** — on-screen A/B pills with lines/dots pointing at targets; narrator invites pick
4. **branch_a** — short "wrong" path (~15–25s), ends badly
5. **rewind** — rewind icon + whip back to choice
6. **branch_b** — longer "correct-feeling" path that gets worse (~40–55s)
7. **cliffhanger** — new A/B + "So… what would you do?"

## script.json fields
- `mode`: "decide"
- `title`, `series`, `part`, `target_seconds`
- `choices`: named choice sets `{ id, prompt, options:[{key,label,color,targetHint}] }`
- `lines[]`: `{ id, speaker, voice, style, text, caption, highlight[], choiceId?, choiceKey?, scene, ui, dur }`
  - `ui`: null | "choice" | "choice_lock" | "rewind" | "cliffhanger"
- `cast`: map speaker → voice name + role
- `sfxPlan`: timed SFX cues

## Visual rules
- Dark polished low-poly / blocky 3D (Roblox-adjacent), cinematic lighting
- Readable props (EXIT, LED panels, safety cards, name tags, flashlight beams)
- Big center captions; emphasis words colored
- A = red pill, B = green pill (or story colors); pointer lines to world targets
- Multi AI voices; no Follow CTA — end on comment question

## App integration
- Mode picker: Voice Short | Comic Recap | Decide
- Desktop/PC: Blender EEVEE render path for 3D scenes
- Phone: script + voice + queue; full 3D assemble preferred on desktop
- Autopilot target: optional second Buffer account (separate from Quiet Brain)
