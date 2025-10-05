/**
 * 文生图API服务
 * 封装豆包文生图接口调用
 */

export interface TextToImageRequest {
    model: string;
    prompt: string;
    image?: string;
    size: string;
}

export interface TextToImageResponse {
    data: Array<{
        url: string;
        revisedPrompt?: string;
    }>;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface ApiError {
    error: {
        message: string;
        type: string;
        code: string;
    };
}

export class TextToImageApiService {
    private readonly proxyBaseUrl: string;
    private readonly defaultModel: string;

    constructor() {
        // 前端改为请求后端代理，避免CORS与密钥暴露
        this.proxyBaseUrl = import.meta.env.VITE_DOUBAO_BASE_URL
            ? `${import.meta.env.VITE_DOUBAO_BASE_URL}/api/v1/proxy/doubao/generate`
            : `/api/v1/proxy/doubao/generate`;

        this.defaultModel = import.meta.env.VITE_DOUBAO_MODEL || 'doubao-seedream-4-0-250828';
    }

    /**
     * 生成图像
     * @param prompt 文字描述
     * @param imageUrl 参考图片URL（可选）
     * @param size 图片尺寸
     * @returns Promise<TextToImageResponse>
     */
    async generateImage(
        prompt: string,
        imageUrl?: string,
        size: string = '2K'
    ): Promise<TextToImageResponse> {
        if (!prompt.trim()) {
            throw new Error('请输入文字描述');
        }

        const requestData: TextToImageRequest = {
            model: this.defaultModel,
            prompt: prompt.trim(),
            size: size
        };

        // 如果有参考图片，添加到请求中
        if (imageUrl && imageUrl.trim()) {
            requestData.image = imageUrl.trim();
        }

        try {
            const response = await fetch(this.proxyBaseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                const errorData: ApiError = await response.json();
                throw new Error(`API错误: ${errorData.error?.message || response.statusText}`);
            }

            const data: TextToImageResponse = await response.json();
            return data;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('网络请求失败，请检查网络连接');
        }
    }

    /**
     * 验证图片URL是否有效
     * @param url 图片URL
     * @returns Promise<boolean>
     */
    async validateImageUrl(url: string): Promise<boolean> {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            return response.ok && response.headers.get('content-type')?.startsWith('image/') || false;
        } catch {
            return false;
        }
    }

    /**
     * 获取支持的图片尺寸列表
     */
    getSupportedSizes(): Array<{value: string, label: string}> {
        return [
            { value: '1K', label: '1K (1024x1024)' },
            { value: '2K', label: '2K (2048x2048)' },
            { value: '4K', label: '4K (4096x4096)' }
        ];
    }
}

// 创建单例实例
export const textToImageApi = new TextToImageApiService();
