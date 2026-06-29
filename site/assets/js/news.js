/* SF6 NEWS PORTAL — news view (index.html) rendering.
   Loads data/articles.json + data/ranks.json once, then renders
   new-arrivals / trending / news-list purely client-side from a
   small state object, mirroring the Claude Design mockup's
   search + category-tab + trend-filter + sort + pagination logic. */
(function () {
  const PAGE_SIZE = 8;
  const NEW_COUNT = 6;

  const state = { q: '', cat: 'all', trend: null, char: null, sort: 'new', page: 1 };
  let ARTICLES = [];
  let RANKS = [];
  let X_POSTS = [];

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
      thumbBg: DN.thumbBg(it.cat),
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
      thumbBg: DN.thumbBg(it.cat),
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

  function matchesCharacter(it, char) {
    if (!char) return true;
    const hay = it.title + ' ' + (it.summary || '');
    return hay.includes(char);
  }

  function baseFiltered() {
    return ARTICLES.filter((it) => matchesQuery(it, state.q) && matchesTrend(it, state.trend) && matchesCharacter(it, state.char));
  }

  function newSection() {
    let items = baseFiltered();
    if (state.cat !== 'all') items = items.filter((it) => it.cat === state.cat);
    return items.slice().sort((a, b) => b.ts - a.ts).slice(0, NEW_COUNT);
  }

  function listAll() {
    const items = baseFiltered();
    return items.slice().sort((a, b) => (state.sort === 'old' ? a.ts - b.ts : b.ts - a.ts));
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
        renderNewArrivals();
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
        <div class="thumb" style="${thumbStyle(it)}"></div>
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
    if (!section || !root) return;
    section.hidden = X_POSTS.length === 0;
    root.innerHTML = X_POSTS.slice().sort((a, b) => b.ts - a.ts).map(xPostCardHtml).join('');
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
        <div class="thumb" style="${thumbStyle(it)}">${it.isYouTube ? DN.YT_BADGE_HTML : ''}</div>
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
    renderXPosts();
    renderTrendGrid();
    renderNewsList();
    renderSortControls();
    renderTrendFilterChip();
    renderSearchClearBtn();
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
    renderCatTabs();
    renderCharTabs();
    wireControls();
    renderAll();
  }

  document.addEventListener('dn:partials-loaded', init);
})();
