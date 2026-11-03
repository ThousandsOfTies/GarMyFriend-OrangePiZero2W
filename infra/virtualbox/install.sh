#!/bin/sh
set -eu
cd /home/gar/GarMyFriend-OrangePiZero2W
mkdir -p build /home/gar/.config/garmyfriend
make -B -C sources/gar-tools/targets/linux-device/runtime/gc9a01-stub CC=gcc BIN=/home/gar/GarMyFriend-OrangePiZero2W/build/cuse_spi_gc9a01
make -B -C sources/gar-tools/targets/linux-device/runtime/i2c-stub CC=gcc BIN="$PWD/build/cuse_i2c"
GAR_BUILD_SERVO=1 GAR_TOOLS_ROOT="$PWD/sources/gar-tools" GAR_BUILD_DIR="$PWD/build" CC=gcc CXX=g++ sh sources/gar-my-friend/tools/build-native.sh
sudo install -m 0644 infra/virtualbox/garmyfriend.service /etc/systemd/system/
sudo install -m 0644 infra/virtualbox/garmyfriend-panel.service /etc/systemd/system/
sudo install -m 0644 infra/virtualbox/garmyfriend-devices.service /etc/systemd/system/
sudo install -m 0644 infra/virtualbox/garmyfriend-tunnel.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable garmyfriend.service garmyfriend-panel.service
# Remove obsolete Product modules and the old actuator configuration on upgrades.
rm -f simulation/runtime.cjs simulation/linux-devices.cjs simulation/rotary-input.cjs
rm -f hardware/modules.json hardware/pin-plan.json
sudo systemctl restart garmyfriend-devices.service
node simulation/prepare-effects.cjs
sudo systemctl restart garmyfriend.service
sudo systemctl restart garmyfriend-panel.service
sudo systemctl --no-pager --full status garmyfriend.service garmyfriend-panel.service garmyfriend-devices.service
