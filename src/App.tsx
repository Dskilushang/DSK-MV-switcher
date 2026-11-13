import { useState, useRef, useEffect } from 'react';
import { Settings, Radio, MonitorPlay, Zap } from 'lucide-react';
import TBar from './TBar';

export default function App() {
  // --- ÉTATS DU MÉLANGEUR ---
  const [programChannel, setProgramChannel] = useState(1);
  const [previewChannel, setPreviewChannel] = useState(2);
  const [isLive, setIsLive] = useState(false);
  const [isDskActive, setIsDskActive] = useState(false);
  const [isChromaActive, setIsChromaActive] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // --- GESTION DU LOGO ---
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- GESTION DES CAMÉRAS ---
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [remoteCameras, setRemoteCameras] = useState<{ [key: number]: string }>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Réglages pour le Live (Streaming)
const [streamKey, setStreamKey] = useState('');
const [streamUrl, setStreamUrl] = useState('rtmp://a.rtmp.youtube.com/live2');
  const remoteVideoRefs = useRef<{ [key: number]: HTMLVideoElement | null }>({});

  // --- GESTION DE L'ENREGISTREMENT ET CHROMA ---
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const chromaCanvasRef = useRef<HTMLCanvasElement>(null);
  const chromaAnimationRef = useRef<number | null>(null);

  // --- SIMULATION AUDIO ---
  const [audioLevels, setAudioLevels] = useState([40, 20, 60, 10, 80, 30, 50, 15]);

  // Demande d'accès à la caméra locale
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' },
          audio: false 
        });
        
        setCameraStream(stream);
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(e => console.log("Lecture bloquée :", e));
        }
        
      } catch (err) {
        console.error("Impossible d'accéder à la caméra :", err);
      }
    };

    startCamera();

    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Animation automatique des niveaux audio
  useEffect(() => {
    const interval = setInterval(() => {
      setAudioLevels(prevLevels => 
        prevLevels.map(level => {
          const change = Math.floor(Math.random() * 30) - 15;
          let newLevel = level + change;
          if (newLevel > 95) newLevel = 95;
          if (newLevel < 5) newLevel = 5;
          return newLevel;
        })
      );
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // --- LOGIQUE DU CHROMA KEY ---
  const applyChromaKey = (videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement) => {
    const ctx = canvasElement.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const drawFrame = () => {
      if (videoElement.paused || videoElement.ended) return;

      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
      ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

      const frame = ctx.getImageData(0, 0, canvasElement.width, canvasElement.height);
      const length = frame.data.length / 4;

      for (let i = 0; i < length; i++) {
        const r = frame.data[i * 4 + 0];
        const g = frame.data[i * 4 + 1];
        const b = frame.data[i * 4 + 2];

        // Détection du vert (Chroma Key)
        if (g > 100 && g > r * 1.4 && g > b * 1.4) {
          frame.data[i * 4 + 3] = 0; // Transparent
        }
      }
      
      ctx.putImageData(frame, 0, 0);
      chromaAnimationRef.current = requestAnimationFrame(drawFrame);
    };

    drawFrame();
  };

  // Activer/Désactiver le Chroma Key
  useEffect(() => {
    if (isChromaActive && localVideoRef.current && chromaCanvasRef.current) {
      applyChromaKey(localVideoRef.current, chromaCanvasRef.current);
    } else {
      if (chromaAnimationRef.current) {
        cancelAnimationFrame(chromaAnimationRef.current);
      }
    }
  }, [isChromaActive]);

  // Fonctions de transition
  const handleTransition = () => {
    const temp = programChannel;
    setProgramChannel(previewChannel);
    setPreviewChannel(temp);
  };

  const handleCut = () => {
    const temp = programChannel;
    setProgramChannel(previewChannel);
    setPreviewChannel(temp);
  };

  const handleAuto = () => {
    handleCut();
  };

  // Fonction pour démarrer ou arrêter l'enregistrement
  const toggleRecording = () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      if (cameraStream) {
        try {
          const recorder = new MediaRecorder(cameraStream, { mimeType: 'video/webm' });
          mediaRecorderRef.current = recorder;
          recordedChunks.current = [];

          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              recordedChunks.current.push(event.data);
            }
          };

          recorder.onstop = () => {
            const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            document.body.appendChild(a);
            a.style.display = 'none';
            a.href = url;
            a.download = `enregistrement_${new Date().getTime()}.webm`;
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
          };

          recorder.start();
          setIsRecording(true);
        } catch (err) {
          console.error("Erreur d'enregistrement :", err);
        }
      } else {
        alert("La caméra n'est pas prête.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans select-none overflow-hidden">
      
      {/* --- EN-TÊTE --- */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="bg-red-600 p-1.5 rounded-md">
            <MonitorPlay size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-widest uppercase leading-none">DSK - MV</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Mélangeur Vidéo</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Bouton REC */}
          <button 
            onClick={toggleRecording}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md font-bold text-xs transition-all ${
              isRecording 
                ? 'bg-red-600 text-white animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.6)]' 
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-white' : 'bg-red-500'}`} />
            {isRecording ? 'REC' : 'REC OFF'}
          </button>

          {isLive ? (
            <span className="flex items-center gap-1 text-xs font-bold text-red-500 animate-pulse">
              <Radio size={14} /> LIVE
            </span>
          ) : (
            <span className="text-xs font-bold text-slate-500">OFFLINE</span>
          )}
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-slate-400 hover:text-white transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* --- MULTIVIEW (8 CAMÉRAS) --- */}
      <main className="flex-1 p-2 grid grid-cols-2 gap-2 content-start">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((channel) => {
          const isProgram = programChannel === channel;
          const isPreview = previewChannel === channel;
          
          const borderColor = isProgram 
            ? 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' 
            : isPreview 
              ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' 
              : 'border-slate-800';

          return (
            <div 
              key={channel}
              onClick={() => setPreviewChannel(channel)}
              className={`relative aspect-video bg-slate-900 rounded-lg border-2 ${borderColor} overflow-hidden transition-all duration-200 cursor-pointer`}
            >
              {/* Affichage Caméra 1 */}
              {channel === 1 ? (
                <div className="absolute inset-0 w-full h-full">
                  <video 
                    ref={localVideoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className={`absolute inset-0 w-full h-full object-cover ${isChromaActive ? 'opacity-0' : 'opacity-80'}`}
                  />
                  {/* Canvas pour le Chroma Key */}
                  <canvas 
                    ref={chromaCanvasRef} 
                    className={`absolute inset-0 w-full h-full object-cover ${isChromaActive ? 'opacity-100 bg-slate-800' : 'opacity-0 hidden'}`}
                  />
                </div>
              ) : remoteCameras[channel] ? (
                <video 
                  ref={(el) => { remoteVideoRefs.current[channel] = el; }}
                  src={remoteCameras[channel]} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="absolute inset-0 w-full h-full object-cover opacity-80"
                />
              ) : (
                <div className="absolute inset-0 opacity-20 flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?q=80&w=300&auto=format&fit=crop')] bg-cover bg-center" />
              )}
              
              <div className="absolute top-1 left-1 bg-black/60 px-2 py-0.5 rounded text-xs font-bold z-10">
                CAM {channel}
              </div>
              
              {/* Badges */}
              {isProgram && <div className="absolute bottom-1 right-1 bg-red-600 px-2 py-0.5 rounded text-[10px] font-bold z-10">PROGRAM</div>}
              {isPreview && <div className="absolute bottom-1 right-1 bg-green-600 px-2 py-0.5 rounded text-[10px] font-bold z-10">PREVIEW</div>}

              {/* Effet PIP */}
              {isProgram && isPipActive && (
                <div className="absolute bottom-4 left-4 w-1/3 aspect-video bg-slate-800 border-2 border-orange-500 rounded-md overflow-hidden shadow-2xl z-20 flex items-center justify-center">
                  <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?q=80&w=300&auto=format&fit=crop')] bg-cover bg-center" />
                  <span className="relative z-10 text-2xl font-black text-white/50">CAM {previewChannel}</span>
                  <div className="absolute bottom-1 right-1 bg-orange-600 px-1.5 py-0.5 rounded text-[8px] font-bold z-10">PIP</div>
                </div>
              )}

              {/* Indicateur Chroma */}
              {isProgram && isChromaActive && (
                <div className="absolute inset-0 border-4 border-emerald-500 rounded-lg pointer-events-none animate-pulse z-10">
                  <div className="absolute top-2 left-2 bg-emerald-600 text-white px-2 py-1 rounded text-xs font-black shadow-lg">FOND VERT ACTIF</div>
                </div>
              )}

              {/* Logo DSK */}
              {isProgram && isDskActive && (
                <img 
                  src={customLogo || "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Direct8_logo.svg/200px-Direct8_logo.svg.png"} 
                  alt="Logo" 
                  className="absolute top-2 right-2 w-16 h-auto drop-shadow-md z-20"
                />
              )}

              {/* VU-mètre */}
              <div className="absolute bottom-0 left-0 right-0 h-1.5 flex gap-0.5 px-1 opacity-80 z-10">
                {[1, 2, 3, 4, 5].map((bar) => (
                  <div 
                    key={bar}
                    className={`flex-1 rounded-sm transition-all duration-300 ${
                      bar <= (audioLevels[channel - 1] / 20) 
                        ? (bar >= 4 ? 'bg-red-500' : bar >= 3 ? 'bg-yellow-500' : 'bg-green-500') 
                        : 'bg-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </main>

      {/* --- CONTRÔLES DU BAS --- */}
      <footer className="bg-slate-900 border-t border-slate-800 pb-4">
        
        {/* T-Bar */}
        <div className="px-4 py-2 flex items-center justify-between gap-4">
          <div className="flex flex-col text-center">
            <span className="text-xs font-bold text-red-500 mb-1">PROG</span>
            <span className="text-xs font-bold text-slate-500">CAM {programChannel}</span>
          </div>
          <div className="flex-1 h-32 flex justify-center items-center">
            <TBar onTransition={handleTransition} />
          </div>
          <div className="flex flex-col text-center">
            <span className="text-xs font-bold text-green-500 mb-1">PREV</span>
            <span className="text-xs font-bold text-slate-500">CAM {previewChannel}</span>
          </div>
        </div>

        {/* Boutons 1 à 8 */}
        <div className="grid grid-cols-4 gap-2 px-4 mb-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((ch) => {
            const isProgram = programChannel === ch;
            const isPreview = previewChannel === ch;
            return (
              <button
import { useState, useRef, useEffect } from 'react';
import { Settings, Radio, MonitorPlay, Zap, Snowflake } from 'lucide-react';
import TBar from './TBar';

export default function App() {
  // --- ÉTATS DU MÉLANGEUR ---
  const [programChannel, setProgramChannel] = useState(1);
  const [previewChannel, setPreviewChannel] = useState(2);
  const [isLive, setIsLive] = useState(false);
  const [isDskActive, setIsDskActive] = useState(false);
  const [isChromaActive, setIsChromaActive] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [transitionType, setTransitionType] = useState<'cut' | 'fade' | 'wipe'>('cut');
  
  // --- GESTION DU LOGO ---
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- GESTION DES CAMÉRAS ---
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [remoteCameras, setRemoteCameras] = useState<{ [key: number]: string }>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const remoteVideoRefs = useRef<{ [key: number]: HTMLVideoElement | null }>({});

  // --- GESTION DU LIVE (STREAMING) ---
  const [streamKey, setStreamKey] = useState('');
  const [streamUrl, setStreamUrl] = useState('rtmp://a.rtmp.youtube.com/live2');

  // --- GESTION DE L'ENREGISTREMENT ET CHROMA ---
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const chromaCanvasRef = useRef<HTMLCanvasElement>(null);
  const chromaAnimationRef = useRef<number | null>(null);

  // --- SIMULATION AUDIO ---
  const [audioLevels, setAudioLevels] = useState([40, 20, 60, 10, 80, 30, 50, 15]);

  // --- FONCTION D'ACTIVATION DE LA CAMÉRA ET DU MICRO ---
  const startCamera = async () => {
    try {
      // On ajoute audio: true pour demander le micro
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' },
        audio: true 
      });
      
      setCameraStream(stream);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(e => console.log("Lecture bloquée :", e));
      }
      
    } catch (err) {
      console.error("Impossible d'accéder à la caméra/micro :", err);
      alert("Veuillez autoriser l'accès à la caméra et au micro dans les paramètres de votre téléphone.");
    }
  };

  // Demande automatique au démarrage
  useEffect(() => {
    startCamera();

    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Animation automatique des niveaux audio
  useEffect(() => {
    const interval = setInterval(() => {
      setAudioLevels(prevLevels => 
        prevLevels.map(level => {
          const change = Math.floor(Math.random() * 30) - 15;
          let newLevel = level + change;
          if (newLevel > 95) newLevel = 95;
          if (newLevel < 5) newLevel = 5;
          return newLevel;
        })
      );
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // --- LOGIQUE DU CHROMA KEY ---
  const applyChromaKey = (videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement) => {
    const ctx = canvasElement.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const drawFrame = () => {
      if (videoElement.paused || videoElement.ended) return;

      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
      ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

      const frame = ctx.getImageData(0, 0, canvasElement.width, canvasElement.height);
      const length = frame.data.length / 4;

      for (let i = 0; i < length; i++) {
        const r = frame.data[i * 4 + 0];
        const g = frame.data[i * 4 + 1];
        const b = frame.data[i * 4 + 2];

        if (g > 100 && g > r * 1.4 && g > b * 1.4) {
          frame.data[i * 4 + 3] = 0; // Transparent
        }
      }
      
      ctx.putImageData(frame, 0, 0);
      chromaAnimationRef.current = requestAnimationFrame(drawFrame);
    };

    drawFrame();
  };

  useEffect(() => {
    if (isChromaActive && localVideoRef.current && chromaCanvasRef.current) {
      applyChromaKey(localVideoRef.current, chromaCanvasRef.current);
    } else {
      if (chromaAnimationRef.current) {
        cancelAnimationFrame(chromaAnimationRef.current);
      }
    }
  }, [isChromaActive]);

  // --- FONCTIONS DE TRANSITION ---
  const handleTransition = () => {
    // Si on est en FREEZE, on ne change pas de caméra
    if (isFrozen) return;
    
    const temp = programChannel;
    setProgramChannel(previewChannel);
    setPreviewChannel(temp);
  };

  const handleCut = () => {
    if (isFrozen) return;
    handleTransition();
  };

  const handleAuto = () => {
    if (isFrozen) return;
    // Ici, on simule les différents types de transition
    if (transitionType === 'cut') {
      handleTransition();
    } else if (transitionType === 'fade') {
      // Simulation d'un fondu (on change juste la caméra pour l'instant)
      handleTransition();
    } else if (transitionType === 'wipe') {
      // Simulation d'un volet
      handleTransition();
    }
  };

  // --- FONCTION ENREGISTREMENT ---
  const toggleRecording = () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      if (cameraStream) {
        try {
          const recorder = new MediaRecorder(cameraStream, { mimeType: 'video/webm' });
          mediaRecorderRef.current = recorder;
          recordedChunks.current = [];

          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              recordedChunks.current.push(event.data);
            }
          };

          recorder.onstop = () => {
            const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            document.body.appendChild(a);
            a.style.display = 'none';
            a.href = url;
            a.download = `enregistrement_${new Date().getTime()}.webm`;
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
          };

          recorder.start();
          setIsRecording(true);
        } catch (err) {
          console.error("Erreur d'enregistrement :", err);
        }
      } else {
        alert("La caméra n'est pas prête.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans select-none overflow-hidden">
      
      {/* --- EN-TÊTE --- */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="bg-red-600 p-1.5 rounded-md">
            <MonitorPlay size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-widest uppercase leading-none">DSK - MV</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Mélangeur Vidéo</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Bouton REC */}
          <button 
            onClick={toggleRecording}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md font-bold text-xs transition-all ${
              isRecording 
                ? 'bg-red-600 text-white animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.6)]' 
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-white' : 'bg-red-500'}`} />
            {isRecording ? 'REC' : 'REC OFF'}
          </button>

          {isLive ? (
            <span className="flex items-center gap-1 text-xs font-bold text-red-500 animate-pulse">
              <Radio size={14} /> LIVE
            </span>
          ) : (
            <span className="text-xs font-bold text-slate-500">OFFLINE</span>
          )}
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-slate-400 hover:text-white transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* --- MULTIVIEW (8 CAMÉRAS) --- */}
      <main className="flex-1 p-2 grid grid-cols-2 gap-2 content-start">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((channel) => {
          const isProgram = programChannel === channel;
          const isPreview = previewChannel === channel;
          
          const borderColor = isProgram 
            ? 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' 
            : isPreview 
              ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' 
              : 'border-slate-800';

          return (
            <div 
              key={channel}
              onClick={() => !isFrozen && setPreviewChannel(channel)}
              className={`relative aspect-video bg-slate-900 rounded-lg border-2 ${borderColor} overflow-hidden transition-all duration-200 cursor-pointer`}
            >
              {/* Affichage Caméra 1 */}
              {channel === 1 ? (
                <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-slate-900">
                  {cameraStream ? (
                    <>
                      <video 
                        ref={localVideoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className={`absolute inset-0 w-full h-full object-cover ${isChromaActive ? 'opacity-0' : 'opacity-80'}`}
                      />
                      <canvas 
                        ref={chromaCanvasRef} 
                        className={`absolute inset-0 w-full h-full object-cover ${isChromaActive ? 'opacity-100 bg-slate-800' : 'opacity-0 hidden'}`}
                      />
                    </>
                  ) : (
                    <button 
                      onClick={startCamera}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-sm z-20 shadow-lg animate-pulse"
                    >
                      Activer la Caméra
                    </button>
                  )}
                </div>
              ) : remoteCameras[channel] ? (
                <video 
                  ref={(el) => { remoteVideoRefs.current[channel] = el; }}
                  src={remoteCameras[channel]} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="absolute inset-0 w-full h-full object-cover opacity-80"
                />
              ) : (
                <div className="absolute inset-0 opacity-20 flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?q=80&w=300&auto=format&fit=crop')] bg-cover bg-center" />
              )}
              
              <div className="absolute top-1 left-1 bg-black/60 px-2 py-0.5 rounded text-xs font-bold z-10">
                CAM {channel}
              </div>
              
              {/* Badges */}
              {isProgram && <div className="absolute bottom-1 right-1 bg-red-600 px-2 py-0.5 rounded text-[10px] font-bold z-10">PROGRAM</div>}
              {isPreview && <div className="absolute bottom-1 right-1 bg-green-600 px-2 py-0.5 rounded text-[10px] font-bold z-10">PREVIEW</div>}

              {/* Effet PIP */}
              {isProgram && isPipActive && (
                <div className="absolute bottom-4 left-4 w-1/3 aspect-video bg-slate-800 border-2 border-orange-500 rounded-md overflow-hidden shadow-2xl z-20 flex items-center justify-center">
                  <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?q=80&w=300&auto=format&fit=crop')] bg-cover bg-center" />
                  <span className="relative z-10 text-2xl font-black text-white/50">CAM {previewChannel}</span>
                  <div className="absolute bottom-1 right-1 bg-orange-600 px-1.5 py-0.5 rounded text-[8px] font-bold z-10">PIP</div>
                </div>
              )}

              {/* Indicateur Chroma */}
              {isProgram && isChromaActive && (
                <div className="absolute inset-0 border-4 border-emerald-500 rounded-lg pointer-events-none animate-pulse z-10">
                  <div className="absolute top-2 left-2 bg-emerald-600 text-white px-2 py-1 rounded text-xs font-black shadow-lg">FOND VERT</div>
                </div>
              )}

              {/* Overlay FREEZE */}
              {isProgram && isFrozen && (
                <div className="absolute inset-0 bg-blue-500/30 flex items-center justify-center z-30">
                  <span className="bg-blue-600 text-white px-3 py-1 rounded font-bold text-lg flex items-center gap-2">
                    <Snowflake size={20} /> FIGÉ
                  </span>
                </div>
              )}

              {/* Logo DSK */}
              {isProgram && isDskActive && (
                <img 
                  src={customLogo || "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Direct8_logo.svg/200px-Direct8_logo.svg.png"} 
                  alt="Logo" 
                  className="absolute top-2 right-2 w-16 h-auto drop-shadow-md z-20"
                />
              )}

              {/* VU-mètre */}
              <div className="absolute bottom-0 left-0 right-0 h-1.5 flex gap-0.5 px-1 opacity-80 z-10">
                {[1, 2, 3, 4, 5].map((bar) => (
                  <div 
                    key={bar}
                    className={`flex-1 rounded-sm transition-all duration-300 ${
                      bar <= (audioLevels[channel - 1] / 20) 
                        ? (bar >= 4 ? 'bg-red-500' : bar >= 3 ? 'bg-yellow-500' : 'bg-green-500') 
                        : 'bg-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </main>

      {/* --- CONTRÔLES DU BAS --- */}
      <footer className="bg-slate-900 border-t border-slate-800 pb-4">
        
        {/* T-Bar */}
        <div className="px-4 py-2 flex items-center justify-between gap-4">
          <div className="flex flex-col text-center">
            <span className="text-xs font-bold text-red-500 mb-1">PROG</span>
            <span className="text-xs font-bold text-slate-500">CAM {programChannel}</span>
          </div>
          <div className="flex-1 h-32 flex justify-center items-center">
            <TBar onTransition={handleTransition} disabled={isFrozen} />
          </div>
          <div className="flex flex-col text-center">
            <span className="text-xs font-bold text-green-500 mb-1">PREV</span>
            <span className="text-xs font-bold text-slate-500">CAM {previewChannel}</span>
          </div>
        </div>

        {/* Boutons 1 à 8 */}
        <div className="grid grid-cols-4 gap-2 px-4 mb-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((ch) => {
            const isProgram = programChannel === ch;
            const isPreview = previewChannel === ch;
            return (
              <button
                key={ch}
                onClick={() => !isFrozen && setPreviewChannel(ch)}
                disabled={isFrozen}
                className={`py-3 rounded-md font-bold text-lg border-b-4 transition-all active:border-b-0 active:translate-y-1 ${
                  isProgram ? 'bg-red-600 border-red-800 text-white' :
                  isPreview ? 'bg-green-600 border-green-800 text-white' :
                  'bg-slate-800 border-slate-950 text-slate-300'
                } ${isFrozen ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {ch}
              </button>
            );
          })}
        </div>

        {/* Choix Logo */}
        <input 
          type="file" 
          accept="image/*" 
          ref={fileInputRef} 
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setCustomLogo(URL.createObjectURL(file));
          }}
          className="hidden" 
        />
        <div className="flex gap-4 px-4 mb-4">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-md font-bold text-sm border-b-2 border-slate-950 transition-all"
          >
            Choisir un Logo
          </button>
        </div>

        {/* Boutons Effets (Chroma, PIP, DSK, FREEZE) */}
        <div className="grid grid-cols-4 gap-2 px-4 mb-4">
          <button 
            onClick={() => setIsChromaActive(!isChromaActive)}
            className={`py-2 rounded-md font-bold text-[10px] border-b-2 transition-all active:border-b-0 active:translate-y-0.5 ${
              isChromaActive ? 'bg-emerald-600 border-emerald-800 text-white' : 'bg-slate-800 border-slate-950 text-slate-400'
            }`}
          >
            {isChromaActive ? 'CHROMA ON' : 'CHROMA OFF'}
          </button>
          <button 
            onClick={() => setIsPipActive(!isPipActive)}
            className={`py-2 rounded-md font-bold text-[10px] border-b-2 transition-all active:border-b-0 active:translate-y-0.5 ${
              isPipActive ? 'bg-orange-600 border-orange-800 text-white' : 'bg-slate-800 border-slate-950 text-slate-400'
            }`}
          >
            {isPipActive ? 'PIP ON' : 'PIP OFF'}
          </button>
          <button 
            onClick={() => setIsDskActive(!isDskActive)}
            className={`py-2 rounded-md font-bold text-[10px] border-b-2 transition-all active:border-b-0 active:translate-y-0.5 ${
              isDskActive ? 'bg-purple-600 border-purple-800 text-white' : 'bg-slate-800 border-slate-950 text-slate-400'
            }`}
          >
            {isDskActive ? 'DSK ON' : 'DSK OFF'}
          </button>
          {/* BOUTON FREEZE */}
          <button 
            onClick={() => setIsFrozen(!isFrozen)}
            className={`py-2 rounded-md font-bold text-[10px] border-b-2 transition-all active:border-b-0 active:translate-y-0.5 flex items-center justify-center gap-1 ${
              isFrozen ? 'bg-blue-600 border-blue-800 text-white animate-pulse' : 'bg-slate-800 border-slate-950 text-slate-400'
            }`}
          >
            <Snowflake size={12} /> {isFrozen ? 'FREEZE ON' : 'FREEZE'}
          </button>
        </div>

        {/* Sélecteur de Transition */}
        <div className="flex justify-center gap-2 px-4 mb-3">
          {(['cut', 'fade', 'wipe'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setTransitionType(type)}
              className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-all ${
                transitionType === type ? 'bg-slate-600 text-white' : 'bg-slate-900 text-slate-500'
              }`}
            >
              {type === 'cut' ? 'CUT' : type === 'fade' ? 'FONDU' : 'VOLET'}
            </button>
          ))}
        </div>

        {/* CUT et AUTO */}
        <div className="flex gap-4 px-4">
          <button onClick={handleCut} disabled={isFrozen} className={`flex-1 bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-lg font-black text-xl border-b-4 border-slate-900 active:border-b-0 active:translate-y-1 transition-all ${isFrozen ? 
