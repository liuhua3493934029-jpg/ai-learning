/* WEFT / 织理 — event-driven; timers are limited to short entry feedback. */
(() => {
  'use strict';
  const root = document.documentElement;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const choices = [...document.querySelectorAll('[data-theme-choice]')];
  const menuButton = document.querySelector('.weft-theme-menu');
  const themeOptions = document.querySelector('.theme-switch');
  const mobile = matchMedia('(max-width:580px)');
  let active = false;
  let frame = 0;
  let entryTimer = 0;

  function closeMenu(restoreFocus = false) {
    delete themeOptions.dataset.weftOpen;
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', '展开主题选择');
    if (restoreFocus && active && mobile.matches) menuButton.focus({preventScroll:true});
  }

  function measure() {
    frame = 0;
    if (!active) return;
    const distance = Math.max(1, root.scrollHeight - innerHeight);
    const progress = Math.max(0, Math.min(1, scrollY / distance));
    root.style.setProperty('--weft-scroll', progress.toFixed(4));
  }

  function schedule() {
    if (active && !frame && !document.hidden) frame = requestAnimationFrame(measure);
  }

  function sync(entered = false) {
    const next = root.dataset.theme === 'weft';
    if (next === active) return;
    active = next;
    clearTimeout(entryTimer);
    delete root.dataset.weftEnter;
    if (active) {
      measure();
      if (entered && !motion.matches) {
        root.dataset.weftEnter = 'true';
        entryTimer = setTimeout(() => { delete root.dataset.weftEnter; }, 700);
      }
    } else {
      closeMenu(false);
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  menuButton.addEventListener('click', () => {
    if (themeOptions.dataset.weftOpen === 'true') {
      closeMenu(true);
      return;
    }
    themeOptions.dataset.weftOpen = 'true';
    menuButton.setAttribute('aria-expanded', 'true');
    menuButton.setAttribute('aria-label', '收起主题选择');
  });
  choices.forEach(button => button.addEventListener('click', () => {
    sync(true);
    closeMenu(root.dataset.theme === 'weft');
  }));
  document.addEventListener('click', event => {
    if (themeOptions.dataset.weftOpen === 'true' && !themeOptions.contains(event.target) && !menuButton.contains(event.target)) closeMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && themeOptions.dataset.weftOpen === 'true') {
      event.preventDefault();
      closeMenu(true);
    }
  });
  mobile.addEventListener('change', () => closeMenu(false));
  addEventListener('scroll', schedule, {passive: true});
  addEventListener('resize', schedule, {passive: true});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else schedule();
  });
  motion.addEventListener('change', () => {
    clearTimeout(entryTimer);
    delete root.dataset.weftEnter;
    schedule();
  });
  addEventListener('pageshow', () => sync(false));
  addEventListener('pagehide', () => {
    cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(entryTimer);
  });
  sync(false);
})();
