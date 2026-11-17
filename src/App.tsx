import { useState, useRef, useEffect } from 'react';
import { Settings, Radio, MonitorPlay, Zap, Move } from 'lucide-react';
import TBar from './TBar';

export default function App() {
  // --- ÉTATS DU MÉLANGEUR ---
  const [programChannel, setProgramChannel] = useState(1);
  const [previewChannel, setPreviewChannel] = useState(2);
  const [isLive, setIsLive] = useState(false);
  const [isLogoActive, setIsLogoActive] = useState(false);
  const [isChromaActive, setIsChromaActive] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  
  // --- CONTRÔLES DU JOYSTICK ET T-BAR ---
  const [transitionSpeed, setTransitionSpeed] = useState(1000); 
  const [programZoom, setProgramZoom] = useState(1); 
  const [joystickMode, setJoystickMode] = useState<'zoom' | 'logo'>('zoom'); 
  const [logoPos, setLogoPos] = useState({ x: 50, y: 10 }); 
  const [tBarProgress, setTBarProgress] = useState(0); 

  // --- LOGO ET CAMÉRAS ---
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [remoteCameras, setRemoteCameras] = useState<{ [key: number]: string }>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const remoteVideoRefs = useRef<{ [key: number]: HTMLVideoElement | null }>({});

  // --- LIVE, REC ET CANVAS ---
  const [streamKey, setStreamKey] = useState('');
  const [streamUrl, setStreamUrl] = useState('rtmp://a.rtmp.youtube.com/live2');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const chromaCanvasRef = useRef<HTMLCanvasElement>(null);
  const chromaAnimationRef = useRef<number | null>(null);
  const programCanvasRef = useRef<HTMLCanvasElement>(null);
  const programPreviewVideoRef = useRef<HTMLVideoElement>(null);
  const [isProgramViewOpen, setIsProgramViewOpen] = useState(false);

  // --- AUDIO ET JOYSTICK ---
  const [audioLevels, setAudioLevels] = useState([40, 20, 60, 10, 80, 30, 50, 15]);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const joystickRef = useRef<HTMLDivElement>(null);
    
// --- INITIALISATION CAMÉRA ---
const startCamera = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment' }, audio: true 
    });
    setCameraStream(stream);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play().catch(e => console.log(e));
    }
  } catch (err) { console.error(err); }
};

useEffect(() => {
  startCamera();
  return () => { if (cameraStream) cameraStream.getTracks().forEach(track => track.stop()); };
}, []);

useEffect(() => {
  const interval = setInterval(() => {
    setAudioLevels(prev => prev.map(l => {
      const n = l + Math.floor(Math.random() * 30) - 15;
      return n > 95 ? 95 : n < 5 ? 5 : n;
    }));
  }, 500);
  return () => clearInterval(interval);
}, []);

const toggleAudio = () => {
  if (cameraStream) {
    const track = cameraStream.getAudioTracks()[0];
    if (track) track.enabled = isAudioMuted;
  }
  setIsAudioMuted(!isAudioMuted); 
};

// --- CHROMA KEY ---
const applyChromaKey = (video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const draw = () => {
    if (video.paused || video.ended) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < frame.data.length; i += 4) {
      const r = frame.data[i], g = frame.data[i+1], b = frame.data[i+2];
      if (g > 100 && g > r * 1.4 && g > b * 1.4) frame.data[i+3] = 0;
    }
    ctx.putImageData(frame, 0, 0);
    chromaAnimationRef.current = requestAnimationFrame(draw);
  };
  draw();
};

useEffect(() => {
  if (isChromaActive && localVideoRef.current && chromaCanvasRef.current) {
    applyChromaKey(localVideoRef.current, chromaCanvasRef.current);
  } else {
    if (chromaAnimationRef.current) cancelAnimationFrame(chromaAnimationRef.current);
  }
}, [isChromaActive]);

// --- MOTEUR DU CANVAS (MÉLANGEUR AVEC T-BAR) ---
useEffect(() => {
  let frameId: number;
  const canvas = programCanvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

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
      if (ch === 1 && localVideoRef.current) {
        ctx.drawImage(localVideoRef.current, 0, 0, canvas.width, canvas.height);
      } else if (remoteCameras[ch] && remoteVideoRefs.current[ch]) {
        ctx.drawImage(remoteVideoRefs.current[ch]!, 0, 0, canvas.width, canvas.height);
      }
      ctx.globalAlpha = 1.0;
    };

    if (tBarProgress > 0) {
      drawSource(programChannel, 1);
      drawSource(previewChannel, tBarProgress);
    } else {
      drawSource(programChannel, 1);
    }
    ctx.restore();

    if (isLogoActive && customLogo) {
      const logoImg = new Image();
      logoImg.src = customLogo;
      if (logoImg.complete) {
        const lWidth = 150; 
        const lHeight = (logoImg.height / logoImg.width) * lWidth;
        const posX = (logoPos.x / 100) * canvas.width;
        const posY = (logoPos.y / 100) * canvas.height;
        ctx.drawImage(logoImg, posX, posY, lWidth, lHeight);
      }
    }
    frameId = requestAnimationFrame(draw);
  };
  draw();
  return () => cancelAnimationFrame(frameId);
}, [programChannel, previewChannel, remoteCameras, programZoom, isLogoActive, customLogo, logoPos, tBarProgress]);

useEffect(() => {
  if (isProgramViewOpen && programCanvasRef.current && programPreviewVideoRef.current) {
    const stream = programCanvasRef.current.captureStream(30);
    programPreviewVideoRef.current.srcObject = stream;
    programPreviewVideoRef.current.play().catch(e => console.log(e));
  }
}, [isProgramViewOpen]);

// --- TRANSITIONS ET JOYSTICK ---
const handleTransition = () => {
  if (isFrozen) return;
  const temp = programChannel;
  setProgramChannel(previewChannel);
  setPreviewChannel(temp);
  setTBarProgress(0);
};

const handleJoystickMove = (e: React.PointerEvent<HTMLDivElement>) => {
  if (!joystickRef.current) return;
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
  } else {
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

// --- ENREGISTREMENT ET LIVE ---
const toggleRecording = () => {
  if (isRecording) {
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    setIsRecording(false);
  } else if (programCanvasRef.current) {
    const stream = programCanvasRef.current.captureStream(30);
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    recordedChunks.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `video_${Date.now()}.webm`;
      a.click();
    };
    recorder.start();
    setIsRecording(true);
  }
};

const toggleLive = () => setIsLive(!isLive);
return (
  <div className="h-screen w-screen bg-slate-950 text-white flex flex-col font-sans select-none overflow-hidden relative">
    
    {/* MODE PORTRAIT */}
    <div className="absolute inset-0 bg-slate-950 z-[999] flex flex-col items-center justify-center text-center p-6 portrait:flex landscape:hidden">
      <MonitorPlay size={64} className="text-red-600 mb-4 animate-bounce" />
      <h2 className="text-2xl font-bold mb-2">Tournez votre téléphone</h2>
    </div>

    {/* EN-TÊTE */}
    <header className="h-12 flex items-center justify-between px-3 bg-slate-900 border-b border-slate-800 shrink-0">
      <div className="flex items-center gap-2">
        <div className="bg-red-600 p-1 rounded"><MonitorPlay size={16} className="text-white" /></div>
        <h1 className="text-sm font-black tracking-widest uppercase leading-none">DSK - MV</h1>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={toggleRecording} className={`px-2 py-1 rounded text-[10px] font-bold ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
           {isRecording ? 'REC' : 'REC OFF'}
        </button>
        <button onClick={toggleLive} className={`px-2 py-1 rounded text-[10px] font-bold ${isLive ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
          {isLive ? 'LIVE' : 'OFFLINE'}
        </button>
        <button onClick={() => setIsProgramViewOpen(true)} className="p-1 text-red-500"><MonitorPlay size={18} /></button>
        <button onClick={() => setIsSettingsOpen(true)} className="p-1 text-slate-400"><Settings size={18} /></button>
      </div>
    </header>

    {/* CORPS PRINCIPAL */}
    <div className="flex-1 flex flex-row overflow-hidden">
      
      {/* GAUCHE : Effets */}
      <div className="w-16 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-2 gap-2 shrink-0">
        <button onClick={() => setIsChromaActive(!isChromaActive)} className={`w-12 h-10 rounded text-[9px] font-bold ${isChromaActive ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>CHROMA</button>
        <button onClick={() => setIsPipActive(!isPipActive)} className={`w-12 h-10 rounded text-[9px] font-bold ${isPipActive ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400'}`}>PIP</button>
        <button onClick={() => setIsLogoActive(!isLogoActive)} className={`w-12 h-10 rounded text-[9px] font-bold ${isLogoActive ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}>LOGO</button>
        <button onClick={() => setIsFrozen(!isFrozen)} className={`w-12 h-10 rounded text-[9px] font-bold ${isFrozen ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>FREEZE</button>
        <button onClick={toggleAudio} className={`w-12 h-10 rounded text-[9px] font-bold ${isAudioMuted ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'}`}>AUDIO</button>
      </div>

      {/* CENTRE : MultiView */}
      <main className="flex-1 bg-black p-1 grid grid-cols-4 grid-rows-2 gap-1 overflow-hidden">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((channel) => {
          const isP = programChannel === channel;
          const isV = previewChannel === channel;
          return (
            <div key={channel} onClick={() => !isFrozen && setPreviewChannel(channel)} className={`relative bg-slate-900 rounded border-2 ${isP ? 'border-red-500' : isV ? 'border-green-500' : 'border-slate-800'} overflow-hidden cursor-pointer`}>
              {channel === 1 ? (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                  {cameraStream ? <video ref={localVideoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" /> : <button onClick={startCamera} className="bg-red-600 text-white px-2 py-1 rounded text-[10px] z-20">Activer</button>}
                </div>
              ) : remoteCameras[channel] ? (
                <video ref={(el) => { remoteVideoRefs.current[channel] = el; }} src={remoteCameras[channel]} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?q=80&w=300&auto=format&fit=crop')] bg-cover bg-center" />
              )}
              <div className="absolute top-0.5 left-0.5 bg-black/60 px-1 rounded text-[8px] font-bold z-10">CAM {channel}</div>
              {isP && <div className="absolute bottom-0.5 right-0.5 bg-red-600 px-1 rounded text-[8px] font-bold z-10">PGM</div>}
              {isV && <div className="absolute bottom-0.5 right-0.5 bg-green-600 px-1 rounded text-[8px] font-bold z-10">PVW</div>}
            </div>
          );
        })}
      </main>

      {/* DROITE : T-Bar & Transitions */}
      <div className="w-20 bg-slate-900 border-l border-slate-800 flex flex-col items-center py-2 justify-between shrink-0">
        <div className="flex-1 flex items-center justify-center w-full">
          <TBar onTransition={handleTransition} onProgress={(progress) => setTBarProgress(progress)} disabled={isFrozen} />
        </div>
        <div className="flex flex-col w-full px-1 gap-1">
          <button onClick={handleTransition} disabled={isFrozen} className="w-full bg-slate-700 text-white py-2 rounded font-black text-xs border-b-2 border-slate-900 active:border-b-0">CUT</button>
          <button onClick={handleTransition} disabled={isFrozen} className="w-full bg-blue-600 text-white py-2 rounded font-black text-xs border-b-2 border-blue-800 active:border-b-0">AUTO</button>
        </div>
      </div>
    </div>
    
          {/* BAS : Joystick + Matrice */}
      <footer className="h-16 bg-slate-950 border-t border-slate-800 flex items-center justify-between px-4 shrink-0">
        
        <button onClick={() => setJoystickMode(joystickMode === 'zoom' ? 'logo' : 'zoom')} className={`w-12 h-10 rounded text-[9px] font-bold flex flex-col items-center justify-center ${joystickMode === 'logo' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
          <Move size={14} />
          {joystickMode === 'logo' ? 'LOGO' : 'ZOOM'}
        </button>

        <div ref={joystickRef} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); handleJoystickMove(e); }} onPointerMove={(e) => { if (e.buttons > 0 || e.pointerType === 'touch') handleJoystickMove(e); }} onPointerUp={handleJoystickEnd} onPointerCancel={handleJoystickEnd} className="relative w-14 h-14 bg-slate-800 rounded-full border-2 border-slate-700 flex items-center justify-center shadow-inner shrink-0 touch-none">
          <div className="absolute w-6 h-6 bg-slate-600 rounded-full shadow-lg pointer-events-none transition-transform duration-75 ease-out" style={{ transform: `translate(${joystickPos.x * 14}px, ${joystickPos.y * 14}px)` }}>
            <div className="w-full h-full rounded-full border-t border-slate-500"></div>
          </div>
        </div>

        <div className="flex gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((ch) => {
            const isP = programChannel === ch;
            const isV = previewChannel === ch;
            return (
              <button key={ch} onClick={() => !isFrozen && setPreviewChannel(ch)} disabled={isFrozen} className={`w-10 h-10 rounded font-bold text-sm border-b-2 transition-all active:border-b-0 active:translate-y-0.5 ${isP ? 'bg-red-600 border-red-800 text-white' : isV ? 'bg-green-600 border-green-800 text-white' : 'bg-slate-800 border-slate-900 text-slate-300'}`}>{ch}</button>
            );
          })}
        </div>
        <div className="w-10 text-right text-[8px] text-slate-500 font-bold">DSK-MV</div>
      </footer>

      {/* MODALES */}
      {isSettingsOpen && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg p-4 w-full max-w-sm border border-slate-600">
            <h2 className="text-lg font-bold text-white mb-4">Réglages</h2>
            <div className="mb-4 bg-slate-900 p-2 rounded border border-slate-700">
              <p className="text-xs text-slate-400 mb-2">Importer votre logo (PNG) :</p>
              <input type="file" accept="image/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setCustomLogo(URL.createObjectURL(file));
              }} className="w-full text-white text-xs" />
            </div>
            <div className="space-y-2 mb-4">
              {[2, 3, 4, 5, 6, 7, 8].map((cam) => (
                <div key={cam} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-300 w-10">CAM {cam}</span>
                  <input type="text" placeholder="http://..." value={remoteCameras[cam] || ''} onChange={(e) => setRemoteCameras({...remoteCameras, [cam]: e.target.value})} className="flex-1 bg-slate-900 text-white text-xs px-2 py-1 rounded border border-slate-600 outline-none" />
                </div>
              ))}
            </div>
            <button onClick={() => setIsSettingsOpen(false)} className="w-full bg-blue-600 text-white py-2 rounded font-bold">Fermer</button>
          </div>
        </div>
      )}

      {isProgramViewOpen && (
        <div className="absolute inset-0 bg-black z-[100] flex flex-col">
          <div className="flex justify-between items-center p-2 bg-slate-900 border-b border-slate-800">
            <h2 className="text-sm font-bold text-red-500 flex items-center gap-2"><Radio className="animate-pulse" /> DIRECT</h2>
            <button onClick={() => setIsProgramViewOpen(false)} className="text-white text-xl font-bold bg-slate-800 px-2 rounded">✕</button>
          </div>
          <div className="flex-1 flex items-center justify-center p-2 bg-black">
            <video ref={programPreviewVideoRef} autoPlay playsInline muted className="w-full h-full object-contain bg-slate-900 border-2 border-slate-800 rounded-lg" />
          </div>
        </div>
      )}

      <canvas ref={programCanvasRef} width={1280} height={720} className="hidden" />
    </div>
  );
          }
