# Tauri 绕过 Cloudflare Challenge 完整技术方案

> **项目背景**: 开发 Tauri 桌面应用抓取 Nexus Mods 页面数据，需解决 Cloudflare Challenge 拦截、多窗口 Cookie 同步、窗口假死、前后端不同步等问题。
>
> **报告日期**: 2025-07-10
>
> **核心发现**: Nexus Mods 提供官方 API (`api.nexusmods.com`)，**完全不受 Cloudflare 保护**，优先使用 API 可彻底绕过所有问题。

---

## 目录

1. [方案总览与推荐策略](#1-方案总览与推荐策略)
2. [方案一：官方 API（强烈推荐）](#2-方案一官方-api强烈推荐)
3. [方案二：Tauri WebView 反检测](#3-方案二tauri-webview-反检测)
4. [方案三：Playwright Sidecar](#4-方案三playwright-sidecar)
5. [方案四：混合架构（终极方案）](#5-方案四混合架构终极方案)
6. [Cookie 同步架构详解](#6-cookie-同步架构详解)
7. [窗口假死解决方案](#7-窗口假死解决方案)
8. [完整代码示例](#8-完整代码示例)
9. [常见问题 FAQ](#9-常见问题-faq)

---

## 1. 方案总览与推荐策略

### 1.1 方案对比表

| 维度 | 方案一: 官方 API | 方案二: WebView 反检测 | 方案三: Playwright | 方案四: 混合架构 |
|------|:---------------:|:---------------------:|:-----------------:|:--------------:|
| **绕过 Cloudflare** | ✅ 完全绕过 | ⚠️ 可能触发 | ✅ 高成功率 | ✅ 灵活切换 |
| **实现复杂度** | ⭐ 极低 | ⭐⭐⭐ 中等 | ⭐⭐⭐⭐ 高 | ⭐⭐⭐ 中等 |
| **维护成本** | ⭐ 极低 | ⭐⭐⭐ 高 | ⭐⭐⭐⭐ 高 | ⭐⭐ 低 |
| **资源占用** | ⭐ 极低(~10MB) | ⭐⭐ 中等 | ⭐⭐⭐⭐ 高(~500MB) | ⭐⭐ 中等 |
| **稳定性** | ⭐⭐⭐⭐⭐ 极高 | ⭐⭐⭐ 一般 | ⭐⭐⭐⭐ 较高 | ⭐⭐⭐⭐⭐ 极高 |
| **反检测能力** | 无需 | ⭐⭐⭐ 中等 | ⭐⭐⭐⭐⭐ 极高 | ⭐⭐⭐⭐ 高 |
| **适合场景** | 获取 mod 元数据 | 必须渲染页面 | 复杂自动化 | 生产环境 |
| **推荐度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

### 1.2 决策树

```
是否需要抓取 Nexus Mods 数据？
    │
    ├─ 只需要 mod 信息/文件列表/搜索？ ──→ 方案一：官方 API（最优）
    │
    ├─ 需要渲染页面/执行 JS？ ──→ 是否需要高稳定性？
    │       │
    │       ├─ 是 ──→ 方案四：混合架构（推荐）
    │       │
    │       └─ 否 ──→ 方案二：WebView 反检测
    │
    └─ 需要批量自动化？ ──→ 方案三：Playwright Sidecar
```

### 1.3 最终推荐

**对于 Nexus Mods 场景**：

1. **首选方案一**：使用官方 API 获取所有 mod 元数据（名称、版本、下载数、文件列表等）
2. **降级到方案四**：当 API 无法满足需求时（如获取 Premium 下载链接），使用混合架构
3. **避免单独使用方案二/三**：除非有特殊需求

---

## 2. 方案一：官方 API（强烈推荐）

### 2.1 核心优势

Nexus Mods 官方 API 使用独立域名 `api.nexusmods.com`，**完全不经过 Cloudflare CDN**，因此：

- 无需处理任何 Cloudflare Challenge
- 无需 WebView、无需 Cookie 同步
- 结构化 JSON 数据，无需 HTML 解析
- 合法合规，有官方文档支持

### 2.2 API 基本信息

| 项目 | 内容 |
|------|------|
| 基础 URL | `https://api.nexusmods.com/v1/` |
| 认证方式 | `apikey` HTTP Header |
| 速率限制 | 2500次/天，超出后100次/小时 |
| API Key 获取 | https://www.nexusmods.com/users/myaccount?tab=api%20access |

### 2.3 主要端点

```
# 用户相关
GET /users/validate.json                 # 验证 API Key
GET /user/tracked_mods.json              # 追踪的 mod 列表

# 游戏相关
GET /games.json                          # 所有游戏列表
GET /games/{domain}.json                 # 指定游戏信息

# Mod 相关
GET /games/{domain}/mods/{id}.json       # Mod 详情
GET /games/{domain}/mods/{id}/files.json # 文件列表
GET /games/{domain}/mods/latest_added.json
GET /games/{domain}/mods/latest_updated.json
GET /games/{domain}/mods/trending.json

# 下载（仅 Premium）
GET /games/{domain}/mods/{id}/files/{file_id}/download_link.json
```

### 2.4 Tauri + Rust 完整代码

```rust
// src-tauri/src/nexus_api.rs

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

const BASE_URL: &str = "https://api.nexusmods.com/v1";

// ============= 数据类型 =============

#[derive(Debug, Clone, Deserialize)]
pub struct ModInfo {
    pub name: String,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub version: Option<String>,
    pub author: String,
    pub uploader: Uploader,
    pub picture_url: Option<String>,
    pub mod_downloads: u64,
    pub mod_unique_downloads: u64,
    pub endorsement_count: u64,
    pub created_at: String,
    pub updated_at: String,
    pub status: String,
    pub available: bool,
    pub domain_name: String,
    pub category_id: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Uploader {
    pub member_id: u64,
    pub member_group_id: u64,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModFile {
    pub file_id: u64,
    pub name: String,
    pub version: Option<String>,
    pub category_id: Option<u64>,
    pub category_name: Option<String>,
    pub is_primary: bool,
    pub size: u64,
    pub file_name: String,
    pub uploaded_timestamp: u64,
    pub uploaded_time: String,
    pub mod_version: Option<String>,
    pub external_virus_scan_url: Option<String>,
    pub description: Option<String>,
    pub size_kb: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FileList {
    pub files: Vec<ModFile>,
    pub file_updates: Vec<FileUpdate>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FileUpdate {
    pub old_file_id: u64,
    pub new_file_id: u64,
    pub old_file_name: String,
    pub new_file_name: String,
    pub uploaded_timestamp: u64,
    pub uploaded_time: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GameInfo {
    pub id: u64,
    pub name: String,
    pub forum_url: Option<String>,
    pub nexusmods_url: Option<String>,
    pub genre: Option<String>,
    pub domain_name: String,
    pub approved_date: u64,
    pub file_count: u64,
    pub downloads: u64,
    pub file_views: u64,
    pub file_endorsements: u64,
    pub mods_count: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UserInfo {
    pub user_id: u64,
    pub key: String,
    pub name: String,
    pub is_premium: bool,
    pub is_supporter: bool,
    pub email: String,
    pub profile_url: String,
    pub is_supporter_trial: Option<bool>,
}

// ============= API 客户端 =============

pub struct NexusAPI {
    client: Client,
    api_key: Arc<RwLock<String>>,
}

impl NexusAPI {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");
        
        Self {
            client,
            api_key: Arc::new(RwLock::new(String::new())),
        }
    }

    /// 设置 API Key
    pub async fn set_api_key(&self, key: String) {
        let mut api_key = self.api_key.write().await;
        *api_key = key;
    }

    /// 获取当前 API Key
    async fn get_api_key(&self) -> String {
        self.api_key.read().await.clone()
    }

    /// 发送请求（自动附加认证头）
    async fn request<T: serde::de::DeserializeOwned>(
        &self,
        method: &str,
        endpoint: &str,
    ) -> Result<T, NexusError> {
        let api_key = self.get_api_key().await;
        
        if api_key.is_empty() {
            return Err(NexusError::NotAuthenticated);
        }

        let url = format!("{}/{}", BASE_URL, endpoint);
        
        let response = self.client
            .request(
                method.parse().map_err(|_| NexusError::InvalidMethod)?,
                &url
            )
            .header("apikey", &api_key)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(NexusError::Network)?;

        // 检查速率限制
        if let Some(remaining) = response.headers().get("X-RL-Daily-Remaining") {
            tracing::info!("API daily remaining: {:?}", remaining);
        }

        match response.status() {
            status if status.is_success() => {
                let data = response.json::<T>().await.map_err(NexusError::Network)?;
                Ok(data)
            }
            reqwest::StatusCode::UNAUTHORIZED => Err(NexusError::InvalidApiKey),
            reqwest::StatusCode::TOO_MANY_REQUESTS => Err(NexusError::RateLimited),
            reqwest::StatusCode::FORBIDDEN => {
                let text = response.text().await.unwrap_or_default();
                Err(NexusError::Forbidden(text))
            }
            _ => {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                Err(NexusError::ApiError { status, message: text })
            }
        }
    }

    // ============= API 方法 =============

    /// 验证 API Key 并获取用户信息
    pub async fn validate_user(&self) -> Result<UserInfo, NexusError> {
        self.request("GET", "users/validate.json").await
    }

    /// 获取游戏列表
    pub async fn get_games(&self) -> Result<Vec<GameInfo>, NexusError> {
        self.request("GET", "games.json").await
    }

    /// 获取指定游戏信息
    pub async fn get_game(&self, domain: &str) -> Result<GameInfo, NexusError> {
        self.request("GET", &format!("games/{}.json", domain)).await
    }

    /// 获取 Mod 详情
    pub async fn get_mod(&self, domain: &str, mod_id: u64) -> Result<ModInfo, NexusError> {
        self.request("GET", &format!("games/{}/mods/{}.json", domain, mod_id)).await
    }

    /// 获取 Mod 文件列表
    pub async fn get_mod_files(&self, domain: &str, mod_id: u64) -> Result<FileList, NexusError> {
        self.request("GET", &format!("games/{}/mods/{}/files.json", domain, mod_id)).await
    }

    /// 获取热门 Mod
    pub async fn get_trending(&self, domain: &str) -> Result<Vec<ModInfo>, NexusError> {
        self.request("GET", &format!("games/{}/mods/trending.json", domain)).await
    }

    /// 获取最新添加的 Mod
    pub async fn get_latest_added(&self, domain: &str) -> Result<Vec<ModInfo>, NexusError> {
        self.request("GET", &format!("games/{}/mods/latest_added.json", domain)).await
    }

    /// 获取最新更新的 Mod
    pub async fn get_latest_updated(&self, domain: &str) -> Result<Vec<ModInfo>, NexusError> {
        self.request("GET", &format!("games/{}/mods/latest_updated.json", domain)).await
    }
}

// ============= 错误类型 =============

#[derive(Debug, thiserror::Error)]
pub enum NexusError {
    #[error("未设置 API Key")]
    NotAuthenticated,
    
    #[error("无效的 API Key")]
    InvalidApiKey,
    
    #[error("请求方法无效")]
    InvalidMethod,
    
    #[error("网络错误: {0}")]
    Network(#[from] reqwest::Error),
    
    #[error("API 速率限制已达到，请稍后再试")]
    RateLimited,
    
    #[error("权限不足: {0}")]
    Forbidden(String),
    
    #[error("API 错误 [{status}]: {message}")]
    ApiError { status: reqwest::StatusCode, message: String },
}

impl serde::Serialize for NexusError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        serializer.serialize_str(&self.to_string())
    }
}
```

### 2.5 Tauri Commands 封装

```rust
// src-tauri/src/commands.rs

use tauri::State;
use std::sync::Arc;

#[tauri::command]
pub async fn nexus_validate(
    api: State<'_, Arc<NexusAPI>>
) -> Result<UserInfo, NexusError> {
    api.validate_user().await
}

#[tauri::command]
pub async fn nexus_get_mod(
    api: State<'_, Arc<NexusAPI>>,
    domain: String,
    mod_id: u64,
) -> Result<ModInfo, NexusError> {
    api.get_mod(&domain, mod_id).await
}

#[tauri::command]
pub async fn nexus_get_mod_files(
    api: State<'_, Arc<NexusAPI>>,
    domain: String,
    mod_id: u64,
) -> Result<FileList, NexusError> {
    api.get_mod_files(&domain, mod_id).await
}

#[tauri::command]
pub async fn nexus_get_trending(
    api: State<'_, Arc<NexusAPI>>,
    domain: String,
) -> Result<Vec<ModInfo>, NexusError> {
    api.get_trending(&domain).await
}

#[tauri::command]
pub async fn nexus_set_api_key(
    api: State<'_, Arc<NexusAPI>>,
    key: String,
) -> Result<(), String> {
    api.set_api_key(key).await;
    Ok(())
}
```

### 2.6 前端调用示例

```typescript
// src/api/nexus.ts
import { invoke } from '@tauri-apps/api/core';

export interface ModInfo {
  name: string;
  summary?: string;
  version?: string;
  author: string;
  picture_url?: string;
  mod_downloads: number;
  endorsement_count: number;
  created_at: string;
  updated_at: string;
}

export interface ModFile {
  file_id: number;
  name: string;
  version?: string;
  category_name?: string;
  is_primary: boolean;
  size_kb: number;
  file_name: string;
}

export const nexusApi = {
  async setApiKey(key: string): Promise<void> {
    await invoke('nexus_set_api_key', { key });
  },

  async validateUser() {
    return await invoke<UserInfo>('nexus_validate');
  },

  async getMod(domain: string, modId: number): Promise<ModInfo> {
    return await invoke('nexus_get_mod', { domain, modId });
  },

  async getModFiles(domain: string, modId: number): Promise<ModFile[]> {
    const result = await invoke<{ files: ModFile[] }>('nexus_get_mod_files', { domain, modId });
    return result.files;
  },

  async getTrending(domain: string): Promise<ModInfo[]> {
    return await invoke('nexus_get_trending', { domain });
  },
};
```

### 2.7 main.rs 注册

```rust
// src-tauri/src/main.rs

mod nexus_api;
mod commands;

use nexus_api::NexusAPI;
use std::sync::Arc;

fn main() {
    tauri::Builder::default()
        .manage(Arc::new(NexusAPI::new()))
        .invoke_handler(tauri::generate_handler![
            commands::nexus_validate,
            commands::nexus_get_mod,
            commands::nexus_get_mod_files,
            commands::nexus_get_trending,
            commands::nexus_set_api_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 2.8 Cargo.toml 依赖

```toml
[dependencies]
tauri = { version = "2.0", features = [] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["json"] }
thiserror = "2.0"
tracing = "0.1"
```

---

## 3. 方案二：Tauri WebView 反检测

当必须使用网页抓取时（如需要渲染页面、执行 JS），可通过以下方式降低被 Cloudflare 检测的概率。

### 3.1 WebView 被检测的关键点

| 检测维度 | WebView 特征 | 解决方案 |
|----------|-------------|----------|
| `Sec-CH-UA` 头 | 包含 "Microsoft Edge WebView2" | 通过 `initialization_script` 修改 |
| `navigator.plugins` | 为空或不完整 | JS 注入模拟 |
| `window.gc` | WebView2 特有 | JS 删除 |
| `window.chrome.webview` | WebView2 特有 | JS 删除 |
| Client Hints | 不完整 | 补充模拟 |

### 3.2 反检测脚本

```rust
const STEALTH_SCRIPT: &str = r#"
(function() {
    // 1. 移除 navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true
    });
    
    // 2. 删除 WebView2 特有属性
    if (typeof window.gc !== 'undefined') {
        try { delete window.gc; } catch(e) {}
    }
    
    // 3. 隐藏 chrome.webview
    if (window.chrome && window.chrome.webview) {
        Object.defineProperty(window.chrome, 'webview', {
            get: () => undefined,
            configurable: true
        });
    }
    
    // 4. 模拟 navigator.plugins
    Object.defineProperty(navigator, 'plugins', {
        get: () => [
            { name: "Chrome PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format" },
            { name: "Native Client", filename: "internal-nacl-plugin", description: "Native Client module" },
            { name: "Widevine Content Decryption Module", filename: "widevinecdmadapter.dll", description: "Widevine Content Decryption Module" }
        ]
    });
    
    // 5. 模拟 mimeTypes
    Object.defineProperty(navigator, 'mimeTypes', {
        get: () => [
            { type: "application/pdf", suffixes: "pdf", description: "Portable Document Format" },
            { type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format" },
            { type: "application/x-nacl", suffixes: "", description: "Native Client executable" }
        ]
    });
    
    // 6. 模拟 chrome.runtime
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) {
        window.chrome.runtime = {
            id: undefined,
            OnInstalledReason: { CHROME_UPDATE: "chrome_update", INSTALL: "install" },
            OnRestartRequiredReason: { APP_UPDATE: "app_update" }
        };
    }
    
    // 7. 模拟 chrome.app
    if (!window.chrome.app) {
        window.chrome.app = {
            isInstalled: false,
            InstallState: { DISABLED: "disabled", INSTALLED: "installed" },
            RunningState: { CANNOT_RUN: "cannot_run", READY_TO_RUN: "ready_to_run", RUNNING: "running" }
        };
    }
    
    // 8. 模拟 permissions
    const originalQuery = navigator.permissions.query;
    navigator.permissions.query = function(parameters) {
        if (parameters.name === 'notifications') {
            return Promise.resolve({ state: Notification.permission });
        }
        return originalQuery.call(this, parameters);
    };
    
    // 9. 模拟 languages
    Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en-US', 'en']
    });
    
    // 10. 设置 hardwareConcurrency
    Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8
    });
    
    console.log('[Stealth] Anti-detection script injected');
})();
"#;
```

### 3.3 创建反检测 WebView

```rust
use tauri::{AppHandle, WebviewWindowBuilder, WebviewUrl};

pub fn create_stealth_webview(
    app: &AppHandle,
    label: &str,
    url: &str,
) -> Result<tauri::WebviewWindow, tauri::Error> {
    let webview = WebviewWindowBuilder::new(
        app,
        label,
        WebviewUrl::External(url.parse().unwrap())
    )
    .title("Nexus Mods")
    .inner_size(1280.0, 800.0)
    .center()
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    .initialization_script(STEALTH_SCRIPT)
    .visible(false)  // 先隐藏，加载完成后再显示
    .build()?;
    
    Ok(webview)
}
```

### 3.4 Windows 平台额外参数

```rust
#[cfg(target_os = "windows")]
let webview = WebviewWindowBuilder::new(app, label, url)
    .initialization_script(STEALTH_SCRIPT)
    // ⚠️ 注意：additional_browser_args 多窗口下可能死锁，建议使用 initialization_script
    // .additional_browser_args("--disable-blink-features=AutomationControlled")
    .build()?;
```

> **重要警告**: `additional_browser_args` 在 Windows 多窗口场景下会导致死锁（[Issue #15014](https://github.com/tauri-apps/tauri/issues/15014)），建议使用 `initialization_script` 替代。

---

## 4. 方案三：Playwright Sidecar

### 4.1 架构说明

将 Playwright 作为独立进程（Sidecar）运行，通过 HTTP API 与 Tauri 通信。

```
Tauri 应用
  ├── 前端 UI
  ├── Rust 后端 (Session 管理)
  └── Sidecar (Node.js + Playwright)
       ├── Express HTTP 服务器
       ├── 浏览器自动化
       └── Cookie 管理
```

### 4.2 Sidecar 代码 (scraper/src/server.ts)

```typescript
import express from 'express';
import { chromium, Browser, BrowserContext } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

cromium.use(stealth());

const app = express();
app.use(express.json());

let browser: Browser | null = null;
let context: BrowserContext | null = null;

async function getBrowser(): Promise<Browser> {
    if (!browser) {
        browser = await chromium.launch({
            headless: false,  // headed 模式更容易通过 CF
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--window-size=1920,1080',
            ]
        });
    }
    return browser;
}

// 抓取接口
app.post('/api/scrape', async (req, res) => {
    const { url, cookies, waitFor } = req.body;
    
    try {
        const browser = await getBrowser();
        const ctx = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        });
        
        if (cookies) {
            await ctx.addCookies(cookies);
        }
        
        const page = await ctx.newPage();
        
        // 模拟人类行为
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(2000 + Math.random() * 3000);
        
        // 模拟滚动
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(1000);
        
        if (waitFor) {
            await page.waitForSelector(waitFor, { timeout: 30000 });
        }
        
        const html = await page.content();
        const newCookies = await ctx.cookies();
        const title = await page.title();
        
        await ctx.close();
        
        res.json({ success: true, html, cookies: newCookies, title });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取/验证 cookies
app.post('/api/validate-cookies', async (req, res) => {
    const { url, cookies } = req.body;
    
    try {
        const browser = await getBrowser();
        const ctx = await browser.newContext();
        await ctx.addCookies(cookies);
        
        const page = await ctx.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        const isValid = await page.evaluate(() => {
            return !document.querySelector('#challenge-running');
        });
        
        await ctx.close();
        
        res.json({ valid: isValid });
    } catch (error: any) {
        res.status(500).json({ valid: false, error: error.message });
    }
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({ status: 'ok', browser: !!browser });
});

// 启动
const PORT = process.env.PORT || 0;  // 0 = 随机端口
const server = app.listen(PORT, () => {
    const addr = server.address() as { port: number };
    console.log(`Scraper server running on port ${addr.port}`);
});
```

### 4.3 Rust 端调用

```rust
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
struct ScrapeResult {
    success: bool,
    html: Option<String>,
    cookies: Option<Vec<Cookie>>,
    title: Option<String>,
    error: Option<String>,
}

pub struct ScraperClient {
    client: Client,
    base_url: String,
}

impl ScraperClient {
    pub fn new(port: u16) -> Self {
        Self {
            client: Client::new(),
            base_url: format!("http://localhost:{}", port),
        }
    }
    
    pub async fn scrape(&self, url: &str, cookies: Option<Vec<Cookie>>) -> Result<ScrapeResult, reqwest::Error> {
        let response = self.client
            .post(format!("{}/api/scrape", self.base_url))
            .json(&serde_json::json!({
                "url": url,
                "cookies": cookies,
                "waitFor": ".mod-header"
            }))
            .send()
            .await?;
        
        response.json().await
    }
    
    pub async fn validate_cookies(&self, url: &str, cookies: Vec<Cookie>) -> Result<bool, reqwest::Error> {
        let response = self.client
            .post(format!("{}/api/validate-cookies", self.base_url))
            .json(&serde_json::json!({ "url": url, "cookies": cookies }))
            .send()
            .await?;
        
        let result: serde_json::Value = response.json().await?;
        Ok(result["valid"].as_bool().unwrap_or(false))
    }
}
```

---

## 5. 方案四：混合架构（终极方案）

### 5.1 架构设计

结合方案一（API）和方案三（Playwright），实现最优稳定性：

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri Application                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │   Frontend   │  │ Rust Backend │  │  Session Manager │ │
│  │  (React/Vue) │  │              │  │                  │ │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────┘ │
│         │                │                               │
│         │ invoke         │ manage                        │
│         │                │                               │
│  ┌──────▼────────────────▼──────┐  ┌─────────────────┐  │
│  │      NexusAPI (官方)         │  │ Playwright      │  │
│  │      api.nexusmods.com       │  │ Sidecar (备用)   │  │
│  │                              │  │ (需要时启动)      │  │
│  │  优先使用：获取 mod 信息      │  │                  │  │
│  │  文件列表、搜索等            │  │  备用：页面渲染    │  │
│  │                              │  │  Premium 下载等   │  │
│  └─────────────────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 5.2 工作流程

```
1. 用户输入 mod ID
   │
   ▼
2. 调用官方 API 获取 mod 信息
   │
   ├─ ✅ 成功 → 显示数据（无需 Cloudflare 处理）
   │
   └─ ❌ API 失败（如需要页面数据）
       │
       ▼
   3. 检查是否有有效 cf_clearance Cookie
       │
       ├─ ✅ 有 → 使用 Playwright + Cookie 抓取页面
       │
       └─ ❌ 无 → 弹出 WebView 让用户通过 Cloudflare Challenge
               │
               ▼
       4. 提取 cf_clearance Cookie
       5. 保存到 Session Manager
       6. 使用 Playwright 继续抓取
```

### 5.3 核心代码

```rust
// src-tauri/src/scraper.rs

use std::sync::Arc;
use tokio::sync::RwLock;

pub struct HybridScraper {
    /// 官方 API 客户端
    api: Arc<NexusAPI>,
    
    /// Playwright sidecar 客户端（懒加载）
    sidecar: Arc<RwLock<Option<ScraperClient>>>,
    
    /// Session 管理
    session: Arc<SessionManager>,
}

impl HybridScraper {
    pub fn new(api: Arc<NexusAPI>, session: Arc<SessionManager>) -> Self {
        Self {
            api,
            sidecar: Arc::new(RwLock::new(None)),
            session,
        }
    }
    
    /// 获取 Mod 信息（优先 API）
    pub async fn get_mod_info(&self, domain: &str, mod_id: u64) -> Result<ModInfo, ScraperError> {
        // 优先尝试官方 API
        match self.api.get_mod(domain, mod_id).await {
            Ok(info) => return Ok(info),
            Err(e) => {
                tracing::warn!("API failed for mod {}: {}, trying fallback", mod_id, e);
            }
        }
        
        // API 失败时使用 Playwright 抓取页面
        self.scrape_mod_page(domain, mod_id).await
    }
    
    /// 使用 Playwright 抓取页面（备用）
    async fn scrape_mod_page(&self, domain: &str, mod_id: u64) -> Result<ModInfo, ScraperError> {
        let sidecar = self.get_or_start_sidecar().await?;
        
        let url = format!("https://www.nexusmods.com/{}/mods/{}", domain, mod_id);
        let cookies = self.session.get_valid_cookies().await;
        
        let result = sidecar.scrape(&url, cookies).await
            .map_err(|e| ScraperError::Sidecar(e.to_string()))?;
        
        if !result.success {
            return Err(ScraperError::ScrapeFailed(result.error.unwrap_or_default()));
        }
        
        // 保存新 cookies
        if let Some(new_cookies) = result.cookies {
            self.session.update_cookies(new_cookies).await;
        }
        
        // 解析 HTML 提取 mod 信息（使用 scraper crate）
        parse_mod_html(&result.html.unwrap_or_default())
    }
    
    /// 懒加载 Sidecar
    async fn get_or_start_sidecar(&self) -> Result<ScraperClient, ScraperError> {
        let mut sidecar = self.sidecar.write().await;
        
        if sidecar.is_none() {
            // 启动 sidecar 进程
            let port = start_sidecar_process().await?;
            *sidecar = Some(ScraperClient::new(port));
        }
        
        Ok(sidecar.as_ref().unwrap().clone())
    }
}
```

---

## 6. Cookie 同步架构详解

### 6.1 核心问题

Tauri 内部存在**两套完全独立的 Cookie 系统**：
1. **WebView Cookie** - 由平台 WebView 引擎管理（WebView2/WKWebView/WebKitGTK）
2. **reqwest Cookie** - 由 `cookie_store` crate 管理

它们互不共享，必须通过 JavaScript 提取 + IPC 手动同步。

### 6.2 推荐架构：模式 A + 模式 D 降级

```
┌──────────┐    open     ┌──────────┐    solve     ┌──────────┐
│  Main    │ ──────────> │   Auth   │ ──────────>  │    CF    │
│  Window  │             │  WebView │              │  Server  │
│          │             │          │ <──────────  │          │
│          │             │          │   challenge  │          │
└────┬─────┘             └────┬─────┘              └──────────┘
     │    "cookie-captured"   │  JS 轮询 extract
     │ <──────────────────────┘
     │
     ▼
┌──────────┐    inject    ┌──────────┐
│   Rust   │ ──────────>  │ reqwest  │
│ Backend  │              │ Client   │
│ CookieStore            └──────────┘
└──────────┘
```

### 6.3 Cookie 监控脚本（WebView 端）

```typescript
// 在验证窗口中注入
class CookieMonitor {
    private intervalId: number | null = null;
    private lastCookie: string = '';
    
    start() {
        this.intervalId = window.setInterval(async () => {
            const currentCookie = document.cookie;
            if (currentCookie !== this.lastCookie) {
                this.lastCookie = currentCookie;
                
                // 检查 cf_clearance
                const cfMatch = currentCookie.match(/cf_clearance=([^;]+)/);
                if (cfMatch) {
                    await invoke('cf_clearance_detected', {
                        windowId: (window as any).__TAURI_WINDOW_LABEL__,
                        value: cfMatch[1],
                        fullCookie: currentCookie,
                        userAgent: navigator.userAgent,
                        url: window.location.href,
                    });
                }
            }
        }, 2000);
    }
    
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}
```

### 6.4 Rust 端 Cookie 管理

```rust
use reqwest_cookie_store::CookieStoreMutex;
use std::sync::Arc;

pub struct SessionManager {
    store: Arc<CookieStoreMutex>,
    cookie_file: PathBuf,
}

impl SessionManager {
    /// 加载或创建 Cookie Store
    pub fn new(app_dir: &PathBuf) -> Result<Self, Box<dyn Error>> {
        let cookie_file = app_dir.join("cookies.json");
        let store = if cookie_file.exists() {
            let file = File::open(&cookie_file)?;
            let reader = BufReader::new(file);
            cookie_store::CookieStore::load_json(reader)?
        } else {
            cookie_store::CookieStore::new(None)
        };
        
        Ok(Self {
            store: Arc::new(CookieStoreMutex::new(store)),
            cookie_file,
        })
    }
    
    /// 创建带有 Cookie 支持的 HTTP 客户端
    pub fn create_client(&self) -> Result<reqwest::Client, reqwest::Error> {
        reqwest::Client::builder()
            .cookie_provider(self.store.clone())
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .timeout(Duration::from_secs(30))
            .build()
    }
    
    /// 保存 Cookie 到文件
    pub fn persist(&self) -> Result<(), Box<dyn Error>> {
        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&self.cookie_file)?;
        
        let writer = BufWriter::new(file);
        let store = self.store.lock()?;
        store.save_json(writer)?;
        
        Ok(())
    }
}
```

### 6.5 注意事项

1. **`cf_clearance` 强绑定**: 与 IP、User-Agent、设备指纹绑定，更换任一都会失效
2. **有效期**: 通常 30-60 分钟，需定时刷新
3. **Windows 死锁**: `cookies()` API 必须在 async Command 中调用

---

## 7. 窗口假死解决方案

### 7.1 假死根因

| 根因 | 现象 | 解决方案 |
|------|------|----------|
| 同步创建 WebView | 主线程阻塞 | 使用 `tokio::spawn` 异步创建 |
| `cookies()` 同步调用 | COM 线程死锁（Windows） | 使用 async Command |
| `additional_browser_args` 多窗口 | 环境创建冲突 | 改用 `initialization_script` |
| 同步等待验证结果 | 消息泵卡住 | 使用 Channel + 超时 |

### 7.2 防假死最佳实践

```rust
use tokio::time::{timeout, Duration};

#[tauri::command]
pub async fn open_auth_window_with_timeout(
    app: AppHandle,
) -> Result<AuthResult, String> {
    // 1. 异步创建窗口（不阻塞）
    let window = tokio::task::spawn_blocking({
        let app = app.clone();
        move || create_auth_webview(&app)
    })
    .await
    .map_err(|e| format!("Window creation failed: {}", e))?;
    
    // 2. 使用 Channel 等待结果（可超时）
    let result = timeout(
        Duration::from_secs(120),  // 2分钟超时
        wait_for_auth_completion(&app)
    )
    .await
    .map_err(|_| "Auth timeout".to_string())?;
    
    // 3. 异步关闭窗口
    tokio::spawn(async move {
        let _ = window.close();
    });
    
    result
}
```

---

## 8. 完整代码示例

### 8.1 项目结构

```
my-nexus-app/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs           # 入口
│   │   ├── lib.rs            # 模块导出
│   │   ├── nexus_api.rs      # 官方 API 封装
│   │   ├── commands.rs       # Tauri Commands
│   │   ├── auth.rs           # Cookie/认证管理
│   │   └── scraper.rs        # 混合抓取器
│   └── Cargo.toml
├── src/                       # 前端代码
│   ├── api/nexus.ts
│   └── App.tsx
└── package.json
```

### 8.2 完整 Cargo.toml

```toml
[package]
name = "nexus-mods-app"
version = "0.1.0"
edition = "2021"

[dependencies]
# Tauri
tauri = { version = "2.0", features = [] }
tauri-plugin-http = "2.0"
tauri-plugin-shell = "2.0"

# 序列化
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# 异步
tokio = { version = "1", features = ["full"] }

# HTTP 客户端
reqwest = { version = "0.12", features = ["json", "cookies"] }
reqwest_cookie_store = "0.21"
cookie_store = "0.21"

# TLS 指纹模拟（可选）
rquest = { version = "0.1", optional = true }

# 错误处理
thiserror = "2.0"

# 日志
tracing = "0.1"

# 工具
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4"] }
url = "2.5"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
tls-impersonate = ["rquest"]
```

---

## 9. 常见问题 FAQ

### Q1: 官方 API 能获取哪些数据？

API 可获取：mod 名称/版本/作者/描述/下载数/点赞数、文件列表、游戏列表、用户信息等。**非 Premium 用户无法通过 API 直接获取下载链接**。

### Q2: API Key 如何获取？

1. 登录 Nexus Mods 网站
2. 访问 https://www.nexusmods.com/users/myaccount?tab=api%20access
3. 滚动到底部找到 "Personal API Key"
4. 点击生成按钮

### Q3: 为什么 API 不受 Cloudflare 影响？

API 使用独立域名 `api.nexusmods.com`，不在 Cloudflare CDN 保护范围内。

### Q4: WebView 窗口假死怎么排查？

1. 确认使用 async Command
2. 避免 `additional_browser_args` 多窗口冲突
3. 使用 `tokio::spawn` 异步创建窗口
4. 添加超时机制

### Q5: `cf_clearance` Cookie 为什么很快过期？

Cloudflare 设计如此，有效期通常 30-60 分钟，与 IP/User-Agent 强绑定。需要实现自动刷新机制。

### Q6: 纯 Rust 方案可行吗？

可以使用 `rquest` crate 模拟 TLS 指纹，但对于需要 JS 执行的 Cloudflare Challenge 仍然需要浏览器环境。推荐混合方案。

---

## 参考资源

| 资源 | 链接 |
|------|------|
| Nexus Mods API v1 文档 | https://app.swaggerhub.com/apis-docs/NexusMods/nexus-mods_public_api_params_in_form_data/1.0#/ |
| Nexus Mods API v3 文档 | https://api-docs.nexusmods.com/ |
| API Key 页面 | https://www.nexusmods.com/users/myaccount?tab=api%20access |
| API 使用政策 | https://help.nexusmods.com/article/114-api-acceptable-use-policy |
| Tauri v2 文档 | https://v2.tauri.app/ |
| Tauri Sidecar | https://v2.tauri.app/develop/sidecar/ |
| Playwright 文档 | https://playwright.dev/ |
| rquest (TLS 模拟) | https://crates.io/crates/rquest |
| reqwest_cookie_store | https://docs.rs/reqwest_cookie_store |

---

> **总结**: 对于 Nexus Mods 数据获取，**优先使用官方 API** 可完全绕过 Cloudflare，是最简单、最稳定的方案。当 API 无法满足需求时，采用**混合架构**（API + Playwright 备用），配合完善的 Cookie 同步和窗口管理机制，可实现高效可靠的 mod 数据抓取。
