"""GAR lifecycle adapter for this Product's existing, isolated VirtualBox VM."""
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import uuid

import vm

ROOT = Path(__file__).resolve().parents[1]
REMOTE = '/home/gar/GarMyFriend-OrangePiZero2W'


def remote(script):
    return vm.ssh(script, capture=True)


def build():
    source = vm.archive()
    tag = uuid.uuid4().hex
    work = '/home/gar/.gar-myfriend-build/' + tag
    remote('mkdir -p ' + shlex.quote(work))
    vm.scp(source, work + '/source.tar.gz')
    remote(f'''set -eu
cd {shlex.quote(work)}
mkdir source
tar -xzf source.tar.gz -C source
cd source
mkdir -p build
make -B -C sources/gar-tools/targets/linux-device/runtime/gc9a01-stub CC=gcc BIN="$PWD/build/cuse_spi_gc9a01"
make -B -C sources/gar-tools/targets/linux-device/runtime/i2c-stub CC=gcc BIN="$PWD/build/cuse_i2c"
GAR_BUILD_SERVO=1 GAR_TOOLS_ROOT="$PWD/sources/gar-tools" GAR_BUILD_DIR="$PWD/build" CC=gcc CXX=g++ sh sources/gar-my-friend/tools/build-native.sh
python3 - <<'PY'
import hashlib, json
from pathlib import Path
root=Path('.')
checks={{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file()}}
Path('simulator-manifest.json').write_text(json.dumps(checks,sort_keys=True)+'\\n')
PY
tar -czf ../compiled.tar.gz .
''')
    output = ROOT / 'artifacts/from-codespace'
    (output / 'files').mkdir(parents=True, exist_ok=True)
    vm.run(['scp', '-i', vm.STATE / 'id_ed25519', '-P', '2231', '-o', 'BatchMode=yes',
            '-o', 'StrictHostKeyChecking=yes', '-o', f'UserKnownHostsFile={vm.STATE / "known_hosts"}',
            'gar@127.0.0.1:' + work + '/compiled.tar.gz', output / 'files/vm.tar.gz'])
    manifest = {'name': 'GarMyFriend-OrangePiZero2W simulation', 'target': 'linux-device',
                'entrypoint': 'simulation/server.cjs',
                'deploy': {'app': {'files': [{'src': 'files/vm.tar.gz', 'dest': 'vm.tar.gz'}]}}}
    (output / 'artifact.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print('Built native x86_64 application and CUSE drivers in VirtualBox; no services changed.')


def deploy():
    build_id = os.environ['GAR_SIM_BUILD_ID']
    if not re.fullmatch(r'[A-Za-z0-9_-]{10,100}', build_id):
        raise ValueError('Invalid GAR build ID')
    archive = Path(os.environ['GAR_SIM_BUNDLE']) / 'files/vm.tar.gz'
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    staging = '/home/gar/.gar-myfriend-releases/' + build_id
    private_profile = ROOT / '.gar/vm/private/live-broker.json'
    private_directory = '/home/gar/.config/garmyfriend'
    remote('install -d -m 0700 ' + shlex.quote(private_directory))
    if private_profile.is_file():
        vm.scp(private_profile, private_directory + '/live-broker.json')
        remote('chmod 0600 ' + shlex.quote(private_directory + '/live-broker.json'))
    remote('test -f ' + shlex.quote(private_directory + '/live-broker.json') +
           ' && test "$(stat -c %a ' + shlex.quote(private_directory + '/live-broker.json') + ')" = 600')
    remote('mkdir -p ' + shlex.quote(staging))
    vm.scp(archive, staging + '/vm.tar.gz')
    result = remote(f'''set -eu
cd {shlex.quote(staging)}
printf '%s  vm.tar.gz\\n' {shlex.quote(digest)} | sha256sum -c -
test ! -e app
mkdir app
tar -xzf vm.tar.gz -C app
cd app
python3 - <<'PY'
import hashlib,json
from pathlib import Path
for name,expected in json.loads(Path('simulator-manifest.json').read_text()).items():
    if hashlib.sha256(Path(name).read_bytes()).hexdigest()!=expected:raise SystemExit('Snapshot file mismatch: '+name)
PY
mkdir .gar
printf '%s\\n' {shlex.quote(build_id)} > .gar/build-id
printf 'GAR_BUILD_ID=%s\\n' {shlex.quote(build_id)} > .gar/build.env
sudo systemctl stop garmyfriend-panel.service garmyfriend.service garmyfriend-devices.service
if test -d {REMOTE}; then mv {REMOTE} {shlex.quote(staging + '/previous')}; fi
mv {shlex.quote(staging + '/app')} {REMOTE}
printf 'Snapshot placed; services are stopped. Run gar sim start.\\n'
''')
    print(result.strip())


def start():
    print(remote(f'''set -eu
cd {REMOTE}
test -f .gar/build-id
sudo install -m 0644 infra/virtualbox/garmyfriend.service infra/virtualbox/garmyfriend-panel.service infra/virtualbox/garmyfriend-devices.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start garmyfriend-devices.service
node simulation/prepare-effects.cjs
sudo systemctl start garmyfriend.service garmyfriend-panel.service
''').strip())
    vm.local_panel()


def diagnostic():
    output = remote(f'''set -eu
cd {REMOTE}
python3 - <<'PY'
import hashlib,json,subprocess,urllib.request
from pathlib import Path
expected=Path('.gar/build-id').read_text().strip()
checks=json.loads(Path('simulator-manifest.json').read_text())
verified=all(Path(name).is_file() and hashlib.sha256(Path(name).read_bytes()).hexdigest()==sha for name,sha in checks.items())
with urllib.request.urlopen('http://127.0.0.1:8773/health',timeout=5) as response:health=json.load(response)
panel_pid=int(subprocess.check_output(['systemctl','show','-p','MainPID','--value','garmyfriend-panel.service']).strip())
services={{name:subprocess.run(['systemctl','is-active','--quiet',name]).returncode==0 for name in ['garmyfriend.service','garmyfriend-panel.service','garmyfriend-devices.service']}}
ok=verified and all(services.values()) and health.get('ok') is True and health.get('buildId')==expected and health.get('appBuildId')==expected and health.get('pid')==panel_pid
print(json.dumps({{'ok':ok,'deployedBuildId':expected,'runningBuildId':health.get('buildId'),'snapshotVerified':verified,'services':services,'health':health}}))
PY
''')
    print(output.strip())


def main():
    action = sys.argv[1]
    if action == 'build': build()
    elif action == 'deploy': deploy()
    elif action == 'start': start()
    elif action in ('status', 'diag'): diagnostic()
    elif action == 'stop': print(remote('sudo systemctl stop garmyfriend-panel.service garmyfriend.service garmyfriend-devices.service').strip())
    elif action == 'log': print(remote('journalctl -u garmyfriend.service -u garmyfriend-panel.service -n 40 --no-pager').strip())
    else: raise ValueError('Unknown simulator lifecycle action')


if __name__ == '__main__':
    main()
