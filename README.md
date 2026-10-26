# x-native-translator

基于 Tampermonkey 的 Twitter/X 网页端增强翻译脚本。直接复用官方网页端 Grok / 原生翻译接口，无需配置第三方 API Key 或自建代理。

## 安装

使用前需安装 [Tampermonkey](https://www.tampermonkey.net/) 或 Violentmonkey 扩展：

- **[Greasy Fork 安装](https://greasyfork.org/zh-CN/scripts/602228)**（推荐）
- **[GitHub 直接安装](https://raw.githubusercontent.com/Noctyn/x-native-translator/main/x-native-translator.user.js)**

## 主要功能

- **免 API Key**：直接复用 X 网页端当前登录会话调用官方接口，开箱即用。
- **触发灵活**：
  - **悬停翻译**：鼠标停留在推文上触发（可自定义延迟时间，支持搭配 `Alt` / `Ctrl` / `Shift` 修饰键防误触）。
  - **自动翻译**：滚动时间线时自动翻译可视区域内的推文（支持限制仅在帖子详情页启用）。
- **视图切换**：点击卡片可随时在「译文」、「双语对照」、「原文」之间无缝切换。
- **三款外观**：色条引述（默认）、轻盈卡片、极简竖线。
- **完整场景覆盖**：
  - 主推文、长推文（支持翻译前自动展开）、引用推文。
  - 个人主页简介（Bio）与鼠标悬浮名片（HoverCard）翻译。
  - 可选接管官方自带的「显示翻译」按钮样式。
- **缓存与性能**：
  - 内置本地译文缓存（支持持久化存储，页面刷新无需重复请求）。
  - 动画档位分「无 / 中等 / 全」三档，适应不同配置设备。

## 界面预览

### 色条引述（默认）
![色条引述](assets/style-quote.png)

### 轻盈卡片
![轻盈卡片](assets/style-card.png)

### 极简竖线
![极简竖线](assets/style-minimal.png)

## 使用与设置

在油猴扩展菜单中点击「X 翻译设置」即可调出配置面板：
- 目标语言：默认跟随 X 网页界面语言，也可锁定指定语言（简中、繁中、英文、日文等）。
- 触发方式：调整悬停延迟、修改修饰键。
- 显示模式：默认显示形式（直接替换/双语对照）、外观风格、动画档位。
- 自动翻译范围与长推文自动展开开关。

## 许可证

[MIT](LICENSE)
