'use client';

import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { ThemeProvider } from '@/context/ThemeContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';

export default function ClientProviders({ children }) {
    return (
        <ThemeProvider>
            <AuthProvider>
                <ToastProvider>
                    <ProtectedRoute>
                        <div className="layout">
                            <Navbar />
                            <main className="main-content">
                                {children}
                            </main>
                        </div>
                    </ProtectedRoute>
                </ToastProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}

