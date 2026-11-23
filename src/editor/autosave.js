export class AutoSave {
  constructor(settings, fileManager, onStatus = () => { }) {
    this.settings = settings;
    this.fileManager = fileManager;
    this.onStatus = onStatus;
    this.timers = new Map();
    this.saving = new Map();
  }

  get delay() { return this.settings.get('autoSaveDelay') ?? 1000; }
  get enabled() { return this.settings.get('autoSave') !== false; }

  schedule(tab) {
    if (!this.enabled || !tab || !tab.filePath || tab.readOnly || !tab.modified) return;
    this.cancel(tab);
    const timer = setTimeout(() => {
      this.timers.delete(tab);
      this.flushOne(tab, 'auto').catch(() => { });
    }, this.delay);
    timer.unref?.();
    this.timers.set(tab, timer);
  }

  cancel(tab) {
    const timer = this.timers.get(tab);
    if (timer) { clearTimeout(timer); this.timers.delete(tab); }
  }

  trigger(tab, reason = 'event') {
    if (!this.enabled || !tab || !tab.filePath || tab.readOnly || !tab.modified) return;
    this.cancel(tab);
    this.flushOne(tab, reason).catch(() => { });
  }

  isSaving(tab) { return this.saving.has(tab); }

  async flushOne(tab, reason = 'manual', options = {}) {
    if (!tab || !tab.filePath || tab.readOnly) {
      return { ok: false, error: 'No writable file path' };
    }
    this.cancel(tab);
    if (this.saving.has(tab)) return this.saving.get(tab);
    if (!tab.modified && !options.force) return { ok: true, skipped: true };

    const text = tab.buffer.getText();
    const expected = options.ignoreConflict ? null : tab.fingerprint;
    const force = !!options.force;
    tab.saveStatus = 'saving';
    this.onStatus(tab, 'saving', reason);
    const promise = (async () => {
      const result = await this.fileManager.save(tab.filePath, text, expected, { force });
      if (result.ok) {
        tab.fingerprint = result.fingerprint;
        tab.externalDirty = false;
        const changedWhileSaving = tab.buffer.getText() !== text;
        if (!changedWhileSaving) {
          tab.modified = false;
          tab.saveStatus = 'saved';
          this.onStatus(tab, 'saved', reason);
        } else {
          tab.saveStatus = 'modified';
          this.onStatus(tab, 'dirty', reason);
          this.schedule(tab);
        }
      } else {
        tab.saveStatus = result.conflict ? 'conflict' : 'error';
        this.onStatus(tab, result.conflict ? 'conflict' : 'error', result.error);
      }
      return result;
    })().finally(() => {
      this.saving.delete(tab);
    });
    this.saving.set(tab, promise);
    return promise;
  }

  async flushAll(tabs, reason = 'exit') {
    const results = [];
    for (const tab of tabs) {
      if (tab.modified && tab.filePath && !tab.readOnly) {
        results.push(await this.flushOne(tab, reason));
      } else this.cancel(tab);
    }
    return results;
  }

  cancelAll(tabs) {
    for (const tab of tabs || []) this.cancel(tab);
  }

  destroy() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
