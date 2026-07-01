import type { FsQueueKey } from '../types';
import { FS_QUEUE_KEYS, FS_QUEUE_LABELS } from '../types';

type Props = {
  value: FsQueueKey;
  onChange: (q: FsQueueKey) => void;
  className?: string;
  showLabel?: boolean;
};

export default function QueueSwitcher({ value, onChange, className = '', showLabel = false }: Props) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showLabel && (
        <span className="text-xs font-medium text-slate-600">Очередь</span>
      )}
      <div className="flex gap-1">
      {FS_QUEUE_KEYS.map(q => (
        <button
          key={q}
          type="button"
          onClick={() => onChange(q)}
          className={`text-[10px] px-2 py-1 rounded border transition-colors ${
            value === q
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          }`}
        >
          {FS_QUEUE_LABELS[q]}
        </button>
      ))}
      </div>
    </div>
  );
}
