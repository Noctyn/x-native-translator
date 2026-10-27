# x-native-translator

用于 X（原 Twitter）网页端的增强翻译用户脚本。直接复用当前登录会话调用网页端官方 Grok / 原生翻译接口，无需配置第三方 API Key 或自建代理。

[![GitHub Repo stars](https://img.shields.io/github/stars/Noctyn/x-native-translator?style=flat-square)](https://github.com/Noctyn/x-native-translator) [![GitHub repo size](https://img.shields.io/github/repo-size/Noctyn/x-native-translator?style=flat-square)](https://github.com/Noctyn/x-native-translator) [![GitHub last commit](https://img.shields.io/github/last-commit/Noctyn/x-native-translator?style=flat-square)](https://github.com/Noctyn/x-native-translator) [![GitHub license](https://img.shields.io/github/license/Noctyn/x-native-translator?style=flat-square)](https://github.com/Noctyn/x-native-translator/blob/main/LICENSE) [![GitHub top language](https://img.shields.io/github/languages/top/Noctyn/x-native-translator?style=flat-square)](https://github.com/Noctyn/x-native-translator)

---

## 功能特性

- **免配置调用**：直接复用 X 网页端登录态请求官方翻译接口，安装即用。
- **双模式触发**：
  - **悬停翻译**：鼠标悬停于推文触发，支持自定义触发延迟与 `Alt` / `Ctrl` / `Shift` 修饰键防误触。
  - **自动翻译**：滚动浏览时自动翻译可视区域内的推文，支持限制为仅在帖子详情页生效。
- **多视图与外观**：
  - 默认启用「双语对照」+「极简竖线」样式；点击译文区域可在「双语对照 / 仅译文 / 原文」三种视图间切换。
  - 提供三款内置外观：**极简竖线**（默认）、**轻盈卡片**、**色条引述**。
- **多场景覆盖**：
  - 支持主推文、引用推文及长推文（可在翻译前自动展开全文）。
  - 支持个人主页简介（Bio）与用户名悬浮卡片（HoverCard）翻译。
  - 可选接管网页端自带的「显示翻译」按钮样式（实验性功能，默认关闭）。
- **缓存与性能控制**：
  - 内置本地持久化译文缓存，刷新页面或重复浏览无需二次请求。
  - 提供「全动画（默认） / 中等 / 关闭」三档过渡动画设置，适配不同性能设备。

---

## 界面预览

|           极简竖线（默认）            |              轻盈卡片              |              色条引述               |
| :-----------------------------------: | :--------------------------------: | :---------------------------------: |
| ![极简竖线](assets/style-minimal.png) | ![轻盈卡片](assets/style-card.png) | ![色条引述](assets/style-quote.png) |

---

## 安装

请先在浏览器中安装用户脚本管理器：[Tampermonkey](https://www.tampermonkey.net/)（推荐）或 [Violentmonkey](https://violentmonkey.github.io/)。

随后通过以下任一渠道安装脚本：

- [Greasy Fork 安装地址](https://greasyfork.org/zh-CN/scripts/602228)（推荐）
- [GitHub Raw 直链安装](https://raw.githubusercontent.com/Noctyn/x-native-translator/main/x-native-translator.user.js)

---

## 配置说明

点击脚本管理器扩展菜单中的「X 翻译设置」，或使用快捷键 `Alt + Shift + T` 打开配置面板：

- **目标语言**：默认跟随 X 网页界面语言，支持手动锁定指定语种（简体中文、繁体中文、英语、日语等）。
- **触发条件**：配置悬停触发延迟、修饰键组合，以及自动翻译的作用范围（全局时间线 / 仅详情页）。
- **显示与性能**：调整默认视图模式、译文卡片外观风格、过渡动画档位及管理本地缓存。

### 关于「统一接管官方原生翻译样式」（实验性）

该选项默认处于关闭状态，主要基于以下两项网页端机制限制：

1. **引用帖单向替换限制**：在引用推文中，X 官方会将非目标语言原文直接替换为译文，且不提供还原按钮。强行接管后无法从 DOM 中提取外语原文，会导致双语对照模式下缺失原文内容。
2. **虚拟列表滚动性能**：X 时间线采用高频重绘的虚拟滚动列表。若全局接管原生翻译，短时间内批量重写 DOM 并改变容器高度，在部分低性能设备或快速返回顶部时可能引发轻微的滚动跳动。

> **建议**：日常使用保持默认关闭即可获得稳定的悬停与自动翻译体验；仅在需要统一隐藏官方原生翻译条样式时按需开启。

---

## 许可证

[MIT](LICENSE)
