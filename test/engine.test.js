'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { freshEngine } = require('./harness');

// ── getSessSplit: 분기 총액을 차수(Session)별 시수 비율로 안분 ──────────────

test('getSessSplit: 시수 비율대로 안분하고, 단수는 10원 단위 절사 후 마지막 차수가 흡수한다', () => {
    const w = freshEngine();
    const mh = [4, 4, 4];
    const total = 100000;
    const s0 = w.getSessSplit(total, 0, mh);
    const s1 = w.getSessSplit(total, 1, mh);
    const s2 = w.getSessSplit(total, 2, mh);

    assert.equal(s0, 33330);
    assert.equal(s1, 33330);
    assert.equal(s2, 33340); // 마지막 차수 = 총액 - 앞차수 합 (단수 흡수)
    assert.equal(s0 + s1 + s2, total);
});

test('getSessSplit: 시수가 다르면 비율에 맞춰 차등 배분한다', () => {
    const w = freshEngine();
    const mh = [2, 4, 4]; // 1차수만 절반 시수
    const total = 90000;
    const s0 = w.getSessSplit(total, 0, mh);
    const s1 = w.getSessSplit(total, 1, mh);
    const s2 = w.getSessSplit(total, 2, mh);

    assert.equal(s0, 18000); // trunc(90000*(2/10)/10)*10
    assert.equal(s1, 36000);
    assert.equal(s2, total - s0 - s1);
});

test('getSessSplit: 시수 비율이 딱 떨어지는 조합에서 부동소수점 오차로 10원이 밀리지 않는다', () => {
    const w = freshEngine();
    // 104500 / 11시수 = 정확히 시수당 9500원. 3/11, 4/11은 이진수로 딱 안 떨어지는 분수라
    // "분수를 먼저 만들고 곱하는" 예전 계산식에서는 28500이 아니라 28499.999999999996으로
    // 계산되어 10원이 마지막 차수로 밀려나는(28490/38000/38010) 부동소수점 버그가 있었다.
    const mh = [3, 4, 4];
    const total = 104500;
    const s0 = w.getSessSplit(total, 0, mh);
    const s1 = w.getSessSplit(total, 1, mh);
    const s2 = w.getSessSplit(total, 2, mh);

    assert.equal(s0, 28500);
    assert.equal(s1, 38000);
    assert.equal(s2, 38000);
    assert.equal(s0 + s1 + s2, total);
});

// ── 헌법 제1조: 큰 주머니(예산) 한도 ─────────────────────────────────────────

test('초3 지원금은 상반기(1~2분기) 25만원 한도를 넘지 않는다', () => {
    const w = freshEngine();
    w.C['로봇과학'] = { 1: { t: 300000, b: 0, m: 0, mh: '4,4,4' } };
    w.E.push({ q: 1, g: 3, b: 1, n: 1, name: '홍길동', course: '로봇과학', refunds: [], adjusts: [], seq: 0 });

    w.autoRunSet(true);

    const rec = w.Hs.find(h => h.q === 1 && h.nm === '홍길동');
    assert.equal(rec.tc, 250000); // 지원금은 한도까지만
    assert.equal(rec.finT, 50000); // 초과분은 자부담으로 남음
});

test('자유수강권은 연간 60만원 한도 안에서 분기 총액만큼 차감된다', () => {
    const w = freshEngine();
    w.C['생명과학'] = { 1: { t: 200000, b: 0, m: 0, mh: '4,4,4' } };
    w.F.push({ g: 2, b: 1, n: 1, name: '김영희', startQ: 1, startSess: 0, courses: {} });
    w.E.push({ q: 1, g: 2, b: 1, n: 1, name: '김영희', course: '생명과학', refunds: [], adjusts: [], seq: 0 });

    w.autoRunSet(true);

    const rec = w.Hs.find(h => h.q === 1 && h.nm === '김영희');
    assert.equal(rec.tf, 200000);
    assert.equal(rec.finT, 0);
});

// ── 헌법 제2조: 항목 우선(ITEM_FIRST) vs 강좌 우선(COURSE_FIRST) ────────────

test('ITEM_FIRST: 모든 강좌의 수강료(T)를 먼저 채운 뒤에야 교재비(B)로 넘어간다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST' });
    w.C['A강좌'] = { 1: { t: 150000, b: 100000, m: 0, mh: '4,4,4' } };
    w.C['B강좌'] = { 1: { t: 150000, b: 100000, m: 0, mh: '4,4,4' } };
    w.E.push({ q: 1, g: 3, b: 1, n: 1, name: '김철수', course: 'A강좌', refunds: [], adjusts: [], seq: 0 });
    w.E.push({ q: 1, g: 3, b: 1, n: 1, name: '김철수', course: 'B강좌', refunds: [], adjusts: [], seq: 1 });

    w.autoRunSet(true);

    const a = w.Hs.find(h => h.c === 'A강좌');
    const b = w.Hs.find(h => h.c === 'B강좌');
    // 25만원 한도 전액이 T(A 15만 + B 10만)에서 소진되어, 교재비(B)는 어느 강좌도 받지 못한다.
    assert.equal(a.tc, 150000);
    assert.equal(b.tc, 100000);
    assert.equal(a.bc, 0);
    assert.equal(b.bc, 0);
});

test('COURSE_FIRST: 강좌 하나(A)를 T→B 순으로 0원까지 채운 뒤에야 다음 강좌(B)로 넘어간다', () => {
    const w = freshEngine({ deductMode: 'COURSE_FIRST' });
    w.C['A강좌'] = { 1: { t: 150000, b: 100000, m: 0, mh: '4,4,4' } };
    w.C['B강좌'] = { 1: { t: 150000, b: 100000, m: 0, mh: '4,4,4' } };
    w.E.push({ q: 1, g: 3, b: 1, n: 1, name: '김철수', course: 'A강좌', refunds: [], adjusts: [], seq: 0 });
    w.E.push({ q: 1, g: 3, b: 1, n: 1, name: '김철수', course: 'B강좌', refunds: [], adjusts: [], seq: 1 });

    w.autoRunSet(true);

    const a = w.Hs.find(h => h.c === 'A강좌');
    const b = w.Hs.find(h => h.c === 'B강좌');
    // A강좌가 T+B(25만원) 전액을 소진하고 나면 한도가 바닥나 B강좌는 한 푼도 받지 못한다.
    assert.equal(a.tc, 150000);
    assert.equal(a.bc, 100000);
    assert.equal(b.tc, 0);
    assert.equal(b.bc, 0);
});

// ── 헌법 제3조: 개별 강좌 규칙(override)의 최우선 독립성 ────────────────────

test('강좌별 override 규칙은 전역 규칙과 무관하게 그 강좌에서만 독립적으로 적용된다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', cho3Priority: 'T,B' });
    w.C['A강좌'] = { 1: { t: 100000, b: 100000, m: 0, mh: '4,4,4' } };
    w.C['B강좌'] = { 1: { t: 100000, b: 100000, m: 0, mh: '4,4,4' } };
    // A강좌만 "교재비 우선"으로 개별 설정, B강좌는 전역 규칙("수강료 우선")을 그대로 따름
    w.E.push({ q: 1, g: 3, b: 1, n: 1, name: '김철수', course: 'A강좌', overrideCho3: 'B,T', refunds: [], adjusts: [], seq: 0 });
    w.E.push({ q: 1, g: 3, b: 1, n: 1, name: '김철수', course: 'B강좌', refunds: [], adjusts: [], seq: 1 });

    w.autoRunSet(true);

    const a = w.Hs.find(h => h.c === 'A강좌');
    const b = w.Hs.find(h => h.c === 'B강좌');
    assert.equal(a.bc, 100000); // A: override대로 교재비부터 전액
    assert.equal(a.tc, 50000);  // A: 남은 한도(25만-20만)만큼만 수강료로
    assert.equal(b.tc, 100000); // B: 전역 규칙대로 수강료 전액
    assert.equal(b.bc, 0);
});

// ── recalcEnrollment: 환불/조정 처리 ────────────────────────────────────────

test('개시 전(BEFORE) 환불은 수강료 전액을 돌려주고, 교재비 환불 옵션이 NONE이면 교재비는 그대로 남는다', () => {
    const w = freshEngine();
    w.C['로봇과학'] = { 1: { t: 100000, b: 40000, m: 0, mh: '4,4,4' } };
    const e = {
        q: 1, g: 1, b: 1, n: 1, name: '테스트', course: '로봇과학',
        refunds: [{ ty: 'BEFORE', sessIdx: 0, ah: 0, bkRefTy: 'NONE' }],
        adjusts: [],
    };

    const res = w.recalcEnrollment(e);

    assert.equal(res.cT, 0);
    assert.equal(res.cB, 40000);
});

test('환불(FULL 교재비 환불 옵션)은 청구 대상 교재비를 0으로 만든다', () => {
    const w = freshEngine();
    w.C['로봇과학'] = { 1: { t: 100000, b: 40000, m: 0, mh: '4,4,4' } };
    const e = {
        q: 1, g: 1, b: 1, n: 1, name: '테스트', course: '로봇과학',
        refunds: [{ ty: 'BEFORE', sessIdx: 0, ah: 0, bkRefTy: 'FULL' }],
        adjusts: [],
    };

    const res = w.recalcEnrollment(e);

    assert.equal(res.cT, 0);
    assert.equal(res.cB, 0);
});

test('일반 조정(adjusts)은 청구 타겟(작은 주머니) 금액 자체를 가감한다', () => {
    const w = freshEngine();
    w.C['로봇과학'] = { 1: { t: 100000, b: 0, m: 0, mh: '4,4,4' } };
    const e = {
        q: 1, g: 1, b: 1, n: 1, name: '테스트', course: '로봇과학',
        refunds: [],
        adjusts: [{ title: '추가청구', amtT: 20000, amtB: 0 }],
    };

    const res = w.recalcEnrollment(e);

    assert.equal(res.cT, 120000);
});

test('[예외설정] 표시가 붙은 조정 항목은 recalcEnrollment 금액 계산에서 제외된다', () => {
    const w = freshEngine();
    w.C['로봇과학'] = { 1: { t: 100000, b: 0, m: 0, mh: '4,4,4' } };
    const e = {
        q: 1, g: 1, b: 1, n: 1, name: '테스트', course: '로봇과학',
        refunds: [],
        adjusts: [{ title: '[예외설정] 전입조정', amtT: 999999, amtB: 0 }],
    };

    const res = w.recalcEnrollment(e);

    assert.equal(res.cT, 100000); // 예외설정 태그가 붙은 항목은 무시
});

// ── 헌법 제1조: 하반기(3~4분기)는 상반기 25만원 캡이 적용되지 않는다 ─────────

test('초3 지원금은 하반기(3~4분기)에는 상반기 25만원 캡 없이 연간 한도(50만원) 전체를 쓸 수 있다', () => {
    const w = freshEngine();
    w.C['체육'] = { 3: { t: 300000, b: 0, m: 0, mh: '4,4,4' } };
    w.E.push({ q: 3, g: 3, b: 1, n: 1, name: '홍길동', course: '체육', refunds: [], adjusts: [], seq: 0 });

    w.autoRunSet(true);

    const rec = w.Hs.find(h => h.q === 3 && h.nm === '홍길동');
    // 상반기였다면 25만원에서 막혔겠지만(위 상반기 테스트 참고), 3분기는 캡이 없어 30만원 전액 지원된다.
    assert.equal(rec.tc, 300000);
    assert.equal(rec.finT, 0);
});

// ── 헌법 제2조: 마감(closedSess)된 차수는 재계산해도 금액이 보존된다 ────────

test('마감(closedSess)된 차수는 재계산해도 금액이 그대로 유지되고, 예산에서 먼저 선공제된다', () => {
    const w = freshEngine();
    w.C['수학'] = { 1: { t: 200000, b: 0, m: 0, mh: '4,4' } };
    const e = { q: 1, g: 3, b: 1, n: 1, name: '박지민', course: '수학', refunds: [], adjusts: [], seq: 0 };
    w.E.push(e);
    const id = w.uid(e.g, e.b, e.n, e.name);

    // 1차수(sIdx=0)가 이미 지원금 10만원으로 마감 처리된 상태
    w.SysSet.closedSess = {
        '1_0': {
            [`${id}_수학`]: { cho3Amt: 100000, cho3Bk: 0, cho3Mt: 0, freeAmt: 0, freeBk: 0, freeMt: 0, selfAmt: 0, selfBk: 0, selfMt: 0 },
        },
    };

    w.autoRunSet(true);

    const rec = w.Hs.find(h => h.q === 1 && h.c === '수학');
    assert.equal(rec.sessDetails[0].tc, 100000); // 마감된 1차수는 잠금 데이터 그대로 복원
    // 남은 예산(25만-10만=15만)으로 2차수(10만)까지 전액 지원되어 총 20만원
    assert.equal(rec.sessDetails[1].tc, 100000);
    assert.equal(rec.tc, 200000);
});

// ── recalcEnrollment: 환불 유형별(DISEASE/STUDENT) 금액 계산 ────────────────

test('결석(DISEASE) 환불은 마스터 데이터의 일할 단가에 결석시수를 곱해 10원 단위로 올림 처리한다', () => {
    const w = freshEngine();
    w.C['미술'] = { 1: { t: 100000, b: 0, m: 0, mh: '4,4,4', unit: 1 } };
    w.M['미술'] = { 1: { inst_m: 40000, mgmt_m: 0, unit: 1 } };
    const e = {
        q: 1, g: 1, b: 1, n: 1, name: '테스트', course: '미술',
        refunds: [{ ty: 'DISEASE', sessIdx: 0, ah: 2, bkRefTy: 'NONE' }],
        adjusts: [],
    };

    const res = w.recalcEnrollment(e);

    // unitFee = ceil((40000+0)/(1*4)/10)*10 = 10000, 환불액 = ceil(10000*2/10)*10 = 20000
    assert.equal(res.cT, 80000);
});

test('포기(STUDENT) 환불은 진행 중인 차수를 구간합산(1/3 이하 진행 시 2/3 환불)하고, 이후 미진행 차수는 전액 환불한다', () => {
    const w = freshEngine();
    w.C['음악'] = { 1: { t: 120000, b: 0, m: 0, mh: '4,4,4' } };
    const e = {
        q: 1, g: 1, b: 1, n: 1, name: '테스트', course: '음악',
        // 1차수(시수 4) 중 1시간만 진행하고 포기 → 진행률 1/4 (<=1/3 구간)
        refunds: [{ ty: 'STUDENT', sessIdx: 0, ah: 1, bkRefTy: 'NONE' }],
        adjusts: [],
    };

    const res = w.recalcEnrollment(e);

    // 1차수 환불: ceil(40000*2/3/10)*10=26670, 2·3차수는 미진행이라 전액(40000+40000) 환불
    assert.equal(res.cT, 120000 - (26670 + 40000 + 40000));
});

// ── computeRefundBudgetSplit: 환불액의 예산별(초3/자유/자부담) 출처 분해 ─────

test('computeRefundBudgetSplit: 환불액은 초3 공제분/자유 공제분/자부담분 합계가 정확히 환불액과 일치한다', () => {
    const w = freshEngine();
    // 수강료 30만원(초3 상반기 한도 25만원 초과) + 교재비 2만원(한도 소진 후라 전액 자부담)
    w.C['바둑교실'] = { 1: { t: 300000, b: 20000, m: 0, mh: '4,4,4' } };
    w.E.push({ q: 1, g: 3, b: 1, n: 1, name: '김준혁', course: '바둑교실', refunds: [], adjusts: [], seq: 0 });
    w.autoRunSet(true);

    const before = w.Hs.find(h => h.q === 1 && h.nm === '김준혁');
    assert.equal(before.tc, 250000); // 수강료 25만원은 초3 한도까지 커버
    assert.equal(before.finT, 50000); // 한도 초과분은 자부담
    assert.equal(before.bc, 0); // 교재비는 초3 한도가 이미 소진돼 커버 못 함
    assert.equal(before.finB, 20000); // 교재비 전액 자부담

    const e = w.E[0];
    // 개시 전 전액 환불 + 교재비도 전액 환불
    e.refunds.push({ ty: 'BEFORE', sessIdx: 0, ah: 0, bkRefTy: 'FULL', bkRefAmt: 0, bkRefAmtM: 0, rt: 0, rb: 0, rm: 0 });
    w.autoRunSet(true);

    const r = e.refunds[0];
    assert.equal(r.rt, 300000);
    assert.equal(r.rb, 20000);

    const split = w.computeRefundBudgetSplit(e, r);
    assert.equal(split.cho3T, 250000); // 환불된 수강료 중 초3 예산에서 나온 몫
    assert.equal(split.selfT, 50000);  // 환불된 수강료 중 자부담에서 나온 몫
    assert.equal(split.freeT, 0);
    assert.equal(split.cho3B, 0);
    assert.equal(split.selfB, 20000);  // 환불된 교재비는 원래 전액 자부담이었으므로 자부담분으로

    // 보존 법칙: 3분할 합계는 항상 원래 환불액(rt/rb)과 정확히 일치해야 한다
    assert.equal(split.cho3T + split.freeT + split.selfT, r.rt);
    assert.equal(split.cho3B + split.freeB + split.selfB, r.rb);

    // computeRefundBudgetSplit 호출이 실제 상태(window.Hs)를 훼손하지 않고 그대로 복원하는지 확인
    const after = w.Hs.find(h => h.q === 1 && h.nm === '김준혁');
    assert.equal(after.tc, 0);
    assert.equal(after.finT, 0);
});

// ── 헌법 제1, 3조: 자유수강권에도 개별 강좌 override(overrideFree)가 동일하게 적용된다 ──

test('자유수강권도 강좌별 override(overrideFree)가 전역 규칙과 무관하게 독립 적용된다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'T,B' });
    w.C['A강좌'] = { 1: { t: 100000, b: 100000, m: 0, mh: '4,4,4' } };
    w.C['B강좌'] = { 1: { t: 100000, b: 100000, m: 0, mh: '4,4,4' } };
    // 자유수강권 연간 한도를 25만원으로 축소해, 강좌 처리 순서가 결과에 영향을 주도록 구성
    w.F.push({ g: 2, b: 1, n: 1, name: '이서연', startQ: 1, startSess: 0, courses: {}, transFreeAmt: 250000 });
    w.E.push({ q: 1, g: 2, b: 1, n: 1, name: '이서연', course: 'A강좌', overrideFree: 'B,T', refunds: [], adjusts: [], seq: 0 });
    w.E.push({ q: 1, g: 2, b: 1, n: 1, name: '이서연', course: 'B강좌', refunds: [], adjusts: [], seq: 1 });

    w.autoRunSet(true);

    const a = w.Hs.find(h => h.c === 'A강좌');
    const b = w.Hs.find(h => h.c === 'B강좌');
    assert.equal(a.bf, 100000); // A: override대로 교재비부터 전액
    assert.equal(a.tf, 50000);  // A: 남은 한도(25만-20만)만큼만 수강료로
    assert.equal(b.tf, 100000); // B: 전역 규칙(수강료 우선)대로 수강료 전액
    assert.equal(b.bf, 0);
});

// ── 자유수강권 강좌별 "지원시점"(F[].courses) 수동 설정이 실제 공제에 반영된다 ──

test('자유수강권 지원시점을 도중 차수·시수로 설정하면, 그 이전 구간은 차감되지 않고 자부담으로 남는다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'T,B' });
    w.C['가상마술'] = { 1: { t: 90000, b: 30000, m: 0, mh: '4,4,4' } };
    // 1분기 2차수(index=1)의 3시수째부터 지원 시작
    w.F.push({ g: 1, b: 1, n: 1, name: '서지훈', startQ: 1, startSess: 0, courses: { '가상마술': { q: 1, s: 1, h: 3 } } });
    w.E.push({ q: 1, g: 1, b: 1, n: 1, name: '서지훈', course: '가상마술', refunds: [], adjusts: [], seq: 0 });

    w.autoRunSet(true);

    const rec = w.Hs.find(h => h.q === 1 && h.c === '가상마술');
    // 1차수(index0): 지원시점 이전이므로 자유수강권 비대상, 전액 자부담
    assert.equal(rec.sessDetails[0].tf, 0);
    assert.equal(rec.sessDetails[0].finT, 30000);
    // 2차수(index1): 4시수 중 3시수째부터 대상 → (4-3+1)/4 = 절반만 대상
    assert.equal(rec.sessDetails[1].tf, 15000);
    assert.equal(rec.sessDetails[1].finT, 15000);
    // 3차수(index2): 지원시점 이후이므로 전액 대상
    assert.equal(rec.sessDetails[2].tf, 30000);
    assert.equal(rec.sessDetails[2].finT, 0);
    // 교재비는 지원시점을 수동 설정한 강좌에서는 항상 자부담(보수적 처리)
    assert.equal(rec.bf, 0);
    assert.equal(rec.finB, 30000);
});

test('자유수강권 지원시점을 설정하지 않은 강좌는 기존과 동일하게 1차수부터 전액 차감된다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'T,B' });
    w.C['가상마술'] = { 1: { t: 90000, b: 30000, m: 0, mh: '4,4,4' } };
    w.F.push({ g: 1, b: 1, n: 1, name: '서지훈', startQ: 1, startSess: 0, courses: {} });
    w.E.push({ q: 1, g: 1, b: 1, n: 1, name: '서지훈', course: '가상마술', refunds: [], adjusts: [], seq: 0 });

    w.autoRunSet(true);

    const rec = w.Hs.find(h => h.q === 1 && h.c === '가상마술');
    assert.equal(rec.tf, 90000);
    assert.equal(rec.bf, 30000);
    assert.equal(rec.finT, 0);
    assert.equal(rec.finB, 0);
});

test('개별/일괄 등록 화면에서 지정한 학생 단위 지원시점(startQ/startSess)도, 강좌별 override가 없으면 그대로 반영된다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'T,B' });
    w.C['테스트강좌'] = { 1: { t: 111000, b: 40000, m: 0, mh: '4,4,4' } };
    // "개별 수동 등록" 화면에서 1분기부터/3차수부터로 등록 (강좌별 지원시점은 따로 설정하지 않음, courses: {})
    w.F.push({ g: 8, b: 8, n: 1, name: '등록시점테스트', startQ: 1, startSess: 2, courses: {} });
    w.E.push({ q: 1, g: 8, b: 8, n: 1, name: '등록시점테스트', course: '테스트강좌', refunds: [], adjusts: [], seq: 0 });

    w.autoRunSet(true);

    const rec = w.Hs.find(h => h.q === 1 && h.c === '테스트강좌');
    // 3차수(index2) 이전은 비대상 → 자부담
    assert.equal(rec.sessDetails[0].tf, 0);
    assert.equal(rec.sessDetails[1].tf, 0);
    // 3차수부터 전액 대상
    assert.equal(rec.sessDetails[2].tf, 37000);
    assert.equal(rec.tf, 37000);
    assert.equal(rec.finT, 74000);
    // 교재비는 보수적으로 항상 자부담
    assert.equal(rec.bf, 0);
    assert.equal(rec.finB, 40000);
});

test('지원 시작 시점이 그 분기 첫 유효차수 1시수째(=교재비 부과 시점)와 같거나 이르면, 교재비/재료비도 공제 대상이 된다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'T,B' });
    w.C['새강좌'] = { 2: { t: 90000, b: 30000, m: 0, mh: '4,4,4' } };
    // 2분기 1차수(index0) 1시수째부터 지원 시작 = 분기 시작과 동시에 지원 시작
    w.F.push({ g: 1, b: 1, n: 1, name: '동시시작', startQ: 1, startSess: 0, courses: { '새강좌': { q: 2, s: 0, h: 1 } } });
    w.E.push({ q: 2, g: 1, b: 1, n: 1, name: '동시시작', course: '새강좌', refunds: [], adjusts: [], seq: 0 });

    w.autoRunSet(true);

    const rec = w.Hs.find(h => h.q === 2 && h.c === '새강좌');
    assert.equal(rec.tf, 90000);
    assert.equal(rec.bf, 30000); // 교재비도 전액 공제
    assert.equal(rec.finT, 0);
    assert.equal(rec.finB, 0);
});

test('지원 시작 시점이 첫 유효차수의 2시수째부터면(=이미 개시 이후), 교재비/재료비는 여전히 자부담이다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'T,B' });
    w.C['새강좌'] = { 2: { t: 90000, b: 30000, m: 0, mh: '4,4,4' } };
    w.F.push({ g: 1, b: 1, n: 1, name: '한시수늦음', startQ: 1, startSess: 0, courses: { '새강좌': { q: 2, s: 0, h: 2 } } });
    w.E.push({ q: 2, g: 1, b: 1, n: 1, name: '한시수늦음', course: '새강좌', refunds: [], adjusts: [], seq: 0 });

    w.autoRunSet(true);

    const rec = w.Hs.find(h => h.q === 2 && h.c === '새강좌');
    assert.equal(rec.bf, 0);
    assert.equal(rec.finB, 30000);
});

// ── 자유수강권 '육아기 근로시간 단축' 구분: 지원기간(종료시점) + 초3/자유 차감순서 역전 ──────

test('getFreeSessionEligible: 종료 경계가 있으면 그 차수까지만 대상이고 이후 차수는 전액 비대상이다', () => {
    const w = freshEngine();
    const override = { q: 1, s: 0, h: 1, endQ: 1, endS: 1 };
    assert.equal(w.getFreeSessionEligible(10000, 0, override, 1, 4), 10000); // 시작~종료 범위 내
    assert.equal(w.getFreeSessionEligible(10000, 1, override, 1, 4), 10000); // 종료 차수 자체는 전액 포함
    assert.equal(w.getFreeSessionEligible(10000, 2, override, 1, 4), 0);     // 종료 이후는 비대상
});

test('getFreeSessionEligible: 종료 분기가 지나면 그 이후 분기는 전체가 비대상이다', () => {
    const w = freshEngine();
    const override = { q: 1, s: 0, h: 1, endQ: 1, endS: 1 };
    assert.equal(w.getFreeSessionEligible(10000, 0, override, 2, 4), 0);
});

test('getFreeSessionEligible: endQ가 없으면 기존과 동일하게 시작 이후 무기한 대상이다(하위호환)', () => {
    const w = freshEngine();
    const override = { q: 1, s: 1, h: 1 };
    assert.equal(w.getFreeSessionEligible(10000, 5, override, 3, 4), 10000);
});

test('getFreeSessionEligible: 종료 차수 안에서도 endH(시수)까지만 비례 대상이고 그 이후는 비대상이다', () => {
    const w = freshEngine();
    // 1분기 2차수(index1)의 2시수째까지만 지원 종료
    const override = { q: 1, s: 0, h: 1, endQ: 1, endS: 1, endH: 2 };
    assert.equal(w.getFreeSessionEligible(10000, 0, override, 1, 4), 10000); // 종료 차수 이전은 전액 대상
    assert.equal(w.getFreeSessionEligible(40000, 1, override, 1, 4), 20000); // 종료 차수 자체는 (2/4)만 비례 대상
    assert.equal(w.getFreeSessionEligible(10000, 2, override, 1, 4), 0);     // 종료 차수 이후는 비대상
});

test('getFreeSessionEligible: endH가 없으면 기존과 동일하게 종료 차수 전체가 대상이다(하위호환)', () => {
    const w = freshEngine();
    const override = { q: 1, s: 0, h: 1, endQ: 1, endS: 1 };
    assert.equal(w.getFreeSessionEligible(40000, 1, override, 1, 4), 40000);
});

test('getFreeSessionEligible: 대상 시수 비율이 10원 단위 반올림 경계에 걸리는 조합에서도 부동소수점 오차 없이 정확히 반올림된다', () => {
    const w = freshEngine();
    // 350원 * (7/10)시수 = 정확히 245원 → 10원 단위 반올림 시 245는 24.5*10으로 딱 경계에
    // 걸리는 값이라, "분수를 먼저 나누고 곱하는" 예전 계산식에서는 부동소수점 오차로
    // 244.99999999999997이 되어 240원으로(반내림) 잘못 반올림되는 경우가 있었다.
    const override = { q: 1, s: 0, h: 1, endQ: 1, endS: 0, endH: 7 };
    assert.equal(w.getFreeSessionEligible(350, 0, override, 1, 10), 250);
});

test('육아기근로단축 대상 초3 학생은 지원기간 중 자유수강권이 초3이용권보다 먼저 소진된다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'T,B', cho3Priority: 'T,B' });
    w.C['보육강좌'] = { 1: { t: 90000, b: 0, m: 0, mh: '4,4,4' } };
    // 1분기 1차수부터 1분기 2차수(index1)까지만 지원(확인서 기간), 3차수(index2)는 기간 밖
    w.F.push({ g: 3, b: 1, n: 1, name: '육아자녀', startQ: 1, startSess: 0, endQ: 1, endSess: 1, reason: 'CHILDCARE_REDUCED', courses: {} });
    w.E.push({ q: 1, g: 3, b: 1, n: 1, name: '육아자녀', course: '보육강좌', refunds: [], adjusts: [], seq: 0 });

    w.autoRunSet(true);

    const rec = w.Hs.find(h => h.q === 1 && h.c === '보육강좌');
    // 기간 중(1,2차수)은 자유수강권이 먼저 소진 → 초3잔액은 그대로
    assert.equal(rec.sessDetails[0].tf, 30000); assert.equal(rec.sessDetails[0].tc, 0);
    assert.equal(rec.sessDetails[1].tf, 30000); assert.equal(rec.sessDetails[1].tc, 0);
    // 기간 밖(3차수)은 자유수강권 대상이 아니므로 초3이용권이 정상 소진(자부담으로 새지 않음)
    assert.equal(rec.sessDetails[2].tf, 0); assert.equal(rec.sessDetails[2].tc, 30000);
    assert.equal(rec.tf, 60000); assert.equal(rec.tc, 30000); assert.equal(rec.finT, 0);
});

test('육아기근로단축 종료 시수를 지정하면, 종료 차수 안에서도 시수 비례로 자유수강권/초3이 나뉘어 소진된다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'T,B', cho3Priority: 'T,B' });
    w.C['보육강좌3'] = { 1: { t: 90000, b: 0, m: 0, mh: '4,4,4' } };
    // 1분기 2차수(index1)의 2시수째까지만 지원(확인서 기간 종료가 차수 도중)
    w.F.push({ g: 3, b: 1, n: 1, name: '육아자녀3', startQ: 1, startSess: 0, endQ: 1, endSess: 1, endHour: 2, reason: 'CHILDCARE_REDUCED', courses: {} });
    w.E.push({ q: 1, g: 3, b: 1, n: 1, name: '육아자녀3', course: '보육강좌3', refunds: [], adjusts: [], seq: 0 });

    w.autoRunSet(true);

    const rec = w.Hs.find(h => h.q === 1 && h.c === '보육강좌3');
    // 1차수: 종료 차수 이전이므로 전액 자유수강권
    assert.equal(rec.sessDetails[0].tf, 30000); assert.equal(rec.sessDetails[0].tc, 0);
    // 2차수(종료 차수 자체): 4시수 중 2시수째까지만 대상 → 절반은 자유, 나머지 절반은 초3
    assert.equal(rec.sessDetails[1].tf, 15000); assert.equal(rec.sessDetails[1].tc, 15000);
    // 3차수: 종료 시점 이후이므로 전액 초3이용권(자부담으로 새지 않음)
    assert.equal(rec.sessDetails[2].tf, 0); assert.equal(rec.sessDetails[2].tc, 30000);
    assert.equal(rec.tf, 45000); assert.equal(rec.tc, 45000); assert.equal(rec.finT, 0);
});

test('육아기근로단축 지원기간이 끝난 다음 분기는 자동으로 자유수강권 대상에서 제외되고 초3이용권이 정상 소진된다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'T,B', cho3Priority: 'T,B' });
    w.C['보육강좌2'] = { 1: { t: 60000, b: 0, m: 0, mh: '4,4' }, 2: { t: 60000, b: 0, m: 0, mh: '4,4' } };
    // 지원기간은 1분기까지(1분기 2차수=index1)만
    w.F.push({ g: 3, b: 1, n: 1, name: '육아자녀2', startQ: 1, startSess: 0, endQ: 1, endSess: 1, reason: 'CHILDCARE_REDUCED', courses: {} });
    w.E.push({ q: 1, g: 3, b: 1, n: 1, name: '육아자녀2', course: '보육강좌2', refunds: [], adjusts: [], seq: 0 });
    w.E.push({ q: 2, g: 3, b: 1, n: 1, name: '육아자녀2', course: '보육강좌2', refunds: [], adjusts: [], seq: 0 });

    w.autoRunSet(true);

    const rec1 = w.Hs.find(h => h.q === 1 && h.c === '보육강좌2');
    assert.equal(rec1.tf, 60000); assert.equal(rec1.tc, 0); assert.equal(rec1.finT, 0);

    const rec2 = w.Hs.find(h => h.q === 2 && h.c === '보육강좌2');
    // 2분기는 지원기간(1분기까지) 밖 → 자유수강권 0원, 초3이용권이 정상적으로 소진
    assert.equal(rec2.tf, 0); assert.equal(rec2.tc, 60000); assert.equal(rec2.finT, 0);
});

test('구분(사유)을 지정하지 않은 일반 자유수강권 대상 초3 학생은 기존과 동일하게 초3이용권이 먼저 소진된다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'T,B', cho3Priority: 'T,B' });
    w.C['보육강좌3'] = { 1: { t: 90000, b: 0, m: 0, mh: '4,4,4' } };
    // reason 미지정(일반) — 저소득층 등 기존 사유와 동일하게 취급되어 순서 역전이 적용되지 않아야 한다
    w.F.push({ g: 3, b: 1, n: 1, name: '일반자유수강생', startQ: 1, startSess: 0, courses: {} });
    w.E.push({ q: 1, g: 3, b: 1, n: 1, name: '일반자유수강생', course: '보육강좌3', refunds: [], adjusts: [], seq: 0 });

    w.autoRunSet(true);

    const rec = w.Hs.find(h => h.q === 1 && h.c === '보육강좌3');
    // 초3이용권(25만원 한도)이 자유수강권보다 먼저 전액 소진되어 90000원 전부 tc로 처리된다
    assert.equal(rec.tc, 90000); assert.equal(rec.tf, 0); assert.equal(rec.finT, 0);
});
