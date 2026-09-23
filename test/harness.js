/* ==========================================================================
   테스트 하네스: 브라우저 없이 Node의 vm 샌드박스에서 정산 엔진(app-core.js +
   app-engine.js)을 그대로 실행시켜, 실제 소스와 동일한 로직을 검증한다.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function loadEngine(extraFiles = []) {
    const sandbox = {};
    sandbox.window = sandbox;
    sandbox.console = console;
    sandbox.document = {
        querySelector: () => null,
        getElementById: () => null,
        addEventListener: () => {},
        body: { appendChild: () => {} },
        createElement: () => ({}),
    };
    sandbox.location = { href: 'http://localhost/', reload: () => {} };
    // 등록된 이벤트 리스너를 모아 둔다 — [복구] 버튼처럼 리스너 안에 있는 실제 코드를 테스트에서 부르기 위해.
    sandbox.__listeners = [];
    sandbox.addEventListener = (type, fn) => { sandbox.__listeners.push({ type, fn }); };
    sandbox.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    vm.createContext(sandbox);

    ['app-core.js', 'app-engine.js'].concat(extraFiles).forEach(file => {
        const code = fs.readFileSync(path.join(ROOT, file), 'utf-8');
        vm.runInContext(code, sandbox, { filename: file });
    });

    return sandbox.window;
}

// 매 테스트마다 깨끗한 상태에서 시작하도록 데이터/설정을 초기화한 엔진 인스턴스를 돌려준다.
function freshEngine(sysSetOverrides = {}, extraFiles = []) {
    const w = loadEngine(extraFiles);
    w.C = {};
    w.M = {};
    w.F = [];
    w.E = [];
    w.SysSet = Object.assign({
        closedSess: {},
        cho3Priority: 'T,B',
        freePriority: 'T,B',
        deductMode: 'ITEM_FIRST',
        accType: 'INTEGRATED',
        useMaterialFee: false,
        cho3Annual: w.BUDGET.CHO3_ANNUAL,
        cho3H1Cap: w.BUDGET.CHO3_H1_CAP,
        freeAnnual: w.BUDGET.FREE_ANNUAL,
        cho3Grades: [3],
    }, sysSetOverrides);
    return w;
}

// 청구서·명단 등 내보내기 계산도 같은 샌드박스에서 실제 소스로 검증하기 위한 편의 함수.
// app-ui-export.js는 최상위에서 DOM을 건드리지 않으므로 그대로 올릴 수 있다.
// extraFiles로 app-utils.js(checkMgmtRatio 등)처럼 함께 필요한 파일을 추가로 올릴 수 있다.
function freshExport(sysSetOverrides = {}, extraFiles = []) {
    return freshEngine(sysSetOverrides, ['app-ui-export.js', ...extraFiles]);
}

// 3스텝 자유수강권 명단(renderF)처럼 DOM을 읽고 쓰는 화면 로직을 검증하기 위한 최소 DOM 흉내.
// 실제 브라우저가 아니므로 "표가 예쁘게 그려지는가"는 검증할 수 없고, 검증 대상은
// "어떤 학생이 목록에 남는가" — 즉 필터 판정이다. 그래서 innerHTML을 문자열로 받아
// 이름만 뽑아내는 수준으로 충분하다.
function freshUi(sysSetOverrides = {}, extraFiles = []) {
    const els = {};
    const mkEl = id => ({
        id, checked: false, value: '', innerHTML: '', innerText: '', textContent: '',
        className: '', style: {}, click() {}, querySelector: () => null,
        querySelectorAll: () => [], appendChild() {}, addEventListener() {},
        classList: { add() {}, remove() {}, toggle() {} },
        getAttribute: () => null, setAttribute() {},
    });
    const w = freshEngine(sysSetOverrides, ['app-utils.js', 'app-ui-steps.js', ...extraFiles]);
    w.document.getElementById = id => (els[id] = els[id] || mkEl(id));
    w.document.querySelectorAll = () => [];
    w.save = () => {};
    w.el = id => w.document.getElementById(id);
    // #tbFree / #tbCho3에 그려진 행에서 학생 이름만 추려낸다.
    w.renderedNames = tableId => [...(els[tableId]?.innerHTML || '')
        .matchAll(/openStuConsole\([^)]*\)">([^<]*)</g)].map(m => m[1].trim());
    return w;
}

// ── 부가 서비스(백업·복구·엑셀 서식) 검증 도구 ─────────────────────────────
// 모두 앱의 실제 함수를 그대로 부른다. 흉내 내면 버그를 가린다(CLAUDE.md 검증 원칙 2).

// 엑셀 파일 대신 시트에 들어가는 행을 붙잡는다. writeFile이 불린 책만 "실제로 내려받은 파일"이다.
function installXlsxCapture(w) {
    const books = [];
    w.XLSX = {
        utils: {
            book_new: () => ({ sheets: [] }),
            json_to_sheet: rows => ({ rows: JSON.parse(JSON.stringify(rows)) }),
            book_append_sheet: (wb, ws, name) => { wb.sheets.push({ name, rows: ws.rows }); },
        },
        writeFile: (wb, filename) => { books.push({ filename, sheets: wb.sheets }); },
    };
    return books;
}

// 5스텝 내보내기 함수(exInvoice 등)를 화면 선택값(분기, 차수 필터 등)과 함께 실행하고, 만들어진 파일을 돌려준다.
// 파일이 안 만들어졌으면(내역 없음 알림 등) null.
function exportBook(w, fnName, { q, ...inputs } = {}) {
    const books = installXlsxCapture(w);
    const prev = { gQ: w.gQ, val: w.val, showAlert: w.showAlert, qsa: w.document.querySelectorAll };
    w.gQ = q;
    w.val = id => (inputs[id] != null ? String(inputs[id]) : '');
    w.showAlert = () => {};
    w.document.querySelectorAll = () => [];
    try { w[fnName](); } finally {
        w.gQ = prev.gQ; w.val = prev.val; w.showAlert = prev.showAlert; w.document.querySelectorAll = prev.qsa;
    }
    return books[books.length - 1] || null;
}

// [백업] 버튼(sysBackup)이 내려주는 파일 내용
function backupText(w) {
    let text = null;
    const prev = { Blob: w.Blob, URL: w.URL, ce: w.document.createElement };
    w.Blob = function (parts) { text = parts.join(''); };
    w.URL = { createObjectURL: () => 'blob:test' };
    w.document.createElement = () => ({ click() {} });
    try { w.sysBackup(); } finally { w.Blob = prev.Blob; w.URL = prev.URL; w.document.createElement = prev.ce; }
    return text;
}

// 새 PC에서 [복구] 버튼으로 백업 파일을 올린 상황. app-core.js의 복구 리스너를 그대로 실행하고,
// 그 결과 브라우저 DB에 저장된 내용(raw)을 돌려준다.
async function simulateRestore(text, extraFiles = []) {
    const w = loadEngine(['app-db.js', ...extraFiles]);
    let changeFn = null, saved = null;
    const errors = [];
    const input = { value: 'x', files: [{ name: 'backup.json' }], addEventListener: (t, fn) => { if (t === 'change') changeFn = fn; } };
    w.document.getElementById = id => (id === 'restoreFile' ? input : null);
    w.$ = id => w.document.getElementById(id);
    w.readFileAsText = async () => text;
    w.showConfirm = async () => true;
    w.showAlert = msg => { if (String(msg).includes('❌')) errors.push(msg); };
    w.dbSet = async (k, v) => { saved = v; };
    w.__listeners.filter(l => l.type === 'DOMContentLoaded' && String(l.fn).includes('restoreFile')).forEach(l => l.fn());
    if (!changeFn) throw new Error('복구 리스너를 찾지 못함');
    await changeFn.call(input);
    return { saved, errors };
}

// 브라우저를 새로 열었을 때(부팅) — 브라우저 DB에 raw가 들어 있는 상태에서 loadData를 그대로 실행한다.
async function simulateReload(raw, extraFiles = []) {
    const w = loadEngine(['app-db.js', ...extraFiles]);
    w.dbGet = async () => raw;
    w.dbSet = async () => {};
    const ok = await w.loadData();
    if (!ok) throw new Error('loadData가 장부를 불러오지 못함');
    w.recomputeAll();
    return w;
}

module.exports = { loadEngine, freshEngine, freshExport, freshUi,
    installXlsxCapture, exportBook, backupText, simulateRestore, simulateReload };
