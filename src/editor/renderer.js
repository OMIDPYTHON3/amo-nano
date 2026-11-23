import { charWidth, stringWidth, clamp, truncateWidth, padWidth } from './util.js';
import { fg, bg, blend } from './themes.js';
import { buildStatus, buildShortcuts, buildPromptLine } from './statusbar.js';
import { SyntaxHighlighter } from './syntax.js';

class RowBuilder {
  constructor(cols, rowBg) {
    this.cols = cols;
    this.rowBg = rowBg;
    this.cells = new Array(cols);
    for (let i = 0; i < cols; i++) this.cells[i] = { ch: ' ', color: null, bg: rowBg, style: '', skip: false };
    this.col = 0;
  }

  write(text, style = {}) {
    if (!text) return;
    const color = style.color || null;
    let cellBg = style.bg || this.rowBg;
    if (style.alphaBg && style.bg) cellBg = blend(style.bg, style.alphaBg, this.rowBg);
    const sgr = style.style || '';
    for (const ch of Array.from(String(text))) {
      if (ch === '\n' || ch === '\r') continue;
      const w = charWidth(ch);
      if (this.col >= this.cols) break;
      if (w === 0) {
        const prev = this.cells[this.col - 1];
        if (prev) prev.ch += ch;
        continue;
      }
      this.cells[this.col] = { ch, color, bg: cellBg, style: sgr, skip: false };
      if (w === 2 && this.col + 1 < this.cols) {
        this.cells[this.col + 1] = { ch: '', color, bg: cellBg, style: sgr, skip: true };
      }
      this.col += w;
    }
  }

  fill(from, to, style) {
    for (let i = Math.max(0, from); i < Math.min(to, this.cols); i++) {
      if (this.cells[i]?.skip) continue;
      this.cells[i] = { ch: ' ', color: null, bg: style.bg || this.rowBg, style: style.style || '', skip: false };
    }
  }

  toString(theme) {
    let out = '';
    let cur = null;
    const flush = () => {
      if (!cur) return;
      let text = '';
      for (const cell of cur.cells) text += cell.ch;
      if (text) {
        out += cur.color ? fg(cur.color, cur.bg) : '\x1b[39m';
        out += cur.bg ? bg(cur.bg) : '\x1b[49m';
        if (cur.style) out += `\x1b[${cur.style}m`;
        out += text;
        if (cur.style) out += '\x1b[0m';
      }
      cur = null;
    };
    for (let i = 0; i < this.cols; i++) {
      const cell = this.cells[i] || { ch: ' ', bg: this.rowBg };
      const key = `${cell.color || ''}|${cell.bg || ''}|${cell.style || ''}`;
      if (!cur || cur.key !== key) {
        flush();
        cur = { key, color: cell.color, bg: cell.bg, style: cell.style, cells: [] };
      }
      cur.cells.push(cell);
    }
    flush();
    return out;
  }
}

function wrapTokens(tokens, width) {
  if (width <= 0) width = 1;
  const chunks = [];
  let current = [];
  let curW = 0;
  let startCP = 0;
  let cp = 0;
  let chunkCP = 0;
  const pushChunk = (endCP) => {
    chunks.push({ tokens: current, startCP, endCP, width: curW });
    current = [];
    curW = 0;
    startCP = endCP;
    chunkCP = 0;
  };
  for (const token of tokens) {
    for (const ch of Array.from(token.text)) {
      const w = charWidth(ch);
      if (curW + w > width && current.length > 0) pushChunk(cp);
      const last = current[current.length - 1];
      if (last && last.type === token.type) last.text += ch;
      else current.push({ text: ch, type: token.type, _chunkOffset: chunkCP });
      chunkCP++;
      curW += w;
      cp++;
    }
  }
  chunks.push({ tokens: current, startCP, endCP: cp, width: curW });
  return chunks;
}

export class Renderer {
  constructor(write, settings, theme) {
    this.write = write;
    this.settings = settings;
    this.theme = theme;
    this.highlighter = new SyntaxHighlighter();
    this.prevRows = [];
    this.prevSize = { cols: 0, rows: 0 };
    this.cols = 80;
    this.rows = 24;
    this.forceFull = false;
    this._stateCache = new WeakMap();
    this.cursorScreen = { row: 0, col: 0, visible: false };
  }

  setTheme(theme) {
    this.theme = theme;
    const [r, g, b] = (() => {
      const hex = theme.cursor || '#ffffff';
      let h = hex.replace('#', '');
      if (h.length === 8) h = h.slice(0, 6);
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      const n = parseInt(h, 16) || 0xffffff;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    })();
    this.write(`\x1b]12;#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}\x1b\\`);
    this.forceFull = true;
  }

  resize(cols, rows) {
    const c = Number(cols);
    const r = Number(rows);
    if (!Number.isFinite(c) || !Number.isFinite(r) || c <= 0 || r <= 0) return false;
    const nextCols = Math.max(1, Math.floor(c));
    const nextRows = Math.max(1, Math.floor(r));
    if (nextCols === this.cols && nextRows === this.rows) return false;
    this.cols = nextCols;
    this.rows = nextRows;
    this.prevSize = { cols: nextCols, rows: nextRows };
    this.prevRows = [];
    this.forceFull = true;
    this.write('\x1b[2J\x1b[H');
    return true;
  }

  reset() {
    this.prevRows = [];
    this.forceFull = true;
    this._stateCache = new WeakMap();
  }

  clear() { this.write('\x1b[2J\x1b[H'); this.reset(); }

  hiddenCursorStart() { this.write('\x1b[?25l'); }
  hiddenCursorEnd(y, x, visible = true, style = 'block') {
    if (!visible) { this.write('\x1b[?25l'); return; }
    const shape = style === 'underline' ? 4 : style === 'bar' ? 5 : 1;
    this.write(`\x1b[${y};${x}H\x1b[${shape} q\x1b[?25h`);
  }

  _statesFor(tab, language) {
    const cached = this._stateCache.get(tab.buffer);
    if (cached && cached.version === tab.buffer.version && cached.language === language) return cached.states;
    const states = [null];
    let state = null;
    const lines = tab.buffer.lines;
    for (let i = 0; i < lines.length; i++) {
      const res = this.highlighter.tokenizeLine(lines[i], language, state);
      state = res.state;
      states.push(state);
    }
    this._stateCache.set(tab.buffer, { version: tab.buffer.version, language, states });
    return states;
  }

  virtualCount(tab, width) {
    if (!tab) return 1;
    return this._virtualLines(tab, tab.language, width).length;
  }

  virtualRowFor(tab, width) {
    if (!tab) return 0;
    const virtual = this._virtualLines(tab, tab.language, width);
    const index = virtual.findIndex(v => v.line === tab.cursor.y);
    return index === -1 ? tab.cursor.y : index;
  }

  _virtualLines(tab, language, width) {
    const states = this._statesFor(tab, language);
    const out = [];
    for (let y = 0; y < tab.buffer.lineCount; y++) {
      const res = this.highlighter.tokenizeLine(tab.buffer.line(y), language, states[y]);
      const chunks = wrapTokens(res.tokens, width);
      for (const chunk of chunks) out.push({ line: y, ...chunk });
    }
    if (!out.length) out.push({ line: 0, tokens: [], startCP: 0, endCP: 0, width: 0 });
    return out;
  }

  render(ctx) {
    const theme = this.theme || {};
    const tab = ctx.tab;
    const cfg = ctx.config || {};
    const bgColor = theme.bg || '#1e1e2e';
    const rows = [];

    const numWidth = Math.max(2, String(tab?.buffer?.lineCount || 1).length);
    const gutterWidth = cfg.lineNumbers === false ? 1 : numWidth + 4;
    const codeWidth = Math.max(1, this.cols - gutterWidth);
    const tabRow = this._renderTabs(ctx, bgColor);
    rows.push(tabRow);

    const footerRows = this.rows >= 3 ? 2 : this.rows >= 2 ? 1 : 0;
    const requestedCodeHeight = Math.max(0, this.rows - 1 - footerRows);
    const virtual = tab ? this._virtualLines(tab, tab.language, codeWidth) : [];
    const codeRows = this._renderCode(ctx, virtual, Math.max(1, requestedCodeHeight), gutterWidth, codeWidth, numWidth, bgColor);
    const code = [];
    for (let i = 0; i < requestedCodeHeight; i++) code.push(codeRows[i] || this._blankRow(bgColor));

    const statusRow = this._renderSegmentsRow(buildStatus(tab, { ...ctx, cols: this.cols }), theme.statusBg || bgColor, theme.statusFg);
    const bottom = ctx.prompt
      ? this._renderSegmentsRow(buildPromptLine(ctx.prompt) || [], theme.statusBg || bgColor, theme.statusFg)
      : ctx.message
        ? this._renderSegmentsRow([{ text: ` ${ctx.message}`, color: ctx.messageType === 'error' ? 'error' : ctx.messageType === 'warning' ? 'warning' : 'statusAccent' }], theme.statusBg || bgColor, theme.statusFg)
        : this._renderSegmentsRow(buildShortcuts(this.cols), theme.statusBg || bgColor, theme.statusFg);

    const suffix = [statusRow];
    if (footerRows === 2) suffix.push(bottom);
    const available = this.rows - 1 - suffix.length;
    while (code.length < available) code.push(this._blankRow(bgColor));
    if (code.length > available) code.length = Math.max(0, available);
    const finalRows = [tabRow, ...code, ...suffix];
    const codeHeight = finalRows.length - 1 - suffix.length;
    rows.length = 0;
    rows.push(...finalRows);

    const cursorPos = this._cursorScreen(ctx, virtual, gutterWidth, codeHeight);
    this.cursorScreen = cursorPos;

    if (ctx.overlay) this._applyOverlay(rows, ctx.overlay, codeHeight, bgColor);
    else if (ctx.autocomplete?.visible && ctx.autocomplete.suggestions?.length) {
      this._applyAutocomplete(rows, ctx, codeHeight, bgColor);
    }

    this.hiddenCursorStart();
    let out = '';
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (this.forceFull || this.prevRows[i] !== row) {
        out += `\x1b[${i + 1};1H${row}\x1b[K`;
      }
    }
    this.prevRows = rows.slice();
    this.forceFull = false;
    if (out) this.write(out);
    this.hiddenCursorEnd(cursorPos.row + 1, cursorPos.col + 1, cursorPos.visible, cfg.cursorStyle || 'block');
  }

  _blankRow(bgColor) {
    const rb = new RowBuilder(this.cols, bgColor);
    return rb.toString(this.theme);
  }

  _styleForColor(color, fallback) {
    const theme = this.theme || {};
    return theme[color] || (color && /^#/.test(color) ? color : fallback) || theme.fg || '#ffffff';
  }

  _renderSegmentsRow(segments, rowBg, fallback) {
    const rb = new RowBuilder(this.cols, rowBg);
    for (const seg of segments || []) {
      rb.write(seg.text || '', {
        color: this._styleForColor(seg.color, fallback),
        bg: seg.bg ? this._styleForColor(seg.bg, rowBg) : rowBg,
        style: seg.style || ''
      });
    }
    return rb.toString(this.theme);
  }

  _renderTabs(ctx, bgColor) {
    const theme = this.theme || {};
    const rb = new RowBuilder(this.cols, this._styleForColor('tabBg', bgColor));
    const tabs = ctx.tabs || [];
    if (!tabs.length) {
      rb.write(' AMO ', { color: theme.statusAccent, bg: this._styleForColor('tabBg', bgColor), style: '1' });
      rb.write('  No file open  ·  Ctrl+N new  ·  Ctrl+O open', { color: theme.comment });
      return rb.toString(theme);
    }
    const activeIndex = ctx.activeIndex ?? 0;
    const maxTabWidth = Math.max(12, Math.floor(this.cols / Math.max(1, tabs.length)) - 2);
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const active = i === activeIndex;
      const label = `${tab.modified ? '● ' : ''}${tab.displayName || 'untitled'}`;
      const text = ` ${truncateWidth(label, maxTabWidth - 2)} `;
      const tabBg = active ? this._styleForColor('tabActiveBg', bgColor) : this._styleForColor('tabBg', bgColor);
      const tabFg = active ? this._styleForColor('tabActiveFg', theme.fg) : this._styleForColor('tabFg', theme.comment);
      rb.write(text, { color: tab.modified ? this._styleForColor('tabModified', '#f9e2af') : tabFg, bg: tabBg, style: active ? '1' : '' });
      rb.write('│', { color: this._styleForColor('separator', bgColor), bg: tabBg });
    }
    return rb.toString(theme);
  }

  _renderCode(ctx, virtual, codeHeight, gutterWidth, codeWidth, numWidth, bgColor) {
    const theme = this.theme || {};
    const cfg = ctx.config || {};
    const tab = ctx.tab;
    const rows = [];
    const scrollY = tab?.scrollY || 0;
    const scrollX = tab?.scrollX || 0;
    const cursor = tab?.cursor || { y: 0, x: 0 };
    const selection = tab?.selection || {};
    const search = ctx.search;
    const matchRanges = search?.matches ? search.matches.map(m => ({ start: m.start, end: m.end })) : [];

    for (let sr = 0; sr < codeHeight; sr++) {
      const v = virtual[scrollY + sr];
      const isActive = v && v.line === cursor.y;
      let rowBg = bgColor;
      if (cfg.cursorLine && isActive) rowBg = blend(this._styleForColor('activeLine', '#ffffff10'), 1, bgColor);
      const rb = new RowBuilder(this.cols, rowBg);

      if (cfg.lineNumbers !== false && v) {
        let num;
        if (cfg.relativeLineNumbers && v.line !== cursor.y) num = String(Math.abs(v.line - cursor.y)).padStart(numWidth, ' ');
        else num = String(v.line + 1).padStart(numWidth, ' ');
        rb.write(` ${num} `, {
          color: isActive ? this._styleForColor('lineNumberActive', theme.fg) : this._styleForColor('lineNumber', theme.comment),
          bg: this._styleForColor('gutterBg', bgColor)
        });
        rb.write('│', { color: this._styleForColor('separator', bgColor), bg: this._styleForColor('gutterBg', bgColor) });
        rb.write(' ', { bg: this._styleForColor('gutterBg', bgColor) });
      } else if (cfg.lineNumbers !== false) {
        rb.write(' '.repeat(gutterWidth - 2), { bg: this._styleForColor('gutterBg', bgColor) });
        rb.write('│', { color: this._styleForColor('separator', bgColor), bg: this._styleForColor('gutterBg', bgColor) });
        rb.write(' ', { bg: this._styleForColor('gutterBg', bgColor) });
      }

      if (!v) { rows.push(rb.toString(theme)); continue; }

      const lineCPs = tab ? tab.buffer.cps(v.line) : [];
      let trailStart = lineCPs.length;
      while (trailStart > 0 && (lineCPs[trailStart - 1] === ' ' || lineCPs[trailStart - 1] === '\t')) trailStart--;

      let displayCol = 0;
      for (const token of v.tokens || []) {
        const chars = Array.from(token.text);
        for (let ci = 0; ci < chars.length; ci++) {
          const ch = chars[ci];
          const cw = charWidth(ch);
          const absCP = v.startCP + (token._chunkOffset || 0) + ci;
          if (displayCol >= scrollX && displayCol - scrollX < codeWidth) {
            const colorKey = token.type === 'plain' ? 'fg' : token.type;
            const color = this._styleForColor(colorKey, theme.fg);
            let cellBg = null;
            let alpha = null;
            if (cfg.showWhitespace && (ch === ' ' || ch === '\t')) {
              cellBg = this._styleForColor('whitespace', theme.comment);
              alpha = 0.35;
            }
            if (this._inRanges(absCP, v, selection)) {
              cellBg = this._styleForColor('selection', theme.fg);
              alpha = 0.55;
            } else if (this._inMatch(absCP, v, matchRanges)) {
              cellBg = this._styleForColor('searchHighlight', '#f9e2af');
              alpha = 0.55;
            } else if (ctx.bracketMatch && ctx.bracketMatch.y === v.line && ctx.bracketMatch.x === absCP) {
              cellBg = this._styleForColor('bracketMatch', theme.comment);
              alpha = 0.7;
            } else if (cfg.highlightTrailingWhitespace && (ch === ' ' || ch === '\t') && absCP >= trailStart) {
              cellBg = this._styleForColor('error', '#f38ba8');
              alpha = 0.4;
            }
            rb.write(ch, { color, bg: cellBg || rowBg, alphaBg: alpha });
          }
          displayCol += cw;
        }
      }
      rows.push(rb.toString(theme));
    }
    return rows;
  }

  _inRanges(cpIndex, v, selection) {
    const sel = selection?.anchor && selection?.head ? {
      start: selection.anchor.y <= selection.head.y ? selection.anchor : selection.head,
      end: selection.anchor.y <= selection.head.y ? selection.head : selection.anchor
    } : null;
    if (sel && sel.start.y <= sel.end.y) {
      if (v.line > sel.start.y && v.line < sel.end.y) return true;
      if (v.line === sel.start.y && v.line === sel.end.y) return cpIndex >= sel.start.x && cpIndex < sel.end.x;
      if (v.line === sel.start.y) return cpIndex >= sel.start.x;
      if (v.line === sel.end.y) return cpIndex < sel.end.x;
    }
    return false;
  }

  _inMatch(cpIndex, v, ranges) {
    for (const r of ranges) {
      if (v.line > r.start.y && v.line < r.end.y) return true;
      if (v.line === r.start.y && v.line === r.end.y && cpIndex >= r.start.x && cpIndex < r.end.x) return true;
      if (v.line === r.start.y && cpIndex >= r.start.x) return true;
      if (v.line === r.end.y && cpIndex < r.end.x) return true;
    }
    return false;
  }

  _isTrailing(v, cpIndex) {
    if (!v || !v.tokens) return false;
    let seenContent = false;
    for (const token of v.tokens) {
      for (const ch of Array.from(token.text)) {
        if (!(ch === ' ' || ch === '\t')) seenContent = true;
        if (cpIndex <= v.endCP && seenContent && (ch === ' ' || ch === '\t')) return false;
      }
    }
    return cpIndex >= v.endCP - 1;
  }

  _cursorScreen(ctx, virtual, gutterWidth, codeHeight) {
    const tab = ctx.tab;
    if (!tab) return { row: this.rows - 2, col: 0, visible: false };
    const cursor = tab.cursor;
    const scrollY = tab.scrollY || 0;
    const scrollX = tab.scrollX || 0;
    let vi = virtual.findIndex(v => v.line === cursor.y && cursor.x >= v.startCP && cursor.x <= v.endCP);
    if (vi === -1) vi = virtual.findIndex(v => v.line === cursor.y);
    if (vi === -1) return { row: codeHeight, col: gutterWidth, visible: false };
    const v = virtual[vi];
    const row = vi - scrollY;
    if (row < 0 || row >= codeHeight) return { row: codeHeight, col: gutterWidth, visible: false };
    let displayX = 0;
    const targetCP = Math.min(cursor.x, v.endCP);
    for (const token of v.tokens || []) {
      const chars = Array.from(token.text);
      for (let i = 0; i < chars.length; i++) {
        const cp = (token._chunkOffset || 0) + v.startCP + i;
        if (cp >= targetCP) break;
        displayX += charWidth(chars[i]);
      }
    }
    const x = gutterWidth + displayX - scrollX;
    if (x < gutterWidth || x >= this.cols) return { row: row + 1, col: gutterWidth, visible: false };
    return { row: row + 1, col: x, visible: true };
  }

  _applyOverlay(rows, overlay, codeHeight, bgColor) {
    const theme = this.theme || {};
    const items = overlay.items || [];
    const width = Math.min(this.cols - 4, Math.max(24, overlay.width || 50));
    const startY = Math.min(1, Math.max(1, Math.floor((codeHeight - items.length) / 2) + 1));
    const startX = Math.max(0, Math.floor((this.cols - width) / 2));
    const boxBg = this._styleForColor('autocompleteBg', bgColor);
    for (let i = 0; i < Math.min(items.length, codeHeight - 1); i++) {
      const rowIndex = startY + i;
      if (rowIndex >= rows.length - 2) break;
      const rb = new RowBuilder(this.cols, boxBg);
      rb.fill(0, this.cols, { bg: boxBg });
      const item = items[i];
      const selected = i === overlay.index;
      const itemBg = selected ? this._styleForColor('autocompleteSelectedBg', '#45475a') : boxBg;
      rb.fill(startX, startX + width, { bg: itemBg });
      const swatch = item.swatch;
      if (swatch) {
        rb.write(' ', { bg: itemBg });
        for (const color of [swatch, item.swatch2 || swatch, item.swatch3 || swatch]) {
          rb.write('██', { bg: color, color });
        }
        rb.write(' ', { bg: itemBg });
      }
      let content = item.label || item.text || '';
      const detail = item.detail || '';
      const maxText = width - (swatch ? 9 : 3) - Math.min(20, detail.length + 2);
      rb.write(` ${truncateWidth(content, maxText)}`, {
        color: selected ? this._styleForColor('autocompleteSelectedFg', theme.fg) : this._styleForColor('autocompleteFg', theme.fg),
        bg: itemBg
      });
      if (detail) rb.write(` ${padWidth(truncateWidth(detail, 18), 18)}`, { color: this._styleForColor('comment', theme.comment), bg: itemBg });
      rows[rowIndex] = rb.toString(theme);
    }
    if (overlay.title) {
      const rb = new RowBuilder(this.cols, bgColor);
      rb.write(` ${overlay.title} `, { color: theme.statusAccent || '#89b4fa' });
      rows[Math.max(0, startY - 1)] = rb.toString(theme);
    }
  }

  _applyAutocomplete(rows, ctx, codeHeight, bgColor) {
    const theme = this.theme || {};
    const ac = ctx.autocomplete;
    const suggestions = ac.suggestions.slice(0, 8);
    const width = Math.min(46, this.cols - 2);
    const cursorY = this.cursorScreen.row;
    let startY = cursorY + 1;
    if (startY + suggestions.length > codeHeight) startY = Math.max(1, cursorY - suggestions.length);
    const startX = clamp(this.cursorScreen.col - 1, 0, Math.max(0, this.cols - width));
    const boxBg = this._styleForColor('autocompleteBg', bgColor);
    for (let i = 0; i < suggestions.length; i++) {
      const rowIndex = startY + i;
      if (rowIndex < 1 || rowIndex > codeHeight) continue;
      const item = suggestions[i];
      const selected = i === ac.index;
      const rb = new RowBuilder(this.cols, boxBg);
      const itemBg = selected ? this._styleForColor('autocompleteSelectedBg', '#45475a') : boxBg;
      rb.fill(startX, startX + width, { bg: itemBg });
      const icon = item.type === 'keyword' ? 'K' : item.type === 'function' ? 'ƒ' : item.type === 'snippet' ? 'S' : item.type === 'type' ? 'T' : item.type === 'constant' ? 'C' : 'v';
      rb.write(` ${icon} `, { color: this._styleForColor(item.type === 'plain' ? 'variable' : item.type, theme.fg), bg: itemBg });
      rb.write(` ${truncateWidth(item.text, 22)}`, {
        color: selected ? this._styleForColor('autocompleteSelectedFg', theme.fg) : this._styleForColor('autocompleteFg', theme.fg),
        bg: itemBg
      });
      if (item.detail) rb.write(` ${padWidth(truncateWidth(item.detail, 14), 14)}`, { color: this._styleForColor('comment', theme.comment), bg: itemBg });
      rows[rowIndex] = rb.toString(theme);
    }
  }
}
