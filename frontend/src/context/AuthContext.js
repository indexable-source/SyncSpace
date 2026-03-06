'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    // Check auth status on mount and when token changes
    const checkAuth = useCallback(async () => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        if (!token) {
            setUser(null);
            setLoading(false);
            return;
        }

        try {
            const data = await api.getMe();
            setUser(data.user);
        } catch (err) {
            // Token invalid or expired
            localStorage.removeItem('token');
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    // Listen for auth-expired events (fired by API client on 401)
    useEffect(() => {
        const handleAuthExpired = () => {
            setUser(null);
            localStorage.removeItem('token');
            if (pathname !== '/login') {
                router.push('/login');
            }
        };

        window.addEventListener('auth-expired', handleAuthExpired);
        return () => window.removeEventListener('auth-expired', handleAuthExpired);
    }, [router, pathname]);

    const login = async (username, password) => {
        const data = await api.login(username, password);
        if (data.user) setUser(data.user);
        return data;
    };

    const register = async (username, password, email, displayName) => {
        const data = await api.register(username, password, email, displayName);
        if (data.user) setUser(data.user);
        return data;
    };

    const logout = useCallback(() => {
        api.logout();
        setUser(null);
        router.push('/login');
    }, [router]);

    const updateUser = (updatedFields) => {
        setUser(prev => prev ? { ...prev, ...updatedFields } : null);
    };

    const value = {
        user,
        loading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateUser,
        checkAuth,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
