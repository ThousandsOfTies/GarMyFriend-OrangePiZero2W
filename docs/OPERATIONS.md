# Product側で追加するGAR操作

追加操作はルートの [gar-operations.json](../gar-operations.json) に集約しています。
GAR本体に音声やWi-Fiなどの専用コマンドを増やす必要はありません。

```powershell
gar product list --workspace Local/GarMyFriend-OrangePiZero2W --json
gar product validate --workspace Local/GarMyFriend-OrangePiZero2W --json
gar product run probe --workspace Local/GarMyFriend-OrangePiZero2W --json -- --probe audio-status
```

| 操作名 | 呼び出す処理 | 残しているAlias |
| --- | --- | --- |
| audio | tools/target-audio.py | gar target audio |
| wifi | tools/target-wifi.py | gar target wifi |
| trace | tools/target-trace.py | gar target trace |
| update | tools/target-update.py | gar target update |
| probe | tools/target-probe.py | gar target probe |

AliasはProduct内だけで有効です。別のProductは同じAliasを別の処理に割り当てられます。
GAR標準の `target build` や `sim start` の上書きは拒否します。
一覧・検証は実機に接続しません。`--` 以降の引数をそのままProductへ渡します。
各操作の引数は `gar product run 操作名 -- --help` で確認できます。

## 新しい操作を追加する例

`tools/camera.py` に処理・引数検査を実装し、`operations` へ追加します。

```json
"camera": {
  "description": "カメラの確認",
  "entrypoint": "tools/camera.py",
  "timeout_seconds": 90,
  "result_fields": ["ok", "camera", "error"]
}
```

必要なら `aliases` へ `"target camera": "camera"` を追加します。
`gar product run camera ...` と、このProductでの `gar target camera ...` が使えます。
cameraは追加方法の例で、この変更でカメラ機能や実機操作を実装したわけではありません。
`runtime: "node"` と `.cjs/.mjs/.js` の入口も指定できます。

処理はJSONオブジェクトを1件stdoutへ返します。`result_fields` の項目だけがGARの `result` に入ります。
秘密情報を引数・結果へ含めず、従来の認証画面とprivate設定を使います。
終了値非0または `ok: false` は失敗です。操作成功と標準artifact/health検証は区別します。

以前の `gar-target-*.json` 5件はこの1ファイルへ移行しました。
`gar-simulator.json` はシミュレータのbuild/deploy/start契約として引き続き使います。

## 検証範囲

別々のProductの同名camera操作、Alias、引数・日本語・空白の保持、Python/Node処理、
タイムアウト、終了値、標準操作の保護、未宣言の結果項目の除外をGAR側で検証しています。
このProductでは定義検証、各操作のhelp、スクリプト更新のローカルbuildを確認しました。
この移行の検証に実機への接続・書き込み・サービス再起動は含めません。
