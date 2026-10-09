"""Install only the pinned official Python zip executable, with checksum verification."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

lock = json.loads(Path(__file__).with_name("yt-dlp.lock.json").read_text())
url = f"https://github.com/yt-dlp/yt-dlp/releases/download/{lock['version']}/yt-dlp"
with urlopen(url, timeout=60) as response:
    data = response.read(20_000_000)
if hashlib.sha256(data).hexdigest() != lock["sha256"]:
    raise SystemExit("Official yt-dlp archive checksum did not match the lock file")
target = Path("/opt/yt-dlp/yt-dlp")
target.parent.mkdir(parents=True, exist_ok=True)
target.write_bytes(data)
target.chmod(0o755)
