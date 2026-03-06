"""
ERP Proxy Routes
Provides API endpoints to interact with KL University ERP system.
Handles: session init, captcha, login, timetable fetch.
"""

import uuid
import base64
import logging
import requests
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from config import settings
from app.erp import session_manager
from app.erp.timetable_parser import extract_tables, parse_selected_table

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/erp", tags=["ERP Integration"])


class InitLoginResponse(BaseModel):
    success: bool
    session_id: Optional[str] = None
    captcha_image: Optional[str] = None
    error: Optional[str] = None


class RefreshCaptchaRequest(BaseModel):
    session_id: str


class CompleteLoginRequest(BaseModel):
    session_id: str
    username: str
    password: str
    captcha: str


class FetchDataRequest(BaseModel):
    session_id: str
    endpoint: Optional[str] = None


class LogoutRequest(BaseModel):
    session_id: str


class FetchTimetableRequest(BaseModel):
    session_id: str
    academic_year: str
    semester_id: str


@router.post("/init-login", response_model=InitLoginResponse)
def init_login():
    """Initialize ERP login session: fetches login page, extracts CSRF token, gets captcha image."""
    try:
        session = requests.Session()
        session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        })

        # Fetch login page to get CSRF token
        resp = session.get(settings.ERP_LOGIN_URL, timeout=15, verify=False)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")
        csrf_input = soup.find("input", {"name": "_csrf"})
        if not csrf_input or "value" not in csrf_input.attrs:
            raise HTTPException(status_code=502, detail="Failed to extract CSRF token from ERP")

        csrf_token = csrf_input["value"]

        # Fetch captcha image
        captcha_url = f"{settings.ERP_CAPTCHA_URL}&v={uuid.uuid4().hex}"
        captcha_resp = session.get(captcha_url, timeout=10, verify=False)
        captcha_resp.raise_for_status()

        captcha_b64 = base64.b64encode(captcha_resp.content).decode("utf-8")
        content_type = captcha_resp.headers.get("Content-Type", "image/png")

        # Store session
        session_id = session_manager.create_session(session, csrf_token)

        return InitLoginResponse(
            success=True,
            session_id=session_id,
            captcha_image=f"data:{content_type};base64,{captcha_b64}",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error initializing ERP login")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh-captcha")
def refresh_captcha(req: RefreshCaptchaRequest):
    """Refresh captcha image for an existing session."""
    data = session_manager.get_session(req.session_id)
    if not data:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    try:
        session = data["session"]

        # Try up to 2 times in case the ERP returns an error page on first attempt
        for attempt in range(2):
            captcha_url = f"{settings.ERP_CAPTCHA_URL}&refresh={attempt + 1}&v={uuid.uuid4().hex}"
            captcha_resp = session.get(captcha_url, timeout=10, verify=False)
            captcha_resp.raise_for_status()

            content_type = captcha_resp.headers.get("Content-Type", "")
            # Validate the response is actually an image, not an HTML error page
            if "image" in content_type and len(captcha_resp.content) > 100:
                captcha_b64 = base64.b64encode(captcha_resp.content).decode("utf-8")
                return {
                    "success": True,
                    "captcha_image": f"data:{content_type};base64,{captcha_b64}",
                }
            else:
                logger.warning(f"Captcha refresh attempt {attempt + 1} returned non-image content: {content_type}")

        # Both attempts failed — return error so frontend can re-init
        raise HTTPException(status_code=502, detail="ERP returned invalid captcha image")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error refreshing captcha")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/complete-login")
def complete_login(req: CompleteLoginRequest):
    """Complete ERP login with username, password, and captcha."""
    data = session_manager.get_session(req.session_id)
    if not data:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    try:
        session = data["session"]
        csrf_token = data["csrf_token"]

        login_data = {
            "_csrf": csrf_token,
            "LoginForm[username]": req.username,
            "LoginForm[password]": req.password,
            "LoginForm[captcha]": req.captcha,
            "LoginForm[rememberMe]": "0",
            "login-button": "",
        }

        login_resp = session.post(
            settings.ERP_LOGIN_URL,
            data=login_data,
            headers={
                "Referer": settings.ERP_BASE_URL,
                "Content-Type": "application/x-www-form-urlencoded",
                "Origin": settings.ERP_BASE_URL,
            },
            allow_redirects=True,
            timeout=20,
            verify=False,
        )

        text = login_resp.text.lower()
        success = any(kw in text for kw in ["logout", "dashboard", "welcome"])

        if success:
            session_manager.mark_authenticated(req.session_id, req.username)
            return {"success": True, "message": "ERP login successful", "session_id": req.session_id}
        else:
            # Try to extract error messages
            soup = BeautifulSoup(login_resp.text, "html.parser")
            errors = [
                e.get_text(strip=True)
                for e in soup.find_all(["div", "p"], class_=lambda x: x and any(k in x.lower() for k in ("error", "danger")))
            ]
            error_msg = " | ".join(errors) if errors else "Login failed — check credentials or captcha"
            return {"success": False, "error": error_msg, "retry": True}

    except Exception as e:
        logger.exception("Error completing ERP login")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/timetable-options")
def get_timetable_options(req: FetchDataRequest):
    """
    Fetch the timetable search page and extract options for academicyear and semesterid.
    """
    data = session_manager.get_session(req.session_id)
    if not data:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    if not data.get("authenticated"):
        raise HTTPException(status_code=401, detail="Not authenticated — complete login first")

    try:
        session = data["session"]
        session_manager.update_activity(req.session_id)

        url = settings.ERP_TIMETABLE_URL
        if url.startswith("/"):
            url = f"{settings.ERP_BASE_URL}{url}"

        resp = session.get(url, timeout=20, verify=False)
        soup = BeautifulSoup(resp.text, "html.parser")

        academic_years = []
        year_select = soup.find("select", id="universitymasteracademictimetableview-academicyear")
        if year_select:
            for option in year_select.find_all("option"):
                if option.get("value"):
                    academic_years.append({"value": option.get("value"), "label": option.get_text(strip=True)})

        semesters = []
        sem_select = soup.find("select", id="universitymasteracademictimetableview-semesterid")
        if sem_select:
            for option in sem_select.find_all("option"):
                if option.get("value"):
                    semesters.append({"value": option.get("value"), "label": option.get_text(strip=True)})

        return {
            "success": True,
            "academic_years": academic_years,
            "semesters": semesters,
            "page_title": _extract_page_title(resp.text),
        }
    except Exception as e:
        logger.exception("Error fetching timetable options")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fetch-timetable")
def fetch_timetable(req: FetchTimetableRequest):
    """
    Fetch the actual timetable passing academic year and semester id from the search form,
    and return ALL tables as raw HTML so the user can visually pick the correct one.
    """
    data = session_manager.get_session(req.session_id)
    if not data:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    if not data.get("authenticated"):
        raise HTTPException(status_code=401, detail="Not authenticated — complete login first")

    try:
        session = data["session"]
        session_manager.update_activity(req.session_id)

        search_url = f"{settings.ERP_BASE_URL}/index.php?r=timetables/universitymasteracademictimetableview/individualstudenttimetableget"
        search_url += f"&UniversityMasterAcademicTimetableView%5Bacademicyear%5D={req.academic_year}"
        search_url += f"&UniversityMasterAcademicTimetableView%5Bsemesterid%5D={req.semester_id}"

        resp = session.get(search_url, timeout=20, verify=False)

        # Extract all tables from the page
        tables = extract_tables(resp.text)

        return {
            "success": True,
            "tables": tables,
            "count": len(tables),
            "page_title": _extract_page_title(resp.text),
        }
    except Exception as e:
        logger.exception("Error fetching timetable")
        raise HTTPException(status_code=500, detail=str(e))


def _extract_page_title(html: str) -> str:
    """Extract page title from HTML."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    title = soup.find("title")
    return title.get_text(strip=True) if title else ""


class ParseTableRequest(BaseModel):
    table_html: str


@router.post("/parse-table")
def parse_table(req: ParseTableRequest):
    """Parse a specific table (selected by user) into structured timetable entries."""
    try:
        entries = parse_selected_table(req.table_html)
        return {
            "success": True,
            "entries": entries,
            "count": len(entries),
        }
    except Exception as e:
        logger.exception("Error parsing table")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fetch-raw")
def fetch_raw(req: FetchDataRequest):
    """Fetch raw HTML from any ERP page (for authenticated sessions)."""
    data = session_manager.get_session(req.session_id)
    if not data:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    if not data.get("authenticated"):
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        session = data["session"]
        session_manager.update_activity(req.session_id)

        url = req.endpoint
        if not url:
            raise HTTPException(status_code=400, detail="endpoint required")
        if url.startswith("/"):
            url = f"{settings.ERP_BASE_URL}{url}"

        resp = session.get(url, timeout=15, verify=False)
        return {
            "success": True,
            "data": resp.text,
            "status_code": resp.status_code,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error fetching raw data")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/logout")
def erp_logout(req: LogoutRequest):
    """Logout from ERP and clean up session."""
    data = session_manager.get_session(req.session_id)
    if data:
        try:
            data["session"].get(settings.ERP_LOGOUT_URL, timeout=5, verify=False)
        except Exception:
            pass
        session_manager.remove_session(req.session_id)

    return {"success": True, "message": "ERP session ended"}
