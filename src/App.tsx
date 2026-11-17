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
    
