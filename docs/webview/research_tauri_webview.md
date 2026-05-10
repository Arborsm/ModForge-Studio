# Tauri WebView 反检测配置及架构优化技术报告

> 研究目标：解决 Tauri 桌面应用在抓取 Nexus Mods 页面数据时遇到的 Cloudflare 检测、窗口假死、Cookie 过期、前后端不同步等问题。
> 适用版本：Tauri v2.x
> 报告日期：2025年

---

## 目录

1. [Tauri WebView 反检测配置](#1-tauri-webview-反检测配置)
2. [Tauri 多窗口架构](#2-tauri-多窗口架构)
3. [Tauri 前后端同步机制](#3-tauri-前后端同步机制)
4. [Tauri + 外部浏览器集成方案](#4-tauri--外部浏览器集成方案)
5. [Tauri WebView 已知问题和解决方案](#5-tauri-webview-已知问题和解决方案)
6. [推荐的架构设计方案](#6-推荐的架构设计方案)
7. [相关参考链接](#7-相关参考链接)

---

## 1. Tauri WebView 反检测配置

### 1.1 User-Agent 自定义

Tauri v2 提供了多种方式自定义 WebView 的 User-Agent：

#### 方式一：通过 WebviewWindowBuilder 设置（推荐）

```rust
use tauri::WebviewWindowBuilder;

fn create_stealth_webview(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, tauri::Error> {
    let webview = WebviewWindowBuilder::new(
        app,
        "nexusmods",
        tauri::WebviewUrl::External("https://www.nexusmods.com".parse().unwrap())
    )
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    .build()?;
    
    Ok(webview)
}
```

#### 方式二：通过配置文件的 userAgent 属性

```json
// tauri.conf.json
{
  "app": {
    "windows": [
      {
        "label": "nexusmods",
        "url": "https://www.nexusmods.com",
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    ]
  }
}
```

#### 方式三：通过 additional_browser_args（WebView2）

```rust
// Windows 平台特有，通过浏览器参数设置
use tauri::WebviewWindowBuilder;

let webview = WebviewWindowBuilder::new(app, "nexusmods", url)
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    .build()?;
```

**注意事项**：
- User-Agent 必须与 `navigator.platform`、`navigator.hardwareConcurrency` 等属性保持一致
- Chrome 版本号应与系统安装的 WebView2 运行时版本接近
- 建议使用真实浏览器的 User-Agent 字符串

### 1.2 初始化脚本注入（initialization_script）

Tauri v2 的 `initialization_script` 是在页面加载前注入的 JavaScript 代码，在 `window.onload` 之前执行，是隐藏自动化特征的最佳位置。

#### Rust 端代码

```rust
use tauri::WebviewWindowBuilder;

const STEALTH_SCRIPT: &str = r#"
(function() {
    // 1. 删除 navigator.webdriver 属性
    Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true
    });
    
    // 2. 删除 chrome 自动化特征
    if (window.chrome) {
        delete window.chrome.runtime;
        delete window.chrome.csi;
        delete window.chrome.loadTimes;
    }
    
    // 3. 覆盖 plugins 和 mimeTypes，模拟真实浏览器
    Object.defineProperty(navigator, 'plugins', {
        get: () => [
            {name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer'},
            {name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai'},
            {name: 'Native Client', filename: 'internal-nacl-plugin'}
        ]
    });
    
    Object.defineProperty(navigator, 'mimeTypes', {
        get: () => [
            {type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format'},
            {type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format'},
            {type: 'application/x-nacl', suffixes: '', description: 'Native Client executable'}
        ]
    });
    
    // 4. 模拟真实的 language 和 languages
    Object.defineProperty(navigator, 'language', {
        get: () => 'zh-CN'
    });
    Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en']
    });
    
    // 5. 覆盖 webdriver 相关的其他属性
    Object.defineProperty(navigator, 'maxTouchPoints', {
        get: () => 0
    });
    
    // 6. 删除 automationControlled 特征
    const originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(init) {
        if (init && init.mode) {
            return originalAttachShadow.call(this, init);
        }
        return originalAttachShadow.call(this, init);
    };
    
    // 7. 修复 Notification.permission
    if (window.Notification) {
        Object.defineProperty(Notification, 'permission', {
            get: () => 'default'
        });
    }
    
    // 8. 模拟 Canvas Fingerprint（基础）
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type) {
        const context = originalGetContext.call(this, type);
        if (context && (type === '2d' || type === 'webgl' || type === 'experimental-webgl')) {
            // 可以在这里添加 WebGL 参数修改
        }
        return context;
    };
    
    console.log('[Stealth] Automation features hidden');
})();
"#;

fn create_stealth_webview(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, tauri::Error> {
    let webview = WebviewWindowBuilder::new(
        app,
        "nexusmods",
        tauri::WebviewUrl::External("https://www.nexusmods.com".parse().unwrap())
    )
    .initialization_script(STEALTH_SCRIPT)
    .build()?;
    
    Ok(webview)
}
```

#### 关键配置点说明

| 属性 | 默认值（自动化环境） | 修改为 | 作用 |
|------|-------------------|--------|------|
| `navigator.webdriver` | `true` | `undefined` | 最主要的自动化检测标志 |
| `navigator.plugins` | `[]` | 模拟插件列表 | 真实浏览器有插件 |
| `navigator.mimeTypes` | `[]` | 模拟 MIME 类型 | 真实浏览器有 MIME 类型 |
| `navigator.languages` | 可能为空 | `['zh-CN', 'zh', 'en']` | 语言偏好 |
| `chrome.runtime` | 存在 | 删除 | Chrome 自动化特征 |
| `Notification.permission` | 可能为 `granted` | `default` | 通知权限检测 |

#### 仅对特定域名注入脚本

```rust
const INIT_SCRIPT: &str = r#"
  if (window.location.origin === 'https://www.nexusmods.com') {
    console.log("Running stealth script for Nexus Mods");
    // 反检测代码...
    window.__MY_CUSTOM_PROPERTY__ = { stealth: true };
  }
"#;
```

### 1.3 隐藏 navigator.webdriver 等自动化特征

Tauri WebView 基于系统原生 WebView（Windows: WebView2, macOS: WKWebView, Linux: WebKitGTK）。需要区分不同平台的特征隐藏方法：

#### Windows WebView2 特有配置

```rust
use tauri::WebviewWindowBuilder;

// WebView2 的 additional_browser_args 用于传递 Chromium 启动参数
let webview = WebviewWindowBuilder::new(app, "nexusmods", url)
    .additional_browser_args(
        "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
         --disable-blink-features=AutomationControlled \
         --disable-popup-blocking \
         --disable-infobars \
         --disable-extensions \
         --disable-dev-shm-usage \
         --no-first-run \
         --force-dark-mode=0"
    )
    .build()?;
```

**关键参数说明**：

| 参数 | 作用 |
|------|------|
| `--disable-blink-features=AutomationControlled` | 防止 Blink 引擎设置自动化标志 |
| `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection` | 禁用 WebView2 默认禁用的一些功能 |
| `--disable-popup-blocking` | 禁用弹窗拦截 |
| `--disable-infobars` | 禁用信息栏 |
| `--no-first-run` | 跳过首次运行体验 |
| `--password-store=basic` | 使用基本密码存储 |
| `--disable-background-networking` | 禁用后台网络活动 |

**重要警告**：
- 使用 `additional_browser_args` 时，必须自己处理默认参数，因为 wry 默认会传递 `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`
- 在 Windows 上，`additional_browser_args` 可能导致多窗口死锁（参见 [GitHub Issue #15014](https://github.com/tauri-apps/tauri/issues/15014)）

#### macOS/Linux 平台

对于 macOS WKWebView 和 Linux WebKitGTK，主要通过 `initialization_script` 来隐藏 JavaScript 层面的自动化特征，因为它们不支持 `additional_browser_args`。

### 1.4 WebView 的 Cookie 持久化配置

#### Tauri v2 的 Cookie API

Tauri v2 提供了原生的 Cookie 操作方法：

```rust
use tauri::Manager;
use tauri::webview::Cookie;
use url::Url;

// 获取 WebView 的所有 Cookie
#[tauri::command]
async fn get_all_cookies(window: tauri::WebviewWindow) -> Result<Vec<Cookie>, String> {
    let cookies = window.cookies()
        .map_err(|e| format!("Failed to get cookies: {}", e))?;
    Ok(cookies)
}

// 获取特定 URL 的 Cookie
#[tauri::command]
async fn get_cookies_for_url(
    window: tauri::WebviewWindow,
    url: String
) -> Result<Vec<Cookie>, String> {
    let url = Url::parse(&url).map_err(|e| e.to_string())?;
    let cookies = window.cookies_for_url(url)
        .map_err(|e| format!("Failed to get cookies: {}", e))?;
    Ok(cookies)
}

// 删除所有 Cookie
#[tauri::command]
async fn delete_all_cookies(window: tauri::WebviewWindow) -> Result<(), String> {
    window.delete_all_cookies()
        .map_err(|e| format!("Failed to delete cookies: {}", e))?;
    Ok(())
}
```

#### 前端 JavaScript 获取和设置 Cookie

```javascript
// 前端获取 Cookie 并传给 Rust
async function getCookiesAndSendToRust() {
  const cookies = document.cookie;
  const cookieObj = cookies.split('; ').reduce((acc, curr) => {
    const [key, value] = curr.split('=');
    acc[key.trim()] = decodeURIComponent(value);
    return acc;
  }, {});
  
  // 传给 Rust 后端
  await invoke('save_cookies', { cookies: cookieObj });
}
```

#### 平台特定的 Cookie 操作（高级）

对于更复杂的 Cookie 管理，可以通过 `with_webview` 访问底层平台 API：

```rust
use tauri::Manager;

#[tauri::command]
fn set_cookie_advanced(
    window: tauri::WebviewWindow,
    name: String,
    value: String,
    domain: String,
    path: String
) -> Result<(), String> {
    window.with_webview(move |webview| {
        #[cfg(target_os = "windows")]
        unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::*;
            use windows_core::*;
            
            let core = webview.controller().CoreWebView2().unwrap();
            let core2 = core.cast::<ICoreWebView2_2>().unwrap();
            let manager = core2.CookieManager().unwrap();
            
            let cookie = manager.CreateCookie(
                &HSTRING::from(&name),
                &HSTRING::from(&value),
                &HSTRING::from(&domain),
                &HSTRING::from(&path)
            ).unwrap();
            
            manager.AddOrUpdateCookie(&cookie).unwrap();
        }
        
        #[cfg(target_os = "macos")]
        unsafe {
            // macOS 使用 WKHTTPCookieStore
            // 需要 objc 和 cocoa crate
            use objc::runtime::*;
            use cocoa::base::*;
            
            let web_obj = webview.inner();
            let config = web_obj.configuration();
            let datastore = config.websiteDataStore();
            let cookie_store = datastore.httpCookieStore();
            
            // 创建 NSHTTPCookie
            // ...
        }
    }).map_err(|e| e.to_string())?;
    
    Ok(())
}
```

#### Cookie 持久化到文件

```rust
use tauri::Manager;
use serde::{Serialize, Deserialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug)]
struct PersistentCookie {
    name: String,
    value: String,
    domain: String,
    path: String,
    expires: Option<u64>,
    secure: bool,
    http_only: bool,
    same_site: Option<String>,
}

#[tauri::command]
async fn persist_cookies(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    url: String
) -> Result<(), String> {
    let url_parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
    let cookies = window.cookies_for_url(url_parsed)
        .map_err(|e| format!("Failed to get cookies: {}", e))?;
    
    let persistent_cookies: Vec<PersistentCookie> = cookies.into_iter()
        .map(|c| PersistentCookie {
            name: c.name,
            value: c.value,
            domain: c.domain.unwrap_or_default(),
            path: c.path.unwrap_or_default(),
            expires: c.expires.map(|e| e.as_secs()),
            secure: c.secure,
            http_only: c.http_only,
            same_site: c.same_site.map(|s| s.to_string()),
        })
        .collect();
    
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| e.to_string())?;
    let cookie_file = app_data_dir.join("cookies.json");
    
    let json = serde_json::to_string_pretty(&persistent_cookies)
        .map_err(|e| e.to_string())?;
    fs::write(&cookie_file, json).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn restore_cookies(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| e.to_string())?;
    let cookie_file = app_data_dir.join("cookies.json");
    
    if !cookie_file.exists() {
        return Ok(());
    }
    
    let json = fs::read_to_string(&cookie_file).map_err(|e| e.to_string())?;
    let cookies: Vec<PersistentCookie> = serde_json::from_str(&json)
        .map_err(|e| e.to_string())?;
    
    // 通过 JavaScript 设置 Cookie
    for cookie in cookies {
        let script = format!(
            "document.cookie = '{}={}; domain={}; path={}; {}'",
            cookie.name,
            cookie.value,
            cookie.domain,
            cookie.path,
            if cookie.secure { "Secure; " } else { "" }
        );
        let _ = window.eval(&script);
    }
    
    Ok(())
}
```

### 1.5 WebView 的缓存和存储管理

#### 自定义数据目录

```rust
use tauri::WebviewWindowBuilder;

// Windows: 设置自定义数据目录
let webview = WebviewWindowBuilder::new(app, "nexusmods", url)
    .data_directory("nexusmods_data")  // 相对于 appDataDir()/${label}
    .build()?;
```

对于 macOS/iOS，使用 `dataStoreIdentifier`：

```rust
let webview = WebviewWindowBuilder::new(app, "nexusmods", url)
    .data_store_identifier(vec![
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
        0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10
    ])
    .build()?;
```

#### 清除浏览数据

```rust
#[tauri::command]
async fn clear_browsing_data(window: tauri::WebviewWindow) -> Result<(), String> {
    // 清除所有浏览数据（Cookie、缓存、localStorage 等）
    window.clear_browsing_data()
        .map_err(|e| format!("Failed to clear browsing data: {}", e))?;
    Ok(())
}
```

#### 使用隐身模式

```rust
let webview = WebviewWindowBuilder::new(app, "nexusmods_temp", url)
    .incognito(true)  // 隐身模式，不保存 Cookie 和本地存储
    .build()?;
```

---

## 2. Tauri 多窗口架构

### 2.1 Tauri v2 多窗口最佳实践

#### 窗口创建模式

```rust
use tauri::{Manager, WebviewWindowBuilder};
use serde_json::json;

pub fn setup_multi_window(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle().clone();
    
    // 1. 创建主窗口（应用界面）
    let main_window = WebviewWindowBuilder::new(
        &app_handle,
        "main",
        tauri::WebviewUrl::App("index.html".into())
    )
    .title("Nexus Mods Scraper")
    .inner_size(1200.0, 800.0)
    .min_inner_size(800.0, 600.0)
    .center()
    .build()?;
    
    // 2. 创建隐藏的 WebView 窗口（用于抓取）
    let scraper_window = WebviewWindowBuilder::new(
        &app_handle,
        "scraper",
        tauri::WebviewUrl::External("https://www.nexusmods.com".parse().unwrap())
    )
    .title("Scraper")
    .visible(false)  // 隐藏窗口
    .inner_size(1280.0, 720.0)
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...")
    .initialization_script(STEALTH_SCRIPT)
    .build()?;
    
    // 3. 创建 Cloudflare Challenge 窗口（用于手动验证）
    let cf_window = WebviewWindowBuilder::new(
        &app_handle,
        "cf_challenge",
        tauri::WebviewUrl::External("https://www.nexusmods.com".parse().unwrap())
    )
    .title("Security Check - Nexus Mods")
    .inner_size(800.0, 600.0)
    .center()
    .always_on_top(true)
    .closable(true)
    .build()?;
    
    Ok(())
}
```

#### 从前端创建窗口

```typescript
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

async function openCloudflareWindow() {
  const webview = new WebviewWindow('cf_challenge', {
    url: 'https://www.nexusmods.com',
    title: 'Security Check',
    width: 800,
    height: 600,
    center: true,
    alwaysOnTop: true,
    closable: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...'
  });
  
  webview.once('tauri://created', () => {
    console.log('Cloudflare window created');
  });
  
  webview.once('tauri://error', (e) => {
    console.log('Error creating window:', e);
  });
}
```

### 2.2 主窗口与辅助窗口的通信机制

#### 事件通信模式

```rust
// Rust 端：发送事件到特定窗口
use tauri::{AppHandle, Emitter, EventTarget};

#[tauri::command]
fn notify_scraper_result(app: AppHandle, data: serde_json::Value) {
    // 发送到特定窗口
    app.emit_to("main", "scraper-data", &data).unwrap();
    
    // 广播到所有窗口
    app.emit("scraper-data-all", &data).unwrap();
    
    // 条件发送到多个窗口
    app.emit_filter("scraper-data", &data, |target| {
        match target {
            EventTarget::WebviewWindow { label } => {
                label == "main" || label == "scraper"
            }
            _ => false
        }
    }).unwrap();
}
```

```typescript
// 前端：监听事件
import { listen, emit } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

// 方式1：全局监听
const unlisten = await listen<ScraperData>('scraper-data', (event) => {
  console.log('Received scraper data:', event.payload);
});

// 方式2：特定窗口监听
const appWebview = getCurrentWebviewWindow();
const unlisten2 = appWebview.listen<string>('logged-in', (event) => {
  localStorage.setItem('session-token', event.payload);
});

// 方式3：只监听一次
await listen<InitData>('app-ready', (event) => {
  initializeApp(event.payload);
}, { once: true });
```

#### Channel 通信（高吞吐量场景）

```rust
// Rust 端：使用 Channel 传输数据流
use tauri::{ipc::Channel, AppHandle};
use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
enum ScrapeEvent {
    Started { url: String, task_id: usize },
    Progress { task_id: usize, percent: u32, message: String },
    DataReceived { task_id: usize, items: Vec<ModInfo> },
    Finished { task_id: usize },
    Error { task_id: usize, message: String },
}

#[derive(Clone, Serialize)]
struct ModInfo {
    id: String,
    name: String,
    version: String,
    downloads: u64,
}

#[tauri::command]
async fn scrape_nexus_mods(
    app: AppHandle,
    game_id: String,
    on_event: Channel<ScrapeEvent>
) -> Result<(), String> {
    on_event.send(ScrapeEvent::Started {
        url: format!("https://www.nexusmods.com/{}/mods/", game_id),
        task_id: 1
    }).unwrap();
    
    for i in 0..10 {
        on_event.send(ScrapeEvent::Progress {
            task_id: 1,
            percent: i * 10,
            message: format!("Fetching page {}...", i + 1)
        }).unwrap();
        
        // 模拟抓取...
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    
    on_event.send(ScrapeEvent::Finished { task_id: 1 }).unwrap();
    Ok(())
}
```

```typescript
// 前端：使用 Channel 接收数据流
import { invoke, Channel } from '@tauri-apps/api/core';

type ScrapeEvent =
  | { event: 'started'; data: { url: string; taskId: number } }
  | { event: 'progress'; data: { taskId: number; percent: number; message: string } }
  | { event: 'dataReceived'; data: { taskId: number; items: ModInfo[] } }
  | { event: 'finished'; data: { taskId: number } }
  | { event: 'error'; data: { taskId: number; message: string } };

async function startScraping(gameId: string) {
  const onEvent = new Channel<ScrapeEvent>();
  
  onEvent.onmessage = (message) => {
    switch (message.event) {
      case 'started':
        console.log(`Scraping started: ${message.data.url}`);
        break;
      case 'progress':
        updateProgressBar(message.data.percent, message.data.message);
        break;
      case 'dataReceived':
        appendModData(message.data.items);
        break;
      case 'finished':
        console.log('Scraping complete!');
        break;
      case 'error':
        showError(message.data.message);
        break;
    }
  };
  
  await invoke('scrape_nexus_mods', { gameId, onEvent });
}
```

### 2.3 窗口生命周期管理（避免假死）

#### 窗口事件监听

```rust
use tauri::{Manager, Listener, WindowEvent};

pub fn setup_window_lifecycle(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle().clone();
    
    // 监听窗口事件
    app.listen("tauri://window-created", |event| {
        println!("Window created: {:?}", event.payload());
    });
    
    // 获取特定窗口并监听其事件
    if let Some(window) = app_handle.get_webview_window("main") {
        window.listen("tauri://close-requested", move |event| {
            println!("Window close requested");
        });
    }
    
    Ok(())
}

// 在 Builder 中设置窗口事件处理
tauri::Builder::default()
    .on_window_event(|window, event| {
        match event {
            WindowEvent::CloseRequested { api, .. } => {
                let label = window.label();
                if label == "cf_challenge" {
                    // Cloudflare 验证窗口关闭时，通知主窗口
                    let _ = window.emit_to("main", "cf-window-closed", ());
                }
            }
            WindowEvent::Destroyed => {
                println!("Window destroyed: {}", window.label());
            }
            WindowEvent::Focused(focused) => {
                if *focused {
                    println!("Window focused: {}", window.label());
                }
            }
            _ => {}
        }
    });
```

#### 防止窗口关闭（隐藏代替关闭）

```rust
tauri::Builder::default()
    .on_window_event(|window, event| {
        match event {
            WindowEvent::CloseRequested { api, .. } => {
                // 主窗口关闭时隐藏到托盘，而不是退出应用
                if window.label() == "main" {
                    window.hide().unwrap();
                    api.prevent_close();
                }
            }
            _ => {}
        }
    });
```

#### 前台窗口激活

```typescript
import { getCurrentWindow } from '@tauri-apps/api/window';

async function bringToFront() {
  const window = getCurrentWindow();
  await window.unminimize();
  await window.setFocus();
  await window.show();
}
```

### 2.4 窗口间状态同步

#### 使用 Tauri State（Rust 端共享状态）

```rust
use std::sync::{Arc, Mutex, RwLock};
use std::collections::HashMap;
use serde::{Serialize, Deserialize};

// 定义共享状态
#[derive(Debug, Default, Serialize, Deserialize)]
struct CookieStore {
    cookies: HashMap<String, String>,
    last_updated: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct ScraperState {
    is_running: bool,
    current_url: Option<String>,
    cookie_store: CookieStore,
    cf_status: CloudflareStatus,
}

#[derive(Debug, Default, Serialize, Deserialize)]
enum CloudflareStatus {
    #[default]
    Unknown,
    Cleared,
    ChallengeRequired,
    Blocked,
}

// 管理状态（线程安全）
pub struct AppState {
    inner: RwLock<ScraperState>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(ScraperState::default())
        }
    }
    
    pub fn get_state(&self) -> Result<ScraperState, String> {
        self.inner.read()
            .map(|s| s.clone())
            .map_err(|e| e.to_string())
    }
    
    pub fn update_cf_status(&self, status: CloudflareStatus) -> Result<(), String> {
        let mut state = self.inner.write().map_err(|e| e.to_string())?;
        state.cf_status = status;
        Ok(())
    }
    
    pub fn update_cookie(&self, name: String, value: String) -> Result<(), String> {
        let mut state = self.inner.write().map_err(|e| e.to_string())?;
        state.cookie_store.cookies.insert(name, value);
        state.cookie_store.last_updated = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        Ok(())
    }
}

// 注册状态
tauri::Builder::default()
    .manage(AppState::new())
    .invoke_handler(tauri::generate_handler![get_app_state, update_cf_status])
    // ...

#[tauri::command]
fn get_app_state(state: tauri::State<AppState>) -> Result<ScraperState, String> {
    state.get_state()
}

#[tauri::command]
fn update_cf_status(
    state: tauri::State<AppState>,
    status: CloudflareStatus
) -> Result<(), String> {
    state.update_cf_status(status)
}
```

#### 使用前端状态同步模式

```typescript
// state-sync.ts - 使用 Zustand + Tauri Events 的跨窗口状态同步
import { create } from 'zustand';
import { emit, listen } from '@tauri-apps/api/event';
import { isEqual } from 'lodash-es';

interface AppStore {
  // 状态
  cfStatus: 'unknown' | 'cleared' | 'challenge_required' | 'blocked';
  cookies: Record<string, string>;
  isScraping: boolean;
  lastError: string | null;
  
  // Actions
  setCfStatus: (status: AppStore['cfStatus']) => void;
  setCookies: (cookies: Record<string, string>) => void;
  setIsScraping: (isRunning: boolean) => void;
  setLastError: (error: string | null) => void;
}

let isProcessingUpdate = false;

const useStore = create<AppStore>((set) => ({
  cfStatus: 'unknown',
  cookies: {},
  isScraping: false,
  lastError: null,
  
  setCfStatus: (status) => {
    set({ cfStatus: status });
    emit('store-update', { cfStatus: status });
  },
  
  setCookies: (cookies) => {
    set({ cookies });
    emit('store-update', { cookies });
  },
  
  setIsScraping: (isRunning) => {
    set({ isScraping: isRunning });
    emit('store-update', { isScraping: isRunning });
  },
  
  setLastError: (error) => {
    set({ lastError: error });
    emit('store-update', { lastError: error });
  }
}));

// 状态同步逻辑
useStore.subscribe((currentState, previousState) => {
  if (isProcessingUpdate) return;
  
  if (!isEqual(currentState, previousState)) {
    emit('store-update', currentState);
  }
});

// 监听其他窗口的状态更新
listen('store-update', (event) => {
  const newState = event.payload as Partial<AppStore>;
  
  if (!isEqual(useStore.getState(), { ...useStore.getState(), ...newState })) {
    isProcessingUpdate = true;
    useStore.setState(newState);
    isProcessingUpdate = false;
  }
});

// 新窗口启动时请求当前状态
let hasHydrated = false;
emit('get-store-request');

listen('get-store-request', () => {
  emit('get-store-response', { state: useStore.getState() });
});

listen('get-store-response', (event) => {
  if (!hasHydrated) {
    const { state } = event.payload as { state: AppStore };
    isProcessingUpdate = true;
    useStore.setState(state);
    isProcessingUpdate = false;
    hasHydrated = true;
  }
});

export default useStore;
```

---

## 3. Tauri 前后端同步机制

### 3.1 Command 系统最佳实践

#### 基本 Command 模式

```rust
use tauri::{AppHandle, State, Manager};
use serde::{Serialize, Deserialize};

// 定义请求/响应数据结构
#[derive(Deserialize, Debug)]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Serialize, Debug)]
struct LoginResponse {
    success: bool,
    token: Option<String>,
    message: String,
}

// 同步 Command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

// 异步 Command（推荐用于 I/O 操作）
#[tauri::command]
async fn login(
    app: AppHandle,
    state: State<'_, AppState>,
    request: LoginRequest
) -> Result<LoginResponse, String> {
    // 异步操作不会阻塞主线程
    let result = authenticate(&request).await?;
    
    // 更新共享状态
    state.update_cookie("auth_token".to_string(), result.token.clone())?;
    
    // 通知所有窗口
    app.emit("login-success", &result.token).unwrap();
    
    Ok(LoginResponse {
        success: true,
        token: Some(result.token),
        message: "Login successful".to_string()
    })
}

// 带窗口参数的 Command
#[tauri::command]
async fn execute_in_webview(
    window: tauri::WebviewWindow,
    script: String
) -> Result<String, String> {
    // 在特定窗口中执行 JavaScript
    window.eval(&script)
        .map_err(|e| format!("Eval failed: {}", e))?;
    Ok("Script executed".to_string())
}

// 注册 Command
tauri::Builder::default()
    .manage(AppState::new())
    .invoke_handler(tauri::generate_handler![
        greet,
        login,
        execute_in_webview,
        get_all_cookies,
        delete_all_cookies
    ])
    .run(tauri::generate_context())
    .expect("error while running tauri application");
```

```typescript
// 前端调用
import { invoke } from '@tauri-apps/api/core';

// 调用同步 Command
const greeting = await invoke<string>('greet', { name: 'World' });

// 调用异步 Command
const result = await invoke<LoginResponse>('login', {
  request: { username: 'user', password: 'pass' }
});

// 在特定窗口执行
await invoke('execute_in_webview', {
  window: 'scraper',
  script: 'document.title'
});
```

### 3.2 Event/Listener 模式

#### Rust 端事件系统

```rust
use tauri::{AppHandle, Emitter, Listener, Manager, EventTarget};

// 在 setup 中注册全局事件监听
tauri::Builder::default()
    .setup(|app| {
        let handle = app.handle().clone();
        
        // 监听来自前端的自定义事件
        app.listen("request-scrape", move |event| {
            if let Ok(payload) = serde_json::from_str::<ScrapeRequest>(&event.payload()) {
                println!("Scrape request: {:?}", payload);
                
                // 异步处理
                let h = handle.clone();
                tauri::async_runtime::spawn(async move {
                    let result = do_scrape(payload).await;
                    h.emit("scrape-complete", result).unwrap();
                });
            }
        });
        
        // 只监听一次的事件
        app.once("init-complete", |event| {
            println!("Initialization complete: {}", event.payload());
        });
        
        Ok(())
    });
```

#### 前端事件系统

```typescript
import { listen, emit, once } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

// 全局监听
const unlisten = await listen<ScrapeResult>('scrape-complete', (event) => {
  console.log('Scrape result:', event.payload);
});

// 窗口特定监听
const window = getCurrentWebviewWindow();
const unlisten2 = window.listen<string>('cf-challenge-needed', (event) => {
  showCloudflareWindow(event.payload);
});

// 只监听一次
await once('app-ready', (event) => {
  console.log('App ready:', event.payload);
});

// 发送事件到 Rust
await emit('request-scrape', { gameId: 'skyrim', category: 'mods' });

// 发送事件到特定窗口
await emitTo('scraper', 'navigate-to', 'https://www.nexusmods.com/skyrim/mods');

// 清理监听器
unlisten();
unlisten2();
```

### 3.3 State 管理（跨窗口共享状态）

```rust
use std::sync::{Arc, RwLock, Mutex};
use std::collections::HashMap;
use serde::{Serialize, Deserialize};

// 应用状态
pub struct AppState {
    // 使用 RwLock：多读少写场景
    pub config: RwLock<AppConfig>,
    
    // 使用 Mutex：频繁写入场景
    pub session: Mutex<UserSession>,
    
    // 使用 Arc 共享引用
    pub cookie_jar: Arc<RwLock<CookieJar>>,
    
    // 任务管理
    pub active_tasks: Mutex<Vec<ScrapeTask>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub nexus_api_key: Option<String>,
    pub download_dir: String,
    pub max_concurrent_downloads: usize,
    pub cf_auto_solve: bool,
}

#[derive(Debug, Clone)]
pub struct UserSession {
    pub logged_in: bool,
    pub username: Option<String>,
    pub premium: bool,
    pub cookies: HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub struct CookieJar {
    pub cookies: Vec<tauri::webview::Cookie>,
    pub last_synced: Option<std::time::Instant>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            config: RwLock::new(AppConfig {
                nexus_api_key: None,
                download_dir: String::from("./downloads"),
                max_concurrent_downloads: 3,
                cf_auto_solve: false,
            }),
            session: Mutex::new(UserSession {
                logged_in: false,
                username: None,
                premium: false,
                cookies: HashMap::new(),
            }),
            cookie_jar: Arc::new(RwLock::new(CookieJar {
                cookies: Vec::new(),
                last_synced: None,
            })),
            active_tasks: Mutex::new(Vec::new()),
        }
    }
}

// 在 Command 中使用 State
#[tauri::command]
fn get_config(state: tauri::State<AppState>) -> Result<AppConfig, String> {
    state.config.read()
        .map(|c| c.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_config(
    state: tauri::State<AppState>,
    new_config: AppConfig
) -> Result<(), String> {
    let mut config = state.config.write().map_err(|e| e.to_string())?;
    *config = new_config;
    Ok(())
}

#[tauri::command]
fn sync_cookies(
    state: tauri::State<AppState>,
    window: tauri::WebviewWindow,
    url: String
) -> Result<usize, String> {
    let url = url::Url::parse(&url).map_err(|e| e.to_string())?;
    let cookies = window.cookies_for_url(url)
        .map_err(|e| e.to_string())?;
    
    let mut jar = state.cookie_jar.write().map_err(|e| e.to_string())?;
    jar.cookies = cookies;
    jar.last_synced = Some(std::time::Instant::now());
    
    Ok(jar.cookies.len())
}
```

### 3.4 WebView Cookie 如何传递到 Rust 后端

#### 方案一：通过 cookies() API 直接获取

```rust
#[tauri::command]
async fn get_webview_cookies(
    window: tauri::WebviewWindow
) -> Result<Vec<serde_json::Value>, String> {
    // ⚠️ Windows 上，在同步 Command 中调用会死锁！
    // 必须使用 async Command
    let cookies = window.cookies()
        .map_err(|e| format!("Failed to get cookies: {}", e))?;
    
    let result = cookies.into_iter()
        .map(|c| serde_json::json!({
            "name": c.name,
            "value": c.value,
            "domain": c.domain,
            "path": c.path,
            "secure": c.secure,
            "httpOnly": c.http_only,
            "expires": c.expires.map(|e| e.as_secs())
        }))
        .collect();
    
    Ok(result)
}
```

#### 方案二：前端通过 JS 获取并传给 Rust

```typescript
// 前端获取 Cookie
function getDocumentCookies(): Record<string, string> {
  return document.cookie.split('; ').reduce((acc, curr) => {
    const [key, value] = curr.split('=');
    acc[key.trim()] = decodeURIComponent(value);
    return acc;
  }, {} as Record<string, string>);
}

// 传给 Rust
async function syncCookiesToRust() {
  const cookies = getDocumentCookies();
  await invoke('save_cookies', { cookies });
}
```

```rust
#[tauri::command]
fn save_cookies(
    state: tauri::State<AppState>,
    cookies: HashMap<String, String>
) -> Result<(), String> {
    let mut session = state.session.lock().map_err(|e| e.to_string())?;
    session.cookies = cookies;
    session.logged_in = session.cookies.contains_key("member_id");
    Ok(())
}
```

#### 方案三：使用 Cookie 同步中间件

```rust
// 自定义 Cookie 同步服务
use tauri::{AppHandle, Manager};

pub struct CookieSyncService {
    app_handle: AppHandle,
}

impl CookieSyncService {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }
    
    // 定期同步 WebView Cookie 到 Rust 状态
    pub fn start_sync_loop(&self) {
        let handle = self.app_handle.clone();
        
        tauri::async_runtime::spawn(async move {
            let mut interval = tokio::time::interval(
                std::time::Duration::from_secs(30)
            );
            
            loop {
                interval.tick().await;
                
                if let Some(window) = handle.get_webview_window("scraper") {
                    // ⚠️ 使用异步调用避免死锁
                    match async_get_cookies(&window).await {
                        Ok(cookies) => {
                            handle.emit("cookies-synced", cookies).unwrap();
                        }
                        Err(e) => {
                            eprintln!("Cookie sync failed: {}", e);
                        }
                    }
                }
            }
        });
    }
}

// 安全的异步 Cookie 获取
async fn async_get_cookies(
    window: &tauri::WebviewWindow
) -> Result<Vec<tauri::webview::Cookie>, String> {
    let window = window.clone();
    
    // 在单独线程中执行同步操作
    tokio::task::spawn_blocking(move || {
        window.cookies().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
```

---

## 4. Tauri + 外部浏览器集成方案

### 4.1 在 Tauri 中启动外部浏览器进程

#### 使用 tauri-plugin-shell 启动外部浏览器

```rust
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

#[tauri::command]
async fn open_external_browser(
    app: tauri::AppHandle,
    url: String
) -> Result<(), String> {
    // 使用系统默认浏览器打开 URL
    app.shell().open(url, None)
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn launch_chrome_with_args(
    app: tauri::AppHandle,
    url: String,
    user_data_dir: String
) -> Result<u32, String> {
    let (mut rx, mut child) = app.shell()
        .command("google-chrome")
        .args(&[
            &url,
            "--user-data-dir", &user_data_dir,
            "--disable-blink-features=AutomationControlled",
            "--disable-popup-blocking",
            "--no-first-run"
        ])
        .spawn()
        .map_err(|e| e.to_string())?;
    
    // 监听输出
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!("Chrome stdout: {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("Chrome stderr: {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Error(err) => {
                    eprintln!("Chrome error: {}", err);
                }
                CommandEvent::Terminated(payload) => {
                    println!("Chrome exited with code: {:?}", payload.code);
                }
                _ => {}
            }
        }
    });
    
    Ok(child.pid())
}
```

#### 使用 std::process 启动浏览器

```rust
use std::process::{Command, Stdio};

#[tauri::command]
fn launch_browser_process(url: String) -> Result<u32, String> {
    let child = Command::new("google-chrome")
        .args(&[
            &url,
            "--remote-debugging-port=9222",
            "--user-data-dir=/path/to/profile",
            "--disable-blink-features=AutomationControlled"
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    
    Ok(child.id())
}
```

### 4.2 Rust 调用 Playwright/Puppeteer 的方式

#### 方案一：通过 Sidecar 方式集成

```toml
# Cargo.toml
[dependencies]
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["process", "io-util"] }
```

```typescript
// sidecar/playwright-scraper.js - Playwright 脚本
const { chromium } = require('playwright');

async function scrapeNexusMods(gameId, options = {}) {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-popup-blocking',
      '--disable-infobars',
      '--window-size=1280,720'
    ]
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
    viewport: { width: 1280, height: 720 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai'
  });
  
  // 注入反检测脚本
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  
  const page = await context.newPage();
  
  // 加载 Cookie（如果有）
  if (options.cookies) {
    await context.addCookies(options.cookies);
  }
  
  await page.goto(`https://www.nexusmods.com/${gameId}/mods/`);
  
  // 提取数据
  const mods = await page.evaluate(() => {
    // 抓取逻辑...
    return Array.from(document.querySelectorAll('.mod-tile'))
      .map(el => ({
        name: el.querySelector('.mod-name')?.textContent,
        id: el.dataset.modId
      }));
  });
  
  // 导出 Cookie
  const cookies = await context.cookies();
  
  await browser.close();
  
  return JSON.stringify({ mods, cookies });
}

// 从命令行参数获取输入
const [,, gameId, optionsJson] = process.argv;
const options = optionsJson ? JSON.parse(optionsJson) : {};

scrapeNexusMods(gameId, options)
  .then(result => {
    console.log(result);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
```

```rust
// Rust 端：调用 Playwright sidecar
#[tauri::command]
async fn scrape_with_playwright(
    app: tauri::AppHandle,
    game_id: String,
    cookies: Option<Vec<serde_json::Value>>
) -> Result<ScrapeResult, String> {
    let shell = app.shell();
    
    let options = serde_json::json!({
        "cookies": cookies.unwrap_or_default()
    });
    
    let output = shell
        .sidecar("playwright-scraper")
        .unwrap()
        .args(&[&game_id, &options.to_string()])
        .output()
        .await
        .map_err(|e| format!("Playwright failed: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: ScrapeResult = serde_json::from_str(&stdout)
        .map_err(|e| format!("Parse error: {}", e))?;
    
    Ok(result)
}
```

#### 方案二：通过 WebSocket 与 Playwright 通信

```rust
use tokio::net::TcpStream;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use futures_util::{SinkExt, StreamExt};

// 连接到 Playwright 的远程调试端口
#[tauri::command]
async fn connect_to_browser_ws() -> Result<String, String> {
    let (ws_stream, _) = connect_async("ws://localhost:9222/devtools/browser")
        .await
        .map_err(|e| format!("WebSocket connection failed: {}", e))?;
    
    let (mut write, mut read) = ws_stream.split();
    
    // 发送 CDP 命令
    let command = serde_json::json!({
        "id": 1,
        "method": "Target.createTarget",
        "params": {
            "url": "https://www.nexusmods.com"
        }
    });
    
    write.send(Message::Text(command.to_string()))
        .await
        .map_err(|e| e.to_string())?;
    
    // 读取响应
    if let Some(Ok(Message::Text(response))) = read.next().await {
        return Ok(response);
    }
    
    Ok(String::from("No response"))
}
```

### 4.3 进程间通信（管道、WebSocket、HTTP 等）

#### HTTP API 方式（推荐）

```rust
use axum::{Router, routing::post, extract::State, Json};
use std::sync::Arc;
use tokio::net::TcpListener;
use serde::{Serialize, Deserialize};

#[derive(Clone)]
struct ApiState {
    app_handle: tauri::AppHandle,
}

#[derive(Deserialize)]
struct ScrapeRequest {
    url: String,
    selector: String,
}

#[derive(Serialize)]
struct ScrapeResponse {
    success: bool,
    data: Option<Vec<String>>,
    error: Option<String>,
}

pub async fn start_api_server(app_handle: tauri::AppHandle) {
    let state = ApiState { app_handle };
    
    let router = Router::new()
        .route("/scrape", post(handle_scrape))
        .route("/cookies", post(handle_set_cookies))
        .route("/cookies/get", post(handle_get_cookies))
        .with_state(state);
    
    let listener = TcpListener::bind("127.0.0.1:8472").await.unwrap();
    
    tauri::async_runtime::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
}

async fn handle_scrape(
    State(state): State<ApiState>,
    Json(req): Json<ScrapeRequest>
) -> Json<ScrapeResponse> {
    // 通过 Tauri 的 WebView 执行抓取
    if let Some(window) = state.app_handle.get_webview_window("scraper") {
        let script = format!(
            "Array.from(document.querySelectorAll('{}')).map(el => el.textContent)",
            req.selector
        );
        
        // 使用 eval 获取数据
        match window.eval(&script) {
            Ok(_) => Json(ScrapeResponse {
                success: true,
                data: Some(vec![]),
                error: None
            }),
            Err(e) => Json(ScrapeResponse {
                success: false,
                data: None,
                error: Some(e.to_string())
            })
        }
    } else {
        Json(ScrapeResponse {
            success: false,
            data: None,
            error: Some("Scraper window not found".to_string())
        })
    }
}
```

#### 管道方式

```rust
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::UnixStream;
use serde_json;

#[derive(Serialize, Deserialize)]
enum IpcMessage {
    Navigate { url: String },
    GetCookies,
    SetCookies { cookies: Vec<Cookie> },
    ExecuteScript { script: String },
    Result { data: serde_json::Value },
    Error { message: String },
}

async fn run_ipc_server(path: &str) -> Result<(), Box<dyn std::error::Error>> {
    // 创建 Unix Domain Socket
    let listener = tokio::net::UnixListener::bind(path)?;
    
    loop {
        let (mut socket, _) = listener.accept().await?;
        
        tokio::spawn(async move {
            let mut buf = vec![0u8; 4096];
            
            match socket.read(&mut buf).await {
                Ok(n) if n > 0 => {
                    let msg: IpcMessage = serde_json::from_slice(&buf[..n])
                        .unwrap_or(IpcMessage::Error { 
                            message: "Invalid message".to_string() 
                        });
                    
                    let response = match msg {
                        IpcMessage::GetCookies => {
                            // 获取 Cookie 逻辑
                            IpcMessage::Result { 
                                data: serde_json::json!({"cookies": []}) 
                            }
                        }
                        _ => IpcMessage::Error { 
                            message: "Unknown command".to_string() 
                        }
                    };
                    
                    let response_bytes = serde_json::to_vec(&response).unwrap();
                    let _ = socket.write_all(&response_bytes).await;
                }
                _ => {}
            }
        });
    }
}
```

### 4.4 结果和 Cookie 的传递机制

```rust
// Cookie 传递和转换
use tauri::webview::Cookie as TauriCookie;

#[derive(Serialize, Deserialize, Debug)]
struct PortableCookie {
    name: String,
    value: String,
    domain: String,
    path: String,
    expires: Option<u64>,
    secure: bool,
    http_only: bool,
    same_site: String,
}

impl From<TauriCookie> for PortableCookie {
    fn from(c: TauriCookie) -> Self {
        Self {
            name: c.name,
            value: c.value,
            domain: c.domain.unwrap_or_default(),
            path: c.path.unwrap_or_default(),
            expires: c.expires.map(|e| e.as_secs()),
            secure: c.secure,
            http_only: c.http_only,
            same_site: c.same_site.map(|s| s.to_string()).unwrap_or_default(),
        }
    }
}

// Cookie 共享服务
pub struct CookieBridge {
    app_handle: tauri::AppHandle,
}

impl CookieBridge {
    // 从 WebView 获取 Cookie 并导出
    pub async fn export_cookies(&self, url: &str) -> Result<Vec<PortableCookie>, String> {
        let window = self.app_handle
            .get_webview_window("scraper")
            .ok_or("Scraper window not found")?;
        
        let url = url::Url::parse(url).map_err(|e| e.to_string())?;
        
        // ⚠️ Windows 必须使用异步方式
        let window_clone = window.clone();
        let cookies = tokio::task::spawn_blocking(move || {
            window_clone.cookies_for_url(url)
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
        
        Ok(cookies.into_iter().map(PortableCookie::from).collect())
    }
    
    // 将 Cookie 导入 WebView
    pub fn import_cookies(&self, cookies: &[PortableCookie]) -> Result<(), String> {
        let window = self.app_handle
            .get_webview_window("scraper")
            .ok_or("Scraper window not found")?;
        
        for cookie in cookies {
            let script = format!(
                "document.cookie = '{}={}; domain={}; path={}; {} {}'",
                cookie.name,
                cookie.value,
                cookie.domain,
                cookie.path,
                if cookie.secure { "Secure; " } else { "" },
                if cookie.http_only { "HttpOnly; " } else { "" }
            );
            
            // 使用 eval 设置 Cookie
            let _ = window.eval(&script);
        }
        
        Ok(())
    }
    
    // 同步 Cookie 到外部浏览器配置文件
    pub async fn sync_to_external_browser(
        &self,
        profile_path: &str
    ) -> Result<(), String> {
        let cookies = self.export_cookies("https://www.nexusmods.com").await?;
        
        // 写入 Chrome 的 Cookie 数据库
        let cookie_db = format!("{}/Default/Cookies", profile_path);
        
        // 使用 rusqlite 或直接操作 SQLite
        // ...
        
        Ok(())
    }
}
```

---

## 5. Tauri WebView 已知问题和解决方案

### 5.1 WebView 假死的常见原因和解决方案

#### 原因一：Windows 上同步调用 cookies() 导致死锁

**问题描述**：在 Windows 上，`webview.cookies()` 在同步 Command 或事件处理器中调用会导致死锁。这是因为 WebView2 的 COM 线程模型与 Tauri 的线程模型冲突。

**解决方案**：

```rust
// ❌ 错误：同步调用会导致死锁
#[tauri::command]
fn bad_get_cookies(window: tauri::WebviewWindow) -> Result<Vec<Cookie>, String> {
    let cookies = window.cookies()  // 死锁！
        .map_err(|e| e.to_string())?;
    Ok(cookies)
}

// ✅ 正确：使用异步 Command
#[tauri::command]
async fn good_get_cookies(window: tauri::WebviewWindow) -> Result<Vec<Cookie>, String> {
    let cookies = window.cookies()
        .map_err(|e| e.to_string())?;
    Ok(cookies)
}

// ✅ 更安全的做法：在单独线程中执行
#[tauri::command]
async fn safest_get_cookies(
    window: tauri::WebviewWindow,
    url: String
) -> Result<Vec<Cookie>, String> {
    let window_clone = window.clone();
    let url = url::Url::parse(&url).map_err(|e| e.to_string())?;
    
    let cookies = tokio::task::spawn_blocking(move || {
        window_clone.cookies_for_url(url)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(|e| format!("Cookie error: {}", e))?;
    
    Ok(cookies)
}
```

#### 原因二：additional_browser_args 导致多窗口死锁

**问题描述**：在 Windows 上，创建多个 WebviewWindow 时使用 `additional_browser_args()` 会导致应用完全冻结。这是 WebView2 的环境创建限制。

**解决方案**：

```rust
// ❌ 错误：每个窗口设置不同的 additional_browser_args
let window1 = WebviewWindowBuilder::new(app, "w1", url1)
    .additional_browser_args("--arg1")
    .build()?;

let window2 = WebviewWindowBuilder::new(app, "w2", url2)
    .additional_browser_args("--arg2")  // 会导致死锁！
    .build()?;

// ✅ 正确：所有窗口共享相同的 browser args
const SHARED_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

let window1 = WebviewWindowBuilder::new(app, "w1", url1)
    .additional_browser_args(SHARED_ARGS)
    .build()?;

let window2 = WebviewWindowBuilder::new(app, "w2", url2)
    .additional_browser_args(SHARED_ARGS)  // 相同参数可以
    .build()?;

// ✅ 更好：避免使用 additional_browser_args，改用 initialization_script
let window = WebviewWindowBuilder::new(app, "w1", url)
    .initialization_script(STEALTH_SCRIPT)  // 替代 browser args
    .build()?;
```

#### 原因三：长时间 JavaScript 执行阻塞 WebView

**解决方案**：

```rust
// 将长时间任务拆分为多个小块
#[tauri::command]
async fn long_running_task(
    window: tauri::WebviewWindow,
    on_event: tauri::ipc::Channel<ProgressEvent>
) -> Result<(), String> {
    for i in 0..100 {
        // 每步都 yield 控制权
        tokio::task::yield_now().await;
        
        // 执行小批量工作
        do_small_chunk_of_work(&window, i).await?;
        
        // 报告进度
        on_event.send(ProgressEvent {
            percent: i,
            message: format!("Step {}/100", i)
        }).unwrap();
        
        // 添加小延迟让 WebView 处理 UI
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    
    Ok(())
}
```

#### 原因四：ARM64 Windows 上的 COM 死锁

**问题描述**：Windows ARM64 (Snapdragon X Elite) 上，WebView2 初始化时 COM 回调分发问题导致死锁。

**参考**：https://github.com/npiesco/wry-arm64-deadlock

**解决方案**：确保使用最新版本的 wry 和 tauri-runtime-wry，修复已经在最新版本中合并。

### 5.2 Cookie 过期和刷新的处理

```rust
use std::time::{SystemTime, UNIX_EPOCH};

#[tauri::command]
async fn check_and_refresh_cookies(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    url: String
) -> Result<CookieRefreshResult, String> {
    let url_parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
    
    let cookies = window.cookies_for_url(url_parsed.clone())
        .map_err(|e| e.to_string())?;
    
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    
    let mut expired = Vec::new();
    let mut valid = Vec::new();
    let mut needs_refresh = false;
    
    for cookie in &cookies {
        if let Some(expires) = &cookie.expires {
            if expires.as_secs() < now {
                expired.push(cookie.name.clone());
                needs_refresh = true;
            } else if expires.as_secs() - now < 300 { // 5分钟内过期
                valid.push(cookie.name.clone());
                needs_refresh = true;
            } else {
                valid.push(cookie.name.clone());
            }
        }
    }
    
    if needs_refresh {
        // 通知前端需要刷新
        app.emit_to("main", "cookies-needs-refresh", &expired)
            .unwrap();
    }
    
    Ok(CookieRefreshResult {
        expired,
        valid,
        needs_refresh,
        total: cookies.len(),
    })
}

#[derive(Serialize)]
struct CookieRefreshResult {
    expired: Vec<String>,
    valid: Vec<String>,
    needs_refresh: bool,
    total: usize,
}
```

### 5.3 长时间运行的 WebView 任务管理

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

// 可取消的任务
pub struct ManagedTask {
    cancel_token: Arc<AtomicBool>,
    handle: Option<tokio::task::JoinHandle<()>>,
}

impl ManagedTask {
    pub fn new() -> Self {
        Self {
            cancel_token: Arc::new(AtomicBool::new(false)),
            handle: None,
        }
    }
    
    pub fn spawn<F>(&mut self, future: F)
    where
        F: std::future::Future<Output = ()> + Send + 'static
    {
        let token = self.cancel_token.clone();
        self.handle = Some(tokio::spawn(async move {
            // 包装 future 以便可取消
            tokio::select! {
                _ = future => {},
                _ = Self::cancel_watcher(token) => {
                    println!("Task cancelled");
                }
            }
        }));
    }
    
    pub fn cancel(&self) {
        self.cancel_token.store(true, Ordering::Relaxed);
    }
    
    async fn cancel_watcher(token: Arc<AtomicBool>) {
        while !token.load(Ordering::Relaxed) {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    }
}

// 在状态中使用
pub struct AppState {
    pub scraper_task: Mutex<ManagedTask>,
}

#[tauri::command]
async fn start_scraping(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut task = state.scraper_task.lock().await;
    task.cancel(); // 取消之前的任务
    
    let app_clone = app.clone();
    task.spawn(async move {
        // 长时间运行的抓取任务
        for page in 1..=100 {
            // 检查是否取消
            if task.cancel_token.load(Ordering::Relaxed) {
                break;
            }
            
            // 执行抓取...
            app_clone.emit("scrape-progress", page).unwrap();
            
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
    });
    
    Ok(())
}

#[tauri::command]
async fn stop_scraping(
    state: tauri::State<'_, AppState>
) -> Result<(), String> {
    let task = state.scraper_task.lock().await;
    task.cancel();
    Ok(())
}
```

### 5.4 异步操作的最佳实践

```rust
// 1. 所有 I/O 操作都使用 async
#[tauri::command]
async fn fetch_page(app: AppHandle, url: String) -> Result<String, String> {
    // 使用 reqwest 进行异步 HTTP 请求
    let client = reqwest::Client::new();
    let response = client.get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    let body = response.text().await.map_err(|e| e.to_string())?;
    Ok(body)
}

// 2. 使用 tokio::spawn 处理并行任务
#[tauri::command]
async fn fetch_multiple_pages(urls: Vec<String>) -> Result<Vec<String>, String> {
    let handles: Vec<_> = urls.into_iter()
        .map(|url| {
            tokio::spawn(async move {
                let client = reqwest::Client::new();
                client.get(&url).send().await?.text().await
            })
        })
        .collect();
    
    let mut results = Vec::new();
    for handle in handles {
        match handle.await {
            Ok(Ok(text)) => results.push(text),
            Ok(Err(e)) => eprintln!("Request error: {}", e),
            Err(e) => eprintln!("Task error: {}", e),
        }
    }
    
    Ok(results)
}

// 3. 使用 channel 进行流式数据传输
#[tauri::command]
async fn stream_logs(on_event: tauri::ipc::Channel<LogEvent>) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
    
    for i in 0..60 {
        interval.tick().await;
        
        on_event.send(LogEvent {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            message: format!("Log entry {}", i)
        }).unwrap();
    }
}

// 4. 使用 timeout 防止长时间阻塞
#[tauri::command]
async fn fetch_with_timeout(url: String) -> Result<String, String> {
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        async {
            let client = reqwest::Client::new();
            client.get(&url).send().await?.text().await
        }
    ).await;
    
    match result {
        Ok(Ok(text)) => Ok(text),
        Ok(Err(e)) => Err(format!("Request error: {}", e)),
        Err(_) => Err("Timeout".to_string()),
    }
}

// 5. 错误处理
#[derive(Debug, thiserror::Error)]
enum ScraperError {
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    
    #[error("WebView error: {0}")]
    WebView(String),
    
    #[error("Cookie expired")]
    CookieExpired,
    
    #[error("Cloudflare challenge detected")]
    CloudflareChallenge,
    
    #[error("Rate limited")]
    RateLimited,
}

impl serde::Serialize for ScraperError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[tauri::command]
async fn robust_scrape(url: String) -> Result<ScrapeData, ScraperError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;
    
    let response = client.get(&url).send().await?;
    
    match response.status() {
        reqwest::StatusCode::OK => {
            let data = response.json::<ScrapeData>().await?;
            Ok(data)
        }
        reqwest::StatusCode::FORBIDDEN => {
            Err(ScraperError::CloudflareChallenge)
        }
        reqwest::StatusCode::TOO_MANY_REQUESTS => {
            Err(ScraperError::RateLimited)
        }
        status => {
            Err(ScraperError::WebView(format!("HTTP {}", status)))
        }
    }
}
```

---

## 6. 推荐的架构设计方案

### 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     Tauri Desktop App                        │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Main UI    │  │ CF Challenge │  │   Scraper    │       │
│  │   Window     │  │   Window     │  │   Window     │       │
│  │  (Visible)   │  │  (Visible)   │  │  (Hidden)    │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                  │               │
│         └─────────────────┼──────────────────┘               │
│                           │                                  │
│              ┌────────────┴────────────┐                     │
│              │    Rust Backend          │                     │
│              │                          │                     │
│              │  ┌────────────────────┐  │                     │
│              │  │    AppState        │  │                     │
│              │  │  - CookieJar       │  │                     │
│              │  │  - Session         │  │                     │
│              │  │  - Config          │  │                     │
│              │  └────────────────────┘  │                     │
│              │  ┌────────────────────┐  │                     │
│              │  │  CookieBridge      │  │                     │
│              │  │  (Sync Service)    │  │                     │
│              │  └────────────────────┘  │                     │
│              │  ┌────────────────────┐  │                     │
│              │  │  ScrapeManager     │  │                     │
│              │  │  (Task Queue)      │  │                     │
│              │  └────────────────────┘  │                     │
│              └────────────┬─────────────┘                     │
│                           │                                  │
│              ┌────────────┴────────────┐                     │
│              │   IPC/Event System       │                     │
│              │  - Commands              │                     │
│              │  - Events                │                     │
│              │  - Channels              │                     │
│              └──────────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         ┌────▼────┐  ┌────▼────┐  ┌────▼────┐
         │ Nexus   │  │Cloudflare│  │ External│
         │  Mods   │  │ Challenge│  │ Browser │
         │  API    │  │   Page   │  │(Optional│
         └─────────┘  └─────────┘  └─────────┘
```

### 推荐的实现结构

```
src-tauri/
├── src/
│   ├── main.rs              # 应用入口
│   ├── lib.rs               # 库入口
│   ├── commands/
│   │   ├── mod.rs           # Command 注册
│   │   ├── scraper.rs       # 抓取相关命令
│   │   ├── cookie.rs        # Cookie 管理命令
│   │   └── window.rs        # 窗口管理命令
│   ├── state/
│   │   ├── mod.rs           # 状态定义
│   │   ├── app_state.rs     # 应用状态
│   │   └── cookie_jar.rs    # Cookie 存储
│   ├── services/
│   │   ├── mod.rs
│   │   ├── cookie_bridge.rs # Cookie 同步服务
│   │   ├── scraper.rs       # 抓取服务
│   │   └── cloudflare.rs    # Cloudflare 处理服务
│   ├── webview/
│   │   ├── mod.rs
│   │   ├── stealth.rs       # 反检测脚本
│   │   └── config.rs        # WebView 配置
│   └── utils/
│       ├── mod.rs
│       └── error.rs         # 错误类型
├── Cargo.toml
└── tauri.conf.json
```

### 核心配置

```json
// tauri.conf.json
{
  "identifier": "com.example.nexusmods-scraper",
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Nexus Mods Scraper",
        "width": 1200,
        "height": 800,
        "center": true,
        "create": true
      },
      {
        "label": "scraper",
        "url": "https://www.nexusmods.com",
        "visible": false,
        "width": 1280,
        "height": 720,
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "create": false
      },
      {
        "label": "cf_challenge",
        "visible": false,
        "width": 800,
        "height": 600,
        "center": true,
        "alwaysOnTop": true,
        "closable": true,
        "create": false
      }
    ]
  },
  "plugins": {}
}
```

```rust
// src/main.rs
use tauri::Manager;

mod commands;
mod state;
mod services;
mod webview;

use state::AppState;
use webview::stealth::STEALTH_SCRIPT;

fn main() {
    tauri::Builder::default()
        .manage(AppState::new())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            commands::scraper::start_scrape,
            commands::scraper::stop_scrape,
            commands::cookie::get_cookies,
            commands::cookie::set_cookies,
            commands::cookie::sync_cookies,
            commands::window::create_cf_window,
            commands::window::close_cf_window,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            // 初始化服务
            services::cookie_bridge::init(&app_handle);
            
            // 创建主窗口
            let main_window = app.get_webview_window("main")
                .expect("Main window not found");
            
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    if window.label() == "main" {
                        window.hide().unwrap();
                        api.prevent_close();
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context())
        .expect("error while running tauri application");
}
```

---

## 7. 相关参考链接

### Tauri 官方文档

| 资源 | 链接 |
|------|------|
| Tauri v2 WebviewWindowBuilder API | https://docs.rs/tauri/2.0.0-rc/tauri/webview/struct.WebviewWindowBuilder.html |
| Tauri v2 WebviewWindow API | https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindow.html |
| Tauri v2 Cookie API | https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindow.html#method.cookies |
| Tauri v2 Event System | https://docs.rs/tauri/latest/tauri/trait.Listener.html |
| Tauri v2 Channel | https://docs.rs/tauri/latest/tauri/ipc/struct.Channel.html |
| Tauri v2 Shell Plugin | https://v2.tauri.app/develop/sidecar/ |
| Tauri v2 HTTP Plugin | https://v2.tauri.app/plugin/http/ |

### GitHub Issues

| Issue | 链接 | 说明 |
|-------|------|------|
| Windows cookies() 死锁 | https://github.com/tauri-apps/tauri/issues/ (Webview2 deadlock) | cookies() 在同步 Command 中死锁 |
| additional_browser_args 死锁 | https://github.com/tauri-apps/tauri/issues/15014 | 多窗口死锁 |
| Cookie 管理分离问题 | https://github.com/tauri-apps/tauri/issues/13045 | tauri-plugin-http Cookie 不共享 |
| WebView Cookie/LocaStorage 存储位置 | https://github.com/orgs/tauri-apps/discussions/8637 | Cookie 存储位置讨论 |
| 清除 WebView 数据 API | https://github.com/tauri-apps/wry/issues/914 | clear_browsing_data 功能 |

### 反检测技术参考

| 资源 | 链接 | 说明 |
|------|------|------|
| navigator.webdriver 隐藏 | https://developer.mozilla.org/en-US/docs/Web/API/Navigator/webdriver | MDN 文档 |
| --disable-blink-features | https://www.zenrows.com/blog/disable-blink-features-automationcontrolled | 参数说明 |
| WebView2 参数 | https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/webview-features-flags | WebView2 功能标志 |

### 外部工具集成

| 资源 | 链接 | 说明 |
|------|------|------|
| tauri-plugin-webdriver | https://github.com/Choochmeque/tauri-plugin-webdriver | Tauri WebDriver 实现 |
| tauri-plugin-automation | https://github.com/dcherrera/tauri-plugin-automation | HTTP 自动化 API |
| Playwright | https://playwright.dev/ | 浏览器自动化 |
| puppeteer-extra-plugin-stealth | https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth | Puppeteer 反检测插件 |

---

## 总结

### 关键要点

1. **反检测配置**：使用 `initialization_script` 隐藏 `navigator.webdriver`，配合 `user_agent` 和平台特定配置，可以有效降低被 Cloudflare 检测的概率。

2. **Cookie 管理**：Tauri v2 提供了 `cookies()`、`cookies_for_url()`、`delete_all_cookies()` 等原生 API，但 Windows 上必须在异步 Command 中使用以避免死锁。

3. **多窗口架构**：推荐采用"主窗口 + 隐藏抓取窗口 + Cloudflare 验证窗口"的三窗口架构，通过事件系统和 Channel 进行通信。

4. **外部浏览器集成**：可以通过 Sidecar 模式集成 Playwright/Puppeteer，或使用 HTTP API 进行进程间通信。

5. **假死问题**：主要死锁原因包括同步调用 `cookies()`、`additional_browser_args` 配置不当等，使用异步模式可以有效避免。

### 开发建议

1. **始终使用异步 Command** 处理 WebView 相关操作
2. **定期同步 Cookie** 到持久化存储，防止过期丢失
3. **使用 initialization_script** 而非 additional_browser_args 来配置反检测
4. **实现任务取消机制**，防止长时间运行的抓取任务导致资源泄漏
5. **充分测试** 在目标操作系统上的行为差异

---

*报告完成。本报告基于 Tauri v2.x 的文档、源代码和 GitHub Issues 分析整理。*
