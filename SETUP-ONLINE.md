# Turning on online play (login, matchmaking, friend lobbies)

Online play uses **Firebase**, Google's free backend. The free "Spark" plan is enough and doesn't need a credit card. Setup takes about 5 minutes.

## 1. Create the project
1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. Click **Create a project** (or **Add project**), name it e.g. `chess-position-trainer`, click Continue.
3. Turn **Google Analytics off**, then click **Create project** and wait until it's ready.

## 2. Turn on sign-in
1. In the left menu: **Build → Authentication → Get started**.
2. On the **Sign-in method** tab, enable:
   - **Email/Password** (only the first switch) → Save
   - **Google** → choose a support email → Save
   - Leave **Anonymous** off: guest accounts are not supported (they made cheating too easy).
3. Open the **Settings** tab → **Authorized domains** → **Add domain** → `YOUR-USERNAME.github.io` → Add.

## 3. Create the database
1. Left menu: **Build → Realtime Database → Create Database**.
2. Pick a location (e.g. **Belgium (europe-west1)** for Europe) → Next → **Start in locked mode** → Enable.
3. Open the **Rules** tab, delete everything, paste the contents of [`database.rules.json`](database.rules.json), and click **Publish**.
   These rules are the server-side anti-cheat (see below). If you change them, edit `tools/build-rules.py` and run
   `python3 tools/build-rules.py` to regenerate the JSON.

## 4. Connect the app
1. Click the **gear icon → Project settings**. Under **Your apps** click the **web icon `</>`**.
2. Enter a nickname (e.g. `web`), leave Hosting unticked, and click **Register app**.
3. Copy the `firebaseConfig = { ... }` object it shows.
4. Open `js/firebase-config.js` in this repo, replace `export const firebaseConfig = null;` with
   `export const firebaseConfig = { ...the values you copied... };`, then commit.
5. In `sw.js`, bump `VERSION` (e.g. `cpt-v2.0.1`) so installed copies pick up the change.

That's it. Open the app, tap **Find match** or **Play a friend**, and sign in.

### Notes
- The config values (apiKey etc.) are **not secrets**. They only identify your project; the database rules control access.
- Free-plan limits: 100 simultaneous connections and 1 GB of storage, which is plenty for friends and a small community.
- On iPhone, when the app is installed on the Home Screen, Google sign-in may need a redirect instead of a popup; the app does that automatically. Email sign-in always works.

## Fair play (anti-cheat) and moderation
What runs automatically:
- **Database rules**: ratings and stats can only change by applying a finished game you played, once, within Elo limits; either player can apply both sides, so closing the app doesn't dodge a loss. Game history is append-only, only the side to move can move, clocks can only run down, and every result is checked (you can only resign for yourself, claim time when the clock is really out, claim abandonment when the opponent is really offline). Guests and banned accounts can't write anything.
- **Both apps verify each game**: the player who didn't end the game re-checks every move. Faked mates or illegal moves make the game invalid (no rating change) and file a report.
- **Engine-match check**: after each game the opponent's app compares your moves with Stockfish (first-choice match % and average loss on non-obvious moves) and saves it under `fairplay/<uid>`. An account flagged by 2+ different players in 3+ games shows a ⚠ badge to opponents.
- **Focus tracking**: leaving the game screen during your own turn is counted and shown to the opponent after the game.
- **Live lock**: during a live game the app's own bot, reviews and analysis are locked (also in other tabs).

What you do (Firebase console → Realtime Database → Data):
- **Reports** are under `reports` (who reported whom, reason, game id). Look at the game under `games/<id>` and the player's `fairplay/<uid>` records.
- **Ban** an account: add a child under `banned` with the player's uid as the key and `true` as the value. They can still train offline but can't play online. Remove the entry to unban.
