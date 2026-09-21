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
    sandbox.location = { href: 'http://localhost/' };
    sandbox.addEventListener = () => {};
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

module.exports = { loadEngine, freshEngine, freshExport, freshUi };
