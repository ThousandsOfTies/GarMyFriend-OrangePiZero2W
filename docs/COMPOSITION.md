# Orange Pi Zero 2W Productのコンポジション

このProductは3つの独立リポジトリをsubmoduleとして固定します。

| 役割 | submodule | 所有するもの |
| --- | --- | --- |
| アプリ | `sources/gar-my-friend` | 表情・まばたき・描画・GPIO/SPIによるアプリ入出力 |
| 共通機構 | `sources/gar-tools` | 汎用デバイス処理、構成の検査、ビルド・配布物・起動ファイルの生成 |
| 基板 | `sources/board-orangepi-zero2w` | ピン資源、対応OS・ABI、SDKレイアウト、起動順、基板固有資産 |

組み立て指定は[product.json](../product.json)です。アプリと共通機構はOrange Pi版・Lyra版で同じソースを使い、基板と配線を選び替えます。
基板の資源表は確認済みの一部端子に限られます。全端子の保証ではありません。

## 手元で見る

```sh
git clone --recurse-submodules --branch feature/board-composition https://github.com/ThousandsOfTies/GarMyFriend-OrangePiZero2W.git
cd GarMyFriend-OrangePiZero2W
python tools/product.py describe
python tools/product.py validate
```

`describe`は実際のsubmoduleのコミット、OS、起動方式、配線ファイル、起動指定を表示します。
`validate`はProductのGPIO/SPI割当を選択した基板プロファイルと照合します。どちらも実機にアクセスしません。
現在の変更は[ドラフトPR #2](https://github.com/ThousandsOfTies/GarMyFriend-OrangePiZero2W/pull/2)にあります。
上のコマンドは、まだmainへマージしていない構成変更のブランチを選びます。

## ビルドと生成物

```sh
# Linuxの開発環境で実行。Lyraでは外部SDKの場所をGAR_BOARD_SDKで渡します。
python3 tools/product.py build
python3 tools/product.py package --output artifacts/release-example
```

生成先の`files/app/`には、同じ顔アプリ、Productの配線CSV、選択した基板データ、実機用バイナリー、
`run`、`configure-target`、`install`、`.startup/`が入ります。
SDK、ROM、コンパイラー本体は同梱しません。新しい配布物には新しい出力先を指定します。
`build --native`は開発PC向けのビルド検査です。その生成物を実機用として梱包することは拒否します。

`run`が起動するアプリと環境変数はProductが指定します。起動管理の実装はgar-toolsが持ち、
基板データの指定に従ってsystemdまたはBusyBox用ファイルを生成します。
実機への導入は生成済みの`files/app/`をProductの配布先へ配置した後、明示して`install`を実行します。
この構成変更の作業では実機へ再導入していません。既存の実機サービスは従来の配置で稼働しています。

## 境界

- 基板repo: どの端子・SPI・OS・toolchainを利用できるか。
- Productの`hardware/`: そのうちどの端子へ液晶とノブを接続し、どの速度・デバウンス値で使うか。
- アプリrepo: ノブの入力にどう反応して何を描画するか。
- gar-tools: 指定を読み、検査・ビルド・起動管理をどう実行するか。

従来のGAR Target Packの探索・transportは今回変更していません。新設したProduct build hookは
同じ構成エンジンを呼びますが、GAR標準CLIで両基板を選択して実機へdeployする全経路の検証は別です。
