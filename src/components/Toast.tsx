"use client";

import React, { createContext, useContext, ReactNode, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertCircle, CheckCircle, AlertTriangle, Info } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/**
 * Toast Provider - wrap your app with this
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substr(2, 9);
    const duration = toast.duration ?? 4000;
    const newToast: Toast = {
      ...toast,
      id,
      duration,
    };

    setToasts((prev) => [...prev, newToast]);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback((title: string, message?: string) => {
    addToast({ type: "success", title, message });
  }, [addToast]);

  const error = useCallback((title: string, message?: string) => {
    addToast({ type: "error", title, message, duration: 6000 });
  }, [addToast]);

  const warning = useCallback((title: string, message?: string) => {
    addToast({ type: "warning", title, message });
  }, [addToast]);

  const info = useCallback((title: string, message?: string) => {
    addToast({ type: "info", title, message });
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

/**
 * Hook to use toast notifications
 * @example
 * const { success, error } = useToast();
 * success("Saved!", "Your changes have been saved");
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

/**
 * Toast Container - renders all toasts
 */
function ToastContainer({
  toasts,
  removeToast,
}: {
  toasts: Toast[];
  removeToast: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 pointer-events-none space-y-3">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

/**
 * Individual Toast Item
 */
function ToastItem({
  toast,
  onClose,
}: {
  toast: Toast;
  onClose: () => void;
}) {
  const bgColor = {
    success: "bg-emerald-50 border-emerald-200",
    error: "bg-red-50 border-red-200",
    warning: "bg-amber-50 border-amber-200",
    info: "bg-blue-50 border-blue-200",
  }[toast.type];

  const textColor = {
    success: "text-emerald-900",
    error: "text-red-900",
    warning: "text-amber-900",
    info: "text-blue-900",
  }[toast.type];

  const iconColor = {
    success: "text-emerald-600",
    error: "text-red-600",
    warning: "text-amber-600",
    info: "text-blue-600",
  }[toast.type];

  const Icon = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  }[toast.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, x: 100 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, y: 20, x: 100 }}
      className={`${bgColor} border rounded-lg shadow-lg p-4 pointer-events-auto max-w-sm`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${iconColor} flex-shrink-0 mt-0.5`} />
        <div className="flex-1">
          <h3 className={`font-semibold ${textColor}`}>{toast.title}</h3>
          {toast.message && (
            <p className={`text-sm ${textColor} opacity-80 mt-1`}>{toast.message}</p>
          )}
          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className={`text-sm font-medium mt-2 hover:underline ${textColor}`}
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className={`${iconColor} hover:opacity-80 flex-shrink-0`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
