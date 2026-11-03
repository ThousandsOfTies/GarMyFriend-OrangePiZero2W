# 2026-11-03 実機のペンギン顔への更新

USBネットワーク経由で、実機がOrange Pi Zero 2W / aarch64であることを確認しました。
利用者が認証ウィンドウでsudoパスワードを入力し、以下の更新が完了しました。
パスワードはチャット・ファイルへ保存していません。

## 更新したもの

描画コアは共通アプリ `8fe10a9` の版です。白い頬を広げたペンギンの顔を含みます。
開発VMでARM64へクロスビルドし、実機で共有ライブラリーの解決とチェック値を確認しました。

- `build/device-output`：実機用ARM64バイナリー。
- `shared/expressions.json`：ペンギンの表情データ。
- `firmware/FaceCore.h` / `FacePresets.inc`：対応する描画ソース・プリセット。
- `hardware/orangepi-zero2w/audio.csv`：入力・出力とも `plughw:CARD=TSK95K,DEV=0`。

`device-output` のSHA-256：

```text
620b0819617a9168b48be439baa2d549e112c340dde0b02e441fc44bbc1379b7
```

既存リリースを複製して上記ファイルを更新し、`/opt/garmyfriend/app` の参照先を切り替えました。
以前の実機配線CSVと既存の `garmyfriend.service` を引き継ぐ更新です。
構成エンジンによるProduct全体の新しい導入方式へ移行したわけではありません。
旧リリースは復元用に保持しています。

| 用途 | 配置 |
| --- | --- |
| 現在 | `/opt/garmyfriend/releases/arm64-penguin-8fe10a9-20261103` |
| 以前 | `/opt/garmyfriend/releases/arm64-ff484edd4776` |
| 入口 | `/opt/garmyfriend/app` |

## 確認結果

- サービスは `active/running`、更新後の再起動回数0、終了エラー0。
- `Hardware ready`、`Rotary GPIO ready`、`LCD frames=1/200/400` の継続を確認。
- 実機のバイナリー、表情データ、描画ヘッダーが転送前のSHA-256と一致。
- サービスユーザー `garmyfriend` にaudioグループを追加してから起動。
- USB音声機器 `TSK95K` の録音・再生endpointと、ALSAツール・設定を確認。
- 利用者が、実機の液晶がペンギンの顔になっていることを確認。

プロセス・デバイス出力・配置の確認に加え、液晶の実際の見た目も利用者が確認しました。
USBの録音・再生は開始していません。実音の確認手順は [USB_AUDIO.md](USB_AUDIO.md) を参照してください。
実機向けGemini Liveアプリ全体の導入と実音での会話試験は別途必要です。
