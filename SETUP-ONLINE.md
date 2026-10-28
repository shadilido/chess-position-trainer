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
   - **Anonymous** → Save (used for "Play as guest")
3. Open the **Settings** tab → **Authorized domains** → **Add domain** → `YOUR-USERNAME.github.io` → Add.

## 3. Create the database
1. Left menu: **Build → Realtime Database → Create Database**.
2. Pick a location (e.g. **Belgium (europe-west1)** for Europe) → Next → **Start in locked mode** → Enable.
3. Open the **Rules** tab, delete everything, paste the contents of [`database.rules.json`](database.rules.json), and click **Publish**.

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
- On iPhone, when the app is installed on the Home Screen, Google sign-in may be blocked by iOS. Email sign-in and guest play always work.
