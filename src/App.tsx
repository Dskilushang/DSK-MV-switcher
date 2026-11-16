import { useState, useRef, useEffect } from 'react';
import { Settings, Radio, MonitorPlay, Zap } from 'lucide-react';
import TBar from './TBar';

export default function App() {
  // --- ÉTATS ---
  const [programChannel, setProgramChannel] = useState(1);
  const [previewChannel, setPreviewChannel] = useState(2);
  const [isLive, setIsLive] = useState(false);
  const [isDskActive, setIsDskActive] = useState(false);
  const [isChromaActive, setIsChromaActive] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [transitionType, setTransitionType] = useState<'cut' | 'fade' | 'wipe'>('cut');
  
  // --- LOGO ---
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- CAMÉRAS ---
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [remoteCameras, setRemoteCameras] = useState<{ [key: number]: string }>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const remoteVideoRefs = useRef<{ [key: number]: HTMLVideoElement | null }>({});

  // --- LIVE ---
  const [streamKey, setStreamKey] = useState('');
  const [streamUrl, setStreamUrl] = useState('rtmp://a.rtmp.youtube.com/live2');

  // --- ENREGISTREMENT / CHROMA / CANVAS ---
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const chromaCanvasRef = useRef<HTMLCanvasElement>(null);
  const chromaAnimationRef = useRef<number | null>(null);
  const programCanvasRef = useRef<HTMLCanvasElement>(null);
  const programPreviewVideoRef = useRef<HTMLVideoElement>(null);
  const [isProgramViewOpen, setIsProgramViewOpen] = useState(false);

  // --- AUDIO ---
  const [audioLevels, setAudioLevels] = useState([40, 20, 60, 10, 80, 30, 50, 15]);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [audioVolume, setAudioVolume] = useState(1);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // --- CAMÉRA ---
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
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
    };
  }, []);

  // --- AUDIO SIMULATION ---
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
      if (track) {
        track.enabled = isAudioMuted;
        setIsAudioMuted(!isAudioMuted);
      }
    }
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

  // --- PROGRAM OUT (OBS) ---
  useEffect(() => {
    let frameId: number;
    const canvas = programCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (programChannel === 1 && localVideoRef.current) {
        ctx.drawImage(localVideoRef.current, 0, 0, canvas.width, canvas.height);
      } else if (remoteCameras[programChannel] && remoteVideoRefs.current[programChannel]) {
        ctx.drawImage(remoteVideoRefs.current[programChannel]!, 0, 0, canvas.width, canvas.height);
      }
      frameId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frameId);
  }, [programChannel, remoteCameras]);

  // --- TRANSITIONS ---
  const handleTransition = () => {
    if (isFrozen) return;
    const temp = programChannel;
    setProgramChannel(previewChannel);
    setPreviewChannel(temp);
  };

  // --- ENREGISTREMENT ---
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

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans select-none overflow-hidden">
      
      {/* EN-TÊTE */}
      <header className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-red-600 p-1.5 rounded-md"><MonitorPlay size={18} className="text-white" /></div>
          <div>
            <h1 className="text-lg font-black tracking-widest uppercase leading-none">DSK - MV</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Mélangeur Vidéo</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleRecording} className={`flex items-center gap-1 px-3 py-1.5 rounded-md font-bold text-xs transition-all ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
            <div className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-white' : 'bg-red-500'}`} /> {isRecording ? 'REC' : 'REC OFF'}
          </button>
          <button onClick={() => setIsLive(!isLive)} className={`flex items-center gap-1 px-3 py-1.5 rounded-md font-bold text-xs transition-all ${isLive ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
            {isLive ? <><Radio size={14} /> LIVE</> : 'OFFLINE'}
          </button>
          <button onClick={() => setIsProgramViewOpen(true)} className="p-2 text-red-500 hover:text-red-400 animate-pulse"><MonitorPlay size={20} /></button>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-slate-400 hover:text-white"><Settings size={20} /></button>
        </div>
      </header>

      {/* ZONE PRINCIPALE */}
      <div className="flex-1 flex flex-row overflow-hidden">
        {/* GAUCHE : EFFETS */}
        <div className="w-16 md:w-20 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-4 gap-3 overflow-y-auto shrink-0">
          <button onClick={() => setIsChromaActive(!isChromaActive)} className={`w-12 h-12 rounded-md text-[10px] font-bold border-b-2 flex flex-col items-center justify-center ${isChromaActive ? 'bg-emerald-600 border-emerald-800 text-white' : 'bg-slate-800 border-slate-950 text-slate-400'}`}>CHROMA</button>
          <button onClick={() => setIsPipActive(!isPipActive)} className={`w-12 h-12 rounded-md text-[10px] font-bold border-b-2 flex flex-col items-center justify-center ${isPipActive ? 'bg-orange-600 border-orange-800 text-white' : 'bg-slate-800 border-slate-950 text-slate-400'}`}>PIP</button>
          <button onClick={() => setIsDskActive(!isDskActive)} className={`w-12 h-12 rounded-md text-[10px] font-bold border-b-2 flex flex-col items-center justify-center ${isDskActive ? 'bg-purple-600 border-purple-800 text-white' : 'bg-slate-800 border-slate-950 text-slate-400'}`}>DSK</button>
          <button onClick={() => setIsFrozen(!isFrozen)} className={`w-12 h-12 rounded-md text-[10px] font-bold border-b-2 flex flex-col items-center justify-center ${isFrozen ? 'bg-blue-600 border-blue-800 text-white' : 'bg-slate-800 border-slate-950 text-slate-400'}`}>FREEZE</button>
          <div className="w-full h-px bg-slate-700 my-2"></div>
          <button onClick={toggleAudio} className={`w-12 h-12 rounded-md text-[10px] font-bold border-b-2 flex flex-col items-center justify-center ${isAudioMuted ? 'bg-red-600 border-red-800 text-white' : 'bg-slate-800 border-slate-950 text-slate-400'}`}>{isAudioMuted ? 'MUTE' : 'AUDIO'}</button>
        </div>

        {/* CENTRE : MULTIVIEW */}
        <main className="flex-1 bg-black p-2 grid grid-cols-2 md:grid-cols-4 gap-2 content-start overflow-y-auto">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((channel) => {
            const isP = programChannel === channel;
            const isV = previewChannel === channel;
            return (
              <div key={channel} onClick={() => !isFrozen && setPreviewChannel(channel)} className={`relative aspect-video bg-slate-900 rounded-lg border-2 ${isP ? 'border-red-500' : isV ? 'border-green-500' : 'border-slate-800'} overflow-hidden cursor-pointer`}>
                {channel === 1 ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                    {cameraStream ? <video ref={localVideoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-80" /> : <button onClick={startCamera} className="bg-red-600 text-white px-2 py-1 rounded text-xs z-20">Activer</button>}
                  </div>
                ) : remoteCameras[channel] ? (
                  <video ref={(el) => { remoteVideoRefs.current[channel] = el; }} src={remoteCameras[channel]} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-80" />
                ) : (
                  <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?q=80&w=300&auto=format&fit=crop')] bg-cover bg-center" />
                )}
                <div className="absolute top-1 left-1 bg-black/60 px-2 py-0.5 rounded text-[10px] font-bold z-10">CAM {channel}</div>
                {isP && <div className="absolute bottom-1 right-1 bg-red-600 px-2 py-0.5 rounded text-[8px] font-bold z-10">PGM</div>}
                {isV && <div className="absolute bottom-1 right-1 bg-green-600 px-2 py-0.5 rounded text-[8px] font-bold z-10">PVW</div>}
              </div>
            );
          })}
        </main>

        {/* DROITE : T-BAR & CUT/AUTO */}
        <div className="w-20 md:w-28 bg-slate-900 border-l border-slate-800 flex flex-col items-center py-4 gap-4 shrink-0">
          <div className="flex-1 flex items-center justify-center w-full"><TBar onTransition={handleTransition} disabled={isFrozen} /></div>
          <div className="flex flex-col w-full px-2 gap-2">
            <button onClick={handleTransition} disabled={isFrozen} className="w-full bg-slate-700 text-white py-3 rounded font-black text-sm border-b-4 border-slate-900 active:border-b-0 active:translate-y-1">CUT</button>
            <button onClick={handleTransition} disabled={isFrozen} className="w-full bg-blue-600 text-white py-3 rounded font-black text-sm border-b-4 border-blue-800 active:border-b-0 active:translate-y-1">AUTO</button>
          </div>
        </div>
      </div>

      {/* BAS : MATRICE & JOYSTICK */}
      <footer className="h-32 bg-slate-950 border-t border-slate-800 flex items-center justify-between px-4 shrink-0">
        <div className="w-16 h-16 bg-slate-800 rounded-full border-4 border-slate-700 flex items-center justify-center shadow-inner"><div className="w-6 h-6 bg-slate-600 rounded-full"></div></div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((ch) => {
            const isP = programChannel === ch;
            const isV = previewChannel === ch;
            return (
              <button key={ch} onClick={() => !isFrozen && setPreviewChannel(ch)} disabled={isFrozen} className={`w-12 h-12 rounded-md font-bold text-lg border-b-4 transition-all active:border-b-0 active:translate-y-1 ${isP ? 'bg-red-600 border-red-800 text-white' : isV ? 'bg-green-600 border-green-800 text-white' : 'bg-slate-800 border-slate-900 text-slate-300'}`}>{ch}</button>
            );
          })}
        </div>
        <div className="w-16 text-right text-[10px] text-slate-500 font-bold">DSK-MV<br/>PRO</div>
      </footer>

      {/* MODALE RÉGLAGES */}
      {isSettingsOpen && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-800 rounded-lg p-4 w-full max-w-sm border border-slate-600 my-8">
            <h2 className="text-lg font-bold text-white mb-4">Réglages</h2>
            <div className="space-y-2 mb-4">
              {[2, 3, 4, 5, 6, 7, 8].map((cam) => (
                <div key={cam} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-300 w-12">CAM {cam}</span>
                  <input type="text" placeholder="http://..." value={remoteCameras[cam] || ''} onChange={(e) => setRemoteCameras({...remoteCameras, [cam]: e.target.value})} className="flex-1 bg-slate-900 text-white text-xs px-2 py-1.5 rounded border border-slate-600 outline-none" />
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-slate-700 pt-4 space-y-2">
              <input type="text" placeholder="rtmp://..." value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} className="w-full bg-slate-900 text-white text-xs px-2 py-1.5 rounded border border-slate-600 outline-none" />
              <input type="password" placeholder="Clé de flux" value={streamKey} onChange={(e) => setStreamKey(e.target.value)} className="w-full bg-slate-900 text-white text-xs px-2 py-1.5 rounded border border-slate-600 outline-none" />
            </div>
            <button onClick={() => setIsSettingsOpen(false)} className="w-full mt-6 bg-blue-600 text-white py-2 rounded font-bold">Fermer</button>
          </div>
        </div>
      )}

      {/* MODALE DIRECT */}
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
