"""题库路由：教师维护课程题目（手动增删改）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_roles
from ..database import get_db
from ..models import ExamQuestion, Question, User
from ..schemas import QuestionIn, QuestionOut
from ..services import validate_question_content
from .courses import assert_course_teacher, get_course_or_404

router = APIRouter(prefix="/api", tags=["questions"])


@router.get("/courses/{course_id}/questions", response_model=list[QuestionOut])
def list_questions(course_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    course = get_course_or_404(db, course_id)
    assert_course_teacher(course, user)
    return db.scalars(select(Question).where(Question.course_id == course.id).order_by(Question.id)).all()


@router.post("/courses/{course_id}/questions", response_model=QuestionOut)
def create_question(course_id: int, body: QuestionIn, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    course = get_course_or_404(db, course_id)
    assert_course_teacher(course, user)
    validate_question_content(body.type, body.content)
    q = Question(
        course_id=course.id,
        type=body.type,
        difficulty=body.difficulty,
        knowledge_point=body.knowledge_point,
        content=body.content,
        source="manual",
        created_by=user.id,
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


def _get_question_checked(db: Session, question_id: int, user: User) -> Question:
    q = db.get(Question, question_id)
    if q is None:
        raise HTTPException(status_code=404, detail="题目不存在")
    course = get_course_or_404(db, q.course_id)
    assert_course_teacher(course, user)
    return q


@router.put("/questions/{question_id}", response_model=QuestionOut)
def update_question(question_id: int, body: QuestionIn, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    q = _get_question_checked(db, question_id, user)
    validate_question_content(body.type, body.content)
    q.type = body.type
    q.difficulty = body.difficulty
    q.knowledge_point = body.knowledge_point
    q.content = body.content
    db.commit()
    db.refresh(q)
    return q


@router.delete("/questions/{question_id}")
def delete_question(question_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    q = _get_question_checked(db, question_id, user)
    used = db.scalar(select(ExamQuestion).where(ExamQuestion.question_id == q.id))
    if used:
        raise HTTPException(status_code=409, detail="该题目已被试卷引用，请先从试卷中移除")
    db.delete(q)
    db.commit()
    return {"ok": True}
