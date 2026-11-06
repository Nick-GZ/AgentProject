"""AI 能力路由：生成试卷、任务查询、运行模式。"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import llm
from ..ai_service import create_task
from ..auth import require_roles
from ..database import get_db
from ..models import AiTask, Course, User
from ..schemas import AiGenerateIn, AiTaskOut
from .courses import assert_course_teacher, get_course_or_404

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/status")
def ai_status(_: User = Depends(require_roles("teacher", "admin"))):
    from ..config import settings

    return {"mode": llm.llm_mode(), "model": settings.llm_model}


@router.post("/generate", response_model=AiTaskOut)
def generate_exam(body: AiGenerateIn, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    course = get_course_or_404(db, body.course_id)
    assert_course_teacher(course, user)
    params = {
        "course_id": body.course_id,
        "title": body.title,
        "kind": body.kind,
        "knowledge_points": body.knowledge_points,
        "specs": [s.model_dump() for s in body.specs],
        "scores": body.scores,
    }
    task = create_task(db, "generate_exam", params, user.id)
    return task


@router.get("/tasks/{task_id}", response_model=AiTaskOut)
def get_task(task_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    task = db.get(AiTask, task_id)
    if task is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="任务不存在")
    if user.role != "admin" and task.created_by != user.id:
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail="无权查看该任务")
    return task