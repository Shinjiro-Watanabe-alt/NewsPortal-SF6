/* SF6 NEWS PORTAL — data-source management view (sources.html) rendering.
   Reads data/sources.json (derived from collector/sources.json at
   collection time) and renders summary stat cards + per-source cards. */
(function () {
  const METHOD = {
    rss: { label: 'RSS / Atom', color: '#4FB286' },
    search: { label: 'ニュース検索(RSS)', color: '#4FB286' },
    api: { label: 'API', color: '#6FA8DC' },
    scrape: { label: 'スクレイピング', color: '#D8A93F' },
    detect: { label: '更新検知', color: '#C77DBB' },
    blocked: { label: '要対応', color: '#E8615A' },
  };
  const STATUS = {
    active: { label: '取得可', color: '#4FB286' },
    check: { label: '要確認', color: '#D8A93F' },
    blocked: { label: '不可寄り', color: '#E8615A' },
  };

  function methodMeta(key) {
    return METHOD[key] || METHOD.scrape;
  }
  function statusMeta(key) {
    return STATUS[key] || STATUS.check;
  }

  function statCardHtml(num, label) {
    return `<div class="stat-card"><div class="num">${num}</div><div class="label">${DN.esc(label)}</div></div>`;
  }

  function sourceCardHtml(s) {
    const m = methodMeta(s.method);
    const st = statusMeta(s.status);
    const catLabel = DN.catMeta(s.cat).label;
    return `
      <div class="source-card" style="--m:${m.color}">
        <div class="head">
          <div>
            <div class="name">${DN.esc(s.name)}</div>
            <div class="url">${DN.esc(s.url)}</div>
          </div>
          <div class="status"><span class="dot" style="background:${st.color}"></span>${DN.esc(st.label)}</div>
        </div>
        <div class="tags">
          <span class="method" style="background:${DN.hexA(m.color, 0.16)};color:${m.color}">${DN.esc(m.label)}</span>
          <span class="cat">${DN.esc(catLabel)}</span>
        </div>
        <div class="endpoint"><span class="lbl">endpoint:</span> ${DN.esc(s.endpoint || '-')}</div>
        <div class="note">${DN.esc(s.note || '')}</div>
      </div>`;
  }

  function render(sources) {
    const statRoot = document.getElementById('statCards');
    const gridRoot = document.getElementById('sourceGrid');
    if (!statRoot || !gridRoot) return;

    const cntActive = sources.filter((s) => s.status === 'active').length;
    const cntCheck = sources.filter((s) => s.status === 'check').length;
    const cntBlocked = sources.filter((s) => s.status === 'blocked').length;
    const cntRss = sources.filter((s) => s.method === 'rss' || s.method === 'search').length;

    statRoot.innerHTML = [
      statCardHtml(sources.length, '登録ソース総数'),
      statCardHtml(cntActive, '取得可'),
      statCardHtml(cntCheck, '要確認'),
      statCardHtml(cntBlocked, '不可寄り'),
      statCardHtml(cntRss, 'RSS取得'),
    ].join('');

    gridRoot.innerHTML = sources.map(sourceCardHtml).join('');
  }

  async function init() {
    try {
      const sources = await DN.fetchJSON('sources.json');
      render(sources);
    } catch (err) {
      console.error('[sources] failed to load data', err);
      render([]);
    }
  }

  document.addEventListener('dn:partials-loaded', init);
})();
