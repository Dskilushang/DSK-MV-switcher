import type { IsoTapPoint } from './AudioEngine';

export type AudioTransportStream = {
  id: string;
  stream: MediaStream;
};

export type AudioTransportStatus =
  | { state: 'connecting'; streamId: string }
  | { state: 'connected'; streamId: string }
  | { state: 'disconnected'; streamId: string }
  | { state: 'error'; streamId: string; message: string };

type PeerSession = {
  socket: WebSocket;
  peer: RTCPeerConnection;
  streamId: string;
};

const STREAM_IDS = ['pgm', ...Array.from({ length: 8 }, (_, index) => `iso-${index + 1}`)] as const;

export function createAudioTransportStreams(
  program: MediaStream,
  getIsoStream: (channelId: number, tapPoint: IsoTapPoint) => MediaStream,
  tapPoint: IsoTapPoint = 'post-fader'
): AudioTransportStream[] {
  return [
    { id: 'pgm', stream: program },
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `iso-${index + 1}`,
      stream: getIsoStream(index + 1, tapPoint)
    }))
  ];
}

/**
 * Sends PGM stereo and eight independent ISO streams to the DSK Audio Receiver.
 * Each stream has its own WebRTC peer connection so OBS can ingest it separately.
 */
export class AudioLanTransport {
  private sessions = new Map<string, PeerSession>();
  private stopped = false;
  private readonly onStatus: (status: AudioTransportStatus) => void;

  constructor(onStatus: (status: AudioTransportStatus) => void) {
    this.onStatus = onStatus;
  }

  async connect(host: string, port: number, streams: AudioTransportStream[]): Promise<void> {
    await this.disconnect();
    this.stopped = false;

    const cleanHost = host.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    if (!cleanHost || /[/?#]/.test(cleanHost)) {
      throw new Error('Saisissez une adresse IP ou un nom d’hôte du PC Receiver, sans chemin.');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Le port du Receiver doit être compris entre 1 et 65535.');
    }

    const streamMap = new Map(streams.map((item) => [item.id, item.stream]));
    const missing = STREAM_IDS.filter((id) => !streamMap.has(id));
    if (missing.length) throw new Error(`Flux audio manquants : ${missing.join(', ')}.`);

    for (const streamId of STREAM_IDS) {
      const mediaStream = streamMap.get(streamId)!;
      if (mediaStream.getAudioTracks().length !== 1) {
        await this.disconnect();
        throw new Error(`Le flux ${streamId.toUpperCase()} doit exposer exactement une piste audio.`);
      }

      this.openSession(cleanHost, port, streamId, mediaStream);
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
      session.peer.onconnectionstatechange = null;
      session.peer.close();
      if (session.socket.readyState === WebSocket.OPEN || session.socket.readyState === WebSocket.CONNECTING) {
        session.socket.close();
      }
      this.onStatus({ state: 'disconnected', streamId: session.streamId });
    }
  }

  private openSession(host: string, port: number, streamId: string, mediaStream: MediaStream): void {
    const socket = new WebSocket(`ws://${host}:${port}/signal?role=sender&stream=${streamId}`);
    const peer = new RTCPeerConnection({ iceServers: [] });
    const session = { socket, peer, streamId };
    const pendingRemoteCandidates: RTCIceCandidateInit[] = [];
    this.sessions.set(streamId, session);
    this.onStatus({ state: 'connecting', streamId });

    for (const track of mediaStream.getAudioTracks()) {
      peer.addTrack(track, mediaStream);
    }

    peer.onicecandidate = (event) => {
      if (event.candidate && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
      }
    };

    peer.onconnectionstatechange = () => {
      if (this.stopped || this.sessions.get(streamId) !== session) return;
      if (peer.connectionState === 'connected') {
        this.onStatus({ state: 'connected', streamId });
      } else if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected' || peer.connectionState === 'closed') {
        this.onStatus({
          state: peer.connectionState === 'failed' ? 'error' : 'disconnected',
          streamId,
          ...(peer.connectionState === 'failed' ? { message: 'Connexion WebRTC interrompue. Vérifiez le réseau local.' } : {})
        } as AudioTransportStatus);
      }
    };

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'register', role: 'sender', stream: streamId }));
    };

    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(String(event.data)) as {
          type: string;
          sdp?: RTCSessionDescriptionInit;
          candidate?: RTCIceCandidateInit;
          message?: string;
        };

        if (message.type === 'receiver-ready') {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          socket.send(JSON.stringify({ type: 'offer', sdp: peer.localDescription }));
        } else if (message.type === 'answer' && message.sdp) {
          await peer.setRemoteDescription(message.sdp);
          for (const candidate of pendingRemoteCandidates) await peer.addIceCandidate(candidate);
          pendingRemoteCandidates.length = 0;
        } else if (message.type === 'candidate' && message.candidate) {
          if (peer.remoteDescription) await peer.addIceCandidate(message.candidate);
          else pendingRemoteCandidates.push(message.candidate);
        } else if (message.type === 'peer-left') {
          this.onStatus({ state: 'disconnected', streamId });
        } else if (message.type === 'error') {
          this.onStatus({ state: 'error', streamId, message: message.message || 'Erreur du Receiver.' });
        }
      } catch (error) {
        this.onStatus({
          state: 'error',
          streamId,
          message: error instanceof Error ? error.message : 'Erreur de négociation WebRTC.'
        });
      }
    };

    socket.onerror = () => {
      if (!this.stopped) this.onStatus({
        state: 'error',
        streamId,
        message: 'Impossible de joindre le Receiver. Vérifiez son adresse, le port et le pare-feu du PC.'
      });
    };

    socket.onclose = () => {
      if (!this.stopped && this.sessions.get(streamId) === session) {
        this.onStatus({ state: 'disconnected', streamId });
      }
    };
  }
}
