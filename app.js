/**
 * SecureChat - End-to-End Encrypted Chat Application (Telegram Style)
 * 
 * CRYPTOGRAPHIC IMPLEMENTATION:
 * - Key Derivation: PBKDF2 with SHA-256 and 100,000 iterations
 * - Encryption: AES-256-GCM with random 12-byte IV per message
 * - All cryptographic operations use the Web Crypto API
 * - Media files are encrypted the same way as text messages
 */

(function() {
    'use strict';

    const CHAT_ID = 'chat_alice_bob_demo';
    const DEFAULT_PIN = '2121';
    const PBKDF2_ITERATIONS = 100000;
    const INACTIVITY_TIMEOUT = 2 * 60 * 1000;
    const POLL_INTERVAL = 2000;
    const API_URL = 'server.php';
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const MOTION_THRESHOLD = 25;

    let state = {
        isLocked: true,
        encryptionKey: null,
        senderId: 'User_' + Math.random().toString(36).substr(2, 4).toUpperCase(),
        lastActivity: Date.now(),
        inactivityTimer: null,
        pollTimer: null,
        autoLockEnabled: true,
        motionLockEnabled: true,
        notificationsEnabled: false,
        lastMessageTimestamp: 0,
        customPin: null,
        pendingMedia: null,
        displayedMessageIds: new Set(),
        sessionToken: null
    };

    const elements = {};

    function init() {
        cacheElements();
        loadSettings();
        loadSession();
        attachEventListeners();
        setupInactivityTimer();
        setupMotionDetection();
        requestNotificationPermission();
        
        if (state.sessionToken && state.customPin) {
            autoLogin();
        } else {
            showPinScreen();
        }
    }

    function cacheElements() {
        elements.pinScreen = document.getElementById('pin-screen');
        elements.chatScreen = document.getElementById('chat-screen');
        elements.pinInput = document.getElementById('pin-input');
        elements.pinSubmit = document.getElementById('pin-submit');
        elements.pinError = document.getElementById('pin-error');
        elements.pinDots = document.querySelectorAll('.pin-dots .dot');
        elements.messagesContainer = document.getElementById('messages-container');
        elements.messageInput = document.getElementById('message-input');
        elements.sendBtn = document.getElementById('send-btn');
        elements.settingsBtn = document.getElementById('settings-btn');
        elements.lockBtn = document.getElementById('lock-btn');
        elements.settingsModal = document.getElementById('settings-modal');
        elements.closeSettings = document.getElementById('close-settings');
        elements.modeIndicator = document.getElementById('mode-indicator');
        elements.autoLockToggle = document.getElementById('auto-lock-toggle');
        elements.senderIdInput = document.getElementById('sender-id');
        elements.changePinBtn = document.getElementById('change-pin-btn');
        elements.currentPinInput = document.getElementById('current-pin');
        elements.newPinInput = document.getElementById('new-pin');
        elements.confirmPinInput = document.getElementById('confirm-pin');
        elements.pinChangeStatus = document.getElementById('pin-change-status');
        elements.attachBtn = document.getElementById('attach-btn');
        elements.attachmentMenu = document.getElementById('attachment-menu');
        elements.imageInput = document.getElementById('image-input');
        elements.videoInput = document.getElementById('video-input');
        elements.audioInput = document.getElementById('audio-input');
        elements.mediaPreview = document.getElementById('media-preview');
        elements.previewThumb = document.getElementById('preview-thumb');
        elements.previewName = document.getElementById('preview-name');
        elements.previewSize = document.getElementById('preview-size');
        elements.previewCancel = document.getElementById('preview-cancel');
        elements.lightbox = document.getElementById('lightbox');
        elements.lightboxImage = document.getElementById('lightbox-image');
        elements.lightboxClose = document.getElementById('lightbox-close');
        elements.typingIndicator = document.getElementById('typing-indicator');
        elements.chatAvatar = document.getElementById('chat-avatar');
    }

    function attachEventListeners() {
        elements.pinInput.addEventListener('input', handlePinInput);
        elements.pinInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handlePinSubmit();
        });
        elements.pinSubmit.addEventListener('click', handlePinSubmit);
        elements.messageInput.addEventListener('input', handleMessageInputChange);
        elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        elements.sendBtn.addEventListener('click', sendMessage);
        elements.settingsBtn.addEventListener('click', openSettings);
        elements.lockBtn.addEventListener('click', lockApp);
        elements.closeSettings.addEventListener('click', closeSettings);
        elements.settingsModal.addEventListener('click', (e) => {
            if (e.target === elements.settingsModal) closeSettings();
        });
        elements.autoLockToggle.addEventListener('change', (e) => {
            state.autoLockEnabled = e.target.checked;
            saveSettings();
        });
        elements.senderIdInput.addEventListener('change', (e) => {
            state.senderId = e.target.value.trim() || state.senderId;
            saveSettings();
        });
        elements.changePinBtn.addEventListener('click', handlePinChange);
        
        elements.attachBtn.addEventListener('click', toggleAttachmentMenu);
        document.querySelectorAll('.attachment-option').forEach(btn => {
            btn.addEventListener('click', handleAttachmentSelect);
        });
        elements.imageInput.addEventListener('change', handleFileSelect);
        elements.videoInput.addEventListener('change', handleFileSelect);
        elements.audioInput.addEventListener('change', handleFileSelect);
        elements.previewCancel.addEventListener('click', cancelMediaPreview);
        elements.lightboxClose.addEventListener('click', closeLightbox);
        elements.lightbox.addEventListener('click', (e) => {
            if (e.target === elements.lightbox) closeLightbox();
        });
        
        document.addEventListener('keydown', handleGlobalKeydown);
        document.addEventListener('mousemove', resetInactivityTimer);
        document.addEventListener('keypress', resetInactivityTimer);
        document.addEventListener('touchstart', resetInactivityTimer);
        document.addEventListener('click', (e) => {
            if (!elements.attachBtn.contains(e.target) && !elements.attachmentMenu.contains(e.target)) {
                elements.attachmentMenu.classList.remove('active');
            }
        });
    }

    function handleGlobalKeydown(e) {
        if (e.key === 'Escape') {
            if (elements.lightbox.classList.contains('active')) {
                closeLightbox();
            }
        }
    }

    function setupMotionDetection() {
        if (window.DeviceMotionEvent) {
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                document.addEventListener('click', requestMotionPermission, { once: true });
            } else {
                window.addEventListener('devicemotion', handleMotion);
            }
        }
    }

    async function requestMotionPermission() {
        try {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('devicemotion', handleMotion);
            }
        } catch (e) {
            console.log('Motion permission denied or not available');
        }
    }

    function handleMotion(event) {
        if (state.isLocked || !state.motionLockEnabled) return;
        
        const acc = event.acceleration || {};
        const x = acc.x || 0;
        const y = acc.y || 0;
        const z = acc.z || 0;
        
        const totalAcceleration = Math.sqrt(x*x + y*y + z*z);
        
        if (totalAcceleration > MOTION_THRESHOLD) {
            console.log('Motion detected! Locking app...');
            lockApp();
        }
    }

    async function requestNotificationPermission() {
        if ('Notification' in window) {
            if (Notification.permission === 'default') {
                const permission = await Notification.requestPermission();
                state.notificationsEnabled = permission === 'granted';
            } else {
                state.notificationsEnabled = Notification.permission === 'granted';
            }
        }
    }

    function showNotification(title, body) {
        if (!state.notificationsEnabled || state.isLocked) return;
        if (document.hasFocus()) return;
        
        try {
            const notification = new Notification(title, {
                body: body,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💬</text></svg>',
                tag: 'securechat-message',
                renotify: true
            });
            
            notification.onclick = () => {
                window.focus();
                notification.close();
            };
            
            setTimeout(() => notification.close(), 5000);
        } catch (e) {
            console.log('Notification error:', e);
        }
    }

    function toggleAttachmentMenu() {
        elements.attachmentMenu.classList.toggle('active');
    }

    function handleAttachmentSelect(e) {
        const type = e.currentTarget.dataset.type;
        elements.attachmentMenu.classList.remove('active');
        
        if (type === 'image') {
            elements.imageInput.click();
        } else if (type === 'video') {
            elements.videoInput.click();
        } else if (type === 'audio') {
            elements.audioInput.click();
        }
    }

    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        if (file.size > MAX_FILE_SIZE) {
            alert('File is too large. Maximum size is 10MB.');
            e.target.value = '';
            return;
        }
        
        state.pendingMedia = {
            file: file,
            type: file.type.split('/')[0],
            name: file.name,
            size: file.size
        };
        
        showMediaPreview(file);
        e.target.value = '';
    }

    function showMediaPreview(file) {
        elements.previewName.textContent = file.name;
        elements.previewSize.textContent = formatFileSize(file.size);
        
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                elements.previewThumb.src = e.target.result;
            };
            reader.readAsDataURL(file);
        } else if (file.type.startsWith('video/')) {
            elements.previewThumb.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%235eb5f7"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>';
        } else if (file.type.startsWith('audio/')) {
            elements.previewThumb.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%235eb5f7"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
        }
        
        elements.mediaPreview.classList.add('active');
        updateSendButton();
    }

    function cancelMediaPreview() {
        state.pendingMedia = null;
        elements.mediaPreview.classList.remove('active');
        elements.previewThumb.src = '';
        updateSendButton();
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function openLightbox(src) {
        elements.lightboxImage.src = src;
        elements.lightbox.classList.add('active');
    }

    function closeLightbox() {
        elements.lightbox.classList.remove('active');
        elements.lightboxImage.src = '';
    }

    function handlePinInput(e) {
        const value = e.target.value.replace(/\D/g, '').substr(0, 4);
        e.target.value = value;
        elements.pinDots.forEach((dot, i) => {
            dot.classList.toggle('filled', i < value.length);
        });
        elements.pinError.textContent = '';
    }

    async function handlePinSubmit() {
        const pin = elements.pinInput.value;
        
        if (pin.length !== 4) {
            elements.pinError.textContent = 'Please enter a 4-digit PIN';
            return;
        }

        const effectivePin = state.customPin || DEFAULT_PIN;

        if (pin === effectivePin) {
            try {
                state.encryptionKey = await deriveKey(pin);
                state.isLocked = false;
                state.sessionToken = generateSessionToken();
                state.customPin = pin;
                saveSession();
                saveSettings();
                showChatScreen();
                startPolling();
                await fetchMessages();
            } catch (error) {
                console.error('Key derivation failed:', error);
                elements.pinError.textContent = 'Encryption error. Please try again.';
            }
        } else {
            elements.pinError.textContent = 'Incorrect PIN';
            elements.pinInput.value = '';
            elements.pinDots.forEach(dot => dot.classList.remove('filled'));
        }
    }

    async function autoLogin() {
        try {
            const pin = state.customPin;
            state.encryptionKey = await deriveKey(pin);
            state.isLocked = false;
            showChatScreen();
            startPolling();
            await fetchMessages();
        } catch (error) {
            console.error('Auto-login failed:', error);
            clearSession();
            showPinScreen();
        }
    }

    function generateSessionToken() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 16);
    }

    function saveSession() {
        const session = {
            token: state.sessionToken,
            pin: state.customPin,
            senderId: state.senderId,
            timestamp: Date.now()
        };
        localStorage.setItem('securechat_session', JSON.stringify(session));
    }

    function loadSession() {
        try {
            const saved = localStorage.getItem('securechat_session');
            if (saved) {
                const session = JSON.parse(saved);
                const oneDay = 24 * 60 * 60 * 1000;
                if (Date.now() - session.timestamp < oneDay) {
                    state.sessionToken = session.token;
                    state.customPin = session.pin;
                    state.senderId = session.senderId || state.senderId;
                } else {
                    clearSession();
                }
            }
        } catch (error) {
            console.error('Failed to load session:', error);
            clearSession();
        }
    }

    function clearSession() {
        state.sessionToken = null;
        localStorage.removeItem('securechat_session');
    }

    async function deriveKey(pin) {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(pin),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );

        const salt = encoder.encode('SecureChatPOC_Salt_v1');

        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encryptData(data) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            state.encryptionKey,
            data
        );

        return {
            ciphertext: arrayBufferToBase64(ciphertext),
            iv: arrayBufferToBase64(iv)
        };
    }

    async function encryptMessage(plaintext) {
        const encoder = new TextEncoder();
        return await encryptData(encoder.encode(plaintext));
    }

    async function decryptData(ciphertextB64, ivB64) {
        try {
            const ciphertext = base64ToArrayBuffer(ciphertextB64);
            const iv = base64ToArrayBuffer(ivB64);

            return await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                state.encryptionKey,
                ciphertext
            );
        } catch (error) {
            console.error('Decryption failed:', error);
            return null;
        }
    }

    async function decryptMessage(ciphertextB64, ivB64) {
        const plaintext = await decryptData(ciphertextB64, ivB64);
        if (plaintext) {
            const decoder = new TextDecoder();
            return decoder.decode(plaintext);
        }
        return '[Decryption failed]';
    }

    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    function base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    async function sendMessage() {
        const text = elements.messageInput.value.trim();
        const hasMedia = state.pendingMedia !== null;
        
        if (!text && !hasMedia) return;
        if (!state.encryptionKey) return;

        elements.sendBtn.disabled = true;
        elements.messageInput.value = '';
        
        const timestamp = Date.now();
        let messageType = 'text';
        let mediaData = null;
        let mediaMime = null;
        let mediaFile = null;

        try {
            if (hasMedia) {
                mediaFile = state.pendingMedia.file;
                messageType = state.pendingMedia.type;
                mediaMime = mediaFile.type;
                
                const arrayBuffer = await mediaFile.arrayBuffer();
                const encryptedMedia = await encryptData(new Uint8Array(arrayBuffer));
                mediaData = encryptedMedia;
                
                cancelMediaPreview();
            }

            const messagePayload = {
                text: text,
                mediaType: hasMedia ? messageType : null,
                mediaMime: mediaMime
            };
            
            const encrypted = await encryptMessage(JSON.stringify(messagePayload));

            const requestBody = {
                chat_id: CHAT_ID,
                ciphertext: encrypted.ciphertext,
                iv: encrypted.iv,
                timestamp: timestamp,
                sender: state.senderId,
                message_type: messageType
            };

            if (mediaData) {
                requestBody.media_ciphertext = mediaData.ciphertext;
                requestBody.media_iv = mediaData.iv;
            }

            const response = await fetch(`${API_URL}?action=send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) throw new Error('Send failed');

            const result = await response.json();
            
            const msgContent = {
                text: messagePayload.text,
                mediaType: messagePayload.mediaType,
                mediaMime: messagePayload.mediaMime
            };
            
            if (hasMedia && mediaFile) {
                msgContent.mediaUrl = URL.createObjectURL(mediaFile);
            }
            
            appendMessage({
                id: result.message_id || 'temp_' + timestamp,
                content: msgContent,
                timestamp: timestamp,
                sender: state.senderId,
                isSent: true,
                status: 'sent'
            });

            state.lastMessageTimestamp = Math.max(state.lastMessageTimestamp, timestamp);
            state.displayedMessageIds.add(result.message_id || 'temp_' + timestamp);

        } catch (error) {
            console.error('Failed to send message:', error);
            alert('Failed to send message. Please try again.');
        } finally {
            elements.sendBtn.disabled = false;
            updateSendButton();
        }
    }

    async function fetchMessages() {
        if (state.isLocked || !state.encryptionKey) return;

        try {
            const url = state.lastMessageTimestamp 
                ? `${API_URL}?action=fetch&chat_id=${CHAT_ID}&since=${state.lastMessageTimestamp}`
                : `${API_URL}?action=fetch&chat_id=${CHAT_ID}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error('Fetch failed');

            const data = await response.json();
            
            if (data.messages && data.messages.length > 0) {
                for (const msg of data.messages) {
                    if (state.displayedMessageIds.has(msg.id)) continue;
                    if (msg.timestamp <= state.lastMessageTimestamp && state.lastMessageTimestamp > 0) continue;
                    
                    let content;
                    try {
                        const decryptedText = await decryptMessage(msg.ciphertext, msg.iv);
                        content = JSON.parse(decryptedText);
                    } catch (e) {
                        content = { text: await decryptMessage(msg.ciphertext, msg.iv) };
                    }

                    if (msg.media_ciphertext && msg.media_iv) {
                        const mediaBuffer = await decryptData(msg.media_ciphertext, msg.media_iv);
                        if (mediaBuffer) {
                            const blob = new Blob([mediaBuffer], { type: content.mediaMime || 'application/octet-stream' });
                            content.mediaUrl = URL.createObjectURL(blob);
                        }
                    }

                    const isFromOther = msg.sender !== state.senderId;
                    
                    appendMessage({
                        id: msg.id,
                        content: content,
                        timestamp: msg.timestamp,
                        sender: msg.sender,
                        isSent: !isFromOther,
                        status: 'received'
                    });
                    
                    state.displayedMessageIds.add(msg.id);
                    state.lastMessageTimestamp = Math.max(state.lastMessageTimestamp, msg.timestamp);
                    
                    if (isFromOther) {
                        showNotification('New message from ' + msg.sender, content.text || 'Sent a file');
                    }
                }
            }
        } catch (error) {
            console.error('Failed to fetch messages:', error);
        }
    }

    let lastSender = null;
    
    function appendMessage(msg) {
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${msg.isSent ? 'sent' : 'received'}`;
        if (msg.id) wrapper.dataset.messageId = msg.id;
        
        if (lastSender === msg.sender) {
            wrapper.classList.add('consecutive');
        }
        lastSender = msg.sender;

        const time = new Date(msg.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        const initials = msg.sender.substring(0, 2).toUpperCase();

        let statusIcon = '';
        if (msg.isSent) {
            statusIcon = '<svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
        }

        let content = msg.content;
        let textContent = '';
        let mediaHtml = '';

        if (typeof content === 'object') {
            textContent = content.text || '';
            
            if (content.mediaUrl) {
                if (content.mediaType === 'image') {
                    mediaHtml = `<div class="message-media"><img src="${content.mediaUrl}" alt="Image" onclick="window.openLightbox('${content.mediaUrl}')"></div>`;
                } else if (content.mediaType === 'video') {
                    mediaHtml = `<div class="message-media"><video src="${content.mediaUrl}" controls></video></div>`;
                } else if (content.mediaType === 'audio') {
                    mediaHtml = `<div class="message-media"><audio src="${content.mediaUrl}" controls></audio></div>`;
                }
            }
        } else {
            textContent = content;
        }

        wrapper.innerHTML = `
            <div class="message-avatar">${initials}</div>
            <div class="message">
                ${!msg.isSent ? `<div class="message-sender">${escapeHtml(msg.sender)}</div>` : ''}
                ${mediaHtml}
                ${textContent ? `<div class="message-content">${escapeHtml(textContent)}</div>` : ''}
                <div class="message-meta">
                    <span class="message-time">${time}</span>
                    <span class="message-status">${statusIcon}</span>
                </div>
            </div>
        `;

        elements.messagesContainer.appendChild(wrapper);
        elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    }

    window.openLightbox = openLightbox;

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function handleMessageInputChange() {
        updateSendButton();
    }

    function updateSendButton() {
        const hasText = elements.messageInput.value.trim().length > 0;
        const hasMedia = state.pendingMedia !== null;
        elements.sendBtn.disabled = !hasText && !hasMedia;
    }

    function startPolling() {
        stopPolling();
        state.pollTimer = setInterval(fetchMessages, POLL_INTERVAL);
    }

    function stopPolling() {
        if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
        }
    }

    function showPinScreen() {
        state.isLocked = true;
        stopPolling();
        elements.pinScreen.classList.add('active');
        elements.chatScreen.classList.remove('active');
        elements.pinInput.value = '';
        elements.pinDots.forEach(dot => dot.classList.remove('filled'));
        elements.pinError.textContent = '';
        elements.pinInput.focus();
    }

    function showChatScreen() {
        elements.pinScreen.classList.remove('active');
        elements.chatScreen.classList.add('active');
        elements.modeIndicator.textContent = 'encrypted';
        elements.messageInput.focus();
        resetInactivityTimer();
    }

    function clearMessages() {
        lastSender = null;
        state.displayedMessageIds.clear();
        const container = elements.messagesContainer;
        while (container.firstChild) {
            if (container.firstChild.classList && container.firstChild.classList.contains('encryption-notice')) {
                break;
            }
            container.removeChild(container.firstChild);
        }
        const notices = container.querySelectorAll('.message-wrapper');
        notices.forEach(n => n.remove());
    }

    function lockApp() {
        state.encryptionKey = null;
        state.isLocked = true;
        stopPolling();
        clearMessages();
        state.lastMessageTimestamp = 0;
        showPinScreen();
    }

    function setupInactivityTimer() {
        resetInactivityTimer();
    }

    function resetInactivityTimer() {
        state.lastActivity = Date.now();
        
        if (state.inactivityTimer) {
            clearTimeout(state.inactivityTimer);
        }

        if (!state.isLocked && state.autoLockEnabled) {
            state.inactivityTimer = setTimeout(() => {
                lockApp();
            }, INACTIVITY_TIMEOUT);
        }
    }

    function openSettings() {
        elements.settingsModal.classList.add('active');
        elements.autoLockToggle.checked = state.autoLockEnabled;
        elements.senderIdInput.value = state.senderId;
    }

    function closeSettings() {
        elements.settingsModal.classList.remove('active');
        elements.currentPinInput.value = '';
        elements.newPinInput.value = '';
        elements.confirmPinInput.value = '';
        elements.pinChangeStatus.textContent = '';
        elements.pinChangeStatus.className = 'status-message';
    }

    function handlePinChange() {
        const currentPin = elements.currentPinInput.value;
        const newPin = elements.newPinInput.value;
        const confirmPin = elements.confirmPinInput.value;

        const effectivePin = state.customPin || DEFAULT_PIN;

        if (currentPin !== effectivePin) {
            showPinChangeStatus('Current PIN is incorrect', 'error');
            return;
        }

        if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
            showPinChangeStatus('New PIN must be 4 digits', 'error');
            return;
        }

        if (newPin !== confirmPin) {
            showPinChangeStatus('PINs do not match', 'error');
            return;
        }

        state.customPin = newPin;
        saveSettings();
        saveSession();
        showPinChangeStatus('PIN changed successfully!', 'success');
        
        elements.currentPinInput.value = '';
        elements.newPinInput.value = '';
        elements.confirmPinInput.value = '';
    }

    function showPinChangeStatus(message, type) {
        elements.pinChangeStatus.textContent = message;
        elements.pinChangeStatus.className = `status-message ${type}`;
    }

    function saveSettings() {
        const settings = {
            senderId: state.senderId,
            autoLockEnabled: state.autoLockEnabled,
            motionLockEnabled: state.motionLockEnabled,
            customPin: state.customPin
        };
        localStorage.setItem('securechat_settings', JSON.stringify(settings));
    }

    function loadSettings() {
        try {
            const saved = localStorage.getItem('securechat_settings');
            if (saved) {
                const settings = JSON.parse(saved);
                state.senderId = settings.senderId || state.senderId;
                state.autoLockEnabled = settings.autoLockEnabled !== false;
                state.motionLockEnabled = settings.motionLockEnabled !== false;
                state.customPin = settings.customPin || null;
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
