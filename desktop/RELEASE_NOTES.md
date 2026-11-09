# Voice to Short 1.11.6-autopilot-render-fix-test

**TEST / pre-release (not Latest).** Fixes for Autopilot renders and uploads that stopped while the phone was asleep or the app was in the background.

- The "stuck at 3–4 %" runs were the app being frozen by Android, not a stall with the app open. 1.11.5 wrote a stale "in background" figure into the log, so it looked like a stall with the app open. The log now shows how long the app was frozen.
- After a freeze, the run continues where it stopped. Time limits count only the time the app was actually running.
- If the video encoder dies, rendering resumes from the last 2-second checkpoint instead of starting again at 0 %.
- A retry re-uses the script, voice and finished video that were already saved, so it does not make them again.
- The render keeps full speed in the background: it no longer waits on timers that Android throttles to once a minute.
- Upload: a stalled connection is dropped after 60 s with no data sent, then retried. Progress is shown. Stopping a run cancels its upload. A Wi-Fi lock is held during the run.
- Windows: Buffer/GitHub requests time out instead of waiting forever.
