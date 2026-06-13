/**
 * Pull-to-refresh för mobil.
 * Fungerar både i browser och i PWA-läge utan native pull-to-refresh.
 */
(function () {
    if (!('ontouchstart' in window)) return;
    if (document.body.classList.contains('game-body')) return;

    const PULL_THRESHOLD = 120;
    let startY = 0;
    let isPulling = false;
    let indicator = null;

    function createIndicator() {
        const el = document.createElement('div');
        el.id = 'pull-to-refresh';
        el.innerHTML =
            '<div class="pull-spinner"></div><span class="pull-text">Dra nedåt för att ladda om</span>';
        document.body.prepend(el);
        return el;
    }

    function getScrollTop() {
        return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }

    function isInsideScrollable(el) {
        let node = el;
        while (node && node !== document.body && node !== document.documentElement) {
            const style = window.getComputedStyle(node);
            if (/(auto|scroll)/.test(style.overflow + style.overflowY + style.overflowX)) {
                return true;
            }
            node = node.parentElement;
        }
        return false;
    }

    function onTouchStart(e) {
        if (getScrollTop() > 0) return;
        startY = e.touches[0].clientY;
        isPulling = true;
    }

    function onTouchMove(e) {
        if (!isPulling) return;

        const y = e.touches[0].clientY;
        const diff = y - startY;
        if (diff <= 0) return;

        if (isInsideScrollable(e.target)) return;

        if (diff > 10) {
            e.preventDefault();
            if (!indicator) indicator = createIndicator();
            indicator.classList.add('pull-visible');
            indicator.style.transform = `translateY(${Math.min(diff / 2, PULL_THRESHOLD)}px)`;

            if (diff >= PULL_THRESHOLD) {
                indicator.classList.add('pull-ready');
                indicator.querySelector('.pull-text').textContent = 'Släpp för att ladda om';
            } else {
                indicator.classList.remove('pull-ready');
                indicator.querySelector('.pull-text').textContent = 'Dra nedåt för att ladda om';
            }
        }
    }

    function onTouchEnd() {
        if (!isPulling) return;
        isPulling = false;
        if (!indicator) return;

        if (indicator.classList.contains('pull-ready')) {
            indicator.querySelector('.pull-text').textContent = 'Laddar om...';
            location.reload();
        } else {
            indicator.classList.remove('pull-visible', 'pull-ready');
            indicator.style.transform = '';
        }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true });
})();
