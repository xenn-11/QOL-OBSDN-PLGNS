const { Plugin, PluginSettingTab, Setting, MarkdownView, Menu, Modal, Notice, Platform } = require('obsidian');

/* ------------------------------------------------------------------ *
 * Defaults & definitions
 * ------------------------------------------------------------------ */

const DEFAULT_SETTINGS = {
  // Status bar
  showWords: true,
  showCharacters: true,
  showCharactersNoSpaces: false,
  showSentences: false,
  showParagraphs: false,
  showReadingTime: false,
  showSelection: true,
  showLabels: true,
  thousandsSeparator: 'comma',
  animate: true,
  rollDurationMs: 250,
  // Counting
  excludeFrontmatter: true,
  excludeCode: false,
  excludeComments: true,
  ignoreLinkTargets: true,
  countCjkAsWords: true,
  wordsPerMinute: 230,
  cjkCharsPerMinute: 500,
  // Internal
  warnedAboutCore: false
};

const STAT_DEFS = [
  { id: 'words', setting: 'showWords', name: 'Words', desc: 'Number of words.', singular: 'word', plural: 'words' },
  { id: 'characters', setting: 'showCharacters', name: 'Characters', desc: 'Number of characters, including spaces.', singular: 'character', plural: 'characters' },
  { id: 'charactersNoSpaces', setting: 'showCharactersNoSpaces', name: 'Characters (no spaces)', desc: 'Number of characters, excluding all whitespace.', singular: 'char (no spaces)', plural: 'chars (no spaces)' },
  { id: 'sentences', setting: 'showSentences', name: 'Sentences', desc: 'Number of sentences. Headings and list items each count as one.', singular: 'sentence', plural: 'sentences' },
  { id: 'paragraphs', setting: 'showParagraphs', name: 'Paragraphs', desc: 'Blocks of text separated by blank lines.', singular: 'paragraph', plural: 'paragraphs' },
  { id: 'readingTime', setting: 'showReadingTime', name: 'Reading time', desc: 'Estimated minutes to read, based on the speeds set below.', singular: 'min read', plural: 'min read' }
];

const SEPARATORS = {
  comma: { label: 'Comma (1,234)', char: ',' },
  apostrophe: { label: "Apostrophe (1'234)", char: "'" },
  period: { label: 'Period (1.234)', char: '.' },
  space: { label: 'Thin space (1 234)', char: '\u2009' },
  none: { label: 'None (1234)', char: '' }
};

/* ------------------------------------------------------------------ *
 * Text analysis
 * ------------------------------------------------------------------ */

// Han, Hiragana, Katakana: each character counts as one "word" (they aren't space-delimited).
// (Script, not Script_Extensions, so CJK punctuation like 。 is not counted.)
const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u30FC]/gu;
// Words: letters/digits/marks, joined by apostrophes or hyphens, or decimals like 3.14 / 1,000.
const WORD_RE = /[\p{L}\p{N}\p{M}]+(?:(?:['’\-‐‑][\p{L}\p{N}\p{M}]+)|(?:[.,]\p{N}+))*/gu;
const HAS_CONTENT_RE = /[\p{L}\p{N}]/u;
const SENTENCE_SPLIT_RE = /[.!?…]+["'”’)\]]*(?=\s|$)|[。！？]+/u;

const FRONTMATTER_RE = /^---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;
const COMMENT_RE = /%%[\s\S]*?%%|<!--[\s\S]*?-->/g;
const FENCE_RE = /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*\r?$|(?![\s\S]))/gm;
const INLINE_CODE_RE = /`+[^`\n]+`+/g;
const EMBED_RE = /!\[\[[^\]\n]*\]\]/g;
const WIKILINK_RE = /\[\[([^\]|\n]*)(?:\|([^\]\n]*))?\]\]/g;
const MDLINK_RE = /!?\[([^\]\n]*)\]\([^)\n]*\)/g;
const URL_RE = /\b(?:https?|ftp):\/\/[^\s)>\]]+/gi;

function cleanText(raw, o, isWholeDoc) {
  let t = raw;
  if (isWholeDoc && o.excludeFrontmatter) t = t.replace(FRONTMATTER_RE, '');
  if (o.excludeComments) t = t.replace(COMMENT_RE, ' ');
  if (o.excludeCode) t = t.replace(FENCE_RE, ' ').replace(INLINE_CODE_RE, ' ');
  if (o.ignoreLinkTargets) {
    t = t
      .replace(EMBED_RE, ' ')
      .replace(WIKILINK_RE, (m, target, alias) => (alias !== undefined ? alias : target))
      .replace(MDLINK_RE, '$1')
      .replace(URL_RE, ' ');
  }
  return t;
}

function countCodePoints(str) {
  const surrogatePairs = str.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g);
  return str.length - (surrogatePairs ? surrogatePairs.length : 0);
}

function countSentences(text) {
  let n = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!HAS_CONTENT_RE.test(line)) continue;
    for (const part of line.split(SENTENCE_SPLIT_RE)) {
      if (HAS_CONTENT_RE.test(part)) n++;
    }
  }
  return n;
}

function countParagraphs(text) {
  let n = 0;
  for (const block of text.split(/(?:\r?\n[ \t]*){2,}/)) {
    if (HAS_CONTENT_RE.test(block)) n++;
  }
  return n;
}

function computeStats(raw, o, isWholeDoc) {
  const text = cleanText(raw, o, isWholeDoc);

  let cjk = 0;
  let latinSource = text;
  if (o.countCjkAsWords) {
    latinSource = text.replace(CJK_RE, () => { cjk++; return ' '; });
  }
  const latinWords = (latinSource.match(WORD_RE) || []).length;

  const wpm = Math.max(1, o.wordsPerMinute);
  const cpm = Math.max(1, o.cjkCharsPerMinute);

  return {
    words: latinWords + cjk,
    characters: countCodePoints(text.replace(/\r?\n|\r/g, '')),
    charactersNoSpaces: countCodePoints(text.replace(/\s+/g, '')),
    sentences: countSentences(text),
    paragraphs: countParagraphs(text),
    readingTime: latinWords / wpm + cjk / cpm // raw minutes
  };
}

/* ------------------------------------------------------------------ *
 * Rolling odometer number
 * ------------------------------------------------------------------ */

const isDigit = (ch) => ch >= '0' && ch <= '9';

class RollingNumber {
  constructor(parentEl, plugin) {
    this.el = parentEl;
    this.plugin = plugin;
    this.slots = [];
    this.last = null;
  }

  set(str, animate, dir) {
    if (this.last === str) return;
    const prev = this.last;
    if (prev !== null && prev.length === str.length && this.sameStructure(prev, str)) {
      for (let i = 0; i < str.length; i++) {
        if (str[i] === prev[i]) continue;
        const slot = this.slots[i];
        if (slot.type === 'digit') {
          if (animate) this.roll(slot, str[i], dir);
          else this.snap(slot, str[i]);
        } else {
          slot.el.textContent = str[i];
        }
      }
    } else {
      this.build(str);
    }
    this.last = str;
  }

  sameStructure(a, b) {
    for (let i = 0; i < a.length; i++) {
      if (isDigit(a[i]) !== isDigit(b[i])) return false;
    }
    return true;
  }

  build(str) {
    this.destroy();
    this.el.empty();
    this.slots = [];
    for (const ch of str) {
      if (isDigit(ch)) {
        const el = this.el.createSpan({ cls: 'bwc-digit-slot' });
        const current = el.createSpan({ cls: 'bwc-digit-current', text: ch });
        const next = el.createSpan({ cls: 'bwc-digit-next', text: ch });
        this.slots.push({ type: 'digit', el, current, next, target: ch, rolling: false, timer: null });
      } else {
        const el = this.el.createSpan({ cls: 'bwc-sep', text: ch });
        this.slots.push({ type: 'sep', el });
      }
    }
  }

  roll(slot, digit, dir) {
    if (slot.timer) { window.clearTimeout(slot.timer); slot.timer = null; }
    const el = slot.el;
    // Reset instantly (no transition), committing any roll still in flight.
    el.addClass('bwc-no-anim');
    if (slot.rolling) slot.current.textContent = slot.target;
    el.removeClass('rolling');
    el.toggleClass('dir-down', dir < 0);
    slot.next.textContent = digit;
    void el.offsetWidth;
    el.removeClass('bwc-no-anim');
    void el.offsetWidth;
    // Now roll.
    el.addClass('rolling');
    slot.target = digit;
    slot.rolling = true;
    slot.timer = window.setTimeout(() => {
      slot.timer = null;
      this.settle(slot);
    }, this.plugin.settings.rollDurationMs + 40);
  }

  settle(slot) {
    slot.el.addClass('bwc-no-anim');
    slot.current.textContent = slot.target;
    slot.el.removeClass('rolling');
    void slot.el.offsetWidth;
    slot.el.removeClass('bwc-no-anim');
    slot.rolling = false;
  }

  snap(slot, digit) {
    if (slot.timer) { window.clearTimeout(slot.timer); slot.timer = null; }
    slot.target = digit;
    slot.next.textContent = digit;
    this.settle(slot);
  }

  destroy() {
    for (const slot of this.slots) {
      if (slot.timer) { window.clearTimeout(slot.timer); slot.timer = null; }
    }
  }
}

/* ------------------------------------------------------------------ *
 * One status bar segment: "[42 of ]1,234 words"
 * ------------------------------------------------------------------ */

class Segment {
  constructor(plugin, parentEl, def) {
    this.plugin = plugin;
    this.def = def;
    this.el = parentEl.createSpan({ cls: 'bwc-seg' });
    this.selNum = new RollingNumber(this.el.createSpan({ cls: 'bwc-num bwc-sel' }), plugin);
    this.ofEl = this.el.createSpan({ cls: 'bwc-of', text: 'of' });
    this.totalNum = new RollingNumber(this.el.createSpan({ cls: 'bwc-num' }), plugin);
    this.labelEl = plugin.settings.showLabels ? this.el.createSpan({ cls: 'bwc-label' }) : null;
    this.lastTotal = null;
    this.lastSel = null;
  }

  update(cur, animate, snapSel) {
    const id = this.def.id;
    const total = cur.doc[id];
    const totalDir = this.lastTotal === null ? 0 : Math.sign(total - this.lastTotal);
    this.totalNum.set(this.plugin.statText(this.def, total), animate, totalDir);
    this.lastTotal = total;

    if (cur.sel) {
      const s = cur.sel[id];
      const selDir = this.lastSel === null ? 0 : Math.sign(s - this.lastSel);
      this.selNum.set(this.plugin.statText(this.def, s), animate && !snapSel, selDir);
      this.lastSel = s;
    } else {
      this.lastSel = null;
    }

    if (this.labelEl) {
      const label = this.plugin.statText(this.def, total) === '1' ? this.def.singular : this.def.plural;
      if (this.labelEl.textContent !== label) this.labelEl.textContent = label;
    }
  }

  destroy() {
    this.selNum.destroy();
    this.totalNum.destroy();
  }
}

/* ------------------------------------------------------------------ *
 * Plugin
 * ------------------------------------------------------------------ */

module.exports = class BetterWordCountPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.segments = [];
    this.statsVersion = 0;
    this.docCache = { text: null, version: -1, stats: null };
    this.current = null;
    this.lastView = null;
    this.lastPath = null;
    this.hadSelection = false;
    this.refreshTimer = null;

    this.dockEl = this.createDock();
    this.dockEl.addClass('bwc-dock');
    this.dockEl.addClass('bwc-dock-interactive');
    this.dockEl.setAttribute('aria-label', 'Word count — click for details, right-click for options');
    this.registerDomEvent(this.dockEl, 'click', () => this.openStats());
    this.registerDomEvent(this.dockEl, 'contextmenu', (evt) => this.showQuickMenu(evt));
    this.applyCssVars();
    this.rebuildSegments();

    this.registerEvent(this.app.workspace.on('editor-change', () => this.scheduleRefresh()));
    this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => this.onLeafChange(leaf)));
    this.registerEvent(this.app.workspace.on('file-open', () => this.scheduleRefresh()));
    this.registerEvent(this.app.workspace.on('layout-change', () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on('modify', (file) => {
      if (this.lastView && this.lastView.file === file) this.scheduleRefresh();
    }));
    // Selection changes (editing and reading mode) have no workspace event.
    this.registerDomEvent(document, 'selectionchange', () => this.scheduleRefresh());

    this.app.workspace.onLayoutReady(() => {
      this.scheduleRefresh(0);
      this.checkCoreWordCount();
    });

    this.addCommand({
      id: 'show-statistics',
      name: 'Show detailed statistics',
      callback: () => this.openStats()
    });

    this.addSettingTab(new BetterWordCountSettingTab(this.app, this));
  }

  onunload() {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    for (const seg of this.segments) seg.destroy();
    if (this.dockEl) this.dockEl.empty();
  }

  /* ---------- setup helpers ---------- */

  createDock() {
    if (Platform.isMobile) {
      // No status bar on mobile: float a small pill instead.
      const el = document.body.createDiv({ cls: 'bwc-float' });
      this.register(() => el.remove());
      return el;
    }
    return this.addStatusBarItem();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  applyCssVars() {
    this.dockEl.style.setProperty('--bwc-roll-ms', this.settings.rollDurationMs + 'ms');
  }

  checkCoreWordCount() {
    if (this.settings.warnedAboutCore) return;
    try {
      const core = this.app.internalPlugins && this.app.internalPlugins.plugins && this.app.internalPlugins.plugins['word-count'];
      if (core && core.enabled) {
        new Notice('Better Word Count: the core "Word Count" plugin is still enabled. Turn it off under Settings → Core plugins to avoid showing two counters.', 12000);
        this.settings.warnedAboutCore = true;
        this.saveSettings();
      }
    } catch (e) { /* internal API unavailable; ignore */ }
  }

  onSettingsChanged(opts) {
    const { rebuild = false } = opts || {};
    this.applyCssVars();
    this.statsVersion++;
    if (rebuild) this.rebuildSegments();
    this.scheduleRefresh(0);
  }

  rebuildSegments() {
    for (const seg of this.segments) seg.destroy();
    this.segments = [];
    this.dockEl.empty();
    let first = true;
    for (const def of STAT_DEFS) {
      if (!this.settings[def.setting]) continue;
      if (!first) this.dockEl.createSpan({ cls: 'bwc-divider', text: '·' });
      first = false;
      this.segments.push(new Segment(this, this.dockEl, def));
    }
    this.dockEl.toggleClass('bwc-empty', first);
    this.hadSelection = false;
    this.lastPath = null;
  }

  /* ---------- view tracking ---------- */

  onLeafChange(leaf) {
    if (leaf && leaf.view instanceof MarkdownView) {
      this.lastView = leaf.view;
    } else if (leaf && this.isInMainArea(leaf)) {
      // A non-note view (graph, canvas, ...) took over the main area.
      this.lastView = null;
    }
    // Sidebar leaves are ignored so the count stays while you click around.
    this.scheduleRefresh();
  }

  isInMainArea(leaf) {
    try { return leaf.getRoot() === this.app.workspace.rootSplit; } catch (e) { return false; }
  }

  resolveView() {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active && active.file) this.lastView = active;
    const v = this.lastView;
    if (!v || !v.file || !v.containerEl.isConnected) {
      this.lastView = null;
      return null;
    }
    return v;
  }

  readTexts(view) {
    if (view.getMode() === 'preview') {
      return { doc: view.getViewData(), sel: this.readingSelection(view) };
    }
    const editor = view.editor;
    const doc = editor.getValue();
    let sel = '';
    for (const r of editor.listSelections()) {
      const a = editor.posToOffset(r.anchor);
      const h = editor.posToOffset(r.head);
      if (a !== h) sel += (sel ? '\n' : '') + doc.slice(Math.min(a, h), Math.max(a, h));
    }
    return { doc, sel };
  }

  readingSelection(view) {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.anchorNode) return '';
    if (!view.contentEl.contains(s.anchorNode)) return '';
    return s.toString();
  }

  /* ---------- refresh & render ---------- */

  scheduleRefresh(delay = 60) {
    if (this.refreshTimer !== null) return;
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refresh();
    }, delay);
  }

  refresh() {
    const view = this.resolveView();
    if (!view) {
      this.current = null;
      this.dockEl.addClass('bwc-hidden');
      return;
    }
    this.dockEl.removeClass('bwc-hidden');

    const { doc, sel } = this.readTexts(view);

    let docStats;
    if (this.docCache.text === doc && this.docCache.version === this.statsVersion) {
      docStats = this.docCache.stats;
    } else {
      docStats = computeStats(doc, this.settings, true);
      this.docCache = { text: doc, version: this.statsVersion, stats: docStats };
    }
    const selStats = this.settings.showSelection && sel && sel.trim() ? computeStats(sel, this.settings, false) : null;

    this.current = { fileName: view.file.basename, doc: docStats, sel: selStats };

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate = this.settings.animate && !reduceMotion && this.lastPath === view.file.path;
    this.lastPath = view.file.path;

    const hasSel = !!selStats;
    this.dockEl.toggleClass('bwc-has-selection', hasSel);
    for (const seg of this.segments) seg.update(this.current, animate, !this.hadSelection);
    this.hadSelection = hasSel;
  }

  /* ---------- formatting ---------- */

  formatNumber(n) {
    const sep = (SEPARATORS[this.settings.thousandsSeparator] || SEPARATORS.comma).char;
    const s = String(n);
    return sep ? s.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : s;
  }

  statText(def, value) {
    if (def.id === 'readingTime') {
      if (value <= 0) return '0';
      if (value < 1) return '<1';
      return this.formatNumber(Math.round(value));
    }
    return this.formatNumber(value);
  }

  /* ---------- UI ---------- */

  openStats() {
    this.refresh();
    new StatsModal(this.app, this).open();
  }

  openPluginSettings() {
    this.app.setting.open();
    this.app.setting.openTabById(this.manifest.id);
  }

  showQuickMenu(evt) {
    evt.preventDefault();
    const menu = new Menu();
    for (const def of STAT_DEFS) {
      menu.addItem((item) => item
        .setTitle(def.name)
        .setChecked(!!this.settings[def.setting])
        .onClick(async () => {
          this.settings[def.setting] = !this.settings[def.setting];
          await this.saveSettings();
          this.onSettingsChanged({ rebuild: true });
        }));
    }
    menu.addSeparator();
    menu.addItem((item) => item.setTitle('Show detailed statistics').setIcon('bar-chart-2').onClick(() => this.openStats()));
    menu.addItem((item) => item.setTitle('Open settings').setIcon('settings').onClick(() => this.openPluginSettings()));
    menu.showAtMouseEvent(evt);
  }
};

/* ------------------------------------------------------------------ *
 * Detailed statistics modal
 * ------------------------------------------------------------------ */

class StatsModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    const cur = this.plugin.current;

    contentEl.createEl('h2', { text: cur ? cur.fileName : 'Statistics' });
    if (!cur) {
      contentEl.createEl('p', { text: 'Open a note to see its statistics.' });
      return;
    }

    const table = contentEl.createEl('table', { cls: 'bwc-table' });
    const head = table.createEl('thead').createEl('tr');
    head.createEl('th', { text: '' });
    head.createEl('th', { text: 'Note' });
    if (cur.sel) head.createEl('th', { text: 'Selection' });

    const body = table.createEl('tbody');
    for (const def of STAT_DEFS) {
      const row = body.createEl('tr');
      row.createEl('td', { text: def.name });
      const suffix = def.id === 'readingTime' ? ' min' : '';
      row.createEl('td', { text: this.plugin.statText(def, cur.doc[def.id]) + suffix });
      if (cur.sel) row.createEl('td', { text: this.plugin.statText(def, cur.sel[def.id]) + suffix });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

/* ------------------------------------------------------------------ *
 * Settings tab
 * ------------------------------------------------------------------ */

class BetterWordCountSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  toggle(containerEl, name, desc, key, change) {
    new Setting(containerEl).setName(name).setDesc(desc).addToggle((t) =>
      t.setValue(this.plugin.settings[key]).onChange(async (value) => {
        this.plugin.settings[key] = value;
        await this.plugin.saveSettings();
        this.plugin.onSettingsChanged(change);
      }));
  }

  number(containerEl, name, desc, key, min) {
    new Setting(containerEl).setName(name).setDesc(desc).addText((text) => {
      text.inputEl.type = 'number';
      text.inputEl.min = String(min);
      text.setValue(String(this.plugin.settings[key])).onChange(async (value) => {
        const n = parseFloat(value);
        if (isNaN(n) || n < min) return;
        this.plugin.settings[key] = n;
        await this.plugin.saveSettings();
        this.plugin.onSettingsChanged();
      });
    });
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    new Setting(containerEl).setName('Status bar').setHeading();
    for (const def of STAT_DEFS) {
      this.toggle(containerEl, def.name, def.desc, def.setting, { rebuild: true });
    }
    this.toggle(containerEl, 'Show selection counts', 'While text is selected, show e.g. "42 of 1,234 words".', 'showSelection', {});
    this.toggle(containerEl, 'Show labels', 'Show "words", "characters", etc. next to the numbers.', 'showLabels', { rebuild: true });

    new Setting(containerEl)
      .setName('Thousands separator')
      .addDropdown((d) => {
        for (const [key, v] of Object.entries(SEPARATORS)) d.addOption(key, v.label);
        d.setValue(s.thousandsSeparator).onChange(async (value) => {
          s.thousandsSeparator = value;
          await this.plugin.saveSettings();
          this.plugin.onSettingsChanged();
        });
      });

    this.toggle(containerEl, 'Rolling animation', 'Roll the digits like an odometer when a number changes. Respects your system\'s reduced-motion setting.', 'animate', {});
    new Setting(containerEl)
      .setName('Roll duration')
      .setDesc('How long a digit takes to roll, in milliseconds.')
      .addSlider((sl) => sl.setLimits(100, 800, 25).setValue(s.rollDurationMs).setDynamicTooltip().onChange(async (value) => {
        s.rollDurationMs = value;
        await this.plugin.saveSettings();
        this.plugin.onSettingsChanged();
      }));

    new Setting(containerEl).setName('Counting').setHeading();
    this.toggle(containerEl, 'Exclude frontmatter', 'Ignore the YAML properties block at the top of a note.', 'excludeFrontmatter', {});
    this.toggle(containerEl, 'Exclude comments', 'Ignore %%Obsidian comments%% and <!-- HTML comments -->.', 'excludeComments', {});
    this.toggle(containerEl, 'Exclude code', 'Ignore fenced code blocks and `inline code`.', 'excludeCode', {});
    this.toggle(containerEl, 'Ignore link targets', 'Count only the visible text of links: [text](url) and [[note|alias]]. Bare URLs and embeds are ignored.', 'ignoreLinkTargets', {});
    this.toggle(containerEl, 'Count CJK characters as words', 'Count each Chinese, Japanese kana/kanji character as one word, since those scripts have no spaces between words.', 'countCjkAsWords', {});

    new Setting(containerEl).setName('Reading time').setHeading();
    this.number(containerEl, 'Words per minute', 'Reading speed for space-separated languages.', 'wordsPerMinute', 1);
    this.number(containerEl, 'CJK characters per minute', 'Reading speed for Chinese and Japanese text.', 'cjkCharsPerMinute', 1);
  }
}