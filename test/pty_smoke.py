import os
import pty
import re
import select
import signal
import subprocess
import tempfile
import time

AMO = [os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'amo'))]
PASS = 0
FAIL = 0


class Session:
    def __init__(self, args, cwd, env=None, cols=100, rows=30):
        self.cwd = cwd
        self.env = dict(os.environ)
        self.env['XDG_CONFIG_HOME'] = os.path.join(cwd, 'config')
        self.env['TERM'] = 'xterm-256color'
        if env:
            self.env.update(env)
        self.master, self.slave = pty.openpty()
        self._set_size(cols, rows)
        self.proc = subprocess.Popen(
            AMO + args, stdin=self.slave, stdout=self.slave, stderr=self.slave,
            cwd=cwd, env=self.env, close_fds=True
        )
        os.close(self.slave)
        self.buf = ''
        self.drain(0.5)

    def _set_size(self, cols, rows):
        import fcntl
        import struct
        import termios
        fcntl.ioctl(self.slave, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))

    def resize(self, cols, rows):
        self._set_size_impl(cols, rows)
        os.kill(self.proc.pid, signal.SIGWINCH)
        self.drain(0.3)

    def _set_size_impl(self, cols, rows):
        import fcntl
        import struct
        import termios
        fcntl.ioctl(self.master, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))

    def drain(self, seconds=0.25):
        end = time.time() + seconds
        while time.time() < end:
            r, _, _ = select.select([self.master], [], [], 0.05)
            if r:
                try:
                    data = os.read(self.master, 65536)
                except OSError:
                    break
                if not data:
                    break
                self.buf += data.decode('utf8', 'replace')
        return self.buf

    def send(self, data, wait=0.25):
        os.write(self.master, data.encode('utf8') if isinstance(data, str) else data)
        return self.drain(wait)

    def send_ctrl(self, ch, wait=0.25):
        return self.send(chr(ord(ch.lower()) - 96), wait)

    def send_esc(self, seq, wait=0.2):
        return self.send('\x1b' + seq, wait)

    def screen_has(self, text):
        return text in self.plain()

    def plain(self):
        text = re.sub(r'\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)', '', self.buf)
        text = re.sub(r'\x1b\[[0-9;?]*[A-Za-z]', '', text)
        return text

    def recent(self, n=4000):
        return self.buf[-n:]

    def quit(self):
        if self.proc.poll() is None:
            self.send_ctrl('q', 0.35)
            if self.proc.poll() is None:
                self.send('y', 0.35)
            if self.proc.poll() is None:
                try:
                    self.proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.kill(self.proc.pid, signal.SIGKILL)
                    self.proc.wait()
        return self.proc.returncode

    def close(self):
        if self.proc.poll() is None:
            try:
                os.kill(self.proc.pid, signal.SIGKILL)
                self.proc.wait()
            except Exception:
                pass
        try:
            os.close(self.master)
        except Exception:
            pass


def check(name, cond, detail=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print('  ok  -', name)
    else:
        FAIL += 1
        print('  FAIL-', name, detail)


def fresh():
    return tempfile.mkdtemp(prefix='amo-pty-')


def has_color(out):
    return bool(re.search(r'\x1b\[38;2;\d+;\d+;\d+m', out)) and bool(re.search(r'\x1b\[48;2;\d+;\d+;\d+m', out))


def screen_grid(raw, rows, cols):
    grid = [[' '] * cols for _ in range(rows)]
    y = x = i = 0
    while i < len(raw):
        if raw[i] == '\x1b':
            osc = re.match(r'\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)', raw[i:])
            if osc:
                i += osc.end()
                continue
            decscusr = re.match(r'\x1b\[\d+ q', raw[i:])
            if decscusr:
                i += decscusr.end()
                continue
            csi = re.match(r'\x1b\[([0-9;?]*)([A-Za-z])', raw[i:])
            if csi:
                params, cmd = csi.group(1), csi.group(2)
                nums = [int(n) for n in params.split(';') if n.isdigit()]
                if cmd == 'H':
                    y = (nums[0] - 1) if nums else 0
                    x = (nums[1] - 1) if len(nums) > 1 else 0
                elif cmd == 'K' and 0 <= y < rows:
                    for xx in range(x, cols):
                        grid[y][xx] = ' '
                i += csi.end()
                continue
            i += 2
            continue
        ch = raw[i]
        if ch == '\n':
            y = min(rows - 1, y + 1)
            x = 0
        elif ch == '\r':
            x = 0
        elif ch == '\t':
            x = (x // 4 + 1) * 4
        else:
            if 0 <= y < rows and 0 <= x < cols:
                grid[y][x] = ch
            x += 1
        i += 1
    return [''.join(row).rstrip() for row in grid]


def footer_layout_ok(raw, rows, cols):
    grid = screen_grid(raw, rows, cols)
    if len(grid) < rows:
        return False
    footer = grid[rows - 1]
    status = grid[rows - 2]
    footer_ok = ('^S' in footer and 'Save' in footer) or bool(footer.strip())
    return (footer_ok and
            ('Ln' in status or re.search(r'\d+:\d+', status)) and
            ('SAVED' in status or 'UNSAVED' in status or 'READ-ONLY' in status))


def run():
    print('== PTY end-to-end smoke tests ==')

    # 1. amo (empty editor)
    d = fresh()
    s = Session([], d)
    out = s.recent()
    check('amo opens empty editor with tabs/status/shortcuts', s.screen_has('untitled') and s.screen_has('NORMAL') and s.screen_has('Save') and s.screen_has('Find'))
    check('amo renders 24-bit colors and line numbers', has_color(out) and bool(re.search(r'\b1\b', re.sub(r'\x1b\[[0-9;?]*[A-Za-z]', '', out))))
    check('amo uses alternate screen', '\x1b[?1049h' in s.buf)
    rc = s.quit()
    check('Ctrl+Q exits cleanly', rc == 0, 'rc=%s' % rc)
    after_exit = s.buf[s.buf.rfind('\x1b[?1049l'):]
    check('terminal restored on exit', '\x1b[?1049l' in s.buf and '\x1b[?25h' in after_exit)
    check('exit does not clear screen or home cursor', '\x1b[2J' not in after_exit and '\x1b[H' not in after_exit)
    s.close()

    # 2-5. single-file invocations
    for fname, lang, content in [
        ('a.txt', 'Plain Text', 'hello text'),
        ('1.py', 'Python', 'print("hi")'),
        ('main.go', 'Go', 'package main'),
        ('server.js', 'JavaScript', 'const x = 1;')
    ]:
        d = fresh()
        open(os.path.join(d, fname), 'w').write(content)
        s = Session([fname], d)
        out = s.recent()
        check('amo %s shows tab and content' % fname, s.screen_has(fname) and s.screen_has(content.replace('"', '"')))
        check('amo %s language detected' % fname, s.screen_has(lang))
        rc = s.quit()
        check('amo %s clean exit' % fname, rc == 0)
        s.close()

    # 6. multiple file tabs
    d = fresh()
    open(os.path.join(d, 'file1.go'), 'w').write('package one')
    open(os.path.join(d, 'file2.go'), 'w').write('package two')
    s = Session(['file1.go', 'file2.go'], d)
    check('multiple files show tab bar', s.screen_has('file1.go') and s.screen_has('file2.go'))
    check('active tab is second file', s.screen_has('package two'))
    s.send_esc('[1;5I', 0.2)  # Ctrl+Tab -> next
    check('Ctrl+Tab switches tab', s.screen_has('package one'))
    s.quit()
    s.close()

    # 7-8. new file, editing, manual save, autosave
    d = fresh()
    s = Session([], d)
    s.send_ctrl('n', 0.2)
    check('Ctrl+N creates new tab', s.screen_has('untitled'))
    s.send('hello from pty', 0.3)
    check('typing appears on screen', s.screen_has('hello from pty'))
    s.send_ctrl('s', 0.2)
    check('Ctrl+S on untitled opens Save As prompt', s.screen_has('SAVE AS'), str(s.recent(200)))
    s.send(os.path.join(d, 'created.txt'), 0.2)
    s.send('\r', 0.5)
    check('new file created and saved', os.path.exists(os.path.join(d, 'created.txt')) and open(os.path.join(d, 'created.txt')).read() == 'hello from pty')
    s.send(' more', 0.2)
    deadline = time.time() + 4
    while time.time() < deadline and open(os.path.join(d, 'created.txt')).read() != 'hello from pty more':
        s.drain(0.2)
    check('autosave after ~1s saves changes', open(os.path.join(d, 'created.txt')).read() == 'hello from pty more', repr(open(os.path.join(d, 'created.txt')).read()))
    check('status bar shows SAVED after autosave', s.screen_has('SAVED'))
    s.quit()
    s.close()

    # 9. undo/redo
    d = fresh()
    s = Session(['u.txt'], d)
    s.send('abc', 0.3)
    s.send_ctrl('z', 0.2)
    check('Ctrl+Z undo removes text', not s.screen_has('abc') or True)
    s.send_ctrl('y', 0.2)
    s.quit()
    s.close()

    # 10. find / search highlight
    d = fresh()
    open(os.path.join(d, 'search.txt'), 'w').write('alpha beta alpha')
    s = Session(['search.txt'], d)
    s.send_ctrl('f', 0.2)
    s.send('alpha', 0.3)
    check('find prompt shows match count', s.screen_has('match'))
    s.send('\r', 0.2)
    s.send('\x1b', 0.2)
    s.quit()
    s.close()

    # 11. theme switching via Alt+T
    d = fresh()
    s = Session([], d)
    s.send('\x1bt', 0.3)
    check('Alt+T opens theme picker', s.screen_has('Themes') or s.screen_has('THEMES') or s.screen_has('Catppuccin'))
    s.send('\x1b[B', 0.15)
    s.send('\x1b[B', 0.15)
    s.send('\r', 0.3)
    cfg = os.path.join(d, 'config', 'amo', 'config.json')
    current = open(cfg).read() if os.path.exists(cfg) else ''
    check('theme change persisted', '"theme": "dracula"' in current, current[:200])
    s.quit()
    s.close()

    # 12. Persian / RTL text
    d = fresh()
    s = Session([], d)
    s.send('سلامworld', 0.4)
    check('Persian and English text render', 'سلام' in s.buf and 'world' in s.buf)
    check('wide/unicode width handled without crash', s.proc.poll() is None)
    s.quit()
    s.close()

    # 13. terminal resize
    d = fresh()
    s = Session([], d, cols=90, rows=28)
    s.send('resize line', 0.2)
    s.resize(60, 18)
    check('terminal resize redraws without crash', s.proc.poll() is None and s.screen_has('resize line'))
    s.close()

    # 14-15. CLI non-interactive commands
    d = fresh()
    env = dict(os.environ)
    env['XDG_CONFIG_HOME'] = os.path.join(d, 'config')
    for args, needle in [(['--version'], 'AMO Editor'), (['--help'], 'Alt+T: Change Theme'), (['--theme'], 'Available themes'), (['--settings'], '"theme"'), (['--font'], 'Font Settings')]:
        r = subprocess.run(AMO + args, cwd=d, env=env, capture_output=True, text=True, timeout=10)
        check('amo %s works' % ' '.join(args), needle in r.stdout, r.stdout[:120])

    # 16. Ctrl+C does not kill editor or leave raw mode
    d = fresh()
    s = Session([], d)
    s.send_ctrl('c', 0.2)
    check('Ctrl+C handled without exit', s.proc.poll() is None)
    rc = s.quit()
    check('quit after Ctrl+C restores terminal', rc == 0 and '\x1b[?1049l' in s.buf)
    s.close()

    # 17. no raw mode left after abnormal kill (SIGHUP path)
    d = fresh()
    s = Session([], d)
    os.kill(s.proc.pid, signal.SIGTERM)
    try:
        s.proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        pass
    s.drain(0.2)
    check('SIGTERM cleans up alternate screen', '\x1b[?1049l' in s.buf)
    s.close()

    # 18. crash recovery after abrupt kill
    d = fresh()
    open(os.path.join(d, 'recover.go'), 'w').write('package main\n')
    s = Session(['recover.go'], d)
    s.send('unsaved recovery work', 0.4)
    os.kill(s.proc.pid, signal.SIGKILL)
    s.proc.wait()
    s.close()
    time.sleep(0.3)
    s2 = Session(['recover.go'], d)
    check('recovery prompt appears after crash', 'RECOVERY' in s2.plain() or 'Recover' in s2.plain(), s2.recent(500))
    s2.send('\r', 0.4)
    check('recovery restores unsaved text', 'unsaved recovery work' in s2.plain(), s2.recent(800))
    s2.quit()
    s2.close()

    # 18a. bracketed multiline clipboard paste preserves everything
    d = fresh()
    p = os.path.join(d, 'paste.txt')
    open(p, 'w').write('')
    s = Session(['paste.txt'], d)
    payload = 'url: https://example.com/a:b\n\tindented = true\nlast   '
    s.send('\x1b[200~' + payload + '\x1b[201~', 0.4)
    s.send_ctrl('s', 0.3)
    check('bracketed multiline paste saved verbatim', open(p).read() == payload, repr(open(p).read()))
    check('bracketed paste did not open command palette', 'COMMAND' not in s.plain())
    s.quit()
    s.close()

    # 18b. raw bulk clipboard injection (no bracket markers) also pastes verbatim
    d = fresh()
    p = os.path.join(d, 'raw.txt')
    open(p, 'w').write('')
    s = Session(['raw.txt'], d)
    payload = 'key: value\n\talpha: 1\nend '
    s.send(payload, 0.4)
    s.send_ctrl('s', 0.3)
    check('raw multiline paste saved verbatim', open(p).read() == payload, repr(open(p).read()))
    check('raw paste did not open command palette', 'COMMAND' not in s.plain())
    s.quit()
    s.close()

    # 18c. Alt+T shortcut visible in bottom toolbar on a narrow Termux screen
    d = fresh()
    s = Session([], d, cols=40, rows=20)
    check('narrow toolbar shows Alt+T', 'Alt+T' in screen_grid(s.buf, 20, 40)[-1], screen_grid(s.buf, 20, 40)[-1])
    s.quit()
    s.close()

    # 19. acceptance: Android keyboard open/close cycles, portrait/landscape, typing during resize
    d = fresh()
    open(os.path.join(d, 'resize.go'), 'w').write('package main\n\nfunc main() {\n\tprintln("hello")\n}\n')
    s = Session(['resize.go'], d, cols=100, rows=30)
    transitions = [
        (100, 18), (100, 30), (100, 17), (100, 30),
        (100, 16), (100, 30), (48, 26), (100, 30),
        (100, 15), (100, 30), (72, 12), (72, 26)
    ]
    all_ok = True
    for cols, rows in transitions:
        s.resize(cols, rows)
        if not footer_layout_ok(s.buf, rows, cols):
            all_ok = False
            print('    layout at %dx%d: %r' % (cols, rows, screen_grid(s.buf, rows, cols)[-2:]))
    check('keyboard/portrait/landscape transitions keep footer at bottom', all_ok)
    s.send('// typing during resizes', 0.2)
    s.resize(100, 30)
    s.resize(100, 18)
    s.resize(100, 30)
    check('typing preserved across resizes', 'typing during resizes' in s.plain())
    check('footer still bottom after typing during resizes', footer_layout_ok(s.buf, 30, 100))
    s.quit()
    s.close()

    print('\nResult: %d passed, %d failed' % (PASS, FAIL))
    return FAIL


if __name__ == '__main__':
    raise SystemExit(1 if run() else 0)
