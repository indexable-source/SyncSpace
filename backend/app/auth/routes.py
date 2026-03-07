import time
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import User
from app.auth.utils import (hash_password, verify_password, create_access_token, get_current_user,
                            validate_password, validate_username, validate_email)

LOGIN_ATTEMPTS = {}


router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    display_name: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    user: Optional[dict] = None
    message: Optional[str] = None


def _user_dict(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "display_name": user.display_name or user.username,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "erp_roll_number": user.erp_roll_number,
    }


@router.get("/check-username/{username}")
def check_username(username: str, db: Session = Depends(get_db)):
    username = username.lower()
    if err := validate_username(username):
        return {"available": False, "message": err}
    exists = db.query(User).filter(User.username == username).first() is not None
    if exists:
        return {"available": False, "message": "Username already taken"}
    return {"available": True, "message": "Username available"}


@router.post("/register", response_model=AuthResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    req_email = req.email.strip() if req.email else None
    req_username = req.username.strip().lower()
    
    if err := validate_username(req_username):
        raise HTTPException(status_code=400, detail=err)
    if err := validate_password(req.password):
        raise HTTPException(status_code=400, detail=err)
    if req_email:
        if err := validate_email(req_email):
            raise HTTPException(status_code=400, detail=err)

    if db.query(User).filter(User.username == req_username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    if req_email and db.query(User).filter(User.email == req_email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    display_name = (req.display_name or req_username).strip()
    if len(display_name) > 50:
        raise HTTPException(status_code=400, detail="Display name must be 50 characters or less")

    user = User(
        username=req_username,
        email=req_email,
        password_hash=hash_password(req.password),
        display_name=display_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return AuthResponse(success=True, token=token, user=_user_dict(user), message="Registration successful")


@router.post("/login", response_model=AuthResponse)
def login(request: Request, req: LoginRequest, db: Session = Depends(get_db)):
    ip = request.client.host
    now = time.time()
    
    # Rate limiting
    if ip in LOGIN_ATTEMPTS:
        if now > LOGIN_ATTEMPTS[ip]["reset_at"]:
            LOGIN_ATTEMPTS[ip] = {"count": 1, "reset_at": now + 60}
        else:
            if LOGIN_ATTEMPTS[ip]["count"] >= 5:
                raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
            LOGIN_ATTEMPTS[ip]["count"] += 1
    else:
        LOGIN_ATTEMPTS[ip] = {"count": 1, "reset_at": now + 60}

    user = db.query(User).filter(User.username == req.username.strip().lower()).first()
    
    # 1. Check if user exists
    if not user:
        # If rate limit isn't hit, we can pop the attempt, but wait... 
        # let's just raise the clear error they requested.
        raise HTTPException(status_code=404, detail="Username does not exist. Please check your spelling or register.")

    # 2. Verify password
    if not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid password for this account.")

    # Clear rate limit on success
    LOGIN_ATTEMPTS.pop(ip, None)

    token = create_access_token({"sub": str(user.id)})
    return AuthResponse(success=True, token=token, user=_user_dict(user), message="Login successful")


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"success": True, "user": _user_dict(current_user)}


class UpdateProfileRequest(BaseModel):
    display_name: Optional[str] = None
    email: Optional[str] = None


@router.put("/profile")
def update_profile(
    req: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if req.display_name is not None:
        name = req.display_name.strip()
        if len(name) < 1:
            raise HTTPException(status_code=400, detail="Display name cannot be empty")
        if len(name) > 50:
            raise HTTPException(status_code=400, detail="Display name must be 50 characters or less")
        current_user.display_name = name

    if req.email is not None:
        if req.email:
            if err := validate_email(req.email):
                raise HTTPException(status_code=400, detail=err)
            existing = db.query(User).filter(User.email == req.email, User.id != current_user.id).first()
            if existing:
                raise HTTPException(status_code=400, detail="Email already in use by another account")
        current_user.email = req.email or None

    db.commit()
    db.refresh(current_user)
    return {"success": True, "user": _user_dict(current_user), "message": "Profile updated"}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.put("/change-password")
def change_password(
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if err := validate_password(req.new_password):
        raise HTTPException(status_code=400, detail=err)

    if req.current_password == req.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current")

    current_user.password_hash = hash_password(req.new_password)
    db.commit()
    db.refresh(current_user)
    return {"success": True, "message": "Password changed successfully"}


class LinkErpRequest(BaseModel):
    roll_number: str

@router.post("/link-erp")
def link_erp(
    req: LinkErpRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Link an ERP roll number to the current user's account."""
    roll = req.roll_number.strip().upper()

    # Validate format: must be 5-20 alphanumeric characters
    if not roll or len(roll) < 5 or len(roll) > 20 or not roll.isalnum():
        raise HTTPException(status_code=400, detail="Invalid roll number format (5-20 alphanumeric characters)")

    # Check if already linked to ANOTHER account
    existing = db.query(User).filter(
        User.erp_roll_number == roll,
        User.id != current_user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="This roll number is already linked to another account")

    # If same user re-links the same roll, it's a no-op
    current_user.erp_roll_number = roll
    db.commit()
    db.refresh(current_user)
    return {"success": True, "user": _user_dict(current_user), "message": f"Roll number {roll} linked successfully"}

@router.delete("/unlink-erp")
def unlink_erp(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove the linked ERP roll number from the current user's account."""
    if not current_user.erp_roll_number:
        raise HTTPException(status_code=400, detail="No roll number is currently linked")
    current_user.erp_roll_number = None
    db.commit()
    return {"success": True, "message": "Roll number unlinked successfully"}


@router.delete("/account")
def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently delete the current user's account and all associated data."""
    from app.models import Schedule, ScheduledSlot, Group, GroupMember
    
    # Delete all schedule entries and slots created by user
    db.query(Schedule).filter(Schedule.user_id == current_user.id).delete()
    db.query(ScheduledSlot).filter(ScheduledSlot.created_by == current_user.id).delete()
    
    # Delete group memberships
    db.query(GroupMember).filter(GroupMember.user_id == current_user.id).delete()
    
    # Delete groups created by user (memberships and slots cascade down)
    groups_to_delete = db.query(Group).filter(Group.created_by == current_user.id).all()
    for g in groups_to_delete:
        db.delete(g)

    # Delete the user
    db.delete(current_user)
    db.commit()
    return {"success": True, "message": "Account deleted permanently"}

