"""认证与权限：Argon2 密码哈希（自动降级 PBKDF2）+ JWT + 角色依赖。"""
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings
from .database import get_db
from .models import User

# ---------- 密码哈希 ----------
try:
    from argon2 import PasswordHasher
    from argon2.exceptions import VerifyMismatchError

    _ph = PasswordHasher()

    def hash_password(password: str) -> str:
        return _ph.hash(password)

    def verify_password(password: str, password_hash: str) -> bool:
        try:
            return _ph.verify(password_hash, password)
        except VerifyMismatchError:
            return False
        except Exception:
            return False

except ImportError:  # argon2 不可用时退回 PBKDF2（纯标准库）
    import hashlib
    import secrets

    def hash_password(password: str) -> str:
        salt = secrets.token_bytes(16)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 600_000)
        return f"pbkdf2${salt.hex()}${dk.hex()}"

    def verify_password(password: str, password_hash: str) -> bool:
        try:
            _, salt_hex, dk_hex = password_hash.split("$")
            dk = hashlib.pbkdf2_hmac(
                "sha256", password.encode(), bytes.fromhex(salt_hex), 600_000
            )
            return secrets.compare_digest(dk.hex(), dk_hex)
        except Exception:
            return False


# ---------- JWT ----------
def create_token(user: User) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(user.id), "role": user.role, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db=Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录或令牌缺失")
    try:
        payload = jwt.decode(
            credentials.credentials, settings.secret_key, algorithms=[settings.jwt_algorithm]
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录已过期，请重新登录")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效令牌")

    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")
    return user


def require_roles(*roles: str):
    """角色守卫工厂：Depends(require_roles('teacher', 'admin'))"""

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")
        return user

    return checker
