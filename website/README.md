# ModForge Studio website

静态产品介绍站：暖田园工坊气质、深浅色、中英切换。无构建步骤，可直接打开或挂到任意静态托管。

## 本地预览

```bash
# 任选其一
npx serve website -l 4177
# 或
python -m http.server 4177 --directory website
```

浏览器打开 `http://127.0.0.1:4177/`。

## 结构

| 路径                                        | 说明                                  |
| ------------------------------------------- | ------------------------------------- |
| `index.html`                                | 落地页结构                            |
| `styles.css`                                | 主题 token、布局、Workbench 窗体 mock |
| `main.js`                                   | 深浅色、中英、滚动揭示、指针光晕      |
| `modforge-logo-primary.svg` / `favicon.svg` | 品牌资源                              |
| `shots/`                                    | Playwright 实机 / mock 截图           |
| `scripts/capture-shots.mjs`                 | 截图脚本                              |

## 截图（Tauri / web:dev mock）

应用在 DEV 下支持启动器 mock（见 `apps/desktop/src/platform/tauri/devLauncherMock.ts`）：

```text
http://127.0.0.1:5175/?mfLauncherMock=1&mfLauncherMockMods=48
```

1. 终端 A：`vp run web:dev`（注意实际端口，可能是 5173 / 5175）
2. 终端 B：`npx serve website -l 4177`
3. 从仓库根目录：

```bash
# PowerShell
$env:APP_URL='http://127.0.0.1:5175/'
$env:SITE_URL='http://127.0.0.1:4177/'
node website/scripts/capture-shots.mjs
```

输出写入 `website/shots/`。落地页会引用 `app-launcher-mock.png` 作为实机示意。

完整桌面宿主（Tauri/Electron）可用 `vp run dev`；纯 web:dev 没有宿主时部分能力会失败，截图脚本会尽量隐藏相关 toast。

## 方向备忘

- **受众**：产品官网落地页
- **气质**：星露谷暖田园工坊（奶油纸面、森林绿、琥珀点缀）
- **签名**：伪 Workbench 窗体 + 实机 Launcher mock 截图
- **交互**：滚动揭示、指针柔光、主题/语言切换
