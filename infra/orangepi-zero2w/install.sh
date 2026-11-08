#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
if [ ! -x "$ROOT/install" ]; then
  echo "Install a generated Product bundle; see docs/COMPOSITION.md" >&2
  exit 2
fi
exec sh "$ROOT/install"
