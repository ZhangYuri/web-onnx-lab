# AI 图像处理服务

这是一个基于FastAPI的AI图像处理服务，支持多种图像处理功能，如超分辨率、卡通化等。

## 功能特点

- 图像超分辨率处理
- 人物卡通化
- 图像风格迁移
- 支持多种图像格式
- RESTful API接口
- 自动API文档

## 环境要求

- Python 3.8+
- 其他依赖见 requirements.txt

## 安装步骤

1. 安装python
```bash
uv python pin 3.11
```

2. 查看所有python版本
```bash
uv python list
```

3. 卸载python
```bash
uv python uninstall 3.10
```

4. 切换python版本
```bash
uv python pin 3.11
```

5. 创建虚拟环境（推荐）：
```bash
uv venv
```

6. 安装依赖：
```bash
uv pip install -r requirements.txt
```

7. 配置环境变量：
复制 .env.example 文件并重命名为 .env，根据需要修改配置。

## 运行服务

在项目根目录下运行：
```bash
cd src
uv run main.py
```

服务将在 http://localhost:8000 启动。

## API文档

启动服务后，可以访问以下地址查看API文档：
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API端点

- `GET /`: 欢迎页面
- `GET /health`: 健康检查
- `POST /api/v1/image/doubao/generate`: seedream4.0 图像处理
- `POST /api/v1/image/deepseek/summarize`: deepseek 接口
- `POST /api/v1/image/tos/upload-from-file`: 图片云存储
