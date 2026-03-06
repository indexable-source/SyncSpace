'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';

export default function GroupsPage() {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);

    const [showCreate, setShowCreate] = useState(false);
    const [showJoin, setShowJoin] = useState(false);

    const [newGroup, setNewGroup] = useState({ name: '', description: '' });
    const [inviteCode, setInviteCode] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const toast = useToast();
    const router = useRouter();

    const fetchGroups = async () => {
        setLoading(true);
        try {
            const data = await api.getGroups();
            setGroups(data.groups);
        } catch (err) {
            toast.error('Failed to load groups: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGroups();
    }, []);

    const handleCreate = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.createGroup(newGroup.name, newGroup.description);
            setShowCreate(false);
            setNewGroup({ name: '', description: '' });
            toast.success(`Group "${newGroup.name}" created successfully!`);
            fetchGroups();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleJoin = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.joinGroup(inviteCode);
            setShowJoin(false);
            setInviteCode('');
            toast.success('Successfully joined the group!');
            fetchGroups();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const copyInviteCode = (code) => {
        navigator.clipboard?.writeText(code);
        toast.info('Invite code copied to clipboard');
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3rem', borderBottom: 'var(--border-width) solid var(--border-color)', paddingBottom: '1.5rem' }}>
                <div>
                    <p className="font-mono text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                        Teams
                    </p>
                    <h1 className="font-serif" style={{ margin: 0, lineHeight: 1 }}>My Groups.</h1>
                    <p className="font-mono text-muted" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                        Manage your collaborative study groups.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-outline" onClick={() => { setShowJoin(true); setShowCreate(false); }}>
                        JOIN GROUP
                    </button>
                    <button className="btn btn-primary" onClick={() => { setShowCreate(true); setShowJoin(false); }}>
                        + NEW GROUP
                    </button>
                </div>
            </div>

            {/* Forms Overlay */}
            {(showCreate || showJoin) && (
                <div className="card" style={{ marginBottom: '3rem', background: 'var(--bg-elevated)', position: 'relative' }}>
                    <button
                        style={{
                            position: 'absolute',
                            top: '1rem',
                            right: '1.5rem',
                            color: 'var(--text-muted)',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '1.25rem'
                        }}
                        onClick={() => { setShowCreate(false); setShowJoin(false); }}
                        title="Close"
                    >
                        ✕
                    </button>

                    {showCreate ? (
                        <form onSubmit={handleCreate} style={{ maxWidth: '400px', margin: '0 auto', textAlign: 'center' }}>
                            <h3 className="font-serif" style={{ marginBottom: '2rem' }}>Create Group.</h3>
                            <div className="input-group" style={{ textAlign: 'left' }}>
                                <label className="input-label" style={{ fontSize: '0.7rem' }}>GROUP NAME</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="e.g. CS Project Team"
                                    value={newGroup.name}
                                    onChange={e => setNewGroup({ ...newGroup, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="input-group" style={{ textAlign: 'left' }}>
                                <label className="input-label" style={{ fontSize: '0.7rem' }}>DESCRIPTION (OPTIONAL)</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="What's this group for?"
                                    value={newGroup.description}
                                    onChange={e => setNewGroup({ ...newGroup, description: e.target.value })}
                                />
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={submitting}>
                                {submitting ? 'CREATING...' : 'CREATE GROUP'}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleJoin} style={{ maxWidth: '400px', margin: '0 auto', textAlign: 'center' }}>
                            <h3 className="font-serif" style={{ marginBottom: '2rem' }}>Join via Code.</h3>
                            <div className="input-group" style={{ textAlign: 'left' }}>
                                <label className="input-label" style={{ fontSize: '0.7rem' }}>INVITE CODE</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="e.g. 8f7a9c2b"
                                    style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', textTransform: 'uppercase' }}
                                    value={inviteCode}
                                    onChange={e => setInviteCode(e.target.value.toLowerCase())}
                                    required
                                />
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={submitting}>
                                {submitting ? 'JOINING...' : 'JOIN GROUP'}
                            </button>
                        </form>
                    )}
                </div>
            )}

            {/* Groups List */}
            {/* Groups List */}
            {loading ? (
                <div className="loader-container">
                    <div className="spinner"></div>
                    <p className="font-mono text-muted text-sm tracking-widest uppercase">LOADING GROUPS...</p>
                </div>
            ) : groups.length === 0 ? (
                <div style={{
                    border: 'var(--border-width) dashed var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '6rem 2rem',
                    textAlign: 'center',
                    background: 'var(--bg-base)'
                }}>
                    <h3 className="font-serif" style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>No Groups Yet.</h3>
                    <p className="font-mono text-muted" style={{ marginBottom: '2rem' }}>Create a group or join one using an invite code.</p>
                    <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                        + CREATE GROUP
                    </button>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem', alignItems: 'stretch' }}>
                    {groups.map(group => (
                        <Link href={`/groups/[id]`} as={`/groups/${group.id}`} key={group.id} style={{ textDecoration: 'none' }}>
                            <div
                                className="card-invert"
                                style={{
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    border: 'var(--border-width) solid var(--border-color)',
                                    borderRadius: 'var(--radius-sm)',
                                    background: 'var(--bg-elevated)',
                                    transition: 'all 0.2s',
                                    padding: '1.5rem'
                                }}
                            >
                                <h3 className="font-mono" style={{ margin: '0 0 0.5rem 0', textTransform: 'uppercase', fontSize: '1.1rem' }}>
                                    {group.name}
                                </h3>

                                <p className="font-mono text-muted" style={{ fontSize: '0.8rem', marginBottom: '2rem', flex: 1, lineHeight: 1.5 }}>
                                    {group.description || 'No description provided.'}
                                </p>

                                <div style={{
                                    marginTop: 'auto',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    borderTop: 'var(--border-width) solid var(--border-color)',
                                    paddingTop: '1rem',
                                    paddingBottom: '0'
                                }}>
                                    <span
                                        style={{
                                            fontFamily: 'var(--font-jetbrains-mono), monospace',
                                            fontSize: '0.75rem',
                                            cursor: 'pointer',
                                            borderBottom: 'var(--border-width) dashed currentColor',
                                            paddingBottom: '0.1rem'
                                        }}
                                        onClick={(e) => { e.preventDefault(); copyInviteCode(group.invite_code); }}
                                        title="Click to copy"
                                    >
                                        CODE: {group.invite_code}
                                    </span>
                                    <span className="font-mono" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                                        VIEW DETAILS →
                                    </span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
