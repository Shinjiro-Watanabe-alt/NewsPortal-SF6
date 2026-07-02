#!/usr/bin/env python3
"""[調査用・一時ファイル] note.comハッシュタグRSSの項目構造を確認するための診断スクリプト。
site/dataには一切書き込まない。実装後に削除する。"""
import urllib.request

USER_AGENT = "Mozilla/5.0 (compatible; NewsPortalSF6-Collector/1.0)"
url = "https://note.com/hashtag/SF6/rss"

req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
with urllib.request.urlopen(req, timeout=15) as res:
    body = res.read().decode("utf-8", errors="replace")

print(f"[diag] total length: {len(body)}")
print(body[:4000])
