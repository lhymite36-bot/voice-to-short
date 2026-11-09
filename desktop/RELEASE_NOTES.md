# Voice to Short 1.12.0-studio-m2-test

Quiet Brain Studio (M0–M2) test build. Prerelease — not Latest.

## New

- **Studio** tab: recent Shorts stats (views, likes, comments, average % viewed, retention early-hold).
- Comment miner: viewer questions → topic queue.
- Autopilot prefers Studio topics before the Idea bank.
- Direct YouTube OAuth now requests `yt-analytics.readonly` and `youtube.force-ssl` (re-connect once).

## Unchanged

- Autopilot Buffer posting, render freeze/resume fixes from 1.11.6, Decide mode.

## Setup

1. Enable **YouTube Analytics API** on your Google Cloud project.
2. Settings → Autopilot → Direct YouTube → Disconnect → Connect again.
3. Open Studio → Refresh.
