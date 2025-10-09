/**
 * DeepSeek API服务
 * 封装DeepSeek文本总结接口调用
 */

export interface DeepSeekMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface DeepSeekRequest {
    model: string;
    messages: DeepSeekMessage[];
    stream: boolean;
}

export interface DeepSeekResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface DeepSeekError {
    error: {
        message: string;
        type: string;
        code: string;
    };
}

export class DeepSeekApiService {
    private readonly proxyBaseUrl: string;
    private readonly defaultModel: string;

    constructor() {
        // 前端改为请求后端代理
        this.proxyBaseUrl = import.meta.env.VITE_DEEPSEEK_BASE_URL
            ? `${import.meta.env.VITE_DEEPSEEK_BASE_URL}/api/v1/proxy/deepseek/summarize`
            : `/api/v1/proxy/deepseek/summarize`;
        this.defaultModel =
            import.meta.env.VITE_DEEPSEEK_MODEL || "deepseek-chat";
    }

    /**
     * 预处理：提取与用户主题相关的小说内容（支持超过 token 上限的分批提取）
     * 入参与 summarizeNovelForImage 相同，但仅做“相关内容提取”，将多次提取的结果拼接返回
     * @param novelText 小说全文
     * @param userPrompt 用户给定主题/图像需求
     */
    async extractRelevantContentForImage(
        novelText: string,
        userPrompt: string
    ): Promise<string> {
        if (!novelText.trim()) {
            throw new Error("请上传小说文本文件");
        }
        if (!userPrompt.trim()) {
            throw new Error("请输入您想要生成的图像描述");
        }

        // 估算 token：中文场景下可近似按字符数估算，将安全阈值降为原来的一半（60,000）
        const MAX_TOKENS_SAFE = 60000;
        const CHUNK_OVERLAP = 500; // 适度重叠，减少跨段丢失

        const systemPrompt = `你是一个严谨的文学研究助理。请仅从用户提供的小说文本中，提取与用户指定主题直接相关的原文片段（尽量保持原句/原段，不进行改写）。
        \n\n要求：
        \n- 只保留与主题强相关的内容，删除无关段落
        \n- 优先保留包含：
        \n  -空间布局：位置、大小、形状、与其它元素的关系
        \n  -视觉细节：颜色、材质、纹理、特殊的符号或雕刻
        \n  -核心实体：关键物体的样貌。
        \n  -独特氛围：任何描述光线（如磷光、冷光）、气味（如腐臭、药味）、触感（如湿滑、粘稠）、材质的词语。
        \n- 保持原文顺序，不要添加解释或总结
        \n- 如果文本过长，本工具会分批发送多段文本，你只需对收到的该段进行精确提取
        \n- 输出仅为提取后的原文片段文本`;

        // 切分为不超过 MAX_TOKENS_SAFE 的片段（近似用字符数界定）
        const chunks: string[] = [];
        if (novelText.length <= MAX_TOKENS_SAFE) {
            chunks.push(novelText);
        } else {
            let start = 0;
            while (start < novelText.length) {
                const end = Math.min(
                    start + MAX_TOKENS_SAFE,
                    novelText.length
                );
                const piece = novelText.slice(start, end);
                chunks.push(piece);
                if (end >= novelText.length) break;
                start = end - CHUNK_OVERLAP; // 带重叠前移
                if (start < 0) start = 0;
            }
        }

        // 并发请求所有片段，保持结果顺序
        const promises = chunks.map((part, index) => {
            const partHeader = chunks.length > 1 ? `（第${index + 1}/${chunks.length}段）` : "";
            return fetch(this.proxyBaseUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: this.defaultModel,
                    systemPrompt,
                    novelText: part,
                    userPrompt: `主题：${userPrompt}${partHeader}`,
                    stream: false,
                }),
            })
                .then(async (response) => {
                    if (!response.ok) {
                        const errorData: DeepSeekError = await response.json();
                        throw new Error(
                            `DeepSeek API错误: ${errorData?.error?.message || response.statusText}`
                        );
                    }
                    const data: DeepSeekResponse = await response.json();
                    if (!data.choices || data.choices.length === 0) {
                        throw new Error("DeepSeek API返回数据格式异常");
                    }
                    const content = data.choices[0].message.content?.trim() || "";
                    return { index, content };
                })
                .catch((err: unknown) => {
                    if (err instanceof Error) {
                        console.error("相关内容提取失败：", err.message);
                    }
                    return { index, content: "" };
                });
        });

        const results = await Promise.all(promises);
        const extractedParts: string[] = new Array(chunks.length).fill("");
        for (const { index, content } of results) {
            extractedParts[index] = content;
        }

        // 拼接所有片段提取结果
        const merged = extractedParts
            .filter((t) => !!t && t.trim().length > 0)
            .join("\n\n");
        if (!merged) {
            throw new Error("未从小说中提取到与主题相关的内容，请调整描述后重试");
        }
        return merged;
    }

    /**
     * 总结小说内容并生成图像描述
     * @param novelText 小说文本内容
     * @param userPrompt 用户输入的图像描述需求
     * @returns Promise<string> 生成的图像描述
     */
    async summarizeNovelForImage(
        novelText: string,
        userPrompt: string
    ): Promise<string> {
        if (!novelText.trim()) {
            throw new Error("请上传小说文本文件");
        }

        if (!userPrompt.trim()) {
            throw new Error("请输入您想要生成的图像描述");
        }

        const systemPrompt = `你是一个专业的文学分析师和图像描述专家。你的任务是从用户提供的小说文本中，提取与用户指定的图像主题相关的内容，并生成一个详细的图像描述prompt。

请按照以下步骤进行：
1. 仔细阅读用户提供的小说文本
2. 理解用户想要生成的图像主题
3. 从小说中提取与该主题相关的描述性文字
4. 将这些描述整合成一个详细的、适合AI图像生成的prompt
5. 确保prompt包含具体的视觉元素、场景描述、氛围等

生成的prompt应该：
- 详细描述场景、人物、环境
- 包含具体的视觉细节
- 体现小说的风格和氛围
- 适合用于AI图像生成
- 长度控制在200-500字之间`;

        // 服务端代理会根据 novelText 与 userPrompt 组装消息，无需在前端构造

        try {
            const response = await fetch(this.proxyBaseUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: this.defaultModel,
                    systemPrompt,
                    novelText,
                    userPrompt,
                    stream: false,
                }),
            });

            if (!response.ok) {
                const errorData: DeepSeekError = await response.json();
                throw new Error(
                    `DeepSeek API错误: ${
                        errorData.error?.message || response.statusText
                    }`
                );
            }

            const data: DeepSeekResponse = await response.json();

            if (data.choices && data.choices.length > 0) {
                return data.choices[0].message.content;
            } else {
                throw new Error("DeepSeek API返回数据格式异常");
            }
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error("网络请求失败，请检查网络连接");
        }
    }

    /**
     * 验证文本文件内容
     * @param text 文本内容
     * @returns 验证结果
     */
    validateTextContent(text: string): { isValid: boolean; message?: string } {
        if (!text || !text.trim()) {
            return { isValid: false, message: "文本内容不能为空" };
        }

        if (text.length < 100) {
            return {
                isValid: false,
                message: `文本内容太短，至少需要100个字符，当前文本长度为${text.length}个字符`,
            };
        }

        // if (text.length > 100000) {
        //     return {
        //         isValid: false,
        //         message: `文本内容太长，最多支持100,000个字符，当前文本长度为${text.length}个字符`,
        //     };
        // }

        return { isValid: true };
    }

    /**
     * 获取支持的文件类型
     */
    getSupportedFileTypes(): string[] {
        return [".txt", ".text"];
    }

    /**
     * 获取最大文件大小（字节）
     */
    getMaxFileSize(): number {
        return 5 * 1024 * 1024; // 5MB
    }
}

// 创建单例实例
export const deepSeekApi = new DeepSeekApiService();
