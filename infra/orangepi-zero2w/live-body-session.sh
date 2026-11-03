#!/bin/sh
# Product deployment: arm one conversation using a freshly confirmed pose.
set -eu
test "$(id -u)" = 0
test "$(uname -m)" = aarch64
tr -d '\000' < /proc/device-tree/model | grep -q 'OrangePi Zero 2W'
test "$#" = 1
pose=$1
case "$pose" in stand|lie|off) ;; *) echo 'Usage: live-body-session.sh stand|lie|off'; exit 2;; esac
base=/opt/garmyfriend/app
dropin=/run/systemd/system/garmyfriend.service.d/90-live-body-session.conf
runtime=/run/garmyfriend-live-body
node=/opt/garmyfriend/node/bin/node
native=$base/build/composed-arm64/gar-servoctl
hardware=$base/hardware/orangepi-zero2w
test -x "$node"
test -x "$native"
test ! -e /etc/systemd/system/garmyfriend.service.d/90-live-body-voice.conf
if test "$pose" = off; then
    test -f "$dropin"
    grep -q '^# Managed GarMyFriend single body session$' "$dropin"
    systemctl stop garmyfriend.service
    rm -- "$dropin"
    systemctl daemon-reload
    systemctl start garmyfriend.service
    echo 'Returned to face/audio conversation; body tools disabled'
    exit 0
fi
test ! -e "$dropin"
test ! -e "$runtime"
"$native" --i2c-config "$hardware/i2c.csv" --servo-config "$hardware/servo-calibration.csv" validate
probe_ready=0
for attempt in 1 2 3; do
    if "$native" --i2c-config "$hardware/i2c.csv" --servo-config "$hardware/servo-calibration.csv" probe; then probe_ready=1; break; fi
    sleep 1
done
test "$probe_ready" = 1
"$node" - "$base" "$hardware" "$pose" <<'NODE'
const path=require('node:path');
const [base,hardware,from]=process.argv.slice(2);
const {loadBodyMotions,planBodyMotion}=require(path.join(base,'sources/gar-my-friend/application/body-motion.cjs'));
const body=loadBodyMotions(hardware);
for(const mode of ['forward','backward','lie','stand'])planBodyMotion(body,mode,{from});
console.log('Calibrated finite motion plans validated without moving the servos');
NODE
changed=0
rollback() {
    status=$?
    if test "$status" != 0 && test "$changed" = 1; then
        systemctl stop garmyfriend.service || true
        rm -f -- "$dropin"
        systemctl daemon-reload
        systemctl start garmyfriend.service || true
        echo 'Body setup failed; restored face/audio conversation'
    fi
}
trap rollback EXIT
changed=1
systemctl stop garmyfriend.service
install -d -m 0750 -o garmyfriend -g garmyfriend "$runtime" /run/garmyfriend-orangepi-zero2w
for name in i2c.csv servo-calibration.csv body-motions.csv; do
    install -m 0640 -o garmyfriend -g garmyfriend "$hardware/$name" "$runtime/$name"
done
python3 - "$hardware/effects.csv" "$runtime/effects.csv" <<'PY'
import csv, sys
with open(sys.argv[1], newline='') as source:
    reader = csv.DictReader(source)
    fields, rows = reader.fieldnames, list(reader)
servos = [row for row in rows if row['kind'] == 'servo']
if len(servos) != 1 or servos[0]['enabled'] != '0':
    raise SystemExit('Expected the installed face-only servo configuration')
servos[0]['enabled'] = '1'
with open(sys.argv[2], 'w', newline='') as target:
    writer = csv.DictWriter(target, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)
PY
chown garmyfriend:garmyfriend "$runtime/effects.csv"
chmod 0640 "$runtime/effects.csv"
install -m 0600 -o garmyfriend -g garmyfriend /dev/null "$runtime/confirmed-$pose"
install -d -m 0755 /run/systemd/system/garmyfriend.service.d
cat > "$dropin" <<CONF
# Managed GarMyFriend single body session
[Service]
Restart=no
SupplementaryGroups=i2c
RuntimeDirectory=garmyfriend-orangepi-zero2w garmyfriend-live-body
RuntimeDirectoryMode=0750
Environment=GAR_FRIEND_LIVE_BODY=1
Environment=GAR_FRIEND_START_POSE=$pose
Environment=GAR_EFFECTS_DIR=$runtime
Environment=GAR_FRIEND_CONTROL_SOCKET=$runtime/control.sock
ExecStartPre=/usr/bin/test -f $runtime/confirmed-$pose
ExecStartPre=/usr/bin/rm $runtime/confirmed-$pose
CONF
chmod 0644 "$dropin"
systemctl daemon-reload
started=$(date '+%Y-%m-%d %H:%M:%S')
systemctl start garmyfriend.service
ready=0
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22; do
    if systemctl is-active --quiet garmyfriend.service && journalctl -u garmyfriend.service --since "$started" --no-pager -o cat | grep -q 'Live audio: ready'; then ready=1; break; fi
    sleep 2
done
test "$ready" = 1
"$node" - "$base" "$runtime/control.sock" <<'NODE'
const path=require('node:path');
const [base,socket]=process.argv.slice(2);
const {requestControl}=require(path.join(base,'sources/gar-my-friend/application/friend-control.cjs'));
requestControl(socket,{type:'state'}).then(state=>{
  if(!state.body.ready)throw new Error('Servo output was not enabled');
  console.log(JSON.stringify(state));
}).catch(error=>{console.error(error.message);process.exitCode=1;});
NODE
test ! -e "$runtime/confirmed-$pose"
printf 'Body tools enabled for this session from the confirmed %s pose. No test motion was requested.\n' "$pose"
printf 'After disconnection, confirm the pose again. Reboot restores face/audio-only startup.\n'
