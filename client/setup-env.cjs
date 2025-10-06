#!/usr/bin/env node

/**
 * 环境变量快速设置脚本
 * 使用方法: npm run setup-env
 */

const fs = require('fs');
const path = require('path');

const envExamplePath = path.join(__dirname, 'env.example');
const envPath = path.join(__dirname, '.env');

console.log('🔧 环境变量设置向导');
console.log('==================');

// 检查是否已存在.env文件
if (fs.existsSync(envPath)) {
    console.log('⚠️  .env文件已存在');
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('是否要覆盖现有配置？(y/N): ', (answer) => {
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            createEnvFile();
        } else {
            console.log('❌ 取消设置');
        }
        rl.close();
    });
} else {
    createEnvFile();
}

function createEnvFile() {
    try {
        // 读取示例文件
        if (!fs.existsSync(envExamplePath)) {
            console.error('❌ 未找到 env.example，请先提交示例文件');
            process.exit(1);
        }
        const envExample = fs.readFileSync(envExamplePath, 'utf8');

        // 创建.env文件
        fs.writeFileSync(envPath, envExample);

        console.log('✅ .env文件创建成功！');
        console.log('');
        console.log('📝 请编辑 .env 文件，填入真实的 API 信息：');
        console.log('   - VITE_DOUBAO_BASE_URL: 豆包API地址');
        console.log('   - VITE_DEEPSEEK_BASE_URL: DeepSeek API地址');
        console.log('   - VITE_SERVER_BASE_URL: 后端API地址');
        console.log('   - VITE_DOUBAO_MODEL: 豆包API模型');
        console.log('   - VITE_DEEPSEEK_MODEL: DeepSeek API模型');
        console.log('');
        console.log('🚨 重要提醒：');
        console.log('   1. 请立即更换已泄露的API密钥');
        console.log('   2. 不要将 .env 文件提交到Git');
        console.log('   3. 配置完成后重启开发服务器');
    } catch (error) {
        console.error('❌ 创建.env文件失败:', error.message);
        process.exit(1);
    }
}
