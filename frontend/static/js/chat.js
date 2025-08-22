const meNameEl = document.getElementById("meName");
const avatarInput = document.getElementById("avatarInput");
const peerInput = document.getElementById("peerUsername");
const startChatBtn = document.getElementById("startChatBtn");
const peerStatusEl = document.getElementById("peerStatus");
const messagesEl = document.getElementById("messages");
const msgInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const recordBtn = document.getElementById("recordBtn");

let me = null;
let peer = null;
let ws = null;
let voiceWS = null;
let mediaRecorder = null;
let voiceStream = null;
let voiceSource = null; // MediaSource tabanlı playback için

async function initMe() {
  const res = await fetch("/api/users/me", { headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") }});
  if (!res.ok) { location.href = "/login"; return; }
  me = await res.json();
  meNameEl.textContent = me.display_name || me.username;
}
initMe();

// Avatar yükleme
if (avatarInput) {
  avatarInput.addEventListener("change", async () => {
    const fd = new FormData();
    fd.append("file", avatarInput.files[0]);
    const res = await fetch("/api/users/me/profile-image", {
      method: "POST",
      headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") },
      body: fd
    });
    if (!res.ok) return alert("Yükleme başarısız");
    alert("Profil resmi güncellendi");
  });
}

// Peer durum sorgu
async function refreshStatus() {
  if (!peer) return;
  const res = await fetch(`/api/users/${encodeURIComponent(peer)}/status`);
  if (res.ok) {
    const s = await res.json();
    peerStatusEl.textContent = s.is_online ? "çevrim içi" : "çevrim dışı";
  }
}

startChatBtn.addEventListener("click", () => {
  const p = peerInput.value.trim();
  if (!p) return;
  peer = p;
  openChatWS();
  refreshStatus();
});

function renderMessage(m) {
  const div = document.createElement("div");
  div.className = "msg " + (m.from === me.id ? "me" : "");
  if (m.msg_type === "audio" && m.file_url) {
    div.innerHTML = `
      <div><audio controls src="${m.file_url}"></audio></div>
      <div class="meta">${new Date(m.created_at).toLocaleTimeString()} ${m.read_at ? "✓✓" : "✓"}</div>`;
  } else {
    div.innerHTML = `
      <div>${(m.content || "").replace(/</g, "&lt;")}</div>
      <div class="meta">${new Date(m.created_at).toLocaleTimeString()} ${m.read_at ? "✓✓" : "✓"}</div>`;
  }
  div.dataset.msgId = m.id;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function openChatWS() {
  if (ws) ws.close();
  const token = localStorage.getItem("jwt");
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/chat?token=${encodeURIComponent(token)}&peer=${encodeURIComponent(peer)}`);

  ws.onopen = () => { /* hazır */ };
  ws.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.type === "history") {
      messagesEl.innerHTML = "";
      data.items.forEach(renderMessage);
    } else if (data.type === "message") {
      renderMessage(data);
      // Benim aldığım mesajı okundu olarak işaretle
      if (data.to === me.id) {
        ws.send(JSON.stringify({ type: "read", message_id: data.id }));
      }
    } else if (data.type === "read") {
      const el = [...document.querySelectorAll(".msg")].find(x => x.dataset.msgId == data.message_id);
      if (el) el.querySelector(".meta").textContent += " ✓✓";
    } else if (data.type === "delete") {
      const el = [...document.querySelectorAll(".msg")].find(x => x.dataset.msgId == data.message_id);
      if (el) el.remove();
    }
  };
  ws.onclose = () => {};
}

sendBtn.addEventListener("click", async () => {
  const content = msgInput.value.trim();
  if (!content || !ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: "message", content, msg_type: "text" }));
  msgInput.value = "";
});

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendBtn.click();
});

// Sesli mesaj (upload + playback)
recordBtn.addEventListener("click", async () => {
  if (!peer) return alert("Önce sohbet başlat");
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    recordBtn.textContent = "🎤";
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
  const chunks = [];
  mediaRecorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: "audio/webm" });
    const fd = new FormData();
    fd.append("file", blob, "voice.webm");
    const res = await fetch(`/api/upload/audio?to_username=${encodeURIComponent(peer)}`, {
      method: "POST",
      headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") },
      body: fd
    });
    if (!res.ok) return alert("Yükleme başarısız");
    const { file_url, message_id } = await res.json();
    // WebSocket'e mesaj bildirimi
    ws.send(JSON.stringify({ type: "message", msg_type: "audio", file_url }));
  };
  mediaRecorder.start();
  recordBtn.textContent = "■";
});

// --- Gerçek zamanlı sesli sohbet (WebSocket chunk yayını) ---
const startVoiceBtn = document.getElementById("startVoiceBtn");
const stopVoiceBtn = document.getElementById("stopVoiceBtn");
const voicePlayer = document.getElementById("voicePlayer");

startVoiceBtn.addEventListener("click", async () => {
  if (!peer) return alert("Önce sohbet başlat");
  const token = localStorage.getItem("jwt");
  voiceWS = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/voice?token=${encodeURIComponent(token)}&peer=${encodeURIComponent(peer)}`);

  // Alınan chunk'ları çal (MediaSource ile)
  let mediaSource = new MediaSource();
  voicePlayer.src = URL.createObjectURL(mediaSource);
  let sourceBuffer = null;
  let queue = [];
  mediaSource.addEventListener("sourceopen", () => {
    try {
      sourceBuffer = mediaSource.addSourceBuffer('audio/webm; codecs="opus"');
      sourceBuffer.addEventListener("updateend", () => {
        if (queue.length && !sourceBuffer.updating) {
          sourceBuffer.appendBuffer(queue.shift());
        }
      });
    } catch (e) {
      console.warn("MediaSource desteklenmiyor:", e);
    }
  });

  voiceWS.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "audio-chunk") {
      const buf = new Uint8Array(msg.data.match(/.{1,2}/g).map(b => parseInt(b, 16))).buffer;
      if (sourceBuffer && !sourceBuffer.updating) {
        sourceBuffer.appendBuffer(buf);
      } else {
        queue.push(buf);
      }
    }
  };

  // Mikrofonu kaydet ve chunk gönder
  voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(voiceStream, { mimeType: "audio/webm;codecs=opus" });
  rec.ondataavailable = (e) => {
    if (e.data.size && voiceWS.readyState === 1) {
      e.data.arrayBuffer().then(buf => voiceWS.send(buf));
    }
  };
  rec.start(300); // 300ms'de bir chunk
  startVoiceBtn.disabled = true;
  stopVoiceBtn.disabled = false;

  stopVoiceBtn.onclick = () => {
    rec.stop();
    voiceStream.getTracks().forEach(t => t.stop());
    if (voiceWS && voiceWS.readyState === 1) voiceWS.close();
    startVoiceBtn.disabled = false;
    stopVoiceBtn.disabled = true;
  };
});
