# 学习手记 · 四主题整合（integration/final）

原生 HTML / CSS / JavaScript 学习站。当前课程是 AI 工作流学习路线：20 门课程与 2 条跳过记录，共 22 条。站点提供四套完整可切换主题：经典、星空 / SPACE、山海 / TERRAIN、织理 / WEFT。

本分支是整合分支，不是重新设计。四套主题分别来自 main、`theme/kimi` 与 `theme/deepseek`，各作者的视觉语言、课程界面、动画与交互均按原样保留；本轮只处理三方合并冲突、主题入口和必要的测试修正。没有为追求统一而重绘任何一套主题的选课界面。

## 本地预览

在本目录执行：

```sh
python3 start-preview.py
```

脚本会启动 http://127.0.0.1:8000 ，可用 `--port 8001` 更换端口。通过页面右下/右上的「经典 / 星空 / 山海 / 织理」切换；手机织理与山海使用「主题」按钮展开菜单。无需构建，也不需要下载第三方运行资源。

## 四套主题

| 主题 | 键值 | 主题色 | 课程界面（作者原设计） |
| --- | --- | --- | --- |
| 经典 | `classic` | `#f6f6f0` | 双列课程卡与 192px 侧栏，原站样式 |
| 星空 | `space` | `#080d17` | 深色单列课程与透明侧栏，五幕 WebGL 星际叙事 |
| 山海 | `terrain` | `#e4e4da` | 双列图幅索引卡与 206px 侧栏，宋体、等高线与测绘语气 |
| 织理 | `weft` | `#e7e8e1` | 12 列 7/5 交错织样卡与 205px 侧栏，经线/纬线语义 |

主题值保存在 `ai_learning_visual_theme`，学习进度仍使用 `ai_learning_tracker_v2`（`{version:2,statuses}`，状态为 `done/todo/skip`），兼容旧的 `ai_learning_tracker_v1` 索引数组。

## 文件

- `index.html`：原经典样式、全部课程与学习数据逻辑；四主题预加载、选择器、五幕星空结构、山海地图与织理结构。
- `space.css` / `space.js`：星空主题、五幕滚动叙事、WebGL 星球与星环、无 WebGL 降级、主题状态与阅读位置。
- `terrain.css` / `terrain.js`：山海主题、等高线地图、进度山脚/山巅、图幅索引卡与移动端。
- `weft.css` / `weft.js`：织理主题、织样卡、梭线入场、滚动书签与移动主题菜单。
- `start-preview.py`：仅用 Python 标准库的本地预览启动器。
- `tests/space-smoke.cjs`：课程、进度、迁移、备份、主题持久化、阅读位置、WebGL 降级与响应式。
- `tests/weft-smoke.cjs`：织理隔离、课程分组、备份、四主题阅读锚点、44px 目标、空闲渲染与滚动性能。
- `tests/interaction-smoke.cjs`：可见目标尺寸、键盘焦点与四主题切换、弹窗、真实触控、存储失败降级与交互耗时。
- `tests/screenshots/`：三位作者原有的主题实测截图，整合时保持原样，未被覆盖。
- `tests/weft-performance.json`、`tests/interaction-performance.json`：各作者原始测量样本。
- `tests/integration-performance.json`：本轮四主题整合在独立副本中的复跑数据。

## 整合范围

- 以 main（`a523c2e`）为基，依次合入 `theme/kimi`（WEFT，`344243e`）与 `theme/deepseek`（山海，`8d65c6a4`），得到 `f42969f` 与 `2fcf500`。
- 冲突集中在 `index.html`、主题预加载、主题按钮顺序、主题色映射与测试文件映射：保留四主题，顺序为经典 → 星空 → 山海 → 织理；同时加载 `space.css`、`terrain.css`、`weft.css`。
- 四套主题脚本共存，`space.js` 统一用 `currentTheme` 处理重复点击短路；山海的 favicon 作为整合后的站点图标。
- 唯一的功能性测试修正是键盘路径：原测试从星空直接 Tab 到织理，四主题下会先落到山海；已改为经典 → 星空 → 山海 → 织理，并分别断言主题切换。
- 没有改 main，没有合并 PR，没有发布 GitHub Pages；`integration/final` 仅用于评审。

## 验证

三套回归在仓库副本中全部通过，详细记录见 `VALIDATION.md`。本轮复跑的关键数据：

| 指标 | 结果 |
| --- | ---: |
| 织理连续滚动（115 帧）中位 | 16.7 ms |
| 织理连续滚动 P95 | 33.4 ms |
| 织理连续滚动最大值 | 50.0 ms |
| 课程完成切换 P95 | 10.8 ms |
| 经典 ↔ 织理往返 P95 | 27.6 ms |

四主题桌面（1440×900）与手机（390×844）均无横向溢出；0% / 100% 进度渲染正常；浏览器控制台无错误。性能数据来自云 Chromium 软件图形环境，只用于回归对照，不等同于所有真实设备上的 60 FPS 承诺。

## 复跑测试

测试工具需要 Node.js 与 Playwright；网站运行本身不需要它们。

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/space-smoke.cjs
node tests/weft-smoke.cjs
node tests/interaction-smoke.cjs
```

脚本会自行启动临时本地服务器并在结束后关闭。若使用系统 Chromium，可通过 `CHROMIUM_PATH` 指定可执行文件。建议在仓库副本中运行，因为测试会写入 `tests/screenshots/` 与性能 JSON；这样可以保留各作者原始截图。

## 边界

- 本地预览与 GitHub Pages 属于不同来源，浏览器不会共享 localStorage；需要沿用已有记录时，先在原站导出，再在本地导入。
- 本轮没有为统一视觉重写课程界面。若需要让四套选课界面进一步分化，应作为新的设计任务单独确认，不能在整合中擅自推翻作者设计。
