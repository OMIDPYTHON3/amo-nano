import { LANGUAGES } from './languages.js';
import { isWordChar } from './buffer.js';

const COMMON_SNIPPETS = [
  { text: 'todo', insertText: '// TODO: ', detail: 'Todo comment', type: 'snippet' },
  { text: 'fixme', insertText: '// FIXME: ', detail: 'Fixme comment', type: 'snippet' }
];

const SNIPPETS = {
  javascript: [
    { text: 'log', insertText: 'console.log(${1})', detail: 'console.log', type: 'snippet' },
    { text: 'fn', insertText: 'function ${1:name}(${2}) {\n\t$0\n}', detail: 'function', type: 'snippet' },
    { text: 'arrow', insertText: 'const ${1:name} = (${2}) => {\n\t$0\n};', detail: 'arrow function', type: 'snippet' },
    { text: 'if', insertText: 'if (${1}) {\n\t$0\n}', detail: 'if block', type: 'snippet' },
    { text: 'for', insertText: 'for (let ${1:i} = 0; ${1:i} < ${2}; ${1:i}++) {\n\t$0\n}', detail: 'for loop', type: 'snippet' }
  ],
  typescript: [
    { text: 'iface', insertText: 'interface ${1:Name} {\n\t$0\n}', detail: 'interface', type: 'snippet' },
    { text: 'type', insertText: 'type ${1:Name} = ${2};', detail: 'type alias', type: 'snippet' },
    { text: 'log', insertText: 'console.log(${1})', detail: 'console.log', type: 'snippet' }
  ],
  python: [
    { text: 'def', insertText: 'def ${1:name}(${2}):\n\t$0', detail: 'function', type: 'snippet' },
    { text: 'class', insertText: 'class ${1:Name}:\n\t$0', detail: 'class', type: 'snippet' },
    { text: 'ifmain', insertText: 'if __name__ == "__main__":\n\t$0', detail: 'main guard', type: 'snippet' },
    { text: 'print', insertText: 'print(${1})', detail: 'print', type: 'snippet' }
  ],
  go: [
    { text: 'func', insertText: 'func ${1:name}(${2}) {\n\t$0\n}', detail: 'function', type: 'snippet' },
    { text: 'main', insertText: 'func main() {\n\t$0\n}', detail: 'main function', type: 'snippet' },
    { text: 'iferr', insertText: 'if err != nil {\n\treturn err\n}\n$0', detail: 'error check', type: 'snippet' },
    { text: 'printf', insertText: 'fmt.Printf("${1}\\n", ${2})', detail: 'fmt.Printf', type: 'snippet' }
  ],
  rust: [
    { text: 'fn', insertText: 'fn ${1:name}(${2}) {\n\t$0\n}', detail: 'function', type: 'snippet' },
    { text: 'main', insertText: 'fn main() {\n\t$0\n}', detail: 'main function', type: 'snippet' },
    { text: 'println', insertText: 'println!("${1}");', detail: 'println', type: 'snippet' }
  ],
  html: [
    { text: 'html', insertText: '<!DOCTYPE html>\n<html>\n<head>\n\t<meta charset="utf-8">\n\t<title>${1:Title}</title>\n</head>\n<body>\n\t$0\n</body>\n</html>', detail: 'html skeleton', type: 'snippet' }
  ],
  css: [
    { text: 'flex', insertText: 'display: flex;\nalign-items: ${1:center};\njustify-content: ${2:center};', detail: 'flexbox', type: 'snippet' }
  ]
};

export class Autocomplete {
  constructor(settings) {
    this.settings = settings;
    this.providers = [];
    this.frequencies = new Map();
    this.suggestions = [];
    this.index = 0;
    this.visible = false;
    this.triggerPos = null;
    this.prefix = '';
    this.context = null;
  }

  registerProvider(fn) {
    this.providers.push(fn);
    return () => {
      const i = this.providers.indexOf(fn);
      if (i >= 0) this.providers.splice(i, 1);
    };
  }

  noteWord(word) {
    if (!word || word.length < 2) return;
    this.frequencies.set(word, (this.frequencies.get(word) || 0) + 1);
  }

  noteBuffer(buffer) {
    const lines = buffer.lines || [];
    for (const line of lines) {
      for (const word of line.split(/[^\p{L}\p{N}_$]+/u)) {
        if (word) this.noteWord(word);
      }
    }
  }

  languageWords(languageId) {
    const lang = LANGUAGES[languageId];
    if (!lang) return [];
    const items = [];
    for (const k of lang.keywords) items.push({ text: k, type: 'keyword', detail: 'keyword' });
    for (const k of lang.types) items.push({ text: k, type: 'type', detail: 'type' });
    for (const k of lang.constants) items.push({ text: k, type: 'constant', detail: 'constant' });
    for (const k of lang.builtins) items.push({ text: k, type: 'function', detail: 'builtin' });
    return items;
  }

  collectWords(buffers) {
    const words = new Map();
    for (const buffer of buffers || []) {
      for (const line of buffer.lines || []) {
        for (const word of line.split(/[^\p{L}\p{N}_$]+/u)) {
          if (word && word.length >= 2) words.set(word, (words.get(word) || 0) + 1);
        }
      }
    }
    return words;
  }

  getSuggestions(context) {
    if (!this.settings?.get?.('autocomplete')) return [];
    context = context || {};
    const prefix = context.prefix || '';
    const languageId = context.language || null;
    const items = new Map();

    const add = (item) => {
      if (!item || !item.text) return;
      if (!items.has(item.text)) items.set(item.text, item);
    };

    for (const item of this.languageWords(languageId)) add(item);
    for (const item of (SNIPPETS[languageId] || [])) add(item);
    add(COMMON_SNIPPETS[0]);
    add(COMMON_SNIPPETS[1]);

    for (const [word, count] of this.collectWords(context.buffers)) {
      add({ text: word, type: 'variable', detail: `identifier · ${count}`, score: count });
    }
    for (const [word, count] of this.frequencies) {
      add({ text: word, type: 'variable', detail: 'used before', score: count + 1 });
    }
    for (const provider of this.providers) {
      try {
        const provided = provider(context) || [];
        for (const item of provided) add(item);
      } catch { }
    }

    let list = Array.from(items.values());
    if (prefix) {
      const lower = prefix.toLowerCase();
      list = list.filter(item => item.text.toLowerCase().startsWith(lower) && item.text.toLowerCase() !== lower);
    }
    list.sort((a, b) => {
      if (prefix && a.text.toLowerCase().startsWith(prefix.toLowerCase()) !== b.text.toLowerCase().startsWith(prefix.toLowerCase())) return 0;
      const as = a.score || (a.type === 'keyword' ? 3 : a.type === 'snippet' ? 2 : 1);
      const bs = b.score || (b.type === 'keyword' ? 3 : b.type === 'snippet' ? 2 : 1);
      if (bs !== as) return bs - as;
      return a.text.localeCompare(b.text);
    });
    return list.slice(0, 12);
  }

  update(context) {
    this.context = context;
    this.prefix = context?.prefix || '';
    this.suggestions = this.getSuggestions(context);
    this.index = 0;
    this.navigated = false;
    this.visible = this.suggestions.length > 0 && !!context?.enabled;
    this.triggerPos = context?.cursor ? { ...context.cursor } : null;
    return this.suggestions;
  }

  hide() {
    this.visible = false;
    this.suggestions = [];
    this.index = 0;
    this.navigated = false;
  }

  next() {
    if (!this.suggestions.length) return null;
    this.index = (this.index + 1) % this.suggestions.length;
    this.navigated = true;
    return this.current();
  }

  previous() {
    if (!this.suggestions.length) return null;
    this.index = (this.index - 1 + this.suggestions.length) % this.suggestions.length;
    this.navigated = true;
    return this.current();
  }

  current() { return this.suggestions[this.index] || null; }

  accept() {
    const item = this.current();
    this.hide();
    return item || null;
  }
}

export function shouldTriggerAutocomplete(textBeforeCursor) {
  if (!textBeforeCursor) return false;
  const last = Array.from(textBeforeCursor).pop();
  return isWordChar(last) && Array.from(last).length > 0;
}
