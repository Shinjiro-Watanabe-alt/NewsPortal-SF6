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

DN.hexA = function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

DN.thumbBg = function thumbBg(catKey) {
  const m = DN.catMeta(catKey);
  if (m.thumb) return `url('${DN.IMG_BASE}${m.thumb}') center/cover no-repeat, #14161a`;
  return `repeating-linear-gradient(135deg, ${DN.hexA(m.color, 0.24)} 0 8px, ${DN.hexA(m.color, 0.07)} 8px 16px)`;
};

DN.isYouTubeUrl = function isYouTubeUrl(url) {
  return /(?:youtube\.com|youtu\.be)/i.test(url || '');
};

// Googleニュース検索経由の記事はsource_urlが中継リンクで判別できないため、
// 配信元ラベル(「本文 - YouTube」形式から抽出されたsource)もYouTube判定に使う。
DN.isYouTubeArticle = function isYouTubeArticle(it) {
  return DN.isYouTubeUrl(it.source_url) || it.source === 'YouTube';
};

// サムネ中央に重ねる再生アイコン(赤い角丸四角+三角)。YouTubeリンクの記事のみ表示。
DN.YT_BADGE_HTML = '<svg class="yt-badge" viewBox="0 0 70 70" preserveAspectRatio="none" aria-hidden="true">'
  + '<rect x="2" y="2" width="66" height="66" rx="15" fill="#FF0000"/>'
  + '<polygon points="27,20 27,50 52,35" fill="#fff"/>'
  + '</svg>';
