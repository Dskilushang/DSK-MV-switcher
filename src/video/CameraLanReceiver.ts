export type CameraReceiverStatus = {
  cameraId: number;
  state: 'waiting' | 'connecting' | 'connected' | 'disconnected' | 'error';
  message?: string;
};

type CameraSession = {
  socket: WebSocket;
  peer: RTCPeerConnection;
  cameraId: number;
};

const CAMERA_IDS = [2, 3, 4, 5, 6, 7, 8] as const;

/**
 * Receives seven independent video-only WebRTC sources from DSK Camera devices.
 * The signaling server only exchanges SDP/ICE; video travels peer-to-peer on the LAN.
 */
export class CameraLanReceiver {
  private sessions = new Map<number, CameraSession>();
  private stopped = false;
  private readonly onStatus: (status: CameraReceiverStatus) => void;
  private readonly onStream: (cameraId: number, stream: MediaStream | null) => void;

  constructor(
    onStatus: (status: CameraReceiverStatus) => void,
    onStream: (cameraId: number, stream: MediaStream | null) => void
  ) {
    this.onStatus = onStatus;
    this.onStream = onStream;
  }

  connect(host: string, port: number, token: string): void {
    void this.disconnect();
    this.stopped = false;

    const cleanHost = host.trim().replace(/^https?:\\/\\//i, '').replace(/\\/+$/, '');
    if (!cleanHost || /[/?#]/.test(cleanHost)) {
      throw new Error('Saisissez l’adresse IP du PC Receiver sans chemin.');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Le port vidéo doit être compris entre 1 et 65535.');
    }
    if (token.trim().length < 16) {
      throw new Error('Le code d’association doit contenir au moins 16 caractères.');
    }

    for (const cameraId of CAMERA_IDS) {
      this.openSession(cleanHost, port, token.trim(), cameraId);
    }
  }

  async disconnect(): Promise<void> {
    this.stopped = true;
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    for (const session of sessions) {
      session.socket.onclose = null;
      session.socket.onerror = null;
      session.socket.onmessage = null;
      session.peer.onicecandidate = null;
      session.peer.ontrack = null;
      session.peer.onconnectionstatechange = null;
      session.peer.close();
      if (session.socket.readyState === WebSocket.OPEN || session.socket.readyState === WebSocket.CONNECTING) {
        session.socket.close();
      }
      this.onStream(session.cameraId, null);
      this.onStatus({ cameraId: session.cameraId, state: 'disconnected' });
    }
  }

  private openSession(host: string, port: number, token: string, cameraId: number): void {
    const streamId = `cam-${cameraId}`;
    const socket = new WebSocket(
      `ws://${host}:${port}/signal?role=receiver&stream=${streamId}&token=${encodeURIComponent(token)}`
    );
    const peer = new RTCPeerConnection({ iceServers: [] });
    const session = { socket, peer, cameraId };
    const pendingCandidates: RTCIceCandidateInit[] = [];
    this.sessions.set(cameraId, session);
    peer.addTransceiver('video', { direction: 'recvonly' });
    this.onStatus({ cameraId, state: 'connecting' });

    peer.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      this.onStream(cameraId, stream);
    };
    peer.onicecandidate = (event) => {
      if (event.candidate && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
      }
    };
    peer.onconnectionstatechange = () => {
      if (this.stopped || this.sessions.get(cameraId) !== session) return;
      if (peer.connectionState === 'connected') {
        this.onStatus({ cameraId, state: 'connected' });
      } else if (peer.connectionState === 'failed') {
        this.onStatus({
          cameraId,
          state: 'error',
          message: 'Connexion vidéo WebRTC impossible. Vérifiez le Wi-Fi et le pare-feu.'
        });
      } else if (peer.connectionState === 'disconnected' || peer.connectionState === 'closed') {
        this.onStream(cameraId, null);
        this.onStatus({ cameraId, state: 'disconnected' });
      }
    };

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'register', role: 'receiver', stream: streamId }));
      this.onStatus({ cameraId, state: 'waiting', message: 'En attente du téléphone caméra.' });
    };
    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(String(event.data)) as {
          type: string;
          sdp?: RTCSessionDescriptionInit;
          candidate?: RTCIceCandidateInit;
          message?: string;
        };
        if (message.type === 'sender-ready') {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          socket.send(JSON.stringify({ type: 'offer', sdp: peer.localDescription }));
        } else if (message.type === 'answer' && message.sdp) {
          await peer.setRemoteDescription(message.sdp);
          for (const candidate of pendingCandidates) await peer.addIceCandidate(candidate);
          pendingCandidates.length = 0;
        } else if (message.type === 'candidate' && message.candidate) {
          if (peer.remoteDescription) await peer.addIceCandidate(message.candidate);
          else pendingCandidates.push(message.candidate);
        } else if (message.type === 'peer-left') {
          this.onStream(cameraId, null);
          this.onStatus({ cameraId, state: 'disconnected' });
        } else if (message.type === 'error') {
          this.onStatus({ cameraId, state: 'error', message: message.message || 'Erreur du Receiver.' });
        }
      } catch (error) {
        this.onStatus({
          cameraId,
          state: 'error',
          message: error instanceof Error ? error.message : 'Erreur de négociation WebRTC.'
        });
      }
    };
    socket.onerror = () => {
      if (!this.stopped) this.onStatus({
        cameraId,
        state: 'error',
        message: 'Serveur vidéo inaccessible. Vérifiez IP, port et pare-feu du PC.'
      });
    };
    socket.onclose = () => {
      if (!this.stopped && this.sessions.get(cameraId) === session) {
        this.onStream(cameraId, null);
        this.onStatus({ cameraId, state: 'disconnected' });
      }
    };
  }
}
