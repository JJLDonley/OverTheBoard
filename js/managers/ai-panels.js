const VIEWS = [
    ['board', 'Analysis board', 'board=', 420],
    ['winrate', 'Winrate', 'e=b,w,bar', 48],
    ['territory', 'Territory', 't=bp,bi,wp,wi,bar', 68],
    ['area', 'Area', 'a=b,w,u,bar', 68],
    ['players', 'Players and clocks', 'p=b,w', 60],
    ['pie', 'Winrate pie', 'pie=', 28],
    ['assessment', 'Move assessment', 'elements=status', 40],
    ['legend', 'Move-quality legend', 'l=', 28],
];

export class AiPanels {
    constructor({ normalize, origin, onApply }) {
        this.normalize = normalize;
        this.origin = origin;
        this.onApply = onApply;
        this.path = null;
        this.dialog = document.getElementById('aiModal');
        this.layer = document.getElementById('aiWidgetLayer');
        this.grid = document.getElementById('aiPanelGrid');
        this.dataGrid = document.createElement('div');
        this.dataGrid.className = 'ai-data-panels';
        this.grid.append(this.dataGrid);
        this.input = document.getElementById('AiOverlayHeader');
        this.error = document.getElementById('aiInputError');
        this.cards = [];
        document.getElementById('openAi').addEventListener('click', () => {
            if (window.appMode !== 'commentator') return;
            this.dialog.showModal();
            this.render();
            this.input.focus();
        });
        document.getElementById('closeAi').addEventListener('click', () => this.dialog.close());
        this.dialog.addEventListener('close', () => {
            this.render();
            document.getElementById('openAi').focus();
        });
        document.getElementById('aiSourceForm').addEventListener('submit', (event) => {
            event.preventDefault();
            if (!this.setContext(this.input.value)) return;
            this.onApply(this.path || '');
        });
        // Board shortcuts must not fire while navigating the AI dialog.
        this.dialog.addEventListener('keydown', (event) => event.stopPropagation());
        VIEWS.forEach(([id, title, query, height], index) => {
            const choice = document.createElement('label');
            const enabled = document.createElement('input');
            enabled.type = 'checkbox';
            enabled.checked = index < 3;
            enabled.dataset.aiView = id;
            choice.append(enabled, ' ' + title);
            document.getElementById('aiViewChoices').append(choice);
            const card = document.createElement('section');
            card.className = 'ai-panel';
            card.dataset.view = id;
            card.setAttribute('aria-label', title);
            card.addEventListener('keydown', (event) => event.stopPropagation());
            card.style.setProperty('--panel-height', `${height}px`);
            const header = document.createElement('div');
            header.className = 'ai-panel-header';
            const name = document.createElement('strong');
            name.textContent = title;
            const pin = document.createElement('button');
            pin.type = 'button';
            pin.className = 'ai-icon-button ai-pin';
            pin.setAttribute('aria-label', `Keep ${title} on top`);
            pin.setAttribute('aria-pressed', 'false');
            pin.title = 'Keep on top';
            pin.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 3 8 0-1 6 4 4v2H5v-2l4-4-1-6ZM12 15v6"/></svg>';
            const reload = document.createElement('button');
            reload.type = 'button';
            reload.className = 'ai-icon-button';
            reload.setAttribute('aria-label', `Reload ${title}`);
            reload.title = `Reload ${title}`;
            reload.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5M20 7l-3-3"/></svg>';
            const status = document.createElement('span');
            status.className = 'ai-panel-status';
            status.hidden = false;
            status.textContent = 'Enter a game or review to load this view.';
            const frame = document.createElement('iframe');
            frame.title = title;
            header.append(name, pin, reload);
            card.append(header, status, frame);
            (id === 'board' ? this.grid : this.dataGrid).append(card);
            const state = { id, query, height, card, frame, enabled, pin, status, index, x: 104 + index * 28, y: 12 + index * 36 };
            this.cards.push(state);
            enabled.addEventListener('change', () => {
                if (!enabled.checked) pin.setAttribute('aria-pressed', 'false');
                this.render();
            });
            pin.addEventListener('click', () => {
                pin.setAttribute('aria-pressed', String(pin.getAttribute('aria-pressed') !== 'true'));
                this.render();
            });
            reload.addEventListener('click', () => this.load(state, true));
            frame.addEventListener('load', () => {
                if (frame.hasAttribute('src')) status.hidden = true;
            });
            frame.addEventListener('error', () => { status.hidden = false; status.textContent = 'Unable to load. Try Reload.'; });
            this.makeDraggable(state, header);
            new ResizeObserver(() => {
                if (!card.hidden) this.load(state);
            }).observe(card);
        });
        new ResizeObserver(() => this.cards.forEach((state) => {
            if (state.card.classList.contains('pinned')) this.position(state);
        })).observe(this.layer);
        this.render();
    }

    setContext(value) {
        let path;
        try { path = this.normalize(value); } catch { path = null; }
        if (value.trim() && !path) {
            this.error.textContent = 'Enter game/123456, review/123456, or a BadukCast analysis URL.';
            return false;
        }
        this.error.textContent = '';
        this.path = path;
        this.input.value = path || '';
        this.render();
        return true;
    }

    load(state, force = false) {
        const { frame, status } = state;
        frame.hidden = !this.path;
        if (!this.path) {
            frame.removeAttribute('src');
            status.hidden = false;
            status.textContent = 'Enter a game or review to load this view.';
            return;
        }
        const url = new URL(`${this.origin()}/${this.path}`);
        new URLSearchParams(state.query).forEach((value, key) => url.searchParams.set(key, value));
        const width = Math.max(120, Math.min(state.id === 'board' ? 420 : 320, state.card.clientWidth - 8));
        url.searchParams.set('width', String(width));
        state.card.style.setProperty('--panel-height', `${state.id === 'board' ? width : Math.ceil(state.height * width / 320)}px`);
        if (state.id === 'board') {
            // Size the board directly: keep borders/coordinates inside the iframe
            // without relying on the analysis page's transformed outer container.
            url.searchParams.set('css',
                `body .container{transform:none!important;width:${width}px!important;` +
                `height:${width}px!important;padding:4px!important;box-sizing:border-box!important}` +
                `body .container .goboard{width:${width - 8}px!important;` +
                `height:${width - 8}px!important;box-sizing:border-box!important}`);
        } else url.searchParams.set('color', '#f4f4f5');
        if (force || frame.getAttribute('src') !== url.href) {
            status.hidden = false;
            status.textContent = 'Loading view…';
            frame.src = url.href;
        }
    }

    render() {
        const allowed = window.appMode === 'commentator';
        this.cards.forEach((state) => {
            const visible = allowed && state.enabled.checked && (this.dialog.open || (state.pin.getAttribute('aria-pressed') === 'true'));
            const pinned = visible && !this.dialog.open && (state.pin.getAttribute('aria-pressed') === 'true');
            state.card.hidden = !visible;
            state.card.classList.toggle('pinned', pinned);
            const parent = pinned ? this.layer : (state.id === 'board' ? this.grid : this.dataGrid);
            if (state.card.parentElement !== parent) parent.append(state.card);
            if (pinned) this.position(state);
            else { state.card.style.left = ''; state.card.style.top = ''; }
            if (visible) this.load(state);
            else state.frame.removeAttribute('src');
        });
    }

    position(state) {
        state.x = Math.max(0, Math.min(state.x, this.layer.clientWidth - state.card.offsetWidth));
        state.y = Math.max(0, Math.min(state.y, this.layer.clientHeight - state.card.offsetHeight));
        state.card.style.left = `${state.x}px`;
        state.card.style.top = `${state.y}px`;
    }

    makeDraggable(state, handle) {
        let drag = null;
        handle.addEventListener('pointerdown', (event) => {
            if (!state.card.classList.contains('pinned') || event.button !== 0 || event.target.closest('button, label, input')) return;
            event.preventDefault();
            drag = { x: event.clientX, y: event.clientY, left: state.x, top: state.y };
            handle.setPointerCapture(event.pointerId);
            state.card.classList.add('dragging');
        });
        handle.addEventListener('pointermove', (event) => {
            if (!drag) return;
            state.x = drag.left + event.clientX - drag.x;
            state.y = drag.top + event.clientY - drag.y;
            this.position(state);
        });
        const stop = () => { drag = null; state.card.classList.remove('dragging'); };
        handle.addEventListener('pointerup', stop);
        handle.addEventListener('pointercancel', stop);
        handle.addEventListener('lostpointercapture', stop);
    }
}
