#!/bin/sh
set -eu
APP=/home/gar/GarMyFriend-OrangePiZero2W
RUNTIME="$APP/sources/gar-tools/targets/linux-device/runtime"
export GAR_HARDWARE_DIR="$APP/hardware"
GPIO_CHIP=$(node "$APP/sources/gar-my-friend/application/hardware.cjs" --value chip)
SPI_DEVICE=$(node "$APP/sources/gar-my-friend/application/hardware.cjs" --value spi)
LCD_DC=$(node "$APP/sources/gar-my-friend/application/hardware.cjs" --value dc)
I2C_DEVICE=$(python3 -c 'import csv,sys; print(next(csv.DictReader(open(sys.argv[1])))["dev"])' "$APP/hardware/i2c.csv")
test "$I2C_DEVICE" = /dev/i2c-10
modprobe cuse
modprobe gpio-sim
mountpoint -q /sys/kernel/config || mount -t configfs none /sys/kernel/config
CHIP=/sys/kernel/config/gpio-sim/garmyfriend
if [ ! -d "$CHIP" ]; then
  mkdir "$CHIP" "$CHIP/gpio-bank0"
  echo 32 > "$CHIP/gpio-bank0/num_lines"
  echo garmyfriend > "$CHIP/gpio-bank0/label"
  echo 1 > "$CHIP/live"
fi
test -c "$GPIO_CHIP"
test "$(cat "$CHIP/gpio-bank0/chip_name")" = "${GPIO_CHIP#/dev/}"
install -d -o gar -g gar -m 0750 /run/gar-myfriend
export GAR_HW_SIM_SOCK=/run/gar-myfriend/hw_sim.sock
export GAR_RUNTIME_DIR=/run/gar-myfriend
export GAR_BRIDGE_HOST=127.0.0.1
export GAR_BRIDGE_PORT=8080
pids=""
cleanup() { for pid in $pids; do kill "$pid" 2>/dev/null || true; done; wait || true; }
trap cleanup EXIT INT TERM
python3 -B "$RUNTIME/web-bridge/bridge.py" & pids="$pids $!"
attempt=0
while [ ! -S "$GAR_HW_SIM_SOCK" ]; do
  attempt=$((attempt+1)); [ "$attempt" -lt 100 ] || exit 1; sleep 0.1
done
"$APP/build/cuse_spi_gc9a01" -f -s --devname="${SPI_DEVICE#/dev/}" --dc-line="$LCD_DC" & pids="$pids $!"
"$APP/build/cuse_i2c" -f -s --devname="${I2C_DEVICE#/dev/}" & pids="$pids $!"
attempt=0
while [ ! -c "$SPI_DEVICE" ] || [ ! -c "$I2C_DEVICE" ]; do
  attempt=$((attempt+1)); [ "$attempt" -lt 100 ] || exit 1; sleep 0.1
done
chgrp gar "$GPIO_CHIP" "$SPI_DEVICE" "$I2C_DEVICE"
chmod 0660 "$GPIO_CHIP" "$SPI_DEVICE" "$I2C_DEVICE"
systemd-notify --ready
while :; do
  for pid in $pids; do kill -0 "$pid" 2>/dev/null || exit 1; done
  sleep 1
done
