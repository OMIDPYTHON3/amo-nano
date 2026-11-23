import path from 'node:path';
import { Settings } from '../editor/settings.js';
import { getTheme, listThemes, resolveThemeId } from '../editor/themes.js';
import { SUGGESTED_FONTS, formatFontReport } from '../editor/fonts.js';
import { Editor } from '../editor/editor.js';
import { RESTORE_SEQUENCE } from '../editor/terminal.js';

export const HELP = `AMO Editor — professional terminal code editor

Usage:
  amo                      Open an empty editor
  amo file.txt             Open a file (created if missing)
  amo a.go b.js            Open several files in tabs
  amo --theme              List available themes
  amo --theme dracula      Set the default theme
  amo --font               Show font information
  amo --font "Fira Code"   Store a font preference
  amo --settings           Show current configuration
  amo --version            Print version
  amo --help               Show this help

Editor keys:
  Ctrl+S Save   Ctrl+O Open   Ctrl+N New   Ctrl+W Close   Ctrl+Q Quit
  Ctrl+F Find   Ctrl+H Replace   Ctrl+P File picker   Ctrl+G Go to line
  Ctrl+/ Comment   Ctrl+D Duplicate   Ctrl+L Delete line
  Ctrl+Shift+S / Ctrl+Alt+S Save As (Ctrl+Alt+S works on Termux keyboards)
  Alt+T: Change Theme   Alt+S Settings   Alt+L Language   : Commands

Termux: the actual font is controlled by the terminal emulator.
AMO stores font preferences and respects the terminal's monospace font.`;

export function parseArgs(argv) {
  const result = {
    files: [], theme: null, font: null,
    showThemes: false, showFont: false, showSettings: false,
    showHelp: false, showVersion: false, setTheme: null, setFont: null
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') { result.files.push(...argv.slice(i + 1)); break; }
    switch (arg) {
      case '--help': case '-h': result.showHelp = true; break;
      case '--version': case '-v': result.showVersion = true; break;
      case '--settings': result.showSettings = true; break;
      case '--theme':
        if (argv[i + 1] && !argv[i + 1].startsWith('-')) { result.setTheme = argv[++i]; }
        else result.showThemes = true;
        break;
      case '--font':
        if (argv[i + 1] && !argv[i + 1].startsWith('-')) { result.setFont = argv[++i]; }
        else result.showFont = true;
        break;
      default:
        if (arg.startsWith('-')) {
          result.error = `Unknown option: ${arg}`;
        } else result.files.push(arg);
    }
  }
  return result;
}

function printThemes(settings) {
  const current = settings.get('theme');
  const lines = ['Available themes:', ''];
  for (const t of listThemes(settings.customThemes)) {
    lines.push(`  ${t.id === current ? '●' : ' '} ${t.id.padEnd(24)} ${t.name}${t.builtin ? '' : ' (custom)'}`);
  }
  lines.push('', `Current: ${current}`, 'Change: amo --theme <name>  or  Alt+T in the editor');
  return lines.join('\n');
}

function printSettings(settings) {
  return `${JSON.stringify(settings.all(), null, 2)}\n\nConfig: ${settings.configPath}\nThemes: ${settings.customThemesPath}`;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.error) { process.stderr.write(`amo: ${args.error}\n\n${HELP}\n`); process.exitCode = 2; return; }
  if (args.showHelp) { process.stdout.write(HELP + '\n'); return; }
  if (args.showVersion) { process.stdout.write('AMO Editor 1.0.0\n'); return; }

  const settings = new Settings();
  if (args.showThemes) { process.stdout.write(printThemes(settings) + '\n'); return; }
  if (args.showFont) { process.stdout.write(formatFontReport(settings) + '\n'); return; }
  if (args.showSettings) { process.stdout.write(printSettings(settings) + '\n'); return; }

  if (args.setTheme) {
    const id = resolveThemeId(args.setTheme) || (settings.customThemes[args.setTheme] ? args.setTheme : null);
    if (!id) {
      process.stderr.write(`amo: unknown theme "${args.setTheme}". Run amo --theme to list themes.\n`);
      process.exitCode = 2;
      return;
    }
    settings.set('theme', id);
    process.stdout.write(`Theme set to ${getTheme(id, settings.customThemes).name}\n`);
    return;
  }
  if (args.setFont) {
    const value = args.setFont;
    if (!SUGGESTED_FONTS.includes(value) && value !== 'terminal-default') {
      process.stdout.write(`amo: storing custom preference "${value}". The terminal font itself is unchanged.\n`);
    }
    settings.set('font', value);
    process.stdout.write(`Font preference set to ${value}. The actual font is controlled by your terminal.\n`);
    return;
  }

  const editor = new Editor({ settings });
  editor.onQuit = () => { process.exit(0); };
  await editor.start(args.files);
}

const isMain = (() => {
  try {
    const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
    return path.basename(entry) === 'amo' || entry.endsWith(`${path.sep}src${path.sep}cli${path.sep}index.js`);
  } catch { return false; }
})();

if (isMain) {
  main().catch(err => {
    try { process.stdout.write(RESTORE_SEQUENCE + '\n'); } catch { }
    process.stderr.write(`amo: ${err?.stack || err}\n`);
    process.exit(1);
  });
}
