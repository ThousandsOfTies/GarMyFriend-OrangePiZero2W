# 顔・GarServoPet・発話の統合

対象は **GarMyFriend-OrangePiZero2W**。追加の実機配線とスピーカーは未確認です。
現在稼働している実機へ自動配置・再起動・サーボ駆動はしていません。

## 所有範囲

```text
Product
  sources/gar-my-friend/                  顔と身体・声の連動
    dependencies/gar-servo-pet/           再利用する制御アプリ（固定submodule）
  sources/gar-tools/                      ビルド・I2C照合・配置・起動管理
  sources/board-orangepi-zero2w/          I2C1の基板資源・overlay
```

Product直下は3リポジトリを保ちます。サーボ制御のCソースはコピーせず、アプリの依存
submoduleから `gar-servoctl` を追加ビルドします。移動制限・校正チェック・排他制御・
停止時のFULL_OFFを維持します。

顔・反応はアプリの `application/friend-runtime.cjs` と `shared/reactions.json` が所有します。
ノブ回転で表情を選び、押すとその表情のセリフを発話し、サーボを短時間中立姿勢へ戻します。
起動時の自動発話・自動駆動はありません。重複した押下は進行中の出力へ積みません。
発話中の口パクは再生期間に合わせた周期運動で、音素や波形に同期したリップシンクではありません。
GarServoPetの空中歩行CLIも同梱されますが、自動反応には使用しません。地上歩行は実装していません。

## サーボの追加配線

既存のLCDとエンコーダー配線は維持します。新規のI2C接続は以下の計画です。

| Orange Pi 40-pin header | PCA9685 |
| --- | --- |
| pin 3 / PI8 / I2C1 SDA | SDA |
| pin 5 / PI7 / I2C1 SCL | SCL |
| pin 1 / 3.3V | VCC（ロジック） |
| pin 6 / GND | GND |

PCA9685のサーボV+は従来の外部5V電源を使い、GNDを共有します。4サーボの電源を基板から
供給する構成にはしません。CH0～3と機構を維持してGarServoPetの校正CSVを引き継いでいます。
機構・ホーン・チャンネルを組み替えた場合、その校正は再確認が必要です。

board profileはI2C1を `/dev/i2c-1` とするaliasとPI7/PI8のoverlayを持ちます。
新規の配線・I2C aliasはまだ実機検証していません。Product installerの明示的実行で
overlayが適用され、必要なら再起動を要求します。顔だけの既存サービスはこの変更で操作しません。

## ソフトの準備

```sh
git switch feature/friend-actuators
git submodule update --init --recursive
python3 tools/product.py validate
python3 tools/product.py build
python3 tools/product.py package --output artifacts/friend-with-outputs
```

配布物には `device-output`・`gar_rotary_input`・`gar-servoctl` が入ります。
実機用バイナリとPC向け検証バイナリはreceiptで区別し、PC版は実機用として包装しません。
systemd serviceは宣言した `i2c`・`audio` groupを使い、停止要求ファイル用に
`/run/garmyfriend-orangepi-zero2w/` を作成します。Native controllerを別ターミナルから
停止する場合も `GAR_SERVO_STOP_FILE=/run/garmyfriend-orangepi-zero2w/servo.stop` を指定します。

## 音声出力

日本語音声はローカルのOpen JTalkでWAVにし、ALSAの `aplay` で再生します。
APIキーやクラウドへの送信は使いません。合成器・辞書・音声モデルはOS側へ別途導入します。

Debian系でのパッケージ例:

```sh
sudo apt-get install open-jtalk open-jtalk-mecab-naist-jdic hts-voice-nitech-jp-atr503-m001 alsa-utils
```

音声モデルのpackageはDebianのcontribにあります。OSのrepository設定によっては導入先が
異なるため、`effects.csv` の辞書・モデルのpathを実際の導入先に合わせます。
アプリはモデルやSDKを同梱・自動取得しません。

```sh
aplay -l
aplay -L
```

`hardware/orangepi-zero2w/effects.csv` のspeech行で `enabled=1` にし、`device` を
実際の出力先（例 `plughw:CARD=実機で表示されたカード名,DEV=0`）へ変更します。
`default` は例示値です。HDMIへ誤出力しないよう、実機でカード名を選びます。

顔のサービスとは別に発話だけを試すコマンド:

```sh
GAR_HARDWARE_DIR=hardware/orangepi-zero2w \
  node sources/gar-my-friend/tools/say.cjs 'こんにちは。ぼくはGarMyFriendです。'
```

USB音声入力型スピーカー、USBオーディオ変換アダプター＋3.5mm入力スピーカー、
基板の音声出力は、いずれもALSAの出力先選択で扱います。USBポートのHOST設定や
拡張基板のcodecは、実機確認後に選択します。

スピーカー購入の比較:

- 接続重視: [サンワ MM-SPU21BK](https://direct.sanwa.co.jp/ItemPage/MM-SPU21BK)。
  USB-Aで音声と給電。2026-11-02確認時は税込3,400円。Linuxはメーカー保証対応に記載なし。
- 安さ重視: ダイソーで販売されていた300円USBミニスピーカーはUSB給電＋3.5mm入力。
  [実機調査記事](https://tech-blog.cerevo.com/archives/9804/)。現在の販売・在庫は未確認。
  使うには3.5mm出力かUSB-DACが別途必要です。「USB給電」と「USB音声入力」を区別します。

## 有効化と検証範囲

追加機能は両方 `effects.csv` の `enabled=0` から始めます。配線・校正と音声出力を確認し、
servo / speechを個別に有効化できます。既存のWebPanelは顔ディスプレイとノブの2部品を維持します。

自動検証では表情と発話・中立命令の対応、キャンセルと停止、TTS失敗時の口パク解除、
I2C資源照合、overlay/権限/runtime directoryの生成を確認します。
実機での音・機械動作、I2Cの通信、USBスピーカー認識は別途確認が必要です。

参照: [Open JTalk manual](https://manpages.debian.org/trixie/open-jtalk/open_jtalk.1.en.html)、
[H616 I2C controller](https://github.com/torvalds/linux/blob/master/arch/arm64/boot/dts/allwinner/sun50i-h616.dtsi)、
[H616 pinmux](https://github.com/torvalds/linux/blob/master/drivers/pinctrl/sunxi/pinctrl-sun50i-h616.c)。
