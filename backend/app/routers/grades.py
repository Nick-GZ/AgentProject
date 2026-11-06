"""成绩路由：学生查本人成绩，教师查班级成绩表。"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..database import get_db
from ..models import Course, Enrollment, Exam, Submission, User
from ..services import course_grade_rows, exam_total
from .courses import assert_course_teacher, get_course_or_404

router = APIRouter(prefix="/api", tags=["grades"])


@router.get("/grades/mine")
def my_grades(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    courses = db.scalars(
        select(Course)
        .join(Enrollment, Enrollment.course_id == Course.id)
        .where(Enrollment.student_id == user.id)
    ).all()
    result = []
    for course in courses:
        rows = course_grade_rows(db, course)
        mine = next((r for r in rows if r["student_id"] == user.id), None)
        items = [e for e in (mine["items"] if mine else []) if e["percentage"] is not None]
        result.append(
            {
                "course_id": course.id,
                "course_name": course.name,
                "teacher_name": course.teacher.name if course.teacher else None,
                "items": mine["items"] if mine else [],
                "final_score": mine["final_score"] if mine else None,
            }
        )
    return result


@router.get("/courses/{course_id}/grades")
def course_grades(course_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    course = get_course_or_404(db, course_id)
    assert_course_teacher(course, user)
    rows = course_grade_rows(db, course)
    exams = db.scalars(
        select(Exam).where(Exam.course_id == course.id, Exam.status.in_(["published", "closed"])).order_by(Exam.id)
    ).all()
    return {
        "course": {"id": course.id, "name": course.name, "assignment_weight": course.assignment_weight},
        "exams": [
            {"id": e.id, "title": e.title, "kind": e.kind, "full_score": exam_total(db, e)}
            for e in exams
        ],
        "rows": rows,
    }