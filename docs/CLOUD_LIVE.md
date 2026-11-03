# コンソールなしでGemini Liveを使う

2026-11-03に、TutoTuto / DoriDoriの共有API `home-teacher-api` のCloud Run・
Secret Manager・Firebase Admin・公開手順を再利用し、機器認証付きの短期トークン発行を追加しました。
本番APIと実機Orange Pi Zero 2Wで接続確認済みです。

## 使い方

実機の既存 `garmyfriend.service` を有効のまま更新しています。起動時に機器認証を行い、
Gemini Liveに接続します。APIキーの入力やWindowsのWebPanelは必要ありません。
今回の構成ではインターネット接続にPC側のUSBネットワーク・通信共有を使います。
PCが不要なネットワーク構成そのものへ変更したわけではありません。

起動するとスピーカーから短い挨拶を再生し、USBマイクで会話を待ち受けます。
**スピーカーフォン上面の中央マイクボタンだけ** で操作します。
青LEDのときに話しかけ、使わないときは同じボタンを押して赤LEDへ戻します。
2026-11-03に利用者がKY-040をつないでいないことを確認したため、実機のGPIO CSVから
encoder行を外し、読み取りプログラムを起動しない構成へ修正しました。KY-040は不要です。

スピーカーフォンPR-SK95CK中央のボタンは機器側のマイクミュートです。
[メーカー説明書](https://tamadenco.co.jp/products/pdf/2040.pdf)では赤LEDがミュート、青LEDが解除です。
このボタンは機器内部で消音し、アプリ側には二重のミュートを設けていません。
今回、赤LEDへ変更してもALSAの `Mic Capture Switch` はonのままで、USBキーイベントも取得できませんでした。
アプリはLEDを読み取って同期しているわけではなく、機器が出力するPCMを扱います。
赤LEDでもGemini接続と音声取得・送信の処理は継続し、音声ファイルは保存しません。
音声取得そのものを停止するにはサービスを停止するかUSB機器を外します。
USBスピーカーのALSA音量は初回に0だったため、30%へ変更しました。実際に聞こえる音量は利用者が確認します。

今回の自動起動は会話・表情・口パクだけです。身体の自動操作は有効にしていません。
接続やトークンの期限切れ時には新しいトークンを取得し、最大60秒の間隔で再接続します。
再接続では会話は新しいセッションになります。マイクの消音はUSB機器側のボタンで操作します。
身体を明示的に有効にしたCLIセッションは、切断後の開始姿勢の再確認を必要とします。

## ロボットとしての応答

会話の開始時に、GarMyFriend自身が顔の画面・マイク・スピーカー・4本の脚を持つ
ロボットであることを伝えます。「前進してください」「伏せて」などは、別の対象が
明示されていなければ、自分の身体への指示として受け取ります。計画や作業を進める話は
会話の文脈に従い、身体命令として扱いません。

身体操作が無効でも、指示の意味を受け取ったうえで「今は脚の操作が無効だから、
まだ動けないよ」のように短く答える方針です。「AIなので身体がない」と答えたり、
故障・未接続など未確認の理由を作ったりしません。有効時も登録済みの動作だけを使い、
実行結果を確認して応答します。移動距離や動作後の姿勢を実測したとは説明しません。
指示文の更新そのものでは、実機の身体操作を有効にしません。

## 構成と再利用部分

```text
Orange Pi ── 機器専用認証 ── Cloud Run /api/live/token
    │                            │
    │ 短期トークン                ├─ Secret Manager: 既存のGemini APIキー
    │                            └─ Firestore: 機器ごとの発行回数
    └──────── 音声 ────────── Gemini Live
```

Cloud側は既存の `hometeacher-api` プロジェクト、東京リージョン、サービスIDを使います。
既存の採点・課金ルートを維持し、音声やロボット動作をこのAPIで中継しません。
機器は専用のランダム認証情報を初回だけ持ち、GeminiのAPIキーは実機へ保存しません。
Cloud側の `LIVE_DEVICE_REGISTRY` は機器ID・有効フラグ・認証情報のSHA-256だけを保持します。
短期トークンは1回の接続用・30分以内・接続開始60秒以内・モデル固定・音声出力のみです。
使用する制約付きLive APIはGoogle SDKに合わせた `v1alpha` で、プレビュー仕様です。
短期トークンではモデルと音声出力だけを固定し、`lockAdditionalFields: []` を明示します。
省略すると未指定の設定まで固定され、実機から渡すプロンプト・声・操作ツールが
反映されなくなるためです。ロボットの指示とツールは共通アプリから接続開始時に渡します。

共有APIの [LIVE_TOKENS.md](https://github.com/ThousandsOfTies/home-teacher-api/blob/main/LIVE_TOKENS.md) に
新しい機器の登録・無効化・回数制限を記録しています。発行上限は機器ごとに毎分4回・毎時30回です。
FirestoreのトランザクションでCloud Runの複数インスタンス間でも共有します。
これは接続用トークンの発行制限であり、利用料金の上限ではありません。

| 所有元 | 配置・担当 |
| --- | --- |
| home-teacher-api | `src/liveTokens.ts`：機器認証、トークン発行、Firestore制限。既存の公開機構・秘密設定を再利用 |
| gar-tools | `targets/linux-device/runtime/gemini-live/broker.cjs`：機器プロフィール読込・HTTPS取得 |
| gar-tools | `web-simulator/components/gemini-live.mjs`：APIキーと短期トークンに対応した共有Live通信 |
| gar-my-friend | `application/managed-live.cjs`：更新・再接続、`live-runtime.cjs`：音声と会話の接続 |
| gar-my-friend | `face.cjs`：任意のKY-040入力、表情と口パク。GPIO CSVにencoderがなければ読取を起動しない |
| Product | 実機設定、追加ソフトミュートの解除、固定するsubmodule、配布と導入 |

WebPanelの認証・入力部品はこの変更では追加していません。
共有クライアントは、独立した2つの機器プロフィールと2つのLive通信インスタンスで検証しました。

## 実機の配置

| 項目 | 配置 |
| --- | --- |
| 起動サービス | `garmyfriend.service`（従来のサービスを維持） |
| Live用drop-in | `/etc/systemd/system/garmyfriend.service.d/60-live-broker.conf` |
| USBマイク単独操作用drop-in | `/etc/systemd/system/garmyfriend.service.d/70-usb-microphone.conf` |
| 機器専用プロフィール | `/etc/garmyfriend/live-broker.json`（garmyfriend所有・0600） |
| 現在のリリース | `/opt/garmyfriend/releases/arm64-live-speaker-cue-20261103` |
| USBマイク単独操作の前版 | `/opt/garmyfriend/releases/arm64-live-usb-mic-67ff119-20261103` |
| KY-040を要求していた前のリリース | `/opt/garmyfriend/releases/arm64-live-broker-17b1f2c-20261103` |
| 顔のみの旧リリース | `/opt/garmyfriend/releases/arm64-penguin-8fe10a9-20261103` |

実機のLCD用GPIO/SPI設定は前の動作確認済み配置から引き継ぎ、未接続のencoder行を除きました。
USB音声には `TSK95K` を指定しています。
話し始めの聞こえ方を比較するため、現在は返事の前に控えめな合図音を入れています。[比較の設定・記録](AUDIO_START.md)
認証情報は公開用の配布物・Git・ログに含めません。再登録・失効は機器ごとに行います。

## 確認結果

- APIのローカル36テストとGitHub Actions成功後、staging・本番の順に反映。
- 既存の採点・本文・課金認証を含む15ルートをstaging・本番で確認。
- 実機で機器認証→短期トークン→Gemini Live→PCM音声応答の受信まで確認。
- Linuxで実際のALSA代用プロセス・口パク・再接続・停止を検証。
- 実機サービスは再起動回数0で `active/running`。
- 実機ログに `authenticating` → `connecting` → `ready` → `muted` → `speaking` → `muted`、液晶描画の継続を確認。
- 実際のUSBマイク・スピーカーを開き、返答PCMの再生プロセスが正常終了。
- KY-040なしの設定へ更新後、`Rotary input disabled` と、回転つまみ用子プロセスが存在しないことを確認。
- 利用者が上面マイクボタンを青LEDへ切り替えて話しかけ、返事が聞こえることを確認済み。
- 2026-11-03、短期トークンの設定固定範囲を修正し、検証用Cloud Run経由の実際のGemini Liveで
  「前進してください」「伏せて」を身体命令として受け取り、操作無効の理由を答えることを確認。
  「計画を前進させたい」は相談として応答し、身体操作ツールは呼びませんでした。
  この比較ではマイク・スピーカー・実機サーボを使わず、合成したテキストへの返答を確認しました。
