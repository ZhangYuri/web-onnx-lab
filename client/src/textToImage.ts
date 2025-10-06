/**
 * 文生图页面主逻辑
 */

import { textToImageApi, TextToImageResponse } from "./api/textToImageApi.js";
import { UIComponents } from "./components/ui.js";

class TextToImageApp {
    private promptInput!: HTMLTextAreaElement;
    private imageUrlInput!: HTMLTextAreaElement;
    private sizeSelect!: HTMLSelectElement;
    private generateBtn!: HTMLButtonElement;
    private previewGrid!: HTMLElement;
    private mainContent!: HTMLElement;
    private downloadBtn!: HTMLButtonElement;
    private copyUrlBtn!: HTMLButtonElement;
    private imageActions!: HTMLElement;
    private currentImageUrl: string = "";

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
            UIComponents.debounce(() => this.validateInput(), 500)
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

        // 重置预览
        UIComponents.resetImagePreview(this.previewGrid);
        this.hideImageActions();

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
                    this.sizeSelect.value
                );

            // 处理响应
            if (response.data && response.data.length > 0) {
                const imageUrl = response.data[0].url;
                this.currentImageUrl = imageUrl;
                UIComponents.updateImagePreview(imageUrl, this.previewGrid);
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
}

// 页面加载完成后初始化应用
document.addEventListener("DOMContentLoaded", () => {
    new TextToImageApp();
});

// 导出类供其他模块使用
export { TextToImageApp };
