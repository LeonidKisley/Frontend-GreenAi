/* Appearance only: no authentication, requests or metric transformations. */
(() => {
  const root = document.documentElement;
  try { root.classList.toggle('light-mode', localStorage.getItem('greenai-theme') === 'light'); } catch {}
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('theme-toggle');
    if (!button) return;
    const sync = () => {
      const light = root.classList.contains('light-mode');
      button.setAttribute('aria-checked', String(light));
      button.setAttribute('aria-label', 'Modo claro');
      if (!button.querySelector('.theme-track')) button.textContent = light ? 'Modo claro' : 'Modo oscuro';
    };
    sync();
    button.addEventListener('click', () => {
      const light = root.classList.toggle('light-mode');
      try { localStorage.setItem('greenai-theme', light ? 'light' : 'dark'); } catch {}
      sync();
    });
  });
})();
