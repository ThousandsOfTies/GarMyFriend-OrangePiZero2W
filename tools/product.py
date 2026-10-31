"""Product entry point for the pinned, application-neutral composition tools."""
from pathlib import Path
import runpy
import sys

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "sources/gar-tools/composition/cli.py"
sys.argv = [str(CLI), "--root", str(ROOT), *sys.argv[1:]]
runpy.run_path(str(CLI), run_name="__main__")
