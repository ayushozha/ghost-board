import { useEffect, useState } from 'react';

const TYPE_STYLES = {
  success: {
    border: 'border-green-500/60',
    bg: 'bg-green-950/90',
    icon: (
      <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    titleColor: 'text-green-300',
    msgColor: 'text-green-200/80',
    actionColor: 'text-green-400 hover:text-green-300',
  },
  info: {
    border: 'border-cyan-500/60',
    bg: 'bg-cyan-950/90',
    icon: (
      <svg className="w-5 h-5 text-cyan-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    titleColor: 'text-cyan-300',
    msgColor: 'text-cyan-200/80',
    actionColor: 'text-cyan-400 hover:text-cyan-300',
  },
  warning: {
    border: 'border-yellow-500/60',
    bg: 'bg-yellow-950/90',
    icon: (
      <svg className="w-5 h-5 text-yellow-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    titleColor: 'text-yellow-300',
    msgColor: 'text-yellow-200/80',
    actionColor: 'text-yellow-400 hover:text-yellow-300',
  },
  error: {
    border: 'border-red-500/60',
    bg: 'bg-red-950/90',
    icon: (
      <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    titleColor: 'text-red-300',
    msgColor: 'text-red-200/80',
    actionColor: 'text-red-400 hover:text-red-300',
  },
};

/**
 * Toast — bottom-right notification with slide-in animation and auto-dismiss.
 *
 * Props:
 *   toast   — { title, message, type, action?: { label, onClick } } | null
 *   onClose — () => void
 */
export default function Toast({ toast, onClose }) {
  const [visible, setVisible] = useState(false);

  // Slide in when a toast arrives, slide out before calling onClose
  useEffect(() => {
    if (!toast) {
      setVisible(false);
      return;
    }

    // Trigger slide-in on next tick so the transition fires
    const showTimer = setTimeout(() => setVisible(true), 10);

    // Auto-dismiss: slide out, then clear after transition completes
    const dismissDelay = toast.duration ?? 5000;
    const hideTimer = setTimeout(() => setVisible(false), dismissDelay);
    const clearTimer = setTimeout(() => onClose(), dismissDelay + 300);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearTimeout(clearTimer);
    };
  }, [toast, onClose]);

  if (!toast) return null;

  const styles = TYPE_STYLES[toast.type] ?? TYPE_STYLES.info;

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  return (
    <div
      className={`fixed bottom-6 right-6 z-[9999] w-80 max-w-[calc(100vw-3rem)] pointer-events-auto
        transition-all duration-300 ease-out
        ${visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}
    >
      <div
        className={`flex items-start gap-3 p-4 rounded-xl border backdrop-blur-sm shadow-2xl
          ${styles.bg} ${styles.border}`}
      >
        {/* Icon */}
        <div className="mt-0.5">{styles.icon}</div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${styles.titleColor}`}>{toast.title}</p>
          {toast.message && (
            <p className={`text-xs mt-0.5 ${styles.msgColor}`}>{toast.message}</p>
          )}
          {toast.action && (
            <button
              onClick={() => {
                toast.action.onClick();
                handleClose();
              }}
              className={`mt-2 text-xs font-medium underline underline-offset-2 transition-colors cursor-pointer ${styles.actionColor}`}
            >
              {toast.action.label}
            </button>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          aria-label="Dismiss notification"
          className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
