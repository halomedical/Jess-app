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
  success: 'bg-[#E6F4F3] border-[#E5E7EB] text-[#1F2937]',
  error: 'bg-rose-50 border-rose-200 text-rose-800',
  info: 'bg-[#E6F4F3] border-[#E5E7EB] text-[#1F2937]',
};

const ICON_STYLES = {
  success: 'text-[#4FB6B2]',
  error: 'text-rose-500',
  info: 'text-[#4FB6B2]',
};

export const Toast: React.FC<Props> = ({ message, type, onClose, duration = 4000 }) => {
  const Icon = ICONS[type];

  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div className="fixed z-[100] left-4 right-4 max-md:top-auto max-md:bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] md:top-6 md:right-6 md:left-auto md:bottom-auto animate-in slide-in-from-bottom-2 md:slide-in-from-top-4 fade-in duration-300">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-[10px] border shadow-[0_1px_2px_rgba(0,0,0,0.05)] max-w-full md:max-w-sm ${STYLES[type]}`}>
        <Icon className={`w-5 h-5 shrink-0 ${ICON_STYLES[type]}`} />
        <p className="text-sm font-medium flex-1">{message}</p>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-[#F1F5F9] transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
