/* SF6 NEWS PORTAL — tiny data-fetch helper + shared category metadata.
   Every render module pulls content through DN.fetchJSON() instead of inline
   arrays, so swapping in real collected data is a one-line change. */
window.DN = window.DN || {};

DN.DATA_BASE = 'data/';

DN.fetchJSON = async function fetchJSON(name) {
  const res = await fetch(DN.DATA_BASE + name);
  if (!res.ok) throw new Error('Failed to load ' + name + ' (' + res.status + ')');
  return res.json();
};

DN.esc = function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
};

// 7カテゴリのラベル・カラー・カテゴリ別サムネイル画像。記事に実画像は無いので
// サムネは常にこのカテゴリ別画像(IMG_BASE配下)で表示する。thumbが未設定の場合のみ
// 色付きパターンにフォールバックする。
DN.IMG_BASE = 'assets/img/';

DN.CATEGORY_META = {
  kyo: { label: 'キャラ共通攻略', color: '#6FA8DC', thumb: 'common_thumb_clean.png' },
  koy: { label: 'キャラ固有攻略', color: '#E8615A', thumb: 'character_thumb_clean.png' },
  dev: { label: 'デバイス', color: '#4FB286', thumb: 'device_thumb_clean.png' },
  eve: { label: '大会・イベント', color: '#D8A93F', thumb: 'event_thumb_clean.png' },
  goods: { label: 'グッズ・アパレル', color: '#C77DBB', thumb: 'goods_thumb_clean.png' },
  ent: { label: 'エンタメ', color: '#E0894A', thumb: 'entame_thumb_clean.png' },
  etc: { label: 'その他', color: '#9AA0AA', thumb: 'misc_thumb_clean.png' },
};

DN.CATEGORY_ORDER = ['all', 'kyo', 'koy', 'dev', 'eve', 'goods', 'ent', 'etc'];

DN.catMeta = function catMeta(key) {
  return DN.CATEGORY_META[key] || DN.CATEGORY_META.etc;
};

// キャラクター別フィルター用の名前一覧。collector/collect.pyのCATEGORY_RULES(koy)・
// RANK_BASE_KEYWORDSのキャラ名リストと同じ並びにしている。新キャラ参戦時はここにも追加する。
DN.CHARACTERS = [
  'リュウ', 'ルーク', '春麗', 'ガイル', 'ジュリ', 'ザンギエフ', 'ケン', '豪鬼',
  'ブランカ', 'ダルシム', 'キャミィ', 'ジェイミー', 'エド', 'アキ', 'ラシード',
  'ベガ', 'テリー', 'マノン', 'マリーザ', 'リリー', 'キンバリー', 'ディージェイ',
];

// キャラ別フィルターのアイコン用色(実写・公式アートワークは使わず色分けのみで判別)。
// DN.CHARACTERSの並び順で色相を均等分散させて生成した値。
DN.CHARACTER_COLOR = {
  'リュウ': '#C84141', 'ルーク': '#C86641', '春麗': '#C88B41', 'ガイル': '#C8AF41',
  'ジュリ': '#BCC841', 'ザンギエフ': '#97C841', 'ケン': '#72C841', '豪鬼': '#4EC841',
  'ブランカ': '#41C85A', 'ダルシム': '#41C87E', 'キャミィ': '#41C8A3', 'ジェイミー': '#41C8C8',
  'エド': '#41A3C8', 'アキ': '#417EC8', 'ラシード': '#415AC8', 'ベガ': '#4E41C8',
  'テリー': '#7241C8', 'マノン': '#9741C8', 'マリーザ': '#BC41C8', 'リリー': '#C841AF',
  'キンバリー': '#C8418B', 'ディージェイ': '#C84166',
};

// アイコンに重ねる汎用シルエット(頭+肩のバスト型)。誰の顔とも特定できない
// ジェネリックな人物アイコンで、上のCHARACTER_COLORで色分けして見分ける。
DN.CHAR_SILHOUETTE_SVG = '<svg class="char-ico-svg" viewBox="0 0 24 24" aria-hidden="true">'
  + '<path fill="#fff" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4.4 0-8 2.7-8 6v1h16v-1c0-3.3-3.6-6-8-6z"/>'
  + '</svg>';

DN.hexA = function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

DN.thumbBg = function thumbBg(catKey) {
  const m = DN.catMeta(catKey);
  if (m.thumb) return `url('${DN.IMG_BASE}${m.thumb}') center/cover no-repeat, #14161a`;
  return `repeating-linear-gradient(135deg, ${DN.hexA(m.color, 0.24)} 0 8px, ${DN.hexA(m.color, 0.07)} 8px 16px)`;
};

// 記事側に実サムネイル(it.thumb)があればそれを最優先で使い、読み込み失敗時や
// 未設定時はカテゴリ別の固定画像/パターンにフォールバックする(背景レイヤーの
// 下敷きとして常に重ねておくため、上の画像が404でも透けて表示される)。
DN.thumbBgFor = function thumbBgFor(it) {
  const fallback = DN.thumbBg(it.cat);
  return it.thumb ? `url('${it.thumb}') center/cover no-repeat, ${fallback}` : fallback;
};

DN.isYouTubeUrl = function isYouTubeUrl(url) {
  return /(?:youtube\.com|youtu\.be)/i.test(url || '');
};

// Googleニュース検索経由の記事はsource_urlが中継リンクで判別できないため、
// 配信元ラベル(「本文 - YouTube」形式から抽出されたsource)もYouTube判定に使う。
// source=t.co(X投稿)はt.coの先がYouTubeとは確定できないため、本文にYouTube
// 記載がある場合のみYouTube扱いにする。
DN.isYouTubeArticle = function isYouTubeArticle(it) {
  if (DN.isYouTubeUrl(it.source_url) || it.source === 'YouTube') return true;
  if (it.source === 't.co' && /YouTube/i.test(it.title + ' ' + (it.summary || ''))) return true;
  return false;
};

// サムネ中央に重ねる再生アイコン(赤い角丸四角+三角)。YouTubeリンクの記事のみ表示。
DN.YT_BADGE_HTML = '<svg class="yt-badge" viewBox="0 0 70 70" preserveAspectRatio="none" aria-hidden="true">'
  + '<rect x="2" y="2" width="66" height="66" rx="15" fill="#FF0000"/>'
  + '<polygon points="27,20 27,50 52,35" fill="#fff"/>'
  + '</svg>';
