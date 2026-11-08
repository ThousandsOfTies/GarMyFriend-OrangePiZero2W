"""Physical Product bindings for a bounded, payload-free conversation trace."""

import argparse
import base64
import json
import subprocess
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--transport", choices=["ssh"], default="ssh")
parser.parse_args()
root = Path(__file__).resolve().parents[1]
connection = json.loads((root / ".gar/network/connection.json").read_text())
tools = root / "sources/gar-tools/targets/linux-device/provisioning"
settings = {
    "sshHost": connection["host"],
    "sshUser": connection["user"],
    "sshKey": str(root / ".gar/network" / connection["privateKey"]),
    "knownHosts": str(root / ".gar/network" / connection["knownHosts"]),
    "check": False,
    "title": "Orange Pi - live conversation investigation",
    "heading": "会話を止めずに、60秒間の入出力の順序を調べます",
    "description": "会話の文章・録音・認証情報は保存しません。調査後は元の処理へ戻します。",
    "initialStatus": "実機の実行中プロセスを観測するため、管理者認証が必要です。",
    "buttonLabel": "調査を始める",
    "successMessage": "調査が終了しました。診断結果を確認しています。",
    "progressStart": "実行中の会話に診断を接続しています…",
    "progressApply": "60秒間の調査中です。一度話しかけ、その後は黙って待ってください。",
    "recipeSource": str(tools / "conversation-trace/configure.py"),
    "observerBase64": base64.b64encode(
        (tools / "conversation-trace/observe.cjs").read_bytes()
    ).decode(),
    "traceFunctionBase64": base64.b64encode(
        subprocess.check_output(
            [
                "node",
                "-e",
                "process.stdout.write(require(process.argv[1]).toString())",
                str(root / "sources/gar-my-friend/tools/live-trace.cjs"),
            ]
        )
    ).decode(),
    "prototypeExport": "LiveSession",
    "resultFile": str(root / ".gar/network/live-trace-result.json"),
    "service": "garmyfriend.service",
    "entrypoint": "/opt/garmyfriend/app/scripts/run-face.cjs",
    "durationMs": 60000,
    "node": "/opt/garmyfriend/node/bin/node",
    "module": "/opt/garmyfriend/app/sources/gar-my-friend/application/live-session.cjs",
}
raise SystemExit(
    subprocess.call(
        [sys.executable, str(tools / "audio/setup.py"), json.dumps(settings)]
    )
)
