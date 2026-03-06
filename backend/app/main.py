"""
Group Schedule Synchronizer — FastAPI Backend
Entry point with app factory, CORS, global error handling, and request logging.
"""

import logging
import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from config import settings
from app.database import engine, Base

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s — %(name)s — %(levelname)s — %(message)s",
)
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Global exception handler — catch-all for unhandled errors
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled error on {request.method} {request.url}: {exc}")
        logger.error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "detail": "An internal server error occurred. Please try again later.",
                "error": str(exc) if settings.DEBUG else "Internal Server Error",
            },
        )

    # Request logging middleware
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        logger.info(f"→ {request.method} {request.url.path}")
        response = await call_next(request)
        logger.info(f"← {request.method} {request.url.path} [{response.status_code}]")
        return response

    # Create tables
    from app import models as db_models
    Base.metadata.create_all(bind=engine)

    # Auto-migration: add erp_roll_number column if missing
    from sqlalchemy import inspect as sa_inspect, text
    inspector = sa_inspect(engine)
    existing_cols = [c["name"] for c in inspector.get_columns("users")]
    if "erp_roll_number" not in existing_cols:
        with engine.connect() as conn:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN erp_roll_number VARCHAR(20)"
            ))
            conn.commit()
        logger.info("Migration: added erp_roll_number column to users table")

    # Register routers
    from app.auth.routes import router as auth_router
    from app.erp.routes import router as erp_router
    from app.schedules.routes import router as schedule_router
    from app.groups.routes import router as group_router
    from app.meetings.routes import router as meetings_router

    app.include_router(auth_router)
    app.include_router(erp_router)
    app.include_router(schedule_router)
    app.include_router(group_router)
    app.include_router(meetings_router)

    @app.get("/health")
    def health():
        return {"status": "healthy", "project": settings.PROJECT_NAME, "version": settings.VERSION}

    return app


app = create_app()

