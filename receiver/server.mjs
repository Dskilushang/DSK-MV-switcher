import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const HOST = process.env.DSK_RECEIVER_HOST || '0.0.0.0';
const PORT = Number(process.env.DSK_RECEIVER_PORT || 8765);
const VALID_STREAMS = new Set(['pgm', ...Array.from({ length: 8 }, (_, index) => `iso-${index + 1}`)]);
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
const state = document.getElementById('state');
const audio = document.getElementById('audio');
let peer;
let socket;
let pendingCandidates = [];
function setState(value){state.textContent='DSK AUDIO · '+streamId.toUpperCase()+' · '+value;}
function start(){
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(scheme+'//'+location.host+'/signal?role=receiver&stream='+encodeURIComponent(streamId));
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

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ service: 'DSK Audio Receiver', status: 'ready', port: PORT, streams: [...VALID_STREAMS] }));
    return;
  }
  const match = url.pathname.match(/^\/obs\/(pgm|iso-[1-8])$/);
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
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html lang="fr"><meta charset="utf-8"><title>DSK Audio Receiver</title><body style="font:16px Arial;background:#0b1220;color:white;padding:32px"><h1>DSK Audio Receiver</h1><p>Service de réception audio prêt.</p><p>Dans OBS, ajoutez 9 sources Navigateur en utilisant les adresses /obs/pgm et /obs/iso-1 à /obs/iso-8.</p><p>État : <a style="color:#7dd3fc" href="/health">/health</a></p></body></html>');
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
