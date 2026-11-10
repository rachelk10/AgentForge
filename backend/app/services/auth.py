import hashlib
import logging
import secrets
import asyncio
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token

from app.config import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.user import GoogleAuthRequest, PasswordResetRequest, Token, UserCreate
from app.services.email import EmailConfigurationError, EmailDeliveryError, EmailService

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def register(self, data: UserCreate) -> User:
        result = await self.db.execute(select(User).where(User.email == data.email))
        if result.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )

        result = await self.db.execute(
            select(User).where(User.username == data.username)
        )
        if result.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken",
            )

        user = User(
            email=data.email,
            username=data.username,
            hashed_password=hash_password(data.password),
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        logger.info("New user registered: %s", user.email)
        return user

    async def login(self, email: str, password: str) -> Token:
        result = await self.db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user is None or not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Account is inactive",
            )

        token = create_access_token({"sub": str(user.id)})
        logger.info("User logged in: %s", user.email)
        return Token(access_token=token)

    async def google_sign_in(self, data: GoogleAuthRequest) -> Token:
        if not settings.google_client_id:
            raise HTTPException(status_code=503, detail="Google sign-in is not configured")
        try:
            claims = await asyncio.to_thread(
                id_token.verify_oauth2_token,
                data.credential,
                GoogleRequest(),
                settings.google_client_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=401, detail="Google credential is invalid or expired") from exc

        email = claims.get("email")
        if not isinstance(email, str) or claims.get("email_verified") is not True:
            raise HTTPException(status_code=401, detail="Google account does not have a verified email")

        result = await self.db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None:
            display_name = claims.get("name")
            base_username = display_name.strip() if isinstance(display_name, str) else email.split("@", 1)[0]
            base_username = base_username[:100] or "Google user"
            username = base_username
            suffix = 1
            while True:
                username_result = await self.db.execute(select(User).where(User.username == username))
                if username_result.scalar_one_or_none() is None:
                    break
                suffix_text = f" {suffix}"
                username = f"{base_username[:100 - len(suffix_text)]}{suffix_text}"
                suffix += 1
            user = User(
                email=email,
                username=username,
                hashed_password=hash_password(secrets.token_urlsafe(32)),
            )
            self.db.add(user)
            await self.db.commit()
            await self.db.refresh(user)
        if not user.is_active:
            raise HTTPException(status_code=400, detail="Account is inactive")
        return Token(access_token=create_access_token({"sub": str(user.id)}))

    async def request_password_recovery(self, email: str, email_service: EmailService) -> None:
        if not settings.password_reset_url:
            raise HTTPException(status_code=503, detail="Password recovery URL is not configured")
        try:
            email_service.ensure_configured()
        except EmailConfigurationError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        result = await self.db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None:
            return

        raw_token = secrets.token_urlsafe(32)
        user.password_reset_token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        user.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        await self.db.commit()

        reset_url = f"{settings.password_reset_url}?token={raw_token}"
        try:
            await email_service.send(
                user.email,
                "Reset your AgentForge password",
                f'<p>Use this link within 30 minutes to reset your password:</p>'
                f'<p><a href="{reset_url}">Reset password</a></p>',
            )
        except EmailConfigurationError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except EmailDeliveryError as exc:
            user.password_reset_token_hash = None
            user.password_reset_expires_at = None
            await self.db.commit()
            logger.error("Password recovery email delivery failed for user_id=%s", user.id)
            raise HTTPException(status_code=502, detail="Password recovery email could not be sent") from exc

    async def reset_password(self, data: PasswordResetRequest) -> None:
        token_hash = hashlib.sha256(data.token.encode("utf-8")).hexdigest()
        result = await self.db.execute(
            select(User).where(User.password_reset_token_hash == token_hash)
        )
        user = result.scalar_one_or_none()
        now = datetime.now(timezone.utc)
        expires_at = user.password_reset_expires_at if user else None
        if expires_at is not None and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if user is None or expires_at is None or expires_at <= now:
            raise HTTPException(status_code=400, detail="The password reset link is invalid or expired")

        user.hashed_password = hash_password(data.password)
        user.password_reset_token_hash = None
        user.password_reset_expires_at = None
        await self.db.commit()
