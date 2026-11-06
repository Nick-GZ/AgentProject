"""全局配置：从环境变量 / .env 读取。"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "AI 课程管理系统"
    secret_key: str = "dev-only-secret-key-change-me-in-production-0123456789-ABCDEF"
    database_url: str = "sqlite:///./aicourse.db"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 720
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # 大模型相关
    anthropic_api_key: str = ""
    llm_model: str = "claude-sonnet-4-5"
    # Anthropic 协议兼容端点（留空 = 官方 Anthropic API）
    # 智谱 BigModel：https://open.bigmodel.cn/api/anthropic
    llm_base_url: str = ""


settings = Settings()
