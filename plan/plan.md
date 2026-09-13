# Plan — Deliver a Downloadable APK for Vinayaka Seva

## Goal
Produce one thing only: a downloadable `.apk` file that installs directly on any Android phone. No Play Store, no Emergent Publish, no iOS build, no OTA updates, no extra features.

## How the APK will be produced
This dev container cannot compile Android itself (no Android SDK). The build will run on **Expo's cloud build service (EAS Build)** using the `preview` profile, which is the standard way to get an APK (not an AAB).

Steps that will happen once approved:
1. Add an `eas.json` with a single `preview` profile (`buildType: apk`, internal distribution).
2. Confirm `app.json` has an Android package id and version.
3. Trigger the build on EAS cloud.
4. In ~10–20 minutes EAS returns a public download URL for the `.apk`.
5. That URL is handed to you. You download and install.

Nothing else changes in the app.

## What you must provide
1. **Expo account access.** EAS Build runs under an Expo account (free). Either:
   - (a) Create an account at https://expo.dev, then generate an Access Token in expo.dev → Settings → Access Tokens, and paste it here, **or**
   - (b) Say you'd rather run the final `eas build` command yourself on your laptop after the `eas.json` is added — in that case you only need `npx eas-cli login` locally, no token sharing.

## One thing that decides whether the APK is actually useful
The APK will point at whatever backend URL is baked in at build time. The current backend runs in this dev preview sandbox and **stops responding when the sandbox sleeps**. Three choices:

- **A. Same-day demo only** — build now against the current preview URL. APK works today, breaks tomorrow.
- **B. Long-lived APK** — deploy the backend once via Emergent Publish (backend only; frontend stays unpublished per your ask), bake that stable URL into the APK.
- **C. Your own hosted backend** — you give a URL, that's baked in.

Pick one. Without a decision here the APK will be built as option A by default.

## Assumptions if not specified
- Android package name: `com.vinayakaseva.app`
- App display name: `Vinayaka Seva`
- Existing icon and splash reused as-is
- Signing keystore auto-generated and stored by EAS
- Backend URL baked in: option A (current preview URL, same-day demo)
- Access token route (1a) — you paste an Expo access token

## Open questions
1. Expo access token now, or you run `eas build` yourself later?
2. Backend URL choice — A, B, or C?

## Out of scope
Everything else: iOS, Play Store, feature work, OTA, icon redesign, testing.
