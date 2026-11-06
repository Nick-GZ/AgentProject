"""试卷/作业路由：创建、编辑、发布、学生取卷。"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..database import get_db
from ..models import Enrollment, Exam, ExamQuestion, Question, Submission, User
from ..schemas import ExamCreate, ExamOut, ExamUpdate
from ..services import exam_total, record_audit, strip_answer
from .courses import assert_course_teacher, get_course_or_404

router = APIRouter(prefix="/api", tags=["exams"])


def get_exam_or_404(db: Session, exam_id: int) -> Exam:
    exam = db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="试卷不存在")
    return exam


def _exam_out(db: Session, exam: Exam, user: User | None = None) -> dict:
    out = ExamOut(
        id=exam.id,
        course_id=exam.course_id,
        title=exam.title,
        kind=exam.kind,
        status=exam.status,
        duration_minutes=exam.duration_minutes,
        deadline=exam.deadline,
        total_score=exam_total(db, exam),
        question_count=len(exam.questions),
        created_at=exam.created_at,
        published_at=exam.published_at,
    )
    if user is not None and user.role == "student":
        sub = db.scalar(
            select(Submission).where(Submission.exam_id == exam.id, Submission.student_id == user.id)
        )
        if sub:
            out.my_submission_status = sub.status
            out.my_total_score = sub.total_score if sub.status == "graded" else None
    return out.model_dump()


@router.post("/courses/{course_id}/exams", response_model=ExamOut)
def create_exam(course_id: int, body: ExamCreate, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    course = get_course_or_404(db, course_id)
    assert_course_teacher(course, user)
    exam = Exam(
        course_id=course.id,
        title=body.title,
        kind=body.kind,
        duration_minutes=body.duration_minutes,
        deadline=body.deadline,
        created_by=user.id,
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return _exam_out(db, exam)


@router.get("/courses/{course_id}/exams")
def list_exams(course_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    course = get_course_or_404(db, course_id)
    stmt = select(Exam).where(Exam.course_id == course.id).order_by(Exam.id)
    if user.role == "student":
        enrolled = db.scalar(
            select(Enrollment).where(Enrollment.course_id == course.id, Enrollment.student_id == user.id)
        )
        if not enrolled:
            raise HTTPException(status_code=403, detail="未选修该课程")
        stmt = stmt.where(Exam.status.in_(["published", "closed"]))
        out_user = user
    else:
        assert_course_teacher(course, user)
        out_user = None
    return [_exam_out(db, e, out_user) for e in db.scalars(stmt).all()]


@router.get("/exams/{exam_id}")
def get_exam(exam_id: int, include_answers: bool = True, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    exam = get_exam_or_404(db, exam_id)
    assert_course_teacher(get_course_or_404(db, exam.course_id), user)
    questions = []
    for eq in exam.questions:
        q = db.get(Question, eq.question_id)
        if q is None:
            continue
        questions.append(
            {
                "exam_question_id": eq.id,
                "question_id": q.id,
                "seq": eq.seq,
                "score": eq.score,
                "type": q.type,
                "difficulty": q.difficulty,
                "knowledge_point": q.knowledge_point,
                "content": q.content if include_answers else strip_answer(q.content or {}),
                "source": q.source,
            }
        )
    return {**_exam_out(db, exam), "questions": questions}


@router.put("/exams/{exam_id}", response_model=ExamOut)
def update_exam(exam_id: int, body: ExamUpdate, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    exam = get_exam_or_404(db, exam_id)
    assert_course_teacher(get_course_or_404(db, exam.course_id), user)
    if exam.status != "draft":
        raise HTTPException(status_code=400, detail="只能编辑草稿状态的试卷；如需修改请先关闭该试卷并新建")
    if body.title is not None:
        exam.title = body.title
    if body.duration_minutes is not None:
        exam.duration_minutes = body.duration_minutes
    if body.deadline is not None:
        exam.deadline = body.deadline
    if body.items is not None:
        for eq in list(exam.questions):
            db.delete(eq)
        db.flush()
        for seq, item in enumerate(body.items):
            q = db.get(Question, item.question_id)
            if q is None or q.course_id != exam.course_id:
                raise HTTPException(status_code=400, detail=f"题目 {item.question_id} 不属于该课程")
            db.add(ExamQuestion(exam_id=exam.id, question_id=item.question_id, score=item.score, seq=seq))
    db.commit()
    db.refresh(exam)
    return _exam_out(db, exam)


def _publish_or_close(exam_id: int, db: Session, user: User, target: str):
    exam = get_exam_or_404(db, exam_id)
    assert_course_teacher(get_course_or_404(db, exam.course_id), user)
    if target == "published":
        if exam.status != "draft":
            raise HTTPException(status_code=400, detail="只有草稿试卷可以发布")
        if not exam.questions:
            raise HTTPException(status_code=400, detail="试卷没有题目，无法发布")
        exam.status = "published"
        exam.published_at = datetime.now(timezone.utc)
        record_audit(db, user.id, "publish_exam", f"exam:{exam.id}", exam.title)
    else:
        if exam.status != "published":
            raise HTTPException(status_code=400, detail="只有已发布的试卷可以关闭")
        exam.status = "closed"
        record_audit(db, user.id, "close_exam", f"exam:{exam.id}", exam.title)
    db.commit()
    return _exam_out(db, exam)


@router.post("/exams/{exam_id}/publish", response_model=ExamOut)
def publish_exam(exam_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    return _publish_or_close(exam_id, db, user, "published")


@router.post("/exams/{exam_id}/close", response_model=ExamOut)
def close_exam(exam_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    return _publish_or_close(exam_id, db, user, "closed")


@router.delete("/exams/{exam_id}")
def delete_exam(exam_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    exam = get_exam_or_404(db, exam_id)
    assert_course_teacher(get_course_or_404(db, exam.course_id), user)
    if exam.status != "draft":
        raise HTTPException(status_code=400, detail="只能删除草稿试卷")
    db.delete(exam)
    db.commit()
    return {"ok": True}


# ---------- 学生取卷 ----------

@router.get("/exams/{exam_id}/paper")
def get_paper(exam_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "student":
        raise HTTPException(status_code=403, detail="仅学生可取卷")
    exam = get_exam_or_404(db, exam_id)
    if exam.status != "published":
        raise HTTPException(status_code=400, detail="试卷未开放")
    enrolled = db.scalar(
        select(Enrollment).where(Enrollment.course_id == exam.course_id, Enrollment.student_id == user.id)
    )
    if not enrolled:
        raise HTTPException(status_code=403, detail="未选修该课程")

    sub = db.scalar(select(Submission).where(Submission.exam_id == exam.id, Submission.student_id == user.id))
    if sub and sub.status != "in_progress":
        raise HTTPException(status_code=400, detail="你已提交过该试卷")
    if sub is None:
        sub = Submission(exam_id=exam.id, student_id=user.id, answers={})
        db.add(sub)
        db.commit()
        db.refresh(sub)

    questions = []
    for eq in exam.questions:
        q = db.get(Question, eq.question_id)
        if q is None:
            continue
        questions.append(
            {
                "question_id": q.id,
                "seq": eq.seq,
                "score": eq.score,
                "type": q.type,
                "content": strip_answer(q.content or {}),
            }
        )
    now = datetime.now(timezone.utc)
    return {
        "exam": _exam_out(db, exam),
        "submission_id": sub.id,
        "started_at": sub.started_at,
        "answers": sub.answers,
        "questions": questions,
        "server_now": now,
        "submitted": sub.status != "in_progress",
    }
