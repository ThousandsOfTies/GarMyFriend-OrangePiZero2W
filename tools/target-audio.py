"""Product audio identity and known-working playback level, with private auth."""

import argparse
import json
import subprocess
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--transport", choices=["ssh"], default="ssh")
parser.parse_args()
root = Path(__file__).resolve().parents[1]
connection = json.loads((root / ".gar/network/connection.json").read_text(encoding="utf-8"))
settings = {
    "sshHost": connection["host"],
    "sshUser": connection["user"],
    "sshKey": str(root / ".gar/network" / connection["privateKey"]),
    "knownHosts": str(root / ".gar/network" / connection["knownHosts"]),
    "check": False,
    "card": "TSK95K",
    "usbId": "3206:104f",
    "playbackPercent": 30,
    "title": "Orange Pi - audio startup authentication",
    "recipeSource": str(root / "sources/gar-tools/targets/linux-device/provisioning/audio/configure.py"),
    "resultFile": str(root / ".gar/network/audio-startup-result.json"),
}
recipe = root / "sources/gar-tools/targets/linux-device/provisioning/audio/setup.py"
raise SystemExit(subprocess.call([sys.executable, str(recipe), json.dumps(settings)]))
