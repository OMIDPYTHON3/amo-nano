export function makeCursor(y = 0, x = 0) {
  return { y, x };
}

export function cloneCursor(c) { return { y: c.y, x: c.x }; }

export function cursorsEqual(a, b) {
  return !!a && !!b && a.y === b.y && a.x === b.x;
}

export function compareCursors(a, b) {
  if (a.y !== b.y) return a.y < b.y ? -1 : 1;
  if (a.x !== b.x) return a.x < b.x ? -1 : 1;
  return 0;
}

export function makeSelection(anchor = null, head = null) {
  return { anchor: anchor ? cloneCursor(anchor) : null, head: head ? cloneCursor(head) : null };
}

export function hasSelection(sel) {
  return !!(sel && sel.anchor && sel.head && !cursorsEqual(sel.anchor, sel.head));
}

export function selectionRange(sel) {
  if (!sel || !sel.anchor || !sel.head) return null;
  const a = sel.anchor, b = sel.head;
  if (compareCursors(a, b) <= 0) return { start: cloneCursor(a), end: cloneCursor(b) };
  return { start: cloneCursor(b), end: cloneCursor(a) };
}

export function selectionText(buffer, sel) {
  const range = selectionRange(sel);
  if (!range) return '';
  if (range.start.y === range.end.y) {
    return buffer.cps(range.start.y).slice(range.start.x, range.end.x).join('');
  }
  const parts = [buffer.cps(range.start.y).slice(range.start.x).join('')];
  for (let y = range.start.y + 1; y < range.end.y; y++) parts.push(buffer.line(y));
  parts.push(buffer.cps(range.end.y).slice(0, range.end.x).join(''));
  return parts.join('\n');
}

export function selectedLineRange(sel, cursor, lineCount) {
  if (hasSelection(sel)) {
    const range = selectionRange(sel);
    return { start: range.start.y, end: range.end.y };
  }
  return { start: cursor.y, end: cursor.y };
}

export function clampCursor(c, buffer) {
  return {
    y: Math.max(0, Math.min(c.y, buffer.lineCount - 1)),
    x: Math.max(0, Math.min(c.x, buffer.lineLength(Math.max(0, Math.min(c.y, buffer.lineCount - 1)))))
  };
}
