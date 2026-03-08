from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date, timedelta

from app.database import get_db
from app.models import Group, GroupMember, Meeting, MeetingParticipant, Schedule, User
from app.auth.utils import get_current_user
from app.schedules.sync import find_common_free_slots

router = APIRouter(prefix="/api", tags=["Meetings"])

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

class FindSlotsRequest(BaseModel):
    member_ids: List[int]
    include_break: bool = False

class CreateMeetingRequest(BaseModel):
    title: str
    description: Optional[str] = None
    day_of_week: int
    start_time: str
    end_time: str
    participant_ids: List[int]
    include_break: bool = False
    meeting_date: Optional[str] = None  # "YYYY-MM-DD", auto-computed if missing


def _next_weekday(day_of_week: int) -> date:
    """Return the next occurrence of the given weekday (0=Mon)."""
    today = date.today()
    days_ahead = day_of_week - today.weekday()
    if days_ahead < 0:  # already passed this week
        days_ahead += 7
    return today + timedelta(days=days_ahead)

def time_to_minutes(time_str: str) -> int:
    h, m = map(int, time_str.split(':'))
    return h * 60 + m

def minutes_to_time(minutes: int) -> str:
    h = minutes // 60
    m = minutes % 60
    return f"{h:02d}:{m:02d}"

def get_group_by_identifier(identifier: str, db: Session) -> Group:
    if identifier.isdigit():
        group = db.query(Group).filter(Group.id == int(identifier)).first()
        if group: return group
    group = db.query(Group).filter(Group.invite_code == identifier.upper()).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group

@router.post("/groups/{identifier}/find-slots")
def find_slots(
    identifier: str,
    req: FindSlotsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Find available meeting slots for a subset of members."""
    my_schedule_count = db.query(Schedule).filter(Schedule.user_id == current_user.id).count()
    if my_schedule_count == 0:
        raise HTTPException(status_code=400, detail="You must import a timetable via the Dashboard first to sync schedules.")
        
    group = get_group_by_identifier(identifier, db)

    # 1. Verify caller is a member
    is_member = db.query(GroupMember).filter(
        GroupMember.group_id == group.id,
        GroupMember.user_id == current_user.id
    ).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member of this group")

    # 2. Get the requested members
    target_users = []
    for uid in req.member_ids:
        u = db.query(User).filter(User.id == uid).first()
        if u:
            # check if they are in the group
            in_group = db.query(GroupMember).filter(GroupMember.group_id == group.id, GroupMember.user_id == uid).first()
            if in_group:
                target_users.append(u)
    
    if not target_users:
        return {"success": True, "available_slots": [], "members_checked": []}

    # 3. Algorithm: per-day occupied slots
    # day_of_week -> list of (start_min, end_min, is_break)
    occupied = {day: [] for day in range(7)}

    for u in target_users:
        schedules = db.query(Schedule).filter(Schedule.user_id == u.id).all()
        # group by day for this user to find breaks
        user_day_sched = {day: [] for day in range(7)}
        for s in schedules:
            user_day_sched[s.day_of_week].append((time_to_minutes(s.start_time), time_to_minutes(s.end_time)))
        
        for day, classes in user_day_sched.items():
            classes.sort()
            for i, c in enumerate(classes):
                occupied[day].append((c[0], c[1], False)) # False = class
                
                # If include_break is False, block gaps <= 30 mins
                if not req.include_break and i < len(classes) - 1:
                    gap_start = c[1]
                    gap_end = classes[i+1][0]
                    if gap_end - gap_start <= 30 and gap_end > gap_start:
                        occupied[day].append((gap_start, gap_end, True)) # True = break

    # 4. Find free windows between 08:00 (480) and 20:00 (1200)
    # Granularity: 30 mins
    available_slots = []
    for day in range(6):  # Mon-Sat typically
        day_occ = sorted(occupied[day])
        merged_occ = []
        for occ in day_occ:
            if not merged_occ or merged_occ[-1][1] <= occ[0]:
                merged_occ.append([occ[0], occ[1]])
            else:
                merged_occ[-1][1] = max(merged_occ[-1][1], occ[1])
        
        # Invert to find free windows
        curr_time = 480 # 08:00
        for occ in merged_occ:
            if curr_time < occ[0]:
                # Free slot from curr_time to occ[0]
                # Chunk into 30 min (or just return the whole contiguous window and FE chunks it?
                # Actually, returning the whole window is better.
                available_slots.append({
                    "day_of_week": day,
                    "day_name": DAYS[day],
                    "start_time": minutes_to_time(curr_time),
                    "end_time": minutes_to_time(occ[0])
                })
            curr_time = max(curr_time, occ[1])
        
        if curr_time < 1200:
            available_slots.append({
                "day_of_week": day,
                "day_name": DAYS[day],
                "start_time": minutes_to_time(curr_time),
                "end_time": minutes_to_time(1200)
            })

    # Add member_checked info
    members_info = [{"id": u.id, "username": u.username} for u in target_users]

    return {
        "success": True,
        "available_slots": available_slots,
        "members_checked": members_info
    }


@router.post("/groups/{identifier}/meetings")
def create_meeting(
    identifier: str,
    req: CreateMeetingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a meeting."""
    my_schedule_count = db.query(Schedule).filter(Schedule.user_id == current_user.id).count()
    if my_schedule_count == 0:
        raise HTTPException(status_code=400, detail="You must import a timetable first to book a session.")

    group = get_group_by_identifier(identifier, db)

    # Validate group
    is_member = db.query(GroupMember).filter(
        GroupMember.group_id == group.id,
        GroupMember.user_id == current_user.id
    ).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member of this group")

    if len(req.title) < 1 or len(req.title) > 256:
        raise HTTPException(status_code=400, detail="Title must be 1-256 characters")

    m_start = time_to_minutes(req.start_time)
    m_end = time_to_minutes(req.end_time)

    # Validate participants
    for uid in req.participant_ids:
        in_group = db.query(GroupMember).filter(GroupMember.group_id == group.id, GroupMember.user_id == uid).first()
        if not in_group:
            raise HTTPException(status_code=400, detail=f"User {uid} is not a member of this group")

        # Check conflicts
        schedules = db.query(Schedule).filter(
            Schedule.user_id == uid,
            Schedule.day_of_week == req.day_of_week
        ).all()

        user_classes = []
        for s in schedules:
            c_start = time_to_minutes(s.start_time)
            c_end = time_to_minutes(s.end_time)
            user_classes.append((c_start, c_end))
            if max(m_start, c_start) < min(m_end, c_end):
                u = db.query(User).filter(User.id == uid).first()
                raise HTTPException(status_code=400, detail=f"Time slot conflicts with {u.username}'s schedule")
            
        user_classes.sort()
        if not req.include_break:
            for i in range(len(user_classes) - 1):
                gap_start = user_classes[i][1]
                gap_end = user_classes[i+1][0]
                if gap_end - gap_start <= 30 and gap_end > gap_start:
                    if max(m_start, gap_start) < min(m_end, gap_end):
                        raise HTTPException(status_code=400, detail="Meeting cannot be scheduled during break time")

    # Compute meeting date
    if req.meeting_date:
        m_date = date.fromisoformat(req.meeting_date)
    else:
        m_date = _next_weekday(req.day_of_week)

    # Create meeting
    meeting = Meeting(
        group_id=group.id,
        created_by=current_user.id,
        title=req.title,
        description=req.description,
        day_of_week=req.day_of_week,
        start_time=req.start_time,
        end_time=req.end_time,
        meeting_date=m_date,
        include_break=req.include_break
    )
    db.add(meeting)
    db.flush()

    # Add participants
    for uid in req.participant_ids:
        mp = MeetingParticipant(meeting_id=meeting.id, user_id=uid)
        db.add(mp)
    
    db.commit()
    db.refresh(meeting)

    return {"success": True, "meeting": {"id": meeting.id, "title": meeting.title, "meeting_date": str(m_date)}}


@router.get("/groups/{identifier}/meetings")
def list_group_meetings(
    identifier: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List group meetings."""
    group = get_group_by_identifier(identifier, db)

    is_member = db.query(GroupMember).filter(
        GroupMember.group_id == group.id,
        GroupMember.user_id == current_user.id
    ).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member of this group")

    meetings = db.query(Meeting).filter(Meeting.group_id == group.id).order_by(Meeting.day_of_week, Meeting.start_time).all()
    res = []
    for m in meetings:
        participants = db.query(MeetingParticipant).filter(MeetingParticipant.meeting_id == m.id).all()
        parts_info = []
        for p in participants:
            u = db.query(User).filter(User.id == p.user_id).first()
            if u:
                parts_info.append({"id": u.id, "username": u.username, "status": p.status})
        
        creator = db.query(User).filter(User.id == m.created_by).first()

        res.append({
            "id": m.id,
            "title": m.title,
            "description": m.description,
            "day_of_week": m.day_of_week,
            "day_name": DAYS[m.day_of_week] if m.day_of_week < len(DAYS) else "Unknown",
            "start_time": m.start_time,
            "end_time": m.end_time,
            "meeting_date": str(m.meeting_date) if m.meeting_date else None,
            "created_by": creator.username if creator else "Unknown",
            "participants": parts_info
        })
    return {"success": True, "meetings": res}


@router.delete("/groups/{identifier}/meetings/{meeting_id}")
def delete_meeting(
    identifier: str,
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete meeting (creator of meeting or creator of group)."""
    group = get_group_by_identifier(identifier, db)

    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.group_id == group.id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if meeting.created_by != current_user.id and group.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only meeting creator or group creator can delete this meeting")

    db.delete(meeting) # Cascade deletes participants
    db.commit()
    return {"success": True, "message": "Meeting deleted"}


@router.get("/dashboard/meetings")
def get_dashboard_meetings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all upcoming meetings for the current user across all groups."""
    participants = db.query(MeetingParticipant).filter(MeetingParticipant.user_id == current_user.id).all()
    meeting_ids = [p.meeting_id for p in participants]
    
    if not meeting_ids:
        return {"success": True, "meetings": []}

    meetings = db.query(Meeting).filter(Meeting.id.in_(meeting_ids)).order_by(Meeting.day_of_week, Meeting.start_time).all()
    
    res = []
    for m in meetings:
        group = db.query(Group).filter(Group.id == m.group_id).first()
        # Get all participants
        m_parts = db.query(MeetingParticipant).filter(MeetingParticipant.meeting_id == m.id).all()
        parts_info = []
        for p in m_parts:
            u = db.query(User).filter(User.id == p.user_id).first()
            if u:
                parts_info.append({"id": u.id, "username": u.username})
                
        res.append({
            "id": m.id,
            "title": m.title,
            "group_id": m.group_id,
            "group_invite_code": group.invite_code if group else "Unknown",
            "group_name": group.name if group else "Unknown",
            "day_of_week": m.day_of_week,
            "day_name": DAYS[m.day_of_week] if m.day_of_week < len(DAYS) else "Unknown",
            "start_time": m.start_time,
            "end_time": m.end_time,
            "meeting_date": str(m.meeting_date) if m.meeting_date else None,
            "participants": parts_info
        })

    return {"success": True, "meetings": res}
