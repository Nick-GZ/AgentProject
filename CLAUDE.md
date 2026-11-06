# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

AI 课程管理系统 (AI course/exam management): teachers use an LLM to generate exams and grade subjective answers; students take exams online; three roles (admin / teacher / student). Backend is FastAPI + SQLAlchemy 2 + SQLite (PostgreSQL-compatible), frontend is React 18 + TypeScript + Vite + Ant Design 5. Comments, UI copy, and error messages are in Chinese — keep new user-facing text consistent.

## Commands

Backend (run from `backend/`; `settings` loads `.env` from the current working directory and the default SQLite URL is relative, so all backend commands assume this CWD):

```powershell
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env
.venv\Scripts\python -m app.seed                                   # seed demo data (DESTRUCTIVE: deletes all rows)
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000  # API + /docs
```

End-to-end test (the only test suite; no pytest/lint config exists):

```powershell
cd backend
.venv\Scripts\python scripts\smoke.py   # linear 22-assertion run, exits on first failure
```

`scripts/smoke.py` sets `DATABASE_URL` to `backend/smoke_test.db` before importing the app and re-runs `seed()`, so it is safe for the dev DB but wipes `smoke_test.db` each run. There is no way to run a single assertion; comment out earlier sections when iterating.

Frontend (run from `frontend/`):

```powershell
npm install
npm run dev        # http://localhost:5173, proxies /api -> http://127.0.0.1:8000
npm run typecheck  # tsc --noEmit
npm run build
```

One-command startup from the repo root: `.\start.ps1` (creates the venv/node_modules if missing, starts uvicorn, then runs Vite).

## Backend architecture

Request path: `app/main.py` mounts all routers under `/api` (except `courses.router`, whose own prefix is `/api/courses`). Each router validates auth inline, then delegates business logic to `services.py` / `ai_service.py`; SQLAlchemy models are in `models.py`, Pydantic I/O shapes in `schemas.py`.

- **Auth** (`auth.py`): Argon2 password hashing with a PBKDF2 fallback; JWT bearer token storing user id + role. `require_roles(*roles)` is the role-guard factory. Course-scoped authorization uses `assert_course_teacher(course, user)` from `routers/courses.py` — admins bypass, teachers must own the course. Any new course-scoped endpoint must call it; do not rely on the role guard alone.
- **Question content is untyped JSON** with a schema per `Question.type` (documented at the top of `Question` in `models.py`): `single_choice`/`multi_choice` use `{stem, options, answer}` (answer = option index / list of indices), `true_false` `{stem, answer: bool}`, `fill_blank` `{stem, answers: [...]}`, `short_answer` `{stem, reference, rubric}`. Manual creation validates via `validate_question_content`; AI output is only loosely filtered.
- **Answer hiding**: `services.strip_answer` removes `answer`/`answers`/`reference`/`rubric`. Student-facing responses (exam paper, own submission) must use it; teacher responses include the full content.
- **Submission lifecycle**: `GET /exams/{id}/paper` lazily creates the `Submission` (`started_at` starts the countdown). `PUT /exams/{id}/progress` autosaves only while `in_progress`. On `POST /exams/{id}/submit`, `services.process_submission` creates one `Grading` per exam question and auto-scores objective types; subjective ones stay `pending`. `services.recompute_total` sets `total_score` to the sum of available gradings and flips status to `graded` only when every grading has a score. `finalize_submission` forces ungraded items to 0.
- **AI trust boundary**: AI-generated exams are always created as `draft` (teacher must review/publish); AI grading only fills gradings with `score is None` and marks `graded_by="ai"`; a teacher edit (`PUT /gradings/{id}`) overwrites it and sets `reviewed_by`. Preserve this draft/pending behavior in any AI changes.
- **Grades** (`services.course_grade_rows`): per-exam percentage weighted by `course.assignment_weight` for assignments, `1 - weight` for exams; missing scores are excluded and the weights renormalized by `weight_sum`. Only `published`/`closed` exams count.
- **AI layer** (`llm.py`): `llm_mode()` returns `"real"` only when both the `anthropic` SDK and `ANTHROPIC_API_KEY` are present, otherwise `"mock"` — all flows must work in mock mode. `LLM_BASE_URL` supports Anthropic-compatible gateways; `_call_llm` passes `temperature` via `extra_body` because the installed Anthropic SDK rejects it at top level. Model output is forced through `_extract_json` (tolerates code fences/prefix text) and then field-checked by callers.
- **Async tasks** (`ai_service.py`): `create_task` inserts an `AiTask` row and starts a daemon thread that opens its own `SessionLocal` and writes status/result/error back; the client polls `GET /api/ai/tasks/{id}`. Keep this interface if migrating to Celery.

## Frontend architecture

- `src/api.ts` is the single HTTP layer: prefix `/api`, attaches `localStorage` bearer token, clears auth state and redirects on 401, and exports shared TS types/label maps used across pages. Add new endpoints and types here.
- `src/auth.tsx` holds auth state (persisted in `localStorage` as `token` + `user`); `src/App.tsx` defines all routes with `RequireAuth` / `RequireRole` guards and role-based redirects; `src/Layout.tsx` builds the role-specific nav menu.
- Pages are grouped by role: `pages/admin`, `pages/teacher`, `pages/student`; reusable question rendering/editing lives in `components/QuestionViews.tsx` and `components/QuestionForm.tsx`.

## Gotchas

- Running `python -m app.seed` against the default database deletes every row in every table before seeding — confirm before doing it.
- `Base.metadata.create_all` in the FastAPI lifespan creates missing tables but never migrates them; there is no Alembic setup, so schema changes require recreating the DB during development.
- Python 3.10+ is required (`str | None` syntax throughout).
- Exam timing: assignments are checked against `deadline`; exams against `started_at + duration_minutes` with a hard-coded 2-minute grace period.