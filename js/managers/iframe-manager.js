import { debug } from '../utils/debugger.js';

export class IframeManager {
    constructor() {
        this.iframes = {
            feed: document.getElementById("feed"),
            obs: document.getElementById("obs"),
            chat: document.getElementById("chat")
        };
        this.vdoNinjaBase = "https://vdo.ninja/?";
        this.setupFeaturedChatDismissal();
        this.parseUrlParams();
        if (window.updateSidePanelVisibility) {
            window.updateSidePanelVisibility();
        }
    }

    parseUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const role = params.get("role");
        const isViewer = role === "VW";
        // Handle chat URL
        if (params.has('Chat') && !isViewer) {
            const chatUrl = decodeURIComponent(params.get('Chat'));
            document.getElementById('ChatUrl').value = chatUrl;
            this.setUrl('chat', chatUrl);
        }
        // Handle VDO Ninja link
        const vdoLink = params.get('OTB');
        if (vdoLink) {
            let decodedVdoLink = decodeURIComponent(vdoLink);
            // If still contains % signs, decode again
            if (decodedVdoLink.includes('%')) {
                decodedVdoLink = decodeURIComponent(decodedVdoLink);
            }
            document.getElementById('VideoURL').value = decodedVdoLink;
            // Use ensureFeedAudioSettings to handle noaudio parameter
            const processedUrl = this.ensureFeedAudioSettings(decodedVdoLink);
            document.getElementById('feed').src = processedUrl;
        }
        // Handle OBS VDO Ninja link
        const obsLink = params.get('obs');
        if (obsLink && !isViewer) {
            let decodedObsLink = decodeURIComponent(obsLink);
            if (decodedObsLink.includes('%')) {
                decodedObsLink = decodeURIComponent(decodedObsLink);
            }
            const obsInput = document.getElementById('ObsVdoUrl');
            if (obsInput) obsInput.value = decodedObsLink;
            this.setUrl('obs', decodedObsLink);
        }
    }

    setupFeaturedChatDismissal() {
        const frame = document.getElementById('featuredChat');
        const button = document.getElementById('dismissFeaturedChat');
        if (!frame || !button) return;
        this.hideFeaturedChat = () => {
            clearTimeout(this.featuredChatTimer);
            frame.style.visibility = 'hidden';
            button.hidden = true;
        };
        button.addEventListener('click', () => {
            this.hideFeaturedChat();
            document.getElementById('overlay')?.focus({ preventScroll: true });
        });
        window.addEventListener('message', (event) => {
            // Only trust visibility notifications from our Social Stream iframe.
            if (event.origin !== 'https://socialstream.ninja' ||
                event.source !== frame.contentWindow ||
                window.appMode !== 'commentator' || frame.hidden) return;
            const height = event.data?.resizeWindow?.height;
            if (height === '0px') {
                this.hideFeaturedChat();
            } else if (height === '220px') {
                clearTimeout(this.featuredChatTimer);
                frame.style.visibility = 'visible';
                button.hidden = false;
                // Allow the entrance animation to finish before counting reading time.
                this.featuredChatTimer = setTimeout(this.hideFeaturedChat, (this.featuredChatDuration || 2000) + 500);
            }
        });
        this.hideFeaturedChat();
    }

    watchFeaturedMessages(session) {
        if (this.featuredSession === session) return;
        this.featuredSession = session;
        clearTimeout(this.featuredReconnectTimer);
        if (this.featuredSocket) {
            this.featuredSocket.onclose = null;
            this.featuredSocket.close();
            this.featuredSocket = null;
        }
        this.featuredChatDuration = 2000;
        if (!session) return;
        const connect = () => {
            if (this.featuredSession !== session) return;
            const socket = new WebSocket('wss://io.socialstream.ninja/api');
            this.featuredSocket = socket;
            socket.onopen = () => socket.send(JSON.stringify({ join: session, out: 3, in: 2 }));
            socket.onmessage = event => {
                if (this.featuredSocket !== socket) return;
                let message;
                try { message = JSON.parse(event.data); } catch { return; }
                if (message && typeof message === 'object' && 'overlayNinja' in message) message = message.overlayNinja;
                if (message === false) { this.hideFeaturedChat(); return; }
                if (!message || typeof message.chatmessage !== 'string' || message.target && message.target !== 'null') return;
                // Parse markup in an inert document; only text contributes to reading time.
                const text = new DOMParser().parseFromString(message.chatmessage, 'text/html').body.textContent || '';
                const words = text.trim().split(/\s+/u).filter(Boolean).length;
                this.featuredChatDuration = Math.max(1000, words * 250);
                const frame = document.getElementById('featuredChat');
                if (frame.style.visibility === 'visible') {
                    clearTimeout(this.featuredChatTimer);
                    this.featuredChatTimer = setTimeout(this.hideFeaturedChat, this.featuredChatDuration + 500);
                }
            };
            socket.onerror = () => socket.close();
            socket.onclose = () => {
                if (this.featuredSession === session) this.featuredReconnectTimer = setTimeout(connect, 2000);
            };
        };
        connect();
    }

    updateFeaturedChat() {
        const frame = document.getElementById('featuredChat');
        if (!frame) return;
        if (window.appMode !== 'commentator') {
            this.watchFeaturedMessages(null);
            this.hideFeaturedChat?.();
            frame.hidden = true;
            frame.removeAttribute('src');
            return;
        }
        const params = new URLSearchParams(window.location.search);
        const configuredSession = params.get('chatSession')?.trim();
        let session = configuredSession || 'zyab4FcJGh';
        const chatInput = document.getElementById('ChatUrl');
        try {
            const chatUrl = new URL(chatInput.value);
            if (chatUrl.hostname === 'socialstream.ninja') {
                session = configuredSession || chatUrl.searchParams.get('session') || session;
                chatUrl.searchParams.set('session', session);
                if (configuredSession) {
                    chatInput.value = chatUrl.toString();
                    this.setUrl('chat', chatInput.value);
                }
            }
        } catch {
            // A custom or empty chat URL does not change the featured default.
        }
        this.watchFeaturedMessages(session);
        const url = 'https://socialstream.ninja/featured.html?session=' +
            encodeURIComponent(session) + '&showtime=0&scale=0.6&server&server2&server3';
        if (frame.getAttribute('src') !== url) {
            this.hideFeaturedChat?.();
            frame.src = url;
        }
        frame.hidden = false;
    }

    setVdoNinjaUrl(element, params) {
        const url = new URLSearchParams(params).toString();
        this.setUrl(element, url);
    }

    setUrl(type, url) {
        if (this.iframes[type]) {
            // Special handling for feed iframe to check for noaudio parameter
            if (type === 'feed') {
                url = this.ensureFeedAudioSettings(url);
            }
            
            this.iframes[type].src = url;
            if (window.updateSidePanelVisibility) {
                window.updateSidePanelVisibility();
            }
        }
    }

    ensureFeedAudioSettings(url) {
        try {
            const urlObj = new URL(url);
            
            // Always ensure noaudio parameter is present
            urlObj.searchParams.set('noaudio', '');
            // Also add mute parameter for extra safety
            urlObj.searchParams.set('mute', '1');
            // room+view without scene/solo makes VDO.Ninja show its join menu.
            const p = urlObj.searchParams;
            if (/(^|\.)vdo\.ninja$/i.test(urlObj.hostname) && p.has('view') && p.has('room') && !p.has('scene') && !p.has('solo')) {
                p.set('solo', '');
            }
            debug.log('🔇 Feed URL ensuring muted:', urlObj.toString());
            
            return urlObj.toString();
        } catch (error) {
            debug.error('Failed to ensure feed audio settings:', error);
            return url;
        }
    }

    generateShareableUrl() {
        const params = new URLSearchParams();
        const vdoLink = document.getElementById('VideoURL').value;
        if (vdoLink) {
            params.set('OTB', encodeURIComponent(encodeURIComponent(vdoLink)));
        }
        const chatUrl = document.getElementById('ChatUrl').value;
        if (chatUrl) params.set('Chat', encodeURIComponent(chatUrl));
        const obsLink = document.getElementById('ObsVdoUrl')?.value;
        if (obsLink) {
            params.set('obs', encodeURIComponent(encodeURIComponent(obsLink)));
        }
        const networkRoom = document.getElementById('NetworkRoom')?.value;
        if (networkRoom) {
            params.set('Network', encodeURIComponent(networkRoom));
        }
        const stoneSize = document.getElementById('StoneSize')?.value;
        if (stoneSize) {
            params.set('stone', stoneSize);
        }
        if (window.overlay && window.overlay.points && window.overlay.points.length === 4) {
            params.set('grid', window.overlay.points.map(pt => pt.map(Number).map(n => Math.round(n)).join(',')).join(';'));
        }
        return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    }
}
