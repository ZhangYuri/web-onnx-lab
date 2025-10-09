import { deepSeekApi } from "./api/deepSeekApi.js";
import { UIComponents } from "./components/ui.js";

class NovelToPromptModule {
    private mainContent!: HTMLElement;
    private novelFileInput!: HTMLInputElement;
    private novelThemeInput!: HTMLTextAreaElement;
    private novelPromptOutput!: HTMLTextAreaElement;
    private txt2imgPromptInput!: HTMLTextAreaElement | null;
    private generatePromptBtn!: HTMLButtonElement;
    private copyPromptBtn!: HTMLButtonElement;
    private uploadedNovelText: string = "";

    constructor() {
        this.initializeElements();
        this.bindEvents();
    }

    private initializeElements(): void {
        this.mainContent = document.querySelector(".main-content") as HTMLElement;
        this.novelFileInput = document.getElementById("novelFile") as HTMLInputElement;
        this.novelThemeInput = document.getElementById("novelTheme") as HTMLTextAreaElement;
        this.novelPromptOutput = document.getElementById("novelPrompt") as HTMLTextAreaElement;
        this.txt2imgPromptInput = document.getElementById("prompt") as HTMLTextAreaElement | null;
        this.generatePromptBtn = document.getElementById("generatePromptBtn") as HTMLButtonElement;
        this.copyPromptBtn = document.getElementById("copyPromptBtn") as HTMLButtonElement;
    }

    private bindEvents(): void {
        if (this.novelFileInput) {
            this.novelFileInput.addEventListener("change", (e) => this.handleNovelFileUpload(e));
        }
        if (this.generatePromptBtn) {
            this.generatePromptBtn.addEventListener("click", () => this.handleGeneratePrompt());
        }
        if (this.copyPromptBtn) {
            this.copyPromptBtn.addEventListener("click", () => this.handleCopyPrompt());
        }
    }

    private async handleNovelFileUpload(event: Event): Promise<void> {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;

        const supportedTypes = deepSeekApi.getSupportedFileTypes();
        const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();
        if (!supportedTypes.includes(fileExtension)) {
            UIComponents.showError("请上传txt格式的文件", this.mainContent);
            target.value = "";
            return;
        }

        const maxSize = deepSeekApi.getMaxFileSize();
        if (file.size > maxSize) {
            UIComponents.showError(
                `文件大小不能超过${UIComponents.formatFileSize(maxSize)}`,
                this.mainContent
            );
            target.value = "";
            return;
        }

        try {
            const text = await this.readFileAsText(file);
            const validation = deepSeekApi.validateTextContent(text);
            if (!validation.isValid) {
                UIComponents.showError(validation.message!, this.mainContent);
                target.value = "";
                return;
            }
            this.uploadedNovelText = text;
            UIComponents.showSuccess(
                `小说文件上传成功！文本长度：${text.length}字符`,
                this.mainContent
            );
        } catch (err) {
            console.error(err);
            UIComponents.showError("读取文件失败，请重试", this.mainContent);
            target.value = "";
        }
    }

    private readFileAsText(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = () => reject(new Error("文件读取失败"));
            reader.readAsText(file, "UTF-8");
        });
    }

    private async handleGeneratePrompt(): Promise<void> {
        UIComponents.hideMessages(this.mainContent);
        const theme = this.novelThemeInput?.value || "";
        if (!this.uploadedNovelText) {
            UIComponents.showError("请先上传小说文本文件", this.mainContent);
            return;
        }
        if (!theme.trim()) {
            UIComponents.showError("请输入主题/图像需求", this.mainContent);
            return;
        }
        try {
            this.setLoading(this.generatePromptBtn, true);

            console.log("开始提取与主题相关的小说内容...");
            UIComponents.showSuccess(
                "正在提取与主题相关的小说内容，请稍候...",
                this.mainContent
            );

            const extracted = await deepSeekApi.extractRelevantContentForImage(
                this.uploadedNovelText,
                theme
            );

            console.log("已提取相关内容，长度:", extracted);
            UIComponents.showSuccess(
                "相关内容提取完成，正在生成图像描述...",
                this.mainContent
            );

            const finalPrompt = await deepSeekApi.summarizeNovelForImage(
                extracted,
                theme
            );
            const value = finalPrompt || "";
            this.novelPromptOutput.value = value;
            if (this.txt2imgPromptInput) {
                this.txt2imgPromptInput.value = value;
            }
            UIComponents.showSuccess("Prompt 生成完成，可在下方直接用于文生图", this.mainContent);
        } catch (error) {
            console.error(error);
            UIComponents.showError(
                error instanceof Error ? error.message : "生成 Prompt 失败",
                this.mainContent
            );
        } finally {
            this.setLoading(this.generatePromptBtn, false);
        }
    }

    private async handleCopyPrompt(): Promise<void> {
        const text = this.novelPromptOutput?.value || "";
        if (!text.trim()) {
            UIComponents.showError("没有可复制的 Prompt", this.mainContent);
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            UIComponents.showSuccess("Prompt 已复制到剪贴板", this.mainContent);
        } catch {
            UIComponents.showError("复制失败，请手动复制", this.mainContent);
        }
    }

    private setLoading(btn: HTMLButtonElement, loading: boolean): void {
        const textSpan = btn.querySelector(".btn-text");
        const loadingDiv = btn.querySelector(".loading-prompt") as HTMLElement | null;
        if (loading) {
            btn.setAttribute("disabled", "true");
            if (textSpan) textSpan.textContent = "生成中...";
            if (loadingDiv) loadingDiv.style.display = "inline-flex";
        } else {
            btn.removeAttribute("disabled");
            if (textSpan) textSpan.textContent = "生成 Prompt";
            if (loadingDiv) loadingDiv.style.display = "none";
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    new NovelToPromptModule();
});

export { NovelToPromptModule };


