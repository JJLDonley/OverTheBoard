import { debug } from '../utils/debugger.js';
import { normalizeAccessKey } from '../utils/access-key.js';

export class OBSController {
    constructor() {
        this.scenes = [];
        this.currentScene = '';
        this.isStreaming = false;
        this.isConnected = false;
        this.connectionUUID = null;
        this.streamBusy = false;
        this.streamNote = '';
        // OBS browser-source page permission (4 switches scenes, 5 starts/stops).
        this.controlLevel = null;

        // Initialize DOM elements after a delay to avoid race condition
        this.initializeElements();
        this.setupMessageListener();
    }

    initializeElements() {
        // Try to get elements immediately
        this.getElements();

        // If elements not found, try again after DOM is ready
        if (!this.obsIframe || !this.streamToggleBtn || !this.connectionStatus) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.getElements();
                    this.setupUI();
                });
            } else {
                // DOM is already loaded, try again after a short delay
                setTimeout(() => {
                    this.getElements();
                    this.setupUI();
                }, 100);
            }
        } else {
            this.setupUI();
        }
    }

    getElements() {
        this.obsIframe = document.getElementById('obs');
        this.streamToggleBtn = document.getElementById('obsStreamToggle');
        this.connectionStatus = document.getElementById('obsConnectionStatus');

        debug.log('🔍 OBS Elements found:', {
            obsIframe: !!this.obsIframe,
            streamToggleBtn: !!this.streamToggleBtn,
            connectionStatus: !!this.connectionStatus
        });
    }

    setupMessageListener() {
        window.addEventListener('message', (e) => {
            // Only listen to messages from our OBS iframe
            if (!this.obsIframe || e.source !== this.obsIframe.contentWindow) {
                return;
            }
            const message = e.data;
            if (!message || typeof message !== 'object') return;

            debug.log('📨 Message from VDO Ninja:', message);

            // VDO.Ninja posts { action, value, UUID }: the sender's UUID is on
            // the message itself, not inside the value.
            if (message.action === 'obs-state' && message.value) {
                this.handleOBSState(message.value, message.UUID);
            } else if (message.action === 'tally' && message.value) {
                this.handleTally(message.value, message.UUID);
            }
        });
    }

    /** VDO.Ninja reports a remote OBS going away through its tally event. */
    handleTally(tally, uuid) {
        if (tally.source !== 'remote' || tally.connected !== false) return;
        const from = uuid || tally.UUID || null;
        if (this.connectionUUID && from && from !== this.connectionUUID) return;
        this.isConnected = false;
        this.isStreaming = false;
        this.connectionUUID = null;
        this.updateUI();
    }

    /**
     * One OBS status message as VDO.Ninja sends it:
     *   { visibility, sourceActive, streaming, recording, virtualcam,
     *     details: { controlLevel, scenes: [...], currentScene: { name } } }
     * Messages are often partial (only `streaming`, only `visibility`, or empty
     * `details`), so every field is optional and absent fields keep their value.
     */
    handleOBSState(obsData, uuid = null) {
        debug.log('🎯 Processing OBS state:', obsData);

        const details = obsData.details && typeof obsData.details === 'object'
            ? obsData.details
            : {};
        // Scene data lives in `details`; streaming lives beside it.
        const field = (key) => details[key] !== undefined ? details[key] : obsData[key];
        const scenes = field('scenes');
        const currentScene = field('currentScene');
        const reportsScenes = Array.isArray(scenes) || !!currentScene;

        // Remember who to address commands to. Prefer the OBS that reports
        // scenes: other peers in the room can send visibility-only updates.
        const from = uuid || obsData.UUID || null;
        if (from && (reportsScenes || !this.connectionUUID)) {
            this.connectionUUID = from;
            debug.log('💾 Stored connection UUID:', this.connectionUUID);
        }

        const connected = field('connected');
        if (typeof connected === 'boolean') {
            this.isConnected = connected;
        } else if (reportsScenes) {
            this.isConnected = true;
        }

        const controlLevel = Number(field('controlLevel'));
        if (Number.isFinite(controlLevel)) this.controlLevel = controlLevel;

        if (Array.isArray(scenes)) {
            this.scenes = scenes
                .map((scene) => typeof scene === 'object' && scene ? scene.name : scene)
                .filter(Boolean);
            debug.log('🎬 Found scenes:', this.scenes);
        }

        if (currentScene) {
            // Handle both string and object formats
            this.currentScene = typeof currentScene === 'object' ? currentScene.name : currentScene;
            debug.log('🎯 Current scene:', this.currentScene);
        }

        // `streaming` is a top-level flag; older relays nested it in details.
        const streaming = typeof obsData.streaming === 'boolean'
            ? obsData.streaming
            : typeof details.streaming === 'boolean'
            ? details.streaming
            : details.status?.streaming;
        if (typeof streaming === 'boolean') {
            this.isStreaming = streaming;
            debug.log('📡 Streaming:', this.isStreaming);
        }

        this.updateUI();
    }

    setupUI() {
        // Stream toggle button
        if (this.streamToggleBtn) {
            this.streamToggleBtn.addEventListener('click', () => {
                this.toggleStreaming();
            });
        }
    }

    updateUI() {
        // Make sure we have elements before updating
        if (!this.connectionStatus || !this.streamToggleBtn) {
            debug.log('⚠️ UI elements not ready, retrying...');
            this.getElements();
            if (!this.connectionStatus || !this.streamToggleBtn) {
                debug.log('❌ UI elements still not found, skipping update');
                return;
            }
        }

        // Update connection status
        if (this.connectionStatus) {
            this.connectionStatus.textContent = this.isConnected ? 'Connected' : 'Disconnected';
            // Properly handle CSS classes without overwriting existing ones
            this.connectionStatus.classList.remove('connected', 'disconnected');
            this.connectionStatus.classList.add(this.isConnected ? 'connected' : 'disconnected');
        }

        // Notify the preview picker of confirmed OBS state
        this.updateScenes();

        // Update stream button
        if (this.streamToggleBtn) {
            this.streamToggleBtn.textContent = this.streamBusy
                ? 'Working…'
                : this.isStreaming ? 'Stop Stream' : 'Start Stream';
            // With a Badukcast server the stream can be started before OBS has
            // connected back to this page; without one OBS must be connected.
            this.streamToggleBtn.disabled = !!this.streamBusy || (!this.isConnected && !this.streamOrigin);
        }

        debug.log('✅ UI updated - Connected:', this.isConnected, 'Scenes:', this.scenes.length, 'Streaming:', this.isStreaming);
    }

    updateScenes() {
        window.dispatchEvent(new Event('obs-status-changed'));
    }

    switchToScene(sceneName) {
        debug.log('🔄 Switching to scene:', sceneName);

        if (!this.obsIframe?.contentWindow || !this.isConnected || !sceneName) return false;
        // The active scene changes only when OBS confirms it.

        // Use the correct VDO Ninja obsCommand format
        const message = {
            obsCommand: {
                action: "setCurrentScene",
                value: sceneName
            },
            UUID: this.connectionUUID || null
        };

        this.obsIframe.contentWindow.postMessage(message, '*');
        debug.log('📤 Sent scene switch message:', message);
        return true;
    }

    /** Badukcast server that owns the stream, or '' when this session has none. */
    get streamOrigin() {
        try {
            const url = new URL(window.tournamentAiOrigin || new URLSearchParams(location.search).get('aiOrigin') || '');
            return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.origin : '';
        } catch { return ''; }
    }

    /**
     * Start/stop through Badukcast. OBS alone cannot create the YouTube
     * broadcast or the Twitch destination, and stopping only OBS leaves the
     * broadcast "live" with no video, so the tournament's server does both.
     * Returns false when this session has no server or PC to ask.
     */
    async toggleStreamingViaServer(start) {
        const origin = this.streamOrigin;
        const pc = window.scenePicker?.appliedPc;
        if (!origin || !pc) return false;
        if (!window.tournamentAccessKey) {
            const typed = normalizeAccessKey(window.prompt('Enter your commentary key to ' + (start ? 'start' : 'stop') + ' the stream.') || '');
            if (!typed) { this.setStreamNote('A commentary key is needed to ' + (start ? 'start' : 'stop') + ' the stream.'); return true; }
            window.tournamentAccessKey = typed;
        }
        const question = start
            ? 'Go live now? The stream is public as soon as it starts.'
            : 'Stop the stream? The YouTube broadcast ends and cannot be resumed.';
        if (!window.confirm(question)) return true;
        this.streamBusy = true;
        this.setStreamNote(start ? 'Starting the stream…' : 'Stopping the stream…');
        this.updateUI();
        try {
            const response = await fetch(`${origin}/stream/PC${encodeURIComponent(pc)}/${start ? 'start' : 'stop'}`, {
                method: 'POST',
                headers: { 'X-BadukCast-Key': window.tournamentAccessKey },
                credentials: 'omit',
                cache: 'no-store',
                signal: AbortSignal.timeout(90000),
            });
            const body = await response.json().catch(() => ({}));
            if (response.status === 401) window.tournamentAccessKey = '';
            if (!response.ok || body.error) {
                this.setStreamNote((start ? 'Could not start the stream: ' : 'Could not stop the stream: ') + (body.error || response.statusText || response.status));
            } else {
                // OBS confirms through its own status; this covers the gap.
                this.isStreaming = !!body.running;
                this.setStreamNote(start ? 'Stream started.' : 'Stream stopped.');
            }
        } catch (error) {
            this.setStreamNote((start ? 'Could not start the stream: ' : 'Could not stop the stream: ') + (error.name === 'TimeoutError' ? 'no answer from the server.' : 'could not reach the server.'));
        } finally {
            this.streamBusy = false;
            this.updateUI();
        }
        return true;
    }

    setStreamNote(text) {
        this.streamNote = text;
        if (this.streamToggleBtn) this.streamToggleBtn.title = text || '';
        const status = document.getElementById('scenePickerStatus');
        if (status && document.getElementById('sceneModal')?.open) status.textContent = text;
        debug.log('🎬 Stream:', text);
    }

    async toggleStreaming() {
        debug.log('🎬 Toggling stream - current state:', this.isStreaming);
        if (this.streamBusy) return;

        if (await this.toggleStreamingViaServer(!this.isStreaming)) return;

        // No Badukcast server in this session: plain OBS output toggle.
        if (!this.obsIframe) {
            debug.log('❌ No OBS iframe found');
            return;
        }

        const action = this.isStreaming ? 'stopStreaming' : 'startStreaming';

        // Use the correct VDO Ninja obsCommand format
        const message = {
            obsCommand: {
                action: action
            },
            UUID: this.connectionUUID || null
        };

        this.obsIframe.contentWindow.postMessage(message, '*');
        debug.log('📤 Sent stream toggle message:', message);
    }

    // Request initial OBS status (VDO Ninja sends obs-state automatically)
    requestStatus() {
        debug.log('📤 OBS status is sent automatically by VDO Ninja');
    }
}
