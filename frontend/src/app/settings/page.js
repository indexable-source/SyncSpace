'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
    const { user, updateUser, logout } = useAuth();
    const toast = useToast();
    const router = useRouter();

    // Profile editing
    const [editingProfile, setEditingProfile] = useState(false);
    const [profileData, setProfileData] = useState({ display_name: '', email: '' });
    const [savingProfile, setSavingProfile] = useState(false);

    // Password change
    const [showPasswordChange, setShowPasswordChange] = useState(false);
    const [passwordData, setPasswordData] = useState({ current: '', new: '', confirm: '' });
    const [savingPassword, setSavingPassword] = useState(false);
    const [passwordStrength, setPasswordStrength] = useState({
        length: false, upper: false, lower: false, number: false, special: false
    });

    // Delete account
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);

    // Unlink ERP
    const [unlinking, setUnlinking] = useState(false);

    const handleUnlinkErp = async () => {
        setUnlinking(true);
        try {
            await api.unlinkErp();
            updateUser({ erp_roll_number: null });
            toast.success('ERP roll number unlinked from your account.');
        } catch (err) {
            toast.error(err.message || 'Failed to unlink roll number');
        } finally {
            setUnlinking(false);
        }
    };

    const startEditProfile = () => {
        setProfileData({
            display_name: user?.display_name || '',
            email: user?.email || '',
        });
        setEditingProfile(true);
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setSavingProfile(true);
        try {
            await api.updateProfile(profileData.display_name, profileData.email);
            updateUser({ display_name: profileData.display_name, email: profileData.email });
            setEditingProfile(false);
            toast.success('Profile updated successfully');
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSavingProfile(false);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (passwordData.new !== passwordData.confirm) {
            toast.error('New passwords do not match');
            return;
        }

        const { length, upper, lower, number, special } = passwordStrength;
        if (!length || !upper || !lower || !number || !special) {
            toast.error('New password does not meet all complexity requirements');
            return;
        }

        setSavingPassword(true);
        try {
            await api.changePassword(passwordData.current, passwordData.new);
            setPasswordData({ current: '', new: '', confirm: '' });
            setShowPasswordChange(false);
            toast.success('Password changed successfully');
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSavingPassword(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (deleteConfirmText !== 'DELETE') return;
        setDeleting(true);
        try {
            await api.deleteAccount();
            toast.success('Account deleted successfully');
            logout();
        } catch (err) {
            toast.error(err.message);
            setDeleting(false);
        }
    };

    const handleExportICS = async () => {
        try {
            const schedule = await api.getMySchedule();

            let icsContent = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                'PRODID:-//SyncSpace//KL Schedule//EN',
                'CALSCALE:GREGORIAN',
            ];

            const today = new Date();

            (schedule.entries || []).forEach(entry => {
                const d = new Date(today);
                d.setDate(today.getDate() + (entry.day_of_week + 1 - today.getDay() + 7) % 7);
                const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
                const startStr = entry.start_time.replace(':', '') + '00';
                const endStr = entry.end_time.replace(':', '') + '00';

                icsContent.push(
                    'BEGIN:VEVENT',
                    `DTSTART:${dateStr}T${startStr}`,
                    `DTEND:${dateStr}T${endStr}`,
                    `SUMMARY:${entry.subject || 'Class'}`,
                    `LOCATION:${entry.room || 'TBD'}`,
                    'RRULE:FREQ=WEEKLY',
                    'END:VEVENT'
                );
            });

            icsContent.push('END:VCALENDAR');

            const blob = new Blob([icsContent.join('\n')], { type: 'text/calendar' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${user?.username || 'syncspace'}_schedule.ics`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            toast.success('CALENDAR FILE EXPORTED');
        } catch (err) {
            toast.error('Failed to export: ' + err.message);
        }
    };

    if (!user) return (
        <div className="loader-container">
            <div className="spinner"></div>
            <p className="font-mono text-muted text-sm tracking-widest uppercase">LOADING SETTINGS...</p>
        </div>
    );

    return (
        <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>

            <div style={{ marginBottom: '4rem', borderBottom: 'var(--border-width) solid var(--border-color)', paddingBottom: '2rem' }}>
                <p className="font-mono text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                    Preferences
                </p>
                <h1 className="font-serif" style={{ margin: 0, lineHeight: 1 }}>Settings.</h1>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>

                {/* Profile */}
                <div>
                    <h3 className="font-serif" style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Account.</h3>
                    <div style={{
                        border: 'var(--border-width) solid var(--border-color)',
                        borderRadius: '0',
                        background: 'var(--bg-elevated)'
                    }}>
                        {!editingProfile ? (
                            <div style={{ padding: '2rem' }}>
                                <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>

                                    <div style={{
                                        width: '80px', height: '80px',
                                        borderRadius: '0',
                                        background: 'var(--bg-base)',
                                        border: 'var(--border-width) solid var(--border-color)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontFamily: 'var(--font-silkscreen), cursive',
                                        color: 'var(--text-primary)',
                                        fontSize: '2.5rem',
                                        flexShrink: 0
                                    }}>
                                        {user.display_name?.charAt(0).toUpperCase() || '?'}
                                    </div>

                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                                            <div>
                                                <label className="input-label" style={{ fontSize: '0.7rem' }}>DISPLAY NAME</label>
                                                <div className="font-mono" style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{user.display_name}</div>
                                            </div>
                                            <div>
                                                <label className="input-label" style={{ fontSize: '0.7rem' }}>USERNAME</label>
                                                <div className="font-mono" style={{ fontSize: '1.1rem' }}>@{user.username}</div>
                                            </div>
                                            <div>
                                                <label className="input-label" style={{ fontSize: '0.7rem' }}>EMAIL</label>
                                                <div className="font-mono" style={{ fontSize: '1.1rem' }}>{user.email || 'Not provided'}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: 'var(--border-width) dotted var(--border-color)', paddingTop: '1.5rem' }}>
                                            <button className="btn btn-outline" onClick={startEditProfile}>EDIT PROFILE</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleSaveProfile} style={{ padding: '2rem' }}>
                                <div className="input-group">
                                    <label className="input-label" style={{ fontSize: '0.7rem' }}>DISPLAY NAME</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        value={profileData.display_name}
                                        onChange={e => setProfileData({ ...profileData, display_name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label" style={{ fontSize: '0.7rem' }}>EMAIL ADDRESS</label>
                                    <input
                                        type="email"
                                        className="input-field"
                                        value={profileData.email}
                                        onChange={e => setProfileData({ ...profileData, email: e.target.value })}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: 'var(--border-width) dotted var(--border-color)', paddingTop: '1.5rem', marginTop: '2rem' }}>
                                    <button type="button" className="btn btn-outline" onClick={() => setEditingProfile(false)}>CANCEL</button>
                                    <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                                        {savingProfile ? 'SAVING...' : 'SAVE CHANGES'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>

                {/* Linked Accounts */}
                <div>
                    <h3 className="font-serif" style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Linked Accounts.</h3>
                    <div style={{
                        border: 'var(--border-width) solid var(--border-color)',
                        borderRadius: '0',
                        background: 'var(--bg-elevated)',
                        padding: '2rem'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            border: 'var(--border-width) solid var(--border-color)',
                            background: 'var(--bg-base)',
                            padding: '1.5rem',
                            borderRadius: 'var(--radius-sm)'
                        }}>
                            <div>
                                <h4 className="font-mono" style={{ margin: '0 0 1rem 0', textTransform: 'uppercase' }}>KL UNIVERSITY ERP</h4>
                                {user.erp_roll_number ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <div className="font-mono" style={{ fontSize: '0.85rem' }}>
                                            <span className="text-muted">ROLL NO:</span> <strong style={{ color: 'var(--text-primary)' }}>{user.erp_roll_number}</strong>
                                        </div>
                                        <div className="font-mono" style={{ fontSize: '0.75rem' }}>
                                            <span className="text-muted">STATUS:</span> <span style={{ color: 'var(--color-subj-4)' }}>● LINKED</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="font-mono" style={{ fontSize: '0.75rem' }}>
                                        <span className="text-muted">STATUS:</span> <span>○ NOT LINKED</span>
                                    </div>
                                )}
                            </div>

                            <div>
                                {user.erp_roll_number ? (
                                    <button
                                        className="btn btn-outline"
                                        onClick={handleUnlinkErp}
                                        disabled={unlinking}
                                    >
                                        {unlinking ? 'UNLINKING...' : 'UNLINK'}
                                    </button>
                                ) : (
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => router.push('/upload')}
                                    >
                                        LINK VIA IMPORT →
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Password / Security */}
                <div>
                    <h3 className="font-serif" style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Security.</h3>
                    <div style={{
                        border: 'var(--border-width) solid var(--border-color)',
                        borderRadius: '0',
                        background: 'var(--bg-elevated)',
                        padding: '2rem'
                    }}>
                        {!showPasswordChange ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div className="font-mono" style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1.1rem' }}>Password</div>
                                    <p className="font-mono text-muted" style={{ fontSize: '0.85rem' }}>••••••••••••</p>
                                </div>
                                <button className="btn btn-outline" onClick={() => setShowPasswordChange(true)}>CHANGE PASSWORD</button>
                            </div>
                        ) : (
                            <form onSubmit={handleChangePassword}>
                                <div className="input-group">
                                    <label className="input-label" style={{ fontSize: '0.7rem' }}>CURRENT PASSWORD</label>
                                    <input
                                        type="password"
                                        className="input-field"
                                        value={passwordData.current}
                                        onChange={e => setPasswordData({ ...passwordData, current: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label" style={{ fontSize: '0.7rem' }}>NEW PASSWORD</label>
                                    <input
                                        type="password"
                                        className="input-field"
                                        value={passwordData.new}
                                        onChange={e => {
                                            const p = e.target.value;
                                            setPasswordData({ ...passwordData, new: p });
                                            setPasswordStrength({
                                                length: p.length >= 8,
                                                upper: /[A-Z]/.test(p),
                                                lower: /[a-z]/.test(p),
                                                number: /[0-9]/.test(p),
                                                special: /[!@#$%^&*(),.?":{}|<>]/.test(p)
                                            });
                                        }}
                                        required
                                    />
                                    {passwordData.new.length > 0 && (
                                        <div style={{ marginTop: '1rem', background: 'var(--bg-base)', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                                            <p className="font-mono text-muted" style={{ fontSize: '0.7rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Password strength</p>
                                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.75rem', fontFamily: 'var(--font-jetbrains-mono)' }}>
                                                <li style={{ color: passwordStrength.length ? 'var(--accent-success)' : 'var(--text-muted)' }}>{passwordStrength.length ? '✓' : '○'} 8+ characters</li>
                                                <li style={{ color: passwordStrength.upper ? 'var(--accent-success)' : 'var(--text-muted)' }}>{passwordStrength.upper ? '✓' : '○'} Uppercase letter</li>
                                                <li style={{ color: passwordStrength.lower ? 'var(--accent-success)' : 'var(--text-muted)' }}>{passwordStrength.lower ? '✓' : '○'} Lowercase letter</li>
                                                <li style={{ color: passwordStrength.number ? 'var(--accent-success)' : 'var(--text-muted)' }}>{passwordStrength.number ? '✓' : '○'} Number</li>
                                                <li style={{ color: passwordStrength.special ? 'var(--accent-success)' : 'var(--text-muted)' }}>{passwordStrength.special ? '✓' : '○'} Special character</li>
                                            </ul>
                                        </div>
                                    )}
                                </div>
                                <div className="input-group">
                                    <label className="input-label" style={{ fontSize: '0.7rem' }}>CONFIRM NEW PASSWORD</label>
                                    <input
                                        type="password"
                                        className="input-field"
                                        value={passwordData.confirm}
                                        onChange={e => setPasswordData({ ...passwordData, confirm: e.target.value })}
                                        required
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: 'var(--border-width) dotted var(--border-color)', paddingTop: '1.5rem', marginTop: '2rem' }}>
                                    <button type="button" className="btn btn-outline" onClick={() => setShowPasswordChange(false)}>CANCEL</button>
                                    <button type="submit" className="btn btn-primary" disabled={savingPassword}>
                                        {savingPassword ? 'CHANGING...' : 'CHANGE PASSWORD'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>

                {/* Calendar Integration */}
                <div>
                    <h3 className="font-serif" style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Export.</h3>
                    <div style={{
                        border: 'var(--border-width) solid var(--border-color)',
                        borderRadius: '0',
                        background: 'var(--bg-elevated)',
                        padding: '2rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ maxWidth: '60%' }}>
                                <div className="font-mono" style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1.1rem' }}>Download Schedule</div>
                                <p className="font-mono text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>Export your schedule as an .ics file to import into Apple Calendar, Google Calendar, or Outlook.</p>
                            </div>
                            <button className="btn btn-primary" onClick={handleExportICS}>
                                DOWNLOAD .ICS ↓
                            </button>
                        </div>
                    </div>
                </div>

                {/* Danger Zone */}
                <div>
                    <h3 className="font-serif" style={{ marginBottom: '0.5rem', fontSize: '1.5rem', color: 'var(--accent-danger)' }}>Danger zone.</h3>
                    <p className="font-mono text-muted" style={{ fontSize: '0.8rem', marginBottom: '1.5rem' }}>Irreversible actions</p>
                    <div style={{
                        border: '1px solid var(--accent-danger)',
                        borderRadius: '0',
                        background: 'var(--bg-elevated)',
                        padding: '2rem'
                    }}>
                        {!showDeleteConfirm ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div className="font-mono" style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1.1rem' }}>Delete account</div>
                                    <p className="font-mono text-muted" style={{ fontSize: '0.85rem' }}>Permanently delete your account and all data</p>
                                </div>
                                <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>
                                    DELETE ACCOUNT
                                </button>
                            </div>
                        ) : (
                            <div>
                                <p className="font-mono" style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--accent-danger)' }}>
                                    This action is permanent and cannot be undone. All your data will be deleted.
                                </p>
                                <div className="input-group">
                                    <label className="input-label" style={{ fontSize: '0.7rem', color: 'var(--accent-danger)' }}>
                                        TYPE &quot;DELETE&quot; TO CONFIRM
                                    </label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        value={deleteConfirmText}
                                        onChange={e => setDeleteConfirmText(e.target.value)}
                                        placeholder="DELETE"
                                        style={{ borderColor: 'var(--accent-danger)' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                                    <button className="btn btn-outline" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}>CANCEL</button>
                                    <button
                                        className="btn btn-danger"
                                        onClick={handleDeleteAccount}
                                        disabled={deleteConfirmText !== 'DELETE' || deleting}
                                        style={{
                                            backgroundColor: deleteConfirmText === 'DELETE' ? 'var(--accent-danger)' : 'transparent',
                                            color: deleteConfirmText === 'DELETE' ? '#fff' : 'var(--accent-danger)',
                                        }}
                                    >
                                        {deleting ? 'DELETING...' : 'PERMANENTLY DELETE'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
