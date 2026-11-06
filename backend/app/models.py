"""SQLAlchemy 数据模型。"""
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    name: Mapped[str] = mapped_column(String(64))
    role: Mapped[str] = mapped_column(String(16), default="student")  # admin/teacher/student
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str | None] = mapped_column(Text, default=None)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    # 成绩构成：平时作业占比（考试占比 = 1 - 该值）
    assignment_weight: Mapped[float] = mapped_column(Float, default=0.4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    teacher: Mapped[User] = relationship()


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("course_id", "student_id", name="uq_enroll"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)


class Question(Base):
    """题库。content 为 JSON：
    single_choice/multi_choice: {stem, options: [..], answer: [index,..]}
    true_false: {stem, answer: bool}
    fill_blank: {stem, answers: [可接受答案,..]}
    short_answer: {stem, reference, rubric}
    """

    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    type: Mapped[str] = mapped_column(String(32))
    difficulty: Mapped[int] = mapped_column(Integer, default=3)  # 1-5
    knowledge_point: Mapped[str | None] = mapped_column(String(128), default=None)
    content: Mapped[dict] = mapped_column(JSON)
    source: Mapped[str] = mapped_column(String(16), default="manual")  # manual/ai
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Exam(Base):
    """试卷 / 课后作业（用 kind 区分）。"""

    __tablename__ = "exams"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    title: Mapped[str] = mapped_column(String(128))
    kind: Mapped[str] = mapped_column(String(16))  # exam/assignment
    status: Mapped[str] = mapped_column(String(16), default="draft")  # draft/published/closed
    duration_minutes: Mapped[int | None] = mapped_column(Integer, default=None)  # 考试限时
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    questions: Mapped[list["ExamQuestion"]] = relationship(
        back_populates="exam", cascade="all, delete-orphan", order_by="ExamQuestion.seq"
    )


class ExamQuestion(Base):
    __tablename__ = "exam_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"), index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"), index=True)
    score: Mapped[float] = mapped_column(Float, default=0)
    seq: Mapped[int] = mapped_column(Integer, default=0)

    exam: Mapped[Exam] = relationship(back_populates="questions")
    question: Mapped[Question] = relationship()


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (UniqueConstraint("exam_id", "student_id", name="uq_submission"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="in_progress")
    # in_progress / submitted / graded
    answers: Mapped[dict] = mapped_column(JSON, default=dict)  # {question_id(str): answer}
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    total_score: Mapped[float | None] = mapped_column(Float, default=None)

    exam: Mapped[Exam] = relationship()
    student: Mapped[User] = relationship()
    gradings: Mapped[list["Grading"]] = relationship(back_populates="submission")


class Grading(Base):
    """每道小题的批阅记录（AI 给初步结果，教师可复核覆盖）。"""

    __tablename__ = "gradings"
    __table_args__ = (UniqueConstraint("submission_id", "question_id", name="uq_grading"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id"), index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"))
    score: Mapped[float | None] = mapped_column(Float, default=None)
    max_score: Mapped[float] = mapped_column(Float, default=0)
    feedback: Mapped[str | None] = mapped_column(Text, default=None)
    graded_by: Mapped[str] = mapped_column(String(16), default="pending")  # pending/auto/ai/teacher
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), default=None)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    submission: Mapped[Submission] = relationship(back_populates="gradings")


class AiTask(Base):
    """异步 AI 任务（出题 / 批阅）。开发版使用进程内线程执行，可平滑迁移到 Celery。"""

    __tablename__ = "ai_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(32))  # generate_exam / grade_submission
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending/running/success/failed
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict | None] = mapped_column(JSON, default=None)
    error: Mapped[str | None] = mapped_column(Text, default=None)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), default=None)
    action: Mapped[str] = mapped_column(String(64))
    target: Mapped[str | None] = mapped_column(String(128), default=None)
    detail: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
