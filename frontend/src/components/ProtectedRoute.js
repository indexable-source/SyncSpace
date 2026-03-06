'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

const PUBLIC_ROUTES = ['/login'];

export default function ProtectedRoute({ children }) {
    const { isAuthenticated, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

    useEffect(() => {
        if (loading) return;

        if (!isAuthenticated && !isPublicRoute) {
            router.replace('/login');
        }

        // If logged in and on login page, redirect to dashboard
        if (isAuthenticated && isPublicRoute) {
            router.replace('/');
        }
    }, [isAuthenticated, loading, isPublicRoute, router]);

    // Show loading skeleton while checking auth
    if (loading) {
        return (
            <div className="auth-loading-screen">
                <div className="auth-loading-content">
                    <div>
                        <h2 className="font-serif">SyncSpace.</h2>
                        <p className="font-mono text-muted text-sm tracking-widest uppercase">Authenticating</p>
                    </div>
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    // Don't render protected content if not authenticated
    if (!isAuthenticated && !isPublicRoute) {
        return null;
    }

    // Don't render login page if authenticated
    if (isAuthenticated && isPublicRoute) {
        return null;
    }

    return children;
}
