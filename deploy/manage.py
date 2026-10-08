#!/usr/bin/env python3
"""Ubuntu deployment controller. Only one application process opens the live DB.

Run as root; no third-party Python modules or inbound deployment service required.
The durable journal and Caddy flag distinguish safe pre-open rollback from recovery
after user writes may have resumed. Never restore an old snapshot after commit.
"""
import argparse
import contextlib
import datetime as dt
import fcntl
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import socket
import ssl
import subprocess
import sys
import time
from urllib.parse import urlsplit

MAINTENANCE_MESSAGE = "Dream Maker is updating. Please try again shortly."


class DeploymentError(RuntimeError):
    pass


def sync_directory(path):
    directory = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def atomic(path, content, mode=0o600):
    temporary = path.with_name(path.name + ".tmp")
    with open(temporary, "w", encoding="utf8") as output:
        os.chmod(temporary, mode)
        output.write(content)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)
    sync_directory(path.parent)


def private(path, directory=False):
    if os.geteuid() == 0:
        os.chown(path, 10001, 10001)
    path.chmod(0o700 if directory else 0o600)


class Manager:
    def __init__(self, root=Path("/opt/dreammaker")):
        self.root = Path(root).resolve()
        self.config = json.loads((self.root / "deployment.json").read_text())
        self.repository = self.config["repository"]
        if not re.fullmatch(r"ghcr\.io/[a-z0-9_.-]+/[a-z0-9_.-]+", self.repository):
            raise DeploymentError("Invalid deployment registry repository")
        self.data = Path(self.config["data_dir"])
        self.cache = Path(self.config["cache_dir"])
        self.backups = Path(self.config["backup_dir"])
        self.flag = self.root / "control/maintenance.flag"
        self.state_path = self.root / "state.json"
        self.state = json.loads(self.state_path.read_text()) if self.state_path.exists() else {}

    @contextlib.contextmanager
    def lock(self):
        with open(self.root / "operation.lock", "a") as descriptor:
            fcntl.flock(descriptor, fcntl.LOCK_EX)
            # Another command may have completed while this one waited.
            self.state = json.loads(self.state_path.read_text()) if self.state_path.exists() else {}
            yield

    def save(self):
        atomic(self.state_path, json.dumps(self.state, indent=2) + "\n")

    def maintenance(self, active):
        if active:
            atomic(self.flag, "", mode=0o644)
        else:
            self.flag.unlink(missing_ok=True)
            sync_directory(self.flag.parent)

    def require_maintenance(self):
        """Verify the live Caddy site, including TLS/SNI, over host loopback.

        Checking the flag alone cannot catch a removed/unloaded Caddy matcher.
        Loopback avoids depending on router hairpin NAT or public DNS routing.
        """
        origin = urlsplit(self.config.get("origin", "https://dreammaker.hexloop.cc"))
        if origin.scheme != "https" or not origin.hostname or origin.username or origin.password or origin.path not in ("", "/") or origin.query or origin.fragment:
            raise DeploymentError("Deployment origin must be a public HTTPS origin")
        connection = http.client.HTTPSConnection(origin.hostname, origin.port or 443, timeout=5)
        try:
            connection.sock = ssl.create_default_context().wrap_socket(
                socket.create_connection(("127.0.0.1", origin.port or 443), timeout=5),
                server_hostname=origin.hostname,
            )
            connection.request("GET", "/api/health", headers={"Host": origin.netloc})
            response = connection.getresponse()
            body = response.read(1024).decode("utf8", errors="replace").strip()
            if response.status != 503 or response.getheader("Retry-After") != "60" or body != MAINTENANCE_MESSAGE:
                raise DeploymentError("Caddy is not serving the configured maintenance gate; no database restore/migration is permitted")
        except (OSError, http.client.HTTPException) as error:
            raise DeploymentError("Cannot verify the Caddy maintenance gate over local HTTPS; check Caddy configuration and certificate") from error
        finally:
            connection.close()

    def command(self, *arguments, timeout=600):
        try:
            result = subprocess.run(arguments, check=True, capture_output=True, text=True, timeout=timeout)
            return result.stdout.strip()
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
            # Do not print Docker inspect output, environment contents, or credentials.
            detail = (getattr(error, "stderr", "") or "")
            if isinstance(detail, bytes):
                detail = detail.decode(errors="replace")
            raise DeploymentError(f"Command {arguments[0]} {arguments[1] if len(arguments)>1 else ''} failed: {detail[-1500:]}") from error

    def compose(self, *arguments):
        environment = [f"DREAMMAKER_ROOT={self.root}", f"DREAMMAKER_DATA_DIR={self.data}", f"DREAMMAKER_CACHE_DIR={self.cache}"]
        return self.command("env", *environment, "docker", "compose", "--env-file", str(self.root / "image.env"), "-f", str(self.root / "compose.yaml"), *arguments)

    def select(self, image):
        atomic(self.root / "image.env", f"IMAGE_REF={image['image']}\n")

    def image(self, reference):
        if not re.fullmatch(re.escape(self.repository) + r"@sha256:[0-9a-f]{64}", reference):
            raise DeploymentError("Expected an immutable image digest in the configured repository")
        labels = json.loads(self.command("docker", "image", "inspect", reference, "--format", "{{json .Config.Labels}}"))
        revision = labels.get("org.opencontainers.image.revision", "")
        if not re.fullmatch(r"[0-9a-f]{40}", revision):
            raise DeploymentError("Image has no immutable Git revision label")
        schema = labels.get("org.opencontainers.image.account-schema", "")
        if not re.fullmatch(r"[1-9][0-9]*", schema):
            raise DeploymentError("Image has no account schema label")
        return {"image": reference, "revision": revision, "schema": int(schema)}

    def pull(self, reference=None):
        reference = reference or self.repository + ":production"
        if reference != self.repository + ":production" and not re.fullmatch(re.escape(self.repository) + r"@sha256:[0-9a-f]{64}", reference):
            raise DeploymentError("Only production or an explicit repository digest may be pulled")
        self.command("docker", "pull", reference)
        if "@sha256:" not in reference:
            digests = json.loads(self.command("docker", "image", "inspect", reference, "--format", "{{json .RepoDigests}}"))
            reference = next((item for item in digests if item.startswith(self.repository + "@sha256:")), "")
        return self.image(reference)

    def check_database(self, path, image):
        result = self.command("docker", "run", "--rm", "--network", "none", "--mount", f"type=bind,src={path.parent},dst=/check", "--entrypoint", "node", image["image"], "scripts/account-check.mjs", f"/check/{path.name}")
        return json.loads(result)

    def snapshot(self, image, destination):
        destination.parent.mkdir(parents=True, exist_ok=True)
        private(destination.parent, directory=True)
        temporary = destination.with_name(destination.name + ".partial")
        temporary.unlink(missing_ok=True)
        self.command("docker", "run", "--rm", "--network", "none", "--mount", f"type=bind,src={self.data},dst=/data", "--mount", f"type=bind,src={destination.parent},dst=/backups", "--env", "ACCOUNT_DB_PATH=/data/accounts.sqlite", "--entrypoint", "node", image["image"], "scripts/account-backup.mjs", f"/backups/{temporary.name}")
        self.check_database(temporary, image)
        private(temporary)
        with open(temporary, "rb") as source:
            os.fsync(source.fileno())
        os.replace(temporary, destination)
        sync_directory(destination.parent)
        return destination

    def backup_path(self, kind, image):
        stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        return self.backups / f"{kind}-{stamp}-{image['revision'][:12]}.sqlite"

    def preflight(self, candidate, restore_from=None):
        # A previous process may have died before cleaning up its clone container.
        try:
            self.command("docker", "rm", "--force", "dreammaker-preflight")
        except DeploymentError:
            pass
        directory = self.root / "preflight"
        directory.mkdir(exist_ok=True)
        private(directory, directory=True)
        for suffix in ("", "-wal", "-shm"):
            (directory / ("accounts.sqlite" + suffix)).unlink(missing_ok=True)
        if restore_from:
            shutil.copyfile(restore_from, directory / "accounts.sqlite")
            private(directory / "accounts.sqlite")
        else:
            self.snapshot(self.state.get("current") or candidate, directory / "accounts.sqlite")
        name = "dreammaker-preflight"
        self.command("docker", "run", "--detach", "--name", name, "--network", "none", "--env-file", str(self.root / "app.env"), "--env", "ACCOUNT_DB_PATH=/data/accounts.sqlite", "--mount", f"type=bind,src={directory},dst=/data", candidate["image"])
        try:
            self.health(candidate, name)
            info = self.check_database(directory / "accounts.sqlite", candidate)
            if max(info["migrations"], default=0) != candidate["schema"]:
                raise DeploymentError("Candidate schema label does not match the migrated clone")
        finally:
            self.command("docker", "rm", "--force", name)

    def health(self, image, name="dreammaker-app"):
        last_error = None
        for _ in range(30):
            try:
                result = self.command("docker", "exec", name, "node", "scripts/healthcheck.mjs", timeout=10)
                # healthcheck compares the response with the immutable image ENV.
                if result:
                    raise DeploymentError("Unexpected healthcheck output")
                actual = self.command("docker", "exec", name, "node", "-p", "process.env.APP_REVISION", timeout=10)
                if actual != image["revision"]:
                    raise DeploymentError("Deployed revision does not match image metadata")
                return
            except DeploymentError as error:
                last_error = error
                time.sleep(2)
        raise DeploymentError("Image did not become ready") from last_error

    def start(self, image):
        self.select(image)
        self.compose("up", "--detach", "--no-deps", "app")

    def stop(self):
        if (self.root / "image.env").exists():
            self.compose("stop", "--timeout", "150", "app")

    def restore_database(self, backup):
        # The app must be stopped and the public maintenance gate closed.
        if not self.flag.exists():
            raise DeploymentError("Database restore requires maintenance mode")
        # Prepare the replacement before moving any live files. A failed copy
        # leaves the live database in place and the journal available for retry.
        target = self.data / "accounts.sqlite"
        temporary = self.data / "restored.sqlite"
        shutil.copyfile(backup, temporary)
        private(temporary)
        with open(temporary, "rb") as source:
            os.fsync(source.fileno())
        quarantine = self.backups / ("quarantine-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
        quarantine.mkdir()
        private(quarantine, directory=True)
        for suffix in ("", "-wal", "-shm"):
            original = self.data / ("accounts.sqlite" + suffix)
            if original.exists():
                os.replace(original, quarantine / original.name)
        sync_directory(quarantine)
        os.replace(temporary, target)
        sync_directory(self.data)
        sync_directory(self.backups)

    def recover(self):
        transaction = self.state.get("transaction")
        if not transaction:
            return
        self.maintenance(True)
        self.require_maintenance()
        if transaction["phase"] == "committed":
            # Traffic might already have reopened. Never restore a stale DB here.
            self.start(self.state["current"])
            try:
                self.health(self.state["current"])
            except DeploymentError:
                self.state["paused"] = True
                self.save()
                raise DeploymentError("Committed deployment is unhealthy; maintenance remains active. Manual recovery is required.")
            self.maintenance(False)
            del self.state["transaction"]
            self.save()
            return
        self.stop()
        backup = transaction.get("backup")
        if backup:
            backup = self.backups / backup
            self.check_database(backup, transaction["previous"] or transaction["candidate"])
            self.restore_database(backup)
        previous = transaction.get("previous")
        if previous:
            self.start(previous)
            self.health(previous)
            self.maintenance(False)
        self.state["blocked"] = transaction["candidate"]["image"]
        self.state.pop("transaction")
        self.save()
        print("Recovered pre-open deployment; restored previous version" if previous else "Initial deployment failed; imported data preserved and maintenance remains active")

    def deploy(self, candidate, restore_from=None):
        if not (self.data / "accounts.sqlite").is_file():
            raise DeploymentError("Import the verified existing SQLite database before initial deployment")
        try:
            self.preflight(candidate, restore_from)
        except DeploymentError:
            self.state["blocked"] = candidate["image"]
            self.save()
            raise
        previous = self.state.get("current")
        transaction = {"phase": "draining", "candidate": candidate, "previous": previous}
        self.state["transaction"] = transaction
        self.save()
        self.maintenance(True)
        try:
            self.require_maintenance()
            self.stop()
            backup = self.snapshot(previous or candidate, self.backup_path("predeploy", previous or candidate))
            transaction.update(phase="migrating", backup=backup.name)
            self.save()  # Durable backup reference BEFORE any migration writes.
            if restore_from:
                self.restore_database(restore_from)
            self.start(candidate)
            self.health(candidate)
            info = self.check_database(self.data / "accounts.sqlite", candidate)
            if max(info["migrations"], default=0) != candidate["schema"]:
                raise DeploymentError("Image schema label does not match the live database")
            self.state.update(current=candidate, previous=previous, last_backup=backup.name)
            self.state.pop("blocked", None)
            transaction["phase"] = "committed"
            self.save()  # From here on a database rewind is NEVER automatic.
            self.maintenance(False)
            self.state.pop("transaction")
            self.save()
            self.prune()
            print(f"Deployed {candidate['revision']} ({candidate['image']})")
        except Exception:
            self.recover()
            raise

    def update(self, retry=False):
        self.recover()
        if self.state.get("paused"):
            print("Automatic updates are paused")
            return
        if not (self.root / "app.env").is_file():
            raise DeploymentError("Create private app.env before deployment")
        candidate = self.pull()
        if candidate == self.state.get("current"):
            return
        if not retry and self.state.get("blocked") == candidate["image"]:
            print("Skipping a failed digest; fix the issue and run retry or publish another build")
            return
        self.deploy(candidate)

    def backup(self):
        self.recover()
        current = self.state.get("current")
        if not current:
            raise DeploymentError("No successful deployment to back up")
        backup = self.snapshot(current, self.backup_path("daily", current))
        self.state["daily_backup"] = backup.name
        self.save()
        self.prune()
        print(f"Verified backup: {backup.name}")

    def prune(self):
        protected = {self.state.get("last_backup"), self.state.get("daily_backup")}
        for kind, retain in (("daily", 14), ("predeploy", 7)):
            files = sorted(self.backups.glob(kind + "-*.sqlite"), reverse=True)
            for path in files[retain:]:
                if path.name not in protected:
                    path.unlink()
        # Quarantined databases are deliberately retained for explicit operator review.

    def rollback(self):
        self.recover()
        target, current = self.state.get("previous"), self.state.get("current")
        if not target or not current:
            raise DeploymentError("No previous successful image is recorded")
        self.state["paused"] = True
        self.save()
        if target["schema"] != current["schema"]:
            raise DeploymentError("Schema versions differ. Use the documented explicit backup restore procedure instead of image-only rollback.")
        self.command("docker", "pull", target["image"])
        self.deploy(target)

    def restore(self, backup_name, reference):
        self.recover()
        if Path(backup_name).name != backup_name or not backup_name.endswith(".sqlite"):
            raise DeploymentError("Choose a SQLite backup filename in the backup directory")
        backup = self.backups / backup_name
        candidate = self.pull(reference)
        self.check_database(backup, candidate)
        self.state["paused"] = True
        self.save()
        self.deploy(candidate, restore_from=backup)


def install(root):
    if root != Path("/opt/dreammaker"):
        raise DeploymentError("The provided Caddy/systemd configuration uses /opt/dreammaker")
    source = Path(__file__).resolve().parent
    root.mkdir(mode=0o755, parents=True, exist_ok=True)
    (root / "control").mkdir(mode=0o755, exist_ok=True)
    # Caddy must be able to traverse these directories regardless of sudo umask.
    root.chmod(0o755)
    (root / "control").chmod(0o755)
    config = {"repository": "ghcr.io/juandarr/emoji-dream-maker", "origin": "https://dreammaker.hexloop.cc", "data_dir": "/var/lib/dreammaker/accounts", "cache_dir": "/var/cache/dreammaker/youtube", "backup_dir": "/var/backups/dreammaker"}
    config_path = root / "deployment.json"
    if config_path.exists():
        config = json.loads(config_path.read_text())
    else:
        atomic(config_path, json.dumps(config, indent=2) + "\n")
    for key in ("data_dir", "cache_dir", "backup_dir"):
        path = Path(config[key]); path.mkdir(parents=True, exist_ok=True)
        private(path, directory=True)
    for name in ("manage.py", "compose.yaml", "Caddyfile.example", "app.env.example"):
        if source / name != root / name:
            shutil.copyfile(source / name, root / name)
    for name in ("dreammaker-update.service", "dreammaker-update.timer", "dreammaker-backup.service", "dreammaker-backup.timer"):
        shutil.copyfile(source / name, Path("/etc/systemd/system") / name)
    subprocess.run(["systemctl", "daemon-reload"], check=True)
    state_path = root / "state.json"
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    if not state.get("current"):
        atomic(root / "control/maintenance.flag", "", mode=0o644)
    print("Installed controller; timers are NOT enabled. Configure app.env, import the database, and validate Caddy before update.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("/opt/dreammaker"))
    commands = parser.add_subparsers(dest="action", required=True)
    for action in ("install", "update", "retry", "backup", "status", "pause", "resume", "rollback"):
        commands.add_parser(action)
    restore = commands.add_parser("restore")
    restore.add_argument("--backup", required=True)
    restore.add_argument("--image", required=True)
    restore.add_argument("--accept-data-loss", action="store_true", help="Confirm loss of changes made after this backup")
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise DeploymentError("Run this controller with sudo")
    if args.action == "install":
        install(args.root.resolve())
        return
    manager = Manager(args.root)
    with manager.lock():
        if args.action == "status":
            print(json.dumps({**manager.state, "maintenance": manager.flag.exists()}, indent=2))
        elif args.action in ("pause", "resume"):
            manager.state["paused"] = args.action == "pause"; manager.save()
            print("Updates paused" if args.action == "pause" else "Updates resumed; next timer run will check production")
        elif args.action in ("update", "retry"):
            manager.update(retry=args.action == "retry")
        elif args.action == "restore":
            if not args.accept_data_loss:
                raise DeploymentError("Restoring an old backup discards newer writes. Review the recovery guide and pass --accept-data-loss explicitly.")
            manager.restore(args.backup, args.image)
        else:
            getattr(manager, args.action)()


if __name__ == "__main__":
    try:
        main()
    except (DeploymentError, OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
