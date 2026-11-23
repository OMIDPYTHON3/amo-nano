import { languageName } from './languages.js';

export function buildStatus(tab, ctx = {}) {
  const cfg = ctx.config || {};
  const cols = ctx.cols || 80;
  const compact = cols < 104;
  const segments = [];
  const mode = ctx.mode || 'NORMAL';
  const add = (text, color = 'statusFg', priority = 2) => segments.push({ text, color, priority });

  add(` ${mode} `, mode === 'NORMAL' ? 'statusAccent' : 'statusModified', 1);
  add('│', 'separator', 0);
  const name = tab?.displayName || 'untitled';
  add(` ${name}${tab?.modified ? ' ●' : ''} `, tab?.modified ? 'statusModified' : 'statusFg', 1);
  add('│', 'separator', 0);
  add(` ${tab?.language ? languageName(tab.language) : 'Plain Text'} `, 'type', 2);
  add('│', 'separator', 0);
  const y = (tab?.cursor?.y ?? 0) + 1;
  const x = (tab?.cursor?.x ?? 0) + 1;
  add(compact ? ` ${y}:${x} ` : ` Ln ${y}, Col ${x} `, 'statusFg', 1);
  if (!compact) {
    add('│', 'separator', 0);
    if (cfg.lineNumbers) add(` ${cfg.relativeLineNumbers ? 'REL' : 'ABS'} `, 'comment', 3);
    if (cfg.wordWrap) add(' WRAP ', 'comment', 3);
    add('│', 'separator', 0);
    add(' UTF-8 ', 'statusFg', 3);
    add('│', 'separator', 0);
    add(` ${ctx.insertMode ? 'INSERT' : 'NORMAL'} `, ctx.insertMode ? 'statusAccent' : 'statusFg', 3);
    add('│', 'separator', 0);
  } else {
    add('│', 'separator', 0);
    add(' UTF8 ', 'statusFg', 3);
    add('│', 'separator', 0);
  }
  let status = 'SAVED';
  let color = 'statusFg';
  if (tab?.saveStatus === 'saving') { status = 'SAVING…'; color = 'warning'; }
  else if (tab?.saveStatus === 'conflict') { status = 'CONFLICT'; color = 'error'; }
  else if (tab?.saveStatus === 'error') { status = 'SAVE ERROR'; color = 'error'; }
  else if (tab?.modified) { status = 'UNSAVED'; color = 'statusModified'; }
  else if (tab?.readOnly) { status = 'READ-ONLY'; color = 'warning'; }
  add(` ${status} `, color, 1);

  let width = segments.reduce((n, s) => n + s.text.length, 0);
  while (width > cols && segments.length > 3) {
    let idx = -1;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].priority >= 2) { idx = i; break; }
    }
    if (idx === -1) break;
    width -= segments[idx].text.length;
    segments.splice(idx, 1);
    while (segments.length && segments[segments.length - 1].priority === 0) {
      width -= segments[segments.length - 1].text.length;
      segments.pop();
    }
  }
  return segments;
}

export const SHORTCUTS = [
  ['^S', 'Save'], ['Alt+T', 'Theme'], ['^O', 'Open'], ['^N', 'New'], ['^W', 'Close'],
  ['^F', 'Find'], ['^/', 'Comment'], ['^D', 'Duplicate'], ['^L', 'Del Line'],
  ['^P', 'Picker'], ['^Q', 'Quit']
];

export function buildShortcuts(cols = 80) {
  const segments = [];
  segments.push({ text: ' ', color: 'statusFg' });
  const compact = cols < 64;
  const gap = compact ? ' ' : '   ';
  let width = 1;
  for (const [key, label] of SHORTCUTS) {
    const full = `${key} ${label}${gap}`;
    const short = compact ? `${key}${gap}` : null;
    if (width + full.length <= cols - 1) {
      segments.push({ text: key, color: 'statusAccent' });
      segments.push({ text: ' ', color: 'statusFg' });
      segments.push({ text: label, color: 'comment' });
      segments.push({ text: gap, color: 'statusFg' });
      width += full.length;
    } else if (short && width + short.length <= cols - 1) {
      segments.push({ text: key, color: 'statusAccent' });
      segments.push({ text: gap, color: 'statusFg' });
      width += short.length;
    }
  }
  return segments;
}

export function buildPromptLine(prompt) {
  if (!prompt) return null;
  const segments = [];
  const prefix = prompt.mode === 'replace' ? 'REPLACE' :
    prompt.mode === 'find' ? 'FIND' :
      prompt.mode === 'goto' ? 'GOTO' :
        prompt.mode === 'saveas' ? 'SAVE AS' :
          prompt.mode === 'open' ? 'OPEN' :
            prompt.mode === 'picker' ? 'FILES' :
              prompt.mode === 'theme' ? 'THEMES' :
                prompt.mode === 'language' ? 'LANGUAGE' :
                  prompt.mode === 'settings' ? 'SETTINGS' :
                    prompt.mode === 'recovery' ? 'RECOVERY' :
                      prompt.mode === 'confirm' ? 'CONFIRM' : (prompt.title || 'INPUT').toUpperCase();
  segments.push({ text: ` ${prefix} `, color: 'statusAccent' });
  segments.push({ text: ' ', color: 'statusFg' });
  if (prompt.prefix) segments.push({ text: prompt.prefix, color: 'comment' });
  segments.push({ text: prompt.value || '', color: 'fg' });
  if (prompt.cursorVisible !== false) segments.push({ text: '▌', color: 'cursor' });
  if (prompt.message) segments.push({ text: `  ${prompt.message}`, color: prompt.isError ? 'error' : 'warning' });
  if (prompt.hint) segments.push({ text: `  ${prompt.hint}`, color: 'comment' });
  return segments;
}
