"""
Bug Reports API
Endpoints for submitting, listing, and resolving bug reports.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.database import get_db
from app.models import BugReport, User
from app.auth.utils import get_current_user

router = APIRouter(prefix="/api/bugs", tags=["Bug Reports"])


class SubmitBugRequest(BaseModel):
    title: str
    description: Optional[str] = None
    severity: str = "medium"
    page_url: Optional[str] = None
    user_agent: Optional[str] = None


@router.post("")
def submit_bug(
    req: SubmitBugRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit a new bug report."""
    title = req.title.strip()
    if not title or len(title) < 3:
        raise HTTPException(status_code=400, detail="Title must be at least 3 characters")
    if len(title) > 256:
        raise HTTPException(status_code=400, detail="Title must be 256 characters or less")

    valid_severities = {"low", "medium", "high", "critical"}
    severity = req.severity.lower().strip()
    if severity not in valid_severities:
        severity = "medium"

    # Default to request header if not provided by frontend
    user_agent = req.user_agent or request.headers.get("user-agent", "")

    bug = BugReport(
        user_id=current_user.id,
        title=title,
        description=(req.description or "").strip()[:2000] or None,
        severity=severity,
        page_url=(req.page_url or "")[:512] or None,
        user_agent=user_agent[:512] or None,
    )
    db.add(bug)
    db.commit()
    db.refresh(bug)

    return {"success": True, "message": "Bug report submitted", "id": bug.id}


@router.get("")
def list_bugs(db: Session = Depends(get_db)):
    """List all bug reports (for dev dashboard). Unauthenticated for internal dev use."""
    bugs = db.query(BugReport).order_by(BugReport.created_at.desc()).all()
    return {
        "success": True,
        "count": len(bugs),
        "bugs": [
            {
                "id": b.id,
                "title": b.title,
                "description": b.description,
                "severity": b.severity,
                "page_url": b.page_url,
                "user_agent": b.user_agent,
                "reporter": b.reporter.username if b.reporter else "unknown",
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
            for b in bugs
        ],
    }


@router.delete("/{bug_id}")
def resolve_bug(bug_id: int, db: Session = Depends(get_db)):
    """Delete/resolve a bug report. Unauthenticated for internal dev use."""
    bug = db.query(BugReport).filter(BugReport.id == bug_id).first()
    if not bug:
        raise HTTPException(status_code=404, detail="Bug report not found")
    db.delete(bug)
    db.commit()
    return {"success": True, "message": f"Bug #{bug_id} resolved and removed"}
