interface TransitionControlsProps {
  onCut: () => void;
  onAuto: () => void;
  disabled: boolean;
}

export function TransitionControls({
  onCut,
  onAuto,
  disabled,
}: TransitionControlsProps) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <button
        onClick={onCut}
        disabled={disabled}
        className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 py-5 rounded-lg font-bold text-lg tracking-wider transition-all active:scale-95"
      >
        CUT
      </button>
      <button
        onClick={onAuto}
        disabled={disabled}
        className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 py-5 rounded-lg font-bold text-lg tracking-wider transition-all active:scale-95"
      >
        AUTO
      </button>
    </div>
  );
}
