/**
 * 文生图页面主逻辑（支持小说生图）
 */

import { textToImageApi, TextToImageResponse } from './api/textToImageApi.js';
import { deepSeekApi } from './api/deepSeekApi.js';
import { UIComponents } from './components/ui.js';

class TextToImageApp {
    private promptInput!: HTMLTextAreaElement;
    private imageUrlInput!: HTMLInputElement;
    private novelFileInput!: HTMLInputElement;
    private sizeSelect!: HTMLSelectElement;
    private generateBtn!: HTMLButtonElement;
    private previewGrid!: HTMLElement;
    private mainContent!: HTMLElement;
    private downloadBtn!: HTMLButtonElement;
    private copyUrlBtn!: HTMLButtonElement;
    private imageActions!: HTMLElement;
    private currentImageUrl: string = '';
    private uploadedNovelText: string = '';
    private imageFileInput!: HTMLInputElement;

    constructor() {
        this.initializeElements();
        this.bindEvents();
        this.initializeApp();
    }

    /**
     * 初始化DOM元素
     */
    private initializeElements(): void {
        this.promptInput = document.getElementById('prompt') as HTMLTextAreaElement;
        this.imageUrlInput = document.getElementById('imageUrl') as HTMLInputElement;
        this.novelFileInput = document.getElementById('novelFile') as HTMLInputElement;
        this.sizeSelect = document.getElementById('size') as HTMLSelectElement;
        this.generateBtn = document.getElementById('generateBtn') as HTMLButtonElement;
        this.previewGrid = document.getElementById('previewGrid') as HTMLElement;
        this.mainContent = document.querySelector('.main-content') as HTMLElement;
        this.downloadBtn = document.getElementById('downloadBtn') as HTMLButtonElement;
        this.copyUrlBtn = document.getElementById('copyUrlBtn') as HTMLButtonElement;
        this.imageActions = document.getElementById('imageActions') as HTMLElement;
        this.imageFileInput = document.getElementById('imageFile') as HTMLInputElement;
    }

    /**
     * 绑定事件监听器
     */
    private bindEvents(): void {
        // 生成按钮点击事件
        this.generateBtn.addEventListener('click', () => this.handleGenerate());

        // 输入框实时验证
        this.promptInput.addEventListener('input', 
            UIComponents.debounce(() => this.validateInput(), 300)
        );

        this.imageUrlInput.addEventListener('input', UIComponents.debounce(() => this.validateInput(), 500));

        // 本地参考图选择后自动上传
        if (this.imageFileInput) {
            this.imageFileInput.addEventListener('change', async () => {
                const file = this.imageFileInput.files?.[0];
                if (!file) return;
                try {
                    UIComponents.showSuccess('正在上传参考图片...', this.mainContent);
                    const form = new FormData();
                    form.append('file', file);

                    const base = (import.meta as any).env.VITE_SERVER_BASE_URL || '';
                    const url = `${base}/api/v1/proxy/tos/upload`;
                    const resp = await fetch(url, { method: 'POST', body: form });
                    if (!resp.ok) {
                        const t = await resp.text();
                        throw new Error(`上传失败: ${t}`);
                    }
                    const data = await resp.json();
                    const uploadedUrl = data.url || '';
                    if (!uploadedUrl) throw new Error('上传成功但未返回URL');
                    this.imageUrlInput.value = uploadedUrl;
                    UIComponents.showSuccess('参考图片上传成功，已自动填充', this.mainContent);
                } catch (err) {
                    console.error(err);
                    UIComponents.showError(err instanceof Error ? err.message : '上传失败', this.mainContent);
                    this.imageUrlInput.value = '';
                    if (this.imageFileInput) this.imageFileInput.value = '';
                }
            });
        }

        // 小说文件上传事件
        this.novelFileInput.addEventListener('change', (event) => {
            this.handleNovelFileUpload(event);
        });

        // 回车键生成
        this.promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.handleGenerate();
            }
        });

        // 图片预览点击事件
        this.previewGrid.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'IMG') {
                this.openImageInNewTab((target as HTMLImageElement).src);
            }
        });

        // 下载按钮事件
        this.downloadBtn.addEventListener('click', () => {
            if (this.currentImageUrl) {
                this.downloadImage(this.currentImageUrl);
            }
        });

        // 复制URL按钮事件
        this.copyUrlBtn.addEventListener('click', () => {
            if (this.currentImageUrl) {
                this.copyImageUrl(this.currentImageUrl);
            }
        });
    }

    /**
     * 初始化应用
     */
    private initializeApp(): void {
        // 隐藏所有消息
        UIComponents.hideMessages(this.mainContent);
        
        // 设置默认值
        this.promptInput.value = '';
        this.imageUrlInput.value = '';
        this.novelFileInput.value = '';
        this.sizeSelect.value = '2K';
        
        // 重置预览
        UIComponents.resetImagePreview(this.previewGrid);
        this.hideImageActions();
        
        console.log('文生图应用已初始化（支持小说生图）');
    }

    /**
     * 处理小说文件上传
     */
    private async handleNovelFileUpload(event: Event): Promise<void> {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        
        if (!file) return;

        // 验证文件类型
        const supportedTypes = deepSeekApi.getSupportedFileTypes();
        const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
        
        if (!supportedTypes.includes(fileExtension)) {
            UIComponents.showError('请上传txt格式的文件', this.mainContent);
            target.value = '';
            return;
        }

        // 验证文件大小
        const maxSize = deepSeekApi.getMaxFileSize();
        if (file.size > maxSize) {
            UIComponents.showError(`文件大小不能超过${UIComponents.formatFileSize(maxSize)}`, this.mainContent);
            target.value = '';
            return;
        }

        try {
            // 读取文件内容
            const text = await this.readFileAsText(file);
            
            // 验证文本内容
            const validation = deepSeekApi.validateTextContent(text);
            if (!validation.isValid) {
                UIComponents.showError(validation.message!, this.mainContent);
                target.value = '';
                return;
            }

            this.uploadedNovelText = text;
            UIComponents.showSuccess(`小说文件上传成功！文本长度：${text.length}字符`, this.mainContent);
            
            // 更新提示文本
            this.promptInput.placeholder = '请输入您想要生成的图像描述，AI将从小说中提取相关描述...';
            
        } catch (error) {
            console.error('读取文件失败:', error);
            UIComponents.showError('读取文件失败，请重试', this.mainContent);
            target.value = '';
        }
    }

    /**
     * 读取文件为文本
     */
    private readFileAsText(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve(e.target?.result as string);
            };
            reader.onerror = () => {
                reject(new Error('文件读取失败'));
            };
            reader.readAsText(file, 'UTF-8');
        });
    }

    /**
     * 处理生成图像
     */
    private async handleGenerate(): Promise<void> {
        try {
            // 验证输入
            const validation = UIComponents.validateInput(
                this.promptInput.value, 
                this.imageUrlInput.value
            );

            if (!validation.isValid) {
                UIComponents.showError(validation.message!, this.mainContent);
                return;
            }

            // 设置加载状态
            UIComponents.setLoadingState(this.generateBtn, true);
            UIComponents.hideMessages(this.mainContent);

            let finalPrompt = this.promptInput.value;

            // 如果上传了小说文件，先调用DeepSeek总结
            if (this.uploadedNovelText) {
                console.log('开始调用DeepSeek总结小说内容...');
                UIComponents.showSuccess('正在分析小说内容，请稍候...', this.mainContent);
                
                finalPrompt = await deepSeekApi.summarizeNovelForImage(
                    this.uploadedNovelText,
                    this.promptInput.value
                );
                
                console.log('DeepSeek生成的prompt:', finalPrompt);
                UIComponents.showSuccess('小说内容分析完成，开始生成图像...', this.mainContent);
            }

            // 调用豆包API生成图像
            const response: TextToImageResponse = await textToImageApi.generateImage(
                finalPrompt,
                this.imageUrlInput.value || undefined,
                this.sizeSelect.value
            );

            // 处理响应
            if (response.data && response.data.length > 0) {
                const imageUrl = response.data[0].url;
                this.currentImageUrl = imageUrl;
                UIComponents.updateImagePreview(imageUrl, this.previewGrid);
                this.showImageActions();
                UIComponents.showSuccess('图像生成成功！', this.mainContent);
                
                // 记录使用情况
                if (response.usage) {
                    console.log('API使用情况:', response.usage);
                }
            } else {
                throw new Error('API返回数据格式异常');
            }

        } catch (error) {
            console.error('生成图像失败:', error);
            UIComponents.showError(
                error instanceof Error ? error.message : '生成图像失败，请重试',
                this.mainContent
            );
            UIComponents.resetImagePreview(this.previewGrid);
            this.hideImageActions();
        } finally {
            // 恢复按钮状态
            UIComponents.setLoadingState(this.generateBtn, false);
        }
    }

    /**
     * 验证输入
     */
    private validateInput(): void {
        const validation = UIComponents.validateInput(
            this.promptInput.value, 
            this.imageUrlInput.value
        );

        if (!validation.isValid) {
            this.generateBtn.disabled = true;
        } else {
            this.generateBtn.disabled = false;
        }
    }

    /**
     * 在新标签页中打开图片
     * @param imageUrl 图片URL
     */
    private openImageInNewTab(imageUrl: string): void {
        window.open(imageUrl, '_blank');
    }

    /**
     * 下载图片
     * @param imageUrl 图片URL
     * @param filename 文件名
     */
    private async downloadImage(imageUrl: string, filename: string = 'generated-image.jpg'): Promise<void> {
        try {
            // const response = await fetch(imageUrl);
            // const blob = await response.blob();
            
            // const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = imageUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('下载图片失败:', error);
            UIComponents.showError('下载图片失败', this.mainContent);
        }
    }

    /**
     * 复制图片URL到剪贴板
     * @param imageUrl 图片URL
     */
    private async copyImageUrl(imageUrl: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(imageUrl);
            UIComponents.showSuccess('图片URL已复制到剪贴板', this.mainContent);
        } catch (error) {
            console.error('复制失败:', error);
            UIComponents.showError('复制失败，请手动复制', this.mainContent);
        }
    }

    /**
     * 显示图片操作按钮
     */
    private showImageActions(): void {
        if (this.imageActions) {
            this.imageActions.style.display = 'block';
        }
    }

    /**
     * 隐藏图片操作按钮
     */
    private hideImageActions(): void {
        if (this.imageActions) {
            this.imageActions.style.display = 'none';
        }
        this.currentImageUrl = '';
    }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new TextToImageApp();
});

// 导出类供其他模块使用
export { TextToImageApp };