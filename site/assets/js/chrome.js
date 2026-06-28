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
      const total = (meta?.total_count ?? 0).toLocaleString('ja-JP');
      node.textContent = `LIVE ・ 全${total}件を集約`;
    } catch {
      node.textContent = 'LIVE';
    }
  }

  document.addEventListener('dn:partials-loaded', () => {
    highlightNav();
    renderLiveCount();
  });
})();
