/* ==========================================================================
   학생 통합 콘솔 — 화면에 남아야 할 사용자 설정 (2026-11-25)

   [결함 1] 콘솔에서 ▲▼로 강좌 차감 순서(e.seq)를 바꾸고 콘솔을 다시 열면 원래 순서로 보였다.
            순서는 저장돼 있었고 엔진·4스텝도 seq를 따랐는데, 콘솔만 장부(E) 순서로 그렸다.
   [불변식] 콘솔을 열 때 강좌 목록 순서 = 엔진의 차감 순서(seq → 강좌명)
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { freshUi } = require('./harness');

function consoleUi() {
    const w = freshUi({}, ['app-ui-settle.js']);
    w.renderConsole = () => {};           // 화면 그리기는 브라우저에서 확인한다
    w.getStuAdjustInfoChips = () => '';
    w.mdlConsole = { show() {} };
    w.gQ = 1;
    return w;
}
const enroll = (course, extra = {}) => ({ g: 3, b: 1, n: 7, name: '학생', q: 1, course, refunds: [], adjusts: [], ...extra });

test('[콘솔] 차감 순서를 바꾼 뒤 다시 열면 바꾼 순서로 보인다', () => {
    const w = consoleUi();
    // 장부에는 가나다 순으로 들어가 있지만, 사용자가 바둑을 맨 위로 올려 둔 상태
    w.E = [enroll('로봇과학', { seq: 1 }), enroll('바둑교실', { seq: 0 }), enroll('창의미술', { seq: 2 })];
    const uid = w.uid(3, 1, 7, '학생');
    w.openStuConsole(uid);
    assert.deepEqual(w.cEnrolls.map(i => w.E[i].course), ['바둑교실', '로봇과학', '창의미술']);
    assert.equal(w.E[w.cActiveEIdx].course, '바둑교실', '처음 선택되는 강좌도 맨 위 강좌여야 한다');
});

test('[콘솔] ▲ 버튼으로 바꾼 순서가 콘솔을 닫았다 다시 열어도 유지된다', () => {
    const w = consoleUi();
    w.commitState = fn => fn();          // 저장 경로는 다른 테스트가 지킨다. 여기서는 순서 결과만 본다
    w.isQuarterLocked = () => false;
    w.E = [enroll('로봇과학'), enroll('바둑교실'), enroll('창의미술')];
    const uid = w.uid(3, 1, 7, '학생');
    w.openStuConsole(uid);
    w.moveCourseSeq(2, -1);              // 창의미술 ▲
    w.moveCourseSeq(2, -1);              // 창의미술 ▲ → 맨 위
    const shown = w.cEnrolls.map(i => w.E[i].course);
    w.openStuConsole(uid);               // 다시 열기
    assert.deepEqual(w.cEnrolls.map(i => w.E[i].course), shown);
    assert.equal(shown[0], '창의미술');
});

/* [결함 2] 개별공제(강좌별 예외설정)를 저장하고 콘솔을 다시 열면 기본값으로 보였다.
   저장은 제대로 됐지만 콘솔이 늘 첫 강좌를 선택해서, 다른 강좌에 저장한 설정이 안 보였다.
   [불변식] 다시 열면 마지막으로 보던(저장한) 강좌가 선택되고, 그 강좌의 저장값이 선택창 값이 된다. */
test('[콘솔] 두 번째 강좌에 개별공제를 저장하고 다시 열면 그 강좌와 저장값이 보인다', () => {
    const w = consoleUi();
    const els = {};
    const el = id => (els[id] = els[id] || { id, value: '', innerHTML: '', classList: { add() {}, remove() {} } });
    w.$ = el;
    w.commitState = fn => fn();
    w.isFullyLocked = () => false;
    w.autoRunSet = () => {};
    w.showAlert = () => {};
    w.val = id => el(id).value;
    w.E = [enroll('로봇과학'), enroll('바둑교실')];
    const uid = w.uid(3, 1, 7, '학생');

    w.openStuConsole(uid);
    w.setConsoleActive(1);                       // 바둑교실 선택
    el('c_rule_cho3').value = 'B,T';
    w.saveConsoleRule();
    assert.equal(w.E[1].overrideCho3, 'B,T');

    w.openStuConsole(uid);                       // 다시 열기
    assert.equal(w.E[w.cActiveEIdx].course, '바둑교실', '다시 열면 마지막으로 보던 강좌가 선택돼야 한다');
});
