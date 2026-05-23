# Nexus Mods 数据获取方式技术研究报告

> 研究日期：2025年7月
> 研究目的：分析 Nexus Mods (https://www.nexusmods.com) 的数据获取方式，包括官方 API、内部 API、社区解决方案及替代方案

---

## 目录

1. [官方 API 概述](#1-官方-api-概述)
2. [API v1 (REST - 稳定版)](#2-api-v1-rest---稳定版)
3. [API v3 (REST - 新版本)](#3-api-v3-rest---新版本)
4. [GraphQL API v2 (实验性)](#4-graphql-api-v2-实验性)
5. [认证方式详解](#5-认证方式详解)
6. [速率限制与使用条款](#6-速率限制与使用条款)
7. [社区开源库与工具](#7-社区开源库与工具)
8. [页面结构分析](#8-页面结构分析)
9. [网页端访问保护与 v0.3 取舍](#9-网页端访问保护与-v03-取舍)
10. [下载链接获取注意事项](#10-下载链接获取注意事项)
11. [推荐方案与代码示例](#11-推荐方案与代码示例)
12. [参考资源链接](#12-参考资源链接)

---

## 1. 官方 API 概述

Nexus Mods 提供**三种官方 API**，分别是：

| API 版本 | 类型    | 状态               | 基础 URL                               |
| -------- | ------- | ------------------ | -------------------------------------- |
| **v1**   | REST    | 稳定，长期支持     | `https://api.nexusmods.com/v1/`        |
| **v3**   | REST    | 活跃开发中（Beta） | `https://api.nexusmods.com/v3/`        |
| **v2**   | GraphQL | 实验性/WIP         | `https://api.nexusmods.com/v2/graphql` |

### 关键发现

- **v0.3 方向**：Nexus 集成使用官方 API / Public GraphQL，不依赖网页抓取或浏览器挑战状态
- 所有 API 请求都需要认证（API Key 或 OAuth/JWT Token）
- API 支持获取 mod 元数据、文件列表、游戏列表、用户信息等
- **实际文件下载**有额外限制（见第 10 节）

---

## 2. API v1 (REST - 稳定版)

### 基础信息

- **文档**：https://app.swaggerhub.com/apis-docs/NexusMods/nexus-mods_public_api_params_in_form_data/1.0#/
- **基础 URL**：`https://api.nexusmods.com/v1/`
- **认证方式**：`apikey` HTTP Header

### 完整端点列表

#### 用户相关 (User)

| 方法   | 端点                     | 说明                            |
| ------ | ------------------------ | ------------------------------- |
| GET    | `users/validate.json`    | 验证 API Key 并获取用户信息     |
| GET    | `user/tracked_mods.json` | 获取当前用户追踪的 mod 列表     |
| POST   | `user/tracked_mods.json` | 追踪指定 mod                    |
| DELETE | `user/tracked_mods.json` | 取消追踪指定 mod                |
| GET    | `user/endorsements.json` | 获取当前用户的 endorsement 列表 |

#### 游戏相关 (Games)

| 方法 | 端点                       | 说明                   |
| ---- | -------------------------- | ---------------------- |
| GET  | `games.json`               | 获取所有游戏列表       |
| GET  | `games/{game_domain}.json` | 获取指定游戏的详细信息 |

#### Mod 相关 (Mods)

| 方法 | 端点                                                        | 说明                       |
| ---- | ----------------------------------------------------------- | -------------------------- |
| GET  | `games/{game_domain}/mods/latest_added.json`                | 获取最新添加的 10 个 mod   |
| GET  | `games/{game_domain}/mods/latest_updated.json`              | 获取最新更新的 10 个 mod   |
| GET  | `games/{game_domain}/mods/trending.json`                    | 获取 10 个热门 mod         |
| GET  | `games/{game_domain}/mods/updated.json?period={1d\|1w\|1m}` | 获取指定时间段内更新的 mod |
| GET  | `games/{game_domain}/mods/{mod_id}.json`                    | 获取指定 mod 的详细信息    |
| POST | `games/{game_domain}/mods/{mod_id}/endorse.json`            | endorse 指定 mod           |
| POST | `games/{game_domain}/mods/{mod_id}/abstain.json`            | abstain from endorsing     |

#### Mod 文件相关 (Mod Files)

| 方法 | 端点                                                                   | 说明                    |
| ---- | ---------------------------------------------------------------------- | ----------------------- |
| GET  | `games/{game_domain}/mods/{mod_id}/files.json`                         | 获取 mod 的所有文件列表 |
| GET  | `games/{game_domain}/mods/{mod_id}/files/{file_id}.json`               | 获取指定文件的详细信息  |
| GET  | `games/{game_domain}/mods/{mod_id}/files/{file_id}/download_link.json` | 获取文件下载链接        |

#### 搜索与杂项

| 方法 | 端点                                                | 说明                  |
| ---- | --------------------------------------------------- | --------------------- |
| GET  | `games/{game_domain}/mods/md5_search/{hash}.json`   | 通过 MD5 哈希搜索 mod |
| GET  | `games/{game_domain}/mods/{mod_id}/changelogs.json` | 获取 mod 的更新日志   |
| GET  | `colourschemes.json`                                | 获取配色方案列表      |

### v1 API 响应示例

#### 获取 Mod 详情

```bash
curl -X GET "https://api.nexusmods.com/v1/games/skyrimspecialedition/mods/19456.json" \
  -H "apikey: YOUR_API_KEY" \
  -H "accept: application/json"
```

#### 获取 Mod 文件列表

```bash
curl -X GET "https://api.nexusmods.com/v1/games/skyrimspecialedition/mods/19456/files.json" \
  -H "apikey: YOUR_API_KEY" \
  -H "accept: application/json"
```

#### 获取用户信息

```bash
curl -X GET "https://api.nexusmods.com/v1/users/validate.json" \
  -H "apikey: YOUR_API_KEY" \
  -H "accept: application/json"
```

---

## 3. API v3 (REST - 新版本)

### 基础信息

- **文档**：https://api-docs.nexusmods.com/
- **OpenAPI 规范**：https://api.nexusmods.com/openapi.yaml
- **基础 URL**：`https://api.nexusmods.com/v3`
- **状态**：Beta/Experimental（部分端点可能变更）

### 新增功能（相比 v1）

- **上传功能**：创建上传会话、分片上传、完成上传
- **Collections 管理**：创建合集、创建合集版本
- **Mod 文件管理**：创建/更新 mod 文件、更新组管理
- **更详细的文件依赖信息**

### 主要端点

#### Uploads（上传）

| 方法 | 端点                 | 状态 | 说明             |
| ---- | -------------------- | ---- | ---------------- |
| GET  | `/uploads/{id}`      | 稳定 | 获取上传会话信息 |
| POST | `/uploads`           | 稳定 | 创建新的上传会话 |
| POST | `/uploads/multipart` | 稳定 | 创建分片上传     |
| POST | `/uploads/finalise`  | 稳定 | 完成上传         |

#### Mods

| 方法 | 端点                                              | 状态         | 说明          |
| ---- | ------------------------------------------------- | ------------ | ------------- |
| GET  | `/games/{game_domain}/mods/{game_scoped_id}`      | Experimental | 获取 mod 信息 |
| GET  | `/games/{game_domain}/mod-files/{game_scoped_id}` | Experimental | 获取 mod 文件 |

#### Collections

| 方法 | 端点                          | 状态         | 说明                 |
| ---- | ----------------------------- | ------------ | -------------------- |
| POST | `/collections`                | Experimental | 创建 collection      |
| POST | `/collections/{id}/revisions` | Experimental | 创建 collection 版本 |

### GitHub Action 上传示例

```yaml
- name: Upload to NexusMods
  uses: Nexus-Mods/upload-action@<tag>
  with:
    api_key: ${{ secrets.NEXUSMODS_API_KEY }}
    file_group_id: <file_group_id>
    filename: my-mod.zip
    version: 1.0.0
    file_category: main
```

---

## 4. GraphQL API v2 (实验性)

### 基础信息

- **文档**：https://graphql.nexusmods.com/
- **端点**：`https://api.nexusmods.com/v2/graphql`
- **状态**：**⚠️ 工作进行中，不建议用于生产环境**

### 特点

- 大部分查询**无需认证**即可访问
- 部分端点需要 OAuth token
- 支持更灵活的数据查询
- 可能随时变更，无向后兼容保证

### 认证方式

- 与 v1 相同：使用 `apikey` header
- 或使用 OAuth token

### 示例查询

```graphql
query mod($modId: ID!, $gameId: ID!) {
  mod(modId: $modId, gameId: $gameId) {
    id
    name
    author
    version
    downloads
    endorsements
    summary
    description
    pictureUrl
    thumbnailUrl
    createdAt
    updatedAt
    uploader {
      name
    }
    game {
      name
      domainName
    }
  }
}
```

**Variables**:

```json
{ "modId": "19456", "gameId": "1704" }
```

### 另一个查询示例 - 搜索 Mods

```graphql
query mods($filter: ModsFilter, $sort: [ModsSort!], $offset: Int, $count: Int) {
  mods(filter: $filter, sort: $sort, offset: $offset, count: $count) {
    nodes {
      id
      name
      author
      version
      downloads
      endorsements
      summary
      pictureUrl
    }
    totalCount
    nodesCount
  }
}
```

---

## 5. 认证方式详解

### 5.1 API Key 认证（最常用）

**获取 API Key**：

1. 登录 Nexus Mods 网站
2. 访问 https://www.nexusmods.com/users/myaccount?tab=api%20access
3. 在页面底部找到 "Personal API Key" 部分
4. 生成新的 API Key

**使用方式**：

```
Header: apikey: YOUR_API_KEY
```

### 5.2 Single Sign-On (SSO) 认证

用于第三方应用让用户无需手动输入 API Key。

**流程**：

1. 应用生成唯一 UUID（v4）
2. 建立 WebSocket 连接到 `wss://sso.nexusmods.com`
3. 发送 JSON 消息：`{"id": "uuid", "token": "app_token"}`
4. 引导用户在浏览器中打开 `https://www.nexusmods.com/sso?id=uuid`
5. 用户登录并授权后，API Key 通过 WebSocket 返回

**Python 示例**：

```python
import json
import uuid
from websocket import create_connection

ws = create_connection("wss://sso.nexusmods.com")
sso_id = str(uuid.uuid4())
ws.send(json.dumps({"id": sso_id, "token": "your_app_token"}))
# 引导用户访问 https://www.nexusmods.com/sso?id={sso_id}
api_key = ws.recv()  # 接收 API Key
ws.close()
```

### 5.3 OAuth/JWT 认证

Vortex 和其他官方应用使用的方式。

- 需要 OAuth client ID 和 secret
- 使用 JWT token 进行认证
- 支持 token 刷新

---

## 6. 速率限制与使用条款

### 6.1 速率限制

**2025年最新限制**：

- **每日限制**：2,500 次请求 / 24 小时
- **超出后的小时限制**：100 次请求 / 小时
- **Nginx 级别**：超过 30 次请求/秒会触发 429

**响应 Header**（包含速率限制信息）：

```
X-RL-Hourly-Limit: 100
X-RL-Hourly-Remaining: 96
X-RL-Hourly-Reset: 2019-02-01T12:00:00+00:00
X-RL-Daily-Limit: 2500
X-RL-Daily-Remaining: 2488
X-RL-Daily-Reset: 2019-02-02 00:00:00 +0000
```

### 6.2 API Acceptable Use Policy

来源：https://help.nexusmods.com/article/114-api-acceptable-use-policy

**核心要求**：

1. **个人 API Key 仅限测试和个人使用**
2. 公开应用必须注册并获取应用专属 API Key
3. 必须设置正确的 User-Agent（包含应用名和版本）
4. 不得滥用或超出正常预期使用
5. 不得将 API 数据用于商业目的（未经授权）
6. 年龄限制内容（Adult content）必须在 API 响应中过滤

**禁止行为**：

- 使用他人的 API Key
- 超出正常和预期使用范围的自动化下载
- 在公开应用中使用 Personal API Key

---

## 7. 社区开源库与工具

### 7.1 Python

#### pynxm（官方 Python 包装器）

- **GitHub**：https://github.com/dh-nunes/pynxm
- **PyPI**：`pip install pynxm`
- **功能**：完整的 v1 API 包装器
- **示例**：

```python
import pynxm

api_key = "your-api-key"
nxm = pynxm.Nexus(api_key)

# 获取用户信息
user = nxm.user_details()
print(user)

# 获取游戏信息
game = nxm.game_details("skyrimspecialedition")
print(game)

# 获取 mod 详情
mod = nxm.mod_details("skyrimspecialedition", "19456")
print(mod)

# 获取 mod 文件列表
files = nxm.mod_file_list("skyrimspecialedition", "19456")
print(files)

# 追踪 mod
nxm.user_tracked_add("skyrimspecialedition", "19456")

# Endorse mod
nxm.mod_endorse("skyrimspecialedition", "19456")
```

#### nexus-collection-dl

- **GitHub**：https://github.com/scottmccarrison/nexus-collection-dl
- **功能**：Nexus Mods 集合下载器，支持 Linux/macOS
- **特点**：支持 Premium 和免费用户，带 Web UI

### 7.2 JavaScript/Node.js

#### @nexusmods/nexus-api（官方 Node.js 库）

- **GitHub**：https://github.com/Nexus-Mods/node-nexus-api
- **npm**：`npm install @nexusmods/nexus-api`
- **特点**：官方维护，支持 API Key 和 OAuth
- **示例**：

```javascript
const { Nexus } = require('@nexusmods/nexus-api')

const nexus = new Nexus('YourAppName', '1.0.0', 'skyrimspecialedition')
await nexus.setKey('YOUR_API_KEY')

const mods = await nexus.getModFiles('skyrimspecialedition', 19456)
console.log(mods)
```

### 7.3 Dart

#### nexus_mods

- **GitHub**：https://github.com/ArcaneArts/nexus_mods
- **特点**：OpenAPI Generator 生成的 Dart 客户端

### 7.4 其他工具

| 工具                         | 语言                | 说明                   |
| ---------------------------- | ------------------- | ---------------------- |
| **Vortex**                   | TypeScript/Electron | 官方 mod 管理器        |
| **BUTR.NexusUploader**       | C#/.NET             | 非官方文件上传工具     |
| **Nexus-Mods/upload-action** | TypeScript          | GitHub Action 自动上传 |
| **Nexus Mods Assistant**     | JavaScript          | 浏览器扩展             |

---

## 8. 页面结构分析

### 8.1 Mod 页面结构

以 `https://www.nexusmods.com/skyrimspecialedition/mods/19456` 为例：

**页面组成部分**：

- **基本信息**：Mod 名称、作者、版本、下载次数、点赞数
- **统计信息**：Unique DLs、Total DLs、Total Views、Endorsements
- **标签**：分类标签（如 Lore-Friendly, Replacer 等）
- **Tab 页**：Description / Files / Images / Videos / Posts / Bugs / Logs / Stats
- **需求信息**：Requirements 部分
- **描述内容**：富文本描述

### 8.2 页面中的动态加载

通过浏览分析，mod 页面的数据通过以下方式加载：

- **初始 HTML**：包含基本页面结构和元数据
- **JavaScript 动态加载**：部分数据（如评论、统计图表）通过 XHR 请求加载
- **内嵌 JSON**：页面中可能包含用于初始渲染的数据对象

### 8.3 重要发现：API 与网页分离

**关键结论**：

- API 端点 (`api.nexusmods.com`) **与网页端 (`www.nexusmods.com`) 完全分离**
- API 请求走 Nexus 官方 API 入口，不依赖网页端会话或浏览器挑战状态
- 网页端可能受额外访问保护影响，因此 v0.3 不再把网页抓取作为产品数据路径
- **使用官方 API / Public GraphQL 是 v0.3 后唯一支持的 Nexus 集成方向**

---

## 9. 网页端访问保护与 v0.3 取舍

### 9.1 问题描述

Nexus Mods 网站页面可能受到访问保护影响，直接抓取网页会带来挑战页面、脚本执行、Cookie 管理和策略风险。

### 9.2 解决方案对比

| 方案              | 可行性 | 难度 | 风险 | 推荐度     |
| ----------------- | ------ | ---- | ---- | ---------- |
| **使用官方 API**  | ✅ 高  | 低   | 极低 | ⭐⭐⭐⭐⭐ |
| **API + Premium** | ✅ 高  | 低   | 低   | ⭐⭐⭐⭐⭐ |
| **浏览器自动化**  | 不采用 | 高   | 高   | v0.3 移除  |
| **挑战处理服务**  | 不采用 | 中   | 高   | v0.3 移除  |
| **直接网页抓取**  | ❌ 低  | 极高 | 极高 | ❌ 不推荐  |

### 9.3 推荐方案：使用官方 API

**为什么选择 API**：

- API 使用独立的子域名 `api.nexusmods.com`
- 只需要 API Key 即可访问
- 与 Nexus 官方支持的第三方集成方向一致

**最佳实践**：

1. 注册 Nexus Mods 账号
2. 获取 Personal API Key
3. 使用 API 获取所有 mod 元数据
4. 对于 Premium 用户，可直接获取下载链接
5. 对于免费用户，需要通过网页手动下载

---

## 10. 下载链接获取注意事项

### 10.1 重要限制

**非 Premium 用户的限制**：

- 非 Premium 用户**无法通过 API 直接获取下载链接**
- 返回的错误信息：

```json
{
  "code": 403,
  "message": "You don't have permission to get download links from the API without visting nexusmods.com - this is for premium users only."
}
```

- 免费用户必须通过网页端手动下载（有 5 秒等待时间）

**Premium 用户的优势**：

- 可通过 API 直接获取下载链接
- 无下载速度限制
- 无广告
- 支持 mod 管理器的自动下载功能

### 10.2 免费用户的工作流程

```
1. 使用 API 获取 mod 元数据和文件列表
2. 生成 Nexus 网页下载链接（如 https://www.nexusmods.com/skyrimspecialedition/mods/19456?tab=files）
3. 用户手动访问页面下载
4. 或使用浏览器自动化工具辅助下载
```

### 10.3 Premium 用户下载示例

```bash
# Premium 用户可直接获取下载链接
curl -X GET "https://api.nexusmods.com/v1/games/skyrimspecialedition/mods/19456/files/275145/download_link.json" \
  -H "apikey: YOUR_PREMIUM_API_KEY"
```

**响应示例**：

```json
[
  {
    "name": "Nexus CDN",
    "short_name": "Nexus Global",
    "URI": "https://cf-files.nexusmods.com/..."
  }
]
```

---

## 11. 推荐方案与代码示例

### 11.1 推荐方案总结

#### 首选方案：使用官方 v1 API + API Key

**适用场景**：获取 mod 元数据、文件列表、搜索 mod
**优点**：

- 不依赖网页端会话或浏览器挑战状态
- 稳定可靠，长期支持
- 速率限制合理（2500次/天）
- 社区有大量封装库

#### 次选方案：使用 GraphQL API v2

**适用场景**：需要灵活查询特定字段
**优点**：

- 大部分查询无需认证
- 可精确控制返回数据
  **缺点**：
- 仍在开发中，可能变更

#### 🥉 备选方案：使用 v3 API

**适用场景**：上传文件、管理 collections
**注意**：部分端点为 Experimental 状态

### 11.2 完整 Python 示例

```python
import requests
import json
from datetime import datetime

class NexusModsAPI:
    """Nexus Mods API 客户端"""

    def __init__(self, api_key):
        self.base_url = "https://api.nexusmods.com/v1"
        self.headers = {
            "apikey": api_key,
            "accept": "application/json",
            "User-Agent": "MyApp/1.0.0"
        }
        self.session = requests.Session()
        self.session.headers.update(self.headers)

    def _request(self, method, endpoint, **kwargs):
        """发送 API 请求"""
        url = f"{self.base_url}/{endpoint}"
        response = self.session.request(method, url, **kwargs)

        # 检查速率限制
        hourly_remaining = response.headers.get('X-RL-Hourly-Remaining')
        daily_remaining = response.headers.get('X-RL-Daily-Remaining')
        if hourly_remaining:
            print(f"Hourly remaining: {hourly_remaining}")
        if daily_remaining:
            print(f"Daily remaining: {daily_remaining}")

        if response.status_code == 429:
            raise Exception("Rate limit exceeded. Please wait.")

        response.raise_for_status()
        return response.json()

    # ===== 用户相关 =====
    def get_user_info(self):
        """获取当前用户信息"""
        return self._request("GET", "users/validate.json")

    def get_tracked_mods(self):
        """获取追踪的 mod 列表"""
        return self._request("GET", "user/tracked_mods.json")

    # ===== 游戏相关 =====
    def get_games(self, include_unapproved=False):
        """获取所有游戏列表"""
        params = {"include_unapproved": include_unapproved}
        return self._request("GET", "games.json", params=params)

    def get_game_info(self, game_domain):
        """获取指定游戏信息"""
        return self._request("GET", f"games/{game_domain}.json")

    # ===== Mod 相关 =====
    def get_latest_added(self, game_domain):
        """获取最新添加的 mod"""
        return self._request("GET", f"games/{game_domain}/mods/latest_added.json")

    def get_latest_updated(self, game_domain):
        """获取最新更新的 mod"""
        return self._request("GET", f"games/{game_domain}/mods/latest_updated.json")

    def get_trending(self, game_domain):
        """获取热门 mod"""
        return self._request("GET", f"games/{game_domain}/mods/trending.json")

    def get_updated_mods(self, game_domain, period="1w"):
        """获取指定时间段内更新的 mod
        period: '1d', '1w', '1m'
        """
        params = {"period": period}
        return self._request("GET", f"games/{game_domain}/mods/updated.json", params=params)

    def get_mod_info(self, game_domain, mod_id):
        """获取 mod 详细信息"""
        return self._request("GET", f"games/{game_domain}/mods/{mod_id}.json")

    def search_by_md5(self, game_domain, md5_hash):
        """通过 MD5 搜索 mod"""
        return self._request("GET", f"games/{game_domain}/mods/md5_search/{md5_hash}.json")

    # ===== 文件相关 =====
    def get_mod_files(self, game_domain, mod_id, category=None):
        """获取 mod 文件列表
        category: 'main', 'update', 'optional', 'old_version', 'miscellaneous'
        """
        params = {}
        if category:
            params["category"] = category
        return self._request("GET", f"games/{game_domain}/mods/{mod_id}/files.json", params=params)

    def get_file_info(self, game_domain, mod_id, file_id):
        """获取文件详细信息"""
        return self._request("GET", f"games/{game_domain}/mods/{mod_id}/files/{file_id}.json")

    def get_download_link(self, game_domain, mod_id, file_id, key=None, expires=None):
        """获取下载链接（仅 Premium 用户）"""
        params = {}
        if key and expires:
            params["key"] = key
            params["expires"] = expires
        return self._request("GET",
            f"games/{game_domain}/mods/{mod_id}/files/{file_id}/download_link.json",
            params=params)

    def get_changelogs(self, game_domain, mod_id):
        """获取 mod 更新日志"""
        return self._request("GET", f"games/{game_domain}/mods/{mod_id}/changelogs.json")


# ===== 使用示例 =====
if __name__ == "__main__":
    # 初始化客户端
    api = NexusModsAPI("YOUR_API_KEY")

    # 获取用户信息
    user = api.get_user_info()
    print(f"User: {user.get('name')}, Premium: {user.get('is_premium')}")

    # 获取 Skyrim SE 信息
    game = api.get_game_info("skyrimspecialedition")
    print(f"Game: {game.get('name')}, Mods: {game.get('mod_count')}")

    # 获取 mod 信息
    mod = api.get_mod_info("skyrimspecialedition", 19456)
    print(f"Mod: {mod.get('name')}, Version: {mod.get('version')}")
    print(f"Downloads: {mod.get('mod_downloads')}, Endorsements: {mod.get('endorsement_count')}")

    # 获取文件列表
    files = api.get_mod_files("skyrimspecialedition", 19456)
    for file in files.get('files', []):
        print(f"  File: {file.get('name')} ({file.get('category_name')})")

    # 获取热门 mod
    trending = api.get_trending("skyrimspecialedition")
    for mod in trending:
        print(f"Trending: {mod.get('name')} by {mod.get('author')}")
```

### 11.3 GraphQL 查询示例

```python
import requests

# GraphQL 端点
GRAPHQL_URL = "https://api.nexusmods.com/v2/graphql"
API_KEY = "YOUR_API_KEY"

# 查询 mod 信息
query = """
query mod($modId: ID!, $gameId: ID!) {
  mod(modId: $modId, gameId: $gameId) {
    id
    name
    author
    version
    downloads
    endorsements
    summary
    description
    pictureUrl
    thumbnailUrl
    createdAt
    updatedAt
    status
    uploader { name }
    game { name domainName }
  }
}
"""

variables = {"modId": "19456", "gameId": "1704"}

response = requests.post(
    GRAPHQL_URL,
    headers={"apikey": API_KEY, "Content-Type": "application/json"},
    json={"query": query, "variables": variables}
)

data = response.json()
print(json.dumps(data, indent=2))
```

### 11.4 批量获取 mod 数据示例

```python
def batch_get_mod_info(api, game_domain, mod_ids):
    """批量获取 mod 信息，带速率限制保护"""
    results = []
    for i, mod_id in enumerate(mod_ids):
        try:
            info = api.get_mod_info(game_domain, mod_id)
            results.append(info)
            print(f"[{i+1}/{len(mod_ids)}] Got mod: {info.get('name')}")
        except Exception as e:
            print(f"[{i+1}/{len(mod_ids)}] Error getting mod {mod_id}: {e}")
            results.append(None)

        # 简单的速率限制保护
        if (i + 1) % 100 == 0:
            print(f"Progress: {i+1}/{len(mod_ids)}, pausing briefly...")

    return results

# 使用示例
mod_ids = [19456, 12604, 3038, 266, 3863]  # 多个 mod ID
results = batch_get_mod_info(api, "skyrimspecialedition", mod_ids)
```

---

## 12. 参考资源链接

### 官方文档

| 资源                     | 链接                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| API v1 文档 (SwaggerHub) | https://app.swaggerhub.com/apis-docs/NexusMods/nexus-mods_public_api_params_in_form_data/1.0#/ |
| API v3 文档 (Redocly)    | https://api-docs.nexusmods.com/                                                                |
| GraphQL 文档             | https://graphql.nexusmods.com/                                                                 |
| API 使用政策             | https://help.nexusmods.com/article/114-api-acceptable-use-policy                               |
| API Key 页面             | https://www.nexusmods.com/users/myaccount?tab=api%20access                                     |
| 服务条款                 | https://help.nexusmods.com/article/18-terms-of-service                                         |

### GitHub 仓库

| 仓库                          | 链接                                         |
| ----------------------------- | -------------------------------------------- |
| Nexus Mods 官方组织           | https://github.com/Nexus-Mods/               |
| node-nexus-api (Node.js)      | https://github.com/Nexus-Mods/node-nexus-api |
| pynxm (Python)                | https://github.com/dh-nunes/pynxm            |
| Vortex (Mod 管理器)           | https://github.com/Nexus-Mods/Vortex         |
| vortex-api                    | https://github.com/Nexus-Mods/vortex-api     |
| upload-action (GitHub Action) | https://github.com/Nexus-Mods/upload-action  |
| API-Example                   | https://github.com/Nexus-Mods/API-Example    |

### 社区项目

| 项目                              | 链接                                                   |
| --------------------------------- | ------------------------------------------------------ |
| nexus-collection-dl               | https://github.com/scottmccarrison/nexus-collection-dl |
| BUTR.NexusUploader                | https://github.com/BUTR/BUTR.NexusUploader             |
| Nexus Mods Assistant (浏览器扩展) | https://www.nexusmods.com/site/mods/1588               |

### 论坛与支持

| 资源           | 链接                                                 |
| -------------- | ---------------------------------------------------- |
| API 发布公告   | https://www.nexusmods.com/news/13921                 |
| 上传 API 公告  | https://www.nexusmods.com/news/15454                 |
| 站点支持论坛   | https://forums.nexusmods.com/forum/117-site-support/ |
| Discord 服务器 | Nexus Mods Discord #api 频道                         |

---

## 附录 A：游戏 Domain 名称对照表

常见游戏的 domain 名称（用于 API 请求）：

| 游戏                   | Domain                 |
| ---------------------- | ---------------------- |
| Skyrim Special Edition | `skyrimspecialedition` |
| Skyrim (2011)          | `skyrim`               |
| Fallout 4              | `fallout4`             |
| Fallout: New Vegas     | `newvegas`             |
| Oblivion               | `oblivion`             |
| Oblivion Remastered    | `oblivionremastered`   |
| Morrowind              | `morrowind`            |
| Cyberpunk 2077         | `cyberpunk2077`        |
| Baldur's Gate 3        | `baldursgate3`         |
| Stardew Valley         | `stardewvalley`        |
| Starfield              | `starfield`            |

可通过 `games.json` 端点获取完整列表。

## 附录 B：常见错误码

| 状态码 | 说明                                      |
| ------ | ----------------------------------------- |
| 200    | 成功                                      |
| 400    | 请求参数错误                              |
| 401    | API Key 无效或缺失                        |
| 403    | 权限不足（如非 Premium 用户请求下载链接） |
| 404    | 资源不存在                                |
| 422    | 请求格式错误                              |
| 429    | 速率限制超出                              |

## 附录 C：API Key 获取步骤截图说明

1. 登录 Nexus Mods 网站 (https://www.nexusmods.com)
2. 点击右上角用户头像
3. 选择 "Site preferences"
4. 切换到 "API" 标签页
5. 滚动到底部找到 "Personal API Key"
6. 点击生成按钮
7. 复制生成的 API Key

---

> **免责声明**：本报告仅供技术研究参考。使用 Nexus Mods API 需遵守其服务条款和 API 使用政策。批量下载或自动化操作可能导致账号被封禁，请合理使用。
