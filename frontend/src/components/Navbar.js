'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { SunIcon, MoonIcon, GearIcon, SignOutIcon } from '@/components/Icons';

export default function Navbar() {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const pathname = usePathname();

    // Don't render navbar on login page
    if (pathname === '/login') return null;

    const navLinks = [
        { name: 'Dashboard', path: '/' },
        { name: 'Import', path: '/upload' },
        { name: 'Groups', path: '/groups' },
    ];

    return (
        <nav style={{
            position: 'sticky',
            top: 0,
            zIndex: 100,
            background: 'var(--bg-card)',
            borderBottom: 'var(--border-width) solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 2rem',
            height: '60px',
        }}>
            {/* Left: Brand */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <Link href="/" style={{ textDecoration: 'none' }}>
                    <h2 style={{
                        margin: 0,
                        fontSize: '1.5rem',
                        lineHeight: 1,
                        color: 'var(--text-primary)'
                    }}>
                        SyncSpace
                    </h2>
                </Link>
            </div>

            {/* Center: Links */}
            <div style={{ display: 'flex', gap: '2rem' }}>
                {navLinks.map((link) => {
                    const isActive = pathname === link.path || (link.path !== '/' && pathname.startsWith(link.path));

                    return (
                        <Link
                            key={link.path}
                            href={link.path}
                            style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: '0.85rem',
                                textTransform: 'uppercase',
                                textDecoration: 'none',
                                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                                fontWeight: isActive ? '700' : '400',
                                letterSpacing: '0.05em',
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                                height: '60px',
                            }}
                        >
                            {link.name}
                            {isActive && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    height: '3px',
                                    backgroundColor: 'var(--accent-primary)'
                                }} />
                            )}
                        </Link>
                    );
                })}
            </div>

            {/* Right: Icon Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {user && (
                    <>
                        {/* Username badge */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.25rem 0.75rem',
                            border: 'var(--border-width) solid var(--border-color)',
                            borderRadius: 'var(--radius-sm)',
                            marginRight: '0.25rem',
                        }}>
                            <div style={{
                                width: '22px', height: '22px',
                                backgroundColor: 'var(--bg-hover)',
                                border: 'var(--border-width) solid var(--border-color)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 'bold', fontSize: '0.7rem',
                                fontFamily: 'var(--font-pixel)'
                            }}>
                                {user.display_name?.charAt(0).toUpperCase() || '?'}
                            </div>
                            <span style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: '0.8rem',
                                letterSpacing: '0.05em'
                            }}>
                                {user.username}
                            </span>
                        </div>

                        {/* Theme toggle */}
                        <button
                            onClick={toggleTheme}
                            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                            style={{
                                width: '36px', height: '36px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: 'var(--border-width) solid var(--border-color)',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--bg-card)',
                                color: 'var(--text-primary)',
                                transition: 'all var(--transition-fast)',
                                cursor: 'pointer',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = 'var(--accent-primary)';
                                e.currentTarget.style.color = theme === 'dark' ? '#000' : '#fff';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'var(--bg-card)';
                                e.currentTarget.style.color = 'var(--text-primary)';
                            }}
                        >
                            {theme === 'light' ? <MoonIcon size={16} /> : <SunIcon size={16} />}
                        </button>

                        {/* Settings icon */}
                        <Link
                            href="/settings"
                            title="Settings"
                            style={{
                                width: '36px', height: '36px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: 'var(--border-width) solid var(--border-color)',
                                borderRadius: 'var(--radius-sm)',
                                background: pathname === '/settings' ? 'var(--accent-primary)' : 'var(--bg-card)',
                                color: pathname === '/settings' ? (theme === 'dark' ? '#000' : '#fff') : 'var(--text-primary)',
                                textDecoration: 'none',
                                transition: 'all var(--transition-fast)',
                            }}
                            onMouseEnter={e => {
                                if (pathname !== '/settings') {
                                    e.currentTarget.style.background = 'var(--accent-primary)';
                                    e.currentTarget.style.color = theme === 'dark' ? '#000' : '#fff';
                                }
                            }}
                            onMouseLeave={e => {
                                if (pathname !== '/settings') {
                                    e.currentTarget.style.background = 'var(--bg-card)';
                                    e.currentTarget.style.color = 'var(--text-primary)';
                                }
                            }}
                        >
                            <GearIcon size={16} />
                        </Link>

                        {/* Sign out icon */}
                        <button
                            onClick={logout}
                            title="Sign Out"
                            style={{
                                width: '36px', height: '36px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: 'var(--border-width) solid var(--border-color)',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--bg-card)',
                                color: 'var(--text-primary)',
                                transition: 'all var(--transition-fast)',
                                cursor: 'pointer',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = 'var(--accent-danger)';
                                e.currentTarget.style.color = '#fff';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'var(--bg-card)';
                                e.currentTarget.style.color = 'var(--text-primary)';
                            }}
                        >
                            <SignOutIcon size={16} />
                        </button>
                    </>
                )}
            </div>
        </nav>
    );
}
