import * as fs from "fs";
import { onnx } from "onnx-proto"; // npm install onnx-proto protobufjs

// 常见 web 端支持的算子列表（可扩展）
const supportedOps = new Set([
    "Conv",
    "Relu",
    "MatMul",
    "Add",
    "Reshape",
    "Transpose",
    "BatchNormalization",
    "Concat",
    "Sigmoid",
    "Tanh",
    "LeakyRelu",
    "MaxPool",
    "AveragePool",
    "Gemm",
    "Softmax",
    "Resize",
]);

/**
 * 读取 ONNX 模型并检测算子兼容性
 */
export async function checkOnnxOps(modelPath: string) {
    const buffer = fs.readFileSync(modelPath);
    // onnx-proto exports the root as onnx, but ModelProto is a property of onnx.onnx
    // See: https://github.com/onnx/onnx-proto/blob/main/README.md
    const model = onnx.ModelProto.decode(buffer);

    // Use the correct type for n: onnx.INodeProto, and handle possible undefined opType
    const ops = model.graph?.node?.map((n: onnx.INodeProto) => n.opType ?? "") || [];
    const uniqueOps = Array.from(new Set(ops.filter(op => op))).sort();

    console.log("模型中使用到的算子:");
    uniqueOps.forEach((op) => console.log(" -", op));

    const unsupported = uniqueOps.filter((op) => !supportedOps.has(op));
    console.log("\n⚠️ 不在常见支持列表里的算子:");
    unsupported.forEach((op) => console.log(" -", op));

    return { uniqueOps, unsupported };
}
