/* SF6 NEWS PORTAL — shared chrome: nav highlighting + masthead LIVE counter.
   Runs once partials have been injected (dn:partials-loaded). */
(function () {
  function highlightNav() {
    const here = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('[data-nav]').forEach((a) => {
      if (a.getAttribute('data-nav') === here) a.classList.add('on');
    });
  }

  async function renderLiveCount() {
    const node = document.getElementById('liveCount');
    if (!node) return;
    try {
      const meta = await DN.fetchJSON('meta.json');
      const d = new Date(meta.updated_at);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const newCount = (meta?.new_count ?? 0).toLocaleString('ja-JP');
      const total = (meta?.combined_total_count ?? meta?.total_count ?? 0).toLocaleString('ja-JP');
      node.textContent = `LIVE ・ ${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hh}時${mm}分更新（${newCount}件追加）　データ総数 ${total}件`;
    } catch {
      node.textContent = 'LIVE';
    }
  }

  document.addEventListener('dn:partials-loaded', () => {
    highlightNav();
    renderLiveCount();
  });
})();
