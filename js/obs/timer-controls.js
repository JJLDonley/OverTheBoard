// Native break-timer controls. Commands go straight to Orcha's Timer API using
// the commentary code loaded in this tab (memory only), never through VDO/OBS.
const PCS = /^PC[1-8]$/;
const POLL_MS = 1000;

export class TimerControls {
    constructor() {
        this.select = document.getElementById('TimerPc');
        this.dialog = document.getElementById('timerModal');
        this.time = document.getElementById('timerTime');
        this.status = document.getElementById('timerStatus');
        this.minutes = document.getElementById('timerMinutes');
        this.seconds = document.getElementById('timerSeconds');
        this.buttons = [...this.dialog.querySelectorAll('button[data-timer-action], #timerStart')];
        this.state = null;
        this.receivedAt = 0;
        this.busy = false;
        this.initialized = false;

        const params = new URLSearchParams(location.search);
        if (params.get('role') !== 'VW') this.select.value = TimerControls.pcFrom(params.get('Timer'));
        this.select.addEventListener('change', () => {
            this.state = null;
            this.initialized = false;
            window.updateShareableUrl?.();
        });

        document.getElementById('openTimer').addEventListener('click', () => {
            if (window.appMode !== 'commentator') return;
            this.dialog.showModal();
            this.start();
        });
        document.getElementById('closeTimer').addEventListener('click', () => this.dialog.close());
        this.dialog.addEventListener('close', () => this.stop());
        document.getElementById('timerDuration').addEventListener('submit', event => {
            event.preventDefault();
            const total = Number(this.minutes.value) * 60 + Number(this.seconds.value);
            this.command('start', total);
        });
        this.codeForm = document.getElementById('timerCodeForm');
        this.code = document.getElementById('timerCode');
        this.codeForm.addEventListener('submit', event => {
            event.preventDefault();
            this.unlock();
        });
        this.dialog.querySelectorAll('[data-timer-action]').forEach(button =>
            button.addEventListener('click', () => this.command(button.dataset.timerAction)));
    }

    /** Accepts "PC3" or a legacy Orcha control link such as https://host/timer/PC3/control. */
    static pcFrom(value) {
        const text = String(value || '').trim();
        if (PCS.test(text)) return text;
        const match = text.match(/\/timer\/(PC[1-8])(?:\/control)?\/?(?:[?#]|$)/);
        return match ? match[1] : '';
    }

    get pc() { return PCS.test(this.select.value) ? this.select.value : ''; }

    get origin() {
        try {
            const url = new URL(window.tournamentAiOrigin || new URLSearchParams(location.search).get('aiOrigin') || '');
            return ['https:', 'http:'].includes(url.protocol) ? url.origin : '';
        } catch { return ''; }
    }

    ready() {
        if (!this.pc) return 'Choose this table’s PC under Break timer in Session Setup.';
        if (!window.tournamentAccessKey || !this.origin) return 'Enter your commentary code to control the timer.';
        return '';
    }

    /** Commentator links open a fresh page, so the code can be entered here (memory only). */
    async unlock() {
        const key = this.code.value.trim().toUpperCase();
        if (!/^[A-Z2-9]{8}$/.test(key)) { this.status.textContent = 'Enter your eight-character commentary code.'; return; }
        if (!this.origin) { this.status.textContent = 'This link has no BadukCast server. Generate it again from Session Setup.'; return; }
        this.status.textContent = 'Checking code\u2026';
        try {
            const response = await fetch(`${this.origin}/api/v1/bootstrap`, {
                headers: { 'X-BadukCast-Key': key }, credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) throw Error(response.status === 401 ? 'That code is invalid, expired, or revoked.' : 'Could not check the code. Try again.');
            window.tournamentAccessKey = key;
            window.tournamentAiOrigin = this.origin;
            this.code.value = '';
            this.start();
        } catch (error) {
            this.status.textContent = error instanceof TypeError || error.name === 'TimeoutError' ? 'Cannot reach BadukCast. Try again.' : error.message;
        }
    }

    start() {
        this.stop();
        this.state = null;
        this.initialized = false;
        this.render();
        const problem = this.ready();
        this.codeForm.hidden = !!window.tournamentAccessKey || !this.pc;
        if (problem) { this.status.textContent = problem; return; }
        this.status.textContent = 'Connecting…';
        this.read();
        this.ticker = setInterval(() => this.render(), 200);
    }

    stop() {
        clearTimeout(this.pollTimer);
        clearInterval(this.ticker);
        this.pollTimer = this.ticker = null;
    }

    async read() {
        if (!this.dialog.open) return;
        try {
            const response = await fetch(`${this.origin}/timer/${this.pc}/state`, {
                cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(5000),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw Error(TimerControls.message(response.status, data));
            if (!this.busy) this.accept(data);
        } catch (error) {
            this.state = null;
            this.status.textContent = error instanceof TypeError || error.name === 'TimeoutError'
                ? 'Cannot reach the timer. Reconnecting…' : error.message;
            this.render();
        } finally {
            if (this.dialog.open) this.pollTimer = setTimeout(() => this.read(), POLL_MS);
        }
    }

    async command(action, seconds) {
        const problem = this.ready();
        if (problem) { this.status.textContent = problem; return; }
        if (action === 'start' && !(Number.isInteger(seconds) && seconds >= 1 && seconds <= 86400)) {
            this.status.textContent = 'Choose a duration between 1 second and 24 hours.';
            return;
        }
        this.busy = true;
        this.render();
        try {
            const response = await fetch(`${this.origin}/timer/${this.pc}/action`, {
                method: 'POST',
                credentials: 'omit',
                headers: { 'Content-Type': 'application/json', 'X-BadukCast-Key': window.tournamentAccessKey },
                body: JSON.stringify(seconds === undefined ? { action } : { action, seconds }),
                signal: AbortSignal.timeout(8000),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw Error(TimerControls.message(response.status, data));
            this.accept(data);
        } catch (error) {
            this.status.textContent = error instanceof TypeError || error.name === 'TimeoutError'
                ? 'Cannot reach the timer. Try again.' : error.message;
        } finally {
            this.busy = false;
            this.render();
        }
    }

    static message(status, data) {
        if (status === 401) return 'Your commentary code is invalid, expired, or revoked.';
        if (status === 403) return typeof data.error === 'string' && /assigned/i.test(data.error)
            ? 'This PC timer is not assigned to a tournament yet. Ask the operator to set it up in Orcha /timer/setup.'
            : 'Your commentary code cannot control this timer.';
        const detail = typeof data.error === 'string' ? data.error : data.error?.message;
        return detail || 'The timer request failed.';
    }

    accept(state) {
        this.state = state;
        this.receivedAt = performance.now();
        if (!this.initialized && Number.isFinite(state.durationMs)) {
            this.minutes.value = Math.floor(state.durationMs / 60000);
            this.seconds.value = Math.floor(state.durationMs / 1000) % 60;
            this.initialized = true;
        }
        const left = this.remainingMs();
        this.status.textContent = `${this.pc}: ${state.running ? 'Running' : left === 0 ? 'Finished' : 'Paused'}${state.visible ? '' : ' · Hidden on stream'}`;
        this.render();
    }

    remainingMs() {
        const s = this.state;
        if (!s) return 0;
        return Math.max(0, s.remainingMs - (s.running ? performance.now() - this.receivedAt : 0));
    }

    render() {
        const s = this.state;
        if (s) {
            const total = Math.ceil(this.remainingMs() / 1000);
            this.time.textContent = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
            this.time.classList.toggle('hidden-on-stream', !s.visible);
        } else {
            this.time.textContent = '--:--';
            this.time.classList.remove('hidden-on-stream');
        }
        const disabled = this.busy || !s || !!this.ready();
        const running = !!s?.running && this.remainingMs() > 0;
        for (const button of this.buttons) {
            const action = button.dataset.timerAction;
            button.disabled = disabled ||
                (action === 'pause' && !running) ||
                (action === 'resume' && (running || this.remainingMs() === 0)) ||
                (action === 'hide' && !s.visible) ||
                (action === 'show' && s.visible);
        }
    }
}
