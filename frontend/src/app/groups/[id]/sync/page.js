'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 8 AM to 6 PM

export default function GroupSyncPage({ params }) {
    const { id } = params;
    const router = useRouter();

    const [syncData, setSyncData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [selectedSlot, setSelectedSlot] = useState(null);
    const [slotForm, setSlotForm] = useState({ title: '', description: '' });
    const [isScheduling, setIsScheduling] = useState(false);

    useEffect(() => {
        const fetchSync = async () => {
            try {
                const data = await api.syncGroupSchedules(id);
                setSyncData(data);
            } catch (err) {
                setError(err.message || 'Failed to sync schedules');
            } finally {
                setLoading(false);
            }
        };
        if (id) fetchSync();
    }, [id]);

    const handleScheduleSlot = async (e) => {
        e.preventDefault();
        if (!selectedSlot) return;

        setIsScheduling(true);
        try {
            await api.createSlot(
                id,
                slotForm.title,
                slotForm.description,
                selectedSlot.day_of_week,
                selectedSlot.start_time,
                selectedSlot.end_time
            );
            router.push(`/groups/${id}`);
        } catch (err) {
            alert(err.message);
            setIsScheduling(false);
        }
    };

    if (loading) return (
        <div className="loader-container">
            <div className="spinner"></div>
            <p className="font-mono text-muted text-sm tracking-widest uppercase">
                {syncData?.users_analyzed ? `ANALYZING ${syncData.users_analyzed} SCHEDULES...` : 'FINDING COMMON TIME...'}
            </p>
        </div>
    );

    if (error) return (
        <div style={{ maxWidth: '600px', margin: '4rem auto', textAlign: 'center' }}>
            <h3 className="font-serif" style={{ color: 'var(--accent-primary)', fontSize: '2rem', marginBottom: '1rem' }}>Sync Failed.</h3>
            <p className="font-mono text-muted" style={{ marginBottom: '2rem' }}>{error}</p>
            <button className="btn btn-outline" onClick={() => router.push(`/groups/${id}`)}>
                ← RETURN TO GROUP
            </button>
        </div>
    );

    // Helper to draw the free slots on the grid
    const getGridStyle = (slot) => {
        const startHour = parseInt(slot.start_time.split(':')[0]);
        const startMin = parseInt(slot.start_time.split(':')[1]);
        const endHour = parseInt(slot.end_time.split(':')[0]);
        const endMin = parseInt(slot.end_time.split(':')[1]);

        const rowStart = ((startHour - 8) * 60 + startMin) / 30 + 2;
        let rowEnd = Math.floor(((endHour - 8) * 60 + endMin) / 30) + 2;
        if (rowEnd <= rowStart) rowEnd = rowStart + 1;

        const colStart = slot.day_of_week + 2;

        const isSelected = selectedSlot &&
            selectedSlot.day_of_week === slot.day_of_week &&
            selectedSlot.start_time === slot.start_time;

        return {
            gridColumn: colStart,
            gridRow: `${rowStart} / ${rowEnd}`,
            background: isSelected ? 'var(--text-primary)' : 'var(--bg-elevated)',
            border: `var(--border-width) solid ${isSelected ? 'var(--text-primary)' : 'var(--border-color)'}`,
            color: isSelected ? 'var(--bg-base)' : 'var(--text-primary)',
            padding: '0.4rem',
            borderRadius: '0',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            transition: 'all 0.15s ease',
            position: 'relative',
            margin: '2px',
            overflow: 'hidden',
            zIndex: isSelected ? 20 : 10,
            textTransform: 'uppercase'
        };
    };

    return (
        <div className="animate-fade-in" style={{ height: 'calc(100vh - 8rem)', display: 'flex', flexDirection: 'column', maxWidth: '1200px', margin: '0 auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', borderBottom: 'var(--border-width) solid var(--border-color)', paddingBottom: '1.5rem' }}>
                <div>
                    <button
                        onClick={() => router.push(`/groups/${id}`)}
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
                        ← BACK TO GROUP
                    </button>
                    <h1 className="font-serif" style={{ margin: 0, lineHeight: 1 }}>Sync & Schedule.</h1>
                    <p className="font-mono text-muted" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                        Found {syncData.common_free_slots.length} available slots across {syncData.users_analyzed} members.
                    </p>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '2rem', flex: 1, minHeight: 0 }}>

                {/* Left: The Visual Grid */}
                <div style={{
                    flex: 2,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    border: 'var(--border-width) solid var(--border-color)',
                    background: 'var(--bg-base)'
                }}>
                    <div style={{ overflow: 'auto', flex: 1 }} className="custom-scrollbar">
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '60px repeat(6, minmax(120px, 1fr))',
                            gridTemplateRows: `40px repeat(${HOURS.length * 2}, 30px)`,
                            minWidth: '800px',
                            position: 'relative'
                        }}>

                            {/* Grid Lines */}
                            {Array.from({ length: HOURS.length * 2 }).map((_, idx) => (
                                <div key={`hr-${idx}`} style={{
                                    gridColumn: '2 / span 6',
                                    gridRow: idx + 2,
                                    borderBottom: idx % 2 === 1 ? 'var(--border-width) dotted var(--border-color)' : 'var(--border-width) solid var(--border-color)',
                                }} />
                            ))}
                            {Array.from({ length: 6 }).map((_, idx) => (
                                <div key={`col-${idx}`} style={{
                                    gridColumn: idx + 2,
                                    gridRow: '1 / span 23',
                                    borderRight: 'var(--border-width) solid var(--border-color)',
                                }} />
                            ))}

                            <div style={{ gridColumn: 1, gridRow: 1, background: 'var(--bg-base)', borderBottom: 'var(--border-width) solid var(--border-color)', borderRight: 'var(--border-width) solid var(--border-color)', zIndex: 5, position: 'sticky', top: 0, left: 0 }}></div>

                            {/* Day Headers */}
                            {DAYS.map((day, idx) => (
                                <div key={day} className="font-mono" style={{
                                    gridColumn: idx + 2,
                                    gridRow: 1,
                                    background: 'var(--bg-base)',
                                    padding: '0.75rem',
                                    fontWeight: 'bold',
                                    textAlign: 'center',
                                    fontSize: '0.8rem',
                                    borderBottom: 'var(--border-width) solid var(--border-color)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    zIndex: 4,
                                    position: 'sticky',
                                    top: 0
                                }}>
                                    {day}
                                </div>
                            ))}

                            {/* Time Labels */}
                            {HOURS.map((hour, i) => (
                                <div key={hour} className="font-mono" style={{
                                    gridColumn: 1,
                                    gridRow: `${i * 2 + 2} / span 2`,
                                    background: 'var(--bg-base)',
                                    borderRight: 'var(--border-width) solid var(--border-color)',
                                    textAlign: 'right',
                                    padding: '0.5rem',
                                    fontSize: '0.7rem',
                                    color: 'var(--text-muted)',
                                    zIndex: 4,
                                    position: 'sticky',
                                    left: 0
                                }}>
                                    {hour > 12 ? hour - 12 : hour}{hour >= 12 ? ' PM' : ' AM'}
                                </div>
                            ))}

                            {/* Free Slots */}
                            {syncData.common_free_slots.map((slot, idx) => (
                                <div
                                    key={idx}
                                    style={getGridStyle(slot)}
                                    onClick={() => setSelectedSlot(slot)}
                                    onMouseEnter={(e) => {
                                        if (!selectedSlot || (selectedSlot.day_of_week !== slot.day_of_week || selectedSlot.start_time !== slot.start_time)) {
                                            e.currentTarget.style.background = 'var(--text-primary)';
                                            e.currentTarget.style.color = 'var(--bg-base)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!selectedSlot || (selectedSlot.day_of_week !== slot.day_of_week || selectedSlot.start_time !== slot.start_time)) {
                                            e.currentTarget.style.background = 'var(--bg-elevated)';
                                            e.currentTarget.style.color = 'var(--text-primary)';
                                        }
                                    }}
                                >
                                    <div style={{ fontWeight: 'bold', marginBottom: '0.2rem' }}>AVAILABLE</div>
                                    <div style={{ opacity: 0.9, fontSize: '0.65rem' }}>{slot.start_time} - {slot.end_time}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Booking Panel */}
                <div style={{ width: '380px', display: 'flex', flexDirection: 'column' }}>

                    <h3 className="font-serif" style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Book Session.</h3>

                    {selectedSlot ? (
                        <form onSubmit={handleScheduleSlot} className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{
                                background: 'var(--bg-elevated)',
                                padding: '1.5rem',
                                border: 'var(--border-width) solid var(--text-primary)',
                                borderRadius: '0'
                            }}>
                                <div className="font-mono text-muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>SELECTED TIME</div>
                                <div className="font-serif" style={{ fontSize: '1.5rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                                    {DAYS[selectedSlot.day_of_week]}.
                                </div>
                                <div className="font-mono" style={{ fontSize: '0.9rem' }}>
                                    {selectedSlot.start_time} — {selectedSlot.end_time}
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="input-label" style={{ fontSize: '0.7rem' }}>MEETING TITLE</label>
                                <input type="text" className="input-field" required placeholder="e.g. Project Phase 2 Sync" value={slotForm.title} onChange={e => setSlotForm({ ...slotForm, title: e.target.value })} />
                            </div>

                            <div className="input-group">
                                <label className="input-label" style={{ fontSize: '0.7rem' }}>DESCRIPTION / AGENDA</label>
                                <textarea
                                    className="input-field"
                                    rows={4}
                                    style={{ resize: 'vertical' }}
                                    placeholder="Briefly describe what this session is for..."
                                    value={slotForm.description}
                                    onChange={e => setSlotForm({ ...slotForm, description: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto' }}>
                                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isScheduling}>
                                    {isScheduling ? 'SCHEDULING...' : 'CONFIRM SESSION'}
                                </button>

                                <button type="button" className="btn btn-outline" style={{ width: '100%' }} onClick={() => setSelectedSlot(null)}>
                                    CANCEL
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div style={{
                            textAlign: 'center',
                            padding: '4rem 2rem',
                            border: 'var(--border-width) dashed var(--border-color)',
                            background: 'var(--bg-base)',
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}>
                            <div className="font-mono" style={{ fontSize: '2rem', marginBottom: '1rem' }}>+</div>
                            <p className="font-mono text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                                Click on any available slot on the calendar grid to block out a collaborative session for your group.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
