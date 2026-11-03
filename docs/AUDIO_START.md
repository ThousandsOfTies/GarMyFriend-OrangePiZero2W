# 返事の話し始めが小さい場合の比較

2026-11-03、利用者から「返事のたびに、話し始めが小さく聞き取りにくい」との報告がありました。
原因は現時点では確定していません。全体の音量を上げず、出力の立ち上がりを比較しています。

## 調べたこと

- 実機のUSB機器は `power/control=on`、`runtime_status=active` でした。
  OSによるUSB autosuspendが有効な状態ではありませんでした。
- 既存のALSA出力は、返事ごとに `aplay` を起動し、終了時にデバイスを閉じます。
- スピーカーのALSA音量は30%。マイクの取得は継続しています。
- Geminiからテスト用の短文を受け取り、音声ファイルへ保存せずPCMの区間レベルだけを計算しました。
  この一例では冒頭約100msで通常の発声レベルまで上がり、クリッピングはありませんでした。
  利用者の実際の会話を録音・解析したものではなく、全返答の先頭が正常と結論するデータではありません。

## 比較した設定

1. 声の前に250msの無音を追加。実機へ反映しましたが、利用者の評価は「あまり変わらない」でした。
2. 利用者の希望により、250msの先行区間の最初に短く控えめな合図音を追加しました。
   利用者の評価は「合図音は聞こえないが、少しはよくなった気がする」でした。
   現在はこちらを試験設定として維持しています。明確な改善や原因の確定には至っていません。

現在の合図音は660Hz・80msで、5msの立ち上がりと減衰を持ちます。
PCMの最大振幅をフルスケールの5%以内にし、残り170msは無音です。
声のサンプル・音量は変更せず、返事の先頭にこの区間だけを付けます。
再生の開始は約0.25秒遅くなります。会話・表情・口パク・割り込みの仕組みは従来のものを使います。

設定の正本は [80-speaker-lead-in.conf](../infra/orangepi-zero2w/80-speaker-lead-in.conf) です。
実機では `/etc/systemd/system/garmyfriend.service.d/80-speaker-lead-in.conf` に配置しました。

```ini
[Service]
Environment=GAR_AUDIO_PLAYBACK_LEAD_IN_MS=250
Environment=GAR_AUDIO_PLAYBACK_CUE=1
```

合図音だけを外す場合は `GAR_AUDIO_PLAYBACK_CUE=0`、先行区間も外す場合は
さらに `GAR_AUDIO_PLAYBACK_LEAD_IN_MS=0` にして、サービスを再起動します。
編集・再起動には実機の管理者認証が必要です。

## 所有範囲と確認

- gar-toolsの `AlsaDuplex` が `playbackLeadInMs` / `playbackCue` を扱います。
  既定は0ms・合図音なしで、他のProductの再生には自動適用しません。
- gar-my-friendが環境変数を検証し、共有ALSAへ渡します。
- Productの上記drop-inが、今回の機器に使う値を選びます。
- 自動テスト7件で、声のバイト列の保持、返事ごとの一回だけの先行区間、合図音の振幅上限、
  キャンセル後に音が残らないこと、キュー上限・設定範囲を確認しました。
- 実機の導入後、`active/running`、再起動回数0、Live接続・再生終了・液晶描画の継続を確認しました。

現在のリリースは `/opt/garmyfriend/releases/arm64-live-speaker-cue-20261103`。
無音のみの試験版 `/opt/garmyfriend/releases/arm64-live-speaker-8c501fc-20261103` と、
先行区間なしの前版 `/opt/garmyfriend/releases/arm64-live-usb-mic-67ff119-20261103` は復元用に保持しています。
