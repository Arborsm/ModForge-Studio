# Tauri 多窗口 Cookie 同步与架构设计研究报告

> 研究日期: 2025年  
> 目标: Tauri v2 桌面应用多窗口场景下 Cloudflare Challenge Cookie 同步方案  
> 适用场景: 需要通过 WebView 完成 Cloudflare 验证后将 Cookie 同步到 Rust 后端 HTTP 客户端

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [Tauri 多窗口最佳实践](#2-tauri-多窗口最佳实践)
3. [Cookie 管理方案](#3-cookie-管理方案)
4. [前后端同步架构](#4-前后端同步架构)
5. [四种架构模式对比分析](#5-四种架构模式对比分析)
6. [推荐架构方案](#6-推荐架构方案)
7. [核心代码实现](#7-核心代码实现)
8. [状态流转图](#8-状态流转图)
9. [错误处理策略](#9-错误处理策略)
10. [各方案权衡对比表](#10-各方案权衡对比表)

---

## 1. 执行摘要

### 1.1 问题背景

在 Tauri 桌面应用中，需要弹出 WebView 窗口让用户通过 Cloudflare Challenge 验证（获取 `cf_clearance` Cookie），然后将获得的 Cookie 同步到主应用的 HTTP 客户端（reqwest）中。当前面临以下核心问题：

| 问题 | 根因分析 | 严重程度 |
|------|---------|---------|
| **窗口假死** | 在主线程创建 WebView、同步等待验证结果、WebView2 平台 Bug | 高 |
| **Cookie 过期** | `cf_clearance` 有效期仅 30-60 分钟，无自动刷新机制 | 高 |
| **前后端不同步** | WebView Cookie 与 reqwest Cookie Store 完全独立，无自动同步 | 高 |
| **多窗口 Cookie 共享** | 各 WebView 实例 Cookie 隔离，需手动同步 | 中 |

### 1.2 核心发现

1. **Tauri 存在两套独立的 Cookie 系统**：WebView 内建 Cookie 管理（由平台 WebView 引擎控制）与 reqwest/tauri-plugin-http 的 Cookie Store 完全隔离，互不影响
2. **`cf_clearance` Cookie 强绑定**：Cloudflare 将 clearance Cookie 与设备指纹、IP 地址、User-Agent 强绑定，无法简单移植
3. **`webview.eval()` 不直接返回结果**：需通过 IPC Channel/Command 将 JavaScript 执行结果传回 Rust
4. **窗口假死主要因阻塞主线程**：创建窗口或同步等待操作必须在主线程异步处理

### 1.3 推荐方案

**模式 A（推荐）+ 模式 D（降级）混合方案**：
- 正常流程：弹出 WebView 验证窗口 → JS 监听 Cookie 变化 → IPC 传回 Rust → 持久化到 `CookieStore` → 关闭窗口 → 自动注入 reqwest
- 降级流程：当 WebView 验证反复失败时，允许用户手动粘贴 Cookie 字符串
- 配套定时刷新机制 + 过期自动重验证

---

## 2. Tauri 多窗口最佳实践

### 2.1 Tauri v2 窗口架构

Tauri v2 采用统一的 `WebviewWindow` 类型管理窗口和 WebView：

```
┌─────────────────────────────────────┐
│           Tauri App Process          │
│  ┌──────────────────────────────┐   │
│  │      Rust Core (Main)        │   │
│  │  ┌──────────────────────┐   │   │
│  │  │   App State (Mutex)  │   │   │
│  │  │  - CookieStore       │   │   │
│  │  │  - Window Registry   │   │   │
│  │  │  - Refresh Timers    │   │   │
│  │  └──────────────────────┘   │   │
│  └──────────────────────────────┘   │
│              │ IPC                   │
│  ┌───────────┼───────────┐          │
│  │           │           │          │
│  ▼           ▼           ▼          │
│ ┌────┐   ┌────┐   ┌────┐          │
│ │WebV│   │WebV│   │WebV│          │
│ │iew1│   │iew2│   │iew3│          │
│ │Main│   │Auth│   │Dev │          │
│ └────┘   └────┘   └────┘          │
│ 独立进程  独立进程  独立进程         │
└─────────────────────────────────────┘
```

### 2.2 窗口创建与生命周期管理

#### 关键原则

1. **在主线程外创建窗口**：窗口创建可能阻塞，使用 `async` 或后台线程
2. **先隐藏后显示**：创建窗口时 `visible: false`，内容加载完成后再 `show()`
3. **使用 `on_webview_ready` 钩子**：执行初始化脚本
4. **窗口关闭时清理资源**：监听 `Destroyed` 事件释放 PTY、定时器等

#### 代码示例

```rust
use tauri::{AppHandle, WebviewWindowBuilder, WebviewUrl, Manager};

/// 创建验证窗口（异步，避免阻塞）
pub async fn create_auth_window(app: &AppHandle) -> Result<String, String> {
    let window_id = format!("auth-{}", uuid::Uuid::new_v4());
    
    // 在独立异步任务中创建窗口
    let window = WebviewWindowBuilder::new(
        app,
        &window_id,
        WebviewUrl::External("https://example.com/challenge".parse().unwrap()),
    )
    .title("安全验证")
    .inner_size(800.0, 600.0)
    .center()
    .visible(false)        // 先隐藏，加载完成再显示
    .build()
    .map_err(|e| format!("创建窗口失败: {}", e))?;
    
    // 等待窗口内容加载完成后再显示
    window.once("tauri://created", {
        let window = window.clone();
        move |_| {
            let _ = window.show();
            let _ = window.set_focus();
        }
    });
    
    Ok(window_id)
}

/// 注册窗口销毁监听，确保资源清理
fn setup_window_cleanup(app: &mut tauri::App) {
    app.on_window_event(|window, event| {
        if let tauri::WindowEvent::Destroyed = event {
            let label = window.label();
            if label.starts_with("auth-") {
                // 清理该窗口关联的资源
                let app_handle = window.app_handle();
                if let Ok(mut registry) = app_handle.state::<WindowRegistry>().lock() {
                    registry.remove(label);
                }
            }
        }
    });
}
```

### 2.3 避免窗口假死的架构模式

#### 假死根因分析

| 平台 | 根因 | 解决方案 |
|------|------|---------|
| **Windows** | WebView2 运行时初始化阻塞、`tao::EventLoop` 消息泵卡住 | 异步创建窗口、使用 `tokio::spawn` |
| **Linux** | WebKitGTK compositor 输入区域未重新协商、`set_focus()` 后焦点未获取 | 设置 `WEBKIT_DISABLE_COMPOSITING_MODE=1`、延迟 `set_focus()` + 微 resize |
| **通用** | 同步等待验证结果阻塞主线程、同步 IPC 调用超时 | 全部使用异步模式 + 超时机制 |

#### 防假死最佳实践

```rust
/// 使用异步创建 + 超时机制
use tokio::time::{timeout, Duration};

#[tauri::command]
async fn open_auth_window(
    app: AppHandle,
    state: State<'_, Arc<Mutex<AuthState>>>,
) -> Result<AuthResult, AuthError> {
    // 1. 异步创建窗口（不阻塞）
    let window = tokio::task::spawn_blocking({
        let app = app.clone();
        move || create_auth_webview(&app)
    })
    .await
    .map_err(|e| AuthError::WindowCreation(e.to_string()))?;
    
    // 2. 使用 Channel 等待结果（异步，可超时）
    let result = timeout(
        Duration::from_secs(120),  // 2分钟超时
        wait_for_auth_completion(&app, &window_id)
    )
    .await
    .map_err(|_| AuthError::Timeout)?;
    
    // 3. 清理窗口（异步）
    tokio::spawn(async move {
        let _ = window.close();
    });
    
    Ok(result)
}
```

### 2.4 窗口间通信（IPC）模式

Tauri v2 提供三种 IPC 原语：

```
┌──────────────────────────────────────────────────┐
│                    IPC Patterns                    │
├──────────────┬───────────────────────────────────┤
│   Commands   │ 前端 -> 后端 请求-响应              │
│              │ invoke('command', args) -> Result  │
├──────────────┼───────────────────────────────────┤
│   Events     │ 双向 发布-订阅                      │
│              │ emit/listen, 一对多                │
├──────────────┼───────────────────────────────────┤
│   Channel    │ 后端 -> 前端 流式数据               │
│              │ 适合高频/大数据传输                 │
└──────────────┴───────────────────────────────────┘
```

#### 模式选择指南

| 场景 | 推荐模式 | 原因 |
|------|---------|------|
| Cookie 提取通知 | **Event** | 后端主动推送，前端无需轮询 |
| 验证状态查询 | **Command** | 请求-响应，有明确返回值 |
| 实时进度推送 | **Channel** | 流式数据，高效传输 |
| 多窗口状态同步 | **Event** (`emitTo`) | 精确目标窗口 |

#### 跨窗口 Event 示例

```rust
// Rust: 向特定窗口发送事件
use tauri::Emitter;

app_handle
    .get_webview_window("auth-xxx")
    .unwrap()
    .emit("cookie-captured", CookiePayload {
        name: "cf_clearance".to_string(),
        value: cookie_value,
        expires: expiry_timestamp,
    })
    .ok();
```

```typescript
// 前端: 在验证窗口中监听
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

// 监听 Cookie 变化
const unlisten = await listen<CookiePayload>('cookie-captured', async (event) => {
    console.log('Cookie captured:', event.payload);
    // 通知后端验证完成
    await invoke('auth_completed', { cookie: event.payload });
});

// 组件卸载时取消监听
unlisten();
```

---

## 3. Cookie 管理方案

### 3.1 Cloudflare Cookie 机制

#### `cf_clearance` Cookie 特性

| 特性 | 说明 |
|------|------|
| **有效期** | 通常 30-60 分钟，部分配置可达 24 小时 |
| **绑定维度** | 与 IP 地址、User-Agent、设备指纹强绑定 |
| **安全级别** | Interactive > Managed > Non-Interactive |
| **作用** | 证明访客已通过 Cloudflare 挑战验证 |
| **IP 一致性** | 更换 IP 后立即失效 |
| **User-Agent** | 必须与获取时完全一致 |

#### Clearance 级别

```
┌────────────────────────────────────────────────────────┐
│              Clearance Level Hierarchy                  │
├──────────────────┬─────────────────────────────────────┤
│  Interactive (高) │ 可绕过: Interactive + Managed +     │
│                  │       Non-Interactive               │
├──────────────────┼─────────────────────────────────────┤
│  Managed (中)    │ 可绕过: Managed + Non-Interactive   │
├──────────────────┼─────────────────────────────────────┤
│  Non-Interactive │ 可绕过: Non-Interactive only        │
│  (低)            │                                     │
└──────────────────┴─────────────────────────────────────┘
```

### 3.2 WebView Cookie 提取方案

#### 方案 1: JavaScript 轮询 + IPC（推荐）

```typescript
// auth-window.ts - 在验证窗口中运行
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';

class CookieMonitor {
    private intervalId: number | null = null;
    private lastCookie: string = '';
    
    start() {
        // 每 2 秒检查一次 document.cookie
        this.intervalId = window.setInterval(async () => {
            const currentCookie = document.cookie;
            if (currentCookie !== this.lastCookie) {
                this.lastCookie = currentCookie;
                // 通过 IPC 将 Cookie 传回 Rust
                await invoke('cookie_changed', { 
                    cookie: currentCookie,
                    url: window.location.href 
                });
            }
            
            // 特别检查 cf_clearance
            const cfMatch = currentCookie.match(/cf_clearance=([^;]+)/);
            if (cfMatch) {
                await invoke('cf_clearance_found', {
                    value: cfMatch[1],
                    userAgent: navigator.userAgent,
                });
            }
        }, 2000);
    }
    
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}

// 页面加载完成后启动监控
window.addEventListener('DOMContentLoaded', () => {
    const monitor = new CookieMonitor();
    monitor.start();
});
```

#### 方案 2: Navigation 钩子监听

```rust
use tauri::Manager;

// 在创建窗口时注册导航监听
let window = WebviewWindowBuilder::new(app, label, url)
    .on_navigation(|url| {
        // URL 变化时可能已完成验证
        println!("Navigating to: {}", url);
        // 触发 Cookie 提取
        true // 允许导航
    })
    .build()?;
```

#### 方案 3: 页面可见性检测

```typescript
// 当验证窗口变为可见时提取 Cookie
document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
        const cookies = document.cookie;
        await invoke('extract_cookies', { cookies });
    }
});
```

### 3.3 Cookie 持久化存储

```
┌─────────────────────────────────────────────────────────────┐
│                   Cookie Storage Architecture                │
├─────────────────────────┬───────────────────────────────────┤
│   Memory Layer          │  `Arc<CookieStoreMutex>`          │
│   (运行时)              │  reqwest CookieStore 线程安全封装   │
├─────────────────────────┼───────────────────────────────────┤
│   Persistence Layer     │  JSON 文件 (`cookies.json`)        │
│   (跨会话)              │  应用数据目录下                     │
├─────────────────────────┼───────────────────────────────────┤
│   Sync Layer            │  IPC Channel                      │
│   (WebView <-> Rust)    │  Event 双向通信                     │
└─────────────────────────┴───────────────────────────────────┘
```

### 3.4 Cookie 过期检测与刷新

```rust
use std::time::{SystemTime, UNIX_EPOCH, Duration};
use cookie_store::CookieStore;
use reqwest_cookie_store::CookieStoreMutex;

/// Cookie 状态跟踪器
pub struct CookieTracker {
    /// Cookie 存储
    store: Arc<CookieStoreMutex>,
    /// 最后获取时间
    last_acquired: Arc<Mutex<Option<SystemTime>>>,
    /// 过期时间
    expires_at: Arc<Mutex<Option<SystemTime>>>,
    /// User-Agent（必须与获取时一致）
    user_agent: Arc<Mutex<Option<String>>>,
    /// 定时刷新句柄
    refresh_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl CookieTracker {
    /// 检查 Cookie 是否即将过期（剩余时间 < 阈值）
    pub async fn is_expiring_soon(&self, threshold_secs: u64) -> bool {
        let expires = self.expires_at.lock().await;
        match *expires {
            Some(expiry) => {
                let now = SystemTime::now();
                match expiry.duration_since(now) {
                    Ok(remaining) => remaining < Duration::from_secs(threshold_secs),
                    Err(_) => true, // 已过期
                }
            }
            None => true, // 未设置过期时间，视为已过期
        }
    }
    
    /// 启动自动刷新定时器
    pub async fn start_auto_refresh(&self, app: AppHandle) {
        let tracker = self.clone();
        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(30));
            loop {
                interval.tick().await;
                
                if tracker.is_expiring_soon(300).await { // 5分钟阈值
                    // 发出刷新请求
                    let _ = app.emit("cookie-refresh-needed", ());
                    
                    // 尝试静默刷新
                    match attempt_silent_refresh(&app).await {
                        Ok(_) => log::info!("Cookie 自动刷新成功"),
                        Err(e) => {
                            log::warn!("自动刷新失败: {}, 需要重新验证", e);
                            let _ = app.emit("auth-required", AuthReason::CookieExpired);
                        }
                    }
                }
            }
        });
        
        *self.refresh_handle.lock().await = Some(handle);
    }
}
```

### 3.5 Rust 后端 reqwest Cookie 同步

```rust
use reqwest_cookie_store::CookieStoreMutex;
use reqwest::header::HeaderValue;
use std::sync::Arc;

/// 将 Cookie 注入 reqwest 客户端
pub fn create_http_client(
    cookie_store: Arc<CookieStoreMutex>,
    user_agent: &str,
) -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder()
        .cookie_provider(cookie_store)
        .user_agent(user_agent)
        .timeout(Duration::from_secs(30))
        .build()
}

/// 手动注入特定 Cookie（用于 cf_clearance 等）
pub fn inject_cookie(
    store: &Arc<CookieStoreMutex>,
    name: &str,
    value: &str,
    domain: &str,
    path: &str,
) -> Result<(), Box<dyn Error>> {
    let mut store = store.lock()?;
    let cookie = cookie_store::Cookie::parse(
        format!("{}={}; Domain={}; Path={}", name, value, domain, path),
        &url::Url::parse(&format!("https://{}/", domain))?,
    )?;
    store.insert(&cookie, &url::Url::parse(&format!("https://{}/", domain))?)?;
    Ok(())
}
```

---

## 4. 前后端同步架构

### 4.1 状态管理方案

#### 推荐: Rust 中心化状态 + Event 同步

```
┌─────────────────────────────────────────────────────────────┐
│                    State Architecture                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────┐              │
│  │          Rust Backend (Single Source)     │              │
│  │  ┌─────────────────────────────────────┐  │              │
│  │  │      AppState (Mutex<AuthState>)    │  │              │
│  │  │  ┌───────────────────────────────┐  │  │              │
│  │  │  │ cookie_store: CookieStore     │  │  │              │
│  │  │  │ user_agent: Option<String>    │  │  │              │
│  │  │  │ status: AuthStatus            │  │  │              │
│  │  │  │ expires_at: Option<SystemTime>│  │  │              │
│  │  │  │ refresh_timer: Option<Handle> │  │  │              │
│  │  │  └───────────────────────────────┘  │  │              │
│  │  └─────────────────────────────────────┘  │              │
│  │              │                           │              │
│  │    emit("state-changed")                  │              │
│  └──────────────┼───────────────────────────┘              │
│                 │                                           │
│     ┌───────────┴───────────┐                               │
│     ▼                       ▼                               │
│  ┌──────┐              ┌──────┐                            │
│  │ Main │              │ Auth │                            │
│  │Window│              │Window│                            │
│  │      │              │      │                            │
│  └──────┘              └──────┘                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### AuthState 定义

```rust
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuthStatus {
    /// 未验证
    Unauthenticated,
    /// 验证进行中
    Authenticating { window_id: String, started_at: u64 },
    /// 已验证
    Authenticated { 
        cleared_at: u64,
        expires_at: u64,
    },
    /// 验证失败
    Failed { reason: String, retry_after: Option<u64> },
    /// 刷新中
    Refreshing,
}

#[derive(Debug)]
pub struct AuthState {
    pub status: AuthStatus,
    pub cookie_store: Arc<CookieStoreMutex>,
    pub user_agent: Option<String>,
}
```

### 4.2 Event-Driven 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                   Event Flow                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Auth Request                                               │
│     │                                                       │
│     ▼                                                       │
│  ┌──────────────┐    open window    ┌──────────────┐       │
│  │   Frontend   │ ────────────────> │  AuthWindow  │       │
│  │  (Main App)  │                   │  (WebView)   │       │
│  └──────────────┘                   └──────┬───────┘       │
│       ▲                                  │                │
│       │                                  │ nav/challenge  │
│       │                                  ▼                │
│       │                            ┌──────────────┐       │
│       │     "cookie-captured"      │  CF Server   │       │
│       │ <──────────────────────────│  (Challenge) │       │
│       │                            └──────────────┘       │
│       │                                                   │
│       │                    close window                   │
│       │ <─────────────────────────────────────            │
│       │                                                   │
│       │     "auth-completed"     ┌──────────────┐       │
│       │ ───────────────────────> │    Rust      │       │
│       │                          │   Backend    │       │
│       │     "state-changed"      └──────┬───────┘       │
│       │ <───────────────────────────────                  │
│       │                                  │                │
│       │                                  ▼                │
│       │                            ┌──────────────┐       │
│       │                            │  CookieStore │       │
│       │                            │  Persistence │       │
│       │                            └──────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 异步操作协调

```rust
/// 使用 tokio 通道协调异步操作
use tokio::sync::{mpsc, oneshot};

/// 验证协调器
pub struct AuthCoordinator {
    /// 验证请求发送端
    tx: mpsc::Sender<AuthRequest>,
}

/// 验证请求
pub struct AuthRequest {
    /// 回调通道
    pub response_tx: oneshot::Sender<AuthResult>,
    /// 超时时间
    pub timeout_secs: u64,
}

/// 等待验证完成（可超时取消）
pub async fn await_auth_completion(
    mut rx: mpsc::Receiver<CookiePayload>,
    timeout_secs: u64,
) -> Result<CookiePayload, AuthError> {
    tokio::select! {
        payload = rx.recv() => {
            match payload {
                Some(p) => Ok(p),
                None => Err(AuthError::ChannelClosed),
            }
        }
        _ = tokio::time::sleep(Duration::from_secs(timeout_secs)) => {
            Err(AuthError::Timeout)
        }
    }
}
```

### 4.4 错误处理和重试机制

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AuthError {
    #[error("窗口创建失败: {0}")]
    WindowCreation(String),
    
    #[error("验证超时")]
    Timeout,
    
    #[error("用户取消验证")]
    UserCancelled,
    
    #[error("Cookie 无效或过期")]
    InvalidCookie,
    
    #[error("网络错误: {0}")]
    Network(#[from] reqwest::Error),
    
    #[error("IPC 通信错误: {0}")]
    Ipc(String),
    
    #[error("通道已关闭")]
    ChannelClosed,
    
    #[error("达到最大重试次数")]
    MaxRetriesExceeded,
}

/// 带指数退避的重试
pub async fn retry_with_backoff<F, Fut>(
    operation: F,
    max_retries: u32,
) -> Result<AuthResult, AuthError>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<AuthResult, AuthError>>,
{
    let mut last_error = None;
    for attempt in 0..max_retries {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(e) => {
                let delay = Duration::from_secs(2_u64.pow(attempt));
                log::warn!("验证尝试 {} 失败: {}, {}秒后重试", attempt + 1, e, delay.as_secs());
                tokio::time::sleep(delay).await;
                last_error = Some(e);
            }
        }
    }
    Err(AuthError::MaxRetriesExceeded)
}
```

---

## 5. 四种架构模式对比分析

### 5.1 模式 A: WebView 验证 → 提取 Cookie → 关闭窗口 → 同步后端

```
┌──────────┐    open     ┌──────────┐    solve     ┌──────────┐
│  Main    │ ──────────> │   Auth   │ ──────────>  │    CF    │
│  Window  │             │  WebView │              │  Server  │
│          │             │          │ <──────────  │          │
│          │             │          │   challenge  │          │
└────┬─────┘             └────┬─────┘              └──────────┘
     │                        │
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

| 维度 | 评价 |
|------|------|
| **优点** | 用户体验好，全自动流程；Cookie 与 UA/IP 天然一致；代码耦合低 |
| **缺点** | 首次验证需等待；窗口管理复杂；WebView 资源占用 |
| **适用** | 主流推荐方案 |
| **复杂度** | 中等 |

### 5.2 模式 B: 常驻 WebView + 共享 Cookie Store

```
┌──────────────────────────────────────────────────┐
│              Shared Cookie Store                  │
│  (Rust Arc<CookieStoreMutex>)                    │
├───────────┬───────────────┬──────────────────────┤
│           │               │                      │
│  ┌────┐   │   ┌────┐     │     ┌────┐          │
│  │Main│   │   │Auth│ <───────> │HTTP│          │
│  │Win │   │   │WebV│ 双向同步  │Client         │
│  └────┘   │   └────┘         └────┘            │
│           │               ▲                      │
│           │               │ 常驻不关闭            │
│           │               │                      │
│           └───────────────┘                      │
└──────────────────────────────────────────────────┘
```

| 维度 | 评价 |
|------|------|
| **优点** | Cookie 自动同步；可实时刷新；无需反复创建窗口 |
| **缺点** | Auth WebView 常驻内存；架构复杂；需要双向同步机制 |
| **适用** | 高频请求、Cookie 需频繁刷新的场景 |
| **复杂度** | 高 |

### 5.3 模式 C: 外部浏览器验证 → 回调 Tauri → Cookie 注入

```
┌──────────┐    open     ┌──────────┐    solve     ┌──────────┐
│  Main    │ ──────────> │ External │ ──────────>  │    CF    │
│  Window  │  browser    │ Browser  │              │  Server  │
│          │             │          │ <──────────  │          │
│          │             │          │   challenge  │          │
│          │             └────┬─────┘              └──────────┘
│          │                  │
│          │   deep link      │
│          │ <────────────────┘
│          │   (myapp://auth?cookie=xxx)
└────┬─────┘
     ▼
┌──────────┐
│   Rust   │
│ Backend  │
└──────────┘
```

| 维度 | 评价 |
|------|------|
| **优点** | Tauri 不管理 WebView；浏览器兼容性最好；不受 Tauri WebView 限制 |
| **缺点** | 需配置 Deep Link；用户体验中断；浏览器环境可能不同；Cookie 从外部注入可能有安全限制 |
| **适用** | Tauri WebView 无法通过 Cloudflare 检测时 |
| **复杂度** | 中等 |

### 5.4 模式 D: 用户手动输入/粘贴 Cookie

```
┌──────────┐
│  Main    │
│  Window  │
│          │
│  [Cookie │
│   Input  │
│   Field] │
│          │
│  [Paste  │
│  Cookie] │
└────┬─────┘
     │ paste
     ▼
┌──────────┐
│   Rust   │
│ Backend  │
│  parse   │
└──────────┘
```

| 维度 | 评价 |
|------|------|
| **优点** | 最简单可靠；无 WebView 管理开销；适用于自动化工具提取的 Cookie |
| **缺点** | 用户体验差；需要用户懂技术；Cookie 格式易错 |
| **适用** | 降级方案、开发者工具、自动化脚本场景 |
| **复杂度** | 低 |

---

## 6. 推荐架构方案

### 6.1 最终推荐: 模式 A 为主 + 模式 D 降级

```
┌────────────────────────────────────────────────────────────────────┐
│                    Recommended Architecture                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   User Request                                                      │
│      │                                                              │
│      ▼                                                              │
│   ┌──────────────┐     检查 Cookie 状态     ┌──────────────┐       │
│   │ Rust Backend │ ───────────────────────> │CookieTracker │       │
│   │              │                          │ - is_valid?   │       │
│   │              │ <─────────────────────── │ - expires_soon│       │
│   └──────┬───────┘                          └──────────────┘       │
│          │                                                          │
│          ▼                                                          │
│   ┌────────────────────────────────────────────┐                   │
│   │              Decision                       │                   │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐ │                   │
│   │  │ 有效     │  │ 即将过期  │  │ 无效/无  │ │                   │
│   │  │ 直接使用  │  │ 静默刷新  │  │ 弹出验证  │ │                   │
│   │  └──────────┘  └──────────┘  └──────────┘ │                   │
│   └────────────────────────────────────────────┘                   │
│                          │                                          │
│                          ▼ (无效时)                                  │
│   ┌────────────────────────────────────────────┐                   │
│   │         Auth Flow (Mode A)                  │                   │
│   │                                            │                   │
│   │  1. 创建 Auth WebView (hidden)              │                   │
│   │     - 设置 User-Agent 与 HTTP 客户端一致    │                   │
│   │     - 加载目标 URL                         │                   │
│   │                                            │                   │
│   │  2. 显示窗口 → 用户完成 Challenge           │                   │
│   │                                            │                   │
│   │  3. JS 轮询 document.cookie                 │                   │
│   │     → 发现 cf_clearance                    │                   │
│   │                                            │                   │
│   │  4. IPC emit "cookie-captured"              │                   │
│   │     → Rust 验证 Cookie 有效性              │                   │
│   │                                            │                   │
│   │  5. 持久化到 CookieStore                    │                   │
│   │     → save_json()                          │                   │
│   │                                            │                   │
│   │  6. 关闭 Auth WebView                       │                   │
│   │     → 清理资源                             │                   │
│   │                                            │                   │
│   │  7. 启动自动刷新定时器                      │                   │
│   └────────────────────────────────────────────┘                   │
│                          │                                          │
│                          ▼ (多次失败时)                              │
│   ┌────────────────────────────────────────────┐                   │
│   │      Fallback Flow (Mode D)                 │                   │
│   │                                            │                   │
│   │  1. 显示手动输入对话框                       │                   │
│   │  2. 用户粘贴 Cookie 字符串                   │                   │
│   │  3. 解析并注入 CookieStore                  │                   │
│   └────────────────────────────────────────────┘                   │
│                                                                     │
│   ┌────────────────────────────────────────────┐                   │
│   │         HTTP Request Flow                    │                   │
│   │                                            │                   │
│   │  1. reqwest 自动从 CookieStore 获取 Cookie │                   │
│   │  2. 自动附加 Cookie 头                      │                   │
│   │  3. 请求完成 → 自动保存 Set-Cookie         │                   │
│   │  4. 定期 save_json() 持久化                 │                   │
│   └────────────────────────────────────────────┘                   │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

### 6.2 关键设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Cookie 同步方向 | WebView → Rust 单向 | WebView 是获取源，reqwest 是消费者，单向更简单可靠 |
| 状态管理中心 | Rust 端集中 | 单一数据源，避免竞态条件 |
| 通信模式 | Event + Command 混合 | Event 用于异步通知，Command 用于状态查询 |
| Cookie 持久化 | JSON 文件 + 内存双缓存 | 快速访问 + 跨会话保持 |
| 刷新策略 | 定时轮询 + 预刷新 | 在过期前主动刷新，减少中断 |
| 降级策略 | 手动输入 | 可靠性最高，不受 WebView 环境限制 |

---

## 7. 核心代码实现

### 7.1 Cargo.toml 依赖

```toml
[dependencies]
# Tauri core
tauri = { version = "2.0", features = [] }
tauri-plugin-http = "2.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }

# Cookie 管理
cookie_store = "0.21"
reqwest_cookie_store = "0.21"
reqwest = { version = "0.12", features = ["cookies", "json"] }

# 工具
thiserror = "2.0"
uuid = { version = "1.0", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
once_cell = "1.19"
tracing = "0.1"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

### 7.2 Rust 后端核心实现

```rust
// src-tauri/src/auth/mod.rs

use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::path::PathBuf;
use std::fs::{File, OpenOptions};
use std::io::{BufReader, BufWriter};

use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{Mutex, mpsc};
use reqwest_cookie_store::CookieStoreMutex;
use serde::{Serialize, Deserialize};
use thiserror::Error;

// ==================== 错误类型 ====================

#[derive(Error, Debug)]
pub enum AuthError {
    #[error("窗口创建失败: {0}")]
    WindowCreation(String),
    
    #[error("验证超时")]
    Timeout,
    
    #[error("用户取消验证")]
    UserCancelled,
    
    #[error("Cookie 无效或过期")]
    InvalidCookie,
    
    #[error("网络错误: {0}")]
    Network(#[from] reqwest::Error),
    
    #[error("Cookie 解析错误: {0}")]
    CookieParse(String),
    
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("达到最大重试次数")]
    MaxRetriesExceeded,
}

impl serde::Serialize for AuthError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        serializer.serialize_str(&self.to_string())
    }
}

// ==================== 数据类型 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CookiePayload {
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
    pub expires: Option<u64>,
    pub secure: bool,
    pub http_only: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthResult {
    pub success: bool,
    pub cookies: Vec<CookiePayload>,
    pub user_agent: String,
    pub expires_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status")]
pub enum AuthStateEvent {
    Idle,
    Authenticating { window_id: String },
    Authenticated { expires_at: u64 },
    Failed { reason: String },
    Refreshing,
}

// ==================== Cookie 跟踪器 ====================

pub struct CookieTracker {
    store: Arc<CookieStoreMutex>,
    user_agent: Mutex<Option<String>>,
    last_acquired: Mutex<Option<SystemTime>>,
    expires_at: Mutex<Option<SystemTime>>,
    cookie_file: PathBuf,
}

impl CookieTracker {
    pub fn new(app_dir: &PathBuf) -> Result<Self, AuthError> {
        let cookie_file = app_dir.join("cookies.json");
        let store = Self::load_or_create_store(&cookie_file)?;
        
        Ok(Self {
            store,
            user_agent: Mutex::new(None),
            last_acquired: Mutex::new(None),
            expires_at: Mutex::new(None),
            cookie_file,
        })
    }
    
    fn load_or_create_store(path: &PathBuf) -> Result<Arc<CookieStoreMutex>, AuthError> {
        if path.exists() {
            let file = File::open(path)?;
            let reader = BufReader::new(file);
            let store = cookie_store::CookieStore::load_json(reader)
                .map_err(|e| AuthError::CookieParse(e.to_string()))?;
            Ok(Arc::new(CookieStoreMutex::new(store)))
        } else {
            Ok(Arc::new(CookieStoreMutex::new(cookie_store::CookieStore::new(None))))
        }
    }
    
    /// 检查 Cookie 是否有效
    pub async fn is_valid(&self) -> bool {
        let expires = self.expires_at.lock().await;
        match *expires {
            Some(expiry) => {
                SystemTime::now() < expiry
            }
            None => {
                // 检查 store 中是否有未过期的 cf_clearance
                let store = self.store.lock().unwrap();
                let url = url::Url::parse("https://example.com/").unwrap();
                store.get("example.com", "/", "cf_clearance")
                    .map_or(false, |c| !c.is_expired())
            }
        }
    }
    
    /// 检查是否即将过期
    pub async fn is_expiring_soon(&self, threshold_secs: u64) -> bool {
        let expires = self.expires_at.lock().await;
        match *expires {
            Some(expiry) => {
                let now = SystemTime::now();
                match expiry.duration_since(now) {
                    Ok(remaining) => remaining < Duration::from_secs(threshold_secs),
                    Err(_) => true,
                }
            }
            None => true,
        }
    }
    
    /// 保存 Cookie 到持久存储
    pub async fn persist(&self) -> Result<(), AuthError> {
        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&self.cookie_file)?;
        
        let writer = BufWriter::new(file);
        let store = self.store.lock().unwrap();
        store.save_json(writer)?;
        
        Ok(())
    }
    
    /// 获取 HTTP 客户端
    pub async fn create_client(&self) -> Result<reqwest::Client, AuthError> {
        let ua = self.user_agent.lock().await;
        let builder = reqwest::Client::builder()
            .cookie_provider(self.store.clone())
            .timeout(Duration::from_secs(30));
        
        let builder = match ua.as_ref() {
            Some(ua) => builder.user_agent(ua),
            None => builder,
        };
        
        Ok(builder.build()?)
    }
    
    pub fn store(&self) -> Arc<CookieStoreMutex> {
        self.store.clone()
    }
}

// ==================== 验证协调器 ====================

pub struct AuthCoordinator {
    tracker: Arc<CookieTracker>,
    active_window: Mutex<Option<String>>,
}

impl AuthCoordinator {
    pub fn new(tracker: Arc<CookieTracker>) -> Self {
        Self {
            tracker,
            active_window: Mutex::new(None),
        }
    }
    
    /// 启动验证流程
    pub async fn authenticate(
        &self,
        app: AppHandle,
    ) -> Result<AuthResult, AuthError> {
        // 检查是否已有进行中的验证
        let mut active = self.active_window.lock().await;
        if active.is_some() {
            // 聚焦已有窗口
            if let Some(window) = app.get_webview_window(active.as_ref().unwrap()) {
                let _ = window.set_focus();
            }
            return Err(AuthError::WindowCreation("验证已在进行中".to_string()));
        }
        
        let window_id = format!("auth-{}", uuid::Uuid::new_v4());
        *active = Some(window_id.clone());
        drop(active);
        
        // 创建通道等待结果
        let (tx, mut rx) = mpsc::channel::<CookiePayload>(16);
        
        // 存储通道到 App State 供 Command 调用
        {
            let mut channels = app.state::<AuthChannels>().0.lock().await;
            channels.insert(window_id.clone(), tx);
        }
        
        // 创建验证窗口
        let window = self.create_auth_window(&app, &window_id).await?;
        
        // 发出状态事件
        let _ = app.emit("auth-state-changed", AuthStateEvent::Authenticating { 
            window_id: window_id.clone() 
        });
        
        // 等待验证结果（带超时）
        let result = tokio::select! {
            payload = rx.recv() => {
                match payload {
                    Some(p) => self.process_cookies(&app, vec![p]).await,
                    None => Err(AuthError::ChannelClosed),
                }
            }
            _ = tokio::time::sleep(Duration::from_secs(120)) => {
                Err(AuthError::Timeout)
            }
        };
        
        // 清理
        let mut active = self.active_window.lock().await;
        *active = None;
        drop(active);
        
        {
            let mut channels = app.state::<AuthChannels>().0.lock().await;
            channels.remove(&window_id);
        }
        
        // 关闭窗口
        if let Some(window) = app.get_webview_window(&window_id) {
            let _ = window.close();
        }
        
        // 发出完成事件
        match &result {
            Ok(_) => {
                let _ = app.emit("auth-state-changed", AuthStateEvent::Authenticated { 
                    expires_at: SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_secs() + 3600 
                });
            }
            Err(e) => {
                let _ = app.emit("auth-state-changed", AuthStateEvent::Failed { 
                    reason: e.to_string() 
                });
            }
        }
        
        result
    }
    
    async fn create_auth_window(
        &self,
        app: &AppHandle,
        window_id: &str,
    ) -> Result<tauri::WebviewWindow, AuthError> {
        use tauri::WebviewWindowBuilder;
        use tauri::WebviewUrl;
        
        let url = std::env::var("AUTH_URL")
            .unwrap_or_else(|_| "https://example.com/login".to_string());
        
        let window = WebviewWindowBuilder::new(
            app,
            window_id,
            WebviewUrl::External(url.parse().unwrap()),
        )
        .title("安全验证")
        .inner_size(900.0, 700.0)
        .center()
        .visible(false)
        .build()
        .map_err(|e| AuthError::WindowCreation(e.to_string()))?;
        
        // 注入 Cookie 监控脚本
        let init_script = r#"
            // Cookie 监控
            let lastCookie = '';
            setInterval(async () => {
                const currentCookie = document.cookie;
                if (currentCookie !== lastCookie) {
                    lastCookie = currentCookie;
                    const cfMatch = currentCookie.match(/cf_clearance=([^;]+)/);
                    if (cfMatch) {
                        await window.__TAURI__.invoke('cf_clearance_detected', {
                            windowId: window.__TAURI_WINDOW_LABEL__,
                            value: cfMatch[1],
                            fullCookie: currentCookie,
                            userAgent: navigator.userAgent,
                            url: window.location.href
                        });
                    }
                }
            }, 2000);
        "#;
        
        let _ = window.eval(init_script);
        
        // 显示窗口
        let _ = window.show();
        let _ = window.set_focus();
        
        Ok(window)
    }
    
    async fn process_cookies(
        &self,
        app: &AppHandle,
        cookies: Vec<CookiePayload>,
    ) -> Result<AuthResult, AuthError> {
        // 注入 Cookie 到 store
        let mut store = self.tracker.store.lock().unwrap();
        
        for cookie in &cookies {
            let url = url::Url::parse(&format!("https://{}/", cookie.domain))
                .map_err(|e| AuthError::CookieParse(e.to_string()))?;
            
            let raw_cookie = format!(
                "{}={}; Domain={}; Path={}{}{}{}",
                cookie.name,
                cookie.value,
                cookie.domain,
                cookie.path,
                if cookie.secure { "; Secure" } else { "" },
                if cookie.http_only { "; HttpOnly" } else { "" },
                if let Some(exp) = cookie.expires {
                    format!("; Expires={}", exp)
                } else { String::new() }
            );
            
            let _ = store.parse(&raw_cookie, &url);
        }
        
        drop(store);
        
        // 持久化
        self.tracker.persist().await?;
        
        // 更新状态
        let expires_at = cookies.iter()
            .filter_map(|c| c.expires)
            .max();
        
        Ok(AuthResult {
            success: true,
            cookies,
            user_agent: "Mozilla/5.0".to_string(),
            expires_at,
        })
    }
    
    /// 手动注入 Cookie（降级模式 D）
    pub async fn inject_cookie_manual(
        &self,
        app: &AppHandle,
        cookie_string: &str,
        domain: &str,
    ) -> Result<AuthResult, AuthError> {
        let mut cookies = Vec::new();
        
        // 解析 "name=value; name2=value2" 格式
        for pair in cookie_string.split(';') {
            let pair = pair.trim();
            if let Some(eq) = pair.find('=') {
                let name = pair[..eq].to_string();
                let value = pair[eq + 1..].to_string();
                
                if name == "cf_clearance" || !name.is_empty() {
                    cookies.push(CookiePayload {
                        name,
                        value,
                        domain: domain.to_string(),
                        path: "/".to_string(),
                        expires: Some(
                            SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .unwrap()
                                .as_secs() + 3600
                        ),
                        secure: true,
                        http_only: true,
                    });
                }
            }
        }
        
        self.process_cookies(app, cookies.clone()).await
    }
}

// ==================== 共享状态类型 ====================

pub struct AuthChannels(
    pub Mutex<std::collections::HashMap<String, mpsc::Sender<CookiePayload>>>,
);

// ==================== Tauri Commands ====================

#[tauri::command]
pub async fn start_authentication(
    app: AppHandle,
    coordinator: State<'_, Arc<AuthCoordinator>>,
) -> Result<AuthResult, AuthError> {
    coordinator.authenticate(app).await
}

#[tauri::command]
pub async fn cf_clearance_detected(
    app: AppHandle,
    state: State<'_, Arc<AuthCoordinator>>,
    window_id: String,
    value: String,
    full_cookie: String,
    user_agent: String,
    url: String,
) -> Result<(), AuthError> {
    let channels = app.state::<AuthChannels>().0.lock().await;
    
    if let Some(tx) = channels.get(&window_id) {
        let payload = CookiePayload {
            name: "cf_clearance".to_string(),
            value,
            domain: url::Url::parse(&url)
                .map(|u| u.host_str().unwrap_or("").to_string())
                .unwrap_or_default(),
            path: "/".to_string(),
            expires: Some(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_secs() + 3600
            ),
            secure: true,
            http_only: true,
        };
        let _ = tx.send(payload).await;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn inject_cookie_manual(
    app: AppHandle,
    coordinator: State<'_, Arc<AuthCoordinator>>,
    cookie_string: String,
    domain: String,
) -> Result<AuthResult, AuthError> {
    coordinator.inject_cookie_manual(&app, &cookie_string, &domain).await
}

#[tauri::command]
pub async fn get_auth_status(
    tracker: State<'_, Arc<CookieTracker>>,
) -> Result<AuthStateEvent, AuthError> {
    if tracker.is_valid().await {
        Ok(AuthStateEvent::Authenticated {
            expires_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs() + 3600,
        })
    } else {
        Ok(AuthStateEvent::Idle)
    }
}

#[tauri::command]
pub async fn check_cookie_expiring(
    tracker: State<'_, Arc<CookieTracker>>,
) -> Result<bool, AuthError> {
    Ok(tracker.is_expiring_soon(300).await)
}
```

### 7.3 主程序注册

```rust
// src-tauri/src/main.rs

mod auth;

use auth::*;
use std::sync::Arc;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            
            // 初始化 Cookie 跟踪器
            let tracker = Arc::new(
                CookieTracker::new(&app_dir)?
            );
            
            // 初始化验证协调器
            let coordinator = Arc::new(
                AuthCoordinator::new(tracker.clone())
            );
            
            // 管理状态
            app.manage(tracker);
            app.manage(coordinator);
            app.manage(AuthChannels(
                tokio::sync::Mutex::new(std::collections::HashMap::new())
            ));
            
            // 启动自动刷新定时器
            let app_handle = app.handle().clone();
            tokio::spawn(async move {
                let mut interval = tokio::time::interval(
                    std::time::Duration::from_secs(60)
                );
                loop {
                    interval.tick().await;
                    
                    if let Ok(tracker) = app_handle.try_state::<Arc<CookieTracker>>() {
                        if tracker.is_expiring_soon(300).await {
                            let _ = app_handle.emit(
                                "cookie-refresh-needed", 
                                ()
                            );
                        }
                    }
                }
            });
            
            // 窗口销毁清理
            app.on_window_event(|window, event| {
                if let tauri::WindowEvent::Destroyed = event {
                    if window.label().starts_with("auth-") {
                        // 清理验证窗口相关资源
                        let app = window.app_handle();
                        // ... 清理逻辑
                    }
                }
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_authentication,
            cf_clearance_detected,
            inject_cookie_manual,
            get_auth_status,
            check_cookie_expiring,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 7.4 前端集成代码

```typescript
// src/auth.ts - 前端认证管理

import { invoke, listen, emit } from '@tauri-apps/api';

export interface CookiePayload {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  secure: boolean;
  http_only: boolean;
}

export interface AuthResult {
  success: boolean;
  cookies: CookiePayload[];
  user_agent: string;
  expires_at?: number;
}

export type AuthState = 
  | { status: 'idle' }
  | { status: 'authenticating'; windowId: string }
  | { status: 'authenticated'; expiresAt: number }
  | { status: 'failed'; reason: string }
  | { status: 'refreshing' };

class AuthManager {
  private state: AuthState = { status: 'idle' };
  private listeners: Set<(state: AuthState) => void> = new Set();

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    // 监听认证状态变化
    listen('auth-state-changed', (event) => {
      const payload = event.payload as any;
      switch (payload.status) {
        case 'Idle':
          this.setState({ status: 'idle' });
          break;
        case 'Authenticating':
          this.setState({ 
            status: 'authenticating', 
            windowId: payload.window_id 
          });
          break;
        case 'Authenticated':
          this.setState({ 
            status: 'authenticated', 
            expiresAt: payload.expires_at 
          });
          break;
        case 'Failed':
          this.setState({ 
            status: 'failed', 
            reason: payload.reason 
          });
          break;
        case 'Refreshing':
          this.setState({ status: 'refreshing' });
          break;
      }
    });

    // 监听 Cookie 刷新需求
    listen('cookie-refresh-needed', () => {
      this.handleRefreshNeeded();
    });
  }

  private setState(newState: AuthState) {
    this.state = newState;
    this.listeners.forEach(cb => cb(newState));
  }

  onStateChange(callback: (state: AuthState) => void) {
    this.listeners.add(callback);
    callback(this.state);
    return () => this.listeners.delete(callback);
  }

  /**
   * 启动验证流程（模式 A）
   */
  async startAuth(): Promise<AuthResult> {
    try {
      const result = await invoke<AuthResult>('start_authentication');
      return result;
    } catch (error) {
      // 失败时提供手动输入选项
      if (error === 'Timeout' || error === 'MaxRetriesExceeded') {
        throw new AuthError('自动验证失败，请使用手动模式', 'AUTO_AUTH_FAILED');
      }
      throw error;
    }
  }

  /**
   * 手动注入 Cookie（模式 D - 降级）
   */
  async injectManualCookie(
    cookieString: string, 
    domain: string
  ): Promise<AuthResult> {
    const result = await invoke<AuthResult>('inject_cookie_manual', {
      cookieString,
      domain,
    });
    return result;
  }

  /**
   * 检查认证状态
   */
  async checkStatus(): Promise<AuthState> {
    const status = await invoke<any>('get_auth_status');
    // ... 转换状态
    return this.state;
  }

  /**
   * 检查是否需要刷新
   */
  async isExpiringSoon(): Promise<boolean> {
    return await invoke<boolean>('check_cookie_expiring');
  }

  private async handleRefreshNeeded() {
    try {
      this.setState({ status: 'refreshing' });
      const result = await this.startAuth();
      console.log('Cookie 自动刷新成功:', result);
    } catch (error) {
      console.error('Cookie 自动刷新失败:', error);
      this.setState({ 
        status: 'failed', 
        reason: '自动刷新失败' 
      });
    }
  }
}

export class AuthError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export const authManager = new AuthManager();
```

---

## 8. 状态流转图

### 8.1 认证状态机

```
                    ┌──────────┐
                    │          │
         ┌─────────│   Idle   │◄────────────────────────┐
         │         │          │                         │
         │         └────┬─────┘                         │
         │              │ start_auth()                  │
         │              ▼                               │
         │    ┌──────────────────┐                     │
         │    │                  │                     │
         │    │  Authenticating  │◄──────────────┐     │
         │    │                  │               │     │
         │    └────┬──────┬─────┘               │     │
         │         │      │                      │     │
         │    timeout    success                │     │
         │         │      │                      │     │
         │         ▼      ▼                      │     │
         │  ┌──────────┐  ┌──────────────┐      │     │
         │  │          │  │              │      │     │
         │  │  Failed  │  │ Authenticated│──────┘     │
         │  │          │  │              │  expires   │
         │  └────┬─────┘  └──────┬───────┘            │
         │       │               │                    │
         │       │         refresh/expire             │
         │       │               │                    │
         │       │               ▼                    │
         │       │      ┌──────────────┐              │
         │       └─────►│  Refreshing  │──────────────┘
         │              │              │   success
         │              └──────────────┘
         │
         │  inject_manual()
         └──────────────────────────────────────────────┘
```

### 8.2 Cookie 生命周期

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  获取    │────>│  验证    │────>│  使用    │────>│  刷新    │
│  (Auth)  │     │ (Verify) │     │ (Use)    │     │ (Refresh)│
└──────────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
                      │                │                │
                      ▼                ▼                ▼
              ┌──────────┐     ┌──────────┐     ┌──────────┐
              │  Cloud   │     │ reqwest  │     │ Timer    │
              │  flare   │     │ Client   │     │ Check    │
              │  Server  │     │ Request  │     │ 5min     │
              └──────────┘     └──────────┘     └────┬─────┘
                                                     │
                              ┌──────────────────────┘
                              ▼
                    ┌──────────────────┐
                    │  过期处理         │
                    │  - 静默刷新成功 → │
                    │    回到"使用"     │
                    │  - 静默刷新失败 → │
                    │    回到"获取"     │
                    └──────────────────┘
```

---

## 9. 错误处理策略

### 9.1 分级错误处理

| 级别 | 错误类型 | 处理策略 | 用户体验 |
|------|---------|---------|---------|
| **L1 可恢复** | 网络瞬断、Cookie 格式小错误 | 自动重试（指数退避） | 无感知 |
| **L2 需干预** | 验证超时、WebView 崩溃 | 提示用户，提供重试/手动选项 | 轻量提示 |
| **L3 严重** | 持续失败、文件 IO 错误 | 切换到降级模式 D（手动输入） | 明确引导 |
| **L4 致命** | 配置文件损坏、权限不足 | 记录日志，优雅退出 | 错误报告 |

### 9.2 重试策略

```rust
/// 指数退避重试
async fn retry_with_backoff<F, Fut>(
    operation: F,
    max_retries: u32,
) -> Result<T, AuthError>
where F: Fn() -> Fut, Fut: Future<Output = Result<T, AuthError>>
{
    for attempt in 0..max_retries {
        match operation().await {
            Ok(v) => return Ok(v),
            Err(e) if attempt < max_retries - 1 => {
                let delay = Duration::from_secs(2_u64.pow(attempt));
                tracing::warn!(
                    "尝试 {}/{} 失败: {}, {}秒后重试",
                    attempt + 1, max_retries, e, delay.as_secs()
                );
                tokio::time::sleep(delay).await;
            }
            Err(e) => return Err(e),
        }
    }
    unreachable!()
}

/// 使用示例：验证请求
let result = retry_with_backoff(
    || async { start_auth_flow().await },
    3, // 最多3次
).await;
```

### 9.3 降级流程

```
┌────────────────────────────────────────────────────┐
│              Error Handling Flow                    │
├────────────────────────────────────────────────────┤
│                                                     │
│  验证失败                                           │
│     │                                               │
│     ▼                                               │
│  ┌──────────────┐                                  │
│  │ 自动重试?    │                                  │
│  │ (n < 3)      │                                  │
│  └──────┬───────┘                                  │
│         │                                           │
│    yes  │    no                                     │
│         │                                           │
│         ▼                                           │
│  ┌──────────────┐     仍失败     ┌──────────────┐  │
│  │ 指数退避重试  │ ────────────> │  降级处理     │  │
│  │ (2s, 4s, 8s) │               │              │  │
│  └──────────────┘               │ 1. 清理资源   │  │
│         │                       │ 2. 关闭窗口   │  │
│         │ 成功                  │ 3. 显示手动   │  │
│         ▼                       │    输入选项   │  │
│  ┌──────────────┐               └──────┬───────┘  │
│  │ 继续流程     │                      │          │
│  └──────────────┘                      ▼          │
│                              ┌──────────────┐     │
│                              │ 手动输入Cookie│     │
│                              │ 模式 D        │     │
│                              └──────────────┘     │
│                                                     │
└────────────────────────────────────────────────────┘
```

### 9.4 超时设计

| 操作 | 超时时间 | 理由 |
|------|---------|------|
| 窗口创建 | 10s | WebView2 初始化不应超过 |
| 用户验证 | 120s | Cloudflare Challenge 通常 30-60s |
| Cookie 注入 | 5s | 文件 IO 操作 |
| HTTP 请求 | 30s | 常规 API 超时 |
| 静默刷新 | 60s | 后台操作，不宜过长 |

---

## 10. 各方案权衡对比表

### 10.1 综合对比

| 维度 | 模式 A (WebView→提取→关闭) | 模式 B (常驻WebView) | 模式 C (外部浏览器) | 模式 D (手动输入) |
|------|---------------------------|---------------------|-------------------|------------------|
| **用户体验** | ⭐⭐⭐⭐ 全自动 | ⭐⭐⭐⭐⭐ 无感知 | ⭐⭐⭐ 切换应用 | ⭐⭐ 需手动操作 |
| **实现复杂度** | ⭐⭐⭐ 中等 | ⭐⭐ 复杂 | ⭐⭐⭐ 中等 | ⭐⭐⭐⭐⭐ 简单 |
| **资源占用** | ⭐⭐⭐⭐⭐ 临时 | ⭐⭐ 常驻内存 | ⭐⭐⭐⭐⭐ 无 | ⭐⭐⭐⭐⭐ 无 |
| **可靠性** | ⭐⭐⭐⭐ 高 | ⭐⭐⭐⭐ 高 | ⭐⭐⭐⭐ 高 | ⭐⭐⭐⭐⭐ 最高 |
| **Cookie 一致性** | ⭐⭐⭐⭐⭐ 天然一致 | ⭐⭐⭐⭐⭐ 天然一致 | ⭐⭐⭐ UA可能不一致 | ⭐⭐ 需用户确保 |
| **自动刷新** | ⭐⭐⭐ 需重新打开 | ⭐⭐⭐⭐⭐ 自动 | ⭐⭐ 需配置 | ⭐⭐ 完全手动 |
| **维护成本** | ⭐⭐⭐⭐ 低 | ⭐⭐ 高 | ⭐⭐⭐ 中 | ⭐⭐⭐⭐⭐ 最低 |
| **适用场景** | 通用推荐 | 高频/自动 | WebView受限 | 降级/工具 |

### 10.2 决策树

```
                        ┌─────────────────┐
                        │  需要绕过 CF?    │
                        └────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │ yes                     │ no
                    ▼                         ▼
            ┌──────────────┐           ┌──────────────┐
            │ WebView 能加载 │           │ 直接使用     │
            │ Challenge?   │           │ reqwest     │
            └──────┬───────┘           │ (无需 Cookie)│
                   │                    └──────────────┘
         ┌─────────┴──────────┐
         │ yes                │ no
         ▼                    ▼
   ┌──────────────┐   ┌──────────────┐
   │ 使用 模式 A   │   │ 使用 模式 C   │
   │ (WebView提取) │   │ (外部浏览器)  │
   └──────────────┘   └──────────────┘
         │
         ▼
   ┌──────────────┐
   │ 多次失败?    │
   └──────┬───────┘
          │
    ┌─────┴─────┐
    │ yes       │ no
    ▼           ▼
┌────────┐  ┌────────┐
│ 模式 D  │  │ 完成   │
│(手动)  │  │        │
└────────┘  └────────┘
```

---

## 附录 A: 关键 API 参考

### A.1 Tauri v2 WebviewWindow API

```rust
// 创建窗口
let window = WebviewWindowBuilder::new(app, label, url)
    .title("Title")
    .inner_size(w, h)
    .visible(false)      // 先隐藏
    .center()
    .build()?;

// 显示/隐藏
window.show()?;
window.hide()?;

// 执行 JS（不返回值，需通过 IPC 传回）
window.eval("console.log('hello')")?;

// 关闭
window.close()?;       // 触发 closeRequested 事件
window.destroy()?;     // 强制关闭

// 窗口事件监听
window.on_window_event(|window, event| {
    match event {
        WindowEvent::Destroyed => { /* 清理 */ }
        WindowEvent::Focused => { }
        _ => {}
    }
});
```

### A.2 Tauri v2 IPC API

```rust
// Event（异步通知）
app.emit("event-name", payload)?;           // 全局广播
window.emit("event-name", payload)?;         // 发送到特定窗口
app.emit_to("label", "event", payload)?;     // 精确目标

// Command（请求-响应）
#[tauri::command]
async fn command_name(arg: String) -> Result<String, Error> {
    Ok(result)
}

// Channel（流式数据）
use tauri::ipc::Channel;
#[tauri::command]
async fn stream_data(on_event: Channel<EventType>) {
    for chunk in data {
        on_event.send(chunk).unwrap();
    }
}
```

### A.3 reqwest Cookie Store API

```rust
use reqwest_cookie_store::{CookieStoreMutex, CookieStore};
use cookie_store;

// 创建
let store = Arc::new(CookieStoreMutex::new(CookieStore::new(None)));

// 保存
let writer = BufWriter::new(File::create("cookies.json")?);
store.save_json(writer)?;

// 加载
let reader = BufReader::new(File::open("cookies.json")?);
let store = CookieStore::load_json(reader)?;

// 注入客户端
let client = reqwest::Client::builder()
    .cookie_provider(store)
    .build()?;
```

---

## 附录 B: 常见问题 FAQ

### Q1: 为什么 WebView Cookie 和 reqwest Cookie 不同步？

Tauri 内部有两套完全独立的 Cookie 机制：
1. **WebView Cookie**：由平台 WebView 引擎（WebView2/WKWebView/WebKitGTK）管理
2. **reqwest Cookie**：由 `cookie_store` crate 管理

它们不共享存储，需要通过 JavaScript 提取 + IPC 手动同步。

### Q2: `cf_clearance` 为什么很快过期？

Cloudflare 设计如此：
- 有效期通常 30-60 分钟
- 与 IP、User-Agent、设备指纹绑定
- 需要在过期前主动刷新

### Q3: WebView 窗口假死怎么排查？

1. 确认窗口创建是否在主线程异步执行
2. 检查是否同步等待验证结果
3. Windows 检查 WebView2 运行时版本
4. Linux 设置 `WEBKIT_DISABLE_COMPOSITING_MODE=1`
5. 使用 `tokio::spawn` 将长时间操作放到后台

### Q4: 如何实现静默刷新？

方案：创建一个隐藏的 WebView，不显示给用户，自动完成 Challenge，提取 Cookie 后关闭。适用于 Managed/Non-Interactive Challenge。Interactive Challenge（需要用户交互）无法静默刷新。

### Q5: 多个窗口如何共享 Cookie？

推荐方式：
1. 使用 Rust 中心化 `CookieStore`（`Arc<CookieStoreMutex>`）
2. 所有 reqwest 客户端共享同一实例
3. WebView Cookie 变化通过 IPC 同步到中心 Store
4. 不要尝试在多个 WebView 间共享 Cookie（平台限制）

---

## 附录 C: 参考资料

1. [Tauri v2 官方文档 - IPC](https://v2.tauri.app/concept/inter-process-communication/)
2. [Tauri v2 官方文档 - State Management](https://v2.tauri.app/develop/state-management/)
3. [Tauri v2 官方文档 - Window Management](https://v2.tauri.app/reference/javascript/api/namespacewindow/)
4. [reqwest CookieStore Trait](https://docs.rs/reqwest/latest/reqwest/cookie/trait.CookieStore.html)
5. [reqwest_cookie_store Crate](https://docs.rs/reqwest_cookie_store/latest/reqwest_cookie_store/)
6. [cookie_store Crate](https://docs.rs/cookie_store/latest/cookie_store/)
7. [Cloudflare Clearance Cookie 文档](https://developers.cloudflare.com/cloudflare-challenges/concepts/clearance/)
8. [Tauri v2 插件开发文档](https://v2.tauri.app/develop/plugins/)
9. [Tauri WebViewWindowBuilder API](https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindowBuilder.html)
10. [Tauri GitHub Issues - 窗口假死](https://github.com/tauri-apps/tauri/issues/8997)
