// The iframe talks directly to Orcha, keeping timer commands out of VDO/OBS control.
export class TimerControls {
    constructor() {
        this.input = document.getElementById('TimerUrl');
        this.dialog = document.getElementById('timerModal');
        this.frame = document.getElementById('timerControls');
        this.status = document.getElementById('timerStatus');
        const params = new URLSearchParams(location.search);
        if (params.get('role') !== 'VW') this.input.value = params.get('Timer') || '';
        this.frame.addEventListener('load', () => {
            if (!window.tournamentAccessKey || !this.frame.getAttribute('src') || new URL(this.frame.src).origin !== window.tournamentAiOrigin) return;
            this.frame.contentWindow.postMessage({type:'orcha-tournament-token',token:window.tournamentAccessKey},new URL(this.frame.src).origin);
        });
        this.input.addEventListener('input', () => window.updateShareableUrl?.());
        document.getElementById('openTimer').addEventListener('click', () => {
            if (window.appMode !== 'commentator') return;
            this.dialog.showModal();
            this.frame.hidden = true;
            try {
                const url = new URL(this.input.value.trim());
                const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
                if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
                    url.username || url.password || !/^\/timer\/PC[1-8]\/control\/?$/.test(url.pathname)) throw Error();
                this.frame.src = url.href;
                this.frame.hidden = false;
                this.status.textContent = '';
            } catch {
                this.frame.removeAttribute('src');
                this.status.textContent = 'Add the control link from Orcha /timer/setup to the Timer field. Remote commentators need an HTTPS Orcha address they can reach.';
            }
        });
        document.getElementById('closeTimer').addEventListener('click', () => this.dialog.close());
        this.dialog.addEventListener('close', () => this.frame.removeAttribute('src'));
    }
}
