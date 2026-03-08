'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import Link from 'next/link';

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Each segment of the day: periods + breaks, in chronological order
// minStart/minEnd are offsets from 08:00 in minutes
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

// Heights: 50min period = 75px, 10min break = 20px, 40min lunch = 36px
const segHeight = (seg) => {
  if (seg.type === 'break') return 20;
  if (seg.type === 'lunch') return 36;
  return 75; // all class periods are ~50 min
};

export default function HomePage() {
  const [schedule, setSchedule] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        const [schedData, meetData] = await Promise.all([
          api.getMySchedule(),
          api.getDashboardMeetings().catch(() => ({ meetings: [] }))
        ]);
        setSchedule(schedData.entries || []);
        setMeetings(meetData.meetings || []);
      } catch (err) {
        console.error("Failed to load schedule", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSchedule();
  }, []);

  // Convert "HH:MM" string to minutes from 08:00
  const timeToMin = (t) => {
    const [h, m] = t.split(':').map(Number);
    return (h - 8) * 60 + m;
  };

  // Find the pixel Y offset for a given minute offset from 08:00
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

  // Calculate class hours and free hours per week
  const totalClassMinutes = schedule.reduce((sum, entry) => {
    const [sh, sm] = (entry.start_time || '0:0').split(':').map(Number);
    const [eh, em] = (entry.end_time || '0:0').split(':').map(Number);
    return sum + ((eh * 60 + em) - (sh * 60 + sm));
  }, 0);
  const classHours = (totalClassMinutes / 60).toFixed(1);
  // Academic week: Mon-Sat, 08:10-16:00 = 7h50m * 6 = 47h = 2820 min
  const totalWeekMinutes = 6 * (7 * 60 + 50);
  const freeHours = ((totalWeekMinutes - totalClassMinutes) / 60).toFixed(1);

  // Today detection for column highlighting
  const now = new Date();
  const jsDay = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const todayIdx = jsDay === 0 ? -1 : jsDay - 1; // -1 if Sunday (not shown)
  const todayDateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const formatMeetingDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const totalHeight = SEGMENTS.reduce((sum, seg) => sum + segHeight(seg), 0);

  return (
    <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Hero bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div>
            <p className="font-mono text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
              {todayDateStr}
            </p>
            <h2 className="font-serif" style={{ margin: 0 }}>Your Week at a Glance.</h2>
            <p className="font-mono text-muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
              {schedule.length} classes synced
            </p>
            {schedule.length > 0 && (
              <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
                <span className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>
                  {classHours}h classes
                </span>
                <span className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>
                  {freeHours}h free
                </span>
              </div>
            )}
          </div>
          <div style={{ position: 'relative', width: '160px', height: '160px' }}>
            <img
              src="/assets/continous.gif"
              alt="Globe"
              width={160}
              height={160}
              style={{
                transform: 'rotate(-15deg)',
                objectFit: 'contain',
                filter: 'var(--globe-filter, none)',
                mixBlendMode: 'var(--globe-mix-blend, normal)',
              }}
            />
          </div>
        </div>
        <button className="btn btn-outline" onClick={() => router.push('/upload')}>
          RE-IMPORT
        </button>
      </div>

      {/* Upcoming Meetings UI */}
      {!loading && meetings.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 className="font-serif" style={{ margin: 0, fontSize: '1.25rem' }}>Upcoming Meetings.</h3>
            <button className="btn btn-outline font-mono" style={{ fontSize: '0.7rem', padding: '0.5rem 1rem' }} onClick={() => router.push('/groups')}>
              SCHEDULE NEW
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {meetings.map(m => (
              <Link href={`/groups/${m.group_invite_code}`} key={m.id} style={{ textDecoration: 'none' }}>
                <div className="card-invert" style={{ padding: '1.2rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <strong className="font-serif" style={{ fontSize: '1.1rem' }}>{m.title}</strong>
                    <span className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>
                      {formatMeetingDate(m.meeting_date) || DAYS[m.day_of_week].slice(0, 3).toUpperCase()}
                    </span>
                  </div>
                  <div className="font-mono text-secondary" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                    {m.start_time} - {m.end_time}
                  </div>
                  <div className="font-mono text-muted" style={{ fontSize: '0.7rem', borderTop: '1px dashed var(--border-color)', paddingTop: '0.5rem' }}>
                    Group: <span style={{ color: 'var(--text-primary)' }}>{m.group_name}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: '1rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <span className="spinner" style={{ width: '32px', height: '32px' }}></span>
          </div>
        ) : schedule.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '4rem 2rem', textAlign: 'center',
            border: 'var(--border-width) dashed var(--border-color)', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-card)',
          }}>
            <div style={{ position: 'relative', width: '280px', height: '280px', marginBottom: '1.5rem' }}>
              <img src="/assets/continous.gif" alt="Globe" width={280} height={280}
                style={{ transform: 'rotate(-12deg)', objectFit: 'contain', filter: 'var(--globe-filter, none)', mixBlendMode: 'var(--globe-mix-blend, normal)' }} />
            </div>
            <div>
              <h2 className="font-serif" style={{ marginBottom: '0.75rem' }}>No schedule yet.</h2>
              <p className="font-mono text-muted" style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>Import your timetable to get started.</p>
              <button className="btn btn-primary" onClick={() => router.push('/upload')}>IMPORT NOW</button>
            </div>
          </div>
        ) : (
          <div style={{ overflow: 'auto' }}>
            {/* Period-based timetable grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '100px repeat(6, minmax(130px, 1fr))',
              minWidth: '950px',
              border: 'var(--border-width) solid var(--border-color)',
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              position: 'relative',
            }}>
              {/* ─── Header Row ─── */}
              <div style={{
                gridColumn: 1, background: 'var(--bg-card)', padding: '0.6rem 0.5rem',
                borderBottom: '2px solid var(--border-color)',
                borderRight: 'var(--border-width) solid var(--border-color)',
                fontFamily: 'var(--font-pixel)', fontSize: '0.8rem', textAlign: 'center',
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>PERIOD</div>
              {DAYS.map((day, idx) => {
                const isToday = idx === todayIdx;
                return (
                  <div key={day} style={{
                    gridColumn: idx + 2, background: 'var(--bg-card)',
                    padding: '0.6rem 0.5rem', fontWeight: 'bold', textAlign: 'center',
                    fontSize: '0.85rem', textTransform: 'uppercase',
                    borderBottom: isToday ? '3px solid var(--accent-primary)' : '2px solid var(--border-color)',
                    borderRight: idx < 5 ? 'var(--border-width) solid var(--border-light)' : 'none',
                    color: isToday ? 'var(--accent-primary)' : 'var(--text-primary)',
                  }}>
                    {day.slice(0, 3)}
                  </div>
                );
              })}

              {/* ─── Segment Rows (Periods + Breaks) ─── */}
              {SEGMENTS.map((seg) => {
                const h = segHeight(seg);
                const isBreak = seg.type === 'break' || seg.type === 'lunch';

                return (
                  <div key={seg.id} style={{ display: 'contents' }}>
                    {/* Left label cell */}
                    <div style={{
                      gridColumn: 1,
                      height: `${h}px`,
                      background: isBreak ? 'var(--bg-base)' : 'var(--bg-card)',
                      borderRight: 'var(--border-width) solid var(--border-color)',
                      borderBottom: 'var(--border-width) solid var(--border-light)',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      padding: '0.2rem 0.3rem', gap: '1px',
                      ...(isBreak ? { borderTop: '1px dashed var(--border-color)', borderBottom: '1px dashed var(--border-color)' } : {}),
                    }}>
                      {isBreak ? (
                        <span style={{
                          fontSize: '0.55rem', color: 'var(--text-muted)',
                          fontFamily: 'var(--font-pixel)', letterSpacing: '0.04em',
                          textTransform: 'uppercase', whiteSpace: 'nowrap',
                        }}>{seg.label}</span>
                      ) : (
                        <>
                          <span style={{
                            fontFamily: 'var(--font-pixel)', fontSize: '1.1rem',
                            fontWeight: 'bold', color: 'var(--text-primary)', lineHeight: 1,
                          }}>{seg.label}</span>
                          <span style={{
                            fontSize: '0.5rem', color: 'var(--text-muted)',
                            whiteSpace: 'nowrap', lineHeight: 1.2,
                          }}>{seg.time}</span>
                        </>
                      )}
                    </div>

                    {/* Day cells for this segment */}
                    {DAYS.map((day, dayIdx) => (
                      <div key={`${seg.id}-${dayIdx}`} style={{
                        gridColumn: dayIdx + 2,
                        height: `${h}px`,
                        background: isBreak ? 'var(--bg-base)' : 'var(--bg-elevated)',
                        borderBottom: 'var(--border-width) solid var(--border-light)',
                        borderRight: dayIdx < 5 ? 'var(--border-width) solid var(--border-light)' : 'none',
                        position: 'relative',
                        ...(isBreak ? { borderTop: '1px dashed var(--border-color)', borderBottom: '1px dashed var(--border-color)' } : {}),
                      }}>
                        {/* Show faint break time in center of one column */}
                        {isBreak && dayIdx === 2 && (
                          <div style={{
                            position: 'absolute', top: '50%', left: '50%',
                            transform: 'translate(-50%, -50%)',
                            fontSize: '0.5rem', color: 'var(--text-muted)',
                            fontFamily: 'var(--font-pixel)', letterSpacing: '0.08em',
                            textTransform: 'uppercase', whiteSpace: 'nowrap', opacity: 0.4,
                          }}>
                            {seg.time}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* ─── Floating Schedule Cards (overlaid on the grid) ─── */}
            <div style={{
              position: 'relative',
              marginTop: `-${totalHeight}px`,
              height: `${totalHeight}px`,
              pointerEvents: 'none',
              marginLeft: '100px', // skip the left label column
            }}>
              {schedule.map((entry) => {
                const startMin = timeToMin(entry.start_time);
                const endMin = timeToMin(entry.end_time);
                const top = minToY(startMin);
                const bottom = minToY(endMin);
                const height = Math.max(bottom - top - 2, 18);

                const dayIdx = entry.day_of_week;
                const charCode = (entry.subject || '').charCodeAt(0) || 65;
                const colorIndex = (charCode % 6) + 1;

                let bg = `var(--color-subj-${colorIndex})`;
                let border = 'var(--border-width) solid var(--border-color)';
                let color = 'var(--text-primary)';

                if (entry.entry_type === 'free') {
                  bg = 'var(--color-free)';
                  border = 'var(--border-width) dashed var(--color-free-border)';
                  color = 'var(--color-free-text)';
                }

                return (
                  <div
                    key={entry.id || `${entry.subject}-${entry.day_of_week}-${entry.start_time}`}
                    style={{
                      position: 'absolute',
                      top: `${top + 1}px`,
                      height: `${height}px`,
                      left: `calc(${dayIdx} * (100% / 6) + 3px)`,
                      width: `calc(100% / 6 - 6px)`,
                      background: bg,
                      border,
                      color,
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.3rem 0.4rem',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      pointerEvents: 'auto',
                      zIndex: 10,
                      cursor: 'default',
                      transition: 'opacity 0.15s',
                    }}
                  >
                    <div style={{
                      fontWeight: 'bold', whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis', overflow: 'hidden', fontSize: '0.8rem',
                    }}>
                      {entry.subject || 'Class'}
                    </div>
                    {entry.room && (
                      <div style={{
                        fontSize: '0.65rem', color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {entry.room}
                      </div>
                    )}
                    <div style={{
                      marginTop: 'auto', fontSize: '0.7rem',
                      fontFamily: 'var(--font-pixel)', letterSpacing: '0.05em',
                      color: 'var(--text-secondary)',
                    }}>
                      {entry.start_time} – {entry.end_time}
                    </div>
                  </div>
                );
              })}

              {/* Meeting blocks overlaid on timetable */}
              {meetings.map((m) => {
                const startMin = timeToMin(m.start_time);
                const endMin = timeToMin(m.end_time);
                const top = minToY(startMin);
                const bottom = minToY(endMin);
                const height = Math.max(bottom - top - 2, 18);
                const dayIdx = m.day_of_week;

                return (
                  <Link
                    key={`meeting-${m.id}`}
                    href={`/groups/${m.group_invite_code}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: `${top + 1}px`,
                        height: `${height}px`,
                        left: `calc(${dayIdx} * (100% / 6) + 3px)`,
                        width: `calc(100% / 6 - 6px)`,
                        background: 'var(--accent-primary)',
                        border: '2px solid var(--accent-primary)',
                        color: 'var(--bg-base)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '0.3rem 0.4rem',
                        fontSize: '0.75rem',
                        fontFamily: 'var(--font-jetbrains-mono), monospace',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        pointerEvents: 'auto',
                        zIndex: 15,
                        cursor: 'pointer',
                        transition: 'opacity 0.15s',
                        opacity: 0.9,
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '0.9'}
                    >
                      <div style={{
                        fontSize: '0.55rem', textTransform: 'uppercase',
                        letterSpacing: '0.08em', opacity: 0.85, marginBottom: '1px',
                      }}>
                        MEETING
                      </div>
                      <div style={{
                        fontWeight: 'bold', whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis', overflow: 'hidden', fontSize: '0.75rem',
                      }}>
                        {m.title}
                      </div>
                      <div style={{
                        marginTop: 'auto', fontSize: '0.6rem',
                        letterSpacing: '0.05em', opacity: 0.85,
                      }}>
                        {m.start_time} – {m.end_time}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
