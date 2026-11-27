// Commentary-code join: one code loads the whole tournament and boots the
// commentator view in place. The code is sent only in request headers and is
// kept in memory for timer/AI requests; it is never saved or put in generated links. An organiser's join link
// (?key=…&name=…) is read once and the key removed from the address bar.
import { KEY_HELP, normalizeAccessKey } from '../utils/access-key.js';

const FOLLOW_MS = 30000;
const ERRORS = {
    401: 'That code is invalid, expired, or revoked.',
    403: 'That code does not allow tournament access.',
    429: 'Too many code attempts. Wait a minute and try again.',
    503: 'Badukcast is unavailable. Try again shortly.',
};

export class TournamentLoader {
    constructor() {
        this.form = document.getElementById('tournamentCodeForm');
        this.code = document.getElementById('CommentaryCode');
        this.name = document.getElementById('CommentatorName');
        this.server = document.getElementById('BadukCastServer');
        this.status = document.getElementById('tournamentLoadStatus');
        this.games = document.getElementById('TournamentGame');
        this.button = document.getElementById('loadTournament');
        this.manualGame = false;
        try { this.name.value = localStorage.getItem('userLabel') || ''; } catch { /* Name stays blank. */ }
        // A locally served OverlayTool talks to the local Orcha by default.
        if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && this.server.defaultValue === this.server.value) {
            this.server.value = `http://${location.hostname}:8080`;
        }
        this.games.addEventListener('change', () => {
            this.manualGame = true;
            this.applyGame(this.games.value);
        });
        this.form.addEventListener('submit', event => {
            event.preventDefault();
            this.join();
        });
        this.readJoinLink();
    }

    /**
     * Organiser's join link: `?key=XXXXXXXX&name=Devin` (optionally `&server=`
     * and `&pc=`). The key is removed from the address bar before anything else
     * happens and never appears in generated links. Every other setting is then
     * loaded from Badukcast, so the link cannot go stale.
     */
    readJoinLink() {
        const url = new URL(location.href);
        const link = url.searchParams;
        if (!link.has('key')) return;
        const key = normalizeAccessKey(link.get('key')) || (link.get('key') || '').trim();
        const name = (link.get('name') || '').trim();
        const server = (link.get('server') || '').trim();
        const pc = (link.get('pc') || '').trim();
        for (const param of ['key', 'name', 'server', 'pc']) link.delete(param);
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
        if (!key || (window.appMode && window.appMode !== 'landing')) return;
        this.code.value = key;
        if (name) this.name.value = name.slice(0, 40);
        if (server) this.server.value = server;
        if (/^[1-9]\d*$/.test(pc)) window.scenePicker?.setPc(pc);
        if (this.name.value.trim()) {
            this.join();
        } else {
            this.status.textContent = 'Enter your name, then press Join.';
            this.name.focus();
        }
    }

    /** Identifies this browser tab's seat; survives a reload of the tab. */
    get hostSession() {
        let id = '';
        try { id = sessionStorage.getItem('hostSession') || ''; } catch { /* Fresh ID below. */ }
        if (!id) {
            id = crypto.randomUUID();
            try { sessionStorage.setItem('hostSession', id); } catch { /* This page only. */ }
        }
        return id;
    }

    hostRequest(origin, key, path, body, keepalive = false) {
        const pc = window.scenePicker?.appliedPc;
        if (!pc) return null;
        return fetch(`${origin}/stream/PC${encodeURIComponent(pc)}/${path}`, {
            method: 'POST',
            headers: { 'X-BadukCast-Key': key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ session: this.hostSession, ...body }),
            credentials: 'omit',
            cache: 'no-store',
            keepalive,
            ...(keepalive ? {} : { signal: AbortSignal.timeout(8000) }),
        });
    }

    /**
     * Takes Host 1 or Host 2 for this commentator. Badukcast refuses a third
     * commentator while both seats are held. A server without seats, or one
     * that cannot be reached, lets the commentator in without a seat number.
     */
    async claimHostSeat(origin, key, name) {
        let response;
        try { response = await this.hostRequest(origin, key, 'host', { name }); } catch { return null; }
        if (!response) return null;
        if (response.status === 409) {
            const body = await response.json().catch(() => ({}));
            const names = (body.hosts || []).map(host => host.name || `Host ${host.seat}`).join(' and ');
            throw Error(`Both host seats are taken${names ? ` (${names})` : ''}. Ask one of them to leave, or try again in a minute.`);
        }
        if (!response.ok) return null;
        const seat = Number((await response.json().catch(() => ({}))).seat);
        return Number.isInteger(seat) && seat > 0 ? seat : null;
    }

    /** Keeps the seat while this tab is open and gives it back on leaving. */
    holdHostSeat(origin, key, name) {
        clearInterval(this.seatTimer);
        this.seatTimer = setInterval(() => { this.claimHostSeat(origin, key, name).catch(() => { /* Seat lost; keep commentating. */ }); }, 15000);
        if (this.seatReleaseBound) return;
        this.seatReleaseBound = true;
        window.addEventListener('pagehide', () => {
            try { this.hostRequest(origin, key, 'host/release', {}, true)?.catch(() => {}); } catch { /* Seat times out instead. */ }
        });
    }

    async fetchBootstrap(origin, key) {
        const response = await fetch(new URL('/api/v1/bootstrap', origin), {
            headers: { 'X-BadukCast-Key': key },
            credentials: 'omit',
            cache: 'no-store',
            signal: AbortSignal.timeout(8000),
        });
        if (response.status === 404) throw Error(`No Badukcast tournament API at ${new URL(origin).origin}. Check the address under Server settings.`);
        if (!response.ok) throw Error(ERRORS[response.status] || 'Could not load the tournament. Try again.');
        const data = await response.json();
        if (!data.tournament?.id || !Array.isArray(data.games)) throw Error('The server returned incomplete tournament details.');
        return data;
    }

    async join() {
        this.button.disabled = true;
        let server;
        try {
            server = new URL(this.server.value.trim());
            this.status.textContent = `Joining via ${server.origin}…`;
            if (!['https:', 'http:'].includes(server.protocol) || server.username || server.password) {
                throw Error('Enter a valid Badukcast server address.');
            }
            if (server.origin === location.origin) {
                throw Error(`${server.origin} is this OverlayTool page, not the Badukcast server. Under Server settings, enter the Badukcast (Orcha) address${['localhost', '127.0.0.1'].includes(location.hostname) ? `, e.g. http://${location.hostname}:8080` : ''}.`);
            }
            const key = normalizeAccessKey(this.code.value);
            if (!key) throw Error(KEY_HELP);
            const data = await this.fetchBootstrap(server.origin, key);
            this.code.value = '';
            window.tournamentAccessKey = key;
            window.tournamentAiOrigin = server.origin;
            this.origin = server.origin;
            this.data = data;
            this.manualGame = false;
            const settings = data.overlaySettings || {};
            this.fill('NetworkRoom', settings.networkRoom || `badukcast-${data.tournament.id}`);
            this.fill('ObsVdoUrl', settings.obsVdoUrl || '');
            this.fill('ChatUrl', settings.chatUrl || '');
            // Badukcast names a PC's network room OverlayTool{pc}; the scene
            // previews and generated links must use that same PC.
            const roomPc = /^OverlayTool([1-9]\d*)$/i.exec(settings.networkRoom || '')?.[1];
            if (roomPc) window.scenePicker?.setPc(roomPc);
            // Host 1 or Host 2, whichever is free; a third commentator stops here.
            const name = this.name.value.trim();
            let seat;
            try {
                seat = await this.claimHostSeat(server.origin, key, name);
            } catch (error) {
                // Not joined: keep the key in the form so "Join" can be retried.
                this.code.value = key;
                window.tournamentAccessKey = '';
                throw error;
            }
            if (seat) {
                window.hostIndex = seat;
                this.holdHostSeat(server.origin, key, name);
            }
            this.renderGames();
            const game = this.currentGame();
            this.fillGame(game);
            const label = this.name.value.trim();
            try { if (label) localStorage.setItem('userLabel', label); } catch { /* Optional. */ }
            this.status.textContent = '';
            await window.enterCommentatorMode?.({ label });
            window.scenePicker?.load();
            this.follow();
        } catch (error) {
            const where = server ? ` ${server.origin}` : ' Badukcast';
            this.status.textContent = error.name === 'TimeoutError'
                ? `No answer from${where}. Check Server settings or try again.`
                : error instanceof TypeError ? `Could not reach${where}. Check Server settings and your connection.` : error.message;
        } finally {
            this.button.disabled = false;
        }
    }

    /** The game being played now: the only game, else the only active one, else the first active. */
    currentGame() {
        const games = this.data?.games || [];
        if (games.length <= 1) return games[0] || null;
        const active = games.filter(game => game.status === 'active');
        return active[0] || games[0];
    }

    label(game) {
        const players = [game.blackPlayer, game.whitePlayer].filter(Boolean).join(' vs ');
        const board = game.boardNumber == null ? '' : `Board ${game.boardNumber} · `;
        const round = game.roundNumber == null ? '' : `R${game.roundNumber} · `;
        return `${round}${board}${players || game.name || game.id}${game.status === 'active' ? '' : ` (${game.status})`}`;
    }

    renderGames() {
        const games = this.data?.games || [];
        const selected = this.games.value;
        this.games.replaceChildren(...games.map(game => new Option(this.label(game), game.id)));
        this.games.hidden = games.length < 2;
        if (games.some(game => game.id === selected)) this.games.value = selected;
    }

    fill(id, value) {
        const input = document.getElementById(id);
        if (!input) return;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        if (!value) {
            const frameId = { VideoURL: 'feed', ObsVdoUrl: 'obs', ChatUrl: 'chat' }[id];
            if (frameId) document.getElementById(frameId)?.removeAttribute('src');
            window.updateSidePanelVisibility?.();
        }
    }

    /** Sets the camera feed and AI analysis for one game. */
    fillGame(game) {
        if (game) this.games.value = game.id;
        this.fill('VideoURL', game?.vdoUrl || '');
        const context = game?.analysisContext;
        this.fill('AiOverlay', context ? `${context.type}/${context.id}` : '');
    }

    /** Switching games inside the commentator view updates feed + AI in place. */
    applyGame(id) {
        const game = this.data?.games.find(entry => entry.id === id);
        if (!game) return;
        this.fillGame(game);
        const feed = document.getElementById('feed');
        if (feed && game.vdoUrl) {
            feed.src = window.iframeManager?.ensureFeedAudioSettings?.(game.vdoUrl) || game.vdoUrl;
        }
        window.updateShareableUrl?.();
    }

    /** Keeps the game list fresh and follows the next active game between rounds. */
    follow() {
        clearInterval(this.followTimer);
        this.followTimer = setInterval(async () => {
            if (!window.tournamentAccessKey || !this.origin) return;
            try {
                const data = await this.fetchBootstrap(this.origin, window.tournamentAccessKey);
                if (data.tournament.id !== this.data?.tournament.id) return;
                const before = this.games.value;
                this.data = data;
                this.renderGames();
                const now = this.currentGame();
                const current = data.games.find(game => game.id === before);
                if (!this.manualGame && now && now.id !== before && current?.status !== 'active') this.applyGame(now.id);
            } catch { /* Keep the current session; try again next time. */ }
        }, FOLLOW_MS);
    }
}
