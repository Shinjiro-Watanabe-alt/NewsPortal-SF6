#!/usr/bin/env python3
"""
SF6 NEWS PORTAL ニュース収集スクリプト

ストリートファイター6・レバーレス関連のRSS/Atomフィード・Googleニュース検索RSSを
巡回し、関連記事のみを抽出して site/data/{articles,ranks,meta,sources}.json を
更新する。GitHub Actions から定期実行される想定。

collector/sources.json を単一の情報源(single source of truth)として運用し、
取得方式・状態・注記もそこに持たせて site/data/sources.json (データソース管理
ページ用)へそのまま反映する。
"""
import hashlib
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
from xml.etree import ElementTree

BASE_DIR = Path(__file__).resolve().parent
SITE_DATA_DIR = BASE_DIR.parent / "site" / "data"
SOURCES_FILE = BASE_DIR / "sources.json"

JST = timezone(timedelta(hours=9))

MAX_ARTICLES = 1000
FETCH_TIMEOUT = 15
USER_AGENT = "Mozilla/5.0 (compatible; NewsPortalSF6-Collector/1.0)"

# SF6・レバーレス関連かどうかを判定するキーワード(関連性の関所)。
# 大文字英字のみの短い略称("JP"等)は他語への誤マッチが多いため避け、
# 確実に判定できる語のみを採用する。
KEYWORDS = [
    "ストリートファイター6", "ストリートファイター6T", "スト6", "スト6T",
    "Street Fighter 6", "SF6", "SF6T",
    "レバーレス", "ヒットボックス", "Hit Box", "FightBox",
    "ドライブインパクト", "ドライブパリィ", "ドライブラッシュ",
    "モダンタイプ", "クラシックタイプ",
    "カプコンカップ", "Capcom Cup", "EVO Japan", "Evolution Championship Series",
    "ワールドツアー", "バトルハブ",
]
KEYWORD_RE = re.compile("|".join(re.escape(k) for k in KEYWORDS))
KEYWORDS_SET = set(KEYWORDS)

# カテゴリ自動分類(一致したら採用、優先順位は上から)。
# 大会記事の配信機材紹介など"dev"と"eve"が両方それっぽい記事は稀に出るが、
# 個人利用のプロトタイプなのでこの優先順位による多少の前後は許容する。
CATEGORY_RULES = [
    (re.compile("レバーレス|ヒットボックス|Hit Box|FightBox|DualModFightStick|アケコン|アーケードコントローラー|コントローラー|デバイス"), "dev"),
    (re.compile("大会|トーナメント|EVO|Evolution Championship|Capcom Cup|カプコンカップ|CPT|オフライン会場|杯|決勝|予選|出場|エキシビション"), "eve"),
    (re.compile("グッズ|フィギュア|アパレル|Tシャツ|コラボ商品|ぬいぐるみ|アクリルスタンド|限定版|プライズ"), "goods"),
    (re.compile("アニメ|コミカライズ|配信|YouTube|実況|ドラマ|映画|コラボ"), "ent"),
    (re.compile("リュウ|ルーク|春麗|ガイル|ジュリ|ザンギエフ|ケン|豪鬼|ブランカ|ダルシム|キャミィ|ジェイミー|エド|アキ|ラシード|ベガ|テリー|マノン|マリーザ|リリー|キンバリー|ディージェイ"), "koy"),
    (re.compile("ドライブインパクト|ドライブパリィ|ドライブラッシュ|ドライブゲージ|コンボ|フレーム|立ち回り|攻略|テクニック|モダンタイプ|クラシックタイプ|バランス調整|Ver\\.\\d"), "kyo"),
]

XML_NS = {
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rss1": "http://purl.org/rss/1.0/",
    "atom": "http://www.w3.org/2005/Atom",
    "dc": "http://purl.org/dc/elements/1.1/",
}

GOOGLE_NEWS_RSS = "https://news.google.com/rss/search"
# Googleニュース検索RSSのタイトルは「本文 - 配信元」の形式になっている
TITLE_SOURCE_SUFFIX_RE = re.compile(r"^(?P<title>.+?)\s+-\s+(?P<source>[^-]+)$")


def build_search_url(query: str) -> str:
    """検索キーワードから Google ニュース検索RSSのURLを組み立てる"""
    params = urllib.parse.urlencode({"q": query, "hl": "ja", "gl": "JP", "ceid": "JP:ja"})
    return f"{GOOGLE_NEWS_RSS}?{params}"


def split_title_source(raw_title: str, fallback: str):
    m = TITLE_SOURCE_SUFFIX_RE.match(raw_title)
    if m:
        return m.group("title").strip(), m.group("source").strip()
    return raw_title.strip(), fallback


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as res:
        return res.read()


def strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text or "")
    return re.sub(r"\s+", " ", text).strip()


def parse_feed(xml_bytes: bytes):
    """RSS2.0 / RDF(RSS1.0) / Atom を雑にまとめてパースし (title, link, desc, pubdate) を返す"""
    items = []
    try:
        root = ElementTree.fromstring(xml_bytes)
    except ElementTree.ParseError:
        return items

    tag = root.tag.lower()

    if tag.endswith("rdf"):
        for item in root.findall("rss1:item", XML_NS):
            title = item.findtext("rss1:title", default="", namespaces=XML_NS)
            link = item.findtext("rss1:link", default="", namespaces=XML_NS)
            desc = item.findtext("rss1:description", default="", namespaces=XML_NS)
            date = item.findtext("dc:date", default="", namespaces=XML_NS)
            items.append((title, link, desc, date))
    elif tag.endswith("feed"):  # Atom
        for entry in root.findall("atom:entry", XML_NS):
            title = entry.findtext("atom:title", default="", namespaces=XML_NS)
            link_el = entry.find("atom:link", XML_NS)
            link = link_el.get("href") if link_el is not None else ""
            desc = entry.findtext("atom:summary", default="", namespaces=XML_NS)
            date = entry.findtext("atom:updated", default="", namespaces=XML_NS)
            items.append((title, link, desc, date))
    else:  # RSS 2.0
        for item in root.iter("item"):
            title = item.findtext("title", default="")
            link = item.findtext("link", default="")
            desc = item.findtext("description", default="")
            date = item.findtext("pubDate", default="")
            items.append((title, link, desc, date))

    return items


def parse_date(raw: str):
    if not raw:
        return None
    fmts = [
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S %Z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ]
    for fmt in fmts:
        try:
            dt = datetime.strptime(raw.strip(), fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=JST)
            return dt.astimezone(JST)
        except ValueError:
            continue
    return None


def make_id(key: str) -> str:
    return "auto-" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]


# 同じ記事が複数のRSS/検索クエリ経由で別リンク・別配信元として重複収集されるのを防ぐための
# タイトル正規化キー。末尾の「(配信元テレビ局)」「(掲載日)」のようなYahoo!ニュース等が
# 付与する注記や、全角/半角スペースの差異を吸収して同一記事と判定する
TITLE_DEDUP_SUFFIX_RE = re.compile(r"\s*[\(（][^()（）]{1,30}[\)）]\s*$")


def normalize_title_for_dedup(title: str) -> str:
    return re.sub(r"\s+", "", TITLE_DEDUP_SUFFIX_RE.sub("", title))


def dedupe_by_title(articles: dict) -> dict:
    """正規化タイトルが一致する記事(別IDで重複登録されている過去収集分を含む)を1件に
    統合する。注記がない分タイトルが短くなる傾向を利用し、最も短いタイトルの記事を残す"""
    best = {}
    for a in articles.values():
        key = normalize_title_for_dedup(a["title"])
        current = best.get(key)
        if current is None or len(a["title"]) < len(current["title"]):
            best[key] = a
    return {a["id"]: a for a in best.values()}


def classify_category(text: str, fallback: str) -> str:
    for pattern, category in CATEGORY_RULES:
        if pattern.search(text):
            return category
    return fallback


def collect_one_source(source: dict, now: datetime):
    results = []
    source_type = source.get("type", "feed")
    url = build_search_url(source["query"]) if source_type == "search" else source["url"]

    try:
        raw = fetch(url)
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        print(f"[skip] {source['name']}: 取得失敗 ({exc})", file=sys.stderr)
        return results

    for raw_title, link, desc, date_raw in parse_feed(raw):
        raw_title = strip_html(raw_title)
        desc = strip_html(desc)
        if not raw_title or not link:
            continue

        if source_type == "search":
            # 検索RSSはGoogleニュースの仲介リンクなので「本文 - 配信元」を分離する
            title, source_label = split_title_source(raw_title, source.get("default_source_label", source["name"]))
        else:
            title, source_label = raw_title, source["default_source_label"]

        haystack = title + " " + desc
        if not KEYWORD_RE.search(haystack):
            continue  # SF6・レバーレスに無関係な記事は除外

        dt = parse_date(date_raw) or now

        # ソースのcategoryは「どの検索クエリ/キーワードフィードで見つかったか」を
        # 表すだけで、記事内容と無関係な場合がある(はてなブックマークのキーワード
        # ページ等も同様)。キーワード不一致時のフォールバックには使わず常に"etc"にする。
        results.append({
            "id": make_id(normalize_title_for_dedup(title)),
            "cat": classify_category(haystack, "etc"),
            "title": title,
            "summary": (desc[:120] + "…") if len(desc) > 120 else desc,
            "source": source_label,
            "source_url": link,
            "time": dt.isoformat(),
            "collected": True,
        })

    return results


# 「急上昇ワード」ランキング専用の特化辞書。記事の関連性判定(KEYWORDS)用の
# 広い語とは別に、キャラクター名・システム用語・デバイス名・大会シリーズ名のみを
# 集めている。ランキングの語彙はこれに加えて、下のパターンベース抽出で一定の
# 頻度・出典数に達した語を自動的に取り込んでいくため、新キャラ・新用語・新型番が
# 出ても手動でリストを増やし続けなくても拾えるようになっている。
RANK_BASE_KEYWORDS = [
    "リュウ", "ルーク", "春麗", "ガイル", "ジュリ", "ザンギエフ", "ケン", "豪鬼",
    "ブランカ", "ダルシム", "キャミィ", "ジェイミー", "エド", "アキ", "ラシード",
    "ベガ", "テリー", "マノン", "マリーザ", "リリー", "キンバリー", "ディージェイ",
    "レバーレス", "ヒットボックス", "FightBox",
    "ドライブインパクト", "ドライブパリィ", "ドライブラッシュ",
    "EVO Japan", "Capcom Cup", "カプコンカップ", "ワールドツアー", "バトルハブ",
    "モダンタイプ", "クラシックタイプ",
]

# 英字略称(FightBox B1のような型番表記)。会社名・媒体名との区別がつかない
# 素の英字のみの語を誤って拾わないよう、数字またはハイフンを含むものだけを
# 候補として扱う(末尾の小文字1字は許容)
RANK_ACRONYM_RE = re.compile(
    r"(?<![A-Za-z0-9])(?:[A-Z][A-Z0-9]{1,7}-[A-Z0-9]{1,8}|[A-Z][A-Z0-9]{2,7})[a-z]?(?![A-Za-z0-9])"
)
# パッチバージョン表記(Ver.2.010 等)。新バージョンが出るたびに自動でランキング候補に入る
VERSION_RE = re.compile(r"Ver\.\d+\.\d+")
RANK_PROMOTE_MIN_COUNT = 3
RANK_PROMOTE_MIN_SOURCES = 2


def extract_rank_candidates(text: str) -> set:
    """記事本文から、ランキング語彙の自動候補(数字/ハイフンを含む英字略称・
    パッチバージョン表記)を抜き出す。既存のKEYWORDS(関連性判定用の広い語)に
    含まれるものは、専門ランキング向けの新規候補としては扱わない"""
    found = {
        m for m in RANK_ACRONYM_RE.findall(text)
        if any(c.isdigit() for c in m) or "-" in m
    }
    found.update(VERSION_RE.findall(text))
    found -= KEYWORDS_SET
    return found


def build_rank_vocab(articles: dict):
    """直近の記事群(articles.jsonの引き継ぎ分含む全件)から自動候補語を集計し、
    一定の頻度・出典数に達したものだけをベース辞書に加えて返す。
    記事の引き継ぎ自体がローリングウィンドウになっているため、話題性が薄れた語は
    追って自然に閾値を下回り、明示的なプルーニング処理なしで自動的に外れていく"""
    candidate_counts = {}
    candidate_sources = {}
    for a in articles.values():
        haystack = a.get("title", "") + " " + a.get("summary", "")
        for term in extract_rank_candidates(haystack):
            candidate_counts[term] = candidate_counts.get(term, 0) + 1
            candidate_sources.setdefault(term, set()).add(a.get("source", ""))

    promoted = [
        term for term, count in candidate_counts.items()
        if count >= RANK_PROMOTE_MIN_COUNT
        and len(candidate_sources[term]) >= RANK_PROMOTE_MIN_SOURCES
    ]

    return list(dict.fromkeys(RANK_BASE_KEYWORDS + sorted(promoted)))


def build_ranks(articles: dict, previous_ranks: list, top_n: int = 10):
    """急上昇ワード辞書(ベース辞書＋自動採用された候補語)が記事本文(タイトル+概要)に
    出現する頻度からトレンドキーワードを集計する。arrow は前回実行時の同じ語の
    スコアと比較して up/down/flat を決める"""
    vocab = build_rank_vocab(articles)
    if not vocab:
        return []
    vocab_re = re.compile("|".join(re.escape(v) for v in sorted(vocab, key=len, reverse=True)))

    counts = {}
    for a in articles.values():
        haystack = a.get("title", "") + " " + a.get("summary", "")
        for term in set(vocab_re.findall(haystack)):
            counts[term] = counts.get(term, 0) + 1

    if not counts:
        return []

    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:top_n]
    prev_scores = {r["keyword"]: r.get("score", 0) for r in previous_ranks}

    result = []
    for keyword, score in ranked:
        prev = prev_scores.get(keyword)
        if prev is None or score > prev:
            arrow = "up"
        elif score < prev:
            arrow = "down"
        else:
            arrow = "flat"
        result.append({"keyword": keyword, "score": score, "arrow": arrow})
    return result


def build_sources_view(sources: list):
    """collector/sources.json を site/data/sources.json (データソース管理ページ用)へ
    変換する。endpoint は実際に叩くURL、url は表示用のサイトURLとする"""
    view = []
    for s in sources:
        if s.get("type") == "search":
            endpoint = build_search_url(s["query"])
            url = "https://news.google.com/"
        else:
            endpoint = s["url"]
            parts = urllib.parse.urlsplit(s["url"])
            url = f"{parts.scheme}://{parts.netloc}/"
        view.append({
            "name": s["name"],
            "url": url,
            "cat": s.get("category", "etc"),
            "method": s.get("method", "rss"),
            "status": s.get("status", "check"),
            "endpoint": endpoint,
            "note": s.get("note", ""),
        })
    return view


def load_json(name: str, default):
    path = SITE_DATA_DIR / name
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def save_json(name: str, data):
    path = SITE_DATA_DIR / name
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main():
    sources = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
    now = datetime.now(JST)

    existing_list = load_json("articles.json", [])
    # 過去にこのスクリプトが収集した記事のみ引き継ぎ、デザイン用サンプル記事は初回実行時に置き換える
    carried_over = {a["id"]: a for a in existing_list if a.get("collected")}

    collected = dict(carried_over)
    new_ids = set()
    for source in sources:
        for article in collect_one_source(source, now):
            if article["id"] not in collected:
                new_ids.add(article["id"])
            collected[article["id"]] = article
    new_count = len(new_ids)

    # 同じ記事が複数のRSS/検索クエリ経由で別ID(旧リンクベースIDの引き継ぎ分を含む)として
    # 重複登録されている場合があるため、タイトル単位で1件に統合する
    collected = dedupe_by_title(collected)

    # 新しい順にソートし、上限件数で切る
    ordered_ids = sorted(collected, key=lambda k: collected[k]["time"], reverse=True)[:MAX_ARTICLES]
    articles = [collected[aid] for aid in ordered_ids]
    articles_by_id = {a["id"]: a for a in articles}

    previous_ranks = load_json("ranks.json", [])
    ranks = build_ranks(articles_by_id, previous_ranks)

    save_json("articles.json", articles)
    save_json("ranks.json", ranks)
    save_json("meta.json", {"updated_at": now.isoformat(), "total_count": len(articles)})
    save_json("sources.json", build_sources_view(sources))

    print(f"収集完了: 新規 {new_count} 件 / 合計 {len(articles)} 件 ({now.isoformat()})")


if __name__ == "__main__":
    SITE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    main()
