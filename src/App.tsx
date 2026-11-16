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
  // --- GESTION AUDIO ---
const [isAudioMuted, setIsAudioMuted] = useState(false);
const [audioVolume, setAudioVolume] = useState(1);
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
  // Référence pour le contrôle du volume audio
const audioContextRef = useRef<AudioContext | null>(null);
const gainNodeRef = useRef<GainNode | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const chromaCanvasRef = useRef<HTMLCanvasElement>(null);
  const chromaAnimationRef = useRef<number | null>(null);

  // --- SIMULATION AUDIO ---
  const [audioLevels, setAudioLevels] = useState([40, 20, 60, 10, 80, 30, 50, 15]);

  // --- FONCTION D'ACTIVATION DE LA CAMÉRA ET DU MICRO ---
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' },
        audio: true 
      });
      
      setCameraStream(stream);
      // Initialisation du contrôle de volume
if (!audioContextRef.current) {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  audioContextRef.current = new AudioContext();
  gainNodeRef.current = audioContextRef.current.createGain();
  
  const source = audioContextRef.current.createMediaStreamSource(stream);
  source.connect(gainNodeRef.current);
  gainNodeRef.current.connect(audioContextRef.current.destination);
}
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(e => console.log("Lecture bloquée :", e));
      }
      
    } catch (err) {
      console.error("Impossible d'accéder à la caméra/micro :", err);
      alert("Veuillez autoriser l'accès à la caméra et au micro dans les paramètres de votre téléphone.");
    }
  };

  useEffect(() => {
    startCamera();

    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

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
          frame.data[i * 4 + 3] = 0;
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
  handleTransition();
};

// --- MOTEUR DE CAPTURE DU PROGRAM OUT (POUR LE LIVE ET OBS) ---
useEffect(() => {
  let animationFrameId: number;
  const canvas = programCanvasRef.current;
  
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const drawProgram = () => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (programChannel === 1 && localVideoRef.current) {
      if (isChromaActive && chromaCanvasRef.current) {
        ctx.drawImage(chromaCanvasRef.current, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.drawImage(localVideoRef.current, 0, 0, canvas.width, canvas.height);
      }
    } else if (remoteCameras[programChannel] && remoteVideoRefs.current[programChannel]) {
      ctx.drawImage(remoteVideoRefs.current[programChannel]!, 0, 0, canvas.width, canvas.height);
    }

    if (isDskActive && customLogo) {
      const logoImg = new Image();
      logoImg.src = customLogo;
      if (logoImg.complete) {
        ctx.drawImage(logoImg, canvas.width - 150, 20, 130, 0);
      }
    }

    animationFrameId = requestAnimationFrame(drawProgram);
  };

  drawProgram();
  return () => cancelAnimationFrame(animationFrameId);
}, [programChannel, remoteCameras, isDskActive, isChromaActive, customLogo]);

// --- FONCTION ENREGISTREMENT ---
const toggleRecording = () => {
  if (isRecording) {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  } else {
    if (programCanvasRef.current) {
      try {
        const canvasStream = programCanvasRef.current.captureStream(30);
        const audioTracks = cameraStream ? cameraStream.getAudioTracks() : [];
        const combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...audioTracks
        ]);
        
        const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
        mediaRecorderRef.current = recorder;
        recordedChunks.current = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) recordedChunks.current.push(event.data);
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
      alert("Le mélangeur n'est pas prêt.");
    }
  }
};

// --- FONCTION POUR LE DIRECT (LIVE) ---
const toggleLive = () => {
  if (isLive) {
    setIsLive(false);
  } else {
    if (!streamUrl || !streamKey) {
      alert("Veuillez configurer l'URL et la clé de flux dans les réglages.");
      setIsSettingsOpen(true);
      return;
    }

    if (programCanvasRef.current) {
      try {
        setIsLive(true);
        alert("Connexion au direct établie !");
      } catch (err) {
        console.error("Erreur lors du démarrage du live :", err);
      }
    }
  }
};

    return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans select-none overflow-hidden">
      
      {/* --- EN-TÊTE --- */}
      <header className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
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
          <button 
            onClick={toggleRecording}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md font-bold text-xs transition-all ${
              isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-white' : 'bg-red-500'}`} />
            {isRecording ? 'REC' : 'REC OFF'}
          </button>

          <button 
            onClick={toggleLive}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md font-bold text-xs transition-all ${
              isLive ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {isLive ? <><Radio size={14} /> LIVE</> : 'OFFLINE'}
          </button>

          <button 
            onClick={() => setIsProgramViewOpen(true)}
            className="p-2 text-red-500 hover:text-red-400 transition-colors animate-pulse"
          >
            <MonitorPlay size={20} />
          </button>

          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-slate-400 hover:text-white transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* --- ZONE PRINCIPALE (3 Colonnes) --- */}
      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* COLONNE GAUCHE : Boutons d'effets */}
        <div className="w-16 md:w-20 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-4 gap-3 overflow-y-auto shrink-0">
          <button onClick={() => setIsChromaActive(!isChromaActive)} className={`w-12 h-12 rounded-md text-[10px] font-bold border-b-2 flex flex-col items-center justify-center ${isChromaActive ? 'bg-emerald-600 border-emerald-800 text-white' : 'bg-slate-800 border-slate-950 text-slate-400'}`}>
            CHROMA
          </button>
          <button onClick={() => setIsPipActive(!isPipActive)} className={`w-12 h-12 rounded-md text-[10px] font-bold border-b-2 flex flex-col items-center justify-center ${isPipActive ? 'bg-orange-600 border-orange-800 text-white' : 'bg-slate-800 border-slate-950 text-slate-400'}`}>
            PIP
          </button>
          <button onClick={() => setIsDskActive(!isDskActive)} className={`w-12 h-12 rounded-md text-[10px] font-bold border-b-2 flex flex-col items-center justify-center ${isDskActive ? 'bg-purple-600 border-purple-800 text-white' : 'bg-slate-800 border-slate-950 text-slate-400'}`}>
            DSK
          </button>
          <button onClick={() => setIsFrozen(!isFrozen)} className={`w-12 h-12 rounded-md text-[10px] font-bold border-b-2 flex flex-col items-center justify-center ${isFrozen ? 'bg-blue-600 border-blue-800 text-white' : 'bg-slate-800 border-slate-950 text-slate-400'}`}>
            <Snowflake size={14} />
          </button>
          <div className="w-full h-px bg-slate-700 my-2"></div>
          <button onClick={toggleAudio} className={`w-12 h-12 rounded-md text-[10px] font-bold border-b-2 flex flex-col items-center justify-center ${isAudioMuted ? 'bg-red-600 border-red-800 text-white' : 'bg-slate-800 border-slate-950 text-slate-400'}`}>
            {isAudioMuted ? 'MUTE' : 'AUDIO'}
          </button>
        </div>

        {/* COLONNE CENTRALE : MultiView */}
        <main className="flex-1 bg-black p-2 grid grid-cols-2 md:grid-cols-4 gap-2 content-start overflow-y-auto">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((channel) => {
            const isProgram = programChannel === channel;
            const isPreview = previewChannel === channel;
            const borderColor = isProgram ? 'border-red-500' : isPreview ? 'border-green-500' : 'border-slate-800';

            return (
              <div key={channel} onClick={() => !isFrozen && setPreviewChannel(channel)} className={`relative aspect-video bg-slate-900 rounded-lg border-2 ${borderColor} overflow-hidden cursor-pointer`}>
                {channel === 1 ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                    {cameraStream ? (
                      <video ref={localVideoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-80" />
                    ) : (
                      <button onClick={startCamera} className="bg-red-600 text-white px-2 py-1 rounded text-xs z-20 animate-pulse">Activer</button>
                    )}
                  </div>
                ) : remoteCameras[channel] ? (
                  <video ref={(el) => { remoteVideoRefs.current[channel] = el; }} src={remoteCameras[channel]} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-80" />
                ) : (
                  <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?q=80&w=300&auto=format&fit=crop')] bg-cover bg-center" />
                )}
                <div className="absolute top-1 left-1 bg-black/60 px-2 py-0.5 rounded text-[10px] font-bold z-10">CAM {channel}</div>
                {isProgram && <div className="absolute bottom-1 right-1 bg-red-600 px-2 py-0.5 rounded text-[8px] font-bold z-10">PGM</div>}
                {isPreview && <div className="absolute bottom-1 right-1 bg-green-600 px-2 py-0.5 rounded text-[8px] font-bold z-10">PVW</div>}
              </div>
            );
          })}
        </main>

        {/* COLONNE DROITE : T-Bar et Transitions */}
        <div className="w-20 md:w-28 bg-slate-900 border-l border-slate-800 flex flex-col items-center py-4 gap-4 shrink-0">
          <div className="flex-1 flex items-center justify-center w-full">
             <TBar onTransition={handleTransition} disabled={isFrozen} />
          </div>
          <div className="flex flex-col w-full px-2 gap-2">
            <button onClick={handleCut} disabled={isFrozen} className="w-full bg-slate-700 text-white py-3 rounded font-black text-sm border-b-4 border-slate-900 active:border-b-0 active:translate-y-1">CUT</button>
            <button onClick={handleAuto} disabled={isFrozen} className="w-full bg-blue-600 text-white py-3 rounded font-black text-sm border-b-4 border-blue-800 active:border-b-0 active:translate-y-1">AUTO</button>
          </div>
        </div>
      </div>

      {/* --- BARRE INFÉRIEURE : Matrice 1-8 et Joystick --- */}
      <footer className="h-32 bg-slate-950 border-t border-slate-800 flex items-center justify-between px-4 shrink-0">
        {/* Joystick */}
        <div className="w-16 h-16 bg-slate-800 rounded-full border-4 border-slate-700 flex items-center justify-center shadow-inner">
           <div className="w-6 h-6 bg-slate-600 rounded-full"></div>
        </div>

        {/* Boutons 1 à 8 */}
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((ch) => {
            const isProgram = programChannel === ch;
            const isPreview = previewChannel === ch;
            return (
              <button key={ch} onClick={() => !isFrozen && setPreviewChannel(ch)} disabled={isFrozen} className={`w-12 h-12 rounded-md font-bold text-lg border-b-4 transition-all active:border-b-0 active:translate-y-1 ${isProgram ? 'bg-red-600 border-red-800 text-white' : isPreview ? 'bg-green-600 border-green-800 text-white' : 'bg-slate-800 border-slate-900 text-slate-300'}`}>
                {ch}
              </button>
            );
          })}
        </div>

        {/* Logo / Fin */}
        <div className="w-16 text-right text-[10px] text-slate-500 font-bold">DSK-MV<br/>PRO</div>
      </footer>

      {/* --- MODALES --- */}
      {isSettingsOpen && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-800 rounded-lg p-4 w-full max-w-sm border border-slate-600 shadow-2xl my-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white">Réglages</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white text-xl font-bold">✕</button>
            </div>
            <div className="mb-4">
              <h3 className="text-sm font-bold text-white mb-2">Caméras Distantes (Wi-Fi)</h3>
              <div className="space-y-2">
                {[2, 3, 4, 5, 6, 7, 8].map((cam) => (
                  <div key={cam} className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-300 w-12">CAM {cam}</span>
                    <input type="text" placeholder="http://..." value={remoteCameras[cam] || ''} onChange={(e) => setRemoteCameras({...remoteCameras, [cam]: e.target.value})} className="flex-1 bg-slate-900 text-white text-xs px-2 py-1.5 rounded border border-slate-600 outline-none" />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 border-t border-slate-700 pt-4">
              <h3 className="text-sm font-bold text-white mb-2">Configuration du Direct</h3>
              <div className="space-y-2">
                <input type="text" placeholder="rtmp://..." value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} className="w-full bg-slate-900 text-white text-xs px-2 py-1.5 rounded border border-slate-600 outline-none" />
                <input type="password" placeholder="Clé de flux" value={streamKey} onChange={(e) => setStreamKey(e.target.value)} className="w-full bg-slate-900 text-white text-xs px-2 py-1.5 rounded border border-slate-600 outline-none" />
              </div>
            </div>
            <button onClick={() => setIsSettingsOpen(false)} className="w-full mt-6 bg-blue-600 text-white py-2 rounded font-bold">Enregistrer et Fermer</button>
          </div>
        </div>
      )}

      {isProgramViewOpen && (
        <div className="absolute inset-0 bg-black z-[100] flex flex-col">
          <div className="flex justify-between items-center p-4 bg-slate-900 border-b border-slate-800">
            <h2 className="text-lg font-bold text-red-500 flex items-center gap-2"><Radio className="animate-pulse" /> DIRECT</h2>
            <button onClick={() => setIsProgramViewOpen(false)} className="text-white text-2xl font-bold bg-slate-800 px-3 rounded">✕</button>
          </div>
          <div className="flex-1 flex items-center justify-center p-2 bg-black">
            <video ref={programPreviewVideoRef} autoPlay playsInline muted className="w-full max-w-4xl aspect-video object-contain bg-slate-900 border-2 border-slate-800 rounded-lg shadow-2xl" />
          </div>
        </div>
      )}

      <canvas ref={programCanvasRef} width={1280} height={720} className="hidden" />
    </div>
  );
      }
            
