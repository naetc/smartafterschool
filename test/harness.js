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
// ExcelJS로 그리는 서식(app-xlsx.js의 XL.download)은 파일로 그리기 직전의 모델을 붙잡는다.
// 모델 → 파일이 정확히 옮겨지는지는 exportFile(아래)이 진짜 파일을 다시 읽어 따로 확인한다.
function ensureXl(w) {
    // 붙잡기용으로 바꿔 끼운 XL이 남아 있어도 진짜 XL을 돌려준다(__xlReal에 보관).
    if (!w.__xlReal) {
        if (!w.XL) vm.runInContext(fs.readFileSync(path.join(ROOT, 'app-xlsx.js'), 'utf-8'), w, { filename: 'app-xlsx.js' });
        w.__xlReal = w.XL;
    }
    return w.__xlReal;
}
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
    const real = ensureXl(w);
    w.XL = Object.assign({}, real, {
        download: (model, filename) => {
            books.push({ filename, sheets: model.sheets.map(s => ({ name: s.name, rows: JSON.parse(JSON.stringify(s.rows)), columns: s.columns.map(c => c.key), types: s.columns.map(c => c.type), nosum: s.columns.map(c => c.sum === false), hasTotal: !!s.total })) });
            return Promise.resolve();
        },
    });
    return books;
}

// 진짜 엑셀 파일을 만들어 다시 읽는다 — 앱의 내보내기 함수와 XL.download를 그대로 실행하고,
// 브라우저가 저장할 파일(saveAs에 넘어간 Blob)을 ExcelJS로 연다. 값·병합·숫자 서식을 돌려준다.
// 느리므로 퍼즈가 아니라 대표 시나리오 테스트에서 쓴다.
const ExcelJSNode = require(path.join(ROOT, 'vendor/exceljs/exceljs.min.js'));
// ⚠ 파일을 '쓰는' ExcelJS는 반드시 샌드박스 안에 올린다. 바깥(Node) ExcelJS에 샌드박스에서 만든
//   배열을 넘기면 `instanceof Array`가 거짓이 되어 행 값이 통째로 빠진다(2026-11-24 실측: 빈 파일).
//   브라우저에서는 앱과 ExcelJS가 같은 창에 있으므로 이 문제가 없다. 읽기는 바깥 ExcelJS로 한다.
function ensureExcelJs(w) {
    if (!w.__excelJs) {
        ['setTimeout', 'clearTimeout', 'setImmediate', 'TextEncoder', 'TextDecoder', 'Buffer', 'process']
            .forEach(k => { if (!w[k]) w[k] = globalThis[k]; });
        const prev = w.ExcelJS;
        vm.runInContext(fs.readFileSync(path.join(ROOT, 'vendor/exceljs/exceljs.min.js'), 'utf-8'), w, { filename: 'exceljs.min.js' });
        w.__excelJs = w.ExcelJS;
        w.ExcelJS = prev;
    }
    return w.__excelJs;
}
async function exportFile(w, fnName, { q, ...inputs } = {}) {
    const sandboxExcelJs = ensureExcelJs(w);
    const realXl = ensureXl(w);
    let saved = null;
    const prev = { XL: w.XL, gQ: w.gQ, val: w.val, showAlert: w.showAlert, qsa: w.document.querySelectorAll, saveAs: w.saveAs, ExcelJS: w.ExcelJS, Blob: w.Blob };
    w.gQ = q;
    w.val = id => (inputs[id] != null ? String(inputs[id]) : '');
    w.showAlert = () => {};
    w.document.querySelectorAll = () => [];
    w.XL = realXl;
    w.ExcelJS = sandboxExcelJs;
    w.Blob = Blob;
    w.saveAs = (blob, filename) => { saved = { blob, filename }; };
    try { await w[fnName](); } finally { Object.assign(w, prev); w.document.querySelectorAll = prev.qsa; }
    if (!saved) return null;
    const buffer = Buffer.from(await saved.blob.arrayBuffer());
    const wb = new ExcelJSNode.Workbook();
    await wb.xlsx.load(buffer);
    return { filename: saved.filename, wb, buffer };
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

// 진짜 파일(exportFile)이 모델(exportBook)을 그대로 담았는지 시트마다 검사하고 문제 목록을 돌려준다.
//   · 데이터 칸 = 모델 값, 숫자 칸은 숫자로 저장(+ 금액은 천단위 서식)
//   · 합계 행: 금액 열마다 SUM 수식이 데이터 범위를 정확히 덮고, 값 = 파일 데이터 합
// 머리행 끝은 '틀 고정' 위치(ySplit)로 찾는다 — 모든 XL 서식이 머리행 아래를 고정한다.
function checkXlFile(book, file) {
    const bad = [];
    book.sheets.forEach((sh, si) => {
        const ws = file.wb.worksheets[si];
        if (!ws) { bad.push(`${sh.name}: 시트 없음`); return; }
        if (ws.name !== sh.name.substring(0, 31)) bad.push(`시트 이름 ${ws.name} != ${sh.name}`);
        const ds = ws.views[0].ySplit + 1;
        sh.rows.forEach((row, i) => sh.columns.forEach((key, c) => {
            const cell = ws.getCell(ds + i, c + 1);
            const want = row[key] == null ? null : row[key];
            const got = cell.value === '' ? null : cell.value;
            if (got !== want) bad.push(`${sh.name} ${i + 1}행 ${key}: 파일 ${JSON.stringify(got)} != 모델 ${JSON.stringify(want)}`);
            if (sh.types[c] === 'num' && !(cell.numFmt || '').includes('#,##0')) bad.push(`${sh.name} ${key}: 천단위 서식 없음`);
        }));
        if (!sh.hasTotal || !sh.rows.length) return;
        const tr = ds + sh.rows.length;
        if (ws.getCell(tr, 1).value !== '합계') bad.push(`${sh.name}: 합계 행이 데이터 바로 아래에 없다`);
        sh.columns.forEach((key, c) => {
            if (sh.types[c] !== 'num' || (sh.nosum && sh.nosum[c])) return; // 단가처럼 더하지 않는 열
            const v = ws.getCell(tr, c + 1).value || {};
            const L = ws.getColumn(c + 1).letter;
            if (v.formula !== `SUM(${L}${ds}:${L}${tr - 1})`) bad.push(`${sh.name} ${key}: 합계 수식 ${v.formula}`);
            const sum = sh.rows.reduce((a, _, i) => a + (Number(ws.getCell(ds + i, c + 1).value) || 0), 0);
            if ((v.result ?? 0) !== sum) bad.push(`${sh.name} ${key}: 합계 값 ${v.result} != ${sum}`);
        });
    });
    return bad;
}

module.exports = { checkXlFile, ensureXl, ensureExcelJs, ExcelJSNode, loadEngine, freshEngine, freshExport, freshUi,
    installXlsxCapture, exportBook, exportFile, backupText, simulateRestore, simulateReload };
