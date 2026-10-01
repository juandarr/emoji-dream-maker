"""Metadata-only worker. Import the official yt-dlp zip; never download media."""
import json
import sys

sys.path.insert(0, sys.argv[1])
import yt_dlp


class QuietLogger:
    def debug(self, message): pass
    def warning(self, message): pass
    def error(self, message): pass


clients = {}
for line in sys.stdin:
    try:
        request = json.loads(line)
        query, locale = request["query"], request["locale"]
        if not isinstance(query, str) or len(query) > 500 or locale not in ("en", "es"):
            raise ValueError("Invalid search")
        if locale not in clients:
            clients[locale] = yt_dlp.YoutubeDL({
                "quiet": True, "no_warnings": True, "logger": QuietLogger(),
                "extract_flat": "in_playlist", "skip_download": True,
                "cachedir": False, "socket_timeout": 3, "retries": 0,
                "extractor_retries": 0, "js_runtimes": {}, "remote_components": set(),
                "extractor_args": {"youtube": {"lang": [locale]}},
            })
        result = clients[locale].extract_info("ytsearch20:" + query, download=False)
        # Only forward fields needed to rank cards, bounding IPC output.
        fields = ("id", "title", "description", "channel_id", "channel", "uploader",
                  "duration", "view_count", "availability", "live_status", "age_limit",
                  "playable_in_embed", "language")
        entries = []
        for entry in result.get("entries", [])[:20]:
            if not entry: continue
            item = {key: entry[key] for key in fields if key in entry}
            item["description"] = (item.get("description") or "")[:10000]
            thumbnails = entry.get("thumbnails") or []
            if thumbnails: item["thumbnail"] = thumbnails[-1].get("url")
            entries.append(item)
        print(json.dumps({"entries": entries}), flush=True)
    except Exception as error:
        message = str(error).lower()
        blocked = any(word in message for word in ("429", "403", "not a bot", "rate limit"))
        print(json.dumps({"error": "quota" if blocked else "network"}), flush=True)
