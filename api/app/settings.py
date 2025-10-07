# api/app/settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="allow")
    # --- Database ---
    DATABASE_URL: str = "sqlite:////data/whiskey.db"

    # --- Security / JWT ---
    SECRET_KEY: str = "xYe4faTPwms8EKFE8y7AwHFbIyIkM+wmguu3SKtawmY="
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 20
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    JWT_COOKIE_NAME: str = "access_token"
    JWT_REFRESH_COOKIE_NAME: str = "refresh_token"
    COOKIE_SAMESITE: str = "lax"   # "lax" or "strict"
    COOKIE_SECURE: str | bool | None = None  # None or "auto" = detect via scheme; True/False to force
    COOKIE_DOMAIN: str | None = None  # leave None for dev/DDNS; set like ".416flint.com" in prod if desired

    # --- LAN guest access ---
    ALLOW_LAN_GUEST: bool = True
    TRUSTED_PROXIES: str = "127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
    ALLOWED_ORIGINS: str = "http://localhost:8080,http://127.0.0.1:8080"

    # --- Admin bootstrap (username-first) ---
    ADMIN_USERNAME: str | None = None
    ADMIN_PASSWORD: str | None = None
    ADMIN_EMAIL: str | None = None  # optional metadata
    
    # --- Uploads ---
    UPLOAD_MAX_MB: int = 10                 # max image size in megabytes
    UPLOAD_DIR: str = "static/uploads"      # where files are saved (served by /static)

    # --- Login rate limit (per IP) ---
    LOGIN_WINDOW_SECONDS: int = 60          # sliding window size
    LOGIN_MAX_ATTEMPTS: int = 10            # max failed attempts within window
    LOGIN_LOCKOUT_SECONDS: int = 180        # temporary lockout after exceeding

settings = Settings()
