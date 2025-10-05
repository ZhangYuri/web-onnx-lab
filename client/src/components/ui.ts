/**
 * 可复用的UI组件
 */

export class UIComponents {
    /**
     * 显示加载状态
     * @param button 按钮元素
     * @param isLoading 是否加载中
     */
    static setLoadingState(button: HTMLButtonElement, isLoading: boolean): void {
        const btnText = button.querySelector('.btn-text') as HTMLElement;
        const loading = button.querySelector('.loading') as HTMLElement;
        
        if (isLoading) {
            button.disabled = true;
            if (btnText) btnText.style.display = 'none';
            if (loading) loading.style.display = 'flex';
        } else {
            button.disabled = false;
            if (btnText) btnText.style.display = 'inline';
            if (loading) loading.style.display = 'none';
        }
    }

    /**
     * 显示错误消息
     * @param message 错误消息
     * @param container 容器元素
     */
    static showError(message: string, container: HTMLElement): void {
        const errorElement = container.querySelector('.error-message') as HTMLElement;
        const successElement = container.querySelector('.success-message') as HTMLElement;
        
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
        
        if (successElement) {
            successElement.style.display = 'none';
        }
    }

    /**
     * 显示成功消息
     * @param message 成功消息
     * @param container 容器元素
     */
    static showSuccess(message: string, container: HTMLElement): void {
        const successElement = container.querySelector('.success-message') as HTMLElement;
        const errorElement = container.querySelector('.error-message') as HTMLElement;
        
        if (successElement) {
            successElement.textContent = message;
            successElement.style.display = 'block';
        }
        
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    }

    /**
     * 隐藏所有消息
     * @param container 容器元素
     */
    static hideMessages(container: HTMLElement): void {
        const errorElement = container.querySelector('.error-message') as HTMLElement;
        const successElement = container.querySelector('.success-message') as HTMLElement;
        
        if (errorElement) errorElement.style.display = 'none';
        if (successElement) successElement.style.display = 'none';
    }

    /**
     * 更新图片预览
     * @param imageUrl 图片URL
     * @param container 预览容器
     * @param title 图片标题
     */
    static updateImagePreview(imageUrl: string, container: HTMLElement, title: string = '生成的图像'): void {
        const previewImage = container.querySelector('.preview-image') as HTMLElement;

        if (previewImage) {
            previewImage.innerHTML = `
                <img src="${imageUrl}" alt="${title}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px;" />
            `;
        }
    }

    /**
     * 重置图片预览
     * @param container 预览容器
     */
    static resetImagePreview(container: HTMLElement): void {
        const previewImage = container.querySelector('.preview-image') as HTMLElement;

        if (previewImage) {
            previewImage.innerHTML = `
                <div class="placeholder">
                    <div class="placeholder-icon">🖼️</div>
                    <span>点击"生成图像"开始创作</span>
                </div>
            `;
        }
    }

    /**
     * 验证表单输入
     * @param prompt 文字描述
     * @param imageUrl 图片URL
     * @returns 验证结果
     */
    static validateInput(prompt: string, imageUrl?: string): { isValid: boolean; message?: string } {
        if (!prompt || !prompt.trim()) {
            return { isValid: false, message: '请输入文字描述' };
        }

        if (prompt.length < 5) {
            return { isValid: false, message: '文字描述至少需要5个字符' };
        }

        if (prompt.length > 1000) {
            return { isValid: false, message: '文字描述不能超过1000个字符' };
        }

        if (imageUrl && imageUrl.trim()) {
            try {
                new URL(imageUrl);
            } catch {
                return { isValid: false, message: '请输入有效的图片URL' };
            }
        }

        return { isValid: true };
    }

    /**
     * 格式化文件大小
     * @param bytes 字节数
     * @returns 格式化后的大小
     */
    static formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 防抖函数
     * @param func 要防抖的函数
     * @param delay 延迟时间（毫秒）
     * @returns 防抖后的函数
     */
    static debounce<T extends (...args: any[]) => any>(
        func: T, 
        delay: number
    ): (...args: Parameters<T>) => void {
        let timeoutId: NodeJS.Timeout;
        
        return (...args: Parameters<T>) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    /**
     * 节流函数
     * @param func 要节流的函数
     * @param limit 限制时间（毫秒）
     * @returns 节流后的函数
     */
    static throttle<T extends (...args: any[]) => any>(
        func: T, 
        limit: number
    ): (...args: Parameters<T>) => void {
        let inThrottle: boolean;
        
        return (...args: Parameters<T>) => {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
}
