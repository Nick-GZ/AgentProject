"""课程路由：创建、列表（按角色过滤）、选课管理。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..database import get_db
from ..models import Course, Enrollment, User
from ..schemas import CourseCreate, CourseOut, EnrollStudentIn

router = APIRouter(prefix="/api/courses", tags=["courses"])


def get_course_or_404(db: Session, course_id: int) -> Course:
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="课程不存在")
    return course


def assert_course_teacher(course: Course, user: User) -> None:
    if user.role != "admin" and course.teacher_id != user.id:
        raise HTTPException(status_code=403, detail="无权操作该课程")


def _to_out(db: Session, course: Course, user: User) -> dict:
    count = db.scalar(select(func.count(Enrollment.id)).where(Enrollment.course_id == course.id)) or 0
    teacher = db.get(User, course.teacher_id)
    out = CourseOut(
        id=course.id,
        name=course.name,
        description=course.description,
        teacher_id=course.teacher_id,
        teacher_name=teacher.name if teacher else None,
        assignment_weight=course.assignment_weight,
        student_count=count,
    )
    if user.role == "student":
        out.is_enrolled = bool(
            db.scalar(
                select(Enrollment).where(
                    Enrollment.course_id == course.id, Enrollment.student_id == user.id
                )
            )
        )
    return out.model_dump()


@router.post("", response_model=CourseOut)
def create_course(body: CourseCreate, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    course = Course(
        name=body.name,
        description=body.description,
        teacher_id=user.id,
        assignment_weight=body.assignment_weight,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return _to_out(db, course, user)


@router.get("")
def list_courses(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "admin":
        courses = db.scalars(select(Course).order_by(Course.id)).all()
    elif user.role == "teacher":
        courses = db.scalars(select(Course).where(Course.teacher_id == user.id).order_by(Course.id)).all()
    else:
        courses = db.scalars(
            select(Course)
            .join(Enrollment, Enrollment.course_id == Course.id)
            .where(Enrollment.student_id == user.id)
            .order_by(Course.id)
        ).all()
    return [_to_out(db, c, user) for c in courses]


@router.get("/{course_id}")
def get_course(course_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    course = get_course_or_404(db, course_id)
    if user.role == "student":
        enrolled = bool(
            db.scalar(
                select(Enrollment).where(
                    Enrollment.course_id == course.id, Enrollment.student_id == user.id
                )
            )
        )
        if not enrolled:
            raise HTTPException(status_code=403, detail="未选修该课程")
    elif user.role == "teacher" and course.teacher_id != user.id:
        raise HTTPException(status_code=403, detail="无权查看该课程")
    return _to_out(db, course, user)


@router.post("/{course_id}/enroll")
def enroll_self(course_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "student":
        raise HTTPException(status_code=400, detail="仅学生可选课")
    course = get_course_or_404(db, course_id)
    exists = db.scalar(
        select(Enrollment).where(Enrollment.course_id == course.id, Enrollment.student_id == user.id)
    )
    if not exists:
        db.add(Enrollment(course_id=course.id, student_id=user.id))
        db.commit()
    return {"ok": True, "course_id": course.id}


def _assert_student(db: Session, student_id: int) -> User:
    student = db.get(User, student_id)
    if student is None or student.role != "student":
        raise HTTPException(status_code=400, detail="目标用户不是学生")
    return student


@router.get("/{course_id}/students")
def list_students(course_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    course = get_course_or_404(db, course_id)
    assert_course_teacher(course, user)
    students = db.scalars(
        select(User)
        .join(Enrollment, Enrollment.student_id == User.id)
        .where(Enrollment.course_id == course.id)
        .order_by(User.id)
    ).all()
    return [{"id": s.id, "username": s.username, "name": s.name} for s in students]


@router.post("/{course_id}/students")
def add_student(course_id: int, body: EnrollStudentIn, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    course = get_course_or_404(db, course_id)
    assert_course_teacher(course, user)
    _assert_student(db, body.student_id)
    exists = db.scalar(
        select(Enrollment).where(Enrollment.course_id == course.id, Enrollment.student_id == body.student_id)
    )
    if not exists:
        db.add(Enrollment(course_id=course.id, student_id=body.student_id))
        db.commit()
    return {"ok": True}


@router.delete("/{course_id}/students/{student_id}")
def remove_student(course_id: int, student_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("teacher", "admin"))):
    course = get_course_or_404(db, course_id)
    assert_course_teacher(course, user)
    row = db.scalar(
        select(Enrollment).where(Enrollment.course_id == course.id, Enrollment.student_id == student_id)
    )
    if row:
        db.delete(row)
        db.commit()
    return {"ok": True}
