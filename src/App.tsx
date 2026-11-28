import { useState, useRef, useEffect, useCallback, type ChangeEvent } from 'react';
import { Capacitor } from '@capacitor/core';
import { DskStreaming } from '@dsk-mv/native-streaming';
import { Settings, Radio, MonitorPlay, Zap, Move, X } from 'lucide-react';
import TBar from './TBar';
import DskPanel, { type DskLayer } from './DskPanel';
import AudioMixerPanel, { type MediaAudioRoute } from './AudioMixerPanel';
import SystemPanel from './SystemPanel';
import { CameraLanReceiver, type CameraReceiverStatus } from './video/CameraLanReceiver';
import { connectObs, disconnectObs, getSceneList, getObsStreamActive, registerCallbacks, setProgramScene, startObsStream, stopObsStream, type ObsStatus } from './services/obsService';
import { installDiagnosticListeners, recordDiagnostic } from './services/diagnostics';

export default function App() {
  useEffect(() => {
    const uninstall = installDiagnosticListeners();
    recordDiagnostic('info', 'app', 'Interface React montée');
    return () => {
      recordDiagnostic('info', 'app', 'Interface React démontée');
      uninstall();
    };
  }, []);
  // --- ÉTATS DU MÉLANGEUR ---
  const [programChannel, setProgramChannel] = useState(1);
  const [previewChannel, setPreviewChannel] = useState(2);
  const [isLive, setIsLive] = useState(false);
  const [isLiveBusy, setIsLiveBusy] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMessage, setRecordingMessage] = useState('');
  const [programAudioStream, setProgramAudioStream] = useState<MediaStream | null>(null);
  const [connectedAudioInputs, setConnectedAudioInputs] = useState(0);
  const [isMediaPanelOpen, setIsMediaPanelOpen] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaFileName, setMediaFileName] = useState('');
  const [mediaLoop, setMediaLoop] = useState(false);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [mediaCurrentTime, setMediaCurrentTime] = useState(0);
  const [isMediaPlaying, setIsMediaPlaying] = useState(false);
  const [mediaAudioChannel, setMediaAudioChannel] = useState(8);
  const [mediaAudioRoutedChannel, setMediaAudioRoutedChannel] = useState<number | null>(null);
  const [isMediaAudioRouteReady, setIsMediaAudioRouteReady] = useState(false);
  const [mediaAudioError, setMediaAudioError] = useState('');
  const mediaVideoRef = useRef<HTMLVideoElement>(null);
  const mediaFileInputRef = useRef<HTMLInputElement>(null);
  const mediaAudioRouteRef = useRef<MediaAudioRoute | null>(null);

  const handleMediaAudioRouteReady = useCallback((route: MediaAudioRoute | null) => {
    mediaAudioRouteRef.current = route;
    setIsMediaAudioRouteReady(!!route);
    if (!route) setMediaAudioRoutedChannel(null);
  }, []);

  const handleMediaFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const nextUrl = URL.createObjectURL(file);
    setMediaUrl(nextUrl);
    setMediaFileName(file.name);
    setMediaCurrentTime(0);
    setMediaDuration(0);
    setIsMediaPlaying(false);
    setMediaAudioError('');
    event.target.value = '';
  };

  const removeMediaFile = () => {
    const video = mediaVideoRef.current;
    video?.pause();
    if (video) video.currentTime = 0;
    if (mediaAudioRoutedChannel !== null) {
      mediaAudioRouteRef.current?.disconnect(mediaAudioRoutedChannel);
      setMediaAudioRoutedChannel(null);
    }
    setMediaUrl(null);
    setMediaFileName('');
    setMediaCurrentTime(0);
    setMediaDuration(0);
    setIsMediaPlaying(false);
  };

  const routeMediaAudio = () => {
    const video = mediaVideoRef.current;
    const route = mediaAudioRouteRef.current;
    if (!video || !mediaUrl) {
      setMediaAudioError('Chargez d’abord un fichier vidéo.');
      return;
    }
    if (!route) {
      setMediaAudioError('Activez d’abord le moteur dans le mixeur AUDIO.');
      return;
    }
    try {
      if (mediaAudioRoutedChannel !== null && mediaAudioRoutedChannel !== mediaAudioChannel) {
        route.disconnect(mediaAudioRoutedChannel);
        setMediaAudioRoutedChannel(null);
      }
      route.connect(mediaAudioChannel, video);
      setMediaAudioRoutedChannel(mediaAudioChannel);
      setMediaAudioError(`Audio MEDIA routé vers CH ${mediaAudioChannel}.`);
    } catch (error) {
      setMediaAudioError(error instanceof Error ? error.message : 'Routage audio MEDIA impossible.');
    }
  };

  useEffect(() => {
    return () => {
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    };
  }, [mediaUrl]);
  
  // --- EFFETS ---
  const [isChromaActive, setIsChromaActive] = useState(false);
  const [isChromaPanelOpen, setIsChromaPanelOpen] = useState(false);
  const [chromaKeyColor, setChromaKeyColor] = useState<'green' | 'blue'>('green');
  const [chromaThreshold, setChromaThreshold] = useState(35);
  const [isPipActive, setIsPipActive] = useState(false);
  const [isPipPanelOpen, setIsPipPanelOpen] = useState(false);
  const [pipSourceChannel, setPipSourceChannel] = useState(2);
  const [pipScale, setPipScale] = useState(0.28);
  const [pipPosition, setPipPosition] = useState<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('bottom-right');
  const [isLogoActive, setIsLogoActive] = useState(false); // Contrôle l'affichage du logo
  const [isDskPanelOpen, setIsDskPanelOpen] = useState(false);
  const [isAudioPanelOpen, setIsAudioPanelOpen] = useState(false);
  const [dskLayers, setDskLayers] = useState<DskLayer[]>([
    { id: 1, name: 'LOGO', type: 'image', content: '', enabled: false, x: 82, y: 8, opacity: 1, fontSize: 32 },
    { id: 2, name: 'BANDEAU', type: 'text', content: '', enabled: false, x: 5, y: 82, opacity: 1, fontSize: 28 },
    { id: 3, name: 'TEXTE', type: 'text', content: '', enabled: false, x: 5, y: 8, opacity: 1, fontSize: 28 },
    { id: 4, name: 'GRAPHIQUE', type: 'image', content: '', enabled: false, x: 65, y: 68, opacity: 1, fontSize: 24 }
  ]);
  const dskImageCacheRef = useRef<Record<number, { src: string; image: HTMLImageElement }>>({});
  const logoImageCacheRef = useRef<{ src: string; image: HTMLImageElement } | null>(null);
  const [isFrozen, setIsFrozen] = useState(false);

  // --- JOYSTICK & T-BAR ---
  const [transitionSpeed, setTransitionSpeed] = useState(1000);
  const [programZoom, setProgramZoom] = useState(1);
  const tBarProgressRef = useRef(0);
  const [isAutoTransitioning, setIsAutoTransitioning] = useState(false);
  const autoTransitionFrameRef = useRef<number | null>(null);
  const [logoPos, setLogoPos] = useState({ x: 50, y: 10 });
  // 'zoom' ou 'logo'. Contrôle le mode du joystick
  const [joystickMode, setJoystickMode] = useState<'zoom' | 'logo'>('zoom'); 
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const joystickRef = useRef<HTMLDivElement>(null);

  // --- CAMÉRAS & AUDIO ---
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'requesting' | 'active' | 'error'>('idle');
  const [cameraError, setCameraError] = useState('');
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [remoteCameraStreams, setRemoteCameraStreams] = useState<Record<number, MediaStream | null>>({});
  const remoteVideoRefs = useRef<{ [key: number]: HTMLVideoElement | null }>({});
  const cameraReceiverRef = useRef<CameraLanReceiver | null>(null);
  const [cameraReceiverHost, setCameraReceiverHost] = useState('');
  const [cameraReceiverPort, setCameraReceiverPort] = useState('8765');
  const [cameraReceiverToken, setCameraReceiverToken] = useState('');
  const [cameraReceiverStatuses, setCameraReceiverStatuses] = useState<Record<number, CameraReceiverStatus['state']>>({});
  const [cameraReceiverMessage, setCameraReceiverMessage] = useState('Non connecté');


  // --- LOGO & RÉGLAGES ---
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSystemPanelOpen, setIsSystemPanelOpen] = useState(false);
  const [obsHost, setObsHost] = useState('192.168.1.100');
  const [obsPort, setObsPort] = useState('4455');
  const [obsPassword, setObsPassword] = useState('');
  const [obsStatus, setObsStatus] = useState<ObsStatus>('disconnected');
  const [obsMessage, setObsMessage] = useState('Non connecté');
  const [obsCurrentScene, setObsCurrentScene] = useState('');
  const [obsScenes, setObsScenes] = useState<string[]>([]);
  const [isLoadingObsScenes, setIsLoadingObsScenes] = useState(false);
  const [obsActionMessage, setObsActionMessage] = useState('');

  // --- DIAGNOSTIC ENCODEUR VIDÉO NATIF ANDROID ---
  const [isH264ProbeRunning, setIsH264ProbeRunning] = useState(false);
  const [h264ProbeMessage, setH264ProbeMessage] = useState('');
  const [h264ProbeResult, setH264ProbeResult] = useState<{
    supported: boolean;
    codecName: string | null;
    hardwareAccelerated: boolean;
    width: number;
    height: number;
    frameRate: number;
    inputSurfaceCreated: boolean;
    encodedFrameCount: number;
    encodedBytes: number;
    outputMimeType: string | null;
    detail: string | null;
  } | null>(null);

  const runH264EncoderProbe = async () => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      setH264ProbeMessage('Ce diagnostic est disponible uniquement dans l’application Android.');
      return;
    }
    setIsH264ProbeRunning(true);
    setH264ProbeMessage('Test d’encodage H.264 réel en cours…');
    setH264ProbeResult(null);
    try {
      const result = await DskStreaming.probeH264SurfaceEncoder({
        width: 1280,
        height: 720,
        frameRate: 30,
        bitRate: 4_000_000
      });
      setH264ProbeResult(result);
      setH264ProbeMessage(result.supported
        ? 'Test d’encodage H.264 terminé.'
        : 'L’encodage H.264 réel n’a pas abouti.');
    } catch (error) {
      setH264ProbeMessage(error instanceof Error ? error.message : 'Diagnostic H.264 impossible.');
    } finally {
      setIsH264ProbeRunning(false);
    }
  };

  // --- CANVAS & LIVE ---
  const [streamKey, setStreamKey] = useState('');
  const [streamUrl, setStreamUrl] = useState('rtmp://a.rtmp.youtube.com/live2');
  const programCanvasRef = useRef<HTMLCanvasElement>(null);
  const programPreviewVideoRef = useRef<HTMLVideoElement>(null);
  const programMonitorRef = useRef<HTMLVideoElement>(null);
  const previewMonitorRef = useRef<HTMLVideoElement>(null);
  const [isProgramViewOpen, setIsProgramViewOpen] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingVideoStreamRef = useRef<MediaStream | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const nativeRecordingRef = useRef(false);
  const recordingWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const recordingErrorRef = useRef<string | null>(null);
  const chromaCanvasRef = useRef<HTMLCanvasElement>(null);
  const chromaAnimationRef = useRef<number | null>(null);

  // --- CONNEXION OBS ---
  useEffect(() => {
    registerCallbacks(
      (status, message) => {
        setObsStatus(status);
        if (message) setObsMessage(message);
        else if (status === 'connecting') setObsMessage('Connexion à OBS…');
        if (status === 'disconnected') {
          setIsLive(false);
          setLiveMessage('Connexion OBS fermée.');
        }
      },
      (sceneName) => setObsCurrentScene(sceneName),
      (active) => {
        setIsLive(active);
        setLiveMessage(active ? 'Diffusion OBS active.' : 'Diffusion OBS arrêtée.');
      }
    );
    return () => { void disconnectObs(); };
  }, []);

  const refreshObsScenes = async () => {
    setIsLoadingObsScenes(true);
    setObsActionMessage('');
    try {
      const scenes = await getSceneList();
      setObsScenes(scenes);
      setObsActionMessage(`${scenes.length} scène(s) récupérée(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de récupérer les scènes.';
      setObsActionMessage(message);
    } finally {
      setIsLoadingObsScenes(false);
    }
  };

  const handleObsSceneSelect = async (sceneName: string) => {
    try {
      await setProgramScene(sceneName);
      setObsCurrentScene(sceneName);
      setObsActionMessage(`Scène active : ${sceneName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de changer de scène.';
      setObsActionMessage(message);
    }
  };

  const handleObsConnect = async () => {
    const connected = await connectObs({
      host: obsHost,
      port: Number(obsPort),
      password: obsPassword
    });
    if (connected) {
      await refreshObsScenes();
      try {
        setIsLive(await getObsStreamActive());
      } catch {
        setIsLive(false);
      }
    } else {
      setObsCurrentScene('');
      setObsScenes([]);
    }
  };

  // --- CAMÉRA LOCALE ---
  const startCamera = async () => {
    if (cameraStatus === 'requesting' || cameraStream) return;
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('error');
      setCameraError("L'accès caméra n'est pas disponible dans ce contexte Android.");
      return;
    }

    setCameraStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      setCameraStream(stream);
      stream.getVideoTracks().forEach((track) => {
        recordDiagnostic('info', 'camera', 'Piste caméra activée', { label: track.label, readyState: track.readyState, settings: track.getSettings() });
        track.addEventListener('ended', () => {
          recordDiagnostic('error', 'camera', 'Piste caméra terminée', {
            id: track.id, label: track.label, readyState: track.readyState,
            visibilityState: document.visibilityState, appHadLive: isLive, appHadRecording: isRecording,
            remainingVideoTracks: stream.getVideoTracks().map((item) => ({ id: item.id, readyState: item.readyState, muted: item.muted, enabled: item.enabled }))
          });
          setCameraStatus('error');
          setCameraError('La caméra a interrompu son flux. Appuyez sur Réessayer.');
        });
        track.addEventListener('mute', () => recordDiagnostic('warning', 'camera', 'Piste caméra mise en pause par le système', {
          id: track.id, label: track.label, visibilityState: document.visibilityState, appHadLive: isLive, appHadRecording: isRecording
        }));
        track.addEventListener('unmute', () => recordDiagnostic('info', 'camera', 'Piste caméra réactivée', {
          id: track.id, label: track.label, visibilityState: document.visibilityState
        }));
      });
      setCameraStatus('active');
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Échec de l'activation de la caméra.");
      const messages: Record<string, string> = {
        NotAllowedError: "Accès caméra refusé par Android. Vérifiez l'autorisation Caméra de l'application.",
        NotFoundError: "Aucune caméra compatible n'a été détectée sur cet appareil.",
        NotReadableError: "La caméra est déjà utilisée par une autre application ou n'est pas accessible.",
        OverconstrainedError: "La caméra arrière demandée n'est pas disponible."
      };
      setCameraStatus('error');
      recordDiagnostic('error', 'camera', 'Échec activation caméra', { name: error.name, message: error.message, stack: error.stack });
      setCameraError(messages[error.name] || error.message || "Impossible d'activer la caméra.");
    }
  };

  const stopCamera = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setCameraStatus('idle');
    setCameraError('');
    recordDiagnostic('info', 'camera', 'Caméra locale désactivée manuellement');
  };

  useEffect(() => {
    if (!cameraStream || !localVideoRef.current) return;
    const video = localVideoRef.current;
    video.srcObject = cameraStream;
    void video.play().catch(() => {
      setCameraError("Le flux caméra est actif, mais la lecture vidéo a échoué.");
      setCameraStatus('error');
    });
    return () => { video.srcObject = null; };
  }, [cameraStream]);

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach(track => track.stop());
    };
  }, [cameraStream]);

  // --- RÉCEPTION DES CAMÉRAS DISTANTES ---
  const createCameraReceiver = () => new CameraLanReceiver(
    (status) => {
      setCameraReceiverStatuses((current) => ({ ...current, [status.cameraId]: status.state }));
      if (status.state === 'error') setCameraReceiverMessage(`CAM ${status.cameraId} : ${status.message || 'Erreur vidéo.'}`);
    },
    (cameraId, stream) => setRemoteCameraStreams((current) => ({ ...current, [cameraId]: stream }))
  );

  const connectRemoteCamera = (cameraId: number) => {
    try {
      if (!cameraReceiverHost.trim() || cameraReceiverToken.trim().length < 16) {
        throw new Error('Renseignez l’adresse IP, le port et le code d’association dans les réglages vidéo.');
      }
      let receiver = cameraReceiverRef.current;
      if (!receiver) {
        receiver = createCameraReceiver();
        cameraReceiverRef.current = receiver;
      }
      receiver.connectCamera(cameraId, cameraReceiverHost, Number(cameraReceiverPort), cameraReceiverToken);
      setCameraReceiverMessage(`Connexion de CAM ${cameraId} demandée.`);
    } catch (error) {
      setCameraReceiverMessage(error instanceof Error ? error.message : 'Connexion vidéo impossible.');
    }
  };

  const connectRemoteCameras = () => {
    try {
      void cameraReceiverRef.current?.disconnect();
      const receiver = createCameraReceiver();
      cameraReceiverRef.current = receiver;
      receiver.connect(cameraReceiverHost, Number(cameraReceiverPort), cameraReceiverToken, [2, 3, 4]);
      setCameraReceiverStatuses({});
      setCameraReceiverMessage('Recherche des sources DSK Camera CAM 2 à CAM 4…');
    } catch (error) {
      setCameraReceiverMessage(error instanceof Error ? error.message : 'Connexion vidéo impossible.');
    }
  };

  const disconnectRemoteCamera = (cameraId: number) => {
    cameraReceiverRef.current?.disconnectCamera(cameraId);
    setCameraReceiverMessage(`CAM ${cameraId} déconnectée.`);
  };

  const disconnectRemoteCameras = () => {
    void cameraReceiverRef.current?.disconnect();
    cameraReceiverRef.current = null;
    Object.values(remoteVideoRefs.current).forEach((video) => { if (video) video.srcObject = null; });
    setRemoteCameraStreams({});
    setCameraReceiverStatuses({});
    setCameraReceiverMessage('Réception vidéo arrêtée.');
  };

  useEffect(() => {
    return () => { void cameraReceiverRef.current?.disconnect(); };
  }, []);

  useEffect(() => {
    Object.entries(remoteCameraStreams).forEach(([cameraId, stream]) => {
      const video = remoteVideoRefs.current[Number(cameraId)];
      if (video && video.srcObject !== stream) {
        video.srcObject = stream;
        if (stream) void video.play().catch(() => undefined);
      }
    });
  }, [remoteCameraStreams]);

  // --- CHROMA KEY · SOURCE PGM ---
  useEffect(() => {
    if (chromaAnimationRef.current !== null) {
      cancelAnimationFrame(chromaAnimationRef.current);
      chromaAnimationRef.current = null;
    }
    if (!isChromaActive || !chromaCanvasRef.current) return;

    const video = programChannel === 9
      ? mediaVideoRef.current
      : programChannel === 1
        ? localVideoRef.current
        : remoteVideoRefs.current[programChannel];
    const canvas = chromaCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!video || !ctx) {
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let cancelled = false;
    let lastProcessedAt = 0;
    const processFrame = (timestamp: number) => {
      if (cancelled) return;
      if (timestamp - lastProcessedAt >= 33 && video.readyState >= 2 && video.videoWidth > 0) {
        lastProcessedAt = timestamp;
        const scale = Math.min(1, 640 / video.videoWidth);
        const width = Math.max(1, Math.round(video.videoWidth * scale));
        const height = Math.max(1, Math.round(video.videoHeight * scale));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        ctx.drawImage(video, 0, 0, width, height);
        const frame = ctx.getImageData(0, 0, width, height);
        for (let i = 0; i < frame.data.length; i += 4) {
          const red = frame.data[i];
          const green = frame.data[i + 1];
          const blue = frame.data[i + 2];
          const dominance = chromaKeyColor === 'green'
            ? green - Math.max(red, blue)
            : blue - Math.max(red, green);
          const keyChannel = chromaKeyColor === 'green' ? green : blue;
          if (keyChannel > 70 && dominance > chromaThreshold) {
            const transparency = Math.min(1, (dominance - chromaThreshold) / 24);
            frame.data[i + 3] = Math.round(frame.data[i + 3] * (1 - transparency));
          }
        }
        ctx.putImageData(frame, 0, 0);
      }
      chromaAnimationRef.current = requestAnimationFrame(processFrame);
    };

    chromaAnimationRef.current = requestAnimationFrame(processFrame);
    return () => {
      cancelled = true;
      if (chromaAnimationRef.current !== null) {
        cancelAnimationFrame(chromaAnimationRef.current);
        chromaAnimationRef.current = null;
      }
    };
  }, [isChromaActive, programChannel, cameraStream, remoteCameraStreams, mediaUrl, chromaKeyColor, chromaThreshold]);

  // --- MOTEUR DU CANVAS (GÈRE LE FREEZE, LE FONDU ET LE LOGO) ---
  useEffect(() => {
    let frameId: number | null = null;
    let timerId: number | null = null;
    const canvas = programCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Si on est en freeze, on arrête la boucle pour figer l'image.
    if (isFrozen) return;

    // Cadence fixe : évite d'exécuter une callback RAF à chaque rafraîchissement
    // écran (60/90/120 Hz) alors que le PGM ne doit être recomposé qu'à 30 FPS.
    const targetFrameInterval = 1000 / 30;
    const draw = () => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.save();
        const zoomWidth = canvas.width / programZoom;
        const zoomHeight = canvas.height / programZoom;
        const offsetX = (canvas.width - zoomWidth) / 2;
        const offsetY = (canvas.height - zoomHeight) / 2;
        ctx.translate(-offsetX, -offsetY);

        const drawSource = (ch: number, opacity: number) => {
          ctx.globalAlpha = opacity;
          const sourceVideo = ch === 9 ? mediaVideoRef.current : ch === 1 ? localVideoRef.current : remoteVideoRefs.current[ch];
          if (
            isChromaActive &&
            ch === programChannel &&
            chromaCanvasRef.current &&
            chromaCanvasRef.current.width > 0
          ) {
            ctx.drawImage(chromaCanvasRef.current, 0, 0, canvas.width, canvas.height);
          } else if (sourceVideo && sourceVideo.readyState >= 2) {
            ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
          }
          ctx.globalAlpha = 1.0;
        };

        if (tBarProgressRef.current > 0) {
          drawSource(programChannel, 1);
          drawSource(previewChannel, tBarProgressRef.current);
        } else {
          drawSource(programChannel, 1);
        }
        ctx.restore();

        // PIP : seconde source vidéo composée dans le programme.
        if (isPipActive && pipSourceChannel !== programChannel) {
          const pipVideo = pipSourceChannel === 9
            ? mediaVideoRef.current
            : pipSourceChannel === 1
              ? localVideoRef.current
              : remoteVideoRefs.current[pipSourceChannel];
          if (pipVideo && pipVideo.readyState >= 2 && pipVideo.videoWidth > 0) {
            const aspect = pipVideo.videoWidth / pipVideo.videoHeight;
            let pipWidth = canvas.width * pipScale;
            let pipHeight = pipWidth / aspect;
            const maxHeight = canvas.height * 0.42;
            if (pipHeight > maxHeight) {
              pipHeight = maxHeight;
              pipWidth = pipHeight * aspect;
            }
            const margin = Math.round(canvas.width * 0.025);
            const x = pipPosition.endsWith('right') ? canvas.width - pipWidth - margin : margin;
            const y = pipPosition.startsWith('bottom') ? canvas.height - pipHeight - margin : margin;
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.65)';
            ctx.shadowBlur = 18;
            ctx.fillStyle = '#020617';
            ctx.fillRect(x - 5, y - 5, pipWidth + 10, pipHeight + 10);
            ctx.shadowBlur = 0;
            ctx.drawImage(pipVideo, x, y, pipWidth, pipHeight);
            ctx.strokeStyle = '#f8fafc';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, pipWidth, pipHeight);
            ctx.restore();
          }
        }

        if (isLogoActive && customLogo) {
          // Reuse the same image object across frames instead of allocating a new
          // HTMLImageElement on every animation frame.
          let logoCache = logoImageCacheRef.current;
          if (!logoCache || logoCache.src !== customLogo) {
            const image = new Image();
            image.src = customLogo;
            logoCache = { src: customLogo, image };
            logoImageCacheRef.current = logoCache;
          }
          const logoImg = logoCache.image;
          if (logoImg.complete && logoImg.naturalWidth > 0) {
            const lWidth = 120;
            const lHeight = (logoImg.height / logoImg.width) * lWidth;
            const posX = (logoPos.x / 100) * canvas.width;
            const posY = (logoPos.y / 100) * canvas.height;
            ctx.drawImage(logoImg, posX, posY, lWidth, lHeight);
          }
        }

        // DSK: four independent downstream graphic layers, composited over the program.
        dskLayers.forEach((layer) => {
          if (!layer.enabled || !layer.content.trim()) return;
          const x = (layer.x / 100) * canvas.width;
          const y = (layer.y / 100) * canvas.height;
          ctx.save();
          ctx.globalAlpha = layer.opacity;
          if (layer.type === 'text') {
            ctx.font = `700 ${layer.fontSize}px Arial, sans-serif`;
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(0,0,0,0.85)';
            ctx.shadowBlur = 5;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            ctx.fillText(layer.content.slice(0, 120), x, y, canvas.width * 0.9);
          } else {
            let cached = dskImageCacheRef.current[layer.id];
            if (!cached || cached.src !== layer.content) {
              const image = new Image();
              image.src = layer.content;
              cached = { src: layer.content, image };
              dskImageCacheRef.current[layer.id] = cached;
            }
            const image = cached.image;
            if (image.complete && image.naturalWidth > 0) {
              const maxWidth = canvas.width * 0.28;
              const maxHeight = canvas.height * 0.24;
              const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
              const width = image.naturalWidth * scale;
              const height = image.naturalHeight * scale;
              ctx.drawImage(image, x, y, width, height);
            }
          }
          ctx.restore();
        });

      timerId = window.setTimeout(() => {
        frameId = requestAnimationFrame(draw);
      }, targetFrameInterval);
    };
    frameId = requestAnimationFrame(draw);
    return () => {
      if (timerId !== null) window.clearTimeout(timerId);
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [programChannel, previewChannel, remoteCameraStreams, mediaUrl, programZoom, isLogoActive, customLogo, logoPos, isFrozen, isChromaActive, isPipActive, pipSourceChannel, pipScale, pipPosition, dskLayers]);

  // --- MONITEURS PGM / PVW ---
  useEffect(() => {
    const canvas = programCanvasRef.current;
    const video = programMonitorRef.current;
    if (!canvas || !video) return;
    const stream = canvas.captureStream(30);
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
      stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const video = previewMonitorRef.current;
    if (!video) return;
    if (previewChannel === 9) {
      video.pause();
      video.srcObject = null;
      return;
    }
    const stream = previewChannel === 1 ? cameraStream : remoteCameraStreams[previewChannel] || null;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
    else video.pause();
  }, [previewChannel, cameraStream, remoteCameraStreams]);

  // --- PREVIEW DIRECT ---
  useEffect(() => {
    if (!isProgramViewOpen) return;

    const canvas = programCanvasRef.current;
    const video = programPreviewVideoRef.current;
    if (!canvas || !video) return;

    const stream = canvas.captureStream(30);
    video.srcObject = stream;
    void video.play().catch((error) => console.log(error));

    return () => {
      video.pause();
      video.srcObject = null;
      stream.getTracks().forEach((track) => track.stop());
    };
  }, [isProgramViewOpen]);

  // --- TRANSITIONS ---
  // CUT / fin de T-Bar : bascule immédiate PGM ↔ PVW.
  const handleTransition = () => {
    if (isFrozen) return;
    setProgramChannel(previewChannel);
    setPreviewChannel(programChannel);
    tBarProgressRef.current = 0;
  };

  // AUTO : fondu progressif piloté par la durée réglée au joystick.
  const handleAutoTransition = () => {
    if (isFrozen || isAutoTransitioning) return;
    if (autoTransitionFrameRef.current !== null) {
      cancelAnimationFrame(autoTransitionFrameRef.current);
    }

    setIsAutoTransitioning(true);
    const duration = Math.max(300, Math.min(3000, transitionSpeed));
    let startedAt: number | null = null;

    const animate = (timestamp: number) => {
      if (startedAt === null) startedAt = timestamp;
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      tBarProgressRef.current = progress;

      if (progress >= 1) {
        autoTransitionFrameRef.current = null;
        tBarProgressRef.current = 0;
        setProgramChannel(previewChannel);
        setPreviewChannel(programChannel);
        setIsAutoTransitioning(false);
        return;
      }

      autoTransitionFrameRef.current = requestAnimationFrame(animate);
    };

    autoTransitionFrameRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    return () => {
      if (autoTransitionFrameRef.current !== null) {
        cancelAnimationFrame(autoTransitionFrameRef.current);
      }
    };
  }, []);

  // --- JOYSTICK ---
  const handleJoystickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joystickRef.current) return;
    
    // Si on est en mode logo mais que le logo est désactivé, on ne fait rien.
    if (joystickMode === 'logo' && !isLogoActive) return;

    const rect = joystickRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let x = (e.clientX - centerX) / (rect.width / 2);
    let y = (e.clientY - centerY) / (rect.height / 2);
    
    const dist = Math.sqrt(x*x + y*y);
    if (dist > 1) { x /= dist; y /= dist; }
    
    setJoystickPos({ x, y });

    if (joystickMode === 'zoom') {
      if (Math.abs(x) > 0.3) {
        const speed = 300 + ((x + 1) / 2) * 2700;
        setTransitionSpeed(Math.round(speed));
      }
      if (Math.abs(y) > 0.3) {
        const zoom = 1 + ((y + 1) / 2) * 1.5;
        setProgramZoom(zoom);
      }
    } else if (joystickMode === 'logo') {
      if (Math.abs(x) > 0.1 || Math.abs(y) > 0.1) {
        const newX = Math.max(0, Math.min(90, logoPos.x + x * 1.5));
        const newY = Math.max(0, Math.min(90, logoPos.y + y * 1.5));
        setLogoPos({ x: newX, y: newY });
      }
    }
  };

  const handleJoystickEnd = () => {
    setJoystickPos({ x: 0, y: 0 });
    if (joystickMode === 'zoom') setProgramZoom(1);
  };

  // --- ENREGISTREMENT PGM VIDÉO + AUDIO STÉRÉO ---
  const toggleRecording = async () => {
    if (isRecording) {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch (error) {
          recordDiagnostic('error', 'recording', 'Échec de l’arrêt REC', error);
          setRecordingMessage(error instanceof Error ? error.message : 'Impossible d’arrêter REC.');
        }
      }
      return;
    }

    const canvas = programCanvasRef.current;
    if (!canvas) {
      setRecordingMessage('Canvas PGM indisponible.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setRecordingMessage('MediaRecorder non pris en charge sur cet appareil.');
      return;
    }

    const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    const availableAudioTracks = programAudioStream?.getAudioTracks() ?? [];
    const audioTracks = availableAudioTracks.filter((track) =>
      track.readyState === 'live' && track.enabled && !track.muted
    );
    if (connectedAudioInputs > 0 && audioTracks.length === 0) {
      recordDiagnostic('error', 'recording', 'REC refusé : entrées audio déclarées mais piste PGM indisponible', {
        connectedAudioInputs,
        availableTracks: availableAudioTracks.map((track) => ({
          label: track.label, enabled: track.enabled, muted: track.muted, readyState: track.readyState
        }))
      });
      setRecordingMessage('REC annulé : aucune piste audio PGM active. Vérifiez le mixeur audio.');
      return;
    }

    let videoStream: MediaStream | null = null;
    let nativeSaveStarted = false;
    try {
      videoStream = canvas.captureStream(30);
      recordingVideoStreamRef.current = videoStream;
      const videoTracks = videoStream.getVideoTracks().filter((track) => track.readyState === 'live');
      if (videoTracks.length === 0) throw new Error('Aucune piste vidéo PGM active.');

      recordDiagnostic('info', 'recording', 'Démarrage REC demandé', {
        platform: Capacitor.getPlatform(),
        nativeSave: isAndroidNative,
        connectedAudioInputs,
        programAudioTracks: availableAudioTracks.map((track) => ({
          label: track.label, enabled: track.enabled, muted: track.muted, readyState: track.readyState,
          settings: track.getSettings()
        })),
        selectedAudioTrackCount: audioTracks.length,
        videoTracks: videoTracks.map((track) => ({
          readyState: track.readyState, settings: track.getSettings()
        }))
      });

      const recordingStream = new MediaStream([...videoTracks, ...audioTracks]);
      const supportedMimeType = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = supportedMimeType
        ? new MediaRecorder(recordingStream, { mimeType: supportedMimeType })
        : new MediaRecorder(recordingStream);
      const filename = `DSK-MV_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;

      recordedChunks.current = [];
      recordingErrorRef.current = null;
      recordingWriteQueueRef.current = Promise.resolve();
      nativeRecordingRef.current = false;

      if (isAndroidNative) {
        const result = await DskStreaming.beginVideoRecording({
          filename,
          mimeType: recorder.mimeType || supportedMimeType || 'video/webm'
        });
        if (!result.started) throw new Error('Android n’a pas pu préparer le fichier REC.');
        nativeSaveStarted = true;
        nativeRecordingRef.current = true;
        recordDiagnostic('info', 'recording', 'Fichier REC Android préparé dans Movies/DSK-MV', {
          filename: result.filename, mimeType: recorder.mimeType
        });
      }

      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size <= 0) return;
        if (!nativeRecordingRef.current) {
          recordedChunks.current.push(event.data);
          return;
        }

        // Transfert par petits blocs : ne jamais convertir le Blob complet en base64.
        recordingWriteQueueRef.current = recordingWriteQueueRef.current.then(async () => {
          const buffer = await event.data.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          const segmentSize = 0x8000;
          for (let offset = 0; offset < bytes.length; offset += segmentSize) {
            binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + segmentSize, bytes.length)));
          }
          await DskStreaming.appendVideoRecordingChunk({ base64: btoa(binary) });
        }).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          recordingErrorRef.current = message;
          recordDiagnostic('error', 'recording', 'Échec d’écriture d’un bloc REC dans MediaStore', { message, chunkSize: event.data.size });
          const activeRecorder = mediaRecorderRef.current;
          if (activeRecorder && activeRecorder.state !== 'inactive') {
            try { activeRecorder.stop(); } catch { /* onstop nettoiera les ressources */ }
          }
        });
      };

      recorder.onerror = (event) => {
        const message = event instanceof Event ? event.type : String(event);
        recordingErrorRef.current = message;
        recordDiagnostic('error', 'recording', 'Erreur MediaRecorder pendant la capture', {
          error: message, state: recorder.state, mimeType: recorder.mimeType
        });
        setRecordingMessage('Erreur MediaRecorder. Fermeture sécurisée de REC…');
        if (recorder.state !== 'inactive') {
          try { recorder.stop(); } catch (error) {
            recordDiagnostic('error', 'recording', 'Impossible de fermer MediaRecorder après erreur', error);
          }
        }
      };

      recorder.onstop = () => {
        void (async () => {
          let saved = false;
          try {
            if (nativeRecordingRef.current) {
              await recordingWriteQueueRef.current;
              if (recordingErrorRef.current) throw new Error(recordingErrorRef.current);
              const result = await DskStreaming.finishVideoRecording();
              nativeRecordingRef.current = false;
              saved = result.saved && result.bytes > 0;
              recordDiagnostic(saved ? 'info' : 'error', 'recording', 'Finalisation REC Android terminée', {
                saved: result.saved, uri: result.uri, filename: result.filename, bytes: result.bytes,
                audioTrackCount: audioTracks.length, mimeType: recorder.mimeType
              });
              if (!saved) throw new Error('Android n’a pas confirmé une écriture vidéo non vide.');
              setRecordingMessage(`REC sauvegardé · Movies/DSK-MV · ${result.filename}`);
            } else {
              const blob = new Blob(recordedChunks.current, { type: recorder.mimeType || 'video/webm' });
              recordDiagnostic(blob.size > 0 ? 'info' : 'error', 'recording', 'Enregistrement REC terminé', {
                blobSize: blob.size, chunkCount: recordedChunks.current.length, mimeType: recorder.mimeType,
                audioTrackCount: audioTracks.length, finalState: recorder.state
              });
              if (blob.size <= 0) throw new Error('Enregistrement vide : aucune donnée reçue.');
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement('a');
              anchor.href = url;
              anchor.download = filename;
              anchor.click();
              window.setTimeout(() => URL.revokeObjectURL(url), 30000);
              saved = true;
              setRecordingMessage('Enregistrement terminé · téléchargement WebM demandé au navigateur.');
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            recordDiagnostic('error', 'recording', 'Échec de finalisation ou de sauvegarde REC', { message });
            if (nativeRecordingRef.current || nativeSaveStarted) {
              try { await DskStreaming.abortVideoRecording(); } catch (abortError) {
                recordDiagnostic('error', 'recording', 'Échec du nettoyage du fichier REC temporaire', abortError);
              }
            }
            nativeRecordingRef.current = false;
            setRecordingMessage(`Échec REC : ${message}`);
          } finally {
            // Seules les pistes vidéo créées par captureStream appartiennent à REC.
            recordingVideoStreamRef.current?.getVideoTracks().forEach((track) => track.stop());
            recordingVideoStreamRef.current = null;
            mediaRecorderRef.current = null;
            recordedChunks.current = [];
            recordingWriteQueueRef.current = Promise.resolve();
            recordingErrorRef.current = null;
            nativeRecordingRef.current = false;
            setIsRecording(false);
            if (!saved) recordDiagnostic('warning', 'recording', 'REC terminé sans confirmation de sauvegarde');
          }
        })();
      };

      recorder.start(1000);
      setIsRecording(true);
      setRecordingMessage(audioTracks.length
        ? 'REC en cours · PGM vidéo + piste audio active.'
        : 'REC en cours · vidéo seule, aucune entrée audio connectée.');
      recordDiagnostic('info', 'recording', 'MediaRecorder démarré', {
        mimeType: recorder.mimeType, state: recorder.state, audioTrackCount: audioTracks.length,
        nativeSave: isAndroidNative
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de démarrer l’enregistrement.';
      if (nativeSaveStarted) {
        try { await DskStreaming.abortVideoRecording(); } catch (abortError) {
          recordDiagnostic('error', 'recording', 'Échec nettoyage après démarrage REC avorté', abortError);
        }
      }
      nativeRecordingRef.current = false;
      videoStream?.getVideoTracks().forEach((track) => track.stop());
      recordingVideoStreamRef.current = null;
      mediaRecorderRef.current = null;
      setIsRecording(false);
      setRecordingMessage(message);
      recordDiagnostic('error', 'recording', 'Démarrage REC impossible', { message });
    }
  };

  const applySystemProfile = (profile: { obsHost: string; obsPort: string; cameraHost: string; cameraPort: string }) => {
    setObsHost(profile.obsHost);
    setObsPort(profile.obsPort);
    setCameraReceiverHost(profile.cameraHost);
    setCameraReceiverPort(profile.cameraPort);
    // Les secrets ne sont jamais enregistrés dans les profils : ils doivent être ressaisis pour le nouvel hôte.
    setObsPassword('');
    setCameraReceiverToken('');
    setObsMessage('Profil chargé. Vérifiez les identifiants puis reconnectez OBS.');
    setCameraReceiverMessage('Profil chargé. Vérifiez le code d’association puis reconnectez les caméras.');
  };

  // LIVE pilote OBS et, sur Android natif, le service de maintien en arrière-plan.
  const toggleLive = async () => {
    if (obsStatus !== 'connected') {
      setLiveMessage('Connectez d’abord DSK à OBS dans les réglages.');
      setIsSettingsOpen(true);
      return;
    }

    const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    setIsLiveBusy(true);
    setLiveMessage('');
    try {
      const streamActive = await getObsStreamActive();
      if (streamActive) {
        recordDiagnostic('info', 'live', 'Arrêt du LIVE demandé');
        await stopObsStream();
        setIsLive(false);
        if (isAndroid) {
          await DskStreaming.stopBackgroundService();
          recordDiagnostic('info', 'live', 'Service Android LIVE arrêté');
        }
        setLiveMessage('Diffusion OBS arrêtée.');
      } else {
        if (isAndroid) {
          recordDiagnostic('info', 'live', 'Démarrage du service Android LIVE demandé');
          await DskStreaming.startBackgroundService({
            title: 'DSK-MV — LIVE actif',
            text: 'Maintien de la session OBS en arrière-plan'
          });
          recordDiagnostic('info', 'live', 'Service Android LIVE démarré');
        }

        try {
          await startObsStream();
          const confirmed = await getObsStreamActive();
          setIsLive(confirmed);
          if (confirmed) {
            recordDiagnostic('info', 'live', 'Diffusion OBS confirmée active');
            setLiveMessage('Diffusion OBS active.');
          } else {
            if (isAndroid) await DskStreaming.stopBackgroundService();
            setLiveMessage('OBS n’a pas confirmé le démarrage du direct.');
          }
        } catch (error) {
          if (isAndroid) {
            try {
              await DskStreaming.stopBackgroundService();
            } catch {
              setLiveMessage('Échec du démarrage OBS ; le service Android doit être arrêté manuellement.');
              return;
            }
          }
          throw error;
        }
      }
    } catch (error) {
      recordDiagnostic('error', 'live', 'Échec de la commande LIVE OBS', error);
      setLiveMessage(error instanceof Error ? error.message : 'Commande LIVE OBS impossible.');
    } finally {
      setIsLiveBusy(false);
    }
  };

  return (
    <div className="h-[100dvh] w-[100dvw] bg-slate-950 text-white flex flex-col font-sans select-none overflow-hidden relative">
      
      {/* EN-TÊTE */}
      <header className="h-12 flex items-center justify-between px-3 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-red-600 p-1 rounded"><MonitorPlay size={16} className="text-white" /></div>
          <h1 className="text-sm font-black tracking-widest uppercase leading-none">DSK - MV</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleRecording} className={`px-2 py-1 rounded text-[10px] font-bold ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400'}`} title={recordingMessage || 'Enregistrer la sortie PGM'}>
             {isRecording ? 'REC ●' : 'REC OFF'}
          </button>
          <button onClick={() => void toggleLive()} disabled={isLiveBusy} className={`px-2 py-1 rounded text-[10px] font-bold disabled:opacity-50 ${isLive ? 'bg-red-600 text-white animate-pulse' : obsStatus === 'connected' ? 'bg-slate-800 text-slate-300' : 'bg-slate-800 text-slate-500'}`} title={liveMessage || 'Démarrer ou arrêter le direct via OBS'}>
            {isLiveBusy ? 'LIVE…' : isLive ? 'LIVE ON' : obsStatus === 'connected' ? 'LIVE OFF' : 'LIVE · OBS'}
          </button>
          {(recordingMessage || liveMessage) && <span className="max-w-[180px] truncate text-[8px] text-slate-400" title={recordingMessage || liveMessage}>{recordingMessage || liveMessage}</span>}
          <button onClick={() => setIsProgramViewOpen(true)} className="p-1 text-red-500"><MonitorPlay size={18} /></button>
          <button onClick={() => setIsSystemPanelOpen(true)} className="rounded bg-sky-800 px-2 py-1 text-[9px] font-black text-white">SYSTEM</button>
          <button onClick={() => setIsSettingsOpen(true)} className="p-1 text-slate-400" title="Connexions OBS et vidéo"><Settings size={18} /></button>
        </div>
      </header>

      {/* CORPS PRINCIPAL */}
      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* GAUCHE : Effets */}
        <div className="w-16 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-2 gap-2 shrink-0">
          <button onClick={() => setIsChromaPanelOpen(true)} className={`w-12 h-10 rounded text-[9px] font-bold ${isChromaActive ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>CHROMA</button>
          <button onClick={() => setIsPipPanelOpen(true)} className={`w-12 h-10 rounded text-[9px] font-bold ${isPipActive ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400'}`}>PIP</button>
          
          {/* Ancien raccourci logo conservé pour compatibilité */}
          <button onClick={() => setIsLogoActive(!isLogoActive)} className={`w-12 h-10 rounded text-[9px] font-bold ${isLogoActive ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}>LOGO</button>
          <button onClick={() => setIsDskPanelOpen(true)} className="w-12 h-10 rounded text-[9px] font-bold bg-amber-700 text-white border border-amber-500">DSK</button>
          
          <button onClick={() => setIsFrozen(!isFrozen)} disabled={isAutoTransitioning} className={`w-12 h-10 rounded text-[9px] font-bold disabled:opacity-40 ${isFrozen ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>FREEZE</button>
          <button onClick={() => setIsAudioPanelOpen(true)} className="w-12 h-10 rounded text-[9px] font-bold bg-amber-700 text-white border border-amber-500">AUDIO</button>
          <button onClick={() => setIsMediaPanelOpen(true)} className={`w-12 h-10 rounded text-[9px] font-bold border ${mediaUrl ? 'bg-sky-700 border-sky-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>MEDIA</button>
        </div>

        {/* CENTRE : MultiView */}
        <main className="flex-1 bg-black p-1 flex flex-col gap-1 overflow-hidden">
          <div className="h-[34%] min-h-0 grid grid-cols-2 gap-1">
            <div className="relative min-w-0 min-h-0 bg-slate-950 border border-red-600 rounded overflow-hidden">
              <video ref={programMonitorRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-contain" />
              <span className="absolute top-1 left-1 bg-red-600 text-white text-[9px] font-black px-2 py-1 rounded z-10">PGM · {programChannel === 9 ? 'MEDIA' : `CAM ${programChannel}`}</span>
            </div>
            <div className="relative min-w-0 min-h-0 bg-slate-950 border border-emerald-600 rounded overflow-hidden">
              <video ref={previewMonitorRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-contain" />
              <video
                ref={mediaVideoRef}
                src={mediaUrl || undefined}
                loop={mediaLoop}
                preload="metadata"
                playsInline
                muted={mediaAudioRoutedChannel === null}
                onError={() => setMediaAudioError('Format vidéo ou codec non pris en charge par cet appareil.')}
                onLoadedMetadata={(event) => setMediaDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
                onTimeUpdate={(event) => setMediaCurrentTime(event.currentTarget.currentTime)}
                onPlay={() => setIsMediaPlaying(true)}
                onPause={() => setIsMediaPlaying(false)}
                onEnded={() => setIsMediaPlaying(false)}
                className={`absolute inset-0 h-full w-full object-contain ${previewChannel === 9 ? 'block' : 'hidden'}`}
              />
              <span className="absolute top-1 left-1 bg-emerald-600 text-white text-[9px] font-black px-2 py-1 rounded z-10">PVW · {previewChannel === 9 ? 'MEDIA' : 'PREVIEW'}</span>
              {previewChannel === 9 && !mediaUrl && <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">Aucun média chargé</span>}
            </div>
          </div>
          <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-1 overflow-hidden">
          {[1, 2, 3, 4].map((channel) => {
            const isP = programChannel === channel;
            const isV = previewChannel === channel;
            return (
              <div key={channel} onClick={() => !isFrozen && !isAutoTransitioning && setPreviewChannel(channel)} className={`relative bg-slate-900 rounded border-2 ${isP ? 'border-red-500' : isV ? 'border-green-500' : 'border-slate-800'} overflow-hidden cursor-pointer pointer-events-auto`}>
                {channel === 1 ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                    {cameraStream ? <video ref={localVideoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" /> : <div className="z-20 flex flex-col items-center gap-1 px-1"><span className="text-[9px] text-slate-400">{cameraStatus === 'error' ? 'ERREUR CAMÉRA' : 'CAMÉRA LOCALE INACTIVE'}</span><button onClick={(event) => { event.stopPropagation(); void startCamera(); }} disabled={cameraStatus === 'requesting'} className="bg-red-600 disabled:bg-slate-600 text-white px-2 py-1 rounded text-[10px] pointer-events-auto">{cameraStatus === 'requesting' ? 'Activation…' : cameraStatus === 'error' ? 'Réessayer' : 'Activer'}</button>{cameraError && <span role="alert" className="max-w-full text-center text-[8px] leading-tight text-red-300">{cameraError}</span>}</div>}
                    {cameraStream && <button onClick={(event) => { event.stopPropagation(); stopCamera(); }} className="absolute bottom-1 left-1 z-20 bg-slate-800/90 text-white px-2 py-1 rounded text-[9px]">Désactiver</button>}
                  </div>
                ) : remoteCameraStreams[channel] ? (
                  <><video ref={(el) => { remoteVideoRefs.current[channel] = el; }} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" /><button onClick={(event) => { event.stopPropagation(); disconnectRemoteCamera(channel); }} className="absolute bottom-1 left-1 z-20 bg-slate-800/90 text-white px-2 py-1 rounded text-[9px]">Désactiver</button></>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-900"><span className="text-[9px] text-slate-500">{cameraReceiverStatuses[channel] === 'error' ? 'ERREUR DE LIAISON' : cameraReceiverStatuses[channel] === 'connecting' ? 'CONNEXION…' : 'SOURCE DISTANTE INACTIVE'}</span><button onClick={(event) => { event.stopPropagation(); connectRemoteCamera(channel); }} disabled={cameraReceiverStatuses[channel] === 'connecting'} className="z-20 bg-sky-700 disabled:opacity-50 text-white px-2 py-1 rounded text-[9px]">{cameraReceiverStatuses[channel] === 'error' ? 'Réessayer' : 'Activer'}</button></div>
                )}
                <div className="absolute top-0.5 left-0.5 bg-black/60 px-1 rounded text-[8px] font-bold z-10 pointer-events-none">CAM {channel}</div>
                {isP && <div className="absolute bottom-0.5 right-0.5 bg-red-600 px-1 rounded text-[8px] font-bold z-10 pointer-events-none">PGM</div>}
                {isV && <div className="absolute bottom-0.5 right-0.5 bg-green-600 px-1 rounded text-[8px] font-bold z-10 pointer-events-none">PVW</div>}
              </div>
            );
          })}
          </div>
        </main>

        {/* DROITE : T-Bar & Transitions */}
        <div className="w-20 bg-slate-900 border-l border-slate-800 flex flex-col items-center py-2 justify-between shrink-0">
          <div className="flex-1 flex items-center justify-center w-full">
            {/* T-BAR TOUJOURS ACTIVE */}
            <TBar onTransition={handleTransition} onProgress={(progress) => { tBarProgressRef.current = progress; }} disabled={isFrozen || isAutoTransitioning} />
          </div>
          <div className="flex flex-col w-full px-1 gap-1">
            <button onClick={handleTransition} disabled={isFrozen || isAutoTransitioning} className="w-full bg-slate-700 disabled:opacity-40 text-white py-2 rounded font-black text-xs border-b-2 border-slate-900 active:border-b-0">CUT</button>
            <button onClick={handleAutoTransition} disabled={isFrozen || isAutoTransitioning} className="w-full bg-blue-600 disabled:opacity-40 text-white py-2 rounded font-black text-xs border-b-2 border-blue-800 active:border-b-0">{isAutoTransitioning ? 'AUTO…' : 'AUTO'}</button>
            <span className="text-[8px] text-slate-400 text-center">{transitionSpeed} ms</span>
          </div>
        </div>
      </div>

      {/* BAS : Joystick + Matrice */}
      <footer className="h-16 bg-slate-950 border-t border-slate-800 flex flex-row items-center justify-between px-2 shrink-0 w-full gap-2">
        
        {/* Bouton Mode Joystick */}
        <button 
          onClick={() => setJoystickMode(joystickMode === 'zoom' ? 'logo' : 'zoom')} 
          className={`w-12 h-10 rounded text-[9px] font-bold flex flex-col items-center justify-center shrink-0 border-2 ${joystickMode === 'logo' ? 'bg-amber-600 text-white border-amber-500' : 'bg-slate-800 text-slate-400 border-slate-700'} ${!isLogoActive && joystickMode === 'logo' ? 'opacity-50' : ''}`}
        >
          <Move size={14} />
          {joystickMode === 'logo' ? 'LOGO' : 'ZOOM'}
        </button>

        {/* Joystick */}
        <div 
          ref={joystickRef}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); handleJoystickMove(e); }}
          onPointerMove={(e) => { if (e.buttons > 0 || e.pointerType === 'touch') handleJoystickMove(e); }}
          onPointerUp={handleJoystickEnd}
          onPointerCancel={handleJoystickEnd}
          className="relative w-12 h-12 bg-slate-800 rounded-full border-2 border-slate-700 flex items-center justify-center shadow-inner shrink-0 touch-none"
        >
          <div 
            className="absolute w-6 h-6 bg-slate-600 rounded-full shadow-lg pointer-events-none transition-transform duration-75 ease-out"
            style={{ transform: `translate(${joystickPos.x * 12}px, ${joystickPos.y * 12}px)` }}
          >
            <div className="w-full h-full rounded-full border-t border-slate-500"></div>
          </div>
        </div>

        {/* Matrice 1 à 4 · mode expérimental */}
        <div className="flex flex-row flex-1 justify-between gap-1 min-w-0">
          {[1, 2, 3, 4].map((ch) => {
            const isP = programChannel === ch;
            const isV = previewChannel === ch;
            return (
              <button 
                key={ch} 
                onClick={() => !isFrozen && !isAutoTransitioning && setPreviewChannel(ch)} 
                disabled={isFrozen || isAutoTransitioning} 
                className={`flex-1 min-w-0 h-10 rounded font-bold text-sm border-b-2 transition-all active:border-b-0 active:translate-y-0.5 touch-manipulation ${isP ? 'bg-red-600 border-red-800 text-white' : isV ? 'bg-green-600 border-green-800 text-white' : 'bg-slate-800 border-slate-900 text-slate-300'}`}
              >
                {ch}
              </button>
            );
          })}
          <button
            onClick={() => !isFrozen && !isAutoTransitioning && setPreviewChannel(9)}
            disabled={isFrozen || isAutoTransitioning || !mediaUrl}
            className={`w-12 min-w-12 h-10 rounded text-[9px] font-black border-b-2 disabled:opacity-40 ${programChannel === 9 ? 'bg-red-600 border-red-800 text-white' : previewChannel === 9 ? 'bg-green-600 border-green-800 text-white' : 'bg-sky-800 border-sky-950 text-sky-100'}`}
          >MEDIA</button>
        </div>
        
        <div className="w-8 text-right text-[8px] text-slate-500 font-bold shrink-0">DSK-MV</div>
      </footer>

      {/* MODALES */}
      <SystemPanel
        open={isSystemPanelOpen}
        onClose={() => setIsSystemPanelOpen(false)}
        obsHost={obsHost}
        obsPort={obsPort}
        cameraHost={cameraReceiverHost}
        cameraPort={cameraReceiverPort}
        obsStatus={obsStatus}
        connectedCameras={Object.values(cameraReceiverStatuses).filter((status) => status === 'connected').length}
        isRecording={isRecording}
        isLive={isLive}
        onApplyProfile={applySystemProfile}
      />

      {isSettingsOpen && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div 
            className="bg-slate-800 rounded-lg p-4 w-full max-w-sm border border-slate-600 max-h-[90dvh] overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white">Réglages</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white p-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
                <X size={24} />
              </button>
            </div>

            {/* CONNEXION OBS WEBSOCKET */}
            <div className="mb-4 bg-slate-900 p-3 rounded border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-white">CONNEXION OBS STUDIO</p>
                <span className={`text-[10px] font-bold ${obsStatus === 'connected' ? 'text-green-400' : obsStatus === 'error' ? 'text-red-400' : obsStatus === 'connecting' ? 'text-amber-400' : 'text-slate-400'}`}>
                  {obsStatus === 'connected' ? 'CONNECTÉ' : obsStatus === 'connecting' ? 'CONNEXION…' : obsStatus === 'error' ? 'ERREUR' : 'HORS LIGNE'}
                </span>
              </div>
              <label className="block text-[10px] text-slate-400 mb-1">Adresse IP / hôte OBS</label>
              <input type="text" value={obsHost} onChange={(e) => setObsHost(e.target.value)} placeholder="192.168.1.100" className="w-full mb-2 bg-slate-800 text-white text-xs px-2 py-2 rounded border border-slate-600" />
              <label className="block text-[10px] text-slate-400 mb-1">Port WebSocket</label>
              <input type="number" min="1" max="65535" value={obsPort} onChange={(e) => setObsPort(e.target.value)} className="w-full mb-2 bg-slate-800 text-white text-xs px-2 py-2 rounded border border-slate-600" />
              <label className="block text-[10px] text-slate-400 mb-1">Mot de passe OBS (si activé)</label>
              <input type="password" value={obsPassword} onChange={(e) => setObsPassword(e.target.value)} placeholder="Mot de passe WebSocket" className="w-full mb-2 bg-slate-800 text-white text-xs px-2 py-2 rounded border border-slate-600" />
              <p className="text-[10px] text-slate-400 mb-2">{obsMessage}{obsCurrentScene ? ` · Scène : ${obsCurrentScene}` : ''}</p>
              {obsStatus === 'connected' && (
                <div className="mt-3 border-t border-slate-700 pt-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-[10px] font-bold text-slate-300">SCÈNES OBS</p>
                    <button onClick={() => void refreshObsScenes()} disabled={isLoadingObsScenes} className="text-[10px] font-bold text-blue-400 disabled:opacity-50">
                      {isLoadingObsScenes ? 'CHARGEMENT…' : 'ACTUALISER'}
                    </button>
                  </div>
                  {obsScenes.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {obsScenes.map((scene) => (
                        <button key={scene} onClick={() => void handleObsSceneSelect(scene)} disabled={isLoadingObsScenes} className={`rounded px-2 py-2 text-left text-[10px] font-bold border disabled:opacity-50 ${obsCurrentScene === scene ? 'bg-green-700 border-green-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-300'}`}>
                          {scene}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500">Aucune scène chargée. Actualisez la liste.</p>
                  )}
                  {obsActionMessage && <p className="text-[10px] text-slate-400 mt-2">{obsActionMessage}</p>}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={handleObsConnect} disabled={obsStatus === 'connecting'} className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white py-2 rounded text-xs font-bold">CONNECTER</button>
                <button onClick={() => { void disconnectObs(); setIsLive(false); setObsScenes([]); setObsCurrentScene(''); setObsActionMessage(''); }} disabled={obsStatus !== 'connected'} className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white py-2 rounded text-xs font-bold">DÉCONNECTER</button>
              </div>
              <p className="text-[9px] text-slate-500 mt-2">OBS Studio doit être ouvert, avec le serveur WebSocket activé (port par défaut : 4455).</p>
            </div>

            {Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && (
              <div className="mb-4 bg-slate-900 p-3 rounded border border-slate-700 space-y-2">
                <p className="text-xs font-bold text-amber-300">DIAGNOSTIC VIDÉO NATIF ANDROID</p>
                <p className="text-[10px] text-slate-400">Vérifie l’encodage réel de 12 images de test en H.264 à 1280 × 720 et 30 images/s. Aucune caméra ni diffusion n’est démarrée.</p>
                <button
                  onClick={() => void runH264EncoderProbe()}
                  disabled={isH264ProbeRunning}
                  className="w-full bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white py-2 rounded text-xs font-bold"
                >
                  {isH264ProbeRunning ? 'ANALYSE…' : 'TESTER L’ENCODAGE H.264'}
                </button>
                {h264ProbeMessage && <p className="text-[10px] text-slate-300">{h264ProbeMessage}</p>}
                {h264ProbeResult && (
                  <div className="rounded bg-slate-800 p-2 space-y-1">
                    <p className={`text-[10px] font-bold ${h264ProbeResult.supported ? 'text-emerald-400' : 'text-red-400'}`}>
                      {h264ProbeResult.supported ? 'COMPATIBLE' : 'NON COMPATIBLE'}
                    </p>
                    <p className="text-[10px] text-slate-300">Encodeur : {h264ProbeResult.codecName || 'Aucun'}</p>
                    <p className="text-[10px] text-slate-300">Accélération matérielle : {h264ProbeResult.hardwareAccelerated ? 'Oui' : 'Non / non confirmée'}</p>
                    <p className="text-[10px] text-slate-300">Surface d’entrée : {h264ProbeResult.inputSurfaceCreated ? 'Créée' : 'Non créée'}</p>
                    <p className="text-[10px] text-slate-300">Images H.264 produites : {h264ProbeResult.encodedFrameCount}</p>
                    <p className="text-[10px] text-slate-300">Données encodées : {h264ProbeResult.encodedBytes} octets</p>
                    <p className="text-[10px] text-slate-300">Format de sortie : {h264ProbeResult.outputMimeType || 'Non détecté'}</p>
                    <p className="text-[10px] text-slate-400">{h264ProbeResult.detail}</p>
                  </div>
                )}
              </div>
            )}

            {/* Import Logo Stylisé */}
            <div className="mb-4 bg-slate-900 p-3 rounded border border-slate-700">
              <p className="text-xs text-slate-400 mb-2">Logo personnalisé :</p>
              <input 
                type="file" 
                accept="image/*" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setCustomLogo(URL.createObjectURL(file));
                }} 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded font-bold text-sm mb-2"
              >
                Importer un fichier
              </button>
              {customLogo && (
                <div className="flex items-center gap-2 mt-2 bg-slate-800 p-2 rounded">
                                    <img src={customLogo} alt="Logo" className="h-8 w-auto bg-slate-700 rounded" />
                  <span className="text-[10px] text-green-400">Logo chargé</span>
                </div>
              )}
            </div>

            <div className="mb-4 bg-slate-900 p-3 rounded border border-slate-700 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-sky-300">DSK VIDEO · CAM 2 À CAM 4</p>
                <span className="text-[9px] text-slate-400">{[2, 3, 4].filter((id) => cameraReceiverStatuses[id] === 'connected').length}/3 reçues</span>
              </div>
              <label className="block text-[10px] text-slate-400">IP DU PC DSK RECEIVER</label>
              <input type="text" value={cameraReceiverHost} onChange={(e) => setCameraReceiverHost(e.target.value)} placeholder="192.168.1.100" className="w-full bg-slate-800 text-white text-xs px-2 py-2 rounded border border-slate-600" />
              <label className="block text-[10px] text-slate-400">PORT VIDÉO</label>
              <input type="number" min="1" max="65535" value={cameraReceiverPort} onChange={(e) => setCameraReceiverPort(e.target.value)} className="w-full bg-slate-800 text-white text-xs px-2 py-2 rounded border border-slate-600" />
              <label className="block text-[10px] text-slate-400">CODE D’ASSOCIATION</label>
              <input type="password" autoComplete="off" value={cameraReceiverToken} onChange={(e) => setCameraReceiverToken(e.target.value)} placeholder="Code affiché sur le PC" className="w-full bg-slate-800 text-white text-xs px-2 py-2 rounded border border-slate-600" />
              <div className="flex gap-2">
                <button onClick={connectRemoteCameras} disabled={!cameraReceiverHost.trim() || cameraReceiverToken.trim().length < 16} className="flex-1 bg-sky-700 disabled:opacity-40 text-white py-2 rounded text-[10px] font-bold">CONNECTER CAM 2–4</button>
                <button onClick={disconnectRemoteCameras} className="flex-1 bg-slate-700 text-white py-2 rounded text-[10px] font-bold">DÉCONNECTER</button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[2,3,4].map((cam) => (
                  <div key={cam} className="rounded bg-slate-800 px-2 py-1 text-[9px] flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${cameraReceiverStatuses[cam] === 'connected' ? 'bg-emerald-400' : cameraReceiverStatuses[cam] === 'error' ? 'bg-red-400' : 'bg-slate-600'}`} />
                    <span>CAM {cam}</span>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-slate-400">{cameraReceiverMessage}</p>
              <p className="text-[9px] text-amber-300">Sur chaque téléphone : ouvrez DSK Camera, choisissez CAM 2, CAM 3 ou CAM 4 et saisissez le code. L’accès caméra du navigateur exige HTTPS ou l’application native DSK Camera ; une simple page HTTP sur IP locale peut être bloquée par Android.</p>
            </div>
            
            <button onClick={() => setIsSettingsOpen(false)} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded font-bold mt-2">
              Fermer
            </button>
          </div>
        </div>
      )}

      {isChromaPanelOpen && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4">
          <section className="w-full max-w-md bg-slate-900 border border-emerald-700 rounded-xl p-4 space-y-4 shadow-2xl">
            <header className="flex items-center justify-between">
              <h2 className="text-sm font-black text-emerald-400 tracking-widest">CHROMA KEY</h2>
              <button onClick={() => setIsChromaPanelOpen(false)} className="min-w-10 min-h-10 rounded bg-slate-800 text-white">✕</button>
            </header>
            <p className="text-xs text-slate-400">Détourage appliqué à la source actuellement en PGM : {programChannel === 9 ? 'MEDIA' : `CAM ${programChannel}`}. Utilisez un fond vert ou bleu uniforme et un éclairage régulier.</p>
            <label className="block text-[10px] font-bold text-slate-400">COULEUR À SUPPRIMER</label>
            <select value={chromaKeyColor} onChange={(event) => setChromaKeyColor(event.target.value as 'green' | 'blue')} className="w-full bg-slate-800 text-white p-3 rounded border border-slate-700 text-sm">
              <option value="green">Vert (Green Screen)</option>
              <option value="blue">Bleu (Blue Screen)</option>
            </select>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-300"><span>Seuil de tolérance</span><strong>{chromaThreshold}</strong></div>
              <input type="range" min="10" max="100" step="1" value={chromaThreshold} onChange={(event) => setChromaThreshold(Number(event.target.value))} className="w-full" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIsChromaActive(!isChromaActive)} className={`flex-1 py-3 rounded font-black text-xs ${isChromaActive ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-slate-200'}`}>{isChromaActive ? 'DÉSACTIVER' : 'ACTIVER CHROMA'}</button>
              <button onClick={() => setIsChromaPanelOpen(false)} className="flex-1 py-3 rounded bg-slate-700 text-white font-bold text-xs">FERMER</button>
            </div>
          </section>
        </div>
      )}

      {isPipPanelOpen && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4">
          <section className="w-full max-w-md bg-slate-900 border border-orange-700 rounded-xl p-4 space-y-4 shadow-2xl">
            <header className="flex items-center justify-between">
              <h2 className="text-sm font-black text-orange-400 tracking-widest">PICTURE IN PICTURE</h2>
              <button onClick={() => setIsPipPanelOpen(false)} className="min-w-10 min-h-10 rounded bg-slate-800 text-white">✕</button>
            </header>
            <label className="block text-[10px] font-bold text-slate-400">SOURCE SECONDAIRE</label>
            <select value={pipSourceChannel} onChange={(event) => setPipSourceChannel(Number(event.target.value))} className="w-full bg-slate-800 text-white p-3 rounded border border-slate-700 text-sm">
              {[1,2,3,4,5,6,7,8,9].map((channel) => <option key={channel} value={channel}>{channel === 9 ? 'MEDIA' : `CAM ${channel}`}</option>)}
            </select>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-300"><span>Taille de la fenêtre</span><strong>{Math.round(pipScale * 100)} %</strong></div>
              <input type="range" min="0.18" max="0.42" step="0.01" value={pipScale} onChange={(event) => setPipScale(Number(event.target.value))} className="w-full" />
            </div>
            <label className="block text-[10px] font-bold text-slate-400">POSITION</label>
            <select value={pipPosition} onChange={(event) => setPipPosition(event.target.value as typeof pipPosition)} className="w-full bg-slate-800 text-white p-3 rounded border border-slate-700 text-sm">
              <option value="top-left">Haut gauche</option>
              <option value="top-right">Haut droite</option>
              <option value="bottom-left">Bas gauche</option>
              <option value="bottom-right">Bas droite</option>
            </select>
            {pipSourceChannel === programChannel && <p className="text-xs text-amber-300">Choisissez une caméra différente de la source PGM pour afficher le PIP.</p>}
            <div className="flex gap-2">
              <button onClick={() => setIsPipActive(!isPipActive)} className={`flex-1 py-3 rounded font-black text-xs ${isPipActive ? 'bg-orange-700 text-white' : 'bg-slate-700 text-slate-200'}`}>{isPipActive ? 'DÉSACTIVER PIP' : 'ACTIVER PIP'}</button>
              <button onClick={() => setIsPipPanelOpen(false)} className="flex-1 py-3 rounded bg-slate-700 text-white font-bold text-xs">FERMER</button>
            </div>
          </section>
        </div>
      )}

      <AudioMixerPanel
        open={isAudioPanelOpen}
        onClose={() => setIsAudioPanelOpen(false)}
        onProgramStreamChange={setProgramAudioStream}
        onConnectedInputsChange={setConnectedAudioInputs}
        onMediaAudioRouteReady={handleMediaAudioRouteReady}
      />

      {isMediaPanelOpen && (
        <div className="fixed inset-0 z-[130] overflow-y-auto overscroll-contain bg-black/85 p-2 sm:p-4">
          <section className="mx-auto my-2 max-h-[calc(100dvh-1rem)] w-full max-w-xl space-y-4 overflow-y-auto overscroll-contain rounded-xl border border-sky-700 bg-slate-900 p-3 shadow-2xl sm:p-4">
            <header className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black tracking-widest text-sky-300">DSK MEDIA · PLAYBACK</h2>
                <p className="text-[10px] text-slate-400">Source indépendante · MEDIA 9 · CAM1–CAM8 conservées</p>
              </div>
              <button onClick={() => setIsMediaPanelOpen(false)} className="min-h-10 min-w-10 rounded bg-slate-800 text-white">✕</button>
            </header>

            <input ref={mediaFileInputRef} type="file" accept="video/*" onChange={handleMediaFileChange} className="hidden" />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => mediaFileInputRef.current?.click()} className="rounded bg-sky-700 px-4 py-3 text-xs font-black text-white">CHARGER UNE VIDÉO</button>
              <button onClick={removeMediaFile} disabled={!mediaUrl} className="rounded bg-slate-700 px-4 py-3 text-xs font-bold text-white disabled:opacity-40">RETIRER</button>
              <span className="flex min-w-0 flex-1 items-center text-[10px] text-slate-300">{mediaFileName || 'Aucun fichier sélectionné'}</span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => { const video = mediaVideoRef.current; if (video) void video.play().catch((error) => setMediaAudioError(error instanceof Error ? error.message : 'Lecture impossible.')); }} disabled={!mediaUrl} className="rounded bg-emerald-700 py-3 text-xs font-black text-white disabled:opacity-40">{isMediaPlaying ? 'EN COURS' : 'LECTURE'}</button>
              <button onClick={() => mediaVideoRef.current?.pause()} disabled={!mediaUrl} className="rounded bg-amber-700 py-3 text-xs font-black text-white disabled:opacity-40">PAUSE</button>
              <button onClick={() => { const video = mediaVideoRef.current; if (video) { video.pause(); video.currentTime = 0; setMediaCurrentTime(0); } }} disabled={!mediaUrl} className="rounded bg-slate-700 py-3 text-xs font-black text-white disabled:opacity-40">STOP</button>
              <button onClick={() => setMediaLoop((value) => !value)} disabled={!mediaUrl} className={`rounded py-3 text-xs font-black disabled:opacity-40 ${mediaLoop ? 'bg-sky-700 text-white' : 'bg-slate-700 text-slate-300'}`}>BOUCLE {mediaLoop ? 'ON' : 'OFF'}</button>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>POSITION</span>
                <span>{Math.floor(mediaCurrentTime)} s / {Math.floor(mediaDuration)} s</span>
              </div>
              <input
                type="range"
                min="0"
                max={Math.max(0, mediaDuration)}
                step="0.1"
                value={Math.min(mediaCurrentTime, mediaDuration || 0)}
                onChange={(event) => {
                  const nextTime = Number(event.target.value);
                  if (mediaVideoRef.current) mediaVideoRef.current.currentTime = nextTime;
                  setMediaCurrentTime(nextTime);
                }}
                disabled={!mediaUrl || mediaDuration <= 0}
                className="w-full accent-sky-400"
              />
            </div>

            <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950 p-3">
              <div className="flex items-center justify-between">
                <strong className="text-xs text-amber-300">ROUTAGE AUDIO VERS LE MIXEUR</strong>
                <span className={`text-[9px] font-bold ${mediaAudioRoutedChannel !== null ? 'text-emerald-400' : 'text-slate-500'}`}>{mediaAudioRoutedChannel !== null ? `CH ${mediaAudioRoutedChannel} CONNECTÉ` : 'NON ROUTÉ'}</span>
              </div>
              <div className="flex gap-2">
                <select value={mediaAudioChannel} onChange={(event) => setMediaAudioChannel(Number(event.target.value))} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white">
                  {[1,2,3,4,5,6,7,8].map((channel) => <option key={channel} value={channel}>CH {channel}</option>)}
                </select>
                <button onClick={routeMediaAudio} disabled={!mediaUrl || !isMediaAudioRouteReady} className="rounded bg-amber-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40">ROUTER AUDIO</button>
                <button onClick={() => { if (mediaAudioRoutedChannel !== null) mediaAudioRouteRef.current?.disconnect(mediaAudioRoutedChannel); setMediaAudioRoutedChannel(null); setMediaAudioError('Routage audio déconnecté.'); }} disabled={mediaAudioRoutedChannel === null} className="rounded bg-slate-700 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-40">DÉCONNECTER</button>
              </div>
              <p className="text-[9px] text-slate-400">Le canal choisi doit être libre. L’audio du fichier est silencieux tant qu’il n’est pas routé, afin d’éviter tout contournement du mixeur.</p>
              {(mediaAudioError || !isMediaAudioRouteReady) && <p className="text-[10px] text-amber-300">{mediaAudioError || 'Ouvrez AUDIO et activez le moteur pour rendre le routage disponible.'}</p>}
            </div>

            <button onClick={() => { if (mediaUrl) setPreviewChannel(9); setIsMediaPanelOpen(false); }} disabled={!mediaUrl || isFrozen || isAutoTransitioning} className="w-full rounded bg-emerald-700 py-3 text-xs font-black text-white disabled:opacity-40">ENVOYER MEDIA VERS PVW</button>
            <p className="text-center text-[10px] text-slate-400">Quand MEDIA est en PVW, utilisez CUT, AUTO ou le T-Bar pour l’envoyer en PGM.</p>
          </section>
        </div>
      )}

      {isDskPanelOpen && (
        <DskPanel
          layers={dskLayers}
          onChange={setDskLayers}
          onClose={() => setIsDskPanelOpen(false)}
        />
      )}

      {isProgramViewOpen && (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col">
          <div className="flex justify-between items-center p-2 bg-slate-900 border-b border-slate-800">
            <h2 className="text-sm font-bold text-red-500 flex items-center gap-2"><Radio className="animate-pulse" /> DIRECT</h2>
            <button onClick={() => setIsProgramViewOpen(false)} className="text-white text-xl font-bold bg-slate-800 px-3 py-1 rounded min-w-[44px] min-h-[44px]">✕</button>
          </div>
          <div className="flex-1 flex items-center justify-center p-2 bg-black">
            <video ref={programPreviewVideoRef} autoPlay playsInline muted className="w-full h-full object-contain bg-slate-900 border-2 border-slate-800 rounded-lg" />
          </div>
        </div>
      )}

      <canvas ref={programCanvasRef} width={1280} height={720} className="hidden" />
      <canvas ref={chromaCanvasRef} className="hidden" />
    </div>
  );
                }
