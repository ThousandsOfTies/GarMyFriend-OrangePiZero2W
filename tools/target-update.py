"""Bind the physical conversation-only update to the reusable Linux provider."""

import json
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
connection = json.loads(
    (root / ".gar/network/connection.json").read_text(encoding="utf-8")
)
settings = {
    "root": str(root),
    "sshHost": connection["host"],
    "sshUser": connection["user"],
    "sshKey": str(root / ".gar/network" / connection["privateKey"]),
    "knownHosts": str(root / ".gar/network" / connection["knownHosts"]),
    "deployRoot": "/opt/garmyfriend",
    "service": "garmyfriend.service",
    "node": "/opt/garmyfriend/node/bin/node",
    "architecture": "aarch64",
    "validateImports": True,
    "files": [
        "sources/gar-my-friend/application/friend-control.cjs",
        "sources/gar-my-friend/application/conversation.cjs",
        "sources/gar-my-friend/application/live-session.cjs",
        "sources/gar-tools/web-simulator/components/gemini-live.mjs",
    ],
    "sourceRepositories": ["sources/gar-my-friend", "sources/gar-tools"],
    "title": "Orange Pi - conversation reply update",
    "heading": "返答が重なる問題の修正を実機へ反映します",
    "description": "会話ファイルだけを更新します。会話が再接続し、現在の姿勢を尋ね直します。",
    "initialStatus": "保護されたアプリの更新と会話サービスの再起動に、Linuxの管理者認証が必要です。",
    "buttonLabel": "修正を反映する",
    "progressStart": "実機の更新前の内容を照合しています…",
    "progressApply": "新しい配置を検証して会話を再接続しています…",
    "successMessage": "会話の修正を反映しました。動作確認へ進みます。",
}
provider = (
    root / "sources/gar-tools/targets/linux-device/provisioning/runtime-update/cli.py"
)
raise SystemExit(
    subprocess.call(
        [sys.executable, str(provider), json.dumps(settings), *sys.argv[1:]]
    )
)
