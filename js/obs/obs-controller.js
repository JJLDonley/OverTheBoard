import { debug } from '../utils/debugger.js';

export class OBSController {
    constructor() {
        this.scenes = [];
        this.currentScene = '';
        this.isStreaming = false;
        this.isConnected = false;

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

            debug.log('📨 Message from VDO Ninja:', e.data);

            // Handle obs-state messages
            if (e.data && e.data.action === 'obs-state' && e.data.value) {
                this.handleOBSState(e.data.value);
            }
        });
    }

    handleOBSState(obsData) {
        debug.log('🎯 Processing OBS state:', obsData);

        // Store the UUID for sending messages back
        if (obsData.UUID) {
            this.connectionUUID = obsData.UUID;
            debug.log('💾 Stored connection UUID:', this.connectionUUID);
        }

        // Check if data is in details
        let data = obsData.details || obsData;
        debug.log('📊 Using data:', data);

        // Extract connection status
        // VDO sends partial visibility/status events and empty details after
        // the scene list. Those are not OBS disconnect notifications.
        if (typeof data.connected === "boolean") {
            this.isConnected = data.connected;
        } else if (data.scenes || data.currentScene) {
            this.isConnected = true;
        }

        // Extract scenes
        if (data.scenes && Array.isArray(data.scenes)) {
            this.scenes = data.scenes;
            debug.log('🎬 Found scenes:', this.scenes);
        }

        // Extract current scene
        if (data.currentScene) {
            // Handle both string and object formats
            this.currentScene = typeof data.currentScene === 'object' ? data.currentScene.name : data.currentScene;
            debug.log('🎯 Current scene:', this.currentScene);
        }

        // Extract streaming status
        if (data.streaming !== undefined) {
            this.isStreaming = data.streaming;
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
            this.streamToggleBtn.textContent = this.isStreaming ? 'Stop Stream' : 'Start Stream';
            this.streamToggleBtn.disabled = !this.isConnected;
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

    toggleStreaming() {
        debug.log('🎬 Toggling stream - current state:', this.isStreaming);

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
