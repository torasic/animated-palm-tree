import os
from pydantic_settings import BaseSettings, SettingsConfigDict

# Get the directory of the backend root
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_file_path = os.path.join(base_dir, ".env")

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost/grove"
    GROQ_API_KEY: str = "placeholder_key"
    JWT_SECRET: str = "placeholder_secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    SUPABASE_URL: str = "https://placeholder.supabase.co"
    SUPABASE_SERVICE_KEY: str = "placeholder_service_key"
    SUPABASE_STORAGE_BUCKET: str = "product-photos"
    GOOGLE_CLIENT_ID: str = "placeholder_google_client_id"
    GEMINI_API_KEY: str = "placeholder_gemini_api_key"
    ADMIN_TOKEN: str = "placeholder_admin_token"
    APP_ENV: str = "production"
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Xendit Sandbox Settings
    XENDIT_SECRET_KEY: str = "placeholder_xendit_secret_key"
    XENDIT_WEBHOOK_TOKEN: str = "placeholder_xendit_webhook_token"

    # Order Status Timeouts (in seconds)
    TIMEOUT_KONFIRMASI: int = 86400        # 1 day
    TIMEOUT_PENGAMBILAN: int = 259200       # 3 days
    TIMEOUT_AUTO_CONFIRM: int = 172800      # 2 days
    TIMEOUT_KOMPLAIN: int = 86400          # 1 day

    model_config = SettingsConfigDict(env_file=env_file_path, extra="ignore")

settings = Settings()
