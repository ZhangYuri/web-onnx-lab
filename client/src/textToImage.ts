/**
 * 文生图页面主逻辑
 */

import { textToImageApi, TextToImageResponse } from "./api/textToImageApi.js";
import { UIComponents } from "./components/ui.js";

class TextToImageApp {
    private promptInput!: HTMLTextAreaElement;
    private imageUrlInput!: HTMLTextAreaElement;
    private sizeSelect!: HTMLSelectElement;
    private maxImagesSelect!: HTMLSelectElement;
    private generateBtn!: HTMLButtonElement;
    private previewGrid!: HTMLElement;
    private mainContent!: HTMLElement;
    private downloadBtn!: HTMLButtonElement;
    private copyUrlBtn!: HTMLButtonElement;
    private imageActions!: HTMLElement;
    private currentImageUrl: string = "";
    private imageUrlPreview!: HTMLElement;

    constructor() {
        this.initializeElements();
        this.bindEvents();
        this.initializeApp();
    }

    /**
     * 初始化DOM元素
     */
    private initializeElements(): void {
        this.promptInput = document.getElementById(
            "prompt"
        ) as HTMLTextAreaElement;
        this.imageUrlInput = document.getElementById(
            "imageUrl"
        ) as HTMLTextAreaElement;
        this.sizeSelect = document.getElementById("size") as HTMLSelectElement;
        this.maxImagesSelect = document.getElementById("maxImages") as HTMLSelectElement;
        this.generateBtn = document.getElementById(
            "generateBtn"
        ) as HTMLButtonElement;
        this.previewGrid = document.getElementById(
            "previewGrid"
        ) as HTMLElement;
        this.mainContent = document.querySelector(
            ".main-content"
        ) as HTMLElement;
        this.downloadBtn = document.getElementById(
            "downloadBtn"
        ) as HTMLButtonElement;
        this.copyUrlBtn = document.getElementById(
            "copyUrlBtn"
        ) as HTMLButtonElement;
        this.imageActions = document.getElementById(
            "imageActions"
        ) as HTMLElement;
        this.imageUrlPreview = document.getElementById(
            "imageUrlPreview"
        ) as HTMLElement;
    }

    /**
     * 绑定事件监听器
     */
    private bindEvents(): void {
        // 生成按钮点击事件
        this.generateBtn.addEventListener("click", () => this.handleGenerate());

        // 输入框实时验证
        this.promptInput.addEventListener(
            "input",
            UIComponents.debounce(() => this.validateInput(), 300)
        );

        this.imageUrlInput.addEventListener(
            "input",
            UIComponents.debounce(() => {
                this.validateInput();
                const urls = this.imageUrlInput.value
                    .split(/\r?\n/)
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0);
                this.updateImageUrlPreview(urls);
            }, 400)
        );
        

        // 回车键生成
        this.promptInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.handleGenerate();
            }
        });

        // 图片预览点击事件
        this.previewGrid.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "IMG") {
                this.openImageInNewTab((target as HTMLImageElement).src);
            }
        });

        // 下载按钮事件
        this.downloadBtn.addEventListener("click", () => {
            if (this.currentImageUrl) {
                this.downloadImage(this.currentImageUrl);
            }
        });

        // 复制URL按钮事件
        this.copyUrlBtn.addEventListener("click", () => {
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
        this.promptInput.value = "";
        this.imageUrlInput.value = "";
        this.sizeSelect.value = "2K";
        if (this.maxImagesSelect) this.maxImagesSelect.value = "1";

        // 重置预览
        UIComponents.resetImagePreview(this.previewGrid);
        this.hideImageActions();

        // 重置参考图小图预览
        this.updateImageUrlPreview([]);

        console.log("文生图应用已初始化");
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

            const finalPrompt = this.promptInput.value;
            const imageUrlLines = this.imageUrlInput.value
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter((s) => s.length > 0);

            // return;

            // 调用豆包API生成图像
            const response: TextToImageResponse =
                await textToImageApi.generateImage(
                    finalPrompt,
                    (imageUrlLines.length > 0 ? imageUrlLines : undefined) as any,
                    this.sizeSelect.value,
                    this.maxImagesSelect ? parseInt(this.maxImagesSelect.value, 10) || 1 : 1
                );

            // 处理响应
            if (response.data && response.data.length > 0) {
                // 渲染多图网格
                const itemsHtml = response.data
                    .map((item, idx) => {
                        const safeUrl = item.url
                            .replace(/&/g, "&amp;")
                            .replace(/</g, "&lt;")
                            .replace(/>/g, "&gt;");
                        return `
                        <div class="preview-item">
                            <h3>${response.data.length > 1 ? `生成的图像 #${idx + 1}` : "生成的图像"}</h3>
                            <div class="preview-image">
                                <img src="${safeUrl}" alt="generated" style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px;" />
                            </div>
                        </div>`;
                    })
                    .join("");
                this.previewGrid.innerHTML = itemsHtml;

                // 操作针对第一张
                const firstUrl = response.data[0].url;
                this.currentImageUrl = firstUrl;
                this.showImageActions();
                UIComponents.showSuccess("图像生成成功！", this.mainContent);

                // 记录使用情况
                if (response.usage) {
                    console.log("API使用情况:", response.usage);
                }
            } else {
                throw new Error("API返回数据格式异常");
            }
        } catch (error) {
            console.error("生成图像失败:", error);
            UIComponents.showError(
                error instanceof Error ? error.message : "生成图像失败，请重试",
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
        window.open(imageUrl, "_blank");
    }

    /**
     * 下载图片
     * @param imageUrl 图片URL
     * @param filename 文件名
     */
    private async downloadImage(
        imageUrl: string,
        filename: string = "generated-image.jpg"
    ): Promise<void> {
        try {
            // const response = await fetch(imageUrl);
            // const blob = await response.blob();

            // const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = imageUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("下载图片失败:", error);
            UIComponents.showError("下载图片失败", this.mainContent);
        }
    }

    /**
     * 复制图片URL到剪贴板
     * @param imageUrl 图片URL
     */
    private async copyImageUrl(imageUrl: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(imageUrl);
            UIComponents.showSuccess("图片URL已复制到剪贴板", this.mainContent);
        } catch (error) {
            console.error("复制失败:", error);
            UIComponents.showError("复制失败，请手动复制", this.mainContent);
        }
    }

    /**
     * 显示图片操作按钮
     */
    private showImageActions(): void {
        if (this.imageActions) {
            this.imageActions.style.display = "block";
        }
    }

    /**
     * 隐藏图片操作按钮
     */
    private hideImageActions(): void {
        if (this.imageActions) {
            this.imageActions.style.display = "none";
        }
        this.currentImageUrl = "";
    }

    /**
     * 根据多行URL更新参考图小图预览
     */
    private updateImageUrlPreview(urls: string[]): void {
        if (!this.imageUrlPreview) return;
        if (!urls || urls.length === 0) {
            this.imageUrlPreview.style.display = "none";
            this.imageUrlPreview.innerHTML = "";
            return;
        }

        this.imageUrlPreview.style.display = "block";
        const itemsHtml = urls
            .slice(0, 12)
            .map((u) => {
                const safe = u.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                return `
                <div style="display:inline-block;width:72px;height:72px;border:1px solid #dee2e6;border-radius:6px;margin-right:8px;margin-bottom:8px;overflow:hidden;background:#f8f9fa;vertical-align:top;">
                    <img src="${safe}" alt="ref" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none'" />
                </div>`;
            })
            .join("");
        this.imageUrlPreview.innerHTML = itemsHtml;
    }
}

// 页面加载完成后初始化应用
document.addEventListener("DOMContentLoaded", () => {
    new TextToImageApp();
});

// 导出类供其他模块使用
export { TextToImageApp };
