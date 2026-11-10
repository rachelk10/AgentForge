from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.user import (
    PasswordRecoveryRequest,
    PasswordRecoveryResponse,
    PasswordResetRequest,
    GoogleAuthRequest,
    Token,
    UserCreate,
    UserResponse,
)
from app.services.auth import AuthService
from app.services.email import EmailService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=201,
    responses={400: {"description": "Email or username already registered"}},
)
async def register(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Register a new user account."""
    return await AuthService(db).register(data)


@router.post(
    "/login",
    response_model=Token,
    responses={401: {"description": "Invalid credentials"}},
)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> Token:
    """Login with email and password. Returns a JWT access token.

    Use your **email** in the *username* field.
    """
    return await AuthService(db).login(form_data.username, form_data.password)


@router.post(
    "/google",
    response_model=Token,
    responses={401: {"description": "Google credential is invalid"}, 503: {"description": "Google sign-in is not configured"}},
)
async def google_sign_in(
    data: GoogleAuthRequest,
    db: AsyncSession = Depends(get_db),
) -> Token:
    return await AuthService(db).google_sign_in(data)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)) -> User:
    """Return the currently authenticated user."""
    return current_user


@router.post(
    "/password-recovery",
    response_model=PasswordRecoveryResponse,
    status_code=202,
    responses={502: {"description": "Email provider failed"}, 503: {"description": "Email is not configured"}},
)
async def request_password_recovery(
    data: PasswordRecoveryRequest,
    db: AsyncSession = Depends(get_db),
) -> PasswordRecoveryResponse:
    await AuthService(db).request_password_recovery(data.email, EmailService())
    return PasswordRecoveryResponse()


@router.post("/password-reset", status_code=204, responses={400: {"description": "Invalid or expired reset token"}})
async def reset_password(
    data: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
) -> None:
    await AuthService(db).reset_password(data)
