# WebPanelでGemini Liveと会話する

PCのマイク・スピーカーをUSB音声機器の代わりに使い、Gemini Liveと会話しながら
VM内の顔・4サーボを操作します。Orange Pi実機の音声接続やサーボへは送信しません。

## 起動と操作

構築済みの専用VMがある環境では、次でローカルWebPanelを開きます。

```powershell
npm run vm:start
npm run vm:open
```

1. `http://127.0.0.1:8773/` の「声で話しかける」を開きます。
2. Gemini APIキーを画面の欄へ入力します。DeContradictorで使っているキーも、
   同じモデルの利用権限・割当があれば利用できます。
3. 「会話を始める」を押し、マイクの許可を求められたら許可します。
4. 挨拶が聞こえたら、普通に話しかけます。「うれしい顔をして」「伏せてみて」
   「立ち上がって」などを試せます。「文字でも話しかける」も使用できます。
5. 「停止」でマイク、再生、接続を終了し、VMの身体を停止します。

マイクのミュートと再生音量は、USBスピーカーフォン部品の中で操作します。
マイク・スピーカーはPCの既定デバイスを使います。マイクは16kHz mono PCM、
返答はGeminiが生成する24kHz mono PCMです。今回の会話経路にOpen JTalkは使いません。
音声はGeminiへ送信され、APIの利用料金・割当の対象です。

既定は `gemini-3.8-live` / `Puck` です。「接続設定」で変更できます。
接続できない場合はAPIキー、モデルの利用可否・割当、PCの音声設定を確認します。
マイクにはlocalhostまたはHTTPSが必要です。アプリ内ブラウザでマイクが利用できない
場合は、同じローカルURLをEdge/Chromeで開いて確認します。

APIキーはこの接続にだけ使います。開始時に入力欄を空にし、localStorage、
サーバー、ログ、Gitには保存しません。停止・再読み込み後は再入力します。
会話の文字起こしは画面内に最大12件表示し、再接続すると消去します。

## データフローと責務

```text
PCマイク → 共通speakerphone部品 → 共通Gemini Live接続 → Gemini
PCスピーカー ← 同部品のPCM再生 ← 返答の音声 ←──────────┘
                                    ↓ Function Calling
                       ProductのHTTP adapter（仮想環境限定）
                                    ↓ private Unix socket
                       実行中のgar-my-friendアプリ
                          ├ 表情・口パク → C++描画 → 仮想SPI
                          └ 身体モード → native C → 仮想I2C
                                    ↓ Bridge
                       WebPanelの液晶・PCA9685・SG90表示
```

| 所有先 | 実装 |
| --- | --- |
| gar-tools | `speakerphone.mjs` / `audio-capture-worklet.js` / `audio-pcm.mjs` に部品の姿、マイク・再生・ミュート・音量。`gemini-live.mjs` にDOM非依存の接続・音声・割り込み・Function Calling通信 |
| gar-my-friend | `friend-control.cjs` に基本指示、表情候補、ツールの検査・実行。`FriendRuntime` / `FaceRuntime` が表情と動作を決定 |
| Product | `simulator/live.js` が音声部品と接続・ローカルadapterを結線。`simulation/live-controller.cjs` が1会話の利用権・期限を管理。`prepare-effects.cjs` が仮想I2CとProduct校正CSVを束ねる |

Geminiへ公開するツールは `change_emotion`、`move_body`、`get_friend_state` だけです。
表情候補は共通のexpressions.jsonから生成し、身体は5モードに限定します。
動作の開始姿勢はWebPanelの選択値を渡し、LLMに角度やPWMを指定させません。
現在の姿勢表示は仮想の命令履歴であり、実機の姿勢センサーによる計測ではありません。

身体は手動ボタンも会話ツールも、同じアプリのServoOutputへ入ります。
通常の手動命令は開始を返し、会話ツールは動作完了・PWM OFFを待ってから結果を返します。
停止は実行中の動作に割り込みます。重複した同じツールIDは再実行しません。
口パクはPCの実際の再生開始・終了をアプリへ通知します。周期アニメーションであり、
音素・波形に合わせた厳密なリップシンクではありません。

## WebPanelの通信量

通常表示では `/api/events` のSSE接続1本を使い、状態と液晶画像をサーバーから通知します。
`/api/state`・`/api/io/frame` を繰り返し取得するブラウザ側のポーリングはありません。
VM側は200ms間隔で最新出力を確認し、変化した状態・画素だけを最大5回/秒で送ります。
圧縮に対応したブラウザへはgzipで送り、遅い接続に無制限の再生・表示待ちを蓄積しません。
同じPWMを再受信してもPCA9685・サーボを描き直しません。タブを隠すと表示通知を切断し、
再表示で最新の状態・画面から再開します。診断用の状態・画像GETは引き続き使用できます。

会話中の3秒ごとのheartbeat、操作時のPOST、Geminiとの音声WebSocketは別の通信です。
表示用接続を閉じても、会話のheartbeatは継続します。

## 終了と制限

- 同じVMで同時に使える会話は1件です。別タブの同時開始は拒否します。
- heartbeatは3秒ごと、15秒以上途切れると再生状態を解除し、仮想の身体を停止します。
- ページを閉じる・停止・切断時はマイクtrack、AudioContext、再生キューを解放します。
  マイク切断、接続失敗、再生遅延も画面へ通知します。
- Geminiから発話への割り込みが届いたら、未再生音声を破棄します。
  ツールの取消通知が来た場合も身体を停止します。
- 入出力のキューとメッセージ、ツール実行回数は上限付きです。
  音声は生成が再生より先行するため、最大60秒分を順番に再生します。
  停止理由は次の開始操作まで画面に残し、定期的な状態確認で消しません。
  セッションの自動再開・長期会話記憶はまだ実装していません。
- Windows上の静的な単体起動から、実機や物理I2Cへ操作を回す経路はありません。
- 今回はWebPanelでの接続を実装しました。Orange Pi上のALSA連続入出力への接続は次の段階です。

## 検証

```powershell
npm test
node --test sources/gar-tools/web-simulator/tests/audio-live.test.mjs
$env:GAR_PANEL_URL='http://127.0.0.1:8773/'
npm run test:live
npm run test:vm
```

共通部品は `sources/gar-tools/web-simulator/examples/audio-parts/` で、音量設定の異なる
2個を並べ、マイク・ミュート・再生・停止が独立することを確認します。

自動試験では実マイク・クラウドAPIを使わず、ブラウザのfake-mediaと模擬WebSocketで
検証しています。VM試験は実際のアプリ、Unix socket、native C、CUSE I2C/SPIを使用し、
身体の動作・停止・PWM OFF・液晶画素まで確認します。
実際のGeminiとの会話品質・回り込み・API利用可否は利用者のキーと音声機器で確認します。

## マイクの許可エラー

`permission denied by system` はGemini接続前のマイク取得で発生します。
Windowsと使用ブラウザのマイク許可を確認してください。内蔵ブラウザで拒否される場合は、
同じURLをEdgeで開いて試せます。マイクの準備に失敗した場合は、入力欄のAPIキーを消さず
再試行できます。キーを保存・ログ出力する処理はありません。
