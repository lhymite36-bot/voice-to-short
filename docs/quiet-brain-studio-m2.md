# Quiet Brain Studio M0–M2 (v1.12.0)

Adds a **Studio** tab that:

1. Signs in with the existing Direct-YouTube OAuth client (expanded scopes).
2. Pulls recent Shorts stats: views, likes, comments, averageViewPercentage, retention curve, early-hold proxy.
3. Mines comment questions into a topic queue.
4. Lets Autopilot prefer those topics before the Idea bank.

## One-time setup for Pedro

1. In [Google Cloud Console](https://console.cloud.google.com/) open the same project that has your Voice to Short OAuth client.
2. **APIs & Services → Library** → enable **YouTube Analytics API** (YouTube Data API v3 should already be on).
3. **OAuth consent screen** → add scopes if prompted:
   - `.../auth/yt-analytics.readonly`
   - `.../auth/youtube.force-ssl`
   - (keep existing upload + readonly)
4. In the app: **Settings → Autopilot → Direct YouTube → Disconnect**, then **Connect YouTube** again and accept the new permissions. Buffer posting can stay as the Autopilot method; Studio only needs the Google sign-in for reading stats/comments.
5. Open the **Studio** tab → **Refresh stats & comments**.

## Limits (honest)

- YouTube **Test & Compare** still does not work on Shorts (not in this milestone).
- **Viewed vs Swiped Away** is Studio-only; we show **early hold** from the retention curve instead.
- Analytics for very new Shorts can lag ~1–3 days.
