import { imageToTensor, runModel, tensorToImageWithoutPadding } from "./common";
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

                const tensorResult = imageToTensor(imgElement, processedShape);
                return { input: tensorResult };
            }
        );

        if (!output) return;

        // 使用去除补全的方法
        const outCanvas = tensorToImageWithoutPadding(
            output.tensor,
            imgElement,
            output.paddingInfo
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

upload?.addEventListener("change", async (e: any) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = async () => {
        await preprocessImage(img);
    };
    img.src = URL.createObjectURL(file);
});
