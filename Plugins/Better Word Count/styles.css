/* ---------- Dock (status bar item / mobile pill) ---------- */

.bwc-dock {
  --bwc-roll-ms: 250ms;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}

.bwc-hidden,
.bwc-empty {
  display: none !important;
}

.bwc-dock-interactive {
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.bwc-dock-interactive:hover {
  opacity: 0.85;
}

.bwc-dock-interactive:active {
  transform: scale(0.96);
}

/* Mobile has no status bar, so the counter floats as a small pill. */
.bwc-float {
  position: fixed;
  right: 12px;
  bottom: calc(var(--safe-area-inset-bottom, 0px) + 64px);
  z-index: 20;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-secondary);
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
  box-shadow: var(--shadow-s);
}

/* ---------- Segments ---------- */

.bwc-seg {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
}

.bwc-label {
  opacity: 0.75;
}

.bwc-divider {
  opacity: 0.4;
}

.bwc-num {
  display: inline-flex;
  align-items: center;
  line-height: 1.4em;
}

/* Selection part ("42 of 1,234 words") only shows while text is selected. */
.bwc-sel,
.bwc-of {
  display: none;
}

.bwc-has-selection .bwc-sel {
  display: inline-flex;
  color: var(--text-accent);
}

.bwc-has-selection .bwc-of {
  display: inline;
  opacity: 0.6;
}

/* ---------- Rolling digits ---------- */

.bwc-sep {
  display: inline-block;
  min-width: 0.3em;
  text-align: center;
}

.bwc-digit-slot {
  position: relative;
  display: inline-block;
  width: 0.62em;
  height: 1.4em;
  line-height: 1.4em;
  overflow: hidden;
  vertical-align: bottom;
}

.bwc-digit-current,
.bwc-digit-next {
  position: absolute;
  left: 0;
  width: 100%;
  height: 100%;
  text-align: center;
  transition:
    transform var(--bwc-roll-ms) cubic-bezier(0.4, 0, 0.2, 1),
    opacity var(--bwc-roll-ms) ease;
}

.bwc-digit-current {
  transform: translateY(0);
  opacity: 1;
}

.bwc-digit-next {
  transform: translateY(70%);
  opacity: 0;
}

/* Counting down: the new digit enters from above instead of below. */
.bwc-digit-slot.dir-down .bwc-digit-next {
  transform: translateY(-70%);
}

.bwc-digit-slot.rolling .bwc-digit-current {
  transform: translateY(-70%);
  opacity: 0;
}

.bwc-digit-slot.rolling.dir-down .bwc-digit-current {
  transform: translateY(70%);
}

.bwc-digit-slot.rolling .bwc-digit-next {
  transform: translateY(0);
  opacity: 1;
}

/* Used to reset a slot instantly without a visible transition. */
.bwc-digit-slot.bwc-no-anim .bwc-digit-current,
.bwc-digit-slot.bwc-no-anim .bwc-digit-next {
  transition: none;
}

/* ---------- Statistics modal ---------- */

.bwc-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
}

.bwc-table th,
.bwc-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.bwc-table th {
  color: var(--text-muted);
  font-weight: 500;
}

.bwc-table th:not(:first-child),
.bwc-table td:not(:first-child) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}