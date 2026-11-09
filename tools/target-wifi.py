"""Physical Board/OS bindings for GAR's interactive Wi-Fi provisioning recipe."""

import argparse
import json
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--transport", choices=("serial", "ssh"), default="ssh")
parser.add_argument("--check", action="store_true")
parser.add_argument("--repair-host")
args = parser.parse_args()
if args.check and args.transport != "ssh":
    parser.error("--check requires --transport ssh")
transport = args.transport
connection = json.loads(
    (root / ".gar/network/connection.json").read_text(encoding="utf-8")
)
settings = {
    "transport": transport,
    "check": args.check,
    "title": "Orange Pi - Wi-Fi setup",
    "port": connection["serialPort"],
    "vid": 0x1D6B,
    "pid": 0x0104,
    "user": connection["user"],
    "interface": "wlan0",
    "usbInterface": "usb0",
    "usbNetworkFile": "/etc/systemd/network/00-gar-usb-link.network",
    "expectedUsbAddress": "192.168.137.2/24",
    "checkUrl": "https://hometeacher-api-n5ja4qrrqq-an.a.run.app/",
}
if transport == "ssh":
    settings["title"] = "Orange Pi - Wi-Fi setup (SSH)"
    prior = json.loads(
        (root / ".gar/network/windows-result.json").read_text(encoding="utf-8-sig")
    )
    settings.update(
        sshHost=connection["host"],
        sshUser=connection["user"],
        sshKey=str(root / ".gar/network" / connection["privateKey"]),
        knownHosts=str(root / ".gar/network" / connection["knownHosts"]),
        usbGuid=prior["PrivateGuid"],
        usbHostAddress=connection["gateway"],
        resultDirectory=str(root / ".gar/network"),
    )
recipe = root / "sources/gar-tools/targets/linux-device/provisioning/wifi/setup.py"
if args.repair_host:
    import ipaddress

    settings.update(
        wifiHost=str(ipaddress.IPv4Address(args.repair_host)),
        repairExisting=True,
        title="Orange Pi - Wi-Fi connection recovery",
    )
raise SystemExit(subprocess.call([sys.executable, str(recipe), json.dumps(settings)]))
