# コンソールなしでGemini Liveを使う

2026-11-03に、TutoTuto / DoriDoriの共有API `home-teacher-api` のCloud Run・
Secret Manager・Firebase Admin・公開手順を再利用し、機器認証付きの短期トークン発行を追加しました。
本番APIと実機Orange Pi Zero 2Wで接続確認済みです。

## 使い方

実機の既存 `garmyfriend.service` を有効のまま更新しています。起動時に機器認証を行い、
Gemini Liveに接続します。APIキーの入力やWindowsのWebPanelは必要ありません。
2026-11-08に会話用のインターネット接続をSBCのWi-Fiへ移行しました。
PCのUSBネットワークは管理用として残し、PCのインターネット共有には依存しません。
給電は別途必要です。[Wi-Fi設定と実機検証](WIFI_SETUP.md)を参照してください。

起動すると短く挨拶し、脚が今は立ち姿勢か伏せ姿勢か尋ねます。
実物を見て「今は立っています」または「今は伏せています」と答えてください。
姿勢を受け取った後、「伏せて」「立って」などの新しい指示で動作します。
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

2026-11-04の構成では会話・表情・口パクと、音声での姿勢確認後の身体操作を使います。
起動そのものでは脚を動かしません。姿勢の返答がなくても会話はできます。
接続やトークンの期限切れ時には新しいトークンを取得し、最大60秒の間隔で再接続します。
再接続では会話は新しいセッションになります。マイクの消音はUSB機器側のボタンで操作します。
再接続後は前の姿勢を再利用せず、同じように尋ね直します。

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

## 音声で現在状態を取り込む

アプリは接続開始時に身体操作の可否と「姿勢は未確認」という現在状態を指示に含めます。
`confirm_body_pose` で、実際に音声認識された利用者の状態説明と一致する姿勢だけを記録します。
命令形・質問・曖昧な返答では確定せず、確認の返答だけでは動作を始めません。
顔・会話は姿勢が分からなくても使えます。

成功した動作の結果から次の開始姿勢を引き継ぎ、停止・中断・実行失敗では不明に戻します。
これは利用者の確認と命令結果に基づく状態で、サーボ位置のセンサー測定ではありません。
状態はメモリー内だけに持ち、起動・再接続で破棄します。

実機は [90-live-body-voice.conf](../infra/orangepi-zero2w/90-live-body-voice.conf) の
`GAR_FRIEND_START_POSE=ask` を使い、通常の起動と接続更新で同じ流れを実行します。
4サーボの既存の校正値と動作列は維持します。前後進は約4秒の脚振り1周期です。
コンソールで姿勢を指定したり、毎回sudoで有効化したりする必要はありません。

## 以前の1セッションだけの有効化

2026-11-03、利用者が立ち姿勢とサーボの配線・電源接続を確認した後、
当時の会話セッションだけ身体操作を有効にしました。利用者が実機へ「伏せて」と
話しかけ、実際に伏せることを確認済みです。「立って」で立ち姿勢へ戻せます。
前進・後進は約4秒の脚振り1周期で、連続歩行や移動距離の保証はありません。

Productの [live-body-session.sh](../infra/orangepi-zero2w/live-body-session.sh) が、
動作確認済みのCSVを `/run/garmyfriend-live-body/` へ複製してservo行だけを有効にします。
校正値・動作列は変更しません。サービスにI2Cアクセス権と書き込み用の一時領域を追加し、
`GAR_FRIEND_LIVE_BODY=1` と、利用者が確認した `GAR_FRIEND_START_POSE=stand` を渡します。
有効化処理自体は動作命令を送りません。

設定は `/run/systemd/system/garmyfriend.service.d/90-live-body-session.conf` に置き、
自動再起動は無効にしています。開始姿勢の確認ファイルは起動時に一度だけ消費します。
接続終了後に同じ設定で起動し直すことはできず、新しく実物の姿勢を確認して有効化します。
再起動すると一時設定は消え、従来の会話・表情だけの自動起動へ戻ります。

以下は2026-11-03の一時設定専用の手順です。2026-11-04の常設設定には使いません。

```sh
sudo sh /home/user/gar-live-body-20261103/live-body-session.sh off
```

再有効化では、身体操作を終了したうえで実物の姿勢を確認してから、同じスクリプトへ
`stand`（立ち姿勢）または `lie`（伏せ姿勢）を指定します。接続が切れた後の姿勢を
コマンド履歴だけで決めたり、以前の開始姿勢をそのまま使ったりしません。

## 構成と再利用部分

2026-11-04、Webシミュレータも同じCloud Runの短期トークン発行を使う構成に揃えました。
実機の `penguin-orangepi-zero2w` は維持し、別の機器ID `penguin-simulator-virtualbox` を
登録しています。秘密の機器認証情報はVMの `/home/gar/.config/garmyfriend/live-broker.json`
（gar所有・0600）に置き、ブラウザへは会話ごとの短期トークンだけを返します。
シミュレータにもGemini APIキーを入力する必要はありません。

登録用ハッシュのSecret Manager版は2で、stagingの `hometeacher-api-staging-00012-xqk` と
本番の `hometeacher-api-00052-x84` へ反映しました。APIのソース・モデル・既存の機器登録は
変更していません。新旧両方の機器認証で本番のトークン取得を確認しています。
シミュレータの会話手順は [LIVE_PANEL.md](LIVE_PANEL.md) を参照してください。

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
| 現在の音声姿勢確認用drop-in | `/etc/systemd/system/garmyfriend.service.d/90-live-body-voice.conf` |
| 停止ファイル・制御ソケット用領域 | `/run/garmyfriend-orangepi-zero2w/` |
| 機器専用プロフィール | `/etc/garmyfriend/live-broker.json`（garmyfriend所有・0600） |
| 現在のリリース | `/opt/garmyfriend/releases/arm64-live-voice-pose-20261104-r2` |
| 音声姿勢確認前のリリース | `/opt/garmyfriend/releases/arm64-live-body-prompt-20261103` |
| プロンプト更新前のリリース | `/opt/garmyfriend/releases/arm64-live-speaker-cue-20261103` |
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
- 2026-11-03、短期トークンの設定固定範囲を修正し、検証用・本番Cloud Run経由の実際のGemini Liveで
  「前進してください」「伏せて」を身体命令として受け取り、操作無効の理由を答えることを確認。
  「計画を前進させたい」は相談として応答し、身体操作ツールは呼びませんでした。
  この比較ではマイク・スピーカー・実機サーボを使わず、合成したテキストへの返答を確認しました。
- API修正は37件の自動テストと専用CIを通過し、検証用・本番それぞれで既存を含む12ルートを確認。
  本番は `hometeacher-api-00051-z58`、APIコミットは `dca1eb81b352cbf052e0385c44c0d3393bb5b598`。
- 同日、新しい会話指示を実機へ反映。適用した2ファイルのSHA-256一致、サービスの
  `active/running`・再起動回数0、`ready` → `listening` → `speaking` とLCD描画の継続を確認。
  このプロンプト更新時点では `GAR_FRIEND_LIVE_BODY=0` を保ち、サーボ設定・音声の合図音・配線CSVは変更していません。
- その後、利用者の開始姿勢確認を受け、現在の会話だけ身体操作を有効化。
  PCA9685を読み取りで確認し、4サーボの校正・有限動作データを検証。初回の読み取りに
  一時的な通信エラーが出たため再確認し、続く3回の読み取りは成功しました。
  有効化後はアプリの状態で `body.ready=true`、サービスの `active/running` と
  再起動回数0、`GAR_FRIEND_LIVE_BODY=1`、開始姿勢 `stand` を確認。
  利用者が音声で「伏せて」と指示し、実際に伏せたことを確認しました。
- 2026-11-04、音声で現在姿勢を確認する処理を常設。アプリの自動テストは39件成功・
  Linuxソケット専用1件はWindowsで対象外。姿勢未確認・誤った確認・同じ返答内での動作・
  停止・中断・動作失敗・再接続での古い姿勢の再利用を検証しました。
- 本番Cloud経由のGemini Liveで、挨拶時の姿勢確認、「はい」や「伏せて」だけでは
  確定しないこと、「今は立っています」の取り込み、その後の新しい「伏せて」で
  一度だけ仮の制御処理を呼ぶことを確認。停止後の「立って」は再確認を求めました。
  この試験ではマイク・スピーカー・実機サーボは使っていません。
- 実機へ反映後、サービスの `active/running`・再起動回数0、アプリの `body.ready=true`、
  `GAR_FRIEND_START_POSE=ask` と `ready` → `listening` → `speaking`、LCD描画継続を確認。
  旧一時drop-inを外し、再起動後にも残る常設drop-inと既存の校正CSVを使います。
  初回は接続後の導入確認で元に戻り、確認処理を見直して `-r2` へ反映しました。
- 利用者が実物の現在姿勢を音声で伝え、その後の新しい動作指示で実際に脚が動くことを確認。
  再接続時の状態破棄は模擬接続テストで確認し、実機の長時間運用での評価は今後行います。
