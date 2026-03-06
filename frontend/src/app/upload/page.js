'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';

export default function UploadPage() {
    const router = useRouter();
    const toast = useToast();
    const { updateUser } = useAuth();

    // Tab State
    const [activeTab, setActiveTab] = useState('erp'); // 'erp' | 'image'

    // ERP State
    const [erpState, setErpState] = useState('init'); // init | captcha | loading | tables | parsing
    const [sessionId, setSessionId] = useState('');
    const [captchaImg, setCaptchaImg] = useState('');
    const [error, setError] = useState('');

    const [erpCreds, setErpCreds] = useState({
        username: '',
        password: '',
        captcha: ''
    });

    // Timetable Search Params
    const [timetableOptions, setTimetableOptions] = useState({ academic_years: [], semesters: [] });
    const [timetableParams, setTimetableParams] = useState({ academic_year: '', semester_id: '' });

    // Tables from ERP page
    const [erpTables, setErpTables] = useState([]);
    const [pageTitle, setPageTitle] = useState('');

    // Init ERP Session
    const initErpSession = async () => {
        setErpState('loading');
        setError('');
        try {
            const data = await api.initLogin();
            setSessionId(data.session_id);
            setCaptchaImg(data.captcha_image);
            setErpState('captcha');
        } catch (err) {
            setError(err.message || 'Failed to connect to ERP');
            setErpState('init');
        }
    };

    const handleRefreshCaptcha = async () => {
        try {
            const data = await api.refreshCaptcha(sessionId);
            if (data.captcha_image) {
                setCaptchaImg(data.captcha_image);
                setErpCreds({ ...erpCreds, captcha: '' });
            } else {
                setError('Got empty captcha. Try again.');
            }
        } catch (err) {
            // If session expired, re-init. Otherwise just show error and keep old captcha.
            if (err.status === 401 || !sessionId) {
                setError('Session expired. Reconnecting...');
                initErpSession();
            } else {
                setError('Captcha refresh failed. Try again or restart.');
            }
        }
    };

    const handleErpSubmit = async (e) => {
        e.preventDefault();
        setErpState('loading');
        setError('');

        try {
            // 1. Complete Login
            const loginResult = await api.completeLogin(sessionId, erpCreds.username, erpCreds.password, erpCreds.captcha);

            if (!loginResult.success) {
                setError(loginResult.error || 'ERP Login Failed. Check your credentials and captcha.');
                try { await handleRefreshCaptcha(); } catch (e) { /* ignore */ }
                setErpState('captcha');
                return;
            }

            toast.success('ERP login successful! Fetching search parameters...');

            // Auto-link roll number to the user's SyncSpace account
            try {
                const linkResult = await api.linkErp(erpCreds.username);
                if (linkResult.user) {
                    updateUser(linkResult.user);
                }
                toast.info(`Roll number ${erpCreds.username.toUpperCase()} linked to your account.`);
            } catch (linkErr) {
                // Non-fatal: if linking fails (e.g. already linked to another account), 
                // the timetable import still proceeds normally.
                if (linkErr.status === 409) {
                    toast.warning('This roll number is already linked to a different account.');
                } else {
                    console.warn('Could not auto-link roll number:', linkErr.message);
                }
            }

            // 2. Fetch timetable options (academicyear, semesterid)
            const optionsData = await api.getTimetableOptions(sessionId);

            if (!optionsData.academic_years || optionsData.academic_years.length === 0) {
                setError('Could not find timetable options. The ERP page might have changed.');
                setErpState('captcha');
                return;
            }

            setTimetableOptions({
                academic_years: optionsData.academic_years,
                semesters: optionsData.semesters
            });
            // Pre-select the first options if available
            setTimetableParams({
                academic_year: optionsData.academic_years.length > 0 ? optionsData.academic_years[0].value : '',
                semester_id: optionsData.semesters.length > 0 ? optionsData.semesters[0].value : ''
            });

            setPageTitle(optionsData.page_title || '');
            setErpState('search_params');

        } catch (err) {
            setError(err.message || 'ERP Login Failed.');
            try { await handleRefreshCaptcha(); } catch (e) { /* ignore */ }
            setErpState('captcha');
        }
    };

    const handleFetchTimetable = async (e) => {
        e.preventDefault();
        setErpState('loading');
        setError('');

        try {
            toast.info('Fetching actual timetable...');
            const ttData = await api.fetchTimetable(sessionId, timetableParams.academic_year, timetableParams.semester_id);

            if (!ttData.tables || ttData.tables.length === 0) {
                setError('No tables found on the timetable page. Try different search parameters.');
                setErpState('search_params');
                return;
            }

            setErpTables(ttData.tables);
            setPageTitle(ttData.page_title || '');
            setErpState('tables');
            toast.success(`Found ${ttData.tables.length} table(s) on the page. Select your timetable.`);

        } catch (err) {
            setError(err.message || 'Failed to fetch timetable.');
            setErpState('search_params');
        }
    };

    // User selects a table → parse it
    const handleSelectTable = async (table) => {
        setErpState('parsing');
        try {
            const result = await api.parseTable(table.html);

            if (result.entries && result.entries.length > 0) {
                localStorage.setItem('draftSchedule', JSON.stringify(result.entries));
                toast.success(`Parsed ${result.entries.length} schedule entries! Review them now.`);
                router.push('/validate');
            } else {
                // No structured entries — still save the raw HTML table for manual review
                localStorage.setItem('draftSchedule', JSON.stringify([]));
                localStorage.setItem('selectedTableHtml', table.html);
                toast.warning('Could not auto-parse entries from this table. You can review and enter manually.');
                router.push('/validate');
            }
        } catch (err) {
            toast.error('Failed to parse table: ' + err.message);
            setErpState('tables');
        }
    };

    // Image Upload State
    const [isDragging, setIsDragging] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);

    const handleImageUpload = async (file) => {
        if (!file) return;
        setIsUploadingImage(true);
        setError('');
        try {
            const data = await api.uploadImage(file);
            localStorage.setItem('uploadedImage', data.image_data);
            localStorage.setItem('draftSchedule', JSON.stringify([]));
            router.push('/validate');
        } catch (err) {
            setError(err.message || 'Failed to upload image');
        } finally {
            setIsUploadingImage(false);
        }
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ textAlign: 'left' }}>
                <p className="font-mono text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                    Import
                </p>
                <h1 className="font-serif" style={{ margin: 0, lineHeight: 1 }}>Sync Your Timetable.</h1>
                <p className="font-mono text-muted" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    Connect to your university ERP or upload a screenshot.
                </p>
            </div>

            <div style={{
                display: 'flex',
                border: 'var(--border-width) solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden'
            }}>
                <button
                    className="font-mono"
                    onClick={() => { setActiveTab('erp'); setError(''); }}
                    style={{
                        flex: 1,
                        padding: '0.75rem',
                        fontSize: '0.8rem',
                        textTransform: 'uppercase',
                        fontWeight: activeTab === 'erp' ? 'bold' : 'normal',
                        background: activeTab === 'erp' ? 'var(--accent-primary)' : 'transparent',
                        color: activeTab === 'erp' ? '#fff' : 'var(--text-primary)',
                        transition: 'all 0.2s'
                    }}
                >
                    Auto Import (ERP)
                </button>
                <button
                    className="font-mono"
                    onClick={() => { setActiveTab('image'); setError(''); }}
                    style={{
                        flex: 1,
                        padding: '0.75rem',
                        fontSize: '0.8rem',
                        textTransform: 'uppercase',
                        fontWeight: activeTab === 'image' ? 'bold' : 'normal',
                        background: activeTab === 'image' ? 'var(--accent-primary)' : 'transparent',
                        color: activeTab === 'image' ? '#fff' : 'var(--text-primary)',
                        borderLeft: 'var(--border-width) solid var(--border-color)',
                        transition: 'all 0.2s'
                    }}
                >
                    Manual (Image)
                </button>
            </div>

            {error && (
                <div className="alert alert-error">
                    <strong>ERROR:</strong> {error}
                </div>
            )}

            {/* --- ERP TAB --- */}
            {activeTab === 'erp' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    {/* Step Indicator */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '1rem',
                        fontFamily: 'var(--font-jetbrains-mono), monospace',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: erpState === 'init' ? 'var(--text-primary)' : 'inherit', fontWeight: erpState === 'init' ? 'bold' : 'normal' }}>
                            <span style={{ opacity: erpState === 'init' ? 1 : 0.5 }}>●</span> 01 CONNECT
                        </div>
                        <span style={{ opacity: 0.3 }}>───</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: (erpState === 'captcha' || erpState === 'loading') ? 'var(--text-primary)' : 'inherit', fontWeight: (erpState === 'captcha' || erpState === 'loading') ? 'bold' : 'normal' }}>
                            <span style={{ opacity: (erpState === 'captcha' || erpState === 'loading') ? 1 : 0.5 }}>{(erpState === 'captcha' || erpState === 'loading') ? '●' : '○'}</span> 02 AUTHENTICATE
                        </div>
                        <span style={{ opacity: 0.3 }}>───</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: (erpState === 'search_params' || erpState === 'tables') ? 'var(--text-primary)' : 'inherit', fontWeight: (erpState === 'search_params' || erpState === 'tables') ? 'bold' : 'normal' }}>
                            <span style={{ opacity: (erpState === 'search_params' || erpState === 'tables') ? 1 : 0.5 }}>{(erpState === 'search_params' || erpState === 'tables') ? '●' : '○'}</span> 03 SELECT
                        </div>
                    </div>

                    <div className="card">
                        {/* Init state */}
                        {erpState === 'init' && (
                            <div style={{ textAlign: 'center', padding: '2rem' }}>
                                <h3 className="font-serif" style={{ fontSize: '1.5rem', margin: '0 0 1rem 0' }}>Connect to KL ERP.</h3>
                                <p className="font-mono text-muted" style={{ fontSize: '0.85rem', marginBottom: '2rem', maxWidth: '400px', margin: '0 auto 2rem auto', lineHeight: 1.6 }}>
                                    We'll securely log into your ERP account to extract your exact timetable. Your credentials are never saved on our servers.
                                </p>
                                <button className="btn btn-primary" onClick={initErpSession} style={{ padding: '0.75rem 2rem', width: '100%', maxWidth: '300px' }}>
                                    START IMPORT
                                </button>
                            </div>
                        )}

                        {/* Loading */}
                        {(erpState === 'loading' || erpState === 'parsing') && (
                            <div className="loader-container">
                                <div className="spinner"></div>
                                <p className="font-mono text-muted text-sm tracking-widest uppercase">
                                    {erpState === 'parsing' ? 'PARSING TABLE...' : 'COMMUNICATING WITH ERP...'}
                                </p>
                            </div>
                        )}

                        {/* Captcha form */}
                        {erpState === 'captcha' && (
                            <form onSubmit={handleErpSubmit} className="animate-fade-in" style={{ padding: '1rem' }}>
                                <h3 className="font-serif" style={{ marginBottom: '1.5rem', borderBottom: 'var(--border-width) solid var(--border-color)', paddingBottom: '1rem' }}>
                                    ERP Authentication.
                                </h3>

                                <div className="input-group">
                                    <label className="input-label">University ID</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        value={erpCreds.username}
                                        onChange={e => setErpCreds({ ...erpCreds, username: e.target.value })}
                                        required autoFocus
                                    />
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Password</label>
                                    <input
                                        type="password"
                                        className="input-field"
                                        value={erpCreds.password}
                                        onChange={e => setErpCreds({ ...erpCreds, password: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Captcha</label>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '1rem',
                                        padding: '0.5rem', borderRadius: 'var(--radius-sm)',
                                        marginBottom: '0.75rem', border: 'var(--border-width) solid var(--border-color)',
                                        background: 'var(--bg-base)'
                                    }}>
                                        {captchaImg ? (
                                            <img className="captcha-image" src={captchaImg} alt="ERP Captcha" style={{ height: '40px', background: '#fff' }} />
                                        ) : (
                                            <div style={{ height: '40px', width: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span className="spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></span>
                                            </div>
                                        )}
                                        <button type="button" onClick={handleRefreshCaptcha} className="btn btn-outline" style={{ padding: '0.4rem 0.5rem', fontSize: '0.7rem' }}>
                                            REFRESH
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="ENTER CODE"
                                        value={erpCreds.captcha}
                                        onChange={e => setErpCreds({ ...erpCreds, captcha: e.target.value })}
                                        required
                                    />
                                </div>

                                <div style={{ marginTop: '2.5rem', display: 'flex', gap: '1rem' }}>
                                    <button type="button" className="btn btn-outline" onClick={() => setErpState('init')} style={{ flex: 1 }}>
                                        CANCEL
                                    </button>
                                    <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                                        LOGIN
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Search Params form */}
                        {erpState === 'search_params' && (
                            <form onSubmit={handleFetchTimetable} className="animate-fade-in" style={{ padding: '1rem' }}>
                                <h3 className="font-serif" style={{ marginBottom: '1.5rem', borderBottom: 'var(--border-width) solid var(--border-color)', paddingBottom: '1rem' }}>
                                    Search Timetable.
                                </h3>

                                <div className="input-group">
                                    <label className="input-label">Academic Year</label>
                                    <select
                                        className="input-field"
                                        value={timetableParams.academic_year}
                                        onChange={e => setTimetableParams({ ...timetableParams, academic_year: e.target.value })}
                                        required
                                    >
                                        <option value="">SELECT ACADEMIC YEAR</option>
                                        {timetableOptions.academic_years.map(y => (
                                            <option key={y.value} value={y.value}>{y.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Semester</label>
                                    <select
                                        className="input-field"
                                        value={timetableParams.semester_id}
                                        onChange={e => setTimetableParams({ ...timetableParams, semester_id: e.target.value })}
                                        required
                                    >
                                        <option value="">SELECT SEMESTER</option>
                                        {timetableOptions.semesters.map(s => (
                                            <option key={s.value} value={s.value}>{s.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ marginTop: '2.5rem', display: 'flex', gap: '1rem' }}>
                                    <button type="button" className="btn btn-outline" onClick={() => setErpState('init')} style={{ flex: 1 }}>
                                        CANCEL
                                    </button>
                                    <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                                        FETCH TIMETABLE
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Tables selection */}
                        {erpState === 'tables' && (
                            <div className="animate-fade-in" style={{ padding: '1rem' }}>
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    marginBottom: '2rem', borderBottom: 'var(--border-width) solid var(--border-color)', paddingBottom: '1rem'
                                }}>
                                    <div>
                                        <h3 className="font-serif" style={{ margin: 0 }}>Select Table.</h3>
                                        <p className="font-mono text-muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                            Found {erpTables.length} table(s). Select your timetable.
                                        </p>
                                    </div>
                                    <button className="btn btn-outline" onClick={() => setErpState('init')}>
                                        START OVER
                                    </button>
                                </div>

                                {erpTables.map((table, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            marginBottom: '1.5rem',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            border: 'var(--border-width) solid var(--border-color)',
                                            borderRadius: 'var(--radius-sm)',
                                            background: 'var(--bg-base)'
                                        }}
                                        className="card-invert"
                                        onClick={() => handleSelectTable(table)}
                                    >
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '1.25rem',
                                            borderBottom: 'var(--border-width) solid var(--border-color)',
                                            background: 'transparent'
                                        }}>
                                            <div>
                                                <h4 className="font-mono" style={{ margin: 0, textTransform: 'uppercase', fontSize: '0.9rem' }}>{table.label}</h4>
                                                <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>
                                                    {table.num_rows} ROWS × {table.num_cols} COLS
                                                </span>
                                            </div>
                                            <button className="btn btn-outline" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', background: 'transparent' }}>
                                                USE THIS →
                                            </button>
                                        </div>

                                        {/* Render raw table HTML */}
                                        <div
                                            style={{
                                                overflow: 'auto',
                                                maxHeight: '600px',
                                                padding: '1rem',
                                                background: 'var(--bg-card)'
                                            }}
                                            className="timetable-raw-preview"
                                        >
                                            <div
                                                style={{
                                                    fontSize: '0.7rem',
                                                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                                                    lineHeight: '1.4',
                                                }}
                                                dangerouslySetInnerHTML={{ __html: table.html }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- IMAGE TAB --- */}
            {activeTab === 'image' && (
                <div className="card">
                    <h3 className="font-serif" style={{ marginBottom: '1rem' }}>Upload Timetable Image.</h3>
                    <p className="font-mono text-muted" style={{ marginBottom: '2rem', fontSize: '0.875rem' }}>
                        Upload a screenshot of your timetable. We'll set it as a reference image for you to manually build your digital schedule.
                    </p>

                    <div
                        style={{
                            border: `var(--border-width) dashed ${isDragging ? 'var(--accent-primary)' : 'var(--text-muted)'}`,
                            borderRadius: 'var(--radius-md)',
                            padding: '4rem 2rem',
                            textAlign: 'center',
                            background: isDragging ? 'var(--bg-hover)' : 'var(--bg-base)',
                            transition: 'all 0.2s',
                            cursor: 'pointer'
                        }}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setIsDragging(false);
                            const file = e.dataTransfer.files[0];
                            handleImageUpload(file);
                        }}
                        onClick={() => document.getElementById('file-upload').click()}
                    >
                        <input
                            type="file"
                            id="file-upload"
                            style={{ display: 'none' }}
                            accept="image/*"
                            onChange={(e) => handleImageUpload(e.target.files[0])}
                        />
                        {isUploadingImage ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                <div className="spinner"></div>
                                <p className="font-mono text-muted text-sm tracking-widest uppercase">PREPARING INTERFACE...</p>
                            </div>
                        ) : (
                            <>
                                <h4 className="font-mono" style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>+ CLICK OR DRAG IMAGE HERE</h4>
                                <p className="font-mono text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>PNG, JPG up to 5MB</p>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
