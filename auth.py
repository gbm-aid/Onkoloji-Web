"""JWT auth + audit log helpers."""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import SessionLocal
from models import User, AuditLog

SECRET_KEY = os.environ.get("JWT_SECRET", "gbm-aid-dev-secret-change-in-prod")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 12

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    return pwd_ctx.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_ctx.verify(plain, hashed)
    except Exception:
        return False


def create_access_token(data: dict) -> str:
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {**data, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


async def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
) -> User:
    """FastAPI dependency: validates JWT and returns User. Raises 401 if invalid."""
    if not token:
        # Also accept ?token= query for image src (MRI viewer can't set headers)
        token = request.query_params.get("token")
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Yetkilendirme gerekli")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token geçersiz / süresi dolmuş")
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token formatı bozuk")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == int(user_id), User.is_active == True).first()
        if not user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Kullanıcı bulunamadı / pasif")
        return user
    finally:
        db.close()


def log_audit(
    db: Session,
    user: Optional[User],
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    details: Optional[dict] = None,
    request: Optional[Request] = None,
) -> None:
    """Audit log helper — commit'i çağıran fonksiyona bırakır."""
    entry = AuditLog(
        user_id=user.id if user else None,
        username=user.username if user else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=json.dumps(details, ensure_ascii=False, default=str) if details else None,
        ip_address=(request.client.host if request and request.client else None),
    )
    db.add(entry)


def seed_default_admin() -> None:
    """İlk başlatmada admin/admin kullanıcısı oluştur (varsa atla)."""
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == "admin").first()
        if existing:
            return
        admin = User(
            username="admin",
            password_hash=hash_password("admin"),
            full_name="Sistem Yöneticisi",
            role="admin",
            is_active=True,
        )
        db.add(admin)
        # Demo klinisyen
        doc = User(
            username="dr.demo",
            password_hash=hash_password("demo123"),
            full_name="Dr. Demo Hekim",
            role="clinician",
            is_active=True,
        )
        db.add(doc)
        db.commit()
    finally:
        db.close()
