import { useEffect, useRef, useState } from 'react';

type CameraState = 'idle' | 'requesting' | 'signaling' | 'waiting' | 'connected' | 'error';

const CAMERA_IDS = [2, 3, 4, 5, 6, 7, 8];

function cleanHost(value: string): string {
  return value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

export default function App() {
  const [host, setHost] = useState(() => localStorage.getItem('dsk-camera-host') || '');
  const [port, setPort] = useState('8765');
  const [token, setToken] = useState('');
  const [cameraId, setCameraId] = useState(2);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [state, setState] = useState<CameraState>('idle');
  const [message, setMessage] = useState('Configurez le Receiver puis démarrez la caméra.');
  const [isTorchAvailable, setIsTorchAvailable] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const activeRef = useRef(false);

  const stop = (nextMessage = 'Caméra arrêtée.') => {
    activeRef.current = false;
    pendingCandidatesRef.current = [];
    if (socketRef.current) {
      socketRef.current.onopen = null;
      socketRef.current.onmessage = null;
      socketRef.current.onerror = null;
      socketRef.current.onclose = null;
      socketRef.current.close();
      socketRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.onicecandidate = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsTorchAvailable(false);
    setTorchEnabled(false);
    setState('idle');
    setMessage(nextMessage);
  };

  useEffect(() => {
    const handlePageHide = () => stop('Application mise en arrière-plan : caméra arrêtée.');
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      stop('Application fermée.');
    };
    // stop is intentionally stable for the component lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    stop('Initialisation de la caméra…');
    const receiverHost = cleanHost(host);
    const receiverPort = Number(port);
    const pairingCode = token.trim();

    if (!receiverHost || /[/?#]/.test(receiverHost)) {
      setState('error');
      setMessage('Adresse IP du PC Receiver invalide.');
      return;
    }
    if (!Number.isInteger(receiverPort) || receiverPort < 1 || receiverPort > 65535) {
      setState('error');
      setMessage('Le port doit être compris entre 1 et 65535.');
      return;
    }
    if (pairingCode.length < 16) {
      setState('error');
      setMessage('Le code d’association doit contenir au moins 16 caractères.');
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setState('error');
      setMessage('Accès caméra indisponible. Utilisez l’application DSK Camera installée, pas une page HTTP locale.');
      return;
    }

    localStorage.setItem('dsk-camera-host', receiverHost);
    activeRef.current = true;
    setState('requesting');
    setMessage('Demande d’autorisation caméra Android…');

    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 }
        }
      });
      if (!activeRef.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = media;
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        await videoRef.current.play();
      }

      const videoTrack = media.getVideoTracks()[0];
      const capabilities = videoTrack?.getCapabilities?.();
      setIsTorchAvailable(Boolean(capabilities && 'torch' in capabilities));

      setState('signaling');
      setMessage(`Connexion au DSK Receiver · CAM ${cameraId}`);
      const socket = new WebSocket(
        `ws://${receiverHost}:${receiverPort}/signal?role=sender&stream=cam-${cameraId}&token=${encodeURIComponent(pairingCode)}`
      );
      const peer = new RTCPeerConnection({ iceServers: [] });
      socketRef.current = socket;
      peerRef.current = peer;
      media.getVideoTracks().forEach((track) => peer.addTrack(track, media));

      peer.onicecandidate = (event) => {
        if (event.candidate && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
        }
      };
      peer.onconnectionstatechange = () => {
        if (!activeRef.current) return;
        if (peer.connectionState === 'connected') {
          setState('connected');
          setMessage(`CAM ${cameraId} · VIDÉO TRANSMISE`);
        } else if (peer.connectionState === 'failed') {
          setState('error');
          setMessage('Connexion vidéo impossible. Vérifiez le Wi-Fi, le pare-feu et le Receiver.');
        } else if (peer.connectionState === 'disconnected') {
          setState('waiting');
          setMessage('Liaison vidéo interrompue. En attente du réseau…');
        }
      };

      socket.onopen = () => {
        if (!activeRef.current) return;
        socket.send(JSON.stringify({ type: 'register', role: 'sender', stream: `cam-${cameraId}` }));
        setState('waiting');
        setMessage(`CAM ${cameraId} prête · en attente de la tablette DSK.`);
      };
      socket.onmessage = async (event) => {
        try {
          const packet = JSON.parse(String(event.data)) as {
            type: string;
            sdp?: RTCSessionDescriptionInit;
            candidate?: RTCIceCandidateInit;
            message?: string;
          };
          if (packet.type === 'receiver-ready') {
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            socket.send(JSON.stringify({ type: 'offer', sdp: peer.localDescription }));
          } else if (packet.type === 'answer' && packet.sdp) {
            await peer.setRemoteDescription(packet.sdp);
            for (const candidate of pendingCandidatesRef.current) {
              await peer.addIceCandidate(candidate);
            }
            pendingCandidatesRef.current = [];
          } else if (packet.type === 'candidate' && packet.candidate) {
            if (peer.remoteDescription) await peer.addIceCandidate(packet.candidate);
            else pendingCandidatesRef.current.push(packet.candidate);
          } else if (packet.type === 'peer-left') {
            setState('waiting');
            setMessage('Tablette DSK déconnectée. Caméra prête pour une nouvelle connexion.');
          } else if (packet.type === 'error') {
            setState('error');
            setMessage(packet.message || 'Le Receiver a refusé la connexion.');
          }
        } catch (error) {
          setState('error');
          setMessage(error instanceof Error ? error.message : 'Erreur de négociation WebRTC.');
        }
      };
      socket.onerror = () => {
        if (activeRef.current) {
          setState('error');
          setMessage('Serveur inaccessible. Vérifiez l’adresse IP, le port 8765 et le pare-feu du PC.');
        }
      };
      socket.onclose = () => {
        if (activeRef.current && peer.connectionState !== 'connected') {
          setState('waiting');
          setMessage('Signalisation fermée. Vérifiez le Receiver.');
        }
      };
    } catch (error) {
      stop(error instanceof Error ? error.message : 'Impossible de démarrer la caméra.');
      setState('error');
    }
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0] as (MediaStreamTrack & {
      applyConstraints?: (constraints: MediaTrackConstraints) => Promise<void>;
    }) | undefined;
    if (!track || !isTorchAvailable) return;
    try {
      const next = !torchEnabled;
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchEnabled(next);
    } catch {
      setMessage('Le flash n’est pas pris en charge par cette caméra.');
    }
  };

  const changeCamera = async (nextFacing: 'environment' | 'user') => {
    setFacing(nextFacing);
    if (activeRef.current) {
      stop('Caméra arrêtée. Appuyez sur DÉMARRER pour appliquer le nouvel objectif.');
    }
  };

  const isActive = state === 'requesting' || state === 'signaling' || state === 'waiting' || state === 'connected';

  return (
    <main className="camera-app">
      <header className="topbar">
        <div className="brand-mark">DSK</div>
        <div className="brand-copy">
          <strong>DSK CAMERA</strong>
          <span>WIRELESS VIDEO SOURCE</span>
        </div>
        <div className={`status-pill status-${state}`}><i />{state.toUpperCase()}</div>
      </header>

      <section className="preview-shell">
        <video ref={videoRef} autoPlay muted playsInline />
        {!isActive && <div className="preview-placeholder"><b>DSK CAMERA</b><span>Aperçu vidéo en attente</span></div>}
        <div className="preview-tag">CAM {cameraId}</div>
        {isTorchAvailable && <button className="torch-button" onClick={toggleTorch}>{torchEnabled ? 'FLASH ON' : 'FLASH OFF'}</button>}
      </section>

      <section className="controls">
        <div className="field-row">
          <label>CAMÉRA SOURCE
            <select value={cameraId} onChange={(event) => setCameraId(Number(event.target.value))} disabled={isActive}>
              {CAMERA_IDS.map((id) => <option key={id} value={id}>CAM {id}</option>)}
            </select>
          </label>
          <label>OBJECTIF
            <select value={facing} onChange={(event) => void changeCamera(event.target.value as 'environment' | 'user')} disabled={isActive}>
              <option value="environment">Arrière</option>
              <option value="user">Avant</option>
            </select>
          </label>
        </div>

        <label>ADRESSE IP DU PC RECEIVER
          <input value={host} onChange={(event) => setHost(event.target.value)} placeholder="192.168.1.100" autoCapitalize="none" autoCorrect="off" disabled={isActive} />
        </label>
        <div className="field-row">
          <label>PORT
            <input value={port} onChange={(event) => setPort(event.target.value)} inputMode="numeric" disabled={isActive} />
          </label>
          <label>CODE D’ASSOCIATION
            <input value={token} onChange={(event) => setToken(event.target.value)} type="password" autoComplete="off" placeholder="Code du Receiver" disabled={isActive} />
          </label>
        </div>

        <div className="action-row">
          {!isActive ? (
            <button className="primary-button" onClick={() => void start()}>DÉMARRER CAM {cameraId}</button>
          ) : (
            <button className="stop-button" onClick={() => stop()}>ARRÊTER LA TRANSMISSION</button>
          )}
        </div>
        <div className="connection-message"><span className={`connection-dot dot-${state}`} />{message}</div>
        <p className="footnote">Vidéo uniquement · 720p / 30 i/s cible · réseau Wi-Fi local. La qualité réelle dépend du téléphone, du réseau et du navigateur Android.</p>
      </section>
    </main>
  );
}
