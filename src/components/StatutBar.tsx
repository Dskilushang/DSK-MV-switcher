import { Wifi, WifiOff, AlertCircle } from 'lucide-react';
import type { ObsStatus } from '../services/obsService';

interface StatusBarProps {
  status: ObsStatus;
  programScene: string;
}

export function StatusBar({ status, programScene }: StatusBarProps) {
  const statusConfig = {
    connected: {
      icon: <Wifi size={16} className="text-green-400" />,
      text: 'Connecté',
      color: 'text-green-400',
    },
    connecting: {
      icon: <Wifi size={16} className="text-yellow-400 animate-pulse" />,
      text: 'Connexion...',
      color: 'text-yellow-400',
    },
    disconnected: {
      icon: <WifiOff size={16} className="text-slate-400" />,
      text: 'Déconnecté',
      color: 'text-slate-400',
    },
    error: {
      icon: <AlertCircle size={16} className="text-red-400" />,
      text: 'Erreur',
      color: 'text-red-400',
    },
  };

  const cfg = statusConfig[status];

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
      <div className={`flex items-center gap-2 ${cfg.color}`}>
        {cfg.icon}
        <span className="text-xs font-semibold uppercase">{cfg.text}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 uppercase">Live:</span>
        <span className="text-sm font-bold text-red-400">
          {programScene || '—'}
        </span>
      </div>
    </div>
  );
        }
