#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
exec python3 "$ROOT/sources/gar-tools/composition/runtime.py" --root "$ROOT" --archive "${1:?Pass the Product-selected official Node archive}"
