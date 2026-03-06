'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIME_BLOCKS = Array.from({ length: 24 }).map((_, i) => {
    const h = 8 + Math.floor(i / 2);
    const m = i % 2 === 0 ? '00' : '30';
    return `${h.toString().padStart(2, '0')}:${m}`;
});

export default function MeetingSchedulerPage({ params }) {
    const { id } = use(params);
    const router = useRouter();
    const { user } = useAuth();
    const toast = useToast();

    // Data state
    const [group, setGroup] = useState(null);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [initError, setInitError] = useState('');

    // Step state
    const [step, setStep] = useState(1);

    // Step 1: Config
    const [selectedMemberIds, setSelectedMemberIds] = useState([]);
    const [includeBreak, setIncludeBreak] = useState(false);

    // Step 2: Grid
    const [availableSlots, setAvailableSlots] = useState([]);
    const [findingSlots, setFindingSlots] = useState(false);

    // Drag selection state
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState(null);
    const [dragCurrent, setDragCurrent] = useState(null);
    const [finalSelection, setFinalSelection] = useState(null);

    // Step 3: Details
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        const fetchGroup = async () => {
            try {
                const data = await api.getGroupDetails(id);
                setGroup(data.group);
                setMembers(data.group.members || []);
                // Default select all members
                setSelectedMemberIds(data.group.members.map(m => m.id));
            } catch (err) {
                toast.error(err.message);
                router.push('/groups');
            } finally {
                setLoading(false);
            }
        };
        fetchGroup();
    }, [id]);

    const handleMemberToggle = (memberId) => {
        if (selectedMemberIds.includes(memberId)) {
            // Uncheck, but require at least 1 person
            if (selectedMemberIds.length > 1) {
                setSelectedMemberIds(selectedMemberIds.filter(mid => mid !== memberId));
            } else {
                toast.error("Must include at least one member.");
            }
        } else {
            setSelectedMemberIds([...selectedMemberIds, memberId]);
        }
    };

    const handleFindSlots = async () => {
        setFindingSlots(true);
        try {
            const res = await api.findAvailableSlots(id, selectedMemberIds, includeBreak);
            setAvailableSlots(res.available_slots);
            setFinalSelection(null);
            setStep(2);
        } catch (err) {
            if (err.status === 400 && err.message.toLowerCase().includes("import")) {
                setInitError("MISSING_SCHEDULE");
            } else {
                toast.error("Failed to find slots: " + err.message);
            }
        } finally {
            setFindingSlots(false);
        }
    };

    // --- Grid Logic ---

    // Convert "HH:MM" to minutes for easy comparison
    const timeToMins = (t) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };

    // Check if a specific 30-min block is entirely within any available free slot
    const isCellAvailable = (dayIndex, timeIndex) => {
        const cellStartMin = timeToMins(TIME_BLOCKS[timeIndex]);
        const cellEndMin = cellStartMin + 30;

        for (const slot of availableSlots) {
            if (slot.day_of_week === dayIndex) {
                const slotStartMin = timeToMins(slot.start_time);
                const slotEndMin = timeToMins(slot.end_time);
                if (cellStartMin >= slotStartMin && cellEndMin <= slotEndMin) {
                    return true;
                }
            }
        }
        return false;
    };

    const handleMouseDown = (dayIndex, timeIndex) => {
        if (!isCellAvailable(dayIndex, timeIndex)) return;
        setIsDragging(true);
        setDragStart({ day: dayIndex, time: timeIndex });
        setDragCurrent({ day: dayIndex, time: timeIndex });
        setFinalSelection(null);
    };

    const handleMouseEnter = (dayIndex, timeIndex) => {
        if (!isDragging) return;
        if (dayIndex !== dragStart.day) return; // Must stay on the same day

        // Check if all cells between start and current are available
        const minT = Math.min(dragStart.time, timeIndex);
        const maxT = Math.max(dragStart.time, timeIndex);

        let allValid = true;
        for (let i = minT; i <= maxT; i++) {
            if (!isCellAvailable(dayIndex, i)) {
                allValid = false;
                break;
            }
        }

        if (allValid) {
            setDragCurrent({ day: dayIndex, time: timeIndex });
        }
    };

    const handleMouseUp = () => {
        if (!isDragging) return;
        setIsDragging(false);
        if (dragStart && dragCurrent) {
            const minT = Math.min(dragStart.time, dragCurrent.time);
            const maxT = Math.max(dragStart.time, dragCurrent.time);

            setFinalSelection({
                day_of_week: dragStart.day,
                start_time: TIME_BLOCKS[minT],
                // End time is the end of the block, so we take the next 30 min boundary
                // or just 20:00 if it's the last block
                end_time: maxT === 23 ? "20:00" : TIME_BLOCKS[maxT + 1]
            });
        }
    };

    // Global clear for drag outside
    useEffect(() => {
        const onMouseUpGlobal = () => {
            if (isDragging) handleMouseUp();
        };
        window.addEventListener('mouseup', onMouseUpGlobal);
        return () => window.removeEventListener('mouseup', onMouseUpGlobal);
    }, [isDragging, dragStart, dragCurrent]);

    const isCellSelected = (dayIndex, timeIndex) => {
        if (isDragging && dragStart && dragCurrent) {
            if (dayIndex !== dragStart.day) return false;
            const minT = Math.min(dragStart.time, dragCurrent.time);
            const maxT = Math.max(dragStart.time, dragCurrent.time);
            return timeIndex >= minT && timeIndex <= maxT;
        }
        if (finalSelection) {
            if (dayIndex !== finalSelection.day_of_week) return false;
            const startMins = timeToMins(finalSelection.start_time);
            const endMins = timeToMins(finalSelection.end_time);
            const cellMins = timeToMins(TIME_BLOCKS[timeIndex]);
            return cellMins >= startMins && cellMins < endMins;
        }
        return false;
    };

    const handleCreateMeeting = async (e) => {
        e.preventDefault();
        setCreating(true);
        try {
            await api.createMeeting(
                id,
                title,
                description,
                finalSelection.day_of_week,
                finalSelection.start_time,
                finalSelection.end_time,
                selectedMemberIds,
                includeBreak
            );
            toast.success("Meeting created successfully.");
            router.push(`/groups/${id}`);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setCreating(false);
        }
    };

    if (loading) return (
        <div className="loader-container">
            <div className="spinner"></div>
            <p className="font-mono text-muted text-sm tracking-widest uppercase">LOADING SCHEDULER...</p>
        </div>
    );

    if (initError === "MISSING_SCHEDULE") return (
        <div style={{ maxWidth: '600px', margin: '4rem auto', textAlign: 'center' }}>
            <h3 className="font-serif" style={{ fontSize: '2rem', marginBottom: '1rem' }}>Schedule Required.</h3>
            <p className="font-mono text-muted" style={{ marginBottom: '2rem' }}>You must import a timetable via the Dashboard first to book a collaborative session.</p>
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

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '4rem' }}>

            {/* Header */}
            <div style={{ marginBottom: '2rem', borderBottom: 'var(--border-width) solid var(--border-color)', paddingBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
                    >
                        ← CANCEL SCHEDULING
                    </button>
                    <p className="font-mono text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                        Schedule Meeting
                    </p>
                    <h1 className="font-serif" style={{ margin: 0, lineHeight: 1 }}>{group.name}.</h1>
                </div>

                {/* Step indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <div style={{ color: step === 1 ? 'var(--text-primary)' : 'inherit', fontWeight: step === 1 ? 'bold' : 'normal' }}>
                        <span style={{ opacity: step >= 1 ? 1 : 0.5 }}>●</span> 01 CONFIG
                    </div>
                    <span style={{ opacity: 0.3 }}>───</span>
                    <div style={{ color: step === 2 ? 'var(--text-primary)' : 'inherit', fontWeight: step === 2 ? 'bold' : 'normal' }}>
                        <span style={{ opacity: step >= 2 ? 1 : 0.5 }}>{step >= 2 ? '●' : '○'}</span> 02 TIME
                    </div>
                    <span style={{ opacity: 0.3 }}>───</span>
                    <div style={{ color: step === 3 ? 'var(--text-primary)' : 'inherit', fontWeight: step === 3 ? 'bold' : 'normal' }}>
                        <span style={{ opacity: step >= 3 ? 1 : 0.5 }}>{step >= 3 ? '●' : '○'}</span> 03 CONFIRM
                    </div>
                </div>
            </div>

            {/* Step 1: Config */}
            {step === 1 && (
                <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <h3 className="font-serif" style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Select Participants.</h3>

                    <div className="card" style={{ marginBottom: '2rem' }}>
                        {members.map(m => (
                            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', borderBottom: '1px solid var(--border-light)', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={selectedMemberIds.includes(m.id)}
                                    onChange={() => handleMemberToggle(m.id)}
                                    style={{ width: '1.2rem', height: '1.2rem' }}
                                />
                                <span className="font-mono">@{m.username} {m.id === user?.id && <span style={{ color: 'var(--text-muted)' }}>(you)</span>}</span>
                            </label>
                        ))}
                    </div>

                    <h3 className="font-serif" style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Break Time Options.</h3>
                    <div className="card" style={{ marginBottom: '2rem' }}>
                        <p className="font-mono text-muted" style={{ fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                            Gap periods (30 minutes or less) between classes are normally excluded to give members time to travel or rest.
                        </p>

                        <div style={{ display: 'flex', gap: '2rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '0.85rem' }}>
                                <input
                                    type="radio"
                                    name="breakOption"
                                    checked={!includeBreak}
                                    onChange={() => setIncludeBreak(false)}
                                />
                                EXCLUDE BREAKS (Recommended)
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '0.85rem' }}>
                                <input
                                    type="radio"
                                    name="breakOption"
                                    checked={includeBreak}
                                    onChange={() => setIncludeBreak(true)}
                                />
                                INCLUDE BREAKS
                            </label>
                        </div>
                    </div>

                    <button className="btn btn-primary" onClick={handleFindSlots} style={{ width: '100%', padding: '1rem' }} disabled={findingSlots}>
                        {findingSlots ? 'ANALYZING SCHEDULES...' : 'FIND AVAILABLE SLOTS →'}
                    </button>
                </div>
            )}

            {/* Step 2: Grid */}
            {step === 2 && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
                        <div>
                            <h3 className="font-serif" style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>Select a Time Slot.</h3>
                            <p className="font-mono text-muted" style={{ fontSize: '0.85rem' }}>
                                Drag across green cells to select your meeting duration.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: '12px', height: '12px', background: 'var(--accent-success)', opacity: 0.2, border: '1px solid var(--accent-success)' }}></div>
                                AVAILABLE
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: '12px', height: '12px', background: 'var(--bg-hover)', border: '1px solid var(--border-color)' }}></div>
                                OCCUPIED
                            </div>
                        </div>
                    </div>

                    {/* Weekly Grid */}
                    <div className="card" style={{ padding: '0', overflowX: 'auto' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(6, 1fr)', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ borderRight: '1px solid var(--border-color)', padding: '1rem' }}></div>
                            {DAYS.map(d => (
                                <div key={d} className="font-mono" style={{ padding: '1rem', textAlign: 'center', borderRight: '1px solid var(--border-color)', fontWeight: 'bold' }}>
                                    {d}
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {TIME_BLOCKS.map((timeStr, tIdx) => (
                                <div key={timeStr} style={{ display: 'grid', gridTemplateColumns: '60px repeat(6, 1fr)', borderBottom: '1px solid var(--border-light)' }}>
                                    <div className="font-mono text-muted" style={{ padding: '0.5rem', fontSize: '0.7rem', textAlign: 'right', borderRight: '1px solid var(--border-color)' }}>
                                        {timeStr}
                                    </div>

                                    {DAYS.map((_, dIdx) => {
                                        const available = isCellAvailable(dIdx, tIdx);
                                        const selected = isCellSelected(dIdx, tIdx);

                                        let bg = 'transparent';
                                        let border = '1px solid var(--border-light)';
                                        let cursor = 'not-allowed';

                                        if (available) {
                                            bg = 'var(--accent-success)';
                                            cursor = 'pointer';
                                            // Make it a light green wash if available but not selected
                                            if (!selected) {
                                                bg = 'rgba(74, 222, 128, 0.15)'; // light green tint
                                                border = '1px solid rgba(74, 222, 128, 0.3)';
                                            }
                                        } else {
                                            bg = 'var(--bg-hover)'; // Gray for occupied
                                        }

                                        if (selected) {
                                            bg = 'var(--accent-primary)'; // Strong accent for selection
                                            border = '1px solid var(--accent-primary)';
                                        }

                                        return (
                                            <div
                                                key={`${dIdx}-${tIdx}`}
                                                style={{
                                                    background: bg,
                                                    borderRight: '1px solid var(--border-color)',
                                                    cursor: cursor,
                                                    height: '30px',
                                                    border: border,
                                                    transition: 'background 0.1s'
                                                }}
                                                onMouseDown={() => handleMouseDown(dIdx, tIdx)}
                                                onMouseEnter={() => handleMouseEnter(dIdx, tIdx)}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button className="btn btn-outline" onClick={() => setStep(1)}>
                            ← BACK TO CONFIG
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                            {finalSelection ? (
                                <div className="font-mono" style={{ fontSize: '0.85rem' }}>
                                    Selected: <strong style={{ color: 'var(--accent-primary)' }}>{DAYS[finalSelection.day_of_week]}, {finalSelection.start_time} - {finalSelection.end_time}</strong>
                                </div>
                            ) : (
                                <div className="font-mono text-muted" style={{ fontSize: '0.85rem' }}>
                                    (Drag to select a time block)
                                </div>
                            )}

                            <button
                                className="btn btn-primary"
                                disabled={!finalSelection}
                                onClick={() => setStep(3)}
                            >
                                CONFIRM SELECTION →
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 3: Details */}
            {step === 3 && (
                <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <h3 className="font-serif" style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Meeting Details.</h3>

                    <div className="card" style={{ marginBottom: '2rem' }}>
                        <div style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                            <div className="font-mono" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}><span className="text-muted">WHEN:</span> <strong>{DAYS[finalSelection.day_of_week]}, {finalSelection.start_time} - {finalSelection.end_time}</strong></div>
                            <div className="font-mono" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}><span className="text-muted">WITH:</span> <strong>{selectedMemberIds.length} members</strong></div>
                            <div className="font-mono" style={{ fontSize: '0.85rem' }}><span className="text-muted">BREAKS:</span> <strong>{includeBreak ? "Included" : "Excluded"}</strong></div>
                        </div>

                        <form onSubmit={handleCreateMeeting}>
                            <div className="input-group">
                                <label className="input-label" style={{ fontSize: '0.7rem' }}>MEETING TITLE</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="e.g. Project Phase 2 Planning"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="input-group">
                                <label className="input-label" style={{ fontSize: '0.7rem' }}>NOTES / DESCRIPTION (OPTIONAL)</label>
                                <textarea
                                    className="input-field"
                                    placeholder="Agenda or meeting link..."
                                    style={{ height: '100px', resize: 'vertical' }}
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setStep(2)}>
                                    ← BACK
                                </button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={creating}>
                                    {creating ? 'SCHEDULING...' : 'FINALIZE MEETING'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}
