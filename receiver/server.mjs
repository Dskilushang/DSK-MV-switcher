import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HOST = process.env.DSK_RECEIVER_HOST || '0.0.0.0';
const PORT = Number(process.env.DSK_RECEIVER_PORT || 8765);
const TOKEN_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '.receiver-token');
let receiverToken = process.env.DSK_RECEIVER_TOKEN?.trim();
if (!receiverToken) {
  try {
    receiverToken = (await readFile(TOKEN_PATH, 'utf8')).trim();
  } catch {
    receiverToken = randomBytes(24).toString('hex');
    await writeFile(TOKEN_PATH, receiverToken, { flag: 'wx' });
  }
}
if (receiverToken.length < 16) throw new Error('DSK_RECEIVER_TOKEN must contain at least 16 characters.');
console.log('DSK Audio Receiver pairing code: ' + receiverToken);

function isLoopback(address = '') {
  return address === '127.0.0.1' || address === '::1' || address.startsWith('::ffff:127.');
}
const VALID_STREAMS = new Set(['pgm', ...Array.from({ length: 8 }, (_, index) => `iso-${index + 1}`), ...Array.from({ length: 7 }, (_, index) => `cam-${index + 2}`)]);
const rooms = new Map();

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function page(streamId) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DSK Audio Receiver · ${streamId.toUpperCase()}</title>
<style>html,body{margin:0;width:100%;height:100%;background:#080d16;color:#fff;font:14px Arial,sans-serif}body{display:flex;align-items:center;justify-content:center}#state{opacity:.65;font-size:11px}</style></head>
<body><div id="state">DSK AUDIO · ${streamId.toUpperCase()} · INITIALISATION</div><audio id="audio" autoplay playsinline></audio>
<script>
const streamId = ${JSON.stringify(streamId)};
const receiverToken = ${JSON.stringify(receiverToken)};
const state = document.getElementById('state');
const audio = document.getElementById('audio');
let peer;
let socket;
let pendingCandidates = [];
function setState(value){state.textContent='DSK AUDIO · '+streamId.toUpperCase()+' · '+value;}
function start(){
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(scheme+'//'+location.host+'/signal?role=receiver&stream='+encodeURIComponent(streamId)+'&token='+encodeURIComponent(receiverToken));
  socket.onopen=()=>{socket.send(JSON.stringify({type:'register',role:'receiver',stream:streamId}));setState('EN ATTENTE DU MIXEUR');};
  socket.onmessage=async(event)=>{
    try{
      const message=JSON.parse(event.data);
      if(message.type==='offer'&&message.sdp){
        if(peer)peer.close();
        peer=new RTCPeerConnection({iceServers:[]});
        peer.ontrack=(trackEvent)=>{
          audio.srcObject=trackEvent.streams[0]||new MediaStream([trackEvent.track]);
          audio.play().then(()=>setState('REÇU')).catch(()=>setState('AUTORISATION AUDIO REQUISE'));
        };
        peer.onicecandidate=(iceEvent)=>{
          if(iceEvent.candidate&&socket.readyState===WebSocket.OPEN){
            socket.send(JSON.stringify({type:'candidate',candidate:iceEvent.candidate}));
          }
        };
        peer.onconnectionstatechange=()=>setState(peer.connectionState.toUpperCase());
        await peer.setRemoteDescription(message.sdp);
        for(const candidate of pendingCandidates)await peer.addIceCandidate(candidate);
        pendingCandidates=[];
        const answer=await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.send(JSON.stringify({type:'answer',sdp:peer.localDescription}));
      }else if(message.type==='candidate'&&message.candidate){
        if(peer&&peer.remoteDescription)await peer.addIceCandidate(message.candidate);
        else pendingCandidates.push(message.candidate);
      }else if(message.type==='peer-left'){
        if(peer)peer.close();
        setState('ÉMETTEUR DÉCONNECTÉ');
      }else if(message.type==='error'){
        setState(message.message||'ERREUR');
      }
    }catch(error){setState('ERREUR WEBRTC');console.error(error);}
  };
  socket.onclose=()=>{if(peer)peer.close();setState('SIGNALISATION FERMÉE');};
  socket.onerror=()=>setState('ERREUR DE SIGNALISATION');
}
start();
</script></body></html>`;
}

function cameraPage() {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>DSK Camera</title>
<style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#080d16;color:#fff;font:15px Arial,sans-serif}
main{max-width:560px;margin:auto;padding:20px;display:grid;gap:14px}
h1{margin:0;color:#fbbf24;font-size:24px}p{color:#aab6c8;font-size:13px;line-height:1.45}
label{display:grid;gap:6px;color:#aab6c8;font-size:12px}
input,select,button{width:100%;min-height:46px;border-radius:8px;border:1px solid #334155;background:#111c2d;color:white;padding:10px;font-size:15px}
button{font-weight:800;background:#a16207;border:1px solid #f59e0b}
button:disabled{opacity:.4}#stop{background:#991b1b;border-color:#ef4444}
video{width:100%;aspect-ratio:16/9;background:#000;border-radius:10px;object-fit:cover}
#state{padding:12px;border-radius:8px;background:#172033;color:#fde68a;font-size:12px;overflow-wrap:anywhere}
</style></head>
<body><main>
<h1>DSK CAMERA</h1>
<p>Émetteur vidéo mobile pour DSK-MV Switcher. Le téléphone et la tablette de mixage doivent être sur le même réseau local.</p>
<label>Source vidéo<select id="camera"><option value="2">CAM 2</option><option value="3">CAM 3</option><option value="4">CAM 4</option><option value="5">CAM 5</option><option value="6">CAM 6</option><option value="7">CAM 7</option><option value="8">CAM 8</option></select></label>
<label>Code d’association<input id="token" type="password" autocomplete="off" placeholder="Code affiché sur le PC Receiver"></label>
<label>Caméra du téléphone<select id="facing"><option value="environment">Arrière</option><option value="user">Avant</option></select></label>
<video id="preview" autoplay playsinline muted></video>
<button id="start">DÉMARRER LA CAMÉRA</button><button id="stop" disabled>ARRÊTER</button>
<div id="state">En attente. Entrez le code d’association puis démarrez.</div>
<p>La caméra nécessite un contexte sécurisé (HTTPS ou application native). Si cette page est ouverte en HTTP via une adresse IP locale, le navigateur peut bloquer l’accès caméra. Dans ce cas, utilisez la future application Android DSK Camera ou un accès HTTPS fiable.</p>
</main>
<script>
const camera=document.getElementById('camera'),tokenInput=document.getElementById('token'),facing=document.getElementById('facing');
const preview=document.getElementById('preview'),startButton=document.getElementById('start'),stopButton=document.getElementById('stop'),state=document.getElementById('state');
let stream=null,peer=null,socket=null,pendingCandidates=[];
function status(value){state.textContent=value;}
function cleanup(){if(peer){peer.close();peer=null;}if(socket){socket.close();socket=null;}if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}preview.srcObject=null;pendingCandidates=[];startButton.disabled=false;stopButton.disabled=true;}
async function start(){
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){status('ACCÈS CAMÉRA BLOQUÉ : ouvrez DSK Camera depuis une application native ou une adresse HTTPS fiable.');return;}
  const token=tokenInput.value.trim();if(token.length<16){status('Code d’association invalide : 16 caractères minimum.');return;}
  startButton.disabled=true;status('Demande d’autorisation caméra…');
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing.value},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}},audio:false});
    preview.srcObject=stream;await preview.play();
    const streamId='cam-'+camera.value;const scheme=location.protocol==='https:'?'wss:':'ws:';
    socket=new WebSocket(scheme+'//'+location.host+'/signal?role=sender&stream='+encodeURIComponent(streamId)+'&token='+encodeURIComponent(token));
    peer=new RTCPeerConnection({iceServers:[]});
    stream.getVideoTracks().forEach(track=>peer.addTrack(track,stream));
    peer.onicecandidate=e=>{if(e.candidate&&socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'candidate',candidate:e.candidate}));};
    peer.onconnectionstatechange=()=>status('CAM '+camera.value+' · '+peer.connectionState.toUpperCase());
    socket.onopen=()=>{socket.send(JSON.stringify({type:'register',role:'sender',stream:streamId}));status('CAM '+camera.value+' · EN ATTENTE DE LA TABLETTE DSK');stopButton.disabled=false;};
    socket.onmessage=async event=>{
      try{const message=JSON.parse(event.data);
        if(message.type==='receiver-ready'){const offer=await peer.createOffer();await peer.setLocalDescription(offer);socket.send(JSON.stringify({type:'offer',sdp:peer.localDescription}));}
        else if(message.type==='answer'&&message.sdp){await peer.setRemoteDescription(message.sdp);for(const candidate of pendingCandidates)await peer.addIceCandidate(candidate);pendingCandidates=[];}
        else if(message.type==='candidate'&&message.candidate){if(peer.remoteDescription)await peer.addIceCandidate(message.candidate);else pendingCandidates.push(message.candidate);}
        else if(message.type==='peer-left')status('Tablette DSK déconnectée. La caméra reste prête.');
        else if(message.type==='error')status(message.message||'Erreur de connexion.');
      }catch(error){status(error.message||'Erreur WebRTC.');}
    };
    socket.onerror=()=>status('Serveur de signalisation inaccessible. Vérifiez le réseau et le code.');
    socket.onclose=()=>{if(peer&&peer.connectionState!=='connected')status('Signalisation fermée.');};
  }catch(error){cleanup();status(error.name==='NotAllowedError'?'Autorisation caméra refusée.':error.message||'Impossible de démarrer la caméra.');}
}
startButton.addEventListener('click',()=>void start());stopButton.addEventListener('click',cleanup);
camera.addEventListener('change',()=>{if(stream)status('Arrêtez la caméra avant de changer de source.');});
</script></body></html>`;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/camera') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(cameraPage());
    return;
  }
  if (url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ service: 'DSK Audio Receiver', status: 'ready', port: PORT, streams: [...VALID_STREAMS] }));
    return;
  }
  const match = url.pathname.match(/^\/obs\/(pgm|iso-[1-8])$/);
  if (match && !isLoopback(request.socket.remoteAddress || '')) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('OBS receiver pages are available only on this PC.');
    return;
  }
  if (match) {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    });
    response.end(page(match[1]));
    return;
  }
  if (url.pathname === '/') {
    if (!isLoopback(request.socket.remoteAddress || '')) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Open this page on the OBS computer itself.');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end('<!doctype html><html lang="fr"><meta charset="utf-8"><title>DSK Media Receiver</title><body style="font:16px Arial;background:#0b1220;color:white;padding:32px"><h1>DSK Media Receiver</h1><p>Service de réception audio et signalisation vidéo prêt.</p><p>Émetteur caméra mobile : <a style="color:#7dd3fc" href="/camera">/camera</a> (nécessite HTTPS ou application native pour l’accès caméra).</p><h2>Code d’association DSK</h2><code style="display:block;padding:16px;background:#172033;word-break:break-all">' + receiverToken + '</code><p>Copiez ce code dans DSK Audio sur la tablette. Il reste enregistré localement dans receiver/.receiver-token.</p><p>Ajoutez ensuite les 9 sources Navigateur OBS : /obs/pgm et /obs/iso-1 à /obs/iso-8.</p><p>État : <a style="color:#7dd3fc" href="/health">/health</a></p></body></html>');
    return;
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname !== '/signal') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
});

wss.on('connection', (socket, request) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const role = url.searchParams.get('role');
  const streamId = url.searchParams.get('stream');
  const token = url.searchParams.get('token') || '';
  if (token !== receiverToken) {
    send(socket, { type: 'error', message: 'Code d’association incorrect.' });
    socket.close();
    return;
  }
  if (!['sender', 'receiver'].includes(role) || !VALID_STREAMS.has(streamId)) {
    send(socket, { type: 'error', message: 'Rôle ou flux invalide.' });
    socket.close();
    return;
  }

  let room = rooms.get(streamId);
  if (!room) {
    room = { sender: null, receiver: null };
    rooms.set(streamId, room);
  }
  if (room[role]) {
    send(socket, { type: 'error', message: `Un ${role} est déjà connecté pour ${streamId}.` });
    socket.close();
    return;
  }
  room[role] = socket;
  socket.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.type === 'register') return;
    if (!['offer', 'answer', 'candidate'].includes(message.type)) return;
    const target = role === 'sender' ? room.receiver : room.sender;
    send(target, message);
  });

  const other = role === 'sender' ? room.receiver : room.sender;
  if (other) {
    send(socket, { type: role === 'sender' ? 'receiver-ready' : 'sender-ready' });
    if (role === 'receiver') send(room.sender, { type: 'receiver-ready' });
    else send(room.receiver, { type: 'sender-ready' });
  }

  socket.on('close', () => {
    const current = rooms.get(streamId);
    if (!current || current[role] !== socket) return;
    current[role] = null;
    const counterpart = role === 'sender' ? current.receiver : current.sender;
    send(counterpart, { type: 'peer-left' });
    if (!current.sender && !current.receiver) rooms.delete(streamId);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`DSK Audio Receiver listening on http://${HOST}:${PORT}`);
});
