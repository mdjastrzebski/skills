"""Exercise the Node 18+ record CLI with python3 scripts/test-spec-record.py."""
import hashlib
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "skills/prepare-spec/scripts/spec-record.mjs"
APPROVAL = ["--revision", "2", "--approved-by", "user approved summary in chat",
            "--approved-at", "2026-11-22T09:00:00Z", "--base-sha", "abc123"]


class SpecRecordTest(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.file = Path(directory.name) / "SPEC.md"

    def invoke(self, command, *args, expected=0):
        result = subprocess.run(["node", SCRIPT, command, self.file, *args],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, expected, result.stderr)
        if expected == 0:
            return json.loads(result.stdout)

    def test_normalization_and_edits(self):
        body = "# Spec: Example\n\nAn example\n<!-- spec-record\nrevision: 8\n-->\n"
        self.file.write_bytes(("\r" + body.replace("\n", " \t\r") + "\r\r").encode())
        digest = hashlib.sha256(body.encode()).hexdigest()
        self.assertEqual(self.invoke("check"),
                         {"record": None, "hash_matches": None, "spec_sha256": digest})
        stamped = self.invoke("stamp", *APPROVAL, "--branch", "")
        self.assertTrue(stamped["hash_matches"])
        self.assertEqual(stamped["record"]["branch"], "")
        self.assertEqual(stamped["record"]["revision"], "2")
        self.assertEqual(stamped["record"]["spec_sha256"], digest)
        stored = self.file.read_bytes()
        self.assertTrue(stored.endswith(b"\n\n" + body.encode()))
        self.file.write_bytes(b" \n" + stored.replace(b"\n", b" \t\r\n") + b"\r\n")
        self.assertEqual(self.invoke("check"), stamped)
        self.assertEqual(self.invoke("stamp", *APPROVAL, "--branch", ""), stamped)
        self.assertEqual(self.file.read_bytes(), stored)
        self.file.write_bytes(stored.replace(b"An example", b"An edit"))
        self.assertFalse(self.invoke("check")["hash_matches"])
        issue = self.invoke("stamp", *APPROVAL)
        self.assertTrue(issue["hash_matches"])
        self.assertNotIn("branch", issue["record"])

    def test_invalid_inputs(self):
        self.invoke("check", expected=1)
        self.file.write_text("draft")
        for key, value in [("--revision", "1.2"), ("--approved-by", "A\nB"),
                           ("--base-sha", "x-->y"), ("--approved-at", "2026-02-30T12:34:56Z"),
                           ("--approved-at", "2026-01-01T12:00:00+00:00")]:
            args = APPROVAL.copy()
            args[args.index(key) + 1] = value
            self.invoke("stamp", *args, expected=2)
        for args in [APPROVAL[:-2], [*APPROVAL, "--unknown", "x"], [*APPROVAL, "--branch"]]:
            self.invoke("stamp", *args, expected=2)
        self.invoke("check", "--branch", "x", expected=2)
        self.assertEqual(self.file.read_text(), "draft")


if __name__ == "__main__":
    unittest.main()
