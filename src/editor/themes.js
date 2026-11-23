export const COLOR_KEYS = [
  'bg', 'fg', 'lineNumber', 'lineNumberActive', 'activeLine', 'cursor', 'cursorText',
  'selection', 'keyword', 'string', 'function', 'comment', 'number', 'type', 'operator',
  'constant', 'variable', 'property', 'tag', 'attribute', 'punctuation',
  'tabBg', 'tabActiveBg', 'tabFg', 'tabActiveFg', 'tabModified', 'separator',
  'statusBg', 'statusFg', 'statusAccent', 'statusModified',
  'autocompleteBg', 'autocompleteFg', 'autocompleteSelectedBg', 'autocompleteSelectedFg',
  'searchHighlight', 'bracketMatch', 'error', 'warning', 'whitespace', 'gutterBg'
];

function make(def) {
  const base = {
    bg: '#1e1e2e', fg: '#cdd6f4', lineNumber: '#585b70', lineNumberActive: '#a6adc8',
    activeLine: '#ffffff0c', cursor: '#f5e0dc', cursorText: '#11111b',
    selection: '#45475a', keyword: '#cba6f7', string: '#a6e3a1', function: '#f9e2af',
    comment: '#6c7086', number: '#fab387', type: '#89dceb', operator: '#9399b2',
    constant: '#f9e2af', variable: '#cdd6f4', property: '#89b4fa', tag: '#f38ba8',
    attribute: '#f9e2af', punctuation: '#a6adc8',
    tabBg: '#181825', tabActiveBg: '#1e1e2e', tabFg: '#6c7086', tabActiveFg: '#cdd6f4',
    tabModified: '#f9e2af', separator: '#313244',
    statusBg: '#11111b', statusFg: '#cdd6f4', statusAccent: '#89b4fa', statusModified: '#f9e2af',
    autocompleteBg: '#181825', autocompleteFg: '#cdd6f4',
    autocompleteSelectedBg: '#45475a', autocompleteSelectedFg: '#f5e0dc',
    searchHighlight: '#f9e2af40', bracketMatch: '#585b70',
    error: '#f38ba8', warning: '#fab387', whitespace: '#45475a', gutterBg: '#181825'
  };
  return { ...base, ...def };
}

export const BUILTIN_THEMES = {
  'catppuccin-mocha': make({
    name: 'Catppuccin Mocha', description: 'Warm, soothing pastel dark theme'
  }),
  'catppuccin-macchiato': make({
    name: 'Catppuccin Macchiato', description: 'Slightly darker Catppuccin variant',
    bg: '#24273a', fg: '#cad3f5', lineNumber: '#5b6078', lineNumberActive: '#a5adce',
    activeLine: '#ffffff08', cursor: '#f4dbd6', cursorText: '#181926',
    selection: '#494d64', keyword: '#c6a0f6', string: '#a6da95', function: '#eed49f',
    comment: '#6e738d', number: '#f5a97f', type: '#8bd5ca', operator: '#a5adce',
    constant: '#eed49f', variable: '#cad3f5', property: '#91d7e3', tag: '#ed8796',
    attribute: '#eed49f', punctuation: '#a5adce', tabBg: '#1e2030', tabActiveBg: '#24273a',
    tabFg: '#6e738d', tabActiveFg: '#cad3f5', separator: '#363a4f',
    statusBg: '#181926', statusFg: '#cad3f5', statusAccent: '#8aadf4',
    autocompleteBg: '#1e2030', autocompleteFg: '#cad3f5',
    autocompleteSelectedBg: '#494d64', autocompleteSelectedFg: '#f4dbd6', gutterBg: '#1e2030'
  }),
  'dracula': make({
    name: 'Dracula', description: 'The classic purple-based dark theme',
    bg: '#282a36', fg: '#f8f8f2', lineNumber: '#6272a4', lineNumberActive: '#bd93f9',
    activeLine: '#44475a80', cursor: '#f8f8f2', cursorText: '#282a36',
    selection: '#44475a', keyword: '#ff79c6', string: '#50fa7b', function: '#50fa7b',
    comment: '#6272a4', number: '#bd93f9', type: '#8be9fd', operator: '#f8f8f2',
    constant: '#f1fa8c', variable: '#f8f8f2', property: '#50fa7b', tag: '#ff79c6',
    attribute: '#50fa7b', punctuation: '#f8f8f2', tabBg: '#21222c', tabActiveBg: '#282a36',
    tabFg: '#6272a4', tabActiveFg: '#f8f8f2', separator: '#44475a',
    statusBg: '#191a21', statusFg: '#f8f8f2', statusAccent: '#bd93f9',
    autocompleteBg: '#21222c', autocompleteFg: '#f8f8f2',
    autocompleteSelectedBg: '#44475a', autocompleteSelectedFg: '#50fa7b', gutterBg: '#21222c'
  }),
  'tokyo-night': make({
    name: 'Tokyo Night', description: 'Inspired by Tokyo neon nights',
    bg: '#1a1b26', fg: '#a9b1d6', lineNumber: '#565f89', lineNumberActive: '#c0caf5',
    activeLine: '#292e42', cursor: '#c0caf5', cursorText: '#1a1b26',
    selection: '#33467c', keyword: '#bb9af7', string: '#9ece6a', function: '#7dcfff',
    comment: '#565f89', number: '#ff9e64', type: '#2ac3de', operator: '#89ddff',
    constant: '#ff9e64', variable: '#a9b1d6', property: '#7dcfff', tag: '#f7768e',
    attribute: '#e0af68', punctuation: '#a9b1d6', tabBg: '#15161e', tabActiveBg: '#1a1b26',
    tabFg: '#565f89', tabActiveFg: '#c0caf5', separator: '#292e42',
    statusBg: '#15161e', statusFg: '#a9b1d6', statusAccent: '#7dcfff',
    autocompleteBg: '#15161e', autocompleteFg: '#a9b1d6',
    autocompleteSelectedBg: '#33467c', autocompleteSelectedFg: '#c0caf5', gutterBg: '#15161e'
  }),
  'nord': make({
    name: 'Nord', description: 'Arctic, bluish minimal theme',
    bg: '#2e3440', fg: '#d8dee9', lineNumber: '#4c566a', lineNumberActive: '#8fbcbb',
    activeLine: '#434c5e80', cursor: '#d8dee9', cursorText: '#2e3440',
    selection: '#434c5e', keyword: '#b48ead', string: '#a3be8c', function: '#88c0d0',
    comment: '#616e88', number: '#d08770', type: '#8fbcbb', operator: '#d8dee9',
    constant: '#d08770', variable: '#d8dee9', property: '#81a1c1', tag: '#bf616a',
    attribute: '#ebcb8b', punctuation: '#d8dee9', tabBg: '#272c36', tabActiveBg: '#2e3440',
    tabFg: '#616e88', tabActiveFg: '#d8dee9', separator: '#3b4252',
    statusBg: '#242932', statusFg: '#d8dee9', statusAccent: '#88c0d0',
    autocompleteBg: '#272c36', autocompleteFg: '#d8dee9',
    autocompleteSelectedBg: '#434c5e', autocompleteSelectedFg: '#eceff4', gutterBg: '#272c36'
  }),
  'gruvbox-dark': make({
    name: 'Gruvbox Dark', description: 'Retro groove warm dark theme',
    bg: '#282828', fg: '#ebdbb2', lineNumber: '#665c54', lineNumberActive: '#a89984',
    activeLine: '#3c3836', cursor: '#ebdbb2', cursorText: '#282828',
    selection: '#454758', keyword: '#fe8019', string: '#b8bb26', function: '#fabd2f',
    comment: '#7c6f64', number: '#d3869b', type: '#83a598', operator: '#ebdbb2',
    constant: '#d3869b', variable: '#ebdbb2', property: '#83a598', tag: '#fb4934',
    attribute: '#fabd2f', punctuation: '#ebdbb2', tabBg: '#1d2021', tabActiveBg: '#282828',
    tabFg: '#7c6f64', tabActiveFg: '#ebdbb2', separator: '#3c3836',
    statusBg: '#1d2021', statusFg: '#ebdbb2', statusAccent: '#fabd2f',
    autocompleteBg: '#1d2021', autocompleteFg: '#ebdbb2',
    autocompleteSelectedBg: '#504945', autocompleteSelectedFg: '#ebdbb2', gutterBg: '#1d2021'
  }),
  'one-dark': make({
    name: 'One Dark', description: 'Atom-inspired balanced dark theme',
    bg: '#282c34', fg: '#abb2bf', lineNumber: '#4b5263', lineNumberActive: '#abb2bf',
    activeLine: '#2c323c', cursor: '#528bff', cursorText: '#282c34',
    selection: '#3e4451', keyword: '#c678dd', string: '#98c379', function: '#61afef',
    comment: '#5c6370', number: '#d19a66', type: '#e5c07b', operator: '#56b6c2',
    constant: '#d19a66', variable: '#abb2bf', property: '#56b6c2', tag: '#e06c75',
    attribute: '#d19a66', punctuation: '#abb2bf', tabBg: '#21252b', tabActiveBg: '#282c34',
    tabFg: '#5c6370', tabActiveFg: '#abb2bf', separator: '#3b4048',
    statusBg: '#21252b', statusFg: '#abb2bf', statusAccent: '#61afef',
    autocompleteBg: '#21252b', autocompleteFg: '#abb2bf',
    autocompleteSelectedBg: '#3e4451', autocompleteSelectedFg: '#ffffff', gutterBg: '#21252b'
  }),
  'github-dark': make({
    name: 'GitHub Dark', description: 'GitHub interface dark colors',
    bg: '#0d1117', fg: '#c9d1d9', lineNumber: '#484f58', lineNumberActive: '#8b949e',
    activeLine: '#161b22', cursor: '#58a6ff', cursorText: '#0d1117',
    selection: '#264f78', keyword: '#ff7b72', string: '#a5d6ff', function: '#d2a8ff',
    comment: '#8b949e', number: '#79c0ff', type: '#ffa657', operator: '#c9d1d9',
    constant: '#79c0ff', variable: '#c9d1d9', property: '#79c0ff', tag: '#7ee787',
    attribute: '#ffa657', punctuation: '#c9d1d9', tabBg: '#010409', tabActiveBg: '#0d1117',
    tabFg: '#8b949e', tabActiveFg: '#c9d1d9', separator: '#30363d',
    statusBg: '#010409', statusFg: '#c9d1d9', statusAccent: '#58a6ff',
    autocompleteBg: '#161b22', autocompleteFg: '#c9d1d9',
    autocompleteSelectedBg: '#264f78', autocompleteSelectedFg: '#ffffff', gutterBg: '#010409'
  }),
  'monokai': make({
    name: 'Monokai', description: 'The iconic warm high-contrast theme',
    bg: '#272822', fg: '#f8f8f2', lineNumber: '#75715e', lineNumberActive: '#a6a28c',
    activeLine: '#3e3d32', cursor: '#f8f8f0', cursorText: '#272822',
    selection: '#49483e', keyword: '#f92672', string: '#e6db74', function: '#a6e22e',
    comment: '#75715e', number: '#ae81ff', type: '#66d9ef', operator: '#f8f8f2',
    constant: '#ae81ff', variable: '#f8f8f2', property: '#a6e22e', tag: '#f92672',
    attribute: '#a6e22e', punctuation: '#f8f8f2', tabBg: '#1e1f1a', tabActiveBg: '#272822',
    tabFg: '#75715e', tabActiveFg: '#f8f8f2', separator: '#3e3d32',
    statusBg: '#1e1f1a', statusFg: '#f8f8f2', statusAccent: '#a6e22e',
    autocompleteBg: '#1e1f1a', autocompleteFg: '#f8f8f2',
    autocompleteSelectedBg: '#49483e', autocompleteSelectedFg: '#a6e22e', gutterBg: '#1e1f1a'
  }),
  'solarized-dark': make({
    name: 'Solarized Dark', description: 'Precision colors for machines and people',
    bg: '#002b36', fg: '#839496', lineNumber: '#586e75', lineNumberActive: '#93a1a1',
    activeLine: '#073642', cursor: '#93a1a1', cursorText: '#002b36',
    selection: '#073642', keyword: '#859900', string: '#2aa198', function: '#268bd2',
    comment: '#586e75', number: '#d33682', type: '#b58900', operator: '#839496',
    constant: '#d33682', variable: '#839496', property: '#268bd2', tag: '#dc322f',
    attribute: '#b58900', punctuation: '#839496', tabBg: '#00212b', tabActiveBg: '#002b36',
    tabFg: '#586e75', tabActiveFg: '#93a1a1', separator: '#073642',
    statusBg: '#00212b', statusFg: '#839496', statusAccent: '#268bd2',
    autocompleteBg: '#00212b', autocompleteFg: '#839496',
    autocompleteSelectedBg: '#073642', autocompleteSelectedFg: '#93a1a1', gutterBg: '#00212b'
  }),
  'solarized-light': make({
    name: 'Solarized Light', description: 'Light counterpart of Solarized',
    bg: '#fdf6e3', fg: '#657b83', lineNumber: '#93a1a1', lineNumberActive: '#586e75',
    activeLine: '#eee8d5', cursor: '#586e75', cursorText: '#fdf6e3',
    selection: '#eee8d5', keyword: '#859900', string: '#2aa198', function: '#268bd2',
    comment: '#93a1a1', number: '#d33682', type: '#b58900', operator: '#657b83',
    constant: '#d33682', variable: '#657b83', property: '#268bd2', tag: '#dc322f',
    attribute: '#b58900', punctuation: '#657b83', tabBg: '#eee8d5', tabActiveBg: '#fdf6e3',
    tabFg: '#93a1a1', tabActiveFg: '#586e75', separator: '#d3c6aa',
    statusBg: '#eee8d5', statusFg: '#586e75', statusAccent: '#268bd2',
    autocompleteBg: '#eee8d5', autocompleteFg: '#586e75',
    autocompleteSelectedBg: '#d3c6aa', autocompleteSelectedFg: '#002b36', gutterBg: '#eee8d5'
  }),
  'github-light': make({
    name: 'GitHub Light', description: 'GitHub interface light colors',
    bg: '#ffffff', fg: '#24292f', lineNumber: '#8c959f', lineNumberActive: '#57606a',
    activeLine: '#f6f8fa', cursor: '#0969da', cursorText: '#ffffff',
    selection: '#ddf4ff', keyword: '#cf222e', string: '#0a3069', function: '#8250df',
    comment: '#6e7781', number: '#0550ae', type: '#953800', operator: '#24292f',
    constant: '#0550ae', variable: '#24292f', property: '#0550ae', tag: '#116329',
    attribute: '#953800', punctuation: '#24292f', tabBg: '#f6f8fa', tabActiveBg: '#ffffff',
    tabFg: '#6e7781', tabActiveFg: '#24292f', separator: '#d0d7de',
    statusBg: '#f6f8fa', statusFg: '#24292f', statusAccent: '#0969da',
    autocompleteBg: '#f6f8fa', autocompleteFg: '#24292f',
    autocompleteSelectedBg: '#ddf4ff', autocompleteSelectedFg: '#0969da', gutterBg: '#f6f8fa'
  }),
  'vs-dark': make({
    name: 'VS Code Dark+', description: 'Visual Studio Code default dark',
    bg: '#1e1e1e', fg: '#d4d4d4', lineNumber: '#858585', lineNumberActive: '#c6c6c6',
    activeLine: '#2a2d2e', cursor: '#aeafad', cursorText: '#1e1e1e',
    selection: '#264f78', keyword: '#569cd6', string: '#ce9178', function: '#dcdcaa',
    comment: '#6a9955', number: '#b5cea8', type: '#4ec9b0', operator: '#d4d4d4',
    constant: '#b5cea8', variable: '#9cdcfe', property: '#9cdcfe', tag: '#569cd6',
    attribute: '#9cdcfe', punctuation: '#d4d4d4', tabBg: '#252526', tabActiveBg: '#1e1e1e',
    tabFg: '#969696', tabActiveFg: '#ffffff', separator: '#3c3c3c',
    statusBg: '#007acc', statusFg: '#ffffff', statusAccent: '#ffffff', statusModified: '#ffffff',
    autocompleteBg: '#252526', autocompleteFg: '#d4d4d4',
    autocompleteSelectedBg: '#094771', autocompleteSelectedFg: '#ffffff', gutterBg: '#1e1e1e'
  }),
  'ayu-dark': make({
    name: 'Ayu Dark', description: 'Sharp, low-contrast dark theme',
    bg: '#0a0e14', fg: '#b3b1ad', lineNumber: '#4f5966', lineNumberActive: '#b3b1ad',
    activeLine: '#11161d', cursor: '#ffb454', cursorText: '#0a0e14',
    selection: '#1d3b53', keyword: '#ff7edb', string: '#c2d94c', function: '#ffb454',
    comment: '#626880', number: '#ffb454', type: '#59c2ff', operator: '#b3b1ad',
    constant: '#ffb454', variable: '#b3b1ad', property: '#59c2ff', tag: '#ff7edb',
    attribute: '#c2d94c', punctuation: '#b3b1ad', tabBg: '#0d1117', tabActiveBg: '#0a0e14',
    tabFg: '#626880', tabActiveFg: '#b3b1ad', separator: '#1c2431',
    statusBg: '#0d1117', statusFg: '#b3b1ad', statusAccent: '#59c2ff',
    autocompleteBg: '#0d1117', autocompleteFg: '#b3b1ad',
    autocompleteSelectedBg: '#1d3b53', autocompleteSelectedFg: '#ffb454', gutterBg: '#0d1117'
  }),
  'amoled-black': make({
    name: 'AMOLED Black', description: 'Pure black for OLED battery saving',
    bg: '#000000', fg: '#e0e0e0', lineNumber: '#4d4d4d', lineNumberActive: '#9e9e9e',
    activeLine: '#141414', cursor: '#ffffff', cursorText: '#000000',
    selection: '#2a4b7c', keyword: '#c586c0', string: '#6a9955', function: '#dcdcaa',
    comment: '#5a5a5a', number: '#b5cea8', type: '#4ec9b0', operator: '#e0e0e0',
    constant: '#ce9178', variable: '#9cdcfe', property: '#9cdcfe', tag: '#569cd6',
    attribute: '#9cdcfe', punctuation: '#e0e0e0', tabBg: '#0a0a0a', tabActiveBg: '#000000',
    tabFg: '#6e6e6e', tabActiveFg: '#ffffff', separator: '#1f1f1f',
    statusBg: '#0a0a0a', statusFg: '#e0e0e0', statusAccent: '#4ec9b0',
    autocompleteBg: '#0a0a0a', autocompleteFg: '#e0e0e0',
    autocompleteSelectedBg: '#2a4b7c', autocompleteSelectedFg: '#ffffff', gutterBg: '#000000'
  })
};

export const THEME_ALIASES = {
  mocha: 'catppuccin-mocha', 'catppuccin-macchiato': 'catppuccin-macchiato', macchiato: 'catppuccin-macchiato',
  tokyo: 'tokyo-night', gruvbox: 'gruvbox-dark', onedark: 'one-dark', githubdark: 'github-dark',
  githublight: 'github-light', solarizeddark: 'solarized-dark', solarizedlight: 'solarized-light',
  vscode: 'vs-dark', 'vs-code': 'vs-dark', ayu: 'ayu-dark', amoled: 'amoled-black'
};

export function resolveThemeId(name) {
  if (!name) return null;
  const lowered = String(name).toLowerCase().trim();
  if (BUILTIN_THEMES[lowered]) return lowered;
  if (THEME_ALIASES[lowered]) return THEME_ALIASES[lowered];
  return null;
}

export function getTheme(id, customThemes = {}) {
  const resolved = resolveThemeId(id);
  if (resolved) return { id: resolved, ...BUILTIN_THEMES[resolved] };
  if (customThemes[id]) {
    return { id, ...make(customThemes[id]) };
  }
  return { id: 'catppuccin-mocha', ...BUILTIN_THEMES['catppuccin-mocha'] };
}

export function listThemes(customThemes = {}) {
  const list = Object.entries(BUILTIN_THEMES).map(([id, t]) => ({
    id, name: t.name, description: t.description, builtin: true
  }));
  for (const [id, t] of Object.entries(customThemes || {})) {
    list.push({ id, name: t.name || id, description: t.description || 'Custom theme', builtin: false });
  }
  return list;
}

export function validateTheme(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'Theme must be an object' };
  const colors = obj.colors || obj;
  for (const key of ['bg', 'fg', 'keyword', 'string', 'comment']) {
    if (colors[key] && !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(colors[key])) {
      return { ok: false, error: `Invalid color for ${key}: ${colors[key]}` };
    }
  }
  return { ok: true, colors };
}

export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return [255, 0, 255];
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length !== 6) return [255, 0, 255];
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [255, 0, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function blend(hex, alpha, bgHex) {
  if (!hex || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return hex;
  const a = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : alpha;
  const [r, g, b] = hexToRgb(hex);
  const [br, bg_, bb] = hexToRgb(bgHex || '#000000');
  const mix = (x, y) => Math.round(x * a + y * (1 - a));
  const toHex = x => x.toString(16).padStart(2, '0');
  return `#${toHex(mix(r, br))}${toHex(mix(g, bg_))}${toHex(mix(b, bb))}`;
}

export function fg(color, bgColor) {
  const resolved = /^#[0-9a-f]{8}$/i.test(color || '') ? blend(color, 1, bgColor) : color;
  const [r, g, b] = hexToRgb(resolved);
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function bg(color) {
  const [r, g, b] = hexToRgb(color);
  return `\x1b[48;2;${r};${g};${b}m`;
}
