import { TextBuffer, History } from './buffer.js';

let nextTabId = 1;

export function createTab(options = {}) {
  const buffer = new TextBuffer(options.content || '');
  return {
    id: nextTabId++,
    buffer,
    cursor: { y: 0, x: 0 },
    selection: { anchor: null, head: null },
    scrollY: 0,
    scrollX: 0,
    filePath: options.filePath || null,
    displayName: options.displayName || options.filePath || 'untitled',
    language: options.language || null,
    modified: !!options.modified,
    readOnly: !!options.readOnly,
    fingerprint: options.fingerprint || null,
    externalDirty: false,
    saveStatus: options.saveStatus || 'saved',
    history: new History(),
    lastClick: 0
  };
}

export class TabManager {
  constructor() {
    this.tabs = [];
    this.activeIndex = -1;
  }

  get active() { return this.tabs[this.activeIndex] || null; }
  get count() { return this.tabs.length; }

  add(tab, activate = true) {
    this.tabs.push(tab);
    if (activate || this.activeIndex < 0) this.activeIndex = this.tabs.length - 1;
    return this.tabs.length - 1;
  }

  addUntitled(content = '') {
    return this.add(createTab({ content, displayName: 'untitled' }));
  }

  findByPath(filePath) {
    return this.tabs.find(t => t.filePath && t.filePath === filePath) || null;
  }

  switchTo(index) {
    if (index < 0 || index >= this.tabs.length) return false;
    this.activeIndex = index;
    return true;
  }

  switchRelative(delta) {
    if (!this.tabs.length) return false;
    this.activeIndex = (this.activeIndex + delta + this.tabs.length) % this.tabs.length;
    return true;
  }

  close(index = this.activeIndex) {
    if (index < 0 || index >= this.tabs.length) return null;
    const [tab] = this.tabs.splice(index, 1);
    if (this.tabs.length === 0) this.activeIndex = -1;
    else if (index < this.activeIndex) this.activeIndex--;
    else if (index === this.activeIndex && this.activeIndex >= this.tabs.length) this.activeIndex = this.tabs.length - 1;
    return tab;
  }

  closeAll() {
    const tabs = this.tabs.slice();
    this.tabs = [];
    this.activeIndex = -1;
    return tabs;
  }

  indexOf(tab) { return this.tabs.indexOf(tab); }
}
