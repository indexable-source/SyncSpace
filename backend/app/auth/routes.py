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
    }


@router.get("/check-username/{username}")
def check_username(username: str, db: Session = Depends(get_db)):
    if err := validate_username(username):
        return {"available": False, "message": err}
    exists = db.query(User).filter(User.username == username).first() is not None
    if exists:
        return {"available": False, "message": "Username already taken"}
    return {"available": True, "message": "Username available"}


@router.post("/register", response_model=AuthResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    req_email = req.email.strip() if req.email else None
    
    if err := validate_username(req.username):
        raise HTTPException(status_code=400, detail=err)
    if err := validate_password(req.password):
        raise HTTPException(status_code=400, detail=err)
    if req_email:
        if err := validate_email(req_email):
            raise HTTPException(status_code=400, detail=err)

    if db.query(User).filter(User.username == req.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    if req_email and db.query(User).filter(User.email == req_email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        username=req.username,
        email=req_email,
        password_hash=hash_password(req.password),
        display_name=req.display_name or req.username,
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

    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

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
        if len(req.display_name.strip()) < 1:
            raise HTTPException(status_code=400, detail="Display name cannot be empty")
        current_user.display_name = req.display_name.strip()

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
    return {"success": True, "message": "Password changed successfully"}


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

