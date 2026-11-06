"""认证路由：注册（仅学生）、登录、当前用户。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from ..auth import create_token, get_current_user, hash_password, verify_password
from ..database import get_db
from ..models import User
from ..schemas import LoginIn, RegisterIn, TokenOut, UserOut
from ..services import record_audit

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut)
def register(body: RegisterIn, db=Depends(get_db)):
    if db.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(status_code=409, detail="用户名已存在")
    user = User(username=body.username, password_hash=hash_password(body.password), name=body.name, role="student")
    db.add(user)
    db.commit()
    db.refresh(user)
    record_audit(db, user.id, "register", f"user:{user.id}")
    return user


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db=Depends(get_db)):
    user = db.scalar(select(User).where(User.username == body.username))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    record_audit(db, user.id, "login", f"user:{user.id}")
    return TokenOut(access_token=create_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
