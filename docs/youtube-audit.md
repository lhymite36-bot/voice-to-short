# Direct-YouTube mode: Google verification and the YouTube API audit

**Only needed for the optional "Direct to YouTube" posting method.** The default method, Buffer,
uses Buffer's own approved YouTube connection, so it needs no Google review at all.

## Why this matters

- When the Google Cloud project behind your OAuth client is **unverified / unaudited**, YouTube locks every
  video uploaded through `videos.insert` to **private** ("locked private, unverified API project").
  Autopilot shows a warning in the post log when YouTube returns a privacy that is not `public`.
- While the OAuth consent screen is in **Testing** mode, Google expires refresh tokens after **7 days**,
  so you would have to tap *Connect YouTube* again every week.
- Default quota: 10,000 units/day. One upload costs 1,600 units, so about **6 uploads per day**. The app
  counts this and shows "YouTube uploads left today". Quota resets at midnight Pacific Time (1:30 PM IST,
  or 12:30 PM IST in US summer time).

## What to do (all free)

1. **Publish the consent screen** (APIs & Services → OAuth consent screen → *Publish app*). The scopes
   `youtube.upload` and `youtube.readonly` are *sensitive*, so Google asks for **OAuth verification**:
   - a home page and a privacy policy URL (a GitHub Pages page in the repo is fine),
   - a short YouTube demo video showing the sign-in and an upload,
   - the justification text below.
2. Submit the **YouTube API Services audit / quota form**:
   <https://support.google.com/youtube/contact/yt_api_form> (choose "YouTube API Services - Audit and Quota Extension").
   Passing the audit removes the private lock. You may also ask for more quota if you ever want more than 6 a day.
3. Wait for Google's emails (typically several days to a few weeks). Answer any follow-up questions.

Nothing is submitted by the app or by this repo; you fill the forms yourself.

## Draft text for the forms

**App name:** Voice to Short (personal use)

**What does your app do?**
> Voice to Short is a personal, open-source app (Android + Windows) that I use to create short
> psychology-themed animated videos for my own YouTube channel, "Quiet Brain". It writes a script with
> Google Gemini, generates a voiceover, renders a 9:16 animated video on my own device, and uploads it to
> my own channel at times I choose. It is used only by me, the channel owner.

**How will you use the YouTube API?**
> Only `videos.insert` (resumable upload) to upload my own Shorts to my own channel, and
> `channels.list?mine=true` to show which channel is connected. No other users' data is read, stored or
> shared. Uploads set title, description, tags, category, privacy=public, selfDeclaredMadeForKids=false
> and containsSyntheticMedia=false (the visuals are cartoon animation, not realistic synthetic people).

**Scopes and why:**
> - `https://www.googleapis.com/auth/youtube.upload`: upload my videos.
> - `https://www.googleapis.com/auth/youtube.readonly`: read my channel name to confirm the right account is connected.

**Data handling:**
> The OAuth refresh token is stored only on my device, encrypted (Android Keystore on the phone,
> Windows DPAPI via Electron safeStorage on the PC). It is never sent anywhere except Google's token
> endpoint. There is no server. Revoking access at myaccount.google.com/permissions removes it.

**Expected volume:** up to 6 uploads per day, about 1,600 × 6 = 9,600 units/day (within the default quota).

**Users:** 1 (the channel owner). Not offered to the public.

**Links:** source code `https://github.com/lhymite36-bot/voice-to-short`; privacy policy: (add your GitHub Pages URL).

## Privacy policy (paste into a page you host)

> Voice to Short runs entirely on the user's own device. It sends scripts to Google Gemini to generate text
> and voice, and uploads videos to the user's own YouTube channel through the YouTube Data API. It stores
> the YouTube refresh token encrypted on the device and has no server, analytics or third-party sharing.
> Users can revoke access at any time at https://myaccount.google.com/permissions.


## Quiet Brain Studio scopes (v1.12+)

Studio needs two extra scopes on the same OAuth client:

- `https://www.googleapis.com/auth/yt-analytics.readonly` — retention and average % viewed
- `https://www.googleapis.com/auth/youtube.force-ssl` — read comment threads

Also enable **YouTube Analytics API** on the Cloud project. After adding scopes, disconnect and Connect YouTube again so Google re-prompts consent. Buffer posting is unchanged and still needs no Google audit.
