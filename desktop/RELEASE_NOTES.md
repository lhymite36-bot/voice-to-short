Voice to Short 1.10.1 (TEST build) — Autopilot fixes

- Autopilot now renders frame by frame with WebCodecs into a normal MP4 (correct duration, max 59 s), even with the screen off or the window hidden. Fixes Buffer's "Video must be no longer than 3 minutes" error.
- The video is checked (duration, container) before upload; a bad file is never uploaded.
- An empty GitHub media repo now gets a README automatically (clear error if the token can't).
