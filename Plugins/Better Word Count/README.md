# Better Word Count

A drop-in replacement for Obsidian's core **Word Count** plugin, forked from the
Yen Motivation Counter. Same rolling, odometer-style digits, but instead of
counting yen it counts your note. No npm, no build step, no network access —
just three files copied into your vault. Desktop only.

## What it does

- Shows live statistics for the active note in the status bar, with digits that
  roll up when a number grows and **down** when it shrinks.
- **Selection-aware:** select text and the counter shows e.g. `42 of 1,234 words`.
  Works in editing mode (including multiple cursors) and in reading mode.
- **Statistics** (toggle each one on or off):
  words, characters, characters without spaces, sentences, paragraphs, and
  estimated reading time.
- **Smarter counting**, all configurable:
  - Exclude frontmatter (YAML properties)
  - Exclude `%%comments%%` and `<!-- HTML comments -->`
  - Exclude fenced code blocks and inline code (off by default)
  - Count only the visible text of links (`[text](url)`, `[[note|alias]]`);
    bare URLs and `![[embeds]]` are ignored
  - Chinese/Japanese support: each kanji/kana character counts as a word, and
    reading time uses a separate characters-per-minute rate
  - Hyphenated words (`well-known`), contractions (`don't`) and numbers like
    `3.14` or `1,000` count as one word
- **Click** the counter for a detailed statistics table (note vs. selection).
  **Right-click** it to toggle statistics quickly.
- Updates are throttled, and the full-note count is cached, so moving the
  cursor around only recounts the selection.

## Installing

1. In your vault, go to `.obsidian/plugins/` (create `plugins` if needed).
2. Create a folder called `better-word-count`.
3. Copy these three files into it:
   - `manifest.json`
   - `main.js`
   - `styles.css`
4. In Obsidian: **Settings → Community plugins** → turn off Restricted mode if
   needed → enable **Better Word Count**.
5. **Turn off the core Word Count plugin** under **Settings → Core plugins**,
   otherwise you'll see two counters. (The plugin shows a one-time reminder if
   it detects the core plugin is still on.)

You do not need to copy the old `data.json` — it belonged to the yen counter.
This plugin has a different id and creates its own settings file.

## Settings

**Status bar**
- One toggle per statistic (defaults: words and characters)
- Show selection counts
- Show labels (`words`, `characters`, …) or numbers only
- Thousands separator: comma, apostrophe, period, thin space, or none
- Rolling animation on/off, and roll duration (100–800 ms)

**Counting**
- Exclude frontmatter / comments / code
- Ignore link targets
- Count CJK characters as words

**Reading time**
- Words per minute (default 230)
- CJK characters per minute (default 500)

## Commands (Cmd/Ctrl+P)

- `Show detailed statistics`

## Notes on the design

- The yen version diffed old vs. new text on every keystroke to find what you
  typed. That isn't needed here: the plugin simply recounts the note (throttled
  to once per ~60 ms). It listens to `editor-change` plus the DOM
  `selectionchange` event, and uses only public Obsidian APIs for reading text.
- The count stays visible when you click into a sidebar, and hides when the
  main area shows something that isn't a note (graph, canvas, etc.).
- Switching notes snaps the numbers instead of rolling them; rolling only
  happens as you edit the same note.
- The animation is skipped if your system has "reduce motion" enabled.
- The digit roll fixes a few quirks of the original: the roll duration setting
  now actually drives the CSS timing, rapid changes no longer cause a flicker
  when a roll finishes, and digits roll in the direction of the change.
- Nothing here touches the network — it's pure local plugin code.