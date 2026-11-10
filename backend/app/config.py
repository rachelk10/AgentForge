from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, SecretStr


class Settings(BaseSettings):
    database_url: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    openai_api_key: str
    embedding_model: str = "text-embedding-3-small"
    resend_api_key: SecretStr | None = None
    resend_from_email: str | None = None
    password_reset_url: str | None = None
    google_client_id: str | None = None
    cors_origins: list[str] = Field(default_factory=list)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
