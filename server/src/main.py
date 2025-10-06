from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
# 兼容包运行与脚本运行的导入
try:
    from .routers import image_processing  # 当以包方式运行：uv run -m src.main
    from .routers.image_processing import proxy_router
except ImportError:
    from routers import image_processing   # 当在 src 目录脚本运行：uv run main.py
    from routers.image_processing import proxy_router

app = FastAPI(
    title="AI Image Processing API",
    description="API for various image processing tasks using AI models",
    version="1.0.0"
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    # 指定允许的来源，避免凭证模式下与 "*" 冲突
    allow_origins=[
        "https://yuri.localhost.com",
        "https://yuri.iqiyi.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
# app.include_router(image_processing.router, prefix="/api/v1")
app.include_router(proxy_router, prefix="/api/v1")

@app.get("/")
async def root():
    return {"message": "Welcome to AI Image Processing API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    # 使用直接 app 实例，避免字符串导入在不同工作目录下的解析问题
    try:
        from .config.settings import get_settings  # 包运行
    except ImportError:
        from config.settings import get_settings   # 脚本运行

    settings = get_settings()
    uvicorn.run(
        app,
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD,
    )
