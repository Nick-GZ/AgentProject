"""异步 AI 任务层：出题、批阅。

开发版用进程内线程执行（零外部依赖）；任务状态持久化在 ai_tasks 表，
生产环境可将 run_task 替换为 Celery 任务，接口保持不变。
"""
import threading
from datetime import timezone

from . import llm
from .database import SessionLocal
from .models import AiTask, Course, Exam, ExamQuestion, Grading, Question, Submission


def create_task(db, type_: str, params: dict, user_id: int | None) -> AiTask:
    task = AiTask(type=type_, params=params, created_by=user_id)
    db.add(task)
    db.commit()
    db.refresh(task)
    threading.Thread(target=_run_task_safe, args=(task.id,), daemon=True).start()
    return task


def _run_task_safe(task_id: int) -> None:
    db = SessionLocal()
    try:
        task = db.get(AiTask, task_id)
        if task is None:
            return
        task.status = "running"
        db.commit()
        if task.type == "generate_exam":
            result = _generate_exam(db, task)
        elif task.type == "grade_submission":
            result = _grade_submission(db, task)
        else:
            raise ValueError(f"未知任务类型：{task.type}")
        task.status = "success"
        task.result = result
    except Exception as exc:  # noqa: BLE001 —— 任务内任何异常都要落库
        db.rollback()
        task = db.get(AiTask, task_id)
        if task is not None:
            task.status = "failed"
            task.error = str(exc)[:2000]
    finally:
        try:
            if task is not None:
                task.finished_at = __import__("datetime").datetime.now(timezone.utc)
            db.commit()
        finally:
            db.close()


# ================= AI 出卷 =================

def _generate_exam(db, task: AiTask) -> dict:
    p = task.params
    course = db.get(Course, p["course_id"])
    if course is None:
        raise ValueError("课程不存在")

    mode = llm.llm_mode()
    raw_questions = llm.generate_questions(course.name, p.get("knowledge_points"), p["specs"])

    scores = p.get("scores", {})
    exam = Exam(
        course_id=course.id,
        title=p["title"],
        kind=p.get("kind", "exam"),
        status="draft",
        duration_minutes=p.get("duration_minutes"),
        created_by=task.created_by,
    )
    db.add(exam)
    db.flush()

    valid_types = {"single_choice", "multi_choice", "true_false", "fill_blank", "short_answer"}
    created = 0
    for q in raw_questions:
        if not isinstance(q, dict) or q.get("type") not in valid_types or not isinstance(q.get("content"), dict):
            continue
        if "stem" not in q["content"]:
            continue
        question = Question(
            course_id=course.id,
            type=q["type"],
            difficulty=int(q.get("difficulty", 3)),
            knowledge_point=q.get("knowledge_point"),
            content=q["content"],
            source="ai",
            created_by=task.created_by,
        )
        db.add(question)
        db.flush()
        db.add(
            ExamQuestion(
                exam_id=exam.id,
                question_id=question.id,
                score=float(scores.get(q["type"], 5)),
                seq=created,
            )
        )
        created += 1

    db.commit()
    return {"exam_id": exam.id, "question_count": created, "llm_mode": mode}


# ================= AI 批阅 =================

def _grade_submission(db, task: AiTask) -> dict:
    submission = db.get(Submission, task.params["submission_id"])
    if submission is None:
        raise ValueError("答卷不存在")
    if submission.status == "in_progress":
        raise ValueError("答卷尚未提交")

    mode = llm.llm_mode()
    graded_count = 0
    for grading in submission.gradings:
        if grading.score is not None:
            continue  # 已判分（客观题或已人工批阅）
        question = db.get(Question, grading.question_id)
        if question is None:
            continue
        student_answer = submission.answers.get(str(question.id))
        if question.type == "short_answer":
            result = llm.grade_subjective(question.content or {}, str(student_answer or ""), grading.max_score)
            grading.score = float(result["score"])
            grading.feedback = result.get("feedback", "")
        else:
            # 理论上客观题交卷时已判分，这里是兜底
            from .services import grade_objective

            score, feedback = grade_objective(question, student_answer, grading.max_score)
            grading.score = score
            grading.feedback = feedback
        grading.graded_by = "ai"
        graded_count += 1
    db.commit()

    from .services import recompute_total

    all_done = recompute_total(db, submission)
    return {"graded_count": graded_count, "all_done": all_done, "llm_mode": mode}
