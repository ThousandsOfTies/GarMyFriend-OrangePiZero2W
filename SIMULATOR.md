# 顔・PCA9685・4サーボのシミュレーション

## 起動と操作

```powershell
npm run vm:start
npm run vm:open
```

WebPanelには円形液晶、PCA9685、SG90×4を表示します。ロータリーは不要です。
開始姿勢を選び、前進・後進・伏せ・立ち上がりを押すと、共通アプリのCLIから
実際のC制御を実行します。前後進は約4秒で終了します。「止まる」は途中でも使えます。
ボタンはTabで選び、EnterまたはSpaceでも操作できます。

液晶は顔アプリがSPIドライバーへ書いた画素、サーボはネイティブ制御が仮想I2Cへ
書いたPWMを表示します。ブラウザーで動きの列や顔を作り直しません。
サーボは校正したパルス範囲を相対角度へ換算した表示で、機械の実角度ではありません。
接地・重力・移動距離・荷重による姿勢の維持は再現しません。

```text
5つのボタン → Product adapter → 共通アプリCLI → 共通Cサーボ制御
                                                        ↓
4サーボの表示 ← 共有SG90/PCA9685部品 ← Bridge ← 仮想I2C /dev/i2c-10

円形液晶 ← Bridge ← 仮想SPI ← 独立した顔アプリ
```

通常はSSHでローカル転送した **http://127.0.0.1:8773/** を開きます。
アドレスは `.gar/vm/panel.json`。`python tools/vm.py local` はブラウザーを開かずに転送を準備します。
変更の反映は `npm run vm:deploy`、状態は `npm run vm:status`、終了は `npm run vm:stop` です。
外部向けHTTPSが必要な場合だけ `npm run vm:publish` を明示して使います。

## 部品の接続口

- `GET /api/state`：ドライバーの接続状態、PCA9685のPWM、身体コマンドの実行状態。
- `GET /api/body/config`：Product CSVにあるサーボ名・役割・チャンネル・表示校正。
- `POST /api/body`：`{"mode":"forward","from":"stand"}`。他の動作は `backward`・`lie`・`stand`。
  開始姿勢は `stand` / `lie`。停止は `{"mode":"stop"}`。実行中の別動作は409で拒否し、停止は割り込みます。
- `GET /api/io/frame`：ドライバが受け取った240×240 RGB565 big-endian画素。
- `POST /api/rotary`：既存の仮想GPIOを検査する開発用接続口。今回の画面では使いません。
- `GET /health`：パネルと部品の接続状態。

表情の直接変更、シナリオ、記録再生のAPIは公開しません。BridgeとWebPanelは表情名を知りません。
身体操作は専用x64 Linux VMと `/dev/i2c-10` に固定します。Windowsで画面サーバーだけを
起動した場合や、ARM64実機で起動した場合は動作ボタンを有効にしません。
実機の `/dev/i2c-1` へWebPanelから命令を送る経路はありません。

## VM内のサービス

| サービス | 役割 |
| --- | --- |
| `garmyfriend-devices` | gpio-sim、GC9A01 CUSE、PCA9685を持つI2C CUSE、汎用GAR Bridge |
| `garmyfriend` | 独立した顔アプリ。GPIO入力とSPI描画 |
| `garmyfriend-panel` | 液晶・PCA9685・サーボ表示、固定した5モードをアプリCLIへ渡すadapter |
| `garmyfriend-tunnel` | 明示して使う場合だけ、開発用HTTPS公開 |

```bash
systemctl status garmyfriend garmyfriend-panel garmyfriend-devices
journalctl -u garmyfriend -u garmyfriend-panel -u garmyfriend-devices -n 60
ls -l /dev/spidev0.0 /dev/gpiochip0 /dev/i2c-10
```

WindowsからのSSH接続:

```powershell
ssh -i .gar/vm/id_ed25519 -p 2231 -o IdentitiesOnly=yes -o UserKnownHostsFile=.gar/vm/known_hosts gar@127.0.0.1
```

## 再構築

Windows、VirtualBox 7、Python 3.11以上、OpenSSHを使用します。ブラウザーテストにNode.js 18以上とMicrosoft Edgeを使います。クローン後に `git submodule update --init --recursive` と `npm ci` を実行します。

Ubuntu 24.04 amd64 cloud imageのVMDKと配布元のSHA-256を確認し、専用VMを作ります。

```powershell
python -m pip install pycdlib
python infra/virtualbox/create.py --base-image C:/images/noble.vmdk --sha256 VERIFIED_SHA256
```

初回cloud-initのパッケージ導入完了後:

```powershell
npm run vm:deploy
npm run vm:open
```

VMは1GB・1vCPU・16GBディスクです。鍵・VMディスク・URLは `.gar/vm/` に保存し、Gitに含めません。元イメージはコピーして利用します。

## 検証

`npm test` は表情・身体アプリの動作、Bridgeが表情を判断しないこと、5モードの入力とPWMの接続、
キーボード操作・320/760/1440pxの表示を確認します。`npm run test:vm` は実際のC/CUSE経路で
5モード、校正範囲内のPWM変化、途中停止、終了時のFULL_OFFとSPI画素の一致を確認します。

共有部品は `sources/gar-tools/web-simulator/components/` の `display.mjs`、`pca9685.js`、
`sg90.js` を再利用します。部品の内部DOM/CSSはProduct側へコピーしません。
共有部品の独立した2インスタンスの確認は `node --test sources/gar-tools/web-simulator/tests/servo-components.test.mjs`。
配線・校正・モード・コマンドの接続はProduct adapterに置きます。

カーネル更新後に `gpio-sim` が見つからない場合は、VM内で
`sudo apt-get install --no-install-recommends linux-modules-extra-$(uname -r)` を実行し、
`npm run vm:deploy` をやり直してください。

VM内で `python3 -B tests/vm-parts.py` を実行すると、アプリを一時停止してもノブは入力できるが画素は変わらないこと、WebPanelを停止してもアプリがGPIOを読みSPIへ書くことを確認します。試験後に必ずアプリとWebPanelを復旧します。
