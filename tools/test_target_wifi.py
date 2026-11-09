"""Offline guard against turning a read-only check into serial provisioning."""

import contextlib
import io
import runpy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


class WifiArgumentsTests(unittest.TestCase):
    def test_serial_check_is_rejected_before_configuration_or_process_access(self):
        with (
            patch.object(
                sys, "argv", ["target-wifi.py", "--check", "--transport", "serial"]
            ),
            patch.object(Path, "read_text") as read,
            patch("subprocess.call") as call,
            contextlib.redirect_stderr(io.StringIO()),
            self.assertRaises(SystemExit) as caught,
        ):
            runpy.run_path(
                str(Path(__file__).with_name("target-wifi.py")), run_name="__main__"
            )
        self.assertEqual(caught.exception.code, 2)
        read.assert_not_called()
        call.assert_not_called()


if __name__ == "__main__":
    unittest.main()
