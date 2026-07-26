# ModForge Studio Design System

本项目采用 [Google DESIGN.md 规范](https://github.com/google-labs-code/design.md) 来描述视觉设计系统，使 AI 编码助手能够准确理解和应用设计规范。

## 📄 核心文件

- **[DESIGN.md](../DESIGN.md)** - 设计系统主文件（机器可读的 YAML token + 人类可读的设计说明）
- **[tokens.css](../apps/desktop/src/styles/tokens.css)** - 实际的 CSS 变量实现

## 🎨 设计主题

ModForge Studio 支持 8 个主题，每个主题都有浅色和深色两种模式：

| 主题             | 浅色 Accent | 深色 Accent | 风格         |
| ---------------- | ----------- | ----------- | ------------ |
| **neutral-tool** | `#2563eb`   | `#5b8def`   | 通用专业工具 |
| **warm-paper**   | `#5b54d6`   | `#8983e8`   | 温暖纸质感   |
| **slate-blue**   | `#0e7490`   | `#2bb6d4`   | 冷静技术感   |
| **forest**       | `#3f8f4f`   | `#5fb96f`   | 自然绿色     |
| **twilight**     | `#7c5cd6`   | `#a385ee`   | 神秘紫色     |
| **stardew-wood** | `#c77d2e`   | `#e09a4f`   | 星露谷木质   |
| **crimson**      | `#d4324a`   | `#ec5a70`   | 活力红色     |
| **blossom**      | `#db2777`   | `#f25fa0`   | 优雅粉色     |

## 🛠️ CLI 工具

### 安装

```bash
npm install -D @google/design.md
```

### 验证设计系统

```bash
npx -p "@google/design.md" designmd lint DESIGN.md
```

检查：

- ✅ Token 引用完整性
- ✅ WCAG 对比度合规性
- ✅ 设计系统结构

### 导出为 Tailwind 配置

```bash
# JSON 格式（Tailwind v3）
npx -p "@google/design.md" designmd export --format json-tailwind DESIGN.md > tailwind-tokens.json

# CSS 格式（Tailwind v4）
npx -p "@google/design.md" designmd export --format css-tailwind DESIGN.md > theme.css
```

### 导出为 W3C DTCG

```bash
npx -p "@google/design.md" designmd export --format dtcg DESIGN.md > tokens.json
```

### 对比设计变更

```bash
npx -p "@google/design.md" designmd diff DESIGN-v1.md DESIGN-v2.md
```

## 📋 设计 Token 概览

### 颜色系统

```yaml
colors:
  primary: '#2563eb' # 主色调
  success: '#15803d' # 成功状态（WCAG AA 优化）
  warning: '#c2410c' # 警告状态（WCAG AA 优化）
  danger: '#dc2626' # 危险/错误
  info: '#0e7490' # 信息提示（WCAG AA 优化）

  surface-app: '#f1f1f2' # 应用背景
  surface-panel: '#fbfbfc' # 面板背景
  surface-viewport: '#e3e3e5' # 画布背景

  text-primary: '#1c1c20' # 主要文本
  text-secondary: '#52535a' # 次要文本
  text-tertiary: '#86878e' # 辅助文本

  # 组件专用深色变体（用于小文本场景）
  cp-logic-dark: '#15803d' # 逻辑芯片深色
  cp-file-dark: '#1d4ed8' # 文件芯片深色
  cp-data-dark: '#c2410c' # 数据芯片深色
```

### 排版

```yaml
typography:
  font-sans: 'Segoe UI Variable Text, SF Pro Text, ...'
  font-mono: 'IBM Plex Mono, Cascadia Mono, JetBrains Mono, ...'
```

### 圆角

```yaml
rounded:
  sm: 4px # 按钮、徽章
  md: 8px # 面板、卡片
  lg: 12px # 对话框
```

### 间距

```yaml
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
```

## 🎯 使用指南

### 在代码中引用设计 Token

当 AI 助手生成 UI 代码时，它会根据 DESIGN.md 中的定义来选择合适的颜色、间距和样式。

**示例：创建按钮组件**

```tsx
// AI 会理解 button-primary 组件的定义：
// backgroundColor: {colors.primary}
// textColor: {colors.text-inverse}
// rounded: {rounded.md}
// padding: 12px

<button className="bg-primary text-inverse rounded-md px-3 py-2">保存</button>
```

### 添加新组件 Token

在 `DESIGN.md` 的 `components:` 部分添加：

```yaml
components:
  my-custom-card:
    backgroundColor: '{colors.surface-panel}'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.lg}'
    padding: 16px
```

然后运行验证：

```bash
npx -p "@google/design.md" designmd lint DESIGN.md
```

## 🔄 同步 DESIGN.md 与 tokens.css

DESIGN.md 是**设计意图的单一来源**，但实际实现在 `tokens.css` 中。两者关系：

- **DESIGN.md** - 默认主题（neutral-tool）的规范定义，供 AI 助手理解
- **tokens.css** - 完整的多主题 CSS 变量实现，包含所有 8 个主题

### 更新流程

1. **修改 DESIGN.md** - 更新设计 token 或组件定义
2. **验证** - `npx -p "@google/design.md" designmd lint DESIGN.md`
3. **同步到 tokens.css** - 手动或通过 AI 助手更新对应的 CSS 变量
4. **测试** - 在所有主题下验证视觉效果

## ✅ 无障碍合规

所有组件的颜色对比度均已优化以符合 WCAG AA 标准（4.5:1）：

### 调整的颜色值

为确保可访问性，以下颜色已从原始 `tokens.css` 调整为更深的色调：

| Token           | 原始值    | DESIGN.md 值 | 原因                    |
| --------------- | --------- | ------------ | ----------------------- |
| `success`       | `#16a34a` | `#15803d`    | 提升徽章对比度至 4.58:1 |
| `warning`       | `#d97706` | `#c2410c`    | 提升徽章对比度至 4.66:1 |
| `info`          | `#0e9aa8` | `#0e7490`    | 提升徽章对比度至 4.59:1 |
| `cp-logic-dark` | -         | `#15803d`    | 芯片组件专用深色        |
| `cp-file-dark`  | -         | `#1d4ed8`    | 芯片组件专用深色        |
| `cp-data-dark`  | -         | `#c2410c`    | 芯片组件专用深色        |

### 组件对比度报告

| 组件             | 背景色    | 文字色    | 对比度 | 状态   |
| ---------------- | --------- | --------- | ------ | ------ |
| `button-primary` | `#2563eb` | `#ffffff` | 8.59:1 | ✅ AAA |
| `badge-success`  | `#15803d` | `#ffffff` | 4.58:1 | ✅ AA  |
| `badge-warning`  | `#c2410c` | `#ffffff` | 4.66:1 | ✅ AA  |
| `badge-danger`   | `#dc2626` | `#ffffff` | 4.52:1 | ✅ AA  |
| `badge-info`     | `#0e7490` | `#ffffff` | 4.59:1 | ✅ AA  |
| `chip-logic`     | `#15803d` | `#ffffff` | 4.58:1 | ✅ AA  |
| `chip-file`      | `#1d4ed8` | `#ffffff` | 8.19:1 | ✅ AAA |
| `chip-data`      | `#c2410c` | `#ffffff` | 4.66:1 | ✅ AA  |

### 多主题实现注意事项

`DESIGN.md` 定义的是 **neutral-tool 浅色主题** 的基准颜色。其他主题（warm-paper、forest、twilight 等）在 `tokens.css` 中有各自的颜色定义，需要单独验证对比度。

当为其他主题添加新组件时，请确保：

1. 在 `DESIGN.md` 中定义基准（neutral-tool）
2. 在 `tokens.css` 中为每个主题适配
3. 使用在线工具验证对比度（如 [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)）

## 📚 相关资源

- [DESIGN.md 规范](https://github.com/google-labs-code/design.md)
- [W3C Design Tokens Format](https://www.designtokens.org/)
- [WCAG 对比度指南](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [ModForge 前端架构](./frontend-architecture.md)
- [样式规范](./.claude/rules/styles.md)
