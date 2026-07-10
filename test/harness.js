/* ==========================================================================
   테스트 하네스: 브라우저 없이 Node의 vm 샌드박스에서 정산 엔진(app-core.js +
   app-engine.js)을 그대로 실행시켜, 실제 소스와 동일한 로직을 검증한다.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function loadEngine() {
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

    ['app-core.js', 'app-engine.js'].forEach(file => {
        const code = fs.readFileSync(path.join(ROOT, file), 'utf-8');
        vm.runInContext(code, sandbox, { filename: file });
    });

    return sandbox.window;
}

// 매 테스트마다 깨끗한 상태에서 시작하도록 데이터/설정을 초기화한 엔진 인스턴스를 돌려준다.
function freshEngine(sysSetOverrides = {}) {
    const w = loadEngine();
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
    }, sysSetOverrides);
    return w;
}

module.exports = { loadEngine, freshEngine };
