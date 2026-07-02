#!/usr/bin/env python3
"""[調査用・一時ファイル] note.comの403問題の代替取得手段を探るための診断スクリプト。
site/dataには一切書き込まない。原因判明後に削除する想定。"""
import urllib.error
import urllib.parse
import urllib.request

USER_AGENT = "Mozilla/5.0 (compatible; NewsPortalSF6-Collector/1.0)"

CANDIDATES = [
    ("検索API(現行・比較用)", "https://note.com/api/v3/searches?context=note&q=SF6&size=1&start=0"),
    ("検索HTMLページ", "https://note.com/search?context=note&q=SF6"),
    ("ハッシュタグページ(SF6)", "https://note.com/hashtag/SF6"),
    ("ハッシュタグページ(ストリートファイター6)", f"https://note.com/hashtag/{urllib.parse.quote('ストリートファイター6')}"),
    ("ハッシュタグRSS(SF6)", "https://note.com/hashtag/SF6/rss"),
    ("インタレストRSS(SF6)", "https://note.com/interests/SF6/rss"),
]


def check(name, url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            body = res.read()
            print(f"[diag] {name}: OK status={res.status} len={len(body)} snippet={body[:200]!r}")
    except urllib.error.HTTPError as exc:
        body = exc.read()[:200]
        print(f"[diag] {name}: HTTPError {exc.code} {exc.reason} snippet={body!r}")
    except Exception as exc:  # noqa: BLE001
        print(f"[diag] {name}: 例外 {exc!r}")


if __name__ == "__main__":
    for name, url in CANDIDATES:
        check(name, url)
