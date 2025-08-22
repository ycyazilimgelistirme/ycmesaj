const stunServers = [{ urls: ["stun:stun.l.google.com:19302"] }];

const callPeer = document.getElementById("callPeer");
const startCallBtn = document.getElementById("startCall");
const hangupBtn = document.getElementById("hangup");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

let pc = null;
let localStream = null;
let ws = null;
let room = null;
let meUser = null;
let wsOpenPromise = null;

function makeRoomId(a, b) {
  return "webrtc:" + [a.toLowerCase(), b.toLowerCase()].sort().join(":");
}

async function getMe() {
  const res = await fetch("/api/users/me", {
    headers: { Authorization: "Bearer " + localStorage.getItem("jwt") },
  });
  if (!res.ok) { location.href = "/login"; return null; }
  return await res.json();
}

async function ensurePC() {
  if (pc) return pc;

  pc = new RTCPeerConnection({ iceServers: stunServers });

  // Yerel medya
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  // autoplay güvenliği
  localVideo.muted = true; // kendi sesini duymamak için
  localVideo.playsInline = true;
  try { await localVideo.play(); } catch {}

  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  // Uzak medya
  pc.ontrack = (e) => {
    remoteVideo.srcObject = e.streams[0];
    remoteVideo.playsInline = true;
    // iOS/Safari için:
    remoteVideo.muted = false;
    remoteVideo.autoplay = true;
    remoteVideo.play().catch(() => {});
  };

  // ICE candidate’leri karşıya gönder
  pc.onicecandidate = (e) => {
    if (e.candidate && ws && ws.readyState === 1) {
      ws.send(JSON.stringify(e.candidate));
    }
  };

  // Bazı tarayıcılarda otomatik tetiklenir; biz manuel offer üreteceğiz
  pc.onnegotiationneeded = async () => {
    // Çağrıyı başlatan taraf zaten offer gönderiyor; burada tekrar göndermeyelim.
  };

  // Durum logları (debug için)
  pc.onconnectionstatechange = () => console.log("PC state:", pc.connectionState);

  return pc;
}

function openSignaling(roomId) {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/signaling?token=${encodeURIComponent(localStorage.getItem("jwt"))}&room=${encodeURIComponent(roomId)}`;
  ws = new WebSocket(url);

  // ws açık olana kadar beklemek için bir promise
  wsOpenPromise = new Promise((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(e);
  });

  ws.onmessage = async (ev) => {
    const payload = JSON.parse(ev.data);
    if (payload.type !== "signal") return;

    const data = payload.data;

    // SDP Offer/Answer
    if (data.type === "offer") {
      await ensurePC();
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify(answer));
    } else if (data.type === "answer") {
      if (!pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
      }
    } else if (data.candidate) {
      try { await pc.addIceCandidate(data); } catch (err) { console.warn("ICE ekleme hatası:", err); }
    }
  };

  ws.onclose = () => console.log("Signaling WS kapandı");
}

startCallBtn.addEventListener("click", async () => {
  const peer = callPeer.value.trim();
  if (!peer) return;

  meUser = await getMe();
  if (!meUser) return;

  room = makeRoomId(meUser.username, peer);
  openSignaling(room);

  await ensurePC();

  // Signaling kanalı açılmadan offer gönderme!
  await wsOpenPromise;

  const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify(offer));

  startCallBtn.disabled = true;
  hangupBtn.disabled = false;
});

hangupBtn.addEventListener("click", () => {
  if (pc) {
    pc.getSenders().forEach(s => s.track && s.track.stop());
    pc.close();
  }
  if (ws && ws.readyState === 1) ws.close();

  localVideo.srcObject = null;
  remoteVideo.srcObject = null;

  pc = null;
  ws = null;
  localStream = null;
  room = null;

  startCallBtn.disabled = false;
  hangupBtn.disabled = true;
});
