from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://agentorch:agentorch_secret@localhost:5432/agentorch"
    redis_url: str = "redis://localhost:6379/0"
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    frontend_dist_dir: str = "/app/frontend_dist"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
