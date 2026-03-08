'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import Link from 'next/link';

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function MeetingsPage() {
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const fetch = async () => {
            try {
                const data = await api.getDashboardMeetings();
                setMeetings(data.meetings || []);
            } catch (err) {
                console.error('Failed to load meetings', err);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, []);

    if (loading) return (
        <div className="loader-container">
            <div className="spinner"></div>
            <p className="font-mono text-muted text-sm tracking-widest uppercase">LOADING MEETINGS...</p>
        </div>
    );

    return (
        <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem', borderBottom: 'var(--border-width) solid var(--border-color)', paddingBottom: '1.5rem' }}>
                <p className="font-mono text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                    Your Schedule
                </p>
                <h1 className="font-serif" style={{ margin: 0, lineHeight: 1 }}>Upcoming Meetings.</h1>
                <p className="font-mono text-muted" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    {meetings.length} session{meetings.length !== 1 ? 's' : ''} scheduled across your groups.
                </p>
            </div>

            {meetings.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    padding: '4rem 2rem',
                    border: 'var(--border-width) dashed var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-card)',
                }}>
                    <h3 className="font-serif" style={{ marginBottom: '0.75rem' }}>No meetings yet.</h3>
                    <p className="font-mono text-muted" style={{ marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                        Schedule a meeting from any group to see it here.
                    </p>
                    <button className="btn btn-primary" onClick={() => router.push('/groups')}>
                        GO TO GROUPS
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {DAYS.map((day, dayIdx) => {
                        const dayMeetings = meetings.filter(m => m.day_of_week === dayIdx);
                        if (dayMeetings.length === 0) return null;
                        return (
                            <div key={day}>
                                <h3 className="font-mono" style={{
                                    fontSize: '0.75rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    color: 'var(--text-muted)',
                                    marginBottom: '0.75rem',
                                    paddingBottom: '0.5rem',
                                    borderBottom: 'var(--border-width) solid var(--border-light)',
                                }}>
                                    {day}
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                    {dayMeetings.map(m => (
                                        <Link href={`/groups/${m.group_invite_code}`} key={m.id} style={{ textDecoration: 'none' }}>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'stretch',
                                                border: 'var(--border-width) solid var(--border-color)',
                                                borderRadius: 'var(--radius-sm)',
                                                overflow: 'hidden',
                                                transition: 'border-color 0.2s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                                            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                            >
                                                {/* Accent strip */}
                                                <div style={{
                                                    width: '4px',
                                                    background: 'var(--accent-primary)',
                                                    flexShrink: 0,
                                                }} />
                                                <div style={{ flex: 1, padding: '1rem 1.25rem' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                                                        <strong className="font-serif" style={{ fontSize: '1.1rem' }}>{m.title}</strong>
                                                        <span className="font-mono text-muted" style={{ fontSize: '0.7rem', flexShrink: 0, marginLeft: '1rem' }}>
                                                            {m.start_time} - {m.end_time}
                                                        </span>
                                                    </div>
                                                    <div className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>
                                                        Group: <span style={{ color: 'var(--text-primary)' }}>{m.group_name}</span>
                                                    </div>
                                                    {m.participants && m.participants.length > 0 && (
                                                        <div className="font-mono text-muted" style={{ fontSize: '0.7rem', marginTop: '0.4rem', borderTop: 'var(--border-width) dashed var(--border-color)', paddingTop: '0.4rem' }}>
                                                            With: {m.participants.map(p => `@${p.username}`).join(', ')}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
