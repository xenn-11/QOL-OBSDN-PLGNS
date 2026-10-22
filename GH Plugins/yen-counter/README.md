# Yen Motivation Counter

A private, local Obsidian plugin. No npm, no build step, no network access —
just three files copied into your vault.

## How it works

- Every **letter** you type earns a random ¥0.20–¥0.30 (configurable range).
- Deleting letters removes value back out, at the average rate.
- Only letters count (spaces, punctuation, digits, markdown syntax are free —
  won't inflate the number).
- The total is displayed as a rolling, odometer-style dial: each digit
  fades/slides up from below when it changes.
  - **Desktop:** shown bottom-right in the status bar, as before.
  - **Mobile:** the status bar isn't visible, so the counter instead floats
    as a small pill dock above the mobile toolbar. It's purely informational
    (doesn't intercept taps) and detaches cleanly if the plugin is disabled.
- The total persists across restarts (stored in the plugin's own data file,
  nothing leaves your machine).

## Installing (no npm required)

1. In your vault, go to `.obsidian/plugins/` (create `plugins` if it doesn't exist).
2. Create a new folder called `yen-motivation-counter`.
3. Copy these three files into it:
   - `manifest.json`
   - `main.js`
   - `styles.css`
4. In Obsidian: **Settings → Community plugins** → turn off "Restricted mode"
   if needed → find "Yen Motivation Counter" in the list → enable it.
5. Start typing in any note — watch the bottom right corner.

## Settings

Open **Settings → Yen Motivation Counter**:

- **Show cents** — toggles between `¥100'000` and `¥100'000.42`.
- **Minimum / Maximum cents per letter** — the random reward range per letter.
- **Reset counter** — sets the total back to ¥0.

## Commands (Cmd/Ctrl+P)

- `Toggle cents (¢) display`
- `Reset counter to ¥0`

## Notes on the design

- The plugin diffs the old vs. new content of the active note on every
  `editor-change` event to find exactly what text was inserted or deleted,
  then counts letters in that diff (Unicode-aware, so non-English letters
  count too).
- The digit dial rebuilds its slot count automatically as the number grows
  past a thousands boundary (e.g. ¥999'999 → ¥1'000'000 adds a slot cleanly).
- Nothing here touches the network — it's pure local plugin code.
