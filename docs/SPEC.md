# Chess Position Trainer

A mobile chess training app where players compete against a chess bot starting from **random legal chess positions**. Built for **iPhone**, with a **downloadable desktop (PC/Mac) version**. Modern, clean design inspired by Chess.com — but with its own unique visual identity.

---

## Core Concept

Every challenge starts from a **random but legal chess position** — an opening, middlegame, or endgame. The player faces a bot and must **improve the position, find the best moves, or deliver checkmate**.

Players **cannot skip** a position. To advance to the next challenge, they must either:
- **Improve the engine evaluation** compared with the starting position, OR
- **Achieve checkmate**, OR
- **Get checkmated** (challenge failed, logged to stats)

---

## Platforms

| Platform | Delivery |
|----------|----------|
| **iPhone (primary)** | Native iOS app, optimised for all iPhone screen sizes |
| **PC (Windows)** | Downloadable desktop build (installer / portable .exe) |
| **Mac** | Downloadable desktop build (.dmg) |

**Recommended stack:** React Native + Expo (iOS) with a shared codebase, packaged for desktop via **Tauri** or **Electron** — or Flutter, which targets iOS, Windows, and macOS from one codebase. The engine (Stockfish) runs natively on each platform (Stockfish WASM on desktop / stockfish-ios framework on iPhone). One codebase, three targets.

Desktop version supports **mouse drag-and-drop and click-to-move**, keyboard arrow keys for review navigation, and a resizable window layout.

---

## Gameplay

### The Board (main focus of the screen)
- Chessboard is always the **central, dominant element**
- **Vertical evaluation bar directly to the left of the board**
  - Shows White/Black advantage visually
  - Updates after **every move**
  - Displays numerical evaluation (e.g. `+2.5`, `-2.5`, `M3`)
- **Touch controls** (tap-tap and drag) on iPhone; mouse on desktop
- **Legal-move highlights** when a piece is selected
- **Last-move highlight** (from/to squares)
- **Check indicator** (king square flashes/glows red)
- Full standard chess rules: **castling, en passant, pawn promotion** (promotion picker UI), threefold repetition, 50-move rule, stalemate, insufficient material

### The Bot
- Powered by **Stockfish**
- Responds to every player move with a challenging reply
- **Adjustable difficulty** (e.g. Elo-limited levels: 800 → 3000, via Stockfish skill level / depth / UCI_LimitStrength)

### Position Types (player-selectable)
- **Openings**
- **Middlegames**
- **Endgames**
- **Completely random**

### Position Generator
- Must produce **valid, legal chess positions** — never impossible arrangements
- Approaches: sample from a curated FEN database, or generate via random playouts from the start position (N random/engine moves), then validate legality (kings not both in check, correct side to move, legal castling/en-passant flags, no pawns on 1st/8th ranks)
- Balance check: discard positions that are already completely winning/lost beyond a threshold unless the mode calls for it

---

## Post-Game Review (Chess.com-style)

After each completed challenge, the app analyses the **entire game** with Stockfish and produces a detailed review:

### Move Classification
Every move gets a label:
`Brilliant` · `Great` · `Best` · `Excellent` · `Good` · `Forced` · `Mistake` · `Miss` · `Blunder`

### Review Features
- Explains which moves were **strong**, which **worsened the position**, and which **opportunities were missed**
- **Tap any move** in the review to jump to that position on the board (arrow keys on desktop)
- Shows the **engine's recommended move** vs. the move played
- **Plain-language explanations** of why the engine move is better
- Identifies:
  - Important **tactics** (forks, pins, skewers, discovered attacks)
  - **Missed checkmates**
  - **Hanging pieces**
  - **Material losses**
  - **Major turning points** in the game
- Evaluation graph across the whole game

---

## Screens

### Home Screen
- Big **Play** button
- **Statistics** overview
- **Settings** menu entry

### Statistics
- Completed challenges
- Success rate
- **Current streak** / **best streak**
- Most common mistake types (e.g. "you hang pieces most often in middlegames")
- **Game history** — revisit any previous game and study its review

### Settings
**Appearance**
- Themes: **Dark Mode, Light Mode, Midnight Mode, OLED Black Mode**
- Multiple **chessboard colour schemes**
- Multiple **chess piece styles**

**Gameplay / UI toggles**
- Sound effects
- Move animations
- Legal-move highlights
- Board coordinates
- Evaluation-bar visibility

**Persistence**
- All preferences **saved locally** and restored on app relaunch (iOS: AsyncStorage/UserDefaults; desktop: local config file)

---

## Engine

- **Stockfish** for everything engine-related:
  - Legal move generation (with chess.js or similar as a fast legality layer)
  - Bot move selection (difficulty-scaled)
  - Live position evaluation (eval bar)
  - Full-game post-analysis for the review
- Runs **on-device / offline** — no server required

---

## Design & UX Requirements

- Optimised for iPhone: responsive layout across all iPhone screen sizes, safe-area aware
- **Smooth animations** (piece movement, eval bar transitions)
- Comfortable touch targets
- **Simple, polished, uncluttered** — no unnecessary buttons
- The chessboard and current challenge are **always the main focus**
- Desktop layout adapts: board centred, eval bar left, review panel can sit to the right on wide windows

---

## Goal

An **addictive and useful chess training app** where players constantly face fresh positions, learn to find better moves, compete against a scalable bot, and improve through detailed, Chess.com-quality game reviews.

---

## Suggested Project Structure

```
chess-position-trainer/
├── app/                  # screens (Home, Play, Review, Stats, Settings)
├── components/           # Board, EvalBar, MoveList, PromotionPicker, ...
├── engine/               # Stockfish bridge (iOS framework / WASM worker)
├── core/                 # position generator, move classification, review logic
├── state/                # settings + stats persistence
├── assets/               # piece sets, board themes, sounds
├── desktop/              # Tauri/Electron wrapper config
└── README.md
```

## MVP Milestones

1. Board + full rules + touch/mouse input
2. Stockfish integration: bot play + live eval bar
3. Legal random position generator with type filters
4. Challenge completion logic (improve eval / mate / get mated)
5. Full-game review with move classification + tap-to-jump
6. Stats, streaks, game history
7. Themes, piece styles, settings persistence
8. Desktop packaging (Windows .exe / macOS .dmg)
