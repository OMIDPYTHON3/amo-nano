import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { BUILTIN_THEMES, COLOR_KEYS, resolveThemeId, validateTheme } from './themes.js';

export const DEFAULT_CONFIG = {
  theme: 'catppuccin-mocha',
  font: 'terminal-default',
  fontSize: 'terminal-default',
  lineNumbers: true,
  relativeLineNumbers: false,
  cursorLine: true,
  cursorStyle: 'block',
  syntaxHighlighting: true,
  wordWrap: false,
  tabSize: 4,
  indentStyle: 'spaces',
  autoSave: true,
  autoSaveDelay: 1000,
  autoSaveOnFocusLost: true,
  autoSaveOnTabSwitch: true,
  autoSaveOnExit: true,
  autocomplete: true,
  bracketMatching: true,
  highlightTrailingWhitespace: true,
  showWhitespace: false,
  restoreTabs: true
};

const VALIDATORS = {
  theme: v => typeof v === 'string' && v.length > 0,
  font: v => typeof v === 'string',
  fontSize: v => typeof v === 'string' || typeof v === 'number',
  lineNumbers: v => typeof v === 'boolean',
  relativeLineNumbers: v => typeof v === 'boolean',
  cursorLine: v => typeof v === 'boolean',
  cursorStyle: v => ['block', 'underline', 'bar'].includes(v),
  syntaxHighlighting: v => typeof v === 'boolean',
  wordWrap: v => typeof v === 'boolean',
  tabSize: v => Number.isInteger(v) && v >= 1 && v <= 16,
  indentStyle: v => ['spaces', 'tabs'].includes(v),
  autoSave: v => typeof v === 'boolean',
  autoSaveDelay: v => Number.isFinite(v) && v >= 100 && v <= 3600000,
  autoSaveOnFocusLost: v => typeof v === 'boolean',
  autoSaveOnTabSwitch: v => typeof v === 'boolean',
  autoSaveOnExit: v => typeof v === 'boolean',
  autocomplete: v => typeof v === 'boolean',
  bracketMatching: v => typeof v === 'boolean',
  highlightTrailingWhitespace: v => typeof v === 'boolean',
  showWhitespace: v => typeof v === 'boolean',
  restoreTabs: v => typeof v === 'boolean'
};

export function getConfigDir() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir() || '/tmp', '.config');
  return path.join(base, 'amo');
}

export class Settings {
  constructor(configDir = null) {
    this.configDir = configDir || getConfigDir();
    this.configPath = path.join(this.configDir, 'config.json');
    this.customThemesPath = path.join(this.configDir, 'themes');
    this.recoveryDir = path.join(this.configDir, 'recovery');
    this.values = { ...DEFAULT_CONFIG };
    this.customThemes = {};
    this.warnings = [];
    this.load();
  }

  ensureDirs() {
    for (const dir of [this.configDir, this.customThemesPath, this.recoveryDir]) {
      try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch { }
    }
  }

  load() {
    this.ensureDirs();
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        for (const [key, value] of Object.entries(raw)) {
          this.set(key, value, false);
        }
      }
    } catch (e) {
      this.warnings.push(`Could not read config: ${e.message}`);
    }
    this.loadCustomThemes();
    return this.values;
  }

  loadCustomThemes() {
    this.customThemes = {};
    try {
      const files = fs.readdirSync(this.customThemesPath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(this.customThemesPath, file), 'utf8'));
          const result = validateTheme(data);
          if (result.ok) this.customThemes[data.id || file.replace(/\.json$/, '')] = {
            ...result.colors, name: data.name || file.replace(/\.json$/, ''),
            description: data.description || 'Custom theme'
          };
        } catch (e) {
          this.warnings.push(`Invalid theme file ${file}: ${e.message}`);
        }
      }
    } catch { }
  }

  set(key, value, save = true) {
    const validator = VALIDATORS[key];
    if (!validator) return { ok: false, error: `Unknown setting: ${key}` };
    if (!validator(value)) return { ok: false, error: `Invalid value for ${key}: ${JSON.stringify(value)}` };
    this.values[key] = value;
    if (save) this.save();
    return { ok: true };
  }

  get(key) { return this.values[key]; }
  all() { return { ...this.values }; }

  save() {
    this.ensureDirs();
    try {
      const tmp = `${this.configPath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.values, null, 2) + '\n', 'utf8');
      fs.renameSync(tmp, this.configPath);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  reset() {
    this.values = { ...DEFAULT_CONFIG };
    return this.save();
  }

  saveCustomTheme(id, theme) {
    const result = validateTheme(theme);
    if (!result.ok) return result;
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) return { ok: false, error: 'Invalid theme id' };
    if (BUILTIN_THEMES[id]) return { ok: false, error: 'Cannot overwrite a built-in theme' };
    this.ensureDirs();
    try {
      const file = path.join(this.customThemesPath, `${id}.json`);
      const tmp = `${file}.${process.pid}.tmp`;
      const colors = {};
      for (const key of COLOR_KEYS) if (result.colors[key] != null) colors[key] = result.colors[key];
      const payload = { id, name: theme.name || id, description: theme.description || 'Custom theme', ...colors };
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
      fs.renameSync(tmp, file);
      this.loadCustomThemes();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  deleteCustomTheme(id) {
    try {
      fs.unlinkSync(path.join(this.customThemesPath, `${id}.json`));
      this.loadCustomThemes();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  importTheme(jsonOrPath) {
    let data;
    try {
      if (fs.existsSync(jsonOrPath)) data = JSON.parse(fs.readFileSync(jsonOrPath, 'utf8'));
      else data = JSON.parse(jsonOrPath);
    } catch (e) {
      return { ok: false, error: `Invalid theme JSON: ${e.message}` };
    }
    const id = data.id || (data.name || 'imported').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return this.saveCustomTheme(id, data);
  }

  exportTheme(id) {
    const theme = this.customThemes[id];
    if (!theme) return { ok: false, error: 'Custom theme not found' };
    return { ok: true, json: JSON.stringify(theme, null, 2) };
  }

  isValidTheme(id) {
    return !!(resolveThemeId(id) || this.customThemes[id]);
  }
}
