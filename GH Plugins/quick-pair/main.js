"use strict";
const { Plugin } = require("obsidian");
const { Prec, EditorSelection } = require("@codemirror/state");
const { keymap } = require("@codemirror/view");

const BRACKETS = {
  "(": ")",
  "[": "]",
  "{": "}",
  "<": ">",
  "\u201C": "\u201D",
  "\u2018": "\u2019",
};
const CLOSERS = new Set(Object.values(BRACKETS));
const SYMMETRIC = new Set(["*", "_", "`", "~", "=", '"']);

const USED_FLASH_MS = 1200;

const STYLE_ID = "quickpair-status-style";
const CSS = `
.quickpair-status {
  display: flex;
  align-items: center;
  padding: 0 6px;
}
.quickpair-dot {
  position: relative;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  color: #3ecf6e;
  background: currentColor;
  transition: color 0.5s ease;
}
.quickpair-dot::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: currentColor;
  animation: quickpair-pulse 2s ease-out infinite;
  pointer-events: none;
}
.quickpair-dot[data-state="used"] {
  color: #3b9eff;
}
.quickpair-dot[data-state="error"] {
  color: #ff4d4f;
}
.quickpair-dot[data-state="error"]::after {
  animation: none;
  opacity: 0;
}
@keyframes quickpair-pulse {
  0%   { transform: scale(1);   opacity: 0.55; }
  100% { transform: scale(2.6); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .quickpair-dot::after { animation: none; opacity: 0; }
}
`;

function findExit(line, cur) {
  const stack = [];
  const pairs = [];
  const isWord = (ch) => /\w/.test(ch ?? "");

  let i = 0;
  while (i < line.length) {
    const c = line[i];

    if (SYMMETRIC.has(c)) {
      let j = i + 1;
      while (j < line.length && line[j] === c && j !== cur) j++;
      const len = j - i;
      const prev = line[i - 1];
      const next = line[j];

      const isBullet = c === "*" && line.slice(0, i).trim() === "" && /\s/.test(next ?? "");
      const isIntraword = c === "_" && isWord(prev) && isWord(next);

      if (!isBullet && !isIntraword) {
        let k = stack.length - 1;
        while (k >= 0 && !(stack[k].ch === c && stack[k].len === len)) k--;
        if (k >= 0) {
          pairs.push({ open: stack[k].start, openLen: len, close: i, closeLen: len });
          stack.length = k;
        } else {
          stack.push({ ch: c, len, start: i });
        }
      }
      i = j;
      continue;
    }

    if (BRACKETS[c]) {
      stack.push({ ch: c, len: 1, start: i, closer: BRACKETS[c] });
    } else if (CLOSERS.has(c)) {
      let k = stack.length - 1;
      while (k >= 0 && stack[k].closer !== c) k--;
      if (k >= 0) {
        pairs.push({ open: stack[k].start, openLen: 1, close: i, closeLen: 1, openCh: stack[k].ch, closeCh: c });
        stack.length = k;
      }
    }
    i++;
  }

  let best = null;
  for (const p of pairs) {
    if (p.open + p.openLen <= cur && p.close >= cur && (!best || p.open > best.open)) best = p;
  }
  if (!best) return null;

  let exit = best.close + best.closeLen;

  if (best.openCh) {
    let o = best.open;
    while (line[o - 1] === best.openCh && line[exit] === best.closeCh) {
      o--;
      exit++;
    }
  }
  return exit;
}

function exitPair(view) {
  if (view.composing) return false;
  if (document.querySelector(".suggestion-container")) return false;

  const { state } = view;
  if (state.selection.ranges.some((r) => !r.empty)) return false;

  const newRanges = [];
  for (const r of state.selection.ranges) {
    const line = state.doc.lineAt(r.head);
    const exit = findExit(line.text, r.head - line.from);
    if (exit === null) return false;
    newRanges.push(EditorSelection.cursor(line.from + exit));
  }

  view.dispatch({
    selection: EditorSelection.create(newRanges, state.selection.mainIndex),
    scrollIntoView: true,
    userEvent: "select",
  });
  return true;
}

module.exports = class QuickPair extends Plugin {
  onload() {
    this.usedTimer = null;
    this.hasError = false;

    this.injectStyle();
    this.createIndicator();

    try {
      if (!Prec || !keymap || !EditorSelection) {
        throw new Error("CodeMirror modules unavailable");
      }
      if (findExit("(a)", 1) !== 3) {
        throw new Error("Self-check failed");
      }

      this.registerEditorExtension(
        Prec.highest(
          keymap.of([{ key: "Enter", run: (view) => this.handleEnter(view) }])
        )
      );
      this.setState("active");
    } catch (err) {
      this.fail(err);
    }
  }

  onunload() {
    if (this.usedTimer) clearTimeout(this.usedTimer);
  }

  handleEnter(view) {
    try {
      const handled = exitPair(view);
      if (handled) this.flashUsed();
      return handled;
    } catch (err) {
      this.fail(err);
      return false;
    }
  }

  injectStyle() {
    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
    this.register(() => style.remove());
  }

  createIndicator() {
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass("quickpair-status");
    this.dotEl = this.statusEl.createSpan({ cls: "quickpair-dot" });
    this.setState("active");
  }

  setState(state, message) {
    if (!this.dotEl) return;
    this.dotEl.setAttr("data-state", state);
    const labels = {
      active: "QuickPair: active",
      used: "QuickPair: used",
      error: `QuickPair: error${message ? " \u2013 " + message : ""}`,
    };
    this.statusEl.setAttr("aria-label", labels[state]);
    this.statusEl.setAttr("data-tooltip-position", "top");
  }

  flashUsed() {
    this.hasError = false;
    this.setState("used");
    if (this.usedTimer) clearTimeout(this.usedTimer);
    this.usedTimer = setTimeout(() => {
      this.usedTimer = null;
      if (!this.hasError) this.setState("active");
    }, USED_FLASH_MS);
  }

  fail(err) {
    console.error("QuickPair:", err);
    this.hasError = true;
    if (this.usedTimer) {
      clearTimeout(this.usedTimer);
      this.usedTimer = null;
    }
    this.setState("error", err?.message);
  }
};

module.exports.findExit = findExit;