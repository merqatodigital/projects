(() => {
  const key = 'palawan-color-mode';
  const root = document.documentElement;
  let theme = 'dark';
  try {
    if (localStorage.getItem(key) === 'light') theme = 'light';
  } catch {}
  root.dataset.theme = theme;
  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    function apply() {
      root.dataset.theme = theme;
      toggle.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
    }
    apply();
    toggle.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      apply();
      try {
        localStorage.setItem(key, theme);
      } catch {}
    });
  });
})();
