const stunServers = [{ urls: ["stun:stun.l.google.com:19302"] }];
const callPeer = document.getElementById("callPeer");
const startCallBtn = document.getElementById("startCall");
const hangupBtn = document.getElementById("hangup");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

let pc = null, localStream = null, ws = null, room = null;

function makeRoomId(a, b) {
  const s = [a.toLowerCase(), b.toLowerCase()].sort().join(":");
  return "webrtc:" + s;
}

async function getMe() {
  const res = await fetch("/api/users/me", { headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") }});
  if (!res.ok) { location.href = "/login"; return null; }
  return await res.json();
}

startCallBtn.addEventListener("click", async () => {
  const peer = callPeer.value.trim();
  if (!peer) return;

  const me = await getMe();
  room = makeRoomId(me.username, peer);

  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/signaling?token=${encodeURIComponent(localStorage.getItem("jwt"))}&room=${encodeURIComponent(room)}`);
  ws.onmessage = async (ev) => {
    const payload = JSON.parse(ev.data);
    if (payload.type !== "signal") return;
    const data = payload.data;

    if (data.type === "offer") {
      await ensurePC();
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify(answer));
    } else if (data.type === "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(data));
    } else if (data.candidate) {
      try { await pc.addIceCandidate(data); } catch {}
    }
  };

  await ensurePC();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.onopen = () => ws.send(JSON.stringify(offer));

  startCallBtn.disabled = true;
  hangupBtn.disabled = false;
});

hangupBtn.addEventListener("click", () => {
  if (pc) { pc.getSenders().forEach(s => s.track && s.track.stop()); pc.close(); }
  if (ws && ws.readyState === 1) ws.close();
  localVideo.srcObject = null; remoteVideo.srcObject = null;
  pc = null; ws = null; localStream = null;
  startCallBtn.disabled = false; hangupBtn.disabled = true;
});

async function ensurePC() {
  if (pc) return pc;
  pc = new RTCPeerConnection({ iceServers: stunServers });
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.ontrack = (e) => { remoteVideo.srcObject = e.streams[0]; };
  pc.onicecandidate = (e) => { if (e.candidate && ws && ws.readyState === 1) ws.send(JSON.stringify(e.candidate)); };
  return pc;
}
