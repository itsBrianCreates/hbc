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

// 5. State

let activeRole = getStoredRole() || ""; // "manager" or "worker"
let unsubscribe = null;

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
      renderMessages(snapshot.docs);
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
})();
