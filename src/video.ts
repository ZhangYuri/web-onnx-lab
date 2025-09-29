import * as ort from "onnxruntime-web";

const video = document.getElementById("video") as HTMLVideoElement;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
let session: ort.InferenceSession | null = null;

// 质量控制
const qualitySlider = document.getElementById("qualitySlider") as HTMLInputElement;
const qualityValue = document.getElementById("qualityValue") as HTMLSpanElement;
const progressInfo = document.getElementById("progressInfo") as HTMLDivElement;
const progressText = document.getElementById("progressText") as HTMLSpanElement;
const speedText = document.getElementById("speedText") as HTMLSpanElement;
const pauseResumeButton = document.getElementById("pauseResume") as HTMLButtonElement;

qualitySlider.addEventListener("input", () => {
    qualityValue.textContent = qualitySlider.value;
});

// 暂停/恢复处理
let isPaused = false;
let processFrameFunction: (() => void) | null = null;

pauseResumeButton.addEventListener("click", () => {
    isPaused = !isPaused;
    pauseResumeButton.textContent = isPaused ? "继续处理" : "暂停处理";
    if (!isPaused && processFrameFunction) {
        processFrameFunction();
    }
});

// 选择视频
(document.getElementById("videoUpload") as HTMLInputElement).addEventListener(
    "change",
    (e) => {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files[0]) {
            const url = URL.createObjectURL(target.files[0]);
            video.src = url;
        }
    }
);

// 加载模型
(document.getElementById("loadModel") as HTMLButtonElement).addEventListener(
    "click",
    async () => {
        try {
            // 尝试不同的执行提供程序组合
            const executionProviders = [
                ["wasm"],
                ["webnn", "wasm"],
                ["webgpu", "wasm"],
                ["wasm", "cpu"]
            ];

            let lastError = null;
            for (const providers of executionProviders) {
                try {
                    console.log(`尝试执行提供程序: ${providers.join(", ")}`);
                    session = await ort.InferenceSession.create("/models/AnimeGANv3_large_Ghibli_c1_e299.onnx", {
                        executionProviders: providers,
                    });
                    console.log("模型已加载");
                    console.log("使用的执行提供程序:", providers.join(", "));

                    // 输出模型输入形状信息
                    console.log("模型输入信息:");
                    session.inputNames.forEach((inputName, index) => {
                        console.log(`  输入 ${index + 1}: ${inputName}`);
                    });

                    // 尝试获取输入形状信息
                    try {
                        const inputMetadata = session.inputMetadata;
                        console.log("模型输入形状详情:");
                        Object.keys(inputMetadata).forEach(inputName => {
                            const metadata = inputMetadata[inputName as keyof typeof inputMetadata];
                            if (metadata && typeof metadata === 'object' && 'dims' in metadata) {
                                console.log(`  ${inputName}:`, {
                                    shape: (metadata as any).dims,
                                    type: (metadata as any).type
                                });
                            } else {
                                console.log(`  ${inputName}: 无法获取形状信息`);
                            }
                        });
                    } catch (error) {
                        console.log("无法获取详细输入形状信息:", error);
                    }

                    console.log("模型输出信息:", session.outputNames);
                    break;
                } catch (err) {
                    console.warn(`执行提供程序 ${providers.join(", ")} 失败:`, err);
                    lastError = err;
                }
            }

            if (!session) {
                throw lastError || new Error("所有执行提供程序都失败了");
            }
        } catch (error) {
            console.warn("模型加载失败：", error);
            alert("模型加载失败，请检查浏览器兼容性或尝试刷新页面");
        }
    }
);

// 开始逐帧卡通化
(document.getElementById("start") as HTMLButtonElement).addEventListener(
    "click",
    async () => {
        if (!session) {
            alert("请先加载模型");
            return;
        }
        if (!video || !canvas) return;

        // 暂停视频，准备逐帧处理
        video.pause();
        console.log("视频已暂停，开始逐帧处理模式");

        // 设置canvas尺寸并添加调试信息
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        console.log(`Canvas尺寸设置为: ${canvas.width}x${canvas.height}`);
        console.log(`视频尺寸: ${video.videoWidth}x${video.videoHeight}`);
        
        // 确保canvas样式尺寸与内容尺寸匹配
        canvas.style.width = `${video.videoWidth}px`;
        canvas.style.height = `${video.videoHeight}px`;

        // 添加处理状态指示
        const startButton = document.getElementById("start") as HTMLButtonElement;
        const originalText = startButton.textContent;
        startButton.textContent = "处理中...";
        startButton.disabled = true;

        let frameCount = 0;
        const startTime = Date.now();
        let isProcessing = false;
        let currentTime = 0;
        const frameDuration = 1 / 30; // 假设30fps，每帧1/30秒
        
        // 显示进度信息和控制按钮
        progressInfo.style.display = "block";
        pauseResumeButton.style.display = "inline-block";

        async function processFrame() {
            if (currentTime >= video.duration) {
                // 处理完成，恢复按钮状态
                startButton.textContent = originalText;
                startButton.disabled = false;
                progressInfo.style.display = "none";
                pauseResumeButton.style.display = "none";
                console.log(`处理完成，共处理 ${frameCount} 帧，耗时 ${Date.now() - startTime}ms`);
                return;
            }

            if (isProcessing || isPaused) {
                return;
            }

            isProcessing = true;

            try {
                // 设置视频到当前时间点
                video.currentTime = currentTime;
                
                // 等待视频帧更新
                await new Promise(resolve => {
                    const onSeeked = () => {
                        video.removeEventListener('seeked', onSeeked);
                        resolve(void 0);
                    };
                    video.addEventListener('seeked', onSeeked);
                });

                // 获取当前视频帧
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d')!;
                tempCanvas.width = video.videoWidth;
                tempCanvas.height = video.videoHeight;
                
                tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
                const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

                const inputTensor = preprocess(imageData);
                
                const output = await session!.run({
                    [session!.inputNames[0]]: inputTensor,
                });
                const result = output[session!.outputNames[0]] as ort.Tensor;

                // 将结果绘制到主canvas
                drawOutput(ctx, result);
                frameCount++;

                // 更新进度信息
                const elapsedTime = (Date.now() - startTime) / 1000;
                const currentFPS = frameCount / elapsedTime;
                const progress = ((currentTime / video.duration) * 100).toFixed(1);
                progressText.textContent = `${frameCount} 帧 (${progress}%)`;
                speedText.textContent = `${currentFPS.toFixed(1)} FPS`;

                // 每处理5帧显示一次进度
                if (frameCount % 5 === 0) {
                    console.log(`已处理 ${frameCount} 帧，进度: ${progress}%，速度: ${currentFPS.toFixed(1)} FPS`);
                }

                // 移动到下一帧
                currentTime += frameDuration;
                isProcessing = false;
                
                // 继续处理下一帧
                setTimeout(() => {
                    if (!isPaused) {
                        processFrame();
                    }
                }, 100); // 100ms延迟，让用户能看到效果
            } catch (error) {
                console.error("处理帧时出错:", error);
                isProcessing = false;
                startButton.textContent = originalText;
                startButton.disabled = false;
            }
        }

        // 开始逐帧处理
        console.log("开始逐帧处理...");
        processFrameFunction = processFrame;
        processFrame();
    }
);

// 预处理：ImageData -> Tensor [1,H,W,3] (NHWC格式)
function preprocess(imageData: ImageData): ort.Tensor {
    // 标准化图像尺寸到模型期望的尺寸（通常是512x512）
    const targetSize = 512;
    const resizedData = resizeImageData(imageData, targetSize, targetSize);
    
    const float32Data = new Float32Array(targetSize * targetSize * 3);
    const qualityFactor = parseFloat(qualitySlider.value);

    for (let i = 0; i < targetSize * targetSize; i++) {
        // 归一化到[-1, 1]范围，应用质量控制
        const r = (resizedData.data[i * 4 + 0] / 255.0) * 2.0 - 1.0;
        const g = (resizedData.data[i * 4 + 1] / 255.0) * 2.0 - 1.0;
        const b = (resizedData.data[i * 4 + 2] / 255.0) * 2.0 - 1.0;
        
        // 应用质量控制：降低强度可以减少扭曲
        float32Data[i * 3 + 0] = r * qualityFactor;
        float32Data[i * 3 + 1] = g * qualityFactor;
        float32Data[i * 3 + 2] = b * qualityFactor;
    }

    return new ort.Tensor("float32", float32Data, [1, targetSize, targetSize, 3]);
}

// 图像尺寸调整函数
function resizeImageData(imageData: ImageData, newWidth: number, newHeight: number): ImageData {
    const { data, width, height } = imageData;
    const newData = new Uint8ClampedArray(newWidth * newHeight * 4);
    
    const scaleX = width / newWidth;
    const scaleY = height / newHeight;
    
    for (let y = 0; y < newHeight; y++) {
        for (let x = 0; x < newWidth; x++) {
            const sourceX = Math.floor(x * scaleX);
            const sourceY = Math.floor(y * scaleY);
            const sourceIndex = (sourceY * width + sourceX) * 4;
            const targetIndex = (y * newWidth + x) * 4;
            
            newData[targetIndex + 0] = data[sourceIndex + 0]; // R
            newData[targetIndex + 1] = data[sourceIndex + 1]; // G
            newData[targetIndex + 2] = data[sourceIndex + 2]; // B
            newData[targetIndex + 3] = data[sourceIndex + 3]; // A
        }
    }
    
    return new ImageData(newData, newWidth, newHeight);
}

// 后处理：Tensor -> Canvas
function drawOutput(ctx: CanvasRenderingContext2D, tensor: ort.Tensor) {
    const [, h, w] = tensor.dims;
    const data = tensor.data as Float32Array;
    
    // 创建512x512的临时图像数据
    const tempImageData = ctx.createImageData(w, h);

    for (let i = 0; i < w * h; i++) {
        // 从[-1, 1]范围转换回[0, 255]
        const r = Math.min(255, Math.max(0, ((data[i * 3 + 0] + 1.0) / 2.0) * 255));
        const g = Math.min(255, Math.max(0, ((data[i * 3 + 1] + 1.0) / 2.0) * 255));
        const b = Math.min(255, Math.max(0, ((data[i * 3 + 2] + 1.0) / 2.0) * 255));
        
        tempImageData.data[i * 4 + 0] = r;
        tempImageData.data[i * 4 + 1] = g;
        tempImageData.data[i * 4 + 2] = b;
        tempImageData.data[i * 4 + 3] = 255;
    }

    // 应用平滑处理以减少噪点
    const smoothedData = applySmoothing(tempImageData);
    
    // 将512x512的图像调整到canvas的实际尺寸
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    
    // 创建临时canvas来调整尺寸
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCanvas.width = w;
    tempCanvas.height = h;
    tempCtx.putImageData(smoothedData, 0, 0);
    
    // 清除主canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // 将调整后的图像绘制到主canvas
    ctx.drawImage(tempCanvas, 0, 0, w, h, 0, 0, canvasWidth, canvasHeight);
}

// 应用平滑处理以减少噪点
function applySmoothing(imageData: ImageData): ImageData {
    const { data, width, height } = imageData;
    const smoothedData = new Uint8ClampedArray(data.length);
    
    // 复制原始数据
    smoothedData.set(data);
    
    // 简单的3x3高斯模糊
    const kernel = [
        [1, 2, 1],
        [2, 4, 2],
        [1, 2, 1]
    ];
    const kernelSum = 16;
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let r = 0, g = 0, b = 0;
            
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const pixelIndex = ((y + ky) * width + (x + kx)) * 4;
                    const weight = kernel[ky + 1][kx + 1];
                    
                    r += data[pixelIndex + 0] * weight;
                    g += data[pixelIndex + 1] * weight;
                    b += data[pixelIndex + 2] * weight;
                }
            }
            
            const pixelIndex = (y * width + x) * 4;
            smoothedData[pixelIndex + 0] = Math.min(255, Math.max(0, r / kernelSum));
            smoothedData[pixelIndex + 1] = Math.min(255, Math.max(0, g / kernelSum));
            smoothedData[pixelIndex + 2] = Math.min(255, Math.max(0, b / kernelSum));
        }
    }
    
    return new ImageData(smoothedData, width, height);
}
