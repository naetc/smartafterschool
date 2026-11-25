/* ==========================================================================
   파일닉네임: test/regression-2026-11-25.test.js
   기능설명: 환불 강좌 baseline이 낡는 결함의 재발 방지 (헌법 제6조 5항 경로 동등성)

   [결함] 이월 상태에서 환불한 뒤 **같은 학생의 다른 강좌**를 조정·요금표 수정·개별공제 변경하면,
   그 편집을 환불 전에 했을 때와 결과가 달랐다. baseline 재계산 여부를 '환불 강좌 자신의
   청구액'으로만 판단해서 다른 강좌의 변화를 알아채지 못했다. 같은 분기에 환불 강좌가 둘이면
   서로의 baseline이 서로의 재료가 되어 답이 둘 이상 생기기도 했다.
   [발견] 2026-11-25 상계 선택 기능 테스트 중. 퍼즈 A9b가 1,000건 중 156건 검출.
   [영향] 실서비스 백업 7개(환불 강좌 92건)에서는 낡은 baseline 0건 — 기존 장부 금액 변화 없음.

   ⚠ 실제 window.commitState를 그대로 부른다(테스트가 재연산 순서를 흉내내면 버그를 가린다).
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { freshEngine } = require('./harness');

const FEE = { t: 300000, b: 50000, m: 0, mh: '4,4,4', instTot: 285000, mgmtTot: 15000 };

function world(courses = ['가강좌', '나강좌'], freeAnnual = 600000) {
    const w = freshEngine({ freeAnnual });
    w.C = {};
    courses.forEach(c => { w.C[c] = { 3: { ...FEE } }; });
    w.F = [{ g: 5, b: 1, n: 1, name: '학생', startQ: 1, startSess: 0, courses: {} }];
    w.E = courses.map((c, i) => ({ g: 5, b: 1, n: 1, name: '학생', q: 3, course: c, refunds: [], adjusts: [], seq: i }));
    w.save = () => {};
    w.commitState(() => {});
    return w;
}
const refund = (w, i, r = { ty: 'BEFORE', bkRefTy: 'NONE' }) => w.commitState(() => {
    const e = w.E[i];
    w.captureEnrollmentBaseline(e);
    e.refunds.push({ sessIdx: 0, ah: 0, bkRefAmt: 0, bkRefAmtM: 0, rt: 0, rb: 0, rm: 0, ...r });
    w.updateFrozenSplit(e);
});
const view = w => JSON.stringify(w.Hs.map(h => [h.c, h.tc, h.bc, h.tf, h.bf, h.finT, h.finB]));

const EDITS = {
    '다른 강좌 감액 조정': w => w.E[1].adjusts.push({ title: '조정', amtT: -300000, amtB: 0 }),
    '다른 강좌 요금표 인하': w => { w.C['나강좌'][3].t = 0; },
    '다른 강좌 개별공제 변경': w => { w.E[1].overrideFree = 'B,T'; },
};
Object.entries(EDITS).forEach(([name, edit]) => {
    test(`[경로 동등성] ${name}: 환불 전에 하든 후에 하든 결과가 같다`, () => {
        const a = world(); a.commitState(() => edit(a)); refund(a, 0);
        const b = world(); refund(b, 0); b.commitState(() => edit(b));
        assert.equal(view(b), view(a));
    });
});

test('[경로 동등성] 같은 분기 환불 강좌 둘: 환불 순서를 바꿔도 결과가 같다', () => {
    // 예산이 모자라는 학생(자유 40만)에 강좌 둘 — 서로의 baseline이 서로의 재료가 되는 경우
    const a = world(['가강좌', '나강좌'], 400000);
    refund(a, 0, { ty: 'STUDENT', sessIdx: 1, ah: 2, bkRefTy: 'NONE' }); refund(a, 1, { ty: 'STUDENT', sessIdx: 2, ah: 1, bkRefTy: 'NONE' });
    const b = world(['가강좌', '나강좌'], 400000);
    refund(b, 1, { ty: 'STUDENT', sessIdx: 2, ah: 1, bkRefTy: 'NONE' }); refund(b, 0, { ty: 'STUDENT', sessIdx: 1, ah: 2, bkRefTy: 'NONE' });
    assert.equal(view(b), view(a));
});

test('[멱등] 아무것도 안 바꾸고 다시 저장하면 금액이 그대로다', () => {
    const w = world(['가강좌', '나강좌'], 400000);
    refund(w, 0); refund(w, 1, { ty: 'STUDENT', sessIdx: 1, ah: 1, bkRefTy: 'NONE' });
    w.commitState(() => { w.E[1].adjusts.push({ title: 'x', amtT: -50000, amtB: 0 }); });
    const v = view(w);
    w.commitState(() => {}); w.commitState(() => {});
    assert.equal(view(w), v);
});

test('[유일한 답] 같은 분기 환불 강좌 둘인 학생: 다시 계산해도 다른 답으로 옮겨 가지 않는다 (퍼즈 seed 31)', () => {
    // 퍼즈가 찾은 실제 장부. 2분기에 환불 강좌가 둘(쿠키클레이·코딩)인 학생1의 baseline이
    // 예전에는 95,000/0 과 45,000/50,000 두 답 중 편집 이력에 따라 아무 쪽으로나 갔다.
    // 상계 지정을 켰다 끄면(=강제로 다시 계산시키면) 처음과 같아야 한다.
    const { buildScenario, checkOffsetInvariants } = require('./fuzz-engine');
    const w = buildScenario(31);
    const V = checkOffsetInvariants(w).filter(v => v.code === 'A12c-되돌리기');
    assert.deepEqual(V, []);
});
