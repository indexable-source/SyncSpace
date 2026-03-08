'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { usePathname } from 'next/navigation';

export default function BugReporter() {
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [url, setUrl] = useState('');
    const toast = useToast();
    const pathname = usePathname();

    const [form, setForm] = useState({
        title: '',
        description: '',
        severity: 'medium',
        severity: 'medium',
        images: []
    });

    // Auto-capture URL when opened or path changes
    useEffect(() => {
        if (typeof window !== 'undefined') {
            setUrl(window.location.href);
        }
    }, [isOpen, pathname]);

    const handleImageChange = (e) => {
        if (form.images.length >= 3) {
            toast.error('You can only attach up to 3 images');
            e.target.value = '';
            return;
        }

        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Only image files are allowed');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_WIDTH = 1200;

                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Compress heavily to save SQLite bloat
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                setForm(prev => ({ ...prev, images: [...prev.images, dataUrl] }));
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
        e.target.value = ''; // Reset input to allow selecting same file again
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.title.trim()) {
            toast.error('Title is required');
            return;
        }

        setIsSubmitting(true);
        try {
            await api.submitBugReport(form.title, form.description, form.severity, url, form.images.length > 0 ? form.images : null);
            toast.success('Bug report submitted successfully. Thank you!');
            setIsOpen(false);
            setForm({ title: '', description: '', severity: 'medium', images: [] });
        } catch (err) {
            toast.error(err.message || 'Failed to submit bug report');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                title="Report a bug"
                style={{
                    position: 'fixed',
                    bottom: '1.5rem',
                    left: '1.5rem',
                    width: '3rem',
                    height: '3rem',
                    borderRadius: '50%',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 9999,
                    transition: 'transform 0.2s, borderColor 0.2s'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.borderColor = 'var(--text-muted)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                }}
            >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h.01"></path>
                    <path d="M15 2h-6a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V5a3 3 0 0 0-3-3v0Z"></path>
                    <path d="m15 11 4-2"></path>
                    <path d="m15 15 4 2"></path>
                    <path d="M5 11l4-2"></path>
                    <path d="m5 15 4 2"></path>
                    <path d="M9 7h6"></path>
                </svg>
            </button>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            bottom: '1.5rem',
            left: '1.5rem',
            width: '320px',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--accent-radius)',
            padding: '1.25rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            fontFamily: 'var(--font-mono)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Report a Bug</h3>
                <button
                    onClick={() => setIsOpen(false)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18"></path>
                        <path d="m6 6 12 12"></path>
                    </svg>
                </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <input
                    type="text"
                    placeholder="Issue Title"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    required
                    maxLength={256}
                    style={{
                        width: '100%',
                        padding: '0.5rem',
                        backgroundColor: 'var(--bg-base)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        color: 'var(--text-main)',
                        fontSize: '0.875rem'
                    }}
                />

                <textarea
                    placeholder="Describe the issue (optional)..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={3}
                    maxLength={2000}
                    style={{
                        width: '100%',
                        padding: '0.5rem',
                        backgroundColor: 'var(--bg-base)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        color: 'var(--text-main)',
                        fontSize: '0.875rem',
                        resize: 'none'
                    }}
                />

                <select
                    value={form.severity}
                    onChange={(e) => setForm({ ...form, severity: e.target.value })}
                    style={{
                        width: '100%',
                        padding: '0.5rem',
                        backgroundColor: 'var(--bg-base)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        color: 'var(--text-main)',
                        fontSize: '0.875rem',
                        outline: 'none'
                    }}
                >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                    <option value="critical">Critical (Blocks usage)</option>
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <label style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        fontSize: '0.75rem', color: 'var(--text-muted)',
                        cursor: form.images.length >= 3 ? 'not-allowed' : 'pointer', backgroundColor: 'var(--bg-base)',
                        padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)',
                        borderRadius: '4px', opacity: form.images.length >= 3 ? 0.5 : 1
                    }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                        </svg>
                        Attach Screen ({form.images.length}/3)
                        <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} disabled={form.images.length >= 3} />
                    </label>

                    {form.images.map((img, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--bg-base)', padding: '0.2rem 0.4rem', borderRadius: '4px', border: '1px solid var(--color-low)' }}>
                            <img src={img} alt="attachment" style={{ height: '24px', width: 'auto', borderRadius: '2px' }} />
                            <button
                                type="button"
                                onClick={() => setForm(p => ({ ...p, images: p.images.filter((_, i) => i !== idx) }))}
                                style={{ background: 'none', border: 'none', color: 'var(--color-critical)', cursor: 'pointer', padding: 0 }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                            </button>
                        </div>
                    ))}
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span>Current URL context:</span>
                    <code style={{
                        display: 'block',
                        padding: '0.3rem',
                        backgroundColor: 'var(--bg-base)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}>
                        {url}
                    </code>
                </div>

                <button
                    type="submit"
                    disabled={isSubmitting}
                    style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem',
                        backgroundColor: 'var(--text-main)',
                        color: 'var(--bg-base)',
                        border: 'none',
                        borderRadius: '4px',
                        fontWeight: '600',
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        opacity: isSubmitting ? 0.7 : 1,
                        transition: 'opacity 0.2s'
                    }}
                >
                    {isSubmitting ? 'SUBMITTING...' : 'SUBMIT BUG'}
                </button>
            </form>
        </div>
    );
}
