import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * A transient message with an optional undo.
 *
 * Undo is why this exists rather than a plain confirmation for every destructive act — a soft
 * delete that can be taken back for a few seconds interrupts less than a dialog and loses less
 * than a silent delete.
 */

type Toast = {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
};

type ToastContext = {
  show: (message: string, action?: Toast['action']) => void;
};

const Context = createContext<ToastContext>({ show: () => {} });

const DURATION = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);

  const show = useCallback<ToastContext['show']>((message, action) => {
    setToast({ id: Date.now(), message, ...(action ? { action } : {}) });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), DURATION);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <Context.Provider value={value}>
      {children}
      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          <span>{toast.message}</span>
          {toast.action ? (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                toast.action?.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </Context.Provider>
  );
}

export function useToast(): ToastContext {
  return useContext(Context);
}
