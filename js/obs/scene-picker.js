// Scenes window. The scene list and layout come from BadukCast's shared OBS
// scene template (Dashboard → OBS → Template); this file only previews it and
// asks OBS (through the VDO relay) to switch to the chosen scene by name.
const CANVAS = { width: 1920, height: 1080 };
const COLOR = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
const PC_KEY = 'overlaySceneMiniPc';
const FALLBACK_NOTE = 'Using default scenes; could not load the scene template.';
// Shared pages are identical on every PC and carry no {pc}.
const page = (name, path, shared = false) => ({
    name,
    sources: [{ name: `${name} page`, kind: 'browser', url: `https://app.baduk.club/${path}${shared ? '' : '/{pc}'}`, ...(shared ? { sameOnEveryPc: true } : {}), ...CANVAS, x: 0, y: 0, visible: true }],
});
const DEFAULT_SCENES = [
    page('Main', 'stream-overlay'), page('Intro', 'intro'), page('Hosts', 'hosts'), page('Interview', 'interview'),
    page('Break', 'stream-break', true), page('Goodbye', 'stream-goodbye', true),
];

export class ScenePicker {
    constructor(controller) {
        this.controller = controller;
        this.dialog = document.getElementById('sceneModal');
        this.grid = document.getElementById('scenePreviewGrid');
        this.status = document.getElementById('scenePickerStatus');
        this.pc = document.getElementById('sceneMiniPc');
        this.pending = null;
        this.observers = [];
        this.cards = [];
        this.scenes = DEFAULT_SCENES;
        this.note = '';
        this.loaded = false;
        let saved = '';
        try { saved = localStorage.getItem(PC_KEY) || ''; } catch { /* Use the default PC. */ }
        const pc = new URLSearchParams(location.search).get('miniPc') || saved || '3';
        this.appliedPc = /^[1-9]\d*$/.test(pc) ? String(pc) : '3';
        this.pc.value = this.appliedPc;
        const form = document.getElementById('sceneSettings');
        if (window.appMode === 'landing') {
            document.getElementById('advancedSceneSettings').append(form);
            form.append(this.status);
        }
        document.getElementById('openScenes').addEventListener('click', () => {
            if (window.appMode !== 'commentator') return;
            this.dialog.showModal(); this.render();
            this.load(); // Pick up template edits made since the page opened.
        });
        document.getElementById('closeScenes').addEventListener('click', () => this.dialog.close());
        this.dialog.addEventListener('close', () => {
            this.clear();
            document.getElementById('openScenes').focus();
        });
        this.dialog.addEventListener('keydown', event => event.stopPropagation());
        form.addEventListener('submit', event => {
            event.preventDefault();
            const pc = this.pc.value.trim();
            if (!/^[1-9]\d*$/.test(pc)) { this.status.textContent = 'Enter a numeric mini-PC ID.'; return; }
            this.pc.value = pc;
            this.appliedPc = pc;
            try { localStorage.setItem(PC_KEY, pc); }
            catch { this.status.textContent = 'Settings apply for this session; browser storage is unavailable.'; }
            window.updateShareableUrl?.();
            if (this.dialog.open) this.render();
            else this.status.textContent = 'Mini-PC ID applied to generated links.';
        });
        window.addEventListener('obs-status-changed', () => this.updateState());
        this.load();
    }

    /** BadukCast server that serves the scene template, or '' when unknown. */
    get origin() {
        try {
            const url = new URL(window.tournamentAiOrigin || new URLSearchParams(location.search).get('aiOrigin') || '');
            return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.origin : '';
        } catch { return ''; }
    }

    /** Fetches the shared template; falls back to the default scenes and never throws. */
    async load() {
        if (this.loading) return this.loading;
        this.loading = (async () => {
            let scenes = null;
            const origin = this.origin;
            if (origin) {
                try {
                    const response = await fetch(`${origin}/broadcaster/api/template`, { signal: AbortSignal.timeout(8000) });
                    if (response.ok) scenes = ScenePicker.parse(await response.json());
                } catch { /* Fall back to defaults below. */ }
            }
            // A failed refresh keeps the last template that did load.
            if (!scenes && this.loaded) return;
            const changed = JSON.stringify(scenes || DEFAULT_SCENES) !== JSON.stringify(this.scenes);
            this.loaded = !!scenes;
            this.scenes = scenes || DEFAULT_SCENES;
            this.note = scenes ? '' : FALLBACK_NOTE;
            if (this.dialog.open && changed) this.render(); else this.updateState();
        })();
        try { await this.loading; } finally { this.loading = null; }
    }

    /** Keeps only well-formed scenes and sources; returns null when nothing usable remains. */
    static parse(body) {
        const number = value => Number.isFinite(value) ? value : 0;
        const scenes = (Array.isArray(body?.template?.scenes) ? body.template.scenes : [])
            .filter(scene => typeof scene?.name === 'string' && scene.name.trim())
            .map(scene => ({
                name: scene.name,
                sources: (Array.isArray(scene.sources) ? scene.sources : [])
                    .filter(source => source && source.visible !== false
                        && ((source.kind === 'browser' && typeof source.url === 'string')
                            || (source.kind === 'color' && COLOR.test(source.color || ''))))
                    .map(source => ({ ...source, x: number(source.x), y: number(source.y), width: number(source.width), height: number(source.height) })),
            }));
        return scenes.length ? scenes : null;
    }

    appendParams(params) {
        params.set('miniPc', this.appliedPc);
    }

    /** Only plain http(s) preview pages; {pc} is the mini-PC ID unless the source is shared by all PCs. */
    previewUrl(source, pc = this.appliedPc) {
        const raw = source.sameOnEveryPc ? source.url : source.url.replaceAll('{pc}', encodeURIComponent(pc));
        const url = new URL(raw);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('Invalid preview URL');
        return url.href;
    }

    clear() {
        this.observers.forEach(observer => observer.disconnect());
        this.observers = [];
        this.cards = [];
        this.grid.replaceChildren();
    }

    /** One scaled 1920×1080 composition; frames get their src only once the card scrolls into view. */
    preview(scene) {
        const preview = document.createElement('div'); preview.className = 'scene-preview-image';
        const canvas = document.createElement('div'); canvas.className = 'scene-preview-canvas';
        const frames = [];
        for (const source of scene.sources) {
            let layer;
            if (source.kind === 'color') {
                layer = document.createElement('div');
                layer.style.background = source.color;
            } else {
                let src;
                try { src = this.previewUrl(source); } catch { continue; }
                layer = document.createElement('iframe');
                layer.title = `${scene.name}: ${source.name || 'browser source'} preview`;
                layer.tabIndex = -1;
                layer.setAttribute('aria-hidden', 'true');
                layer.setAttribute('sandbox', 'allow-scripts allow-same-origin');
                layer.referrerPolicy = 'no-referrer';
                layer.dataset.src = src;
                frames.push(layer);
            }
            layer.className = 'scene-preview-layer';
            Object.assign(layer.style, { left: `${source.x}px`, top: `${source.y}px`, width: `${source.width}px`, height: `${source.height}px` });
            canvas.append(layer);
        }
        preview.append(canvas);
        const resize = new ResizeObserver(() => { canvas.style.transform = `scale(${preview.clientWidth / CANVAS.width})`; });
        resize.observe(preview);
        const visible = new IntersectionObserver(entries => {
            if (!entries.some(entry => entry.isIntersecting)) return;
            frames.forEach(frame => { frame.src = frame.dataset.src; });
            visible.disconnect();
        }, { root: this.dialog });
        visible.observe(preview);
        this.observers.push(resize, visible);
        return preview;
    }

    render() {
        this.clear();
        this.cards = this.scenes.map(scene => {
            const card = document.createElement('button'); card.type = 'button';
            card.className = 'scene-preview-card';
            card.title = 'Click preview to switch OBS scene';
            card.setAttribute('aria-label', `Switch OBS scene to ${scene.name}`);
            const name = document.createElement('strong'); name.textContent = scene.name;
            const state = document.createElement('span'); state.className = 'scene-card-state';
            card.append(this.preview(scene), name, state); this.grid.append(card);
            card.addEventListener('click', () => {
                if (this.pending || !this.controller.isConnected) return;
                if (!this.controller.switchToScene(scene.name)) return;
                this.pending = scene.name;
                clearTimeout(this.timer);
                this.timer = setTimeout(() => {
                    this.pending = null; this.updateState();
                    this.status.textContent = 'OBS has not confirmed the switch. Check the scene name and connection, then try again.';
                }, 8000);
                this.updateState();
            });
            return { scene: scene.name, card, state };
        });
        this.updateState();
    }

    updateState() {
        if (this.pending && (this.controller.currentScene === this.pending || !this.controller.isConnected)) {
            clearTimeout(this.timer); this.pending = null;
        }
        const message = !this.controller.isConnected ? 'Connect OBS to switch scenes. Previews remain available.' : this.pending ? 'Waiting for OBS…' : 'Select a preview to switch the OBS scene.';
        this.status.textContent = [this.note, message].filter(Boolean).join(' ');
        this.cards.forEach(({ scene, card, state }) => {
            const active = this.controller.isConnected && this.controller.currentScene === scene;
            card.disabled = !this.controller.isConnected || !!this.pending;
            card.classList.toggle('active', active);
            card.setAttribute('aria-pressed', String(active));
            state.textContent = active ? 'Live' : this.pending === scene ? 'Switching…' : scene;
        });
    }
}
