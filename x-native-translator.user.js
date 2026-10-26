// ==UserScript==
// @name         Twitter/X 原生翻译 (悬停 / 自动 Grok AI 翻译)
// @namespace    https://github.com/Noctyn/x-native-translator
// @homepageURL  https://github.com/Noctyn/x-native-translator
// @supportURL   https://github.com/Noctyn/x-native-translator/issues
// @updateURL    https://raw.githubusercontent.com/Noctyn/x-native-translator/main/x-native-translator.user.js
// @downloadURL  https://raw.githubusercontent.com/Noctyn/x-native-translator/main/x-native-translator.user.js
// @version      3.4.4
// @description  悬停推文即刻调用 X 官方 Grok AI 翻译，并支持可选「自动翻译」；默认双语对照、极简竖线、全动画，零第三方 API Key，超快极简顺滑
// @author       Noctyn
// @license      MIT
// @match        https://x.com/*
// @match        https://twitter.com/*
// @icon         https://x.com/favicon.ico
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = (typeof GM_info !== 'undefined' && GM_info?.script?.version) || '3.4.3';
    const rootEl = document.documentElement;
    // 防止同时安装多个副本导致重复挂载
    if (rootEl.hasAttribute('data-xt-loaded')) return;
    rootEl.setAttribute('data-xt-loaded', VERSION);

    const TEXT_SEL = '[data-testid="tweetText"]';
    const BIO_SEL = '[data-testid="UserDescription"]';
    const HOVER_SEL = '[data-testid*="overCard"]';
    const CELL_SEL = '[data-testid="UserCell"]';
    const OWN_SEL = '.xt-box, .xt-overlay, .xt-toast-host, .xt-expand-btn';
    const EASE = 'cubic-bezier(.22, 1, .36, 1)';

    /* =====================================================================
     * 1. 配置与持久化
     * ===================================================================== */
    const CFG_KEY = 'xt_config_v2'; // 沿用旧键名，升级后保留用户已有设置
    const CACHE_KEY = 'xt_cache_v1'; // 译文缓存 (可选持久化)
    const QID_KEY = 'xt_qid_v1';     // GraphQL 操作 ID 缓存

    const MODES = ['replace', 'bilingual', 'original'];
    const MODE_TO_VIEW = { replace: 'translation', bilingual: 'bilingual', original: 'original' };
    const VIEW_TO_MODE = { translation: 'replace', bilingual: 'bilingual', original: 'original' };
    const MOTION_LEVELS = ['off', 'medium', 'full'];

    const DEFAULTS = Object.freeze({
        style: 'minimal',              // 'quote' 色条引述 | 'card' 轻盈卡片 | 'minimal' 极简竖线
        mode: 'bilingual',             // 推文显示方式：'replace' 译文 | 'bilingual' 对照 | 'original' 原文
        bioMode: 'bilingual',          // 主页简介显示
        hoverCardMode: 'bilingual',    // 悬浮名片显示
        delay: 200,                    // 悬停触发延迟 (ms)
        targetLang: 'None',            // 'None' = 跟随 X 界面语言
        triggerKey: 'none',            // 'none' 直接悬停 | 'alt' | 'ctrl' | 'shift'
        skipSame: true,                // 跳过已是目标语言的推文
        preferNative: true,            // 优先触发推特自带的「显示翻译」按钮 (接管开启时无效)
        takeoverNative: false,         // 统一接管官方原生翻译样式 (实验性，默认关闭以保证极致顺滑)
        autoExpand: true,              // 手动翻译前自动展开长推文
        translateProfileBio: true,     // 自动翻译个人资料主页简介
        translateHoverCard: true,      // 自动翻译悬浮名片 (HoverCard) 弹窗
        autoTranslate: false,          // 自动翻译：滚动浏览时自动翻译视野内的帖子
        autoScope: 'all',              // 'all' 时间线与详情页 | 'detail' 仅帖子详情页
        persistCache: true,            // 持久化译文缓存，刷新页面后无需重新请求
        motion: 'full',                // 动效档位：'off' 无动画 | 'medium' 中等 | 'full' 全动画
    });
    const BOOL_KEYS = [
        'skipSame', 'preferNative', 'takeoverNative', 'autoExpand', 'translateProfileBio',
        'translateHoverCard', 'autoTranslate', 'persistCache',
    ];

    const STYLE_OPTIONS = [
        ['quote', '色条引述'],
        ['card', '轻盈卡片'],
        ['minimal', '极简竖线'],
    ];
    const MODE_OPTIONS = [
        ['replace', '译文'],
        ['bilingual', '对照'],
        ['original', '原文'],
    ];
    const MOTION_OPTIONS = [
        ['off', '无动画'],
        ['medium', '中等'],
        ['full', '全动画'],
    ];
    const MOTION_LABELS = { off: '无动画', medium: '中等动画', full: '全动画' };
    const LANG_OPTIONS = [
        ['None', '跟随 X 界面语言'],
        ['zh', '简体中文'],
        ['zh-Hant', '繁體中文'],
        ['en', 'English'],
        ['ja', '日本語'],
        ['ko', '한국어'],
        ['es', 'Español'],
        ['fr', 'Français'],
        ['de', 'Deutsch'],
        ['ru', 'Русский'],
    ];
    const TRIGGER_OPTIONS = [
        ['none', '鼠标直接悬停'],
        ['alt', '按住 Alt + 悬停'],
        ['ctrl', '按住 Ctrl + 悬停'],
        ['shift', '按住 Shift + 悬停'],
    ];
    const AUTO_SCOPE_OPTIONS = [
        ['all', '时间线与详情页'],
        ['detail', '仅帖子详情页'],
    ];

    function readStore(key, fallback) {
        try {
            if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
        } catch (_) { /* ignore */ }
        try {
            const v = localStorage.getItem(key);
            return v !== null ? JSON.parse(v) : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function writeStore(key, value) {
        try {
            if (typeof GM_setValue === 'function') { GM_setValue(key, value); return; }
        } catch (_) { /* ignore */ }
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* ignore */ }
    }

    const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

    // 兼容旧版布尔开关：true → 全动画，false → 无动画
    function normalizeMotion(v, fallback) {
        if (v === true) return 'full';
        if (v === false) return 'off';
        return oneOf(v, MOTION_LEVELS, fallback);
    }

    function sanitize(input) {
        // 先剔除 undefined / null，避免覆盖默认值 (旧版本的开关键缺失时不应被当成 false)
        const raw = {};
        if (input && typeof input === 'object') {
            for (const [k, v] of Object.entries(input)) if (v !== undefined && v !== null) raw[k] = v;
        }
        const c = { ...DEFAULTS, ...raw };
        c.style = oneOf(c.style, STYLE_OPTIONS.map((o) => o[0]), DEFAULTS.style);
        c.mode = oneOf(c.mode, MODES, DEFAULTS.mode);
        c.bioMode = oneOf(raw.bioMode, MODES, c.mode);
        c.hoverCardMode = oneOf(raw.hoverCardMode, MODES, c.mode);
        const d = Number(c.delay);
        c.delay = Number.isFinite(d) ? Math.min(1000, Math.max(0, Math.round(d))) : DEFAULTS.delay;
        c.targetLang = oneOf(c.targetLang, LANG_OPTIONS.map((o) => o[0]), 'None');
        c.triggerKey = oneOf(c.triggerKey, TRIGGER_OPTIONS.map((o) => o[0]), 'none');
        c.autoScope = oneOf(c.autoScope, AUTO_SCOPE_OPTIONS.map((o) => o[0]), 'all');
        c.motion = normalizeMotion(c.motion, DEFAULTS.motion);
        // 兼容旧版单一「翻译简介」开关
        if (raw.translateBio !== undefined && raw.translateProfileBio === undefined && raw.translateHoverCard === undefined) {
            c.translateProfileBio = !!raw.translateBio;
            c.translateHoverCard = !!raw.translateBio;
        }
        for (const k of BOOL_KEYS) c[k] = !!c[k];
        return c;
    }

    function loadConfig() {
        const saved = readStore(CFG_KEY, null);
        if (saved && typeof saved === 'object') return sanitize(saved);
        return sanitize({
            mode: readStore('xt_display_mode', undefined),
            delay: readStore('xt_hover_delay', undefined),
            targetLang: readStore('xt_target_lang', undefined),
        });
    }

    const config = loadConfig();
    const saveConfig = () => writeStore(CFG_KEY, config);

    /* =====================================================================
     * 2. 轻量 DOM / 图标工具 (兼容 Trusted Types，零 innerHTML)
     * ===================================================================== */
    const stopEvt = (e) => e.stopPropagation();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const debounce = (fn, ms, maxWait) => {
        let t = 0;
        let lastCall = 0;
        return (...args) => {
            const now = Date.now();
            if (!lastCall) lastCall = now;
            clearTimeout(t);
            if (maxWait && now - lastCall >= maxWait) {
                lastCall = now;
                fn(...args);
            } else {
                t = setTimeout(() => {
                    lastCall = 0;
                    fn(...args);
                }, ms);
            }
        };
    };
    // 输入框 / 编辑器内的按键不应触发翻译 (例如按住 Shift 打大写字母)
    const isEditable = (t) => !!t && (t.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

    function h(tag, props, ...children) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(props || {})) {
            if (v == null || v === false) continue;
            if (/^on[A-Z]/.test(k)) el.addEventListener(k.slice(2).toLowerCase(), v);
            else if (k === 'class') el.className = v;
            else if (k === 'text') el.textContent = v;
            else el.setAttribute(k, v === true ? '' : v);
        }
        for (const c of children.flat(Infinity)) {
            if (c == null || c === false) continue;
            el.append(typeof c === 'object' && c.nodeType ? c : String(c));
        }
        return el;
    }

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const GROK_OFFICIAL_PATH = 'M12.745 20.54l10.97-8.19c.539-.4 1.307-.244 1.564.38 1.349 3.288.746 7.241-1.938 9.955-2.683 2.714-6.417 3.31-9.83 1.954l-3.728 1.745c5.347 3.697 11.84 2.782 15.898-1.324 3.219-3.255 4.216-7.692 3.284-11.693l.008.009c-1.351-5.878.332-8.227 3.782-13.031L33 0l-4.54 4.59v-.014L12.743 20.544m-2.263 1.987c-3.837-3.707-3.175-9.446.1-12.755 2.42-2.449 6.388-3.448 9.852-1.979l3.72-1.737c-.67-.49-1.53-1.017-2.515-1.387-4.455-1.854-9.789-.931-13.41 2.728-3.483 3.523-4.579 8.94-2.697 13.561 1.405 3.454-.899 5.898-3.22 8.364C1.49 30.2.666 31.074 0 32l10.478-9.466';

    const ICONS = {
        grok: {
            viewBox: '0 0 33 32',
            filled: true,
            nodes: [['path', { d: GROK_OFFICIAL_PATH }]],
        },
        translate: {
            nodes: [
                ['path', { d: 'm5 8 6 6' }],
                ['path', { d: 'm4 14 6-6 2-3' }],
                ['path', { d: 'M2 5h12' }],
                ['path', { d: 'M7 2h1' }],
                ['path', { d: 'm22 22-5-10-5 10' }],
                ['path', { d: 'M14 18h6' }],
            ],
        },
        copy: {
            nodes: [
                ['rect', { width: 14, height: 14, x: 8, y: 8, rx: 2, ry: 2 }],
                ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
            ],
        },
        check: { nodes: [['path', { d: 'M20 6 9 17l-5-5' }]] },
        refresh: {
            nodes: [
                ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }],
                ['path', { d: 'M21 3v5h-5' }],
                ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }],
                ['path', { d: 'M8 16H3v5' }],
            ],
        },
        settings: {
            nodes: [
                ['circle', { cx: 12, cy: 12, r: 3 }],
                ['path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1.02 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z' }],
            ],
        },
        close: { nodes: [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]] },
        alert: {
            nodes: [
                ['circle', { cx: 12, cy: 12, r: 10 }],
                ['line', { x1: 12, x2: 12, y1: 8, y2: 12 }],
                ['line', { x1: 12, x2: 12.01, y1: 16, y2: 16 }],
            ],
        },
        zap: { nodes: [['polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' }]] },
        pause: {
            nodes: [
                ['rect', { x: 6, y: 4, width: 4, height: 16, rx: 1 }],
                ['rect', { x: 14, y: 4, width: 4, height: 16, rx: 1 }],
            ],
        },
    };

    function icon(name, size = 14) {
        const def = ICONS[name] || ICONS.translate;
        const svg = document.createElementNS(SVG_NS, 'svg');
        const attrs = def.filled
            ? {
                viewBox: def.viewBox || '0 0 24 24',
                width: size, height: size,
                fill: 'currentColor', 'aria-hidden': 'true', class: 'xt-icon',
            }
            : {
                viewBox: def.viewBox || '0 0 24 24',
                width: size, height: size,
                fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9,
                'stroke-linecap': 'round', 'stroke-linejoin': 'round',
                'aria-hidden': 'true', class: 'xt-icon',
            };
        for (const k in attrs) svg.setAttribute(k, attrs[k]);
        for (const [tag, a] of def.nodes) {
            const n = document.createElementNS(SVG_NS, tag);
            for (const k in a) n.setAttribute(k, a[k]);
            svg.appendChild(n);
        }
        return svg;
    }

    let cookieMap = null;
    let cookieExpires = 0;
    function getCookie(name) {
        const now = Date.now();
        if (!cookieMap || now > cookieExpires) {
            cookieMap = new Map();
            cookieExpires = now + 1000;
            const str = document.cookie || '';
            const pairs = str.split(';');
            for (let i = 0; i < pairs.length; i++) {
                const eq = pairs[i].indexOf('=');
                if (eq > 0) {
                    const k = pairs[i].slice(0, eq).trim();
                    const v = pairs[i].slice(eq + 1).trim();
                    cookieMap.set(k, decodeURIComponent(v));
                }
            }
        }
        return cookieMap.get(name) || '';
    }

    /* =====================================================================
     * 3. 主题 / 强调色 / 动效档位
     * ===================================================================== */
    let lastAccent = '29, 155, 240';
    let lastThemeAt = 0;

    const reducedMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    // 当前生效的动效档位：系统开启「减少动态效果」时，一律强制为「无动画」
    const motionLevel = () => (reducedMQ.matches ? 'off' : config.motion);
    const motionOn = () => motionLevel() !== 'off';
    const motionFull = () => motionLevel() === 'full';

    function parseRGB(str) {
        const m = (str || '').match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?/);
        if (!m) return null;
        let a = 1;
        if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        return { r: +m[1], g: +m[2], b: +m[3], a };
    }

    // 过滤纯黑/纯白/纯灰，仅接受有色相的 X 强调色（蓝/黄/粉/紫/橙/绿）
    function isVividAccent(c) {
        return c && c.a > 0.65 && (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) >= 40);
    }

    function detectAccent() {
        const bgSels = [
            '[data-testid="tweetButtonInline"]',
            '[data-testid="tweetButton"]',
            '[role="tablist"] [role="tab"][aria-selected="true"] div',
            '[data-testid="SideNav_NewTweet_Button"]',
        ];
        for (const s of bgSels) {
            for (const el of document.querySelectorAll(s)) {
                const c = parseRGB(getComputedStyle(el).backgroundColor);
                if (isVividAccent(c)) {
                    lastAccent = `${c.r}, ${c.g}, ${c.b}`;
                    return lastAccent;
                }
            }
        }
        const linkEl = document.querySelector(`${TEXT_SEL} a[href^="/"]`);
        if (linkEl) {
            const c = parseRGB(getComputedStyle(linkEl).color);
            if (isVividAccent(c)) {
                lastAccent = `${c.r}, ${c.g}, ${c.b}`;
                return lastAccent;
            }
        }
        return lastAccent;
    }

    // 仅同步由配置决定的根节点标记 (开销极低，配置变更后即可调用)
    function syncRootAttrs() {
        const set = (k, v) => { if (rootEl.dataset[k] !== v) rootEl.dataset[k] = v; };
        set('xtStyle', config.style);
        set('xtMotion', motionLevel());
        set('xtTakeover', config.takeoverNative ? 'on' : 'off');
    }

    function refreshTheme(force = true) {
        if (!document.body) return;
        const now = Date.now();
        if (!force && now - lastThemeAt < 1500) return; // 自动翻译时避免频繁重算
        lastThemeAt = now;

        const bg = parseRGB(getComputedStyle(document.body).backgroundColor);
        let theme;
        if (bg && bg.a > 0) {
            const sum = bg.r + bg.g + bg.b;
            theme = sum > 380 ? 'light' : (sum < 24 ? 'dark' : 'dim');
        } else {
            theme = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        if (rootEl.dataset.xtTheme !== theme) rootEl.dataset.xtTheme = theme;
        syncRootAttrs();
        const accent = detectAccent();
        if (rootEl.style.getPropertyValue('--xt-accent-rgb') !== accent) {
            rootEl.style.setProperty('--xt-accent-rgb', accent);
        }
    }

    function observeTheme() {
        // 尾部防抖：X 切换主题时 body 的 style / class 会连续变化，合并为一次重算且保证拿到最终状态
        const run = debounce(() => requestAnimationFrame(() => refreshTheme()), 120);
        new MutationObserver(run).observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
        try { reducedMQ.addEventListener?.('change', () => refreshTheme()); } catch (_) { /* ignore */ }
    }

    /* =====================================================================
     * 4. 样式系统 (原生质感 + 清晰区分度 + 三档动效)
     *    性能原则：
     *    - 动画只动 transform / opacity (合成层)，避免动 width / height / padding / background-position
     *    - 中等档：只保留透明度与轻微位移，不做布局动画、不做背景模糊、无无限循环的多元素动画
     *    - 全动画档：保留弹性、流光、展开收起等完整效果，但流光改走 transform，模糊仅此档启用
     * ===================================================================== */
    const STYLE_ID = 'x-native-translator-style';
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
:root {
    --xt-accent-rgb: 29, 155, 240;
    --xt-fg-rgb: 15, 20, 25;
    --xt-muted-rgb: 83, 100, 113;
    --xt-border-rgb: 239, 243, 244;
    --xt-line-rgb: 207, 217, 222;
    --xt-surface-rgb: 255, 255, 255;
    --xt-sub-surface-rgb: 247, 249, 249;
    --xt-danger-rgb: 244, 33, 46;
    --xt-success-rgb: 0, 186, 124;
    --xt-wash-a: .08;
    --xt-wash-b: .025;
    --xt-backdrop: rgba(0, 0, 0, .4);
    --xt-dialog-shadow: rgba(101, 119, 134, .2) 0px 0px 15px, rgba(101, 119, 134, .15) 0px 0px 3px 1px;
    --xt-ease: cubic-bezier(.22, 1, .36, 1);
    --xt-spring: cubic-bezier(.34, 1.56, .64, 1);
}
:root[data-xt-theme="dim"] {
    --xt-fg-rgb: 247, 249, 249;
    --xt-muted-rgb: 139, 152, 165;
    --xt-border-rgb: 56, 68, 77;
    --xt-line-rgb: 56, 68, 77;
    --xt-surface-rgb: 21, 32, 43;
    --xt-sub-surface-rgb: 30, 39, 50;
    --xt-wash-a: .13;
    --xt-wash-b: .035;
    --xt-backdrop: rgba(91, 112, 131, .4);
    --xt-dialog-shadow: rgba(136, 153, 166, .2) 0px 0px 15px, rgba(136, 153, 166, .15) 0px 0px 3px 1px;
}
:root[data-xt-theme="dark"] {
    --xt-fg-rgb: 231, 233, 234;
    --xt-muted-rgb: 113, 118, 123;
    --xt-border-rgb: 47, 51, 54;
    --xt-line-rgb: 47, 51, 54;
    --xt-surface-rgb: 0, 0, 0;
    --xt-sub-surface-rgb: 22, 24, 28;
    --xt-wash-a: .15;
    --xt-wash-b: .04;
    --xt-backdrop: rgba(91, 112, 131, .4);
    --xt-dialog-shadow: rgba(255, 255, 255, .2) 0px 0px 15px, rgba(255, 255, 255, .15) 0px 0px 3px 1px;
}

/* 替换模式下隐藏原推文 */
${TEXT_SEL}[data-xt-view="translation"],
${BIO_SEL}[data-xt-view="translation"],
${HOVER_SEL} div[data-xt-view="translation"],
article:has(${TEXT_SEL}[data-xt-view="translation"]) [data-testid="tweet-text-show-more-link"],
article:has(${TEXT_SEL}[data-xt-view="translation"]) .xt-orig-expand-btn,
${TEXT_SEL}[data-xt-view="translation"] ~ .xt-orig-expand-btn,
.xt-preview-orig[data-xt-view="translation"] { display: none !important; }

/* 长推文 / 长译文过长时的折叠与平滑渐变遮罩 */
.xt-clamped {
    max-height: 220px !important;
    overflow: hidden !important;
    position: relative !important;
    -webkit-mask-image: linear-gradient(180deg, #000 65%, transparent 100%) !important;
    mask-image: linear-gradient(180deg, #000 65%, transparent 100%) !important;
}

.xt-expand-btn {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    font-size: 13px;
    line-height: 18px;
    font-weight: 600;
    color: rgb(var(--xt-accent-rgb));
    padding: 3px 10px;
    margin: 4px 0 6px;
    border-radius: 9999px;
    user-select: none;
    transition: background-color .15s ease, opacity .15s ease;
}
.xt-expand-btn:hover {
    background-color: rgba(var(--xt-accent-rgb), .12);
    text-decoration: underline;
}
/* 仅看原文时，译文的展开按钮不应继续露出 */
.xt-box[data-view="original"] .xt-trans-expand-btn { display: none; }

/* 接管官方原生翻译样式：仅在接管开启时隐藏官方栏位 (关闭接管即刻恢复) */
:root[data-xt-takeover="on"] [data-xt-native="hide"],
:root[data-xt-takeover="on"] button[data-testid="thumbsUpVoteButton"],
:root[data-xt-takeover="on"] button[data-testid="thumbsDownVoteButton"] { display: none !important; }
/* :has() 单独成规则，旧浏览器不支持时不会连带废掉上面的规则 */
:root[data-xt-takeover="on"] div:has(> button[data-testid="thumbsUpVoteButton"]),
:root[data-xt-takeover="on"] div:has(> button[data-testid="thumbsDownVoteButton"]) { display: none !important; }

/* ---------- 译文主容器 ---------- */
.xt-box {
    position: relative;
    isolation: isolate;
    box-sizing: border-box;
    margin: 8px 0 4px;
    border: 1px solid transparent;
    background-color: transparent;
    /* 布局隔离：时间线上成百上千个容器，内部变化不再牵连整页重排 */
    contain: layout style;
    color: var(--xt-text-color, rgb(var(--xt-fg-rgb)));
    font-family: var(--xt-ff, TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif);
    text-align: left;
    transition: background-color .35s var(--xt-ease), border-color .35s var(--xt-ease),
        padding .35s var(--xt-ease), margin .35s var(--xt-ease), opacity .3s ease;
}
.xt-box[data-view="translation"] { margin-top: 2px; }

/* 左侧强调色条 (可生长动画) */
.xt-box::before {
    content: "";
    position: absolute;
    left: -1px; top: -1px; bottom: -1px;
    width: 3px;
    border-radius: 4px 0 0 4px;
    background: rgb(var(--xt-accent-rgb));
    transform-origin: top center;
    pointer-events: none;
    transition: opacity .3s ease, width .3s var(--xt-ease);
}
/* 柔和渐变底衬 */
.xt-box::after {
    content: "";
    position: absolute;
    inset: -1px;
    z-index: -1;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(var(--xt-accent-rgb), var(--xt-wash-a)) 0%, rgba(var(--xt-fg-rgb), var(--xt-wash-b)) 100%);
    opacity: 0;
    pointer-events: none;
    transition: opacity .35s ease;
}

/* 外观 1 (默认): 色条引述 */
:root:not([data-xt-style]) .xt-box,
:root[data-xt-style="quote"] .xt-box {
    padding: 7px 12px 8px 14px;
    border-radius: 4px 12px 12px 4px;
}
:root:not([data-xt-style]) .xt-box::after,
:root[data-xt-style="quote"] .xt-box::after { opacity: 1; }
:root[data-xt-style="quote"] .xt-box:hover::before { width: 4px; }

/* 外观 2: 轻盈卡片 */
:root[data-xt-style="card"] .xt-box {
    padding: 8px 12px 9px 14px;
    border-radius: 12px;
    border-color: rgb(var(--xt-border-rgb));
    background-color: rgb(var(--xt-sub-surface-rgb));
}
:root[data-xt-style="card"] .xt-box::before { opacity: 0; }
:root[data-xt-style="card"] .xt-box:hover { border-color: rgba(var(--xt-accent-rgb), .38); }

/* 外观 3: 极简竖线 */
:root[data-xt-style="minimal"] .xt-box {
    padding: 2px 2px 2px 12px;
    border-radius: 2px;
}
:root[data-xt-style="minimal"] .xt-box::before { width: 2.5px; opacity: .75; }

/* 状态：整个容器改写强调色即可联动色条 / 底衬 / 图标 */
.xt-box[data-state="error"] { --xt-accent-rgb: var(--xt-danger-rgb); animation: xt-shake .42s ease; }
.xt-box[data-state="same"] { --xt-accent-rgb: var(--xt-success-rgb); }
:root[data-xt-style="card"] .xt-box[data-state="error"] { border-color: rgba(var(--xt-danger-rgb), .45); }
.xt-box[data-state="loading"]::before { animation: xt-bar-pulse 1.4s ease-in-out infinite; }
.xt-box[data-state="done"]::before { animation: xt-bar-grow .6s var(--xt-ease) both; }

/* 折叠查看原文态：收起正文，仅保留控制行 */
.xt-box[data-view="original"] {
    padding-top: 4px !important;
    padding-bottom: 4px !important;
}

/* ---------- 顶栏 ---------- */
.xt-head {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    justify-content: space-between;
    gap: 4px 6px;
    min-height: 24px;
    font-size: 12px;
    line-height: 16px;
    color: rgb(var(--xt-muted-rgb));
    user-select: none;
}
.xt-brand {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: 0 1 auto;
    min-width: 0;
    white-space: nowrap;
    color: rgb(var(--xt-muted-rgb));
}
.xt-brand .xt-icon { flex: none; color: rgb(var(--xt-accent-rgb)); }
.xt-brand-name {
    font-weight: 700;
    letter-spacing: .01em;
    white-space: nowrap;
    color: rgba(var(--xt-fg-rgb), .86);
}
.xt-lang {
    display: inline-flex;
    align-items: center;
    height: 17px;
    padding: 0 7px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: rgb(var(--xt-accent-rgb));
    background: rgba(var(--xt-accent-rgb), .11);
}
.xt-box[data-state="loading"] .xt-brand .xt-icon { animation: xt-pulse 1.1s ease-in-out infinite; }
.xt-box[data-state="error"] .xt-brand,
.xt-box[data-state="error"] .xt-brand .xt-icon { color: rgb(var(--xt-danger-rgb)); }
.xt-box[data-state="same"] .xt-brand .xt-icon path { animation: xt-draw .55s .1s var(--xt-ease) both; }
.xt-grow { flex: 1 1 auto; }

/* 加载中三点跳动 + 骨架屏 */
.xt-dots { display: inline-flex; gap: 3px; margin-left: 1px; }
.xt-dots i {
    width: 3.5px; height: 3.5px;
    border-radius: 50%;
    background: rgb(var(--xt-accent-rgb));
    animation: xt-dot 1.1s ease-in-out infinite;
}
.xt-dots i:nth-child(2) { animation-delay: .15s; }
.xt-dots i:nth-child(3) { animation-delay: .3s; }

.xt-skel { display: grid; gap: 7px; margin: 8px 0 3px; }
/* 流光改为伪元素 transform 位移 (走合成层)，不再逐帧重绘 background-position */
.xt-skel i {
    position: relative;
    display: block;
    height: 10px;
    width: 100%;
    overflow: hidden;
    border-radius: 5px;
    background: rgba(var(--xt-fg-rgb), .08);
}
.xt-skel i::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(var(--xt-fg-rgb), .13) 50%, transparent 100%);
    transform: translateX(-100%);
    animation: xt-shimmer 1.4s ease-in-out infinite;
}
.xt-skel i:nth-child(2n):not(:last-child) { width: 90%; }
.xt-skel i:last-child:not(:first-child) { width: 56%; }

/* ---------- 工具按钮：悬浮时依次弹出 ---------- */
.xt-tools {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    pointer-events: none;
}
.xt-box:hover .xt-tools,
.xt-box:focus-within .xt-tools { pointer-events: auto; }

.xt-ibtn {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 9999px;
    cursor: pointer;
    color: rgb(var(--xt-muted-rgb));
}
.xt-tools .xt-ibtn {
    opacity: 0;
    transform: translateX(6px) scale(.85);
    transition: opacity .22s ease, transform .35s var(--xt-spring), background-color .15s ease, color .15s ease;
}
.xt-box:hover .xt-tools .xt-ibtn,
.xt-box:focus-within .xt-tools .xt-ibtn { opacity: 1; transform: none; }
.xt-box:hover .xt-tools .xt-ibtn:nth-child(2),
.xt-box:focus-within .xt-tools .xt-ibtn:nth-child(2) { transition-delay: .04s, .04s, 0s, 0s; }
.xt-box:hover .xt-tools .xt-ibtn:nth-child(3),
.xt-box:focus-within .xt-tools .xt-ibtn:nth-child(3) { transition-delay: .08s, .08s, 0s, 0s; }

@media (hover: none) {
    .xt-tools { pointer-events: auto; }
    .xt-tools .xt-ibtn { opacity: .85; transform: none; }
}
.xt-ibtn:hover { background-color: rgba(var(--xt-accent-rgb), .14); color: rgb(var(--xt-accent-rgb)); }
.xt-ibtn:active { transform: scale(.9); }
.xt-ibtn .xt-icon { transition: transform .5s var(--xt-spring); }
.xt-ibtn[data-act="refresh"]:hover .xt-icon { transform: rotate(180deg); }
.xt-ibtn[data-act="cfg"]:hover .xt-icon { transform: rotate(60deg); }
.xt-ibtn.xt-ok { color: rgb(var(--xt-success-rgb)) !important; animation: xt-pop .45s var(--xt-spring); }

/* 译文 / 对照 / 原文 —— 带滑动指示器的分段切换 */
.xt-tabs {
    position: relative;
    display: inline-grid;
    grid-template-columns: repeat(3, 36px);
    padding: 2px;
    border-radius: 9999px;
    background: rgba(var(--xt-fg-rgb), .06);
    flex: 0 0 auto;
    margin-left: auto;
}
.xt-tab-ind {
    position: absolute;
    top: 2px; bottom: 2px; left: 2px;
    width: 36px;
    border-radius: 9999px;
    background: rgba(var(--xt-accent-rgb), .17);
    transform: translateX(calc(var(--xt-i, 0) * 36px));
    transition: transform .42s var(--xt-spring);
}
.xt-tab {
    all: unset;
    position: relative;
    z-index: 1;
    box-sizing: border-box;
    cursor: pointer;
    text-align: center;
    padding: 1px 0;
    border-radius: 9999px;
    font-size: 12px;
    line-height: 17px;
    font-weight: 600;
    color: rgb(var(--xt-muted-rgb));
    transition: color .2s ease;
}
.xt-tab:hover { color: rgb(var(--xt-fg-rgb)); }
.xt-tab[aria-pressed="true"] { color: rgb(var(--xt-accent-rgb)); font-weight: 700; }

/* 悬浮名片弹窗空间较窄，自动精简布局保证 100% 同行单行排列 */
${HOVER_SEL} .xt-tools { display: none !important; }
${HOVER_SEL} .xt-tabs { grid-template-columns: repeat(3, 33px) !important; }
${HOVER_SEL} .xt-tab-ind { width: 33px !important; transform: translateX(calc(var(--xt-i, 0) * 33px)) !important; }

.xt-retry-link {
    all: unset;
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    padding: 1px 9px;
    border-radius: 9999px;
    color: rgb(var(--xt-accent-rgb));
    background: rgba(var(--xt-accent-rgb), .12);
    transition: background-color .15s ease, transform .2s var(--xt-spring);
}
.xt-retry-link:hover { background: rgba(var(--xt-accent-rgb), .22); }
.xt-retry-link:active { transform: scale(.94); }

/* ---------- 译文正文：网格行高平滑折叠 (仅全动画档；其余档位瞬间切换) ---------- */
.xt-body-wrap {
    display: grid;
    grid-template-rows: 1fr;
    margin-top: 4px;
    transition: grid-template-rows .38s var(--xt-ease), opacity .28s ease, margin .38s var(--xt-ease);
}
.xt-body-clip { min-height: 0; overflow: hidden; }
.xt-box[data-view="original"] .xt-body-wrap { grid-template-rows: 0fr; opacity: 0; margin-top: 0; }
.xt-box[data-view="original"] .xt-body-clip { visibility: hidden; transition: visibility 0s .38s; }
.xt-body {
    font-size: var(--xt-fs, 15px);
    line-height: 1.52;
    font-weight: var(--xt-fw, 400);
    color: var(--xt-text-color, rgb(var(--xt-fg-rgb)));
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    user-select: text;
    -webkit-user-select: text;
    cursor: auto;
    /* 仅用透明度 + 位移：去掉 blur 滤镜，长文本渲染时不再触发整块重绘 */
    animation: xt-text-in .5s var(--xt-ease) both;
}
.xt-entity { color: rgb(var(--xt-accent-rgb)); text-decoration: none; }
.xt-entity:hover { text-decoration: underline; }

/* ---------- Toast ---------- */
.xt-toast-host {
    position: fixed;
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%);
    z-index: 2147483001;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
}
@media (max-width: 700px) { .xt-toast-host { bottom: calc(76px + env(safe-area-inset-bottom, 0px)); } }
.xt-toast {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: min(92vw, 520px);
    padding: 10px 18px;
    border-radius: 9999px;
    background: rgb(var(--xt-accent-rgb));
    color: #fff;
    font: 700 14px/20px TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    box-shadow: 0 8px 28px rgba(0, 0, 0, .28), 0 0 0 1px rgba(255, 255, 255, .08) inset;
    animation: xt-toast-in .45s var(--xt-spring);
}
.xt-toast .xt-icon { flex: none; }
.xt-toast[data-kind="off"] { background: rgb(83, 100, 113); }
.xt-toast[data-kind="warn"] { background: rgb(var(--xt-danger-rgb)); }
.xt-toast.xt-out { animation: xt-toast-out .26s ease-in forwards; }

/* ---------- X 官方风格设置弹窗 ---------- */
.xt-overlay {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: var(--xt-backdrop);
    animation: xt-fade .22s ease-out;
}
/* 背景模糊对整页重绘开销很大，仅「全动画」档启用 */
:root[data-xt-motion="full"] .xt-overlay {
    -webkit-backdrop-filter: blur(3px);
    backdrop-filter: blur(3px);
}
.xt-overlay.xt-closing { animation: xt-fade-out .18s ease-in forwards; }

.xt-panel {
    box-sizing: border-box;
    width: min(520px, 100%);
    height: min(88vh, 700px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 16px;
    background: rgb(var(--xt-surface-rgb));
    color: rgb(var(--xt-fg-rgb));
    color-scheme: light;
    font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 15px;
    line-height: 20px;
    box-shadow: var(--xt-dialog-shadow);
    animation: xt-panel-in .42s var(--xt-spring);
}
.xt-overlay.xt-closing .xt-panel { animation: xt-panel-out .18s ease-in forwards; }
:root[data-xt-theme="dim"] .xt-panel,
:root[data-xt-theme="dark"] .xt-panel { color-scheme: dark; }
.xt-panel *, .xt-panel *::before, .xt-panel *::after { box-sizing: border-box; }

.xt-panel-head {
    display: flex;
    align-items: center;
    gap: 20px;
    height: 53px;
    padding: 0 16px 0 8px;
    flex: none;
}
.xt-close-btn {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 9999px;
    cursor: pointer;
    color: rgb(var(--xt-fg-rgb));
    transition: background-color .15s ease, transform .4s var(--xt-spring);
}
.xt-close-btn:hover { background-color: rgba(var(--xt-fg-rgb), .1); transform: rotate(90deg); }
.xt-panel-title { font-size: 20px; line-height: 24px; font-weight: 800; }

/* 与 X 原生一致的下划线式分页标签 */
.xt-ptabs {
    position: relative;
    z-index: 2;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    flex: none;
    border-bottom: 1px solid rgb(var(--xt-border-rgb));
    transition: box-shadow .25s ease;
}
/* 内容滚动后，标签栏下方出现一道柔和阴影，提示还有内容在下面 */
.xt-ptabs.xt-scrolled { box-shadow: 0 8px 14px -10px rgba(0, 0, 0, .4); }
.xt-ptab {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    text-align: center;
    padding: 14px 0 15px;
    font-size: 15px;
    line-height: 20px;
    font-weight: 500;
    color: rgb(var(--xt-muted-rgb));
    transition: background-color .15s ease, color .2s ease;
}
.xt-ptab:hover { background-color: rgba(var(--xt-fg-rgb), .06); }
.xt-ptab[aria-selected="true"] { color: rgb(var(--xt-fg-rgb)); font-weight: 700; }
.xt-ptab-ind {
    position: absolute;
    left: 0;
    bottom: -1px;
    width: calc(100% / var(--n, 3));
    transform: translateX(calc(var(--i, 0) * 100%));
    transition: transform .42s var(--xt-spring);
    pointer-events: none;
}
.xt-ptab-ind::after {
    content: "";
    display: block;
    width: 56px;
    max-width: 70%;
    height: 4px;
    margin: 0 auto;
    border-radius: 9999px;
    background: rgb(var(--xt-accent-rgb));
}

.xt-panel-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-bottom: 6px;
    scrollbar-width: thin;
    scrollbar-color: rgba(var(--xt-muted-rgb), .45) transparent;
}
.xt-page[hidden] { display: none; }
.xt-page > * {
    animation: xt-row-in .5s var(--xt-ease) both;
    animation-delay: calc(var(--xt-d, 0) * 28ms + 40ms);
}

.xt-sec {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px 4px;
    font-size: 13px;
    line-height: 16px;
    font-weight: 800;
    letter-spacing: .02em;
    color: rgb(var(--xt-fg-rgb));
}
.xt-sec::before {
    content: "";
    width: 6px; height: 6px;
    border-radius: 50%;
    background: rgb(var(--xt-accent-rgb));
}

/* 设置面板内的实时预览 */
.xt-preview {
    margin: 12px 16px 6px;
    padding: 10px 12px 12px;
    border-radius: 14px;
    border: 1px solid rgb(var(--xt-border-rgb));
    background: rgb(var(--xt-surface-rgb));
}
.xt-preview-label {
    margin-bottom: 6px;
    font-size: 11px;
    line-height: 14px;
    font-weight: 700;
    letter-spacing: .06em;
    color: rgb(var(--xt-muted-rgb));
}
.xt-preview-orig {
    font-size: 15px;
    line-height: 20px;
    color: rgb(var(--xt-fg-rgb));
}

.xt-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 11px 16px;
    transition: background-color .15s ease, opacity .25s ease;
}
.xt-row:hover { background-color: rgba(var(--xt-fg-rgb), .03); }
/* 置灰只用透明度：不再叠加 filter，避免整行额外的滤镜合成 */
.xt-row[data-disabled="true"] { opacity: .42; pointer-events: none; }
.xt-divider { height: 1px; background-color: rgb(var(--xt-border-rgb)); margin: 6px 0 2px; }
.xt-row-info { min-width: 0; flex: 1 1 auto; }
.xt-row-title { font-size: 15px; line-height: 20px; color: rgb(var(--xt-fg-rgb)); }
.xt-row-desc { font-size: 13px; line-height: 16px; color: rgb(var(--xt-muted-rgb)); margin-top: 2px; }

/* 快捷键速查 */
.xt-keys { display: grid; gap: 8px; padding: 6px 16px 10px; }
.xt-keys > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 14px;
    color: rgb(var(--xt-fg-rgb));
}
.xt-kbd {
    display: inline-block;
    min-width: 22px;
    padding: 0 6px;
    margin-left: 4px;
    border: 1px solid rgb(var(--xt-line-rgb));
    border-bottom-width: 2px;
    border-radius: 6px;
    background: rgb(var(--xt-sub-surface-rgb));
    color: rgb(var(--xt-fg-rgb));
    font: 600 12px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    text-align: center;
}

.xt-panel-foot {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 12px;
    padding: 12px 16px;
    border-top: 1px solid rgb(var(--xt-border-rgb));
    font-size: 13px;
    color: rgb(var(--xt-muted-rgb));
}
.xt-foot-actions { display: inline-flex; flex-wrap: wrap; gap: 8px; }

/* 带滑块的分段控件 */
.xt-seg {
    position: relative;
    display: inline-grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    flex: none;
    padding: 2px;
    border-radius: 9999px;
    border: 1px solid rgb(var(--xt-line-rgb));
}
.xt-seg-thumb {
    position: absolute;
    top: 2px; bottom: 2px; left: 2px;
    width: calc((100% - 4px) / var(--n, 2));
    border-radius: 9999px;
    background: rgb(var(--xt-accent-rgb));
    transform: translateX(calc(var(--i, 0) * 100%));
    transition: transform .42s var(--xt-spring);
}
.xt-seg button {
    all: unset;
    position: relative;
    z-index: 1;
    cursor: pointer;
    text-align: center;
    padding: 4px 10px;
    border-radius: 9999px;
    font-size: 13px;
    line-height: 16px;
    font-weight: 700;
    white-space: nowrap;
    color: rgb(var(--xt-muted-rgb));
    transition: color .25s ease;
}
.xt-seg button[aria-pressed="true"] { color: #fff; }

.xt-select {
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
    min-width: 148px;
    padding: 6px 28px 6px 12px;
    border: 1px solid rgb(var(--xt-line-rgb));
    border-radius: 8px;
    background: rgb(var(--xt-surface-rgb)) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371767b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 8px center;
    color: rgb(var(--xt-fg-rgb));
    font: inherit;
    font-size: 14px;
    transition: border-color .15s ease, box-shadow .15s ease;
}
.xt-select:hover { border-color: rgba(var(--xt-accent-rgb), .6); }
.xt-select:focus-visible { outline: 2px solid rgb(var(--xt-accent-rgb)); outline-offset: -1px; }

.xt-range-wrap { display: flex; align-items: center; gap: 8px; }
.xt-range { width: 110px; accent-color: rgb(var(--xt-accent-rgb)); cursor: pointer; }
.xt-range-val {
    min-width: 48px;
    text-align: right;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: rgb(var(--xt-muted-rgb));
}

.xt-switch {
    all: unset;
    box-sizing: border-box;
    position: relative;
    flex: none;
    width: 40px;
    height: 22px;
    border-radius: 9999px;
    cursor: pointer;
    background-color: rgba(var(--xt-muted-rgb), .5);
    transition: background-color .25s ease;
}
.xt-switch::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 9999px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, .3);
    transition: transform .35s var(--xt-spring), width .2s ease;
}
.xt-switch:active::after { width: 23px; }
.xt-switch[aria-checked="true"] { background-color: rgb(var(--xt-accent-rgb)); }
.xt-switch[aria-checked="true"]::after { transform: translateX(18px); }
.xt-switch[aria-checked="true"]:active::after { transform: translateX(13px); }

.xt-pill-btn {
    all: unset;
    cursor: pointer;
    padding: 5px 14px;
    border-radius: 9999px;
    border: 1px solid rgb(var(--xt-line-rgb));
    font-size: 13px;
    line-height: 16px;
    font-weight: 700;
    color: rgb(var(--xt-fg-rgb));
    transition: background-color .15s ease, transform .2s var(--xt-spring), color .15s ease, border-color .15s ease;
}
.xt-pill-btn:hover { background-color: rgba(var(--xt-fg-rgb), .08); }
.xt-pill-btn:active { transform: scale(.95); }
.xt-pill-btn[data-danger="true"] {
    color: rgb(var(--xt-danger-rgb));
    border-color: rgba(var(--xt-danger-rgb), .55);
}
.xt-pill-btn[data-danger="true"]:hover { background-color: rgba(var(--xt-danger-rgb), .1); }

.xt-tab:focus-visible, .xt-ibtn:focus-visible, .xt-close-btn:focus-visible, .xt-retry-link:focus-visible,
.xt-switch:focus-visible, .xt-pill-btn:focus-visible, .xt-seg button:focus-visible, .xt-ptab:focus-visible,
.xt-expand-btn:focus-visible {
    outline: 2px solid rgb(var(--xt-accent-rgb));
    outline-offset: 2px;
}
.xt-ptab:focus-visible { outline-offset: -3px; }

@media (max-width: 480px) { .xt-row { flex-wrap: wrap; } }

/* 窄屏：设置面板变为底部抽屉，拇指更好操作 */
@media (max-width: 520px) {
    .xt-overlay { align-items: flex-end; padding: 0; }
    .xt-panel {
        width: 100%;
        height: min(88vh, 720px);
        border-radius: 20px 20px 0 0;
        animation-name: xt-sheet-in;
        animation-timing-function: var(--xt-ease);
    }
    .xt-overlay.xt-closing .xt-panel { animation-name: xt-sheet-out; animation-timing-function: ease-in; }
    .xt-panel-foot { padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)); }
}

/* ---------- 关键帧 ---------- */
@keyframes xt-bar-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes xt-bar-pulse { 0%, 100% { opacity: .3; } 50% { opacity: 1; } }
@keyframes xt-shimmer { to { transform: translateX(100%); } }
@keyframes xt-soft-pulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
@keyframes xt-dot { 0%, 80%, 100% { transform: translateY(0); opacity: .35; } 40% { transform: translateY(-3px); opacity: 1; } }
@keyframes xt-text-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
@keyframes xt-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-4px); } 40% { transform: translateX(4px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(2px); } }
@keyframes xt-draw { from { stroke-dasharray: 24; stroke-dashoffset: 24; } to { stroke-dasharray: 24; stroke-dashoffset: 0; } }
@keyframes xt-pop { 0% { transform: scale(.6); } 60% { transform: scale(1.25); } 100% { transform: scale(1); } }
@keyframes xt-pulse { 0%, 100% { opacity: .4; } 50% { opacity: 1; } }
@keyframes xt-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes xt-fade-out { to { opacity: 0; } }
@keyframes xt-panel-in { from { opacity: 0; transform: translateY(16px) scale(.94); } to { opacity: 1; transform: none; } }
@keyframes xt-panel-out { to { opacity: 0; transform: translateY(8px) scale(.97); } }
@keyframes xt-sheet-in { from { transform: translateY(100%); } to { transform: none; } }
@keyframes xt-sheet-out { to { transform: translateY(100%); } }
@keyframes xt-row-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes xt-toast-in { from { opacity: 0; transform: translateY(18px) scale(.9); } to { opacity: 1; transform: none; } }
@keyframes xt-toast-out { to { opacity: 0; transform: translateY(10px) scale(.95); } }

/* ---------- 动效档位：中等 ----------
   保留：悬停变色、分段指示器滑动、面板 / Toast / 译文的淡入位移 (均为合成层动画)
   去掉：弹性过冲、骨架屏流光、三点跳动、色条脉冲 / 生长、抖动、描边、
         工具按钮依次弹出、图标旋转、行高 / 外边距展开收起、背景模糊、设置页逐行入场 */
:root[data-xt-motion="medium"] { --xt-spring: var(--xt-ease); }

:root[data-xt-motion="medium"] .xt-box { transition: background-color .2s ease, border-color .2s ease; }
:root[data-xt-motion="medium"] .xt-box::before { transition: opacity .2s ease; }
:root[data-xt-motion="medium"] .xt-box::after { transition: none; }
:root[data-xt-motion="medium"] .xt-box[data-state="error"],
:root[data-xt-motion="medium"] .xt-box[data-state="loading"]::before,
:root[data-xt-motion="medium"] .xt-box[data-state="done"]::before,
:root[data-xt-motion="medium"] .xt-box[data-state="same"] .xt-brand .xt-icon path { animation: none; }

:root[data-xt-motion="medium"] .xt-dots i { animation: none; opacity: .75; }
:root[data-xt-motion="medium"] .xt-skel i::after { display: none; }
:root[data-xt-motion="medium"] .xt-skel { animation: xt-soft-pulse 1.4s ease-in-out infinite; }

:root[data-xt-motion="medium"] .xt-body { animation: xt-fade .22s ease both; }
:root[data-xt-motion="medium"] .xt-body-wrap,
:root[data-xt-motion="medium"] .xt-box[data-view="original"] .xt-body-clip { transition: none; }

:root[data-xt-motion="medium"] .xt-tools .xt-ibtn {
    transform: none;
    transition: opacity .18s ease, background-color .15s ease, color .15s ease;
    transition-delay: 0s !important;
}
:root[data-xt-motion="medium"] .xt-ibtn .xt-icon { transition: none; transform: none !important; }
:root[data-xt-motion="medium"] .xt-ibtn.xt-ok { animation: none; }

:root[data-xt-motion="medium"] :is(.xt-tab-ind, .xt-seg-thumb, .xt-ptab-ind) { transition-duration: .26s; }
:root[data-xt-motion="medium"] .xt-close-btn:hover { transform: none; }
:root[data-xt-motion="medium"] .xt-switch::after { transition: transform .22s var(--xt-ease); }
:root[data-xt-motion="medium"] .xt-page > * { animation: none; }
:root[data-xt-motion="medium"] .xt-page { animation: xt-row-in .24s var(--xt-ease) both; }
:root[data-xt-motion="medium"] .xt-toast { animation: xt-fade .2s ease; }
:root[data-xt-motion="medium"] .xt-toast.xt-out { animation: xt-fade-out .2s ease-in forwards; }

/* ---------- 动效档位：无动画 / 系统「减少动态效果」 ---------- */
:root[data-xt-motion="off"] :is(.xt-box, .xt-overlay, .xt-toast-host, .xt-expand-btn),
:root[data-xt-motion="off"] :is(.xt-box, .xt-overlay, .xt-toast-host, .xt-expand-btn) *,
:root[data-xt-motion="off"] :is(.xt-box, .xt-overlay, .xt-toast-host, .xt-expand-btn)::before,
:root[data-xt-motion="off"] :is(.xt-box, .xt-overlay, .xt-toast-host, .xt-expand-btn)::after,
:root[data-xt-motion="off"] :is(.xt-box, .xt-overlay, .xt-toast-host, .xt-expand-btn) *::before,
:root[data-xt-motion="off"] :is(.xt-box, .xt-overlay, .xt-toast-host, .xt-expand-btn) *::after {
    animation: none !important;
    transition: none !important;
}
`;
        (document.head || document.documentElement).appendChild(style);
    }

    /* =====================================================================
     * 5. 动效辅助 (Web Animations API，随动效档位自动降级)
     *    全动画：高度 / 外边距展开收起 (布局动画，同时最多 MAX_LAYOUT_ANIMS 个，视野外直接跳过)
     *    中等：仅透明度淡入淡出 (合成层，几乎零开销)
     *    无动画：直接切换
     * ===================================================================== */
    const MAX_LAYOUT_ANIMS = 4;
    let layoutAnims = 0;

    // 视野外的容器没必要播放动画 (自动翻译滚动时尤其明显)
    const canAnimate = (box) => motionOn() && box.isConnected && typeof box.animate === 'function' && inViewport(box);
    const canLayoutAnimate = () => motionFull() && layoutAnims < MAX_LAYOUT_ANIMS;

    // 同一容器同一时刻只保留一个布局动画，避免连续触发时 overflow 状态错乱
    function runBoxAnim(box, keyframes, opts, onEnd) {
        box._anim?.cancel();
        box.style.overflow = 'hidden';
        const anim = box.animate(keyframes, opts);
        box._anim = anim;
        layoutAnims++;
        let ended = false;
        const end = () => {
            if (ended) return;
            ended = true;
            layoutAnims--;
            if (box._anim === anim) { box._anim = null; box.style.overflow = ''; }
            onEnd?.();
        };
        anim.onfinish = end;
        anim.oncancel = end;
        return anim;
    }

    // 轻量淡入淡出：只动 opacity
    function fadeBox(box, from, to, duration, onEnd) {
        const anim = box.animate([{ opacity: from }, { opacity: to }], {
            duration, easing: 'ease-out', fill: onEnd ? 'forwards' : 'none',
        });
        if (onEnd) {
            anim.onfinish = onEnd;
            anim.oncancel = onEnd;
        }
        return anim;
    }

    // 译文容器首次出现：全动画 = 高度 / 外边距 / 透明度同步展开；中等 = 淡入
    function animateIn(box) {
        if (!canAnimate(box)) return;
        if (!canLayoutAnimate()) { fadeBox(box, 0, 1, 200); return; }
        const cs = getComputedStyle(box);
        const full = {
            height: `${box.offsetHeight}px`, opacity: 1, transform: 'translateY(0)',
            marginTop: cs.marginTop, marginBottom: cs.marginBottom,
            paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom,
        };
        const zero = {
            height: '0px', opacity: 0, transform: 'translateY(-6px)',
            marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px',
        };
        runBoxAnim(box, [zero, full], { duration: 380, easing: EASE });
    }

    // 内容替换 (加载中 → 结果 / 错误)：全动画高度平滑过渡 (从当前可见高度出发，打断也不跳变)；中等 = 内容淡入
    function morph(box, mutate) {
        if (!canAnimate(box)) { mutate(); return; }
        if (!canLayoutAnimate()) {
            box._anim?.cancel();
            mutate();
            fadeBox(box, 0.35, 1, 180);
            return;
        }
        const from = box.offsetHeight;
        box._anim?.cancel();
        mutate();
        const to = box.offsetHeight;
        if (Math.abs(from - to) < 2) return;
        runBoxAnim(box, [{ height: `${from}px` }, { height: `${to}px` }], { duration: 320, easing: EASE });
    }

    function collapseAndRemove(box) {
        if (!box.isConnected) return;
        if (!canAnimate(box)) { box.remove(); return; }
        if (!canLayoutAnimate()) {
            box._anim?.cancel();
            fadeBox(box, 1, 0, 160, () => box.remove());
            return;
        }
        const cs = getComputedStyle(box);
        const start = {
            height: `${box.offsetHeight}px`, opacity: 1,
            marginTop: cs.marginTop, marginBottom: cs.marginBottom,
            paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom,
        };
        const end = {
            height: '0px', opacity: 0,
            marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px',
        };
        runBoxAnim(box, [start, end], { duration: 300, easing: EASE, fill: 'forwards' }, () => box.remove());
    }

    /* ---------- Toast ---------- */
    let toastHost = null;
    let toastTimer = 0;
    function showToast(text, kind = 'ok') {
        if (!document.body) return;
        if (!toastHost || !toastHost.isConnected) {
            toastHost = h('div', { class: 'xt-toast-host', role: 'status', 'aria-live': 'polite' });
            document.body.appendChild(toastHost);
        }
        clearTimeout(toastTimer);
        toastHost.replaceChildren();
        const ico = kind === 'warn' ? 'alert' : (kind === 'off' ? 'pause' : 'zap');
        const toast = h('div', { class: 'xt-toast', 'data-kind': kind }, icon(ico, 16), text);
        toastHost.appendChild(toast);
        toastTimer = setTimeout(() => {
            toast.classList.add('xt-out');
            setTimeout(() => toast.remove(), motionOn() ? 280 : 0);
        }, kind === 'warn' ? 3200 : 2200);
    }

    /* =====================================================================
     * 6. 翻译 API (Grok 优先，Strato 兜底；LRU 缓存 / 并发去重 / 失败重试)
     * ===================================================================== */
    const TWITTER_BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
    const GROK_ENDPOINTS = ['/i/api/2/grok/translation.json', 'https://api.x.com/2/grok/translation.json'];
    const DEAD_SHORT = 60 * 1000;        // 同源接口网络异常：1 分钟后再试
    const DEAD_LONG = 30 * 60 * 1000;    // 404 / 405 / 跨域失败：30 分钟内不再尝试
    const DEAD_AUTH = 5 * 60 * 1000;     // 连续 401 / 403 (如账号无 Grok 权限)：5 分钟内不再尝试
    const REQUEST_TIMEOUT = 15000;
    const CACHE_LIMIT = 1000;
    const CACHE_TTL = 3 * 24 * 3600 * 1000;

    const deadUntil = new Map();
    const authFail = new Map(); // url -> 连续 401 / 403 次数
    const isDead = (url) => (deadUntil.get(url) || 0) > Date.now();

    // 统一缓存：键前缀 t| 推文译文 · b| 简介译文 · u| 用户 ID。Map 的插入顺序即 LRU 顺序
    const cache = new Map();
    const inflight = new Map();

    function unpackCacheVal(raw) {
        if (!raw) return null;
        if (typeof raw === 'object' && !Array.isArray(raw)) return raw; // 兼容旧版纯对象格式
        if (Array.isArray(raw)) {
            return {
                translation: raw[0],
                sourceLanguage: raw[1] || 'auto',
                provider: raw[2] || 'Grok',
                t: raw[3] || 0,
                destinationLanguage: raw[4] || '',
                localizedSourceLanguage: raw[5] || '',
            };
        }
        return null;
    }

    function packCacheVal(v) {
        if (!v) return null;
        if (v.id) return { id: v.id, t: v.t }; // 用户 ID
        return [
            v.translation || '',
            v.sourceLanguage && v.sourceLanguage !== 'auto' ? v.sourceLanguage : '',
            v.provider || '',
            v.t || Date.now(),
            v.destinationLanguage || '',
            v.localizedSourceLanguage || '',
        ];
    }

    const validCacheItem = (item, now) => {
        if (!Array.isArray(item) || typeof item[0] !== 'string' || !item[1]) return false;
        const t = Array.isArray(item[1]) ? (item[1][3] || 0) : (item[1].t || 0);
        return now - t < CACHE_TTL;
    };

    function loadPersistedCache() {
        if (!config.persistCache) return;
        const arr = readStore(CACHE_KEY, null);
        if (!Array.isArray(arr)) return;
        const now = Date.now();
        for (const item of arr) {
            if (validCacheItem(item, now)) {
                const val = unpackCacheVal(item[1]);
                if (val) cache.set(item[0], val);
            }
        }
    }

    // 落盘前先读出已有内容合并，使用紧凑数组序列化，存储体积立减 60%
    const flushCache = () => {
        if (!config.persistCache) return;
        const now = Date.now();
        const merged = new Map();
        const stored = readStore(CACHE_KEY, null);
        if (Array.isArray(stored)) {
            for (const item of stored) if (validCacheItem(item, now)) merged.set(item[0], item[1]);
        }
        for (const [k, v] of cache) {
            merged.delete(k);
            merged.set(k, packCacheVal(v));
        }
        writeStore(CACHE_KEY, Array.from(merged.entries()).slice(-CACHE_LIMIT));
    };
    // 10s 尾部防抖，30s 最大超时 (maxWait) 强制刷盘，防止自动翻译持续产生任务时永远饿死不落盘
    const persistCacheSoon = debounce(flushCache, 10000, 30000);

    function cacheGet(key) {
        const v = cache.get(key);
        if (!v) return null;
        cache.delete(key);
        cache.set(key, v); // 命中即刷新为最近使用
        return v;
    }

    function cacheSet(key, value) {
        value.t = Date.now();
        cache.delete(key);
        cache.set(key, value);
        while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
        persistCacheSoon();
    }

    function clearCaches() {
        cache.clear();
        userIdFail.clear();
        writeStore(CACHE_KEY, []);
    }

    function dedupe(key, factory) {
        if (inflight.has(key)) return inflight.get(key);
        const p = Promise.resolve().then(factory).finally(() => inflight.delete(key));
        inflight.set(key, p);
        return p;
    }

    function httpError(message, status, retryMs) {
        const e = new Error(message);
        e.status = status;
        if (retryMs) e.retryMs = retryMs;
        return e;
    }

    // 解析 429 响应里的建议等待时间 (Retry-After 秒数 / x-rate-limit-reset 时间戳)，上限 5 分钟
    function retryMsFrom(resp) {
        const cap = 5 * 60 * 1000;
        try {
            const ra = Number(resp.headers.get('retry-after'));
            if (ra > 0) return Math.min(ra * 1000, cap);
            const reset = Number(resp.headers.get('x-rate-limit-reset'));
            if (reset > 0) {
                const ms = reset * 1000 - Date.now();
                if (ms > 0) return Math.min(ms, cap);
            }
        } catch (_) { /* ignore */ }
        return 0;
    }

    let cachedTargetLang = '';
    let targetLangExpires = 0;
    function resolveTargetLang() {
        if (config.targetLang && config.targetLang !== 'None') return config.targetLang;
        const now = Date.now();
        if (cachedTargetLang && now < targetLangExpires) return cachedTargetLang;
        const raw = (getCookie('lang') || rootEl.lang || navigator.language || 'zh').toLowerCase();
        let res = 'zh';
        if (raw.startsWith('zh')) res = /tw|hk|hant/.test(raw) ? 'zh-Hant' : 'zh';
        else res = raw.split('-')[0] || 'zh';
        cachedTargetLang = res;
        targetLangExpires = now + 1500;
        return res;
    }

    function authHeaders(extra) {
        return {
            'authorization': `Bearer ${TWITTER_BEARER_TOKEN}`,
            'x-csrf-token': getCookie('ct0'),
            'x-twitter-auth-type': 'OAuth2Session',
            'x-twitter-active-user': 'yes',
            'x-twitter-client-language': getCookie('lang') || (navigator.language || 'zh-cn').toLowerCase(),
            ...extra,
        };
    }

    async function timedFetch(url, init = {}, timeout = REQUEST_TIMEOUT) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeout);
        try {
            return await fetch(url, { credentials: 'include', ...init, signal: ctrl.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    // 网络抖动 / 5xx 自动重试一次；4xx 与超时不重试
    async function withRetry(fn, retries = 1) {
        for (let i = 0; ; i++) {
            try {
                return await fn();
            } catch (err) {
                const transient = (err instanceof TypeError) || (err?.status >= 500 && err.status < 600);
                if (i >= retries || !transient) throw err;
                await sleep(700 * (i + 1));
            }
        }
    }

    function makeResult(text, lang, provider, extra) {
        return {
            translation: text,
            sourceLanguage: 'auto',
            localizedSourceLanguage: '',
            destinationLanguage: lang,
            provider,
            ...extra,
        };
    }
    // 过滤 AI 模型的闲聊元回复（当原文为空时，模型会返回「请提供需要翻译的文本...」等提示语而非译文）
    const META_RESPONSE_RE = /^(?:请(?:您)?(?:提供|给出|输入)(?:需要|您希望|要)?翻译的(?:文本|内容|句子)?|请提供文本|我将根据您的要求.*翻译|Please provide (?:the )?text|What would you like (?:me )?to translate|I need (?:the )?text to translate)/i;

    // Grok 翻译接口 (推文 content_type=POST / 简介 content_type=BIO)
    async function grokTranslate(payload) {
        let rateLimited = false;
        let retryMs = 0;
        for (const url of GROK_ENDPOINTS) {
            if (isDead(url)) continue;
            try {
                const resp = await timedFetch(url, {
                    method: 'POST',
                    headers: authHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify(payload),
                });
                if (resp.ok) {
                    authFail.delete(url);
                    const data = await resp.json();
                    const text = data?.result?.text;
                    if (text) {
                        if (META_RESPONSE_RE.test(text.trim())) return { text: null, rateLimited, retryMs };
                        return { text, rateLimited, retryMs };
                    }
                } else if (resp.status === 404 || resp.status === 405) {
                    deadUntil.set(url, Date.now() + DEAD_LONG);
                } else if (resp.status === 401 || resp.status === 403) {
                    // 连续三次鉴权失败才拉黑，避免单次 csrf 抖动误伤
                    const n = (authFail.get(url) || 0) + 1;
                    if (n >= 3) { authFail.delete(url); deadUntil.set(url, Date.now() + DEAD_AUTH); }
                    else authFail.set(url, n);
                } else if (resp.status === 429) {
                    rateLimited = true;
                    retryMs = Math.max(retryMs, retryMsFrom(resp));
                }
            } catch (err) {
                // 超时不拉黑；同源接口断网只短暂跳过；跨域接口失败 (CORS) 则长时间跳过
                if (err?.name !== 'AbortError' && err instanceof TypeError) {
                    deadUntil.set(url, Date.now() + (url.startsWith('/') ? DEAD_SHORT : DEAD_LONG));
                }
                console.warn('[X原生翻译] Grok 接口异常，尝试下一通道:', url, err);
            }
        }
        return { text: null, rateLimited, retryMs };
    }

    async function requestTranslation(tweetId, lang) {
        if (!getCookie('ct0')) throw httpError('请先登录 X', 401);

        const g = await grokTranslate({ content_type: 'POST', id: tweetId, dst_lang: lang });
        if (g.text) return makeResult(g.text, lang, 'Grok');

        const endpoint = `/i/api/1.1/strato/column/None/tweetId=${tweetId},destinationLanguage=Some(${lang}),translationSource=Some(X),feature=None,timeout=None,onlyCached=None/translation/service/translateTweet`;
        const resp = await timedFetch(endpoint, { method: 'GET', headers: authHeaders() });
        if (!resp.ok) {
            let msg = `HTTP ${resp.status}`;
            try {
                const d = await resp.json();
                if (d.errors?.[0]?.message) msg += `: ${d.errors[0].message}`;
            } catch (_) { /* ignore */ }
            // Grok 通道已被限流时，统一按 429 上报，让自动翻译能正确进入暂停
            const limited = g.rateLimited || resp.status === 429;
            throw httpError(msg, limited ? 429 : resp.status, limited ? Math.max(g.retryMs, retryMsFrom(resp)) : 0);
        }
        const data = await resp.json();
        if (!data || !data.translation) throw httpError('暂无可用译文', 204);
        consecutive429 = 0;
        return {
            translation: data.translation,
            sourceLanguage: data.sourceLanguage || 'auto',
            localizedSourceLanguage: data.localizedSourceLanguage || '',
            destinationLanguage: data.destinationLanguage || lang,
            // 兜底通道如实标注来源，不再冒充 Grok
            provider: data.translationSource || 'X',
        };
    }

    function getTranslation(tweetId, lang, force) {
        const key = `t|${tweetId}|${lang}`;
        if (force) {
            cache.delete(key);
            inflight.delete(key);
        }
        const hit = cacheGet(key);
        if (hit) return Promise.resolve(hit);
        return dedupe(key, async () => {
            const r = await withRetry(() => requestTranslation(tweetId, lang));
            cacheSet(key, r);
            return r;
        });
    }

    function friendlyError(err) {
        if (err?.name === 'AbortError') return '请求超时，请稍后重试';
        if (err instanceof TypeError) return '网络异常，请检查连接';
        if (err?.status === 429) return '请求过于频繁 (429)，请稍后重试';
        if (err?.status === 401 || err?.status === 403) return '登录失效或无权限';
        return err?.message || String(err);
    }

    /* =====================================================================
     * 6.1 用户个人简介 (Bio / HoverCard)：用户 ID 解析 + Grok 翻译
     *     解析顺序：DOM 关注按钮 → 页面 JSON-LD → GraphQL (动态发现操作 ID)
     * ===================================================================== */
    const userIdFail = new Map(); // screenName -> 失败时间，2 分钟内不重复请求
    const lastDiscoverAt = new Map();
    const GQL_TTL = 12 * 3600 * 1000;
    const GQL_FALLBACK = {
        UserByScreenName: {
            id: 'AMIBMjtxEEATh4z8V9GtRg',
            features: [
                'hidden_profile_subscriptions_enabled',
                'verified_phone_label_enabled',
                'subscriptions_verification_info_is_identity_verified_enabled',
                'subscriptions_verification_info_verified_since_enabled',
                'highlights_tweets_tab_ui_enabled',
                'creator_subscriptions_tweet_preview_api_enabled',
                'responsive_web_graphql_skip_user_profile_image_extensions_enabled',
                'responsive_web_graphql_timeline_navigation_enabled',
            ],
            toggles: ['withAuxiliaryUserLabels'],
        },
    };
    const FALSE_FEATURES = new Set([
        'verified_phone_label_enabled',
        'responsive_web_graphql_skip_user_profile_image_extensions_enabled',
    ]);

    function scriptUrls() {
        const urls = new Set();
        document.querySelectorAll('script[src]').forEach((s) => urls.add(s.src));
        try {
            performance.getEntriesByType('resource').forEach((r) => { if (/\.js(\?|$)/.test(r.name)) urls.add(r.name); });
        } catch (_) { /* ignore */ }
        // GraphQL 操作定义通常集中在 api.*.js，优先扫描
        const rank = (u) => (/\/api\./.test(u) ? 0 : (/\/main\./.test(u) ? 1 : 2));
        return Array.from(urls)
            .filter((u) => /^https:\/\/abs\.twimg\.com\/.+\.js(\?|$)/.test(u))
            .sort((a, b) => rank(a) - rank(b));
    }

    // 从 X 前端脚本中解析 GraphQL 操作 ID 与所需 features (X 会定期轮换，写死会失效)
    function parseGqlOp(text, op) {
        const idm = text.match(new RegExp(`queryId:\\s*"([\\w-]+)"\\s*,\\s*operationName:\\s*"${op}"`));
        if (!idm) return null;
        const after = text.slice(idm.index, idm.index + 8000);
        const end = after.indexOf('}}');
        const seg = end > 0 ? after.slice(0, end) : after;
        const names = (key) => {
            const m = seg.match(new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`));
            return m ? Array.from(m[1].matchAll(/"([^"]+)"/g), (x) => x[1]) : [];
        };
        return { id: idm[1], features: names('featureSwitches'), toggles: names('fieldToggles') };
    }

    async function discoverGqlOp(op) {
        const urls = scriptUrls().slice(0, 40);
        // 4 路并发扫描，命中即停，彻底解决串行等待过多大脚本的问题
        const CONCURRENCY = 4;
        let found = null;
        for (let i = 0; i < urls.length && !found; i += CONCURRENCY) {
            const batch = urls.slice(i, i + CONCURRENCY);
            const results = await Promise.all(batch.map(async (url) => {
                if (found) return null;
                try {
                    const resp = await timedFetch(url, { credentials: 'omit' }, 12000);
                    if (!resp.ok) return null;
                    return parseGqlOp(await resp.text(), op);
                } catch (_) { return null; }
            }));
            found = results.find(Boolean);
            if (found) return found;
        }
        return null;
    }

    async function getGqlOp(op, refresh = false) {
        const store = readStore(QID_KEY, {}) || {};
        const hit = store[op];
        if (!refresh) return hit || GQL_FALLBACK[op] || null; // 先用缓存或已知内置 ID，绝不无故预扫大脚本
        // 仅在明确报错重试 (400/404) 且节流超过 10 分钟时，才发起网络发现
        if (Date.now() - (lastDiscoverAt.get(op) || 0) > 10 * 60 * 1000) {
            lastDiscoverAt.set(op, Date.now());
            const found = await dedupe(`gql|${op}`, () => discoverGqlOp(op));
            if (found) {
                store[op] = { ...found, t: Date.now() };
                writeStore(QID_KEY, store);
                return store[op];
            }
        }
        return hit || GQL_FALLBACK[op] || null;
    }

    async function gqlUserIdByScreenName(screenName) {
        let opInfo = await getGqlOp('UserByScreenName');
        const extra = {};
        for (let i = 0; i < 3 && opInfo; i++) {
            const features = {};
            opInfo.features.forEach((k) => { features[k] = !FALSE_FEATURES.has(k); });
            Object.assign(features, extra);
            const toggles = {};
            (opInfo.toggles || []).forEach((k) => { toggles[k] = true; });
            const q = [
                `variables=${encodeURIComponent(JSON.stringify({ screen_name: screenName, withSafetyModeUserFields: true }))}`,
                `features=${encodeURIComponent(JSON.stringify(features))}`,
            ];
            if (Object.keys(toggles).length) q.push(`fieldToggles=${encodeURIComponent(JSON.stringify(toggles))}`);
            const resp = await timedFetch(`${location.origin}/i/api/graphql/${opInfo.id}/UserByScreenName?${q.join('&')}`, {
                headers: authHeaders(),
            });
            if (resp.ok) {
                const data = await resp.json();
                return data?.data?.user?.result?.rest_id || null;
            }
            if (resp.status === 429) throw httpError('请求过于频繁 (429)', 429, retryMsFrom(resp));
            const body = await resp.text().catch(() => '');
            // X 会在 400 错误中列出缺失的 features，补齐后重试
            const miss = body.match(/features cannot be null:\s*([\w,\s]+?)(?:["\\.]|$)/i);
            if (miss) {
                miss[1].split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean).forEach((k) => { extra[k] = true; });
                continue;
            }
            if (i === 0) { opInfo = (await getGqlOp('UserByScreenName', true)) || opInfo; continue; }
            break;
        }
        return null;
    }

    // 个人主页 SSR 会内嵌 JSON-LD，其中 identifier 即用户 ID (仅在 additionalName 与目标一致时采信)
    function userIdFromJsonLd(screenName) {
        try {
            for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
                const e = JSON.parse(s.textContent || 'null')?.mainEntity;
                if (e?.identifier && String(e.additionalName || '').toLowerCase() === screenName.toLowerCase()) {
                    return String(e.identifier);
                }
            }
        } catch (_) { /* ignore */ }
        return null;
    }

    async function getUserIdByScreenName(screenName) {
        if (!screenName) return null;
        const key = `u|${screenName.toLowerCase()}`;
        const hit = cacheGet(key);
        if (hit) return hit.id;
        const ld = userIdFromJsonLd(screenName);
        if (ld) { cacheSet(key, { id: ld }); return ld; }
        if ((userIdFail.get(key) || 0) > Date.now() - 2 * 60 * 1000) return null;
        return dedupe(key, async () => {
            try {
                const id = await withRetry(() => gqlUserIdByScreenName(screenName));
                if (id) { cacheSet(key, { id }); return id; }
            } catch (err) {
                // 限流要向上抛，让调用方进入暂停；其他错误只记失败时间
                if (err?.status === 429) throw err;
                console.warn('[X原生翻译] 获取用户 ID 失败:', err);
            }
            userIdFail.set(key, Date.now());
            return null;
        });
    }

    function getBioTranslation(userId, lang, force) {
        const key = `b|${userId}|${lang}`;
        if (force) {
            cache.delete(key);
            inflight.delete(key);
        }
        const hit = cacheGet(key);
        if (hit) return Promise.resolve(hit);
        return dedupe(key, async () => {
            const g = await grokTranslate({ content_type: 'BIO', id: userId, dst_lang: lang });
            let result = g.text ? makeResult(g.text, lang, 'Grok') : null;
            if (!result) {
                // Strato 降级
                try {
                    const dst = config.targetLang === 'None' ? 'None' : `Some(${lang})`;
                    const resp = await timedFetch(
                        `${location.origin}/i/api/1.1/strato/column/None/profileUserId=${userId},destinationLanguage=${dst},translationSource=Some(Google)/translation/service/translateProfile`,
                        { method: 'GET', headers: authHeaders() },
                    );
                    if (resp.ok) {
                        const d = await resp.json();
                        if (d?.profileTranslation?.translation) {
                            result = makeResult(d.profileTranslation.translation, lang, 'Google');
                        }
                    } else if (resp.status === 429) {
                        g.rateLimited = true;
                        g.retryMs = Math.max(g.retryMs || 0, retryMsFrom(resp));
                    }
                } catch (_) { /* ignore */ }
            }
            if (!result) {
                if (g.rateLimited) throw httpError('请求过于频繁 (429)', 429, g.retryMs);
                return null;
            }
            cacheSet(key, result);
            return result;
        });
    }

    /* 通过 DOM 线索识别简介所属用户：关注按钮 testid「<uid>-follow」/ 头像容器 testid「UserAvatar-Container-<name>」 */
    const RESERVED_PATHS = new Set([
        'home', 'explore', 'notifications', 'messages', 'i', 'settings', 'search', 'compose',
        'login', 'logout', 'signup', 'tos', 'privacy', 'hashtag', 'intent', 'share',
    ]);

    function screenNameFromPath() {
        const m = location.pathname.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/);
        return m && !RESERVED_PATHS.has(m[1].toLowerCase()) ? m[1] : '';
    }

    function bioIdentity(bioEl) {
        const hover = !!bioEl.closest(HOVER_SEL);
        const inCell = !hover && !!bioEl.closest(CELL_SEL);
        let uid = '';
        let sn = '';
        let node = bioEl.parentElement;
        for (let i = 0; node && i < 8; i++, node = node.parentElement) {
            const fb = node.querySelector('[data-testid$="-follow"], [data-testid$="-unfollow"]');
            const m = fb && !bioEl.contains(fb) ? fb.getAttribute('data-testid').match(/^(\d+)-(?:un)?follow$/) : null;
            if (m) uid = m[1];
            const av = node.querySelector('[data-testid^="UserAvatar-Container-"]');
            if (av && !bioEl.contains(av)) sn = av.getAttribute('data-testid').slice('UserAvatar-Container-'.length);
            if (uid || sn) break;
            if (hover && node.matches('[data-testid="HoverCard"]')) break;
            if (inCell && node.matches(CELL_SEL)) break; // 用户列表里只在本条 Cell 内找线索
            if (node.matches('[data-testid="primaryColumn"], main, body')) break;
        }
        // 用户列表 (粉丝 / 关注 / 搜索) 里的简介属于列表中的某个人，不能用地址栏用户名覆盖
        if (!hover && !inCell) {
            const pathSn = screenNameFromPath();
            // 主页以地址栏为准；若 DOM 线索与地址栏不一致 (如残留的其他用户组件)，不采信 DOM 的用户 ID
            if (pathSn) {
                if (sn && sn.toLowerCase() !== pathSn.toLowerCase()) uid = '';
                sn = pathSn;
            }
        } else if (!sn) {
            // 回退：浮卡 / 列表项内第一个形如 @xxx 的文本 (排除简介自身，避免把简介里提到的人当成本人)
            for (const s of (bioEl.closest(HOVER_SEL) || bioEl.closest(CELL_SEL) || document).querySelectorAll('span')) {
                if (bioEl.contains(s)) continue;
                const t = (s.textContent || '').trim();
                if (/^@[A-Za-z0-9_]{1,15}$/.test(t)) { sn = t.slice(1); break; }
            }
        }
        // 以 screenName 作稳定键 (同一节点上 uid / sn 线索出现先后不同，也不会误判为换人)
        return { uid, sn, key: sn ? sn.toLowerCase() : uid };
    }

    /* =====================================================================
     * 7. 推文定位 / 语种判断
     * ===================================================================== */
    function quoteBoxOf(node, article) {
        const box = node.parentElement ? node.parentElement.closest('[role="link"]') : null;
        return box && box !== article && article.contains(box) ? box : null;
    }
    const inQuoteBox = (node, article) => !!quoteBoxOf(node, article);

    function getTweetContext(el) {
        const article = el.closest('article');
        if (!article) return null;
        const texts = Array.from(article.querySelectorAll(TEXT_SEL));
        const box = quoteBoxOf(el, article);
        const isQuote = !!box || (texts.length > 1 && texts[0] !== el);
        return { article, isQuote, box, scope: box || article };
    }

    function scopedAll(ctx, selector) {
        return Array.from(ctx.scope.querySelectorAll(selector))
            .filter((n) => ctx.isQuote || !inQuoteBox(n, ctx.article));
    }

    const idFromHref = (a) => {
        const href = typeof a === 'string' ? a : a?.getAttribute?.('href');
        return href?.match(/\/status\/(\d+)/)?.[1] || null;
    };

    function findTweetId(el) {
        const ctx = getTweetContext(el);
        if (!ctx) return null;

        if (ctx.isQuote) {
            if (!ctx.box) return null;
            const a = ctx.box.querySelector('a[href*="/status/"]') || ctx.box.querySelector('time')?.closest('a');
            return idFromHref(a) || idFromHref(ctx.box) || null;
        }

        const timeLink = Array.from(ctx.article.querySelectorAll('time'))
            .map((t) => t.closest('a'))
            .find((a) => a && !inQuoteBox(a, ctx.article));
        const fromTime = idFromHref(timeLink);
        if (fromTime) return fromTime;

        const pageId = idFromHref(location.pathname);
        if (pageId) return pageId;

        for (const a of ctx.article.querySelectorAll('a[href*="/status/"]')) {
            if (!inQuoteBox(a, ctx.article)) {
                const id = idFromHref(a);
                if (id) return id;
            }
        }
        return null;
    }

    const NO_LANG = new Set(['', 'und', 'qam', 'qct', 'qht', 'qme', 'qst', 'zxx']);
    const KANA_HANGUL_RE = /[\u3040-\u30ff\uac00-\ud7af]/;
    const baseLang = (l) => (l || '').toLowerCase().split('-')[0];
    const cleanText = (t) => (t || '').replace(/https?:\/\/\S+/g, '').replace(/[@＠]\w+/g, '').trim();

    function isTextChinese(text) {
        if (KANA_HANGUL_RE.test(text)) return false;
        const han = text.match(/\p{Script=Han}/gu);
        if (!han) return false;
        const letters = text.match(/\p{L}/gu) || [];
        return letters.length > 0 && han.length / letters.length > 0.3;
    }

    // 没有 lang 标注时，按文字脚本占比判断 (日 / 韩 / 俄)
    function scriptMatchesTarget(text, target) {
        const letters = text.match(/\p{L}/gu) || [];
        if (!letters.length) return false;
        const ratio = (re) => (text.match(re) || []).length / letters.length;
        switch (target) {
            case 'ja': return /[\u3040-\u30ff]/.test(text) && ratio(/[\u3040-\u30ff\p{Script=Han}]/gu) > 0.5;
            case 'ko': return ratio(/\p{Script=Hangul}/gu) > 0.5;
            case 'ru': return ratio(/\p{Script=Cyrillic}/gu) > 0.6;
            default: return false;
        }
    }

    function isAlreadyTarget(el, text, targetLang) {
        const target = baseLang(targetLang);
        const hint = baseLang(el.getAttribute('lang'));
        const hasHint = !NO_LANG.has(hint);
        if (target === 'zh') {
            if (KANA_HANGUL_RE.test(text)) return false;
            if (hasHint) return hint === 'zh';
            return isTextChinese(text);
        }
        if (hasHint) return hint === target;
        return scriptMatchesTarget(text, target);
    }

    function shouldSkip(el) {
        const text = cleanText(el.textContent);
        if (!/\p{L}/u.test(text)) return true;
        if (!config.skipSame) return false;
        return isAlreadyTarget(el, text, resolveTargetLang());
    }

    /* =====================================================================
     * 7.1 官方原生翻译：识别 / 隐藏 / 接管
     * ===================================================================== */
    // 常见界面语言的文案；其他语言可自行往正则里补充
    const NATIVE_BTN_RE = /^(显示翻译|翻译帖子|翻译推文|顯示翻譯|翻譯貼文|Show translation|Translate post|Translate Tweet|ポストを翻訳|ツイートを翻訳|翻訳を表示|번역 보기|게시물 번역하기|Mostrar traducción|Traducir publicación|Afficher la traduction|Traduire le post|Übersetzung anzeigen|Post übersetzen|Показать перевод|Перевести пост)$/i;
    const NATIVE_ORIG_BTN_RE = /^(显示原文|顯示原文|Show original|原文を表示|オリジナルを表示|원문 보기|Mostrar original|Afficher l'original|Original anzeigen|Показать оригинал)$/i;
    const NATIVE_HEADER_RE = /(?:翻译自|翻譯自|Translated from|翻訳:|번역:|Traducido de|Traduit de|Übersetzt aus|Переведено с)\s*([^\s·\n]+)/i;
    const NATIVE_HINT_RE = /翻译|翻譯|翻訳|번역|[Tt]ranslat|[Tt]raduc|[Tt]raduit|[Üü]bersetz|перевод|перевед/;
    const SHOW_MORE_RE = /^(显示更多|顯示更多|Show more|さらに表示|もっと見る|더 보기|Mostrar más|Afficher plus|Mehr anzeigen|Показать ещё)$/i;

    function findNativeTranslateButton(el) {
        const ctx = getTweetContext(el);
        if (!ctx) return null;
        return scopedAll(ctx, 'button, [role="button"]')
            .find((b) => !b.closest('.xt-box') && NATIVE_BTN_RE.test((b.textContent || '').trim())) || null;
    }

    // 只隐藏「体积合理」的官方栏位，避免误伤包含整条推文的大容器
    const isBarSized = (n) => !!n && !n.querySelector(TEXT_SEL) && (n.textContent || '').length <= 80;
    const markNative = (n) => { if (n && !n.hasAttribute('data-xt-native')) n.setAttribute('data-xt-native', 'hide'); };
    const unmarkNative = (n) => { if (n && n.hasAttribute('data-xt-native')) n.removeAttribute('data-xt-native'); };

    // includeShowBtn=true 时连「显示翻译」按钮一并隐藏 (仅在我们已接管该推文后使用)
    function hideNativeTranslateBar(article, includeShowBtn = false) {
        if (!article) return;
        for (const b of article.querySelectorAll('button, [role="button"]')) {
            if (b.closest('.xt-box')) continue;
            const t = (b.textContent || '').trim();
            const isShow = NATIVE_BTN_RE.test(t);
            if (NATIVE_ORIG_BTN_RE.test(t) || (includeShowBtn && isShow)) {
                const bar = b.closest('div[dir="ltr"]') || b.parentElement;
                markNative(isBarSized(bar) ? bar : b);
            }
        }
        // 官方「评价此翻译：👍 👎」残留栏：优先匹配投票按钮，避免遍历全推文所有 span
        const thumbBtn = article.querySelector('button[data-testid="thumbsUpVoteButton"], button[data-testid="thumbsDownVoteButton"]');
        if (thumbBtn) {
            const wrap = thumbBtn.closest('div[dir="ltr"]') || thumbBtn.parentElement;
            if (isBarSized(wrap)) markNative(wrap);
        }
        // 静态的「翻译自 xx」栏 (带 Grok 图标，无按钮)：仅在对应的正文已接管挂载了卡片时才隐藏；未接管时保留原生提示！
        for (const bar of article.querySelectorAll('div[dir="ltr"]')) {
            if (isNativeHeaderBar(bar)) {
                const textEl = findTextElForBar(bar, article);
                if (textEl && (textEl.dataset.xtStatus === 'translated' || boxOf(textEl))) {
                    markNative(bar);
                } else {
                    unmarkNative(bar);
                }
            }
        }
    }

    function isNativeHeaderBar(bar) {
        return !bar.closest('.xt-box') && isBarSized(bar) && bar.querySelector('svg') && NATIVE_HEADER_RE.test(bar.textContent || '');
    }
    // 在视口上方挂载卡片时补偿滚动距离，避免撑开高度推动下方可见内容导致页面弹跳
    function withScrollComp(article, fn) {
        if (!article || isDetailPage()) return fn();
        const r = article.getBoundingClientRect();
        const isAbove = r.bottom <= 0;
        const h0 = isAbove ? article.offsetHeight : 0;
        const res = fn();
        if (isAbove) {
            const delta = article.offsetHeight - h0;
            if (delta !== 0) window.scrollBy(0, delta);
        }
        return res;
    }

    function mountTakenOverBox(tweetTextEl, translatedText, srcName) {
        if (!tweetTextEl || !tweetTextEl.isConnected || tweetTextEl.dataset.xtStatus === 'translated' || boxOf(tweetTextEl)) return;
        tweetTextEl.dataset.xtStatus = 'translated';
        if (config.autoExpand || isDetailPage()) {
            delete tweetTextEl.dataset.xtExpanded;
            expandIfTruncated(tweetTextEl);
        }
        const tweetId = findTweetId(tweetTextEl);
        tweetTextEl.dataset.xtKey = tweetId || '';
        const box = mountBox(tweetTextEl, tweetId || 'native-' + Math.random().toString(36).slice(2));
        const retry = () => translateTweet(tweetTextEl, { force: true });
        renderResult(box, tweetTextEl, makeResult(translatedText, resolveTargetLang(), 'Grok', { localizedSourceLanguage: srcName }), retry);
        animateIn(box);
        return box;
    }

    // 官方译文常被截断 (以省略号收尾)，此时需要拉取完整译文
    const looksTruncated = (t) => /(…|\.{3})\s*$/.test(t || '');

    // 后台静默拉取长帖完整翻译并就地刷新。走统一缓存 / 并发去重 / 限流暂停，不绕开队列规则
    function completeTruncatedTranslation(box, el, shortText) {
        const tweetId = findTweetId(el);
        if (!box || !tweetId) return;
        getTranslation(tweetId, resolveTargetLang()).then((full) => {
            if (!box.isConnected || !el.isConnected) return;
            if (full?.translation && full.translation.length > shortText.length) {
                renderResult(box, el, full, () => translateTweet(el, { force: true }));
            }
        }).catch((err) => {
            if (err?.status === 429) pauseQueue(err.retryMs);
            console.warn('[X原生翻译] 静默补全长推文完整翻译失败:', err);
        });
    }

    // 为官方「翻译自 xx」栏找到对应的推文正文
    function findTextElForBar(bar, article) {
        if (bar.nextElementSibling?.matches?.(TEXT_SEL)) return bar.nextElementSibling;
        let curr = bar;
        while (curr && curr !== article) {
            const t = curr.parentElement?.querySelector(TEXT_SEL);
            if (t) return t;
            curr = curr.parentElement;
        }
        return null;
    }

    // 已扫描过的 article 及其文本长度签名：内容没变化就不重复深扫，时间线滚动更省电
    const takeoverSig = new WeakMap();

    let navRestoring = false;
    let navRestoreTimer = 0;

    function takeoverNativeTranslation(article, force = false) {
        if (!config.takeoverNative || !article?.isConnected) return;
        // 返回时间线过渡期间 (500ms 内) 暂停处理，让推特原生滚动还原 100% 顺滑着陆
        if (navRestoring && !force) return;
        // 时间线页面中，若推文完全在视口上方 (bottom <= 0)，无论是否 force，绝对不主动接管撑高高度！
        // 彻底杜绝视口上方任何推文被撑开高度导致滚动上下弹跳
        if (!isDetailPage()) {
            const r = article.getBoundingClientRect();
            if (r.bottom <= 0) return;
        }
        // 快速预检：若该推文内所有正文段落都已经处理过且没有未隐藏的官方栏，直接退出，不被自己的卡片反复触发深扫
        const hasUnprocessed = Array.from(article.querySelectorAll(TEXT_SEL)).some(
            (t) => !t.dataset.xtStatus && !boxOf(t)
        );
        if (!hasUnprocessed && !article.querySelector('div[dir="ltr"]:not([data-xt-native="hide"])')) {
            return;
        }

        const text = article.textContent || '';
        // 快速预检：整条推文里连「翻译」字样都没有，就无需深入扫描
        if (!NATIVE_HINT_RE.test(text)) { takeoverSig.set(article, text.length); return; }
        if (!force && takeoverSig.get(article) === text.length) return;
        takeoverSig.set(article, text.length);
        hideNativeTranslateBar(article);

        const bars = Array.from(article.querySelectorAll('div[dir="ltr"]')).filter(isNativeHeaderBar);
        for (const bar of bars) {
            const tweetTextEl = findTextElForBar(bar, article);
            if (!tweetTextEl || tweetTextEl.dataset.xtStatus === 'translated' || tweetTextEl.dataset.xtStatus === 'pending' || boxOf(tweetTextEl)) continue;

            const translatedText = tweetTextEl.textContent?.trim();
            if (!translatedText) continue;

            const origBtn = bar.querySelector('button') ||
                Array.from(bar.parentElement?.querySelectorAll('button') || []).find((b) => NATIVE_ORIG_BTN_RE.test((b.textContent || '').trim()));

            // 没有官方「显示原文」按钮且文本本身已是目标语言 (如单向被翻译且无原文还原按钮的引用帖)：
            // 此时由于没有原文可供对照，不能接管；同时必须保留推特原生的「翻译自 xx」提示，绝不能误隐藏！
            if (!origBtn && (shouldSkip(tweetTextEl) || isAlreadyTarget(tweetTextEl, translatedText, resolveTargetLang()))) {
                tweetTextEl.dataset.xtStatus = 'skipped';
                unmarkNative(bar);
                continue;
            }

            markNative(bar);
            const langSpan = bar.querySelector('span');
            const headerText = (langSpan ? langSpan.textContent : bar.textContent || '')
                .replace(/显示原文|顯示原文|Show original|原文を表示/g, '')
                .trim();
            const m = headerText.match(NATIVE_HEADER_RE);
            const srcName = m && m[1] ? m[1].trim() : langName(tweetTextEl.getAttribute('lang'));

            if (origBtn) {
                tweetTextEl.dataset.xtStatus = 'pending';
                const hadShowMore = !!article.querySelector('[data-testid="tweet-text-show-more-link"]') ||
                    SHOW_MORE_RE.test(article.textContent || '');
                // 记下正文在本条推文中的序号：点击「显示原文」后 React 可能重建节点，需要按序号重新定位
                const index = Array.from(article.querySelectorAll(TEXT_SEL)).indexOf(tweetTextEl);
                try { origBtn.click(); } catch (_) { /* ignore */ }
                setTimeout(() => {
                    hideNativeTranslateBar(article);
                    const target = tweetTextEl.isConnected ? tweetTextEl : article.querySelectorAll(TEXT_SEL)[index];
                    if (target && !boxOf(target)) {
                        let wasTruncated = hadShowMore;
                        if (config.autoExpand || isDetailPage()) {
                            delete target.dataset.xtExpanded;
                            expandIfTruncated(target);
                            if (target.dataset.xtExpanded) wasTruncated = true;
                        }
                        const box = withScrollComp(article, () => mountTakenOverBox(target, translatedText, srcName));
                        // 长推文原先被推特折叠截断时，官方译文只是前半截：后台补全完整译文
                        if (box && (wasTruncated || looksTruncated(translatedText))) {
                            completeTruncatedTranslation(box, target, translatedText);
                        }
                    } else if (tweetTextEl.isConnected && tweetTextEl.dataset.xtStatus === 'pending') {
                        delete tweetTextEl.dataset.xtStatus; // 没接管成功，避免永远卡在 pending
                    }
                }, 80);
            } else {
                const box = withScrollComp(article, () => mountTakenOverBox(tweetTextEl, translatedText, srcName));
                if (box && (tweetTextEl.dataset.xtExpanded || looksTruncated(translatedText))) {
                    completeTruncatedTranslation(box, tweetTextEl, translatedText);
                }
            }
        }
    }

    const takeoverAll = (force = false) => document.querySelectorAll('article').forEach((a) => takeoverNativeTranslation(a, force));

    // 点击官方「显示翻译」按钮时，定位该按钮所属的那一段正文 (主推文或引用推文)
    function textElForButton(btn) {
        const article = btn.closest('article');
        if (!article) return null;
        const box = btn.parentElement ? btn.parentElement.closest('[role="link"]') : null;
        const inBox = box && box !== article && article.contains(box);
        const scope = inBox ? box : article;
        return Array.from(scope.querySelectorAll(TEXT_SEL)).find((n) => inBox || !inQuoteBox(n, article)) || null;
    }

    // 严格遵守「自动展开折叠长帖」开关；详情页另由 expandMainTweet 只展开主帖
    function expandIfTruncated(el) {
        if (!config.autoExpand) return;
        if (el.dataset.xtExpanded) return;
        const ctx = getTweetContext(el);
        if (!ctx) return;
        const btn = scopedAll(ctx, '[data-testid="tweet-text-show-more-link"]')[0] ||
            scopedAll(ctx, 'button, [role="button"]').find((b) => SHOW_MORE_RE.test((b.textContent || '').trim()));
        if (btn) {
            el.dataset.xtExpanded = '1';
            try { btn.click(); } catch (e) { console.warn('[X原生翻译] 自动展开长推文失败:', e); }
        }
    }

    // 详情页：只展开地址栏对应的那条主帖，不去动下面的回复，避免页面跳动
    function expandMainTweet(el) {
        if (!config.autoExpand || !isDetailPage()) return;
        const pageId = idFromHref(location.pathname);
        if (pageId && findTweetId(el) === pageId) expandIfTruncated(el);
    }

    /* =====================================================================
     * 8. 译文容器渲染
     * ===================================================================== */
    const TAB_VIEWS = ['translation', 'bilingual', 'original'];
    const TAB_LABELS = { translation: '译文', bilingual: '对照', original: '原文' };
    const SLOT_KEY = { tweet: 'mode', bio: 'bioMode', hoverCard: 'hoverCardMode' };

    let displayNames = null;
    const langNameCache = new Map();
    function langName(code) {
        if (!code || code === 'auto' || NO_LANG.has(baseLang(code))) return '';
        if (langNameCache.has(code)) return langNameCache.get(code);
        let name = code;
        try {
            displayNames = displayNames || new Intl.DisplayNames(['zh-CN'], { type: 'language' });
            name = displayNames.of(code) || code;
        } catch (_) { /* ignore */ }
        langNameCache.set(code, name);
        return name;
    }

    // 链接 / @提及 / #话题 / $股票代码
    const ENTITY_RE = /https?:\/\/[^\s<>"']+|(?<![\w@])@[a-zA-Z0-9_]{1,15}|(?<![\w#])[#＃][\p{L}\p{N}_]+|(?<![\w$])\$[A-Za-z]{1,6}\b/gu;
    const TRAIL_PUNCT_RE = /[.,;:!?)\]}>，。；：！？）》】]+$/;

    function renderFormattedText(text) {
        const nodes = [];
        let lastIdx = 0;
        const link = (href, label) => h('a', {
            class: 'xt-entity', href, target: '_blank', rel: 'noopener noreferrer', onClick: stopEvt,
        }, label);

        for (const m of text.matchAll(ENTITY_RE)) {
            const start = m.index;
            if (start > lastIdx) nodes.push(text.slice(lastIdx, start));

            let token = m[0];
            let suffix = '';
            if (token.startsWith('http')) {
                const pm = token.match(TRAIL_PUNCT_RE);
                if (pm) {
                    suffix = pm[0];
                    token = token.slice(0, -suffix.length);
                }
                nodes.push(link(token, token));
            } else if (token.startsWith('@')) {
                nodes.push(link(`https://x.com/${token.slice(1)}`, token));
            } else if (token.startsWith('$')) {
                nodes.push(link(`https://x.com/search?q=${encodeURIComponent(token)}&src=cashtag_click`, token));
            } else {
                nodes.push(link(`https://x.com/hashtag/${encodeURIComponent(token.slice(1))}`, token));
            }
            if (suffix) nodes.push(suffix);
            lastIdx = start + m[0].length;
        }
        if (lastIdx < text.length) nodes.push(text.slice(lastIdx));
        return nodes;
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_) { /* fall through */ }
        try {
            const ta = h('textarea', { style: 'position:fixed;top:0;left:0;opacity:0' });
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch (_) {
            return false;
        }
    }

    function applyView(box, el, view) {
        if (view) {
            box.dataset.view = view;
            el.dataset.xtView = view;
        } else {
            delete box.dataset.view;
            delete el.dataset.xtView;
        }
    }

    function setState(box, state) {
        box.dataset.state = state;
        if (state === 'loading') box.setAttribute('aria-busy', 'true');
        else box.removeAttribute('aria-busy');
    }

    // 译文容器所处位置：悬浮名片 / 个人主页简介 / 推文
    function slotOf(el) {
        if (el.closest(HOVER_SEL)) return 'hoverCard';
        if (el.matches(BIO_SEL) || el.closest('[data-testid="UserProfileHeader_Items"]')) return 'bio';
        return 'tweet';
    }

    const viewOfSlot = (slot) => MODE_TO_VIEW[config[SLOT_KEY[slot]]] || 'translation';

    // 译文容器对应的原文节点 (容器前面可能夹着脚本插入的「展开原文」按钮)
    function textElOfBox(box) {
        let p = box?.previousElementSibling || null;
        while (p && p.classList.contains('xt-orig-expand-btn')) p = p.previousElementSibling;
        return p;
    }

    // 设置面板切换默认显示方式时，同步已渲染的容器
    function syncActiveBoxesMode(slot) {
        document.querySelectorAll('.xt-box[data-state="done"]').forEach((b) => {
            const el = textElOfBox(b);
            if (!el) return;
            const s = slotOf(el);
            if (slot === 'all' || s === slot) b._setView?.(viewOfSlot(s));
        });
    }

    const boxOf = (el) => {
        if (!el?.parentElement) return null;
        let sib = el.nextElementSibling;
        while (sib) {
            if (sib.classList?.contains('xt-box')) return sib;
            if (sib.matches?.(TEXT_SEL)) break;
            sib = sib.nextElementSibling;
        }
        return null;
    };

    function mountBox(el, id) {
        // 清理原文同级下的旧翻译容器以及旧原文展开按钮
        el.parentElement?.querySelectorAll(':scope > .xt-box, :scope > .xt-orig-expand-btn').forEach((c) => c.remove());
        const cs = getComputedStyle(el);
        const box = h('div', { class: 'xt-box', 'data-tweet-id': id });
        setState(box, 'loading');
        if (cs.fontSize) box.style.setProperty('--xt-fs', cs.fontSize);
        if (cs.fontWeight) box.style.setProperty('--xt-fw', cs.fontWeight);
        if (cs.fontFamily) box.style.setProperty('--xt-ff', cs.fontFamily);
        if (cs.color) box.style.setProperty('--xt-text-color', cs.color);
        const next = el.nextElementSibling;
        const showMore = next?.matches?.('[data-testid="tweet-text-show-more-link"]') ? next : null;
        if (showMore) {
            showMore.after(box);
        } else {
            el.after(box);
        }
        return box;
    }

    // 清空某个原文节点上的全部翻译痕迹 (节点被 React 复用给别的内容时使用)
    function resetEl(el) {
        boxOf(el)?.remove();
        el._xtJob = 0;
        el._xtRetry = 0;
        el.classList.remove('xt-clamped');
        el.parentElement?.querySelector('.xt-orig-expand-btn')?.remove();
        for (const k of ['xtStatus', 'xtView', 'xtKey', 'xtExpanded', 'xtQueued', 'xtErrAt']) delete el.dataset[k];
    }

    // 节点被 React 复用给另一条推文时，清理旧译文
    function refreshReused(el) {
        if (!el.dataset.xtStatus || !el.dataset.xtKey) return;
        const id = findTweetId(el);
        if (id && id !== el.dataset.xtKey) resetEl(el);
    }

    // keepHidden：重试 / 强制重译时保持原文隐藏，避免原文闪回再消失造成页面跳动
    function renderLoading(box, el, keepHidden) {
        setState(box, 'loading');
        applyView(box, el, keepHidden ? 'translation' : null);
        // 按原文行数估算骨架屏行数，让占位尽量贴近最终高度
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
        const lines = Math.max(1, Math.min(4, Math.round(el.offsetHeight / lh) || 2));
        box.replaceChildren(
            h('div', { class: 'xt-head', onClick: stopEvt },
                h('span', { class: 'xt-brand' },
                    icon('grok', 13),
                    h('span', { class: 'xt-brand-name' }, 'Grok 正在翻译'),
                    h('span', { class: 'xt-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')))),
            h('div', { class: 'xt-skel', 'aria-hidden': 'true' }, Array.from({ length: lines }, () => h('i'))),
        );
    }

    function renderError(box, el, message, retry) {
        setState(box, 'error');
        applyView(box, el, null);
        box.replaceChildren(
            h('div', { class: 'xt-head', role: 'alert', onClick: stopEvt },
                h('span', { class: 'xt-brand' }, icon('alert', 13), `翻译失败：${message}`),
                h('span', { class: 'xt-grow' }),
                h('button', {
                    class: 'xt-retry-link', type: 'button',
                    onClick: (e) => { e.preventDefault(); e.stopPropagation(); retry(); },
                }, '重试')),
        );
    }

    function renderSame(box, el) {
        setState(box, 'same');
        applyView(box, el, null);
        box.replaceChildren(
            h('div', { class: 'xt-head', onClick: stopEvt },
                h('span', { class: 'xt-brand' }, icon('check', 13), '原文已是目标语言')),
        );
        setTimeout(() => collapseAndRemove(box), 1500);
    }

    const CLAMP_HEIGHT = 220;
    const isDetailPage = () => /\/status\/\d+/.test(location.pathname);

    // 原文折叠：必须在原文可见 (对照 / 原文视图) 时测量，译文视图下原文是 display:none，scrollHeight 恒为 0
    function setupOriginalClamping(el, box) {
        if (!el || el.dataset.xtView === 'translation') return;
        if (el.parentElement?.querySelector(':scope > .xt-orig-expand-btn')) return; // 已设置过，保留用户的展开 / 收起状态

        requestAnimationFrame(() => {
            if (!el.isConnected || el.dataset.xtView === 'translation') return;
            el.parentElement?.querySelectorAll(':scope > .xt-orig-expand-btn').forEach((c) => c.remove());

            // 详情页直接全部展开，无需折叠
            if (isDetailPage()) {
                el.classList.remove('xt-clamped');
                return;
            }

            if (el.scrollHeight > CLAMP_HEIGHT + 30) {
                el.classList.add('xt-clamped');
                const btn = h('button', {
                    class: 'xt-expand-btn xt-orig-expand-btn',
                    type: 'button',
                    'aria-expanded': 'false',
                    onClick: (e) => {
                        e.preventDefault(); e.stopPropagation();
                        const isClamped = el.classList.contains('xt-clamped');
                        if (isClamped) {
                            el.classList.remove('xt-clamped');
                            btn.textContent = '收起原文 ▲';
                            btn.setAttribute('aria-expanded', 'true');
                        } else {
                            el.classList.add('xt-clamped');
                            btn.textContent = '展开原文 ▼';
                            btn.setAttribute('aria-expanded', 'false');
                        }
                    },
                }, '展开原文 ▼');

                // 原文展开按钮必须插在原文正下方，且在译文卡片之上！
                if (box && box.isConnected && box.parentElement === el.parentElement) {
                    el.parentElement.insertBefore(btn, box);
                } else {
                    el.after(btn);
                }
            } else {
                el.classList.remove('xt-clamped');
            }
        });
    }

    // 译文折叠：同理，「仅原文」视图下译文区域高度为 0，不应测量
    function setupTranslationClamping(body, box) {
        if (!body || !box) return;
        if (box.querySelector('.xt-trans-expand-btn')) return; // 已设置过

        requestAnimationFrame(() => {
            if (!box.isConnected || box.dataset.view === 'original') return;
            box.querySelectorAll('.xt-trans-expand-btn').forEach((c) => c.remove());

            // 详情页直接全部展开，无需折叠
            if (isDetailPage()) {
                body.classList.remove('xt-clamped');
                return;
            }

            if (body.scrollHeight > CLAMP_HEIGHT + 30) {
                body.classList.add('xt-clamped');
                const btn = h('button', {
                    class: 'xt-expand-btn xt-trans-expand-btn',
                    type: 'button',
                    'aria-expanded': 'false',
                    onClick: (e) => {
                        e.preventDefault(); e.stopPropagation();
                        const isClamped = body.classList.contains('xt-clamped');
                        if (isClamped) {
                            body.classList.remove('xt-clamped');
                            btn.textContent = '收起译文 ▲';
                            btn.setAttribute('aria-expanded', 'true');
                        } else {
                            body.classList.add('xt-clamped');
                            btn.textContent = '展开译文 ▼';
                            btn.setAttribute('aria-expanded', 'false');
                        }
                    },
                }, '展开译文 ▼');
                box.appendChild(btn);
            } else {
                body.classList.remove('xt-clamped');
            }
        });
    }

    function renderResult(box, el, result, retry, opts = {}) {
        const preview = !!opts.preview;
        setState(box, 'done');
        const src = result.sourceLanguage && result.sourceLanguage !== 'auto' ? result.sourceLanguage : el.getAttribute('lang');
        const srcName = result.localizedSourceLanguage || langName(src);
        const dstName = langName(result.destinationLanguage);
        const langLabel = srcName ? (dstName ? `${srcName} → ${dstName}` : srcName) : '';
        const isGrok = !result.provider || result.provider.startsWith('Grok');
        const providerName = isGrok ? 'Grok 翻译' : `${result.provider} 翻译`;
        const slot = slotOf(el);
        // 给译文正文标注目标语言，浏览器会据此选择正确的字形 (如简 / 繁、日 / 中)
        const dst = result.destinationLanguage;
        const bodyLang = dst && dst !== 'auto' && dst !== 'None' ? (dst === 'zh' ? 'zh-CN' : dst) : null;

        /* —— 右侧悬浮工具 (预览模式不渲染) —— */
        let tools = null;
        if (!preview) {
            const copyBtn = h('button', {
                class: 'xt-ibtn', type: 'button', title: '复制译文（Shift+点击：连同原文）', 'aria-label': '复制译文', 'data-act': 'copy',
            }, icon('copy', 13));
            copyBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const text = e.shiftKey ? `${(el.textContent || '').trim()}\n\n${result.translation}` : result.translation;
                if (!(await copyText(text))) { showToast('复制失败，请检查浏览器剪贴板权限', 'warn'); return; }
                copyBtn.classList.add('xt-ok');
                copyBtn.replaceChildren(icon('check', 13));
                setTimeout(() => {
                    copyBtn.classList.remove('xt-ok');
                    copyBtn.replaceChildren(icon('copy', 13));
                }, 1400);
            });

            const retryBtn = h('button', {
                class: 'xt-ibtn', type: 'button', title: '重新翻译', 'aria-label': '重新翻译', 'data-act': 'refresh',
                onClick: (e) => { e.preventDefault(); e.stopPropagation(); retry(); },
            }, icon('refresh', 13));

            const cfgBtn = h('button', {
                class: 'xt-ibtn', type: 'button', title: '翻译设置 (Alt+Shift+T)', 'aria-label': '翻译设置', 'data-act': 'cfg',
                onClick: (e) => { e.preventDefault(); e.stopPropagation(); openSettings(); },
            }, icon('settings', 13));

            tools = h('span', { class: 'xt-tools' }, copyBtn, retryBtn, cfgBtn);
        }

        /* —— 译文 / 对照 / 原文 分段切换 (仅影响当前这一条，不改全局默认) —— */
        const ind = h('span', { class: 'xt-tab-ind', 'aria-hidden': 'true' });
        const tabBtns = TAB_VIEWS.map((val) => h('button', {
            class: 'xt-tab',
            type: 'button',
            'data-value': val,
            'aria-pressed': 'false',
            onClick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                setView(val);
            },
        }, TAB_LABELS[val]));
        const tabs = h('span', { class: 'xt-tabs', role: 'group', 'aria-label': '显示方式' }, ind, ...tabBtns);

        const head = h('div', { class: 'xt-head', onClick: stopEvt },
            h('span', { class: 'xt-brand' },
                icon(isGrok ? 'grok' : 'translate', 13),
                h('span', { class: 'xt-brand-name' }, providerName),
                langLabel ? h('span', { class: 'xt-lang' }, langLabel) : null),
            h('span', { class: 'xt-grow' }),
            tools,
            tabs);

        const body = h('div', { class: 'xt-body-wrap' },
            h('div', { class: 'xt-body-clip' },
                h('div', {
                    class: 'xt-body',
                    dir: 'auto',
                    lang: bodyLang,
                    onClick: (e) => {
                        if (window.getSelection?.()?.toString()) e.stopPropagation();
                    },
                }, ...renderFormattedText(result.translation))));

        function setView(view, { animate = true } = {}) {
            const prev = box.dataset.view;
            applyView(box, el, view);
            tabs.style.setProperty('--xt-i', Math.max(0, TAB_VIEWS.indexOf(view)));
            tabBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === view)));
            // 原文从「隐藏」切回显示时淡入 (全动画附带轻微位移，中等仅淡入)
            if (animate && prev === 'translation' && view !== 'translation' && motionOn() && typeof el.animate === 'function') {
                el.animate(
                    motionFull()
                        ? [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }]
                        : [{ opacity: 0 }, { opacity: 1 }],
                    { duration: motionFull() ? 320 : 180, easing: EASE },
                );
            }
            // 折叠要在对应区域可见时才能测量：原文可见 (对照 / 原文) 时测原文，译文可见 (译文 / 对照) 时测译文
            if (!preview) {
                if (view !== 'translation') setupOriginalClamping(el, box);
                if (view !== 'original') setupTranslationClamping(body, box);
            }
        }

        box._setView = setView;
        // box._wantView：重试 / 强制重译前用户在这一条上选的视图；没有则用该位置的默认方式
        setView(box._wantView || viewOfSlot(slot), { animate: false });
        box.replaceChildren(head, body);
    }

    /* =====================================================================
     * 9. 翻译主流程 (推文与简介共用同一条任务管线)
     * ===================================================================== */
    const normText = (s) => (s || '').replace(/\s+/g, '').toLowerCase();

    function isSameLanguageResult(result, original) {
        const s = baseLang(result.sourceLanguage);
        const d = baseLang(result.destinationLanguage);
        if (s && s !== 'auto' && s === d) return true;
        const o = normText(original);
        return !!o && o === normText(result.translation);
    }

    // 失败状态附带时间戳，用于冷却：扫描 / 悬停不会对同一节点反复重发请求
    function markError(el) {
        el.dataset.xtStatus = 'error';
        el.dataset.xtErrAt = String(Date.now());
    }
    const inErrorCooldown = (el, ms) =>
        el.dataset.xtStatus === 'error' && Date.now() - (Number(el.dataset.xtErrAt) || 0) < ms;

    /**
     * job: { id, cacheKey, fetch(force), retry(), silentSame?, emptyMsg?, onError?(err) }
     * 负责：挂载容器 → 骨架屏 → 结果 / 同语种 / 错误 的平滑切换，并防止过期任务回写 DOM。
     * onError 返回 'defer' 时表示「限流，稍后自动重排队」：静默收起占位而不是展示错误。
     */
    async function runJob(el, job, force) {
        const token = (el._xtJob = (el._xtJob || 0) + 1);
        const stale = () => el._xtJob !== token || !el.isConnected;

        refreshTheme(false);
        const cached = force ? null : cacheGet(job.cacheKey);
        const prevView = el.dataset.xtView; // 重试前这一条正在用的视图
        const box = mountBox(el, job.id);
        if (prevView) box._wantView = prevView;
        // 命中缓存：直接展开结果；否则骨架屏 → 结果 平滑过渡
        const show = (fn) => {
            if (cached) { fn(); animateIn(box); } else { morph(box, fn); }
        };
        if (!cached) {
            renderLoading(box, el, prevView === 'translation');
            animateIn(box);
        }

        try {
            const result = cached || await job.fetch(force);
            if (stale()) return;
            if (!box.isConnected) el.after(box);

            if (!result || !result.translation || META_RESPONSE_RE.test(result.translation.trim())) {
                if (META_RESPONSE_RE.test(result?.translation?.trim() || '')) {
                    applyView(box, el, null);
                    collapseAndRemove(box);
                    el.dataset.xtStatus = 'skipped';
                    return;
                }
                markError(el);
                show(() => renderError(box, el, job.emptyMsg || '暂无可用译文', job.retry));
                return;
            }
            if (isSameLanguageResult(result, el.textContent)) {
                el.dataset.xtStatus = 'translated';
                // 自动翻译下不打扰用户：悄悄收起占位即可
                if (job.silentSame) { applyView(box, el, null); collapseAndRemove(box); }
                else show(() => renderSame(box, el));
                return;
            }
            show(() => renderResult(box, el, result, job.retry));
            el.dataset.xtStatus = 'translated';
        } catch (err) {
            if (stale()) return;
            if (job.onError?.(err) === 'defer') {
                applyView(box, el, null);
                collapseAndRemove(box);
                delete el.dataset.xtStatus;
                delete el.dataset.xtQueued;
                setTimeout(() => enqueue(el, true), 0); // 队列在限流暂停结束后才会继续取任务
                return;
            }
            markError(el);
            show(() => renderError(box, el, friendlyError(err), job.retry));
        }
    }

    // 标记并隐藏当前这一段正文对应的官方「显示翻译」按钮 (接管开启时)
    function hideNativeButtonFor(el) {
        if (!config.takeoverNative) return;
        const btn = findNativeTranslateButton(el);
        if (btn) {
            const bar = btn.closest('div[dir="ltr"]');
            markNative(isBarSized(bar) ? bar : btn);
        }
        hideNativeTranslateBar(el.closest('article'));
    }

    async function translateTweet(el, { force = false, auto = false } = {}) {
        const status = el.dataset.xtStatus;
        if (status === 'translating') return;
        if (!force && (status === 'translated' || status === 'skipped')) return;
        if (!force && inErrorCooldown(el, 5000)) return;

        if (!force) {
            if (!config.takeoverNative && config.preferNative) {
                const nativeBtn = findNativeTranslateButton(el);
                if (nativeBtn) {
                    try {
                        nativeBtn.click();
                        el.dataset.xtStatus = 'translated';
                        return;
                    } catch (e) {
                        console.warn('[X原生翻译] 触发原生翻译按钮异常，改用 API 翻译:', e);
                    }
                }
            }
            if (shouldSkip(el)) {
                el.dataset.xtStatus = 'skipped';
                return;
            }
        }

        const tweetId = findTweetId(el);
        if (!tweetId) return;
        // 节点被复用给了另一条推文：先清理旧译文
        if (el.dataset.xtKey && el.dataset.xtKey !== tweetId) resetEl(el);

        // 自动翻译只读取 ID 请求译文，不去点击「显示更多」，避免滚动时页面跳变
        if (config.autoExpand && !auto) expandIfTruncated(el);
        hideNativeButtonFor(el);

        const lang = resolveTargetLang();
        el.dataset.xtStatus = 'translating';
        el.dataset.xtKey = tweetId;

        return runJob(el, {
            id: tweetId,
            cacheKey: `t|${tweetId}|${lang}`,
            fetch: (f) => getTranslation(tweetId, lang, f),
            retry: () => translateTweet(el, { force: true }),
            silentSame: auto,
            onError: (err) => {
                if (err?.status !== 429) return undefined;
                pauseQueue(err.retryMs);
                // 自动翻译遇到限流：静默等待后重试 (最多 3 次)，不在时间线里留下一排红色错误
                if (auto && (el._xtRetry = (el._xtRetry || 0) + 1) <= 3) return 'defer';
                return undefined;
            },
        }, force);
    }

    async function translateBio(bioEl, { force = false } = {}) {
        const hover = !!bioEl.closest(HOVER_SEL);
        if (hover ? !config.translateHoverCard : !config.translateProfileBio) return;

        const ident = bioIdentity(bioEl);
        if (!ident.key) return; // 线索不足，等待下一次扫描
        // React 在切换个人主页时会复用同一个简介节点：身份变化就清理旧译文
        if (bioEl.dataset.xtKey && bioEl.dataset.xtKey !== ident.key) resetEl(bioEl);

        const status = bioEl.dataset.xtStatus;
        if (status === 'translating') return;
        if (!force && (status === 'translated' || status === 'skipped')) return;
        // 失败后冷却 60 秒：悬浮名片里的每次 mouseover 都会触发扫描，不能因此反复请求 / 闪烁
        if (!force && inErrorCooldown(bioEl, 60000)) return;

        const rawText = (bioEl.textContent || '').trim();
        const targetLang = resolveTargetLang();
        bioEl.dataset.xtKey = ident.key;
        if (!rawText || !/\p{L}/u.test(rawText) || isMetadataRow(bioEl) || isAlreadyTarget(bioEl, rawText, targetLang)) {
            bioEl.dataset.xtStatus = 'skipped';
            return;
        }

        bioEl.dataset.xtStatus = 'translating';
        let userId = ident.uid;
        if (!userId) {
            try {
                userId = await getUserIdByScreenName(ident.sn);
            } catch (err) {
                if (err?.status === 429) pauseQueue(err.retryMs);
            }
        }
        if (!bioEl.isConnected) return;
        if (bioIdentity(bioEl).key !== ident.key) { resetEl(bioEl); return; } // 等待期间节点已换人
        if (!userId) {
            markError(bioEl); // 简介翻译失败不打扰用户，冷却后再次悬停可重试
            return;
        }

        return runJob(bioEl, {
            id: `bio-${userId}`,
            cacheKey: `b|${userId}|${targetLang}`,
            fetch: (f) => getBioTranslation(userId, targetLang, f),
            retry: () => translateBio(bioEl, { force: true }),
            emptyMsg: '未获取到简介译文',
            onError: (err) => { if (err?.status === 429) pauseQueue(err.retryMs); },
        }, force);
    }
    const FOLLOW_TEXT_RE = /(?:正在关注|关注者|Followers|Following|个人资料概要|Profile summary)/i;

    // 资料元数据行判定：排除地点、设备、网址、加入时间、出生日期、职业分类等非简介标签
    function isMetadataRow(n) {
        if (!n || n.nodeType !== 1) return false;
        if (n.matches('[data-testid*="UserProfileHeader_Items"], [data-testid*="UserLocation"], [data-testid*="UserUrl"], [data-testid*="UserJoinDate"], [data-testid*="UserBirthdate"], [data-testid*="UserProfessionalCategory"]') ||
            n.querySelector('[data-testid*="UserProfileHeader_Items"], [data-testid*="UserLocation"], [data-testid*="UserUrl"], [data-testid*="UserJoinDate"], [data-testid*="UserBirthdate"], [data-testid*="UserProfessionalCategory"]')) {
            return true;
        }
        const svgs = n.querySelectorAll('svg');
        const text = (n.textContent || '').trim();
        if (svgs.length >= 1 && text.length < 60) {
            if (/(?:加入|Joined|Born|South Asia|Android|iOS|t\.co|http)/i.test(text) ||
                n.querySelector('a[href*="place:"], a[href*="t.co"], a[href*="search?q="]')) {
                return true;
            }
        }
        if (svgs.length >= 2 && text.length < 50) return true;
        return false;
    }

    function isBioCandidate(n) {
        if (!n || n.nodeType !== 1) return false;
        const text = (n.textContent || '').trim();
        if (!text || !/\p{L}/u.test(text)) return false;
        if (n.matches('button') || n.querySelector('button, [data-testid*="follow"], [data-testid^="UserAvatar"], [data-testid="User-Name"]')) return false;
        if (text.startsWith('@') && !text.includes(' ')) return false;
        if (FOLLOW_TEXT_RE.test(text) && text.length < 40) return false;
        if (isMetadataRow(n)) return false;
        return true;
    }

    function findHoverBioHeuristic(card) {
        const followAnchor = Array.from(card.querySelectorAll('a[href*="follow"], span')).find((el) => {
            const t = el.textContent?.trim();
            return /^(?:正在关注|关注者|Followers|Following)$/.test(t) || /follow(?:ers|ing)/i.test(el.getAttribute('href') || '');
        });

        if (followAnchor) {
            // 向上逐层找「上一个兄弟」：跳过同属计数行的另一个关注链接，遇到头像 / 名字 / 按钮等非简介内容就放弃
            let row = followAnchor;
            for (let i = 0; row && row !== card && i < 6; i++, row = row.parentElement) {
                const prev = row.previousElementSibling;
                if (!prev) continue;
                if (isMetadataRow(prev)) {
                    // 遇到元数据行 (地点/设备等)，简介一定在元数据行上方，继续看 prev 的上一个兄弟
                    const bioBeforeMeta = prev.previousElementSibling;
                    if (bioBeforeMeta && isBioCandidate(bioBeforeMeta)) return bioBeforeMeta;
                    continue;
                }
                if (isBioCandidate(prev)) return prev;
                const t = (prev.textContent || '').trim();
                if (!FOLLOW_TEXT_RE.test(t)) break;
            }
        }

        // 回退：从用户名节点向后扫描
        const handleSpan = Array.from(card.querySelectorAll('span'))
            .find((s) => s.textContent?.trim().startsWith('@') && s.textContent?.trim().length > 1);
        if (!handleSpan) return null;

        let nameHandleBox = handleSpan;
        while (nameHandleBox && nameHandleBox.parentElement !== card) {
            if (nameHandleBox.parentElement?.children?.length > 2) break;
            nameHandleBox = nameHandleBox.parentElement;
        }

        let curr = nameHandleBox?.nextElementSibling;
        while (curr) {
            const text = curr.textContent?.trim();
            if (FOLLOW_TEXT_RE.test(text) && !text.includes('\n')) break;
            if (isBioCandidate(curr)) return curr;
            curr = curr.nextElementSibling;
        }
        return null;
    }

    function getBioElements() {
        // 用户列表 (粉丝 / 关注 / 搜索) 里的简介数量很多，只在悬停时翻译，不参与批量扫描
        const list = Array.from(document.querySelectorAll(BIO_SEL)).filter((b) => !b.closest(CELL_SEL));
        document.querySelectorAll('[data-testid="HoverCard"], [data-testid="hoverCardParent"]').forEach((card) => {
            if (card.querySelector('.xt-box') || card.querySelector(BIO_SEL)) return;
            const found = findHoverBioHeuristic(card);
            if (found && !list.includes(found)) list.push(found);
        });
        return list;
    }

    function scanBioElements() {
        if (!config.translateProfileBio && !config.translateHoverCard) return;
        getBioElements().forEach((b) => translateBio(b));
    }

    let bioScanTimer = 0;
    function scheduleBioScan() {
        if (bioScanTimer) return;
        bioScanTimer = setTimeout(() => { bioScanTimer = 0; scanBioElements(); }, 80);
    }

    /* =====================================================================
     * 10. 批量队列 / 自动翻译 (视野内停留 → 排队限速 → 翻译)
     * ===================================================================== */
    const AUTO_DWELL = 380;       // 帖子在视野内停留多久才触发 (ms)，快速滚过不翻译
    const QUEUE_CONCURRENCY = 1;  // 自动翻译单并发，大幅降低触发 X 官方风控几率
    const QUEUE_GAP = 220;        // 任务间隔 220ms + 随机抖动
    const PAUSE_MS = 45000;       // 触发 429 后的基础暂停时长 (45s)
    const MAX_PAUSE_MS = 5 * 60 * 1000; // 最长暂停 5 分钟

    let consecutive429 = 0;

    let autoIO = null;
    let pumpTimer = 0;
    let autoObserved = new WeakSet();
    const autoTimers = new Map(); // el -> 停留计时器
    let queue = [];               // { el, auto }
    let activeJobs = 0;
    let pausedUntil = 0;
    let lastPauseNote = 0;

    const autoAllowedHere = () => config.autoScope !== 'detail' || /\/status\/\d+/.test(location.pathname);

    function inViewport(el) {
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
    }

    // 优先翻译离视野中线最近的帖子 (用户此刻正在看的)，而不是严格先进先出
    function takeNext() {
        if (queue.length < 2) return queue.shift();
        const mid = window.innerHeight / 2;
        let best = 0;
        let bestDist = Infinity;
        queue.forEach((job, i) => {
            const r = job.el.getBoundingClientRect();
            const d = Math.abs((r.top + r.bottom) / 2 - mid);
            if (d < bestDist) { bestDist = d; best = i; }
        });
        return queue.splice(best, 1)[0];
    }

    // 限流暂停：指数退避 (45s -> 67s -> 101s -> ... 最大 5 分钟)
    function pauseQueue(ms) {
        consecutive429++;
        const factor = Math.min(6.6, Math.pow(1.5, consecutive429 - 1));
        const base = Math.max(PAUSE_MS, ms || 0);
        const wait = Math.min(MAX_PAUSE_MS, Math.round(base * factor));
        const until = Date.now() + wait;
        const already = pausedUntil > Date.now();
        if (until > pausedUntil) pausedUntil = until;
        if (!already && (config.autoTranslate || queue.length)) {
            showToast(`请求过于频繁 (429)，批量翻译暂停 ${Math.round(wait / 1000)} 秒`, 'warn');
        }
    }

    // 手动悬停遇到暂停期：给出明确提示而不是继续发请求被 429 (提示限频，避免刷屏)
    function notePaused(ms) {
        const now = Date.now();
        if (now - lastPauseNote < 4000) return;
        lastPauseNote = now;
        showToast(`触发限流，约 ${Math.ceil(ms / 1000)} 秒后再试`, 'warn');
    }

    function pump() {
        clearTimeout(pumpTimer);
        const wait = pausedUntil - Date.now();
        if (wait > 0) {
            pumpTimer = setTimeout(pump, wait + 50);
            return;
        }
        if (document.hidden) return;
        while (activeJobs < QUEUE_CONCURRENCY && queue.length) {
            const { el, auto } = takeNext();
            delete el.dataset.xtQueued;
            if (!el.isConnected) continue;
            refreshReused(el); // 虚拟列表复用节点时，旧状态不应挡住新内容
            // 排队期间已滚出视野 / 已被处理的帖子直接丢弃，待再次进入视野时重新入队
            if (el.dataset.xtStatus || !inViewport(el)) continue;
            activeJobs++;
            translateTweet(el, { auto })
                .catch(() => { /* 错误已在界面内展示 */ })
                .finally(() => {
                    activeJobs--;
                    setTimeout(pump, QUEUE_GAP + Math.floor(Math.random() * 60));
                });
        }
    }

    function enqueue(el, auto) {
        if (!el.isConnected || el.dataset.xtStatus || el.dataset.xtQueued) return;
        if (auto && !inViewport(el)) return;
        el.dataset.xtQueued = '1';
        queue.push({ el, auto });
        pump();
    }

    function onAutoIntersect(entries) {
        for (const entry of entries) {
            const el = entry.target;
            const visible = entry.isIntersecting &&
                (entry.intersectionRatio >= 0.3 || entry.intersectionRect.height >= window.innerHeight * 0.35);
            if (visible) {
                refreshReused(el);
                if (autoTimers.has(el) || el.dataset.xtStatus) continue;
                autoTimers.set(el, setTimeout(() => {
                    autoTimers.delete(el);
                    if (config.autoTranslate && autoAllowedHere() && inViewport(el)) enqueue(el, true);
                }, AUTO_DWELL));
            } else if (autoTimers.has(el)) {
                clearTimeout(autoTimers.get(el));
                autoTimers.delete(el);
            }
        }
    }

    function autoWatch(el) {
        if (!autoIO || autoObserved.has(el)) return;
        autoObserved.add(el);
        autoIO.observe(el);
    }

    function startAuto() {
        if (autoIO || !document.body || typeof IntersectionObserver !== 'function') return;
        autoIO = new IntersectionObserver(onAutoIntersect, {
            rootMargin: '-8% 0px -6% 0px',
            threshold: [0, 0.3, 0.6],
        });
        document.querySelectorAll(TEXT_SEL).forEach(autoWatch); // 之后只处理新增节点，见 flushMutations
    }

    function stopAuto() {
        autoIO?.disconnect();
        autoIO = null;
        autoTimers.forEach((t) => clearTimeout(t));
        autoTimers.clear();
        // 只清理自动入队的任务，用户手动发起的批量翻译不受影响
        queue.filter((j) => j.auto).forEach((j) => { delete j.el.dataset.xtQueued; });
        queue = queue.filter((j) => !j.auto);
        autoObserved = new WeakSet();
    }

    function setAuto(on, { toast = true } = {}) {
        config.autoTranslate = !!on;
        saveConfig();
        if (config.autoTranslate) startAuto(); else stopAuto();
        if (toast) showToast(on ? '自动翻译已开启' : '自动翻译已关闭', on ? 'ok' : 'off');
        panel?.syncDeps?.();
    }

    // 手动「翻译当前屏幕内所有帖子」：复用队列限速，不依赖自动翻译开关
    function translateVisibleNow() {
        const els = Array.from(document.querySelectorAll(TEXT_SEL))
            .filter((el) => !el.dataset.xtStatus && inViewport(el) && !shouldSkip(el));
        if (!els.length) {
            showToast('当前屏幕没有需要翻译的帖子', 'off');
            return;
        }
        els.forEach((el) => enqueue(el, false));
        showToast(`正在翻译当前屏幕的 ${els.length} 条帖子`);
    }

    // 目标语言变更后：清掉旧语种译文，视野内的帖子 / 简介立即按新语言重译，其余等下次悬停或滚动到
    function retranslateAll() {
        // 先放掉排队标记，否则这些元素之后永远无法再入队
        queue.forEach((j) => { delete j.el.dataset.xtQueued; });
        queue = [];
        const els = Array.from(document.querySelectorAll('[data-xt-status]')).filter((el) => !el.closest('.xt-overlay'));
        if (!els.length) return;
        els.forEach((el) => {
            const slot = slotOf(el);
            resetEl(el);
            if (slot === 'tweet') { if (inViewport(el)) enqueue(el, false); }
            else translateBio(el);
        });
        showToast('目标语言已更新，正在重新翻译');
    }

    // 还原本页：移除所有译文，恢复原文。已还原的帖子保持「跳过」，悬停不会立刻又翻译回去
    function clearAllTranslations() {
        queue.forEach((j) => { delete j.el.dataset.xtQueued; });
        queue = [];
        let n = 0;
        document.querySelectorAll('[data-xt-status]').forEach((el) => {
            if (el.closest('.xt-overlay')) return;
            const had = el.dataset.xtStatus === 'translated' || !!boxOf(el);
            const key = el.dataset.xtKey;
            resetEl(el);
            el.dataset.xtStatus = 'skipped';
            if (key) el.dataset.xtKey = key;
            if (had) n++;
        });
        showToast(n ? `已还原 ${n} 处译文` : '本页没有需要还原的译文', n ? 'ok' : 'off');
    }

    /* =====================================================================
     * 11. X 原生弹窗风格设置面板 (分页标签 + 实时预览 + 选项联动)
     * ===================================================================== */
    let panel = null;
    let lastTab = 0;

    function buildSeg(items, current, onPick) {
        const idx = Math.max(0, items.findIndex(([v]) => v === current));
        const thumb = h('span', { class: 'xt-seg-thumb', 'aria-hidden': 'true' });
        const seg = h('div', { class: 'xt-seg', role: 'group' });
        seg.style.setProperty('--n', items.length);
        seg.style.setProperty('--i', idx);
        const btns = items.map(([value, label], i) => h('button', {
            type: 'button',
            'data-value': value,
            'aria-pressed': String(value === current),
            onClick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                seg.style.setProperty('--i', i);
                btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
                onPick(value);
            },
        }, label));
        seg.append(thumb, ...btns);
        return seg;
    }

    function buildSwitch(label, get, set) {
        const sw = h('button', {
            class: 'xt-switch', type: 'button', role: 'switch',
            'aria-checked': String(!!get()), 'aria-label': label,
        });
        sw.addEventListener('click', () => {
            set(!get());
            sw.setAttribute('aria-checked', String(!!get()));
        });
        return sw;
    }

    function buildPreview() {
        const orig = h('div', { class: 'xt-preview-orig', lang: 'ja' }, '今日はいい天気ですね。ホバーするだけで翻訳が表示されます。');
        const box = h('div', { class: 'xt-box' });
        renderResult(box, orig, makeResult('今天天气真好呢。只需悬停，译文即刻呈现。', 'zh', 'Grok', {
            sourceLanguage: 'ja',
            localizedSourceLanguage: '日语',
        }), () => { /* 预览无需重试 */ }, { preview: true });
        return h('div', { class: 'xt-preview' },
            h('div', { class: 'xt-preview-label' }, '实时预览'),
            orig,
            box);
    }

    function closeSettings() {
        if (!panel) return;
        const { overlay, prevFocus } = panel;
        panel = null;
        overlay.classList.add('xt-closing');
        setTimeout(() => overlay.remove(), motionOn() ? 190 : 0);
        try { prevFocus?.focus?.({ preventScroll: true }); } catch (_) { /* ignore */ }
    }

    function resetSettings() {
        Object.assign(config, DEFAULTS);
        saveConfig();
        syncRootAttrs();
        if (config.autoTranslate) startAuto(); else stopAuto();
        syncActiveBoxesMode('all');
        if (config.takeoverNative) takeoverAll();
    }

    // 菜单 / 脚本入口：按「无动画 → 中等 → 全动画」循环切换
    function cycleMotion() {
        const i = MOTION_LEVELS.indexOf(config.motion);
        config.motion = MOTION_LEVELS[(i + 1) % MOTION_LEVELS.length];
        saveConfig();
        syncRootAttrs();
        if (panel) closeSettings(); // 面板里的分段控件不会随外部切换更新，直接关闭避免显示过期状态
        showToast(`动效：${MOTION_LABELS[config.motion]}`, config.motion === 'off' ? 'off' : 'ok');
    }

    function openSettings() {
        if (panel) { closeSettings(); return; }
        refreshTheme();
        const prevFocus = document.activeElement;

        const rows = {}; // 需要联动禁用的行
        const row = (title, desc, control, key) => {
            const r = h('div', { class: 'xt-row' },
                h('div', { class: 'xt-row-info' },
                    h('div', { class: 'xt-row-title' }, title),
                    h('div', { class: 'xt-row-desc' }, desc)),
                control);
            if (key) rows[key] = r;
            return r;
        };
        const sec = (text) => h('div', { class: 'xt-sec' }, text);
        const divider = () => h('div', { class: 'xt-divider' });
        const kbd = (...keys) => h('span', null, keys.map((k) => h('kbd', { class: 'xt-kbd' }, k)));

        // 选项之间的依赖：上游关闭 / 不适用时，下游自动置灰并退出 Tab 序列
        let autoSwitch = null;
        const syncDeps = () => {
            const dis = (k, v) => {
                const r = rows[k];
                if (!r) return;
                r.dataset.disabled = String(!!v);
                r.inert = !!v;
            };
            dis('scope', !config.autoTranslate);
            dis('delay', config.triggerKey !== 'none');
            dis('prefer', config.takeoverNative);
            dis('bioMode', !config.translateProfileBio);
            dis('hoverMode', !config.translateHoverCard);
            autoSwitch?.setAttribute('aria-checked', String(config.autoTranslate));
        };

        const sw = (key, label, after) => buildSwitch(label, () => config[key], (v) => {
            config[key] = v;
            saveConfig();
            after?.(v);
            syncDeps();
        });
        const makeSelect = (options, current, label, onChange) => {
            const sel = h('select', { class: 'xt-select', 'aria-label': label },
                options.map(([v, text]) => h('option', { value: v }, text)));
            sel.value = current;
            sel.addEventListener('change', () => onChange(sel.value));
            return sel;
        };

        /* —— 外观页控件 —— */
        const styleSeg = buildSeg(STYLE_OPTIONS, config.style, (v) => {
            config.style = v;
            saveConfig();
            syncRootAttrs();
        });
        const modeSeg = (key, slot) => buildSeg(MODE_OPTIONS, config[key], (v) => {
            config[key] = v;
            saveConfig();
            syncActiveBoxesMode(slot);
        });
        const motionSeg = buildSeg(MOTION_OPTIONS, config.motion, (v) => {
            config.motion = v;
            saveConfig();
            syncRootAttrs();
        });

        /* —— 触发页控件 —— */
        const langSelect = makeSelect(LANG_OPTIONS, config.targetLang, '目标语言', (v) => {
            if (v === config.targetLang) return;
            config.targetLang = v;
            saveConfig();
            retranslateAll();
        });
        const trigSelect = makeSelect(TRIGGER_OPTIONS, config.triggerKey, '触发方式', (v) => {
            config.triggerKey = v;
            saveConfig();
            syncDeps();
        });
        const rangeLabel = () => (config.delay === 0 ? '立即' : `${config.delay}ms`);
        const rangeVal = h('span', { class: 'xt-range-val' }, rangeLabel());
        const range = h('input', {
            class: 'xt-range', type: 'range', min: 0, max: 1000, step: 50,
            value: config.delay, 'aria-label': '悬停延迟',
        });
        range.addEventListener('input', () => {
            config.delay = Number(range.value);
            rangeVal.textContent = rangeLabel();
        });
        range.addEventListener('change', saveConfig);

        autoSwitch = buildSwitch('自动翻译', () => config.autoTranslate, (v) => {
            setAuto(v, { toast: false });
            syncDeps();
        });
        const scopeSelect = makeSelect(AUTO_SCOPE_OPTIONS, config.autoScope, '自动翻译范围', (v) => {
            config.autoScope = v;
            saveConfig();
        });

        /* —— 三个分页 —— */
        const pLook = [
            buildPreview(),
            sec('外观'),
            row('译文容器外观', '实时切换译文区域的视觉区分层级', styleSeg),
            row('界面动效', '无动画：关闭全部动画；中等：仅淡入 / 滑动等轻量过渡，省电流畅；全动画：弹性、流光、展开收起与背景模糊。系统开启「减少动态效果」时强制为无动画', motionSeg),
            divider(),
            sec('各位置默认显示方式'),
            row('推文帖子', '时间线与详情页帖子的默认呈现形态（卡片上的切换只影响该条）', modeSeg('mode', 'tweet')),
            row('主页资料简介', '个人资料主页 (Profile) 简介的呈现形态', modeSeg('bioMode', 'bio'), 'bioMode'),
            row('悬浮名片简介', '鼠标悬停头像/用户名弹出的名片简介呈现形态', modeSeg('hoverCardMode', 'hoverCard'), 'hoverMode'),
        ];

        const pTrigger = [
            sec('手动翻译'),
            row('目标语言', '自动跟随当前 X 界面语言或指定语种；更改后视野内的译文会立即重译', langSelect),
            row('触发方式', '直接悬停，或按下修饰键时触发（修饰键本身被按下的那一刻才算，Ctrl+C 之类的组合键不会误触）', trigSelect),
            row('悬停响应延迟', '仅「鼠标直接悬停」时生效；按住修饰键时立即翻译', h('div', { class: 'xt-range-wrap' }, range, rangeVal), 'delay'),
            divider(),
            sec('自动翻译'),
            row('自动翻译视野内的帖子', '滚动时，停留在视野内的外语帖子会自动翻译（限速并发，遇 429 自动暂停并稍后重试）', autoSwitch),
            row('自动翻译范围', '选择在哪些页面自动翻译', scopeSelect, 'scope'),
        ];

        const clearBtn = h('button', { class: 'xt-pill-btn', type: 'button' }, `清除缓存 (${cache.size})`);
        clearBtn.addEventListener('click', () => {
            clearCaches();
            clearBtn.textContent = '已清除';
            setTimeout(() => { clearBtn.textContent = `清除缓存 (${cache.size})`; }, 1300);
        });

        const pBehave = [
            sec('翻译行为'),
            row('统一接管官方原生翻译样式 (实验性)', '⚠️ 开启后将接管推特「显示翻译」按钮。由于推特引用帖单向翻译无还原按钮，且多帖撑开高度可能对时间线虚拟列表滚动的平滑度产生轻微干扰，默认推荐关闭。',
                sw('takeoverNative', '统一接管官方原生翻译样式', (v) => {
                    syncRootAttrs();
                    if (v) {
                        showToast('已开启原生接管：多帖尺寸变化可能对时间线滚动平滑度产生轻微干扰', 'warn');
                        takeoverAll();
                    }
                })),
            row('优先使用 X 原生翻译按钮', '帖子自带「显示翻译」按钮时直接触发（接管开启时无效）', sw('preferNative', '优先使用 X 原生翻译按钮'), 'prefer'),
            row('跳过已是目标语言的帖子', '自动识别中日韩与目标语种，避免重复翻译', sw('skipSame', '跳过已是目标语言的帖子')),
            row('自动展开折叠长帖', '手动翻译前自动点击「显示更多」；详情页只展开主帖，自动翻译不会点击，避免页面跳动', sw('autoExpand', '自动展开折叠长帖')),
            divider(),
            sec('个人简介'),
            row('翻译个人主页简介', '进入他人主页资料页时自动调用 Grok AI 翻译 Bio',
                sw('translateProfileBio', '翻译个人主页简介', (v) => { if (v) scanBioElements(); }), 'bioToggle'),
            row('翻译悬浮名片简介', '鼠标悬停头像/用户名弹出名片时自动调用 Grok AI 翻译 Bio',
                sw('translateHoverCard', '翻译悬浮名片简介', (v) => { if (v) scanBioElements(); })),
            divider(),
            sec('缓存'),
            row('持久化译文缓存', '刷新页面后沿用已翻译内容，减少请求与限流（保留 3 天）',
                sw('persistCache', '持久化译文缓存', (v) => { if (v) persistCacheSoon(); else writeStore(CACHE_KEY, []); })),
            divider(),
            sec('快捷键'),
            h('div', { class: 'xt-keys' },
                h('div', null, h('span', null, '打开 / 关闭设置'), kbd('Alt', 'Shift', 'T')),
                h('div', null, h('span', null, '开关自动翻译'), kbd('Alt', 'Shift', 'A')),
                h('div', null, h('span', null, '翻译当前屏幕所有帖子'), kbd('Alt', 'Shift', 'G')),
                h('div', null, h('span', null, '强制翻译鼠标所在的帖子（忽略语种判断）'), kbd('Alt', 'Shift', 'F')),
                h('div', null, h('span', null, '还原本页全部译文'), kbd('Alt', 'Shift', 'R')),
                h('div', null, h('span', null, '循环切换动效档位'), kbd('Alt', 'Shift', 'M'))),
        ];

        const TABS = [['外观', pLook], ['触发', pTrigger], ['行为', pBehave]];
        const pages = TABS.map(([, items], i) => {
            const p = h('div', { class: 'xt-page', role: 'tabpanel', id: `xt-page-${i}`, 'aria-labelledby': `xt-tab-${i}` }, items);
            Array.from(p.children).forEach((c, j) => c.style.setProperty('--xt-d', j));
            return p;
        });
        const body = h('div', { class: 'xt-panel-body' }, pages);

        const tabInd = h('span', { class: 'xt-ptab-ind', 'aria-hidden': 'true' });
        const tabsEl = h('div', { class: 'xt-ptabs', role: 'tablist', 'aria-label': '设置分类' });
        tabsEl.style.setProperty('--n', TABS.length);
        const tabBtns = TABS.map(([label], i) => h('button', {
            class: 'xt-ptab', type: 'button', role: 'tab', id: `xt-tab-${i}`, 'aria-controls': `xt-page-${i}`,
            onClick: () => selectTab(i),
            onKeydown: (e) => {
                const key = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
                if (key === undefined) return;
                e.preventDefault();
                selectTab((key + TABS.length) % TABS.length, true);
            },
        }, label));
        tabsEl.append(tabInd, ...tabBtns);

        // 内容滚动后给标签栏加阴影
        body.addEventListener('scroll', () => tabsEl.classList.toggle('xt-scrolled', body.scrollTop > 4), { passive: true });

        function selectTab(i, focus = false) {
            lastTab = i;
            tabsEl.style.setProperty('--i', i);
            tabBtns.forEach((b, j) => {
                b.setAttribute('aria-selected', String(j === i));
                b.tabIndex = j === i ? 0 : -1;
            });
            pages.forEach((p, j) => { p.hidden = j !== i; });
            body.scrollTop = 0;
            tabsEl.classList.remove('xt-scrolled');
            if (focus) tabBtns[i].focus({ preventScroll: true });
        }

        /* —— 底栏：清除缓存 / 重置设置 (二次确认) —— */
        const resetBtn = h('button', { class: 'xt-pill-btn', type: 'button', 'data-danger': 'true' }, '重置设置');
        let resetTimer = 0;
        resetBtn.addEventListener('click', () => {
            if (!resetTimer) {
                resetBtn.textContent = '再点一次确认重置';
                resetTimer = setTimeout(() => { resetTimer = 0; resetBtn.textContent = '重置设置'; }, 2500);
                return;
            }
            clearTimeout(resetTimer);
            resetSettings();
            closeSettings();
            showToast('已恢复默认设置');
            setTimeout(openSettings, motionOn() ? 260 : 0);
        });

        const closeBtn = h('button', {
            class: 'xt-close-btn', type: 'button', title: '关闭', 'aria-label': '关闭', onClick: closeSettings,
        }, icon('close', 20));

        const overlay = h('div', { class: 'xt-overlay' },
            h('div', { class: 'xt-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'xt-panel-title' },
                h('div', { class: 'xt-panel-head' },
                    closeBtn,
                    h('div', { class: 'xt-panel-title', id: 'xt-panel-title' }, '翻译设置')),
                tabsEl,
                body,
                h('div', { class: 'xt-panel-foot' },
                    h('span', { class: 'xt-foot-actions' }, clearBtn, resetBtn),
                    h('span', null, `v${VERSION}`))));

        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeSettings(); });
        overlay.addEventListener('keydown', (e) => {
            // 放行 Alt+Shift 组合键给全局快捷键处理，其余按键不泄漏给 X 页面
            if (!(e.altKey && e.shiftKey)) e.stopPropagation();
            if (e.key === 'Escape') { closeSettings(); return; }
            if (e.key === 'Tab') {
                const f = Array.from(overlay.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled])'))
                    .filter((n) => n.tabIndex >= 0 && n.getClientRects().length > 0 && !n.closest('[inert]'));
                if (!f.length) return;
                const first = f[0];
                const last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        });
        overlay.addEventListener('click', stopEvt);

        syncDeps();
        selectTab(lastTab);
        document.body.appendChild(overlay);
        panel = { overlay, prevFocus, syncDeps };
        closeBtn.focus({ preventScroll: true });
    }

    if (typeof GM_registerMenuCommand === 'function') {
        const reg = (name, fn) => { try { GM_registerMenuCommand(name, fn); } catch (_) { /* ignore */ } };
        reg('⚙️ 翻译设置', openSettings);
        reg('⚡ 开关自动翻译', () => setAuto(!config.autoTranslate));
        reg('🌐 翻译当前屏幕所有帖子', translateVisibleNow);
        reg('↩️ 还原本页全部译文', clearAllTranslations);
        reg('🎞️ 切换动效档位', cycleMotion);
        reg('🧹 清除译文缓存', () => { clearCaches(); showToast('译文缓存已清除'); });
    }

    /* =====================================================================
     * 12. 悬停触发 / 快捷键 / 官方按钮拦截
     * ===================================================================== */
    let hoverTimer = null;
    let currentEl = null;   // 鼠标当前所在的原文节点
    let hoverBox = null;    // 鼠标当前所在的译文容器 (原文被隐藏后，用它找回对应原文)

    // 滚轮 / 键盘滚动时浏览器会补发 mouseover：只有鼠标真正移动过，才算「用户想翻译这一条」
    let lastX = -1;
    let lastY = -1;
    let movedSinceScroll = true;

    const MOD_KEYS = { alt: ['Alt'], ctrl: ['Control', 'Meta'], shift: ['Shift'] };

    function modifierMatched(e) {
        if (config.triggerKey === 'alt') return e.altKey;
        if (config.triggerKey === 'ctrl') return e.ctrlKey || e.metaKey;
        if (config.triggerKey === 'shift') return e.shiftKey;
        return true;
    }

    function armTranslation(el, immediate = false) {
        clearTimeout(hoverTimer);
        refreshReused(el);
        const st = el.dataset.xtStatus;
        if (st === 'translating' || st === 'translated' || st === 'skipped') return;

        if (!findNativeTranslateButton(el) && shouldSkip(el)) {
            el.dataset.xtStatus = 'skipped';
            return;
        }

        // 限流暂停期内不再发请求，给出提示
        const left = pausedUntil - Date.now();
        if (left > 0) { notePaused(left); return; }

        if (immediate || config.delay <= 0) {
            translateTweet(el);
        } else {
            hoverTimer = setTimeout(() => {
                if (currentEl === el) translateTweet(el);
            }, config.delay);
        }
    }

    function onMouseOver(e) {
        const target = e.target && e.target.closest ? e.target : null;
        if (!target) return;
        hoverBox = target.closest('.xt-box');
        if (config.translateHoverCard && target.closest(HOVER_SEL)) scheduleBioScan();
        if (config.translateProfileBio) {
            const bio = target.closest(BIO_SEL);
            if (bio) {
                if (movedSinceScroll) translateBio(bio);
                return;
            }
        }

        const el = target.closest(TEXT_SEL);
        if (!el || el === currentEl) return;
        currentEl = el;
        if (!modifierMatched(e)) return;
        // 滚动引起的补发事件只记录位置，等鼠标真正动一下再触发 (见 onMouseMove)
        if (!movedSinceScroll) return;
        armTranslation(el, config.triggerKey !== 'none');
    }

    function onMouseMove(e) {
        if (e.clientX === lastX && e.clientY === lastY) return; // 滚动后补发的 mousemove 坐标不变
        lastX = e.clientX;
        lastY = e.clientY;
        if (movedSinceScroll) return;
        movedSinceScroll = true;
        if (currentEl && currentEl.isConnected && modifierMatched(e)) {
            armTranslation(currentEl, config.triggerKey !== 'none');
        }
    }

    let scrollTakeoverTimer = 0;
    function onScroll() {
        movedSinceScroll = false;
        clearTimeout(hoverTimer);
        hoverTimer = null;
        if (config.takeoverNative && !isDetailPage()) {
            if (!scrollTakeoverTimer) {
                scrollTakeoverTimer = setTimeout(() => {
                    scrollTakeoverTimer = 0;
                    takeoverAll(false); // 滚动中使用非强制扫描，不绕过 takeoverSig 缓存
                }, 200);
            }
        }
    }

    function onMouseOut(e) {
        const related = e.relatedTarget;
        if (hoverBox && (!related || !hoverBox.contains(related))) hoverBox = null;
        if (!currentEl) return;
        if (!related || !currentEl.contains(related)) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
            currentEl = null;
        }
    }

    // 强制翻译鼠标所在的帖子：无视「已是目标语言」的判断 (语种标注错误 / 中英混排时很有用)
    // 鼠标停在译文卡片上 (原文已被隐藏) 时，通过卡片找回对应的原文节点
    function forceTranslateHovered() {
        // currentEl 默认指向推文正文；若用户悬停在悬浮名片 (hoverBox) 的简介上，通过 hoverBox 找回简介节点
        let el = currentEl && currentEl.isConnected ? currentEl : null;
        if (!el && hoverBox?.isConnected) el = textElOfBox(hoverBox);
        if (!el || el.closest('.xt-overlay')) {
            showToast('请先把鼠标悬停在要翻译的帖子上', 'off');
            return;
        }
        if (el.dataset.xtStatus === 'translating') return;
        if (!el.matches(TEXT_SEL)) { translateBio(el, { force: true }); return; }
        // 已有译文时保留缓存，仅重新展示；跳过 / 失败的则强制请求
        const hasResult = el.dataset.xtStatus === 'translated' && !!boxOf(el);
        translateTweet(el, { force: !hasResult });
    }

    function onKeyDown(e) {
        // 在输入框 / 编辑器里打字时，只保留 Alt+Shift+T 打开设置，其余快捷键与悬停操作全部跳过 (不干扰 Windows 切换输入法或按 Shift 打大写)
        if (isEditable(e.target)) {
            if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyT') {
                e.preventDefault(); openSettings();
            }
            return;
        }

        if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey) {
            if (e.code === 'KeyT') { e.preventDefault(); openSettings(); return; }
            if (e.code === 'KeyA') { e.preventDefault(); setAuto(!config.autoTranslate); return; }
            if (e.code === 'KeyG') { e.preventDefault(); translateVisibleNow(); return; }
            if (e.code === 'KeyF') { e.preventDefault(); forceTranslateHovered(); return; }
            if (e.code === 'KeyR') { e.preventDefault(); clearAllTranslations(); return; }
            if (e.code === 'KeyM') { e.preventDefault(); cycleMotion(); return; }
        }
        // 只在「修饰键本身」被按下时触发；Ctrl+C / Ctrl+F 等普通组合键不会误触翻译
        if (currentEl && !e.repeat && config.triggerKey !== 'none' &&
            MOD_KEYS[config.triggerKey]?.includes(e.key) && modifierMatched(e)) {
            armTranslation(currentEl, true);
        }
    }

    // 拦截 X 官方自带的「显示翻译」按钮，无缝替换为增强卡片
    function onNativeClick(e) {
        if (!config.takeoverNative) return;
        const btn = e.target?.closest?.('button, [role="button"]');
        if (!btn || btn.closest('.xt-box')) return;
        if (!NATIVE_BTN_RE.test((btn.textContent || '').trim())) return;
        const tweetEl = textElForButton(btn);
        if (!tweetEl) return;
        e.preventDefault();
        e.stopPropagation();
        translateTweet(tweetEl, { force: true });
    }

    /* =====================================================================
     * 13. 统一的 DOM 变更监听 (合并防抖：接管官方翻译 / 简介 / 自动翻译共用一个 Observer)
     * ===================================================================== */
    const pendingNodes = new Set();
    let flushTimer = 0;
    function onMutations(mutations) {
        let any = false;
        for (const m of mutations) {
            for (const n of m.addedNodes) {
                if (n.nodeType !== 1) continue;
                if (n.closest?.(OWN_SEL)) continue; // 忽略脚本自己插入的节点，避免自触发
                pendingNodes.add(n);
                any = true;
            }
        }
        if (any && !flushTimer) flushTimer = setTimeout(flushMutations, 90);
    }

    function flushMutations() {
        flushTimer = 0;
        if (navRestoring) return;
        const nodes = Array.from(pendingNodes);
        pendingNodes.clear();
        const articles = new Set();
        let needBio = false;
        const detail = isDetailPage() && config.autoExpand;

        for (const n of nodes) {
            if (!n.isConnected) continue;
            if (config.takeoverNative) {
                const a = n.closest('article');
                if (a) articles.add(a);
                else n.querySelectorAll('article').forEach((x) => articles.add(x));
            }
            if (!needBio &&
                ((config.translateProfileBio && (n.matches(BIO_SEL) || n.querySelector(BIO_SEL))) ||
                    (config.translateHoverCard && (n.matches(HOVER_SEL) || n.querySelector(HOVER_SEL))))) {
                needBio = true;
            }
            // 只处理新增节点里的正文：登记自动翻译观察 / 详情页展开主帖，不再每次全页扫描
            if (autoIO || detail) {
                const texts = n.matches(TEXT_SEL) ? [n] : [];
                n.querySelectorAll(TEXT_SEL).forEach((t) => texts.push(t));
                for (const t of texts) {
                    if (autoIO) autoWatch(t);
                    if (detail) expandMainTweet(t);
                }
            }
        }
        articles.forEach((a) => takeoverNativeTranslation(a));
        if (needBio) scanBioElements();
    }

    /* =====================================================================
     * 14. 初始化
     * ===================================================================== */
    // 多标签页同步：另一个 X 标签页改了设置，这里即时生效
    function listenRemoteConfig() {
        if (typeof GM_addValueChangeListener !== 'function') return;
        try {
            GM_addValueChangeListener(CFG_KEY, (_name, _old, val, remote) => {
                if (!remote || !val || typeof val !== 'object') return;
                const prevLang = config.targetLang;
                Object.assign(config, sanitize(val));
                syncRootAttrs();
                if (config.autoTranslate) startAuto(); else stopAuto();
                syncActiveBoxesMode('all');
                if (config.takeoverNative) takeoverAll();
                if (panel) closeSettings(); // 面板控件不会随远端更新，直接关闭避免显示过期状态
                if (config.targetLang !== prevLang) retranslateAll();
            });
        } catch (_) { /* ignore */ }
    }

    let initialized = false;
    function init() {
        if (initialized || !document.body) return;
        initialized = true;
        injectStyles();
        refreshTheme();
        observeTheme();
        loadPersistedCache();

        document.addEventListener('mouseover', onMouseOver, { passive: true });
        document.addEventListener('mouseout', onMouseOut, { passive: true });
        document.addEventListener('mousemove', onMouseMove, { passive: true });
        document.addEventListener('scroll', onScroll, { capture: true, passive: true });
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('click', onNativeClick, true);
        // 切到后台时立刻落盘缓存 (移动端 / 标签页被冻结时 pagehide 不一定触发)；回到前台则继续队列
        document.addEventListener('visibilitychange', () => { if (document.hidden) flushCache(); else pump(); });
        window.addEventListener('pagehide', flushCache);

        // 返回时间线过渡期间 (500ms) 暂停后台批量接管与自动翻译，彻底根除上下弹跳
        window.addEventListener('popstate', () => {
            if (isDetailPage()) return;
            navRestoring = true;
            autoTimers.forEach((t) => clearTimeout(t));
            autoTimers.clear();
            queue.filter((j) => j.auto).forEach((j) => { delete j.el.dataset.xtQueued; });
            queue = queue.filter((j) => !j.auto);
            clearTimeout(navRestoreTimer);
            navRestoreTimer = setTimeout(() => {
                navRestoring = false;
                takeoverAll();
            }, 500);
        });

        new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true });
        listenRemoteConfig();

        if (config.autoTranslate) startAuto();
        scanBioElements();
        if (config.takeoverNative) takeoverAll();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();