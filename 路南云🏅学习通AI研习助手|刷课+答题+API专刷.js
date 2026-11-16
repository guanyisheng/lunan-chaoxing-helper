// ==UserScript==
// @name         路南云🏅学习通AI研习助手|刷课+答题+API专刷
// @namespace    http://tampermonkey.net/
// @version      2.4.0
// @description  mooc1 答题侧边栏（作业 dowork 页优先顶层挂载）；极简主题、多 API 配置、容灾切换、流式答题日志。支持菜单手动重载；作业页可选粘贴解除。
// @author       Lunan
// @match        *://*.chaoxing.com/*
// @match        https://mooc1-api.chaoxing.com/*
// @match        http://mooc1-api.chaoxing.com/*
// @match        *://*.edu.cn/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_info
// @grant        GM_registerMenuCommand
// @connect      tc.lunan.cloud
// @connect      sso.chaoxing.com
// @connect      mooc1-api.chaoxing.com
// @connect      mooc1-1.chaoxing.com
// @connect      mooc1-2.chaoxing.com
// @connect      fystat-ans.chaoxing.com
// @connect      api.openai.com
// @connect      api.deepseek.com
// @connect      localhost
// @connect      127.0.0.1
// @connect      *
// @icon         https://tc.lunan.cloud/i/2026/05/31/lsz1xk.png
// ==/UserScript==

/* jshint esversion: 11, browser: true, devel: true, unused: false, undef: false */
/* global GM_xmlhttpRequest, GM_addStyle, GM_getResourceText, GM_info, GM_registerMenuCommand, unsafeWindow, jQuery, $, md5, layui, layer, form, Typr, bootPanel, performance, atob, btoa, chrome, browser */


const systemConfig = {
    buildTime: new Date().toISOString(),
    environment: 'production'
};
class Logger {
    constructor(prefix) {
        this.prefix = prefix || 'System';
        this.levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    }

    log(level, message) {
        if (this.levels.includes(level)) {
            const timestamp = new Date().toISOString();
        }
    }

    debug(msg) { this.log('DEBUG', msg); }
    info(msg) { this.log('INFO', msg); }
    warn(msg) { this.log('WARN', msg); }
    error(msg) { this.log('ERROR', msg); }
}


const logger = new Logger('CXHelper');

const browserCheck = {
    isChrome: () => /Chrome/.test(navigator.userAgent),
    isFirefox: () => /Firefox/.test(navigator.userAgent),
    isEdge: () => /Edge/.test(navigator.userAgent),
    isSafari: () => /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)
};


class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.startTimes = new Map();
    }

    start(name) {
        this.startTimes.set(name, performance.now());
    }

    end(name) {
        const startTime = this.startTimes.get(name);
        if (startTime) {
            const duration = performance.now() - startTime;
            this.metrics.set(name, duration);
            this.startTimes.delete(name);
            return duration;
        }
        return 0;
    }

    getMetric(name) {
        return this.metrics.get(name) || 0;
    }
}


const perfMonitor = new PerformanceMonitor();


const utils = {

    generateId: (length = 8) => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },


    deepClone: (obj) => {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => utils.deepClone(item));
        if (typeof obj === 'object') {
            const cloned = {};
            Object.keys(obj).forEach(key => {
                cloned[key] = utils.deepClone(obj[key]);
            });
            return cloned;
        }
    },


    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },


    throttle: (func, limit) => {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }
};

class CacheManager {
    constructor(maxSize = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    set(key, value, ttl = 300000) { // 默认5分钟过期
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        const item = {
            value: value,
            expiry: Date.now() + ttl
        };
        this.cache.set(key, item);
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }

        return item.value;
    }

    clear() {
        this.cache.clear();
    }
}

const cacheManager = new CacheManager();


logger.info('System initialization completed');

(function() {
'use strict';

const CX_PAGE = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
if (CX_PAGE.__cxHelperFrameLoaded) return;
CX_PAGE.__cxHelperFrameLoaded = true;
try { console.info('[路南云研习助手] 脚本已注入 v2.4.0 |', location.hostname, location.pathname); } catch {}
const CONTACT_EMAIL = 'verify@lunan.cloud';
const PASTE_UNLOCK_KEY = 'cx_paste_unlock_enabled';
const ANSWER_ACCURACY_KEY = 'cx_helper_answer_accuracy';
const DEFAULT_ANSWER_ACCURACY = 100;

function isPasteUnlockEnabled() {
    try { return localStorage.getItem(PASTE_UNLOCK_KEY) === '1'; } catch { return false; }
}

function setPasteUnlockEnabled(enabled) {
    try { localStorage.setItem(PASTE_UNLOCK_KEY, enabled ? '1' : '0'); } catch {}
}

function clampAnswerAccuracy(value) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return DEFAULT_ANSWER_ACCURACY;
    return Math.max(0, Math.min(100, n));
}

function getAnswerAccuracy() {
    try {
        const raw = localStorage.getItem(ANSWER_ACCURACY_KEY);
        if (raw == null || raw === '') return DEFAULT_ANSWER_ACCURACY;
        return clampAnswerAccuracy(raw);
    } catch {
        return DEFAULT_ANSWER_ACCURACY;
    }
}

function setAnswerAccuracy(value) {
    const next = clampAnswerAccuracy(value);
    try { localStorage.setItem(ANSWER_ACCURACY_KEY, String(next)); } catch {}
    return next;
}

function getQuestionOptionLetters(questionInfo) {
    const opts = questionInfo && questionInfo.options;
    if (Array.isArray(opts) && opts.length) {
        return opts.map((_, i) => String.fromCharCode(65 + i));
    }
    if (questionInfo && questionInfo.type === 'judge') return ['A', 'B'];
    return ['A', 'B', 'C', 'D'];
}

function parseCorrectLetters(type, answer) {
    const raw = String(answer || '').trim();
    if (type === 'judge') {
        const val = raw.toLowerCase();
        if (/^a$|对|true|正确/.test(val)) return ['A'];
        if (/^b$|错|false|错误/.test(val)) return ['B'];
        if (/^t$/.test(val)) return ['A'];
        if (/^f$/.test(val)) return ['B'];
        const m = raw.match(/[ABab]/);
        return [m ? m[0].toUpperCase() : 'A'];
    }
    if (type === 'multiple') {
        return raw.toUpperCase().split(/[,，、\s]+/).filter((l) => /^[A-Z]$/.test(l));
    }
    const m = raw.toUpperCase().match(/[A-Z]/);
    return m ? [m[0]] : [];
}

function pickWrongChoiceAnswer(questionInfo, correctAnswer) {
    const type = questionInfo && questionInfo.type;
    const letters = getQuestionOptionLetters(questionInfo);
    const correct = parseCorrectLetters(type, correctAnswer);
    if (type === 'judge' || type === 'single') {
        const right = correct[0] || 'A';
        const pool = letters.filter((l) => l !== right);
        if (!pool.length) return right === 'A' ? 'B' : 'A';
        return pool[Math.floor(Math.random() * pool.length)];
    }
    if (type === 'multiple') {
        const correctSet = new Set(correct);
        let wrong = letters.filter(() => Math.random() < 0.5);
        if (!wrong.length) wrong = [letters[0] || 'A'];
        const same = wrong.length === correctSet.size && wrong.every((l) => correctSet.has(l));
        if (same) {
            const extra = letters.find((l) => !correctSet.has(l));
            if (extra) wrong.push(extra);
            else if (wrong.length > 1) wrong.pop();
            else return null;
        }
        return wrong.join(',');
    }
    return null;
}

function decideAnswerByAccuracy(questionInfo, aiAnswer) {
    const acc = getAnswerAccuracy();
    if (acc >= 100 || Math.random() * 100 < acc) {
        return { answer: aiAnswer, skipped: false, distorted: false };
    }
    const type = questionInfo && questionInfo.type;
    if (type === 'single' || type === 'multiple' || type === 'judge') {
        const wrong = pickWrongChoiceAnswer(questionInfo, aiAnswer);
        if (wrong) return { answer: wrong, skipped: false, distorted: true };
    }
    return { answer: null, skipped: true, distorted: false };
}

function applyAnswerByAccuracy(questionInfo, aiAnswer) {
    if (!aiAnswer) return null;
    const decided = decideAnswerByAccuracy(questionInfo, aiAnswer);
    if (decided.skipped) {
        addLog('按正确率设置跳过本题', 'warn');
        return null;
    }
    if (decided.distorted) {
        addLog('按正确率写入干扰项: ' + decided.answer, 'warn');
    }
    return decided.answer;
}

function syncAnswerAccuracyInputs() {
    const acc = getAnswerAccuracy();
    const range = document.getElementById('cx-answer-accuracy');
    const num = document.getElementById('cx-answer-accuracy-num');
    const label = document.getElementById('cx-answer-accuracy-value');
    if (range) range.value = String(acc);
    if (num) num.value = String(acc);
    if (label) label.textContent = acc + '%';
}

function bindAnswerAccuracyControls() {
    const range = document.getElementById('cx-answer-accuracy');
    const num = document.getElementById('cx-answer-accuracy-num');
    if (!range && !num) return;
    const apply = (value) => {
        const next = setAnswerAccuracy(value);
        if (range) range.value = String(next);
        if (num) num.value = String(next);
        const label = document.getElementById('cx-answer-accuracy-value');
        if (label) label.textContent = next + '%';
    };
    range?.addEventListener('input', () => apply(range.value));
    num?.addEventListener('input', () => apply(num.value));
    num?.addEventListener('change', () => apply(num.value));
    syncAnswerAccuracyInputs();
}

function isPasteUnlockWorkPage(url) {
    try {
        const u = new URL(String(url || location.href), location.origin);
        if (!/\.chaoxing\.com$/i.test(u.hostname)) return false;
        if (/\/mooc-ans\/mooc2\/work/i.test(u.pathname)) return true;
        if (/[?&]workId=/i.test(u.search)) return true;
    } catch {}
    return false;
}

function initPasteUnlockModule(win) {
    if (!win || win.__cxPasteUnlockLoaded) return;
    win.__cxPasteUnlockLoaded = true;

    Object.defineProperty(win, 'editorPaste', {
        value: function() { return true; },
        writable: false,
        configurable: false
    });

    let _ueditor_config;
    Object.defineProperty(win, 'UEDITOR_CONFIG', {
        get() { return _ueditor_config; },
        set(newConfig) {
            if (newConfig) {
                newConfig.disablePasteImage = false;
                newConfig.disableDraggable = false;
                try {
                    Object.defineProperty(newConfig, 'disablePasteImage', {
                        get() { return false; },
                        set() {},
                        configurable: true
                    });
                    Object.defineProperty(newConfig, 'disableDraggable', {
                        get() { return false; },
                        set() {},
                        configurable: true
                    });
                } catch {}
            }
            _ueditor_config = newConfig;
        },
        configurable: true
    });

    let _UE;
    const _patchedEditors = new WeakSet();

    function saveUndoSnapshot(editor) {
        try {
            if (editor.undoManger && editor.undoManger.save) editor.undoManger.save();
        } catch {}
    }

    function insertImageFallback(doc, dataUrl) {
        try {
            const img = doc.createElement('img');
            img.src = dataUrl;
            img.alt = '粘贴的图片';
            const selection = doc.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(img);
                range.setStartAfter(img);
                selection.removeAllRanges();
                selection.addRange(range);
            } else {
                doc.body.appendChild(img);
            }
        } catch {}
    }

    function setupEditorHandlers(editor) {
        if (_patchedEditors.has(editor)) return;
        _patchedEditors.add(editor);

        let doc;
        try { doc = editor.editor.document; } catch { return; }
        if (!doc) return;

        doc.addEventListener('paste', function(e) {
            const cd = e.clipboardData || win.clipboardData;
            if (!cd) return;

            const imageItem = Array.from(cd.items || []).find(
                item => item.type && item.type.startsWith('image/')
            );

            if (imageItem) {
                e.preventDefault();
                e.stopPropagation();
                const file = imageItem.getAsFile();
                if (!file) return;
                const reader = new FileReader();
                reader.onload = function(evt) {
                    const dataUrl = evt.target.result;
                    try {
                        editor.execCommand('insertimage', {
                            src: dataUrl,
                            _src: dataUrl,
                            alt: '粘贴的图片'
                        });
                    } catch {
                        insertImageFallback(doc, dataUrl);
                    }
                    saveUndoSnapshot(editor);
                };
                reader.readAsDataURL(file);
                return;
            }

            setTimeout(() => saveUndoSnapshot(editor), 50);
            setTimeout(() => saveUndoSnapshot(editor), 200);
        }, true);

        doc.addEventListener('keydown', function(e) {
            if (!(e.ctrlKey || e.metaKey)) return;
            const isUndo = (e.key === 'z' || e.keyCode === 90) && !e.shiftKey;
            const isRedo = (e.key === 'y' || e.keyCode === 89)
                || ((e.key === 'z' || e.keyCode === 90) && e.shiftKey);
            if (isUndo || isRedo) {
                e.preventDefault();
                e.stopPropagation();
                try { editor.execCommand(isUndo ? 'undo' : 'redo'); } catch {}
            }
        }, true);

        try {
            editor.addListener('afterpaste', function() {
                setTimeout(() => saveUndoSnapshot(editor), 10);
                setTimeout(() => saveUndoSnapshot(editor), 100);
                setTimeout(() => saveUndoSnapshot(editor), 300);
            });
        } catch {}

        let _lastContent = '';
        let _saveTimer = null;
        try {
            const observer = new MutationObserver(function() {
                clearTimeout(_saveTimer);
                _saveTimer = setTimeout(function() {
                    try {
                        const currentContent = editor.getContent();
                        if (currentContent !== _lastContent) {
                            _lastContent = currentContent;
                            saveUndoSnapshot(editor);
                        }
                    } catch {}
                }, 200);
            });
            observer.observe(doc.body || doc.documentElement, {
                childList: true,
                subtree: true,
                characterData: true
            });
        } catch {}
    }

    Object.defineProperty(win, 'UE', {
        get() { return _UE; },
        set(newUE) {
            _UE = newUE;
            if (newUE && typeof newUE.getEditor === 'function') {
                const originalGetEditor = newUE.getEditor;
                newUE.getEditor = function(id, options) {
                    options = options || {};
                    options.pasteplain = false;
                    const editor = originalGetEditor.call(this, id, options);
                    const intervalId = setInterval(() => {
                        try {
                            if (editor && editor.editor && editor.options) {
                                clearInterval(intervalId);
                                editor.options.pasteplain = false;
                                editor.options.disablePasteImage = false;
                                editor.options.disableDraggable = false;
                                setupEditorHandlers(editor);
                            }
                        } catch {
                            clearInterval(intervalId);
                        }
                    }, 100);
                    return editor;
                };
            }
        },
        configurable: true
    });

    function removeElementRestrictions(element) {
        if (!element) return;
        ['paste', 'contextmenu', 'keydown', 'selectstart', 'dragstart', 'copy', 'cut']
            .forEach(event => {
                element['on' + event] = null;
                element.removeAttribute('on' + event);
            });
        element.removeAttribute('readonly');
        element.removeAttribute('disabled');
        Object.assign(element.style, {
            userSelect: 'text',
            webkitUserSelect: 'text',
            mozUserSelect: 'text',
            msUserSelect: 'text',
            pointerEvents: 'auto'
        });
    }

    function removeGlobalRestrictions() {
        ['paste', 'contextmenu', 'selectstart', 'dragstart', 'copy', 'cut', 'keydown']
            .forEach(event => { document['on' + event] = null; });
        const style = document.createElement('style');
        style.textContent = `
            * {
                -webkit-user-select: text !important;
                -moz-user-select: text !important;
                -ms-user-select: text !important;
                user-select: text !important;
            }
            input, textarea, [contenteditable] {
                user-select: text !important;
                pointer-events: auto !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function startMutationObserver() {
        if (!document.body) return;
        new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    if (node.matches && node.matches('input, textarea, [contenteditable]')) {
                        removeElementRestrictions(node);
                    }
                    if (node.tagName === 'IFRAME') {
                        setTimeout(() => {
                            try {
                                const iframeDoc = node.contentDocument;
                                if (iframeDoc) {
                                    iframeDoc.querySelectorAll('input, textarea, [contenteditable]')
                                        .forEach(el => removeElementRestrictions(el));
                                }
                            } catch {}
                        }, 500);
                    }
                    if (node.querySelectorAll) {
                        node.querySelectorAll('input, textarea, [contenteditable]')
                            .forEach(el => removeElementRestrictions(el));
                    }
                });
            });
        }).observe(document.body, { childList: true, subtree: true });
    }

    function enableExistingElements() {
        document.querySelectorAll('input, textarea, [contenteditable]')
            .forEach(el => removeElementRestrictions(el));
    }

    function setupGlobalShortcuts() {
        document.addEventListener('keydown', function(e) {
            if (!(e.ctrlKey || e.metaKey)) return;
            const isUndo = (e.key === 'z' || e.keyCode === 90) && !e.shiftKey;
            const isRedo = (e.key === 'y' || e.keyCode === 89)
                || ((e.key === 'z' || e.keyCode === 90) && e.shiftKey);
            if (!isUndo && !isRedo) return;
            try {
                if (typeof win.UE !== 'undefined' && win.UE.instants) {
                    for (const key in win.UE.instants) {
                        const ed = win.UE.instants[key];
                        if (ed && ed.isFocus && ed.isFocus()) {
                            e.preventDefault();
                            e.stopPropagation();
                            ed.execCommand(isUndo ? 'undo' : 'redo');
                            return;
                        }
                    }
                }
            } catch {}
        }, true);
    }

    function initPasteUnlockDom() {
        removeGlobalRestrictions();
        enableExistingElements();
        startMutationObserver();
        setupGlobalShortcuts();
    }

    if (document.body) initPasteUnlockDom();
    else document.addEventListener('DOMContentLoaded', initPasteUnlockDom);
}

if (isPasteUnlockEnabled() && isPasteUnlockWorkPage(location.href)) {
    initPasteUnlockModule(CX_PAGE);
}

const API_MGR_STORAGE_KEY = 'cx_helper_api_mgr_v4';
const API_PRESETS = {
openai: {
    name: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    models: [{ label: 'gpt-4o-mini', model: 'gpt-4o-mini', context: '128000' }]
},
deepseek: {
    name: 'DeepSeek',
    url: 'https://api.deepseek.com/v1/chat/completions',
    models: [{ label: 'deepseek-chat', model: 'deepseek-chat', context: '64000' }]
},
ollama: {
    name: 'Ollama',
    url: 'http://localhost:11434/v1/chat/completions',
    models: [{ label: 'llama3', model: 'llama3', context: '' }]
}
};

function genApiId() {
return 'api_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function createDefaultApiEntry(presetKey) {
const p = API_PRESETS[presetKey] || API_PRESETS.openai;
return {
    id: genApiId(),
    name: p.name,
    url: p.url,
    apiKey: '',
    models: JSON.parse(JSON.stringify(p.models)),
    selectedModelIndex: 0,
    failoverEnabled: true,
    enabled: true,
    provider: presetKey
};
}

function createDefaultApiManagerState() {
const openai = createDefaultApiEntry('openai');
openai.id = 'api_openai_default';
return {
    failoverEnabled: true,
    defaultApiId: openai.id,
    currentApiId: openai.id,
    apis: [openai]
};
}

function migrateApiManagerState(state) {
if (!state || !Array.isArray(state.apis)) return createDefaultApiManagerState();
state.apis = state.apis.filter(a => a && !(a.provider === 'lunan' || a.provider === 'proxy' || a.id === 'api_lunan_proxy'));
if (!state.apis.length) return createDefaultApiManagerState();
if (!state.apis.some(a => a.id === state.defaultApiId)) state.defaultApiId = state.apis[0].id;
if (!state.apis.some(a => a.id === state.currentApiId)) state.currentApiId = state.apis[0].id;
return state;
}

function loadApiManagerState() {
try {
    const raw = localStorage.getItem(API_MGR_STORAGE_KEY);
    if (raw) {
        const parsed = migrateApiManagerState(JSON.parse(raw));
        if (parsed && Array.isArray(parsed.apis) && parsed.apis.length) return parsed;
    }
    const legacyRaw = localStorage.getItem('cx_helper_api_mgr_v3');
    if (legacyRaw) {
        const parsed = migrateApiManagerState(JSON.parse(legacyRaw));
        if (parsed && Array.isArray(parsed.apis) && parsed.apis.length) {
            try { localStorage.setItem(API_MGR_STORAGE_KEY, JSON.stringify(parsed)); } catch {}
            return parsed;
        }
    }
} catch {}
return createDefaultApiManagerState();
}

let API_MANAGER = loadApiManagerState();

function saveApiManagerState(state) {
if (state) API_MANAGER = state;
try { localStorage.setItem(API_MGR_STORAGE_KEY, JSON.stringify(API_MANAGER)); } catch {}
}

function getApiById(id) {
return (API_MANAGER.apis || []).find(a => a.id === id) || null;
}

function getCurrentApi() {
return getApiById(API_MANAGER.currentApiId) || getApiById(API_MANAGER.defaultApiId) || (API_MANAGER.apis || [])[0] || null;
}

function getDefaultApi() {
return getApiById(API_MANAGER.defaultApiId) || (API_MANAGER.apis || [])[0] || null;
}

function getSelectedModel(api) {
if (!api || !api.models || !api.models.length) return '';
const idx = Math.min(Math.max(0, api.selectedModelIndex || 0), api.models.length - 1);
return (api.models[idx].model || '').trim();
}

function getSelectedModelLabel(api) {
if (!api || !api.models || !api.models.length) return '';
const idx = Math.min(Math.max(0, api.selectedModelIndex || 0), api.models.length - 1);
return (api.models[idx].label || api.models[idx].model || '').trim();
}

function isOllamaLikeApi(api) {
const url = (api && api.url) || '';
return /ollama|11434|localhost|127\.0\.0\.1/i.test(url) || (api && api.provider === 'ollama');
}

function getApiChatUrl(api) {
return (api && api.url || '').trim();
}

function getApiModel(api) {
return getSelectedModel(api);
}

function isApiEntryConfigured(api) {
if (!api || api.enabled === false) return false;
const model = getSelectedModel(api);
if (!model) return false;
const url = (api.url || '').trim();
if (!url) return false;
if (isOllamaLikeApi(api)) return true;
const key = (api.apiKey || '').trim();
return !!key && key !== 'sk-你的密钥';
}

function isLocalApiManagerConfigured() {
return (API_MANAGER.apis || []).some(a => isApiEntryConfigured(a));
}

function getApisForFailover() {
const defaultApi = getDefaultApi();
const ordered = [];
const seen = new Set();
const push = (a) => {
    if (!a || seen.has(a.id) || a.enabled === false) return;
    if (!isApiEntryConfigured(a)) return;
    seen.add(a.id);
    ordered.push(a);
};
push(defaultApi);
if (API_MANAGER.failoverEnabled) {
    (API_MANAGER.apis || []).forEach(a => {
        if (a.failoverEnabled !== false) push(a);
    });
}
return ordered;
}

function buildHeadersForApi(api) {
const headers = { 'Content-Type': 'application/json' };
const key = (api && api.apiKey || '').trim();
if (key) headers['Authorization'] = 'Bearer ' + key;
return headers;
}

function setActiveApiId(id) {
API_MANAGER.currentApiId = id;
saveApiManagerState();
try { updateAiStatusBadge(); } catch {}
}

function getModelsUrlFromChatUrl(chatUrl) {
const url = (chatUrl || '').trim().replace(/\/$/, '');
if (/\/chat\/completions$/i.test(url)) return url.replace(/\/chat\/completions$/i, '/models');
if (/\/completions$/i.test(url)) return url.replace(/\/completions$/i, '/models');
if (/\/models$/i.test(url)) return url;
return url + '/models';
}

function getApiModelsEndpoint(api) {
    const chatUrl = (api && api.url) || '';
    return getModelsUrlFromChatUrl(chatUrl);
}

function parseModelsListPayload(data) {
    let raw = [];
    if (Array.isArray(data)) raw = data;
    else if (Array.isArray(data?.data)) raw = data.data;
    else if (Array.isArray(data?.models)) raw = data.models;
    else if (Array.isArray(data?.data?.data)) raw = data.data.data;
    return raw.map((m) => {
        if (typeof m === 'string') return { label: m, model: m, context: '' };
        const id = (m && (m.id || m.name || m.model)) || '';
        const ctx = (m && (m.context_length || m.context || m.max_model_len || m.max_tokens)) || '';
        return { label: id, model: id, context: ctx ? String(ctx) : '' };
    }).filter((m) => m.model);
}

let _cxFetchModelsTimer = null;
const _cxAutoFetchedModelKeys = new Set();

function canAutoDetectModels(api) {
    if (!api) return false;
    if (!(api.url || '').trim()) return false;
    if (isOllamaLikeApi(api)) return true;
    return !!(api.apiKey || '').trim();
}

function setApiModelDetectStatus(text, ok) {
    const el = document.getElementById('cx-api-model-status');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = ok === false ? 'var(--cx-danger)' : (ok ? 'var(--cx-success)' : '');
}

function mergeFetchedApiModels(api, list) {
    const existing = Array.isArray(api.models) ? api.models.slice() : [];
    const placeholder = !existing.length || existing.every((m) => {
        const id = (m.model || '').trim();
        return !id || /^(model-name|gpt-4o-mini|deepseek-chat|llama3|远程模型)$/i.test(id);
    });
    if (placeholder) {
        api.models = list.slice();
        api.selectedModelIndex = 0;
        return list.length;
    }
    const seen = new Set(existing.map((m) => (m.model || '').trim()));
    list.forEach((m) => {
        if (m.model && !seen.has(m.model)) {
            existing.push(m);
            seen.add(m.model);
        }
    });
    api.models = existing;
    return list.length;
}

async function autoDetectApiModels(api, opts) {
    opts = opts || {};
    if (!canAutoDetectModels(api)) return;
    const key = (api.id || '') + '|' + (api.url || '');
    if (!opts.force && _cxAutoFetchedModelKeys.has(key)) return;
    _cxAutoFetchedModelKeys.add(key);
    setApiModelDetectStatus('正在自动检测模型列表...', null);
    try {
        const list = await fetchModelsForApi(api);
        if (!list.length) throw new Error('未返回模型');
        mergeFetchedApiModels(api, list);
        saveApiManagerState();
        if (document.getElementById('cx-api-settings-body')) {
            renderApiSettingsBody({ skipAutoDetect: true });
        }
        setApiModelDetectStatus('已自动检测到 ' + list.length + ' 个模型', true);
        addLog('已自动检测 ' + (api.name || 'API') + ' 模型 ' + list.length + ' 个', 'success');
        try { updateAiStatusBadge(); } catch {}
    } catch (e) {
        _cxAutoFetchedModelKeys.delete(key);
        setApiModelDetectStatus('自动检测失败: ' + (e.message || e) + '（可点「获取模型列表」重试）', false);
    }
}

function scheduleAutoDetectApiModels(api) {
    clearTimeout(_cxFetchModelsTimer);
    _cxFetchModelsTimer = setTimeout(() => autoDetectApiModels(api, { force: true }), 900);
}

function parseSseChunkText(text, state) {
state.buffer += text;
const lines = state.buffer.split('\n');
state.buffer = lines.pop() || '';
const deltas = [];
for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === '[DONE]') continue;
    try {
        const json = JSON.parse(payload);
        const delta = (json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content)
            || (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content)
            || '';
        if (delta) deltas.push(delta);
    } catch {}
}
return deltas;
}

function fetchModelsForApi(api) {
const url = getApiModelsEndpoint(api);
if (!url) return Promise.reject(new Error('API 地址未配置'));
return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: buildHeadersForApi(api),
        timeout: 15000,
        onload: (r) => {
            if (r.status >= 200 && r.status < 300) {
                try {
                    const data = JSON.parse(r.responseText);
                    resolve(parseModelsListPayload(data));
                } catch (e) { reject(e); }
            } else {
                reject(new Error('HTTP ' + r.status + ': ' + String(r.responseText || '').slice(0, 120)));
            }
        },
        onerror: () => reject(new Error('无法连接模型列表接口')),
        ontimeout: () => reject(new Error('获取模型列表超时'))
    });
});
}

function streamChatForApi(api, messages, options, onChunk) {
const model = getApiModel(api);
const url = getApiChatUrl(api);
if (!url) return Promise.reject(new Error('API 地址未配置'));
if (!model) return Promise.reject(new Error('模型未配置'));
const timeoutMs = options.timeoutMs || 120000;
return new Promise((resolve, reject) => {
    let lastLen = 0;
    let full = '';
    const sseState = { buffer: '' };
    GM_xmlhttpRequest({
        method: 'POST',
        url,
        headers: buildHeadersForApi(api),
        data: JSON.stringify({ model, messages, stream: true, ...options }),
        timeout: timeoutMs,
        onreadystatechange(resp) {
            try {
                if (resp.readyState >= 3) {
                    const chunk = String(resp.responseText || '').slice(lastLen);
                    lastLen = String(resp.responseText || '').length;
                    const deltas = parseSseChunkText(chunk, sseState);
                    for (const d of deltas) {
                        full += d;
                        if (onChunk) onChunk(d, full);
                    }
                }
                if (resp.readyState === 4) {
                    if (resp.status >= 200 && resp.status < 300) {
                        if (!full.trim()) {
                            try {
                                const data = JSON.parse(resp.responseText);
                                full = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
                                if (full && onChunk) onChunk(full, full);
                            } catch {}
                        }
                        resolve({ content: full, api });
                    } else {
                        reject(new Error('HTTP ' + resp.status + ': ' + String(resp.responseText || '').slice(0, 200)));
                    }
                }
            } catch (e) {
                if (resp.readyState === 4) reject(e);
            }
        },
        onerror: () => reject(new Error('无法连接 AI 服务')),
        ontimeout: () => reject(new Error('AI 响应超时'))
    });
});
}

async function aiChatWithFailover(messages, options, onChunk) {
const apis = getApisForFailover();
if (!apis.length) {
    throw new Error('AI 未配置：请在「设置 → AI 接口」中填写接口地址与 API Key');
}

let lastErr = null;
for (let i = 0; i < apis.length; i++) {
    const api = apis[i];
    try {
        if (i > 0) addLog('容灾切换 → ' + api.name, 'warn');
        setActiveApiId(api.id);
        const result = await streamChatForApi(api, messages, options, onChunk);
        return { choices: [{ message: { content: result.content } }], _api: api };
    } catch (e) {
        lastErr = e;
        if (i < apis.length - 1 && API_MANAGER.failoverEnabled) {
            addLog('[' + api.name + '] 失败: ' + e.message, 'warn');
        }
    }
}
throw lastErr || new Error('所有 API 均调用失败');
}

function getActiveAiDisplayInfo() {
const local = getCurrentApi();
if (local && isApiEntryConfigured(local)) {
    return {
        tag: local.name || 'API',
        model: getSelectedModelLabel(local) || getSelectedModel(local)
    };
}
return { tag: '未配置', model: '' };
}

function deepseekChat(messages, options = {}) {
return aiChatWithFailover(messages, options, null);
}
let isAnswering = false;
let questionCatalog = null;
let questionSelection = new Set();
let isStudyingChapters = false;
let studyIntervalId = null;
const PANEL_REG_KEY = 'cx_helper_active_panel_v2';
const PANEL_REOPEN_KEY = 'cx_helper_reopen_panel';
const CX_ROOT_ID = 'cx-helper-root';
const CX_SIDEBAR_WIDTH = 380;
const CX_SIDEBAR_WIDE_WIDTH = 720;
const CX_SIDEBAR_TAB_POS_KEY = 'cx_helper_sidebar_tab_top';
const CX_SIDEBAR_TAB_CLICK_THRESHOLD = 5;
let cxPanelVisible = false;
let cxForceOpenSidebar = false;
const PANEL_INSTANCE_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const FRAME_DEPTH = (() => { let d = 0; try { let w = window; while (w !== w.top) { d++; w = w.parent; } } catch { d = 999; } return d; })();
let isActiveOwner = false;
let createdPanelEl = null;
const HEARTBEAT_INTERVAL_MS = 2000;
const STALE_MS = 4000;
let heartbeatTimerId = null;
let lastAutoSkipTs = 0;
let emptyChecksCount = 0;
let lastEmptySectionKey = '';
let currentStudySectionKey = '';
let chapterQuizHandledSectionKey = '';
let chapterQuizEnteringSectionKey = '';
let chapterQuizEnterRetryAt = 0;

const CX_PANEL_HOSTS = ['mooc1.chaoxing.com', 'mooc1-api.chaoxing.com', 'mooc2-ans.chaoxing.com'];

function isCxPanelHost(hostname) {
    return CX_PANEL_HOSTS.includes(String(hostname || '').toLowerCase());
}

function isChapterStudyFrameHostUrl(url) {
    return /^https:\/\/(?:mooc1|mooc2-ans)\.chaoxing\.com\/mycourse\/studentstudy\?chapterId(?:=|%3D)/i.test(String(url || ''));
}

function isChapterStudyPageContext() {
    try {
        if (isChapterStudyFrameHostUrl(window.top.location.href)) return true;
    } catch {}
    try {
        if (isChapterStudyFrameHostUrl(location.href)) return true;
    } catch {}
    return false;
}

function shouldPreferOuterFramePanel() {
    try {
        if (isMooc1WorkPage(window.top.location.href)) return true;
        if (isChapterStudyFrameHostUrl(window.top.location.href)) return true;
    } catch {}
    try {
        if (isMooc1WorkPage(location.href)) return true;
        return isChapterStudyFrameHostUrl(location.href);
    } catch {}
    return false;
}

function isTopWindow() {
    try { return window.self === window.top; } catch { return true; }
}

function isNestedInFrame() {
    try { return window.self !== window.top; } catch { return false; }
}

function canAccessTopWindow() {
    try {
        void window.top.location.href;
        return true;
    } catch { return false; }
}

function topIsPanelContext() {
    try { return isMooc1PanelContext(window.top.location.href); } catch { return false; }
}

/** 同一浏览器标签页只挂载一个面板：优先顶层窗口，子 iframe 不重复创建 */
function shouldMountPanelInThisFrame(force) {
    if (force) return true;
    if (!isMooc1PanelContext()) return false;
    if (!isNestedInFrame()) return true;
    if (canAccessTopWindow() && topIsPanelContext()) return false;
    try {
        if (isMooc1WorkPage(window.top.location.href)) return false;
    } catch {}
    return !shouldPreferOuterFramePanel() || FRAME_DEPTH === 0;
}

function isWorkPageOwnerFrame() {
    return isMooc1WorkPage(location.href) && shouldMountPanelInThisFrame();
}

function forceWorkPageOwnership() {
    if (!shouldMountPanelInThisFrame()) return false;
    const nowTs = Date.now();
    setActivePanelRecord({
        id: PANEL_INSTANCE_ID,
        depth: FRAME_DEPTH,
        ts: nowTs,
        aliveTs: nowTs,
        url: location.href,
        workPage: isMooc1WorkPage(location.href),
        isTop: isTopWindow()
    });
    isActiveOwner = true;
    return true;
}

const CX_API_BRUSH_PAGE_URL = 'https://i.chaoxing.com/base/settings';

function openApiBrushPage() {
    try {
        if (typeof unsafeWindow.__cxOpenBrushPage === 'function') {
            unsafeWindow.__cxOpenBrushPage(CX_API_BRUSH_PAGE_URL);
            return;
        }
    } catch {}
    window.open(CX_API_BRUSH_PAGE_URL, '_blank');
}

function isMooc1WorkPage(url) {
    try {
        const u = new URL(String(url || location.href), location.origin);
        if (!/\.chaoxing\.com$/i.test(u.hostname)) return false;
        if (/\/mooc-ans\/mooc2\/work\/(?:dowork|view)/i.test(u.pathname)) return true;
        if (/[?&]workId=/i.test(u.search)) return true;
    } catch {}
    return false;
}

function isMooc1PanelContext(url) {
    try {
        const check = (href) => {
            const u = new URL(String(href), location.origin);
            if (isCxPanelHost(u.hostname)) return true;
            return isMooc1WorkPage(href);
        };
        if (url) return check(url);
        if (check(location.href)) return true;
        try {
            if (window.top !== window) return check(window.top.location.href);
        } catch {}
    } catch {}
    return false;
}

function isPanelBlockedPage(url) {
    return !isMooc1PanelContext(url);
}

const PLUGIN_ICON_URL = 'https://tc.lunan.cloud/i/2026/05/31/lsz1xk.png';

const CX_SVG_ICONS = {
    logo: '<path d="M12 3 2 8l10 5 10-5-10-5Z" fill="#818cf8"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 8v7" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    minus: '<path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    play: '<polygon points="8,5 19,12 8,19" fill="currentColor"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>',
    skipForward: '<polygon points="8,5 16,12 8,19" fill="currentColor"/><rect x="17" y="5" width="3" height="14" rx="1" fill="currentColor"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
    check: '<path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    warning: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v4M12 17h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    info: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 16v-4M12 8h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    error: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15 9-6 6M9 9l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    spinner: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M21 3v6h-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="8" y="2" width="8" height="4" rx="1" stroke="currentColor" stroke-width="2" fill="none"/>'
};

function cxIcon(name, opts) {
    opts = opts || {};
    const size = opts.size || 20;
    const inner = CX_SVG_ICONS[name];
    if (!inner) return '';
    const cls = ['cx-svg', 'cx-svg-' + name, opts.className || '', opts.spin ? 'cx-svg-spin' : ''].filter(Boolean).join(' ');
    return '<svg class="' + cls + '" xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + inner + '</svg>';
}

function cxPluginLogoImg(opts) {
    opts = opts || {};
    const size = opts.size || 24;
    const cls = ['cx-plugin-logo-img', opts.className || ''].filter(Boolean).join(' ');
    return '<img class="' + cls + '" src="' + PLUGIN_ICON_URL + '" alt="路南研习助手" width="' + size + '" height="' + size + '" draggable="false" decoding="async" />';
}

function cxLogIconName(type) {
    const map = { success: 'check', error: 'error', warning: 'warning', warn: 'warning', info: 'info', debug: 'info' };
    return map[type] || 'info';
}

function cxIconLabel(name, text, opts) {
    return '<span class="cx-icon-label">' + cxIcon(name, opts) + '<span>' + text + '</span></span>';
}
const PANEL_TASK_RETRY_MAX = 15;
const PANEL_TASK_RETRY_MS = 400;
let pluginLoaderEl = null;
let pluginLoaderProgress = 0;
let pluginLoaderHideTimer = null;
let panelTaskRetryCount = 0;
let questionLoadRunning = false;
let pluginLoadRunning = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function showPluginLoader() {
    if (pluginLoaderEl || !document.body) return;
    const wrap = document.createElement('div');
    wrap.id = 'cx-plugin-loader';
    wrap.innerHTML =
        '<div class="cx-loader-card">' +
            '<div class="cx-loader-icon">' + cxPluginLogoImg({ size: 72, className: 'cx-loader-logo' }) + '</div>' +
            '<div class="cx-loader-title">路南学习通研习助手</div>' +
            '<div class="cx-loader-sub">智能刷课 · 自动答题</div>' +
            '<div class="cx-loader-steps">' +
                '<div class="cx-loader-step cx-step-active" data-step="1">' +
                    '<span class="cx-loader-step-dot"></span>' +
                    '<span class="cx-loader-step-text">插件加载</span>' +
                '</div>' +
                '<div class="cx-loader-step" data-step="2">' +
                    '<span class="cx-loader-step-dot"></span>' +
                    '<span class="cx-loader-step-text">题目识别</span>' +
                '</div>' +
            '</div>' +
            '<div class="cx-loader-track"><div class="cx-loader-bar"></div></div>' +
            '<div class="cx-loader-meta">' +
                '<span class="cx-loader-status">插件启动中...</span>' +
                '<span class="cx-loader-percent">0%</span>' +
            '</div>' +
        '</div>';
    document.body.appendChild(wrap);
    pluginLoaderEl = wrap;
    pluginLoaderProgress = 0;
    requestAnimationFrame(() => wrap.classList.add('cx-loader-visible'));
}

function setLoaderStep(step, state) {
    if (!pluginLoaderEl) return;
    pluginLoaderEl.querySelectorAll('.cx-loader-step').forEach((el) => {
        const n = parseInt(el.getAttribute('data-step'), 10);
        el.classList.remove('cx-step-active', 'cx-step-done');
        if (n < step || (n === step && state === 'done')) el.classList.add('cx-step-done');
        else if (n === step && state === 'active') el.classList.add('cx-step-active');
    });
}

function setPluginLoaderProgress(pct, text) {
    if (!pluginLoaderEl) showPluginLoader();
    if (!pluginLoaderEl) return;
    pluginLoaderProgress = Math.max(pluginLoaderProgress, Math.min(100, pct));
    const bar = pluginLoaderEl.querySelector('.cx-loader-bar');
    const status = pluginLoaderEl.querySelector('.cx-loader-status');
    const percent = pluginLoaderEl.querySelector('.cx-loader-percent');
    if (bar) bar.style.width = pluginLoaderProgress + '%';
    if (status && text) status.textContent = text;
    if (percent) percent.textContent = Math.round(pluginLoaderProgress) + '%';
}

function hidePluginLoader(delay) {
    if (!pluginLoaderEl) return;
    if (pluginLoaderHideTimer) clearTimeout(pluginLoaderHideTimer);
    pluginLoaderHideTimer = setTimeout(() => {
        if (!pluginLoaderEl) return;
        pluginLoaderEl.classList.add('cx-loader-hide');
        setTimeout(() => {
            try { pluginLoaderEl.remove(); } catch {}
            pluginLoaderEl = null;
            pluginLoaderHideTimer = null;
        }, 380);
    }, delay == null ? 450 : delay);
}

async function runPluginLoadSequence() {
    if (pluginLoadRunning) return;
    pluginLoadRunning = true;
    showPluginLoader();
    try {
        setLoaderStep(1, 'active');
        setPluginLoaderProgress(12, '插件启动中...');
        await sleep(50);

        setPluginLoaderProgress(35, '正在加载 API 配置...');
        await sleep(60);

        setPluginLoaderProgress(65, isLocalApiManagerConfigured() ? 'AI 服务已就绪' : '等待 AI 配置...');
        setPluginLoaderProgress(85, '初始化操作面板...');
        mountPanelIfOwner();
        try { updateAiStatusBadge(); } catch {}

        setLoaderStep(1, 'done');
        setPluginLoaderProgress(100, '插件加载完成');
        hidePluginLoader(350);

        runQuestionLoadSequence();
    } catch {
        hidePluginLoader(200);
        mountPanelIfOwner();
        runQuestionLoadSequence();
    } finally {
        pluginLoadRunning = false;
    }
}

function setQuestionLoadStatus(text) {
    const panel = document.getElementById('answer-helper-panel');
    const listEl = document.getElementById('cx-qp-list');
    if (!listEl) return;
    panel?.classList.add('has-question-picker');
    syncCxSidebarPush();
    listEl.innerHTML =
        '<div class="cx-qp-loading">' +
            cxIcon('spinner', { size: 28, className: 'cx-qp-spinner-svg', spin: true }) +
            '<span>' + text + '</span>' +
        '</div>';
}

async function runQuestionLoadSequence() {
    if (questionLoadRunning) return;
    questionLoadRunning = true;
    panelTaskRetryCount = 0;
    setQuestionLoadStatus('正在识别题目...');

    try {
        let attempt = 0;
        while (attempt < PANEL_TASK_RETRY_MAX) {
            if (hasDetectableTaskDeep()) break;
            attempt++;
            panelTaskRetryCount = attempt;
            setQuestionLoadStatus('扫描题目 (' + attempt + '/' + PANEL_TASK_RETRY_MAX + ')...');
            await sleep(PANEL_TASK_RETRY_MS);
        }

        if (hasDetectableTaskDeep()) {
            refreshQuestionPicker();
            const n = questionCatalog?.items?.length || 0;
            if (n > 0) {
                addLog('题目加载完成，共 ' + n + ' 题', 'success');
            } else {
                setQuestionLoadStatus('暂未识别到题目，可点刷新重试');
            }
        } else {
            const panel = document.getElementById('answer-helper-panel');
            panel?.classList.remove('has-question-picker');
            syncCxSidebarPush();
            showNoTaskToast();
        }
    } catch {
        setQuestionLoadStatus('题目识别失败，请点刷新重试');
    } finally {
        questionLoadRunning = false;
    }
}

function beginPluginLoadSequence() {
    runPluginLoadSequence();
}

function resetPluginRuntimeForReload() {
    pluginLoadRunning = false;
    questionLoadRunning = false;
    panelTaskRetryCount = 0;
    if (pluginLoaderHideTimer) {
        clearTimeout(pluginLoaderHideTimer);
        pluginLoaderHideTimer = null;
    }
    try { document.getElementById('cx-plugin-loader')?.remove(); } catch {}
    pluginLoaderEl = null;
    pluginLoaderProgress = 0;
}

function forceClaimPanelOwnership(force) {
    if (!shouldMountPanelInThisFrame(!!force)) return false;
    const nowTs = Date.now();
    setActivePanelRecord({
        id: PANEL_INSTANCE_ID,
        depth: FRAME_DEPTH,
        ts: nowTs,
        aliveTs: nowTs,
        url: location.href,
        workPage: isMooc1WorkPage(location.href),
        isTop: isTopWindow()
    });
    isActiveOwner = true;
    return true;
}

function manualReloadPluginPanel() {
    try {
        if (!/\.chaoxing\.com$/i.test(location.hostname)) {
            alert('请在超星学习通（chaoxing.com）页面使用此功能。');
            return;
        }
        resetPluginRuntimeForReload();
        stopHeartbeat();
        destroyPanelAndStop();
        clearPanelRegistration();
        isActiveOwner = false;

        if (!isMooc1PanelContext() && !isMooc1WorkPage(location.href)) {
            if (!confirm('当前页面可能不是标准答题/学习页，仍要强制打开面板吗？')) return;
        }

        forceClaimPanelOwnership(true);
        cxForceOpenSidebar = true;
        beginPluginLoadSequence();

        if (isMooc1WorkPage(location.href) && shouldMountPanelInThisFrame(true)) {
            [500, 1500, 3000].forEach((ms) => setTimeout(retryWorkPagePanel, ms));
        }
    } catch (e) {
        alert('重载失败: ' + (e && e.message ? e.message : e));
    }
}

if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('重载插件 / 打开面板', manualReloadPluginPanel);
} else if (typeof GM !== 'undefined' && GM.menu && typeof GM.menu.register === 'function') {
    GM.menu.register('重载插件 / 打开面板', manualReloadPluginPanel);
}


function showFeedbackModal() {
    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.32);z-index:999998;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);';
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:50%;top:120px;transform:translateX(-50%);width:400px;background:#fff;border:1px solid #e4e4e7;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.10);overflow:hidden;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Microsoft YaHei","Segoe UI",Arial,sans-serif;';
    box.innerHTML = (
        '<div style="padding:16px 20px;border-bottom:1px solid #ededef;font-weight:600;font-size:14px;color:#18181b;letter-spacing:.2px;">意见反馈</div>' +
        '<div style="padding:22px 20px;text-align:center;">' +
            '<div style="margin-bottom:18px;font-size:12px;color:#5f5f68;line-height:1.7;">' +
                '如果您在使用过程中遇到问题或有任何建议，欢迎通过以下方式联系我们：' +
            '</div>' +
            '<div style="background:#fafafa;border:1px solid #ededef;border-radius:8px;padding:18px;margin:14px 0;">' +
                '<div style="font-size:10px;font-weight:500;color:#9a9aa2;margin-bottom:8px;letter-spacing:0.08em;text-transform:uppercase;">联系邮箱</div>' +
                '<div style="font-size:15px;font-weight:600;color:#18181b;cursor:pointer;display:inline-block;padding:3px 6px;border-radius:6px;transition:background 160ms ease;" onclick="navigator.clipboard.writeText(\'' + CONTACT_EMAIL + '\')" title="点击复制" onmouseover="this.style.background=\'#f4f4f5\'" onmouseout="this.style.background=\'transparent\'">' + CONTACT_EMAIL + '</div>' +
                '<div style="font-size:11px;color:#9a9aa2;margin-top:8px;">点击邮箱地址即可复制</div>' +
            '</div>' +
            '<div style="font-size:11px;color:#9a9aa2;margin-top:14px;line-height:1.7;">我们将会认真对待每一条反馈，并且尽快回复您的问题。您的建议是我们改进产品的重要动力！</div>' +
        '</div>' +
        '<div style="padding:14px 20px;background:#fafafa;border-top:1px solid #ededef;text-align:right;">' +
            '<button id="feedback-close" style="padding:8px 20px;border-radius:8px;border:1px solid #18181b;background:#18181b;color:#fff;cursor:pointer;font-size:12px;font-weight:500;transition:background 160ms ease;">关闭</button>' +
        '</div>'
    );
    document.body.appendChild(mask);
    document.body.appendChild(box);

    const closeBtn = box.querySelector('#feedback-close');
    function close() {
        try {
            box.remove();
            mask.remove();
        } catch {}
    }

    closeBtn.onclick = close;
    mask.onclick = close;


    const emailDiv = box.querySelector('[onclick*="clipboard"]');
    if (emailDiv) {
        emailDiv.addEventListener('click', function() {
            const originalText = this.innerHTML;
            this.innerHTML = cxIconLabel('check', '已复制到剪贴板', { size: 16 });
            this.style.color = '#2563eb';
            setTimeout(() => {
                this.innerHTML = originalText;
                this.style.color = '#333';
            }, 2000);
        });
    }
}

function showAnswerProgress(show) {
    const wrap = document.getElementById('cx-answer-progress-wrap');
    if (wrap) wrap.style.display = show ? 'block' : 'none';
}

function setAnswerProgress(done, total, label) {
    const bar = document.getElementById('cx-answer-progress-bar');
    const text = document.getElementById('cx-answer-progress-text');
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = label || ('进度 ' + done + '/' + total + ' (' + pct + '%)');
}

function resetStreamDisplay() {
    const el = document.getElementById('cx-answer-stream');
    if (el) el.textContent = '';
}

function appendStreamDisplay(_delta, full) {
    const el = document.getElementById('cx-answer-stream');
    if (el) {
        el.textContent = full;
        el.scrollTop = el.scrollHeight;
    }
}

let cxApiSettingsEditingId = null;
let cxApiSettingsSaveBound = false;
let cxActivePanelTab = 'main';

function switchCxPanelTab(tabName) {
    const panel = document.getElementById('answer-helper-panel');
    if (!panel) return;
    cxActivePanelTab = tabName;
    panel.querySelectorAll('.cx-panel-tab').forEach((tab) => {
        tab.classList.toggle('cx-active', tab.dataset.tab === tabName);
    });
    const main = document.getElementById('cx-tab-main');
    const settings = document.getElementById('cx-tab-settings');
    if (main) main.style.display = tabName === 'main' ? 'flex' : 'none';
    if (settings) settings.style.display = tabName === 'settings' ? 'flex' : 'none';
    if (tabName === 'settings') {
        panel.classList.remove('has-question-picker');
        initApiSettingsPanel();
    } else if (questionCatalog?.items?.length) {
        panel.classList.add('has-question-picker');
    } else {
        panel.classList.remove('has-question-picker');
    }
    syncCxSidebarPush();
}

function showApiSettingsModal() {
    toggleCxSidebar(true);
    switchCxPanelTab('settings');
}

function renderApiSettingsTop() {
    const top = document.getElementById('cx-api-settings-top');
    if (!top) return;
    const defaultOpts = (API_MANAGER.apis || []).map(a =>
        '<option value="' + a.id + '"' + (a.id === API_MANAGER.defaultApiId ? ' selected' : '') + '>' + (a.name || a.id) + '</option>'
    ).join('');
    const current = getApiById(cxApiSettingsEditingId);
    top.innerHTML =
        '<div class="cx-set-field">' +
            '<div class="cx-set-label-row">' +
                '<label class="cx-set-label" for="cx-api-default-select">默认 API</label>' +
                '<span class="cx-set-inline-note">当前使用 ' + (current ? current.name : '—') + '</span>' +
            '</div>' +
            '<select id="cx-api-default-select">' + defaultOpts + '</select>' +
        '</div>' +
        '<label class="cx-set-switch">' +
            '<input type="checkbox" id="cx-api-failover-global"' + (API_MANAGER.failoverEnabled ? ' checked' : '') + '>' +
            '<span class="cx-set-switch-track"><span class="cx-set-switch-thumb"></span></span>' +
            '<span class="cx-set-switch-text">' +
                '<span class="cx-set-switch-title">容灾切换</span>' +
                '<span class="cx-set-switch-desc">当前 API 失败时自动尝试其他已启用 API</span>' +
            '</span>' +
        '</label>';
    top.querySelector('#cx-api-default-select').onchange = (e) => {
        API_MANAGER.defaultApiId = e.target.value;
        saveApiManagerState();
    };
    top.querySelector('#cx-api-failover-global').onchange = (e) => {
        API_MANAGER.failoverEnabled = !!e.target.checked;
        saveApiManagerState();
    };
}

function renderApiSettingsTabs() {
    const tabs = document.getElementById('cx-api-settings-tabs');
    if (!tabs) return;
    let html = '';
    (API_MANAGER.apis || []).forEach(a => {
        html += '<button type="button" class="cx-api-tab' + (a.id === cxApiSettingsEditingId ? ' active' : '') + '" data-id="' + a.id + '">' + (a.name || 'API') + '</button>';
    });
    html += '<button type="button" class="cx-api-tab cx-api-tab-add" data-add="deepseek">+ DeepSeek</button>';
    html += '<button type="button" class="cx-api-tab cx-api-tab-add" data-add="ollama">+ Ollama</button>';
    html += '<button type="button" class="cx-api-tab cx-api-tab-add" data-add="openai">+ OpenAI</button>';
    tabs.innerHTML = html;
    tabs.querySelectorAll('.cx-api-tab[data-id]').forEach(btn => {
        btn.onclick = () => { cxApiSettingsEditingId = btn.getAttribute('data-id'); renderApiSettingsAll(); };
    });
    tabs.querySelectorAll('.cx-api-tab-add').forEach(btn => {
        btn.onclick = () => {
            const preset = btn.getAttribute('data-add');
            const entry = createDefaultApiEntry(preset);
            API_MANAGER.apis.push(entry);
            cxApiSettingsEditingId = entry.id;
            saveApiManagerState();
            renderApiSettingsAll();
        };
    });
}

function renderApiSettingsBody(opts) {
    const body = document.getElementById('cx-api-settings-body');
    if (!body) return;
    const api = getApiById(cxApiSettingsEditingId);
    if (!api) {
        body.innerHTML = '<div class="cx-api-empty">请选择或添加 API</div>';
        return;
    }

    const modelOpts = (api.models || []).map((m, i) =>
        '<option value="' + i + '"' + (i === (api.selectedModelIndex || 0) ? ' selected' : '') + '>' + (m.label || m.model) + '</option>'
    ).join('');
    const modelCards = (api.models || []).map((m, i) => {
        const isCurrent = i === (api.selectedModelIndex || 0);
        return '<div class="cx-model-card' + (isCurrent ? ' is-current' : '') + '" data-idx="' + i + '">' +
            '<div class="cx-model-card-head">' +
                '<input type="text" class="cx-m-label" value="' + (m.label || '').replace(/"/g, '&quot;') + '" placeholder="菜单显示名">' +
                '<button type="button" class="cx-model-del cx-m-del" data-idx="' + i + '" title="删除此模型">' +
                    '<svg class="cx-svg" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>' +
                '</button>' +
            '</div>' +
            '<div class="cx-model-card-grid">' +
                '<label class="cx-model-cell">' +
                    '<span>请求模型</span>' +
                    '<input type="text" class="cx-m-model" value="' + (m.model || '').replace(/"/g, '&quot;') + '" placeholder="gpt-4o-mini">' +
                '</label>' +
                '<label class="cx-model-cell">' +
                    '<span>上下文</span>' +
                    '<input type="text" class="cx-m-ctx" value="' + (m.context || '').replace(/"/g, '&quot;') + '" placeholder="128000">' +
                '</label>' +
            '</div>' +
            '<button type="button" class="cx-model-use' + (isCurrent ? ' is-on' : '') + '" data-idx="' + i + '">' +
                (isCurrent ? '当前使用' : '设为当前') +
            '</button>' +
        '</div>';
    }).join('');
    body.innerHTML =
        '<div class="cx-set-field">' +
            '<label class="cx-set-label" for="cx-api-name">配置名称</label>' +
            '<input type="text" id="cx-api-name" value="' + (api.name || '').replace(/"/g, '&quot;') + '">' +
        '</div>' +
        '<div class="cx-set-field">' +
            '<label class="cx-set-label" for="cx-api-url">API 地址</label>' +
            '<input type="text" id="cx-api-url" value="' + (api.url || '').replace(/"/g, '&quot;') + '" placeholder="https://api.example.com/v1/chat/completions">' +
            '<div class="cx-set-note">OpenAI 兼容接口，需填写完整的 chat/completions 地址</div>' +
        '</div>' +
        '<div class="cx-set-field">' +
            '<label class="cx-set-label" for="cx-api-key">API Key</label>' +
            '<input type="password" id="cx-api-key" value="' + (api.apiKey || '').replace(/"/g, '&quot;') + '" placeholder="sk-...">' +
        '</div>' +
        '<div class="cx-set-divider"></div>' +
        '<div class="cx-set-subhead">' +
            '<span>模型</span>' +
            '<button type="button" id="cx-api-fetch-models" class="cx-api-btn cx-api-btn-ghost">获取模型列表</button>' +
        '</div>' +
        '<div class="cx-set-field">' +
            '<label class="cx-set-label" for="cx-api-model-select">当前使用模型</label>' +
            '<select id="cx-api-model-select">' + modelOpts + '</select>' +
            '<div id="cx-api-model-status" class="cx-set-note"></div>' +
        '</div>' +
        '<div class="cx-model-list" id="cx-api-models-tbody">' + modelCards + '</div>' +
        '<div class="cx-set-actions">' +
            '<button type="button" id="cx-api-add-model" class="cx-api-btn">+ 添加模型</button>' +
        '</div>' +
        '<div class="cx-set-note">填写地址与 Key 后会自动请求 /v1/models 检测可用模型；「菜单显示名」仅影响下拉框展示。</div>' +
        '<div class="cx-set-divider"></div>' +
        '<div class="cx-set-switch-list">' +
            '<label class="cx-set-switch cx-set-switch-row">' +
                '<input type="checkbox" id="cx-api-failover-item"' + (api.failoverEnabled !== false ? ' checked' : '') + '>' +
                '<span class="cx-set-switch-track"><span class="cx-set-switch-thumb"></span></span>' +
                '<span class="cx-set-switch-title">参与容灾切换</span>' +
            '</label>' +
        '</div>' +
        '<div class="cx-set-danger">' +
            '<button type="button" id="cx-api-delete-current" class="cx-api-btn danger">删除当前配置</button>' +
        '</div>';

    body.querySelector('#cx-api-name').oninput = (e) => { api.name = e.target.value; saveApiManagerState(); renderApiSettingsTabs(); renderApiSettingsTop(); };
    const failoverItem = body.querySelector('#cx-api-failover-item');
    if (failoverItem) failoverItem.onchange = (e) => { api.failoverEnabled = !!e.target.checked; saveApiManagerState(); };
    body.querySelector('#cx-api-url').oninput = (e) => {
        api.url = e.target.value;
        saveApiManagerState();
        scheduleAutoDetectApiModels(api);
    };
    body.querySelector('#cx-api-key').oninput = (e) => {
        api.apiKey = e.target.value;
        saveApiManagerState();
        scheduleAutoDetectApiModels(api);
    };
    body.querySelector('#cx-api-model-select').onchange = (e) => {
        api.selectedModelIndex = parseInt(e.target.value, 10) || 0;
        saveApiManagerState();
        updateAiStatusBadge();
    };
    body.querySelector('#cx-api-add-model').onclick = () => {
        api.models = api.models || [];
        api.models.push({ label: '新模型', model: 'model-name', context: '' });
        saveApiManagerState();
        renderApiSettingsBody();
    };
    body.querySelectorAll('.cx-m-del').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.getAttribute('data-idx'), 10);
            api.models.splice(idx, 1);
            if (!api.models.length) api.models.push({ label: 'gpt-4o-mini', model: 'gpt-4o-mini', context: '' });
            if (api.selectedModelIndex >= api.models.length) api.selectedModelIndex = 0;
            saveApiManagerState();
            renderApiSettingsBody();
        };
    });
    body.querySelectorAll('#cx-api-models-tbody .cx-model-card').forEach(card => {
        const idx = parseInt(card.getAttribute('data-idx'), 10);
        card.querySelector('.cx-m-label').oninput = (e) => {
            api.models[idx].label = e.target.value;
            saveApiManagerState();
            const sel = body.querySelector('#cx-api-model-select');
            if (sel && sel.options[idx]) sel.options[idx].textContent = e.target.value || api.models[idx].model || '';
        };
        card.querySelector('.cx-m-model').oninput = (e) => { api.models[idx].model = e.target.value; saveApiManagerState(); };
        card.querySelector('.cx-m-ctx').oninput = (e) => { api.models[idx].context = e.target.value; saveApiManagerState(); };
    });
    body.querySelectorAll('.cx-model-use').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.getAttribute('data-idx'), 10);
            if (api.selectedModelIndex === idx) return;
            api.selectedModelIndex = idx;
            saveApiManagerState();
            updateAiStatusBadge();
            renderApiSettingsBody({ skipAutoDetect: true });
        };
    });
    body.querySelector('#cx-api-fetch-models').onclick = async () => {
        const btn = body.querySelector('#cx-api-fetch-models');
        btn.disabled = true;
        btn.textContent = '获取中...';
        try {
            const list = await fetchModelsForApi(api);
            if (!list.length) throw new Error('未返回模型');
            api.models = list;
            api.selectedModelIndex = 0;
            saveApiManagerState();
            _cxAutoFetchedModelKeys.add((api.id || '') + '|' + (api.url || ''));
            addLog('已从 ' + api.name + ' 获取 ' + list.length + ' 个模型', 'success');
            renderApiSettingsBody({ skipAutoDetect: true });
            setApiModelDetectStatus('已检测到 ' + list.length + ' 个模型', true);
        } catch (e) {
            addLog('获取模型列表失败: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '获取模型列表';
        }
    };
    body.querySelector('#cx-api-delete-current').onclick = () => {
        if ((API_MANAGER.apis || []).length <= 1) {
            addLog('至少保留一个 API 配置', 'warn');
            return;
        }
        API_MANAGER.apis = API_MANAGER.apis.filter(a => a.id !== api.id);
        if (API_MANAGER.defaultApiId === api.id) API_MANAGER.defaultApiId = API_MANAGER.apis[0].id;
        if (API_MANAGER.currentApiId === api.id) API_MANAGER.currentApiId = API_MANAGER.apis[0].id;
        cxApiSettingsEditingId = API_MANAGER.apis[0].id;
        saveApiManagerState();
        renderApiSettingsAll();
    };
    if (!(opts && opts.skipAutoDetect)) {
        autoDetectApiModels(api);
    }
}

function renderApiSettingsAll() {
    renderApiSettingsTop();
    renderApiSettingsTabs();
    renderApiSettingsBody();
}

function initApiSettingsPanel() {
    if (!document.getElementById('cx-tab-settings')) return;
    if (cxApiSettingsEditingId == null) {
        cxApiSettingsEditingId = API_MANAGER.currentApiId || API_MANAGER.defaultApiId;
    }
    if (!cxApiSettingsSaveBound) {
        cxApiSettingsSaveBound = true;
        document.getElementById('cx-api-settings-save')?.addEventListener('click', () => {
            saveApiManagerState();
            updateAiStatusBadge();
            addLog('API 配置已保存', 'success');
        });
        bindAnswerAccuracyControls();
    }
    syncAnswerAccuracyInputs();
    renderApiSettingsAll();
}

async function ensureAccessAllowed() {
    if (!isLocalApiManagerConfigured()) {
        throw new Error('AI 未配置：请在「设置 → AI 接口」中填写接口地址与 API Key');
    }
    return true;
}

function isPasteUnlockPageContext() {
    if (isPasteUnlockWorkPage(location.href)) return true;
    try { if (isPasteUnlockWorkPage(window.top.location.href)) return true; } catch {}
    return false;
}

function getPanelStorage() {
    try { return sessionStorage; } catch { return null; }
}

function clearPanelRegistration() {
    const store = getPanelStorage();
    try { store?.removeItem(PANEL_REG_KEY); } catch {}
    try { localStorage.removeItem(PANEL_REG_KEY); } catch {}
}

function consumePanelReopenFlag() {
    try {
        if (getPanelStorage()?.getItem(PANEL_REOPEN_KEY) === '1') {
            getPanelStorage()?.removeItem(PANEL_REOPEN_KEY);
            return true;
        }
    } catch {}
    return false;
}

function markPanelReopenAfterReload() {
    try { getPanelStorage()?.setItem(PANEL_REOPEN_KEY, '1'); } catch {}
    clearPanelRegistration();
}

function enforceSinglePanelInDocument() {
    const roots = document.querySelectorAll('#' + CX_ROOT_ID);
    if (roots.length > 1) {
        for (let i = 1; i < roots.length; i++) {
            try { roots[i].remove(); } catch {}
        }
    }
    const panels = document.querySelectorAll('#answer-helper-panel');
    if (panels.length > 1) {
        for (let i = 1; i < panels.length; i++) {
            try { panels[i].remove(); } catch {}
        }
    }
    return document.getElementById('answer-helper-panel') || null;
}

function getActivePanelRecord() {
    try {
        const raw = getPanelStorage()?.getItem(PANEL_REG_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}
function setActivePanelRecord(rec) {
    try { getPanelStorage()?.setItem(PANEL_REG_KEY, JSON.stringify(rec)); } catch {}
}
function clearActivePanelRecordIfOwner() {
    try {
        const cur = getActivePanelRecord();
        if (cur && cur.id === PANEL_INSTANCE_ID) {
            clearPanelRegistration();
        }
    } catch {}
}
function shouldWeOwn(current) {
    const nowTs = Date.now();

    if (!shouldMountPanelInThisFrame()) {
        return { own: false, ts: nowTs };
    }

    try {
        if (isNestedInFrame() && canAccessTopWindow() && topIsPanelContext()) {
            return { own: false, ts: nowTs };
        }
        if (isMooc1WorkPage(window.top.location.href) && isNestedInFrame()) {
            return { own: false, ts: nowTs };
        }
    } catch {}

    try {
        if (current && current.isTop && isNestedInFrame()) {
            return { own: false, ts: nowTs };
        }
    } catch {}

    if (!current) return { own: true, ts: nowTs };

    if (!current.aliveTs || nowTs - current.aliveTs > STALE_MS) return { own: true, ts: nowTs };

    const currentDepth = Number.isFinite(current.depth) ? current.depth : 0;
    if (shouldPreferOuterFramePanel()) {
        if (FRAME_DEPTH < currentDepth) return { own: true, ts: nowTs };
        if (FRAME_DEPTH > currentDepth) return { own: false, ts: nowTs };
    } else {
        if (FRAME_DEPTH > currentDepth) return { own: true, ts: nowTs };
        if (FRAME_DEPTH < currentDepth) return { own: false, ts: nowTs };
    }

    try { if (current.url && current.url !== location.href) return { own: true, ts: nowTs }; } catch {}
    if (FRAME_DEPTH === currentDepth && nowTs > (current.ts || 0)) return { own: true, ts: nowTs };
    return { own: false, ts: nowTs };
}
function claimOwnership(force) {
    if (!shouldMountPanelInThisFrame(!!force)) {
        isActiveOwner = false;
        destroyPanelAndStop();
        return false;
    }
    if (isMooc1WorkPage(location.href) && !force) {
        const cur = getActivePanelRecord();
        if (cur && cur.id && cur.id !== PANEL_INSTANCE_ID && cur.isTop && isNestedInFrame()) {
            isActiveOwner = false;
            destroyPanelAndStop();
            return false;
        }
    }
    const cur = getActivePanelRecord();
    const decision = shouldWeOwn(cur);
    if (decision.own) {
        setActivePanelRecord({
            id: PANEL_INSTANCE_ID,
            depth: FRAME_DEPTH,
            ts: decision.ts,
            aliveTs: Date.now(),
            url: location.href,
            workPage: isMooc1WorkPage(location.href),
            isTop: isTopWindow()
        });
        isActiveOwner = true;
    } else {
        isActiveOwner = false;
        destroyPanelAndStop();
    }
    return isActiveOwner;
}
function startHeartbeat() {
    if (heartbeatTimerId) return;
    heartbeatTimerId = setInterval(() => {
        if (!isActiveOwner) return;
        const cur = getActivePanelRecord();

        if (!cur || cur.id !== PANEL_INSTANCE_ID) {
            isActiveOwner = false;
            stopHeartbeat();
            destroyPanelAndStop();
            return;
        }
        cur.aliveTs = Date.now();
        try { cur.url = location.href; } catch {}
        setActivePanelRecord(cur);
    }, HEARTBEAT_INTERVAL_MS);
}
function stopHeartbeat() { if (heartbeatTimerId) { clearInterval(heartbeatTimerId); heartbeatTimerId = null; } }
const cleanupOwnership = () => {
    stopHeartbeat();
    clearActivePanelRecordIfOwner();
};
window.addEventListener('beforeunload', cleanupOwnership);
window.addEventListener('pagehide', cleanupOwnership);

function getCxSidebarPushWidth() {
    const panel = document.getElementById('answer-helper-panel');
    if (panel?.classList.contains('has-question-picker')) return CX_SIDEBAR_WIDE_WIDTH;
    return CX_SIDEBAR_WIDTH;
}

function cxPushElement(el, enabled, width) {
    if (!el || el.id === CX_ROOT_ID) return;
    const w = width + 'px';
    if (enabled) {
        el.dataset.cxPushed = '1';
        el.style.setProperty('margin-right', w, 'important');
        el.style.setProperty('width', 'calc(100% - ' + w + ')', 'important');
        el.style.setProperty('max-width', 'calc(100vw - ' + w + ')', 'important');
        el.style.setProperty('box-sizing', 'border-box', 'important');
    } else if (el.dataset.cxPushed) {
        delete el.dataset.cxPushed;
        ['margin-right', 'width', 'max-width', 'box-sizing'].forEach((prop) => el.style.removeProperty(prop));
    }
}

function cxPushFixedElements(doc, enabled, width) {
    const win = doc.defaultView;
    if (!win) return;

    doc.querySelectorAll('[data-cx-fixed-push]').forEach((el) => {
        const orig = el.getAttribute('data-cx-fixed-orig-right');
        if (orig) el.style.setProperty('right', orig);
        else el.style.removeProperty('right');
        el.style.removeProperty('transition');
        el.removeAttribute('data-cx-fixed-push');
        el.removeAttribute('data-cx-fixed-orig-right');
    });

    if (!enabled) return;

    const nodes = doc.querySelectorAll('body *');
    const limit = Math.min(nodes.length, 3000);
    for (let i = 0; i < limit; i += 1) {
        const el = nodes[i];
        if (!el || el.id === CX_ROOT_ID || el.closest('#' + CX_ROOT_ID)) continue;
        let style;
        try {
            style = win.getComputedStyle(el);
        } catch {
            continue;
        }
        if (style.position !== 'fixed' && style.position !== 'sticky') continue;
        const right = style.right;
        if (!right || right === 'auto') continue;
        const rightPx = parseFloat(right);
        if (Number.isNaN(rightPx)) continue;
        let rect;
        try {
            rect = el.getBoundingClientRect();
        } catch {
            continue;
        }
        if (rect.right < win.innerWidth - 40) continue;

        el.setAttribute('data-cx-fixed-push', '1');
        el.setAttribute('data-cx-fixed-orig-right', right);
        el.style.setProperty('right', rightPx + width + 'px', 'important');
        el.style.setProperty('transition', 'right 0.28s ease', 'important');
    }
}

function cxPushDocument(doc, enabled, width) {
    if (!doc || !doc.documentElement) return;
    const html = doc.documentElement;
    const body = doc.body;
    if (body) cxPushElement(body, enabled, width);
    Array.from(html.children).forEach((child) => {
        if (child === body || child.id === CX_ROOT_ID) return;
        cxPushElement(child, enabled, width);
    });
    cxPushFixedElements(doc, enabled, width);
    if (enabled) html.style.setProperty('overflow-x', 'hidden', 'important');
    else html.style.removeProperty('overflow-x');
}

function applyCxPagePush(enabled) {
    const html = document.documentElement;
    const width = getCxSidebarPushWidth();
    html.classList.toggle('cx-helper-sidebar-push', enabled);
    const seen = new Set();
    const visit = (win) => {
        if (!win || seen.has(win)) return;
        seen.add(win);
        try {
            cxPushDocument(win.document, enabled, width);
        } catch {}
        try {
            const len = win.frames ? win.frames.length : 0;
            for (let i = 0; i < len; i += 1) {
                try { visit(win.frames[i]); } catch {}
            }
        } catch {}
    };
    try { visit(window.top); } catch { visit(window); }
}

function toggleCxSidebar(show) {
    const panel = document.getElementById('answer-helper-panel');
    if (!panel) return;
    cxPanelVisible = show !== undefined ? !!show : !cxPanelVisible;
    panel.classList.toggle('cx-sidebar-visible', cxPanelVisible);
    document.documentElement.classList.toggle('cx-helper-sidebar-open', cxPanelVisible);
    applyCxPagePush(cxPanelVisible);
}

function syncCxSidebarPush() {
    if (cxPanelVisible) applyCxPagePush(true);
}

function readSidebarTabTop() {
    try {
        const raw = getPanelStorage()?.getItem(CX_SIDEBAR_TAB_POS_KEY);
        const top = parseFloat(raw);
        if (Number.isFinite(top)) return top;
    } catch {}
    return null;
}

function saveSidebarTabTop(top) {
    try { getPanelStorage()?.setItem(CX_SIDEBAR_TAB_POS_KEY, String(Math.round(top))); } catch {}
}

function clampSidebarTabTop(tab, top) {
    const margin = 12;
    const halfH = (tab?.offsetHeight || 72) / 2;
    const maxTop = (window.innerHeight || document.documentElement.clientHeight) - margin - halfH;
    const minTop = margin + halfH;
    return Math.max(minTop, Math.min(maxTop, top));
}

function applySidebarTabPosition(tab) {
    if (!tab) return;
    const saved = readSidebarTabTop();
    tab.style.right = '0';
    tab.style.left = 'auto';
    tab.style.transform = 'translateY(-50%)';
    if (saved == null) {
        tab.style.top = '50%';
        return;
    }
    tab.style.top = clampSidebarTabTop(tab, saved) + 'px';
}

function setupSidebarTabDrag(tab, onClick) {
    if (!tab || tab.dataset.cxTabDragInit === '1') return;
    tab.dataset.cxTabDragInit = '1';

    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let offsetY = 0;

    tab.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        dragging = true;
        moved = false;
        const rect = tab.getBoundingClientRect();
        offsetY = e.clientY - (rect.top + rect.height / 2);
        startX = e.clientX;
        startY = e.clientY;
        tab.classList.add('cx-sidebar-tab-dragging');
        tab.style.top = (rect.top + rect.height / 2) + 'px';
        tab.style.right = '0';
        tab.style.transform = 'translateY(-50%)';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        if (
            Math.abs(e.clientX - startX) > CX_SIDEBAR_TAB_CLICK_THRESHOLD ||
            Math.abs(e.clientY - startY) > CX_SIDEBAR_TAB_CLICK_THRESHOLD
        ) {
            moved = true;
        }
        tab.style.top = clampSidebarTabTop(tab, e.clientY - offsetY) + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        tab.classList.remove('cx-sidebar-tab-dragging');
        const top = parseFloat(tab.style.top);
        if (Number.isFinite(top)) saveSidebarTabTop(top);
    });

    tab.addEventListener('click', (e) => {
        if (moved) {
            moved = false;
            return;
        }
        e.stopPropagation();
        onClick();
    });

    window.addEventListener('resize', () => {
        if (dragging) return;
        applySidebarTabPosition(tab);
    });
}

function destroyPanelAndStop() {
    try {
        if (studyIntervalId) { clearInterval(studyIntervalId); studyIntervalId = null; }
        isStudyingChapters = false;
        isAnswering = false;
        stopHeartbeat();
        applyCxPagePush(false);
        cxPanelVisible = false;
        document.documentElement.classList.remove('cx-helper-sidebar-open', 'cx-helper-sidebar-push');
        document.querySelectorAll('#' + CX_ROOT_ID).forEach((root) => {
            try { root.remove(); } catch {}
        });
        document.querySelectorAll('#answer-helper-panel').forEach((panel) => {
            try { panel.parentNode?.removeChild(panel); } catch {}
        });
        createdPanelEl = null;
    } catch {}
}
window.addEventListener('storage', (e) => {
    if (e.key !== PANEL_REG_KEY) return;
    if (isPanelBlockedPage(location.href)) return;
    if (!shouldMountPanelInThisFrame()) {
        destroyPanelAndStop();
        isActiveOwner = false;
        return;
    }
    const rec = getActivePanelRecord();
    if (!rec) return;
    if (rec.id === PANEL_INSTANCE_ID) {

        if (!createdPanelEl) {
            try { mountPanelIfOwner(); runQuestionLoadSequence(); } catch {}
        }
        isActiveOwner = true;
        startHeartbeat();
    } else {

        isActiveOwner = false;
        destroyPanelAndStop();
    }
});


GM_addStyle(`
/* ==========================================================================
   路南云 · 学习通研习助手 — 极简主题 (Minimal)
   规则：单一强调色 / 1px 细边框 / 无渐变 / 无光效 / 无重阴影 / 4px 栅格
   ========================================================================== */

/* ---------- 设计令牌 ---------- */
#answer-helper-panel,
#cx-sidebar-tab,
#no-task-toast,
#cx-plugin-loader {
    --cx-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC",
               "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", Roboto, Arial, sans-serif;
    --cx-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

    --cx-bg: #111113;
    --cx-bg-2: #18181b;
    --cx-surface: #1e1e22;
    --cx-surface-hover: #26262b;

    --cx-border: rgba(255, 255, 255, 0.09);
    --cx-border-strong: rgba(255, 255, 255, 0.18);

    --cx-text: #e9e9ec;
    --cx-text-2: #a2a2aa;
    --cx-text-3: #6f6f78;

    --cx-accent: #7b93ff;
    --cx-accent-strong: #6380ff;
    --cx-accent-tint: rgba(123, 147, 255, 0.14);
    --cx-success: #4ec98a;
    --cx-warn: #e0a83c;
    --cx-danger: #ec6a5e;

    --cx-radius-sm: 6px;
    --cx-radius: 8px;
    --cx-radius-lg: 12px;

    --cx-font-base: 12px;
    --cx-t: 160ms cubic-bezier(0.2, 0, 0.2, 1);
    --cx-sidebar-width: 380px;

    color-scheme: dark;
}

@media (prefers-color-scheme: light) {
    #answer-helper-panel,
    #cx-sidebar-tab,
    #no-task-toast,
    #cx-plugin-loader {
        --cx-bg: #ffffff;
        --cx-bg-2: #f7f7f8;
        --cx-surface: #f4f4f5;
        --cx-surface-hover: #ebebed;

        --cx-border: rgba(0, 0, 0, 0.10);
        --cx-border-strong: rgba(0, 0, 0, 0.20);

        --cx-text: #18181b;
        --cx-text-2: #5f5f68;
        --cx-text-3: #9a9aa2;

        --cx-accent: #3b5bdb;
        --cx-accent-strong: #2f4fd0;
        --cx-accent-tint: rgba(59, 91, 219, 0.10);
        --cx-success: #17915a;
        --cx-warn: #a96f14;
        --cx-danger: #cf4038;

        color-scheme: light;
    }
}

#answer-helper-panel,
#answer-helper-panel *,
#cx-sidebar-tab,
#no-task-toast {
    box-sizing: border-box;
}

/* ---------- 启动遮罩 ---------- */
#cx-plugin-loader {
    position: fixed;
    inset: 0;
    z-index: 1000000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.42);
    -webkit-backdrop-filter: blur(4px);
    backdrop-filter: blur(4px);
    font-family: var(--cx-font);
    opacity: 0;
    transition: opacity 240ms ease;
}
#cx-plugin-loader.cx-loader-visible { opacity: 1; }
#cx-plugin-loader.cx-loader-hide { opacity: 0; pointer-events: none; }

#cx-plugin-loader .cx-loader-card {
    width: 300px;
    padding: 24px;
    background: var(--cx-bg);
    border: 1px solid var(--cx-border);
    border-radius: var(--cx-radius-lg);
    color: var(--cx-text);
    transform: translateY(6px);
    transition: transform 240ms cubic-bezier(0.2, 0, 0.2, 1);
}
#cx-plugin-loader.cx-loader-visible .cx-loader-card { transform: translateY(0); }

#cx-plugin-loader .cx-loader-icon {
    width: 44px;
    height: 44px;
    margin: 0 0 16px;
    border-radius: var(--cx-radius);
    overflow: hidden;
}
#cx-plugin-loader .cx-loader-logo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}
#cx-plugin-loader .cx-loader-title {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.2px;
}
#cx-plugin-loader .cx-loader-sub {
    margin-top: 2px;
    font-size: 11px;
    color: var(--cx-text-3);
}
#cx-plugin-loader .cx-loader-steps {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 16px 0;
}
#cx-plugin-loader .cx-loader-step {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--cx-text-3);
    transition: color var(--cx-t);
}
#cx-plugin-loader .cx-loader-step-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex: none;
    background: var(--cx-border-strong);
    transition: background var(--cx-t);
}
#cx-plugin-loader .cx-loader-step.cx-step-active { color: var(--cx-text); }
#cx-plugin-loader .cx-loader-step.cx-step-active .cx-loader-step-dot { background: var(--cx-accent); }
#cx-plugin-loader .cx-loader-step.cx-step-done { color: var(--cx-text-2); }
#cx-plugin-loader .cx-loader-step.cx-step-done .cx-loader-step-dot { background: var(--cx-success); }

#cx-plugin-loader .cx-loader-track {
    height: 3px;
    border-radius: 2px;
    overflow: hidden;
    background: var(--cx-border);
}
#cx-plugin-loader .cx-loader-bar {
    height: 100%;
    width: 0;
    border-radius: inherit;
    background: var(--cx-accent);
    transition: width 300ms ease;
}
#cx-plugin-loader .cx-loader-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
    font-size: 11px;
}
#cx-plugin-loader .cx-loader-status {
    flex: 1;
    min-width: 0;
    color: var(--cx-text-3);
    line-height: 1.4;
    text-align: left;
}
#cx-plugin-loader .cx-loader-percent {
    flex: none;
    color: var(--cx-text-2);
    font-variant-numeric: tabular-nums;
}

/* ---------- 右侧悬浮入口 ---------- */
#cx-sidebar-tab {
    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    z-index: 2147483645;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 34px;
    padding: 10px 0;
    background: var(--cx-bg);
    border: 1px solid var(--cx-border);
    border-right: none;
    border-radius: var(--cx-radius) 0 0 var(--cx-radius);
    color: var(--cx-text-2);
    font-family: var(--cx-font);
    cursor: grab;
    touch-action: none;
    user-select: none;
    transition: background var(--cx-t), color var(--cx-t), opacity var(--cx-t), top 120ms ease;
}
#cx-sidebar-tab.cx-sidebar-tab-dragging {
    cursor: grabbing;
    transition: background var(--cx-t), color var(--cx-t), opacity var(--cx-t);
}
#cx-sidebar-tab:hover {
    background: var(--cx-surface-hover);
    color: var(--cx-text);
}
#cx-sidebar-tab img {
    width: 20px;
    height: 20px;
    border-radius: 5px;
    object-fit: cover;
    display: block;
}
#cx-sidebar-tab span {
    font-size: 10px;
    letter-spacing: 2px;
    writing-mode: vertical-rl;
}
html.cx-helper-sidebar-open #cx-sidebar-tab {
    opacity: 0;
    pointer-events: none;
}
html.cx-helper-sidebar-open { overflow-x: hidden !important; }
html.cx-helper-sidebar-push > *:not(#cx-helper-root) {
    transition: margin-right 240ms cubic-bezier(0.2, 0, 0.2, 1),
                width 240ms cubic-bezier(0.2, 0, 0.2, 1),
                max-width 240ms cubic-bezier(0.2, 0, 0.2, 1);
}

/* ---------- 面板外壳 ---------- */
#answer-helper-panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: auto;
    width: var(--cx-sidebar-width);
    min-width: var(--cx-sidebar-width);
    max-width: min(92vw, 720px);
    height: 100vh !important;
    min-height: 100vh !important;
    max-height: 100vh !important;
    display: flex;
    flex-direction: column;
    padding: 0;
    background: var(--cx-bg);
    border: none;
    border-left: 1px solid var(--cx-border);
    border-radius: 0;
    z-index: 2147483647;
    font-family: var(--cx-font);
    font-size: var(--cx-font-base);
    line-height: 1.5;
    color: var(--cx-text);
    -webkit-font-smoothing: antialiased;
    user-select: none;
    overflow: hidden;
    transform: translateX(100%);
    transition: transform 240ms cubic-bezier(0.2, 0, 0.2, 1), width 240ms ease;
}
#answer-helper-panel.cx-sidebar-visible { transform: translateX(0); }
#answer-helper-panel.has-question-picker { --cx-sidebar-width: 720px; }

#answer-helper-panel button,
#answer-helper-panel input,
#answer-helper-panel select,
#answer-helper-panel textarea {
    font-family: inherit;
}

/* ---------- 顶栏 ---------- */
#answer-helper-header {
    flex: none;
    height: 44px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: var(--cx-bg);
    border-bottom: 1px solid var(--cx-border);
}
#answer-helper-header .title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.2px;
    color: var(--cx-text);
}
#answer-helper-header .title .title-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
}
#answer-helper-header .title .title-short { display: none; }
#answer-helper-header .title .accent { display: inline-flex; align-items: center; }
#answer-helper-header .cx-header-logo {
    width: 22px;
    height: 22px;
    border-radius: var(--cx-radius-sm);
    object-fit: cover;
    display: block;
    flex: none;
}
#answer-helper-header .cx-header-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
}
#answer-helper-header .cx-collapse-btn {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--cx-radius-sm);
    color: var(--cx-text-3);
    cursor: pointer;
    transition: background var(--cx-t), color var(--cx-t), border-color var(--cx-t);
}
#answer-helper-header .cx-collapse-btn:hover {
    background: var(--cx-surface);
    border-color: var(--cx-border);
    color: var(--cx-text);
}
.cx-collapse-btn-inner {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    line-height: 1;
}

/* ---------- 图标 ---------- */
.cx-svg { display: inline-block; vertical-align: middle; flex-shrink: 0; }
.cx-svg-spin { animation: cx-svg-spin 0.75s linear infinite; transform-origin: center center; }
@keyframes cx-svg-spin { to { transform: rotate(360deg); } }
.cx-icon-label { display: inline-flex; align-items: center; gap: 6px; vertical-align: middle; }
.button-icon { display: inline-flex; align-items: center; justify-content: center; margin: 0; color: inherit; }

/* ---------- 标签页 ---------- */
.cx-panel-tabs {
    flex: none;
    display: flex;
    gap: 18px;
    padding: 0 14px;
    background: var(--cx-bg);
    border-bottom: 1px solid var(--cx-border);
}
.cx-panel-tab {
    flex: none;
    padding: 10px 0 9px;
    background: none;
    border: none;
    border-radius: 0;
    color: var(--cx-text-3);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: inset 0 -2px 0 transparent;
    transition: color var(--cx-t), box-shadow var(--cx-t);
}
.cx-panel-tab:hover { color: var(--cx-text-2); }
.cx-panel-tab.cx-active {
    color: var(--cx-text);
    background: none;
    box-shadow: inset 0 -2px 0 var(--cx-accent);
}

/* ---------- 内容区 ---------- */
#answer-helper-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.cx-tab-pane {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
#cx-tab-main { padding: 12px 14px; }

#answer-helper-content .panel-body {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0;
    align-items: stretch;
    height: 100%;
    min-height: 0;
}
#answer-helper-panel.has-question-picker #answer-helper-content .panel-body {
    grid-template-columns: minmax(300px, 1fr) minmax(300px, 1fr);
    gap: 16px;
}
.panel-col-func {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
}
.panel-col-picker {
    display: none;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
}
#answer-helper-panel.has-question-picker .panel-col-picker { display: flex; }
.panel-main { min-width: 0; flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.cx-study-block {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
}

/* ---------- 功能卡片 ---------- */
.cx-chroma-wrap { flex: none; margin-bottom: 10px; }
#cx-chroma-grid.chroma-grid {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    width: 100%;
}
#cx-chroma-grid .chroma-card {
    --cx-card-accent: var(--cx-text-2);
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 9px 10px;
    background: var(--cx-surface);
    border: 1px solid var(--cx-border);
    border-radius: var(--cx-radius);
    cursor: pointer;
    user-select: none;
    transition: background var(--cx-t), border-color var(--cx-t);
}
#cx-chroma-grid .chroma-card:hover {
    background: var(--cx-surface-hover);
    border-color: var(--cx-border-strong);
}
#cx-chroma-grid .chroma-card:focus-visible {
    outline: 2px solid var(--cx-accent);
    outline-offset: 1px;
}
#cx-chroma-grid .chroma-card-brush { --cx-card-accent: var(--cx-success); }
#cx-chroma-grid .chroma-card-answer { --cx-card-accent: var(--cx-accent); }
#cx-chroma-grid .chroma-card-study { --cx-card-accent: var(--cx-accent); }
#cx-chroma-grid .chroma-card-paste { --cx-card-accent: var(--cx-warn); }
#cx-chroma-grid .chroma-card.chroma-card-pause { --cx-card-accent: var(--cx-danger); }
#cx-chroma-grid .chroma-card.cx-paste-unlock-on {
    --cx-card-accent: var(--cx-success);
    border-color: var(--cx-success);
    background: var(--cx-surface);
}
#cx-chroma-grid .chroma-img-wrapper {
    flex: none;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--cx-radius-sm);
    background: var(--cx-bg-2);
    color: var(--cx-card-accent);
}
#cx-chroma-grid .chroma-icon { display: flex; align-items: center; justify-content: center; color: inherit; }
#cx-chroma-grid .chroma-icon .cx-svg { color: inherit; }
#cx-chroma-grid .chroma-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
}
#cx-chroma-grid .chroma-info .name {
    margin: 0;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.3;
    color: var(--cx-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
#cx-chroma-grid .chroma-info .role {
    margin: 0;
    font-size: 10px;
    line-height: 1.3;
    color: var(--cx-text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
#cx-chroma-grid .chroma-info .handle { display: none; }
#cx-chroma-grid .chroma-overlay,
#cx-chroma-grid .chroma-fade { display: none; }

/* ---------- 日志 ---------- */
.cx-log-list-container {
    position: relative;
    flex: 1 1 auto;
    min-height: 120px;
    margin-top: 10px;
}
#answer-log.cx-scroll-list {
    height: 100%;
    overflow-y: auto;
    padding: 6px;
    background: var(--cx-bg-2);
    border: 1px solid var(--cx-border);
    border-radius: var(--cx-radius);
    scroll-behavior: smooth;
    overscroll-behavior: contain;
}
.log-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 8px;
    margin-bottom: 2px;
    border: 1px solid transparent;
    border-radius: var(--cx-radius-sm);
    cursor: pointer;
    animation: cxLogItemIn 160ms ease both;
}
.log-item:last-child { margin-bottom: 0; }
.log-item:hover { background: var(--cx-surface); }
.log-item.selected {
    background: var(--cx-surface);
    border-color: var(--cx-border-strong);
}
.log-item .item-icon {
    flex: none;
    display: flex;
    margin-top: 2px;
    color: var(--cx-text-3);
}
.log-item.success .item-icon { color: var(--cx-success); }
.log-item.error .item-icon { color: var(--cx-danger); }
.log-item.warning .item-icon,
.log-item.warn .item-icon { color: var(--cx-warn); }
.log-item .item-body { flex: 1; min-width: 0; }
.log-item .item-time {
    display: block;
    margin-bottom: 1px;
    font-family: var(--cx-font);
    font-size: 10px;
    color: var(--cx-text-3);
    font-variant-numeric: tabular-nums;
}
.log-item .item-text {
    margin: 0;
    font-family: var(--cx-mono);
    font-size: 11px;
    line-height: 1.6;
    color: var(--cx-text-2);
    word-break: break-word;
}
.log-item.info .item-text { color: var(--cx-text-2); }
.log-item.success .item-text { color: var(--cx-text); }
.log-item.error .item-text { color: var(--cx-danger); }
.log-item.warning .item-text,
.log-item.warn .item-text { color: var(--cx-warn); }
.log-item.debug .item-text { color: var(--cx-text-3); }
.cx-log-top-gradient,
.cx-log-bottom-gradient { display: none; }
@keyframes cxLogItemIn {
    from { opacity: 0; transform: translateY(-2px); }
    to { opacity: 1; transform: none; }
}

/* ---------- 进度条 / 流式输出 ---------- */
#cx-answer-progress-wrap {
    flex: none;
    margin-bottom: 10px;
    padding: 10px;
    background: var(--cx-bg-2);
    border: 1px solid var(--cx-border);
    border-radius: var(--cx-radius);
}
.cx-api-progress-track {
    height: 4px;
    overflow: hidden;
    background: var(--cx-surface);
    border-radius: 2px;
}
.cx-api-progress-bar {
    height: 100%;
    width: 0;
    background: var(--cx-accent);
    border-radius: inherit;
    transition: width 240ms ease;
}
#cx-answer-progress-text,
#cx-api-progress-text {
    font-size: 10px;
    line-height: 1.5;
    color: var(--cx-text-3);
    font-variant-numeric: tabular-nums;
}
#cx-answer-progress-text { margin-top: 6px; }
#cx-answer-stream {
    max-height: 64px;
    overflow-y: auto;
    margin-top: 8px;
    padding: 8px;
    background: var(--cx-bg);
    border: 1px solid var(--cx-border);
    border-radius: var(--cx-radius-sm);
    font-family: var(--cx-mono);
    font-size: 10px;
    line-height: 1.6;
    color: var(--cx-text-2);
    white-space: pre-wrap;
    word-break: break-word;
}
#cx-answer-stream:empty { display: none; }

/* ---------- 按钮 ---------- */
#answer-helper-panel .ah-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 28px;
    padding: 6px 10px;
    background: transparent;
    border: 1px solid var(--cx-border);
    border-radius: var(--cx-radius-sm);
    color: var(--cx-text-2);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--cx-t), border-color var(--cx-t), color var(--cx-t);
}
#answer-helper-panel .ah-btn:hover {
    background: var(--cx-surface);
    border-color: var(--cx-border-strong);
    color: var(--cx-text);
}
#answer-helper-panel .ah-btn:active { background: var(--cx-surface-hover); }
#answer-helper-panel .ah-btn:disabled { opacity: 0.5; cursor: not-allowed; }

#answer-helper-panel .ah-primary {
    background: var(--cx-accent);
    border-color: var(--cx-accent);
    color: #ffffff;
}
#answer-helper-panel .ah-primary:hover {
    background: var(--cx-accent-strong);
    border-color: var(--cx-accent-strong);
    color: #ffffff;
}
#answer-helper-panel .ah-secondary {
    background: transparent;
    border-color: var(--cx-border);
    color: var(--cx-text-2);
}
#answer-helper-panel .ah-danger {
    background: transparent;
    border-color: var(--cx-border);
    color: var(--cx-danger);
}
#answer-helper-panel .ah-danger:hover {
    background: transparent;
    border-color: var(--cx-danger);
    color: var(--cx-danger);
}
#answer-helper-panel .ah-success {
    background: var(--cx-success);
    border-color: var(--cx-success);
    color: #ffffff;
}
#answer-helper-panel .ah-success:hover { background: var(--cx-success); border-color: var(--cx-success); }

/* ---------- 倍速 ---------- */
#playback-speed-controls.segmented {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    margin-bottom: 10px;
}
#playback-speed-controls.segmented .ah-btn {
    flex: none;
    min-width: 48px;
    padding: 5px 8px;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
}
.speed-button { transition: background var(--cx-t), border-color var(--cx-t), color var(--cx-t); }
.speed-active {
    background: var(--cx-accent-tint) !important;
    border-color: var(--cx-accent) !important;
    color: var(--cx-accent) !important;
}

/* ---------- AI 状态 ---------- */
#answer-helper-panel .cx-ai-status-badge {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--cx-border);
    font-size: 10px;
    line-height: 1.4;
    color: var(--cx-text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    transition: color var(--cx-t);
}
#answer-helper-panel .cx-ai-status-badge:hover { color: var(--cx-text-2); }
#answer-helper-panel .cx-ai-status-badge .cx-badge-icon { color: var(--cx-warn); }
.cx-ai-status-badge .cx-icon-label { justify-content: center; }

/* ---------- 题目选择器 ---------- */
#cx-question-picker {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    height: 100%;
    background: var(--cx-bg);
    border: 1px solid var(--cx-border);
    border-radius: var(--cx-radius);
    overflow: hidden;
}
#cx-question-picker .cx-qp-toolbar {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 12px;
    border-bottom: 1px solid var(--cx-border);
}
#cx-question-picker .cx-qp-toolbar label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--cx-text-2);
    cursor: pointer;
}
#cx-question-picker .cx-qp-toolbar input[type="checkbox"],
#cx-question-picker .cx-qp-group-head input[type="checkbox"] {
    width: 13px;
    height: 13px;
    flex: none;
    margin: 0;
    accent-color: var(--cx-accent);
    cursor: pointer;
}
#cx-question-picker .cx-qp-refresh {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: transparent;
    border: 1px solid var(--cx-border);
    border-radius: var(--cx-radius-sm);
    color: var(--cx-text-2);
    font-size: 11px;
    cursor: pointer;
    transition: background var(--cx-t), border-color var(--cx-t), color var(--cx-t);
}
#cx-question-picker .cx-qp-refresh:hover {
    background: var(--cx-surface);
    border-color: var(--cx-border-strong);
    color: var(--cx-text);
}
#cx-question-picker .cx-qp-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px;
    overscroll-behavior: contain;
}
#cx-question-picker .cx-qp-group { margin-bottom: 16px; }
#cx-question-picker .cx-qp-group:last-child { margin-bottom: 0; }
#cx-question-picker .cx-qp-group-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.4;
    color: var(--cx-text-2);
    cursor: pointer;
}
#cx-question-picker .cx-qp-questions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

/* 题目卡片（去掉描边光效，改为扁平选中态） */
#cx-question-picker .cx-qp-q.border-glow-card {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 34px;
    padding: 8px;
    background: var(--cx-bg-2);
    border: 1px solid var(--cx-border);
    border-radius: var(--cx-radius-sm);
    color: var(--cx-text-2);
    cursor: pointer;
    transition: background var(--cx-t), border-color var(--cx-t), color var(--cx-t);
}
#cx-question-picker .cx-qp-q.border-glow-card:hover {
    background: var(--cx-surface);
    border-color: var(--cx-border-strong);
    color: var(--cx-text);
}
#cx-question-picker .cx-qp-q.border-glow-card.cx-qp-q-active {
    background: var(--cx-accent-tint);
    border-color: var(--cx-accent);
    color: var(--cx-accent);
}
#cx-question-picker .cx-qp-q .border-glow-inner {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.4;
    color: inherit;
}
#cx-question-picker .cx-qp-q .edge-light { display: none; }
#cx-question-picker .cx-qp-q input[type="checkbox"] { display: none; }
#cx-question-picker .cx-qp-empty {
    padding: 24px 12px;
    text-align: center;
    font-size: 11px;
    line-height: 1.6;
    color: var(--cx-text-3);
}
#cx-question-picker .cx-qp-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 140px;
    padding: 24px;
    font-size: 11px;
    color: var(--cx-text-3);
}
#cx-question-picker .cx-qp-spinner-svg { color: var(--cx-accent); }

/* ---------- 设置页 ---------- */
#answer-helper-panel .cx-api-settings { padding: 0; overflow: hidden; }

.cx-set-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 0 18px;
    overscroll-behavior: contain;
}

.cx-set-section { padding: 14px; }
.cx-set-section + .cx-set-section {
    margin-top: 2px;
    padding-top: 14px;
    border-top: 1px solid var(--cx-border);
}
.cx-set-title {
    margin: 0 0 12px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: var(--cx-text-3);
}

/* 字段 */
.cx-set-field { margin-bottom: 12px; }
.cx-set-field:last-child { margin-bottom: 0; }
.cx-set-label {
    display: block;
    margin-bottom: 6px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--cx-text-2);
}
.cx-set-label-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 6px;
}
.cx-set-label-row .cx-set-label { margin-bottom: 0; }
.cx-set-inline-note {
    flex: none;
    max-width: 55%;
    font-size: 10px;
    color: var(--cx-text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

#answer-helper-panel .cx-set-field input[type="text"],
#answer-helper-panel .cx-set-field input[type="password"],
#answer-helper-panel .cx-set-field select {
    width: 100%;
    padding: 7px 9px;
    background: var(--cx-bg-2);
    border: 1px solid var(--cx-border);
    border-radius: var(--cx-radius-sm);
    color: var(--cx-text);
    font-size: 11px;
    line-height: 1.4;
    outline: none;
    transition: border-color var(--cx-t), background var(--cx-t), box-shadow var(--cx-t);
}
#answer-helper-panel .cx-set-field input[type="text"]:hover,
#answer-helper-panel .cx-set-field input[type="password"]:hover,
#answer-helper-panel .cx-set-field select:hover {
    border-color: var(--cx-border-strong);
}
#answer-helper-panel .cx-set-field input[type="text"]:focus,
#answer-helper-panel .cx-set-field input[type="password"]:focus,
#answer-helper-panel .cx-set-field select:focus {
    border-color: var(--cx-accent);
    background: var(--cx-bg);
    box-shadow: 0 0 0 3px var(--cx-accent-tint);
}
#answer-helper-panel .cx-set-field input::placeholder { color: var(--cx-text-3); opacity: 0.72; }

.cx-set-note {
    margin-top: 6px;
    font-size: 10px;
    line-height: 1.65;
    color: var(--cx-text-3);
}
.cx-set-note b { color: var(--cx-text-2); font-weight: 500; }

.cx-set-divider {
    height: 1px;
    margin: 14px 0;
    background: var(--cx-border);
}
.cx-set-subhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
    font-size: 11px;
    font-weight: 600;
    color: var(--cx-text-2);
}
.cx-set-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
}
.cx-set-danger {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--cx-border);
}
.cx-set-danger .cx-api-btn { width: 100%; }

/* 开关 */
.cx-set-switch-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 12px 0 0;
}
.cx-set-switch {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    user-select: none;
}
.cx-set-switch > input[type="checkbox"] {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    opacity: 0;
    pointer-events: none;
}
.cx-set-switch-track {
    position: relative;
    flex: none;
    width: 32px;
    height: 18px;
    border-radius: 999px;
    background: var(--cx-surface-hover);
    border: 1px solid var(--cx-border);
    transition: background var(--cx-t), border-color var(--cx-t), box-shadow var(--cx-t);
}
.cx-set-switch-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--cx-text-3);
    transition: transform var(--cx-t), background var(--cx-t);
}
.cx-set-switch > input:checked + .cx-set-switch-track {
    background: var(--cx-accent);
    border-color: var(--cx-accent);
}
.cx-set-switch > input:checked + .cx-set-switch-track .cx-set-switch-thumb {
    transform: translateX(14px);
    background: #ffffff;
}
.cx-set-switch > input:focus-visible + .cx-set-switch-track {
    box-shadow: 0 0 0 3px var(--cx-accent-tint);
}
.cx-set-switch-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}
.cx-set-switch-title {
    font-size: 11px;
    line-height: 1.4;
    color: var(--cx-text);
}
.cx-set-switch-desc {
    font-size: 10px;
    line-height: 1.55;
    color: var(--cx-text-3);
}
.cx-set-switch:hover .cx-set-switch-title { color: var(--cx-text); }
.cx-set-switch-row { padding: 0; }

/* 正确率 */
#answer-helper-panel .cx-answer-accuracy-block {
    padding: 12px;
    background: var(--cx-bg-2);
    border: 1px solid var(--cx-border);
    border-radius: var(--cx-radius);
}
#answer-helper-panel .cx-answer-accuracy-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 10px;
    font-size: 11px;
    color: var(--cx-text-2);
}
#answer-helper-panel .cx-answer-accuracy-title span {
    color: var(--cx-text);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}
#answer-helper-panel .cx-answer-accuracy-row {
    display: flex;
    align-items: center;
    gap: 10px;
}
#answer-helper-panel .cx-answer-accuracy-row input[type="range"] {
    flex: 1;
    min-width: 0;
    margin: 0;
    accent-color: var(--cx-accent);
    cursor: pointer;
}
#answer-helper-panel .cx-answer-accuracy-row input[type="number"] {
    flex: none;
    width: 54px;
    padding: 5px 6px;
    background: var(--cx-bg);
    border: 1px solid var(--cx-border);
    border-radius: var(--cx-radius-sm);
    color: var(--cx-text);
    font-family: inherit;
    font-size: 11px;
    text-align: center;
    outline: none;
    font-variant-numeric: tabular-nums;
    transition: border-color var(--cx-t), box-shadow var(--cx-t);
}
#answer-helper-panel .cx-answer-accuracy-row input[type="number"]:focus {
    border-color: var(--cx-accent);
    box-shadow: 0 0 0 3px var(--cx-accent-tint);
}
#answer-helper-panel .cx-answer-accuracy-block .cx-set-note { margin-top: 10px; }

/* API 胶囊标签 */
#answer-helper-panel .cx-api-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
}
#answer-helper-panel .cx-api-tab {
    padding: 4px 10px;
    background: transparent;
    border: 1px solid var(--cx-border);
    border-radius: 999px;
    color: var(--cx-text-2);
    font-size: 10px;
    line-height: 1.5;
    cursor: pointer;
    transition: background var(--cx-t), border-color var(--cx-t), color var(--cx-t);
}
#answer-helper-panel .cx-api-tab:hover {
    background: var(--cx-surface);
    border-color: var(--cx-border-strong);
    color: var(--cx-text);
}
#answer-helper-panel .cx-api-tab.active {
    background: var(--cx-accent-tint);
    border-color: var(--cx-accent);
    color: var(--cx-accent);
}
#answer-helper-panel .cx-api-tab-add {
    border-style: dashed;
    color: var(--cx-text-3);
}
#answer-helper-panel .cx-api-tab-add:hover { color: var(--cx-text-2); }

#answer-helper-panel .cx-api-body {
    padding: 14px 0 0;
    overflow: visible;
}

/* 按钮 */
#answer-helper-panel .cx-api-btn {
    padding: 5px 12px;
    background: transparent;
    border: 1px solid var(--cx-border);
    border-radius: var(--cx-radius-sm);
    color: var(--cx-text-2);
    font-family: inherit;
    font-size: 11px;
    line-height: 1.5;
    cursor: pointer;
    transition: background var(--cx-t), border-color var(--cx-t), color var(--cx-t);
}
#answer-helper-panel .cx-api-btn:hover {
    background: var(--cx-surface);
    border-color: var(--cx-border-strong);
    color: var(--cx-text);
}
#answer-helper-panel .cx-api-btn:disabled { opacity: 0.45; cursor: not-allowed; }
#answer-helper-panel .cx-api-btn.primary {
    background: var(--cx-accent);
    border-color: var(--cx-accent);
    color: #ffffff;
}
#answer-helper-panel .cx-api-btn.primary:hover {
    background: var(--cx-accent-strong);
    border-color: var(--cx-accent-strong);
}
#answer-helper-panel .cx-api-btn.danger {
    color: var(--cx-danger);
    border-color: var(--cx-border);
}
#answer-helper-panel .cx-api-btn.danger:hover {
    background: transparent;
    border-color: var(--cx-danger);
    color: var(--cx-danger);
}
#answer-helper-panel .cx-api-btn-ghost {
    padding: 2px 8px;
    border-color: transparent;
    color: var(--cx-text-3);
    font-size: 10px;
    font-weight: 400;
}
#answer-helper-panel .cx-api-btn-ghost:hover {
    background: var(--cx-surface);
    border-color: var(--cx-border);
    color: var(--cx-text);
}

/* 状态卡 */
#answer-helper-panel .cx-api-status {
    padding: 10px 12px;
    background: var(--cx-bg-2);
    border: 1px solid var(--cx-border);
    border-radius: var(--cx-radius);
}
#answer-helper-panel .cx-api-status-title {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    font-weight: 500;
    color: var(--cx-text);
}
#answer-helper-panel .cx-status-dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
}
#answer-helper-panel .cx-api-status-ok .cx-api-status-title { color: var(--cx-success); }
#answer-helper-panel .cx-api-status-warn .cx-api-status-title { color: var(--cx-warn); }
#answer-helper-panel .cx-status-kv {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 8px;
}
#answer-helper-panel .cx-status-kv-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
}
#answer-helper-panel .cx-status-kv-key {
    flex: none;
    width: 24px;
    font-size: 10px;
    color: var(--cx-text-3);
}
#answer-helper-panel .cx-status-kv-val {
    flex: 1;
    min-width: 0;
    font-family: var(--cx-mono);
    font-size: 10px;
    line-height: 1.6;
    color: var(--cx-text-2);
    word-break: break-all;
}
#answer-helper-panel .cx-api-empty {
    padding: 24px 0;
    text-align: center;
    font-size: 11px;
    color: var(--cx-text-3);
}

/* 模型卡片 */
.cx-model-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 2px;
}
.cx-model-card {
    padding: 10px;
    background: var(--cx-bg-2);
    border: 1px solid var(--cx-border);
    border-radius: var(--cx-radius);
    transition: border-color var(--cx-t), background var(--cx-t);
}
.cx-model-card:hover { border-color: var(--cx-border-strong); }
.cx-model-card.is-current {
    border-color: var(--cx-accent);
    box-shadow: inset 2px 0 0 var(--cx-accent);
}
.cx-model-card-head {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
}
.cx-model-card-head input {
    flex: 1;
    min-width: 0;
    padding: 3px 6px;
    margin-left: -6px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    color: var(--cx-text);
    font-family: inherit;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.5;
    outline: none;
    transition: background var(--cx-t), border-color var(--cx-t);
}
.cx-model-card-head input:hover { border-color: var(--cx-border); }
.cx-model-card-head input:focus {
    background: var(--cx-bg);
    border-color: var(--cx-accent);
}
.cx-model-card-head input::placeholder { color: var(--cx-text-3); font-weight: 400; }
.cx-model-del {
    flex: none;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 5px;
    color: var(--cx-text-3);
    cursor: pointer;
    transition: color var(--cx-t), background var(--cx-t);
}
.cx-model-del:hover { color: var(--cx-danger); background: var(--cx-surface-hover); }
.cx-model-card-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
    gap: 8px;
}
.cx-model-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}
.cx-model-cell > span {
    font-size: 9px;
    line-height: 1.3;
    letter-spacing: 0.04em;
    color: var(--cx-text-3);
}
.cx-model-cell input {
    width: 100%;
    min-width: 0;
    padding: 5px 7px;
    background: var(--cx-bg);
    border: 1px solid var(--cx-border);
    border-radius: 5px;
    color: var(--cx-text);
    font-family: var(--cx-mono);
    font-size: 10px;
    line-height: 1.5;
    outline: none;
    transition: border-color var(--cx-t), box-shadow var(--cx-t);
}
.cx-model-cell input:focus {
    border-color: var(--cx-accent);
    box-shadow: 0 0 0 2px var(--cx-accent-tint);
}
.cx-model-cell input::placeholder { color: var(--cx-text-3); opacity: 0.7; }
.cx-model-use {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 8px;
    padding: 0;
    background: none;
    border: none;
    color: var(--cx-text-3);
    font-family: inherit;
    font-size: 10px;
    line-height: 1.6;
    cursor: pointer;
    transition: color var(--cx-t);
}
.cx-model-use::before {
    content: '';
    width: 5px;
    height: 5px;
    border-radius: 50%;
    border: 1px solid currentColor;
    transition: background var(--cx-t), border-color var(--cx-t);
}
.cx-model-use:hover { color: var(--cx-text-2); }
.cx-model-use.is-on {
    color: var(--cx-accent);
    cursor: default;
}
.cx-model-use.is-on::before {
    background: currentColor;
    border-color: currentColor;
}

/* 底栏 */
#answer-helper-panel .cx-api-settings-footer {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 14px;
    background: var(--cx-bg);
    border-top: 1px solid var(--cx-border);
}
.cx-set-autosave {
    font-size: 10px;
    color: var(--cx-text-3);
}
#answer-helper-panel .cx-api-settings-footer .ah-btn {
    flex: none;
    width: auto;
    min-width: 84px;
}

/* ---------- 滚动条 ---------- */
#answer-log.cx-scroll-list::-webkit-scrollbar,
#cx-question-picker .cx-qp-list::-webkit-scrollbar,
.cx-set-scroll::-webkit-scrollbar,
#cx-answer-stream::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}
#answer-log.cx-scroll-list::-webkit-scrollbar-track,
#cx-question-picker .cx-qp-list::-webkit-scrollbar-track,
.cx-set-scroll::-webkit-scrollbar-track,
#cx-answer-stream::-webkit-scrollbar-track {
    background: transparent;
}
#answer-log.cx-scroll-list::-webkit-scrollbar-thumb,
#cx-question-picker .cx-qp-list::-webkit-scrollbar-thumb,
.cx-set-scroll::-webkit-scrollbar-thumb,
#cx-answer-stream::-webkit-scrollbar-thumb {
    background: var(--cx-border-strong);
    border-radius: 3px;
}

/* ---------- 轻提示 ---------- */
#no-task-toast {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    padding: 10px 14px;
    max-width: 320px;
    background: var(--cx-bg);
    border: 1px solid var(--cx-border);
    border-radius: var(--cx-radius-sm);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    color: var(--cx-text);
    font-family: var(--cx-font);
    font-size: 12px;
    line-height: 1.5;
    animation: cxToastInOut 3s ease forwards;
}
@keyframes cxToastInOut {
    0% { opacity: 0; transform: translateY(-6px); }
    10%, 90% { opacity: 1; transform: none; }
    100% { opacity: 0; transform: translateY(-6px); }
}

/* ---------- 页面模式 ---------- */
#answer-helper-panel.panel-mode-brush-only .cx-study-block,
#answer-helper-panel.panel-mode-brush-only .panel-col-picker,
#answer-helper-panel.panel-mode-brush-only #cx_ai_status_badge,
#answer-helper-panel.panel-mode-brush-only .cx-chroma-card-answer,
#answer-helper-panel.panel-mode-brush-only .cx-chroma-card-study,
#answer-helper-panel.panel-mode-brush-only .cx-chroma-card-paste {
    display: none !important;
}
#answer-helper-panel.panel-mode-brush-only .cx-chroma-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
}
#answer-helper-panel.panel-mode-study .cx-chroma-card-brush { display: none !important; }

@keyframes cx-qp-spin { to { transform: rotate(360deg); } }
`);


function createPanel() {
    const kept = enforceSinglePanelInDocument();
    if (kept) return kept;
    if (document.getElementById(CX_ROOT_ID)) {
        return document.getElementById('answer-helper-panel');
    }
    let isChapterPage = false;
    try {
        isChapterPage = isChapterStudyFrameHostUrl(window.top.location.href);
    } catch (e) {
        isChapterPage = isChapterStudyFrameHostUrl(location.href);
    }
    const panel = document.createElement('div');
    panel.id = 'answer-helper-panel';
    panel.innerHTML = `
        <div id="answer-helper-header">
            <span class="title"><span class="title-text title-full">路南学习通研习助手</span><span class="title-text title-short">路南研习助手</span></span>
            <div class="cx-header-actions">
                ${cxPluginLogoImg({ size: 32, className: 'cx-header-logo' })}
                <button id="cx-feedback-btn" class="ah-btn ah-secondary" style="min-width:28px; width:28px; height:28px; padding:0; border-radius:7px;" title="意见反馈">
                    <span class="button-icon">${cxIcon('message', { size: 14 })}</span>
                </button>
                <button class="cx-collapse-btn" title="收起侧边栏">
                  <span class="cx-collapse-btn-inner">›</span>
                </button>
            </div>
        </div>
        <div class="cx-panel-tabs">
            <button class="cx-panel-tab cx-active" data-tab="main" type="button">功能</button>
            <button class="cx-panel-tab" data-tab="settings" type="button">设置</button>
        </div>
        <div id="answer-helper-content">
            <div id="cx-tab-main" class="cx-tab-pane">
            <div class="panel-body">
                <div class="panel-col panel-col-func">
                    <div class="panel-main">
                        <div class="cx-study-block">
                            <div id="cx-answer-progress-wrap" style="display:none;">
                                <div class="cx-api-progress-wrap">
                                    <div class="cx-api-progress-track"><div id="cx-answer-progress-bar" class="cx-api-progress-bar"></div></div>
                                    <div id="cx-answer-progress-text">准备中...</div>
                                </div>
                                <div id="cx-answer-stream"></div>
                            </div>
                            <div id="playback-speed-controls" class="segmented" style="display:none;">
                                <button id="speed-1x" class="ah-btn ah-secondary speed-button speed-active"><span class="button-icon">1×</span></button>
                                <button id="speed-1.5x" class="ah-btn ah-secondary speed-button"><span class="button-icon">1.5×</span></button>
                                <button id="speed-2x" class="ah-btn ah-secondary speed-button"><span class="button-icon">2×</span></button>
                            </div>
                            <div class="cx-chroma-wrap">
                                <div id="cx-chroma-grid" class="chroma-grid">
                                    <article id="cx-api-goto" class="chroma-card cx-chroma-card-brush" role="button" tabindex="0"
                                       >
                                        <div class="chroma-img-wrapper"><div class="chroma-icon">${cxIcon('bolt', { size: 18 })}</div></div>
                                        <footer class="chroma-info">
                                            <h3 class="name">打开刷课页</h3>
                                            <span class="handle">API</span>
                                            <p class="role">批量刷课</p>
                                        </footer>
                                    </article>
                                    <article id="start-answer" class="chroma-card cx-chroma-card-answer" role="button" tabindex="0"
                                        style="${isChapterPage ? 'display:none;' : ''}">
                                        <div class="chroma-img-wrapper"><div class="chroma-icon">${cxIcon('play', { size: 18 })}</div></div>
                                        <footer class="chroma-info">
                                            <h3 class="name">一键答题</h3>
                                            <span class="handle">AI</span>
                                            <p class="role">自动填答案</p>
                                        </footer>
                                    </article>
                                    <article id="pause-answer" class="chroma-card chroma-card-pause cx-chroma-card-answer" role="button" tabindex="0"
                                        style="display:none;">
                                        <div class="chroma-img-wrapper"><div class="chroma-icon">${cxIcon('pause', { size: 18 })}</div></div>
                                        <footer class="chroma-info">
                                            <h3 class="name">暂停答题</h3>
                                            <span class="handle">STOP</span>
                                            <p class="role">点击停止当前答题</p>
                                        </footer>
                                    </article>
                                    <article id="start-study" class="chroma-card cx-chroma-card-study" role="button" tabindex="0"
                                       >
                                        <div class="chroma-img-wrapper"><div class="chroma-icon">${cxIcon('skipForward', { size: 18 })}</div></div>
                                        <footer class="chroma-info">
                                            <h3 class="name">${isChapterPage ? '开始刷章节' : '刷章节测验'}</h3>
                                            <span class="handle">AUTO</span>
                                            <p class="role">自动刷课</p>
                                        </footer>
                                    </article>
                                    <article id="pause-study" class="chroma-card chroma-card-pause cx-chroma-card-study" role="button" tabindex="0"
                                        style="display:none;">
                                        <div class="chroma-img-wrapper"><div class="chroma-icon">${cxIcon('stop', { size: 16 })}</div></div>
                                        <footer class="chroma-info">
                                            <h3 class="name">暂停刷章节</h3>
                                            <span class="handle">STOP</span>
                                            <p class="role">点击停止刷课任务</p>
                                        </footer>
                                    </article>
                                    <article id="cx-paste-unlock-btn" class="chroma-card cx-chroma-card-paste${isPasteUnlockEnabled() ? ' cx-paste-unlock-on' : ''}" role="button" tabindex="0"
                                        style="${isPasteUnlockPageContext() ? '' : 'display:none;'}"
                                        title="${isPasteUnlockEnabled() ? '粘贴解除已开启（点击关闭并刷新）' : '粘贴解除已关闭（点击开启并刷新）'}">
                                        <div class="chroma-img-wrapper"><div class="chroma-icon">${cxIcon('clipboard', { size: 16 })}</div></div>
                                        <footer class="chroma-info">
                                            <h3 class="name">粘贴解除</h3>
                                            <span class="handle">${isPasteUnlockEnabled() ? '已开启' : '已关闭'}</span>
                                            <p class="role">作业粘贴限制</p>
                                        </footer>
                                    </article>
                                    <div class="chroma-overlay" aria-hidden="true"></div>
                                    <div class="chroma-fade" aria-hidden="true"></div>
                                </div>
                            </div>
                            <div id="cx_ai_status_badge" class="cx-ai-status-badge">检测 AI 配置...</div>
                            <div class="cx-log-list-container">
                                <div id="answer-log" class="cx-scroll-list" role="log" aria-live="polite"></div>
                                <div class="cx-log-top-gradient" aria-hidden="true"></div>
                                <div class="cx-log-bottom-gradient" aria-hidden="true"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="panel-col panel-col-picker">
                    <div id="cx-question-picker">
                        <div class="cx-qp-toolbar">
                            <label><input type="checkbox" id="cx-qp-select-all" checked> 全选题目</label>
                            <button type="button" class="cx-qp-refresh" id="cx-qp-refresh">${cxIconLabel('refresh', '刷新', { size: 12 })}</button>
                        </div>
                        <div id="cx-qp-list" class="cx-qp-list"></div>
                    </div>
                </div>
            </div>
            </div>
            <div id="cx-tab-settings" class="cx-tab-pane cx-api-settings" style="display:none">
                <div class="cx-set-scroll">
                    <section class="cx-set-section">
                        <div class="cx-set-title">答题</div>
                        <div class="cx-answer-accuracy-block">
                            <div class="cx-answer-accuracy-title">答题正确率 <span id="cx-answer-accuracy-value">100%</span></div>
                            <div class="cx-answer-accuracy-row">
                                <input type="range" id="cx-answer-accuracy" min="0" max="100" step="1" value="100">
                                <input type="number" id="cx-answer-accuracy-num" min="0" max="100" step="1" value="100">
                            </div>
                            <div class="cx-set-note">默认 100%。低于 100% 时，客观题会按概率故意答错或跳过。</div>
                        </div>
                    </section>
                    <section class="cx-set-section">
                        <div class="cx-set-title">AI 接口</div>
                        <div id="cx-api-settings-top"></div>
                        <div id="cx-api-settings-tabs" class="cx-api-tabs"></div>
                        <div id="cx-api-settings-body" class="cx-api-body"></div>
                    </section>
                </div>
                <div class="cx-api-settings-footer">
                    <span class="cx-set-autosave">修改即时生效</span>
                    <button type="button" id="cx-api-settings-save" class="ah-btn ah-primary">保存配置</button>
                </div>
            </div>
        </div>
    `;

    const root = document.createElement('div');
    root.id = CX_ROOT_ID;
    root.innerHTML =
        '<button id="cx-sidebar-tab" type="button" title="拖动可上下移动，点击打开路南研习助手">' +
            cxPluginLogoImg({ size: 22, className: 'cx-sidebar-tab-icon' }) +
            '<span>研习</span>' +
        '</button>';
    root.appendChild(panel);
    document.documentElement.appendChild(root);

    const sidebarTab = root.querySelector('#cx-sidebar-tab');
    applySidebarTabPosition(sidebarTab);
    setupSidebarTabDrag(sidebarTab, () => toggleCxSidebar(true));
    panel.querySelector('.cx-collapse-btn')?.addEventListener('click', () => toggleCxSidebar(false));

    return panel;
}

function setPanelFixedHeight(px) {
    /* 侧边栏模式：全屏高度，无需动态调整 */
}

function initChromaGrid() {
    const root = document.getElementById('cx-chroma-grid');
    if (!root || root.dataset.cxChromaInit === '1') return;
    root.dataset.cxChromaInit = '1';

    const fade = root.querySelector('.chroma-fade');
    let pos = { x: root.clientWidth / 2, y: root.clientHeight / 2 };
    let target = { x: pos.x, y: pos.y };
    let rafId = null;

    const applyPos = () => {
        root.style.setProperty('--x', target.x + 'px');
        root.style.setProperty('--y', target.y + 'px');
    };

    const tick = () => {
        pos.x += (target.x - pos.x) * 0.14;
        pos.y += (target.y - pos.y) * 0.14;
        root.style.setProperty('--x', pos.x + 'px');
        root.style.setProperty('--y', pos.y + 'px');
        if (Math.abs(pos.x - target.x) > 0.4 || Math.abs(pos.y - target.y) > 0.4) {
            rafId = requestAnimationFrame(tick);
        } else {
            rafId = null;
            applyPos();
        }
    };

    const moveTo = (x, y) => {
        target.x = x;
        target.y = y;
        if (!rafId) rafId = requestAnimationFrame(tick);
    };

    root.addEventListener('pointermove', (e) => {
        const r = root.getBoundingClientRect();
        moveTo(e.clientX - r.left, e.clientY - r.top);
        if (fade) fade.style.opacity = '0';
    });
    root.addEventListener('pointerleave', () => {
        if (fade) fade.style.opacity = '1';
    });

    root.querySelectorAll('.chroma-card').forEach((card) => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            card.style.setProperty('--mouse-x', (e.clientX - rect.left) + 'px');
            card.style.setProperty('--mouse-y', (e.clientY - rect.top) + 'px');
        });
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                card.click();
            }
        });
    });

    applyPos();
}

function bindPanelEvents() {
    document.getElementById('start-answer')?.addEventListener('click', () => {
        addLog('本助手仅供学习研究，请遵守课程与平台规则。', 'info');
        addLog('开始自动答题...');
        autoAnswer();
    });
    document.getElementById('pause-answer')?.addEventListener('click', () => {
        isAnswering = false;
        addLog('正在暂停自动答题...', 'info');
    });
    const startStudyBtn = document.getElementById('start-study');
    const pauseStudyBtn = document.getElementById('pause-study');
    if (startStudyBtn && pauseStudyBtn) {
        startStudyBtn.addEventListener('click', () => {
            addLog('本助手仅供学习研究，请遵守课程与平台规则。', 'info');
            startStudyChapters();
        });
        pauseStudyBtn.addEventListener('click', () => { stopStudyChapters(); });
    }

    document.getElementById('speed-1x')?.addEventListener('click', () => {
        setVideoPlaybackSpeed(1.0);
    });
    document.getElementById('speed-1.5x')?.addEventListener('click', () => {
        setVideoPlaybackSpeed(1.5);
        if (isChapterStudyPageContext()) {
            addLog('章节视频请勿倍速观看，倍速观看可能导致账号异常哦', 'warning');
        }
    });
    document.getElementById('speed-2x')?.addEventListener('click', () => {
        setVideoPlaybackSpeed(2.0);
        if (isChapterStudyPageContext()) {
            addLog('章节视频请勿倍速观看，倍速观看可能导致账号异常哦', 'warning');
        }
    });

    updateSpeedButtonsState();
    bindQuestionPickerEvents();
    setTimeout(updateAiStatusBadge, 0);
    initAnswerLogList();
    initChromaGrid();

    document.getElementById('cx-feedback-btn')?.addEventListener('click', () => { showFeedbackModal(); });
    document.querySelectorAll('.cx-panel-tab').forEach((tab) => {
        tab.addEventListener('click', () => switchCxPanelTab(tab.dataset.tab));
    });
    document.getElementById('cx-paste-unlock-btn')?.addEventListener('click', () => {
        setPasteUnlockEnabled(!isPasteUnlockEnabled());
        markPanelReopenAfterReload();
        location.reload();
    });
    document.getElementById('cx_ai_status_badge')?.addEventListener('click', () => { showApiSettingsModal(); });

    document.getElementById('cx-api-goto')?.addEventListener('click', () => {
        addLog('正在打开路南云 API 刷课页…', 'info');
        openApiBrushPage();
    });
    bindAnswerAccuracyControls();
}


function safeClick(el) {
    try {
        if (!el) return false;
        el.click();
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
    } catch { return false; }
}


function forEachSameOriginFrame(callback) {
    const visit = (win) => {
        for (let i = 0; i < win.frames.length; i++) {
            const f = win.frames[i];
            try {
                const doc = f.document || f.contentDocument;
                if (doc && doc.location && doc.location.href.includes('.chaoxing.com')) {
                    callback(doc);
                    visit(f);
                }
            } catch {  }
        }
    };
    try { callback(document); } catch {}
    try { visit(window); } catch {}
}


function forEachAllSameOriginDocs(callback) {
    const seen = new Set();
    const visit = (win) => {
        if (!win || seen.has(win)) return;
        seen.add(win);
        try {
            const doc = win.document || win.contentDocument;
            if (doc) callback(doc);
        } catch {}
        try {
            const len = win.frames ? win.frames.length : 0;
            for (let i = 0; i < len; i++) {
                try { visit(win.frames[i]); } catch {}
            }
        } catch {}
    };
    try { visit(window.top); } catch { visit(window); }
}


const QUESTION_CONTAINER_SELECTOR = '.question, .questionLi, .subject_item, .examPaper_subject, .questionContainer, .q-item, .subject_node, .ti-item, .exam-item, .TiMu, .singleQuesId';

function isNullPageDoc(doc) {
    try {
        const nullEl = doc.querySelector('.nullpage');
        if (!nullEl) return false;
        const txt = (nullEl.textContent || '').trim();
        return txt.includes('暂无内容');
    } catch {}
    return false;
}

function isLikelyQuestionContainer(el) {
    try {
        if (!el) return false;
        if (el.closest('.translationBox, .func-pop, .colorPop, .nullpage')) return false;

        if (el.id === 'fanyaMarking') return false;
        if (el.querySelector('.singleQuesId, .questionLi') && !el.classList.contains('singleQuesId') && !el.classList.contains('questionLi')) return false;
        if (el.querySelector('.stem_answer, .subject_describe, .questionContent, .subject_stem, .type_title, .subject_type, .stem_type, [id^="answertype"], .Zy_TItle, ul.Zy_ulTop')) return true;
        if (el.querySelector('input[type="radio"], input[type="checkbox"], textarea, [id^="answerEditor"], iframe[id^="ueditor_"], div[contenteditable="true"]')) return true;
        const t = (el.textContent || '').trim();
        if (/单选题|多选题|判断题|填空题|简答题|名词解释|论述题|计算题|完形填空|写作题|连线题|分录题/.test(t)) return true;
    } catch {}
    return false;
}

function isUtilityElement(el) {
    try {
        if (!el || !el.closest) return false;
        return !!el.closest('.translationBox, .func-pop, .colorPop, #markDiv, .code-tool-wrap');
    } catch {}
    return false;
}

function isVisibleElement(el) {
    try {
        if (!el) return false;
        const win = (el.ownerDocument && el.ownerDocument.defaultView) || window;
        const st = win.getComputedStyle ? win.getComputedStyle(el) : null;
        if (st && (st.display === 'none' || st.visibility === 'hidden')) return false;
        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        return !!(r && r.width > 0 && r.height > 0);
    } catch {}
    return true;
}

function getInteractiveInputs(doc) {
    try {
        const list = Array.from(doc.querySelectorAll('input[type="radio"], input[type="checkbox"], textarea, select, input[type="text"], div[contenteditable="true"], [id^="answerEditor"], iframe[id^="ueditor_"]'));
        return list.filter(el => !isUtilityElement(el) && isVisibleElement(el));
    } catch {}
    return [];
}

function getQuestionContainers(doc) {
    try {
        if (!doc || isNullPageDoc(doc)) return [];
        const all = Array.from(doc.querySelectorAll(QUESTION_CONTAINER_SELECTOR));
        return all.filter(isLikelyQuestionContainer);
    } catch {}
    return [];
}

const QUESTION_TYPE_LABELS = {
    single: '单选题', multiple: '多选题', judge: '判断题', blank: '填空题',
    short: '简答题', term: '名词解释', essay: '论述题', calculation: '计算题',
    cloze: '完形填空', writing: '写作题', matching: '连线题', accounting: '分录题',
    text: '其他题', unknown: '其他题'
};
const SECTION_HEADER_RE = /([一二三四五六七八九十百千]+)[、.．]\s*([^（(]+?)[（(]([\d.]+)\s*分[）)]/;
const CN_SECTION_LABELS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

function compareNodeOrder(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 0;
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
}

function parseSectionHeaderText(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    const m = t.match(SECTION_HEADER_RE);
    if (!m) return null;
    return { sectionLabel: m[1], typeLabel: m[2].trim(), score: m[3], scoreText: m[3] + '分' };
}

function findSectionHeadersInDoc(doc) {
    const headers = [];
    const seen = new Set();
    const tryAdd = (el) => {
        if (!el || seen.has(el)) return;
        const parsed = parseSectionHeaderText(el.textContent || '');
        if (!parsed) return;
        seen.add(el);
        headers.push(Object.assign({ element: el, doc: doc }, parsed));
    };
    try {
        doc.querySelectorAll('h1,h2,h3,h4,h5,.part_title,.big_title,.quesType,.type_describe,.titleCon,.TiMu_type,.mark_name').forEach(tryAdd);
        if (headers.length === 0) {
            doc.querySelectorAll('div,p,span,li,td').forEach((el) => {
                if (el.children.length > 3) return;
                const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (txt.length < 6 || txt.length > 36) return;
                tryAdd(el);
            });
        }
    } catch {}
    headers.sort((a, b) => compareNodeOrder(a.element, b.element));
    return headers;
}

function findPrecedingSectionHeader(questionEl, headers) {
    let best = null;
    const doc = questionEl.ownerDocument;
    for (const h of headers) {
        if (h.doc !== doc) continue;
        if (compareNodeOrder(h.element, questionEl) < 0) {
            if (!best || compareNodeOrder(h.element, best.element) > 0) best = h;
        }
    }
    return best;
}

function resolveTypeLabel(info) {
    if (!info) return '其他题';
    for (const key of Object.keys(QUESTION_TYPE_LABELS)) {
        if (info.type === key) return QUESTION_TYPE_LABELS[key];
    }
    return QUESTION_TYPE_LABELS.unknown;
}

function makeQuestionKey(doc, el, idx) {
    try {
        const href = (doc.location && doc.location.href) || '';
        const qid = el.id || el.getAttribute('data') || '';
        const inp = el.querySelector('input[id^="answertype"]');
        const ansId = inp ? inp.id.replace('answertype', '') : '';
        return href + '::' + (qid || ansId || ('idx_' + idx));
    } catch {
        return 'q_' + idx + '_' + Math.random().toString(36).slice(2, 7);
    }
}

function buildQuestionCatalog() {
    const items = [];
    forEachAllSameOriginDocs((doc) => {
        const headers = findSectionHeadersInDoc(doc);
        const containers = getQuestionContainers(doc);
        containers.forEach((el, idx) => {
            let info = null;
            try { info = getQuestionInfo(el); } catch {}
            if (!info) {
                info = {
                    type: 'unknown',
                    question: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
                    options: [],
                    questionId: el.id || ''
                };
            }
            const header = findPrecedingSectionHeader(el, headers);
            const typeLabel = (header && header.typeLabel) || resolveTypeLabel(info);
            const groupKey = header
                ? header.sectionLabel + '_' + typeLabel + '_' + header.score
                : 'type_' + typeLabel;
            items.push({
                key: makeQuestionKey(doc, el, idx),
                doc: doc,
                element: el,
                info: info,
                sectionLabel: header ? header.sectionLabel : '',
                typeLabel: typeLabel,
                score: header ? header.score : '',
                scoreText: header ? header.scoreText : '',
                groupKey: groupKey
            });
        });
    });

    const groups = [];
    const groupMap = new Map();
    items.forEach((item) => {
        if (!groupMap.has(item.groupKey)) {
            const g = {
                key: item.groupKey,
                sectionLabel: item.sectionLabel,
                typeLabel: item.typeLabel,
                score: item.score,
                scoreText: item.scoreText,
                questions: []
            };
            groupMap.set(item.groupKey, g);
            groups.push(g);
        }
        const g = groupMap.get(item.groupKey);
        g.questions.push(Object.assign(item, { numberInGroup: g.questions.length + 1 }));
    });
    groups.forEach((g, i) => {
        if (!g.sectionLabel) g.sectionLabel = CN_SECTION_LABELS[i] || String(i + 1);
    });
    return { items: items, groups: groups };
}

function syncQuestionSelectionAllSelected() {
    questionSelection = new Set((questionCatalog && questionCatalog.items || []).map((it) => it.key));
}

function isQuestionSelected(key) {
    if (!questionCatalog || !questionCatalog.items.length) return true;
    return questionSelection.has(key);
}

function getSelectedQuestionEntries() {
    if (!questionCatalog || !questionCatalog.items.length) {
        const fallback = [];
        forEachAllSameOriginDocs((doc) => {
            getQuestionContainers(doc).forEach((el) => fallback.push({ doc: doc, element: el }));
        });
        return fallback;
    }
    return questionCatalog.items.filter((it) => questionSelection.has(it.key));
}

function updateQuestionPickerSelectAllState() {
    const allCb = document.getElementById('cx-qp-select-all');
    if (!allCb || !questionCatalog) return;
    const total = questionCatalog.items.length;
    const selected = questionSelection.size;
    allCb.checked = total > 0 && selected === total;
    allCb.indeterminate = selected > 0 && selected < total;
}

function updateQuestionPickerGroupState(groupKey) {
    const group = (questionCatalog && questionCatalog.groups || []).find((g) => g.key === groupKey);
    const groupCb = document.querySelector('.cx-qp-group-cb[data-group="' + groupKey + '"]');
    if (!group || !groupCb) return;
    const keys = group.questions.map((q) => q.key);
    const selectedCount = keys.filter((k) => questionSelection.has(k)).length;
    groupCb.checked = selectedCount === keys.length;
    groupCb.indeterminate = selectedCount > 0 && selectedCount < keys.length;
}

function renderQuestionPicker() {
    const panel = document.getElementById('answer-helper-panel');
    const listEl = document.getElementById('cx-qp-list');
    const pickerEl = document.getElementById('cx-question-picker');
    if (!listEl || !pickerEl) return;

    if (!questionCatalog || !questionCatalog.items.length) {
        panel?.classList.remove('has-question-picker');
        syncCxSidebarPush();
        listEl.innerHTML = '<div class="cx-qp-empty">暂未识别到题目，请等待页面加载后点刷新</div>';
        return;
    }

    panel?.classList.add('has-question-picker');
    syncCxSidebarPush();
    listEl.innerHTML = questionCatalog.groups.map((g) => {
        const title = g.sectionLabel + '. ' + g.typeLabel + (g.scoreText ? '（' + g.scoreText + '）' : '');
        const qs = g.questions.map((q) =>
            '<label class="cx-qp-q border-glow-card' + (questionSelection.has(q.key) ? ' cx-qp-q-active' : '') + '" title="' + String(q.info.question || '').replace(/"/g, '&quot;').slice(0, 60) + '">' +
            '<span class="edge-light" aria-hidden="true"></span>' +
            '<span class="border-glow-inner">' +
            '<input type="checkbox" class="cx-qp-q-cb" data-key="' + q.key + '" ' + (questionSelection.has(q.key) ? 'checked' : '') + '>' +
            '第' + q.numberInGroup + '题' +
            '</span></label>'
        ).join('');
        return (
            '<div class="cx-qp-group" data-group="' + g.key + '">' +
                '<label class="cx-qp-group-head">' +
                    '<input type="checkbox" class="cx-qp-group-cb" data-group="' + g.key + '">' +
                    '<span>' + title + '</span>' +
                '</label>' +
                '<div class="cx-qp-questions">' + qs + '</div>' +
            '</div>'
        );
    }).join('');

    questionCatalog.groups.forEach((g) => updateQuestionPickerGroupState(g.key));
    updateQuestionPickerSelectAllState();
}

function refreshQuestionPicker() {
    questionCatalog = buildQuestionCatalog();
    syncQuestionSelectionAllSelected();
    renderQuestionPicker();
}

function bindQuestionPickerEvents() {
    const listEl = document.getElementById('cx-qp-list');
    const allCb = document.getElementById('cx-qp-select-all');
    const refreshBtn = document.getElementById('cx-qp-refresh');
    if (!listEl) return;

    allCb?.addEventListener('change', () => {
        if (!questionCatalog) return;
        if (allCb.checked) syncQuestionSelectionAllSelected();
        else questionSelection.clear();
        listEl.querySelectorAll('.cx-qp-q-cb').forEach((cb) => {
            cb.checked = allCb.checked;
            cb.closest('.cx-qp-q')?.classList.toggle('cx-qp-q-active', allCb.checked);
        });
        listEl.querySelectorAll('.cx-qp-group-cb').forEach((cb) => {
            cb.checked = allCb.checked;
            cb.indeterminate = false;
        });
    });

    refreshBtn?.addEventListener('click', () => {
        refreshQuestionPicker();
        addLog('已刷新题目列表，共 ' + (questionCatalog?.items.length || 0) + ' 题', 'info');
    });

    listEl.addEventListener('change', (e) => {
        const t = e.target;
        if (!t || !questionCatalog) return;
        if (t.classList.contains('cx-qp-group-cb')) {
            const gk = t.getAttribute('data-group');
            const group = questionCatalog.groups.find((g) => g.key === gk);
            if (!group) return;
            group.questions.forEach((q) => {
                if (t.checked) questionSelection.add(q.key);
                else questionSelection.delete(q.key);
            });
            group.questions.forEach((q) => {
                const cb = listEl.querySelector('.cx-qp-q-cb[data-key="' + q.key + '"]');
                if (cb) {
                    cb.checked = t.checked;
                    cb.closest('.cx-qp-q')?.classList.toggle('cx-qp-q-active', t.checked);
                }
            });
            t.indeterminate = false;
            updateQuestionPickerSelectAllState();
            return;
        }
        if (t.classList.contains('cx-qp-q-cb')) {
            const key = t.getAttribute('data-key');
            if (t.checked) questionSelection.add(key);
            else questionSelection.delete(key);
            t.closest('.cx-qp-q')?.classList.toggle('cx-qp-q-active', t.checked);
            const item = questionCatalog.items.find((it) => it.key === key);
            if (item) updateQuestionPickerGroupState(item.groupKey);
            updateQuestionPickerSelectAllState();
        }
    });
}

function isQuizReviewDoc(doc) {
    try {
        if (!doc) return false;
        const hasQuizShell = !!doc.querySelector('.newTestCon, #RightCon .newTestTitle, form[name="form1"]');
        if (!hasQuizShell) return false;
        const hasAnswerView = !!doc.querySelector('.newAnswerBx .myAnswer, .answerFont, .answerScore, .myAllAnswerBx');
        if (!hasAnswerView) return false;
        const hasEditable = !!doc.querySelector('input[type="radio"], input[type="checkbox"], textarea:not([readonly]), input[type="text"]:not([readonly]), [id^="answerEditor"], iframe[id^="ueditor_"], div[contenteditable="true"]');
        const hasSubmit = !!doc.querySelector('button[type="submit"], input[type="submit"], .submit-btn, [onclick*="submit"], .btnBlueSubmit');
        return !hasEditable && !hasSubmit;
    } catch {}
    return false;
}

function isQuizEffectivelyCompletedDoc(doc) {
    try {
        if (!doc) return false;
        if (isQuizReviewDoc(doc)) return true;

        const pageText = String((doc.body && (doc.body.innerText || doc.body.textContent)) || '').replace(/\s+/g, ' ').trim();
        if (/待批阅|已完成|已交|提交成功|成绩|得分|查看结果|答题结果|作答记录/.test(pageText)) {
            const hasSubmit = !!doc.querySelector('button[type="submit"], input[type="submit"], .submit-btn, [onclick*="submit"], .btnBlueSubmit');
            if (!hasSubmit) return true;
        }

        if (isQuizPageDoc(doc) && !hasUnansweredQuestions(doc)) {
            const hasSubmit = !!doc.querySelector('button[type="submit"], input[type="submit"], .submit-btn, [onclick*="submit"], .btnBlueSubmit');
            const hasEditable = !!doc.querySelector('input[type="radio"], input[type="checkbox"], textarea:not([readonly]), input[type="text"]:not([readonly]), [id^="answerEditor"], iframe[id^="ueditor_"], div[contenteditable="true"]');
            if (!hasSubmit || !hasEditable) return true;
        }
    } catch {}
    return false;
}

async function waitForQuestionsRenderAny(timeoutMs = 8000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        let hit = null;
        forEachAllSameOriginDocs((doc) => {
            if (hit) return;
            try {
                const qs = getQuestionContainers(doc);
                if (qs && qs.length > 0) hit = doc;
            } catch {}
        });
        if (hit) return hit;
        await new Promise(r => setTimeout(r, 300));
    }
    return null;
}


function scheduleSkipChapter(delay) {
    if (pendingSkipTimeoutId) {
        clearTimeout(pendingSkipTimeoutId);
    }
    pendingSkipTimeoutId = setTimeout(function() {
        pendingSkipTimeoutId = null;
        if (isStudyingChapters) skipChapter();
    }, delay);
}

function skipChapter() {
    if (!isStudyingChapters) return;
    if (isSkippingChapter) return;
    if (Date.now() - lastChapterNavTs < 8000) { return; }
    addLog("跳过章节", 'info');
    isSkippingChapter = true;
    lastChapterNavTs = Date.now();
    processingBatch = false;
    arrayEchelon = [];
    autoSkipDone = false;
    stopProgressMonitor();
    blankSectionChecks = 0;
    lastBlankSectionUrl = '';
    var chapterNext = window.top.document.querySelector("#prevNextFocusNext");
    if (chapterNext) {
        chapterNext.click();
    } else {
        addLog("未找到 #prevNextFocusNext 元素", 'warning');
    }

    setTimeout(function() {
        try {
            var tip = document.querySelector(".maskDiv.jobFinishTip.maskFadeOut");
            if (tip) {
                var tipNextChapter = document.querySelector(".jb_btn.jb_btn_92.fr.fs14.nextChapter");
                if (tipNextChapter) {
                    tipNextChapter.click();
                }
            }
        } catch(e) {
            addLog("未找到完成提示或下一章节按钮", 'warning');
        }
        isSkippingChapter = false;
    }, 6000);
}


function videoHandler(entry) {
    var idocument = entry.document;
    addLog("处理视频任务中...", 'info');
    var retries = 0;
    var maxRetries = 10;

    function tryFindVideo() {
        try {
            var video = idocument.querySelector("video");
            var videoPlayButton = idocument.querySelector(".vjs-big-play-button");
            var modalDialog = idocument.querySelector(".vjs-modal-dialog-content");
            var closeButton = idocument.querySelector(".vjs-done-button");

            if (!video || !videoPlayButton) {
                var iframes = idocument.querySelectorAll("iframe");
                for (var i = 0; i < iframes.length; i++) {
                    try {
                        var innerDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                        video = innerDoc.querySelector("video");
                        videoPlayButton = innerDoc.querySelector(".vjs-big-play-button");
                        modalDialog = innerDoc.querySelector(".vjs-modal-dialog-content");
                        closeButton = innerDoc.querySelector(".vjs-done-button");
                        if (video && videoPlayButton) break;
                    } catch(e) {}
                }
            }

            if (!video || !videoPlayButton) {
                retries++;
                if (retries < maxRetries) {
                    setTimeout(tryFindVideo, 2000);
                } else {
                    addLog("没有找到视频或播放按钮", 'error');
                    setTimeout(function() { document.dispatchEvent(dealEvent); }, 3000);
                }
                return;
            }

            video.muted = true;
            if (!Number.isNaN(video.playbackRate)) video.playbackRate = currentPlaybackSpeed;

            var playVideo = function() {
                if (video && typeof video.play === 'function') {
                    video.muted = true;
                    video.play().catch(function(error) {
                        videoPlayButton.click();
                    });
                } else {
                    videoPlayButton.click();
                }
            };

            var clickPlayVideo = function() {
                if (videoPlayButton && typeof videoPlayButton.click === 'function') {
                    videoPlayButton.click();
                } else {
                    video.muted = true;
                    video.play().catch(function() {
                        videoPlayButton.click();
                    });
                }
            };

            var closeModalDialog = function() {
                if (modalDialog && closeButton && modalDialog.getAttribute("aria-hidden") !== "true") {
                    setTimeout(function() { closeButton.click(); }, 2000);
                }
            };

            var handlePause = function() {
                if (video.ended) return;
                clickPlayVideo();
                closeModalDialog();
            };

            video.addEventListener("pause", handlePause);

            video.addEventListener("ended", function() {
                addLog("视频任务已完成", 'success');
                video.removeEventListener("pause", handlePause);
                setTimeout(function() { document.dispatchEvent(dealEvent); }, 500);
            }, { once: true });

            setTimeout(function() {
                if (video.paused && !video.ended) {
                    playVideo();
                }
            }, 10000);

            playVideo();
        } catch(e) {
            retries++;
            if (retries < maxRetries) {
                setTimeout(tryFindVideo, 2000);
            } else {
                addLog('视频处理出错: ' + e.message, 'error');
                setTimeout(function() { document.dispatchEvent(dealEvent); }, 2000);
            }
        }
    }

    tryFindVideo();
}


function handlePPTInDocument(doc) {
    try {
        const nextSelectors = ['.next', '.vc-next', '.reader-next', 'a[title="下一页"]', '.btn-next', '#next'];
        for (const sel of nextSelectors) {
            const btn = doc.querySelector(sel);
            if (btn && !btn.className.includes('disabled') && !btn.getAttribute('disabled')) {
                if (safeClick(btn)) { return true; }
            }
        }

        return false;
    } catch { return false; }
}


function findChapterQuizTab(doc) {
    try {

        const byTitle = doc.querySelector('li[title*="章节测验"], li[title*="测验"], a[title*="章节测验"], a[title*="测验"]');
        if (byTitle) return byTitle;

        const byOnClick = Array.from(doc.querySelectorAll('li[onclick], a[onclick], button[onclick]')).find(el => {
            const oc = (el.getAttribute('onclick') || '').toString();
            return oc.includes('changeDisplayContent') && (oc.includes('(2,2') || oc.includes(',2)'));
        });
        if (byOnClick) return byOnClick;

        const candidates = Array.from(doc.querySelectorAll('li, a, button, [role="tab"], [role="option"]'));
        const textEl = candidates.find(el => /章节测验|测验/.test(((el.textContent || el.getAttribute('title') || '') + '').trim()));
        if (textEl) return textEl;
    } catch {}
    return null;
}


async function waitForQuestionsRender(doc, timeoutMs = 6000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        try {
            const qs = getQuestionContainers(doc);
            if (qs.length > 0) return true;
        } catch {}
        await new Promise(r => setTimeout(r, 300));
    }
    return false;
}



let TYPR_MD5_LIB, FONT_TABLE_DATA;
try {
    TYPR_MD5_LIB = GM_getResourceText('typrMd5Lib');
    FONT_TABLE_DATA = GM_getResourceText('fontTableData');


    if (TYPR_MD5_LIB) {
        window.TYPR_MD5_LIB = TYPR_MD5_LIB;
    }
    if (FONT_TABLE_DATA) {
        window.FONT_TABLE_DATA = FONT_TABLE_DATA;
    }
} catch (e) {
    console.error('加载外部资源失败:', e);

    TYPR_MD5_LIB = '';
    FONT_TABLE_DATA = '{}';
}


function injectConsoleDecryptCode(doc, timeoutMs = 3000) {
    return new Promise((resolve) => {
        try {
            const consoleCode = `

if (!window.Typr || !window.md5) {
${TYPR_MD5_LIB || window.TYPR_MD5_LIB || ''}
}


if (!window.chaoXingFontTable) {
window.chaoXingFontTable = ${FONT_TABLE_DATA || window.FONT_TABLE_DATA || '{}'};
}


const decryptChaoXingFont = async () => {
const { Typr, md5, chaoXingFontTable: table } = window;


const base64ToUint8Array = (base64) => {
const data = atob(base64);
const buffer = new Uint8Array(data.length);
for (let i = 0; i < data.length; i++) {
  buffer[i] = data.charCodeAt(i);
}
return buffer;
};


const styleElements = [...document.querySelectorAll('style')];
const cxStyle = styleElements.find(el =>
el.textContent.includes('font-cxsecret')
);

if (!cxStyle) {
return;
}


const fontData = cxStyle.textContent.match(/base64,([\\w\\W]+?)'/)[1];
const parsedFont = Typr.parse(base64ToUint8Array(fontData))[0];


const charMap = {};
for (let charCode = 19968; charCode < 40870; charCode++) {
const glyph = Typr.U.codeToGlyph(parsedFont, charCode);
if (!glyph) continue;

const path = Typr.U.glyphToPath(parsedFont, glyph);
const pathHash = md5(JSON.stringify(path)).slice(24);
charMap[String.fromCharCode(charCode)] =
  String.fromCharCode(table[pathHash]);
}


document.querySelectorAll('.font-cxsecret').forEach(element => {
let htmlContent = element.innerHTML;
Object.entries(charMap).forEach(([encryptedChar, decryptedChar]) => {
  const regex = new RegExp(encryptedChar, 'g');
  htmlContent = htmlContent.replace(regex, decryptedChar);
});
element.innerHTML = htmlContent;
element.classList.remove('font-cxsecret');
});
};


decryptChaoXingFont().catch(console.error);
`;
            const beforeCnt = (() => { try { return doc.querySelectorAll('.font-cxsecret').length; } catch { return -1; } })();

            let script = doc.createElement('script');
            script.type = 'text/javascript';
            let blobUrl = '';
            try {
                const blob = new Blob([consoleCode], { type: 'text/javascript' });
                blobUrl = (doc.defaultView || window).URL.createObjectURL(blob);
                script.src = blobUrl;
            } catch {

                script.textContent = consoleCode;
            }
            (doc.head || doc.documentElement).appendChild(script);
            script.onload = () => { try { if (blobUrl) (doc.defaultView || window).URL.revokeObjectURL(blobUrl); } catch {} };

            const start = Date.now();
            const timer = setInterval(() => {
                try {
                    const cnt = doc.querySelectorAll('.font-cxsecret').length;
                    if (cnt === 0 || (beforeCnt >= 0 && cnt < beforeCnt)) { clearInterval(timer); resolve(); return; }
                } catch {}
                if (Date.now() - start > timeoutMs) { clearInterval(timer); resolve(); }
            }, 200);
        } catch { resolve(); }
    });
}


async function tryEnterQuizAndAnswer(contextDoc) {
    try {
        if (!isStudyingChapters) return false;
        if (isChapterQuizEnteringForCurrentSection()) return true;
        let targetDoc = null;
        let tabEl = null;

        forEachAllSameOriginDocs((doc) => {
            if (tabEl) return;
            const el = findChapterQuizTab(doc);
            if (el) { tabEl = el; targetDoc = doc; }
        });
        if (!tabEl || !targetDoc) return false;
        addLog('正在进入章节测验...', 'info');
        markChapterQuizEnteringForCurrentSection(12000);

        await new Promise((r) => {
            let pending = 0; let done = false;
            forEachAllSameOriginDocs((doc) => {
                pending++; injectConsoleDecryptCode(doc).finally(() => { if (--pending === 0 && !done) { done = true; r(); } });
            });
            if (pending === 0) r();
        });

        safeClick(tabEl);

        const qDoc = await waitForQuestionsRenderAny(4000);
        if (!isStudyingChapters) return false;
        if (!qDoc) {
            clearChapterQuizEnteringForCurrentSection();
            markChapterQuizHandledForCurrentSection();
            addLog('章节测验未检测到题目', 'warning');
            return false;
        }

        clearChapterQuizEnteringForCurrentSection();
        await injectConsoleDecryptCode(qDoc);

        if (!isStudyingChapters) return false;
        await autoAnswerInDocument(qDoc);
        addLog('章节测验已完成', 'success');
        markChapterQuizHandledForCurrentSection();
        return true;
    } catch (e) {
        clearChapterQuizEnteringForCurrentSection();
        addLog(`进入章节测验失败: ${e.message}`, 'error');
        return false;
    }
}


function hasActionableStudyContent(doc) {
    try {
        if (isNullPageDoc(doc)) return false;
        if (isQuizReviewDoc(doc)) return false;


        if (isQuizPageDoc(doc)) return true;
        if (doc.querySelector('#form1, .newTestCon, .TiMu, .singleQuesId, [id^="answertype"], .Zy_TItle, ul.Zy_ulTop')) return true;

        if (doc.querySelector('video, .video-js video')) return true;


        const docSelectors = [
            '.ans-attach-ct', '.reader', '.ppt', '.ppt-play', '.vjs-control', '.vjs-big-play-button'
        ];
        if (docSelectors.some(sel => !!doc.querySelector(sel))) return true;

        if (getQuestionContainers(doc).length > 0) return true;


        if (getInteractiveInputs(doc).length > 0) return true;


        const iframes = Array.from(doc.querySelectorAll('iframe'));
        if (iframes.some(f => {
            const src = (f.getAttribute('src') || '').toLowerCase();
            return src.includes('mooc-ans') || src.includes('document') || src.includes('ppt') || src.includes('video') || src.includes('knowledgeid');
        })) return true;
    } catch {}
    return false;
}


function hasUnansweredQuestions(doc) {
    try {
        if (isNullPageDoc(doc)) return false;
        if (isQuizReviewDoc(doc)) return false;

        const containers = getQuestionContainers(doc);
        for (const q of containers) {
            try { if (!isQuestionAnswered(q)) return true; } catch {}
        }


        const radios = getInteractiveInputs(doc).filter(el => el.tagName && el.tagName.toLowerCase() === 'input' && el.type === 'radio');
        if (radios.length > 0) {
            const groups = new Map();
            radios.forEach(r => {
                const k = r.name || `__radio_${Math.random()}`;
                if (!groups.has(k)) groups.set(k, []);
                groups.get(k).push(r);
            });
            for (const [, list] of groups) {
                if (!list.some(r => r.checked)) return true;
            }
        }


        const texts = getInteractiveInputs(doc).filter(el => {
            const tag = (el.tagName || '').toLowerCase();
            return tag === 'textarea' || (tag === 'input' && el.type === 'text') || (tag === 'div' && el.getAttribute('contenteditable') === 'true');
        });
        if (texts.length > 0) {
            if (texts.some(el => {
                if (el.tagName && el.tagName.toLowerCase() === 'div') return ((el.innerText || el.textContent || '').trim().length === 0);
                return ((el.value || '').trim().length === 0);
            })) return true;
        }


        if (doc.querySelector('[id^="answertype"], .TiMu, .singleQuesId, .Zy_TItle, ul.Zy_ulTop')) return !isQuizReviewDoc(doc);
    } catch {}
    return false;
}


function getDocPathname(doc) {
    try {
        return new URL(doc.location.href).pathname || '';
    } catch {}
    return '';
}

function getQueryParamFromUrl(url, key) {
    try {
        return new URL(String(url || ''), location.origin).searchParams.get(key) || '';
    } catch {}
    return '';
}

function buildSectionKeyFromUrl(url) {
    const chapterId = getQueryParamFromUrl(url, 'chapterId');
    const knowledgeId = getQueryParamFromUrl(url, 'knowledgeId') || getQueryParamFromUrl(url, 'knowledgeid');
    if (!chapterId && !knowledgeId) return '';
    return `chapter:${chapterId || ''}|knowledge:${knowledgeId || ''}`;
}

function getCurrentStudySectionKey() {
    const urls = [];
    try { urls.push(window.top.location.href); } catch {}
    try { urls.push(window.location.href); } catch {}
    forEachAllSameOriginDocs((doc) => {
        try { urls.push(doc.location.href); } catch {}
    });
    for (const url of urls) {
        const key = buildSectionKeyFromUrl(url);
        if (key) return key;
    }
    return '';
}

function markChapterQuizHandledForCurrentSection() {
    const key = currentStudySectionKey || getCurrentStudySectionKey();
    if (!key) return;
    chapterQuizHandledSectionKey = key;
    chapterQuizEnteringSectionKey = '';
    chapterQuizEnterRetryAt = 0;
}

function isChapterQuizHandledForCurrentSection() {
    const key = currentStudySectionKey || getCurrentStudySectionKey();
    if (!key) return false;
    return chapterQuizHandledSectionKey === key;
}

function markChapterQuizEnteringForCurrentSection(waitMs = 12000) {
    const key = currentStudySectionKey || getCurrentStudySectionKey();
    if (!key) return;
    chapterQuizEnteringSectionKey = key;
    chapterQuizEnterRetryAt = Date.now() + waitMs;
}

function clearChapterQuizEnteringForCurrentSection() {
    chapterQuizEnteringSectionKey = '';
    chapterQuizEnterRetryAt = 0;
}

function isChapterQuizEnteringForCurrentSection() {
    const key = currentStudySectionKey || getCurrentStudySectionKey();
    if (!key) return false;
    if (chapterQuizEnteringSectionKey !== key) return false;
    if (Date.now() >= chapterQuizEnterRetryAt) {
        clearChapterQuizEnteringForCurrentSection();
        return false;
    }
    return true;
}

function findNestedDoc(root, predicate, depth = 0) {
    if (!root || depth > 4) return null;
    try {
        if (predicate(root)) return root;
    } catch {}
    try {
        const iframes = Array.from(root.querySelectorAll('iframe'));
        for (const iframe of iframes) {
            try {
                const nextDoc = iframe.contentDocument || iframe.contentWindow?.document;
                const result = findNestedDoc(nextDoc, predicate, depth + 1);
                if (result) return result;
            } catch {}
        }
    } catch {}
    return null;
}

function handlePPTInDocument(doc) {
    try {
        const nextSelectors = ['.next', '.vc-next', '.reader-next', 'a[title="下一页"]', '.btn-next', '#next'];
        for (const sel of nextSelectors) {
            const btn = doc.querySelector(sel);
            if (btn && !btn.className.includes('disabled') && !btn.getAttribute('disabled')) {
                if (safeClick(btn)) { return true; }
            }
        }
        return false;
    } catch { return false; }
}

var arrayEchelon = [];
var completedJobCache = new Set();
var studyPageDefaults = null;
var studyPageTasks = null;
var dealEvent = new Event("redeal", { bubbles: false, cancelable: false });
var testDom = null;
var ifTest = 'take';
var testType = 'submit';
var taskInterval = 6000;
var isMainInstance = false;
var autoSkipDone = false;
var progressMonitor = null;

function getReaderMissionApiPaths(mission) {
    const type = String((mission && mission.type) || '').toLowerCase();
    if (type === 'ppt' || type === 'pdf' || type === 'reader') {
        return ['/ananas/job/document', '/ananas/job/readv2', '/ananas/job'];
    }
    return ['/ananas/job/document'];
}

async function handleQuizTest(doc) {
    try {
        if (!doc) return;
        await injectConsoleDecryptCode(doc);
        if (isQuizEffectivelyCompletedDoc(doc)) {
            addLog('章节测验已处于完成状态', 'success');
            return;
        }
        const handled = await autoAnswerQuizInDocument(doc);
        if (handled) {
            addLog('章节测验已完成', 'success');
        }
    } catch (e) {
        addLog(`章节答题出错: ${e.message}`, 'error');
    }
}


async function autoAnswerInDocument(rootDoc) {
    try {
        if (!isStudyingChapters) return false;

        if (isQuizPageDoc(rootDoc)) {
            if (!isStudyingChapters) return false;
            const ok = await autoAnswerQuizInDocument(rootDoc);
            if (ok) return true;
        }

        const questions = getQuestionContainers(rootDoc);
        if (questions.length === 0) return false;
        addLog(`章节内发现 ${questions.length} 个题目，自动作答...`, 'info');
        for (let q of questions) {
            if (!isStudyingChapters) return false;
            const info = getQuestionInfo(q);
            if (!info || !info.question) continue;
            const ans = applyAnswerByAccuracy(info, await getAnswer(info));
            if (ans) {
                const infoResolved = inferQuestionType(q, info, null);
                await fillAnswer(ans, q, infoResolved);
                await new Promise(r => setTimeout(r, 800));
            }
        }
        return true;
    } catch (e) { addLog(`章节答题出错: ${e.message}`, 'error'); return false; }
}


function isStudyPage() { return /mycourse\/studentstudy|mooc2-ans|knowledgeId|chapterId/.test(location.href); }

function isLikelyTaskPage() {
    if (isStudyPage()) return true;
    try {
        const href = location.href || '';
        if (isMooc1WorkPage(href)) return true;
        if (/\/mooc-ans\/mooc2\/work\/dowork/i.test(href)) return true;
        if (/\/(?:work|exam|quiz|paper|anandoes|job|task|test)/i.test(href)) return true;
        if (/[?&](?:workId|examId|taskId|jobId|testId)=/i.test(href)) return true;
    } catch {}
    return false;
}


function hasStudyContentDeep() {
    let found = false;
    const tryDoc = (doc) => {
        try {
            if (doc.querySelector('video, .video-js, .ans-attach-ct, .reader, .ppt, .ppt-play, .catalog, .vjs-play-control')) { found = true; return; }
            if (getQuestionContainers(doc).length > 0) { found = true; return; }
        } catch {}
    };
    forEachSameOriginFrame(tryDoc);
    return found;
}



let currentPlaybackSpeed = 1.0;
const PLAYBACK_SPEED_KEY = 'cx_playback_speed';


try {
    const savedSpeed = localStorage.getItem(PLAYBACK_SPEED_KEY);
    if (savedSpeed) {
        currentPlaybackSpeed = parseFloat(savedSpeed);
    }
} catch {}


function updateSpeedButtonsState() {
    const speedButtons = document.querySelectorAll('.speed-button');
    speedButtons.forEach(btn => {
        btn.classList.remove('speed-active');
    });

    const activeButton = document.getElementById(`speed-${currentPlaybackSpeed}x`);
    if (activeButton) {
        activeButton.classList.add('speed-active');
    }
}


function setVideoPlaybackSpeed(speed) {
    currentPlaybackSpeed = speed;
    try {
        localStorage.setItem(PLAYBACK_SPEED_KEY, speed.toString());
    } catch {}

    updateSpeedButtonsState();


    forEachSameOriginFrame((doc) => {
        try {
            const videos = doc.querySelectorAll('video, .video-js video');
            videos.forEach(v => {
                if (!Number.isNaN(v.playbackRate)) v.playbackRate = speed;
            });
        } catch {}
    });

    addLog(`视频播放速度已设置为 ${speed}×`, 'success');
}

function updateStudyButtons(running) {
    const startBtn = document.getElementById('start-study');
    const pauseBtn = document.getElementById('pause-study');
    const speedControls = document.getElementById('playback-speed-controls');

    if (!startBtn || !pauseBtn) return;

    if (running) {
        startBtn.style.display = 'none';
        pauseBtn.style.display = 'flex';
        if (speedControls) speedControls.style.display = 'flex';
    } else {
        startBtn.style.display = 'flex';
        pauseBtn.style.display = 'none';
        if (speedControls) speedControls.style.display = 'none';
    }
}

function initAllInDoc(targetDoc) {
    if (!isStudyingChapters) return;
    autoSkipDone = false;
    isMainInstance = true;
    addLog('正在加载当前页面的任务...', 'info');

    var rawPayload = extractStudyPayloadFromPage(targetDoc);
    if (rawPayload && rawPayload.defaults) {
        studyPageDefaults = rawPayload.defaults;
    }
    if (rawPayload && Array.isArray(rawPayload.attachments)) {
        studyPageTasks = rawPayload.attachments;
    }

    var arrayAns = targetDoc.querySelectorAll(".ans-attach-ct");
    if (arrayAns.length === 0) {
        arrayAns = targetDoc.querySelectorAll(".ans-job-ct");
    }
    if (arrayAns.length === 0) {
        arrayAns = targetDoc.querySelectorAll(".chapter-item");
    }
    if (arrayAns.length === 0) {
        arrayAns = targetDoc.querySelectorAll('[class*="ans"], [class*="task"], [class*="chapter"]');
    }

    addLog(`当前页面任务数量为: ${arrayAns.length}`, 'info');

    var filteredArrayAns = targetDoc.querySelectorAll('.ans-attach-ct:not(.ans-job-finished), .ans-job-ct:not(.ans-job-finished)');

    var taskCount = filteredArrayAns.length;
    if (taskCount > 0) {
        try {
            var arrayType = getIframesType(filteredArrayAns);
            var arrayDocument = getAllIframesDocument(filteredArrayAns);
            arrayEchelon = distributeAns(arrayType, arrayDocument);
            if (completedJobCache.size > 0) {
                var before = arrayEchelon.length;
                arrayEchelon = arrayEchelon.filter(function(item) {
                    if (!item.dataStr) return true;
                    try {
                        var d = JSON.parse(item.dataStr);
                        var jobid = d.jobid || (d.property && d.property.jobid) || '';
                        return !completedJobCache.has(jobid);
                    } catch(e) { return true; }
                });
                if (arrayEchelon.length < before) {
                    addLog('已过滤 ' + (before - arrayEchelon.length) + ' 个缓存中已完成的任务', 'info');
                }
            }

            startProgressMonitor();
            document.dispatchEvent(dealEvent);
        } catch (error) {
            addLog('初始化过程中发生错误: ' + error, 'error');
        }
    } else {
        addLog('当前页面没有可处理的任务，等待确认', 'info');
        var retryKey = 'cx_retry_' + (targetDoc.location ? targetDoc.location.href : '');
        if (!targetDoc[retryKey]) {
            targetDoc[retryKey] = true;
            setTimeout(function() {
                targetDoc[retryKey] = false;
                var retryTasks = targetDoc.querySelectorAll('.ans-attach-ct:not(.ans-job-finished), .ans-job-ct:not(.ans-job-finished)');
                if (retryTasks.length > 0) {
                    initAllInDoc(targetDoc);
                    return;
                }
                addLog('确认无待处理任务，跳过章节', 'info');
                scheduleSkipChapter(3000);
            }, 4000);
        }
    }
}

var studyObserver = null;
var lastChapterNavTs = 0;
var lastLoadingLogTs = 0;
var processingBatch = false;
var isSkippingChapter = false;
var pendingSkipTimeoutId = null;

var initRetryCount = 0;
var blankSectionChecks = 0;
var lastBlankSectionUrl = '';

function startStudyChapters() {
    if (isStudyingChapters) { addLog('刷章节已在运行', 'info'); return; }
    isStudyingChapters = true;
    setPanelFixedHeight(360);
    updateStudyButtons(true);
    addLog('正在初始化中', 'info');
    initRetryCount = 0;

    setTimeout(function() {
        if (!isStudyingChapters) return;
        addLog('开始刷章节...', 'success');

    function findCardsDoc() {
        var cd = null;
        forEachSameOriginFrame(function(doc) {
            if (cd) return;
            try {
                if (doc.location.pathname.includes('/knowledge/cards')) {
                    cd = doc;
                }
            } catch(e) {}
        });
        if (!cd && location.pathname.includes('/knowledge/cards')) {
            cd = document;
        }
        return cd;
    }

    function checkAndInit(cardsDoc) {
        if (!cardsDoc) return false;
        if (processingBatch) return false;
        if (Date.now() - lastChapterNavTs < 5000) { if (Date.now() - lastLoadingLogTs > 8000) { lastLoadingLogTs = Date.now(); addLog('页面内容加载中，请稍等', 'info'); } return false; }

        var unfinished = cardsDoc.querySelectorAll('.ans-attach-ct:not(.ans-job-finished), .ans-job-ct:not(.ans-job-finished)');
        if (unfinished.length === 0) {
            var anyExists = cardsDoc.querySelectorAll('.ans-attach-ct, .ans-job-ct, .chapter-item').length;
            if (anyExists > 0) {
                blankSectionChecks = 0;
                lastBlankSectionUrl = '';
                addLog('检测到章节任务均已完成，准备跳转', 'info');
                scheduleSkipChapter(2000);
                return false;
            }

            var currentUrl = (cardsDoc.location ? cardsDoc.location.href : '') || location.href;
            if (currentUrl !== lastBlankSectionUrl) {
                blankSectionChecks = 0;
                lastBlankSectionUrl = currentUrl;
            }
            blankSectionChecks++;
            if (blankSectionChecks >= 2) {
                blankSectionChecks = 0;
                addLog('检测到空白小节，自动跳过', 'info');
                scheduleSkipChapter(500);
            } else {
                addLog('检测到空白小节，等待确认', 'info');
            }
            return false;
        }

        blankSectionChecks = 0;
        lastBlankSectionUrl = '';
        processingBatch = true;
        addLog('发现 ' + unfinished.length + ' 个待处理任务', 'info');
        initAllInDoc(cardsDoc);
        return true;
    }

    function setupObserver(cardsDoc) {
        if (!cardsDoc) return;
        try { if (studyObserver) studyObserver.disconnect(); } catch(e) {}
        var target = cardsDoc.querySelector('.wrap, .ans-cc, #coursetest, [class*="catalog"]') || cardsDoc.body || cardsDoc.documentElement;
        if (!target) return;
        try {
            studyObserver = new MutationObserver(function() {
                if (!isStudyingChapters || processingBatch) return;
                if (Date.now() - lastChapterNavTs < 5000) { if (Date.now() - lastLoadingLogTs > 8000) { lastLoadingLogTs = Date.now(); addLog('页面内容加载中，请稍等', 'info'); } return; }
                var cd = findCardsDoc();
                if (!cd) return;
                var freshTasks = cd.querySelectorAll('.ans-attach-ct:not(.ans-job-finished), .ans-job-ct:not(.ans-job-finished)');
                if (freshTasks.length > 0 && arrayEchelon.length === 0) {
                    addLog('检测到章节内容变化，重新初始化任务', 'info');
                    checkAndInit(cd);
                }
            });
            studyObserver.observe(target, { childList: true, subtree: true });
        } catch(e) {}
    }

    var initialCardsDoc = findCardsDoc();
    if (initialCardsDoc) {
        addLog('正在检测任务', 'info');
        setupObserver(initialCardsDoc);
        checkAndInit(initialCardsDoc);
    } else {
        addLog('正在定位学习页面...', 'info');
    }

    if (studyIntervalId) clearInterval(studyIntervalId);
    studyIntervalId = setInterval(function() {
        if (!isStudyingChapters) {
            clearInterval(studyIntervalId);
            studyIntervalId = null;
            return;
        }
        if (processingBatch) return;
        if (Date.now() - lastChapterNavTs < 5000) { if (Date.now() - lastLoadingLogTs > 8000) { lastLoadingLogTs = Date.now(); addLog('页面内容加载中，请稍等', 'info'); } return; }

        if (arrayEchelon.length > 0 && isMainInstance) {
            return;
        }

        var cardsDoc = findCardsDoc();
        if (!cardsDoc) {
            initRetryCount++;
            if (initRetryCount === 3) {
                addLog('正在等待学习页面加载完成...', 'info');
            }
            if (initRetryCount % 10 === 0) {
                addLog('仍在等待学习页面，请确认在课程章节页面中', 'warning');
            }
            return;
        }

        initRetryCount = 0;
        setupObserver(cardsDoc);
        checkAndInit(cardsDoc);
    }, 3000);
    }, 3000);
}

function stopStudyChapters() {
    if (!isStudyingChapters) return;
    isStudyingChapters = false;
    isMainInstance = false;
    processingBatch = false;
    isSkippingChapter = false;
    if (pendingSkipTimeoutId) { clearTimeout(pendingSkipTimeoutId); pendingSkipTimeoutId = null; }
    autoSkipDone = false;
    arrayEchelon = [];
    completedJobCache.clear();
    studyPageDefaults = null;
    studyPageTasks = null;
    setPanelFixedHeight(320);
    if (studyIntervalId) { clearInterval(studyIntervalId); studyIntervalId = null; }
    try { if (studyObserver) { studyObserver.disconnect(); studyObserver = null; } } catch(e) {}

    forEachSameOriginFrame((doc) => {
        try {
            doc.querySelectorAll('video, .video-js video').forEach(v => {
                try { v.pause(); } catch {}
            });
        } catch {}
    });
    updateStudyButtons(false);
    addLog('已暂停刷章节', 'info');
}

function getIframesType(arrayAns) {
    return Array.from(arrayAns).map(function(ans) {
        const iframe = ans.querySelector("iframe");
        const jsonStr = iframe ? iframe.getAttribute("data") : null;
        let type = null;

        if (!jsonStr) {
            const src = iframe ? iframe.getAttribute("src") : null;
            if (src) {
                if (src.includes('work') || src.includes('exam') || src.includes('test') || src.includes('quiz') || src.includes('homework')) {
                    type = "workA";
                } else if (src.includes('video') || src.includes('.mp4')) {
                    type = ".mp4";
                } else if (src.includes('.pdf') || src.includes('.ppt')) {
                    type = ".pdf";
                }
            }
        } else {
            try {
                const json = JSON.parse(jsonStr);
                if (json && json.type) {
                    type = json.type;
                } else if (json && json.worktype) {
                    type = json.worktype;
                } else if (json && json.resourceType) {
                    type = json.resourceType;
                }
            } catch (error) {}
        }

        if (!type) {
            const className = ans.className || '';
            if (className.includes('work') || className.includes('exam') || className.includes('test')) {
                type = "workA";
            }
        }
        return type;
    }).filter(function(type) { return type !== null; });
}

function getAllIframesDocument(arrayAns) {
    return Array.from(arrayAns).map(function(ans) {
        var iframe = ans.querySelector('iframe');
        var idoc = iframe ? (iframe.contentWindow ? iframe.contentWindow.document : null) : null;
        var dataStr = iframe ? iframe.getAttribute('data') : null;
        return { doc: idoc, dataStr: dataStr };
    }).filter(function(item) { return item !== undefined && item !== null; });
}

const handlerMap = {
    ".mp4": videoHandler,
    ".wmv": videoHandler,
    ".avi": videoHandler,
    ".mkv": videoHandler,
    ".flv": videoHandler,
    ".mov": videoHandler,
    ".doc": pptxHandler,
    ".docx": pptxHandler,
    ".pptx": pptxHandler,
    ".pdf": pptxHandler,
    ".ppt": pptxHandler,
    ".mp3": audioHandler,
    ".wav": audioHandler,
    "workA": testHandler,
    "workB": testHandler,
    "workC": testHandler,
    "workD": testHandler,
    "homework": testHandler,
    "exam": testHandler,
    "test": testHandler,
    "quiz": testHandler
};

function distributeAns(arrayType, arrayItems) {
    return arrayType.map(function(type, index) {
        var handler = handlerMap[type] || ignoreAns;
        return { document: arrayItems[index].doc, handler: handler, type: type, dataStr: arrayItems[index].dataStr };
    });
}

function dealSingleAns(singleAns) {
    if (!isStudyingChapters) { processingBatch = false; return; }
    if (singleAns && singleAns.handler && typeof singleAns.handler === 'function') {
        singleAns.handler(singleAns);
    } else {
        document.dispatchEvent(dealEvent);
    }
}

function dealAnsEchelon(echelonArray) {
    if (!isStudyingChapters) { processingBatch = false; return; }
    var remainingTasks = echelonArray.length;
    if (remainingTasks === 0) {
        stopProgressMonitor();
        processingBatch = false;
        addLog('该章节任务已处理完成，即将跳转下一章节', 'success');
        scheduleSkipChapter(3000);
        return;
    }
    processingBatch = true;
    var nextTask = echelonArray.shift();
    try {
        dealSingleAns(nextTask);
    } catch (error) {
        addLog('处理任务时发生错误，继续处理下一个', 'error');
        dealAnsEchelon(echelonArray);
    }
}

function testHandler(entry) {
    var idocument = entry.document;
    addLog("处理章节测试任务中...", 'info');

    if (ifTest == 'skip') {
        setTimeout(function() {
            addLog("根据配置选项，跳过章节测试", 'info');
            document.dispatchEvent(dealEvent);
        }, 1000);
        return;
    }

    var retryCount = 0;
    var maxRetries = 10;

    function tryFindQuestions() {
        try {
            var foundDoc = null;
            var foundQuestions = null;

            // 策略1: 在嵌套 iframe 中查找 form > .singleQuesId
            var iframe = idocument.querySelector("iframe");
            if (iframe) {
                try {
                    var sDocument = iframe.contentWindow ? iframe.contentWindow.document : null;
                    if (sDocument) {
                        var form = sDocument.querySelector("form");
                        if (form) {
                            foundQuestions = form.querySelectorAll('.singleQuesId');
                            if (foundQuestions.length > 0) foundDoc = sDocument;
                        }
                    }
                } catch(e) {}
            }

            // 策略2: 直接在 idocument 中查找题目
            if (!foundDoc || foundQuestions.length === 0) {
                var qContainers = getQuestionContainers(idocument);
                if (qContainers.length > 0) {
                    addLog('在页面中直接找到章节测验内容', 'info');
                    handleQuizTest(idocument).then(function() {
                        addLog('章节测验答题完成', 'success');
                        submitQuizAndContinue(idocument);
                    }).catch(function(e) {
                        addLog('答题失败: ' + e.message, 'error');
                        setTimeout(function() { document.dispatchEvent(dealEvent); }, 2000);
                    });
                    return;
                }
            }

            if (foundDoc && foundQuestions && foundQuestions.length > 0) {
                addLog('找到 ' + foundQuestions.length + ' 道章节测试题，开始答题', 'info');
                handleQuizTest(foundDoc).then(function() {
                    addLog('章节测试答题完成', 'success');
                    submitQuizAndContinue(foundDoc);
                }).catch(function(e) {
                    addLog('答题失败: ' + e.message, 'error');
                    setTimeout(function() { document.dispatchEvent(dealEvent); }, 2000);
                });
                return;
            }

            // 策略3: 查找章节测验标签页（未作为任务点列出的测验）
            if (retryCount >= 3) {
                tryEnterQuizAndAnswer(document).then(function(handled) {
                    if (handled) {
                        addLog('章节测验标签页答题完成', 'success');
                        setTimeout(function() { document.dispatchEvent(dealEvent); }, 2000);
                    } else {
                        retryCount++;
                        if (retryCount < maxRetries) {
                            addLog("等待章节测验加载 (" + retryCount + "/" + maxRetries + ")", 'info');
                            setTimeout(tryFindQuestions, 2500);
                        } else {
                            addLog("无法找到章节测验内容，跳过", 'warning');
                            setTimeout(function() { document.dispatchEvent(dealEvent); }, 1000);
                        }
                    }
                });
                return;
            }

            retryCount++;
            if (retryCount < maxRetries) {
                addLog("等待章节测验加载 (" + retryCount + "/" + maxRetries + ")", 'info');
                setTimeout(tryFindQuestions, 2500);
            } else {
                addLog("无法找到章节测验内容，跳过", 'warning');
                setTimeout(function() { document.dispatchEvent(dealEvent); }, 1000);
            }
        } catch(e) {
            retryCount++;
            if (retryCount < maxRetries) {
                addLog("等待章节测验加载 (" + retryCount + "/" + maxRetries + ")", 'info');
                setTimeout(tryFindQuestions, 2500);
            } else {
                addLog("无法找到章节测验内容，跳过", 'warning');
                setTimeout(function() { document.dispatchEvent(dealEvent); }, 1000);
            }
        }
    }

    function submitQuizAndContinue(doc) {
        var btnDoc = doc.querySelector(".ZY_sub");
        if (!btnDoc) btnDoc = doc;
        var submit_btn = btnDoc.querySelector('.btnSubmit') || doc.querySelector('.btnSubmit');
        var save_btn = btnDoc.querySelector('.btnSave') || doc.querySelector('.btnSave');
        if (submit_btn) {
            submit_btn.click();
            addLog('章节测试答案已提交', 'success');
        } else if (save_btn) {
            save_btn.click();
            addLog('章节测试答案已保存', 'info');
        } else {
            addLog('未找到提交/保存按钮', 'warning');
        }
        setTimeout(function() { document.dispatchEvent(dealEvent); }, 3000);
    }

    tryFindQuestions();
}

function audioHandler(entry) {
    var idocument = entry.document;
    addLog("处理音频任务中...", 'info');
    var retries = 0;
    var maxRetries = 8;
    function tryFindAudio() {
        try {
            const audio = idocument.querySelector("audio");
            const audioPlayButton = idocument.querySelector(".vjs-play-control.vjs-control.vjs-button, .vjs-big-play-button");
            if (!audio) {
                retries++;
                if (retries < maxRetries) {
                    setTimeout(tryFindAudio, 2000);
                } else {
                    addLog("没有找到音频元素，跳过", 'warning');
                    setTimeout(function() { document.dispatchEvent(dealEvent); }, 1000);
                }
                return;
            }
            if (audioPlayButton) audioPlayButton.click();
            audio.addEventListener("ended", function() {
                addLog("音频任务已完成", 'success');
                setTimeout(function() { document.dispatchEvent(dealEvent); }, 500);
            }, { once: true });
            audio.addEventListener("pause", function() { if (audioPlayButton) audioPlayButton.click(); });
        } catch(e) {
            retries++;
            if (retries < maxRetries) {
                setTimeout(tryFindAudio, 2000);
            } else {
                addLog('音频处理出错: ' + e.message, 'error');
                setTimeout(function() { document.dispatchEvent(dealEvent); }, 2000);
            }
        }
    }
    tryFindAudio();
}

function getUrlParam(name) {
    var searchStr = '';
    try { searchStr = window.top.location.search; } catch(e) { searchStr = location.search; }
    var match = searchStr.match(new RegExp('[?&]' + name + '=([^&]*)'));
    return match ? decodeURIComponent(match[1]) : '';
}

function extractStudyPayloadFromPage(pageDoc) {
    if (!pageDoc || !pageDoc.scripts) return null;
    var scripts = Array.from(pageDoc.scripts);
    for (var i = 0; i < scripts.length; i++) {
        var content = String(scripts[i].textContent || '');
        if (!content.includes('mArg') || !content.includes('attachments')) continue;
        var match = content.match(/try\s*\{\s*mArg\s*=\s*([\s\S]*?)\s*;\s*\}\s*catch/);
        if (!match || !match[1]) continue;
        var raw = match[1].trim();
        if (!raw || raw === '""' || raw === '$mArg') continue;
        try {
            return JSON.parse(raw);
        } catch(e) {}
    }
    return null;
}

async function callDocApi(path, jobid, jtoken) {
    var courseid = (studyPageDefaults && (studyPageDefaults.courseId || studyPageDefaults.courseid)) || getUrlParam('courseId');
    var clazzid = (studyPageDefaults && (studyPageDefaults.clazzId || studyPageDefaults.clazzid)) || getUrlParam('clazzId');
    var knowledgeid = (studyPageDefaults && (studyPageDefaults.knowledgeId || studyPageDefaults.knowledgeid)) || getUrlParam('knowledgeId');
    var url = new URL(path, location.origin);
    if (jobid) url.searchParams.set('jobid', jobid);
    if (knowledgeid) url.searchParams.set('knowledgeid', knowledgeid);
    if (courseid) url.searchParams.set('courseid', courseid);
    if (clazzid) url.searchParams.set('clazzid', clazzid);
    if (jtoken) url.searchParams.set('jtoken', jtoken);
    url.searchParams.set('_dc', String(Date.now()));
    try {
        var response = await fetch(url.toString(), { credentials: 'include' });
        return response.ok;
    } catch(e) {
        return false;
    }
}

function pptxHandler(entry) {
    var idocument = entry.document;
    addLog("处理 PPT/PDF 任务中...", 'info');
    var retries = 0;
    var maxRetries = 6;

    function markTaskDomFinished(jobid) {
        completedJobCache.add(jobid);
        setTimeout(function() { completedJobCache.delete(jobid); }, 120000);
        try {
            var cd = null;
            forEachSameOriginFrame(function(doc) {
                if (cd) return;
                try { if (doc.location.pathname.includes('/knowledge/cards')) cd = doc; } catch(e) {}
            });
            if (!cd) return;
            var attachCts = cd.querySelectorAll('.ans-attach-ct');
            for (var i = 0; i < attachCts.length; i++) {
                var iframe = attachCts[i].querySelector('iframe');
                if (!iframe) continue;
                var dataStr = iframe.getAttribute('data');
                if (!dataStr) continue;
                try {
                    var d = JSON.parse(dataStr);
                    var dj = d.jobid || (d.property && d.property.jobid) || '';
                    if (dj === jobid) {
                        attachCts[i].classList.add('ans-job-finished');
                        break;
                    }
                } catch(e) {}
            }
        } catch(e) {}
    }

    function tryApiThenDoc() {
        var taskData = null;
        if (entry.dataStr) {
            try { taskData = JSON.parse(entry.dataStr); } catch(e) {}
        }

        if (taskData && (taskData.jobid || (taskData.property && taskData.property.jobid))) {
            var jobid = taskData.jobid || (taskData.property && taskData.property.jobid);
            if (completedJobCache.has(jobid)) {
                addLog('该文档任务已完成（缓存中），跳过', 'info');
                setTimeout(function() { document.dispatchEvent(dealEvent); }, 500);
                return;
            }
            var jtoken = taskData.jtoken || '';
            if (!jtoken && studyPageTasks) {
                for (var t = 0; t < studyPageTasks.length; t++) {
                    var pt = studyPageTasks[t];
                    var ptJobid = (pt && pt.property && pt.property.jobid) || (pt && pt.jobid) || '';
                    if (ptJobid === jobid) {
                        jtoken = pt.jtoken || '';
                        break;
                    }
                }
            }
            var apiPaths = getReaderMissionApiPaths({ type: entry.type });

            addLog('正在阅读', 'info');
            tryApiRecursive(apiPaths, 0, jobid, jtoken);
        } else {
            addLog('未获取到任务数据，直接翻页处理', 'info');
            fallbackToPageTurning();
        }
    }

    function tryApiRecursive(paths, index, jobid, jtoken) {
        if (index >= paths.length) {
            addLog('API回调全部失败，转为翻页处理', 'warning');
            fallbackToPageTurning();
            return;
        }
        callDocApi(paths[index], jobid, jtoken).then(function(success) {
            if (success) {
                markTaskDomFinished(jobid);
                addLog('文档任务已完成 (' + paths[index] + ')', 'success');
                setTimeout(function() { document.dispatchEvent(dealEvent); }, 1500);
            } else {
                addLog('任务失败，尝试下一个', 'info');
                tryApiRecursive(paths, index + 1, jobid, jtoken);
            }
        });
    }

    function fallbackToPageTurning() {
        try {
            var handled = handlePPTInDocument(idocument);
            if (!handled) {
                var hasReader = idocument.querySelector('.reader, .ppt, .ppt-play, .reader-box, .reader_container, .np-viewer, .file-reader, .slide-content, .swiper-slide');
                if (!hasReader) {
                    retries++;
                    if (retries < maxRetries) {
                        setTimeout(tryApiThenDoc, 2000);
                    } else {
                        addLog('未找到文档阅读器，跳过', 'warning');
                        setTimeout(function() { document.dispatchEvent(dealEvent); }, 1000);
                    }
                    return;
                }
            }
            setTimeout(function() { document.dispatchEvent(dealEvent); }, 2000);
        } catch(e) {
            retries++;
            if (retries < maxRetries) {
                setTimeout(tryApiThenDoc, 2000);
            } else {
                addLog('文档处理出错: ' + e.message, 'error');
                setTimeout(function() { document.dispatchEvent(dealEvent); }, 2000);
            }
        }
    }

    tryApiThenDoc();
}

function ignoreAns(entry) {
    var idocument = entry.document;
    addLog('忽略未知任务类型', 'info');
    setTimeout(function() { document.dispatchEvent(dealEvent); }, 2000);
}

function removeNewlines(str) {
    return str.replace(/\n/g, '');
}

function extractText(str) {
    var match = str.match(/【(.*?)】/);
    return match ? match[1] : null;
}

function getTrueStatusPercentage(arr) {
    var trueCount = arr.filter(function(item) { return item.status === true; }).length;
    return (trueCount / arr.length) * 100;
}

function formatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
}

function startProgressMonitor() {
    if (progressMonitor) return;

    progressMonitor = setInterval(function() {
        var anyDone = false;
        forEachSameOriginFrame(function(doc) {
            if (anyDone) return;
            try {
                var at = doc.querySelectorAll('.ans-attach-ct, .ans-job-ct, .chapter-item');
                var dt = doc.querySelectorAll('.ans-attach-ct.ans-job-finished, .ans-job-ct.ans-job-finished');
                if (at.length > 0) {
                    var taskPct = ((dt.length / at.length) * 100).toFixed(0);
                    if (dt.length === at.length && !autoSkipDone) {
                        autoSkipDone = true;
                        addLog('[进度] 当前章节所有任务已全部完成，准备自动跳转下一章', 'info');
                        stopProgressMonitor();
                        scheduleSkipChapter(3000);
                    }
                    anyDone = true;
                }
            } catch(e) {}
        });
    }, 30000);
}

function stopProgressMonitor() {
    if (progressMonitor) {
        clearInterval(progressMonitor);
        progressMonitor = null;
    }
}

document.addEventListener("redeal", function() {
    if (!isMainInstance || !isStudyingChapters) return;
    setTimeout(function() { dealAnsEchelon(arrayEchelon); }, 1500);
});


const LOG_MAX_ITEMS = 120;

function updateAnswerLogGradients(logContainer) {
    const wrap = logContainer?.closest('.cx-log-list-container');
    if (!wrap) return;
    const topG = wrap.querySelector('.cx-log-top-gradient');
    const bottomG = wrap.querySelector('.cx-log-bottom-gradient');
    if (!topG || !bottomG) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainer;
    topG.style.opacity = String(Math.min(scrollTop / 50, 1));
    const bottomDistance = scrollHeight - (scrollTop + clientHeight);
    bottomG.style.opacity = scrollHeight <= clientHeight ? '0' : String(Math.min(bottomDistance / 50, 1));
}

function initAnswerLogList() {
    const logContainer = document.getElementById('answer-log');
    if (!logContainer || logContainer.dataset.cxLogInit === '1') return;
    logContainer.dataset.cxLogInit = '1';

    logContainer.addEventListener('scroll', () => updateAnswerLogGradients(logContainer), { passive: true });

    logContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.log-item');
        if (!item || !logContainer.contains(item)) return;
        logContainer.querySelectorAll('.log-item.selected').forEach((el) => el.classList.remove('selected'));
        item.classList.add('selected');
    });

    updateAnswerLogGradients(logContainer);
}

function addLog(message, type = 'info') {
    try { if (typeof unsafeWindow !== 'undefined') unsafeWindow.__cxPanelLog = addLog; } catch {}
    try {
        const logContainer = document.getElementById('answer-log');
        if (!logContainer) return;
        initAnswerLogList();

        const text = String(message || '')
            .replace(/\s+/g, ' ')
            .slice(0, 5000);

        const normType = type === 'warn' ? 'warning' : type;
        const logItem = document.createElement('div');
        logItem.className = `log-item ${normType}`;
        logItem.dataset.index = String(logContainer.querySelectorAll('.log-item').length);

        const iconEl = document.createElement('span');
        iconEl.className = 'item-icon';
        iconEl.innerHTML = cxIcon(cxLogIconName(normType), { size: 12 });

        const bodyEl = document.createElement('div');
        bodyEl.className = 'item-body';

        const timeEl = document.createElement('span');
        timeEl.className = 'item-time';
        timeEl.textContent = new Date().toLocaleTimeString();

        const textEl = document.createElement('p');
        textEl.className = 'item-text';
        textEl.textContent = text;

        bodyEl.appendChild(timeEl);
        bodyEl.appendChild(textEl);
        logItem.appendChild(iconEl);
        logItem.appendChild(bodyEl);
        logContainer.appendChild(logItem);

        logContainer.querySelectorAll('.log-item.selected').forEach((el) => el.classList.remove('selected'));
        logItem.classList.add('selected');

        const items = logContainer.querySelectorAll('.log-item');
        if (items.length > LOG_MAX_ITEMS) {
            const removeCount = items.length - LOG_MAX_ITEMS;
            for (let i = 0; i < removeCount; i++) {
                const n = logContainer.firstElementChild;
                if (n) logContainer.removeChild(n);
            }
        }

        logContainer.scrollTop = logContainer.scrollHeight;
        updateAnswerLogGradients(logContainer);
    } catch {}
}


async function updateAiStatusBadge() {
    try {
        const el = document.getElementById('cx_ai_status_badge');
        if (!el) return;
        if (isLocalApiManagerConfigured()) {
            const info = getActiveAiDisplayInfo();
            el.textContent = info.tag + ' · ' + info.model;
            el.title = '点击打开 API 设置';
            return;
        }
        el.innerHTML = cxIconLabel('warning', '点击配置 API', { size: 11, className: 'cx-badge-icon' });
        el.title = '点击打开 API 设置';
    } catch {}
}

function getQuestionInfo(questionElement) {
    try {

        const questionId = questionElement.id || '';
        const possibleTypeSelectors = [
            '.type_title',
            '.mark_name',
            '.questionType',
            'div[class*="type"]',
            'div[class*="Type"]',
            '.subject_type',
            '.q-type',
            'div[class*="questionType"]',
            '.stem_type'
        ];

        const possibleQuestionSelectors = [
            '.subject_describe',
            '.mark_name',
            '.questionContent',
            '.title',
            'div[class*="title"]',
            '.subject_stem',
            '.q-body',
            '.question-content',
            '.stem-content',
            '.stem_txt'
        ];


        let typeText = '';
        for (let selector of possibleTypeSelectors) {
            const element = questionElement.querySelector(selector);
            if (element) {
                typeText = element.textContent.trim();
                break;
            }
        }

        let type = '';
        if (typeText.includes('单选题')) type = 'single';
        else if (typeText.includes('多选题')) type = 'multiple';
        else if (typeText.includes('判断题')) type = 'judge';
        else if (typeText.includes('填空题')) type = 'blank';
        else if (typeText.includes('简答题')) type = 'short';
        else if (typeText.includes('名词解释')) type = 'term';
        else if (typeText.includes('论述题')) type = 'essay';
        else if (typeText.includes('计算题')) type = 'calculation';
        else if (typeText.includes('完形填空')) type = 'cloze';
        else if (typeText.includes('写作题')) type = 'writing';
        else if (typeText.includes('连线题')) type = 'matching';
        else if (typeText.includes('分录题')) type = 'accounting';


        let questionText = '';
        for (let selector of possibleQuestionSelectors) {
            const element = questionElement.querySelector(selector);
            if (element) {
                questionText = element.textContent.trim();
                break;
            }
        }


        const optionSelectors = [
            '.stem_answer > div',
            '.stem_answer div[class*="option"]',
            'div.stem_answer > div',
            '.answer_p',
            '.subject_node',
            '.answer_options',
            '.options div'
        ];
        if (questionId) {
            const escapedId = (window.CSS && typeof window.CSS.escape === 'function')
                ? window.CSS.escape(questionId)
                : questionId.replace(/(["'\\.#:[\],>+~*^$(){}| ])/g, '\\$1');
            optionSelectors.splice(3, 0, `#${escapedId} > div.stem_answer > div`);
        }

        let options = [];
        let foundSelector = '';
        for (let selector of optionSelectors) {
            let elements = [];
            try {
                elements = questionElement.querySelectorAll(selector);
            } catch (e) {

                continue;
            }
            if (elements.length > 0) {
                options = Array.from(elements).map((option, index) => {
                    const text = option.textContent.trim();
                    const letter = String.fromCharCode(65 + index);

                    return text;
                });
                foundSelector = selector;
                break;
            }
        }


        if (options.length === 0 && questionId) {
            const escapedId = (window.CSS && typeof window.CSS.escape === 'function')
                ? window.CSS.escape(questionId)
                : questionId.replace(/(["'\\.#:[\],>+~*^$(){}| ])/g, '\\$1');
            for (let i = 1; i <= 6; i++) {
                const specificSelector = `#${escapedId} > div.stem_answer > div:nth-child(${i})`;
                const element = document.querySelector(specificSelector);
                if (element) {
                    options.push(element.textContent.trim());
                }
            }
        }

        if (!questionText) {
            addLog('无法解析题目内容', 'error');
        }
        if (!type) {
            if (questionElement.querySelector('[id^="answerEditor"], iframe[id^="ueditor_"]')) {
                type = 'short';
            } else if (questionElement.querySelector('input[type="checkbox"]')) {
                type = 'multiple';
            } else if (questionElement.querySelector('input[type="radio"], ul.Zy_ulTop, .stem_answer > div')) {
                type = 'single';
            } else {
                type = 'short';
            }
        }

        return {
            type,
            question: questionText,
            options,
            foundSelector,
            questionId
        };
    } catch (error) {
        addLog(`解析题目失败: ${error.message}`, 'error');
        return null;
    }
}


function getModelParams(questionType) {
    const preciseTypes = ['single', 'multiple', 'blank', 'cloze', 'judge'];

    if (preciseTypes.includes(questionType)) {
        return {
            temperature: 0.3,
            max_tokens: 2048,
            top_p: 0.9,
            frequency_penalty: 0,
            presence_penalty: 0
        };
    } else {
        return {
            temperature: 0.5,
            max_tokens: 800,
            top_p: 0.9,
            frequency_penalty: 0,
            presence_penalty: 0
        };
    }
}


const AI_ANSWER_MAX_LEN = 300;
const CODE_PLACEHOLDER = '【在此处插入代码】';

function isSubjectiveQuestionType(type) {
    return ['short', 'term', 'essay', 'writing', 'calculation', 'matching', 'accounting'].includes(type);
}

function isProgrammingQuestion(text) {
    if (!text) return false;
    return /编程|程序设计|写程序|编写程序|编写代码|代码实现|程序实现|写出程序|写一段程序|写一个函数|写一个方法|算法实现|补全程序|完善程序|程序填空|代码填空|写代码|coding|programming|implement.*function|write.*program/i.test(String(text));
}

function looksLikeCodeAnswer(text) {
    if (!text) return false;
    const s = String(text);
    if (/```[\s\S]*?```/.test(s)) return true;
    if (/(?:^|\n)\s*(?:def |function\s+\w|class\s+\w|import\s+\w|#include|public\s+static|int\s+main|console\.log|System\.out|printf\s*\(|<?php\b|using\s+System)/m.test(s)) return true;
    const codeLines = s.split('\n').filter((line) => /[{};]|=>|\(\)\s*\{/.test(line)).length;
    return codeLines >= 3;
}

function normalizeSubjectiveAnswer(answer, questionInfo) {
    if (!answer || !isSubjectiveQuestionType(questionInfo.type)) return answer;

    let text = String(answer).trim();
    const needsCode = isProgrammingQuestion(questionInfo.question);

    if (needsCode || looksLikeCodeAnswer(text)) {
        text = text.replace(/```[\w]*[\s\S]*?```/g, CODE_PLACEHOLDER);
        if (looksLikeCodeAnswer(text)) {
            const summary = text
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line && line !== CODE_PLACEHOLDER && !looksLikeCodeAnswer(line))
                .join('\n')
                .trim();
            text = summary
                ? (summary.includes(CODE_PLACEHOLDER) ? summary : summary + '\n' + CODE_PLACEHOLDER)
                : CODE_PLACEHOLDER;
        }
    }

    if (text.length > AI_ANSWER_MAX_LEN) {
        text = text.slice(0, AI_ANSWER_MAX_LEN);
    }
    return text.trim();
}


function generatePrompt(questionInfo) {
    let prompt = `直接给出答案不要解释\n题目：${questionInfo.question}\n`;

    if (questionInfo.type === 'single' || questionInfo.type === 'multiple' || questionInfo.type === 'judge') {
        if (questionInfo.options && questionInfo.options.length > 0) {
            prompt += '选项：\n';
            questionInfo.options.forEach((option, index) => {
                const letter = String.fromCharCode(65 + index);

                const cleanOption = option.replace(/^[A-Z][\s.、．。]+|^\d+[\s.、．。]+/, '').trim();
                prompt += `${letter}. ${cleanOption}\n`;
            });


            if (questionInfo.type === 'single') {
                prompt += '\n请直接回答选项字母（A/B/C/D/...）';
            } else if (questionInfo.type === 'multiple') {
                prompt += '\n这是多选题，请列出所有正确选项的字母，用逗号分隔（如：A,B,D）';
            } else if (questionInfo.type === 'judge') {
                prompt += '\n这是判断题，请回答A表示正确，B表示错误';
            }
        }
    } else if (questionInfo.type === 'blank') {

        prompt += '\n这是填空题，请按顺序给出每个空的答案，用逗号分隔';
    } else if (isSubjectiveQuestionType(questionInfo.type)) {
        prompt += '\n\n作答要求：';
        prompt += '\n1. 用简短摘要作答，总字数不超过300字，不要展开论述或长篇解释';
        prompt += '\n2. 若题目要求编写程序或输出代码，禁止输出具体代码，只回答：' + CODE_PLACEHOLDER;
        if (isProgrammingQuestion(questionInfo.question)) {
            prompt += '\n3. 本题为编程/代码类题目，请勿输出代码，直接回答：' + CODE_PLACEHOLDER;
        }
    }

    return prompt;
}

async function getAnswer(questionInfo, retryCount = 0, progressCtx) {
    try {
        await ensureAccessAllowed();
    } catch (e) {
        addLog(String(e && e.message ? e.message : e), 'error');
        return null;
    }
    const prompt = generatePrompt(questionInfo);
    const apiInfo = getActiveAiDisplayInfo();

    try {
        const modelParams = getModelParams(questionInfo.type);
        if (retryCount === 1) {
            modelParams.temperature = 0.7;
            modelParams.top_p = 0.95;
        } else if (retryCount > 1) {
            modelParams.temperature = 0.9;
            modelParams.top_p = 1.0;
        }

        resetStreamDisplay();
        const qPreview = questionInfo.question.substring(0, 24);
        addLog('[' + (progressCtx && progressCtx.index ? progressCtx.index + '/' + progressCtx.total + ' ' : '') + apiInfo.tag + '] 请求 AI: ' + qPreview + '...', 'info');

        let lastStreamLogAt = 0;
        const onChunk = (delta, full) => {
            appendStreamDisplay(delta, full);
            const now = Date.now();
            if (now - lastStreamLogAt > 400 && full.length > 0) {
                lastStreamLogAt = now;
                addLog('AI 流式片段: ' + full.slice(-60).replace(/\s+/g, ' '), 'debug');
            }
        };

        const data = await aiChatWithFailover([
            { role: "user", content: prompt }
        ], modelParams, onChunk);

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('API响应格式异常');
        }

        let answer = data.choices[0].message.content || '';
        answer = answer.trim();

        if (!answer && retryCount < 3) {
            addLog(`AI返回空答案，正在进行第 ${retryCount + 1} 次重试...`, 'warn');
            await new Promise(r => setTimeout(r, 1500));
            return await getAnswer(questionInfo, retryCount + 1, progressCtx);
        }

        if (answer.length < 1 && retryCount >= 3) {
            addLog(`题目：${questionInfo.question.slice(0, 20)}... AI最终未能给出有效答案`, 'error');
            return null;
        }

        answer = normalizeSubjectiveAnswer(answer, questionInfo);

        addLog('AI 完成: ' + answer.slice(0, 80) + (answer.length > 80 ? '...' : ''), 'success');
        return answer;
    } catch (error) {
        if (retryCount < 3) {
            addLog(`API调用失败: ${error.message}，正在尝试重试...`, 'warn');
            await new Promise(r => setTimeout(r, 2000));
            return await getAnswer(questionInfo, retryCount + 1, progressCtx);
        }
        addLog(`API调用最终失败: ${error.message}`, 'error');
        return null;
    }
}




function dispatchKeyboardEvent(el, type, key, keyCode) {
    if (!el) return;
    const doc = el.ownerDocument || document;
    const win = doc.defaultView || window;
    const opts = {
        key: key || 'Enter',
        code: (key === 'Enter' || !key) ? 'Enter' : key,
        keyCode: keyCode || 13,
        which: keyCode || 13,
        bubbles: true,
        cancelable: true,
        composed: true,
        view: win
    };
    try {
        el.dispatchEvent(new KeyboardEvent(type, opts));
        return;
    } catch {}
    try {
        const ev = doc.createEvent('KeyboardEvent');
        if (typeof ev.initKeyboardEvent === 'function') {
            ev.initKeyboardEvent(type, true, true, win, opts.key, opts.keyCode, '', false, '');
        }
        el.dispatchEvent(ev);
    } catch {}
}

function simulateEnterKey(el) {
    if (!el) return;
    dispatchKeyboardEvent(el, 'keydown', 'Enter', 13);
    dispatchKeyboardEvent(el, 'keypress', 'Enter', 13);
    dispatchKeyboardEvent(el, 'keyup', 'Enter', 13);
}

function setNativeInputValue(el, value) {
    if (!el) return;
    const tag = (el.tagName || '').toLowerCase();
    const strVal = String(value == null ? '' : value);
    try {
        if (tag === 'textarea') {
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            if (setter) setter.call(el, strVal);
            else el.value = strVal;
            return;
        }
        if (tag === 'input') {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            if (setter) setter.call(el, strVal);
            else el.value = strVal;
            return;
        }
    } catch {
        try { el.value = strVal; } catch {}
    }
    if (el.getAttribute && el.getAttribute('contenteditable') === 'true') {
        try {
            el.textContent = strVal;
            el.innerHTML = strVal;
        } catch {}
    }
}

function isUeTextarea(el) {
    return !!(el && el.id && /^answerEditor/i.test(String(el.id)));
}

function isUeIframeBody(el) {
    if (!el || (el.tagName || '').toLowerCase() !== 'body') return false;
    try {
        const frame = el.ownerDocument?.defaultView?.frameElement;
        return !!(frame && /^ueditor_/i.test(String(frame.id || '')));
    } catch { return false; }
}

function isUeRelatedElement(el) {
    return isUeTextarea(el) || isUeIframeBody(el);
}

function typeLabelToType(typeLabel) {
    const t = String(typeLabel || '');
    if (/单选/.test(t)) return 'single';
    if (/多选/.test(t)) return 'multiple';
    if (/判断/.test(t)) return 'judge';
    if (/填空|完形/.test(t)) return 'blank';
    if (/名词解释/.test(t)) return 'term';
    if (/论述/.test(t)) return 'essay';
    if (/简答|问答|主观|计算|分录|写作|连线/.test(t)) return 'short';
    return '';
}

function inferQuestionType(questionElement, info, entry) {
    let type = (info && info.type) || '';
    if (entry && entry.typeLabel) {
        const fromLabel = typeLabelToType(entry.typeLabel);
        if (fromLabel) type = fromLabel;
    }
    if (!questionElement) return type || 'short';
    const hasUe = !!questionElement.querySelector('[id^="answerEditor"], iframe[id^="ueditor_"]');
    const hasChoice = !!questionElement.querySelector('ul.Zy_ulTop, .stem_answer > div, input[type="radio"], input[type="checkbox"]');
    if (hasUe && !hasChoice) {
        if (!type || type === 'single' || type === 'multiple' || type === 'unknown') type = 'short';
    } else if (hasChoice && (!type || type === 'unknown')) {
        type = questionElement.querySelector('input[type="checkbox"]') ? 'multiple' : 'single';
    }
    if (!type || type === 'unknown') type = hasUe ? 'short' : 'single';
    return type;
}

function resolveQuestionInfo(entry) {
    const el = entry && entry.element;
    let info = null;
    try { info = el ? getQuestionInfo(el) : null; } catch {}
    if (!info) {
        info = {
            type: 'short',
            question: el ? (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : '',
            options: [],
            questionId: el ? (el.id || '') : ''
        };
    }
    info.type = inferQuestionType(el, info, entry);
    return info;
}

function escapeHtmlText(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatUeHtml(value) {
    const val = String(value == null ? '' : value).trim();
    if (!val) return '';
    if (/[<][a-z][\s\S]*[>]/i.test(val)) return val;
    return val.split(/\n+/).filter(Boolean).map((line) => '<p>' + escapeHtmlText(line) + '</p>').join('') || '<p></p>';
}

function normalizeCompareText(text) {
    return String(text || '').replace(/\s+/g, '').trim();
}

function getUeEditorPlainText(editor) {
    if (!editor) return '';
    try {
        if (typeof editor.getContentTxt === 'function') return String(editor.getContentTxt() || '').trim();
    } catch {}
    try {
        if (editor.body) return String(editor.body.textContent || editor.body.innerText || '').trim();
    } catch {}
    try {
        if (typeof editor.getContent === 'function') {
            return String(editor.getContent() || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
    } catch {}
    return '';
}

function findUeIframe(doc, editorId, questionElement) {
    const ta = doc.getElementById(editorId);
    const scopes = [
        ta && ta.parentElement,
        ta && ta.closest('.editor, .subEditor, .eidtDiv, .divText, .textDIV'),
        questionElement
    ].filter(Boolean);
    for (const scope of scopes) {
        const ifr = scope.querySelector('iframe[id^="ueditor_"]');
        if (ifr) return ifr;
    }
    return questionElement ? questionElement.querySelector('iframe[id^="ueditor_"]') : null;
}

function getUeIframePlainText(doc, editorId, questionElement) {
    try {
        const ifr = findUeIframe(doc, editorId, questionElement);
        const body = ifr && (ifr.contentDocument || ifr.contentWindow?.document)?.body;
        return body ? String(body.textContent || body.innerText || '').trim() : '';
    } catch {}
    return '';
}

function isUeContentWritten(doc, editorId, questionElement, value, editor) {
    const expect = normalizeCompareText(value);
    if (!expect) return false;
    const probe = expect.slice(0, Math.min(24, expect.length));
    const chunks = [
        normalizeCompareText(getUeEditorPlainText(editor)),
        normalizeCompareText(getUeIframePlainText(doc, editorId, questionElement))
    ].filter(Boolean);
    return chunks.some((txt) => txt.includes(probe) || (probe.length >= 8 && expect.includes(txt.slice(0, Math.min(24, txt.length)))));
}

async function ensureUeEditorWakeup(doc, editorId, questionElement) {
    const ifr = findUeIframe(doc, editorId, questionElement);
    if (ifr) {
        try { ifr.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch {}
        try { ifr.contentWindow?.focus?.(); } catch {}
    }
    const ta = doc.getElementById(editorId);
    if (ta) {
        try { ta.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch {}
    }
}

function getUeEditor(doc, editorId) {
    const d = doc || document;
    try {
        const win = d.defaultView || window;
        if (win.UE && typeof win.UE.getEditor === 'function') return win.UE.getEditor(editorId);
    } catch {}
    try {
        if (typeof UE !== 'undefined' && typeof UE.getEditor === 'function') return UE.getEditor(editorId);
    } catch {}
    return null;
}

function syncHiddenAnswerValue(doc, qid, value) {
    if (!qid) return null;
    const hidden = doc.getElementById(`answer${qid}`);
    if (!hidden) return null;
    const val = String(value == null ? '' : value);
    try {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(hidden, val);
        else hidden.value = val;
    } catch { hidden.value = val; }
    return hidden;
}

function triggerAnswerSaved(doc, questionElement, value) {
    const rootDoc = doc || document;
    const block = (questionElement && questionElement.closest)
        ? (questionElement.closest('.questionLi, .singleQuesId, .TiMu, .question') || questionElement)
        : questionElement;
    if (!block) return;
    let qid = (block.getAttribute('data') || block.dataset?.qid || '').toString().trim();
    if (!qid) {
        const m = String(block.id || '').match(/(\d{3,})/);
        qid = m ? m[1] : '';
    }
    if (value != null && qid) syncHiddenAnswerValue(rootDoc, qid, value);
    const hidden = qid ? rootDoc.getElementById(`answer${qid}`) : null;
    if (hidden && String(hidden.value || '').trim()) {
        try { hidden.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
        simulateEnterKey(hidden);
    }
    tryMarkAnswerSheetAnswered(rootDoc, block, { skipHidden: true });
}

function restoreUeEditorSelection(editor) {
    if (!editor) return;
    try { editor.focus(true); } catch { try { editor.focus(); } catch {} }
    try {
        if (editor.body && editor.selection && typeof editor.selection.getRange === 'function') {
            const range = editor.selection.getRange();
            if (range && typeof range.selectNodeContents === 'function') {
                range.selectNodeContents(editor.body);
                range.collapse(false);
                if (typeof range.select === 'function') range.select();
            }
        }
    } catch {}
    try { editor.fireEvent('selectionchange'); } catch {}
}

function dispatchUeTextareaSync(el, value) {
    if (!el) return;
    const doc = el.ownerDocument || document;
    const win = doc.defaultView || window;
    const val = String(value == null ? '' : value);
    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
    simulateEnterKey(el);
    try {
        ['dealAnswer', 'saveUserAnswer', 'saveWorkAnswer', 'changeCard', 'markAnswer', 'setAnswerCard', 'answerChange'].forEach((name) => {
            if (typeof win[name] === 'function') win[name](el);
        });
    } catch {}
}

function dispatchUeIframeBodySync(body, value) {
    if (!body) return;
    try { body.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
    try { body.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
    const doc = body.ownerDocument || document;
    const win = doc.defaultView || window;
    try {
        ['dealAnswer', 'saveUserAnswer', 'saveWorkAnswer', 'changeCard', 'markAnswer'].forEach((name) => {
            if (typeof win[name] === 'function') win[name](body);
        });
    } catch {}
}

async function writeUeEditorContent(doc, editorId, value, questionElement) {
    const rootDoc = doc || document;
    const val = String(value == null ? '' : value).trim();
    if (!val) return false;
    const htmlVal = formatUeHtml(val);
    const block = (questionElement && questionElement.closest)
        ? (questionElement.closest('.questionLi, .singleQuesId, .TiMu, .question') || questionElement)
        : (rootDoc.getElementById(editorId)?.closest('.questionLi, .singleQuesId, .TiMu, .question') || questionElement);
    const ta = rootDoc.getElementById(editorId);
    let done = false;

    await ensureUeEditorWakeup(rootDoc, editorId, block);

    try {
        const editor = await waitForQuizEditorInstance(rootDoc, editorId, 6000);
        if (editor) {
            const ready = await waitForUeEditorReady(editor, 5000);
            if (ready) {
                editor.setContent(htmlVal);
                try { editor.fireEvent('contentChange'); } catch {}
                try { editor.fireEvent('selectionchange'); } catch {}
                if (ta) dispatchUeTextareaSync(ta, val);
                done = isUeContentWritten(rootDoc, editorId, block, val, editor);
            } else {
                addLog('编辑器未 ready，尝试备用回填：' + editorId, 'warning');
            }
        } else {
            addLog('未找到 UEditor 实例，尝试备用回填：' + editorId, 'warning');
        }
    } catch (e) {
        addLog('UE 写入失败，尝试备用回填：' + e.message, 'warning');
    }

    if (ta) {
        try {
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            if (setter) setter.call(ta, val);
            else ta.value = val;
            dispatchUeTextareaSync(ta, val);
            done = done || isUeContentWritten(rootDoc, editorId, block, val, null);
        } catch (e) {
            addLog('textarea 回填失败：' + e.message, 'warning');
        }
    }

    try {
        const ifr = findUeIframe(rootDoc, editorId, block)
            || ta?.parentElement?.querySelector('iframe[id^="ueditor_"]')
            || ta?.closest('.subEditor, .eidtDiv, .divText, .textDIV, .editor')?.querySelector('iframe[id^="ueditor_"]')
            || (block && block.querySelector('iframe[id^="ueditor_"]'));
        const iframeDoc = ifr && (ifr.contentDocument || ifr.contentWindow?.document);
        const body = iframeDoc && iframeDoc.body;
        if (body && !isUeContentWritten(rootDoc, editorId, block, val, null)) {
            body.innerHTML = htmlVal;
            dispatchUeIframeBodySync(body, val);
            done = isUeContentWritten(rootDoc, editorId, block, val, null) || done;
        }
    } catch (e) {
        addLog('iframe 编辑区回填失败：' + e.message, 'warning');
    }

    if (!done && !isUeContentWritten(rootDoc, editorId, block, val, null)) {
        addLog('编辑器可见区域未写入成功：' + editorId, 'error');
        return false;
    }

    triggerAnswerSaved(rootDoc, block, val);
    return true;
}

function dispatchFieldEvents(el, opts) {
    if (!el) return;
    opts = opts || {};
    if (isUeRelatedElement(el)) {
        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
        return;
    }
    const doc = el.ownerDocument || document;
    const win = doc.defaultView || window;
    if (opts.skipFocus !== true) {
        try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch {} }
    }
    try {
        if (typeof InputEvent !== 'undefined') {
            el.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: opts.inputType || 'insertFromPaste',
                data: opts.data != null ? String(opts.data) : null
            }));
        } else {
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
    } catch {
        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
    }
    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
    if (opts.simulateEnter !== false) simulateEnterKey(el);
    if (opts.skipBlur !== true) {
        try { el.dispatchEvent(new FocusEvent('blur', { bubbles: true })); } catch {
            try { el.dispatchEvent(new Event('blur', { bubbles: true })); } catch {}
        }
    }
    try {
        ['dealAnswer', 'saveUserAnswer', 'saveWorkAnswer', 'changeCard', 'markAnswer', 'setAnswerCard', 'answerChange'].forEach((name) => {
            if (typeof win[name] === 'function') win[name](el);
        });
    } catch {}
}

function setInputValueAndTrigger(el, value) {
    if (!el || isUeTextarea(el)) return;
    setNativeInputValue(el, value);
    dispatchFieldEvents(el, { data: String(value == null ? '' : value) });
}

function tryMarkAnswerSheetAnswered(doc, questionElement, opts) {
    opts = opts || {};
    try {
        const rootDoc = doc || questionElement?.ownerDocument || document;
        const block = questionElement.closest('.questionLi, .singleQuesId, .TiMu, .question') || questionElement;
        let qid = (block.getAttribute('data') || block.dataset?.qid || '').toString().trim();
        if (!qid) {
            const m = String(block.id || '').match(/(\d{3,})/);
            qid = m ? m[1] : '';
        }
        if (!qid) return;

        const cardSelectors = [
            `#cardList .card${qid}`,
            `#cardList #card${qid}`,
            `#cardList span[data="${qid}"]`,
            `#cardList li[data="${qid}"]`,
            `.cardList span[data="${qid}"]`,
            `.numberCard[data="${qid}"]`,
            `#numberCard${qid}`,
            `.questionNumber[data="${qid}"]`,
            `.sheet-item[data="${qid}"]`
        ];
        for (const sel of cardSelectors) {
            const node = rootDoc.querySelector(sel);
            if (!node) continue;
            node.classList.add('hasAnswer', 'finished', 'finish', 'active', 'answer', 'answerFinish');
            try {
                if (!node.style.backgroundColor) node.style.backgroundColor = '#0099ff';
                if (!node.style.color) node.style.color = '#ffffff';
            } catch {}
            break;
        }

        if (!opts.skipHidden) {
            const hidden = rootDoc.getElementById(`answer${qid}`);
            if (hidden && String(hidden.value || '').trim()) {
                try { hidden.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
                simulateEnterKey(hidden);
            }
        }

        const win = rootDoc.defaultView || window;
        ['dealAnswer', 'saveUserAnswer', 'saveWorkAnswer', 'changeCard', 'markAnswer'].forEach((name) => {
            try {
                if (typeof win[name] === 'function') win[name](qid, rootDoc.getElementById(`answer${qid}`));
            } catch {}
        });
    } catch {}
}

async function fillAnswer(answer, questionElement, type) {
    try {
        let filled = false;

        const questionId = questionElement.id;

        switch (type) {
            case 'blank':
            case 'cloze': {

                const answers = answer.split(/[,，;；、]\s*/).map(a => a.trim()).filter(a => a);

                const editorElements = questionElement.querySelectorAll('[id^="answerEditor"]');
                if (editorElements.length > 0) {

                    for (let index = 0; index < editorElements.length; index++) {
                        const editorElement = editorElements[index];
                        const editorId = editorElement.id;

                        if (index < answers.length) {
                            const currentAnswer = answers[index];
                            try {
                                const ok = await writeUeEditorContent(
                                    questionElement.ownerDocument || document,
                                    editorId,
                                    currentAnswer,
                                    questionElement
                                );
                                if (ok) filled = true;
                            } catch (e) {
                                addLog(`处理第${index + 1}个空时出错: ${e.message}`, 'error');
                            }
                        } else {
                            addLog(`警告：第${index + 1}个空没有对应的答案`, 'error');
                        }
                    }
                }


                if (!filled) {
                    const blankInputs = [
                        ...questionElement.querySelectorAll('input[type="text"]'),
                        ...questionElement.querySelectorAll('.blank'),
                        ...questionElement.querySelectorAll('.fill-blank'),
                        ...questionElement.querySelectorAll('[class*="blank"]'),
                        ...questionElement.querySelectorAll('[class*="fill"]'),
                        ...questionElement.querySelectorAll('textarea:not([id^="answerEditor"])')
                    ];

                    if (blankInputs.length > 0) {
                        blankInputs.forEach((input, index) => {
                            if (index < answers.length) {
                                try {
                                    setInputValueAndTrigger(input, answers[index]);
                                    filled = true;
                                } catch (e) {
                                    addLog(`填写第${index + 1}个空失败: ${e.message}`, 'error');
                                }
                            } else {
                                addLog(`警告：第${index + 1}个输入框没有对应的答案`, 'error');
                            }
                        });
                    }
                }
                break;
            }
            case 'short':
            case 'term':
            case 'essay':
            case 'writing':
            case 'calculation':
            case 'matching':
            case 'accounting': {
                const rootDoc = questionElement.ownerDocument || document;
                const ueAreas = questionElement.querySelectorAll('[id^="answerEditor"]');
                if (ueAreas.length > 0) {
                    for (const ta of ueAreas) {
                        const ok = await writeUeEditorContent(rootDoc, ta.id, answer, questionElement);
                        if (ok) filled = true;
                    }
                }

                if (!filled) {
                    const editorIframes = questionElement.querySelectorAll('iframe[id^="ueditor_"]');
                    editorIframes.forEach((ifr) => {
                        try {
                            const iframeDoc = ifr.contentDocument || ifr.contentWindow?.document;
                            const editorBody = iframeDoc && iframeDoc.body;
                            if (editorBody) {
                                editorBody.innerHTML = formatUeHtml(answer);
                                dispatchUeIframeBodySync(editorBody, answer);
                                filled = true;
                            }
                        } catch (e) {
                            addLog('iframe 备用回填失败: ' + e.message, 'warning');
                        }
                    });
                }

                if (!filled) {
                    const textInputs = [
                        ...questionElement.querySelectorAll('textarea:not([id^="answerEditor"])'),
                        ...questionElement.querySelectorAll('input[type="text"]'),
                        ...questionElement.querySelectorAll('.answer-area'),
                        ...questionElement.querySelectorAll('.writing-area'),
                        ...questionElement.querySelectorAll('div[contenteditable="true"]')
                    ].filter((el) => !isUeTextarea(el) && !el.closest('[id^="ueditor_"]'));

                    if (textInputs.length > 0) {
                        textInputs.forEach(input => {
                            try {
                                const tag = (input.tagName || '').toLowerCase();
                                if (tag === 'textarea' || tag === 'input') {
                                    setInputValueAndTrigger(input, answer);
                                } else if (input.getAttribute('contenteditable') === 'true') {
                                    input.innerHTML = answer;
                                    dispatchFieldEvents(input, { data: answer, skipFocus: true });
                                }
                                filled = true;
                            } catch (e) {
                                addLog(`填写答案失败: ${e.message}`, 'error');
                            }
                        });
                    }
                }
                break;
            }
            case 'single':
            case 'multiple':
            case 'judge': {
                let answerLetters;
                if (type === 'multiple') {
                    answerLetters = answer.toUpperCase().split(/[,，、\s]+/).map(l => l.trim());
                } else {
                    answerLetters = [answer.toUpperCase().trim()];
                }



                const qid = (questionElement.getAttribute('data') || questionElement.dataset?.qid || '').toString().trim();
                const optionBlocks = Array.from(questionElement.querySelectorAll('.stem_answer > div, .stem_answer .answerBg, ul.Zy_ulTop li, li[onclick][qid]'));

                for (const letter of answerLetters) {
                    if (!/^[A-Z]$/.test(letter)) {
                        addLog(`跳过无效的选项字母: ${letter}`, 'error');
                        continue;
                    }

                    let optionElement = null;

                    if (qid) {
                        const marker = questionElement.querySelector(`.choice${qid}[data="${letter}"], .choice${qid}.num_option[data="${letter}"], .choice${qid}.num_option_dx[data="${letter}"]`);
                        if (marker) optionElement = marker.closest('li, div.answerBg, div');
                    }

                    if (!optionElement) {
                        optionElement = optionBlocks.find(el => {
                            const aria = (el.getAttribute('aria-label') || '').trim();
                            const txt = (el.textContent || '').trim();
                            return new RegExp(`^${letter}[、\\.\\s]`).test(txt) || aria.startsWith(`${letter} `) || aria.startsWith(`${letter}、`);
                        }) || null;
                    }

                    if (!optionElement) {
                        const index = letter.charCodeAt(0) - 65;
                        if (index >= 0 && index < optionBlocks.length) optionElement = optionBlocks[index];
                    }

                    if (optionElement) {
                        try {
                            optionElement.click();

                            const input = optionElement.querySelector('input');
                            if (input) {
                                input.click();
                                input.checked = true;
                                input.dispatchEvent(new Event('change', { bubbles: true }));
                            }

                            const label = optionElement.querySelector('label');
                            if (label) {
                                label.click();
                            }

                            filled = true;
                        } catch (e) {
                            addLog(`点击选项 ${letter} 失败: ${e.message}`, 'error');
                        }
                    } else {
                        addLog(`未找到选项元素: ${letter}`, 'error');
                    }
                }
                break;
            }
            default:
                break;
        }

        if (filled) {
            addLog(`答案填写成功`, 'success');
            if (!questionElement.querySelector('[id^="answerEditor"]')) {
                tryMarkAnswerSheetAnswered(questionElement.ownerDocument || document, questionElement);
            }
        } else {
            addLog(`答案未能写入页面，请检查编辑器是否加载完成`, 'error');
        }


        try {
            const submitButtons = [
                ...questionElement.querySelectorAll('button[type="submit"]'),
                ...questionElement.querySelectorAll('input[type="submit"]'),
                ...questionElement.querySelectorAll('.submit-btn'),
                ...questionElement.querySelectorAll('.save-btn'),
                ...questionElement.querySelectorAll('[class*="submit"]'),
                ...questionElement.querySelectorAll('[class*="save"]')
            ];

            if (submitButtons.length > 0) {
                submitButtons[0].click();
            }
        } catch (e) {

        }

        return filled;
    } catch (error) {
        addLog(`答案填写失败: ${error.message}`, 'error');
        return false;
    }
}


function debugPageStructure() {


    const possibleContainers = QUESTION_CONTAINER_SELECTOR.split(',').map(s => s.trim());

    for (let selector of possibleContainers) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
        }
    }


    const allElements = document.querySelectorAll('*');
    const relevantElements = Array.from(allElements).filter(el => {
        const className = el.className || '';
        const id = el.id || '';
        return (className + id).toLowerCase().includes('question') ||
               (className + id).toLowerCase().includes('answer') ||
               (className + id).toLowerCase().includes('option') ||
               (className + id).toLowerCase().includes('subject');
    });

    relevantElements.forEach(el => {
    });


    const inputs = document.querySelectorAll('input[type="radio"], input[type="checkbox"], textarea');
    inputs.forEach(input => {
    });
}

function updateStatus(running) {
    const startButton = document.getElementById('start-answer');
    const pauseButton = document.getElementById('pause-answer');

    if (running) {
        startButton.style.display = 'none';
        pauseButton.style.display = 'flex';
    } else {
        startButton.style.display = 'flex';
        pauseButton.style.display = 'none';
    }
}


function hasQuestions() {
    if (getQuestionContainers(document).length > 0) return true;
    let found = false;
    forEachAllSameOriginDocs((doc) => {
        if (found) return;
        if (getQuestionContainers(doc).length > 0) found = true;
    });
    return found;
}


function showNoTaskToast() {
    const toast = document.createElement('div');
    toast.id = 'no-task-toast';
    toast.textContent = '该页面无任务';
    document.body.appendChild(toast);


    setTimeout(() => {
        if (toast && toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 3000);
}


function isQuestionAnswered(q) {
    try {

        if (q.querySelector('.newAnswerBx .myAnswer, .answerCon, .myAllAnswerBx, .answerScore, .CorrectOrNot')) {
            return true;
        }


        const choiceInputs = q.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        if (choiceInputs.length > 0) {
            return Array.from(choiceInputs).some(i => i.checked);
        }

        const textInputs = q.querySelectorAll('input[type="text"], textarea');
        if (textInputs.length > 0) {
            if (Array.from(textInputs).some(t => (t.value || '').trim().length > 0)) return true;
        }
        const editableDivs = q.querySelectorAll('[contenteditable="true"]');
        if (editableDivs.length > 0) {
            if (Array.from(editableDivs).some(d => (d.innerText || d.textContent || '').trim().length > 0)) return true;
        }

        const ueTextareas = q.querySelectorAll('[id^="answerEditor"]');
        for (const ta of ueTextareas) {
            const id = ta.id;
            try {
                if (typeof UE !== 'undefined' && UE.getEditor) {
                    const ed = UE.getEditor(id);
                    if (ed && ed.getContentTxt && ed.getContentTxt().trim().length > 0) return true;
                }
            } catch {}
            if ((ta.value || '').trim().length > 0) return true;
        }
        const ifr = q.querySelector('iframe[id^="ueditor_"]');
        if (ifr) {
            try {
                const doc = ifr.contentDocument || ifr.contentWindow.document;
                const txt = (doc && doc.body && (doc.body.innerText || doc.body.textContent)) || '';
                if (txt.trim().length > 0) return true;
            } catch {}
        }
    } catch {}
    return false;
}


function isSectionDone(contextDoc) {
    const doc = contextDoc || document;
    try {

        const videos = doc.querySelectorAll('video, .video-js video');
        for (const v of videos) {
            try {
                const d = v.duration || 0;
                const t = v.currentTime || 0;
                if (!(v.ended || (d > 0 && t / d >= 0.985))) {
                    return false;
                }
            } catch { return false; }
        }


        const questions = getQuestionContainers(doc);
        for (const q of questions) {
            if (!isQuestionAnswered(q)) {
                return false;
            }
        }


        return true;
    } catch { return false; }
}

async function ensureSectionCompletedAndAdvance(contextDoc) {
    if (!isStudyingChapters) return;
    try {
        const doc = contextDoc || document;
        await autoAnswerInDocument(doc);
        addLog('检测到当前小节已完成，准备跳转下一小节', 'success');
        scheduleSkipChapter(1000);
    } catch (e) {
        addLog(`完成度检测出错: ${e.message}`, 'error');
    }
}


async function autoAnswer() {
    if (isAnswering) {
        return;
    }

    const selectedEntries = getSelectedQuestionEntries();
    if (selectedEntries.length === 0) {
        addLog('请至少勾选一道题目后再开始答题', 'warn');
        return;
    }

    isAnswering = true;
    updateStatus(true);
    showAnswerProgress(true);

    const total = selectedEntries.length;
    let done = 0;
    setAnswerProgress(0, total, '准备答题 0/' + total);

    try {
        addLog('共选中 ' + total + ' 道题目', 'info');
        addLog('正在初始化，使用 ' + getActiveAiDisplayInfo().tag + ' · ' + getActiveAiDisplayInfo().model, 'info');

        const docsToWarm = new Set();
        selectedEntries.forEach((entry) => {
            try {
                const d = entry.doc || entry.element?.ownerDocument;
                if (d) docsToWarm.add(d);
            } catch {}
        });
        for (const d of docsToWarm) {
            addLog('正在预热编辑器...', 'info');
            await prewarmQuizEditors(d);
        }

        for (const entry of selectedEntries) {
            if (!isAnswering) {
                break;
            }

            const question = entry.element;
            if (!question || !question.isConnected) {
                addLog('题目元素已失效，跳过', 'warn');
                done++;
                setAnswerProgress(done, total, '已完成 ' + done + '/' + total);
                continue;
            }

            const questionInfo = resolveQuestionInfo(entry);
            if (!questionInfo || !questionInfo.question) {
                addLog('题目信息获取失败，跳过当前题目', 'error');
                done++;
                setAnswerProgress(done, total, '已完成 ' + done + '/' + total);
                continue;
            }

            setAnswerProgress(done, total, '正在答题 ' + (done + 1) + '/' + total);
            addLog(`正在处理题目(${questionInfo.type}): ${questionInfo.question.substring(0, 30)}...`);

            const answer = applyAnswerByAccuracy(questionInfo, await getAnswer(questionInfo, 0, { index: done + 1, total }));
            if (answer) {
                const filled = await fillAnswer(answer, question, questionInfo.type);
                if (filled) {
                    addLog('已填入答案: ' + answer.slice(0, 40) + (answer.length > 40 ? '...' : ''), 'success');
                } else {
                    addLog('AI 已生成答案，但未能写入编辑器，请手动粘贴', 'error');
                }
            }

            done++;
            setAnswerProgress(done, total, '已完成 ' + done + '/' + total);

            if (isAnswering) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    } catch (error) {
        addLog(`自动答题过程出错: ${error.message}`, 'error');
    } finally {
        isAnswering = false;
        updateStatus(false);
        showAnswerProgress(false);
        resetStreamDisplay();
        addLog('答题过程结束', 'success');
    }
}


function init(forceOpen) {
    if (!isMooc1PanelContext()) {
        try { console.warn('[路南云研习助手] 跳过：非面板上下文', location.href); } catch {}
        return;
    }
    if (!shouldMountPanelInThisFrame(!!forceOpen)) {
        destroyPanelAndStop();
        try { console.warn('[路南云研习助手] 跳过：子 iframe 由顶层统一挂载面板', location.href); } catch {}
        return;
    }
    try { console.info('[路南云研习助手] 开始初始化', location.href); } catch {}
    if (!claimOwnership(!!forceOpen)) {
        if (!forceOpen) {
            try { console.warn('[路南云研习助手] 跳过：未获得面板占用权'); } catch {}
            return;
        }
        forceClaimPanelOwnership(true);
    }
    beginPluginLoadSequence();
}

function hasDetectableTaskDeep() {
    return hasQuestions() || isLikelyTaskPage() || hasStudyContentDeep();
}

function mountPanelIfOwner() {
    if (!shouldMountPanelInThisFrame()) {
        destroyPanelAndStop();
        return false;
    }
    const existing = document.getElementById('answer-helper-panel');
    if (existing) {
        createdPanelEl = existing;
        return true;
    }
    if (createdPanelEl) return true;
    if (!claimOwnership()) return false;
    if (document.getElementById('answer-helper-panel')) {
        createdPanelEl = document.getElementById('answer-helper-panel');
        return true;
    }
    createdPanelEl = createPanel();
    enforceSinglePanelInDocument();
    bindPanelEvents();
    startHeartbeat();
    if (cxForceOpenSidebar) {
        cxForceOpenSidebar = false;
        toggleCxSidebar(true);
    }
    return true;
}

function retryWorkPagePanel() {
    if (!shouldMountPanelInThisFrame()) return;
    if (!isMooc1WorkPage(location.href)) return;
    try {
        claimOwnership();
        mountPanelIfOwner();
        if (createdPanelEl) runQuestionLoadSequence();
    } catch {}
}

function bootPanel() {
    try { localStorage.removeItem(PANEL_REG_KEY); } catch {}
    const forceReopen = consumePanelReopenFlag();
    if (forceReopen) cxForceOpenSidebar = true;
    const start = () => {
        init(forceReopen);
        if (isMooc1WorkPage(location.href) && shouldMountPanelInThisFrame(forceReopen)) {
            [500, 1500, 3000].forEach((ms) => setTimeout(retryWorkPagePanel, ms));
        }
        if (forceReopen) {
            [300, 800, 1500, 2500].forEach((ms) => setTimeout(() => {
                if (!shouldMountPanelInThisFrame(true)) return;
                if (document.getElementById('answer-helper-panel')) return;
                forceClaimPanelOwnership(true);
                mountPanelIfOwner();
                toggleCxSidebar(true);
                runQuestionLoadSequence();
            }, ms));
        }
    };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
    window.addEventListener('load', () => {
        if (isMooc1WorkPage(location.href) && shouldMountPanelInThisFrame()) {
            setTimeout(retryWorkPagePanel, 800);
        }
    }, { once: true });

    if (isMooc1WorkPage(location.href) && isTopWindow()) {
        [1200, 2500, 5000, 8000].forEach((ms) => setTimeout(() => {
            if (!shouldMountPanelInThisFrame()) return;
            if (document.getElementById('answer-helper-panel') || pluginLoadRunning) return;
            try { console.info('[路南云研习助手] dowork 补偿启动'); } catch {}
            forceClaimPanelOwnership(true);
            beginPluginLoadSequence();
        }, ms));
    }

    if (isNestedInFrame()) {
        setInterval(() => {
            if (!shouldMountPanelInThisFrame() && document.getElementById('answer-helper-panel')) {
                destroyPanelAndStop();
            }
            enforceSinglePanelInDocument();
        }, 1500);
    } else {
        setInterval(() => enforceSinglePanelInDocument(), 2000);
    }
}
bootPanel();


function isQuizPageDoc(doc) {
    try {
        if (doc.getElementById('form1') && doc.querySelector('#RightCon .newTestTitle')) return true;
        if (doc.querySelector('.newTestCon form#form1') && doc.querySelector('.ans-cc')) return true;
        if (doc.querySelector('#form1 input[id^="answertype"]')) return true;
        if (doc.querySelector('.TiMu, .singleQuesId, .Zy_TItle, ul.Zy_ulTop')) return true;
    } catch {}
    return false;
}


function collectQuizQuestions(doc) {
    const questions = [];
    try {

        const typeInputs = doc.querySelectorAll('input[id^="answertype"]');
        typeInputs.forEach((inp) => {
            try {
                const id = inp.id.replace('answertype', '');
                const qid = id.trim();
                const block = doc.querySelector(`.singleQuesId[data="${qid}"]`) || inp.closest('.TiMu') || doc;
                const typeVal = (inp.value || '').trim();
                let type = '';
                if (typeVal === '0') type = 'single';
                else if (typeVal === '1') type = 'multiple';
                else if (typeVal === '3') type = 'judge';
                else if (typeVal === '2') type = 'blank';
                else if (typeVal === '4') type = 'short';
                else {
                    const hasTextInput = block.querySelector('input[type="text"], textarea, [contenteditable="true"], [id^="answerEditor"], iframe[id^="ueditor_"]');
                    type = hasTextInput ? 'short' : 'text';
                }

                const opts = [];
                const lis = block.querySelectorAll(`ul.Zy_ulTop li[onclick][qid="${qid}"]`);
                lis.forEach((li, idx) => {
                    const span = li.querySelector('.num_option, .num_option_dx');
                    const letter = span?.getAttribute('data') || String.fromCharCode(65 + idx);
                    const txt = (li.querySelector('a.after')?.textContent || '').trim();
                    opts.push(`${letter}. ${txt}`);
                });

                let qtext = '';
                const label = block.querySelector('.Zy_TItle .fontLabel');
                if (label) qtext = label.textContent.replace(/\s+/g, ' ').trim();
                questions.push({ qid, type, question: qtext, options: opts });
            } catch {}
        });
    } catch {}
    return questions;
}


function getQuizDocUE(doc) {
    try {
        const win = (doc && doc.defaultView) || window;
        if (win && win.UE) return win.UE;
    } catch {}
    try {
        if (typeof UE !== 'undefined') return UE;
    } catch {}
    return null;
}

async function waitForQuizEditorInstance(doc, editorId, timeoutMs = 5000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        try {
            const UERef = getQuizDocUE(doc);
            if (UERef && typeof UERef.getEditor === 'function') {
                const editor = UERef.getEditor(editorId);
                if (editor) return editor;
            }
        } catch {}
        await new Promise(r => setTimeout(r, 120));
    }
    return null;
}

async function waitForUeEditorReady(editor, timeoutMs = 4000) {
    if (!editor) return false;
    try {
        if (editor.isReady) return true;
    } catch {}
    return await new Promise((resolve) => {
        let done = false;
        const finish = (ok) => {
            if (done) return;
            done = true;
            resolve(!!ok);
        };
        try {
            if (typeof editor.ready === 'function') {
                editor.ready(() => finish(true));
            }
        } catch {}
        setTimeout(() => {
            try {
                finish(!!editor.isReady);
            } catch {
                finish(false);
            }
        }, timeoutMs);
    });
}

async function prewarmQuizEditors(doc) {
    try {
        const areas = Array.from(doc.querySelectorAll('[id^="answerEditor"]'));
        if (!areas.length) return;
        for (let i = 0; i < areas.length; i++) {
            const area = areas[i];
            const editor = await waitForQuizEditorInstance(doc, area.id, 5000);
            if (!editor) {
                addLog(`编辑器未就绪：${area.id}`, 'warning');
                continue;
            }
            const ready = await waitForUeEditorReady(editor, 5000);
            if (!ready) {
                addLog(`编辑器初始化超时：${area.id}`, 'warning');
                continue;
            }
            if (i === 0) await new Promise(r => setTimeout(r, 150));
        }
        const body = doc.body;
        if (body && body.dataset.cxQuizEditorWarmDelayDone !== '1') {
            await new Promise(r => setTimeout(r, 3000));
            body.dataset.cxQuizEditorWarmDelayDone = '1';
        }
    } catch (e) {
        addLog(`预热章节测验编辑器失败: ${e.message}`, 'warning');
    }
}

async function setQuizEditorValue(doc, textareaEl, value) {
    const val = String(value || '').trim();
    if (!textareaEl || !val) return false;
    return writeUeEditorContent(doc, textareaEl.id, val, textareaEl.closest('.singleQuesId, .questionLi, .TiMu, .question'));
}

async function fillQuizAnswer(doc, qid, type, answer) {
    try {
        const block = doc.querySelector(`.singleQuesId[data="${qid}"]`) || doc;
        if (!block) return false;
        if (type === 'single' || type === 'multiple' || type === 'judge') {
            let letters = [];
            if (type === 'multiple') {
                letters = (answer || '').toUpperCase().split(/[,，、\s]+/).filter(Boolean);
            } else if (type === 'judge') {
                const val = String(answer || '').trim().toLowerCase();

                if (/^a$|对|true|正确/.test(val)) letters = ['A'];
                else if (/^b$|错|false|错误/.test(val)) letters = ['B'];
                else if (/^t$/.test(val)) letters = ['A'];
                else if (/^f$/.test(val)) letters = ['B'];
                else letters = [(val.match(/[ab]/i) || ['A'])[0].toUpperCase()];
            } else {
                const m = String(answer || '').toUpperCase().match(/[A-Z]/g);
                letters = m ? m : [];
            }

            const ul = block.querySelector('ul.Zy_ulTop');
            if (!ul) return false;


            letters.forEach((L) => {
                let target = null;
                if (type === 'judge') {

                    const dataVal = (L === 'A') ? 'true' : 'false';
                    target = ul.querySelector(`li .num_option[data='${dataVal}'], li .num_option_dx[data='${dataVal}']`)
                          || ul.querySelector(`li .num_option[data='${L}'], li .num_option_dx[data='${L}']`);
                } else {
                    target = ul.querySelector(`li .num_option[data='${L}'], li .num_option_dx[data='${L}']`);
                }
                if (target) {
                    const li = target.closest('li');
                    safeClick(li);
                }
            });


            const hidden = doc.getElementById(`answer${qid}`);
            if (hidden) {
                const want = (type === 'judge')
                    ? (letters[0] === 'A' ? 'true' : 'false')
                    : letters.join('');

                if (!hidden.value || (type !== 'multiple' && hidden.value.toLowerCase() !== want)) {
                    hidden.value = want;

                    const spans = ul.querySelectorAll(`.choice${qid}`);
                    spans.forEach(s => s.classList.remove('check_answer', 'check_answer_dx'));
                    letters.forEach((L) => {
                        let sel = null;
                        if (type === 'judge') {
                            const dv = (L === 'A') ? 'true' : 'false';
                            sel = ul.querySelector(`.choice${qid}[data='${dv}']`) || ul.querySelector(`.choice${qid}[data='${L}']`);
                        } else {
                            sel = ul.querySelector(`.choice${qid}[data='${L}']`);
                        }
                        if (sel) {
                            const isMulti = !!ul.querySelector('.num_option_dx');
                            sel.classList.add(isMulti ? 'check_answer_dx' : 'check_answer');
                            const li = sel.closest('li');
                            if (li) {
                                li.setAttribute('aria-checked', 'true');
                                li.setAttribute('aria-pressed', 'true');
                            }
                        }
                    });
                }
            }
            tryMarkAnswerSheetAnswered(doc, block);
            return true;
        }
        else if (type === 'blank') {

            const answers = String(answer || '').split(/[,，;；、]\s*/).map(s => s.trim()).filter(Boolean);

            const ueAreas = Array.from(block.querySelectorAll('[id^="answerEditor"]'));
            for (let i = 0; i < ueAreas.length; i++) {
                const ta = ueAreas[i];
                const val = answers[i] || '';
                if (!val) continue;
                await setQuizEditorValue(doc, ta, val);
                if (i === 0) await new Promise(r => setTimeout(r, 120));
            }

            const inputs = [
                ...block.querySelectorAll('input[type="text"]'),
                ...block.querySelectorAll('textarea:not([id^="answerEditor"])')
            ];
            inputs.forEach((el, i) => {
                const val = answers[i] || '';
                if (!val) return;
                try {
                    const tag = (el.tagName || '').toLowerCase();
                    if (tag === 'input' || tag === 'textarea') {
                        setInputValueAndTrigger(el, val);
                    }
                } catch {}
            });

            if (!ueAreas.length) {
                const hidden = doc.getElementById(`answer${qid}`);
                if (hidden) {
                    hidden.value = answers.join(' ');
                    try { hidden.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
                    simulateEnterKey(hidden);
                }
                tryMarkAnswerSheetAnswered(doc, block, { skipHidden: true });
            }
            return true;
        }
        else if (type === 'text' || type === 'short' || type === 'essay' || type === 'writing') {

            const val = String(answer || '').trim();
            if (!val) return false;

            const ueAreas = Array.from(block.querySelectorAll('[id^="answerEditor"]'));
            for (let i = 0; i < ueAreas.length; i++) {
                const ta = ueAreas[i];
                await setQuizEditorValue(doc, ta, val);
                if (i === 0) await new Promise(r => setTimeout(r, 120));
            }

            if (!ueAreas.length) {
                const inputs = [
                    ...block.querySelectorAll('textarea:not([id^="answerEditor"])'),
                    ...block.querySelectorAll('input[type="text"]')
                ];
                inputs.forEach((el) => {
                    try {
                        const tag = (el.tagName || '').toLowerCase();
                        if (tag === 'input' || tag === 'textarea') {
                            setInputValueAndTrigger(el, val);
                        }
                    } catch {}
                });

                const hidden = doc.getElementById(`answer${qid}`);
                if (hidden) {
                    hidden.value = val;
                    try { hidden.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
                    simulateEnterKey(hidden);
                }
                tryMarkAnswerSheetAnswered(doc, block, { skipHidden: true });
            }
            return true;
        }
        return false;
    } catch { return false; }
}


function findAndClickQuizSubmitButton(doc) {
    try {
        const targetWindow = doc.defaultView || window;


        const chaoxingSubmitMethods = [

            () => {
                if (typeof targetWindow.btnBlueSubmit === 'function') {
                    targetWindow.btnBlueSubmit();
                    return true;
                }
                return false;
            },

            () => {
                if (typeof targetWindow.submitCheckTimes === 'function') {
                    targetWindow.submitCheckTimes();
                    return true;
                }
                return false;
            },

            () => {
                if (typeof targetWindow.submitWork === 'function') {
                    targetWindow.submitWork();
                    return true;
                }
                return false;
            },

            () => {
                const forms = doc.querySelectorAll('form');
                for (const form of forms) {
                    const formAction = form.action || '';
                    if (formAction.includes('work') || formAction.includes('quiz') || formAction.includes('submit')) {
                        try {
                            form.submit();
                            return true;
                        } catch (e) {
                            addLog(`提交失败: ${e.message}`, 'error');
                        }
                    }
                }
                return false;
            }
        ];


        for (const method of chaoxingSubmitMethods) {
            try {
                if (method()) return true;
            } catch (e) {
                addLog(`提交失败: ${e.message}`, 'error');
            }
        }


        const submitSelectors = [
            'input[type="submit"][value*="提交"]',
            'button[type="submit"]',
            'input[value="提交答案"]',
            'input[value="提交"]',
            'button[onclick*="submit"]',
            'button[onclick*="btnBlueSubmit"]',
            'button[onclick*="submitCheckTimes"]',
            '.submit-btn',
            '.btn-submit',
            '#submit',
            '.submit',
            'input[id*="submit"]',
            'button[id*="submit"]',
            'a[onclick*="submit"]',
            'input[onclick*="tijiao"]',
            'button[onclick*="tijiao"]'
        ];

        for (const selector of submitSelectors) {
            const submitBtn = doc.querySelector(selector);
            if (submitBtn && !submitBtn.disabled && !submitBtn.classList.contains('disabled')) {
                try {

                    const onclick = submitBtn.getAttribute('onclick');
                    if (onclick) {
                        try {

                            const func = new targetWindow.Function(onclick);
                            func.call(submitBtn);
                            return true;
                        } catch (e) {
                            addLog(`提交失败: ${e.message}`, 'error');
                        }
                    }


                    if (safeClick(submitBtn)) {
                        return true;
                    }
                } catch (e) {
                    addLog(`提交失败: ${e.message}`, 'error');
                }
            }
        }


        const clickableElements = Array.from(doc.querySelectorAll('input, button, a, span, div'));
        for (const el of clickableElements) {
            const text = (el.textContent || el.value || '').trim();
            if (/^(提交|提交答案|完成|确认提交)$/.test(text)) {
                try {
                    const onclick = el.getAttribute('onclick');
                    if (onclick) {
                        try {
                            const func = new targetWindow.Function(onclick);
                            func.call(el);
                            return true;
                        } catch (e) {
                            addLog(`提交失败: ${e.message}`, 'error');
                        }
                    }

                    if (safeClick(el)) {
                        return true;
                    }
                } catch (e) {
                    addLog(`提交失败: ${e.message}`, 'error');
                }
            }
        }

        addLog('未找到章节测验提交按钮', 'error');
        return false;
    } catch (e) {
        addLog(`查找提交按钮失败: ${e.message}`, 'error');
        return false;
    }
}


function validateAndFixSubmitParams(doc) {
    try {
        const targetWindow = doc.defaultView || window;


        if (typeof targetWindow.workRelationId === 'undefined') {

            const workIdInputs = doc.querySelectorAll('input[name*="workRelationId"], input[id*="workRelationId"]');
            if (workIdInputs.length > 0) {
                targetWindow.workRelationId = workIdInputs[0].value;
            }
        }


        if (typeof targetWindow.courseId === 'undefined') {
            const courseIdInputs = doc.querySelectorAll('input[name*="courseId"], input[id*="courseId"]');
            if (courseIdInputs.length > 0) {
                targetWindow.courseId = courseIdInputs[0].value;
            }
        }


        if (typeof targetWindow.classId === 'undefined') {
            const classIdInputs = doc.querySelectorAll('input[name*="classId"], input[id*="classId"]');
            if (classIdInputs.length > 0) {
                targetWindow.classId = classIdInputs[0].value;
            }
        }


        const questions = doc.querySelectorAll('[class*="TiMu"], [class*="timu"]');
        questions.forEach((q, index) => {
            const qid = q.getAttribute('id') || `question_${index}`;
            let answerInput = doc.querySelector(`input[name="answer${qid}"], input[id="answer${qid}"]`);

            if (!answerInput) {

                answerInput = doc.createElement('input');
                answerInput.type = 'hidden';
                answerInput.name = `answer${qid}`;
                answerInput.id = `answer${qid}`;
                q.appendChild(answerInput);
            }
        });

        addLog('提交参数验证完成', 'info');
        return true;
    } catch (e) { addLog(`提交参数检查失败: ${e.message}`, 'error'); return false; }
}


async function handleSubmitConfirmDialog(doc, timeoutMs = 3000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        try {

            const confirmDialogSelectors = [
                '.popDiv', '.modal', '.dialog', '.alert',
                '.layui-layer', '.confirm-dialog', '.submit-confirm',
                '[class*="confirm"]', '[class*="dialog"]', '[class*="modal"]'
            ];

            for (const selector of confirmDialogSelectors) {
                const dialog = doc.querySelector(selector);
                if (dialog && dialog.style.display !== 'none' &&
                    (dialog.textContent.includes('确认提交') ||
                     dialog.textContent.includes('提交') ||
                     dialog.textContent.includes('确定'))) {

                    const confirmButtonSelectors = [
                        'button[onclick*="submit"]', 'button[value*="提交"]',
                        'button[value*="确定"]', 'button[value*="确认"]',
                        'input[type="button"][value*="提交"]',
                        'input[type="button"][value*="确定"]',
                        'input[type="button"][value*="确认"]',
                        '.confirm-btn', '.submit-btn', '.ok-btn',
                        'button:contains("提交")', 'button:contains("确定")',
                        'button:contains("确认")', 'a[onclick*="submit"]'
                    ];


                    for (const btnSelector of confirmButtonSelectors) {
                        const confirmBtn = dialog.querySelector(btnSelector) ||
                                         doc.querySelector(`${selector} ${btnSelector}`);

                        if (confirmBtn && !confirmBtn.disabled) {
                            try {

                                const onclick = confirmBtn.getAttribute('onclick');
                                if (onclick) {
                                    const targetWindow = doc.defaultView || window;
                                    const func = new targetWindow.Function(onclick);
                                    func.call(confirmBtn);
                                    return true;
                                }


                                if (safeClick(confirmBtn)) {
                                    return true;
                                }
                            } catch (e) {
                                addLog(`确认提交失败: ${e.message}`, 'error');
                            }
                        }
                    }


                    const allButtons = dialog.querySelectorAll('button, input[type="button"], a');
                    for (const btn of allButtons) {
                        const text = (btn.textContent || btn.value || '').trim();
                        if (/^(提交|确定|确认|OK)$/.test(text)) {
                            try {
                                if (safeClick(btn)) {
                                    return true;
                                }
                            } catch (e) {
                                addLog(`确认提交失败: ${e.message}`, 'error');
                            }
                        }
                    }
                }
            }
        } catch (e) {

        }

        await new Promise(r => setTimeout(r, 200));
    }

    return false;
}


async function waitForQuizSubmitCompletion(doc, timeoutMs = 5000) {
    const startTime = Date.now();
    const originalUrl = doc.location.href;

    while (Date.now() - startTime < timeoutMs) {
        try {

            const successIndicators = [
                '.success', '.alert-success', '.msg-success',
                '[class*="success"]', '[class*="complete"]',
                '*[text()*="提交成功"]', '*[text()*="完成"]'
            ];

            for (const selector of successIndicators) {
                const indicator = doc.querySelector(selector);
                if (indicator && indicator.textContent.includes('成功')) {
                    return true;
                }
            }


            if (doc.location.href !== originalUrl) {
                return true;
            }


            const nextStepSelectors = [
                'button[onclick*="next"]', 'a[onclick*="next"]',
                'input[value*="下一"]', 'button[value*="下一"]',
                '.next-btn', '.btn-next', '#next'
            ];

            for (const selector of nextStepSelectors) {
                if (doc.querySelector(selector)) {
                    return true;
                }
            }

        } catch (e) {

        }

        await new Promise(r => setTimeout(r, 200));
    }

    addLog('章节测验提交等待超时', 'error');
    return false;
}


async function autoAnswerQuizInDocument(doc) {
    try {
        if (!isStudyingChapters) return false;
        if (!isQuizPageDoc(doc)) return false;
        if (isQuizEffectivelyCompletedDoc(doc)) {
            markChapterQuizHandledForCurrentSection();
            return true;
        }

        await injectConsoleDecryptCode(doc);
        await prewarmQuizEditors(doc);
        const qs = collectQuizQuestions(doc);
        if (!qs || qs.length === 0) {
            if (isQuizEffectivelyCompletedDoc(doc)) {
                markChapterQuizHandledForCurrentSection();
                return true;
            }
            return false;
        }
        addLog('正在自动完成章节测验...', 'info');


        for (const q of qs) {
            if (!isStudyingChapters) return false;
            const promptInfo = { type: q.type, question: q.question || `题目 ${q.qid}`, options: q.options || [] };
            const ans = applyAnswerByAccuracy(promptInfo, await getAnswer(promptInfo));
            if (ans) {
                await fillQuizAnswer(doc, q.qid, q.type, ans);
            }
            await new Promise(r => setTimeout(r, 500));
        }

        addLog('章节测验答题完成，正在提交...', 'success');


        await new Promise(r => setTimeout(r, 1000));


        validateAndFixSubmitParams(doc);


        let submitSuccess = false;
        const targetWindow = doc.defaultView || window;


        try {

            const originalAlert = targetWindow.alert;
            targetWindow.alert = function(msg) {
                if (msg && msg.includes('code-1')) {
                    return;
                }
                return originalAlert.call(this, msg);
            };


            if (typeof targetWindow.btnBlueSubmit === 'function') {
                targetWindow.btnBlueSubmit();
                await new Promise(r => setTimeout(r, 1000));


                if (typeof targetWindow.submitCheckTimes === 'function') {
                    targetWindow.submitCheckTimes();
                }


                if (typeof targetWindow.noSubmit === 'function') {}

                submitSuccess = true;
            } else if (typeof targetWindow.submitWork === 'function') {
                targetWindow.submitWork();
                submitSuccess = true;
            } else {

                submitSuccess = findAndClickQuizSubmitButton(doc);
            }


        } catch (e) {
            addLog(`提交流程执行失败: ${e.message}`, 'error');

            submitSuccess = findAndClickQuizSubmitButton(doc);
        }

        if (submitSuccess) {
            await new Promise(r => setTimeout(r, 500));


            const confirmHandled = await handleSubmitConfirmDialog(doc, 3000);
            if (confirmHandled) {}

            const submitCompleted = await waitForQuizSubmitCompletion(doc, 8000);
            if (submitCompleted) {
                addLog('章节测验提交完成，准备跳转下一节...', 'success');
                markChapterQuizHandledForCurrentSection();


                await new Promise(r => setTimeout(r, 2000));


                if (isStudyingChapters) {
                    addLog('章节测验提交完成，准备跳转下一节', 'success');
                    scheduleSkipChapter(2000);
                }
            } else {
                markChapterQuizHandledForCurrentSection();

                await new Promise(r => setTimeout(r, 1500));
                if (isStudyingChapters) {
                    addLog('章节测验已提交，准备跳转', 'info');
                    scheduleSkipChapter(1500);
                }
            }
        } else {
            markChapterQuizHandledForCurrentSection();

            await new Promise(r => setTimeout(r, 1000));
            if (isStudyingChapters) {
                addLog('章节测验处理完成，准备跳转', 'info');
                scheduleSkipChapter(1500);
            }
        }

        return true;
    } catch (e) {

        return false;
    }
}
})();

// ==================== 路南云 API 专刷 — 独立刷课页 + 课程弹窗 ====================
(function CXApiBrushPageModule() {
'use strict';
const BRUSH_PAGE_URL = 'https://i.chaoxing.com/base/settings';
const href = location.href;
let host = '';
try { host = new URL(href).hostname; } catch { return; }

const isBrushHost = host === 'i.chaoxing.com' || host === 'mooc2-ans.chaoxing.com';
if (!isBrushHost) return;

const isBrushPage = href.includes('base/settings');
const isCourseStu = host === 'mooc2-ans.chaoxing.com' && href.includes('/mycourse/stu?');
const isIHome = host === 'i.chaoxing.com' && !isBrushPage;

if (!isBrushPage && !isCourseStu && !isIHome) return;

unsafeWindow.__cxOpenBrushPage = function (url) {
    window.open(url || BRUSH_PAGE_URL, '_blank');
};

if (isIHome) {
    initHomeBrushPopup();
    return;
}

let $ = null;

function getBrush$() {
    return (typeof unsafeWindow !== 'undefined' && unsafeWindow.$) ? unsafeWindow.$
        : (typeof unsafeWindow !== 'undefined' && unsafeWindow.jQuery) ? unsafeWindow.jQuery
        : (typeof jQuery !== 'undefined' ? jQuery : null);
}

function loadExternalScript(url) {
    return new Promise((resolve, reject) => {
        if (document.querySelector('script[data-cx-brush-src="' + url + '"]')) { resolve(); return; }
        const s = document.createElement('script');
        s.src = url;
        s.dataset.cxBrushSrc = url;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('脚本加载失败: ' + url));
        (document.head || document.documentElement).appendChild(s);
    });
}

function hasBrushMd5() {
    return (typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.md5 === 'function')
        || (typeof md5 === 'function');
}

async function ensureBrushDeps() {
    if (!getBrush$()) {
        await loadExternalScript('https://lib.baomitu.com/jquery/3.6.0/jquery.min.js');
    }
    if (!hasBrushMd5()) {
        await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/blueimp-md5/2.19.0/js/md5.min.js');
    }
    $ = getBrush$();
    return $ && hasBrushMd5();
}

async function startBrushModuleWhenReady() {
    try {
        if (!(await ensureBrushDeps())) return;
        if (isBrushPage) initBrushPage();
        else if (isCourseStu) initCoursePopup();
    } catch (e) {
        try { console.warn('[路南云研习助手] 刷课模块依赖加载失败', e); } catch {}
    }
}

startBrushModuleWhenReady();

let courseList = [];
let uid = '';
let apiRunning = false;
let layui, layer, form;
const ua_str = (() => {
    const chars = 'qwertyuioplkjhgfdsazxcvbnm1234567890';
    let s = '';
    for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
})();

function getEl(id) { return document.getElementById(id); }
function getPattern() { return getEl('cx-brush-pattern')?.value || '1'; }
function getBeisu() { return parseInt(getEl('cx-brush-beisu')?.value || '1', 10) || 1; }

function pageLog(text, type) {
    const log = getEl('cx-brush-log');
    if (!log) return;
    while (log.children.length > 14) log.removeChild(log.firstChild);
    const line = document.createElement('div');
    line.textContent = new Date().toLocaleString() + '  ' + text;
    if (type === 'err' || type === 'error') line.style.color = '#dc2626';
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

function setProgress(pct) {
    const wrap = getEl('cx-brush-progress-wrap');
    const bar = getEl('cx-brush-progress-bar');
    const txt = getEl('cx-brush-progress-text');
    if (wrap) wrap.style.display = 'block';
    const p = Math.max(0, Math.min(100, ~~pct));
    if (bar) bar.style.width = p + '%';
    if (txt) txt.textContent = p + '%';
}

function requests(url, data, type) {
    type = type || 'get';
    return new Promise((resolve) => {
        GM_xmlhttpRequest({
            method: type,
            url: url,
            data: data || '',
            headers: {
                'User-Agent': 'User-Agent: Dalvik/2.1.0 (Linux; U; Android 11) com.chaoxing.mobile/ChaoXingStudy_3_5.1.4_android_phone_614_74 (@Kalimdor)_' + ua_str,
                'X-Requested-With': 'XMLHttpRequest',
                'Sec-Fetch-Site': 'same-origin',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                host: 'mooc1-1.chaoxing.com'
            },
            onload(xhr) {
                try {
                    const obj = $.parseJSON(xhr.responseText) || {};
                    if (obj.error && layer) {
                        layer.msg('请使用电脑浏览器完成验证码');
                        layer.open({
                            type: 0,
                            title: '验证码',
                            area: ['420px', '240px'],
                            content: '<img src="' + obj.verify_png_path + '"/><br/><input type="text" class="cx-code-input" placeholder="4位验证码"/><button type="button" id="cx-brush-code-btn">验证</button>'
                        });
                        $('#cx-brush-code-btn').on('click', function () {
                            const code = $('.cx-code-input').val();
                            if (code && code.length === 4) window.open(obj.verify_path + '&ucode=' + code);
                        });
                    }
                    resolve(obj);
                } catch (e) {
                    resolve(xhr.responseText);
                }
            },
            onerror() { resolve({}); }
        });
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cxMd5(str) {
    if (typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.md5 === 'function') return unsafeWindow.md5(str);
    if (typeof md5 === 'function') return md5(str);
    throw new Error('md5 未加载');
}

function get_enc(clazzid, jobid, objectId, playingTime, duration) {
    const str = '[' + clazzid + '][' + uid + '][' + jobid + '][' + objectId + '][' + (playingTime * 1000) + '][d_yHJ!$pdA~5][' + (duration * 1000) + '][0_' + duration + ']';
    return cxMd5(str);
}

async function video_p(clazzid, jobid, objectId, playingTime, duration, cpi, dtoken, otherInfo, rt, module) {
    const enc = get_enc(clazzid, jobid, objectId, playingTime, duration);
    const dtype = (module || '').includes('audio') ? 'Audio' : 'Video';
    const url = 'https://mooc1-api.chaoxing.com/multimedia/log/a/' + cpi + '/' + dtoken +
        '?otherInfo=' + otherInfo + '&playingTime=' + playingTime + '&duration=' + duration +
        '&akid=null&jobid=' + jobid + '&clipTime=0_' + duration + '&clazzId=' + clazzid +
        '&objectId=' + objectId + '&userid=' + uid + '&isdrag=4&enc=' + enc + '&rt=' + (rt || '0.9') +
        '&dtype=' + dtype + '&view=json';
    const obj = await requests(url);
    if (obj.isPassed === undefined) pageLog('视频进度保存失败', 'err');
    return obj.isPassed;
}

async function video_s(objectId, cpi, clazzid, jobid, otherInfo, rt, module) {
    const obj = await requests('https://mooc1-1.chaoxing.com/ananas/status/' + objectId + '?k=&flag=normal&');
    const duration = obj.duration;
    const dtoken = obj.dtoken;
    if (!duration) { pageLog('无法获取视频时长', 'err'); return; }

    let num = 0;
    for (let playingTime = 0; playingTime <= duration; playingTime += getBeisu()) {
        setProgress((playingTime / duration) * 100);
        pageLog('刷视频中 ' + playingTime + ' / ' + duration + ' 秒');
        await sleep(1000);
        const beisu = getBeisu();
        if (num % ~~(60 / beisu) === 0) {
            pageLog('提交进度…');
            const passed = await video_p(clazzid, jobid, objectId, playingTime, duration, cpi, dtoken, otherInfo, rt, module);
            if (passed && getPattern() !== '2') break;
        }
        num++;
    }
    let passed = await video_p(clazzid, jobid, objectId, duration, duration, cpi, dtoken, otherInfo, rt, module);
    while (!passed && getPattern() !== '2') {
        await sleep(1000);
        passed = await video_p(clazzid, jobid, objectId, duration, duration, cpi, dtoken, otherInfo, rt, module);
    }
    if (passed) pageLog('当前视频已完成', 'succ');
    const pw = getEl('cx-brush-progress-wrap');
    if (pw) pw.style.display = 'none';
}

async function document_s(jobid, knowledgeId, courseid, clazzid, jtoken) {
    const url = 'https://mooc1-2.chaoxing.com/ananas/job/document?jobid=' + jobid + '&knowledgeid=' + knowledgeId +
        '&courseid=' + courseid + '&clazzid=' + clazzid + '&jtoken=' + jtoken + '&_dc=' + Date.now();
    const obj = await requests(url);
    pageLog('文档: ' + (obj.msg || ''), obj.status ? 'succ' : 'err');
}

async function log_s(courseid, clazzid, cpi) {
    let obj = await requests('https://mooc1-2.chaoxing.com/visit/stucoursemiddle?courseid=' + courseid + '&clazzid=' + clazzid + '&vc=1&cpi=' + cpi);
    if (typeof obj === 'string' && obj.includes('/log/setlog')) {
        obj = await requests('https://fystat-ans.chaoxing.com/log/setlog' + obj.split('/log/setlog')[1].split('">')[0]);
        if (obj === "'success'") pageLog('已记录学习次数', 'succ');
    }
}

async function know_start(courseStartData) {
    for (const courseData of courseStartData) {
        pageLog('正在获取【' + courseData[0] + '】任务点');
        const gasUrl = 'https://mooc1-api.chaoxing.com/gas/clazz?id=' + courseData[2] + '&personid=' + courseData[3] +
            '&fields=id,bbsid,classscore,isstart,allowdownload,chatid,name,state,isthirdaq,isfiled,information,discuss,visiblescore,begindate,coursesetting.fields(id,courseid,hiddencoursecover,hiddenwrongset,coursefacecheck),course.fields(id,name,infocontent,objectid,app,bulletformat,mappingcourseid,imageurl,teacherfactor,jobcount,expandreadstate,knowledge.fields(id,name,indexOrder,parentnodeid,status,layer,label,jobcount,begintime,endtime,attachment.fields(id,type,objectid,extension).type(video)))&view=json';
        let obj = await requests(gasUrl);
        const courseKnowData = {};
        const knowlist = obj.data[0].course.data[0].knowledge.data.filter(function (value) {
            if (value.parentnodeid === 0) courseKnowData[value.id] = [];
            else {
                if (!courseKnowData[value.parentnodeid]) courseKnowData[value.parentnodeid] = [];
                courseKnowData[value.parentnodeid].push(value);
            }
            return true;
        });
        const knowlistId = [];
        for (const keys in courseKnowData) {
            for (const ids in courseKnowData[keys]) knowlistId.push(courseKnowData[keys][ids].id);
        }
        const data = 'courseid=' + courseData[1] + '&clazzid=' + courseData[2] + '&cpi=' + courseData[3] +
            '&nodes=' + knowlistId.join(',') + '&time=' + Date.now() + '&userid=' + uid + '&view=json';
        pageLog(getPattern() === '2' ? '补时长模式' : '筛选未完成任务点…');
        obj = await requests('https://mooc1-api.chaoxing.com/job/myjobsnodesmap', data, 'post');
        const unfinishlists = knowlist.filter(v =>
            (v.jobcount !== 0 && obj[v.id] && obj[v.id].unfinishcount !== 0) || getPattern() === '2'
        ).map(v => v.id);

        for (const val of knowlistId) {
            if (!unfinishlists.includes(val)) continue;
            const kUrl = 'https://mooc1-api.chaoxing.com/gas/knowledge?id=' + val + '&courseid=' + courseData[1] +
                '&fields=id,parentnodeid,indexorder,label,layer,name,begintime,createtime,lastmodifytime,status,jobUnfinishedCount,clickcount,openlock,card.fields(id,knowledgeid,title,knowledgeTitile,description,cardorder).contentcard(all)&view=json';
            obj = await requests(kUrl);
            await sleep(1000);
            const cardData = obj.data[0].card.data.map(value => {
                try {
                    return [value.cardorder, value.knowledgeid, $(value.description).find('iframe').attr('module')];
                } catch (e) { return []; }
            });
            await log_s(courseData[1], courseData[2], courseData[3]);
            for (const cardData1 of cardData) {
                const text = await requests('https://mooc1-api.chaoxing.com/knowledge/cards?clazzid=' + courseData[2] + '&courseid=' + courseData[1] +
                    '&knowledgeid=' + cardData1[1] + '&num=' + cardData1[0] + '&isPhone=0&control=true&cpi=' + courseData[3]);
                await sleep(1000);
                let result_json;
                try {
                    result_json = $.parseJSON('{' + text.split('mArg = {')[1].split('};')[0] + '}').attachments;
                } catch (e) {
                    pageLog('章节未开放', 'err');
                    break;
                }
                for (const val1 of result_json) {
                    if (val1.type === 'video') {
                        pageLog('视频: ' + val1.property.name);
                        await video_s(val1.objectId, courseData[3], courseData[2], val1.jobid, val1.otherInfo, val1.property.rt || '0.9', val1.property.module);
                    } else if (val1.type === 'document') {
                        pageLog('文档: ' + val1.property.name);
                        await document_s(val1.jobid || val1.property._jobid, cardData1[1], courseData[1], courseData[2], val1.jtoken);
                    } else if (val1.type === 'workid') {
                        pageLog('章节测验请在学习页用助手完成', 'err');
                    }
                }
            }
        }
    }
    pageLog('全部任务处理完成', 'succ');
    apiRunning = false;
    const btn = getEl('cx-brush-start');
    if (btn) { btn.disabled = false; btn.textContent = '开始刷课'; }
}

async function loadCourses() {
    const sel = getEl('cx-brush-course');
    if (!sel) return;
    try { uid = (document.cookie.match(/UID=([^;]+)/) || [])[1]; } catch (e) {}
    if (!uid) { pageLog('请先登录学习通', 'err'); return; }
    const obj = await requests('https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&mcode=');
    sel.innerHTML = '<option value="0">全部课程</option>';
    courseList = (obj.channelList || []).map(value => {
        if (value.content && value.content.course) {
            const c = value.content.course.data[0];
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            sel.appendChild(opt);
            return [c.name, c.id, value.key, value.cpi];
        }
        return [0, 0, 0, 0];
    });
    if (form) form.render('select');
    pageLog('已加载 ' + courseList.filter(c => c[0]).length + ' 门课程', 'succ');
}

async function startBrush() {
    if (apiRunning) return;
    if (!courseList.length) await loadCourses();
    const val = getEl('cx-brush-course')?.value || '0';
    const data = courseList.filter(v => v[0] && (v[1].toString() === val || val === '0'));
    if (!data.length) { pageLog('没有可刷课程', 'err'); return; }
    apiRunning = true;
    const btn = getEl('cx-brush-start');
    if (btn) { btn.disabled = true; btn.textContent = '刷课中…'; }
    try { await know_start(data); } catch (e) {
        pageLog('刷课出错: ' + (e.message || e), 'err');
        apiRunning = false;
        if (btn) { btn.disabled = false; btn.textContent = '开始刷课'; }
    }
}

function buildBrushPage() {
    document.body.innerHTML = `
<div class="cx-brush-page">
<div class="cx-brush-card">
<h1>路南云 · API 专刷视频</h1>
<p class="cx-brush-desc">批量刷视频/文档。章节测验请返回 mooc1 学习页使用研习助手。</p>
<form class="layui-form" id="cx-brush-form">
  <div class="layui-form-item"><label class="layui-form-label">模式</label><div class="layui-input-block"><select id="cx-brush-pattern"><option value="1">正常模式</option><option value="2">补时长</option></select></div></div>
  <div class="layui-form-item"><label class="layui-form-label">倍速</label><div class="layui-input-block"><select id="cx-brush-beisu"><option value="1">1倍速</option><option value="2">2倍速</option><option value="4">4倍速</option></select></div></div>
  <div class="layui-form-item"><label class="layui-form-label">课程</label><div class="layui-input-block"><select id="cx-brush-course"><option value="0">全部课程</option></select></div></div>
  <div class="layui-form-item"><div class="layui-input-block"><button type="button" id="cx-brush-start" class="layui-btn layui-btn-danger">开始刷课</button></div></div>
</form>
<div id="cx-brush-progress-wrap" style="display:none;margin:14px 0;"><div style="height:4px;background:#e8e8ea;border-radius:2px;overflow:hidden;"><div id="cx-brush-progress-bar" style="height:100%;width:0;background:#18181b;border-radius:2px;transition:width 240ms ease;"></div></div><span id="cx-brush-progress-text" style="display:block;margin-top:6px;font-size:11px;color:#9a9aa2;">0%</span></div>
<div id="cx-brush-log" class="cx-brush-log"></div>
</div>
</div>`;
    if (!document.getElementById('cx-brush-style')) {
        const st = document.createElement('style');
        st.id = 'cx-brush-style';
        st.textContent = [
            '.cx-brush-page{min-height:100vh;margin:0;padding:56px 16px;box-sizing:border-box;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Microsoft YaHei","Segoe UI",Roboto,Arial,sans-serif;color:#18181b;-webkit-font-smoothing:antialiased}',
            '.cx-brush-card{max-width:520px;margin:0 auto;padding:28px;background:#fff;border:1px solid #e4e4e7;border-radius:12px}',
            '.cx-brush-card h1{margin:0 0 6px;font-size:17px;font-weight:600;letter-spacing:.2px;color:#18181b}',
            '.cx-brush-desc{margin:0 0 22px;font-size:12px;line-height:1.6;color:#71717a}',
            '.cx-brush-card .layui-form-label{width:56px;padding:8px 0;font-size:12px;color:#71717a;text-align:left}',
            '.cx-brush-card .layui-input-block{margin-left:64px}',
            '.cx-brush-card .layui-form-item{margin-bottom:14px}',
            '.cx-brush-card .layui-btn{height:34px;line-height:34px;padding:0 18px;border-radius:8px;background:#18181b;color:#fff;font-size:12px;font-weight:500;border:none;transition:background 160ms ease}',
            '.cx-brush-card .layui-btn:hover{background:#27272a;color:#fff}',
            '.cx-brush-card .layui-btn-danger{background:#18181b}',
            '.cx-brush-card .layui-input,.cx-brush-card .layui-select{height:34px;border:1px solid #e4e4e7;border-radius:8px;background:#fff;font-size:12px;color:#18181b;transition:border-color 160ms ease}',
            '.cx-brush-card .layui-input:focus,.cx-brush-card .layui-select:focus{border-color:#18181b}',
            '.cx-brush-card .layui-form-select dl{border:1px solid #e4e4e7;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.08);font-size:12px}',
            '.cx-brush-card .layui-form-select dl dd.layui-this{background:#f4f4f5;color:#18181b}',
            '.cx-brush-log{max-height:220px;overflow-y:auto;margin-top:16px;padding:10px 12px;background:#fafafa;border:1px solid #ececee;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.7;color:#52525b}',
            '.cx-brush-log div{word-break:break-word}',
            '.cx-brush-log::-webkit-scrollbar{width:6px}',
            '.cx-brush-log::-webkit-scrollbar-thumb{background:#d4d4d8;border-radius:3px}'
        ].join('');
        document.head.appendChild(st);
    }
}

function initBrushPage() {
    buildBrushPage();
    $('head').append('<link href="https://lib.baomitu.com/layui/2.6.8/css/layui.css" rel="stylesheet"/>');
    $.getScript('https://lib.baomitu.com/layui/2.6.8/layui.js', function () {
        layui = unsafeWindow.layui;
        layer = unsafeWindow.layer;
        form = layui.form;
        form.render();
        getEl('cx-brush-start')?.addEventListener('click', startBrush);
        pageLog('路南云刷课页已就绪');
        loadCourses();
    });
}

function initCoursePopup() {
    const $w = unsafeWindow;
    const params = Object.fromEntries(new URLSearchParams($w.location.search));
    const entrance = () => {
        const q = 'classid=' + encodeURIComponent(params.clazzid || params.classid || '') +
            '&courseid=' + encodeURIComponent(params.courseid || params.courseId || '') +
            '&cpi=' + encodeURIComponent(params.cpi || '');
        $w.open(BRUSH_PAGE_URL + '?' + q, '_blank');
    };
    setTimeout(() => {
        const $ = $w.jQuery || $w.$;
        if (!$ || !$('.coursenoticepop').length) return;
        const html = `<div class="popDiv course-pop"><div class="popHead"><a class="popClose fr" href="javascript:;"><img src="/mooc2-ans/images/popClose.png" class="closecoursepop" style="display:none;"></a><p class="fl fs18 colorDeep">路南云 · API 专刷视频</p></div><div class="het60"></div><div class="course-content-dialog"><ul class="course-details"><li><div class="right-box"><div class="text-box"><p class="text1">可在新页面批量刷视频/文档，章节测验请用研习助手。</p></div></div></li></ul><div style="height:70px;"></div><div class="bottom-div"><div class="start-study" id="cx-brush-popup-go">打开刷课页</div>&ensp;&ensp;&ensp;<div class="start-study" id="cx-brush-popup-cancel">取消</div></div></div></div>`;
        $('.coursenoticepop').empty().html(html);
        $('#cx-brush-popup-go').on('click', entrance);
        $('#cx-brush-popup-cancel').on('click', () => { $('.closecoursepop').hide(); $('.coursenoticepop').hide(); });
        $('.closecoursepop').show();
        $('.coursenoticepop').show();
    }, 1000);
}

function initHomeBrushPopup() {
    if (document.getElementById('cx-brush-home-popup')) return;
    try {
        if (sessionStorage.getItem('cx_brush_home_popup_dismissed')) return;
    } catch {}
    const mask = document.createElement('div');
    mask.id = 'cx-brush-home-popup';
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.32);z-index:999998;display:flex;align-items:center;justify-content:center;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);';
    mask.innerHTML =
        '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:26px 24px;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.10);text-align:center;font-family:-apple-system,BlinkMacSystemFont,\'SF Pro Text\',\'PingFang SC\',\'Microsoft YaHei\',\'Segoe UI\',Arial,sans-serif;">' +
            '<h3 style="margin:0 0 10px;font-size:15px;font-weight:600;letter-spacing:.2px;color:#18181b;">路南云 · API 专刷视频</h3>' +
            '<p style="margin:0 0 20px;font-size:12px;color:#5f5f68;line-height:1.7;">批量刷视频/文档请打开专刷页面；章节测验请进入 mooc1 学习页使用答题功能。</p>' +
            '<button id="cx-brush-home-go" type="button" style="padding:8px 18px;border:1px solid #18181b;border-radius:8px;background:#18181b;color:#fff;font-size:12px;font-weight:500;cursor:pointer;margin-right:10px;transition:background 160ms ease;">打开刷课页</button>' +
            '<button id="cx-brush-home-close" type="button" style="padding:8px 18px;border:1px solid #e4e4e7;border-radius:8px;background:#fff;color:#5f5f68;font-size:12px;cursor:pointer;transition:background 160ms ease,border-color 160ms ease;" onmouseover="this.style.background=\'#fafafa\';this.style.borderColor=\'#d4d4d8\'" onmouseout="this.style.background=\'#fff\';this.style.borderColor=\'#e4e4e7\'">关闭</button>' +
        '</div>';
    document.body.appendChild(mask);
    mask.querySelector('#cx-brush-home-go')?.addEventListener('click', () => {
        window.open(BRUSH_PAGE_URL, '_blank');
        try { sessionStorage.setItem('cx_brush_home_popup_dismissed', '1'); } catch {}
        mask.remove();
    });
    mask.querySelector('#cx-brush-home-close')?.addEventListener('click', () => {
        try { sessionStorage.setItem('cx_brush_home_popup_dismissed', '1'); } catch {}
        mask.remove();
    });
}
})();
