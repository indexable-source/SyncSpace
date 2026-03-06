'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

export default function GroupDetailsPage({ params }) {
    const { id } = use(params);
    const router = useRouter();
    const { user } = useAuth();
    const toast = useToast();

    const [group, setGroup] = useState(null);
    const [members, setMembers] = useState([]);
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Member Add State
    const [newMemberUsername, setNewMemberUsername] = useState('');
    const [addingMember, setAddingMember] = useState(false);

    // Settings State
    const [showSettings, setShowSettings] = useState(false);
    const [editGroup, setEditGroup] = useState({ name: '', description: '' });
    const [updatingGroup, setUpdatingGroup] = useState(false);

    const fetchGroupData = async () => {
        try {
            const [groupData, meetingsData] = await Promise.all([
                api.getGroupDetails(id),
                api.getGroupMeetings(id).catch(() => ({ meetings: [] })) // Gracefully handle if not found
            ]);
            setGroup(groupData.group);
            setMembers(groupData.group.members || []);
            setMeetings(meetingsData.meetings || []);
            setEditGroup({ name: groupData.group.name, description: groupData.group.description || '' });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) fetchGroupData();
    }, [id]);

    const isCreator = user && group && user.id === group.created_by;

    const handleAddMember = async (e) => {
        e.preventDefault();
        if (!newMemberUsername.trim()) return;
        setAddingMember(true);
        try {
            await api.addMember(id, newMemberUsername);
            toast.success(`Added @${newMemberUsername} to the group!`);
            setNewMemberUsername('');
            fetchGroupData();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setAddingMember(false);
        }
    };

    const handleRemoveMember = async (memberId, username) => {
        if (!confirm(`Are you sure you want to remove @${username} from the group?`)) return;
        try {
            await api.removeMember(id, memberId);
            toast.success(`Removed @${username} from the group.`);
            fetchGroupData();
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleLeaveGroup = async () => {
        if (!confirm("Are you sure you want to leave this group?")) return;
        try {
            await api.leaveGroup(id);
            toast.success("You left the group.");
            router.push('/groups');
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleDeleteGroup = async () => {
        const confirmName = prompt(`Type "${group.name}" to confirm you want to delete this group forever:`);
        if (confirmName !== group.name) {
            if (confirmName !== null) toast.error("Name didn't match. Deletion cancelled.");
            return;
        }
        try {
            await api.deleteGroup(id);
            toast.success("Group deleted successfully.");
            router.push('/groups');
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleUpdateGroup = async (e) => {
        e.preventDefault();
        setUpdatingGroup(true);
        try {
            await api.updateGroup(id, editGroup.name, editGroup.description);
            toast.success("Group updated successfully.");
            setShowSettings(false);
            fetchGroupData();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setUpdatingGroup(false);
        }
    };

    const handleDeleteMeeting = async (meetingId) => {
        if (!confirm("Are you sure you want to delete this meeting?")) return;
        try {
            await api.deleteMeeting(id, meetingId);
            toast.success("Meeting deleted.");
            fetchGroupData();
        } catch (err) {
            toast.error(err.message);
        }
    };

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
            <div style={{ marginBottom: '2rem', borderBottom: 'var(--border-width) solid var(--border-color)', paddingBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
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
                    >
                        ← BACK TO GROUPS
                    </button>
                    <p className="font-mono text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                        Team Details / #{id}
                    </p>
                    <h1 className="font-serif" style={{ margin: 0, lineHeight: 1 }}>{group.name}.</h1>
                    {group.description && <p className="font-mono text-muted" style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>{group.description}</p>}
                </div>
                {isCreator && (
                    <button className="btn btn-outline" onClick={() => setShowSettings(!showSettings)}>
                        {showSettings ? 'CLOSE SETTINGS' : 'SETTINGS'}
                    </button>
                )}
            </div>

            {/* Settings Dropdown */}
            {showSettings && isCreator && (
                <div className="card" style={{ marginBottom: '2rem', background: 'var(--bg-elevated)' }}>
                    <form onSubmit={handleUpdateGroup}>
                        <h4 className="font-serif" style={{ marginBottom: '1rem' }}>Edit Group Details.</h4>
                        <div className="input-group">
                            <label className="input-label" style={{ fontSize: '0.7rem' }}>GROUP NAME</label>
                            <input
                                type="text"
                                className="input-field"
                                value={editGroup.name}
                                onChange={e => setEditGroup({ ...editGroup, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label" style={{ fontSize: '0.7rem' }}>DESCRIPTION</label>
                            <input
                                type="text"
                                className="input-field"
                                value={editGroup.description}
                                onChange={e => setEditGroup({ ...editGroup, description: e.target.value })}
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={updatingGroup}>
                            {updatingGroup ? 'UPDATING...' : 'SAVE CHANGES'}
                        </button>
                    </form>
                </div>
            )}

            {/* Two-Panel Layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '3rem', alignItems: 'start' }}>

                {/* Left Panel: Members & Meetings */}
                <div>
                    {/* Members List */}
                    <div style={{ marginBottom: '3rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 className="font-mono" style={{ textTransform: 'uppercase', fontSize: '1rem', letterSpacing: '0.05em', margin: 0 }}>
                                Members ({members.length})
                            </h3>
                            <span
                                className="font-mono text-muted"
                                style={{ fontSize: '0.75rem', cursor: 'pointer', borderBottom: '1px dashed currentColor' }}
                                onClick={() => { navigator.clipboard.writeText(group.invite_code); toast.info('Invite code copied'); }}
                                title="Copy Invite Code"
                            >
                                CODE: {group.invite_code}
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {members.map(member => (
                                <div key={member.id} className="card-invert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', border: 'var(--border-width) solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <strong className="font-mono" style={{ fontSize: '0.9rem' }}>
                                                @{member.username} {member.id === user?.id && <span style={{ color: 'var(--accent-primary)' }}>(you)</span>}
                                            </strong>
                                            {member.id === group.created_by && (
                                                <span style={{ fontSize: '0.65rem', padding: '0.2rem 0.4rem', background: 'var(--accent-primary)', color: '#fff', borderRadius: 'var(--radius-sm)', textTransform: 'uppercase', fontWeight: 'bold' }}>
                                                    Creator
                                                </span>
                                            )}
                                        </div>
                                        <div className="font-mono text-muted" style={{ fontSize: '0.75rem', marginTop: '0.4rem' }}>
                                            Joined {new Date(member.joined_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                    {isCreator && member.id !== user?.id && (
                                        <button
                                            className="font-mono text-muted"
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', textTransform: 'uppercase', padding: '0.5rem' }}
                                            onClick={() => handleRemoveMember(member.id, member.username)}
                                        >
                                            REMOVE
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Add Member UI */}
                        {isCreator && (
                            <form onSubmit={handleAddMember} style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="Add by username..."
                                    style={{ flex: 1 }}
                                    value={newMemberUsername}
                                    onChange={(e) => setNewMemberUsername(e.target.value.toLowerCase())}
                                />
                                <button type="submit" className="btn btn-outline" disabled={addingMember}>
                                    {addingMember ? 'ADDING...' : 'ADD MEMBER'}
                                </button>
                            </form>
                        )}
                    </div>

                    {/* Upcoming Meetings List */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 className="font-mono" style={{ textTransform: 'uppercase', fontSize: '1rem', letterSpacing: '0.05em', margin: 0 }}>
                                Upcoming Meetings ({meetings.length})
                            </h3>
                        </div>

                        {meetings.length === 0 ? (
                            <div className="font-mono text-muted" style={{ padding: '2rem', border: 'var(--border-width) dashed var(--border-color)', borderRadius: 'var(--radius-sm)', textAlign: 'center', fontSize: '0.85rem' }}>
                                No upcoming meetings.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {meetings.map(m => (
                                    <div key={m.id} className="card-invert" style={{ padding: '1rem', border: 'var(--border-width) solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <strong className="font-serif" style={{ fontSize: '1.1rem' }}>{m.title}</strong>
                                            {(isCreator || m.created_by === user?.username) && (
                                                <button
                                                    style={{ background: 'none', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', fontSize: '1rem' }}
                                                    onClick={() => handleDeleteMeeting(m.id)}
                                                    title="Delete Meeting"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                        <div className="font-mono text-secondary" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                                            {m.day_name.toUpperCase()} • {m.start_time} - {m.end_time}
                                        </div>
                                        {m.description && (
                                            <p className="font-mono text-muted" style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>{m.description}</p>
                                        )}
                                        <div className="font-mono text-muted" style={{ fontSize: '0.7rem', borderTop: 'var(--border-width) dashed var(--border-color)', paddingTop: '0.5rem' }}>
                                            With: {m.participants.map(p => p.username === user?.username ? 'you' : `@${p.username}`).join(', ')}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                </div>

                {/* Right Panel: Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'sticky', top: '2rem' }}>
                    <h3 className="font-mono text-muted" style={{ textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.05em', margin: '0 0 0.5rem 0' }}>
                        Actions
                    </h3>

                    <button className="btn btn-primary" onClick={() => router.push(`/groups/${id}/schedule`)} style={{ width: '100%', padding: '1rem' }}>
                        SCHEDULE NEW MEETING
                    </button>

                    <button className="btn btn-outline" onClick={() => router.push(`/groups/${id}/sync`)} style={{ width: '100%' }}>
                        SYNC FREE SLOTS
                    </button>

                    <div style={{ borderTop: 'var(--border-width) solid var(--border-color)', margin: '1rem 0' }}></div>

                    <button className="btn btn-outline" onClick={handleLeaveGroup} style={{ width: '100%', color: 'var(--text-secondary)' }}>
                        LEAVE GROUP
                    </button>

                    {isCreator && (
                        <button className="btn btn-danger" onClick={handleDeleteGroup} style={{ width: '100%' }}>
                            DELETE GROUP
                        </button>
                    )}
                </div>

            </div>
        </div>
    );
}
