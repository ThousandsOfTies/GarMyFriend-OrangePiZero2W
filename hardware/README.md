# 配線・部品の正本

他のGAR Productと同じ `hardware/*.csv` を使います。部品情報・配線を独自JSONで重ねて管理しません。

| ファイル | 編集する内容 |
| --- | --- |
| `components.csv` | 部品ID、名称、種類、型番。KY-040は実物の型番、液晶は購入ページの商品モデル番号をpart_number列に記録 |
| `connections.csv` | 実機の物理配線計画。source_pinはOrange Pi Zero 2Wの40ピンヘッダー番号、target_pinは部品の印字 |
| `gpio.csv` | 現在動かすVMのGPIO chip・line・方向・プルアップ |
| `spi.csv` | 現在動かすVMのSPI device・bus・CS・mode・速度 |
| `orangepi-zero2w/gpio.csv`・`spi.csv` | 現在の実機LCDの割り当て。GPIOリセットを含む。KY-040は未接続のためencoder行を置かない |

列名はGARの `gar hw init` と同じものです。`i2c.csv` / `video.csv` は使う装置がないため置いていません。GARの読込は未配置のCSVを空として扱います。

**connections.csvの物理ピンと、gpio.csvのlineは異なる番号体系です。**
直下のgpio/spiはVMの割り当てです。実機はArmbianのpin controllerとSPIデバイスを確認し、`orangepi-zero2w/` に分けています。
物理番号をgpio.csvのlineへ写しません。たとえば物理18番のPH4は、今回の実機ではgpiochip1のline 228です。

`sources/gar-my-friend/application/hardware.cjs` がgpio/spiを読み、GPIO読取とC++液晶出力へ値を渡します。
仮想ドライバも同じCSVからSPI名とDCラインを取得し、BridgeはGARの既存CSV読込を使います。
`GAR_HARDWARE_DIR` は選択するCSVディレクトリーを指定するために使います。

`WIRING.md` と `modules/*.md` は配線表の読み方、根拠、未確認事項を説明する資料です。
配線変更時はCSVを先に修正し、資料もそれに合わせて更新します。

参考にした既存Product: GarStreamRxのcomponents/connections/gpio/spiと、GarServoPetの部品・接続CSV。
GAR coreやこれら他のProductは変更していません。
