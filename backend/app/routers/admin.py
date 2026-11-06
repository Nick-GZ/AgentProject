"""管理员路由：用户管理、审计日志。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import hash_password, require_roles
from ..database import get_db
from ..models import AuditLog, User
from ..schemas import AdminUserCreate, UserOut

router = APIRouter(prefix="/api", tags=["admin"])


@router.get("/users", response_model=list[UserOut])
def list_users(role: str | None = Query(default=None), db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    stmt = select(User).order_by(User.id)
    if role:
        stmt = stmt.where(User.role == role)
    return db.scalars(stmt).all()


@router.get("/students", response_model=list[UserOut])
def list_students(db: Session = Depends(get_db), _: User = Depends(require_roles("teacher", "admin"))):
    """教师给课程添加学生时用到的全体学生列表。"""
    return db.scalars(select(User).where(User.role == "student").order_by(User.id)).all()


@router.post("/users", response_model=UserOut)
def create_user(body: AdminUserCreate, db: Session = Depends(get_db), admin: User = Depends(require_roles("admin"))):
    if db.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(status_code=409, detail="用户名已存在")
    user = User(username=body.username, password_hash=hash_password(body.password), name=body.name, role=body.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    from ..services import record_audit

    record_audit(db, admin.id, "create_user", f"user:{user.id}", f"role={user.role}, name={user.name}")
    return user


@router.get("/audit-logs")
def list_audit_logs(limit: int = Query(default=100, le=500), db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    logs = db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(limit)).all()
    user_ids = {log.user_id for log in logs if log.user_id}
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(user_ids))).all()} if user_ids else {}
    return [
        {
            "id": log.id,
            "user_id": log.user_id,
            "user_name": users[log.user_id].name if log.user_id in users else None,
            "action": log.action,
            "target": log.target,
            "detail": log.detail,
            "created_at": log.created_at,
        }
        for log in logs
    ]
