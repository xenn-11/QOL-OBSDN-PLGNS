const { Plugin, PluginSettingTab, Setting, MarkdownView, Menu, Modal, Notice } = require('obsidian');
const DEFAULT_SETTINGS = { totalCents: 0, showCents: false, minCentsPerLetter: 20, maxCentsPerLetter: 30, rollDurationMs: 350 };
const LETTER_RE = /\p{L}/gu;
function countLetters(str) {
  if (!str) return 0;
  const m = str.match(LETTER_RE);
  return m ? m.length : 0;
}
function diffStrings(oldStr, newStr) {
  const maxStart = Math.min(oldStr.length, newStr.length);
  let start = 0;
  while (start < maxStart && oldStr[start] === newStr[start]) start++;
  let endOld = oldStr.length;
  let endNew = newStr.length;
  while (endOld > start && endNew > start && oldStr[endOld - 1] === newStr[endNew - 1]) { endOld--; endNew--; }
  return { removed: oldStr.slice(start, endOld), inserted: newStr.slice(start, endNew) };
}
function groupThousands(numStr) {
  let out = '';
  let count = 0;
  for (let i = numStr.length - 1; i >= 0; i--) {
    out = numStr[i] + out;
    count++;
    if (count % 3 === 0 && i !== 0) out = "'" + out;
  }
  return out;
}
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
module.exports = class YenMotivationPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.fileContents = new Map();
    this.lastRenderedStr = null;
    this.slots = [];
    this.dockEl = this.createStatusBarDock();
    this.symbolEl = this.dockEl.createSpan({ cls: 'yen-symbol', text: '¥' });
    this.digitsEl = this.dockEl.createSpan({ cls: 'yen-digits' });
    this.dockEl.addClass('yen-counter-dock-interactive');
    this.dockEl.setAttribute('aria-label', 'Yen counter — click for settings, right-click for quick actions');
    this.registerDomEvent(this.dockEl, 'click', () => this.openPluginSettings());
    this.registerDomEvent(this.dockEl, 'contextmenu', (evt) => this.showQuickMenu(evt));
    this.renderValue(this.settings.totalCents, false);
    this.registerEvent(this.app.workspace.on('editor-change', (editor, info) => { this.handleEditorChange(editor, info); }));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.syncActiveEditorContent()));
    this.registerEvent(this.app.workspace.on('file-open', () => this.syncActiveEditorContent()));
    this.app.workspace.onLayoutReady(() => this.syncActiveEditorContent());
    this.addCommand({
      id: 'toggle-yen-cents',
      name: 'Toggle cents (¢) display',
      callback: async () => {
        this.settings.showCents = !this.settings.showCents;
        await this.saveSettings();
        this.renderValue(this.settings.totalCents, false);
      }
    });
    this.addCommand({
      id: 'reset-yen-counter',
      name: 'Reset counter to ¥0',
      callback: async () => {
        this.settings.totalCents = 0;
        await this.saveSettings();
        this.renderValue(0, true);
      }
    });
    this.addSettingTab(new YenSettingTab(this.app, this));
  }
  onunload() {
    if (!this.dockEl) return;
    this.dockEl.empty();
  }
  createStatusBarDock() {
    const el = this.addStatusBarItem();
    el.addClass('yen-counter-dock');
    el.addClass('yen-counter-dock-desktop');
    return el;
  }
  async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
  async saveSettings() { await this.saveData(this.settings); }
  syncActiveEditorContent() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file || !view.editor) return;
    const key = view.file.path;
    if (!this.fileContents.has(key)) { this.fileContents.set(key, view.editor.getValue()); }
  }
  handleEditorChange(editor, info) {
    const key = (info && info.file && info.file.path) || 'unknown';
    const newVal = editor.getValue();
    const oldVal = this.fileContents.has(key) ? this.fileContents.get(key) : newVal;
    this.fileContents.set(key, newVal);
    if (oldVal === newVal) return;
    const { removed, inserted } = diffStrings(oldVal, newVal);
    const lettersIn = countLetters(inserted);
    const lettersOut = countLetters(removed);
    if (lettersIn === 0 && lettersOut === 0) return;
    const { minCentsPerLetter, maxCentsPerLetter } = this.settings;
    const avgRate = (minCentsPerLetter + maxCentsPerLetter) / 2;
    let delta = 0;
    for (let i = 0; i < lettersIn; i++) { delta += Math.round(minCentsPerLetter + Math.random() * (maxCentsPerLetter - minCentsPerLetter)); }
    delta -= Math.round(lettersOut * avgRate);
    if (delta !== 0) this.applyDelta(delta);
  }
  openPluginSettings() {
    this.app.setting.open();
    this.app.setting.openTabById(this.manifest.id);
  }
  showQuickMenu(evt) {
    evt.preventDefault();
    const menu = new Menu();
    menu.addItem((item) => item.setTitle('Reset counter to ¥0').setIcon('rotate-ccw').onClick(async () => {
      this.settings.totalCents = 0;
      await this.saveSettings();
      this.renderValue(0, true);
      new Notice('Yen counter reset to ¥0');
    }));
    menu.addItem((item) => item.setTitle('Change reward thresholds…').setIcon('sliders-horizontal').onClick(() => { new ThresholdModal(this.app, this).open(); }));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle('Open settings').setIcon('settings').onClick(() => this.openPluginSettings()));
    menu.showAtMouseEvent(evt);
  }
  applyDelta(centsDelta) {
    let newTotal = this.settings.totalCents + centsDelta;
    if (newTotal < 0) newTotal = 0;
    this.settings.totalCents = newTotal;
    this.renderValue(newTotal, true);
    this.saveSettings();
    this.symbolEl.removeClass('yen-pulse-up');
    this.symbolEl.removeClass('yen-pulse-down');
    void this.symbolEl.offsetWidth;
    this.symbolEl.addClass(centsDelta > 0 ? 'yen-pulse-up' : 'yen-pulse-down');
  }
  formatValue(totalCents) {
    const yen = Math.floor(totalCents / 100);
    const cents = totalCents % 100;
    let str = groupThousands(String(yen));
    if (this.settings.showCents) { str += '.' + pad2(cents); }
    return str;
  }
  renderValue(totalCents, animate) {
    const str = this.formatValue(totalCents);
    if (this.lastRenderedStr !== null && str.length === this.lastRenderedStr.length) {
      let structureMatches = true;
      for (let i = 0; i < str.length; i++) {
        const isDigitNow = /[0-9]/.test(str[i]);
        const isDigitBefore = /[0-9]/.test(this.lastRenderedStr[i]);
        if (isDigitNow !== isDigitBefore) { structureMatches = false; break; }
      }
      if (structureMatches) {
        for (let i = 0; i < str.length; i++) {
          if (str[i] !== this.lastRenderedStr[i] && this.slots[i].type === 'digit') {
            this.rollDigit(this.slots[i], str[i], animate);
          } else if (this.slots[i].type === 'sep' && str[i] !== this.slots[i].char) {
            this.slots[i].char = str[i];
            this.slots[i].el.textContent = str[i];
          }
        }
        this.lastRenderedStr = str;
        return;
      }
    }
    this.buildSlots(str);
    this.lastRenderedStr = str;
  }
  buildSlots(str) {
    this.digitsEl.empty();
    this.slots = [];
    for (const ch of str) {
      if (/[0-9]/.test(ch)) {
        const slotEl = this.digitsEl.createDiv({ cls: 'yen-digit-slot' });
        const current = slotEl.createSpan({ cls: 'yen-digit-current', text: ch });
        const next = slotEl.createSpan({ cls: 'yen-digit-next', text: ch });
        this.slots.push({ type: 'digit', el: slotEl, current, next, char: ch });
      } else {
        const sepEl = this.digitsEl.createSpan({ cls: 'yen-sep', text: ch });
        this.slots.push({ type: 'sep', el: sepEl, char: ch });
      }
    }
  }
  rollDigit(slot, newDigit, animate) {
    if (!animate) {
      slot.current.textContent = newDigit;
      slot.next.textContent = newDigit;
      slot.char = newDigit;
      return;
    }
    slot.next.textContent = newDigit;
    slot.el.removeClass('rolling');
    void slot.el.offsetWidth;
    slot.el.addClass('rolling');
    const finish = () => {
      slot.current.textContent = newDigit;
      slot.el.removeClass('rolling');
      slot.char = newDigit;
      slot.el.removeEventListener('transitionend', finish);
    };
    slot.el.addEventListener('transitionend', finish, { once: true });
    setTimeout(() => {
      if (slot.el.hasClass('rolling')) finish();
    }, this.settings.rollDurationMs + 150);
  }
};
class ThresholdModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Reward thresholds' });
    let minVal = this.plugin.settings.minCentsPerLetter;
    let maxVal = this.plugin.settings.maxCentsPerLetter;
    new Setting(contentEl).setName('Minimum cents per letter').addText((text) => {
      text.inputEl.type = 'number';
      text.setValue(String(minVal)).onChange((value) => {
        const n = parseFloat(value);
        if (!isNaN(n)) minVal = n;
      });
    });
    new Setting(contentEl).setName('Maximum cents per letter').addText((text) => {
      text.inputEl.type = 'number';
      text.setValue(String(maxVal)).onChange((value) => {
        const n = parseFloat(value);
        if (!isNaN(n)) maxVal = n;
      });
    });
    new Setting(contentEl).addButton((btn) => btn.setButtonText('Save').setCta().onClick(async () => {
      if (minVal < 0 || maxVal < 0) { new Notice('Thresholds must be zero or greater.'); return; }
      if (minVal > maxVal) { new Notice('Minimum can\'t be greater than maximum.'); return; }
      this.plugin.settings.minCentsPerLetter = minVal;
      this.plugin.settings.maxCentsPerLetter = maxVal;
      await this.plugin.saveSettings();
      new Notice('Reward thresholds updated');
      this.close();
    })).addButton((btn) => btn.setButtonText('Cancel').onClick(() => this.close()));
  }
  onClose() { this.contentEl.empty(); }
}
class YenSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Yen Motivation Counter' });
    new Setting(containerEl).setName('Show cents').setDesc('Display the fractional yen, e.g. ¥100\'000.42 instead of ¥100\'000.').addToggle((toggle) => toggle.setValue(this.plugin.settings.showCents).onChange(async (value) => {
      this.plugin.settings.showCents = value;
      await this.plugin.saveSettings();
      this.plugin.renderValue(this.plugin.settings.totalCents, false);
    }));
    new Setting(containerEl).setName('Minimum cents per letter').setDesc('Lower bound of the random reward per letter typed (in cents, 100 = ¥1).').addText((text) => text.setValue(String(this.plugin.settings.minCentsPerLetter)).onChange(async (value) => {
      const n = parseFloat(value);
      if (!isNaN(n)) { this.plugin.settings.minCentsPerLetter = n; await this.plugin.saveSettings(); }
    }));
    new Setting(containerEl).setName('Maximum cents per letter').setDesc('Upper bound of the random reward per letter typed (in cents, 100 = ¥1).').addText((text) => text.setValue(String(this.plugin.settings.maxCentsPerLetter)).onChange(async (value) => {
      const n = parseFloat(value);
      if (!isNaN(n)) { this.plugin.settings.maxCentsPerLetter = n; await this.plugin.saveSettings(); }
    }));
    new Setting(containerEl).setName('Reset counter').setDesc('Set the total back to ¥0.').addButton((btn) => btn.setButtonText('Reset to ¥0').onClick(async () => {
      this.plugin.settings.totalCents = 0;
      await this.plugin.saveSettings();
      this.plugin.renderValue(0, true);
    }));
  }
}