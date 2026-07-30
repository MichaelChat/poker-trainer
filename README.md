# Hold'em Equity Room

A Texas Hold'em No-Limit odds trainer. Deals you hands at a random (or fixed) seat and table
size, runs a live Monte Carlo equity calculation, and grades your fold/check/call/raise
decisions against the math. Play as a guest (stats saved to your browser) or sign in with
Google to sync your stats and settings across devices.

## Features

- Preflop-only or full-hand (flop → river) modes
- Live or hidden equity display, hand history, position/table-size stats, "practice weakest
  spot" drilling
- Realistic session mode: fixed table, persistent opponent personalities, running stack
- Villain bluffing, table aggression, and optional button straddle settings
- Google Sign-In (Firebase Auth) with cloud-synced stats (Firestore), or guest mode with
  local-only stats — no account required to play

## Local development

```bash
npm install
npm run dev
```

Runs fine with no Firebase configuration at all — you'll just be in guest-only mode (no sign-in
button, stats saved to this browser via localStorage).

## Running tests

```bash
npm test
```

Covers the hand evaluator (including edge cases like wheel straights and straight-flush
comparisons), the round engine (cross-street fold handling, tendency biases, session stack
accounting), and a full-hand lifecycle smoke test.

## Setting up Firebase (optional — only needed for Google Sign-In + cloud sync)

1. Go to the [Firebase console](https://console.firebase.google.com/) and create a new project.
2. **Authentication** → Sign-in method → enable **Google**.
3. **Firestore Database** → create a database (production mode is fine — the rules below lock
   it down).
4. Deploy `firestore.rules` from this repo (Firebase console → Firestore → Rules → paste and
   publish, or via the Firebase CLI: `firebase deploy --only firestore:rules`). It restricts
   each signed-in user to reading/writing only their own document.
5. Project settings → General → scroll to "Your apps" → add a Web app → copy the config
   values into a local `.env.local` file (copy `.env.example` as a starting point). This file
   is gitignored and never committed.
6. In the Google Cloud / Firebase Authentication settings, make sure your GitHub Pages domain
   (e.g. `yourusername.github.io`) is added to the **Authorized domains** list, or Google
   Sign-In will be rejected on the deployed site even though it works locally.

## Deploying to GitHub Pages

1. Update `vite.config.js` → `base` to match your repo name, e.g. `"/poker-trainer/"` (or `"/"`
   if this repo *is* your `username.github.io` root page).
2. Push this repo to GitHub.
3. Repo → Settings → Pages → Source: **GitHub Actions**.
4. Repo → Settings → Secrets and variables → Actions → add each of these as a repository
   secret (same names/values as your `.env.local`):
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   (Skip this step entirely if you don't want Firebase — the site still builds and runs in
   guest-only mode without them.)
5. Push to `main`. The included workflow (`.github/workflows/deploy.yml`) runs the test suite,
   builds, and deploys to Pages automatically. Any push that fails tests will not deploy.

## Project structure

```
src/
  engine/poker-engine.js   pure game logic (deck, evaluator, equity sim, round engine) — no UI
  tests/engine.test.js     Vitest suite for the above
  auth/                    Firebase Auth context + login/logout UI
  storage/persistence.js   Firestore-when-signed-in, localStorage-when-guest, with migration
  components/PokerTrainer.jsx   the game itself
  App.jsx, main.jsx        wiring
```

## A note on the equity model

Equity is calculated against uniformly random hole cards for opponents still in the hand — it
does not narrow their likely holdings based on the fact that they called or raised. In real
play, a player who calls a raise usually has a stronger-than-random hand, so true equity
against their actual range is typically a bit lower than what's shown. This is a simplified
pot-odds training tool, not a full range solver or GTO engine.
