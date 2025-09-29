import * as ort from "onnxruntime-web";

// Ensure ONNX Runtime Web fetches WASM assets from Vite's public folder
// ort.env.wasm.wasmPaths = "/onnxruntime-web/";

const inputCanvas: HTMLCanvasElement = document.getElementById("inputCanvas") as HTMLCanvasElement;
const outputCanvas: HTMLCanvasElement = document.getElementById("outputCanvas") as HTMLCanvasElement;
const upload = document.getElementById("upload");
// Resolve ONNX asset via Vite so it works in dev/build (avoids 404s)
const modelUrl = new URL("/models/AnimeGANv2_Hayao.onnx", import.meta.url).href;

async function initSession() {
    let session;
    try {
        // Try WebNN
        session = await ort.InferenceSession.create(modelUrl, {
            // executionProviders: ["webnn"],
        });
        console.log("Using WebNN backend");
    } catch (e1) {
        console.warn("WebNN session creation failed, trying WebGPU...", e1);
        try {
            session = await ort.InferenceSession.create(modelUrl, {
                executionProviders: ["webgpu"],
            });
            console.log("Using WebGPU backend");
        } catch (e2) {
            console.warn("WebGPU session creation failed, falling back to WASM...", e2);
            session = await ort.InferenceSession.create(modelUrl, {
                executionProviders: ["wasm"],
            });
            console.log("Using WASM backend");
        }
    }
    return session;
}

function preprocessImage(img: CanvasImageSource, size = 256) {
    const ctx = inputCanvas.getContext("2d");
    if (!ctx) return;
    inputCanvas.width = size;
    inputCanvas.height = size;
    ctx.drawImage(img, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);

    const float32Data = new Float32Array(size * size * 3);
    for (let i = 0; i < size * size; i++) {
        float32Data[i * 3] = imageData.data[i * 4] / 255.0; // R
        float32Data[i * 3 + 1] = imageData.data[i * 4 + 1] / 255.0; // G
        float32Data[i * 3 + 2] = imageData.data[i * 4 + 2] / 255.0; // B
    }
    // Use NHWC layout to match model expectation: [1, H, W, 3]
    return new ort.Tensor("float32", float32Data, [1, size, size, 3]);
}

function renderOutput(tensor: ort.TypedTensor<"float32">, size = 256) {
    if (!outputCanvas) return;
    const ctx = outputCanvas.getContext("2d");
    if (!ctx) return;
    outputCanvas.width = size;
    outputCanvas.height = size;

    const data = tensor.data;
    const imageData = ctx.createImageData(size, size);

    for (let i = 0; i < size * size; i++) {
        imageData.data[i * 4] = Math.min(255, Math.max(0, data[i * 3] * 255));
        imageData.data[i * 4 + 1] = Math.min(
            255,
            Math.max(0, data[i * 3 + 1] * 255)
        );
        imageData.data[i * 4 + 2] = Math.min(
            255,
            Math.max(0, data[i * 3 + 2] * 255)
        );
        imageData.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
}

let session = await initSession();

upload?.addEventListener("change", async (e: any) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = async () => {
        const inputTensor = preprocessImage(img);
        if (!inputTensor) return;
        // session.run expects an input map: { [inputName]: tensor }
        const feeds: Record<string, ort.Tensor> = {};
        feeds[session.inputNames[0]] = inputTensor;
        const output = await session.run(feeds);
        const outputTensor = output[session.outputNames[0]];
        renderOutput(outputTensor as ort.TypedTensor<"float32">);
    };
    img.src = URL.createObjectURL(file);
});
