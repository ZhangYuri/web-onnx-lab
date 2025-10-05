import os
import re

def split_novel(input_file: str, output_dir: str):
    # 读取小说全文
    with open(input_file, 'r', encoding='utf-8') as f:
        text = f.read()

    # 使用“长横线分隔符”作为切割标志
    # 匹配至少30个连续的“-”或“—”作为分隔线
    parts = re.split(r'-{30,}|—{10,}', text)

    # 去掉首尾的空白块
    parts = [p.strip() for p in parts if p.strip()]

    os.makedirs(output_dir, exist_ok=True)

    for i, content in enumerate(parts, start=1):
        output_path = os.path.join(output_dir, f"{i}.txt")
        with open(output_path, 'w', encoding='utf-8') as out_f:
            out_f.write(content)
        print(f"✅ 已输出: {output_path}")

    print(f"\n🎉 共输出 {len(parts)} 个片段文件至目录: {output_dir}")

if __name__ == "__main__":
    input_filename = input("请输入要分割的小说文件名 (例如: daomubiji.txt): ").strip()
    output_directory = "output"
    split_novel(input_filename, output_directory)
