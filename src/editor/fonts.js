import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const SUGGESTED_FONTS = [
  'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Hack', 'Iosevka',
  'Source Code Pro', 'Ubuntu Mono', 'DejaVu Sans Mono', 'Noto Sans Mono'
];

export const FONT_INSTRUCTIONS = [
  'AMO renders inside your terminal, so the actual font is controlled by the terminal emulator.',
  'Selecting a font here stores a preference; it cannot replace the terminal font by itself.',
  'Termux: install a font in ~/.termux/font.ttf (or add it through Termux styling),',
  'then run: termux-reload-settings  — and enable it via Termux extra keys / preferences.',
  'Recommended: install a Nerd Font or one of the monospace fonts listed above,',
  'and make sure "Use ligatures"/monospace is enabled in your terminal for alignment.'
];

export function detectTerminalFont() {
  const home = os.homedir();
  const candidates = [
    path.join(home, '.termux', 'font.ttf'),
    path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'font.ttf')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const link = fs.readlinkSync(p);
        const name = path.basename(link || p).replace(/\.(ttf|otf|ttc)$/i, '').replace(/[-_]/g, ' ');
        return { path: p, name };
      }
    } catch { }
  }
  return { path: null, name: null };
}

export function listFontInfo(settings) {
  const detected = detectTerminalFont();
  const current = settings?.get?.('font') || 'terminal-default';
  return {
    current,
    detected,
    available: SUGGESTED_FONTS.map(name => ({
      name,
      installed: detected.name ? detected.name.toLowerCase().includes(name.split(' ')[0].toLowerCase()) : false
    }))
  };
}

export function formatFontReport(settings) {
  const info = listFontInfo(settings);
  const lines = [
    'AMO Font Settings',
    '',
    `Preference : ${info.current}`,
    `Terminal   : ${info.detected.name || 'not detected (terminal default)'}`,
    info.detected.path ? `Font file  : ${info.detected.path}` : '',
    '',
    'Available font preferences:',
    ...info.available.map(f => `  - ${f.name}${f.installed ? '  [detected]' : ''}`),
    '',
    ...FONT_INSTRUCTIONS
  ];
  return lines.filter(l => l !== '').join('\n');
}

export function isValidFontPreference(value) {
  return typeof value === 'string' && (
    value === 'terminal-default' || SUGGESTED_FONTS.includes(value)
  );
}
