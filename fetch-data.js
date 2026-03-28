import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
    console.log("🚀 正在启动自动化浏览器... 请稍候...");
    const browser = await puppeteer.launch({
        headless: false, // 必须为 false 才能显示浏览器窗口供用户人工登录互动
        defaultViewport: null,
        args: ['--start-maximized']
    });

    const page = await browser.newPage();

    // 拦截和监听所有的网络请求响应
    let hasIntercepted = false;

    page.on('response', async (response) => {
        const url = response.url();
        // 匹配公租房的数据接口
        if (url.includes('/api/api/PStruct/GetStatistics') && response.request().method() === 'POST') {
            try {
                const json = await response.json();

                // 确保拦截到的是合法包含所有房源的结构
                if (json && json.Data && json.Data.Lst) {
                    hasIntercepted = true;
                    const houseCount = json.Data.Lst.length;
                    console.log(`\n🎉 拦截成功！嗅探到 ${houseCount} 套浦东公租房数据。`);

                    const outPath = path.join(__dirname, 'src', 'output.json');
                    fs.writeFileSync(outPath, JSON.stringify(json, null, 4), 'utf-8');

                    // 写多一份到上层目录以备不时之需
                    const backupPath = path.join(__dirname, '..', 'output.json');
                    fs.writeFileSync(backupPath, JSON.stringify(json, null, 4), 'utf-8');

                    console.log(`💾 核心数据已被替换吸入本地: ${outPath}`);
                    console.log(`✨ Vite/React 热重载引擎已被激活，看房大屏将会瞬间刷新！`);
                    console.log("👋 抓取工作全线竣工，3秒后将自动关闭爬虫终端...");

                    setTimeout(async () => {
                        await browser.close();
                        process.exit(0);
                    }, 3000);
                }
            } catch (err) {
                // 部分预检请求或响应格式非json会报错，直接忽略即可
            }
        }
    });

    console.log("👉 【等待您的操作】新浏览器窗口已弹生。");
    console.log("👉 请完成登录并在系统内随意浏览查勘页面，本魔术脚本会自动嗅探接口中的大地图信息...");

    // 导航到目标看房页面
    await page.goto('https://select.pdgzf.com/addrSel', { waitUntil: 'domcontentloaded' });

})();
