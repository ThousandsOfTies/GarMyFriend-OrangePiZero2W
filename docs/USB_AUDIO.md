# USBマイク・スピーカーをつなぐ

購入済みの多摩電子 **PR-SK95CK** を想定した準備です。
2026-11-03、接続中のOrange Pi Zero 2Wで **TSK95K / USB ID `3206:104f`** として認識しました。
USB HOSTと `snd-usb-audio` が動作し、ALSAにマイク入力・スピーカー出力の両方が現れています。
実際の録音内容・スピーカーの音・音質はまだ確認していません。
この手順のコマンドは **Orange Pi上** で実行します。Windows上のWebPanelは
仮想デバイス専用で、PCのマイクや実機の録音・サーボを操作しません。

## 現在の範囲

```text
USBマイク ── ALSA arecord ── 明示した1～15秒の録音 ── ローカルWAV
ローカルWAV ── ALSA aplay ── USBスピーカー
日本語テキスト ── Open JTalk ── WAV ── ALSA aplay ── USBスピーカー
```

この単体確認用CLIは、常時録音やクラウド送信を行いません。
実機での連続した音声会話は別の `scripts/live.cjs` に実装しました。[実機会話の起動手順](NATIVE_LIVE.md)
[WebPanelのGemini Live会話](LIVE_PANEL.md)は、PCの音声を使う別の開発用経路として実装済みです。
今回の録音は、機器の確認と後続の音声認識へ渡す入力を作るための入口です。
音声を録るだけで身体が動くことはありません。

## 配置と前提

最新版の配布物には `scripts/audio.cjs`、アプリ側の音声コマンド、gar-toolsの
汎用ALSAアダプターが含まれます。[ビルド・配布](COMPOSITION.md)で作成します。
実機の顔アプリとは別に、共通の音声CLIを使った読み取り専用の `check` を
`/home/user/gar-penguin-update-20261103/audio-check/` に配置して確認しました。
録音・再生・クラウド会話はこの検査では開始していません。

USB機器はOrange Piの **USB HOST側** へ接続します。PCへのUSBシリアル接続は
USBデバイス側なので別系統です。実機でHOST端子・変換アダプター・給電余裕を確認します。

OSには `alsa-utils`（arecord/aplay）が必要です。日本語の発話にはさらに
Open JTalk、辞書、音声モデルが必要です。[導入例](SERVO_AND_SPEECH.md#音声出力)
を参照してください。機器・モデルを自動取得しません。2026-11-02に
[USBネットワーク＋WindowsのNAT](USB_NETWORK.md)を設定し、実機から外向きHTTPSと
名前解決を確認しました。パッケージの取得にもこの経路を利用できます。

ソースcheckoutなら以下のコマンドで確認します。配布物では先にその `files/app/`
ディレクトリへ移動し、同じ `scripts/audio.cjs` を使います。
`node` がPATHにない現在の実機では `/opt/garmyfriend/node/bin/node` と読み替えます。

```sh
node scripts/audio.cjs devices
node scripts/audio.cjs check
```

`devices` は `/proc/asound` のカード名、USB ID（取得できる場合）、録音・再生の
endpointを表示します。`check` は設定と実行コマンドの有無を読み取るだけで、
録音や再生は開始しません。`[]` ならALSAカードが未検出です。
Windowsでの `npm run audio -- check` は入口の確認に使えますが、USB音声の実機検査にはなりません。

## デバイスを明示する

`hardware/orangepi-zero2w/audio.csv` は、2026-11-03に確認した `TSK95K` を指定しています。
`devices` が表示した **実際の** `device` を、directionごとに転記します。

```csv
direction,device
capture,"plughw:CARD=TSK95K,DEV=0"
playback,"plughw:CARD=TSK95K,DEV=0"
```

カンマを含むのでCSVでは二重引用符で囲みます。カード番号より名前を使い、
HDMIへ出力することを避けます。PR-SK95CKの今回の実機カード名は `TSK95K` です。
録音と再生で同じカード名・DEV番号になるとは限りません。
同型機器を複数つなぐと名前に連番が付くことがあり、再確認が必要です。

ファイルが未設定なら録音・再生を拒否します。機器が外れても既定の別デバイスへ
自動変更しません。権限エラーなら `id` と `/dev/snd/` の所有groupを確認します。
生成サービスにはaudio groupを指定済みですが、実際のOS側の権限は確認が必要です。

## 到着後の試験

1. `devices` でUSBの録音・再生endpointが見えることを確認し、CSVへ設定します。
2. 次で5秒だけ録音します。録音開始を表示したら話してください。
3. 録音が終わってから同じWAVを再生し、自分の声が聞こえるか確認します。
4. 発話の準備ができたらspeechを有効化し、日本語の発話を確認します。

```sh
node scripts/audio.cjs record /tmp/friend-mic-test.wav 5
node scripts/audio.cjs play /tmp/friend-mic-test.wav
node scripts/audio.cjs say 'こんにちは。声が聞こえますか。'
```

録音は16kHz・16bit・モノラル、最大15秒です。`plughw` を通じてALSA側の
対応フォーマットへ変換します。Ctrl+Cや録音失敗時は一時ファイルを削除し、
完成したWAVだけを指定先へ保存します。既存ファイルは上書きしません。
再試験には別名を指定してください。保存した録音は利用者が削除します。
再生は最大30秒で中断します。

日本語の発話だけは `effects.csv` のspeech行を `enabled=1` にする必要があります。
辞書・モデルpathも実際の配置に合わせます。再生先は `audio.csv` のplayback行を
共有します。effects.csvのdevice欄はこのProductでは使いません。

このCLIは顔サービスとは別プロセスなので、単独の `say` / `play` では口パクしません。
既存FriendRuntime内の発話と、`scripts/live.cjs` で起動する会話には口パクがあります。
Live会話は同じアプリ内で、入力→Gemini→返答のPCM再生と表情・身体ツールを接続します。
同時に別プロセスから音声を使うと機器がbusyになる場合があります。試験は順番に実行します。

## 検証の記録

- 機器なし自動テスト: USB/HDMIの識別、録音/再生コマンドの分離、時間制限、
  設定未完了時の拒否、保存済みWAVの保護、中断時の一時ファイル削除を確認。
- Linux上: ダミーのALSA実行ファイルで録音・再生・日本語発話・実プロセスの中断を確認済み。
  ARM64向けビルドと配布物の作成、配布物内からの `check` 起動も確認しました。
- 実機（2026-11-03）: USB HOST配下で `NanosIC TSK95K`、`3206:104f`、`snd-usb-audio` を確認。
  capture / playbackはともに `plughw:CARD=TSK95K,DEV=0`。共通アプリの `audio check` でも両方を検出。
  USBの公称フォーマットは録音16kHz・再生48kHz、ともに16bit・2ch（`/proc/asound/card2/stream0`）。
  `arecord` / `aplay` は導入済み。`open_jtalk` は未導入で、日本語のローカル音声合成は未準備。
  録音・実際の再生・音質・長時間給電は未試験。顔サービスのaudio権限は、準備済みの更新スクリプトで追加する。
