import { useState, useRef, useEffect } from 'react';
import { Settings, Radio, MonitorPlay, Zap, Move, X } from 'lucide-react';
import TBar from './TBar';
import DskPanel, { type DskLayer } from './DskPanel';
import AudioMixerPanel from './AudioMixerPanel';
import { CameraLanReceiver, type CameraReceiverStatus } from './video/CameraLanReceiver';
import { connectObs, disconnectObs, getSceneList, getObsStreamActive, registerCallbacks, setProgramScene, startObsStream, stopObsStream, type ObsStatus } from './services/obsService';

export default function App() {
  // --- ÉTATS DU MÉLANGEUR ---
  const [programChannel, setProgramChannel] = useState(1);
  const [previewChannel, setPreviewChannel] = useState(2);
  const [isLive, setIsLive] = useState(false);
  const [isLiveBusy, setIsLiveBusy] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMessage, setRecordingMessage] = useState('');
  const [programAudioStream, setProgramAudioStream] = useState<MediaStream | null>(null);
  
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
  const [obsHost, setObsHost] = useState('192.168.1.100');
  const [obsPort, setObsPort] = useState('4455');
  const [obsPassword, setObsPassword] = useState('');
  const [obsStatus, setObsStatus] = useState<ObsStatus>('disconnected');
  const [obsMessage, setObsMessage] = useState('Non connecté');
  const [obsCurrentScene, setObsCurrentScene] = useState('');
  const [obsScenes, setObsScenes] = useState<string[]>([]);
  const [isLoadingObsScenes, setIsLoadingObsScenes] = useState(false);
  const [obsActionMessage, setObsActionMessage] = useState('');

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
      setCameraError(messages[error.name] || error.message || "Impossible d'activer la caméra.");
    }
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
  const connectRemoteCameras = () => {
    try {
      void cameraReceiverRef.current?.disconnect();
      const receiver = new CameraLanReceiver(
        (status) => {
          setCameraReceiverStatuses((current) => ({ ...current, [status.cameraId]: status.state }));
          if (status.state === 'error') setCameraReceiverMessage(`CAM ${status.cameraId} : ${status.message || 'Erreur vidéo.'}`);
        },
        (cameraId, stream) => setRemoteCameraStreams((current) => ({ ...current, [cameraId]: stream }))
      );
      receiver.connect(cameraReceiverHost, Number(cameraReceiverPort), cameraReceiverToken);
      cameraReceiverRef.current = receiver;
      setCameraReceiverStatuses({});
      setCameraReceiverMessage('Recherche des téléphones DSK Camera sur le réseau local…');
    } catch (error) {
      setCameraReceiverMessage(error instanceof Error ? error.message : 'Connexion vidéo impossible.');
    }
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

    const video = programChannel === 1
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
  }, [isChromaActive, programChannel, cameraStream, remoteCameraStreams, chromaKeyColor, chromaThreshold]);

  // --- MOTEUR DU CANVAS (GÈRE LE FREEZE, LE FONDU ET LE LOGO) ---
  useEffect(() => {
    let frameId: number;
    const canvas = programCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Si on est en freeze, on arrête la boucle pour figer l'image
    if (isFrozen) return;

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
        const sourceVideo = ch === 1 ? localVideoRef.current : remoteVideoRefs.current[ch];
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
        const pipVideo = pipSourceChannel === 1
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
        const logoImg = new Image();
        logoImg.src = customLogo;
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
      frameId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frameId);
  }, [programChannel, previewChannel, remoteCameraStreams, programZoom, isLogoActive, customLogo, logoPos, isFrozen, isChromaActive, isPipActive, pipSourceChannel, pipScale, pipPosition, dskLayers]);

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
    const stream = previewChannel === 1 ? cameraStream : remoteCameraStreams[previewChannel] || null;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
    else video.pause();
  }, [previewChannel, cameraStream, remoteCameraStreams]);

  // --- PREVIEW DIRECT ---
  useEffect(() => {
    if (isProgramViewOpen && programCanvasRef.current && programPreviewVideoRef.current) {
      const stream = programCanvasRef.current.captureStream(30);
      programPreviewVideoRef.current.srcObject = stream;
      programPreviewVideoRef.current.play().catch(e => console.log(e));
    }
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
  const toggleRecording = () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    if (!programCanvasRef.current) {
      setRecordingMessage('Canvas PGM indisponible.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setRecordingMessage('MediaRecorder non pris en charge sur cet appareil.');
      return;
    }

    let videoStream: MediaStream | null = null;
    try {
      videoStream = programCanvasRef.current.captureStream(30);
      recordingVideoStreamRef.current = videoStream;
      const audioTracks = programAudioStream?.getAudioTracks() || [];
      const recordingStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioTracks
      ]);
      const mimeType = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType
        ? new MediaRecorder(recordingStream, { mimeType })
        : new MediaRecorder(recordingStream);

      mediaRecorderRef.current = recorder;
      recordedChunks.current = [];
      setRecordingMessage(audioTracks.length ? 'REC · PGM vidéo + audio stéréo' : 'REC · vidéo seule (moteur audio non activé)');
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunks.current.push(event.data);
      };
      recorder.onerror = () => {
        setRecordingMessage('Erreur MediaRecorder pendant la capture.');
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunks.current, { type: recorder.mimeType || 'video/webm' });
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `DSK-MV_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
          anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 30000);
          setRecordingMessage('Enregistrement terminé · fichier WebM téléchargé.');
        } else {
          setRecordingMessage('Enregistrement vide : aucune donnée reçue.');
        }
        recordingVideoStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingVideoStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);
      };
      recorder.start(1000);
      setIsRecording(true);
    } catch (error) {
      videoStream?.getTracks().forEach((track) => track.stop());
      recordingVideoStreamRef.current = null;
      setIsRecording(false);
      setRecordingMessage(error instanceof Error ? error.message : 'Impossible de démarrer l’enregistrement.');
    }
  };

  // LIVE pilote le moteur de diffusion OBS lorsqu’il est connecté.
  const toggleLive = async () => {
    if (obsStatus !== 'connected') {
      setLiveMessage('Connectez d’abord DSK à OBS dans les réglages.');
      setIsSettingsOpen(true);
      return;
    }

    setIsLiveBusy(true);
    setLiveMessage('');
    try {
      const streamActive = await getObsStreamActive();
      if (streamActive) {
        await stopObsStream();
        setIsLive(false);
        setLiveMessage('Diffusion OBS arrêtée.');
      } else {
        await startObsStream();
        const confirmed = await getObsStreamActive();
        setIsLive(confirmed);
        setLiveMessage(confirmed ? 'Diffusion OBS active.' : 'OBS n’a pas confirmé le démarrage du direct.');
      }
    } catch (error) {
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
          <button onClick={() => setIsSettingsOpen(true)} className="p-1 text-slate-400"><Settings size={18} /></button>
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
        </div>

        {/* CENTRE : MultiView */}
        <main className="flex-1 bg-black p-1 flex flex-col gap-1 overflow-hidden">
          <div className="h-[34%] min-h-0 grid grid-cols-2 gap-1">
            <div className="relative min-w-0 min-h-0 bg-slate-950 border border-red-600 rounded overflow-hidden">
              <video ref={programMonitorRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-contain" />
              <span className="absolute top-1 left-1 bg-red-600 text-white text-[9px] font-black px-2 py-1 rounded z-10">PGM · PROGRAM</span>
            </div>
            <div className="relative min-w-0 min-h-0 bg-slate-950 border border-emerald-600 rounded overflow-hidden">
              <video ref={previewMonitorRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-contain" />
              <span className="absolute top-1 left-1 bg-emerald-600 text-white text-[9px] font-black px-2 py-1 rounded z-10">PVW · PREVIEW</span>
            </div>
          </div>
          <div className="flex-1 min-h-0 grid grid-cols-4 grid-rows-2 gap-1 overflow-hidden">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((channel) => {
            const isP = programChannel === channel;
            const isV = previewChannel === channel;
            return (
              <div key={channel} onClick={() => !isFrozen && !isAutoTransitioning && setPreviewChannel(channel)} className={`relative bg-slate-900 rounded border-2 ${isP ? 'border-red-500' : isV ? 'border-green-500' : 'border-slate-800'} overflow-hidden cursor-pointer pointer-events-auto`}>
                {channel === 1 ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                    {cameraStream ? <video ref={localVideoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" /> : <div className="z-20 flex flex-col items-center gap-1 px-1"><button onClick={(event) => { event.stopPropagation(); void startCamera(); }} disabled={cameraStatus === 'requesting'} className="bg-red-600 disabled:bg-slate-600 text-white px-2 py-1 rounded text-[10px] pointer-events-auto">{cameraStatus === 'requesting' ? 'Activation…' : 'Activer'}</button>{cameraError && <span role="alert" className="max-w-full text-center text-[8px] leading-tight text-red-300">{cameraError}</span>}</div>}
                  </div>
                ) : remoteCameraStreams[channel] ? (
                  <video ref={(el) => { remoteVideoRefs.current[channel] = el; }} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?q=80&w=300&auto=format&fit=crop')] bg-cover bg-center" />
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

        {/* Matrice 1 à 8 (FLEX pour tout faire tenir) */}
        <div className="flex flex-row flex-1 justify-between gap-1 min-w-0">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((ch) => {
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
        </div>
        
        <div className="w-8 text-right text-[8px] text-slate-500 font-bold shrink-0">DSK-MV</div>
      </footer>

      {/* MODALES */}
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
                <p className="text-xs font-bold text-sky-300">DSK VIDEO · CAM 2 À CAM 8</p>
                <span className="text-[9px] text-slate-400">{Object.values(cameraReceiverStatuses).filter((status) => status === 'connected').length}/7 reçues</span>
              </div>
              <label className="block text-[10px] text-slate-400">IP DU PC DSK RECEIVER</label>
              <input type="text" value={cameraReceiverHost} onChange={(e) => setCameraReceiverHost(e.target.value)} placeholder="192.168.1.100" className="w-full bg-slate-800 text-white text-xs px-2 py-2 rounded border border-slate-600" />
              <label className="block text-[10px] text-slate-400">PORT VIDÉO</label>
              <input type="number" min="1" max="65535" value={cameraReceiverPort} onChange={(e) => setCameraReceiverPort(e.target.value)} className="w-full bg-slate-800 text-white text-xs px-2 py-2 rounded border border-slate-600" />
              <label className="block text-[10px] text-slate-400">CODE D’ASSOCIATION</label>
              <input type="password" autoComplete="off" value={cameraReceiverToken} onChange={(e) => setCameraReceiverToken(e.target.value)} placeholder="Code affiché sur le PC" className="w-full bg-slate-800 text-white text-xs px-2 py-2 rounded border border-slate-600" />
              <div className="flex gap-2">
                <button onClick={connectRemoteCameras} disabled={!cameraReceiverHost.trim() || cameraReceiverToken.trim().length < 16} className="flex-1 bg-sky-700 disabled:opacity-40 text-white py-2 rounded text-[10px] font-bold">CONNECTER CAM 2–8</button>
                <button onClick={disconnectRemoteCameras} className="flex-1 bg-slate-700 text-white py-2 rounded text-[10px] font-bold">DÉCONNECTER</button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[2,3,4,5,6,7,8].map((cam) => (
                  <div key={cam} className="rounded bg-slate-800 px-2 py-1 text-[9px] flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${cameraReceiverStatuses[cam] === 'connected' ? 'bg-emerald-400' : cameraReceiverStatuses[cam] === 'error' ? 'bg-red-400' : 'bg-slate-600'}`} />
                    <span>CAM {cam}</span>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-slate-400">{cameraReceiverMessage}</p>
              <p className="text-[9px] text-amber-300">Sur chaque téléphone : ouvrez http://IP_DU_PC:8765/camera, choisissez CAM 2 à CAM 8 et saisissez le code. L’accès caméra du navigateur exige HTTPS ou l’application native DSK Camera ; une simple page HTTP sur IP locale peut être bloquée par Android.</p>
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
            <p className="text-xs text-slate-400">Détourage appliqué à la source actuellement en PGM : CAM {programChannel}. Utilisez un fond vert ou bleu uniforme et un éclairage régulier.</p>
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
              {[1,2,3,4,5,6,7,8].map((channel) => <option key={channel} value={channel}>CAM {channel}</option>)}
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

      <AudioMixerPanel open={isAudioPanelOpen} onClose={() => setIsAudioPanelOpen(false)} onProgramStreamChange={setProgramAudioStream} />

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
