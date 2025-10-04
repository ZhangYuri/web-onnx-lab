# 正确的转换脚本 - 使用官方模型定义
import torch
from basicsr.archs.rrdbnet_arch import RRDBNet
import argparse

def convert_realesrgan_to_onnx():
    # 使用官方模型定义
    model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32)
    
    # 加载权重
    checkpoint = torch.load('RealESRGAN_x4plus.pth', map_location=torch.device('cpu'))
    
    if 'params_ema' in checkpoint:
        model.load_state_dict(checkpoint['params_ema'])
    else:
        model.load_state_dict(checkpoint)
    
    model.eval()
    
    # 动态输入尺寸
    dummy_input = torch.randn(1, 3, 64, 64)
    
    # 导出ONNX
    torch.onnx.export(
        model,
        dummy_input,
        "RealESRGAN_x4plus_pc_correct.onnx",
        export_params=True,
        opset_version=14,
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={
            'input': {2: 'height', 3: 'width'},
            'output': {2: 'height', 3: 'width'}
        },
        # 添加训练模式设置
        training=torch.onnx.TrainingMode.EVAL,
        do_constant_folding=True
    )
    print("转换完成！")

if __name__ == "__main__":
    convert_realesrgan_to_onnx()