from pydantic_settings import BaseSettings
from functools import lru_cache
import os

class Settings(BaseSettings):
    # API配置
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "AI Image Processing API"
    
    # 服务器配置
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    RELOAD: bool = True  # 开发模式下的热重载

    # 图像处理配置
    MAX_IMAGE_SIZE: int = 10 * 1024 * 1024  # 10MB
    SUPPORTED_FORMATS: list = ["jpg", "jpeg", "png", "webp"]

    # 外部API配置（从环境变量读取）
    DOUBAO_API_KEY: str = ""
    DOUBAO_BASE_URL: str = "https://ark.cn-beijing.volces.com/api/v3/images/generations"
    DOUBAO_MODEL: str = "doubao-seedream-4-0-250828"

    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/chat/completions"
    DEEPSEEK_MODEL: str = "deepseek-chat"

    # TOS（对象存储）配置
    TOS_ACCESS_KEY: str = os.getenv('TOS_ACCESS_KEY')
    TOS_SECRET_KEY: str = os.getenv('TOS_SECRET_KEY')
    TOS_ENDPOINT: str = "tos-cn-beijing.volces.com"
    TOS_REGION: str = "cn-beijing"
    TOS_BUCKET_NAME: str = "yuri-bucket"
    
    class Config:
        case_sensitive = True
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
