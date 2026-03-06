"""
ERP Session Manager
Manages requests.Session objects for authenticated ERP sessions.
Ported and improved from demo2/kl_erp_api/erp_api_server.py
"""

import uuid
import logging
from datetime import datetime
from config import settings

logger = logging.getLogger(__name__)

# In-memory session store (session_id -> session_data)
_sessions: dict = {}


def cleanup_expired():
    """Remove expired sessions."""
    now = datetime.now()
    expired = [
        sid for sid, data in _sessions.items()
        if (now - data.get("created_at", now)).seconds > settings.ERP_SESSION_TIMEOUT
    ]
    for sid in expired:
        _sessions.pop(sid, None)
        logger.info(f"Cleaned up expired ERP session: {sid}")


def create_session(session, csrf_token: str) -> str:
    """Store a new requests.Session with its CSRF token. Returns session_id."""
    cleanup_expired()
    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        "session": session,
        "csrf_token": csrf_token,
        "created_at": datetime.now(),
        "authenticated": False,
        "username": None,
        "last_activity": datetime.now(),
    }
    logger.info(f"ERP session created: {session_id}")
    return session_id


def get_session(session_id: str) -> dict | None:
    """Get session data by ID, or None if invalid/expired."""
    data = _sessions.get(session_id)
    if not data:
        return None
    elapsed = (datetime.now() - data["created_at"]).seconds
    if elapsed > settings.ERP_SESSION_TIMEOUT:
        _sessions.pop(session_id, None)
        return None
    return data


def mark_authenticated(session_id: str, username: str):
    """Mark session as authenticated after successful login."""
    if session_id in _sessions:
        _sessions[session_id]["authenticated"] = True
        _sessions[session_id]["username"] = username
        _sessions[session_id]["last_activity"] = datetime.now()


def update_activity(session_id: str):
    """Touch last_activity timestamp."""
    if session_id in _sessions:
        _sessions[session_id]["last_activity"] = datetime.now()


def remove_session(session_id: str):
    """Remove a session from the store."""
    _sessions.pop(session_id, None)
    logger.info(f"ERP session removed: {session_id}")
