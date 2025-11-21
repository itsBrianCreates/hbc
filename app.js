// Human Behind The Curtain demo
// Make sure index.html loads:
//   firebase-app-compat.js
//   firebase-firestore-compat.js
// before this file

// 1. Firebase config
// Replace the placeholder values with your real config from Firebase console
const firebaseConfig = {
  apiKey: "AIzaSyDyY5EnMe-RfdiS9i6EKTG4t5ThjvrV1BE",
  authDomain: "humanbehindcurtain.firebaseapp.com",
  projectId: "humanbehindcurtain",
  storageBucket: "humanbehindcurtain.firebasestorage.app",
  messagingSenderId: "629816799936",
  appId: "1:629816799936:web:9f531c464a2c7c0e6c7325",
  measurementId: "G-E3EY55Z643"
};

// 2. Initialize Firebase and Firestore
let db = null;

(function initFirebase() {
  if (!firebaseConfig || !firebaseConfig.apiKey) {
    console.error("Firebase config is missing");
    return;
  }

  const app = firebase.initializeApp(firebaseConfig);
  db = firebase.firestore(app);
})();

// 3. Session and role setup

function getOrCreateSessionId() {
  const params = new URLSearchParams(window.location.search);
  let sessionId = params.get("session");

  if (!sessionId) {
    if (window.crypto && crypto.randomUUID) {
      sessionId = crypto.randomUUID();
    } else {
      sessionId = "s_" + Math.random().toString(36).slice(2);
    }
    params.set("session", sessionId);
    const newUrl =
      window.location.pathname + "?" + params.toString() + window.location.hash;
    window.history.replaceState({}, "", newUrl);
  }

  return sessionId;
}

const sessionId = getOrCreateSessionId();
const roleStorageKey = `hbcRole:${sessionId}`;

function getStoredRole() {
  return localStorage.getItem(roleStorageKey) || "";
}

function setStoredRole(role) {
  localStorage.setItem(roleStorageKey, role);
}

// 4. DOM elements

const rolePickerEl = document.getElementById("rolePicker");
const managerBtn = document.getElementById("managerBtn");
const operatorBtn = document.getElementById("operatorBtn");

const messagesEl = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");

const sessionLabelEl = document.getElementById("sessionLabel");
const roleLabelEl = document.getElementById("roleLabel");
const roleSwitchSelect = document.getElementById("roleSwitcher");
const copySessionBtn = document.getElementById("copySession");
const endSessionBtn = document.getElementById("endSession");
const copyToastEl = document.getElementById("copyToast");
const responseTimerEl = document.getElementById("responseTimer");
const quickRepliesEl = document.getElementById("quickReplies");

const QUICK_REPLY_OPTIONS = [
  "Got it, I will get started right away.",
  "This usually takes me a few minutes, I will keep you posted."
];

// 5. State

let activeRole = getStoredRole() || ""; // "manager" or "worker"
let unsubscribe = null;
let responseTimerInterval = null;
let responseTimerStartMs = 0;
let pendingManagerMessageId = null;

// 6. UI helpers

function setRole(role) {
  if (!role) return;
  activeRole = role;
  setStoredRole(role);

  rolePickerEl.classList.add("hidden");
  if (roleSwitchSelect) {
    roleSwitchSelect.value = role;
  }
  updateRoleLabel();
  attachMessageListener();
  renderQuickReplies();
  updateResponseTimerVisibility(false);
}

function updateRoleLabel() {
  sessionLabelEl.textContent = `Session: ${sessionId}`;

  if (activeRole === "manager") {
    roleLabelEl.textContent = "You are: Manager (talking to the digital worker)";
  } else if (activeRole === "worker") {
    roleLabelEl.textContent = "You are: Human behind the curtain (replying as the worker)";
  } else {
    roleLabelEl.textContent = "Pick a role to begin";
  }
}

function updateResponseTimerVisibility(visible) {
  if (!responseTimerEl) return;
  if (activeRole !== "worker") {
    responseTimerEl.hidden = true;
    return;
  }
  responseTimerEl.hidden = !visible;
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function startResponseTimer(startMs) {
  if (!responseTimerEl) return;
  responseTimerStartMs = startMs || Date.now();
  updateResponseTimerVisibility(true);

  const update = () => {
    const elapsed = Date.now() - responseTimerStartMs;
    responseTimerEl.textContent = `Waiting to respond · ${formatElapsed(elapsed)}`;
  };

  if (responseTimerInterval) {
    clearInterval(responseTimerInterval);
  }
  update();
  responseTimerInterval = setInterval(update, 1000);
}

function stopResponseTimer() {
  if (responseTimerInterval) {
    clearInterval(responseTimerInterval);
    responseTimerInterval = null;
  }
  responseTimerStartMs = 0;
  updateResponseTimerVisibility(false);
}

function renderQuickReplies() {
  if (!quickRepliesEl) return;
  const isWorker = activeRole === "worker";
  quickRepliesEl.hidden = !isWorker;

  if (!isWorker) {
    quickRepliesEl.replaceChildren();
    return;
  }

  if (quickRepliesEl.childElementCount === QUICK_REPLY_OPTIONS.length) {
    return;
  }

  quickRepliesEl.replaceChildren(
    ...QUICK_REPLY_OPTIONS.map((text) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = text;
      btn.setAttribute("data-text", text);
      return btn;
    })
  );
}

function renderMessages(docs) {
  messagesEl.innerHTML = "";

  docs.forEach((doc) => {
    const data = doc.data();
    const msgRole = data.role === "worker" ? "worker" : "manager";
    const text = data.text || "";
    const ts = data.timestamp ? data.timestamp.toDate?.() || data.timestamp : null;
    const isMine =
      (activeRole === "manager" && msgRole === "manager") ||
      (activeRole === "worker" && msgRole === "worker");

    const row = document.createElement("div");
    row.className = `message-row ${isMine ? "mine" : "theirs"}`;

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const who = isMine ? "" : msgRole === "manager" ? "Manager" : "Digital worker";

    let timeStr = "";
    if (ts instanceof Date && !isNaN(ts.getTime())) {
      const hours = ts.getHours();
      const minutes = ts.getMinutes().toString().padStart(2, "0");
      const displayHour = ((hours + 11) % 12) + 1; // convert 0-23 to 1-12
      const period = hours >= 12 ? "PM" : "AM";
      timeStr = `${displayHour}:${minutes} ${period}`;
    }

    if (isMine) {
      meta.textContent = timeStr;
    } else {
      meta.textContent = timeStr ? `${who} · ${timeStr}` : who;
    }

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = text;

    row.appendChild(meta);
    row.appendChild(bubble);
    messagesEl.appendChild(row);
  });

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showToast(message) {
  if (!copyToastEl) return;
  copyToastEl.textContent = message;
  copyToastEl.classList.add("visible");
  setTimeout(() => copyToastEl.classList.remove("visible"), 1800);
}

async function copySessionLink() {
  const link = window.location.href;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
    } else {
      const temp = document.createElement("input");
      temp.value = link;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      document.body.removeChild(temp);
    }
    showToast("Session link copied");
  } catch (err) {
    console.error("Failed to copy session link", err);
    showToast("Unable to copy");
  }
}

function endSession() {
  localStorage.removeItem(roleStorageKey);
  window.location.href = "../";
}

// 7. Firestore listener

function attachMessageListener() {
  if (!db) {
    console.error("Firestore not initialized");
    return;
  }

  if (!activeRole) {
    return;
  }

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  const messagesRef = db
    .collection("sessions")
    .doc(sessionId)
    .collection("messages")
    .orderBy("timestamp", "asc");

  unsubscribe = messagesRef.onSnapshot(
    (snapshot) => {
      const docs = snapshot.docs;
      renderMessages(docs);

      if (activeRole !== "worker") {
        stopResponseTimer();
        pendingManagerMessageId = null;
        return;
      }

      // track latest manager and worker messages
      let latestManager = null;
      let latestWorker = null;
      const getMillis = (doc) => {
        const data = doc.data();
        const ts = data.timestamp;
        if (ts?.toMillis) return ts.toMillis();
        if (ts instanceof Date) return ts.getTime();
        if (typeof data.createdAt === "number") return data.createdAt;
        return 0;
      };

      docs.forEach((docItem) => {
        const role = docItem.data().role === "worker" ? "worker" : "manager";
        const ts = getMillis(docItem);
        if (role === "manager") {
          if (!latestManager || ts >= latestManager.time) {
            latestManager = { id: docItem.id, time: ts };
          }
        } else if (role === "worker") {
          if (!latestWorker || ts >= latestWorker.time) {
            latestWorker = { id: docItem.id, time: ts };
          }
        }
      });

      if (!latestManager) {
        stopResponseTimer();
        pendingManagerMessageId = null;
        return;
      }

      const workerAfterManager =
        latestWorker && latestWorker.time > latestManager.time;

      if (workerAfterManager) {
        stopResponseTimer();
        pendingManagerMessageId = null;
        return;
      }

      // pending manager message
      if (pendingManagerMessageId !== latestManager.id) {
        pendingManagerMessageId = latestManager.id;
        startResponseTimer(Date.now());
      } else if (!responseTimerInterval) {
        startResponseTimer(responseTimerStartMs || Date.now());
      } else {
        updateResponseTimerVisibility(true);
      }
    },
    (err) => {
      console.error("Error listening to messages", err);
    }
  );
}

// 8. Send message

async function sendMessage(text) {
  if (!db) {
    console.error("Firestore not initialized");
    return;
  }
  if (!activeRole) {
    return;
  }

  const role = activeRole === "manager" ? "manager" : "worker";

  const messagesRef = db
    .collection("sessions")
    .doc(sessionId)
    .collection("messages");

  try {
    await messagesRef.add({
      text,
      role,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (role === "worker") {
      stopResponseTimer();
      pendingManagerMessageId = null;
    }
  } catch (err) {
    console.error("Error sending message", err);
  }
}

// 9. Event wiring

managerBtn.addEventListener("click", () => setRole("manager"));
operatorBtn.addEventListener("click", () => setRole("worker"));

if (roleSwitchSelect) {
  roleSwitchSelect.addEventListener("change", (evt) => {
    const nextRole = evt.target.value;
    if (!nextRole) return;
    setRole(nextRole);
  });
}

if (copySessionBtn) {
  copySessionBtn.addEventListener("click", () => copySessionLink());
}

if (endSessionBtn) {
  endSessionBtn.addEventListener("click", () => endSession());
}

messageInput.addEventListener("input", () => {
  const value = messageInput.value.trim();
  sendButton.disabled = !value;
});

messageInput.addEventListener("keydown", (evt) => {
  if (evt.key === "Enter" && !evt.shiftKey) {
    evt.preventDefault();
    if (!sendButton.disabled) {
      messageForm.requestSubmit();
    }
  }
});

messageForm.addEventListener("submit", (evt) => {
  evt.preventDefault();
  const value = messageInput.value.trim();
  if (!value) return;

  sendMessage(value);
  messageInput.value = "";
  sendButton.disabled = true;
});

if (quickRepliesEl) {
  quickRepliesEl.addEventListener("click", (evt) => {
    const btn = evt.target.closest("button[data-text]");
    if (!btn) return;
    if (activeRole !== "worker") return;
    const text = btn.getAttribute("data-text") || "";
    if (!text) return;
    sendMessage(text);
  });
}

// 10. Initial boot

(function boot() {
  updateRoleLabel();

  if (!activeRole) {
    rolePickerEl.classList.remove("hidden");
    if (roleSwitchSelect) {
      roleSwitchSelect.value = "";
    }
  } else {
    rolePickerEl.classList.add("hidden");
    if (roleSwitchSelect) {
      roleSwitchSelect.value = activeRole;
    }
    attachMessageListener();
  }
  renderQuickReplies();
})();
