from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi import Depends
import httpx
# 兼容两种运行方式：
# 1) 在 server 目录下使用 `uv run -m src.main`
# 2) 在 server/src 目录下使用 `uv run main.py`
try:
    from ..config.settings import get_settings  # 作为包运行时
except ImportError:
    from config.settings import get_settings   # 作为脚本运行时

# router = APIRouter(
#     prefix="/image",
#     tags=["image-processing"]
# )

# ============== 代理路由 ==============
proxy_router = APIRouter(prefix="/proxy", tags=["proxy"])

@proxy_router.post("/doubao/generate")
async def proxy_doubao_generate(payload: dict, settings=Depends(get_settings)):
    """
    代理调用豆包文生图（避免浏览器跨域和暴露密钥）。
    前端仅需传 prompt / image / size，可选 model（否则使用服务端默认）。
    """
    request_body = {
        "model": payload.get("model") or settings.DOUBAO_MODEL,
        "prompt": payload.get("prompt"),
        "size": payload.get("size") or "2K",
    }
    if payload.get("image"):
        request_body["image"] = payload["image"]

    if not settings.DOUBAO_API_KEY:
        raise HTTPException(status_code=500, detail="Doubao API key not configured")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.DOUBAO_API_KEY}",
    }

    print(request_body)
    print(headers)
    print(settings.DOUBAO_BASE_URL)

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(settings.DOUBAO_BASE_URL, headers=headers, json=request_body)
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()


@proxy_router.post("/deepseek/summarize")
async def proxy_deepseek_summarize(payload: dict, settings=Depends(get_settings)):
    """
    代理调用DeepSeek总结接口。
    前端传 novelText 和 userPrompt，服务端组装 messages。
    """
    if not settings.DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="DeepSeek API key not configured")

    system_prompt = payload.get("systemPrompt") or (
        "You are a helpful assistant that extracts relevant passages from long novels and writes a detailed image prompt."
    )
    novel_text = payload.get("novelText") or ""
    user_prompt = payload.get("userPrompt") or ""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"小说文本内容：\n{novel_text}\n\n用户需求：{user_prompt}\n\n请根据小说内容，生成一个详细的图像描述prompt。"},
    ]

    body = {
        "model": payload.get("model") or settings.DEEPSEEK_MODEL,
        "messages": messages,
        "stream": False,
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
    }
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(settings.DEEPSEEK_BASE_URL, headers=headers, json=body)
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

@proxy_router.post("/tos/upload-from-file")
async def proxy_tos_upload_from_file(payload: dict, settings=Depends(get_settings)):
    """
    代理上传本地文件到 TOS。请求体：{"filePath","objectKey","bucketName"(可选)}
    """
    try:
        import tos
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"tos-sdk 未安装或导入失败: {e}")

    ak = settings.TOS_ACCESS_KEY
    sk = settings.TOS_SECRET_KEY
    endpoint = settings.TOS_ENDPOINT
    region = settings.TOS_REGION
    bucket_name = payload.get("bucketName") or settings.TOS_BUCKET_NAME
    file_name = payload.get("file")

    # 生成随机 object_key（保留文件扩展名），也可被请求体显式覆盖
    import uuid, datetime, os
    ext = os.path.splitext(file_name or "")[1]
    rand = uuid.uuid4().hex
    date_prefix = datetime.datetime.utcnow().strftime("%Y/%m/%d")
    default_object_key = f"uploads/{date_prefix}/{rand}{ext}"
    object_key = payload.get("objectKey") or default_object_key

    if not (ak and sk and bucket_name and object_key and file_name):
        raise HTTPException(status_code=400, detail="缺少必要参数: ak/sk/bucketName/objectKey/filePath")

    try:
        client = tos.TosClientV2(ak, sk, endpoint, region)
        response = client.put_object_from_file(bucket_name, object_key, file_name)
        # 返回关键信息，含最终objectKey 和推导出的公共URL（需桶公有读或CDN）
        url = f"https://{bucket_name}.{endpoint}/{object_key}"
        return {
            "bucket": bucket_name,
            "objectKey": object_key,
            "url": url,
            "result": response,
        }
    except tos.exceptions.TosClientError as e:
        raise HTTPException(status_code=400, detail=f"TOS client error: {getattr(e, 'message', str(e))}")
    except tos.exceptions.TosServerError as e:
        detail = {
            "code": getattr(e, 'code', None),
            "requestId": getattr(e, 'request_id', None),
            "message": getattr(e, 'message', str(e)),
            "statusCode": getattr(e, 'status_code', None),
            "ec": getattr(e, 'ec', None)
        }
        raise HTTPException(status_code=502, detail=detail)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"未知错误: {e}")


@proxy_router.post("/tos/upload")
async def proxy_tos_upload(file: UploadFile = File(...), objectKey: str | None = None, settings=Depends(get_settings)):
    """
    接收浏览器上传的文件并转存到 TOS。
    - form-data: file (必填), objectKey (可选)
    """
    try:
        import tos
        import uuid, datetime, os, tempfile
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"环境缺少依赖: {e}")

    ak = settings.TOS_ACCESS_KEY
    sk = settings.TOS_SECRET_KEY
    endpoint = settings.TOS_ENDPOINT
    region = settings.TOS_REGION
    bucket_name = settings.TOS_BUCKET_NAME
    if not (ak and sk and bucket_name):
        raise HTTPException(status_code=500, detail="TOS 配置缺失，请设置AK/SK/BUCKET")

    # 生成默认 object key（保留扩展名）
    ext = os.path.splitext(file.filename or "")[1]
    rand = uuid.uuid4().hex
    date_prefix = datetime.datetime.utcnow().strftime("%Y/%m/%d")
    default_object_key = f"uploads/{date_prefix}/{rand}{ext}"
    final_key = objectKey or default_object_key

    # 将上传内容写入临时文件后使用 SDK 上传
    try:
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            temp_path = tmp.name
            content = await file.read()
            tmp.write(content)

        client = tos.TosClientV2(ak, sk, endpoint, region)
        resp = client.put_object_from_file(bucket_name, final_key, temp_path)
        url = f"https://{bucket_name}.{endpoint}/{final_key}"
        return {"bucket": bucket_name, "objectKey": final_key, "url": url, "result": resp}
    except tos.exceptions.TosClientError as e:
        raise HTTPException(status_code=400, detail=f"TOS client error: {getattr(e, 'message', str(e))}")
    except tos.exceptions.TosServerError as e:
        detail = {"code": getattr(e, 'code', None), "requestId": getattr(e, 'request_id', None), "message": getattr(e, 'message', str(e))}
        raise HTTPException(status_code=502, detail=detail)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"未知错误: {e}")
    finally:
        try:
            if 'temp_path' in locals() and os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception:
            pass