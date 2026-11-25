/* ==========================================================================
   환불 승인 전에 이월/상계를 고르는 흐름 (2026-11-25)

   · previewRefundOutcome: 아직 넣지 않은 환불을 넣었다고 가정해 계산하고, 장부에 흔적을
     남기지 않는다(가상 실행 복원 — 퍼즈 A10과 같은 성질).
   · 학생 콘솔 [환불 승인]: 환불과 처리 방식 지정이 한 번에 저장된다.
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { freshUi } = require('./harness');

const FEE = { t: 300000, b: 50000, m: 0, mh: '4,4,4', instTot: 285000, mgmtTot: 15000 };
function world() {
    const w = freshUi({ freeAnnual: 600000 }, ['app-ui-settle.js']);
    // 화면 그리기용 가짜 요소에 없는 메서드를 채운다(금액 계산과 무관한 화면 코드가 부른다)
    const orig = w.document.getElementById;
    w.document.getElementById = id => { const x = orig(id); x.style.setProperty = x.style.setProperty || (() => {}); return x; };
    w.save = () => {};
    w.C = { '가강좌': { 3: { ...FEE } }, '나강좌': { 3: { ...FEE } } };
    w.F = [{ g: 5, b: 1, n: 1, name: '학생', startQ: 1, startSess: 0, courses: {} }];
    w.E = ['가강좌', '나강좌'].map((c, i) => ({ g: 5, b: 1, n: 1, name: '학생', q: 3, course: c, refunds: [], adjusts: [], seq: i }));
    w.commitState(() => {});
    return w;
}
const R = { sessIdx: 0, ty: 'BEFORE', ah: 0, reqBk: false, bkRefTy: 'NONE', bkRefAmt: 0, bkRefAmtM: 0, rt: 0, rb: 0, rm: 0 };
const state = w => JSON.stringify({ E: w.E, S: w.SysSet, H: w.Hs.map(h => [h.c, h.tf, h.bf, h.finT, h.finB]) });

test('[가상 계산] 이월·상계 결과를 미리 구하고, 장부는 그대로 둔다', () => {
    const w = world();
    const before = state(w);
    const carry = w.previewRefundOutcome([{ e: w.E[0], refund: R }], 'carry');
    const off = w.previewRefundOutcome([{ e: w.E[0], refund: R }], 'offset');
    assert.equal(state(w), before, '가상 계산이 장부에 흔적을 남겼다');
    const q3 = o => o.stuQ.find(s => s.q === 3);
    assert.equal(q3(carry).before, 100000);
    assert.equal(q3(carry).after, 100000, '이월: 이번 분기 자부담 그대로');
    assert.equal(q3(off).after, 0, '상계: 남은 자부담을 덮는다');
});

test('[콘솔 승인] 상계를 고르고 승인하면 환불과 상계 지정이 한 번에 저장된다', async () => {
    const w = world();
    const els = {};
    const el = id => (els[id] = els[id] || { id, value: '', innerHTML: '', disabled: false, style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} }, querySelector: () => null, querySelectorAll: () => [] });
    w.$ = el; w.val = id => el(id).value;
    el('c_ref_idx').value = '0'; el('c_ref_ty').value = 'BEFORE'; el('c_ref_ah').value = '0'; el('c_ref_bk_ty').value = 'NONE';
    w.document.querySelector = sel => (sel.includes('c_ref_mode') ? { value: 'offset' } : null);
    w.isFullyLocked = () => false;
    let asked = null; w.showConfirm = async m => { asked = m; return true; };
    w.cActiveEIdx = 0; w.cUid = w.uid(5, 1, 1, '학생');
    await w.addConsoleRef();
    assert.equal(w.E[0].refunds.length, 1);
    assert.ok(w.isRefundOffset(3, w.cUid), '상계 지정이 저장되지 않았다');
    assert.match(asked, /상계/);
    const self = w.Hs.filter(h => h.q === 3).reduce((a, h) => a + h.finT + h.finB, 0);
    assert.equal(self, 0);
    // 되돌리기 한 번이면 환불과 지정이 함께 사라진다
    assert.ok(w.undoSnapshot, '되돌리기 슬롯이 없다');
    const prev = JSON.parse(w.undoSnapshot);
    assert.equal(prev.E[0].refunds.length, 0);
    assert.ok(!prev.SysSet.refundOffset || !Object.keys(prev.SysSet.refundOffset).length);
});

test('[콘솔 승인] 이월을 고르면 확인 없이 지금처럼 환불만 저장된다', async () => {
    const w = world();
    const els = {};
    const el = id => (els[id] = els[id] || { id, value: '', innerHTML: '', disabled: false, style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} }, querySelector: () => null, querySelectorAll: () => [] });
    w.$ = el; w.val = id => el(id).value;
    el('c_ref_idx').value = '0'; el('c_ref_ty').value = 'BEFORE'; el('c_ref_ah').value = '0'; el('c_ref_bk_ty').value = 'NONE';
    w.document.querySelector = sel => (sel.includes('c_ref_mode') ? { value: 'carry' } : null);
    w.isFullyLocked = () => false;
    let asked = false; w.showConfirm = async () => { asked = true; return true; };
    w.cActiveEIdx = 0; w.cUid = w.uid(5, 1, 1, '학생');
    await w.addConsoleRef();
    assert.equal(w.E[0].refunds.length, 1);
    assert.equal(asked, false);
    assert.ok(!w.isRefundOffset(3, w.cUid));
});
