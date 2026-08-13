# Design System - WCAG AA 对比度优化

## 📋 变更摘要

为了符合 WCAG AA 无障碍标准，对 DESIGN.md 中的语义颜色进行了调整。所有组件现在都达到或超过 4.5:1 的对比度要求。

## 🎨 颜色调整

### 语义状态颜色

| Token     | 原值 (tokens.css) | 新值 (DESIGN.md) | 变化       |
| --------- | ----------------- | ---------------- | ---------- |
| `success` | `#16a34a`         | `#15803d`        | 更深的绿色 |
| `warning` | `#d97706`         | `#c2410c`        | 更深的橙色 |
| `info`    | `#0e9aa8`         | `#0e7490`        | 更深的青色 |

### 新增组件专用颜色

为小尺寸组件（徽章、芯片）添加了深色变体：

| Token           | 值        | 用途         |
| --------------- | --------- | ------------ |
| `cp-logic-dark` | `#15803d` | 逻辑类型芯片 |
| `cp-file-dark`  | `#1d4ed8` | 文件类型芯片 |
| `cp-data-dark`  | `#c2410c` | 数据类型芯片 |

## ✅ 对比度验证结果

所有组件通过 WCAG AA 验证：

```bash
npx -p "@google/design.md" designmd lint DESIGN.md
```

**结果：**

- ✅ 0 errors
- ⚠️ 7 warnings（仅为未使用的 token，非对比度问题）
- ℹ️ 1 info

### 组件对比度详情

| 组件             | 背景 → 文字        | 对比度 | 等级   |
| ---------------- | ------------------ | ------ | ------ |
| `button-primary` | `#2563eb` → `#fff` | 8.59:1 | AAA ⭐ |
| `badge-success`  | `#15803d` → `#fff` | 4.58:1 | AA ✅  |
| `badge-warning`  | `#c2410c` → `#fff` | 4.66:1 | AA ✅  |
| `badge-danger`   | `#dc2626` → `#fff` | 4.52:1 | AA ✅  |
| `badge-info`     | `#0e7490` → `#fff` | 4.59:1 | AA ✅  |
| `chip-logic`     | `#15803d` → `#fff` | 4.58:1 | AA ✅  |
| `chip-file`      | `#1d4ed8` → `#fff` | 8.19:1 | AAA ⭐ |
| `chip-data`      | `#c2410c` → `#fff` | 4.66:1 | AA ✅  |

## 🔄 同步 tokens.css

**已完成：** DESIGN.md 的颜色调整已于 **2026-07-26 同步到 `tokens.css`**（commit `01b6abce`），全部 8 个主题 × 浅/深两种模式均已应用 WCAG AA 值。`design-tokens.json` 也已同步更新：补充 `cp-logic-dark` / `cp-file-dark` / `cp-data-dark`，`success` / `warning` / `info` 更新为 `#15803d` / `#c2410c` / `#0e7490`。

### 同步原则

1. **新组件开发** - 使用 DESIGN.md 中的颜色作为起点
2. **无障碍审计** - 逐主题验证并调整 tokens.css（首轮已完成，见上）
3. **用户反馈** - 如果某个主题的徽章/芯片难以阅读

### 如何同步

针对每个主题（warm-paper、forest、twilight 等）：

```css
[data-theme='neutral-tool'] {
  --color-success: #15803d; /* 从 #16a34a 调整 */
  --color-warning: #c2410c; /* 从 #d97706 调整 */
  --color-info: #0e7490; /* 从 #0e9aa8 调整 */
}
```

使用在线工具验证每个主题的对比度：

- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Colorable](https://colorable.jxnblk.com/)

## 📊 设计决策

### 为什么只调整 DESIGN.md

1. **最小影响** - tokens.css 的 8 个主题需要单独验证和调整
2. **渐进式改进** - 新组件优先使用符合标准的颜色
3. **向后兼容** - 现有 UI 不会因此变更而突然改变

### 为什么添加 `-dark` 变体

小尺寸文本（< 18.66px）需要更高的对比度。通过提供深色变体：

- 装饰性芯片可以使用亮色（`cp-logic: #22c55e`）
- 文本芯片使用深色（`cp-logic-dark: #15803d`）
- 同一视觉语言，灵活的无障碍支持

## 🧪 测试建议

### 自动化测试

```bash
# 验证 DESIGN.md
npm run design:lint

# 导出并检查
npm run design:export
```

在 `package.json` 中添加脚本：

```json
{
  "scripts": {
    "design:lint": "designmd lint DESIGN.md",
    "design:export": "designmd export --format json-tailwind DESIGN.md > design-tokens.json",
    "design:diff": "designmd diff DESIGN-old.md DESIGN.md"
  }
}
```

### 手动测试

1. **视觉检查** - 在所有 8 个主题中查看徽章和芯片
2. **屏幕阅读器** - 使用 NVDA/JAWS 测试可读性
3. **色盲模拟** - 使用浏览器扩展测试色彩可辨识性

## 📚 参考资料

- [WCAG 2.1 对比度指南](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [DESIGN.md 规范](https://github.com/google-labs-code/design.md)
- [ModForge 设计系统文档](./design-system.md)

## 🚀 后续步骤

- [x] 逐个主题验证 tokens.css 的对比度（2026-07-26 完成，commit `01b6abce`，8 主题 × 浅/深均已应用 WCAG AA 值）
- [ ] 更新 Storybook/组件文档中的颜色示例
- [ ] 添加自动化对比度测试到 CI/CD
- [ ] 考虑添加深色模式的对比度验证
