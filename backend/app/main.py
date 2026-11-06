"""应用入口。开发模式运行：uvicorn app.main:app --reload --app-dir backend"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from .routers import admin, ai, auth_router, courses, exams, grades, questions, submissions


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (
    auth_router.router,
    admin.router,
    courses.router,
    questions.router,
    exams.router,
    submissions.router,
    grades.router,
    ai.router,
):
    app.include_router(r)


@app.get("/")
def health():
    return {"status": "ok", "app": settings.app_name}