# Orange Piの身体モード

GarServoPetで使用したPCA9685＋SG90×4と同じ脚・ホーン・チャンネルを使います。
追加のI2C配線は[SERVO_AND_SPEECH.md](SERVO_AND_SPEECH.md)を参照してください。
WebPanelは液晶・PCA9685・SG90×4を並べ、5モードを仮想I2Cで試せます。
ロータリーは画面に置きません。[シミュレータの起動・操作](../SIMULATOR.md)
実機の身体操作は独立したCLIと共通アプリのAPIで行い、WebPanelの稼働を必要としません。

## 5つのモード

| 表示名 | コマンド | 動作 |
| --- | --- | --- |
| 前進 | `forward` | 脚の位相をずらす1周期。約4秒で立ち姿勢へ戻って終了 |
| 後進 | `backward` | 同じ軌道を逆順に1周期。約4秒で立ち姿勢へ戻って終了 |
| 止まる | `stop` | 進行中の動作を中断し、全PWMをOFF。開始姿勢の指定は不要 |
| 伏せ | `lie` | 指定した開始姿勢から伏せ姿勢へ移行し、短時間保持して終了 |
| 立ち上がり | `stand` | 指定した開始姿勢から立ち姿勢へ移行し、短時間保持して終了 |

**2026-11-02、実機で接地状態の伏せ・立ち上がりが正常に動くことをユーザーが
確認しました。** 現在のCSVはその機構で調整した値です。前後進の脚振りも確認しましたが、
進む方向・距離の評価は別途必要です。機構や取り付けを変えた場合は、胴体を支えた状態から
動きの方向と可動範囲を再確認します。

各動作は既存の制御方針どおり終了時に全PWMをOFFにします。OFF後に姿勢を
能動保持する機能や、連続歩行はありません。停止は立ち姿勢へ戻す命令ではなく、
保持トルクを解除する命令です。脚に荷重があると姿勢が変わることがあります。

## PCで確認する（サーボは動かない）

Productルートで実行します。初期設定の `servo,enabled=0` のまま実行できます。

```sh
npm run body -- forward --from stand --dry-run
npm run body -- backward --from stand --dry-run
npm run body -- lie --from stand --dry-run
npm run body -- stand --from lie --dry-run
npm run body -- stop --dry-run
```

実際に送る位置列・所要時間をJSON表示します。`--dry-run`はネイティブ制御を
起動せず、I2Cへアクセスしません。Windowsでも使えます。

## 実機で確認する

1. `git submodule update --init --recursive` 後、Productのビルドと配布物を更新します。
   `python3 tools/product.py build`、`python3 tools/product.py package --output artifacts/body-modes`
   を使います。既存の顔だけの配布物には新しいネイティブ命令がありません。
2. 配線・外部サーボ電源・校正値とI2C通信を確認します。サーボ電源は外部5Vを使い、
   Orange PiとGNDを共通にします。4サーボをOrange Piの5V端子から給電しません。
3. `hardware/orangepi-zero2w/effects.csv` のservo行だけ `enabled=1` にします。
   speech行はスピーカー到着まで `0` のままで構いません。
4. 実機への配布・install後、既存のサービスユーザーと同じユーザーで下記を実行します。
   systemdが作る `/run/garmyfriend-orangepi-zero2w/` の停止ファイルを共有します。

導入済みProductルート `/opt/garmyfriend/app` から、例えば次のように実行します。

```sh
/opt/garmyfriend/node/bin/node scripts/body.cjs forward --from stand
/opt/garmyfriend/node/bin/node scripts/body.cjs backward --from stand
/opt/garmyfriend/node/bin/node scripts/body.cjs lie --from stand
/opt/garmyfriend/node/bin/node scripts/body.cjs stand --from lie
```

停止は別のターミナルから実行できます。顔のアプリが出した中立動作や、別プロセスの
歩行動作にも、共有する停止ファイルとネイティブI2C排他を通じて停止を要求します。
歩行データが不正でも、servoが無効でも、`stop`は歩行データを読まずに実行できます。

```sh
/opt/garmyfriend/node/bin/node scripts/body.cjs stop
```

`--from stand|lie` は**実際の開始姿勢がその位置にあるという指定**です。
直前のコマンド履歴から物理位置を推測するものではありません。サーボに位置センサーはなく、
PWM OFF後に脚がずれた場合、胴体を支えて再び指定姿勢に合わせてください。
伏せ状態から前後進を指示すると、最初に立ち姿勢へ移行してから1周期動きます。
モードを無限に繰り返すループや、外部から受けた文字列をシェルで実行する処理はありません。

## 動きの調整と所有範囲

`hardware/orangepi-zero2w/body-motions.csv` が脚ごとの正規化位置を持ちます。

```csv
mode,frame,step_ms,hold_ms,front-left,front-right,rear-left,rear-right
```

- 位置は `-1000..1000`。実パルス・反転方向は既存の `servo-calibration.csv` が決めます。
  歩行振幅は±1000（現在の校正で中立1500µsから±200µs）、移行時間は800msです。
  伏せの位置は前脚+1000・後脚-1000です。立ち姿勢は0です。
- `frame`はモードごとに0から連番。同じモード内の時間設定は統一します。
- `stand`の最終行が立ち姿勢、`lie`の最終行が伏せ姿勢です。
  各モードの先頭は立ち姿勢と一致させ、前後進の終端も立ち姿勢にします。
- 移行は最大12フレーム・合計30秒。校正されていない脚、正規化範囲外、
  校正CSVの速度上限を超える移行は拒否します。ネイティブ側でも制限します。

共通アプリ `application/body-motion.cjs` はパターンを校正CSVの行順へ並べ、
`ServoOutput.perform(mode, {from})` と `FriendRuntime.command(mode, {from})` で呼べます。
具体的な角度・配線はアプリに埋め込みません。今後のLLM連動もこの5つの意味的な
命令へ接続できますが、LLMの接続自体は今回の変更には含みません。

`dependencies/gar-servo-pet` の `sequence` 命令が既存の速度制限・校正チェック・
割り込み・I2C排他・FULL_OFFを担当します。`air-walk`の空中試験制約は変更していません。

## 検証範囲

アプリ試験で前後の逆順、チャンネル順の入れ替え、伏せから立ち上がって歩く遷移、
停止の割り込みと同時命令拒否、不正CSV・開始姿勢なしの拒否を確認します。
ネイティブ試験で位置列の解析、速度制限、校正拒否、動作途中の停止とFULL_OFFを確認します。
実機の配線・動作の確認結果は、以下の実機接続確認に記録します。

## 2026-11-02の実機接続確認

USB-CのシリアルコンソールからOrange Pi Zero 2Wへ接続しました。
I2C overlayを有効にして再起動後、ヘッダー3番/PI8・5番/PI7のコントローラー
`5002400.i2c` が `/dev/i2c-1` として現れ、PCA9685の `0x40` を読み取りで確認しました。
有効化前の `/dev/i2c-1` はHDMI用だったため、デバイス番号だけで接続先を決めません。

既存の顔サービスを置き換えず、USB経由で `$HOME/garmyfriend-body-test/` に
ARM64のサーボバイナリーと共通CLI、Product CSVを置いて試験しています。
手動コマンドだけで動き、自動起動のサーボ動作は追加していません。
例えば `~/garmyfriend-body-test/body stop` で停止できます。

中立500msの動作と、前進1周期の脚振りを実機で確認しました。
振幅±200と±400では動きが小さいとのユーザー確認により、校正済みの
1300〜1700µsを全幅使う±1000へ変更し、異音・引っかかりなく十分に動くことを
確認しました。前進する方向・距離はまだ評価していません。

伏せも初期の前脚+300・後脚-300では小さかったため、前脚+1000・後脚-1000へ
変更しました。接地状態で、伏せる方向に十分動き、異音・引っかかりが
ないことをユーザーが確認しました。移行800ms・保持300msの後はPWMをOFFにします。
姿勢を長時間保持する性能は評価していません。

同じ伏せ位置からの `stand --from lie` も実機で実行し、脚が中立位置へ正常に戻り、
異音・引っかかりがないことをユーザーが確認しました。実際には接地した状態で
試していたとの補足を受け、接地状態での伏せからの起立を確認済みとして記録します。
動作終了後のPWM OFFも正常に完了しています。
