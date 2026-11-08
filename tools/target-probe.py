"""Product bindings for bounded, reusable Linux USB-audio diagnosis."""

import base64
import json
import shlex
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
action = sys.argv[1]
connection = json.loads((ROOT / ".gar/network/connection.json").read_text(encoding="utf-8"))
directory = ROOT / ".gar/network"
source = ROOT / "sources/gar-tools/targets/linux-device/runtime/alsa-audio/probe.py"
settings = {
    "action": action,
    "card": "TSK95K",
    "service": "garmyfriend.service",
    "volume": 30,
}
if action == "network-status":
    source = ROOT / "sources/gar-tools/targets/linux-device/runtime/network/probe.py"
    settings = {
        "interface": "wlan0",
        "checkUrl": "https://hometeacher-api-n5ja4qrrqq-an.a.run.app/",
        "usbNetworkFile": "/etc/systemd/network/00-gar-usb-link.network",
    }
program = base64.b64encode(source.read_bytes()).decode("ascii")
invocation = "import base64;exec(compile(base64.b64decode(" + repr(program) + '),"<audio-probe>","exec"))'
command = shlex.join(["python3", "-c", invocation, json.dumps(settings)])
result = subprocess.run(
    [
        "ssh",
        "-T",
        "-i",
        str(directory / connection["privateKey"]),
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=6",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "UserKnownHostsFile=" + str(directory / connection["knownHosts"]),
        connection["user"] + "@" + connection["host"],
        command,
    ],
    capture_output=True,
    text=True,
    encoding="utf-8",
    errors="replace",
    timeout=80,
)
try:
    report = json.loads(result.stdout)
except ValueError:
    report = {
        "ok": False,
        "error": "USB audio probe could not connect or return JSON",
        "sshExit": result.returncode,
    }
print(json.dumps(report, ensure_ascii=False))
sys.exit(0 if result.returncode == 0 and report.get("ok") else 1)
