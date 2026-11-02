"""VM integration: the panel is replaceable and never decides an expression."""
import base64
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import time
import urllib.request

def get(url):
    with urllib.request.urlopen(url,timeout=4) as response:return json.load(response)
def post(url,value):
    request=urllib.request.Request(url,data=json.dumps(value).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=4) as response:return json.load(response)
def pixels():
    value=get('http://127.0.0.1:8080/api/state')['spi']['gc9a01']['pixels']
    return hashlib.sha256(base64.b64decode(value)).hexdigest()
def service(*args):
    return subprocess.check_output(['sudo','systemctl',*args],text=True).strip()
def changed(previous):
    for _ in range(40):
        if pixels()!=previous:return
        time.sleep(.1)
    raise AssertionError('Application did not produce a new SPI frame')

for name in ['spidev0.0','gpiochip0','i2c-10']:
    assert stat.S_ISCHR(Path('/dev',name).stat().st_mode)
assert not Path('/dev/i2c-1').exists(),'Unused actuator device is still running'
pid=int(service('show','garmyfriend','-p','MainPID','--value'))
assert pid>1 and b'scripts/run-face.cjs' in Path(f'/proc/{pid}/cmdline').read_bytes()
os.kill(pid,signal.SIGSTOP)
try:
    time.sleep(.3)
    before=pixels()
    counter=get('http://127.0.0.1:8080/api/state')['gpio']['rotary']['counter']
    post('http://127.0.0.1:8773/api/rotary',{'action':'rotate','direction':1})
    time.sleep(.3)
    assert get('http://127.0.0.1:8080/api/state')['gpio']['rotary']['counter']==counter+1
    assert pixels()==before,'The panel or bridge rendered a face while the app was suspended'
finally:
    os.kill(pid,signal.SIGCONT)
changed(before)

# Stop the panel entirely: the application still receives GPIO and writes SPI.
service('stop','garmyfriend-panel')
try:
    assert service('is-active','garmyfriend')=='active'
    assert int(service('show','garmyfriend','-p','MainPID','--value'))==pid
    time.sleep(.6);before=pixels()
    post('http://127.0.0.1:8080/api/rotary/rotate',{'direction':-1})
    changed(before)
finally:
    service('start','garmyfriend-panel')
for _ in range(40):
    try:
        if get('http://127.0.0.1:8773/health')['ok']:break
    except OSError:pass
    time.sleep(.2)
assert get('http://127.0.0.1:8773/health')['ok']
print('PASS: virtual SPI/GPIO/I2C; no face decision in panel/bridge; application operates with panel stopped')
