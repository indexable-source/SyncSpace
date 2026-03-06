'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

let toastIdCounter = 0;

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const timersRef = useRef({});

    const removeToast = useCallback((id) => {
        if (timersRef.current[id]) {
            clearTimeout(timersRef.current[id]);
            delete timersRef.current[id];
        }
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const addToast = useCallback((message, type = 'info', duration = 4000) => {
        const id = ++toastIdCounter;
        const toast = { id, message, type, exiting: false };

        setToasts(prev => [...prev.slice(-3), toast]); // Keep max 4 toasts

        // Auto-dismiss
        timersRef.current[id] = setTimeout(() => {
            // Start exit animation
            setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
            // Remove after animation
            setTimeout(() => removeToast(id), 300);
        }, duration);

        return id;
    }, [removeToast]);

    const toast = {
        success: (msg) => addToast(msg, 'success'),
        error: (msg) => addToast(msg, 'error', 6000),
        info: (msg) => addToast(msg, 'info'),
        warning: (msg) => addToast(msg, 'warning', 5000),
    };

    return (
        <ToastContext.Provider value={toast}>
            {children}
            {/* Toast Container */}
            <div className="toast-container" aria-live="polite">
                {toasts.map(t => (
                    <div
                        key={t.id}
                        className={`toast toast-${t.type} ${t.exiting ? 'toast-exit' : 'toast-enter'}`}
                        role="alert"
                    >
                        <span className="toast-icon font-mono font-bold">
                            {t.type === 'success' && '[✓]'}
                            {t.type === 'error' && '[✕]'}
                            {t.type === 'warning' && '[!]'}
                            {t.type === 'info' && '[i]'}
                        </span>
                        <span className="toast-message font-mono" style={{ fontSize: '0.85rem' }}>{t.message}</span>
                        <button
                            className="toast-close font-mono"
                            onClick={() => removeToast(t.id)}
                            aria-label="Dismiss"
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
