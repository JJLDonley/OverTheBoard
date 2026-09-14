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
                // Social Stream does not send a resize notification on showtime expiry.
                this.featuredChatTimer = setTimeout(this.hideFeaturedChat, 10000);
            }
        });
        this.hideFeaturedChat();
    }

    updateFeaturedChat() {
        const frame = document.getElementById('featuredChat');
        if (!frame) return;
        if (window.appMode !== 'commentator') {
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
        const url = 'https://socialstream.ninja/featured.html?session=' +
            encodeURIComponent(session) + '&showtime=10000&server&server2&server3';
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
