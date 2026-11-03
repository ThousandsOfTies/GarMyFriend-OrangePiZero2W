# Orange Pi実機でGemini Liveと会話する

USBマイク → ALSA → Gemini Live → ALSA → USBスピーカー、という実機向けの経路です。
顔・口パクと任意の身体操作は、同じプロセスで動く共通アプリが受け持ちます。
WindowsのWebPanel、開発VM、Open JTalkは会話に必要ありません。
PCは[USBネットワークと通信共有](USB_NETWORK.md)を使う場合のインターネット中継です。

2026-11-03、USB経由のSSH接続と、PR-SK95CKのLinux認識を確認しました。
カード名は `TSK95K` で、録音・再生の両endpointを確認し、Productの `audio.csv` に設定しています。
Linux上の代用ALSAプロセスと模擬Geminiでは、音声ストリーム、表情、再生完了、割り込み、停止を検証しています。
実機向け会話アプリの本配置・実音の録音再生・音質・回り込み・実機からのGemini会話は未確認です。

## 1. 配置と準備

[構成・ビルド手順](COMPOSITION.md)でARM64配布物を作ります。
最新版には `scripts/live.cjs`、共通アプリ、ALSAの連続入出力と、WebPanelと共通の
DOM非依存Gemini通信処理が入ります。`files/app/` の中身を実機の
`/opt/garmyfriend/app/` へ配置し、バイナリーに実行権限を付けます。
既存の配線CSV・校正・audio.csvを運用で変更している場合は、先に退避して引き継ぎます。
実機への上書きやサービス切替は、使用中の配置を確認してから行います。

以下は **Orange Pi上のBash** で実行します。Nodeは既存の24.22.1 ARM64を使います。

```bash
cd /opt/garmyfriend/app
export PATH=/opt/garmyfriend/node/bin:$PATH
node --version
command -v arecord aplay
node scripts/audio.cjs devices
```

Node.js 22以上と `alsa-utils` が必要です。未導入なら `sudo apt install alsa-utils`。
実行ユーザーが `/dev/snd/`、GPIO、SPI、必要ならI2Cへアクセスできるかも確認します。
USB音声機器はOrange PiのUSB HOSTへ接続します。PCへつなぐUSBデバイス側とは別です。

## 2. USB機器単体を確認

`hardware/orangepi-zero2w/audio.csv` のcapture/playbackに、`devices` が示した
**実際の** `plughw:CARD=...,DEV=...` を設定します。未設定や機器未検出のまま会話を開始しません。
カード名が不明な段階でPR-SK95CKの名前を仮定して書き込みません。

```bash
node scripts/audio.cjs check
node scripts/audio.cjs record /tmp/friend-mic-first.wav 5
node scripts/audio.cjs play /tmp/friend-mic-first.wav
```

録音中に話し、自分の声が再生されれば次へ進みます。再試験時はWAVを別名にします。
詳細は[USB音声の確認](USB_AUDIO.md)。単体試験を会話と同時実行するとデバイスがbusyになります。

## 3. APIキーと会話を開始

キーはチャット、コマンド引数、Git、設定CSVへ書きません。端末から表示せずに読み込み、
この起動だけ環境変数で渡します。`check` はキーの有無だけを表示し、録音・クラウド接続はしません。

```bash
read -rsp 'Gemini API key: ' GEMINI_API_KEY; echo
export GEMINI_API_KEY
node scripts/live.cjs check
```

`ready: true` を確認します。顔アプリを二重起動しないよう、既存の顔サービスを止めてから
前面で会話アプリを起動します。現在の旧サービスは `garmyfriend.service`、構成エンジンで
導入した後は `garmyfriend-orangepi-zero2w.service` です。稼働している方だけを停止します。

```bash
sudo systemctl stop garmyfriend.service
# 新構成のサービスを使っている場合は、上の代わりにこちら:
# sudo systemctl stop garmyfriend-orangepi-zero2w.service
node scripts/live.cjs start
unset GEMINI_API_KEY
```

挨拶が聞こえたら話しかけます。この初期設定は **会話・表情・口パクのみ** です。
`Live audio: connecting / listening / speaking` を端末へ表示し、会話内容やキーはログに出しません。
キーはアプリ起動後にプロセス環境から取り除き、ALSA・描画・サーボの子プロセスへ渡しません。
Ctrl+Cで録音・再生・クラウド接続を閉じます。身体を有効にした場合は動作も停止し、PWM OFFにします。
会話終了後、必要なら止めた顔サービスを `sudo systemctl start ...` で戻します。
キーの自動保存、起動時の常時録音、通信障害後の自動再接続は行いません。

## 4. サーボも会話から使う場合

既存のPCA9685配線・校正・身体モードを確認し、`effects.csv` のservoを有効にします。
実物の開始姿勢を確認して、明示的に身体ツールを有効にします。

```bash
node scripts/live.cjs start --body --from stand
# 伏せ姿勢から始める場合:
# node scripts/live.cjs start --body --from lie
```

前進・後進・止まる・伏せ・立ち上がりだけを同じnative Cへ渡します。
新たな角度やPWMをLLMに作らせません。動作終了結果を確認した後で応答します。
以後の開始姿勢は命令履歴から引き継ぐため、外力で姿勢が変わった場合は会話を止めて再指定します。
PWM OFF後の姿勢はセンサーで測っていません。再生・通信異常時も身体の停止処理を呼びます。

## 音声の制限

既定はスピーカー再生中と終了後250ms、マイク音声をGeminiへ送らない方式です。
マイク取得は続きますが、返答の回り込みを再入力しません。返事を聞き終わってから話しかけます。
この方式では声による発話途中の割り込みはできません。
機器のエコー除去が実際に機能することを確認できたら `--duplex` で同時送受信を試せます。

```bash
node scripts/live.cjs start --duplex
```

入力は16kHz・出力は24kHzのmono PCM16です。録音WAVを作らずメモリー上で送受信し、
再生キューは最大60秒分に制限します。Gemini通信はWebPanelと同じプロトコルで、
モデルと声は共通アプリの既定値を使います。必要なら `GAR_GEMINI_MODEL` / `GAR_GEMINI_VOICE` で指定します。
Geminiの利用料金・割当が適用されます。実機を停止するには端末のCtrl+Cを使います。

## 開発者向け検証

```bash
npm test
npm run test:native-live
```

Windowsではプロセス代用品による単体試験、Linuxでは実際の子プロセスを使う試験を実行します。
クラウドは模擬WebSocket、ALSAは代用の実行ファイルであり、購入機器の動作保証とは区別します。
