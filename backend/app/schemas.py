"""Pydantic 请求/响应模型。"""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

RoleType = Literal["admin", "teacher", "student"]
QuestionType = Literal["single_choice", "multi_choice", "true_false", "fill_blank", "short_answer"]


# ---------- 认证 ----------
class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=64)


class LoginIn(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    name: str
    role: str

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class AdminUserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=64)
    role: RoleType = "student"


# ---------- 课程 ----------
class CourseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    assignment_weight: float = Field(default=0.4, ge=0, le=1)


class CourseOut(BaseModel):
    id: int
    name: str
    description: str | None
    teacher_id: int
    teacher_name: str | None = None
    assignment_weight: float
    student_count: int = 0
    is_enrolled: bool | None = None  # 对学生视角返回

    model_config = {"from_attributes": True}


class EnrollStudentIn(BaseModel):
    student_id: int


# ---------- 题库 ----------
class QuestionIn(BaseModel):
    type: QuestionType
    difficulty: int = Field(default=3, ge=1, le=5)
    knowledge_point: str | None = None
    content: dict[str, Any]


class QuestionOut(BaseModel):
    id: int
    course_id: int
    type: str
    difficulty: int
    knowledge_point: str | None
    content: dict[str, Any]
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------- 试卷 / 作业 ----------
class ExamCreate(BaseModel):
    title: str = Field(min_length=1, max_length=128)
    kind: Literal["exam", "assignment"] = "exam"
    duration_minutes: int | None = Field(default=None, ge=5, le=600)
    deadline: datetime | None = None


class ExamItemIn(BaseModel):
    question_id: int
    score: float = Field(gt=0, le=100)


class ExamUpdate(BaseModel):
    title: str | None = None
    duration_minutes: int | None = None
    deadline: datetime | None = None
    items: list[ExamItemIn] | None = None


class ExamOut(BaseModel):
    id: int
    course_id: int
    title: str
    kind: str
    status: str
    duration_minutes: int | None
    deadline: datetime | None
    total_score: float = 0
    question_count: int = 0
    created_at: datetime
    published_at: datetime | None
    # 学生视角附加字段
    my_submission_status: str | None = None
    my_total_score: float | None = None

    model_config = {"from_attributes": True}


# ---------- 作答 ----------
class ProgressIn(BaseModel):
    answers: dict[str, Any]


class SubmitIn(BaseModel):
    answers: dict[str, Any] | None = None


# ---------- 批阅 ----------
class GradingUpdate(BaseModel):
    score: float = Field(ge=0)
    feedback: str | None = None


# ---------- AI ----------
class AiSpec(BaseModel):
    type: QuestionType
    count: int = Field(ge=1, le=20)
    difficulty: int = Field(default=3, ge=1, le=5)


class AiGenerateIn(BaseModel):
    course_id: int
    title: str = Field(min_length=1, max_length=128)
    kind: Literal["exam", "assignment"] = "exam"
    knowledge_points: str | None = None
    specs: list[AiSpec] = Field(min_length=1)
    scores: dict[str, float]  # 每种题型的单题分值，如 {"single_choice": 5}


class AiTaskOut(BaseModel):
    id: int
    type: str
    status: str
    result: dict | None
    error: str | None
    created_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}
