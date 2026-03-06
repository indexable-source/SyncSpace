'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function ValidatePage() {
    const router = useRouter();
    const [entries, setEntries] = useState([]);
    const [imageRef, setImageRef] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // New entry form state
    const [showAddForm, setShowAddForm] = useState(false);
    const [newEntry, setNewEntry] = useState({
        day_of_week: 0,
        start_time: '09:00',
        end_time: '10:00',
        subject: '',
        room: '',
        entry_type: 'class'
    });

    useEffect(() => {
        // Load draft schedule from local storage
        const draft = localStorage.getItem('draftSchedule');
        const img = localStorage.getItem('uploadedImage');

        if (draft) {
            try {
                setEntries(JSON.parse(draft));
            } catch (e) {
                console.error("Failed to parse draft schedule");
            }
        } else if (!img) {
            // If no draft and no image, redirect back to upload
            router.push('/upload');
        }

        if (img) {
            setImageRef(img);
        }
    }, [router]);

    const handleDelete = (index) => {
        const updated = [...entries];
        updated.splice(index, 1);
        setEntries(updated);
    };

    const handleAdd = (e) => {
        e.preventDefault();
        setEntries([...entries, { ...newEntry, day_of_week: parseInt(newEntry.day_of_week) }]);
        setShowAddForm(false);
        setNewEntry({ ...newEntry, subject: '', room: '' }); // reset text fields
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Save to backend with replace_all = true
            await api.saveSchedule(entries, true);

            // Clear draft data
            localStorage.removeItem('draftSchedule');
            localStorage.removeItem('uploadedImage');

            // Go to dashboard
            router.push('/');
        } catch (err) {
            alert("Failed to save schedule: " + err.message);
            setIsSaving(false);
        }
    };

    return (
        <div className="animate-fade-in" style={{ display: 'flex', gap: '2rem', height: 'calc(100vh - 8rem)' }}>

            {/* LEFT SIDE: Image Reference or Message */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <p className="font-mono text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                        Reference
                    </p>
                    <h1 className="font-serif" style={{ margin: 0, lineHeight: 1 }}>Source.</h1>
                    <p className="font-mono text-muted" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                        {imageRef ? "Reference your image to build your schedule." : "Schedule auto-extracted from ERP."}
                    </p>
                </div>

                {imageRef ? (
                    <div style={{
                        flex: 1,
                        border: 'var(--border-width) solid var(--border-color)',
                        background: 'var(--bg-elevated)',
                        overflow: 'auto',
                        padding: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 'var(--radius-sm)'
                    }}>
                        <img src={imageRef} alt="Timetable Reference" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    </div>
                ) : (
                    <div style={{
                        flex: 1,
                        background: 'var(--bg-base)',
                        border: 'var(--border-width) dashed var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 'var(--radius-md)'
                    }}>
                        <div style={{ textAlign: 'center', opacity: 0.5 }}>
                            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>✓</div>
                            <p className="font-mono" style={{ textTransform: 'uppercase', fontSize: '0.8rem' }}>EXTRACTED SUCCESSFULLY</p>
                        </div>
                    </div>
                )}
            </div>

            {/* RIGHT SIDE: Entry Editor */}
            <div style={{
                width: '450px',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                border: 'var(--border-width) solid var(--border-color)',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-sm)',
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1.5rem',
                    borderBottom: 'var(--border-width) solid var(--border-color)'
                }}>
                    <div>
                        <h3 className="font-serif" style={{ margin: 0 }}>Entries.</h3>
                        <p className="font-mono text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>{entries.length} CLASSES LOGGED</p>
                    </div>
                    <button
                        className="btn btn-outline"
                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
                        onClick={() => setShowAddForm(!showAddForm)}
                    >
                        {showAddForm ? 'CANCEL' : '+ ADD CLASS'}
                    </button>
                </div>

                {/* Add Form Dropdown */}
                {showAddForm && (
                    <form onSubmit={handleAdd} style={{
                        background: 'var(--bg-hover)',
                        padding: '1.5rem',
                        borderBottom: 'var(--border-width) solid var(--border-color)'
                    }}>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            <div style={{ flex: 1 }}>
                                <label className="input-label" style={{ fontSize: '0.7rem' }}>DAY</label>
                                <select
                                    className="input-field"
                                    style={{ padding: '0.5rem' }}
                                    value={newEntry.day_of_week}
                                    onChange={e => setNewEntry({ ...newEntry, day_of_week: e.target.value })}
                                >
                                    {DAYS.map((day, idx) => <option key={day} value={idx}>{day.toUpperCase()}</option>)}
                                </select>
                            </div>
                            <div style={{ width: '80px' }}>
                                <label className="input-label" style={{ fontSize: '0.7rem' }}>START</label>
                                <input type="time" className="input-field" style={{ padding: '0.5rem' }} required value={newEntry.start_time} onChange={e => setNewEntry({ ...newEntry, start_time: e.target.value })} />
                            </div>
                            <div style={{ width: '80px' }}>
                                <label className="input-label" style={{ fontSize: '0.7rem' }}>END</label>
                                <input type="time" className="input-field" style={{ padding: '0.5rem' }} required value={newEntry.end_time} onChange={e => setNewEntry({ ...newEntry, end_time: e.target.value })} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                            <div style={{ flex: 2 }}>
                                <label className="input-label" style={{ fontSize: '0.7rem' }}>SUBJECT</label>
                                <input type="text" className="input-field" style={{ padding: '0.5rem' }} placeholder="e.g. Math 101" required value={newEntry.subject} onChange={e => setNewEntry({ ...newEntry, subject: e.target.value })} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className="input-label" style={{ fontSize: '0.7rem' }}>ROOM (OPT)</label>
                                <input type="text" className="input-field" style={{ padding: '0.5rem' }} placeholder="e.g. A202" value={newEntry.room} onChange={e => setNewEntry({ ...newEntry, room: e.target.value })} />
                            </div>
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>SAVE ENTRY</button>
                    </form>
                )}

                {/* List of Entries */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                    {entries.length === 0 ? (
                        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <p className="font-mono text-muted" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>No entries found.</p>
                        </div>
                    ) : (
                        // Sort by day then time
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {entries.sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)).map((entry, idx) => (
                                <div key={idx} style={{
                                    borderBottom: 'var(--border-width) solid var(--border-color)',
                                    padding: '1rem 1.5rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'background 0.2s',
                                }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div>
                                        <div className="font-mono" style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                                            {entry.subject || 'UNTITLED'}
                                        </div>
                                        <div className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>
                                            <span style={{ color: 'var(--text-primary)' }}>{DAYS[entry.day_of_week].substring(0, 3).toUpperCase()}</span> • {entry.start_time} - {entry.end_time} {entry.room && `• ${entry.room}`}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(idx)}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: 'var(--text-muted)',
                                            cursor: 'pointer',
                                            padding: '0.5rem',
                                            fontSize: '1rem'
                                        }}
                                        title="Remove"
                                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-primary)'}
                                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Action Bottom */}
                <div style={{ padding: '1.5rem', borderTop: 'var(--border-width) solid var(--border-color)', background: 'var(--bg-base)' }}>
                    <button
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                        disabled={isSaving || entries.length === 0}
                        onClick={handleSave}
                    >
                        {isSaving ? (
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                <span className="spinner" style={{ width: '16px', height: '16px' }}></span>
                                SAVING...
                            </span>
                        ) : (
                            `CONFIRM & SAVE`
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
