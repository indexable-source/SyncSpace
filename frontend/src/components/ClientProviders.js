'use client';

import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { ThemeProvider } from '@/context/ThemeContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import BugReporter from '@/components/BugReporter';

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
                            <BugReporter />
                        </div>
                    </ProtectedRoute>
                </ToastProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}

