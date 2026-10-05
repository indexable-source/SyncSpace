import os
import secrets
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path)

if not os.getenv("SECRET_KEY"):
    new_key = secrets.token_urlsafe(32)
    with open(env_path, "a") as f:
        f.write(f"\nSECRET_KEY={new_key}\n")
    os.environ["SECRET_KEY"] = new_key

class Settings:
    PROJECT_NAME: str = "Group Schedule Synchronizer"
    VERSION: str = "1.0.0"
    
    SECRET_KEY: str = os.environ["SECRET_KEY"]
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./schedule_sync.db")
    
    # KL University ERP
    ERP_BASE_URL: str = "https://newerp.kluniversity.in"
    ERP_LOGIN_URL: str = f"{ERP_BASE_URL}/index.php?r=site%2Flogin"
    ERP_CAPTCHA_URL: str = f"{ERP_BASE_URL}/index.php?r=site%2Fcaptcha"
    ERP_LOGOUT_URL: str = f"{ERP_BASE_URL}/index.php?r=site%2Flogout"
    ERP_TIMETABLE_URL: str = f"{ERP_BASE_URL}/index.php?r=timetables%2Funiversitymasteracademictimetableview%2Findexstudentindisearch"
    ERP_SESSION_TIMEOUT: int = 3600  # 1 hour
    
    # CORS — set CORS_ORIGINS env var as comma-separated URLs for production
    CORS_ORIGINS: list = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000"
        ).split(",")
    ]
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"

settings = Settings()
