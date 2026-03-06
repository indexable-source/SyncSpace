'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

export default function LoginPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        email: '',
        displayName: ''
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Live validation states
    const [usernameStatus, setUsernameStatus] = useState(null); // 'checking', 'available', 'taken', 'invalid'
    const [passwordStrength, setPasswordStrength] = useState({
        length: false, upper: false, lower: false, number: false, special: false
    });

    const { login, register, isAuthenticated } = useAuth();
    const toast = useToast();
    const router = useRouter();

    // Redirect if already logged in
    useEffect(() => {
        if (isAuthenticated) {
            router.replace('/');
        }
    }, [isAuthenticated, router]);

    // Live Username Check (debounce 500ms)
    useEffect(() => {
        if (isLogin || !formData.username) {
            setUsernameStatus(null);
            return;
        }

        const username = formData.username;
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            setUsernameStatus('invalid');
            return;
        }

        setUsernameStatus('checking');
        const timeoutId = setTimeout(async () => {
            try {
                const res = await api.checkUsername(username);
                setUsernameStatus(res.available ? 'available' : 'taken');
            } catch (err) {
                setUsernameStatus(null);
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [formData.username, isLogin]);

    // Live Password Strength
    useEffect(() => {
        if (isLogin) return;
        const p = formData.password;
        setPasswordStrength({
            length: p.length >= 8,
            upper: /[A-Z]/.test(p),
            lower: /[a-z]/.test(p),
            number: /[0-9]/.test(p),
            special: /[!@#$%^&*(),.?":{}|<>]/.test(p)
        });
    }, [formData.password, isLogin]);

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError(''); // Clear error on input change
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (isLogin) {
                await login(formData.username, formData.password);
                toast.success('Welcome back.');
            } else {
                if (usernameStatus !== 'available') {
                    setError('Please choose a valid & available username.');
                    setIsLoading(false);
                    return;
                }
                const { length, upper, lower, number, special } = passwordStrength;
                if (!length || !upper || !lower || !number || !special) {
                    setError('Password does not meet all complexity requirements.');
                    setIsLoading(false);
                    return;
                }
                if (formData.email && !/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/.test(formData.email)) {
                    setError('Please enter a valid email address.');
                    setIsLoading(false);
                    return;
                }
                await register(formData.username, formData.password, formData.email, formData.displayName);
                toast.success('Account created.');
            }
            router.push('/');
        } catch (err) {
            setError(err.message || 'Authentication error.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            width: '100vw',
            position: 'fixed',
            top: 0,
            left: 0,
            background: 'var(--bg-base)',
            zIndex: 100
        }}>
            <div className="noise-bg"></div>
            <div className="dot-grid"></div>

            <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 className="font-serif">SyncSpace.</h1>
                    <p className="font-mono text-muted" style={{ fontSize: '0.8rem' }}>Group Schedule Synchronizer</p>
                </div>

                {/* Tabs */}
                <div style={{
                    display: 'flex',
                    border: 'var(--border-width) solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: '2rem',
                    overflow: 'hidden' // Keeps the rounded corners intact
                }}>
                    <button
                        type="button"
                        style={{
                            flex: 1,
                            padding: '0.75rem',
                            fontFamily: 'var(--font-jetbrains-mono), monospace',
                            fontSize: '0.8rem',
                            textTransform: 'uppercase',
                            background: isLogin ? 'var(--accent-primary)' : 'transparent',
                            color: isLogin ? '#ffffff' : 'var(--text-primary)',
                            fontWeight: isLogin ? 'bold' : 'normal',
                            transition: 'all 0.2s',
                        }}
                        onClick={() => { setIsLogin(true); setError(''); }}
                    >
                        Log In
                    </button>
                    <button
                        type="button"
                        style={{
                            flex: 1,
                            padding: '0.75rem',
                            fontFamily: 'var(--font-jetbrains-mono), monospace',
                            fontSize: '0.8rem',
                            textTransform: 'uppercase',
                            background: !isLogin ? 'var(--accent-primary)' : 'transparent',
                            color: !isLogin ? '#ffffff' : 'var(--text-primary)',
                            fontWeight: !isLogin ? 'bold' : 'normal',
                            borderLeft: 'var(--border-width) solid var(--border-color)',
                            transition: 'all 0.2s',
                        }}
                        onClick={() => { setIsLogin(false); setError(''); }}
                    >
                        Register
                    </button>
                </div>

                {error && (
                    <div className="alert alert-error" style={{ marginBottom: '1.5rem', fontSize: '0.8rem' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            Username
                            {!isLogin && usernameStatus === 'checking' && <span style={{ color: 'var(--text-muted)' }}>Checking...</span>}
                            {!isLogin && usernameStatus === 'available' && <span style={{ color: 'var(--accent-success)' }}>Available ✓</span>}
                            {!isLogin && usernameStatus === 'taken' && <span style={{ color: 'var(--accent-danger)' }}>Taken ✗</span>}
                            {!isLogin && usernameStatus === 'invalid' && <span style={{ color: 'var(--accent-danger)' }}>Invalid format ✗</span>}
                        </label>
                        <input
                            type="text"
                            name="username"
                            className="input-field"
                            placeholder={isLogin ? "Username" : "3-20 chars (letters, numbers, _)"}
                            value={formData.username}
                            onChange={handleInputChange}
                            autoComplete="username"
                            required
                            style={!isLogin && usernameStatus === 'invalid' ? { borderColor: 'var(--accent-danger)' } : {}}
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label">Password</label>
                        <input
                            type="password"
                            name="password"
                            className="input-field"
                            placeholder={isLogin ? "Password" : "Required configuration"}
                            value={formData.password}
                            onChange={handleInputChange}
                            autoComplete={isLogin ? 'current-password' : 'new-password'}
                            required
                        />
                    </div>

                    {!isLogin && formData.password.length > 0 && (
                        <div style={{ marginBottom: '1.5rem', marginTop: '-0.5rem', background: 'var(--bg-elevated)', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                            <p className="font-mono text-muted" style={{ fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Password strength</p>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.8rem', fontFamily: 'var(--font-jetbrains-mono)' }}>
                                <li style={{ color: passwordStrength.length ? 'var(--accent-success)' : 'var(--text-muted)' }}>{passwordStrength.length ? '✓' : '○'} 8+ characters</li>
                                <li style={{ color: passwordStrength.upper ? 'var(--accent-success)' : 'var(--text-muted)' }}>{passwordStrength.upper ? '✓' : '○'} Uppercase letter</li>
                                <li style={{ color: passwordStrength.lower ? 'var(--accent-success)' : 'var(--text-muted)' }}>{passwordStrength.lower ? '✓' : '○'} Lowercase letter</li>
                                <li style={{ color: passwordStrength.number ? 'var(--accent-success)' : 'var(--text-muted)' }}>{passwordStrength.number ? '✓' : '○'} Number</li>
                                <li style={{ color: passwordStrength.special ? 'var(--accent-success)' : 'var(--text-muted)' }}>{passwordStrength.special ? '✓' : '○'} Special character</li>
                            </ul>
                        </div>
                    )}

                    {!isLogin && (
                        <>
                            <div className="input-group">
                                <label className="input-label">Email (Optional)</label>
                                <input
                                    type="email"
                                    name="email"
                                    className="input-field"
                                    placeholder="you@example.com"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    autoComplete="email"
                                />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Display Name (Optional)</label>
                                <input
                                    type="text"
                                    name="displayName"
                                    className="input-field"
                                    placeholder="Your full name"
                                    value={formData.displayName}
                                    onChange={handleInputChange}
                                    autoComplete="name"
                                />
                            </div>
                        </>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%', marginTop: '1rem', padding: '1rem', border: 'var(--border-width) solid var(--border-color)' }}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                                <span className="spinner" style={{ width: '16px', height: '16px' }}></span>
                                LOADING...
                            </span>
                        ) : (
                            isLogin ? 'SIGN IN' : 'CREATE ACCOUNT'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
