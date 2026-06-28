# 作業ログ：YouTubeバッジ機能 & カテゴリ分類バグ修正

このドキュメントは、NewsPortal-SF6で行った2つの作業（①YouTube動画リンクへのバッジ表示機能の追加、②記事カテゴリ誤分類の調査・修正）について、要望から実装・検証までの過程を詳細に記録したもの。今後似たような作業をする際の参考用。

---

## 1. YouTubeバッジ機能

### 1-1. きっかけ
ユーザーからの要望：
> 「YouTube動画へのリンクについては、70ピクセル程度のサイズでYouTubeアイコン（赤い角丸四角に再生マーク）を付けるようにして」

サムネイル画像の上に、YouTubeへのリンクだと分かるバッジ（赤い角丸四角＋白い再生三角）を重ねて表示する機能。

### 1-2. 実装方針
- `site/assets/js/data.js` に判定ロジックと共有SVGマークアップを集約
  - `DN.isYouTubeUrl(url)` … `source_url` が `youtube.com` / `youtu.be` を含むかを正規表現で判定
  - `DN.YT_BADGE_HTML` … 70x70のviewBoxを持つSVG文字列（赤い角丸四角 `<rect>` + 白い再生三角 `<polygon>`）
- `site/assets/js/news.js` の `decorate()` で `isYouTube: DN.isYouTubeUrl(it.source_url)` を各記事に付与
- `featuredHtml()` / `newCardHtml()` / `listItemHtml()` の `.thumb` 要素内に、`isYouTube` がtrueなら `DN.YT_BADGE_HTML` を埋め込む
- `site/assets/css/base.css` の `.yt-badge` でサイズ・位置を指定（`.thumb` に `position: relative; overflow: hidden;` を追加して基準にする）

コミット：`78591c8` 「YouTube動画リンク記事のサムネに再生アイコンを表示」

### 1-3. Googleニュース中継リンク問題への対応
**ユーザーの気づき：**
> 「Google Newsへのリンクで即リダイレクトしてYouTubeに飛ぶものが結構ありそう。どうにか判別してYouTubeバッジを付けることはできない？」

**調査でわかったこと：**
- 「検索」タイプの記事は `source_url` がGoogleニュースの中継リンク（`news.google.com/rss/articles/...`）になっており、実際の飛び先URLが直接わからない
- ただし、Googleニュース検索RSSのタイトルは「本文 - 配信元」という形式になっていて、`collector/collect.py` の `split_title_source()` がこの配信元部分を `source` フィールドに抽出している
- 配信元が `YouTube` と明示されているケースがある（Googleニュース側がYouTube動画だと判定して付けているラベル）→ これは信頼できる強い判定材料

**実装：**
```js
DN.isYouTubeArticle = function isYouTubeArticle(it) {
  if (DN.isYouTubeUrl(it.source_url) || it.source === 'YouTube') return true;
  ...
};
```
`news.js` 側も `DN.isYouTubeUrl(it.source_url)` 呼び出しを `DN.isYouTubeArticle(it)` に置き換え。

コミット：`4862dda` 「Googleニュース中継リンクの記事もYouTube判定できるように修正」

### 1-4. バッジサイズの調整（2段階）
**1段目：縮小**
> 「YouTubeバッジが思いの外大きかったよ。幅は4分の1、高さは6分の1にして」

70x70px → 幅17.5px・高さ11.67px に変更。幅と高さの縮小比率が異なるため、SVGの `viewBox` に対して `preserveAspectRatio="none"` を指定し、CSS側の `width`/`height` で非等比に伸縮できるようにした。

このタイミングでは一旦コミットの確認をとったところ、ユーザーから **「まだしない」** という回答。CLAUDE.mdの「既存ファイルの更新・コミットは無断で行わない」方針に従い、コミットせず保留。直後にStop hookから「未コミットの変更がある」という警告が出たが、ユーザーの明示的な「まだしない」を優先し、フックの指示があってもコミットしないという判断を継続した。

**2段目：再拡大＋位置変更**
> 「バッジはそのサイズから30%大きくして、サムネイルの真ん中ではなく右下に配置して」

17.5x11.67px から30%増 → 22.75x15.17px。配置は `top/left/translate` の中央寄せから `bottom: 6px; right: 6px;` の右下寄せに変更。

```css
.yt-badge {
  position: absolute;
  bottom: 6px;
  right: 6px;
  width: 22.75px;
  height: 15.17px;
  pointer-events: none;
}
```

この変更はユーザーの「コミット・pushする」という確認を得てからコミット。

コミット：`97f1017` 「YouTubeバッジを縮小して右下配置に変更」

### 1-5. t.co（X投稿）経由のYouTubeリンクへの対応
**ユーザーの気づき：**
> 「参照元がt.coのものでも同様にYouTubeの即リダイレクトがあるみたい。Xのリダイレクトだから、全部同様の動きにして良いか分からないが、判別できないかな？」

ユーザー自身が「t.co全部を同じ扱いにしてよいか分からない」と慎重な姿勢を示していた点がポイント。

**判定材料の信頼度の違いを整理：**
- `source === 'YouTube'` → **強い判定材料**（Googleニュースが明示的にYouTube配信と認識している）
- `source === 't.co'` → **弱い判定材料**（X投稿であることしか分からず、リンク先がYouTubeかTwitchか他の何かかは不明）

このため、t.coについては「記事タイトル・本文にYouTubeという記載がある場合のみ」バッジを付ける、というテキストヒューリスティックの選択肢をユーザーに提示し、「title/summaryにYouTube記載あればバッジ」を選んでもらった。

**実装：**
```js
DN.isYouTubeArticle = function isYouTubeArticle(it) {
  if (DN.isYouTubeUrl(it.source_url) || it.source === 'YouTube') return true;
  if (it.source === 't.co' && /YouTube/i.test(it.title + ' ' + (it.summary || ''))) return true;
  return false;
};
```

ユーザーの「コミット・pushする」確認を得てコミット。

コミット：`9620ef6` 「t.co経由の記事でYouTube記載がある場合のみバッジ表示」

### 1-6. 検証方法
ローカルで `python3 -m http.server 8001 --directory site` を起動し、Playwright（`/opt/pw-browsers/chromium` を `executablePath` に指定）でページを開き、`.list-item` 要素を巡回して `.yt-badge` の有無・`source` ラベルをコンソール出力するスクリプトをスクラッチパッドに作成して確認した（`yt_check4.js` / `yt_check_tco.js` など）。

---

## 2. カテゴリ誤分類バグの調査・修正

### 2-1. きっかけ
> 「なぜかストリートファイター6親子大会がグッズ・アパレルのカテゴリになってる。正しくカテゴリ分けできてる？」

### 2-2. カテゴリ分類の仕組み（2系統あることの整理）
- **表示側**：`site/assets/js/data.js` の `DN.CATEGORY_META`（ラベル・色・サムネ画像の対応表）
- **収集側**：`collector/collect.py` の `CATEGORY_RULES`（正規表現リストでタイトル＋本文からカテゴリを推定）

```python
CATEGORY_RULES = [
    (re.compile("レバーレス|ヒットボックス|...|デバイス"), "dev"),
    (re.compile("大会|トーナメント|EVO|...|予選|出場|エキシビション"), "eve"),
    (re.compile("グッズ|フィギュア|アパレル|...|プライズ"), "goods"),
    (re.compile("アニメ|コミカライズ|配信|YouTube|...|コラボ"), "ent"),
    (re.compile("リュウ|ルーク|春麗|...|ディージェイ"), "koy"),
    (re.compile("ドライブインパクト|...|Ver\\.\\d"), "kyo"),
]
```
`classify_category(text, fallback)` はこのリストを順に試して最初にマッチしたカテゴリを返し、どれもマッチしなければ `fallback` を返す。

### 2-3. 原因調査
該当記事（`auto-7cbb2b3b6089`）の実データを確認：
```json
{
  "id": "auto-7cbb2b3b6089",
  "cat": "goods",
  "title": "eスポーツで繋がる親子の絆！総合学園ヒューマンアカデミーとカプコンが共催 『ストリートファイター6』を活用した全国親子",
  "source": "ニコニコニュース",
  ...
}
```
タイトル末尾が「全国親子」で切れていて、本来あるはずの「大会」という単語がない。Googleニュース検索RSSがタイトルを途中で切ってしまっており、`CATEGORY_RULES` の `eve`（大会）パターンが本来マッチするはずなのに、「大会」という文字列自体が欠落しているためマッチしなかった。

直接Pythonで該当テキストに対して6つの正規表現すべてを試したところ、全部 `None`（マッチなし）であることを確認 → fallbackルートに入ることを確認。

このとき `fallback` には常に `source.get("category", "etc")` が渡っており、これは「その記事がどの検索クエリ（ソース）経由で見つかったか」を表すだけの値。この記事は「検索: SF6 グッズ・アパレル」という検索クエリ経由で見つかっていたため、本来の内容と無関係に `goods` になってしまっていた。

### 2-4. 影響範囲の調査
`site/data/articles.json` 全体に対して、タイトル＋本文が `CATEGORY_RULES` のどれにもマッチしない（＝fallbackでカテゴリが決まっている）記事を全て抽出するPythonスクリプトを実行。結果、**17件**該当。さらに `source` ラベルが固定のfeed系ラベル（はてなブックマーク／4Gamer／AUTOMATON）かどうかで、検索系（search型）とフィード系（feed型）に分類：

- **search型**（4件）：t.co、格ゲーチェッカー、ニコニコニュースなど、検索クエリのカテゴリをそのまま引き継いでいた
  - `auto-566d62bab474`（cat: ent）
  - `auto-b640c98d362d`（cat: ent）
  - `auto-a49df9bab3c8`（cat: ent）
  - `auto-7cbb2b3b6089`（cat: goods）← 最初に指摘された記事
- **feed型**（13件）：はてなブックマーク キーワードページ経由。同様にキーワードページのカテゴリ（dev/etcなど）を引き継いでいるだけで、内容とは無関係なケースがある

### 2-5. 修正方針の選択
ユーザーに選択肢を提示し、「その1件も含め、構造的に修正」を選んでもらった（プレビュー文言例：「classify_category(text, fallback) のfallback引き渡しを、search型ソースの場合は常に"etc"にするなど」）。

**スコープ**：今回の修正は **search型ソースのみ** が対象。feed型（はてなブックマークのキーワードページ）の13件は、ユーザーの回答文言が「search型ソース」を明示していたため、明確に対象外として保留（後述）。

### 2-6. 実装内容

**`collector/collect.py` の修正**（`collect_one_source()` 内）：

```python
if source_type == "search":
    # 検索RSSはGoogleニュースの仲介リンクなので「本文 - 配信元」を分離する
    title, source_label = split_title_source(raw_title, source.get("default_source_label", source["name"]))
    # 検索クエリのカテゴリはあくまで「どのクエリで見つかったか」でしかなく、
    # 記事内容と無関係な場合があるため、キーワード不一致時のフォールバックには使わない
    fallback_category = "etc"
else:
    title, source_label = raw_title, source["default_source_label"]
    fallback_category = source.get("category", "etc")

haystack = title + " " + desc
if not KEYWORD_RE.search(haystack):
    continue

dt = parse_date(date_raw) or now

results.append({
    "id": make_id(normalize_title_for_dedup(title)),
    "cat": classify_category(haystack, fallback_category),
    ...
})
```

これにより、今後の収集では「検索: SF6 〇〇」という検索クエリで見つかった記事でも、`CATEGORY_RULES` にマッチしなければ素直に `etc`（その他）になり、検索クエリのカテゴリを誤って引き継がなくなる。feed型ソース（はてなブックマーク等）は今回は対象外のため、従来通り `source.get("category", "etc")` を使う。

**`site/data/articles.json` の修正（既存データへの反映）**：
新ロジックが適用された場合と一致するよう、search型の4件の `cat` を `etc` に手動で揃える：
- `auto-566d62bab474`：`"cat": "ent"` → `"cat": "etc"`
- `auto-b640c98d362d`：`"cat": "ent"` → `"cat": "etc"`
- `auto-a49df9bab3c8`：`"cat": "ent"` → `"cat": "etc"`
- `auto-7cbb2b3b6089`：`"cat": "goods"` → `"cat": "etc"`（最初に指摘された記事）

### 2-7. 保留事項（今後ユーザーに確認すべき点）
feed型（はてなブックマーク キーワードページ）経由の13件についても、構造としては同じ問題（キーワードページのカテゴリ＝記事内容のカテゴリとは限らない）を抱えている。ただし今回の承認スコープが「search型ソース」に限定されていたため、意図的に対象外とした。対応するかどうかは別途ユーザーの判断を確認する必要がある。

### 2-8. 作業上の制約・注意点
- このサンドボックス環境のプロキシは `news.google.com` 等へのCONNECTを403で拒否するため、Googleニュース中継リンクの実際のリダイレクト先をcurl等で直接検証することができなかった（本番のGitHub Actionsランナーでは制約なし）。この制約はサンドボックス固有のものであり、回避策を探すのではなく「検証不可」として明示的に扱った。
- 変更のコミット・pushは、CLAUDE.mdの方針に従い、毎回AskUserQuestionで明示的な確認を取ってから実行する運用を一貫して継続。「まだしない」という回答があった際は、Stop hookの警告よりもユーザーの回答を優先し、コミットを保留した。

---

## 3. このリポジトリでの運用ルール（CLAUDE.mdより抜粋・再確認）
- 既存ファイルの更新・コミットは無断で行わず、必ず事前にユーザーへ確認する
- 指示に関係のないファイルは編集しない／指示範囲を超えた追加修正はしない
- 破壊的なGit操作・安全機構の無効化は明示的な許可がない限り行わない
- 外部に影響する操作（push、PRコメント、メール、Slack投稿等）は事前提示・確認の上で実行
- `.env` 系ファイルは読み取り禁止
- 機密情報・個人情報は一切コミットしない
- 応答・出力・コミットメッセージは日本語
- ユーザーとの会話はフランクなタメ口
