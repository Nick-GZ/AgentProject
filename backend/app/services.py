"""业务引擎：题目校验、客观题判分、答卷处理、成绩汇总。"""
from datetime import timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Course, Enrollment, Exam, ExamQuestion, Grading, Question, Submission

REQUIRED_KEYS = {
    "single_choice": ("stem", "options", "answer"),
    "multi_choice": ("stem", "options", "answer"),
    "true_false": ("stem", "answer"),
    "fill_blank": ("stem", "answers"),
    "short_answer": ("stem",),
}
OBJECTIVE_TYPES = {"single_choice", "multi_choice", "true_false", "fill_blank"}


def validate_question_content(qtype: str, content: dict) -> None:
    for key in REQUIRED_KEYS.get(qtype, ("stem",)):
        if key not in content:
            raise HTTPException(status_code=422, detail=f"题目内容缺少字段：{key}")
    if qtype in ("single_choice", "multi_choice"):
        if not isinstance(content["options"], list) or len(content["options"]) < 2:
            raise HTTPException(status_code=422, detail="选择题至少需要 2 个选项")


def strip_answer(content: dict) -> dict:
    """给学生端看的题目内容：去掉答案/参考/评分标准。"""
    return {k: v for k, v in content.items() if k not in ("answer", "answers", "reference", "rubric")}


def _norm(s: str) -> str:
    return s.strip().lower()


def grade_objective(question: Question, answer, max_score: float) -> tuple[float, str]:
    """客观题程序化判分，返回 (得分, 反馈)。"""
    content = question.content or {}
    t = question.type
    if answer is None or answer == "" or answer == []:
        return 0.0, "未作答。"
    if t == "single_choice":
        ok = answer == content.get("answer")
        return (max_score if ok else 0.0), ("回答正确。" if ok else "回答错误。")
    if t == "multi_choice":
        try:
            ok = sorted(int(x) for x in answer) == sorted(int(x) for x in content.get("answer", []))
        except (TypeError, ValueError):
            ok = False
        return (max_score if ok else 0.0), ("回答正确。" if ok else "多选需完全匹配才得分。")
    if t == "true_false":
        ok = bool(answer) == bool(content.get("answer"))
        return (max_score if ok else 0.0), ("回答正确。" if ok else "回答错误。")
    if t == "fill_blank":
        accepted = [_norm(a) for a in content.get("answers", [])]
        ok = _norm(str(answer)) in accepted
        return (max_score if ok else 0.0), ("回答正确。" if ok else "与参考答案不一致。")
    raise ValueError(f"非客观题类型：{t}")


def process_submission(db: Session, submission: Submission, exam: Exam) -> None:
    """交卷后：为每题建立批阅记录，客观题立即判分。"""
    for eq in exam.questions:
        answer = submission.answers.get(str(eq.question_id))
        grading = Grading(submission_id=submission.id, question_id=eq.question_id, max_score=eq.score)
        if eq.question.type in OBJECTIVE_TYPES:
            score, feedback = grade_objective(eq.question, answer, eq.score)
            grading.score = score
            grading.feedback = feedback
            grading.graded_by = "auto"
        else:
            grading.graded_by = "pending"  # 等待 AI / 教师批阅
        db.add(grading)
    db.commit()
    recompute_total(db, submission)


def recompute_total(db: Session, submission: Submission) -> bool:
    """汇总分数；全部批完则置为 graded。返回是否全部完成。"""
    gradings = list(submission.gradings)
    if not gradings:
        return True
    done = all(g.score is not None for g in gradings)
    submission.total_score = sum(g.score or 0 for g in gradings)
    if done and submission.status == "submitted":
        submission.status = "graded"
    db.commit()
    return done


def finalize_submission(db: Session, submission: Submission) -> Submission:
    """教师强制定稿：未批题目按 0 分计，状态置为 graded。"""
    for g in submission.gradings:
        if g.score is None:
            g.score = 0.0
            g.feedback = (g.feedback or "") + "（教师定稿：未批阅部分按 0 分计）"
            g.graded_by = "teacher"
            g.reviewed_by = None
    submission.status = "graded"
    db.commit()
    recompute_total(db, submission)
    return submission


# ---------- 成绩计算 ----------

def course_grade_rows(db: Session, course: Course) -> list[dict]:
    """某课程的成绩表：每个学生一行，含各试卷得分与加权总评。"""
    students = db.scalars(
        select(Submission)
        .join(Exam, Exam.id == Submission.exam_id)
        .where(Exam.course_id == course.id, Exam.status.in_(["published", "closed"]))
    ).all()
    items = db.scalars(
        select(Exam).where(Exam.course_id == course.id, Exam.status.in_(["published", "closed"]))
    ).all()
    subs_by_student: dict[int, dict[int, Submission]] = {}
    for s in students:
        subs_by_student.setdefault(s.student_id, {})[s.exam_id] = s

    from .models import User

    rows = []
    enrolled = db.scalars(
        select(User).join(Enrollment, Enrollment.student_id == User.id).where(
            Enrollment.course_id == course.id
        )
    ).all()
    for stu in enrolled:
        detail, parts, weight_sum = [], [], 0.0
        for exam in items:
            sub = subs_by_student.get(stu.id, {}).get(exam.id)
            score = sub.total_score if (sub and sub.total_score is not None) else None
            pct = (score / exam_total(db, exam) * 100) if (score is not None and exam_total(db, exam)) else None
            weight = course.assignment_weight if exam.kind == "assignment" else (1 - course.assignment_weight)
            detail.append(
                {
                    "exam_id": exam.id,
                    "title": exam.title,
                    "kind": exam.kind,
                    "score": score,
                    "full_score": exam_total(db, exam),
                    "percentage": round(pct, 1) if pct is not None else None,
                }
            )
            if pct is not None:
                parts.append(pct * weight)
                weight_sum += weight
        final = round(sum(parts) / weight_sum, 1) if weight_sum else None
        rows.append({"student_id": stu.id, "student_name": stu.name, "items": detail, "final_score": final})
    return rows


def exam_total(db: Session, exam: Exam) -> float:
    total = db.scalar(select(func.sum(ExamQuestion.score)).where(ExamQuestion.exam_id == exam.id))
    return float(total or 0)


def record_audit(db: Session, user_id: int | None, action: str, target: str | None = None, detail: str | None = None) -> None:
    from .models import AuditLog

    db.add(AuditLog(user_id=user_id, action=action, target=target, detail=detail))
    db.commit()
