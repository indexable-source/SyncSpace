'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function GroupDetailsPage({ params }) {
    const { id } = params;
    const router = useRouter();

    const [group, setGroup] = useState(null);
    const [members, setMembers] = useState([]);
    const [slots, setSlots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchGroupData = async () => {
            try {
                const [groupData, slotsData] = await Promise.all([
                    api.getGroupDetails(id),
                    api.getSlots(id)
                ]);
                setGroup(groupData.group);
                setMembers(groupData.members);
                setSlots(slotsData.slots);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchGroupData();
    }, [id]);

    if (loading) return (
        <div className="loader-container">
            <div className="spinner"></div>
            <p className="font-mono text-muted text-sm tracking-widest uppercase">LOADING GROUP DETAILS...</p>
        </div>
    );

    if (error || !group) return (
        <div style={{ maxWidth: '600px', margin: '4rem auto', textAlign: 'center' }}>
            <h3 className="font-serif" style={{ color: 'var(--accent-primary)', fontSize: '2rem', marginBottom: '1rem' }}>Group Not Found.</h3>
            <p className="font-mono text-muted" style={{ marginBottom: '2rem' }}>{error || "The requested group could not be located."}</p>
            <button className="btn btn-outline" onClick={() => router.push('/groups')}>
                ← RETURN TO GROUPS
            </button>
        </div>
    );

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>

            {/* Header Section */}
            <div style={{ marginBottom: '3rem', borderBottom: 'var(--border-width) solid var(--border-color)', paddingBottom: '2rem' }}>
                <button
                    onClick={() => router.push('/groups')}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-jetbrains-mono), monospace',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        padding: '0',
                        marginBottom: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        letterSpacing: '0.05em'
                    }}
                    onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
                    onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}
                >
                    ← BACK TO GROUPS
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <p className="font-mono text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                            Team Details
                        </p>
                        <h1 className="font-serif" style={{ margin: 0, lineHeight: 1 }}>{group.name}.</h1>
                        {group.description && <p className="font-mono text-muted" style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>{group.description}</p>}

                        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginTop: '1.5rem' }}>
                            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
                                <span className="text-muted">INVITE CODE: </span>
                                <strong style={{ color: 'var(--text-primary)', borderBottom: '1px dashed currentColor' }}>{group.invite_code}</strong>
                            </span>
                            <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>
                                👥 {members.length} {members.length !== 1 ? 'MEMBERS' : 'MEMBER'}
                            </span>
                        </div>
                    </div>

                    <button
                        className="btn btn-primary"
                        style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}
                        onClick={() => router.push(`/groups/${id}/sync`)}
                    >
                        SYNC SCHEDULES →
                    </button>
                </div>
            </div>

            {/* Content Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '2rem', alignItems: 'start' }}>

                {/* Left Column: Members */}
                <div>
                    <h3 className="font-serif" style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Members.</h3>

                    <div style={{
                        border: 'var(--border-width) solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-elevated)',
                        overflow: 'hidden'
                    }}>
                        {members.map((member, index) => (
                            <div key={member.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                padding: '1rem 1.5rem',
                                borderBottom: index < members.length - 1 ? 'var(--border-width) solid var(--border-color)' : 'none',
                                transition: 'background 0.2s'
                            }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                                <div style={{
                                    width: '32px', height: '32px',
                                    borderRadius: '0',
                                    background: 'var(--bg-base)',
                                    border: 'var(--border-width) solid var(--border-color)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontFamily: 'var(--font-silkscreen), cursive',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.8rem'
                                }}>
                                    {member.display_name.charAt(0).toUpperCase()}
                                </div>
                                <div style={{ overflow: 'hidden' }}>
                                    <div className="font-mono" style={{ fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                        {member.display_name}
                                    </div>
                                    <div className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>
                                        @{member.username}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Column: Sessions */}
                <div>
                    <h3 className="font-serif" style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Upcoming Sessions.</h3>

                    {slots.length === 0 ? (
                        <div style={{
                            border: 'var(--border-width) dashed var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            padding: '4rem 2rem',
                            textAlign: 'center',
                            background: 'var(--bg-base)'
                        }}>
                            <p className="font-mono text-muted" style={{ marginBottom: '1rem', textTransform: 'uppercase', fontSize: '0.8rem' }}>No scheduled sessions found.</p>
                            <button className="btn btn-outline" onClick={() => router.push(`/groups/${id}/sync`)} style={{ fontSize: '0.75rem', padding: '0.5rem 1rem' }}>
                                SCHEDULE A SESSION
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {slots.map(slot => (
                                <div key={slot.id} className="card-invert" style={{
                                    padding: '1.5rem',
                                    borderRadius: 'var(--radius-sm)',
                                    background: 'var(--bg-elevated)',
                                    border: 'var(--border-width) solid var(--border-color)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'all 0.2s',
                                    cursor: 'pointer'
                                }}>
                                    <div>
                                        <h4 className="font-mono" style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', textTransform: 'uppercase' }}>{slot.title}</h4>
                                        {slot.description && <p className="font-mono text-muted" style={{ fontSize: '0.8rem', margin: '0 0 1rem 0' }}>{slot.description}</p>}

                                        <div style={{ display: 'inline-flex', gap: '1rem', fontSize: '0.75rem', fontFamily: 'var(--font-jetbrains-mono), monospace', background: 'var(--bg-base)', padding: '0.4rem 0.8rem', border: 'var(--border-width) solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                                            <span style={{ color: 'var(--text-primary)' }}>{DAYS[slot.day_of_week].toUpperCase()}</span>
                                            <span className="text-muted">|</span>
                                            <span style={{ color: 'var(--text-primary)' }}>{slot.start_time} - {slot.end_time}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
