"""
Group Management Routes
"""

import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import Group, GroupMember, Schedule, ScheduledSlot, User
from app.auth.utils import get_current_user
from app.schedules.sync import find_common_free_slots

router = APIRouter(prefix="/api/groups", tags=["Groups"])

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


class CreateGroupRequest(BaseModel):
    name: str
    description: Optional[str] = None


class JoinGroupRequest(BaseModel):
    invite_code: str


class AddMemberRequest(BaseModel):
    username: str


class UpdateGroupRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ScheduleSlotRequest(BaseModel):
    title: str
    description: Optional[str] = None
    day_of_week: int
    start_time: str
    end_time: str


def get_group_by_identifier(identifier: str, db: Session) -> Group:
    if identifier.isdigit():
        group = db.query(Group).filter(Group.id == int(identifier)).first()
        if group: return group
    group = db.query(Group).filter(Group.invite_code == identifier.upper()).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group

def _group_dict(group: Group, db: Session) -> dict:
    members = db.query(GroupMember).filter(GroupMember.group_id == group.id).all()
    member_list = []
    for m in members:
        user = db.query(User).filter(User.id == m.user_id).first()
        if user:
            member_list.append({
                "id": user.id,
                "username": user.username,
                "display_name": user.display_name or user.username,
                "joined_at": m.joined_at.isoformat() if m.joined_at else None,
            })
    return {
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "invite_code": group.invite_code,
        "created_by": group.created_by,
        "created_at": group.created_at.isoformat() if group.created_at else None,
        "members": member_list,
        "member_count": len(member_list),
    }


@router.post("")
def create_group(
    req: CreateGroupRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new group with a unique invite code."""
    if not req.name or len(req.name.strip()) < 1 or len(req.name.strip()) > 128:
        raise HTTPException(status_code=400, detail="Group name must be 1-128 characters")
    if req.description and len(req.description) > 500:
        raise HTTPException(status_code=400, detail="Description must be 500 characters or less")
    invite_code = secrets.token_hex(4).upper()  # 8-char hex code

    group = Group(
        name=req.name,
        description=req.description,
        invite_code=invite_code,
        created_by=current_user.id,
    )
    db.add(group)
    db.flush()

    # Auto-add creator as member
    member = GroupMember(group_id=group.id, user_id=current_user.id)
    db.add(member)
    db.commit()
    db.refresh(group)

    return {"success": True, "group": _group_dict(group, db)}


@router.get("")
def list_groups(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all groups the current user belongs to."""
    memberships = db.query(GroupMember).filter(GroupMember.user_id == current_user.id).all()
    groups = []
    for m in memberships:
        group = db.query(Group).filter(Group.id == m.group_id).first()
        if group:
            groups.append(_group_dict(group, db))
    return {"success": True, "groups": groups}


@router.post("/join")
def join_group(
    req: JoinGroupRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Join a group using its invite code."""
    group = db.query(Group).filter(Group.invite_code == req.invite_code.upper()).first()
    if not group:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    existing = db.query(GroupMember).filter(
        GroupMember.group_id == group.id,
        GroupMember.user_id == current_user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already a member")

    member = GroupMember(group_id=group.id, user_id=current_user.id)
    db.add(member)
    db.commit()

    return {"success": True, "group": _group_dict(group, db)}


@router.get("/{identifier}")
def get_group(
    identifier: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get group details with members."""
    group = get_group_by_identifier(identifier, db)

    is_member = db.query(GroupMember).filter(
        GroupMember.group_id == group.id,
        GroupMember.user_id == current_user.id,
    ).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member of this group")

    return {"success": True, "group": _group_dict(group, db)}


@router.get("/{identifier}/sync")
def sync_group_schedules(
    identifier: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Compute common free slots for all group members."""
    my_schedule_count = db.query(Schedule).filter(Schedule.user_id == current_user.id).count()
    if my_schedule_count == 0:
        raise HTTPException(status_code=400, detail="You must import a timetable via the Dashboard first to sync schedules.")

    group = get_group_by_identifier(identifier, db)

    is_member = db.query(GroupMember).filter(
        GroupMember.group_id == group.id,
        GroupMember.user_id == current_user.id,
    ).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member of this group")

    # Gather all members' schedules
    members = db.query(GroupMember).filter(GroupMember.group_id == group.id).all()
    user_schedules = {}
    members_info = []
    members_missing_schedule = []

    for m in members:
        user = db.query(User).filter(User.id == m.user_id).first()
        schedules = db.query(Schedule).filter(Schedule.user_id == m.user_id).all()
        user_schedules[m.user_id] = [
            {"day_of_week": s.day_of_week, "start_time": s.start_time, "end_time": s.end_time}
            for s in schedules
        ]
        if user:
            members_info.append({
                "id": user.id,
                "username": user.username,
                "schedule_count": len(schedules),
            })
            if len(schedules) == 0:
                members_missing_schedule.append(user.username)

    # ALL members must have schedules for sync to work correctly
    if members_missing_schedule:
        missing_list = ", ".join(f"@{u}" for u in members_missing_schedule)
        raise HTTPException(
            status_code=400,
            detail=f"All members must import a timetable before syncing. Missing: {missing_list}"
        )

    free_slots = find_common_free_slots(user_schedules)

    # Add day names
    for slot in free_slots:
        slot["day_name"] = DAYS[slot["day_of_week"]] if slot["day_of_week"] < len(DAYS) else "Unknown"

    return {
        "success": True,
        "group_name": group.name,
        "members": members_info,
        "free_slots": free_slots,
        "total_free_slots": len(free_slots),
    }


@router.post("/{identifier}/schedule-slot")
def schedule_slot(
    identifier: str,
    req: ScheduleSlotRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Schedule a collaborative slot in the group."""
    my_schedule_count = db.query(Schedule).filter(Schedule.user_id == current_user.id).count()
    if my_schedule_count == 0:
        raise HTTPException(status_code=400, detail="You must import a timetable first to book a session.")

    group = get_group_by_identifier(identifier, db)

    is_member = db.query(GroupMember).filter(
        GroupMember.group_id == group.id,
        GroupMember.user_id == current_user.id,
    ).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member")

    slot = ScheduledSlot(
        group_id=group.id,
        created_by=current_user.id,
        title=req.title,
        description=req.description,
        day_of_week=req.day_of_week,
        start_time=req.start_time,
        end_time=req.end_time,
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)

    return {
        "success": True,
        "slot": {
            "id": slot.id,
            "title": slot.title,
            "description": slot.description,
            "day_of_week": slot.day_of_week,
            "day_name": DAYS[slot.day_of_week] if slot.day_of_week < len(DAYS) else "Unknown",
            "start_time": slot.start_time,
            "end_time": slot.end_time,
            "created_by": current_user.username,
        },
    }


@router.get("/{identifier}/slots")
def get_group_slots(
    identifier: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all scheduled collaborative slots for a group."""
    group = get_group_by_identifier(identifier, db)
    
    is_member = db.query(GroupMember).filter(
        GroupMember.group_id == group.id,
        GroupMember.user_id == current_user.id,
    ).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member")

    slots = (
        db.query(ScheduledSlot)
        .filter(ScheduledSlot.group_id == group.id)
        .order_by(ScheduledSlot.day_of_week, ScheduledSlot.start_time)
        .all()
    )
    result = []
    for s in slots:
        creator = db.query(User).filter(User.id == s.created_by).first()
        result.append({
            "id": s.id,
            "title": s.title,
            "description": s.description,
            "day_of_week": s.day_of_week,
            "day_name": DAYS[s.day_of_week] if s.day_of_week < len(DAYS) else "Unknown",
            "start_time": s.start_time,
            "end_time": s.end_time,
            "created_by": creator.username if creator else "Unknown",
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })

    return {"success": True, "slots": result}


@router.delete("/{identifier}/slots/{slot_id}")
def delete_slot(
    identifier: str,
    slot_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a scheduled slot (only by creator)."""
    group = get_group_by_identifier(identifier, db)

    slot = db.query(ScheduledSlot).filter(
        ScheduledSlot.id == slot_id,
        ScheduledSlot.group_id == group.id,
        ScheduledSlot.created_by == current_user.id,
    ).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found or unauthorized")
    db.delete(slot)
    db.commit()
    return {"success": True, "message": "Slot deleted"}


@router.post("/{identifier}/add-member")
def add_member(
    identifier: str,
    req: AddMemberRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Creator adds member by username."""
    group = get_group_by_identifier(identifier, db)
    if group.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the group creator can add members")

    target_user = db.query(User).filter(User.username.ilike(req.username.strip())).first()
    if not target_user:
        raise HTTPException(status_code=404, detail=f"User '{req.username}' not found on SyncSpace")

    existing = db.query(GroupMember).filter(
        GroupMember.group_id == group.id,
        GroupMember.user_id == target_user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="User is already a member")

    member = GroupMember(group_id=group.id, user_id=target_user.id)
    db.add(member)
    db.commit()

    return {"success": True, "group": _group_dict(group, db)}


@router.delete("/{identifier}/members/{user_id}")
def remove_member(
    identifier: str,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Creator removes a member."""
    group = get_group_by_identifier(identifier, db)
    if group.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the group creator can remove members")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself — use leave instead")

    member = db.query(GroupMember).filter(
        GroupMember.group_id == group.id,
        GroupMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in this group")
    
    db.delete(member)
    db.commit()

    return {"success": True, "group": _group_dict(group, db)}


@router.post("/{identifier}/leave")
def leave_group(
    identifier: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Any member leaves group."""
    group = get_group_by_identifier(identifier, db)

    member = db.query(GroupMember).filter(
        GroupMember.group_id == group.id,
        GroupMember.user_id == current_user.id,
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this group")

    if group.created_by == current_user.id:
        other_members = db.query(GroupMember).filter(
            GroupMember.group_id == group.id,
            GroupMember.user_id != current_user.id
        ).order_by(GroupMember.joined_at).all()

        if other_members:
            # Transfer ownership to the longest-standing member
            group.created_by = other_members[0].user_id
            db.delete(member)
            db.commit()
            return {"success": True, "message": "Left group. Ownership transferred."}
        else:
            # Delete group entirely
            db.delete(group)
            db.commit()
            return {"success": True, "message": "Left group. Group deleted."}
    else:
        db.delete(member)
        db.commit()
        return {"success": True, "message": "Left group"}


@router.delete("/{identifier}")
def delete_group(
    identifier: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Creator deletes group entirely."""
    group = get_group_by_identifier(identifier, db)
    if group.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the group creator can delete the group")
    
    db.delete(group) # Cascade handles members, slots, meetings
    db.commit()
    return {"success": True, "message": "Group deleted"}


@router.put("/{identifier}")
def update_group(
    identifier: str,
    req: UpdateGroupRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Creator updates name/description."""
    group = get_group_by_identifier(identifier, db)
    if group.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the group creator can update the group")
    
    if req.name is not None:
        if len(req.name.strip()) < 1 or len(req.name.strip()) > 128:
            raise HTTPException(status_code=400, detail="Group name must be 1-128 characters")
        group.name = req.name.strip()
    
    if req.description is not None:
        if len(req.description) > 500:
            raise HTTPException(status_code=400, detail="Description must be 500 characters or less")
        group.description = req.description.strip()
    
    db.commit()
    return {"success": True, "group": _group_dict(group, db)}
