import { Camera } from 'lucide-react';

interface CameraGridProps {
  programChannel: number;
  previewChannel: number;
  onSelect: (channel: number) => void;
  onCut: (channel: number) => void;
}

export function CameraGrid({
  programChannel,
  previewChannel,
  onSelect,
  onCut,
}: CameraGridProps) {
  const channels = [1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <div className="grid grid-cols-4 gap-2 px-2">
      {channels.map((ch) => {
        const isProgram = programChannel === ch;
        const isPreview = previewChannel === ch;

        const bgColor = isProgram
          ? 'bg-red-600 border-red-400'
          : isPreview
            ? 'bg-green-600 border-green-400'
            : 'bg-slate-800 border-slate-700';

        return (
          <button
            key={ch}
            onClick={() => onSelect(ch)}
            onDoubleClick={() => onCut(ch)}
            className={`${bgColor} border-2 rounded-lg p-3 flex flex-col items-center justify-center gap-1 transition-all active:scale-95`}
          >
            <Camera size={20} className="opacity-70" />
            <span className="text-2xl font-bold">{ch}</span>
          </button>
        );
      })}
    </div>
  );
}
