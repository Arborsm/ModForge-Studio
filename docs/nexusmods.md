# Nexus Mods API 深度研究报告：接口架构、访问限制与开发实践

## 1. 核心摘要与关键发现

### 1.1 研究概述

**Nexus Mods API 是全球最大的游戏模组托管平台 Nexus Mods 提供的官方编程接口**，允许第三方应用程序访问平台的元数据、用户信息、模组文件和下载服务。本报告基于对官方文档、GitHub 仓库、开发者社区讨论和技术支持文章的系统性研究，全面梳理了 Nexus Mods API 的三个主要版本（**v1 REST API**、**v2 GraphQL API** 和 **v3 Upload API**）的架构设计、认证机制、速率限制策略以及使用政策。[^8^][^17^] 研究发现，Nexus Mods API 经历了从早期每日 **2,500 请求**的严格限制到如今每日 **20,000 请求**的重大升级，同时在基础设施层面通过 **nginx 反向代理**实现了每秒 **30 请求**的硬限制。此外，API 的下载链接获取功能对非 Premium 用户存在明确的访问壁垒，返回 **HTTP 403** 错误代码，而网页端则通过服务条款明确禁止任何形式的自动化爬虫和数据挖掘行为。[^28^][^56^]

### 1.2 关键发现汇总

| 维度             | 关键指标                           | 详细说明                                                    | 参考来源         |
| ---------------- | ---------------------------------- | ----------------------------------------------------------- | ---------------- |
| **API 版本**     | v1 (REST)、v2 (GraphQL)、v3 (REST) | v1 稳定可用，v2 处于开发阶段，v3 用于 Upload API            | [^8^][^6^][^54^] |
| **每日请求限制** | 20,000 请求/24小时                 | 超过后降至 500 请求/小时，每日 00:00 GMT 重置               | [^28^]           |
| **nginx 层限制** | 30 请求/秒                         | 允许短突发，超过返回 429 错误                               | [^12^]           |
| **认证方式**     | API Key / SSO / OAuth              | API Key 通过 Header 传递，SSO 基于 WebSocket，OAuth 用于 v2 | [^19^][^59^]     |
| **下载速度限制** | 1.5 MB/s ~ Unlimited               | 普通用户 1.5-3 MB/s，Premium 会员不限速                     | [^13^]           |
| **下载链接权限** | Premium 专属                       | 非 Premium 用户通过 API 获取下载链接返回 403                | [^56^]           |
| **网页爬虫政策** | 严格禁止                           | 服务条款第 11 条明确禁止爬虫和数据挖掘                      | [^2^]            |
| **必需请求头**   | apikey + Application 信息          | 要求携带 Application-Name 和 Application-Version            | [^44^]           |

### 1.3 速率限制演变时间线

![Nexus Mods API 速率限制演变对比](rate_limits_comparison.png)

上图清晰展示了 Nexus Mods API 速率限制的重大升级。在早期版本中，用户每天仅能发送 **2,500 个请求**，一旦超过该阈值，速率将被严格限制在每小时 **100 请求**。[^12^] 而根据 2024 年 12 月更新的官方支持文档，当前的每日限制已提升至 **20,000 请求**，超过后的每小时限制也相应提高至 **500 请求**。[^28^] 这一变化反映了 Nexus Mods 平台在用户增长和基础设施扩展方面的投入，也为开发者和高级用户提供了更大的调用空间。需要注意的是， hourly 配额在整点时刻重置（如 01:00 GMT、02:00 GMT），而 daily 配额则在每日 **00:00 GMT** 统一重置。[^28^]

---

## 2. API 版本架构与演进

### 2.1 API v1 (REST) — 稳定生产版本

**API v1 是 Nexus Mods 当前最成熟、最广泛使用的 RESTful API 版本**，自 2019 年 1 月正式发布以来，一直是第三方应用程序与 Nexus Mods 平台交互的主要接口。[^17^] 该版本采用传统的 REST 架构风格，所有端点均通过 HTTPS 协议访问，基地址为 `https://api.nexusmods.com/v1/`。API v1 的设计目标是替代早期被 Nexus Mod Manager 等工具使用的 legacy 系统，提供更现代化、更安全的访问方式。[^16^] 在认证方面，API v1 要求每个请求在 HTTP Header 中携带 `apikey` 字段，该密钥与用户账户绑定，用于身份验证和速率限制追踪。[^12^] 值得注意的是，API v1 的端点覆盖了模组元数据检索、游戏列表获取、用户追踪/背书管理以及文件下载链接生成等核心功能，但 **上传功能在 v1 中并不可用**，这是后续 v3 版本的重点发展方向。

API v1 的端点设计遵循清晰的资源导向原则，使用标准的 HTTP 方法（GET、POST、DELETE）来操作资源。例如，`GET /v1/games/{game_domain_name}/mods/{id}.json` 用于获取特定模组的详细信息，`POST /v1/games/{domain}/mods/{id}/endorse.json` 用于对模组进行背书推荐，而 `GET /v1/games/{domain}/mods/{modId}/files/{fileId}/download_link.json` 则用于获取模组文件的实际下载链接。[^12^][^15^] 然而，**下载链接端点是 API v1 中权限控制最严格的端点之一**，对于非 Premium 用户，该端点会返回 HTTP 403 错误，提示 "You don't have permission to get download links from the API without visiting nexusmods.com - this is for premium users only"。[^56^] 这一设计是 Nexus Mods 商业模型的重要组成部分，旨在通过 API 层面的限制鼓励用户订阅 Premium 会员服务。

### 2.2 API v2 (GraphQL) — 实验性版本

**API v2 是 Nexus Mods 基于 GraphQL 构建的下一代 API**，其端点为 `https://api.nexusmods.com/v2/graphql`。[^6^] 与 REST 风格的 v1 不同，v2 允许客户端通过单个请求精确获取所需的数据字段，避免了过度获取（over-fetching）或获取不足（under-fetching）的问题。然而，**API v2 目前仍处于积极开发阶段**，官方文档明确标注了 "Work in Progress" 警告，提醒开发者该 API 可能会在没有预先通知的情况下发生变化，包括端点的添加、修改或删除。[^6^] 因此，官方建议在生产环境中优先使用稳定的 v1 API，而将 v2 视为未来迁移的目标。

在认证机制上，API v2 采用了更现代化的 **OAuth 2.0 认证流程**，这与 v1 的 API Key 模式形成了对比。根据文档说明，GraphQL v2 的大部分查询可以在无需认证的情况下访问，但某些端点（尤其是涉及用户隐私数据或写操作的 mutation）确实需要有效的 OAuth token。[^6^] 目前，Nexus Mods 尚未开放公众注册 OAuth 客户端的功能，开发者如需使用需要 OAuth 认证的端点，必须直接联系平台的支持团队获取协助。[^6^] API v2 的 schema 涵盖了模组（Mod）、游戏（Game）、用户（User）、文件（ModFile）、合集（Collection）等多种数据类型，并提供了丰富的查询和变更操作，如 `updateUserDonationPreferences`、`createChangelog`、`untrackMod` 等。[^6^]

### 2.3 API v3 (REST) — Upload API

**API v3 是 Nexus Mods 于 2026 年 3 月推出的最新 API 版本**，专门用于解决模组作者在上传和管理模组文件时的痛点。[^55^] 与主要面向数据读取的 v1 不同，**v3 的核心功能是模组文件的上传和更新**，支持通过编程方式将模组文件直接推送到 Nexus Mods 服务器，无需再通过网页表单手动操作。这一功能对于希望实现持续集成/持续部署（CI/CD）工作流的模组开发者尤其有价值，例如可以通过 GitHub Actions 在发布新版本时自动打包并上传模组文件。[^54^] API v3 的基地址为 `https://api.nexusmods.com/v3`，目前官方提供了对应的 GitHub Action (`Nexus-Mods/upload-action`) 作为参考实现。

API v3 的 Upload API 在 2026 年 1 月开始进行 Closed Beta 测试，邀请了经过验证的模组作者参与，随后于 **2026 年 3 月进入 Open Beta 阶段**，向更广泛的开发者社区开放。[^55^] 在认证方面，v3 继承了 v1 的 API Key 机制，但通过更精细的权限控制确保安全性。每个团队成员可以使用独立的 API Key 推送更新，无需共享主账户凭证。[^55^] 目前，v3 的 Open Beta 主要聚焦于更新现有模组的功能，完整的模组创建流程（create flow）尚未开放，但 Nexus Mods 表示如果社区有强烈需求，将优先开发此功能。[^55^] 值得一提的是，**API v3 仍处于评估阶段（"CURRENTLY FOR EVALUATION ONLY"）**，开发者在使用时需要注意接口可能发生变化。[^54^]

![Nexus Mods API 架构概览](api_architecture.png)

---

## 3. 认证机制详解

### 3.1 API Key 认证模式

**API Key 是 Nexus Mods API 最基础也是最广泛使用的认证方式**。每个 Nexus Mods 用户可以在其账户设置的 "API Access" 页面生成一个或多个个人 API Key。[^12^] 这些密钥与用户的账户直接绑定，用于标识请求发起者并实施用户级别的速率限制。在所有 API 请求中，必须在 HTTP Header 中包含 `apikey` 字段，其值为用户的 API Key。例如：`apikey: VX2PMnc4T5Q3dUFmjE45WyRyZ3VkKzIvYVJiMUdick5XQU9QWHdUbFo4...`。[^12^] 官方强调，**用户绝不应将自己的个人 API Key 分享给其他用户，或将其嵌入到公开分发的软件中**，因为这将导致账户安全和速率限制的风险。[^44^]

对于应用开发者，有两种使用 API Key 的方式。第一种是要求用户手动复制其个人 API Key 并粘贴到应用程序中，这种方式适用于不需要官方批准的个人工具或小型项目。[^21^] 第二种方式适用于希望提供更流畅用户体验的公共应用：开发者可以向 Nexus Mods 社区管理团队申请注册应用，获得一个 **application slug**（应用标识符），然后通过 SSO 流程（详见 3.2 节）自动获取 API Key，无需用户手动操作。[^19^] 此外，API Key 不仅可以用于认证，还可以作为权限控制和网络流量节流的依据。Nexus Mods 平台可以根据具体 Key 限制其访问特定端点（例如，某个应用可能只允许读取模组元数据，但不允许以用户名义进行背书操作），或者在检测到异常流量时临时撤销特定 Key 的访问权限。[^19^]

### 3.2 SSO (Single Sign-On) 认证流程

**SSO 是 Nexus Mods 提供的一种基于 WebSocket 的无密码认证机制**，允许第三方应用程序在不直接接触用户密码的情况下获取 API Key。[^59^] 该流程的设计灵感来源于 OAuth，但实现上更为轻量，特别适合桌面应用和游戏模组管理器等场景。SSO 的核心交互流程如下：首先，客户端应用生成一个随机的 UUID（建议使用 UUID v4 格式）作为本次认证会话的唯一标识。然后，客户端建立一个到 `wss://sso.nexusmods.com` 的 WebSocket 连接，并在连接成功后发送一个 JSON 消息，包含 `id`（上述 UUID）、`token`（首次连接为 null）和 `protocol: 2` 等字段。[^59^]

服务器在收到初始化消息后会返回一个 `connection_token`，客户端应将其保存（例如存储在 `sessionStorage` 中），以便在连接断开重连时使用。接下来，**客户端需要打开系统默认浏览器，导航至 `https://www.nexusmods.com/sso?id={uuid}&application={app_slug}`**，其中 `uuid` 是之前生成的随机 ID，`app_slug` 是 Nexus Mods 分配的应用标识符。[^59^] 用户在网页上登录 Nexus Mods 账户（如果尚未登录），然后看到一个授权页面，询问是否允许该应用访问其账户。一旦用户点击确认授权，**API Key 将通过 WebSocket 连接直接发送回客户端**，消息格式为 `{"success": true, "data": {"api_key": "..."}, "error": null}`。客户端在接收到 API Key 后应安全存储，并关闭 WebSocket 连接。值得注意的是，在连接保持期间，客户端需要每 **30 秒**发送一次 WebSocket ping 消息以维持会话。[^59^]

### 3.3 OAuth 2.0 (API v2 专用)

**OAuth 2.0 认证主要用于 API v2 (GraphQL) 中需要写权限或访问用户隐私数据的端点**。[^6^] 与 API v1 的 API Key 模式和 SSO 的 WebSocket 流程不同，OAuth 2.0 提供了更标准化、更安全的授权框架，支持授权码模式（Authorization Code Grant）等多种授权流程。然而，**目前 Nexus Mods 尚未开放公众自助注册 OAuth 客户端的功能**。[^6^] 这意味着开发者如果希望其应用能够使用需要 OAuth 认证的 GraphQL mutation（如更新用户偏好设置、创建变更日志等），必须主动联系 Nexus Mods 的支持团队，申请创建 OAuth 客户端，并获取相应的 `client_id` 和 `client_secret`。

OAuth 2.0 的引入反映了 Nexus Mods 在 API 架构演进中对安全性和标准化的高度重视。随着 API v2 逐渐成熟并最终取代 v1，OAuth 2.0 很可能成为主流的认证方式。对于目前阶段的开发者而言，如果仅需读取公开的模组和游戏数据，可以直接使用无需认证的 GraphQL 查询；而对于需要操作用户数据的应用，则需要提前规划 OAuth 集成方案，并与 Nexus Mods 团队进行沟通协调。[^6^] 官方文档建议，在 API v2 完全稳定并公布正式的客户端注册流程之前，生产环境中的用户数据操作仍应通过成熟的 API v1 配合 API Key 或 SSO 完成。

---

## 4. API v1 端点完整参考

### 4.1 游戏 (Games) 相关端点

**游戏端点是访问 Nexus Mods 上所有支持游戏的基础入口**。`GET /v1/games.json` 返回平台上所有游戏的完整列表，每个游戏对象包含 `id`、`name`、`forum_url`、`nexusmods_url`、`domain_name`、`approved_date` 等字段。[^16^] `domain_name` 是一个特别重要的字段，它在后续的模组查询中充当游戏标识符。例如，`skyrimspecialedition` 是《上古卷轴 V：天际特别版》的 domain name。`GET /v1/games/{domain_name}.json` 则用于获取特定游戏的详细信息，这对于需要验证游戏是否存在或获取游戏特定元数据的应用程序非常有用。

值得注意的是，游戏列表是动态变化的，随着新游戏的发布和社区需求的增加，Nexus Mods 会定期添加对新游戏的支持。开发者在处理游戏列表时应考虑到这一点，避免对游戏 domain 进行硬编码，而是通过 API 动态获取最新列表。此外，某些游戏可能有特殊的分类规则或文件结构，通过 `/v1/games/{domain}.json` 获取的详细信息中可能包含这些游戏特定的配置参数。在游戏端点的缓存策略方面，由于游戏列表变更频率较低，建议在客户端进行适度缓存（例如缓存 24 小时），以减少不必要的 API 调用并提升应用响应速度。

### 4.2 模组 (Mods) 相关端点

**模组端点是 Nexus Mods API 中最核心、使用频率最高的部分**，提供了丰富的模组查询和管理功能。下表汇总了 API v1 中所有主要的模组相关端点：

| 方法   | 端点                                            | 描述                      | 认证要求     |
| ------ | ----------------------------------------------- | ------------------------- | ------------ |
| `GET`  | `/v1/games/{domain}/mods/{id}.json`             | 获取指定模组的完整元数据  | 需要 API Key |
| `GET`  | `/v1/games/{domain}/mods/latest_added.json`     | 获取最近添加的模组列表    | 需要 API Key |
| `GET`  | `/v1/games/{domain}/mods/latest_updated.json`   | 获取最近更新的模组列表    | 需要 API Key |
| `GET`  | `/v1/games/{domain}/mods/trending.json`         | 获取当前热门模组列表      | 需要 API Key |
| `GET`  | `/v1/games/{domain}/mods/md5_search/{md5}.json` | 通过文件 MD5 哈希搜索模组 | 需要 API Key |
| `POST` | `/v1/games/{domain}/mods/{id}/endorse.json`     | 背书/推荐指定模组         | 需要 API Key |
| `POST` | `/v1/games/{domain}/mods/{id}/abstain.json`     | 取消对模组的背书          | 需要 API Key |

[^12^][^67^]

`GET /v1/games/{domain}/mods/{id}.json` 是获取模组详细信息的核心端点，返回的数据包括模组名称、描述、作者、下载次数、背书次数、分类、图片 URL、支持的模组管理器等信息。[^71^] 这个端点对于模组管理器在显示模组详情页时至关重要。`GET /v1/games/{domain}/mods/latest_updated.json` 返回最近更新的 10 个模组，而 `GET /v1/games/{domain}/mods/trending.json` 则返回当前热门的模组列表。[^12^] 这些端点对于希望展示发现性内容（如首页推荐、更新动态）的应用非常有价值。

`POST /v1/games/{domain}/mods/{id}/endorse.json` 和 `POST /v1/games/{domain}/mods/{id}/abstain.json` 分别用于对模组进行背书（endorse）和取消背书（abstain）。背书是 Nexus Mods 社区中表示对模组质量和价值认可的重要机制，用户在背书时需要确保已经实际使用过该模组。这两个端点都需要有效的 API Key，并且只能由已登录用户操作。此外，`GET /v1/games/{domain}/mods/md5_search/{md5}.json` 允许通过文件的 MD5 哈希值反向查找对应的模组，这在模组管理器中用于识别未知来源的文件或检测重复安装非常有用。

### 4.3 文件 (Files) 与下载端点

**文件端点用于获取模组文件列表和下载链接**，是模组管理器实现自动下载功能的核心依赖。`GET /v1/games/{domain}/mods/{modId}/files.json` 返回指定模组的所有文件列表，包括文件名、版本、大小、上传日期、下载次数、是否为首要文件（primary）等信息。每个文件对象还包含 `file_id`，用于在后续请求中获取具体的下载链接。对于模组管理器而言，这个端点通常在用户选择安装某个模组时首先被调用，以展示可用的文件版本和选项。

`GET /v1/games/{domain}/mods/{modId}/files/{fileId}/download_link.json` 是获取实际下载链接的端点，**这是整个 API 中权限控制最严格的端点之一**。[^15^] 该端点返回一个包含 CDN 下载链接的 JSON 对象，客户端可以直接使用该链接下载文件。然而，**对于非 Premium 用户，即使拥有有效的 API Key，调用此端点也会收到 HTTP 403 错误**，错误消息明确指出 "You don't have permission to get download links from the API without visiting nexusmods.com - this is for premium users only"。[^56^] 这一限制是 Nexus Mods 付费模式的核心组成部分，意味着免费用户必须通过浏览器手动访问模组页面并点击下载按钮，而无法通过模组管理器直接下载。Premium 用户则可以通过此端点获取下载链接，享受不限速的下载体验和一键安装功能。

### 4.4 用户 (Users) 相关端点

**用户端点提供了账户验证、追踪模组和背书管理等功能**，是构建个性化模组管理体验的基础。下表汇总了 API v1 中所有主要的用户相关端点：

| 方法     | 端点                         | 描述                              | 认证要求     |
| -------- | ---------------------------- | --------------------------------- | ------------ |
| `GET`    | `/v1/users/validate.json`    | 验证 API Key 有效性并返回用户信息 | 需要 API Key |
| `GET`    | `/v1/user/endorsements.json` | 获取当前用户背书的所有模组列表    | 需要 API Key |
| `GET`    | `/v1/user/tracked_mods.json` | 获取当前用户追踪的所有模组列表    | 需要 API Key |
| `POST`   | `/v1/user/tracked_mods.json` | 追踪指定模组                      | 需要 API Key |
| `DELETE` | `/v1/user/tracked_mods.json` | 取消追踪指定模组                  | 需要 API Key |

[^12^][^15^]

`GET /v1/users/validate.json` 是 API Key 验证的核心端点，通常在应用启动或用户首次输入 API Key 时调用。[^15^] 该端点不仅验证 Key 的有效性，还返回用户的详细信息，包括用户名、用户 ID、邮箱地址、会员类型（是否为 Premium）等。这使得应用可以确认用户身份并据此调整功能（例如，仅对 Premium 用户启用直接下载功能）。`GET /v1/user/tracked_mods.json` 返回用户追踪的模组列表，追踪（track）功能允许用户订阅模组的更新通知，当模组有新版本发布时，用户会收到通知。[^66^] 模组管理器可以利用此端点在启动时检查用户追踪的模组是否有可用更新。

`GET /v1/user/endorsements.json` 返回用户已背书的所有模组列表。[^73^] 这个端点对于需要在用户个人资料中展示背书历史或提供批量取消背书功能的应用很有用。`POST` 和 `DELETE /v1/user/tracked_mods.json` 分别用于添加和移除模组追踪，请求体中需要包含 `domain_name` 和 `mod_id` 字段来指定目标模组。这些端点在实现上遵循 RESTful 设计原则，使用标准的 HTTP 方法来表达操作语义，使得接口直观且易于集成。

---

## 5. 速率限制与访问控制

### 5.1 用户级别速率限制

**Nexus Mods API 采用基于用户的速率限制策略，这意味着限制是与用户账户绑定的，而非 IP 地址或应用标识**。这种设计的优点是用户可以在多个设备或应用上共享同一个 API Key 的配额，同时也防止了通过更换 IP 地址来绕过限制的行为。[^12^] 根据 2024 年 12 月更新的官方文档，**当前的速率限制为每 24 小时 20,000 个请求**，这一数字相比早期的 2,500 请求/24小时有了 **8 倍的提升**。[^28^] 当用户超过每日限制后，速率将被临时降低至每小时 500 请求，直到下一个每日配额重置周期。

为了帮助客户端监控自身的配额使用情况，**Nexus Mods API 在每个响应的 HTTP Header 中包含了详细的速率限制信息**。[^12^] 这些 Header 的命名遵循 `X-RL-*` 前缀的约定，具体如下表所示：

| Header 名称             | 示例值                      | 说明                              |
| ----------------------- | --------------------------- | --------------------------------- |
| `X-RL-Hourly-Limit`     | `500`                       | 当前小时配额上限                  |
| `X-RL-Hourly-Remaining` | `496`                       | 当前小时剩余配额                  |
| `X-RL-Hourly-Reset`     | `2024-12-01T12:00:00+00:00` | 小时配额重置时间（ISO 8601 格式） |
| `X-RL-Daily-Limit`      | `20000`                     | 每日配额上限                      |
| `X-RL-Daily-Remaining`  | `19850`                     | 每日剩余配额                      |
| `X-RL-Daily-Reset`      | `2024-12-02 00:00:00 +0000` | 每日配额重置时间                  |

[^12^][^28^]

当客户端的配额耗尽时，API 将返回 **HTTP 429 (Too Many Requests)** 状态码，并在响应体中包含错误详情。客户端应当妥善处理这种情况，通过检查响应 Header 中的重置时间来决定何时恢复请求，而不是持续重试导致进一步的限制。[^29^] 官方建议，一旦收到 429 响应，应用应向用户显示友好的提示信息，说明已达到 API 使用限制，并告知限制将在何时重置。[^28^]

### 5.2 nginx 基础设施层限制

**除了应用层的用户级别速率限制外，Nexus Mods 还在 nginx 反向代理层面实施了更底层的流量控制**。[^12^] 这一层级的限制是针对请求频率的硬性上限，旨在保护后端服务器免受突发流量的冲击。具体来说，**nginx 配置了每秒 30 请求的限制**，如果某个客户端在 1 秒内发送超过 30 个请求，nginx 将直接返回 **HTTP 429** 错误，而不会将请求转发到后端 API 服务器。[^12^] 这一限制对所有请求者（无论其 API Key 或会员状态）一视同仁，是一种纯粹的基础设施防护措施。

值得注意的是，nginx 的配置允许短暂的突发流量（burst），即在极短时间内超过 30 req/s 的请求不会被立即拒绝，而是可以在一个小的缓冲队列中等待处理。[^12^] 然而，如果突发流量持续存在，超出缓冲容量的请求仍然会被拒绝。对于开发者而言，这意味着即使拥有 Premium 会员身份或充足的每日配额，也应避免在客户端代码中发送过于密集的请求 burst。推荐的做法是在客户端实现请求节流（request throttling）或请求队列（request queueing）机制，将请求均匀分布在时间轴上，确保每秒请求数不超过 25-28 个的安全阈值，为网络延迟和突发情况留出余量。[^29^]

### 5.3 下载速度与会员等级

**Nexus Mods 对文件下载速度实施了基于会员等级的分层限制**，这是其主要的商业收入来源之一。[^13^] 这些限制适用于通过浏览器手动下载和通过 API 获取下载链接后的文件下载，但需要注意的是，API 层面的下载链接获取本身就对非 Premium 用户施加了 403 限制。[^56^] 下载速度的分层策略如下表所示：

| 用户等级                     | 下载速度限制 | 说明                                      |
| ---------------------------- | ------------ | ----------------------------------------- |
| 普通用户（使用广告拦截器）   | ~1.5 MB/s    | 最低速度层级，广告收入被拦截时的补偿机制  |
| 普通用户（不使用广告拦截器） | ~3 MB/s      | 允许广告展示的用户获得的速度奖励          |
| Supporter 会员               | ~3 MB/s      | 付费订阅 Supporter 身份的用户             |
| 认证 Mod 作者                | ~3 MB/s      | 经过 Nexus Mods 认证的模组作者            |
| Premium 会员                 | Unlimited    | 不限速，实际速度取决于用户 ISP 和网络环境 |

[^13^]

对于非 Premium 用户，下载速度是在所有并发下载之间共享的。例如，如果一个使用广告拦截器的普通用户同时下载两个文件，这两个文件的总下载速度将被限制在约 1.5 MB/s。[^13^] Premium 会员则不受此限制，可以享受 Nexus Mods CDN 提供的最大下载速度。然而，平台也明确指出，Premium 会员的 "Unlimited" 并不意味着保证达到某个具体速度，实际下载速度仍受到用户 ISP 带宽、地理位置、网络路由、VPN 使用等多种外部因素的影响。[^13^]

![Nexus Mods 下载速度限制](download_speed_limits.png)

### 5.4 API 下载链接的 Premium 限制

**通过 API 获取模组下载链接是 Nexus Mods Premium 会员的专属特权**，这是平台在 API 层面实施的最具影响力的商业限制。[^56^] 当非 Premium 用户尝试调用 `GET /v1/games/{domain}/mods/{modId}/files/{fileId}/download_link.json` 端点时，API 会返回 **HTTP 403 Forbidden** 错误，响应体中的 JSON 对象包含明确的错误信息："You don't have permission to get download links from the API without visiting nexusmods.com - this is for premium users only"。[^56^][^20^] 这一限制不仅适用于直接使用 API 的开发者，也同样影响到所有基于 API 构建的模组管理器，如 Vortex。

这一设计决策的目的是引导免费用户通过浏览器访问 Nexus Mods 网站，在下载过程中接触页面上的广告内容，从而为平台带来广告收入。同时，它也作为 Premium 订阅的核心价值主张之一，激励重度模组用户（尤其是使用模组管理器频繁下载和更新模组的玩家）升级为付费会员。对于模组管理器的开发者来说，必须在代码中妥善处理 403 错误，通常的做法是检测到此错误后，引导用户打开浏览器访问相应的模组页面进行手动下载，或者在应用中提示用户升级为 Premium 以解锁自动下载功能。[^20^]

---

## 6. 网页端访问限制与爬虫政策

### 6.1 服务条款中的爬虫禁令

**Nexus Mods 的服务条款（Terms of Service）第 11 条明确、无条件地禁止任何形式的网页爬虫和数据挖掘活动**。[^2^] 该条款的措辞非常严格，规定 "You shall not conduct, facilitate, authorise or permit any text or data mining or web scraping in relation to our site or any services provided via, or in relation to, our site for any purpose." 这意味着不仅直接抓取网站内容是被禁止的，就连协助、授权或允许他人进行此类活动也同样违反服务条款。禁令涵盖的范围包括使用任何 "robot"、"bot"、"spider"、"scraper" 或其他自动化设备、程序、工具、算法来访问、获取、复制、监控或重新发布网站的任何部分或任何数据。[^2^]

特别值得注意的是，服务条款还明确将 **AI 模型的训练数据获取**纳入禁止范围："You shall not use, and we do not consent to the use of, our site, or any data published by, or contained in, or accessible via, our site or any services provided via, or in relation to, our site for the purposes of developing, training, fine-tuning or validating any AI system or model."[^2^] 这一条款的制定背景是欧盟《数字版权指令》（Digital Copyright Directive ((EU) 2019/790)）第 4(3) 条，该条款允许权利所有人通过合同明确保留其作品用于文本和数据挖掘的权利。Nexus Mods 正是利用了这一法律框架，通过服务条款明确表达了其对爬虫和数据挖掘的禁止立场。[^2^] 对于确实需要获取数据的特殊情况，服务条款建议通过 `support@nexusmods.com` 联系平台寻求豁免。

### 6.2 API 可接受使用政策

**除了服务条款中的总体禁令外，Nexus Mods 还专门制定了 API 可接受使用政策（API Acceptable Use Policy）**，对 API 的具体使用场景进行了更细化的规范。[^44^] 该政策明确禁止以下行为：

1. **大规模数据抓取用于重新托管（rehosting）**：禁止通过 API 批量获取数据并用于在自己的服务上重新展示。例如，创建一个镜像网站或竞争性的模组聚合平台，使用 Nexus Mods 的 API 填充内容，是被严格禁止的。

2. **在服务器上存储用户 API Key**：第三方服务不得要求用户提供其 Nexus Mods API Key 并将其存储在自己的服务器上。这意味着开发者不能构建一个中心化服务，代替用户调用 Nexus Mods API。

3. **在公开应用中使用个人 API Key**：个人 API Key 仅设计供个人使用，不应被嵌入到公开分发的应用程序中。公开应用应通过注册应用并使用 SSO 流程来获取每个用户的独立 API Key。

4. **伪造或留空请求元数据**：所有 API 请求必须包含准确的 `Application-Name` 和 `Application-Version` Header，且这些信息应与实际应用相符。冒充其他应用或发送空白元数据的行为是被禁止的。[^44^]

该政策同时强调，这是一个非详尽的列表，Nexus Mods 保留自行判断任何对模组社区或平台有害的使用行为为不可接受行为的权利，且无需提供理由。[^44^] 违反这些政策的应用可能会被主动阻止访问 API。

### 6.3 必需请求头与客户端标识

**为了实施 API 可接受使用政策并进行使用追踪，Nexus Mods 要求所有 API 请求包含特定的 HTTP Header 来标识客户端应用**。[^44^] 这些必需或强烈推荐的 Header 包括：

| Header 名称           | 示例值                            | 说明                               |
| --------------------- | --------------------------------- | ---------------------------------- |
| `apikey`              | `VX2PMnc4T5Q3d...`                | 用户的 API Key，用于认证和速率限制 |
| `Application-Name`    | `My Mod Manager`                  | 应用名称，应保持一致               |
| `Application-Version` | `1.2.0`                           | 应用版本号，应遵循语义化版本规范   |
| `User-Agent`          | `MyApp/1.0 (contact@example.com)` | 推荐，便于问题追踪                 |

[^1^][^44^]

`Application-Version` 字段尤为重要。Nexus Mods 团队建议使用语义化版本控制（Semantic Versioning）格式（如 `1.2.0`），并在每次发布新版本时更新此值。[^39^] 这样做的原因是，如果某个特定版本的应用存在 bug（例如，意外地在循环中重复发送请求，导致对 API 的 spam），平台可以根据 `Application-Version` 精确地阻止该特定版本的请求，而不会影响使用该应用其他版本的用户。[^41^] 这种精细化的流量管理能力对于维护 API 的稳定性至关重要，因此提供准确且保持更新的版本信息不仅是政策要求，也是开发者自身利益的最佳保障。

---

## 7. HTTP 状态码与错误处理

### 7.1 常见状态码参考

![Nexus Mods API HTTP 状态码参考](http_status_codes.png)

**Nexus Mods API 使用标准的 HTTP 状态码来表示请求的处理结果**。下表汇总了开发者在集成 API 时最常见的状态码及其含义：

| 状态码                    | 含义           | 常见触发场景                        | 建议处理方式                                  |
| ------------------------- | -------------- | ----------------------------------- | --------------------------------------------- |
| `200 OK`                  | 请求成功       | 正常的数据查询或操作                | 解析响应体中的 JSON 数据                      |
| `401 Unauthorized`        | 认证失败       | 缺少 API Key 或 Key 无效            | 提示用户检查并重新输入 API Key                |
| `403 Forbidden`           | 权限不足       | 非 Premium 用户请求下载链接         | 引导用户通过浏览器下载或升级 Premium          |
| `429 Too Many Requests`   | 速率限制触发   | 超过每日/每小时配额或 nginx 30req/s | 读取 Retry-After 或 X-RL 头，实现指数退避重试 |
| `503 Service Unavailable` | 服务暂时不可用 | 服务器维护或过载                    | 稍后重试，向用户显示临时不可用提示            |

[^29^][^56^]

当 API 返回错误状态码时，响应体通常包含一个 JSON 对象，其中 `code` 字段为 HTTP 状态码的数值，`message` 字段提供人类可读的错误描述。例如：

```json
{
  "code": 403,
  "message": "You don't have permission to get download links from the API without visiting nexusmods.com - this is for premium users only."
}
```

[^20^]

### 7.2 速率限制相关响应头

**当客户端接近或达到速率限制时，Nexus Mods API 通过响应头提供详细的配额信息**，使客户端能够实现智能的请求节流和优雅降级。[^12^] 这些 Header 以 `X-RL-` 为前缀，含义详见 5.1 节。在收到 `429 Too Many Requests` 响应时，客户端应首先检查这些 Header 以确定是触发了哪一层级的限制（用户级每日/每小时限制，还是 nginx 的每秒限制）。如果是用户级限制，可以提取 `X-RL-Hourly-Reset` 或 `X-RL-Daily-Reset` 的值，计算需要等待的时间，并在 UI 上向用户显示倒计时。如果是 nginx 限制，则通常只需等待几秒后重试即可。

推荐的客户端错误处理策略包括：**指数退避（Exponential Backoff）**，即在连续收到 429 错误时，逐渐增加重试间隔（如 1 秒、2 秒、4 秒、8 秒）；**请求队列（Request Queueing）**，将所有 API 请求放入队列中，由一个专门的调度器按照安全的速率（如每秒 25 个请求）统一发出；以及 **响应缓存（Response Caching）**，对于不经常变化的数据（如游戏列表、模组元数据），在客户端进行缓存，避免重复的 API 调用。[^29^] 对于模组管理器等需要频繁调用 API 的应用，这些策略对于确保应用的稳定性和避免用户被临时封禁至关重要。

---

## 8. 第三方 SDK 与开发工具

### 8.1 官方 Node.js SDK

**Nexus Mods 官方维护了一个 Node.js SDK，包名为 `@nexusmods/nexus-api`**，托管在 npm 仓库中。[^42^] 该 SDK 封装了 API v1 的所有端点，提供了类型安全的接口和便捷的方法来与 Nexus Mods API 交互。使用此 SDK 时，开发者只需提供用户的 API Key、应用名称和应用版本号，SDK 会自动处理请求头的设置和响应解析。该 SDK 也是 Nexus Mods 官方模组管理器 Vortex 的底层依赖之一，因此其稳定性和与 API 的兼容性得到了充分验证。

该 SDK 支持的功能包括：获取游戏列表、查询模组信息、获取模组文件列表、获取下载链接（自动处理 Premium 限制）、管理用户的追踪和背书模组列表，以及通过 SSO 流程获取 API Key。[^41^] 对于基于 Electron 或 Node.js 的桌面应用开发者，使用此官方 SDK 可以显著降低集成复杂度，并确保遵循最佳实践。SDK 的 GitHub 仓库 (`Nexus-Mods/node-nexus-api`) 还包含了详细的文档和示例代码，帮助开发者快速上手。[^19^]

### 8.2 社区 SDK 与客户端库

除了官方 Node.js SDK 外，开发者社区还为多种编程语言创建了非官方的 SDK 和客户端库，极大地丰富了 Nexus Mods API 的生态系统：

| 语言/平台      | 库名称            | 作者/组织   | 主要特性                         | 参考来源 |
| -------------- | ----------------- | ----------- | -------------------------------- | -------- |
| .NET / C#      | **FluentNexus**   | Pathoschild | 现代异步 HTTP 客户端，强类型接口 | [^20^]   |
| Python         | **pynxm**         | GandaG      | 支持用户管理、模组查询、文件下载 | [^67^]   |
| Dart           | **nexus_mods**    | ArcaneArts  | Dart/Flutter 应用支持，SSO 集成  | [^12^]   |
| GitHub Actions | **upload-action** | Nexus-Mods  | 官方 CI/CD 上传工具，基于 v3 API | [^54^]   |

**FluentNexus** 是 .NET 生态中最成熟的 Nexus Mods API 客户端，提供了流畅的 API 接口和完整的错误处理机制。[^20^] 其设计遵循异步编程最佳实践，所有网络操作都返回 `Task` 对象，便于在现代 .NET 应用中集成。**pynxm** 则是 Python 开发者首选的库，支持模组追踪、背书、文件下载链接生成等核心功能，安装简单，通过 `pip install pynxm` 即可使用。[^67^] **upload-action** 是 Nexus Mods 官方发布的 GitHub Action，允许模组开发者在其 GitHub 仓库的 CI/CD 工作流中自动上传模组文件到 Nexus Mods，是实现发布流程自动化的利器。[^54^]

---

## 9. API 使用最佳实践与开发建议

### 9.1 请求节流与队列管理

**有效的请求节流是确保应用稳定运行并避免触发速率限制的关键**。开发者应在客户端实现请求队列和节流机制，确保请求均匀分布在时间轴上，而不是集中爆发。一个推荐的策略是维护一个令牌桶（Token Bucket）或漏桶（Leaky Bucket）算法，将请求速率控制在每秒 25 个请求以下，为 nginx 的 30 req/s 限制留出安全余量。[^12^] 对于需要批量获取数据的场景（如初始化时同步大量模组信息），应将请求分批发送，并在批次之间加入延迟。同时，应用应实时监控 API 响应中的 `X-RL-Remaining` Header，当剩余配额低于某个阈值（如 10%）时，主动降低请求频率或暂停非关键的数据同步操作。

### 9.2 缓存策略

**合理的缓存策略可以显著减少 API 调用次数，提升应用响应速度，并降低对 Nexus Mods 服务器的负载**。对于不同类别的数据，应采用差异化的缓存策略：

| 数据类型                   | 推荐缓存时间         | 理由                   |
| -------------------------- | -------------------- | ---------------------- |
| 游戏列表                   | 24 小时              | 变更频率极低           |
| 模组元数据（名称、作者等） | 1-6 小时             | 相对稳定，但可能更新   |
| 模组文件列表               | 15-30 分钟           | 新版本发布时变更       |
| 追踪/背书列表              | 启动时获取，本地维护 | 用户操作后立即更新     |
| 下载链接                   | 不缓存               | 短期有效，Premium 限制 |

在实现缓存时，建议使用本地数据库（如 SQLite、IndexedDB）或内存缓存，并为每个缓存条目记录时间戳。在发送 API 请求前，先检查缓存中是否存在未过期的数据。当应用检测到网络状态变化（如从离线恢复在线）时，可以主动刷新缓存数据。对于模组管理器，特别重要的是在启动时进行增量更新，只查询自上次同步以来有变化的模组，而不是每次都获取完整列表。

### 9.3 错误处理与用户提示

**优雅的错误处理是提升用户体验的关键**。当 API 请求失败时，应用应根据不同的错误类型提供有针对性的用户提示和恢复方案：

- **401 Unauthorized**：显示友好的提示，引导用户前往 Nexus Mods 网站的 API Access 页面生成或复制 API Key。可以提供直接打开该页面的按钮。
- **403 Forbidden (下载链接)**：明确告知用户通过 API 下载需要 Premium 会员资格。提供两个选项：一是通过浏览器打开模组页面进行手动下载，二是提供升级 Premium 的链接。
- **429 Too Many Requests**：在 UI 上显示一个倒计时计时器，告知用户 API 限制将在何时重置（基于 `X-RL-Daily-Reset` 或 `X-RL-Hourly-Reset` Header）。同时自动暂停后台数据同步任务。
- **503 Service Unavailable / 网络超时**：显示暂时性错误提示，并自动以指数退避策略进行重试。避免频繁弹窗打扰用户。

在所有错误场景中，都应记录详细的错误日志（包括 HTTP 状态码、响应体、请求 URL 和时间戳），以便在需要时进行调试和向 Nexus Mods 支持团队报告问题。对于无法自动恢复的错误，应提供 "重试" 按钮，让用户可以手动触发重试操作。

---

## 10. 总结与未来展望

### 10.1 核心要点总结

本报告对 Nexus Mods API 进行了全面深入的调研，涵盖了 API 的三个主要版本（v1 REST、v2 GraphQL、v3 Upload）、三种认证机制（API Key、SSO、OAuth）、完整的 v1 端点参考、多层速率限制策略（用户级 20,000/日 + nginx 30/秒）、下载链接的 Premium 限制、严格的网页爬虫禁令，以及丰富的第三方 SDK 生态。研究发现，**Nexus Mods API 的设计理念体现了平台在开放性、安全性和商业可持续性之间的平衡**：通过慷慨的每日配额（20,000 请求）支持活跃的模组管理器和社区工具，通过 Premium 专属下载链接保护核心收入来源，通过严格的爬虫政策维护平台数据的独占性和模组作者的权益。

### 10.2 未来发展趋势

展望未来，Nexus Mods API 的发展将呈现以下趋势：

1. **GraphQL v2 的成熟与普及**：随着 v2 API 逐渐稳定并开放 OAuth 客户端自助注册，GraphQL 的灵活性和效率优势将吸引更多开发者迁移。v2 可能成为未来 Nexus Mods 官方应用（如下一代 Vortex 或 Nexus Mods App）的首选接口。

2. **API v3 的完整功能释放**：当前的 v3 Upload API 仅支持更新现有模组的文件，完整的模组创建和管理功能（如修改模组描述、更新变更日志、管理团队成员）预计将在后续版本中逐步开放。这将进一步赋能模组作者的自动化工作流。

3. **更精细的权限控制**：随着 API 功能的扩展，Nexus Mods 可能引入更细粒度的 OAuth Scope 机制，允许用户精确控制第三方应用可以访问的数据范围和操作权限，提升账户安全性。

4. **社区工具的深度集成**：随着 Upload API 的普及，预计将涌现更多集成到 IDE、构建工具和版本控制系统中的 Nexus Mods 插件，使模组发布成为开发流程的无缝一环。

对于开发者而言，**建议优先基于稳定的 API v1 构建核心功能**，同时密切关注 API v2 和 v3 的发展动态，在条件成熟时逐步迁移到更现代化的接口，以利用新功能并确保应用的长期可维护性。

---

## 参考资料

[^1^]: CSDN问答 - Nexus Mods API key在哪里查看, 2025. https://ask.csdn.net/questions/9035485

[^2^]: Nexus Mods Help Center - Terms of Service, 2025. https://help.nexusmods.com/article/18-terms-of-service

[^6^]: Nexus Mods GraphQL API Documentation (API v2), 2024. https://graphql.nexusmods.com/

[^8^]: Nexus Mods GitHub Organization, 2026. https://github.com/Nexus-Mods/

[^12^]: GitHub - ArcaneArts/nexus_mods (Dart API client), 2024. https://github.com/ArcaneArts/nexus_mods

[^13^]: Nexus Mods Help Center - Download speed caps, Adblockers, and different types of membership, 2026. https://help.nexusmods.com/article/96-download-speed-caps-adblockers-and-different-types-of-membership

[^15^]: GitHub - Reloaded-II Issue #727 (API endpoint reference), 2025. https://github.com/Reloaded-Project/Reloaded-II/issues/727

[^16^]: Nexus Mods News - API released, 2019. https://www.nexusmods.com/news/13921

[^17^]: Nexus Mods Forums - Nexus Mods API released, 2019. https://forums.nexusmods.com/topic/7313591-nexus-mods-api-released/

[^19^]: GitHub - Nexus-Mods/node-nexus-api (Official Node.js SDK), 2018. https://github.com/Nexus-Mods/node-nexus-api

[^20^]: GitHub - Pathoschild/FluentNexus (.NET API client), 2019. https://github.com/Pathoschild/FluentNexus

[^28^]: Nexus Mods Help Center - I have reached a daily or hourly limit / Rate Limit Exceeded, 2024. https://help.nexusmods.com/article/105-i-have-reached-a-daily-or-hourly-limit-api-requests-have-been-consumed-rate-limit-exceeded-what-does-this-mean

[^29^]: Postman Blog - HTTP Error 429 (Too Many Requests) - How to Fix, 2025. https://blog.postman.com/http-error-429/

[^39^]: npm - @outboard7/nexus-api package documentation. https://www.npmjs.com/package/%40outboard7%2Fnexus-api

[^41^]: GitHub - Nexus-Mods/node-nexus-api docs/README.md. https://github.com/Nexus-Mods/node-nexus-api/blob/master/docs/README.md

[^42^]: npm - @nexusmods/nexus-api package, 2022. https://www.npmjs.com/package/%40nexusmods%2Fnexus-api

[^44^]: Nexus Mods Help Center - API Acceptable Use Policy, 2020. https://help.nexusmods.com/article/114-api-acceptable-use-policy

[^54^]: GitHub - Nexus-Mods/upload-action, 2026. https://github.com/Nexus-Mods/upload-action

[^55^]: Nexus Mods News - Upload API Open Beta Now Live!, 2026. https://www.nexusmods.com/news/15454

[^56^]: GitHub - Nexus-Mods/Vortex Issue #14549 (403 error on download), 2023. https://github.com/Nexus-Mods/Vortex/issues/14549

[^59^]: GitHub - Nexus-Mods/sso-integration-demo, 2019. https://github.com/Nexus-Mods/sso-integration-demo

[^67^]: GitHub - GandaG/pynxm (Python API wrapper), 2019. https://github.com/GandaG/pynxm

[^71^]: GitHub - Nexus-Mods/Vortex Issue #6300 (API endpoint format reference), 2022. https://github.com/Nexus-Mods/Vortex/issues/6300

[^72^]: Nexus Mods API Documentation (official docs site), 2024. https://api-docs.nexusmods.com/
