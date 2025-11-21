(function () {
  const sessionSpan = document.getElementById('session-id');
  const roleLabel = document.getElementById('role-label');
  const managerHistory = document.getElementById('manager-history');
  const operatorHistory = document.getElementById('operator-history');
  const managerForm = document.getElementById('manager-form');
  const operatorForm = document.getElementById('operator-form');
  const managerInput = document.getElementById('manager-input');
  const operatorInput = document.getElementById('operator-input');
  const managerSend = document.getElementById('manager-send');
  const operatorSend = document.getElementById('operator-send');
  const configWarning = document.getElementById('config-warning');

  // Utility: parse query params
  const params = new URLSearchParams(window.location.search);
  let sessionId = params.get('session');
  const operatorFlag = params.get('operator') === '1';

  const ROLE_MANAGER = 'manager';
  const ROLE_WORKER = 'worker';

  // Generate a simple session id if missing
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

  // Persist role per URL in localStorage
  const roleKey = `dw-role-${window.location.pathname}-${sessionId}`;
  const storedRole = localStorage.getItem(roleKey);
  const activeRole = operatorFlag ? ROLE_WORKER : ROLE_MANAGER;
  if (!storedRole || storedRole !== activeRole) {
    localStorage.setItem(roleKey, activeRole);
  }

  sessionSpan.textContent = sessionId;
  roleLabel.textContent = activeRole === ROLE_MANAGER ? 'Manager' : 'Operator';

  function setRoleControls(role) {
    const isManager = role === ROLE_MANAGER;
    managerInput.placeholder = isManager
      ? 'Type a message to the digital worker'
      : 'Viewing as operator — manager input disabled here';
    operatorInput.placeholder = isManager
      ? 'Viewing as manager — operator input disabled here'
      : 'Reply as the digital worker';

    managerInput.disabled = !isManager;
    managerSend.disabled = !isManager;
    operatorInput.disabled = isManager;
    operatorSend.disabled = isManager;
  }

  // Firebase configuration placeholder — replace with your project values
  const firebaseConfig = {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_AUTH_DOMAIN',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_STORAGE_BUCKET',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    appId: 'YOUR_APP_ID'
  };

  let db;
  try {
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
      throw new Error('Firebase config missing');
    }
    const app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore(app);
  } catch (err) {
    configWarning.textContent = 'Firebase is not configured, please add your config in app.js';
    configWarning.style.display = 'block';
    disableInputs();
    return;
  }

  const messagesRef = db.collection('sessions').doc(sessionId).collection('messages');

  // Listen for changes
  messagesRef.orderBy('timestamp', 'asc').onSnapshot((snapshot) => {
    const messages = [];
    snapshot.forEach((doc) => messages.push({ id: doc.id, ...doc.data() }));
    renderHistory(messages);
  }, (error) => {
    console.error('Failed to listen to messages', error);
  });

  function renderHistory(messages) {
    managerHistory.innerHTML = '';
    operatorHistory.innerHTML = '';
    messages.forEach((msg) => {
      const managerBubble = createMessageBubble(msg, ROLE_MANAGER);
      const operatorBubble = createMessageBubble(msg, ROLE_WORKER);
      managerHistory.appendChild(managerBubble);
      operatorHistory.appendChild(operatorBubble);
    });
    scrollToBottom(managerHistory);
    scrollToBottom(operatorHistory);
  }

  function createMessageBubble(message, perspective) {
    const bubble = document.createElement('div');
    const isManager = message.role === ROLE_MANAGER;
    const roleText = isManager ? 'Manager' : 'Digital Worker';
    const bubbleRoleClass = (perspective === ROLE_MANAGER)
      ? (isManager ? 'manager' : 'worker')
      : (isManager ? 'worker' : 'manager');

    bubble.className = `message ${bubbleRoleClass}`;

    const meta = document.createElement('div');
    meta.className = 'meta';
    const time = message.timestamp?.toDate ? message.timestamp.toDate() : new Date(message.timestamp || Date.now());
    meta.innerHTML = `<span>${roleText}</span><span>${formatTime(time)}</span>`;

    const text = document.createElement('div');
    text.className = 'body';
    text.textContent = message.text;

    bubble.appendChild(meta);
    bubble.appendChild(text);
    return bubble;
  }

  function formatTime(date) {
    return new Intl.DateTimeFormat([], {
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      day: 'numeric'
    }).format(date);
  }

  function scrollToBottom(container) {
    container.scrollTop = container.scrollHeight;
  }

  async function sendMessage(role, text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const payload = {
      text: trimmed,
      role,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    await messagesRef.add(payload);
  }

  function handleSubmit(event, role, textarea) {
    event.preventDefault();
    const value = textarea.value;
    if (!value.trim()) return;
    sendMessage(role, value).catch((err) => console.error('Send failed', err));
    textarea.value = '';
    updateButtonState();
    textarea.focus();
  }

  managerForm.addEventListener('submit', (e) => handleSubmit(e, ROLE_MANAGER, managerInput));
  operatorForm.addEventListener('submit', (e) => handleSubmit(e, ROLE_WORKER, operatorInput));

  function updateButtonState() {
    managerSend.disabled = managerSend.disabled || !managerInput.value.trim();
    operatorSend.disabled = operatorSend.disabled || !operatorInput.value.trim();
  }

  [managerInput, operatorInput].forEach((input) => {
    input.addEventListener('input', updateButtonState);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const form = input === managerInput ? managerForm : operatorForm;
        form.requestSubmit();
      }
    });
  });

  function disableInputs() {
    [managerInput, operatorInput, managerSend, operatorSend].forEach((el) => {
      el.disabled = true;
    });
  }

  setRoleControls(activeRole);
  updateButtonState();
})();
