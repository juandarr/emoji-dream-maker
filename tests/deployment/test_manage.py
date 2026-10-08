"""Exercise the real journal/filesystem/SQLite recovery path without Docker.

The harness substitutes container commands only. Real SQLite online backups,
durable state writes, quarantine, and database replacement are used by tests.
The separate container smoke test exercises native bindings and actual images.
"""
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("deploy_manage", Path(__file__).resolve().parents[2] / "deploy/manage.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
Error = module.DeploymentError
REPO = "ghcr.io/juandarr/emoji-dream-maker"
OLD = {"image": REPO + "@sha256:" + "a" * 64, "revision": "a" * 40, "schema": 3}
NEW = {"image": REPO + "@sha256:" + "b" * 64, "revision": "b" * 40, "schema": 3}


class PowerLoss(BaseException):
    pass


def write(path, value):
    with sqlite3.connect(path) as db:
        db.execute("UPDATE payload SET value=?", (value,))


def read(path):
    with sqlite3.connect(path) as db:
        return db.execute("SELECT value FROM payload").fetchone()[0]


class Harness(module.Manager):
    def __init__(self, root):
        super().__init__(root)
        self.events = []
        self.bad_health = set()
        self.fail_preflight = False
        self.fail_snapshot = False
        self.crash_start = False
        self.crash_open = False
        self.schema = 3
        self.bad_gate = False

    def command(self, *arguments, **kwargs):
        self.events.append(arguments)
        return ""

    def pull(self, reference=None):
        return NEW

    def preflight(self, candidate, restore_from=None):
        self.events.append("preflight")
        if self.fail_preflight:
            raise Error("clone rejected")

    def check_database(self, path, image):
        with sqlite3.connect(path) as db:
            if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise Error("integrity failed")
        return {"migrations": [1, 2, self.schema]}

    def snapshot(self, image, destination):
        self.events.append("snapshot")
        if self.fail_snapshot:
            raise Error("backup disk unavailable")
        with sqlite3.connect(self.data / "accounts.sqlite") as source, sqlite3.connect(destination) as target:
            source.backup(target)
        return destination

    def stop(self):
        if not self.flag.exists():
            raise AssertionError("stop must happen after maintenance closes")
        self.events.append("stop")

    def require_maintenance(self):
        if not self.flag.exists():
            raise AssertionError("Caddy gate must be closed")
        if self.bad_gate:
            raise Error("Caddy configuration does not serve maintenance")

    def start(self, image):
        if not self.flag.exists():
            raise AssertionError("migration must happen while maintenance is closed")
        self.events.append(("start", image["revision"]))
        if image == NEW:
            write(self.data / "accounts.sqlite", "migration changed data")
            if self.crash_start:
                raise PowerLoss()

    def health(self, image, name="dreammaker-app"):
        if image["revision"] in self.bad_health:
            raise Error("unhealthy image")

    def maintenance(self, active):
        super().maintenance(active)
        if not active and self.crash_open:
            write(self.data / "accounts.sqlite", "new user write after reopen")
            raise PowerLoss()


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for name in ("control", "data", "cache", "backups"):
            (self.root / name).mkdir()
        config = {"repository": REPO, "data_dir": str(self.root / "data"), "cache_dir": str(self.root / "cache"), "backup_dir": str(self.root / "backups")}
        (self.root / "deployment.json").write_text(json.dumps(config))
        (self.root / "app.env").write_text("# private test file")
        self.db = self.root / "data/accounts.sqlite"
        with sqlite3.connect(self.db) as db:
            db.execute("CREATE TABLE payload(value TEXT)")
            db.execute("INSERT INTO payload VALUES('existing accounts and creations')")
        self.manager = Harness(self.root)
        self.manager.state = {"current": OLD}
        self.manager.save()

    def test_success_commits_before_reopening_and_keeps_verified_snapshot(self):
        self.manager.deploy(NEW)
        self.assertEqual(self.manager.state["current"], NEW)
        self.assertEqual(self.manager.state["previous"], OLD)
        self.assertNotIn("transaction", self.manager.state)
        self.assertFalse(self.manager.flag.exists())
        backup = self.manager.backups / self.manager.state["last_backup"]
        self.assertEqual(read(backup), "existing accounts and creations")

    def test_preflight_failure_leaves_live_database_and_service_untouched(self):
        self.manager.fail_preflight = True
        with self.assertRaises(Error):
            self.manager.deploy(NEW)
        self.assertEqual(self.manager.events, ["preflight"])
        self.assertEqual(read(self.db), "existing accounts and creations")
        self.assertEqual(self.manager.state["blocked"], NEW["image"])
        self.assertFalse(self.manager.flag.exists())

    def test_backup_failure_does_not_start_candidate_or_replace_live_data(self):
        self.manager.fail_snapshot = True
        with self.assertRaises(Error):
            self.manager.deploy(NEW)
        self.assertNotIn(("start", NEW["revision"]), self.manager.events)
        self.assertEqual(read(self.db), "existing accounts and creations")
        self.assertFalse(self.manager.flag.exists())

    def test_unloaded_caddy_gate_prevents_stop_migration_and_restore(self):
        self.manager.bad_gate = True
        with self.assertRaises(Error):
            self.manager.deploy(NEW)
        self.assertEqual(self.manager.events, ["preflight"])
        self.assertEqual(read(self.db), "existing accounts and creations")
        self.assertEqual(Harness(self.root).state["transaction"]["phase"], "draining")
        # Repairing the site permits journal recovery without candidate writes.
        self.manager.bad_gate = False
        self.manager.recover()
        self.assertEqual(read(self.db), "existing accounts and creations")
        self.assertFalse(self.manager.flag.exists())

    def test_unhealthy_candidate_restores_database_and_previous_image_before_open(self):
        self.manager.bad_health.add(NEW["revision"])
        with self.assertRaises(Error):
            self.manager.deploy(NEW)
        self.assertEqual(read(self.db), "existing accounts and creations")
        self.assertEqual(self.manager.state["current"], OLD)
        self.assertIn(("start", OLD["revision"]), self.manager.events)
        self.assertFalse(self.manager.flag.exists())
        self.assertTrue(list(self.manager.backups.glob("quarantine-*/accounts.sqlite")))

    def test_schema_mismatch_triggers_preopen_database_restore(self):
        self.manager.schema = 4
        with self.assertRaises(Error):
            self.manager.deploy(NEW)
        self.assertEqual(read(self.db), "existing accounts and creations")
        self.assertEqual(self.manager.state["current"], OLD)

    def test_power_loss_during_migration_is_recovered_using_persisted_journal(self):
        self.manager.crash_start = True
        with self.assertRaises(PowerLoss):
            self.manager.deploy(NEW)
        restarted = Harness(self.root)
        self.assertEqual(restarted.state["transaction"]["phase"], "migrating")
        self.assertEqual(read(self.db), "migration changed data")
        restarted.recover()
        self.assertEqual(read(self.db), "existing accounts and creations")
        self.assertNotIn("transaction", restarted.state)
        self.assertFalse(restarted.flag.exists())

    def test_power_loss_after_reopen_never_rewinds_user_writes(self):
        self.manager.crash_open = True
        with self.assertRaises(PowerLoss):
            self.manager.deploy(NEW)
        restarted = Harness(self.root)
        self.assertEqual(restarted.state["transaction"]["phase"], "committed")
        # Simulate restarting this image without changing user data.
        with patch.object(restarted, "start"):
            restarted.recover()
        self.assertEqual(read(self.db), "new user write after reopen")
        self.assertFalse(restarted.flag.exists())
        self.assertNotIn("transaction", restarted.state)

    def test_unhealthy_committed_image_pauses_without_rewinding_database(self):
        self.manager.crash_open = True
        with self.assertRaises(PowerLoss):
            self.manager.deploy(NEW)
        restarted = Harness(self.root)
        restarted.bad_health.add(NEW["revision"])
        with patch.object(restarted, "start"), self.assertRaises(Error):
            restarted.recover()
        self.assertEqual(read(self.db), "new user write after reopen")
        self.assertTrue(restarted.state["paused"])
        self.assertTrue(restarted.flag.exists())
        self.assertEqual(restarted.state["transaction"]["phase"], "committed")

    def test_initial_failure_preserves_import_and_keeps_maintenance(self):
        self.manager.state = {}
        self.manager.save()
        self.manager.bad_health.add(NEW["revision"])
        with self.assertRaises(Error):
            self.manager.deploy(NEW)
        self.assertEqual(read(self.db), "existing accounts and creations")
        self.assertTrue(self.manager.flag.exists())
        self.assertNotIn("current", self.manager.state)

    def test_failed_previous_image_keeps_journal_and_maintenance_for_manual_recovery(self):
        self.manager.bad_health.update([OLD["revision"], NEW["revision"]])
        with self.assertRaises(Error):
            self.manager.deploy(NEW)
        self.assertTrue(self.manager.flag.exists())
        self.assertIn("transaction", Harness(self.root).state)
        self.assertEqual(read(self.db), "existing accounts and creations")

    def test_restore_copy_failure_leaves_live_files_intact(self):
        self.manager.maintenance(True)
        sidecar = self.db.with_name(self.db.name + "-wal")
        sidecar.write_bytes(b"preserved test sidecar")
        with self.assertRaises(FileNotFoundError):
            self.manager.restore_database(self.root / "missing.sqlite")
        self.assertTrue(self.db.exists())
        self.assertEqual(sidecar.read_bytes(), b"preserved test sidecar")

    def test_restore_moves_all_old_sidecars_to_quarantine(self):
        backup = self.manager.backups / "manual.sqlite"
        self.manager.snapshot(OLD, backup)
        for suffix in ("-wal", "-shm"):
            self.db.with_name(self.db.name + suffix).write_bytes(b"old sidecar")
        self.manager.maintenance(True)
        self.manager.restore_database(backup)
        quarantines = list(self.manager.backups.glob("quarantine-*"))
        self.assertEqual(len(quarantines), 1)
        for suffix in ("", "-wal", "-shm"):
            self.assertTrue((quarantines[0] / ("accounts.sqlite" + suffix)).exists())
        self.assertEqual(read(self.db), "existing accounts and creations")
        self.assertEqual(self.db.stat().st_mode & 0o777, 0o600)

    def test_restore_requires_maintenance(self):
        with self.assertRaises(Error):
            self.manager.restore_database(self.db)

    def test_update_skips_paused_and_blocked_digests_but_retry_allows_blocked(self):
        self.manager.state.update(paused=True)
        with patch.object(self.manager, "pull") as pull:
            self.manager.update()
            pull.assert_not_called()
        self.manager.state.update(paused=False, blocked=NEW["image"])
        with patch.object(self.manager, "deploy") as deploy:
            self.manager.update()
            deploy.assert_not_called()
            self.manager.update(retry=True)
            deploy.assert_called_once_with(NEW)

    def test_registry_outage_does_not_close_maintenance_or_stop_service(self):
        with patch.object(self.manager, "pull", side_effect=Error("registry unavailable")), self.assertRaises(Error):
            self.manager.update()
        self.assertEqual(self.manager.events, [])
        self.assertFalse(self.manager.flag.exists())

    def test_no_database_prevents_accidental_empty_initial_deployment(self):
        self.db.unlink()
        with self.assertRaises(Error):
            self.manager.deploy(NEW)
        self.assertEqual(self.manager.events, [])

    def test_image_only_rollback_pauses_and_preserves_new_user_data(self):
        self.manager.state.update(current=NEW, previous=OLD)
        write(self.db, "latest user creation")
        self.manager.rollback()
        self.assertTrue(self.manager.state["paused"])
        self.assertEqual(self.manager.state["current"], OLD)
        self.assertEqual(read(self.db), "latest user creation")

    def test_cross_schema_rollback_is_rejected_without_replacing_database(self):
        self.manager.state.update(current={**NEW, "schema": 4}, previous=OLD)
        with self.assertRaises(Error):
            self.manager.rollback()
        self.assertEqual(self.manager.events, [])
        self.assertTrue(self.manager.state["paused"])
        self.assertEqual(read(self.db), "existing accounts and creations")

    def test_explicit_restore_rejects_path_traversal(self):
        with self.assertRaises(Error):
            self.manager.restore("../accounts.sqlite", NEW["image"])
        self.assertEqual(self.manager.events, [])

    def test_retention_preserves_latest_snapshots_and_quarantined_data(self):
        for kind, count in (("daily", 20), ("predeploy", 12)):
            for i in range(count):
                (self.manager.backups / f"{kind}-{i:03}.sqlite").touch()
        quarantined = self.manager.backups / "quarantine-test"
        quarantined.mkdir()
        (quarantined / "accounts.sqlite").touch()
        self.manager.prune()
        self.assertEqual(len(list(self.manager.backups.glob("daily-*.sqlite"))), 14)
        self.assertEqual(len(list(self.manager.backups.glob("predeploy-*.sqlite"))), 7)
        self.assertTrue((quarantined / "accounts.sqlite").exists())

    def test_maintenance_flag_permissions_ignore_restrictive_systemd_umask(self):
        import os
        previous = os.umask(0o077)
        try:
            self.manager.maintenance(True)
        finally:
            os.umask(previous)
        self.assertEqual(self.manager.flag.stat().st_mode & 0o777, 0o644)

    def test_live_gate_requires_exact_response_and_validates_domain_over_loopback(self):
        with patch.object(module.http.client, "HTTPSConnection") as constructor, patch.object(module.socket, "create_connection") as connect, patch.object(module.ssl, "create_default_context") as context:
            response = constructor.return_value.getresponse.return_value
            response.status = 503
            response.getheader.return_value = "60"
            response.read.return_value = module.MAINTENANCE_MESSAGE.encode()
            module.Manager.require_maintenance(self.manager)
            connect.assert_called_once_with(("127.0.0.1", 443), timeout=5)
            context.return_value.wrap_socket.assert_called_once_with(connect.return_value, server_hostname="dreammaker.hexloop.cc")
            constructor.return_value.close.assert_called_once()
            # A backend's own generic 503 is not proof the Caddy matcher is active.
            response.read.return_value = b'{"ok":false}'
            with self.assertRaises(Error):
                module.Manager.require_maintenance(self.manager)

    def test_unreachable_caddy_blocks_gate_check(self):
        with patch.object(module.socket, "create_connection", side_effect=OSError("connection refused")), self.assertRaises(Error):
            module.Manager.require_maintenance(self.manager)


if __name__ == "__main__":
    unittest.main()
