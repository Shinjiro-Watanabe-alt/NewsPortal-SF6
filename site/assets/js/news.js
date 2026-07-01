/* SF6 NEWS PORTAL — news view (index.html) rendering.
   Loads data/articles.json + data/ranks.json once, then renders
   new-arrivals / trending / news-list purely client-side from a
   small state object, mirroring the Claude Design mockup's
   search + category-tab + trend-filter + sort + pagination logic. */
(function () {
  const PAGE_SIZE = 8;
  const NEW_COUNT = 6;
  const SHOW_INITIAL = 10;
  const SHOW_STEP = 20;
  const SHOW_MAX = 100;

  const state = { q: '', cat: 'all', trend: null, char: null, sort: 'new', page: 1 };
  let ARTICLES = [];
  let RANKS = [];
  let X_POSTS = [];
  let NOTE_POSTS = [];
  let noteShown = SHOW_INITIAL;
  let xShown = SHOW_INITIAL;

  function relTime(d) {
    const min = Math.floor((Date.now() - d.getTime()) / 60000);
    if (min < 1) return 'たった今';
    if (min < 60) return `${min}分前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}時間前`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}日前`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function fullTime(d) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
  }

  function decorate(it) {
    const d = new Date(it.time);
    const meta = DN.catMeta(it.cat);
    return Object.assign({}, it, {
      ts: d.getTime(),
      rel: relTime(d),
      full: fullTime(d),
      catLabel: meta.label,
      catColor: meta.color,
      thumbBg: DN.thumbBgFor(it),
      isYouTube: DN.isYouTubeArticle(it),
    });
  }

  function decorateXPost(it) {
    const d = new Date(it.time);
    const meta = DN.catMeta(it.cat);
    return Object.assign({}, it, {
      ts: d.getTime(),
      full: fullTime(d),
      catLabel: meta.label,
      catColor: meta.color,
      thumbBg: DN.thumbBgFor(it),
    });
  }

  function matchesQuery(it, q) {
    if (!q) return true;
    const hay = (it.title + ' ' + (it.summary || '')).toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  function matchesTrend(it, trend) {
    if (!trend) return true;
    const hay = it.title + ' ' + (it.summary || '');
    return hay.includes(trend);
  }

  function itemText(it) {
    return `${it.title || ''} ${it.summary || ''} ${it.message || ''}`;
  }

  function matchesCharacter(it, char) {
    if (!char) return true;
    return itemText(it).includes(char);
  }

  function filterCatChar(items) {
    let out = items;
    if (state.cat !== 'all') out = out.filter((it) => it.cat === state.cat);
    if (state.char) out = out.filter((it) => matchesCharacter(it, state.char));
    return out;
  }

  function baseFiltered() {
    return ARTICLES.filter((it) => matchesQuery(it, state.q) && matchesTrend(it, state.trend) && matchesCharacter(it, state.char));
  }

  function newSection() {
    let items = baseFiltered();
    if (state.cat !== 'all') items = items.filter((it) => it.cat === state.cat);
    return items.slice().sort((a, b) => b.ts - a.ts).slice(0, NEW_COUNT);
  }

  // note/Xも含めた「登録情報一覧」用の統合プール。X投稿はtitleを持たないため、
  // listItemHtml()で表示できるようmessageをtitle相当として補う
  function toListItem(it) {
    return it.title !== undefined
      ? it
      : Object.assign({}, it, { title: it.message, summary: '', source: it.source || 'X', isYouTube: false });
  }

  function registryPool() {
    return ARTICLES.concat(NOTE_POSTS, X_POSTS.map(toListItem));
  }

  function listAll() {
    const items = registryPool().filter((it) => matchesQuery(it, state.q) && matchesTrend(it, state.trend) && matchesCharacter(it, state.char));
    const filtered = state.cat !== 'all' ? items.filter((it) => it.cat === state.cat) : items;
    return filtered.slice().sort((a, b) => (state.sort === 'old' ? a.ts - b.ts : b.ts - a.ts));
  }

  function pageItems() {
    const all = listAll();
    const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * PAGE_SIZE;
    return { items: all.slice(start, start + PAGE_SIZE), total: all.length, totalPages };
  }

  function thumbStyle(it) {
    return `background:${it.thumbBg}`;
  }

  function renderCatTabs() {
    const root = document.getElementById('catTabs');
    if (!root) return;
    root.innerHTML = DN.CATEGORY_ORDER.map((key) => {
      const label = key === 'all' ? '全カテゴリ' : DN.catMeta(key).label;
      const on = state.cat === key ? ' on' : '';
      return `<button type="button" data-cat="${key}" class="${on.trim()}">${DN.esc(label)}</button>`;
    }).join('');
    root.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.cat = btn.getAttribute('data-cat');
        noteShown = SHOW_INITIAL;
        xShown = SHOW_INITIAL;
        renderNewArrivals();
        renderNotePosts();
        renderXPosts();
        renderCatTabs();
      });
    });
  }

  function renderCharTabs() {
    const root = document.getElementById('charTabs');
    if (!root) return;
    root.innerHTML = ['all', ...DN.CHARACTERS].map((name) => {
      const label = name === 'all' ? '全キャラクター' : name;
      const on = (name === 'all' ? state.char === null : state.char === name) ? ' on' : '';
      const ico = name === 'all' ? '' : `<span class="char-ico" style="background:${DN.CHARACTER_COLOR[name]}">${DN.CHAR_SILHOUETTE_SVG}</span>`;
      return `<button type="button" data-char="${DN.esc(name)}" class="${on.trim()}">${ico}${DN.esc(label)}</button>`;
    }).join('');
    root.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = btn.getAttribute('data-char');
        state.char = v === 'all' ? null : v;
        state.page = 1;
        noteShown = SHOW_INITIAL;
        xShown = SHOW_INITIAL;
        renderAll();
        renderCharTabs();
      });
    });
  }

  function renderNewArrivals() {
    const root = document.getElementById('newArrivals');
    if (!root) return;
    const items = newSection();
    root.innerHTML = items.length
      ? `<div class="list-grid">${items.map(listItemHtml).join('')}</div>`
      : '<div class="empty-note">該当する記事がありません。</div>';
  }

  function xPostCardHtml(it) {
    return `
      <a class="x-post-card" href="${DN.esc(it.source_url)}" target="_blank" rel="noopener">
        <div class="thumb" style="${DN.esc(thumbStyle(it))}"></div>
        <div class="body">
          <div class="meta">
            <span class="cat" style="color:${it.catColor}">${DN.esc(it.catLabel)}</span>
            <span class="time">${DN.esc(it.full)}</span>
          </div>
          <div class="message">${DN.esc(it.message)}</div>
        </div>
      </a>`;
  }

  function renderXPosts() {
    const section = document.getElementById('xPostsSection');
    const root = document.getElementById('xPostsGrid');
    const moreBtn = document.getElementById('xShowMoreBtn');
    if (!section || !root) return;
    const sorted = filterCatChar(X_POSTS).slice().sort((a, b) => b.ts - a.ts);
    section.hidden = X_POSTS.length === 0;
    const cap = Math.min(sorted.length, SHOW_MAX);
    root.innerHTML = sorted.length
      ? sorted.slice(0, xShown).map(xPostCardHtml).join('')
      : '<div class="empty-note">該当する投稿がありません。</div>';
    if (moreBtn) moreBtn.hidden = xShown >= cap;
  }

  function notePostCardHtml(it) {
    const message = it.summary ? `${it.title}\n${it.summary}` : it.title;
    return `
      <a class="note-post-card" href="${DN.esc(it.source_url)}" target="_blank" rel="noopener">
        <div class="thumb" style="${DN.esc(thumbStyle(it))}"></div>
        <div class="body">
          <div class="meta">
            <span class="cat" style="color:${it.catColor}">${DN.esc(it.catLabel)}</span>
            <span class="time">${DN.esc(it.full)}</span>
          </div>
          <div class="message">${DN.esc(message)}</div>
        </div>
      </a>`;
  }

  function renderNotePosts() {
    const section = document.getElementById('notePostsSection');
    const root = document.getElementById('notePostsGrid');
    const moreBtn = document.getElementById('noteShowMoreBtn');
    if (!section || !root) return;
    const sorted = filterCatChar(NOTE_POSTS).slice().sort((a, b) => b.ts - a.ts);
    section.hidden = NOTE_POSTS.length === 0;
    const cap = Math.min(sorted.length, SHOW_MAX);
    root.innerHTML = sorted.length
      ? sorted.slice(0, noteShown).map(notePostCardHtml).join('')
      : '<div class="empty-note">該当する記事がありません。</div>';
    if (moreBtn) moreBtn.hidden = noteShown >= cap;
  }

  function wireShowMoreButtons() {
    const noteBtn = document.getElementById('noteShowMoreBtn');
    const xBtn = document.getElementById('xShowMoreBtn');
    if (noteBtn) {
      noteBtn.addEventListener('click', () => {
        noteShown = Math.min(noteShown + SHOW_STEP, SHOW_MAX);
        renderNotePosts();
      });
    }
    if (xBtn) {
      xBtn.addEventListener('click', () => {
        xShown = Math.min(xShown + SHOW_STEP, SHOW_MAX);
        renderXPosts();
      });
    }
  }

  function renderTrendGrid() {
    const root = document.getElementById('trendGrid');
    if (!root) return;
    const maxScore = RANKS.reduce((m, r) => Math.max(m, r.score), 1);
    root.innerHTML = RANKS.map((r, i) => {
      const rank = i + 1;
      const pct = Math.max(6, Math.round((r.score / maxScore) * 100));
      const active = state.trend === r.keyword;
      const arrowChar = r.arrow === 'up' ? '▲' : r.arrow === 'down' ? '▼' : '―';
      const arrowColor = r.arrow === 'up' ? '#E8412E' : r.arrow === 'down' ? '#6FA8DC' : '#6b7079';
      return `
        <button type="button" class="trend-row${active ? ' active' : ''}" data-word="${DN.esc(r.keyword)}">
          <span class="rank${rank <= 3 ? ' top' : ''}">${rank}</span>
          <span class="mid">
            <span class="word">${DN.esc(r.keyword)}</span>
            <span class="bar" style="width:${pct}%"></span>
          </span>
          <span class="score">${r.score}</span>
          <span class="arrow" style="color:${arrowColor}">${arrowChar}</span>
        </button>`;
    }).join('');
    root.querySelectorAll('.trend-row').forEach((row) => {
      row.addEventListener('click', () => {
        const word = row.getAttribute('data-word');
        state.trend = state.trend === word ? null : word;
        state.page = 1;
        renderAll();
      });
    });
  }

  function listItemHtml(it) {
    const showExcerpt = !!it.summary;
    return `
      <a class="list-item" href="${DN.esc(it.source_url)}" target="_blank" rel="noopener">
        <div class="thumb" style="${DN.esc(thumbStyle(it))}">${it.isYouTube ? DN.YT_BADGE_HTML : ''}</div>
        <div class="body">
          <div class="meta">
            <span class="cat" style="color:${it.catColor}">${DN.esc(it.catLabel)}</span>
            <span class="time">${DN.esc(it.full)}</span>
          </div>
          <div class="title">${DN.esc(it.title)}</div>
          ${showExcerpt ? `<div class="excerpt">${DN.esc(it.summary)}</div>` : ''}
          <div class="source">参照元: ${DN.esc(it.source)}</div>
        </div>
      </a>`;
  }

  function renderNewsList() {
    const root = document.getElementById('newsList');
    const countNode = document.getElementById('listCount');
    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    if (!root) return;
    const { items, total, totalPages } = pageItems();
    root.innerHTML = items.length
      ? items.map(listItemHtml).join('')
      : '<div class="empty-note">該当する記事がありません。</div>';
    if (countNode) countNode.textContent = total.toLocaleString('ja-JP');
    if (pageInfo) pageInfo.textContent = `${state.page} / ${totalPages}`;
    if (prevBtn) prevBtn.disabled = state.page <= 1;
    if (nextBtn) nextBtn.disabled = state.page >= totalPages;
  }

  function renderSortControls() {
    const newBtn = document.getElementById('sortNewBtn');
    const oldBtn = document.getElementById('sortOldBtn');
    if (newBtn) newBtn.classList.toggle('on', state.sort === 'new');
    if (oldBtn) oldBtn.classList.toggle('on', state.sort === 'old');
  }

  function renderTrendFilterChip() {
    const wrap = document.getElementById('trendFilter');
    const wordNode = document.getElementById('trendFilterWord');
    if (!wrap) return;
    wrap.hidden = !state.trend;
    if (state.trend && wordNode) wordNode.textContent = state.trend;
  }

  function renderSearchClearBtn() {
    const btn = document.getElementById('clearSearchBtn');
    if (btn) btn.hidden = !state.q;
  }

  function renderAll() {
    renderNewArrivals();
    renderNotePosts();
    renderXPosts();
    renderTrendGrid();
    renderNewsList();
    renderSortControls();
    renderTrendFilterChip();
    renderSearchClearBtn();
  }

  function wireCharFilterToggle() {
    const toggle = document.getElementById('charFilterToggle');
    const panel = document.getElementById('charTabs');
    if (!toggle || !panel) return;
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
    });
  }

  function wireControls() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    const trendClearBtn = document.getElementById('trendClearBtn');
    const sortNewBtn = document.getElementById('sortNewBtn');
    const sortOldBtn = document.getElementById('sortOldBtn');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        state.q = searchInput.value;
        state.page = 1;
        renderAll();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        state.q = '';
        if (searchInput) searchInput.value = '';
        renderAll();
      });
    }
    if (trendClearBtn) {
      trendClearBtn.addEventListener('click', () => {
        state.trend = null;
        renderAll();
      });
    }
    if (sortNewBtn) {
      sortNewBtn.addEventListener('click', () => {
        state.sort = 'new';
        state.page = 1;
        renderAll();
      });
    }
    if (sortOldBtn) {
      sortOldBtn.addEventListener('click', () => {
        state.sort = 'old';
        state.page = 1;
        renderAll();
      });
    }
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (state.page > 1) { state.page -= 1; renderAll(); }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const { totalPages } = pageItems();
        if (state.page < totalPages) { state.page += 1; renderAll(); }
      });
    }
  }

  async function init() {
    try {
      const [articles, ranks] = await Promise.all([
        DN.fetchJSON('articles.json'),
        DN.fetchJSON('ranks.json'),
      ]);
      ARTICLES = articles.map(decorate);
      RANKS = ranks;
    } catch (err) {
      console.error('[news] failed to load data', err);
      ARTICLES = [];
      RANKS = [];
    }
    try {
      X_POSTS = (await DN.fetchJSON('x_posts.json')).map(decorateXPost);
    } catch (err) {
      console.error('[news] failed to load x_posts', err);
      X_POSTS = [];
    }
    try {
      NOTE_POSTS = (await DN.fetchJSON('note_posts.json')).map(decorate);
    } catch (err) {
      console.error('[news] failed to load note_posts', err);
      NOTE_POSTS = [];
    }
    renderCatTabs();
    renderCharTabs();
    wireCharFilterToggle();
    wireShowMoreButtons();
    wireControls();
    renderAll();
  }

  document.addEventListener('dn:partials-loaded', init);
})();
