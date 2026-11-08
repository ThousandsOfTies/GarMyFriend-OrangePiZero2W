#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
python3 "$ROOT/tools/product.py" build
python3 "$ROOT/tools/product.py" package --output artifacts/from-codespace
