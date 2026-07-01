/* SF6 NEWS PORTAL — full list page for note/X posts (note.html / x.html).
   Which feed to load is picked via data-feed="note"|"x" on <main>. */
(function () {
  const PAGE_SIZE = 8;
  const FEEDS = {
    note: {
      file: 'note_posts.json',
      cardClass: 'note-post-card',
      text: (it) => (it.summary ? `${it.title}\n${it.summary}` : it.title),
    },
    x: {
      file: 'x_posts.json',
      cardClass: 'x-post-card',
      text: (it) => it.message,
    },
  };

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
      full: fullTime(d),
      catLabel: meta.label,
      catColor: meta.color,
      thumbBg: DN.thumbBgFor(it),
    });
  }

  function cardHtml(it, feed) {
    return `
      <a class="${feed.cardClass}" href="${DN.esc(it.source_url)}" target="_blank" rel="noopener">
        <div class="thumb" style="${DN.esc('background:' + it.thumbBg)}"></div>
        <div class="body">
          <div class="meta">
            <span class="cat" style="color:${it.catColor}">${DN.esc(it.catLabel)}</span>
            <span class="time">${DN.esc(it.full)}</span>
          </div>
          <div class="message">${DN.esc(feed.text(it))}</div>
        </div>
      </a>`;
  }

  async function init() {
    const main = document.getElementById('main');
    const feed = main && FEEDS[main.getAttribute('data-feed')];
    if (!feed) return;

    let items = [];
    try {
      items = (await DN.fetchJSON(feed.file)).map(decorate).sort((a, b) => b.ts - a.ts);
    } catch (err) {
      console.error('[feed-list] failed to load', feed.file, err);
      items = [];
    }

    let page = 1;
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const gridEl = document.getElementById('feedGrid');
    const countEl = document.getElementById('feedCount');
    const pageInfoEl = document.getElementById('feedPageInfo');
    const prevBtn = document.getElementById('feedPrevBtn');
    const nextBtn = document.getElementById('feedNextBtn');

    function render() {
      const start = (page - 1) * PAGE_SIZE;
      const pageItems = items.slice(start, start + PAGE_SIZE);
      gridEl.innerHTML = pageItems.length
        ? pageItems.map((it) => cardHtml(it, feed)).join('')
        : '<div class="empty-note">該当する記事がありません。</div>';
      if (countEl) countEl.textContent = items.length.toLocaleString('ja-JP');
      if (pageInfoEl) pageInfoEl.textContent = `${page} / ${totalPages}`;
      if (prevBtn) prevBtn.disabled = page <= 1;
      if (nextBtn) nextBtn.disabled = page >= totalPages;
    }

    if (prevBtn) prevBtn.addEventListener('click', () => { if (page > 1) { page -= 1; render(); } });
    if (nextBtn) nextBtn.addEventListener('click', () => { if (page < totalPages) { page += 1; render(); } });

    render();
  }

  document.addEventListener('dn:partials-loaded', init);
})();
