# Orange PiからWindows経由でインターネットへ接続

2026-11-02に実機で設定・確認しました。Orange PiのWi-Fiは使用せず、
PCとのUSBをRNDISネットワーク＋CDC ACMシリアルの複合デバイスとして使います。

```text
Orange Pi usb0            Windows USB adapter        Windows Wi-Fi
192.168.137.2/24  ─ USB ─ 192.168.137.1/24 ─ ICS NAT ─ ルーター ─ Internet
                 同じUSB上にシリアルコンソールも共存（現在COM9）
```

Windows標準のInternet Connection Sharing（ICS）によるNATです。
PCの外向きインターフェースから接続を共有し、Orange PiをルーターのLANへ直接接続
する構成ではありません。PCの電源・USB接続・外向き回線が必要です。

## 今回の設定

| 項目 | 値 |
| --- | --- |
| Orange Pi | `192.168.137.2/24`、interface `usb0` |
| デフォルトゲートウェイ・DNS | `192.168.137.1`（Windows ICS） |
| WindowsのUSB側 | 現在の名前は「イーサネット 4」、`192.168.137.1/24` |
| Windowsの外向き回線 | Wi-Fi |
| SSH | `user@192.168.137.2` |
| USBコンソール | 現在COM9 / 115200bps。旧g_serialではCOM8だった |

WindowsがMicrosoftのRNDISドライバーとUSBシリアルドライバーを自動選択しました。
ドライバーの新規ダウンロードや、ファイアウォール全体の無効化は行っていません。
以前は未接続の有線LANへICSを向けていましたが、USB側へ変更しました。

## 基板側の永続設定

- `sources/board-orangepi-zero2w/assets/usb-link.sh` を
  `/usr/local/sbin/gar-usb-link` へ配置。
- 同repoのunitを `/etc/systemd/system/gar-usb-link.service` へ配置し、有効化。
- `/etc/modules-load.d/usb-serial.conf` の旧 `g_serial` 自動ロードを停止。
  原本は `/var/lib/gar-usb-link/backup/usb-serial.conf` に保存。
- `/etc/modules-load.d/gar-usb-link.conf` で `libcomposite` をロード。
- `/etc/systemd/network/00-gar-usb-link.network` で上記アドレス・DNS・経路を設定。
- `serial-getty@ttyGS0.service` は維持。

systemd-networkdの設定は以下です。サブネットを変える場合はWindows側と揃えます。

```ini
[Match]
Name=usb0

[Link]
RequiredForOnline=no

[Network]
Address=192.168.137.2/24
DNS=192.168.137.1
Domains=~.
DNSDefaultRoute=yes
ConfigureWithoutCarrier=yes

[Route]
Gateway=192.168.137.1
Metric=20
```

移行はsystemdの独立したプロセスから実行し、6分後に旧シリアルへ戻す一時タイマーを
用意しました。SSH接続成功後に確認マーカーを保存したため、今回は復旧処理を実行しません。
顔アプリ・サーボ制御・液晶の設定は変更していません。

## Windows側の設定と再接続

ICSの外向きをWi-Fi、内向きをOrange PiのUSBネットワークへ設定しました。
端子名・GUIDはPC依存なので他のPCへコピーしません。

このPCではICS切替時に `0x80040201` が発生しました。管理者権限でWinNatを起動し、
SharedAccessを再起動した後に共有を再設定すると解消しました。別の共有先が使用中なら、
その用途を確認してから変更してください。Hyper-V/FSEやVirtualBoxのアダプター設定は
変更していません。

SharedAccessの自動起動と `EnableRebootPersistConnection=1` も設定しています。
これは[MicrosoftのICS設定保持の手順](https://learn.microsoft.com/en-us/troubleshoot/windows-client/networking/ics-not-work-after-computer-or-service-restart)
を参考にした設定です。記事の対象はWindows 10で、このPCのWindows 11での再起動後の
復元はまだ検証していません。PC・基板の再起動は今回行っていません。

設定変更前の共有先・IPv4・経路・service起動設定は、ローカルの `.gar/network/` に
保存しています。SSH鍵、接続先の個体識別情報、検証ログも同じ場所に保存し、Gitには含めません。
SSH用公開鍵はUSBコンソール経由で登録し、接続元をWindows USB側のIPへ制限しました。
ホスト鍵も同じUSBコンソールで取得して照合しています。

## 確認コマンド

Orange Pi上で実行します。

```sh
ip -br address show usb0
ip route
resolvectl status usb0
curl -I --max-time 15 https://example.com
curl -I --max-time 15 https://generativelanguage.googleapis.com/v1beta/models
timedatectl show -p NTPSynchronized
```

今回の結果:

- PC→Orange PiのSSH接続成功。
- `example.com` と `generativelanguage.googleapis.com` の名前解決成功。
- example.comはHTTPS 200、Geminiのmodels endpointはHTTPS 403。
  後者はAPIキーを送っていない状態での到達確認で、認証済みAPI呼び出しではありません。
- TLS証明書検証を有効にしたまま接続成功。
- NTP同期成功。基板のずれていた時刻も修正された。
- USB複合デバイスservice、既存の顔service、時刻同期serviceはactive。

Gemini Live接続やAPIキー設定、USB音声機器の確認は次の段階です。
