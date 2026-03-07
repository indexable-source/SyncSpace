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
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from config import settings
from app.database import get_db
from app.models import User
from app.auth.utils import get_current_user
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
    except (requests.ConnectionError, requests.Timeout) as e:
        logger.error(f"Cannot reach ERP server: {e}")
        raise HTTPException(status_code=503, detail="University ERP server is currently unreachable. Please check your internet connection or try again later.")
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

        # Yii2 captcha refresh: request with refresh=1 returns JSON with the new image URL
        captcha_url = f"{settings.ERP_CAPTCHA_URL}&refresh=1&v={uuid.uuid4().hex}"
        captcha_resp = session.get(captcha_url, timeout=10, verify=False)
        captcha_resp.raise_for_status()

        content_type = captcha_resp.headers.get("Content-Type", "")

        # Case 1: Direct image response
        if "image" in content_type and len(captcha_resp.content) > 100:
            captcha_b64 = base64.b64encode(captcha_resp.content).decode("utf-8")
            return {
                "success": True,
                "captcha_image": f"data:{content_type};base64,{captcha_b64}",
            }

        # Case 2: Yii2 JSON response — contains {"hash1":..., "hash2":..., "url":"..."}
        if "json" in content_type:
            try:
                json_data = captcha_resp.json()
                logger.info(f"Captcha refresh returned JSON: {list(json_data.keys())}")
                image_url = json_data.get("url", "")

                if image_url:
                    # The URL from Yii can be relative or absolute
                    if image_url.startswith("/"):
                        image_url = f"{settings.ERP_BASE_URL}{image_url}"
                    elif not image_url.startswith("http"):
                        image_url = f"{settings.ERP_BASE_URL}/{image_url}"

                    # Fetch the actual captcha image from the URL
                    img_resp = session.get(image_url, timeout=10, verify=False)
                    img_resp.raise_for_status()
                    img_content_type = img_resp.headers.get("Content-Type", "image/png")

                    if len(img_resp.content) > 100:
                        captcha_b64 = base64.b64encode(img_resp.content).decode("utf-8")
                        return {
                            "success": True,
                            "captcha_image": f"data:{img_content_type};base64,{captcha_b64}",
                        }
                    else:
                        logger.warning(f"Image from JSON url was too small ({len(img_resp.content)} bytes)")
                else:
                    logger.warning(f"Captcha JSON response had no 'url' field: {json_data}")

                    # Fallback: fetch captcha directly without refresh param
                    fallback_url = f"{settings.ERP_CAPTCHA_URL}&v={uuid.uuid4().hex}"
                    fb_resp = session.get(fallback_url, timeout=10, verify=False)
                    fb_resp.raise_for_status()
                    fb_ct = fb_resp.headers.get("Content-Type", "image/png")
                    if "image" in fb_ct and len(fb_resp.content) > 100:
                        captcha_b64 = base64.b64encode(fb_resp.content).decode("utf-8")
                        return {
                            "success": True,
                            "captcha_image": f"data:{fb_ct};base64,{captcha_b64}",
                        }

            except Exception as json_err:
                logger.warning(f"Failed to parse captcha JSON response: {json_err}")

        # Fallback: try fetching captcha directly (no refresh param)
        logger.info("Attempting direct captcha fetch as final fallback")
        direct_url = f"{settings.ERP_CAPTCHA_URL}&v={uuid.uuid4().hex}"
        direct_resp = session.get(direct_url, timeout=10, verify=False)
        direct_resp.raise_for_status()
        direct_ct = direct_resp.headers.get("Content-Type", "image/png")

        if "image" in direct_ct and len(direct_resp.content) > 100:
            captcha_b64 = base64.b64encode(direct_resp.content).decode("utf-8")
            return {
                "success": True,
                "captcha_image": f"data:{direct_ct};base64,{captcha_b64}",
            }

        raise HTTPException(status_code=502, detail="ERP returned invalid captcha image")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error refreshing captcha")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/complete-login")
def complete_login(
    req: CompleteLoginRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Complete ERP login with username, password, and captcha, then link the roll number."""
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
            
            # Auto-link the ERP Roll Number to the User
            roll = req.username.strip().upper()
            
            # Check if this roll number is already linked to ANOTHER account
            existing = db.query(User).filter(
                User.erp_roll_number == roll,
                User.id != current_user.id,
            ).first()
            
            if existing:
                # If someone else synced it, we must raise a 409 conflict.
                raise HTTPException(status_code=409, detail="This ERP Roll Number is already linked to another SyncSpace account.")
            
            # If valid and not conflicting, link it
            current_user.erp_roll_number = roll
            db.commit()

            return {"success": True, "message": "ERP login successful and linked", "session_id": req.session_id}
        else:
            # Try to extract error messages
            soup = BeautifulSoup(login_resp.text, "html.parser")
            errors = [
                e.get_text(strip=True)
                for e in soup.find_all(["div", "p"], class_=lambda x: x and any(k in x.lower() for k in ("error", "danger")))
            ]
            error_msg = " | ".join(errors) if errors else "Login failed — check credentials or captcha"
            return {"success": False, "error": error_msg, "retry": True}

    except HTTPException:
        raise
    except (requests.ConnectionError, requests.Timeout) as e:
        logger.error(f"Cannot reach ERP server: {e}")
        raise HTTPException(status_code=503, detail="University ERP server is currently unreachable. Please check your internet connection or try again later.")
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
    except HTTPException:
        raise
    except (requests.ConnectionError, requests.Timeout) as e:
        logger.error(f"Cannot reach ERP server: {e}")
        raise HTTPException(status_code=503, detail="University ERP server is currently unreachable. Please check your internet connection or try again later.")
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
    except HTTPException:
        raise
    except (requests.ConnectionError, requests.Timeout) as e:
        logger.error(f"Cannot reach ERP server: {e}")
        raise HTTPException(status_code=503, detail="University ERP server is currently unreachable. Please check your internet connection or try again later.")
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
    except (requests.ConnectionError, requests.Timeout) as e:
        logger.error(f"Cannot reach ERP server: {e}")
        raise HTTPException(status_code=503, detail="University ERP server is currently unreachable. Please check your internet connection or try again later.")
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
