# PyTorch to ONNX Converter

一个用于将PyTorch模型转换为ONNX格式的简单工具，特别针对Real-ESRGAN图像超分辨率模型进行了优化。

## 功能特性

- 🔄 支持PyTorch模型到ONNX格式转换
- 🖼️ 专门优化Real-ESRGAN模型转换
- 📦 自动处理不同模型格式（state_dict、params_ema）
- 🎯 支持动态输入尺寸
- 💻 针对PC端优化

## 快速开始

### 安装依赖

```bash
# 使用uv（推荐）
uv sync

# 或使用pip
pip install -r requirements.txt
```

### 使用方法

1. **准备模型文件**：将你的PyTorch模型文件放在项目根目录
2. **运行转换**：
   ```bash
   uv run python toOnnx.py
   ```
3. **获取结果**：转换后的ONNX模型将保存在当前目录

## 支持的模型格式

- ✅ Real-ESRGAN x2plus 模型
- ✅ Real-ESRGAN x4plus 模型
- ✅ 标准PyTorch state_dict格式
- ✅ EMA参数格式（params_ema）

## 输出文件

- `RealESRGAN_x2plus_pc.onnx` - 转换后的ONNX模型
- 支持动态输入尺寸
- 输入：3通道RGB图像
- 输出：超分辨率RGB图像

## 项目结构

```
classify/
├── toOnnx.py              # 主转换脚本
├── requirements.txt       # 项目依赖
├── README.md             # 项目说明
├── pytorch_model.pt      # PyTorch模型文件
└── RealESRGAN_*.onnx     # 转换后的ONNX模型
```

## 依赖说明

项目仅包含必要的依赖包：
- `torch` - PyTorch核心
- `torchvision` - 计算机视觉工具
- `onnx` - ONNX格式支持
- `pillow` - 图像处理
- `opencv-python` - 图像处理

## 注意事项

- 确保PyTorch模型文件格式正确
- 转换过程可能需要几分钟时间
- 生成的ONNX模型文件较大（约60-70MB）
- 支持GPU加速（如果可用）

## 故障排除

如果遇到模型加载错误，请检查：
1. 模型文件是否存在
2. 模型格式是否支持
3. 输入通道数是否正确（通常为3通道RGB）

---

*简单、高效、专注的PyTorch到ONNX转换工具*
