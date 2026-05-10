# Tauri 集成浏览器自动化工具技术研究报告

> 研究目标：分析在 Tauri 应用中集成 Playwright、Puppeteer 等浏览器自动化工具的各种方案，以抓取被 Cloudflare 保护的 Nexus Mods 网站。
>
> 研究日期：2025年7月

---

## 目录

1. [Playwright 反检测方案](#1-playwright-反检测方案)
2. [Puppeteer 反检测方案](#2-puppeteer-反检测方案)
3. [Tauri 集成方案](#3-tauri-集成方案)
4. [轻量级方案](#4-轻量级方案)
5. [Cookie 和会话管理](#5-cookie-和会话管理)
6. [综合方案对比表](#6-综合方案对比表)
7. [推荐方案](#7-推荐方案)
8. [参考资源](#8-参考资源)

---

## 1. Playwright 反检测方案

### 1.1 Playwright Stealth 插件原理

Playwright Stealth 插件通过**修改浏览器指纹**来模拟真实浏览器行为。这些插件不是 Playwright 内置功能，而是第三方开发的补丁集合。

**核心原理**：通过注入 JavaScript 脚本覆盖浏览器自动化特征，消除被检测的标志性信号。

**主要修改的检测维度**：

| 检测维度 | 修改内容 | 目的 |
|---------|---------|------|
| `navigator.webdriver` | 设置为 `false` 或 `undefined` | 消除自动化工具标志 |
| `navigator.plugins` | 模拟真实插件列表（通常5个） | 真实浏览器总有插件 |
| `navigator.languages` | 模拟真实语言设置 | 避免空语言列表 |
| WebGL Vendor/Renderer | 修改为真实 GPU 字符串 | 避免 HeadlessChrome 暴露 |
| `window.chrome` | 模拟完整 Chrome 运行时对象 | 包括 `chrome.runtime` 等 API |
| `navigator.platform` | 匹配操作系统 | 避免不一致的平台信息 |
| `navigator.hardwareConcurrency` | 模拟 CPU 核心数 | 避免默认的1核暴露 |
| `navigator.deviceMemory` | 模拟内存大小 | 符合规范的离散值 |
| CDP 标记清除 | 移除 `cdc_`, `$cdc_`, `__webdriver` | 清除 DevTools Protocol 痕迹 |
| User-Agent | 替换 "HeadlessChrome" 为 "Chrome" | 移除无头标识 |
| iframe 一致性 | 修复 `contentWindow` 不一致 | 避免 iframe 检测 |
| Canvas/WebGL 指纹 | 添加自然噪声 | 避免一致的指纹 |

**Python 生态（推荐）**：`playwright-stealth` 维护活跃，使用现代 context-manager API。

**Node.js 生态**：`playwright-extra` + `puppeteer-extra-plugin-stealth` 提供移植版，但维护不如 Python 版活跃。

### 1.2 Playwright Stealth 配置示例

**Python 版本（playwright-stealth）**：

```python
from playwright.sync_api import sync_playwright
from playwright_stealth import stealth_sync

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()
    
    # 应用 stealth 补丁
    stealth_sync(page)
    
    page.goto("https://nexusmods.com")
    print(page.title())
    browser.close()
```

**Node.js 版本（playwright-extra）**：

```javascript
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');

chromium.use(stealth());

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  await page.goto('https://nexusmods.com');
  console.log(await page.title());
  await browser.close();
})();
```

**手动注入 stealth 脚本（Rust + chromiumoxide）**：

```rust
use chromiumoxide::Browser;
use chromiumoxide::fetcher::BrowserFetcher;
use chromiumoxide::cdp::browser_protocol::page::AddScriptToEvaluateOnNewDocumentParams;

// 启动浏览器
let (browser, mut handler) = Browser::launch(
    Browser::builder()
        .headless(false)
        .window_size(1920, 1080)
).await?;

let page = browser.new_page("https://nexusmods.com").await?;

// 注入 stealth 脚本
page.evaluate_on_new_document(r#"
    Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
    Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
    Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
    window.chrome = {
        runtime: { OnInstalledReason: {CHROME_UPDATE: "chrome_update"} },
        app: { isInstalled: false },
        csi: function() {},
        loadTimes: function() {}
    };
"#).await?;
```

### 1.3 处理 Cloudflare Challenge 的最佳实践

Cloudflare 采用多层检测机制，仅使用 stealth 插件往往不足。综合策略如下：

**1. 基础 Stealth 配置**：

```javascript
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  locale: 'en-US',
  timezoneId: 'America/New_York',
  // 模拟真实设备的 colorScheme
  colorScheme: 'light',
  // 模拟 reducedMotion 偏好
  reducedMotion: 'no-preference',
});
```

**2. 行为模拟（关键）**：

```javascript
// 随机延迟函数
const randomDelay = (min, max) => new Promise(r => setTimeout(r, min + Math.random() * (max - min)));

// 模拟人类鼠标移动
async function humanLikeMouseMove(page, x, y) {
  await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 10) });
}

// 页面访问前预热
await page.goto('https://nexusmods.com');
await randomDelay(2000, 5000);

// 模拟滚动
await page.mouse.wheel(0, 300);
await randomDelay(1000, 3000);
```

**3. XVFB + Headed 模式（Linux 服务器）**：

```bash
# 安装 Xvfb
sudo apt-get install xvfb

# 使用 xvfb-run 启动，让浏览器以为有图形界面
xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" node script.js
```

```javascript
// 代码中必须设置 headless: false
const browser = await chromium.launch({ 
  headless: false,  // 关键！配合 xvfb 使用
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
```

**4. 持久化 Context 保存登录状态**：

```javascript
// 首次登录，保存状态
const context = await browser.newContext();
const page = await context.newPage();

// 执行登录流程
await page.goto('https://nexusmods.com/login');
await page.fill('#username', 'your_username');
await page.fill('#password', 'your_password');
await page.click('#login-button');
await page.waitForNavigation();

// 保存完整状态（cookies + localStorage + sessionStorage）
await context.storageState({ path: 'nexus_auth.json' });

// 后续使用保存的状态
const newContext = await browser.newContext({
  storageState: 'nexus_auth.json'
});
// 无需重新登录，直接访问受保护页面
const newPage = await newContext.newPage();
await newPage.goto('https://nexusmods.com/account');
```

### 1.4 Playwright 的 Rust 绑定

Rust 生态有三种方式使用 Playwright：

**1. `playwright-rust`（Node.js 封装）**：

```toml
[dependencies]
playwright = "0.0.20"
tokio = { version = "1", features = ["full"] }
```

```rust
use playwright::Playwright;

#[tokio::main]
async fn main() -> Result<(), playwright::Error> {
    let playwright = Playwright::initialize().await?;
    playwright.prepare()?; // 安装浏览器
    
    let chromium = playwright.chromium();
    let browser = chromium.launcher().headless(true).launch().await?;
    let context = browser.context_builder().build().await?;
    let page = context.new_page().await?;
    
    page.goto_builder("https://nexusmods.com").goto().await?;
    
    let title: String = page.eval("() => document.title").await?;
    println!("Page title: {}", title);
    
    browser.close().await?;
    Ok(())
}
```

**注意**：`playwright-rust` 是 Node.js 驱动的封装，首次运行需要解压驱动，有一定性能开销。

**2. `chromiumoxide`（纯 Rust CDP 驱动）** — 推荐：

```toml
[dependencies]
chromiumoxide = { version = "0.7", features = ["tokio"] }
tokio = { version = "1", features = ["full"] }
futures = "0.3"
```

```rust
use chromiumoxide::{Browser, BrowserConfig};
use futures::StreamExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let (browser, mut handler) = Browser::launch(
        BrowserConfig::builder()
            .headless(false)
            .viewport((1920, 1080))
            .build()?
    ).await?;
    
    // 在后台处理 CDP 事件
    let handle = tokio::spawn(async move {
        while let Some(h) = handler.next().await {
            if h.is_err() { break; }
        }
    });
    
    let page = browser.new_page("https://nexusmods.com").await?;
    
    // 注入 stealth 脚本
    page.evaluate_on_new_document(r#"
        Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
    "#).await?;
    
    let content = page.content().await?;
    println!("Content length: {}", content.len());
    
    browser.close().await?;
    handle.await?;
    Ok(())
}
```

**3. `headless_chrome`（简化 API）**：

```rust
use headless_chrome::{Browser, LaunchOptions};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let browser = Browser::new(LaunchOptions {
        headless: false,
        window_size: Some((1920, 1080)),
        ..Default::default()
    })?;
    
    let tab = browser.new_tab()?;
    tab.navigate_to("https://nexusmods.com")?.wait_until_navigated()?;
    
    let content = tab.get_content()?;
    println!("Content: {}", &content[..500.min(content.len())]);
    
    Ok(())
}
```

### 1.5 Playwright 反检测效果评估

| 检测层级 | Stealth 效果 | 补充措施 |
|---------|------------|---------|
| JavaScript 属性检测（navigator.webdriver 等） | ✅ 优秀 | 插件自动处理 |
| WebGL/Canvas 指纹 | ✅ 良好 | 添加噪声 |
| TLS/JA3 指纹 | ❌ 无法处理 | 需要 curl-impersonate 或代理 |
| IP 信誉 | ❌ 无法处理 | 住宅代理 |
| 行为分析 | ⚠️ 部分有效 | 模拟人类行为 |
| CDP 协议检测 | ⚠️ 部分有效 | 使用 headed 模式 |
| Cloudflare Turnstile | ⚠️ 中等 | 结合代理和行为模拟 |

**关键结论**：Playwright Stealth 对基础指纹检测有效，但面对 Cloudflare 企业级保护时，需要结合代理、行为模拟、TLS 指纹模拟等多层策略。

---

## 2. Puppeteer 反检测方案

### 2.1 puppeteer-extra-plugin-stealth 效果

`puppeteer-extra-plugin-stealth` 是最成熟的反检测解决方案，集成了 40+ 个规避模块。但需要注意：

> ⚠️ **重要更新（2025年2月）**：`puppeteer-extra-plugin-stealth` 已被标记为弃用（deprecated），不再接收针对新检测方法的更新。

**该插件修改的关键点**：

```javascript
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// 使用所有规避模块
puppeteer.use(StealthPlugin());

// 或选择性启用
const stealth = StealthPlugin({
  evasions: {
    'chrome.runtime': true,
    'defaultArgs': true,
    'iframe.contentWindow': true,
    'media.codecs': true,
    'navigator.hardwareConcurrency': true,
    'navigator.languages': true,
    'navigator.permissions': true,
    'navigator.plugins': true,
    'navigator.vendor': true,
    'navigator.webdriver': true,
    'sourceurl': true,
    'user-agent-override': true,
    'webgl.vendor': true,
    'window.outerdimensions': true,
  }
});
puppeteer.use(stealth);
```

### 2.2 Playwright vs Puppeteer 对比

| 维度 | Playwright | Puppeteer |
|------|-----------|-----------|
| **Stealth 插件维护状态** | `playwright-stealth` / `playwright-extra` 仍在维护 | `puppeteer-extra-plugin-stealth` 2025年2月已弃用 |
| **浏览器支持** | Chromium, Firefox, WebKit | 仅 Chromium |
| **并发会话隔离** | Context 级隔离，10+ 会话/进程 | 每进程1个隔离会话 |
| **Context API** | 优秀的原生 Context 管理 | 需手动管理 |
| **自动等待** | 内置智能等待 | 需手动 waitForSelector |
| **代理支持** | 原生内置，支持 per-context | 需通过 args 或插件 |
| **速度（单页面）** | 略慢 | 快约 30% |
| **反检测成熟度** | 生态在追赶 |  historically 更成熟，但现在已停滞 |
| **2026 年推荐度** | ⭐⭐⭐⭐⭐ 新项目的首选 | ⭐⭐⭐ 现有代码库可继续用 |

**2026 年结论**：
- 新项目推荐 **Playwright**，更好的维护状态、更优的 Context 隔离、内置代理支持
- Stealth 插件的弃用使 Puppeteer 的反检测优势减弱
- 面对 Cloudflare 等高级检测，两者都需要额外措施

### 2.3 2026 年新兴替代方案

| 工具 | 特点 | 适用场景 |
|------|------|---------|
| **Nodriver**（Python） | undetected-chromedriver 作者的新作，原生反检测 | Cloudflare + Turnstile |
| **Camoufox**（Firefox） | 二进制级别修补 40+ 检测向量 | 高级反检测需求 |
| **SeleniumBase UC Mode** | 内置 undetected-chromedriver | Python 生态 |
| **chaser-oxide**（Rust） | 协议级 stealth，内存占用 50-100MB | Rust 项目 |

---

## 3. Tauri 集成方案

### 3.1 方案 A：Rust 端通过 std::process::Command 启动 Node.js 脚本

**架构**：Tauri Rust 主进程 → `std::process::Command` → Node.js 运行时 → Playwright 脚本

**实现步骤**：

1. **打包 Node.js 运行时和脚本**：

```bash
# 使用 @yao-pkg/pkg 将 Node.js 脚本打包为独立可执行文件
npm install -g @yao-pkg/pkg
pkg -t node20-win-x64,node20-macos-arm64,node20-linux-x64 scraper.js -o scraper
```

2. **Tauri 配置 `tauri.conf.json`**：

```json
{
  "bundle": {
    "externalBin": ["binaries/scraper"]
  }
}
```

3. **Rust 端代码**：

```rust
// src-tauri/src/lib.rs
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use tauri::Emitter;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[tauri::command]
async fn run_scraper(
    app: tauri::AppHandle,
    url: String,
    task_id: String
) -> Result<String, String> {
    // 获取 sidecar 二进制路径
    let sidecar = app.shell()
        .sidecar("scraper")
        .map_err(|e| e.to_string())?;
    
    let (mut rx, mut child) = sidecar
        .args([&url, &task_id])
        .spawn()
        .map_err(|e| e.to_string())?;
    
    let mut output = String::new();
    
    // 异步读取输出
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let line = String::from_utf8_lossy(&line);
                output.push_str(&line);
                // 向前端发送进度
                app.emit(&format!("scraper:progress:{}", task_id), 
                    serde_json::json!({ "line": line })
                ).ok();
            }
            CommandEvent::Stderr(line) => {
                eprintln!("Scraper error: {}", String::from_utf8_lossy(&line));
            }
            CommandEvent::Terminated(payload) => {
                println!("Scraper exited with code: {:?}", payload.code);
                break;
            }
            _ => {}
        }
    }
    
    Ok(output)
}
```

4. **Node.js 脚本（scraper.js）**：

```javascript
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');

chromium.use(stealth());

async function scrape(url) {
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
        
        // 加载已有会话
        try {
            const fs = require('fs');
            if (fs.existsSync('auth.json')) {
                await context.addInitScript(() => {});
            }
        } catch (e) {}
        
        const page = await context.newPage();
        
        // 模拟人类行为
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(2000 + Math.random() * 3000);
        
        const content = await page.content();
        const cookies = await context.cookies();
        
        // 输出结果到 stdout（Rust 端会捕获）
        console.log(JSON.stringify({
            success: true,
            html: content.substring(0, 50000),
            cookies: cookies,
            title: await page.title()
        }));
        
        // 保存会话
        await context.storageState({ path: 'auth.json' });
        
    } catch (error) {
        console.error(JSON.stringify({ success: false, error: error.message }));
        process.exit(1);
    } finally {
        await browser.close();
    }
}

const url = process.argv[2];
scrape(url);
```

**优缺点**：

| 优点 | 缺点 |
|------|------|
| 简单直接，易于理解 | 需要打包 Node.js 运行时（约 80-100MB） |
| 利用完整的 Playwright 生态 | 进程间通信通过 stdout，效率较低 |
| 无需网络端口 | 需要管理子进程生命周期 |
| 跨平台支持好 | 错误处理较复杂 |

### 3.2 方案 B：使用 tauri-sidecar 模式集成

**架构**：Tauri 应用 → Sidecar 二进制（Node.js 单文件）→ Playwright → 通过 TCP Socket 通信

**实现步骤**：

1. **项目结构**：

```
my-app/
├── src-tauri/
│   ├── binaries/
│   │   └── scraper-x86_64-pc-windows-msvc.exe
│   ├── capabilities/
│   │   └── default.json
│   ├── src/
│   │   └── main.rs
│   └── Cargo.toml
└── scraper/
    └── index.js          # Node.js Playwright 脚本
```

2. **配置 `tauri.conf.json`**：

```json
{
  "bundle": {
    "externalBin": ["binaries/scraper"]
  },
  "plugins": {
    "shell": {
      "scope": [
        {
          "name": "binaries/scraper",
          "sidecar": true,
          "args": true
        }
      ]
    }
  }
}
```

3. **配置权限 `capabilities/default.json`**：

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    {
      "identifier": "shell:allow-execute",
      "allow": [
        {
          "name": "binaries/scraper",
          "sidecar": true,
        }
      ]
    }
  ]
}
```

4. **Rust 端启动和管理 Sidecar**：

```rust
// src-tauri/src/sidecar.rs
use tauri::AppHandle;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;
use std::sync::Arc;

pub struct ScraperSidecar {
    child: Arc<Mutex<Option<tauri_plugin_shell::process::CommandChild>>>,
}

impl ScraperSidecar {
    pub fn new() -> Self {
        Self { child: Arc::new(Mutex::new(None)) }
    }
    
    pub async fn start(&self, app: &AppHandle) -> Result<tokio::sync::mpsc::Receiver<CommandEvent>, String> {
        let sidecar = app.shell()
            .sidecar("scraper")
            .map_err(|e| format!("Failed to get sidecar: {}", e))?;
        
        let (mut rx, child) = sidecar
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;
        
        *self.child.lock().await = Some(child);
        
        Ok(rx)
    }
    
    pub async fn stop(&self) -> Result<(), String> {
        if let Some(mut child) = self.child.lock().await.take() {
            child.kill().map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

// 在 main.rs 中使用
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            tauri::async_runtime::spawn(async move {
                let sidecar = ScraperSidecar::new();
                let mut rx = sidecar.start(&app_handle).await.unwrap();
                
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            app_handle.emit("scraper:output", 
                                String::from_utf8_lossy(&line).to_string()
                            ).ok();
                        }
                        _ => {}
                    }
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

5. **前端调用**：

```typescript
import { Command } from '@tauri-apps/plugin-shell';
import { listen } from '@tauri-apps/api/event';

// 监听 scraper 输出
await listen<string>('scraper:output', (event) => {
  const data = JSON.parse(event.payload);
  console.log('Scraper result:', data);
});

// 启动 sidecar
const command = Command.sidecar('binaries/scraper');
const output = await command.execute();
console.log('Sidecar output:', output);
```

**优缺点**：

| 优点 | 缺点 |
|------|------|
| Tauri 原生支持的集成方式 | 包体积增加 80-100MB |
| 自动处理跨平台二进制命名 | 需要打包 Node.js 运行时 |
| 内置 stdin/stdout 通信 | 通信方式较基础 |
| 自动随应用分发 | Sidecar 崩溃需要重启逻辑 |

### 3.3 方案 C：内嵌本地服务器，通过 HTTP API 调用

**架构**：Tauri 应用 → 启动本地 HTTP 服务器（Node.js/Express）→ REST API → Playwright

**实现步骤**：

1. **Node.js HTTP 服务器（scraper-server.js）**：

```javascript
const express = require('express');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');

chromium.use(stealth());

const app = express();
app.use(cors());
app.use(express.json());

let browser = null;

// 启动浏览器
async function getBrowser() {
    if (!browser) {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox']
        });
    }
    return browser;
}

// 抓取接口
app.post('/api/scrape', async (req, res) => {
    const { url, cookies: inputCookies, waitFor } = req.body;
    
    try {
        const browser = await getBrowser();
        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 }
        });
        
        // 注入已有 cookies
        if (inputCookies && inputCookies.length > 0) {
            await context.addCookies(inputCookies);
        }
        
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        
        if (waitFor) {
            await page.waitForSelector(waitFor, { timeout: 30000 });
        }
        
        const html = await page.content();
        const cookies = await context.cookies();
        const title = await page.title();
        
        await context.close();
        
        res.json({ success: true, html, cookies, title });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cookie 验证接口
app.post('/api/validate-cookies', async (req, res) => {
    const { url, cookies: inputCookies } = req.body;
    
    try {
        const browser = await getBrowser();
        const context = await browser.newContext();
        await context.addCookies(inputCookies);
        
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        const isAuthenticated = await page.evaluate(() => {
            return !!document.querySelector('.user-avatar'); // 根据实际页面调整
        });
        
        await context.close();
        
        res.json({ valid: isAuthenticated });
    } catch (error) {
        res.status(500).json({ valid: false, error: error.message });
    }
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({ status: 'ok', browser: !!browser });
});

// 找到可用端口
const findPort = (start) => new Promise((resolve) => {
    const server = require('net').createServer();
    server.listen(start, () => {
        const port = server.address().port;
        server.close(() => resolve(port));
    });
    server.on('error', () => resolve(findPort(start + 1)));
});

(async () => {
    const port = await findPort(8765);
    app.listen(port, () => {
        console.log(`Scraper server running on port ${port}`);
    });
})();
```

2. **Rust 端启动服务器**：

```rust
// src-tauri/src/server.rs
use tauri::AppHandle;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use std::sync::atomic::{AtomicU16, Ordering};

static SERVER_PORT: AtomicU16 = AtomicU16::new(0);

pub async fn start_scraper_server(app: &AppHandle) -> Result<u16, String> {
    let sidecar = app.shell()
        .sidecar("scraper-server")
        .map_err(|e| e.to_string())?;
    
    let (mut rx, _child) = sidecar
        .spawn()
        .map_err(|e| e.to_string())?;
    
    // 等待服务器启动并获取端口
    while let Some(event) = rx.recv().await {
        if let CommandEvent::Stdout(line) = event {
            let line = String::from_utf8_lossy(&line);
            if line.contains("running on port") {
                let port = line.split("port ").nth(1)
                    .and_then(|s| s.trim().parse::<u16>().ok())
                    .ok_or("Failed to parse port")?;
                SERVER_PORT.store(port, Ordering::Relaxed);
                return Ok(port);
            }
        }
    }
    
    Err("Server failed to start".to_string())
}

pub fn get_server_port() -> Option<u16> {
    let port = SERVER_PORT.load(Ordering::Relaxed);
    if port > 0 { Some(port) } else { None }
}
```

3. **前端通过 HTTP 调用**：

```typescript
// 调用本地 scraper 服务器
async function scrapePage(url: string, cookies?: any[]) {
  const port = await invoke<number>('get_scraper_port');
  
  const response = await fetch(`http://localhost:${port}/api/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, cookies, waitFor: '.mod-content' })
  });
  
  return await response.json();
}

// 验证 cookies 有效性
async function validateCookies(url: string, cookies: any[]) {
  const port = await invoke<number>('get_scraper_port');
  
  const response = await fetch(`http://localhost:${port}/api/validate-cookies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, cookies })
  });
  
  const result = await response.json();
  return result.valid;
}
```

**优缺点**：

| 优点 | 缺点 |
|------|------|
| 通信协议清晰（HTTP/JSON） | 需要额外启动 HTTP 服务器 |
| 支持请求/响应模式 | 增加端口管理复杂性 |
| 服务器可保持浏览器实例常驻 | 需要处理端口冲突 |
| 易于调试和测试 | 总体架构更复杂 |
| 浏览器实例可复用 | 需要 CORS 配置 |

### 3.4 方案 D：使用 WebSocket 通信

**架构**：Tauri 应用 ↔ WebSocket → Playwright 服务器 ↔ 浏览器实例

**实现步骤**：

1. **WebSocket 服务器（Rust 端）**：

```rust
// src-tauri/src/ws.rs
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use futures::{SinkExt, StreamExt};
use serde_json::Value;

pub async fn run_ws_server(app: AppHandle) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    
    // 存储端口供前端使用
    app.manage(WsServerPort(port));
    
    while let Ok((stream, _)) = listener.accept().await {
        let app_clone = app.clone();
        tokio::spawn(async move {
            let ws_stream = accept_async(stream).await.unwrap();
            let (mut write, mut read) = ws_stream.split();
            
            while let Some(msg) = read.next().await {
                if let Ok(msg) = msg {
                    let text = msg.to_text().unwrap_or("");
                    if let Ok(command) = serde_json::from_str::<ScraperCommand>(text) {
                        // 转发到前端或处理
                        let result = handle_command(&app_clone, command).await;
                        let _ = write.send(result.into()).await;
                    }
                }
            }
        });
    }
}

#[derive(serde::Deserialize)]
struct ScraperCommand {
    action: String,
    url: Option<String>,
    cookies: Option<Vec<Value>>,
}
```

2. **Node.js WebSocket 客户端**：

```javascript
// scraper-ws-client.js
const WebSocket = require('ws');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');

chromium.use(stealth());

class ScraperWsClient {
    constructor() {
        this.ws = null;
        this.browser = null;
    }
    
    async connect(url) {
        this.ws = new WebSocket(url);
        this.browser = await chromium.launch({ headless: true });
        
        this.ws.on('message', async (data) => {
            const command = JSON.parse(data);
            await this.handleCommand(command);
        });
    }
    
    async handleCommand(command) {
        switch (command.action) {
            case 'scrape':
                const result = await this.scrape(command.url, command.cookies);
                this.ws.send(JSON.stringify({ id: command.id, ...result }));
                break;
            case 'validate_cookies':
                const valid = await this.validateCookies(command.url, command.cookies);
                this.ws.send(JSON.stringify({ id: command.id, valid }));
                break;
        }
    }
    
    async scrape(url, cookies) {
        const context = await this.browser.newContext();
        if (cookies) await context.addCookies(cookies);
        
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });
        
        const html = await page.content();
        const newCookies = await context.cookies();
        await context.close();
        
        return { html, cookies: newCookies };
    }
}
```

**优缺点**：

| 优点 | 缺点 |
|------|------|
| 实时双向通信 | 架构最复杂 |
| 低延迟 | 需要 WebSocket 库支持 |
| 支持事件推送 | 连接管理复杂 |
| 适合长连接场景 | 调试困难 |

### 3.5 各方式对比总结

| 维度 | 方案A Command | 方案B Sidecar | 方案C HTTP API | 方案D WebSocket |
|------|-------------|-------------|--------------|---------------|
| **复杂度** | 低 | 中 | 中 | 高 |
| **通信效率** | 低（stdout） | 中 | 高 | 最高 |
| **实时性** | 低 | 低 | 中 | 高 |
| **调试难度** | 低 | 低 | 中 | 高 |
| **浏览器常驻** | ❌ 每次启动 | ❌ 每次启动 | ✅ 可常驻 | ✅ 可常驻 |
| **架构清晰度** | 低 | 中 | 高 | 高 |
| **推荐场景** | 简单任务 | 标准集成 | 生产环境 | 实时推送需求 |

---

## 4. 轻量级方案

### 4.1 curl-impersonate（TLS 指纹模拟）

**原理**：curl-impersonate 是一个修改版的 curl，它在 TLS 握手时模拟真实浏览器的 JA3/JA4 指纹和 HTTP/2 行为，使 HTTP 请求看起来像来自真实浏览器。

**Python 绑定（curl_cffi）**：

```python
from curl_cffi import requests

# 模拟 Chrome 120 的完整指纹
response = requests.get(
    "https://nexusmods.com",
    impersonate="chrome120",
    headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
)
print(response.status_code)
print(response.text[:1000])
```

**支持的浏览器指纹**：

| 指纹选项 | 说明 |
|---------|------|
| `chrome120` | Chrome 120 |
| `chrome119` | Chrome 119 |
| `chrome118` | Chrome 118 |
| `firefox120` | Firefox 120 |
| `safari17` | Safari 17 |
| `edge120` | Edge 120 |

**Rust 替代方案**：`rquest` crate

```toml
[dependencies]
rquest = "0.1"
tokio = { version = "1", features = ["full"] }
```

```rust
use rquest::tls::Impersonate;

#[tokio::main]
async fn main() -> Result<(), rquest::Error> {
    // 模拟 Chrome 131 的完整指纹（JA3/JA4/HTTP2/Headers）
    let client = rquest::Client::builder()
        .impersonate(Impersonate::Chrome131)
        .build()?;
    
    let resp = client
        .get("https://nexusmods.com")
        .send()
        .await?;
    
    println!("Status: {}", resp.status());
    println!("Body: {}", resp.text().await?);
    
    Ok(())
}
```

**curl-impersonate 效果评估**：

| 检测层级 | 效果 |
|---------|------|
| TLS/JA3 指纹 | ✅ 优秀 |
| HTTP/2 指纹 | ✅ 优秀 |
| 请求头一致性 | ✅ 良好 |
| JavaScript 挑战 | ❌ 无法处理 |
| 行为分析 | ❌ 无法处理 |
| IP 信誉 | ❌ 无法处理 |

**适用场景**：仅 TLS 指纹检测的网站（成功率约 80%），对需要 JavaScript 执行的 Cloudflare Challenge 无效。

### 4.2 reqwest + 自定义 TLS 配置

Rust 的 `reqwest` 默认使用 `rustls`，可以通过自定义 TLS 配置来模拟部分浏览器特征：

```rust
use reqwest::{Client, ClientBuilder};
use rustls::ClientConfig;

fn create_stealth_client() -> Result<Client, Box<dyn std::error::Error>> {
    let client = ClientBuilder::new()
        // 设置 User-Agent
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        // 设置 HTTP/2 优先
        .http2_prior_knowledge()
        // 默认启用 gzip
        .gzip(true)
        // 设置超时
        .timeout(std::time::Duration::from_secs(30))
        // 设置连接池
        .pool_max_idle_per_host(10)
        // 添加默认请求头
        .default_headers({
            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8".parse()?);
            headers.insert("Accept-Language", "en-US,en;q=0.5".parse()?);
            headers.insert("Accept-Encoding", "gzip, deflate, br".parse()?);
            headers.insert("DNT", "1".parse()?);
            headers.insert("Connection", "keep-alive".parse()?);
            headers.insert("Upgrade-Insecure-Requests", "1".parse()?);
            headers.insert("Sec-Fetch-Dest", "document".parse()?);
            headers.insert("Sec-Fetch-Mode", "navigate".parse()?);
            headers.insert("Sec-Fetch-Site", "none".parse()?);
            headers.insert("Sec-Fetch-User", "?1".parse()?);
            headers
        })
        .build()?;
    
    Ok(client)
}
```

**注意**：reqwest 不提供 JA3 指纹级别的模拟，对抗高级检测能力有限。

### 4.3 CloudflareScraper (Python) 的 Rust 替代

| Python 工具 | 功能 | Rust 替代 |
|------------|------|----------|
| `cloudscraper` | 自动解决 Cloudflare JS Challenge | ❌ 无直接替代，且该项目已停止维护 |
| `curl_cffi` | TLS 指纹模拟 | `rquest` |
| `requests` + `urllib3` | HTTP 请求 | `reqwest` |
| `flaresolverr` | 代理 Cloudflare 请求 | 可通过集成 Playwright 实现 |

### 4.4 纯 Rust 方案可行性评估

**方案 1：chromiumoxide + 手动 stealth 注入**

```rust
use chromiumoxide::{Browser, BrowserConfig};
use chromiumoxide::cdp::js_protocol::runtime::EvaluateParams;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let (browser, mut handler) = Browser::launch(
        BrowserConfig::builder()
            .headless(false)
            .viewport((1920, 1080))
            .arg("--disable-blink-features=AutomationControlled")
            .build()?
    ).await?;
    
    // 处理浏览器事件
    tokio::spawn(async move {
        loop {
            let _ = handler.next().await;
        }
    });
    
    let page = browser.new_page("https://nexusmods.com").await?;
    
    // 注入 stealth 脚本
    page.evaluate_on_new_document(r#"
        // 移除 webdriver 标志
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
            enumerable: true,
            configurable: true
        });
        
        // 模拟 plugins
        Object.defineProperty(navigator, 'plugins', {
            get: () => [
                {name: "Chrome PDF Plugin", filename: "internal-pdf-viewer"},
                {name: "Native Client", filename: "native-client.nmf"},
                {name: "Widevine Content Decryption Module", filename: "widevinecdmadapter.dll"}
            ]
        });
        
        // 模拟 languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en']
        });
        
        // 清除 automation 痕迹
        delete navigator.__proto__.webdriver;
        
        // 模拟 chrome 对象
        window.chrome = {
            app: { isInstalled: false },
            webstore: { onInstallStageChanged: {}, onDownloadProgress: {} },
            runtime: { 
                OnInstalledReason: {CHROME_UPDATE: "chrome_update"},
                PlatformArch: {X86_64: "x86-64"},
                PlatformNaclArch: {X86_64: "x86-64"},
                PlatformOs: {WIN: "win"}
            }
        };
    "#).await?;
    
    // 等待页面加载
    page.wait_for_navigation().await?;
    
    let content = page.content().await?;
    println!("Page loaded, content length: {}", content.len());
    
    // 提取 cookies
    let cookies = page.get_cookies().await?;
    for cookie in &cookies {
        println!("Cookie: {} = {}", cookie.name, cookie.value);
    }
    
    browser.close().await?;
    Ok(())
}
```

**可行性结论**：

| 方案 | 反检测能力 | 复杂度 | 维护成本 | 推荐度 |
|------|----------|--------|---------|--------|
| chromiumoxide + 手动 stealth | 中等 | 高 | 高 | ⭐⭐⭐ |
| rquest（TLS 模拟） | 仅 TLS 层 | 低 | 低 | ⭐⭐⭐⭐ |
| Playwright sidecar | 高 | 中 | 中 | ⭐⭐⭐⭐⭐ |
| headless_chrome | 低 | 低 | 中 | ⭐⭐ |

---

## 5. Cookie 和会话管理

### 5.1 从 Playwright 提取 Cookie

**Playwright Cookie API**：

```javascript
// 获取所有 cookies（包括 HttpOnly）
const cookies = await context.cookies();
console.log(cookies);
// 输出: [{name, value, domain, path, expires, httpOnly, secure, sameSite}]

// 获取特定 URL 的 cookies
const pageCookies = await context.cookies('https://nexusmods.com');

// 保存完整存储状态（cookies + localStorage + sessionStorage）
await context.storageState({ path: 'auth-state.json' });
```

**storageState 文件格式**：

```json
{
  "cookies": [
    {
      "name": "cf_clearance",
      "value": "abc123...",
      "domain": ".nexusmods.com",
      "path": "/",
      "expires": 1760000000,
      "httpOnly": true,
      "secure": true,
      "sameSite": "None"
    },
    {
      "name": "session_id",
      "value": "xyz789...",
      "domain": "nexusmods.com",
      "path": "/",
      "expires": -1,
      "httpOnly": true,
      "secure": true,
      "sameSite": "Lax"
    }
  ],
  "origins": [
    {
      "origin": "https://nexusmods.com",
      "localStorage": [
        {"name": "user_prefs", "value": "{theme:dark}"}
      ]
    }
  ]
}
```

### 5.2 将 Cookie 传递给 Tauri 的 HTTP 客户端

**Rust 端（reqwest）使用 Cookie**：

```rust
use reqwest::{Client, header};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cookie {
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
    pub expires: Option<f64>,
    pub http_only: bool,
    pub secure: bool,
    pub same_site: String,
}

// 将 Playwright cookies 转换为 reqwest Cookie
pub fn build_cookie_header(cookies: &[Cookie]) -> String {
    cookies.iter()
        .map(|c| format!("{}={}", c.name, c.value))
        .collect::<Vec<_>>()
        .join("; ")
}

// 使用 cookies 发送请求
pub async fn fetch_with_cookies(
    url: &str,
    cookies: &[Cookie],
) -> Result<String, reqwest::Error> {
    let cookie_header = build_cookie_header(cookies);
    
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .build()?;
    
    let response = client
        .get(url)
        .header(header::COOKIE, cookie_header)
        .send()
        .await?;
    
    response.text().await
}
```

**Rust 端（使用 cookie_store）自动管理**：

```toml
[dependencies]
reqwest = { version = "0.12", features = ["cookies"] }
reqwest_cookie_store = "0.8"
```

```rust
use reqwest::Client;
use reqwest_cookie_store::{CookieStore, CookieStoreMutex};
use std::sync::Arc;

pub fn create_client_with_cookie_store() -> (Client, Arc<CookieStoreMutex>) {
    let cookie_store = CookieStore::new(None);
    let cookie_store = Arc::new(CookieStoreMutex::new(cookie_store));
    
    let client = Client::builder()
        .cookie_provider(cookie_store.clone())
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .build()
        .unwrap();
    
    (client, cookie_store)
}

// 从 Playwright cookies 加载到 cookie store
pub fn load_cookies(store: &CookieStoreMutex, cookies: &[Cookie]) {
    let mut store = store.lock().unwrap();
    for cookie in cookies {
        let cookie_raw = format!(
            "{}={}; Domain={}; Path={}; {} {}",
            cookie.name,
            cookie.value,
            cookie.domain,
            cookie.path,
            if cookie.secure { "Secure;" } else { "" },
            if cookie.http_only { "HttpOnly;" } else { "" }
        );
        store.parse(&cookie_raw, &format!("https://{}", cookie.domain).parse().unwrap()).ok();
    }
}
```

### 5.3 会话持久化和刷新机制

**完整会话管理流程**：

```rust
// src-tauri/src/session.rs
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub cookies: Vec<Cookie>,
    pub user_agent: String,
    pub created_at: u64,
    pub last_used: u64,
    pub is_valid: bool,
}

impl Session {
    pub fn new(cookies: Vec<Cookie>, user_agent: String) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        
        Self {
            cookies,
            user_agent,
            created_at: now,
            last_used: now,
            is_valid: true,
        }
    }
    
    // 检查是否需要刷新（24小时或 cookies 即将过期）
    pub fn needs_refresh(&self) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        
        // 超过24小时未使用
        if now - self.last_used > 86400 {
            return true;
        }
        
        // cookies 即将过期（30分钟内）
        for cookie in &self.cookies {
            if let Some(expires) = cookie.expires {
                if expires > 0.0 && (expires as u64) - now < 1800 {
                    return true;
                }
            }
        }
        
        false
    }
    
    // 保存到文件
    pub async fn save(&self, path: &PathBuf) -> Result<(), String> {
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| e.to_string())?;
        tokio::fs::write(path, json).await.map_err(|e| e.to_string())?;
        Ok(())
    }
    
    // 从文件加载
    pub async fn load(path: &PathBuf) -> Result<Option<Self>, String> {
        if !path.exists() {
            return Ok(None);
        }
        
        let content = tokio::fs::read_to_string(path).await
            .map_err(|e| e.to_string())?;
        let session: Session = serde_json::from_str(&content)
            .map_err(|e| e.to_string())?;
        
        Ok(Some(session))
    }
}
```

**自动刷新机制**：

```rust
// src-tauri/src/session_manager.rs
use tauri::AppHandle;
use std::collections::HashMap;
use tokio::sync::RwLock;

pub struct SessionManager {
    sessions: RwLock<HashMap<String, Session>>,  // user_id -> Session
    storage_dir: PathBuf,
}

impl SessionManager {
    pub async fn get_or_create_session(
        &self,
        app: &AppHandle,
        user_id: &str,
    ) -> Result<Session, String> {
        // 先尝试从内存获取
        {
            let sessions = self.sessions.read().await;
            if let Some(session) = sessions.get(user_id) {
                if !session.needs_refresh() && session.is_valid {
                    return Ok(session.clone());
                }
            }
        }
        
        // 尝试从文件加载
        let session_path = self.storage_dir.join(format!("{}.json", user_id));
        if let Some(session) = Session::load(&session_path).await? {
            if !session.needs_refresh() && session.is_valid {
                let mut sessions = self.sessions.write().await;
                sessions.insert(user_id.to_string(), session.clone());
                return Ok(session);
            }
        }
        
        // 需要创建新会话（通过 Playwright 登录）
        let new_session = self.create_session_via_playwright(app, user_id).await?;
        
        // 保存
        new_session.save(&session_path).await?;
        
        let mut sessions = self.sessions.write().await;
        sessions.insert(user_id.to_string(), new_session.clone());
        
        Ok(new_session)
    }
    
    async fn create_session_via_playwright(
        &self,
        _app: &AppHandle,
        _user_id: &str,
    ) -> Result<Session, String> {
        // 通过 sidecar 调用 Playwright 进行登录
        // 返回提取的 cookies 和 user_agent
        todo!("Implement via Playwright sidecar")
    }
}
```

### 5.4 多用户/多账号隔离方案

**Context 级别的隔离**：

```javascript
// 每个用户一个独立的浏览器 Context
class MultiUserScraper {
    constructor() {
        this.browser = null;
        this.contexts = new Map(); // userId -> context
    }
    
    async init() {
        this.browser = await chromium.launch({ headless: true });
    }
    
    async createUserContext(userId, storageStatePath) {
        const context = await this.browser.newContext({
            viewport: { width: 1920, height: 1080 },
            // 每个用户独立的存储状态
            storageState: storageStatePath,
            // 每个用户独立的下载路径
            downloadsPath: `./downloads/${userId}`,
        });
        
        this.contexts.set(userId, context);
        return context;
    }
    
    async getPageForUser(userId) {
        const context = this.contexts.get(userId);
        if (!context) throw new Error(`No context for user: ${userId}`);
        return context.newPage();
    }
    
    async removeUserContext(userId) {
        const context = this.contexts.get(userId);
        if (context) {
            await context.close();
            this.contexts.delete(userId);
        }
    }
    
    async close() {
        for (const [userId, context] of this.contexts) {
            await context.close();
        }
        await this.browser.close();
    }
}
```

**Rust 端用户隔离管理**：

```rust
// src-tauri/src/user_pool.rs
use std::collections::HashMap;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct UserProfile {
    pub user_id: String,
    pub session: Session,
    pub rate_limit: RateLimiter,
    pub last_activity: std::time::Instant,
}

pub struct UserPool {
    users: Mutex<HashMap<String, UserProfile>>,
    max_concurrent: usize,
}

impl UserPool {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            users: Mutex::new(HashMap::new()),
            max_concurrent,
        }
    }
    
    // 轮换用户避免触发频率限制
    pub async fn get_next_available_user(&self) -> Option<UserProfile> {
        let users = self.users.lock().await;
        
        users.values()
            .filter(|u| u.rate_limit.allow_request())
            .min_by_key(|u| u.last_activity)
            .cloned()
    }
    
    // 每个用户的独立请求频率限制
    pub async fn enforce_rate_limit(&self, user_id: &str) -> Result<(), String> {
        let mut users = self.users.lock().await;
        
        if let Some(user) = users.get_mut(user_id) {
            if !user.rate_limit.allow_request() {
                return Err("Rate limit exceeded".to_string());
            }
            user.last_activity = std::time::Instant::now();
        }
        
        Ok(())
    }
}
```

---

## 6. 综合方案对比表

### 反检测方案对比

| 方案 | 反检测能力 | 资源占用 | 速度 | 维护难度 | 2026 年状态 |
|------|----------|---------|------|---------|------------|
| Playwright + stealth | 中高 | 高(~500MB) | 中 | 中 | 活跃维护 |
| Puppeteer + stealth | 中高 | 高(~500MB) | 快 | 高 | 已弃用 |
| Nodriver (Python) | 高 | 中(~300MB) | 中 | 低 | 活跃，推荐 |
| Camoufox | 高 | 中高 | 中 | 中 | 活跃 |
| chromiumoxide (Rust) | 中 | 低(~100MB) | 快 | 高 | 社区驱动 |
| curl-impersonate | 仅 TLS 层 | 极低(~10MB) | 极快 | 低 | 活跃 |
| rquest (Rust) | 仅 TLS 层 | 极低(~10MB) | 极快 | 低 | 活跃 |

### Tauri 集成方案对比

| 维度 | 方案A Command | 方案B Sidecar | 方案C HTTP API | 方案D WebSocket |
|------|:-----------:|:-----------:|:------------:|:-------------:|
| 实现复杂度 | ⭐ 低 | ⭐⭐ 中 | ⭐⭐⭐ 中 | ⭐⭐⭐⭐ 高 |
| 通信效率 | ⭐ 低 | ⭐ 低 | ⭐⭐⭐ 高 | ⭐⭐⭐⭐ 最高 |
| 浏览器复用 | ❌ | ❌ | ✅ | ✅ |
| 实时推送 | ❌ | ❌ | ⚠️ 轮询 | ✅ |
| 调试便利度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| 生产稳定性 | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 包体积增加 | 80-100MB | 80-100MB | 80-100MB | 80-100MB |
| 错误恢复 | 手动重启 | 手动重启 | 自动 | 自动重连 |
| 推荐度 | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

### 总体方案对比（按应用场景）

| 应用场景 | 推荐方案 | 理由 |
|---------|---------|------|
| 快速原型/POC | 方案A + Playwright | 实现简单，快速验证 |
| 生产环境 | 方案C + Playwright | 架构清晰，稳定可扩展 |
| 实时数据推送 | 方案D + Playwright | WebSocket 双向通信 |
| 极简 TLS 绕过 | rquest (纯 Rust) | 零额外依赖，极轻量 |
| 深度反检测 | Nodriver sidecar | 最高反检测能力 |
| Rust 原生体验 | chromiumoxide | 纯 Rust，内存占用低 |

---

## 7. 推荐方案

### 主推荐：方案 C（HTTP API + Playwright Sidecar）

**理由**：

1. **架构清晰**：HTTP REST API 是最通用的通信协议，前后端理解成本低
2. **浏览器复用**：服务器可保持浏览器实例常驻，避免频繁启动开销
3. **可扩展性**：未来可轻松替换为远程服务或微服务架构
4. **调试便利**：可直接通过浏览器或 curl 调试 API
5. **Session 管理**：服务器端统一管理 cookie 和会话状态
6. **生产稳定**：成熟的 HTTP 服务器生态，自动重连、负载均衡

**推荐的完整技术栈**：

```
Tauri 桌面应用
  ├── 前端 (React/Vue)
  │     └── HTTP 调用本地 scraper API
  ├── Rust 后端
  │     ├── 管理 sidecar 生命周期
  │     ├── Session 持久化（文件/数据库）
  │     └── 向前端转发事件
  └── Sidecar (Node.js + Playwright)
        ├── Express HTTP 服务器
        ├── Playwright 浏览器自动化
        ├── Cookie 管理
        └── 行为模拟
```

### 替代推荐：轻量级混合方案

对于不需要完整浏览器自动化的场景：

1. **首次获取**：使用 Playwright 完成 Cloudflare Challenge 并提取 cookies
2. **后续请求**：使用 `rquest` 或 `reqwest` + 提取的 cookies 进行轻量级 HTTP 请求
3. **Cookie 刷新**：当 cookies 过期时，再次使用 Playwright 刷新

**优势**：大幅减少资源占用，提高后续请求速度。

### 完整参考实现结构

```
my-nexus-app/
├── src-tauri/
│   ├── binaries/
│   │   └── scraper-server-x86_64-pc-windows-msvc.exe  # Playwright sidecar
│   ├── src/
│   │   ├── main.rs              # Tauri 入口
│   │   ├── lib.rs               # 模块导出
│   │   ├── commands.rs          # Tauri Commands
│   │   ├── session.rs           # Session 管理
│   │   ├── sidecar.rs           # Sidecar 启动管理
│   │   └── scraper_client.rs    # HTTP 客户端封装
│   └── Cargo.toml
├── scraper/                     # Playwright 服务器
│   ├── package.json
│   ├── src/
│   │   ├── server.ts            # Express 服务器
│   │   ├── browser.ts           # Playwright 管理
│   │   ├── stealth.ts           # 反检测配置
│   │   └── session.ts           # Cookie/Session 管理
│   └── Dockerfile
├── src/                         # 前端代码
│   ├── api/
│   │   └── scraper.ts           # API 调用封装
│   ├── stores/
│   │   └── session.ts           # 会话状态管理
│   └── App.tsx
└── package.json
```

### 关键配置注意事项

**1. Playwright 反检测最佳配置**：

```javascript
const browser = await chromium.launch({
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
    ]
});

const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    hasTouch: false,
    isMobile: false,
    javaScriptEnabled: true,
});
```

**2. Tauri 权限配置**：

```json
// capabilities/default.json
{
  "permissions": [
    "core:default",
    {
      "identifier": "shell:allow-execute",
      "allow": [
        {
          "name": "binaries/scraper-server",
          "sidecar": true
        }
      ]
    },
    "http:default",
    {
      "identifier": "http:allow-request",
      "allow": [
        { "url": "http://localhost:*" }
      ]
    }
  ]
}
```

**3. 打包配置**：

```json
// tauri.conf.json
{
  "bundle": {
    "externalBin": ["binaries/scraper-server"],
    "resources": {
      "scraper/dist": "./scraper"
    }
  }
}
```

---

## 8. 参考资源

### 核心库与工具

| 工具/库 | 链接 | 说明 |
|---------|------|------|
| Playwright | https://playwright.dev | 微软浏览器自动化框架 |
| playwright-stealth (Python) | https://github.com/AtuboDad/playwright-stealth | Python 反检测插件 |
| playwright-extra (Node.js) | https://github.com/berstend/playwright-extra | Node.js 扩展生态 |
| puppeteer-extra-plugin-stealth | https://github.com/berstend/puppeteer-extra | 已弃用 |
| chromiumoxide (Rust) | https://github.com/mattsse/chromiumoxide | Rust CDP 驱动 |
| rquest (Rust) | https://crates.io/crates/rquest | Rust TLS 指纹模拟 HTTP 客户端 |
| curl-impersonate | https://github.com/lwthiker/curl-impersonate | TLS 指纹模拟 curl |
| curl_cffi (Python) | https://github.com/yifeikong/curl_cffi | Python curl-impersonate 绑定 |
| Nodriver | https://github.com/ultrafunkamsterdam/nodriver | 原生反检测 Chrome 驱动 |
| Camoufox | https://github.com/daijro/camoufox | 二进制级反检测浏览器 |
| chaser-oxide (Rust) | https://github.com/0xchasercat/chaser-oxide | Rust 协议级反检测 |

### Tauri 相关文档

| 资源 | 链接 |
|------|------|
| Tauri Sidecar 官方文档 | https://v2.tauri.app/develop/sidecar/ |
| Tauri Shell Plugin | https://v2.tauri.app/plugin/shell/ |
| Tauri 权限系统 | https://v2.tauri.app/security/capabilities/ |
| Evil Martians: Rust + Tauri + Sidecar | https://evilmartians.com/chronicles/making-desktop-apps-with-revved-up-potential-rust-tauri-sidecar |

### 反检测与 Cloudflare 绕过

| 资源 | 链接 |
|------|------|
| Scrapfly: Bypass Cloudflare | https://scrapfly.io/blog/how-to-bypass-cloudflare-anti-scraping |
| ScrapingBee: Cloudflare Bypass | https://www.scrapingbee.com/blog/how-to-bypass-cloudflare-antibot-protection-at-scale/ |
| Playwright Cookie Management | https://bytetunnels.com/posts/playwright-cookie-management-http-level-scraping/ |
| Playwright Storage State | https://www.browserstack.com/guide/playwright-storage-state |
| Stealth Scraping at Scale | https://www.browserless.io/blog/stealth-scraping-puppeteer-playwright |

---

## 附录：Nexus Mods 抓取的特殊考量

### Nexus Mods 的 Cloudflare 保护特点

Nexus Mods 使用 Cloudflare CDN，具有以下特点：

1. **登录页面**：`https://users.nexusmods.com/auth/sign_in` 可能有 Cloudflare Challenge
2. **API 限制**：未认证用户有严格的请求频率限制
3. **Cookie 要求**：`cf_clearance` cookie 是通过 Cloudflare Challenge 的关键
4. **User-Agent 敏感**：某些 API 端点会检查 User-Agent

### 推荐的 Nexus Mods 抓取流程

```
1. 首次启动
   └── 打开 Nexus Mods 登录页面（Playwright）
       └── 通过 Cloudflare Challenge
       └── 用户手动登录
       └── 提取 cookies（包括 cf_clearance 和 session）
       └── 保存到 auth-state.json

2. 后续抓取
   ├── 加载保存的 storageState
   ├── 访问 Nexus Mods 页面
   ├── 提取所需数据（mod 信息、下载链接等）
   └── 如遇 Challenge，自动重试

3. Cookie 刷新
   ├── 检测 cookies 是否过期
   ├── 使用 Playwright 重新获取
   └── 更新存储
```

### Nexus Mods API 替代方案

Nexus Mods 提供官方 API，需要 API Key：

```
GET https://api.nexusmods.com/v1/games/{game_domain_name}/mods/{mod_id}.json
Headers: apikey: YOUR_API_KEY
```

使用官方 API 的优势：
- 不受 Cloudflare 保护
- 结构化数据
- 稳定的接口

建议优先使用官方 API，仅在需要获取 API 未覆盖的数据时使用浏览器自动化。

---

> **报告生成说明**：本报告基于 2024-2026 年的技术资料编写，浏览器自动化和反检测技术更新频繁，建议定期评估各工具的最新状态。
