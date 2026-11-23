const cKeywords = ['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'goto', 'struct', 'interface', 'enum', 'union', 'typedef', 'static', 'const', 'extern', 'inline', 'register', 'volatile', 'sizeof', 'new', 'delete', 'try', 'catch', 'throw', 'finally', 'class', 'public', 'private', 'protected', 'virtual', 'override', 'final', 'abstract', 'extends', 'implements', 'import', 'package', 'namespace', 'using', 'template', 'typename', 'this', 'super', 'instanceof', 'typeof', 'void', 'defer', 'go', 'select', 'chan', 'map', 'func', 'var', 'let', 'fn', 'mut', 'impl', 'trait', 'match', 'loop', 'in', 'as', 'async', 'await', 'yield', 'export', 'from', 'of', 'with', 'is', 'not', 'and', 'or', 'def', 'elif', 'pass', 'lambda', 'global', 'nonlocal', 'assert', 'raise', 'except', 'del', 'local', 'function', 'end', 'then', 'repeat', 'until', 'set', 'get', 'declare', 'type', 'module'];

const jsKeywords = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'new', 'class', 'extends', 'super', 'this', 'import', 'export', 'from', 'default', 'async', 'await', 'yield', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'delete', 'void', 'static', 'get', 'set', 'interface', 'type', 'enum', 'implements', 'public', 'private', 'protected', 'readonly', 'abstract', 'declare', 'namespace', 'as', 'is', 'keyof', 'infer', 'satisfies'];

const cTypes = ['int', 'char', 'float', 'double', 'long', 'short', 'unsigned', 'signed', 'bool', 'void', 'size_t', 'uint8_t', 'int8_t', 'uint16_t', 'int16_t', 'uint32_t', 'int32_t', 'uint64_t', 'int64_t', 'string', 'byte', 'rune', 'error', 'any', 'float32', 'float64', 'uintptr'];

function lang(name, opts) {
  return {
    name,
    keywords: opts.keywords || cKeywords,
    types: opts.types || [],
    builtins: opts.builtins || [],
    constants: opts.constants || [],
    lineComment: opts.lineComment ?? '//',
    blockComment: opts.blockComment ?? ['/*', '*/'],
    strings: opts.strings ?? ['"', "'", '`'],
    rawStrings: opts.rawStrings ?? [],
    tripleStrings: opts.tripleStrings ?? [],
    mode: opts.mode || 'generic',
    caseInsensitive: !!opts.caseInsensitive,
    identifierPrefix: opts.identifierPrefix || '',
    autoClose: opts.autoClose || {}
  };
}

export const LANGUAGES = {
  go: lang('Go', {
    keywords: ['break', 'default', 'func', 'interface', 'select', 'case', 'defer', 'go', 'map', 'struct', 'chan', 'else', 'goto', 'package', 'switch', 'const', 'fallthrough', 'if', 'range', 'type', 'continue', 'for', 'import', 'return', 'var'],
    types: cTypes.concat(['bool', 'string', 'error', 'any', 'byte', 'rune']),
    builtins: ['append', 'cap', 'close', 'complex', 'copy', 'delete', 'imag', 'len', 'make', 'new', 'panic', 'print', 'println', 'real', 'recover', 'fmt', 'os', 'io', 'sync', 'errors', 'context', 'http', 'json'],
    constants: ['true', 'false', 'nil', 'iota'],
    strings: ['"', "'", '`'], rawStrings: ['`']
  }),
  javascript: lang('JavaScript', {
    keywords: jsKeywords,
    types: ['Number', 'String', 'Boolean', 'Object', 'Array', 'Function', 'Symbol', 'BigInt', 'Date', 'Promise', 'Map', 'Set', 'RegExp', 'Error'],
    builtins: ['console', 'log', 'warn', 'error', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'setInterval', 'require', 'module', 'exports', 'process', 'window', 'document', 'fetch'],
    constants: ['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'],
    strings: ['"', "'", '`'], rawStrings: []
  }),
  typescript: lang('TypeScript', {
    keywords: jsKeywords,
    types: ['string', 'number', 'boolean', 'any', 'unknown', 'never', 'void', 'object', 'symbol', 'bigint', 'undefined', 'null', 'Record', 'Partial', 'Readonly', 'Array', 'Promise', 'Pick', 'Omit'],
    builtins: ['console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Promise', 'Date', 'RegExp', 'Error'],
    constants: ['true', 'false', 'null', 'undefined', 'NaN', 'this']
  }),
  jsx: lang('JSX', { keywords: jsKeywords, types: ['string', 'number', 'boolean', 'any'], builtins: ['console', 'React', 'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback'], constants: ['true', 'false', 'null', 'undefined'], mode: 'jsx' }),
  tsx: lang('TSX', { keywords: jsKeywords, types: ['string', 'number', 'boolean', 'any', 'ReactNode', 'FC'], builtins: ['React', 'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'console'], constants: ['true', 'false', 'null', 'undefined'], mode: 'jsx' }),
  python: lang('Python', {
    keywords: ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'is', 'pass', 'break', 'continue', 'import', 'from', 'as', 'with', 'try', 'except', 'finally', 'raise', 'yield', 'lambda', 'global', 'nonlocal', 'assert', 'del', 'async', 'await', 'match', 'case'],
    types: ['int', 'str', 'float', 'bool', 'list', 'dict', 'tuple', 'set', 'bytes', 'object', 'None', 'Self'],
    builtins: ['print', 'len', 'range', 'open', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple', 'enumerate', 'zip', 'map', 'filter', 'sum', 'min', 'max', 'abs', 'sorted', 'isinstance', 'super', 'type', 'self'],
    constants: ['True', 'False', 'None', 'NotImplemented', 'Ellipsis'],
    lineComment: '#', blockComment: null, strings: ['"', "'"], tripleStrings: ['"""', "'''"]
  }),
  rust: lang('Rust', {
    keywords: ['fn', 'let', 'mut', 'match', 'if', 'else', 'for', 'while', 'loop', 'return', 'break', 'continue', 'struct', 'enum', 'trait', 'impl', 'pub', 'use', 'mod', 'crate', 'self', 'Self', 'as', 'where', 'move', 'ref', 'in', 'const', 'static', 'unsafe', 'async', 'await', 'dyn', 'type'],
    types: ['i8', 'i16', 'i32', 'i64', 'i128', 'u8', 'u16', 'u32', 'u64', 'u128', 'f32', 'f64', 'bool', 'char', 'str', 'String', 'Vec', 'Option', 'Result', 'Box', 'Rc', 'Arc', 'HashMap', 'usize', 'isize'],
    builtins: ['println', 'print', 'format', 'vec', 'Some', 'None', 'Ok', 'Err', 'panic', 'assert', 'write', 'writeln'],
    constants: ['true', 'false', 'None', 'Some', 'Ok', 'Err']
  }),
  c: lang('C', { types: cTypes, builtins: ['printf', 'scanf', 'malloc', 'free', 'calloc', 'realloc', 'memcpy', 'strlen', 'strcmp', 'sizeof'], constants: ['NULL', 'true', 'false', 'EOF'] }),
  cpp: lang('C++', { types: cTypes.concat(['std', 'vector', 'string', 'map', 'unordered_map', 'shared_ptr', 'unique_ptr']), builtins: ['std', 'cout', 'cin', 'endl', 'printf', 'make_shared', 'move'], constants: ['nullptr', 'true', 'false', 'NULL'] }),
  html: lang('HTML', { mode: 'markup', lineComment: null, blockComment: ['<!--', '-->'], strings: ['"', "'"], keywords: [], types: [], constants: [] }),
  xml: lang('XML', { mode: 'markup', lineComment: null, blockComment: ['<!--', '-->'], strings: ['"', "'"], keywords: [], types: [], constants: [] }),
  css: lang('CSS', { mode: 'css', lineComment: null, blockComment: ['/*', '*/'], strings: ['"', "'"], keywords: ['@media', '@import', '@keyframes', '@font-face', '@supports', '@use', '@mixin', '@include', '@extend', '@function', '@return', '@if', '@else', '@each', '@for', '@while'], types: [], constants: [], builtins: [] }),
  scss: lang('SCSS', { mode: 'css', lineComment: '//', blockComment: ['/*', '*/'], strings: ['"', "'"], keywords: ['@media', '@import', '@keyframes', '@mixin', '@include', '@extend', '@function', '@return', '@if', '@else', '@each', '@for', '@while', '@use', '@forward'], types: [], constants: [] }),
  json: lang('JSON', { mode: 'json', lineComment: null, blockComment: null, strings: ['"'], keywords: [], types: [], builtins: [], constants: ['true', 'false', 'null'] }),
  yaml: lang('YAML', { mode: 'yaml', lineComment: '#', blockComment: null, strings: ['"', "'"], keywords: [], types: [], builtins: [], constants: ['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~'] }),
  toml: lang('TOML', { mode: 'yaml', lineComment: '#', blockComment: null, strings: ['"', "'"], keywords: [], types: [], builtins: [], constants: ['true', 'false'] }),
  markdown: lang('Markdown', { mode: 'markdown', lineComment: null, blockComment: null, strings: [], keywords: [], types: [], constants: [], builtins: [] }),
  bash: lang('Bash', {
    mode: 'shell', lineComment: '#', blockComment: null, strings: ['"', "'"],
    keywords: ['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac', 'function', 'in', 'return', 'exit', 'local', 'export', 'declare', 'source', 'select', 'time'],
    types: [], builtins: ['echo', 'printf', 'cd', 'pwd', 'ls', 'cat', 'grep', 'sed', 'awk', 'mkdir', 'rm', 'cp', 'mv', 'touch', 'chmod', 'chown', 'sudo', 'apt', 'npm', 'node', 'git', 'curl', 'wget', 'set', 'read', 'test'],
    constants: ['true', 'false', 'HOME', 'PATH', 'PWD', 'USER', 'SHELL']
  }),
  shell: lang('Shell', { mode: 'shell', lineComment: '#', blockComment: null, strings: ['"', "'"], keywords: ['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'in', 'return', 'exit'], builtins: ['echo', 'printf', 'cd', 'grep', 'sed', 'awk', 'mkdir', 'rm', 'cp', 'mv'], constants: ['true', 'false'] }),
  php: lang('PHP', {
    mode: 'php', lineComment: '//', blockComment: ['/*', '*/'], strings: ['"', "'"],
    keywords: ['if', 'else', 'elseif', 'for', 'foreach', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'function', 'class', 'interface', 'trait', 'extends', 'implements', 'public', 'private', 'protected', 'static', 'abstract', 'final', 'new', 'echo', 'print', 'include', 'require', 'namespace', 'use', 'try', 'catch', 'finally', 'throw', 'as', 'global', 'const', 'yield'],
    types: ['int', 'string', 'bool', 'float', 'array', 'object', 'void', 'mixed', 'null'],
    builtins: ['strlen', 'array_map', 'array_filter', 'count', 'isset', 'empty', 'json_encode', 'json_decode'],
    constants: ['true', 'false', 'null', 'PHP_EOL', '__DIR__', '__FILE__'],
    identifierPrefix: '$'
  }),
  sql: lang('SQL', {
    mode: 'sql', lineComment: '--', blockComment: ['/*', '*/'], strings: ["'"],
    keywords: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'ADD', 'COLUMN', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'BETWEEN', 'DISTINCT', 'UNION', 'ALL', 'WITH', 'RETURNING', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'INDEX', 'VIEW', 'TRIGGER', 'BEGIN', 'COMMIT', 'ROLLBACK'],
    types: ['INT', 'INTEGER', 'VARCHAR', 'TEXT', 'BOOLEAN', 'BOOL', 'DATE', 'TIMESTAMP', 'DECIMAL', 'FLOAT', 'DOUBLE', 'BLOB', 'JSON', 'UUID'],
    builtins: ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NOW', 'LOWER', 'UPPER', 'LENGTH'],
    constants: ['true', 'false', 'null'],
    caseInsensitive: true
  }),
  java: lang('Java', {
    keywords: ['public', 'private', 'protected', 'class', 'interface', 'extends', 'implements', 'static', 'final', 'abstract', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'new', 'import', 'package', 'try', 'catch', 'finally', 'throw', 'throws', 'this', 'super', 'void', 'synchronized', 'volatile', 'transient', 'instanceof', 'var', 'record', 'sealed', 'enum', 'assert'],
    types: ['int', 'long', 'short', 'byte', 'char', 'float', 'double', 'boolean', 'String', 'Object', 'Integer', 'Long', 'List', 'Map', 'Set'],
    builtins: ['System', 'out', 'println', 'Math', 'String', 'Integer'],
    constants: ['true', 'false', 'null']
  }),
  kotlin: lang('Kotlin', {
    keywords: ['fun', 'val', 'var', 'class', 'object', 'interface', 'data', 'sealed', 'enum', 'when', 'if', 'else', 'for', 'while', 'do', 'return', 'break', 'continue', 'import', 'package', 'override', 'open', 'private', 'public', 'protected', 'internal', 'abstract', 'final', 'companion', 'constructor', 'init', 'by', 'lazy', 'is', 'in', 'as', 'try', 'catch', 'finally', 'throw', 'suspend', 'inline', 'reified'],
    types: ['Int', 'Long', 'Short', 'Byte', 'Char', 'Float', 'Double', 'Boolean', 'String', 'Unit', 'Any', 'List', 'MutableList', 'Map', 'Set', 'Pair', 'Triple'],
    builtins: ['println', 'print', 'listOf', 'mapOf', 'setOf', 'mutableListOf', 'require', 'check'],
    constants: ['true', 'false', 'null']
  }),
  lua: lang('Lua', {
    keywords: ['if', 'then', 'else', 'elseif', 'end', 'for', 'while', 'do', 'repeat', 'until', 'function', 'local', 'return', 'break', 'goto', 'in', 'and', 'or', 'not', 'nil', 'true', 'false'],
    types: [], builtins: ['print', 'pairs', 'ipairs', 'tonumber', 'tostring', 'type', 'table', 'string', 'math', 'io', 'os', 'require'],
    constants: ['true', 'false', 'nil'],
    lineComment: '--', blockComment: ['--[[', ']]'], strings: ['"', "'"]
  })
};

LANGUAGES.shell = LANGUAGES.bash;

export const EXT_TO_LANG = {
  go: 'go', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
  py: 'python', pyw: 'python', pyi: 'python', rs: 'rust',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
  html: 'html', htm: 'html', xhtml: 'html', xml: 'xml', svg: 'xml',
  css: 'css', scss: 'scss', sass: 'scss',
  json: 'json', jsonc: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  md: 'markdown', markdown: 'markdown',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'shell', ksh: 'shell',
  php: 'php', phtml: 'php', sql: 'sql',
  java: 'java', kt: 'kotlin', kts: 'kotlin', lua: 'lua'
};

export const LANG_ALIASES = {
  js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', py: 'python',
  go: 'go', golang: 'go', rs: 'rust', rust: 'rust', c: 'c', 'cpp': 'cpp', 'c++': 'cpp',
  html: 'html', css: 'css', scss: 'scss', json: 'json', yaml: 'yaml', yml: 'yaml',
  toml: 'toml', md: 'markdown', markdown: 'markdown', bash: 'bash', sh: 'bash', shell: 'bash',
  php: 'php', sql: 'sql', java: 'java', kotlin: 'kotlin', kt: 'kotlin', lua: 'lua', xml: 'xml'
};

export function detectLanguage(filename) {
  if (!filename) return null;
  const base = String(filename).split(/[\\/]/).pop();
  const lower = base.toLowerCase();
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'bash';
  if (lower === 'makefile' || lower === 'gnumakefile') return 'bash';
  const dot = lower.lastIndexOf('.');
  if (dot === -1) return null;
  const ext = lower.slice(dot + 1);
  return EXT_TO_LANG[ext] || null;
}

export function resolveLanguage(value) {
  if (!value) return null;
  const v = String(value).toLowerCase();
  if (LANGUAGES[v]) return v;
  if (LANG_ALIASES[v]) return LANG_ALIASES[v];
  return null;
}

export function languageName(id) {
  return LANGUAGES[id]?.name || (id ? String(id) : 'Plain Text');
}

export function listLanguages() {
  return Object.keys(LANGUAGES).sort().map(id => ({ id, name: LANGUAGES[id].name }));
}
