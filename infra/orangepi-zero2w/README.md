# Orange Pi Zero 2W の実機用構成

基板の資源・OS・toolchain・起動順は`sources/board-orangepi-zero2w/`が所有します。
Productの指定は`product.json`と`hardware/orangepi-zero2w/`に残します。
`build.sh`と`install.sh`は共有処理への互換入口です。[構成と新しい生成物](../../docs/COMPOSITION.md)を参照してください。

この分離後の構成では実機へ再導入していません。従来の配線・顔表示・ノブ操作の確認は
`hardware/WIRING.md`に保存し、新しい導入経路の検証と区別します。
