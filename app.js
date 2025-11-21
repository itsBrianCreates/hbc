(function () {
  function init() {
    const ROLE_MANAGER = 'manager';
    const ROLE_WORKER = 'worker';

    const rolePicker = document.getElementById('role-picker');
    const chooseManager = document.getElementById('choose-manager');
    const chooseOperator = document.getElementById('choose-operator');
    const chatSection = document.getElementById('chat');
    const chatTitle = document.getElementById('chat-title');
    const chatSubtitle = document.getElementById('chat-subtitle');
    const chatEyebrow = document.getElementById('chat-eyebrow');
    const messageList = document.getElementById('message-list');
    const composerForm = document.getElementById('composer');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const sessionSpan = document.getElementById('session-id');
    const roleLabel = document.getElementById('role-label');
    const status = document.getElementById('status');

    if (!rolePicker || !messageInput || !composerForm) {
      console.error('Required DOM nodes missing.');
      return;
    }

    let db = null;
    let messagesRef = null;
    let unsubscribe = null;

    function disableComposer() {
      messageInput.disabled = true;
      sendButton.disabled = true;
    }

    function enableComposer() {
      messageInput.disabled = false;
      updateSendState();
    }

    disableComposer();

    // Session handling
    const params = new URLSearchParams(window.location.search);
    let sessionId = params.get('session');

    function generateSessionId() {
      if (crypto.randomUUID) return crypto.randomUUID();
      return 'session-' + Math.random().toString(36).slice(2, 10);
    }

    if (!sessionId) {
      sessionId = generateSessionId();
      params.set('session', sessionId);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      history.replaceState(null, '', newUrl);
    }

    sessionSpan.textContent = sessionId;

    const roleKey = `hbcRole:${sessionId}`;
    let activeRole = localStorage.getItem(roleKey) || '';

    // Firebase config placeholder - replace with your own project settings
    const firebaseConfig = {
      apiKey: 'YOUR_API_KEY',
      authDomain: 'YOUR_AUTH_DOMAIN',
      projectId: 'YOUR_PROJECT_ID',
      storageBucket: 'YOUR_STORAGE_BUCKET',
      messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
      appId: 'YOUR_APP_ID',
    };

    function firebaseReady() {
      if (typeof firebase === 'undefined') return false;
      if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') return false;
      return true;
    }

    function showConfigError() {
      const warning = 'Firebase is not configured. Please add your firebaseConfig in app.js.';
      status.textContent = warning;
      messageList.innerHTML = `<div class="system-message">${warning}</div>`;
      disableComposer();
    }

    function setStatus(text) {
      status.textContent = text;
    }

    function initializeFirebase() {
      if (!firebaseReady()) {
        showConfigError();
        return false;
      }

      try {
        const app = firebase.initializeApp(firebaseConfig);
        db = firebase.firestore(app);
        messagesRef = db.collection('sessions').doc(sessionId).collection('messages');
        setStatus(`Connected to Firebase project "${firebaseConfig.projectId}".`);
        return true;
      } catch (err) {
        console.error('Firebase init failed', err);
        status.textContent = 'Unable to initialize Firebase. Check the console for details.';
        disableComposer();
        return false;
      }
    }

    function formatTime(date) {
      return new Intl.DateTimeFormat([], {
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
        day: 'numeric',
      }).format(date);
    }

    function renderMessages(messages) {
      messageList.innerHTML = '';

      if (!messages.length) {
        messageList.innerHTML = '<div class="system-message">No messages yet. Start the conversation!</div>';
        return;
      }

      messages.forEach((msg) => {
        const bubble = document.createElement('div');
        const isManager = msg.role === ROLE_MANAGER;
        const roleName = isManager ? 'Manager' : 'Digital Worker';
        bubble.className = `message ${isManager ? 'manager' : 'worker'}`;

        const meta = document.createElement('div');
        meta.className = 'meta';
        const timestamp = msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date();
        meta.innerHTML = `<span>${roleName}</span><span>${formatTime(timestamp)}</span>`;

        const body = document.createElement('div');
        body.className = 'body';
        body.textContent = msg.text;

        bubble.appendChild(meta);
        bubble.appendChild(body);
        messageList.appendChild(bubble);
      });

      messageList.scrollTop = messageList.scrollHeight;
    }

    function startListening() {
      if (!messagesRef) return;
      if (unsubscribe) unsubscribe();

      unsubscribe = messagesRef
        .orderBy('timestamp', 'asc')
        .onSnapshot(
          (snapshot) => {
            const messages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            renderMessages(messages);
            setStatus('Live updates enabled.');
          },
          (err) => {
            console.error('Failed to listen for messages', err);
            setStatus('Real-time updates are unavailable right now.');
          },
        );
    }

    function updateSendState() {
      const hasText = messageInput.value.trim().length > 0;
      sendButton.disabled = !hasText || messageInput.disabled;
    }

    async function sendMessage(text) {
      const trimmed = text.trim();
      if (!trimmed || !messagesRef) return;

      const payload = {
        text: trimmed,
        role: activeRole === ROLE_MANAGER ? ROLE_MANAGER : ROLE_WORKER,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      };

      await messagesRef.add(payload);
    }

    function setRole(role) {
      activeRole = role;
      localStorage.setItem(roleKey, role);
      roleLabel.textContent = role === ROLE_MANAGER ? 'Manager' : 'Human behind the curtain';

      chatEyebrow.textContent = role === ROLE_MANAGER ? 'Manager view' : 'Operator view';
      chatTitle.textContent = role === ROLE_MANAGER ? 'Digital Worker' : 'Human Behind the Curtain';
      chatSubtitle.textContent = role === ROLE_MANAGER
        ? 'You are the manager. Ask the digital worker to perform tasks.'
        : 'You are replying on behalf of the digital worker. Respond to the manager.';

      messageInput.placeholder = role === ROLE_MANAGER
        ? 'Type a task or question for the digital worker'
        : 'Reply to the manager as the digital worker (Shift+Enter for new line)';

      rolePicker.hidden = true;
      chatSection.hidden = false;
      if (messagesRef) {
        enableComposer();
      }
      updateSendState();
      messageInput.focus();
    }

    chooseManager.addEventListener('click', () => setRole(ROLE_MANAGER));
    chooseOperator.addEventListener('click', () => setRole(ROLE_WORKER));

    // Restore role or show picker
    if (activeRole === ROLE_MANAGER || activeRole === ROLE_WORKER) {
      setRole(activeRole);
    } else {
      rolePicker.hidden = false;
      chatSection.hidden = true;
    }

    const firebaseInitialized = initializeFirebase();
    if (firebaseInitialized) {
      startListening();
      if (activeRole === ROLE_MANAGER || activeRole === ROLE_WORKER) {
        enableComposer();
      }
    }

    composerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = messageInput.value;
      if (!value.trim()) return;
      sendMessage(value).catch((err) => console.error('Send failed', err));
      messageInput.value = '';
      updateSendState();
      messageInput.focus();
    });

    messageInput.addEventListener('input', updateSendState);
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        composerForm.requestSubmit();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
