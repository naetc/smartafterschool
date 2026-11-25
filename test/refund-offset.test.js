/* ==========================================================================
   환불 지원금 처리 방식 선택 — 학생·분기별 상계 지정 (2026-11-25, 헌법 제6조 3의2)

   기본은 이월(환불 강좌 격리). SysSet.refundOffset에 지정된 학생·분기만 격리를 건너뛰고
   환불 강좌를 포함한 그 분기를 다시 계산한다. 설계: 설계_환불처리방식선택.md
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { freshEngine, backupText, simulateRestore, simulateReload } = require('./harness');

const FEE = { t: 300000, b: 50000, m: 0, mh: '4,4,4', instTot: 285000, mgmtTot: 15000 };

// 자유수강권 60만 학생(5학년, 초3 아님). courses: 3분기에 들을 강좌 이름 목록.
function world(courses, { others = [] } = {}) {
    const w = freshEngine({ freeAnnual: 600000 }, ['app-db.js']);
    w.C = {};
    courses.concat(others.map(o => o.course)).forEach(c => { w.C[c] = { 3: { ...FEE }, 4: { ...FEE } }; });
    w.F = [{ g: 5, b: 1, n: 1, name: '학생', startQ: 1, startSess: 0, courses: {} }];
    w.E = courses.map((c, i) => ({ g: 5, b: 1, n: 1, name: '학생', q: 3, course: c, refunds: [], adjusts: [], seq: i }));
    others.forEach(o => {
        w.F.push({ g: 5, b: 1, n: 2, name: '다른학생', startQ: 1, startSess: 0, courses: {} });
        w.E.push({ g: 5, b: 1, n: 2, name: '다른학생', q: 3, course: o.course, refunds: [], adjusts: [], seq: 0 });
    });
    w.recomputeAll();
    return w;
}
// 실제 화면(addConsoleRef)과 같은 순서로 환불 등록
function refund(w, e, r) {
    w.captureEnrollmentBaseline(e);
    e.refunds.push({ sessIdx: 0, ah: 0, bkRefAmt: 0, bkRefAmtM: 0, rt: 0, rb: 0, rm: 0, ...r });
    w.updateFrozenSplit(e);
    w.recomputeAll();
}
const sid = w => w.uid(5, 1, 1, '학생');
function setOffset(w, q, on) {
    w.SysSet.refundOffset = w.SysSet.refundOffset || {};
    if (on) w.SysSet.refundOffset[w.refundOffsetKey(q, sid(w))] = { at: '2026-11-25' };
    else delete w.SysSet.refundOffset[w.refundOffsetKey(q, sid(w))];
    w.recomputeAll();
}
const row = (w, course, q = 3) => w.Hs.find(h => h.c === course && h.q === q && h.nm === '학생');
const self = (w, q = 3, nm = '학생') => w.Hs.filter(h => h.q === q && h.nm === nm).reduce((a, h) => a + h.finT + h.finB + (h.finM || 0), 0);
const snapAll = w => JSON.stringify(w.Hs.map(h => [h.nm, h.q, h.c, h.tc, h.bc, h.tf, h.bf, h.finT, h.finB]));

test('[상계] 강좌 하나를 취소하면 남은 강좌와 취소한 강좌의 남은 교재비까지 지원금이 덮는다', () => {
    const w = world(['가강좌', '나강좌']);
    assert.equal(self(w), 100000, '처음엔 교재비 5만씩 자부담');
    refund(w, w.E[0], { ty: 'BEFORE', bkRefTy: 'NONE' });   // 가강좌 개시 전 취소, 교재비 반환 안 함

    assert.equal(self(w), 100000, '이월(기본): 돌아온 지원금이 이번 분기에 안 쓰인다');
    setOffset(w, 3, true);
    assert.equal(self(w), 0, '상계: 남은 자부담이 모두 지원금으로');
    assert.equal(row(w, '가강좌').finB, 0, '환불 강좌에 남은 교재비도 덮는다');
    assert.equal(row(w, '나강좌').finB, 0);
    // 지원금 합계 = 청구액 합계(초3 + 자유 + 자부담 = 청구액)
    w.Hs.filter(h => h.q === 3).forEach(h => assert.equal(h.tc + h.bc + h.tf + h.bf + h.finT + h.finB, h.sT + h.sB));
});

test('[상계] 강좌가 하나뿐이어도 같은 강좌의 다른 항목(교재비) 자부담을 덮는다', () => {
    const w = world(['가강좌']);
    w.SysSet.freeAnnual = 300000; w.recomputeAll();         // 수강료 30만만 지원 → 교재비 5만 자부담
    assert.equal(self(w), 50000);
    refund(w, w.E[0], { ty: 'BEFORE', bkRefTy: 'NONE' });   // 수강료 전액 환불, 교재비는 그대로
    assert.equal(self(w), 50000, '이월: 교재비 자부담이 그대로');
    setOffset(w, 3, true);
    assert.equal(self(w), 0, '상계: 수강료에서 돌아온 지원금이 교재비를 덮는다');
});

test('[상계] 지정을 풀면 이월 계산으로 정확히 돌아온다', () => {
    const w = world(['가강좌', '나강좌']);
    refund(w, w.E[0], { ty: 'BEFORE', bkRefTy: 'NONE' });
    const carry = snapAll(w);
    setOffset(w, 3, true);
    assert.notEqual(snapAll(w), carry);
    setOffset(w, 3, false);
    assert.equal(snapAll(w), carry);
});

test('[상계] 다른 학생의 금액은 1원도 안 바뀐다 (A13)', () => {
    const w = world(['가강좌', '나강좌'], { others: [{ course: '다강좌' }] });
    refund(w, w.E[0], { ty: 'BEFORE', bkRefTy: 'NONE' });
    const other = () => JSON.stringify(w.Hs.filter(h => h.nm === '다른학생').map(h => [h.tc, h.bc, h.tf, h.bf, h.finT, h.finB]));
    const before = other();
    setOffset(w, 3, true);
    assert.equal(other(), before);
});

test('[상계] 환불 이력서의 3분할(이 환불이 어디서 나갔나)은 지정과 무관하다', () => {
    const w = world(['가강좌', '나강좌']);
    refund(w, w.E[0], { ty: 'BEFORE', bkRefTy: 'NONE' });
    const e = w.E[0], r = e.refunds[0];
    const a = JSON.stringify(w.computeRefundBudgetSplit(e, r));
    setOffset(w, 3, true);
    assert.equal(JSON.stringify(w.computeRefundBudgetSplit(e, r)), a);
});

test('[상계] 마감된 차수의 금액은 상계로도 움직이지 않는다 (제5조)', () => {
    const w = world(['가강좌', '나강좌']);
    refund(w, w.E[0], { ty: 'BEFORE', bkRefTy: 'NONE' });
    // 3분기 1~3차를 지금 값으로 마감
    w.SysSet.closedSess = w.SysSet.closedSess || {};
    for (let s = 0; s < 3; s++) {
        const key = `3_${s}`; w.SysSet.closedSess[key] = {};
        w.Hs.filter(h => h.q === 3).forEach(h => {
            const d = h.sessDetails[s];
            w.SysSet.closedSess[key][`${h.id}_${h.c}`] = { cho3Amt: d.tc, cho3Bk: d.bc || 0, cho3Mt: 0, freeAmt: d.tf, freeBk: d.bf || 0, freeMt: 0, selfAmt: d.finT, selfBk: d.finB || 0, selfMt: 0 };
        });
    }
    w.recomputeAll();
    const locked = snapAll(w);
    assert.equal(self(w), 100000, '마감 재생 값이 이월 계산과 같아야 한다');
    setOffset(w, 3, true);
    assert.equal(snapAll(w), locked);
    assert.equal(self(w), 100000);
});

test('[상계] 4분기: 이월이면 소멸 안내가 뜨고, 상계면 남은 자부담에 쓰인다', () => {
    const w = world(['가강좌', '나강좌']);
    w.E.forEach(e => { e.q = 4; }); w.recomputeAll();
    refund(w, w.E[0], { ty: 'BEFORE', bkRefTy: 'NONE' });
    const L = Object.values(w.Ld).find(x => x.id === sid(w));
    assert.ok(w.getCarryForwardAmount(L, 4).free > 0, '이월: 환불로 아낀 금액이 있다(4분기라 소멸)');
    assert.equal(self(w, 4), 100000);
    setOffset(w, 4, true);
    assert.equal(self(w, 4), 0);
    assert.equal(w.getCarryForwardAmount(Object.values(w.Ld).find(x => x.id === sid(w)), 4).free, 0, '상계 지정 학생은 소멸 안내 금액이 없다');
});

test('[상계] 경로 동등성: 조정을 환불 전에 하든 후에 하든 결과가 같다 (제6조 5항)', () => {
    const adj = { title: '할인', amtT: -20000, amtB: 0 };
    const a = world(['가강좌', '나강좌']);
    a.E[1].adjusts.push({ ...adj }); a.recomputeAll(); a.recaptureBaseline && a.E.forEach(e => a.recaptureBaseline(e));
    refund(a, a.E[0], { ty: 'BEFORE', bkRefTy: 'NONE' });
    setOffset(a, 3, true);

    const b = world(['가강좌', '나강좌']);
    refund(b, b.E[0], { ty: 'BEFORE', bkRefTy: 'NONE' });
    setOffset(b, 3, true);
    b.E[1].adjusts.push({ ...adj }); b.recomputeAll(); b.E.forEach(e => b.recaptureBaseline(e)); b.E.forEach(e => b.updateFrozenSplit(e)); b.recomputeAll();

    assert.equal(snapAll(a), snapAll(b));
});

test('[상계] 백업 → 복구 → 새로고침 뒤에도 지정이 남아 같은 금액이 나온다', async () => {
    const w = world(['가강좌', '나강좌']);
    w.save = () => {};
    refund(w, w.E[0], { ty: 'BEFORE', bkRefTy: 'NONE' });
    setOffset(w, 3, true);
    const { saved } = await simulateRestore(backupText(w));
    const w2 = await simulateReload(saved);
    assert.ok(w2.isRefundOffset(3, sid(w2)), '복구 뒤 상계 지정이 사라졌다');
    assert.equal(self(w2), self(w));
});
