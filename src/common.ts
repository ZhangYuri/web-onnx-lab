import * as ort from "onnxruntime-web";

let session: ort.InferenceSession | null = null;

export async function runModel(
    modelPath: string,
    inputHandler: (modelInputSize: readonly (number | string)[]) => null | {
        [key: string]: { tensor: ort.Tensor; paddingInfo: any } | null;
    }
) {
    try {
        let lastError = null;

        if (!session) {
            // 尝试不同的执行提供程序组合
            const executionProviders = [
                ["webnn", "wasm"],
                ["webgpu", "wasm"],
                ["wasm", "cpu"],
            ];
            console.log(`模型地址: ${modelPath}`);

            for (const providers of executionProviders) {
                try {
                    console.log(`尝试执行提供程序: ${providers.join(", ")}`);
                    session = await ort.InferenceSession.create(modelPath, {
                        executionProviders: providers,
                    });
                    console.log("模型已加载", providers.join(", "));

                    // 输出模型输入形状信息
                    console.log("模型输入信息:", session.inputNames);

                    // 方法1: 尝试通过 session.inputMetadata
                    try {
                        const inputMetadata = session.inputMetadata;
                        console.log("模型输入形状详情:", inputMetadata);
                    } catch (error) {
                        console.log("方法1失败:", error);
                    }

                    console.log("模型输出信息:", session.outputNames);
                    break;
                } catch (err) {
                    console.warn(
                        `执行提供程序 ${providers.join(", ")} 失败:`,
                        err
                    );
                    lastError = err;
                }
            }
        }

        if (!session) {
            throw lastError || new Error("所有执行提供程序都失败了");
        }

        try {
            // 尝试从inputMetadata获取形状信息
            let shape: number[] | null = null;
            try {
                const inputMetadata = session.inputMetadata;
                const firstInputName = 0;
                const metadata =
                    inputMetadata[firstInputName as keyof typeof inputMetadata];
                if (
                    metadata &&
                    typeof metadata === "object" &&
                    "shape" in metadata
                ) {
                    shape = (metadata as any).shape;
                    console.log("从inputMetadata获取到形状:", shape);
                }
            } catch (error) {
                console.log("无法从inputMetadata获取形状:", error);
            }

            // 如果无法获取形状，使用默认形状
            if (!shape) {
                shape = [1, 3, 512, 512]; // 默认形状
                console.log("使用默认形状:", shape);
            }

            const input = inputHandler(shape);
            if (!input || Object.values(input).some((value) => value === null))
                return;
            console.log("input:", input);

            // 提取tensor和paddingInfo
            const tensorInput: { [key: string]: ort.Tensor } = {};
            let inputPaddingInfo: any = null;

            Object.keys(input).forEach((key) => {
                const value = input[key];
                if (value && value.tensor) {
                    tensorInput[key] = value.tensor;
                    if (value.paddingInfo) {
                        inputPaddingInfo = value.paddingInfo;
                    }
                }
            });

            const results = await session.run(tensorInput);
            const output = results[session.outputNames[0]]; // "output" 对应模型里的输出名

            // 返回输出tensor和paddingInfo
            return { tensor: output, paddingInfo: inputPaddingInfo };
        } catch (error) {
            console.warn("模型运行失败：", error);
            throw error;
        }
    } catch (error) {
        console.warn("模型加载失败：", error);
        throw error;
    }
}

export function resizeWithPadding(
    image: HTMLImageElement,
    targetWidth: number,
    targetHeight: number,
    paddingColor = [0, 0, 0]
) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // 填充背景色
    ctx.fillStyle = `rgb(${paddingColor.join(",")})`;
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    // 计算缩放比例（保持宽高比）
    const scale = Math.min(
        targetWidth / image.width,
        targetHeight / image.height
    );
    const newWidth = image.width * scale;
    const newHeight = image.height * scale;

    // 居中放置缩放后的图像
    const x = (targetWidth - newWidth) / 2;
    const y = (targetHeight - newHeight) / 2;

    ctx.drawImage(image, x, y, newWidth, newHeight);

    // 保存补全信息到canvas的data属性中，用于后续去除补全
    const paddingInfo = {
        originalWidth: image.width,
        originalHeight: image.height,
        originalInputWidth: targetWidth, // 保存原始输入宽度
        originalInputHeight: targetHeight, // 保存原始输入高度
        scale: scale,
        offsetX: x,
        offsetY: y,
        scaledWidth: newWidth,
        scaledHeight: newHeight,
    };

    (canvas as any).paddingInfo = paddingInfo;
    return canvas;
}

/**
 * 从tensor创建去除补全的图像
 * @param tensor 处理后的tensor
 * @param originalImage 原始图像
 * @param paddingInfo 补全信息
 * @returns 去除补全后的canvas
 */
export function tensorToImageWithoutPadding(
    tensor: ort.Tensor,
    originalImage: HTMLImageElement,
    paddingInfo?: any
): HTMLCanvasElement {
    const [_, __, h, w] = tensor.dims;
    const data = tensor.data as Float32Array;

    // 创建临时canvas来存储tensor数据
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCanvas.width = w;
    tempCanvas.height = h;

    const imageData = tempCtx.createImageData(w, h);

    // 将tensor数据转换为图像数据
    // 检查tensor的维度格式
    const [, dim1] = tensor.dims;
    console.log("tensor维度:", tensor.dims);

    if (dim1 === 1) {
        // 单通道（灰度）图像: [N, 1, H, W]
        for (let i = 0; i < w * h; i++) {
            const gray = data[i] * 255;
            imageData.data[i * 4] = gray; // R
            imageData.data[i * 4 + 1] = gray; // G
            imageData.data[i * 4 + 2] = gray; // B
            imageData.data[i * 4 + 3] = 255; // A
        }
    } else if (dim1 === 3) {
        // RGB图像: [N, 3, H, W] - 通道在前
        for (let i = 0; i < w * h; i++) {
            imageData.data[i * 4] = data[i] * 255; // R
            imageData.data[i * 4 + 1] = data[i + w * h] * 255; // G
            imageData.data[i * 4 + 2] = data[i + 2 * w * h] * 255; // B
            imageData.data[i * 4 + 3] = 255; // A
        }
    } else {
        // 格式: [N, H, W, C] - 通道在后
        for (let i = 0; i < w * h; i++) {
            imageData.data[i * 4] = data[i * 3] * 255; // R
            imageData.data[i * 4 + 1] = data[i * 3 + 1] * 255; // G
            imageData.data[i * 4 + 2] = data[i * 3 + 2] * 255; // B
            imageData.data[i * 4 + 3] = 255; // A
        }
    }

    tempCtx.putImageData(imageData, 0, 0);

    // 创建结果canvas
    const resultCanvas = document.createElement("canvas");
    const resultCtx = resultCanvas.getContext("2d")!;
    resultCanvas.width = originalImage.width;
    resultCanvas.height = originalImage.height;

    if (paddingInfo) {
        // 计算在模型输出中的有效区域坐标
        const inputWidth = paddingInfo.originalInputWidth || 224;
        const inputHeight = paddingInfo.originalInputHeight || 224;
        const { offsetX, offsetY, scaledWidth, scaledHeight } = paddingInfo;

        const outputOffsetX = (offsetX / inputWidth) * w;
        const outputOffsetY = (offsetY / inputHeight) * h;
        const outputScaledWidth = (scaledWidth / inputWidth) * w;
        const outputScaledHeight = (scaledHeight / inputHeight) * h;

        resultCtx.drawImage(
            tempCanvas,
            outputOffsetX,
            outputOffsetY,
            outputScaledWidth,
            outputScaledHeight,
            0,
            0,
            originalImage.width,
            originalImage.height
        );
    } else {
        // 如果没有补全信息，直接调整到原始图像尺寸
        resultCtx.drawImage(
            tempCanvas,
            0,
            0,
            w,
            h,
            0,
            0,
            originalImage.width,
            originalImage.height
        );
    }

    return resultCanvas;
}

export function normalizeImageData(
    imageData: { data: any; width: any; height: any },
    method = "0-1"
) {
    const { data, width, height } = imageData;
    const normalizedData = new Float32Array(data.length);

    for (let i = 0; i < data.length; i += 4) {
        // 每4个元素代表一个像素(RGBA)
        const r = data[i]; // 红色通道
        const g = data[i + 1]; // 绿色通道
        const b = data[i + 2]; // 蓝色通道
        // data[i + 3] 是Alpha通道，通常忽略

        switch (method) {
            case "0-1":
                normalizedData[i] = r / 255.0;
                normalizedData[i + 1] = g / 255.0;
                normalizedData[i + 2] = b / 255.0;
                break;

            case "-1-1":
                normalizedData[i] = r / 127.5 - 1.0;
                normalizedData[i + 1] = g / 127.5 - 1.0;
                normalizedData[i + 2] = b / 127.5 - 1.0;
                break;

            case "imagenet":
                // 分别对每个通道应用ImageNet统计量
                normalizedData[i] = (r / 255.0 - 0.485) / 0.229; // R
                normalizedData[i + 1] = (g / 255.0 - 0.456) / 0.224; // G
                normalizedData[i + 2] = (b / 255.0 - 0.406) / 0.225; // B
                break;
        }

        normalizedData[i + 3] = 1.0; // Alpha通道保持为1
    }

    return normalizedData;
}

export function denormalizeImageData(
    normalizedData: string | any[],
    originalMethod = "0-1"
) {
    const imageData = new Uint8ClampedArray(normalizedData.length);

    for (let i = 0; i < normalizedData.length; i += 4) {
        let r = normalizedData[i];
        let g = normalizedData[i + 1];
        let b = normalizedData[i + 2];

        switch (originalMethod) {
            case "0-1":
                r = Math.round(r * 255);
                g = Math.round(g * 255);
                b = Math.round(b * 255);
                break;

            case "-1-1":
                r = Math.round((r + 1.0) * 127.5);
                g = Math.round((g + 1.0) * 127.5);
                b = Math.round((b + 1.0) * 127.5);
                break;

            case "imagenet":
                r = Math.round((r * 0.229 + 0.485) * 255);
                g = Math.round((g * 0.224 + 0.456) * 255);
                b = Math.round((b * 0.225 + 0.406) * 255);
                break;
        }

        // 确保值在0-255范围内
        imageData[i] = Math.min(255, Math.max(0, r));
        imageData[i + 1] = Math.min(255, Math.max(0, g));
        imageData[i + 2] = Math.min(255, Math.max(0, b));
        imageData[i + 3] = 255; // 不透明
    }

    return imageData;
}

export function imageToTensor(
    img: HTMLImageElement,
    targetShape: [number, number, number, number]
): { tensor: ort.Tensor; paddingInfo: any } | null {
    if (!img || !targetShape) return null;

    const [batch, channels, height, width] = targetShape;
    console.log("目标形状:", targetShape, "通道数:", channels);

    const canvas = resizeWithPadding(img, width, height);
    const ctx = canvas.getContext("2d")!;
    const data = ctx.getImageData(0, 0, width, height).data;

    // 计算正确的数据长度
    const totalElements = batch * channels * height * width;
    const float32Data = new Float32Array(totalElements);

    if (channels === 12) {
        // 12通道的特殊处理 - Real-ESRGAN可能需要特定的输入格式
        // 通常包括: RGB + RGB的梯度 + 其他特征
        for (let i = 0; i < width * height; i++) {
            const r = data[i * 4] / 255.0;
            const g = data[i * 4 + 1] / 255.0;
            const b = data[i * 4 + 2] / 255.0;
            
            const baseIndex = i;
            const channelSize = width * height;
            
            // 前3个通道: RGB
            float32Data[baseIndex] = r;
            float32Data[baseIndex + channelSize] = g;
            float32Data[baseIndex + 2 * channelSize] = b;
            
            // 计算梯度特征 (简单的Sobel算子)
            const x = i % width;
            const y = Math.floor(i / width);
            
            // 计算x方向梯度
            const gradX_r = x > 0 ? (data[(i-1) * 4] - data[i * 4]) / 255.0 : 0;
            const gradX_g = x > 0 ? (data[(i-1) * 4 + 1] - data[i * 4 + 1]) / 255.0 : 0;
            const gradX_b = x > 0 ? (data[(i-1) * 4 + 2] - data[i * 4 + 2]) / 255.0 : 0;
            
            // 计算y方向梯度
            const gradY_r = y > 0 ? (data[(i-width) * 4] - data[i * 4]) / 255.0 : 0;
            const gradY_g = y > 0 ? (data[(i-width) * 4 + 1] - data[i * 4 + 1]) / 255.0 : 0;
            const gradY_b = y > 0 ? (data[(i-width) * 4 + 2] - data[i * 4 + 2]) / 255.0 : 0;
            
            // 通道3-5: RGB的x方向梯度
            float32Data[baseIndex + 3 * channelSize] = gradX_r;
            float32Data[baseIndex + 4 * channelSize] = gradX_g;
            float32Data[baseIndex + 5 * channelSize] = gradX_b;
            
            // 通道6-8: RGB的y方向梯度
            float32Data[baseIndex + 6 * channelSize] = gradY_r;
            float32Data[baseIndex + 7 * channelSize] = gradY_g;
            float32Data[baseIndex + 8 * channelSize] = gradY_b;
            
            // 通道9-11: 其他特征（亮度、对比度等）
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            float32Data[baseIndex + 9 * channelSize] = luminance;
            float32Data[baseIndex + 10 * channelSize] = Math.sqrt(gradX_r * gradX_r + gradX_g * gradX_g + gradX_b * gradX_b);
            float32Data[baseIndex + 11 * channelSize] = Math.sqrt(gradY_r * gradY_r + gradY_g * gradY_g + gradY_b * gradY_b);
        }
    } else {
        // 标准3通道处理
        for (let i = 0; i < width * height; i++) {
            float32Data[i] = data[i * 4] / 255.0; // R
            float32Data[i + width * height] = data[i * 4 + 1] / 255.0; // G
            float32Data[i + 2 * width * height] = data[i * 4 + 2] / 255.0; // B
        }
    }

    const tensor = new ort.Tensor("float32", float32Data, [
        batch,
        channels,
        height,
        width,
    ]);
    const paddingInfo = (canvas as any).paddingInfo;

    return { tensor, paddingInfo };
}

export function tensorToImage(tensor: ort.Tensor) {
    const [_, __, h, w] = tensor.dims;
    const data = tensor.data as Float32Array;
    const imageData = new ImageData(w, h);

    for (let i = 0; i < w * h; i++) {
        imageData.data[i * 4] = data[i] * 255; // R
        imageData.data[i * 4 + 1] = data[i + w * h] * 255; // G
        imageData.data[i * 4 + 2] = data[i + 2 * w * h] * 255; // B
        imageData.data[i * 4 + 3] = 255; // A
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.putImageData(imageData, 0, 0);
    return canvas;
}

// 根据图片宽度确定超分倍数
export function determineScaleFactor(originalWidth: number) {
    // 基础策略
    let baseScale = 2; // 默认2倍

    // 1. 获取设备像素比（DPR），这是判断是否为高DPI屏的关键！
    const devicePixelRatio = window.devicePixelRatio || 1;

    // 2. 获取屏幕物理分辨率
    const screenWidth = window.screen.width * devicePixelRatio;
    // const screenHeight = window.screen.height * devicePixelRatio;

    // 3. 简单的用户代理判断（可选）
    const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);

    // 策略1：如果是高性能设备且DPI高，则用4倍
    if (!isMobile && devicePixelRatio >= 2) {
        baseScale = 4;
    }

    // 策略2：如果原图非常小，则尝试用4倍放大更有意义
    if (originalWidth < 400) {
        baseScale = Math.max(baseScale, 4); // 至少4倍
    }

    // 策略3：如果原图已经很大，则2倍足矣
    if (originalWidth > screenWidth / 2) {
        baseScale = 2;
    }

    // 确保返回的倍数是模型支持的（例如 2 或 4）
    return baseScale;
}
