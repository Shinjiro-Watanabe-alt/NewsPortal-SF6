# NewsPortal-SF6

ストリートファイター6（SF6）＆レバーレスコントローラー関連の情報を自動収集する、個人用ニュースポータルです。
ビルド不要・フレームワーク不使用の静的サイトとして構築しています。

## 構成

```
collector/
  collect.py        # ニュース収集スクリプト（標準ライブラリのみ、pip不要）
  sources.json       # 収集元一覧（RSS/Atomフィード、Googleニュース検索）
site/
  index.html         # ニュース一覧ページ
  sources.html        # データソース管理ページ
  partials/          # 共通パーツ（masthead/footer等）
  assets/            # CSS/JS/カテゴリサムネイル画像
  data/              # collect.pyが生成するJSONデータ
.github/workflows/
  collect-sf6-news.yml # 収集cron + 手動実行、差分があれば自動commit
  deploy-pages.yml     # site/ へのpushでGitHub Pagesへ自動デプロイ
```

## サイトの仕組み

- 純粋な静的HTML/CSS/JS。ビルドステップなし。`python3 -m http.server` 等でそのまま動作確認できます。
- 共通パーツは `partials/*.html` に分離し、`assets/js/include.js` が `data-include` 属性を持つ要素へ
  フェッチして差し込みます。差し込み完了後に `dn:partials-loaded` イベントが発火し、各ページの描画処理が
  走ります。
- データは全て `site/data/*.json` を `assets/js/data.js` の `DN.fetchJSON()` で取得します。バックエンドAPIは
  ありません。

## 収集の仕組み

- `collector/collect.py` は標準ライブラリのみで動作し、pip installは不要です。
- `collector/sources.json` に列挙したRSS/Atomフィード、Googleニュース検索RSS等を巡回し、キーワードで
  フィルタしてカテゴリ自動分類した上で `site/data/*.json` を生成します。
- 同一記事が複数の経路で重複収集された場合は、タイトル正規化ベースで1件に統合します。
- 直近の記事タイトルから話題の急上昇ワードを抽出し、`ranks.json` として出力します。

## ローカルでの確認方法

```bash
python3 collector/collect.py   # site/data/*.json を生成
python3 -m http.server --directory site  # http://localhost:8000 で確認
```

## デプロイ

GitHub Pagesで公開する場合は、リポジトリの Settings → Pages → Build and deployment → Source を
`GitHub Actions` に設定してください。`deploy-pages.yml` が `site/` 配下へのpushをトリガーに自動デプロイします。
