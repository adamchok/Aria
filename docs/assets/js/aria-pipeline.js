document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-aria-pipeline]').forEach((widget) => {
    const tabs = widget.querySelectorAll('[data-step-target]');
    const panes = widget.querySelectorAll('[data-step-pane]');
    if (!tabs.length || !panes.length) return;

    function activate(step) {
      tabs.forEach((tab) => {
        const isActive = tab.dataset.stepTarget === step;
        tab.classList.toggle('aria-pipeline__step--active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        tab.tabIndex = isActive ? 0 : -1;
      });

      panes.forEach((pane) => {
        const isActive = pane.dataset.stepPane === step;
        pane.classList.toggle('aria-pipeline-widget__pane--active', isActive);
        pane.hidden = !isActive;
      });
    }

    const initial =
      widget.querySelector('.aria-pipeline__step--active')?.dataset.stepTarget ??
      tabs[0].dataset.stepTarget;

    activate(initial);

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => activate(tab.dataset.stepTarget));

      tab.addEventListener('keydown', (event) => {
        const index = Array.from(tabs).indexOf(tab);
        let next = index;

        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;

        event.preventDefault();
        tabs[next].focus();
        activate(tabs[next].dataset.stepTarget);
      });
    });
  });
});
