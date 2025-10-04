import * as ort from "onnxruntime-web";
import { resizeWithPadding, runModel } from "./common";
const upload = document.getElementById("upload");

async function preprocessImage(imgElement: HTMLImageElement) {
    try {
        const output = await runModel(
            "/models/RealESRGAN_x4plus_pc.onnx",
            (modelInputSize) => {
                if (!modelInputSize) return null;
                // 处理动态尺寸和12通道的特殊情况
                const processedShape = modelInputSize.map((i, index) => {
                    if (index === 0) return 1; // batch size
                    if (i === "height") return imgElement.naturalHeight;
                    if (i === "width") return imgElement.naturalWidth;
                    return i;
                }) as [number, number, number, number];

                console.log("处理后的形状:", processedShape);

                // 试用 ImageNet 风格/[-1,1] 归一（很多ESRGAN导出如此）
                const useMinusOneToOne = true; // RealESRGAN 常见输入规范
                const norm = useMinusOneToOne
                    ? { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] }
                    : (undefined as any);
                const tensorResult = imageToTensor(imgElement, processedShape, {
                    colorOrder: "BGR",
                    scaleTo01: true,
                    // mean: norm?.mean as any,
                    // std: norm?.std as any,
                });
                return { input: tensorResult };
            }
        );

        if (!output) return;

        debugColorChannels(output.tensor, "模型输出");

        // 使用去除补全的方法
        const outCanvas = smartRealesrganPostProcess(
            output.tensor,
            imgElement,
            output.paddingInfo,

        );
        outCanvas.style.margin = "10px 0 0 0";
        // 显示原始图像进行对比
        const originalCanvas = document.createElement("canvas");
        const originalCtx = originalCanvas.getContext("2d")!;
        originalCanvas.width = imgElement.width;
        originalCanvas.height = imgElement.height;
        originalCtx.drawImage(imgElement, 0, 0);
        originalCanvas.style.margin = "10px 10px 0 0";

        document.body.appendChild(originalCanvas);
        document.body.appendChild(outCanvas);
    } catch (error) {
        console.error("处理图像时出错:", error);
    }
}

function debugColorChannels(tensor: ort.Tensor, name: string) {
    const data = tensor.data as Float32Array;
    const [_, channels, height, width] = tensor.dims;
    const planeSize = height * width;

    console.log(`=== ${name} 颜色通道调试 ===`);

    for (let c = 0; c < Math.min(channels, 3); c++) {
        let min = Infinity,
            max = -Infinity,
            sum = 0;
        const channelData = data.slice(c * planeSize, (c + 1) * planeSize);

        for (let i = 0; i < channelData.length; i++) {
            const val = channelData[i];
            if (val < min) min = val;
            if (val > max) max = val;
            sum += val;
        }

        const channelName = ["Red", "Green", "Blue"][c];
        console.log(
            `${channelName}通道 - 最小值: ${min.toFixed(
                4
            )}, 最大值: ${max.toFixed(4)}, 平均值: ${(
                sum / channelData.length
            ).toFixed(4)}`
        );
    }
}

function smartRealesrganPostProcess(
    tensor: ort.Tensor,
    originalImage: HTMLImageElement,
    paddingInfo?: any
): HTMLCanvasElement {
    const [_, channels, height, width] = tensor.dims;
    const data = tensor.data as Float32Array;
    const planeSize = width * height;
    
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCanvas.width = width;
    tempCanvas.height = height;
    const imageData = tempCtx.createImageData(width, height);
    
    // 更详细的统计分析
    let rStats = { min: Infinity, max: -Infinity, sum: 0, count: 0 };
    let gStats = { min: Infinity, max: -Infinity, sum: 0, count: 0 };
    let bStats = { min: Infinity, max: -Infinity, sum: 0, count: 0 };
    
    for (let i = 0; i < planeSize; i++) {
        const b = data[i];
        const g = data[i + planeSize];
        const r = data[i + 2 * planeSize];
        
        // 更新红色通道统计
        if (r < rStats.min) rStats.min = r;
        if (r > rStats.max) rStats.max = r;
        rStats.sum += r;
        rStats.count++;
        
        // 更新绿色通道统计
        if (g < gStats.min) gStats.min = g;
        if (g > gStats.max) gStats.max = g;
        gStats.sum += g;
        gStats.count++;
        
        // 更新蓝色通道统计
        if (b < bStats.min) bStats.min = b;
        if (b > bStats.max) bStats.max = b;
        bStats.sum += b;
        bStats.count++;
    }
    
    const rMean = rStats.sum / rStats.count;
    const gMean = gStats.sum / gStats.count;
    const bMean = bStats.sum / bStats.count;
    
    console.log("智能颜色平衡 - 详细统计:", {
        R: { min: rStats.min, max: rStats.max, mean: rMean },
        G: { min: gStats.min, max: gStats.max, mean: gMean },
        B: { min: bStats.min, max: bStats.max, mean: bMean }
    });
    
    // 计算颜色平衡系数
    const targetMean = (rMean + gMean + bMean) / 3;
    const rBalance = targetMean / (rMean || 1);
    const gBalance = targetMean / (gMean || 1);
    const bBalance = targetMean / (bMean || 1);
    
    console.log("颜色平衡系数:", { rBalance, gBalance, bBalance });
    
    // 应用颜色平衡
    for (let i = 0; i < planeSize; i++) {
        let b = data[i] * bBalance;
        let g = data[i + planeSize] * gBalance;
        let r = data[i + 2 * planeSize] * rBalance;
        
        // 找到调整后的全局范围
        const globalMin = Math.min(rStats.min * rBalance, gStats.min * gBalance, bStats.min * bBalance);
        const globalMax = Math.max(rStats.max * rBalance, gStats.max * gBalance, bStats.max * bBalance);
        
        // 归一化到0-255
        const normalize = (val: number) => {
            return ((val - globalMin) / (globalMax - globalMin)) * 255;
        };
        
        imageData.data[i * 4] = Math.min(255, Math.max(0, normalize(r)));     // R
        imageData.data[i * 4 + 1] = Math.min(255, Math.max(0, normalize(g))); // G
        imageData.data[i * 4 + 2] = Math.min(255, Math.max(0, normalize(b))); // B
        imageData.data[i * 4 + 3] = 255;
    }
    
    tempCtx.putImageData(imageData, 0, 0);
    
    // 剩余代码与方案1相同...
    const resultCanvas = document.createElement("canvas");
    const resultCtx = resultCanvas.getContext("2d")!;
    resultCanvas.width = originalImage.width;
    resultCanvas.height = originalImage.height;
    
    if (paddingInfo) {
        const { offsetX, offsetY, scaledWidth, scaledHeight } = paddingInfo;
        const outputOffsetX = (offsetX / paddingInfo.originalInputWidth) * width;
        const outputOffsetY = (offsetY / paddingInfo.originalInputHeight) * height;
        const outputScaledWidth = (scaledWidth / paddingInfo.originalInputWidth) * width;
        const outputScaledHeight = (scaledHeight / paddingInfo.originalInputHeight) * height;
        
        resultCtx.drawImage(
            tempCanvas,
            outputOffsetX, outputOffsetY, outputScaledWidth, outputScaledHeight,
            0, 0, originalImage.width, originalImage.height
        );
    } else {
        resultCtx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, originalImage.width, originalImage.height);
    }
    
    return resultCanvas;
}

function realesrganPostProcess(
    tensor: ort.Tensor,
    originalImage: HTMLImageElement,
    paddingInfo?: any
): HTMLCanvasElement {
    const [_, channels, height, width] = tensor.dims;
    const data = tensor.data as Float32Array;

    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCanvas.width = width;
    tempCanvas.height = height;

    const imageData = tempCtx.createImageData(width, height);

    const planeSize = width * height;

    // 统计各通道范围
    let rMin = Infinity,
        rMax = -Infinity;
    let gMin = Infinity,
        gMax = -Infinity;
    let bMin = Infinity,
        bMax = -Infinity;

    for (let i = 0; i < planeSize; i++) {
        // 在BGR顺序下：0=B, 1=G, 2=R
        const b = data[i]; // 蓝色通道
        const g = data[i + planeSize]; // 绿色通道
        const r = data[i + 2 * planeSize]; // 红色通道

        rMin = Math.min(rMin, r);
        rMax = Math.max(rMax, r);
        gMin = Math.min(gMin, g);
        gMax = Math.max(gMax, g);
        bMin = Math.min(bMin, b);
        bMax = Math.max(bMax, b);
    }

    console.log("强制颜色平衡 - 通道范围:", {
        R: [rMin, rMax],
        G: [gMin, gMax],
        B: [bMin, bMax],
    });

    // 强制归一化到0-255，并平衡颜色
    for (let i = 0; i < planeSize; i++) {
        const b = data[i];
        const g = data[i + planeSize];
        const r = data[i + 2 * planeSize];

        const normalize = (
            val: number,
            min: number,
            max: number,
            enhance = 1.0
        ) => {
            if (max === min) return 128; // 防止除零
            return ((val - min) / (max - min)) * 255 * enhance;
        };

        // 对红色通道进行抑制，蓝色和绿色通道适当增强
        imageData.data[i * 4] = normalize(r, rMin, rMax, 0.8); // R (抑制红色)
        imageData.data[i * 4 + 1] = normalize(g, gMin, gMax, 1.1); // G (稍微增强绿色)
        imageData.data[i * 4 + 2] = normalize(b, bMin, bMax, 1.2); // B (增强蓝色)
        imageData.data[i * 4 + 3] = 255;
    }

    tempCtx.putImageData(imageData, 0, 0);

    // 创建结果canvas
    const resultCanvas = document.createElement("canvas");
    const resultCtx = resultCanvas.getContext("2d")!;
    resultCanvas.width = originalImage.width;
    resultCanvas.height = originalImage.height;

    if (paddingInfo) {
        const { offsetX, offsetY, scaledWidth, scaledHeight } = paddingInfo;
        const outputOffsetX =
            (offsetX / paddingInfo.originalInputWidth) * width;
        const outputOffsetY =
            (offsetY / paddingInfo.originalInputHeight) * height;
        const outputScaledWidth =
            (scaledWidth / paddingInfo.originalInputWidth) * width;
        const outputScaledHeight =
            (scaledHeight / paddingInfo.originalInputHeight) * height;

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
        resultCtx.drawImage(
            tempCanvas,
            0,
            0,
            width,
            height,
            0,
            0,
            originalImage.width,
            originalImage.height
        );
    }

    return resultCanvas;
}

export function imageToTensor(
    img: HTMLImageElement,
    targetShape: [number, number, number, number],
    options?: {
        colorOrder?: "RGB" | "BGR";
        // 将[0,255]缩放到[0,1]
        scaleTo01?: boolean;
        // 可选：按通道减均值除以方差（PyTorch风格）
        mean?: [number, number, number];
        std?: [number, number, number];
    }
): { tensor: ort.Tensor; paddingInfo: any } | null {
    if (!img || !targetShape) return null;

    const [batch, channels, height, width] = targetShape;
    console.log("目标形状:", targetShape, "通道数:", channels);

    const canvas = resizeWithPadding(img, width, height);
    const ctx = canvas.getContext("2d")!;
    const data = ctx.getImageData(0, 0, width, height).data;

    // 计算正确的数据长度
    const totalElements = batch * channels * height * width;
    const colorOrder = options?.colorOrder || "RGB";
    const scaleTo01 = options?.scaleTo01 ?? true;
    const mean = options?.mean;
    const std = options?.std;
    const float32Data = new Float32Array(totalElements);

    const denom = scaleTo01 ? 255.0 : 1.0;
    if (colorOrder === "BGR") {
        for (let i = 0; i < width * height; i++) {
            let b = data[i * 4 + 2] / denom;
            let g = data[i * 4 + 1] / denom;
            let r = data[i * 4] / denom;
            if (mean && std) {
                r = (r - mean[0]) / std[0];
                g = (g - mean[1]) / std[1];
                b = (b - mean[2]) / std[2];
            }
            float32Data[i] = b;
            float32Data[i + width * height] = g;
            float32Data[i + 2 * width * height] = r;
        }
    } else {
        for (let i = 0; i < width * height; i++) {
            let r = data[i * 4] / denom;
            let g = data[i * 4 + 1] / denom;
            let b = data[i * 4 + 2] / denom;
            if (mean && std) {
                r = (r - mean[0]) / std[0];
                g = (g - mean[1]) / std[1];
                b = (b - mean[2]) / std[2];
            }
            float32Data[i] = r;
            float32Data[i + width * height] = g;
            float32Data[i + 2 * width * height] = b;
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

export function tensorToImageWithoutPadding(
    tensor: ort.Tensor,
    originalImage: HTMLImageElement,
    paddingInfo?: any,
    options?: {
        colorOrder?: "RGB" | "BGR";
        clamp01?: boolean;
        outputRange?: "auto" | "0-1" | "-1-1" | "0-255";
        outputScale?: number; // 输出缩放因子，用于压缩异常范围
        channelScales?: [number, number, number]; // RGB/BGR通道独立缩放
        channelOffsets?: [number, number, number]; // RGB/BGR通道独立偏移
    }
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
    const colorOrder = options?.colorOrder || "RGB";
    const clamp01 = options?.clamp01 ?? false;
    const outputRange = options?.outputRange || "auto";
    const outputScale = options?.outputScale ?? 1.0;
    const channelScales = options?.channelScales ?? [1, 1, 1];
    const channelOffsets = options?.channelOffsets ?? [0, 0, 0];

    // 粗略检测输出范围: 0-1 / -1-1 / 0-255
    const sampleCount = Math.min(10000, (data as any).length);
    let localMin = Number.POSITIVE_INFINITY;
    let localMax = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < sampleCount; i++) {
        const v = (data as any)[i] as number;
        if (Number.isFinite(v)) {
            if (v < localMin) localMin = v;
            if (v > localMax) localMax = v;
        }
    }
    type RangeType = "0-1" | "-1-1" | "0-255";
    let rangeType: RangeType = "0-1";
    if (outputRange === "auto") {
        if (
            localMin >= -1.5 &&
            localMax <= 1.5 &&
            (localMin < 0 || localMax <= 1.2)
        ) {
            rangeType = localMin < 0 ? "-1-1" : "0-1";
        } else if (localMax > 2.0 && localMax <= 300 && localMin >= -10) {
            // 排除巨大离群值时误判
            rangeType = "0-255";
        } else {
            // 默认按0-1处理以避免全黑
            rangeType = "0-1";
        }
    } else if (
        outputRange === "0-1" ||
        outputRange === "-1-1" ||
        outputRange === "0-255"
    ) {
        rangeType = outputRange;
    }

    const to255 = (v: number, channel: 0 | 1 | 2) => {
        let x = v;
        // 先应用通道独立缩放和偏移
        x = x * channelScales[channel] + channelOffsets[channel];
        // 再应用全局缩放
        x = x * outputScale;
        if (rangeType === "-1-1") x = x * 0.5 + 0.5;
        else if (rangeType === "0-255") return Math.max(0, Math.min(255, x));
        if (clamp01) x = Math.max(0, Math.min(1, x));
        return x * 255;
    };

    if (dim1 === 1) {
        // 单通道（灰度）图像: [N, 1, H, W]
        for (let i = 0; i < w * h; i++) {
            const grayValue = to255(data[i], 0); // 灰度值用0通道的处理
            imageData.data[i * 4] = grayValue; // R
            imageData.data[i * 4 + 1] = grayValue; // G
            imageData.data[i * 4 + 2] = grayValue; // B
            imageData.data[i * 4 + 3] = 255; // A
        }
    } else if (dim1 === 3) {
        // [N, 3, H, W] - 通道在前
        const planeSize = w * h;
        // 调试：统计每个通道的范围和均值
        let rMin = Infinity,
            rMax = -Infinity,
            gMin = Infinity,
            gMax = -Infinity,
            bMin = Infinity,
            bMax = -Infinity;
        let rSum = 0,
            gSum = 0,
            bSum = 0;
        for (let i = 0; i < planeSize; i++) {
            const c0 = (data as any)[i] as number;
            const c1 = (data as any)[i + planeSize] as number;
            const c2 = (data as any)[i + 2 * planeSize] as number;
            // 按当前 colorOrder 推断 r,g,b 属于哪个通道
            const rVal = colorOrder === "BGR" ? c2 : c0;
            const gVal = c1;
            const bVal = colorOrder === "BGR" ? c0 : c2;
            if (rVal < rMin) rMin = rVal;
            if (rVal > rMax) rMax = rVal;
            rSum += rVal;
            if (gVal < gMin) gMin = gVal;
            if (gVal > gMax) gMax = gVal;
            gSum += gVal;
            if (bVal < bMin) bMin = bVal;
            if (bVal > bMax) bMax = bVal;
            bSum += bVal;
        }
        const denom = planeSize || 1;
        console.log("输出通道统计(NCHW,", colorOrder, "):", {
            R: { min: rMin, max: rMax, mean: rSum / denom },
            G: { min: gMin, max: gMax, mean: gSum / denom },
            B: { min: bMin, max: bMax, mean: bSum / denom },
            rangeType,
        });
        for (let i = 0; i < planeSize; i++) {
            if (colorOrder === "BGR") {
                const b = (data as any)[i] as number;
                const g = (data as any)[i + planeSize] as number;
                const r = (data as any)[i + 2 * planeSize] as number;
                imageData.data[i * 4] = to255(r, 0);
                imageData.data[i * 4 + 1] = to255(g, 1);
                imageData.data[i * 4 + 2] = to255(b, 2);
            } else {
                const r = (data as any)[i] as number;
                const g = (data as any)[i + planeSize] as number;
                const b = (data as any)[i + 2 * planeSize] as number;
                imageData.data[i * 4] = to255(r, 0);
                imageData.data[i * 4 + 1] = to255(g, 1);
                imageData.data[i * 4 + 2] = to255(b, 2);
            }
            imageData.data[i * 4 + 3] = 255;
        }
    } else {
        // NHWC: [N, H, W, C]，也统计一下并渲染
        const planeSize = w * h;
        let rMin = Infinity,
            rMax = -Infinity,
            gMin = Infinity,
            gMax = -Infinity,
            bMin = Infinity,
            bMax = -Infinity;
        let rSum = 0,
            gSum = 0,
            bSum = 0;
        for (let i = 0; i < planeSize; i++) {
            const base = i * 3;
            const r = (data as any)[base] as number;
            const g = (data as any)[base + 1] as number;
            const b = (data as any)[base + 2] as number;
            if (r < rMin) rMin = r;
            if (r > rMax) rMax = r;
            rSum += r;
            if (g < gMin) gMin = g;
            if (g > gMax) gMax = g;
            gSum += g;
            if (b < bMin) bMin = b;
            if (b > bMax) bMax = b;
            bSum += b;
            imageData.data[i * 4] = to255(r, 0);
            imageData.data[i * 4 + 1] = to255(g, 1);
            imageData.data[i * 4 + 2] = to255(b, 2);
            imageData.data[i * 4 + 3] = 255;
        }
        const denom = planeSize || 1;
        console.log("输出通道统计(NHWC):", {
            R: { min: rMin, max: rMax, mean: rSum / denom },
            G: { min: gMin, max: gMax, mean: gSum / denom },
            B: { min: bMin, max: bMax, mean: bSum / denom },
            rangeType,
        });
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

upload?.addEventListener("change", async (e: any) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = async () => {
        await preprocessImage(img);
    };
    img.src = URL.createObjectURL(file);
});
