#!/usr/bin/env python3
"""One command from nothing to a live workshop: a QR code in the terminal, and
/workshop drawing the network as the votes come in.

    ./new_workshop.py                          asks for anything not given
    ./new_workshop.py --name "Networks retreat" --date 2026-09-20 --code NETS26
    ./new_workshop.py --keep                   same workshop: redeploy, keep votes
    ./new_workshop.py --show                   just reprint the QR code and links

What it does, in order (workshop-voting-setup.md, Parts 1-5):

  1. checks for wrangler, a Cloudflare login and qrencode, installing what it can
  2. finds the D1 database named in wrangler.toml (creating it if needed) and
     applies schema.sql
  3. WIPES the previous workshop's votes, names and topics. It asks first when
     there is anything to lose; --keep skips this step, --yes skips the question
  4. deploys the Worker and sets JOIN_CODE and ADMIN_TOKEN
  5. seeds roster.txt and categories.txt through seed.py
  6. checks the API accepts the new room code
  7. points content/site.md at the Worker, resets content/workshop.json to {}
     (while it holds data, /workshop shows that instead of the live votes),
     builds, and commits + pushes those two files if anything changed
  8. prints a QR code for /vote#code=... and opens /workshop#code=...

The room code travels in the URL fragment: store.js reads it, keeps it, and
strips it from the address bar, so attendees never type it and the projector
browser needs no setup. A fragment is never sent to any server.

The codes and the API URL are saved to .session.json next to this file
(gitignored, readable only by you) so --show can bring them back.
"""

import argparse
import datetime
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
TOML = os.path.join(HERE, 'wrangler.toml')
SITE_MD = os.path.join(REPO, 'content', 'site.md')
WORKSHOP_JSON = os.path.join(REPO, 'content', 'workshop.json')
SESSION = os.path.join(HERE, '.session.json')
QR_PNG = os.path.join(HERE, 'workshop-qr.png')
BRANCH = 'gh-pages'
DEFAULT_SITE = 'https://onkar.sadekar.net'

# Easy to read aloud and to type: no 0/O or 1/I/L.
CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
# `setting` goes too, so a frozen state or an old current-talk banner does not
# survive into the new workshop; schema.sql puts the defaults back.
WIPE_SQL = 'DELETE FROM vote; DELETE FROM attendee; DELETE FROM category; DELETE FROM setting;'


# ------------------------------------------------------------------ output --

def step(msg):
    text = '==> ' + msg
    print('\n' + ('\033[1m%s\033[0m' % text if sys.stdout.isatty() else text), flush=True)


def info(msg):
    print('    ' + msg, flush=True)


def die(msg):
    sys.exit('\nerror: ' + msg)


# ---------------------------------------------------------------- commands --

def run(cmd, cwd=HERE, stdin_text=None, check=True, live=False, merge=True):
    """Run a command and return its output.

    live=True hands over the terminal (logins, installs, git's credential
    prompt). Otherwise output is captured and stdin is fed or closed, which
    also keeps wrangler non-interactive: it never sits on a confirmation
    prompt that nobody can see."""
    if live:
        code = subprocess.call(cmd, cwd=cwd)
        if check and code:
            die('`%s` failed (exit %d)' % (' '.join(cmd), code))
        return ''
    feed = {'input': stdin_text} if stdin_text is not None else {'stdin': subprocess.DEVNULL}
    r = subprocess.run(cmd, cwd=cwd, universal_newlines=True, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT if merge else subprocess.PIPE, **feed)
    if check and r.returncode:
        sys.stderr.write(r.stdout + (r.stderr or ''))
        die('`%s` failed (exit %d)' % (' '.join(cmd), r.returncode))
    return r.stdout


def run_natively():
    """On Apple silicon an Intel-only Python (conda's, say) runs under Rosetta,
    and so does everything it starts: Apple's git then asks libxcrun for an
    x86_64 half the Command Line Tools no longer ship, and dies. So re-run once
    on the system Python, natively, before anything else happens. The system
    Python also has markdown and pyyaml, which build.py needs."""
    if sys.platform != 'darwin' or os.environ.get('NEW_WORKSHOP_NATIVE'):
        return
    try:
        translated = subprocess.run(['/usr/sbin/sysctl', '-n', 'sysctl.proc_translated'],
                                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                    universal_newlines=True).stdout.strip() == '1'
    except OSError:
        return
    if translated:
        os.environ['NEW_WORKSHOP_NATIVE'] = '1'     # never loop
        os.execv('/usr/bin/arch', ['/usr/bin/arch', '-arm64', '/usr/bin/python3',
                                   os.path.abspath(__file__)] + sys.argv[1:])


def wrangler_json(args):
    out = run(['wrangler'] + args, merge=False)
    starts = [i for i in (out.find('['), out.find('{')) if i >= 0]
    if not starts:
        die('expected JSON from `wrangler %s`, got:\n%s' % (' '.join(args), out))
    return json.JSONDecoder().raw_decode(out[min(starts):])[0]


def d1(db, sql=None, path=None):
    args = ['d1', 'execute', db, '--remote', '--json']
    args += ['--file=' + path] if path else ['--command', sql]
    return wrangler_json(args)


def git(*args, **kw):
    return run(['git'] + list(args), cwd=REPO, **kw)


def http(url, headers=None):
    h = {'user-agent': 'new_workshop.py'}
    h.update(headers or {})
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=20) as res:
        return res.read().decode('utf-8', 'replace')


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def write(path, text):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)


# ------------------------------------------------------------------ inputs --

def ask(label, default, check):
    """Prompt until `check` passes (it returns None). Enter keeps the default."""
    while True:
        if sys.stdin.isatty():
            hint = ' [%s]' % default if default else ''
            value = input('    %s%s: ' % (label, hint)).strip() or default
        else:
            value = default
        problem = check(value)
        if problem is None:
            return value
        if not sys.stdin.isatty():
            die('%s: %s (pass it as a flag when not running interactively)' % (label, problem))
        print('      ' + problem)


def given_or_ask(flag, label, default, check):
    if flag is None:
        return ask(label, default, check)
    problem = check(flag)
    if problem:
        die('%s: %s' % (label, problem))
    return flag


def confirm(question):
    if not sys.stdin.isatty():
        return False
    return input('    %s [y/N]: ' % question).strip().lower() in ('y', 'yes')


def check_name(s):
    return None if s.strip() else 'give the workshop a name'


def check_date(s):
    try:
        datetime.date.fromisoformat(s)
        return None
    except ValueError:
        return 'use YYYY-MM-DD'


def check_code(s):
    return None if re.fullmatch(r'[A-Za-z0-9_-]{4,32}', s) else '4-32 letters, digits, - or _'


def check_token(s):
    return None if re.fullmatch(r'[A-Za-z0-9_-]{16,128}', s) else 'at least 16 letters, digits, - or _'


def entries(path):
    with open(path, encoding='utf-8') as f:
        return sum(1 for line in f if line.strip() and not line.strip().startswith('#'))


def list_file(path, label):
    """The roster and the topics are both optional: people can add their own
    name and new topics from /vote. Returns the path, or None if absent."""
    if os.path.exists(path):
        info('%s: %s (%d)' % (label, os.path.relpath(path), entries(path)))
        return path
    info('%s: %s not found, starting with none (people can add them from /vote)'
         % (label, os.path.relpath(path)))
    return None


def load_session():
    try:
        with open(SESSION, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_session(sess):
    fd = os.open(SESSION, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(sess, f, indent=2)
        f.write('\n')
    os.chmod(SESSION, 0o600)


def site_url():
    try:
        m = re.search(r'^base_url:\s*["\']?(https?://[^"\'\s]+)', read(SITE_MD), re.M)
    except OSError:
        m = None
    return (m.group(1) if m else DEFAULT_SITE).rstrip('/')


# ------------------------------------------------------------------- steps --

def preflight():
    step('Checking tools')
    if not shutil.which('wrangler'):
        if not shutil.which('npm'):
            if not shutil.which('brew'):
                die('Node.js is not installed. Get it from https://nodejs.org and re-run.')
            info('Installing Node.js...')
            run(['brew', 'install', 'node'], live=True)
        info('Installing wrangler...')
        run(['npm', 'install', '-g', 'wrangler'], live=True)
    info('wrangler ' + run(['wrangler', '--version']).strip().splitlines()[-1].strip())

    who = run(['wrangler', 'whoami'], check=False)
    if 'You are logged in' not in who:
        info('Not logged in to Cloudflare; opening the browser to authorise wrangler.')
        run(['wrangler', 'login'], live=True)
        who = run(['wrangler', 'whoami'], check=False)
        if 'You are logged in' not in who:
            die('still not logged in to Cloudflare. Run `wrangler login`, then re-run this.')
    m = re.search(r'with the email (\S+?)\.?\s*$', who, re.M)
    info('Cloudflare: ' + (m.group(1) if m else 'logged in'))

    if not shutil.which('qrencode') and shutil.which('brew'):
        info('Installing qrencode (it draws the QR code)...')
        run(['brew', 'install', 'qrencode'], live=True, check=False)
    if not shutil.which('qrencode'):
        info('No qrencode: the vote link is printed without a QR code.')


def check_git():
    """Before anything changes: the push at the end must be able to succeed."""
    step('Checking the site repo')
    try:
        import markdown, yaml  # noqa: F401  build.py needs both
    except ImportError:
        die('build.py needs markdown and pyyaml, and %s is missing one. Run:\n'
            '    %s -m pip install --user markdown pyyaml' % (sys.executable, sys.executable))
    branch = git('branch', '--show-current').strip()
    if branch != BRANCH:
        die('the site repo is on %r, not %s. Switch branch, or pass --no-publish.' % (branch, BRANCH))
    git('fetch', '--quiet', 'origin', BRANCH)
    behind = int(git('rev-list', '--count', 'HEAD..origin/' + BRANCH).strip() or 0)
    if behind:
        die('%s is %d commit(s) behind origin. Run `git pull` in %s, then re-run.'
            % (BRANCH, behind, REPO))
    info('on %s, up to date with origin' % BRANCH)


def toml_value(text, key):
    m = re.search(r'^\s*%s\s*=\s*"([^"]*)"' % re.escape(key), text, re.M)
    return m.group(1) if m else ''


def toml_set(text, key, value):
    return re.sub(r'^(\s*%s\s*=\s*)"[^"]*"' % re.escape(key),
                  lambda m: m.group(1) + '"%s"' % value, text, count=1, flags=re.M)


def ensure_database():
    step('Database')
    text = read(TOML)
    name = toml_value(text, 'database_name') or 'workshop'
    uuid = toml_value(text, 'database_id')
    by_id = {d['uuid']: d['name'] for d in wrangler_json(['d1', 'list', '--json'])}

    if uuid in by_id:
        name = by_id[uuid]              # the id is what the Worker binds to
    else:
        same_name = [u for u, n in by_id.items() if n == name]
        if same_name:
            uuid = same_name[0]
        else:
            info('Creating D1 database "%s"...' % name)
            run(['wrangler', 'd1', 'create', name])
            by_name = {d['name']: d['uuid'] for d in wrangler_json(['d1', 'list', '--json'])}
            if name not in by_name:
                die('`wrangler d1 create %s` did not leave a database behind' % name)
            uuid = by_name[name]

    new = toml_set(toml_set(text, 'database_name', name), 'database_id', uuid)
    if new != text:
        write(TOML, new)
        info('wrangler.toml updated')
    info('"%s" (%s)' % (name, uuid))
    d1(name, path='schema.sql')
    return name


def reset_data(db, keep, yes):
    rows = d1(db, sql="SELECT (SELECT COUNT(*) FROM attendee) AS people, "
                      "(SELECT COUNT(*) FROM category) AS topics, "
                      "(SELECT COUNT(*) FROM vote) AS votes, "
                      "(SELECT value FROM setting WHERE key = 'workshop_name') AS name")
    held = rows[0]['results'][0]
    summary = '%(people)d names, %(topics)d topics, %(votes)d votes' % held
    if keep:
        info('Keeping what is there (%s).' % summary)
        return
    if held['people'] or held['topics'] or held['votes']:
        info('Still holds "%s": %s.' % (held['name'] or 'unnamed', summary))
        if not yes and not confirm('Delete all of it and start fresh?'):
            die('stopped; nothing was deleted. Pass --keep to carry on with the same '
                'workshop, or --yes to wipe without asking.')
    d1(db, sql=WIPE_SQL)
    d1(db, path='schema.sql')
    info('Previous workshop data cleared.')


def deploy(code, admin):
    step('Deploying the Worker')
    out = run(['wrangler', 'deploy'])
    urls = re.findall(r'https://[\w.-]+\.workers\.dev', out)
    if not urls:
        sys.stderr.write(out)
        die('deployed, but there is no workers.dev URL in the output above')
    info(urls[0])
    # Both in one request, so the Worker is redeployed once, not twice. The
    # values go over stdin and never appear in a process listing.
    run(['wrangler', 'secret', 'bulk'],
        stdin_text=json.dumps({'JOIN_CODE': code, 'ADMIN_TOKEN': admin}))
    info('JOIN_CODE and ADMIN_TOKEN set')
    return urls[0]


def seed(db, roster, cats, name, date):
    step('Seeding names and topics')
    with tempfile.TemporaryDirectory() as tmp:
        none = os.path.join(tmp, 'none.txt')
        write(none, '')
        r = subprocess.run([sys.executable, 'seed.py', roster or none, cats or none, name, date],
                           cwd=HERE, universal_newlines=True,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if r.returncode:
        die('seed.py: ' + (r.stderr or r.stdout).strip())
    write(os.path.join(HERE, 'seed.sql'), r.stdout)
    d1(db, path='seed.sql')
    info(r.stderr.strip().lstrip('- '))


def verify(api, code):
    step('Checking the API')
    last = ''
    for _ in range(12):             # a new secret can take a few seconds to land
        try:
            data = json.loads(http(api + '/bootstrap', {'x-join': code}))
            info('answers the room code: %d names, %d topics, voting %s'
                 % (data['rosterSize'], len(data['categories']), data['state']))
            return
        except urllib.error.HTTPError as e:
            last = 'HTTP %d' % e.code
        except (urllib.error.URLError, OSError, ValueError, KeyError) as e:
            last = str(e)
        time.sleep(5)
    die('%s/bootstrap still refuses the new room code (%s)' % (api, last))


def publish(api, name):
    """Returns True if something was pushed."""
    step('Pointing the site at the API')
    text = read(SITE_MD)
    new, n = re.subn(r'^(workshop:[ \t]*\n[ \t]+api:[ \t]*)"[^"]*"',
                     lambda m: m.group(1) + '"%s"' % api, text, count=1, flags=re.M)
    if not n:
        die('could not find the `workshop:` / `api:` block in content/site.md')
    if new != text:
        write(SITE_MD, new)
        info('content/site.md: api -> %s' % api)
    else:
        info('content/site.md already points at the API')

    if not os.path.exists(WORKSHOP_JSON) or read(WORKSHOP_JSON).strip() != '{}':
        write(WORKSHOP_JSON, '{}\n')
        info('content/workshop.json reset to {} so /workshop shows the live votes')

    run([sys.executable, 'build.py'], cwd=REPO)
    info('build.py OK')

    paths = ['content/site.md', 'content/workshop.json']
    if git('status', '--porcelain', '--', *paths).strip():
        git('add', '--', *paths)
        git('commit', '--quiet', '-m', 'Workshop voting: %s' % name, '--', *paths)
        info('committed ' + ' and '.join(paths))

    ahead = git('log', '--oneline', 'origin/%s..HEAD' % BRANCH).strip()
    if not ahead:
        info('nothing new to push')
        return False
    info('pushing to origin/%s:' % BRANCH)
    for line in ahead.splitlines():
        info('  ' + line)
    git('push', '--quiet', 'origin', BRANCH, live=True)
    return True


def wait_live(site, api, pushed):
    step('Waiting for GitHub Pages (usually 1-2 minutes)' if pushed else 'Checking the live site')
    deadline = time.time() + (600 if pushed else 0)
    seen = ''
    while True:
        try:
            # A fresh query string gets past the Pages CDN cache.
            html = http('%s/workshop.html?t=%d' % (site, time.time()))
            m = re.search(r'name="workshop-api" content="([^"]*)"', html)
            seen = m.group(1) if m else ''
        except (urllib.error.URLError, OSError):
            pass
        if seen == api:
            info('%s/workshop points at the API' % site)
            break
        if time.time() >= deadline:
            info('WARNING: the live site points at %r, not %s. Check the Actions tab on '
                 'GitHub, and that content/site.md is pushed.' % (seen, api))
            break
        time.sleep(10)

    try:
        if 'adoptCode' not in http('%s/assets/js/store.js?t=%d' % (site, time.time())):
            info('WARNING: the live store.js does not read #code= links yet, so people '
                 'will have to type the room code until assets/js/store.js is pushed.')
    except (urllib.error.URLError, OSError):
        pass


def show(sess, open_browser):
    site, code = sess['site'], sess['code']
    frag = '#code=' + urllib.parse.quote(code, safe='')
    vote, live = site + '/vote' + frag, site + '/workshop' + frag

    step('%s, %s' % (sess['name'], sess['date']))
    if shutil.which('qrencode'):
        print()
        subprocess.call(['qrencode', '-t', 'ansiutf8', '-m', '2', vote])
        subprocess.call(['qrencode', '-o', QR_PNG, '-s', '12', '-m', '2', vote])
    for label, value in [('Vote (the QR code)', vote),
                         ('Live network', live),
                         ('Admin', site + '/wsadmin'),
                         ('Room code', code),
                         ('Admin token', sess['admin_token']),
                         ('API', sess['api'])]:
        print('    %-19s %s' % (label, value))
    if os.path.exists(QR_PNG):
        info('QR image for a slide: %s' % os.path.relpath(QR_PNG))
    print()
    if open_browser and shutil.which('open'):
        subprocess.call(['open', live])
        info('Opened the live network in your browser.')


# -------------------------------------------------------------------- main --

def main():
    run_natively()
    p = argparse.ArgumentParser(description=__doc__.split('\n\n')[0],
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--name', help='workshop name (shown on the published page)')
    p.add_argument('--date', help='YYYY-MM-DD (default: today)')
    p.add_argument('--code', help='room code attendees join with (default: random)')
    p.add_argument('--admin-token', help='token for /wsadmin (default: random)')
    p.add_argument('--roster', default=os.path.join(HERE, 'roster.txt'),
                   help='one attendee per line (default: roster.txt)')
    p.add_argument('--categories', default=os.path.join(HERE, 'categories.txt'),
                   help='one starting topic per line (default: categories.txt)')
    p.add_argument('--keep', action='store_true',
                   help='same workshop: do not wipe, and offer the saved codes as defaults')
    p.add_argument('-y', '--yes', action='store_true', help='wipe the old data without asking')
    p.add_argument('--no-publish', action='store_true',
                   help='do not touch content/, commit or push')
    p.add_argument('--no-open', action='store_true', help='do not open /workshop in the browser')
    p.add_argument('--show', action='store_true',
                   help='only reprint the QR code and links from the last run')
    args = p.parse_args()

    if args.show:
        sess = load_session()
        if not sess:
            die('nothing saved yet; run without --show first')
        show(sess, not args.no_open)
        return

    preflight()
    if not args.no_publish:
        check_git()

    prev = load_session() if args.keep else {}
    step('Workshop details (Enter keeps the value in brackets)')
    name = given_or_ask(args.name, 'Workshop name', prev.get('name', ''), check_name)
    date = given_or_ask(args.date, 'Date', prev.get('date', datetime.date.today().isoformat()),
                        check_date)
    code = given_or_ask(args.code, 'Room code (public, shown on the slide)',
                        prev.get('code', ''.join(secrets.choice(CODE_ALPHABET) for _ in range(6))),
                        check_code)
    admin = given_or_ask(args.admin_token, 'Admin token (private, for /wsadmin)',
                         prev.get('admin_token', secrets.token_hex(24)), check_token)
    roster = list_file(os.path.abspath(args.roster), 'Names')
    cats = list_file(os.path.abspath(args.categories), 'Topics')

    db = ensure_database()
    reset_data(db, args.keep, args.yes)
    api = deploy(code, admin)
    sess = {'name': name, 'date': date, 'code': code, 'admin_token': admin, 'api': api,
            'site': site_url(), 'database': db,
            'updated': datetime.datetime.now().isoformat(timespec='seconds')}
    save_session(sess)                  # from here on, --show can recover the codes
    seed(db, roster, cats, name, date)
    verify(api, code)

    if not args.no_publish:
        wait_live(sess['site'], api, publish(api, name))

    show(sess, not args.no_open)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        sys.exit('\ninterrupted')
