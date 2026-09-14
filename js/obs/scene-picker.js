const SCENE_KEYS = ['Main', 'Intro', 'Hosts', 'Interview'];
const DEFAULTS = [
    { label: 'Main stream', path: '/stream-overlay/{pc}', scene: 'Main stream', enabled: true },
    { label: 'Intro', path: '/intro/{pc}', scene: 'Intro', enabled: true },
    { label: 'Hosts', path: '/hosts/{pc}', scene: 'Hosts', enabled: true },
    { label: 'Interview', path: '/interview/{pc}', scene: 'Interview', enabled: true },
];

export class ScenePicker {
    constructor(controller) {
        this.controller = controller;
        this.dialog = document.getElementById('sceneModal');
        this.grid = document.getElementById('scenePreviewGrid');
        this.status = document.getElementById('scenePickerStatus');
        this.pc = document.getElementById('sceneMiniPc');
        this.rows = document.getElementById('sceneConfigRows');
        this.pending = null;
        this.observers = [];
        let saved;
        try { saved = JSON.parse(localStorage.getItem('overlayScenePreviews')); } catch { /* Use defaults. */ }
        const params = new URLSearchParams(location.search);
        this.config = DEFAULTS.map((entry, index) => {
            const previous = saved?.scenes?.[index] || {};
            const config = {
                ...entry, ...previous,
                scene: previous.scene?.trim() || entry.scene,
                // Older settings disabled unfinished pages automatically.
                enabled: saved?.version === 2 ? previous.enabled ?? true : true,
            };
            const prefix = `scene${SCENE_KEYS[index]}`;
            if (params.has(`${prefix}Url`)) {
                const path = params.get(`${prefix}Url`);
                try { this.previewUrl(path, '3'); config.path = path; } catch { config.path = entry.path; }
            }
            if (params.has(`${prefix}Name`)) config.scene = params.get(`${prefix}Name`);
            if (params.has(`${prefix}Enabled`)) config.enabled = params.get(`${prefix}Enabled`) !== '0';
            // Validate saved paths as well as shared links before rendering frames.
            try { this.previewUrl(config.path, '3'); } catch { config.path = entry.path; }
            return config;
        });
        const pc = params.get('miniPc') || saved?.pc || '3';
        this.appliedPc = /^[1-9]\d*$/.test(pc) ? String(pc) : '3';
        this.pc.value = this.appliedPc;
        const form = document.getElementById('sceneSettings');
        if (window.appMode === 'landing') {
            document.getElementById('advancedSceneSettings').append(form);
            form.append(this.status);
        }
        this.config.forEach((entry, index) => {
            const row = document.createElement('div');
            row.className = 'scene-config-row';
            const label = document.createElement('label');
            const enabled = document.createElement('input');
            enabled.type = 'checkbox'; enabled.checked = entry.enabled;
            label.append(enabled, entry.label);
            const path = document.createElement('input');
            path.value = entry.path; path.setAttribute('aria-label', `${entry.label} preview URL`);
            const scene = document.createElement('input');
            scene.value = entry.scene; scene.placeholder = 'Exact OBS scene name';
            scene.setAttribute('aria-label', `${entry.label} OBS scene name`);
            row.append(label, path, scene); this.rows.append(row);
            entry.fields = { enabled, path, scene };
        });
        document.getElementById('openScenes').addEventListener('click', () => {
            if (window.appMode !== 'commentator') return;
            this.dialog.showModal(); this.render();
        });
        document.getElementById('closeScenes').addEventListener('click', () => this.dialog.close());
        this.dialog.addEventListener('close', () => {
            this.observers.forEach(observer => observer.disconnect());
            this.observers = [];
            this.grid.replaceChildren();
            document.getElementById('openScenes').focus();
        });
        this.dialog.addEventListener('keydown', event => event.stopPropagation());
        document.getElementById('sceneSettings').addEventListener('submit', event => {
            event.preventDefault();
            const pc = this.pc.value.trim();
            if (!/^[1-9]\d*$/.test(pc)) { this.status.textContent = 'Enter a numeric mini-PC ID.'; return; }
            const next = this.config.map(entry => ({ label: entry.label, path: entry.fields.path.value.trim(), scene: entry.fields.scene.value.trim(), enabled: entry.fields.enabled.checked }));
            try { next.forEach(entry => this.previewUrl(entry.path, pc)); }
            catch { this.status.textContent = 'Use an HTTPS Tenjin URL or a path such as /intro/{pc}.'; return; }
            this.config.forEach((entry, i) => Object.assign(entry, next[i]));
            this.pc.value = pc;
            this.appliedPc = pc;
            try { localStorage.setItem('overlayScenePreviews', JSON.stringify({ version: 2, pc, scenes: next })); }
            catch { this.status.textContent = 'Settings apply for this session; browser storage is unavailable.'; }
            window.updateShareableUrl?.();
            if (this.dialog.open) this.render();
            else this.status.textContent = 'Scene settings applied to generated links.';
        });
        window.addEventListener('obs-status-changed', () => this.updateState());
    }

    appendParams(params) {
        params.set('miniPc', this.appliedPc);
        this.config.forEach((entry, index) => {
            const prefix = `scene${SCENE_KEYS[index]}`;
            params.set(`${prefix}Url`, entry.path);
            params.set(`${prefix}Name`, entry.scene);
            params.set(`${prefix}Enabled`, entry.enabled ? '1' : '0');
        });
    }

    previewUrl(path, pc = this.appliedPc) {
        const url = new URL(path.replaceAll('{pc}', encodeURIComponent(pc)), 'https://app.baduk.club');
        if (url.protocol !== 'https:' || url.origin !== 'https://app.baduk.club') throw Error('Invalid preview URL');
        return url.href;
    }

    render() {
        this.observers.forEach(observer => observer.disconnect());
        this.observers = [];
        this.grid.replaceChildren();
        this.config.forEach(entry => {
            const card = document.createElement('button'); card.type = 'button';
            card.className = 'scene-preview-card';
            card.title = 'Click preview to switch OBS scene';
            card.setAttribute('aria-label', `Switch OBS scene to ${entry.scene || entry.label}`);
            const preview = document.createElement('div'); preview.className = 'scene-preview-image';
            if (entry.enabled) {
                const frame = document.createElement('iframe');
                frame.title = `${entry.label} preview`; frame.tabIndex = -1;
                frame.setAttribute('aria-hidden', 'true'); frame.src = this.previewUrl(entry.path);
                preview.append(frame);
                const observer = new ResizeObserver(() => { frame.style.transform = `scale(${preview.clientWidth / 1920})`; });
                observer.observe(preview);
                this.observers.push(observer);
            } else preview.textContent = 'Coming soon';
            const name = document.createElement('strong'); name.textContent = entry.label;
            const state = document.createElement('span'); state.className = 'scene-card-state';
            card.append(preview, name, state); this.grid.append(card);
            entry.card = card; entry.state = state;
            card.addEventListener('click', () => {
                if (!entry.enabled || !entry.scene || this.pending || !this.controller.isConnected) return;
                if (!this.controller.switchToScene(entry.scene)) return;
                this.pending = entry.scene;
                clearTimeout(this.timer);
                this.timer = setTimeout(() => {
                    this.pending = null; this.updateState();
                    this.status.textContent = 'OBS has not confirmed the switch. Check the scene name and connection, then try again.';
                }, 8000);
                this.updateState();
            });
        });
        this.updateState();
    }

    updateState() {
        if (this.pending && (this.controller.currentScene === this.pending || !this.controller.isConnected)) {
            clearTimeout(this.timer); this.pending = null;
        }
        this.status.textContent = !this.controller.isConnected ? 'Connect OBS to switch scenes. Previews remain available.' : this.pending ? 'Waiting for OBS…' : 'Select a preview to switch the OBS scene.';
        this.config.forEach(entry => {
            if (!entry.card) return;
            const active = this.controller.isConnected && !!entry.scene && this.controller.currentScene === entry.scene;
            entry.card.disabled = !entry.enabled || !entry.scene || !this.controller.isConnected || !!this.pending;
            entry.card.classList.toggle('active', active);
            entry.card.setAttribute('aria-pressed', String(active));
            entry.state.textContent = !entry.enabled ? 'Not configured yet' : !entry.scene ? 'Set OBS scene name in settings' : active ? 'Live' : this.pending === entry.scene ? 'Switching…' : entry.scene;
        });
    }
}
