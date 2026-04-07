import { useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface Props {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const STYLES = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error: 'bg-rose-50 border-rose-200 text-rose-800',
  info: 'bg-teal-50 border-teal-200 text-teal-900',
};

const ICON_STYLES = {
  success: 'text-emerald-500',
  error: 'text-rose-500',
  info: 'text-teal-600',
};

export const Toast: React.FC<Props> = ({ message, type, onClose, duration = 4000 }) => {
  const Icon = ICONS[type];

  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div className="fixed z-[100] left-4 right-4 max-md:top-auto max-md:bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] md:top-6 md:right-6 md:left-auto md:bottom-auto animate-in slide-in-from-bottom-2 md:slide-in-from-top-4 fade-in duration-300">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-full md:max-w-sm ${STYLES[type]}`}>
        <Icon className={`w-5 h-5 shrink-0 ${ICON_STYLES[type]}`} />
        <p className="text-sm font-medium flex-1">{message}</p>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-black/5 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
