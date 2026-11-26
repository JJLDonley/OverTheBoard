// Keys are sent only in request headers and are never saved or shared in links.
export class TournamentLoader {
    constructor() {
        this.form = document.getElementById('tournamentCodeForm');
        this.code = document.getElementById('CommentaryCode');
        this.server = document.getElementById('BadukCastServer');
        this.status = document.getElementById('tournamentLoadStatus');
        this.games = document.getElementById('TournamentGame');
        this.button = document.getElementById('loadTournament');
        this.games.addEventListener('change', () => this.applyGame());
        this.form.addEventListener('submit', event => {
            event.preventDefault();
            this.load();
        });
    }

    async load() {
        this.button.disabled = true;
        this.games.disabled = true;
        this.status.textContent = 'Loading tournament…';
        try {
            const server = new URL(this.server.value.trim());
            if (!['https:', 'http:'].includes(server.protocol) || server.username || server.password) {
                throw Error('Enter a valid Badukcast server address.');
            }
            const key = this.code.value.trim().toUpperCase();
            if (!/^[A-Z2-9]{8}$/.test(key)) throw Error('Enter your eight-character commentary code.');
            const response = await fetch(new URL('/api/v1/bootstrap', server.origin), {
                headers: { 'X-BadukCast-Key': key },
                credentials: 'omit',
                cache: 'no-store',
                signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) {
                const messages = {
                    401: 'That code is invalid, expired, or revoked.',
                    403: 'That code does not allow tournament access.',
                    404: 'Tournament not found. Check the server supports commentary codes.',
                    429: 'Too many code attempts. Wait a minute and try again.',
                    503: 'Badukcast is unavailable. Try again shortly.',
                };
                throw Error(messages[response.status] || 'Could not load the tournament. Try again.');
            }
            const data = await response.json();
            if (!data.tournament?.id || !Array.isArray(data.games)) throw Error('The server returned incomplete tournament details.');
            this.data = data;
            window.tournamentAccessKey = key; // Memory only; reuse the existing tournament token for controls.
            window.tournamentAiOrigin = server.origin;
            this.code.value = '';
            const settings = data.overlaySettings || {};
            this.fill('NetworkRoom', settings.networkRoom || `badukcast-${data.tournament.id}`);
            this.fill('ObsVdoUrl', settings.obsVdoUrl || '');
            this.fill('ChatUrl', settings.chatUrl || '');
            // Clear the previous tournament's feed until a game is selected.
            this.fill('VideoURL', '');
            this.fill('AiOverlay', '');
            this.games.replaceChildren(new Option('Choose a game', ''));
            for (const game of data.games) {
                const players = [game.blackPlayer, game.whitePlayer].filter(Boolean).join(' vs ');
                const board = game.boardNumber == null ? '' : `Board ${game.boardNumber} · `;
                const round = game.roundNumber == null ? '' : `Round ${game.roundNumber} · `;
                this.games.add(new Option(`${round}${board}${players || game.name || game.id} (${game.status})`, game.id));
            }
            this.games.disabled = data.games.length === 0;
            if (data.games.length === 1) {
                this.games.value = data.games[0].id;
                this.applyGame();
            }
            const missing = [];
            if (!settings.obsVdoUrl) missing.push('OBS controller');
            if (!settings.chatUrl) missing.push('chat');
            this.status.textContent = `${data.tournament.name} loaded. ${data.games.length === 0
                ? 'No games have been configured yet.'
                : data.games.length === 1 ? 'Game details filled in.' : 'Choose the game to commentate.'}${missing.length
                ? ` ${missing.join(' and ')} links are not configured; add them below if needed.` : ''}`;
            window.updateShareableUrl?.();
        } catch (error) {
            // Preserve the last successfully loaded session if this request fails.
            this.games.disabled = !this.data?.games.length;
            this.status.textContent = error.name === 'TimeoutError'
                ? 'The server took too long to respond. Try again.'
                : error instanceof TypeError ? 'Could not reach Badukcast. Check the server address and connection.' : error.message;
        } finally {
            this.button.disabled = false;
        }
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

    applyGame() {
        const game = this.data?.games.find(game => game.id === this.games.value);
        this.fill('VideoURL', game?.vdoUrl || '');
        const context = game?.analysisContext;
        this.fill('AiOverlay', context ? `${context.type}/${context.id}` : '');
        window.updateShareableUrl?.();
    }
}
