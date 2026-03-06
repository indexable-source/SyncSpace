"""
Schedule CRUD Routes
"""

import re
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import Schedule, User
from app.auth.utils import get_current_user

router = APIRouter(prefix="/api/schedules", tags=["Schedules"])

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _standardize_room(room: str | None) -> str | None:
    """Normalize room strings: H-107 -> H107, H108(1) -> H108."""
    if not room:
        return room
    room = re.sub(r'-', '', room)
    room = re.sub(r'\(\d+\)', '', room)
    return room.strip()


class ScheduleEntry(BaseModel):
    day_of_week: int  # 0=Mon, 6=Sun
    start_time: str   # "09:00"
    end_time: str      # "10:00"
    subject: Optional[str] = None
    room: Optional[str] = None
    entry_type: Optional[str] = "class"


class BulkScheduleRequest(BaseModel):
    entries: list[ScheduleEntry]
    replace_all: bool = False  # If True, deletes existing schedule first


@router.get("")
def get_my_schedule(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get current user's full schedule."""
    entries = (
        db.query(Schedule)
        .filter(Schedule.user_id == current_user.id)
        .order_by(Schedule.day_of_week, Schedule.start_time)
        .all()
    )
    return {
        "success": True,
        "entries": [
            {
                "id": e.id,
                "day_of_week": e.day_of_week,
                "day_name": DAYS[e.day_of_week] if e.day_of_week < len(DAYS) else "Unknown",
                "start_time": e.start_time,
                "end_time": e.end_time,
                "subject": e.subject,
                "room": e.room,
                "entry_type": e.entry_type,
            }
            for e in entries
        ],
        "count": len(entries),
    }


@router.post("")
def save_schedule(
    req: BulkScheduleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save schedule entries. If replace_all=True, replaces the entire schedule."""
    if req.replace_all:
        db.query(Schedule).filter(Schedule.user_id == current_user.id).delete()

    new_entries = []
    for entry in req.entries:
        s = Schedule(
            user_id=current_user.id,
            day_of_week=entry.day_of_week,
            start_time=entry.start_time,
            end_time=entry.end_time,
            subject=entry.subject,
            room=_standardize_room(entry.room),
            entry_type=entry.entry_type or "class",
        )
        db.add(s)
        new_entries.append(s)

    db.commit()
    return {
        "success": True,
        "message": f"Saved {len(new_entries)} schedule entries",
        "count": len(new_entries),
    }


@router.delete("/{entry_id}")
def delete_entry(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a single schedule entry."""
    entry = db.query(Schedule).filter(
        Schedule.id == entry_id, Schedule.user_id == current_user.id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    db.delete(entry)
    db.commit()
    return {"success": True, "message": "Entry deleted"}


@router.delete("")
def clear_schedule(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear all schedule entries for the current user."""
    count = db.query(Schedule).filter(Schedule.user_id == current_user.id).delete()
    db.commit()
    return {"success": True, "message": f"Cleared {count} entries"}


@router.post("/upload-image")
async def upload_timetable_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a timetable image. Returns image data for frontend display.
    The frontend will handle manual entry from the image.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    import base64
    content = await file.read()
    b64 = base64.b64encode(content).decode("utf-8")

    return {
        "success": True,
        "message": "Image uploaded — enter your schedule from the image",
        "image_data": f"data:{file.content_type};base64,{b64}",
        "filename": file.filename,
    }
