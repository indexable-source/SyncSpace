'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Copying the EXACT segments from the Dashboard for unification
const SEGMENTS = [
    { id: 'P1', label: 'I', time: '08:10 – 09:00', type: 'period', minStart: 10, minEnd: 60 },
    { id: 'P2', label: 'II', time: '09:00 – 09:50', type: 'period', minStart: 60, minEnd: 110 },
    { id: 'B1', label: 'Break I', time: '09:50 – 10:00', type: 'break', minStart: 110, minEnd: 120 },
    { id: 'P3', label: 'III', time: '10:00 – 10:50', type: 'period', minStart: 120, minEnd: 170 },
    { id: 'P4', label: 'IV', time: '10:50 – 11:40', type: 'period', minStart: 170, minEnd: 220 },
    { id: 'B2', label: 'Break II', time: '11:40 – 11:50', type: 'break', minStart: 220, minEnd: 230 },
    { id: 'P5', label: 'V', time: '11:50 – 12:40', type: 'period', minStart: 230, minEnd: 280 },
    { id: 'LB', label: 'Lunch', time: '12:40 – 13:20', type: 'lunch', minStart: 280, minEnd: 320 },
    { id: 'P6', label: 'VI', time: '13:20 – 14:10', type: 'period', minStart: 320, minEnd: 370 },
    { id: 'B3', label: 'Break III', time: '14:10 – 14:20', type: 'break', minStart: 370, minEnd: 380 },
    { id: 'P7', label: 'VII', time: '14:20 – 15:10', type: 'period', minStart: 380, minEnd: 430 },
    { id: 'P8', label: 'VIII', time: '15:10 – 16:00', type: 'period', minStart: 430, minEnd: 480 },
];

const segHeight = (seg) => {
    if (seg.type === 'break') return 20;
    if (seg.type === 'lunch') return 36;
    return 75; // all class periods are ~50 min
};

export default function GroupSyncPage({ params }) {
    const { id } = use(params);
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
                if (err.status === 400 && err.message.toLowerCase().includes("import")) {
                    setError("MISSING_SCHEDULE");
                } else {
                    setError(err.message || 'Failed to sync schedules');
                }
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

    if (error === "MISSING_SCHEDULE") return (
        <div style={{ maxWidth: '600px', margin: '4rem auto', textAlign: 'center' }}>
            <h3 className="font-serif" style={{ fontSize: '2rem', marginBottom: '1rem' }}>Schedule Required.</h3>
            <p className="font-mono text-muted" style={{ marginBottom: '2rem' }}>You must import a timetable via the Dashboard first to use sync and scheduling features.</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button className="btn btn-outline" onClick={() => router.push(`/groups/${id}`)}>
                    ← BACK TO GROUP
                </button>
                <button className="btn btn-primary" onClick={() => router.push('/upload')}>
                    IMPORT TIMETABLE →
                </button>
            </div>
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

    // Helper to draw the free slots on the unified grid
    const timeToMin = (t) => {
        const [h, m] = t.split(':').map(Number);
        return (h - 8) * 60 + m;
    };

    const minToY = (min) => {
        let y = 0;
        for (const seg of SEGMENTS) {
            const h = segHeight(seg);
            if (min <= seg.minStart) return y;
            if (min <= seg.minEnd) {
                const frac = (min - seg.minStart) / (seg.minEnd - seg.minStart);
                return y + frac * h;
            }
            y += h;
        }
        return y;
    };

    const getGridStyle = (slot) => {
        const startMin = timeToMin(slot.start_time);
        const endMin = timeToMin(slot.end_time);

        const top = minToY(startMin);
        const bottom = minToY(endMin);
        const height = bottom - top;

        const colStart = slot.day_of_week + 2;

        const isSelected = selectedSlot &&
            selectedSlot.day_of_week === slot.day_of_week &&
            selectedSlot.start_time === slot.start_time;

        return {
            gridColumn: colStart,
            gridRow: '2 / span 12', // Span the whole content area, we use position absolute inside it
            position: 'absolute',
            top: `${top}px`,
            height: `${height}px`,
            left: 0,
            right: 0,
            background: isSelected ? 'var(--text-primary)' : 'var(--accent-success)',
            border: `var(--border-width) solid ${isSelected ? 'var(--text-primary)' : 'rgba(0,0,0,0.2)'}`,
            color: isSelected ? 'var(--bg-base)' : 'var(--bg-base)',
            padding: '0.25rem',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            transition: 'all 0.15s ease-out',
            zIndex: isSelected ? 10 : 5,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            opacity: 0.9,
            overflow: 'hidden'
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
                        Found {(syncData.free_slots || []).length} available slots across {(syncData.members || []).length} members.
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
                            gridTemplateRows: `40px ${SEGMENTS.reduce((sum, s) => sum + segHeight(s), 0)}px`,
                            minWidth: '800px',
                            position: 'relative'
                        }}>

                            {/* Background Grid Lines for Segments */}
                            <div style={{ gridColumn: '2 / span 6', gridRow: 2, position: 'relative' }}>
                                {SEGMENTS.map((seg, idx) => {
                                    const y = minToY(seg.minStart);
                                    const h = segHeight(seg);
                                    return (
                                        <div key={`bg-${idx}`} style={{
                                            position: 'absolute',
                                            top: y,
                                            left: 0,
                                            right: 0,
                                            height: h,
                                            borderBottom: 'var(--border-width) solid var(--border-light)',
                                            background: seg.type === 'break' || seg.type === 'lunch' ? 'var(--bg-hover)' : 'transparent',
                                            zIndex: 1
                                        }} />
                                    );
                                })}
                            </div>
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

                            {/* Y-Axis: Segments */}
                            <div style={{ gridColumn: 1, gridRow: 2, position: 'relative', borderRight: 'var(--border-width) solid var(--border-color)' }}>
                                {SEGMENTS.map((seg, idx) => {
                                    const y = minToY(seg.minStart);
                                    const h = segHeight(seg);
                                    return (
                                        <div key={`seg-${idx}`} style={{
                                            position: 'absolute',
                                            top: y,
                                            left: 0,
                                            right: 0,
                                            height: h,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            borderBottom: 'var(--border-width) solid var(--border-light)',
                                            background: seg.type === 'break' || seg.type === 'lunch' ? 'var(--bg-hover)' : 'var(--bg-base)'
                                        }}>
                                            <span className="font-serif" style={{ fontSize: '0.85rem' }}>{seg.label}</span>
                                            {seg.type === 'period' && (
                                                <span className="font-mono text-muted" style={{ fontSize: '0.55rem' }}>{seg.time.split(' ')[0]}</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Free Slots */}
                            {(syncData.free_slots || []).map((slot, idx) => (
                                <div key={`col-wrap-${idx}`} style={{ gridColumn: slot.day_of_week + 2, gridRow: 2, position: 'relative', zIndex: 10 }}>
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
                                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>AVAILABLE</div>
                                        <div style={{ opacity: 0.9, fontSize: '0.65rem' }}>{slot.start_time} - {slot.end_time}</div>
                                    </div>
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
