"""答卷路由：学生保存进度/交卷，教师查看、AI 批阅、人工复核。"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai_service import create_task
from ..auth import get_current_user, require_roles
from ..database import get_db
from ..models import Enrollment, Exam, Grading, Question, Submission, User
from ..schemas import GradingUpdate, ProgressIn, SubmitIn
from ..services import finalize_submission, process_submission, recompute_total, record_audit, strip_answer
from .courses import assert_course_teacher, get_course_or_404
from .exams import get_exam_or_404

router = APIRouter(prefix="/api", tags=["submissions"])


def _get_my_submission(db: Session, exam: Exam, user: User) -> Submission:
    sub = db.scalar(select(Submission).where(Submission.exam_id == exam.id, Submission.student_id == user.id))
    if sub is None:
        raise HTTPException(status_code=404, detail="尚未开始作答")
    return sub


def _assert_exam_open(exam: Exam, sub: Submission | None = None) -> None:
    if exam.status != "published":
        raise HTTPException(status_code=400, detail="试卷未开放作答")


def _check_deadline(exam: Exam, sub: Submission) -> None:
    now = datetime.now(timezone.utc)
    # 作业按截止时间判定；考试按时长判定（留 2 分钟宽限）
    if exam.kind == "assignment" and exam.deadline:
        if now > exam.deadline:
            raise HTTPException(status_code=400, detail="已超过作业截止时间")
    elif exam.kind == "exam" and exam.duration_minutes:
        end = sub.started_at + timedelta(minutes=exam.duration_minutes) + timedelta(minutes=2)
        if now > end:
            raise HTTPException(status_code=400, detail="考试时间已到，无法再提交")


@router.put("/exams/{exam_id}/progress")
def save_progress(exam_id: int, body: ProgressIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "student":
        raise HTTPException(status_code=400, detail="仅学生可作答")
    exam = get_exam_or_404(db, exam_id)
    _assert_exam_open(exam)
    sub = _get_my_submission(db, exam, user)
    if sub.status != "in_progress":
        raise HTTPException(status_code=400, detail="已提交，无法修改")
    sub.answers = {**sub.answers, **body.answers}
    db.commit()
    return {"ok": True, "submission_id": sub.id}


@router.post("/exams/{exam_id}/submit")
def submit(exam_id: int, body: SubmitIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "student":
        raise HTTPException(status_code=400, detail="仅学生可交卷")
    exam = get_exam_or_404(db, exam_id)
    _assert_exam_open(exam)
    sub = _get_my_submission(db, exam, user)
    if sub.status != "in_progress":
        raise HTTPException(status_code=400, detail="已提交过该试卷")
    _check_deadline(exam, sub)
    if body.answers is not None:
        sub.answers = body.answers
    sub.status = "submitted"
    sub.submitted_at = datetime.now(timezone.utc)
    db.commit()
    process_submission(db, sub, exam)  # 客观题立即判分
    db.refresh(sub)
    record_audit(db, user.id, "submit", f"exam:{exam.id}", f"submission:{sub.id}")
    return {"ok": True, "submission_id": sub.id, "status": sub.status, "objective_done": recompute_total(db, sub)}


@router.get("/exams/{exam_id}/submissions")
def list_submissions(exam_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    exam = get_exam_or_404(db, exam_id)
    assert_course_teacher(get_course_or_404(db, exam.course_id), user)
    subs = db.scalars(
        select(Submission).where(Submission.exam_id == exam.id).order_by(Submission.student_id)
    ).all()
    graded = {g.submission_id for s in subs for g in s.gradings if g.score is not None}
    return [
        {
            "id": s.id,
            "student_id": s.student_id,
            "student_name": s.student.name,
            "status": s.status,
            "total_score": s.total_score,
            "submitted_at": s.submitted_at,
            "pending_gradings": sum(1 for g in s.gradings if g.score is None),
        }
        for s in subs
    ]


@router.get("/submissions/mine")
def my_submissions(course_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    stmt = select(Submission).where(Submission.student_id == user.id)
    if course_id:
        stmt = stmt.join(Exam, Exam.id == Submission.exam_id).where(Exam.course_id == course_id)
    subs = db.scalars(stmt.order_by(Submission.id)).all()
    return [
        {
            "id": s.id,
            "exam_id": s.exam_id,
            "exam_title": s.exam.title,
            "kind": s.exam.kind,
            "status": s.status,
            "total_score": s.total_score,
            "submitted_at": s.submitted_at,
        }
        for s in subs
    ]


def _submission_detail(db: Session, submission: Submission, user: User) -> dict:
    is_teacher = user.role in ("teacher", "admin")
    if not is_teacher and submission.student_id != user.id:
        raise HTTPException(status_code=403, detail="无权查看该答卷")
    if not is_teacher and submission.status == "in_progress":
        raise HTTPException(status_code=400, detail="答卷尚未提交")
    exam = submission.exam
    if is_teacher:
        # 教师视角需校验课程归属
        assert_course_teacher(get_course_or_404(db, exam.course_id), user)

    items = []
    for eq in exam.questions:
        q = db.get(Question, eq.question_id)
        if q is None:
            continue
        grading = db.scalar(select(Grading).where(Grading.submission_id == submission.id, Grading.question_id == q.id))
        items.append(
            {
                "question_id": q.id,
                "seq": eq.seq,
                "score_full": eq.score,
                "type": q.type,
                # 教师可见完整答案与参考；学生交卷后可见批改结果（不含他人答案，本身就是自己的）
                "content": q.content if is_teacher else strip_answer(q.content or {}),
                "reference": (q.content or {}).get("reference") if is_teacher else None,
                "rubric": (q.content or {}).get("rubric") if is_teacher else None,
                "student_answer": submission.answers.get(str(q.id)),
                "grading": {
                    "id": grading.id,
                    "score": grading.score,
                    "max_score": grading.max_score,
                    "feedback": grading.feedback,
                    "graded_by": grading.graded_by,
                    "reviewed": grading.reviewed_by is not None,
                }
                if grading
                else None,
            }
        )
    return {
        "id": submission.id,
        "exam_id": exam.id,
        "exam_title": exam.title,
        "kind": exam.kind,
        "status": submission.status,
        "total_score": submission.total_score,
        "student_id": submission.student_id,
        "student_name": submission.student.name if is_teacher else None,
        "submitted_at": submission.submitted_at,
        "started_at": submission.started_at,
        "items": items,
    }


@router.get("/submissions/{submission_id}")
def get_submission(submission_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    sub = db.get(Submission, submission_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="答卷不存在")
    return _submission_detail(db, sub, user)


@router.post("/submissions/{submission_id}/grade-ai")
def grade_with_ai(submission_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    sub = db.get(Submission, submission_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="答卷不存在")
    assert_course_teacher(get_course_or_404(db, sub.exam.course_id), user)
    if sub.status == "in_progress":
        raise HTTPException(status_code=400, detail="答卷尚未提交")
    task = create_task(db, "grade_submission", {"submission_id": sub.id}, user.id)
    return {"task_id": task.id}


@router.put("/gradings/{grading_id}")
def update_grading(grading_id: int, body: GradingUpdate, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    grading = db.get(Grading, grading_id)
    if grading is None:
        raise HTTPException(status_code=404, detail="批阅记录不存在")
    sub = db.get(Submission, grading.submission_id)
    assert_course_teacher(get_course_or_404(db, sub.exam.course_id), user)
    old = grading.score
    grading.score = body.score
    grading.feedback = body.feedback
    grading.graded_by = "teacher"
    grading.reviewed_by = user.id
    db.commit()
    recompute_total(db, sub)
    record_audit(db, user.id, "regrade", f"grading:{grading.id}", f"{old} -> {body.score}")
    return {"ok": True, "total_score": sub.total_score, "status": sub.status}


@router.post("/submissions/{submission_id}/finalize")
def finalize(submission_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    sub = db.get(Submission, submission_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="答卷不存在")
    assert_course_teacher(get_course_or_404(db, sub.exam.course_id), user)
    finalize_submission(db, sub)
    record_audit(db, user.id, "finalize", f"submission:{sub.id}", f"total={sub.total_score}")
    return {"ok": True, "total_score": sub.total_score, "status": sub.status}