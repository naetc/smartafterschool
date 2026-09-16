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

// ── 환불 시 e.baseline/e.frozenSplit: 강좌 간 회계 격리(peel-off) ────────────

test('한 강좌의 환불이 baseline/frozenSplit으로 고정되면, 같은 학생의 다른 강좌 분할은 전혀 바뀌지 않는다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'T,B' });
    w.C['A강좌'] = { 1: { t: 150000, b: 0, m: 0, mh: '4,4,4' } };
    w.C['B강좌'] = { 1: { t: 150000, b: 0, m: 0, mh: '4,4,4' } };
    w.F.push({ g: 1, b: 1, n: 1, name: '김철수', startQ: 1, startSess: 0, courses: {}, transFreeAmt: 200000 });
    const eA = { q: 1, g: 1, b: 1, n: 1, name: '김철수', course: 'A강좌', refunds: [], adjusts: [], seq: 0 };
    const eB = { q: 1, g: 1, b: 1, n: 1, name: '김철수', course: 'B강좌', refunds: [], adjusts: [], seq: 1 };
    w.E.push(eA, eB);
    w.autoRunSet(true);

    const bBefore = w.Hs.find(h => h.c === 'B강좌');
    assert.equal(bBefore.tf, 50000);   // 지갑 20만 - A가 먼저 가져간 15만 = 남은 5만
    assert.equal(bBefore.finT, 100000);

    // A강좌를 개시 전 전액 환불(포기, ah=0) 처리 — 실제 UI 콜사이트(addConsoleRef)와 동일한 순서로 재현
    w.captureEnrollmentBaseline(eA);
    eA.refunds.push({ sessIdx: 0, ty: 'STUDENT', ah: 0, bkRefTy: 'NONE' });
    w.updateFrozenSplit(eA);
    assert.equal(eA.frozenSplit.tf, 0);
    assert.equal(eA.frozenSplit.finT, 0);

    w.autoRunSet(true);

    const bAfter = w.Hs.find(h => h.c === 'B강좌');
    assert.equal(bAfter.tf, 50000);    // A강좌 환불로 15만원의 여유가 생겨도 B강좌로 새지 않는다
    assert.equal(bAfter.finT, 100000);
    const aAfter = w.Hs.find(h => h.c === 'A강좌');
    assert.equal(aAfter.tf, 0);
    assert.equal(aAfter.finT, 0);
});

test('환불 차감 순서(peel-off): 일반 학생은 자부담→자유수강권→초3지원금 순으로 baseline에서 빠진다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'T,B', cho3Priority: 'T,B', cho3Annual: 60000, cho3H1Cap: 60000, freeAnnual: 600000 });
    w.C['댄스교실'] = { 1: { t: 100000, b: 0, m: 0, mh: '4,4,4', unit: 1 } };
    // 결석 단가(unitFee)가 정확히 55000원이 되도록 구성: ceil(220000/(1*4)/10)*10 = 55000
    w.M['댄스교실'] = { 1: { inst_m: 220000, mgmt_m: 0, unit: 1 } };
    w.F.push({ g: 3, b: 1, n: 1, name: '정민준', startQ: 1, startSess: 0, courses: {}, transFreeAmt: 600000 });
    const e = { q: 1, g: 3, b: 1, n: 1, name: '정민준', course: '댄스교실', refunds: [], adjusts: [], seq: 0 };
    w.E.push(e);
    w.autoRunSet(true);

    const before = w.Hs.find(h => h.c === '댄스교실');
    assert.equal(before.tc, 60000);   // 초3 한도(6만)까지 먼저 채움
    assert.equal(before.tf, 40000);   // 나머지는 자유수강권
    assert.equal(before.finT, 0);

    w.captureEnrollmentBaseline(e);
    // 결석(1시수) 환불 = 55000원 감소
    e.refunds.push({ sessIdx: 0, ty: 'DISEASE', ah: 1, bkRefTy: 'NONE' });
    w.updateFrozenSplit(e);

    // 자부담(0)은 뺄 게 없어 그대로 통과 → 자유수강권(4만)이 먼저 전액 빠지고,
    // 남은 15000이 초3지원금(6만)에서 빠짐 → 자유수강권부터 소진되는 게 확인 포인트
    assert.equal(e.frozenSplit.tf, 0);
    assert.equal(e.frozenSplit.tc, 45000);
    assert.equal(e.frozenSplit.finT, 0);
});

test('환불 차감 순서(peel-off): 육아기근로단축 학생은 자부담→초3지원금→자유수강권 순으로 반대로 빠진다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'T,B', cho3Priority: 'T,B', cho3Annual: 500000, cho3H1Cap: 250000, freeAnnual: 60000 });
    w.C['보육댄스'] = { 1: { t: 100000, b: 0, m: 0, mh: '4', unit: 1 } };
    w.M['보육댄스'] = { 1: { inst_m: 220000, mgmt_m: 0, unit: 1 } }; // 위와 동일하게 unitFee=55000
    w.F.push({ g: 3, b: 1, n: 1, name: '육아자녀4', startQ: 1, startSess: 0, endQ: 1, endSess: 0, reason: 'CHILDCARE_REDUCED', courses: {} });
    const e = { q: 1, g: 3, b: 1, n: 1, name: '육아자녀4', course: '보육댄스', refunds: [], adjusts: [], seq: 0 };
    w.E.push(e);
    w.autoRunSet(true);

    const before = w.Hs.find(h => h.c === '보육댄스');
    assert.equal(before.tf, 60000);   // 육아기단축이라 자유수강권(한도 6만)이 먼저 채워짐
    assert.equal(before.tc, 40000);   // 나머지는 초3지원금
    assert.equal(before.finT, 0);

    w.captureEnrollmentBaseline(e);
    e.refunds.push({ sessIdx: 0, ty: 'DISEASE', ah: 1, bkRefTy: 'NONE' }); // 55000원 감소
    w.updateFrozenSplit(e);

    // 일반 학생과 반대로, 초3지원금(4만)이 먼저 전액 빠지고 남은 15000이 자유수강권(6만)에서 빠짐
    assert.equal(e.frozenSplit.tc, 0);
    assert.equal(e.frozenSplit.tf, 45000);
    assert.equal(e.frozenSplit.finT, 0);
});

test('환불을 추가/삭제해도 frozenSplit은 매번 baseline 기준으로 다시 계산되고, 마지막 환불을 지우면 baseline/frozenSplit이 삭제되어 라이브로 복귀한다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'T,B' });
    w.C['미술'] = { 1: { t: 80000, b: 0, m: 0, mh: '4,4,4', unit: 1 } };
    w.M['미술'] = { 1: { inst_m: 40000, mgmt_m: 0, unit: 1 } }; // unitFee = ceil(40000/4/10)*10 = 10000
    w.F.push({ g: 1, b: 1, n: 1, name: '이하늘', startQ: 1, startSess: 0, courses: {}, transFreeAmt: 80000 });
    const e = { q: 1, g: 1, b: 1, n: 1, name: '이하늘', course: '미술', refunds: [], adjusts: [], seq: 0 };
    w.E.push(e);
    w.autoRunSet(true);
    const liveBefore = { tf: w.Hs.find(h => h.c === '미술').tf, finT: w.Hs.find(h => h.c === '미술').finT };
    assert.equal(liveBefore.tf, 80000);
    assert.equal(liveBefore.finT, 0);

    w.captureEnrollmentBaseline(e);
    e.refunds.push({ sessIdx: 0, ty: 'DISEASE', ah: 1, bkRefTy: 'NONE' }); // 소액 결석 환불 1건
    w.updateFrozenSplit(e);
    const afterOne = { ...e.frozenSplit };
    assert.ok(afterOne.tf < 80000); // 뭔가는 줄어들어 있어야 함

    e.refunds.push({ sessIdx: 1, ty: 'DISEASE', ah: 1, bkRefTy: 'NONE' }); // 환불 2건째 추가
    w.updateFrozenSplit(e);
    assert.ok(e.frozenSplit.tf < afterOne.tf); // 누적 반영되어 더 줄어듦

    e.refunds.pop(); // 2건째 삭제 → 1건째만 있었을 때와 정확히 같아야 함(baseline부터 재계산이므로)
    w.updateFrozenSplit(e);
    assert.equal(e.frozenSplit.tf, afterOne.tf);
    assert.equal(e.frozenSplit.finT, afterOne.finT);

    e.refunds.pop(); // 마지막 환불도 삭제 → baseline/frozenSplit이 지워지고 라이브로 복귀
    w.updateFrozenSplit(e);
    assert.equal(e.baseline, undefined);
    assert.equal(e.frozenSplit, undefined);

    w.autoRunSet(true);
    const rec = w.Hs.find(h => h.c === '미술');
    assert.equal(rec.tf, liveBefore.tf);
    assert.equal(rec.finT, liveBefore.finT);
});

test('실제 사례 재현(박하율/쿠키&클레이 3분기 결석 환불): 수강료는 자부담에서, 교재비는 자부담이 0이라 자유수강권에서 정확히 빠지고, 다른 강좌는 전혀 안 바뀐다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'B,T' });
    w.C['과학실험(A)'] = { 3: { t: 77000, b: 46750, m: 0, mh: '3,3,4' } };
    w.C['방송댄스(A)'] = { 3: { t: 93000, b: 0, m: 0, mh: '3,3,4' } };
    w.C['쿠키&클레이(A)'] = { 3: { t: 70000, b: 35000, m: 0, mh: '3,3,4', unit: 1 } };
    w.M['쿠키&클레이'] = { 3: { inst_m: 27000, mgmt_m: 1000, unit: 1 } }; // unitFee=ceil(28000/4/10)*10=7000
    w.F.push({ g: 1, b: 1, n: 6, name: '박하율', startQ: 1, startSess: 2, courses: {}, transFreeAmt: 155500 });
    const eSci = { q: 3, g: 1, b: 1, n: 6, name: '박하율', course: '과학실험(A)', refunds: [], adjusts: [], seq: 0 };
    const eDance = { q: 3, g: 1, b: 1, n: 6, name: '박하율', course: '방송댄스(A)', refunds: [], adjusts: [], seq: 1 };
    const eCookie = { q: 3, g: 1, b: 1, n: 6, name: '박하율', course: '쿠키&클레이(A)', refunds: [], adjusts: [], seq: 3 };
    w.E.push(eSci, eDance, eCookie);
    w.autoRunSet(true);

    const sciBefore = w.Hs.find(h => h.c === '과학실험(A)');
    const danceBefore = w.Hs.find(h => h.c === '방송댄스(A)');
    assert.equal(sciBefore.finT, 3250);
    assert.equal(danceBefore.finT, 93000);

    w.captureEnrollmentBaseline(eCookie);
    eCookie.refunds.push({ sessIdx: 0, ty: 'DISEASE', ah: 1, reqBk: false, bkRefTy: 'MANUAL', bkRefAmt: 3500, bkRefAmtM: 0 });
    w.updateFrozenSplit(eCookie);

    assert.equal(eCookie.frozenSplit.finT, 63000); // 70000 - 7000
    assert.equal(eCookie.frozenSplit.bf, 31500);   // 35000 - 3500 (자부담 0원이라 자유수강권에서 스필오버)

    w.autoRunSet(true);
    const sciAfter = w.Hs.find(h => h.c === '과학실험(A)');
    const danceAfter = w.Hs.find(h => h.c === '방송댄스(A)');
    assert.equal(sciAfter.finT, sciBefore.finT);
    assert.equal(sciAfter.tf, sciBefore.tf);
    assert.equal(danceAfter.finT, danceBefore.finT);
    assert.equal(danceAfter.tf, danceBefore.tf);
});

test('computeRefundBudgetSplit: frozenSplit이 있는 강좌는 환불을 빼고 다시 계산하지 않고 baseline peel 차이로 정확히 구한다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'B,T' });
    w.C['쿠키&클레이(A)'] = { 3: { t: 70000, b: 35000, m: 0, mh: '3,3,4', unit: 1 } };
    w.M['쿠키&클레이'] = { 3: { inst_m: 27000, mgmt_m: 1000, unit: 1 } }; // unitFee=7000
    w.F.push({ g: 1, b: 1, n: 6, name: '박하율', startQ: 1, startSess: 2, courses: {}, transFreeAmt: 35000 });
    const e = { q: 3, g: 1, b: 1, n: 6, name: '박하율', course: '쿠키&클레이(A)', refunds: [], adjusts: [], seq: 0 };
    w.E.push(e);
    w.autoRunSet(true);

    w.captureEnrollmentBaseline(e);
    e.refunds.push({ sessIdx: 0, ty: 'DISEASE', ah: 1, reqBk: false, bkRefTy: 'MANUAL', bkRefAmt: 3500, bkRefAmtM: 0 });
    w.updateFrozenSplit(e);
    w.autoRunSet(true);

    const r = e.refunds[0];
    assert.equal(r.rt, 7000); assert.equal(r.rb, 3500);
    const split = w.computeRefundBudgetSplit(e, r);
    // 수정 전 버그였다면 freeB가 음수(예: -28000) 같은 말이 안 되는 값이 나왔었다.
    assert.equal(split.selfT, 7000);  // 수강료 환불은 전액 자부담에서
    assert.equal(split.freeB, 3500);  // 교재비 환불은 전액 자유수강권에서(자부담이 0이라 스필오버)
    assert.equal(split.cho3T, 0); assert.equal(split.cho3B, 0); assert.equal(split.freeT, 0); assert.equal(split.selfB, 0);
    // 호출 후 frozenSplit이 그대로 보존돼야 함(부작용 없음)
    assert.equal(e.frozenSplit.bf, 31500);
});

test('getCarryForwardAmount: baseline과 frozenSplit의 차이(환불로 아낀 금액)를 정확히 합산한다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'B,T' });
    w.C['쿠키&클레이(A)'] = { 3: { t: 70000, b: 35000, m: 0, mh: '3,3,4', unit: 1 } };
    w.M['쿠키&클레이'] = { 3: { inst_m: 27000, mgmt_m: 1000, unit: 1 } };
    w.F.push({ g: 1, b: 1, n: 6, name: '박하율', startQ: 1, startSess: 2, courses: {}, transFreeAmt: 35000 });
    const e = { q: 3, g: 1, b: 1, n: 6, name: '박하율', course: '쿠키&클레이(A)', refunds: [], adjusts: [], seq: 0 };
    w.E.push(e);
    w.autoRunSet(true);

    w.captureEnrollmentBaseline(e);
    e.refunds.push({ sessIdx: 0, ty: 'DISEASE', ah: 1, reqBk: false, bkRefTy: 'MANUAL', bkRefAmt: 3500, bkRefAmtM: 0 });
    w.updateFrozenSplit(e);
    w.autoRunSet(true);

    const id = w.uid(1, 1, 6, '박하율');
    const carry = w.getCarryForwardAmount(w.Ld[id], 3);
    assert.equal(carry.free, 3500); // 교재비 환불 3500원이 이번 분기 잔액엔 안 뜨고 이월 대상으로 잡힘
    assert.equal(carry.cho3, 0);
});

test('closedSess로 일부 차수가 마감된 강좌에 frozenSplit이 생겨도 예산에서 이중으로 차감되지 않는다', () => {
    const w = freshEngine({ deductMode: 'ITEM_FIRST', freePriority: 'T,B' });
    w.C['체육'] = { 1: { t: 80000, b: 0, m: 0, mh: '4,4' } };
    w.F.push({ g: 1, b: 1, n: 1, name: '한도영', startQ: 1, startSess: 0, courses: {}, transFreeAmt: 80000 });
    const e = { q: 1, g: 1, b: 1, n: 1, name: '한도영', course: '체육', refunds: [], adjusts: [], seq: 0 };
    w.E.push(e);
    w.autoRunSet(true);

    // 1차수(index0)를 그 시점 값 그대로 마감(closedSess) 처리
    const rec = w.Hs.find(h => h.c === '체육');
    w.SysSet.closedSess['1_0'] = {
        [`${w.uid(e.g, e.b, e.n, e.name)}_체육`]: {
            cho3Amt: rec.sessDetails[0].tc, cho3Bk: rec.sessDetails[0].bc, cho3Mt: 0,
            freeAmt: rec.sessDetails[0].tf, freeBk: rec.sessDetails[0].bf, freeMt: 0,
            selfAmt: rec.sessDetails[0].finT, selfBk: rec.sessDetails[0].finB, selfMt: 0,
        },
    };

    // 2차수(아직 열려있음)에 환불 발생 → frozenSplit 생성
    w.captureEnrollmentBaseline(e);
    e.refunds.push({ sessIdx: 1, ty: 'DISEASE', ah: 1, bkRefTy: 'NONE' });
    w.updateFrozenSplit(e);

    w.autoRunSet(true);
    const after = w.Hs.find(h => h.c === '체육');
    // 이중 차감이 없다면, 소비 총액(q_tf 등)이 원래 목표(cT)를 절대 넘지 않는다
    assert.ok(after.tf + after.finT <= after.sT + 1);
    // 마감된 1차수는 lockData 그대로 유지되어야 한다
    assert.equal(after.sessDetails[0].tf, rec.sessDetails[0].tf);
    assert.equal(after.sessDetails[0].finT, rec.sessDetails[0].finT);
});

// ── computeRefundBudgetSplit의 "가정법" 경로가 실제 데이터를 오염시키지 않아야 한다 ──
//    frozenSplit이 없는(라이브) 강좌에서는 "이 환불이 없었다면?"을 계산하려고 환불을 잠깐
//    빼고 autoRunSet을 다시 돌린다. 그런데 autoRunSet은 recalcEnrollment를 거치며 각 환불
//    객체의 r.rt/r.rb/r.rm을 덮어쓴다. 환불을 도로 끼워 넣기만 하고 재계산을 안 하면, 남은
//    환불들의 rt/rb가 "그 환불이 없던 세계"의 값인 채로 남아버린다. 그 상태로 사용자가
//    [백업]을 누르면 틀린 금액이 JSON에 박제된다.
test('computeRefundBudgetSplit(라이브 경로)은 다른 환불들의 rt/rb를 오염시키지 않고 원래대로 되돌린다', () => {
    const w = freshEngine();
    w.C['바둑교실'] = { 1: { t: 300000, b: 20000, m: 0, mh: '4,4,4' } };
    w.E.push({ q: 1, g: 3, b: 1, n: 1, name: '김준혁', course: '바둑교실', refunds: [], adjusts: [], seq: 0 });

    const e = w.E[0];
    // 환불 2건. 2번째는 1번째가 이미 깎아먹고 남은 잔액까지만 환불받는다(누적 상한).
    e.refunds.push({ ty: 'BEFORE', sessIdx: 0, ah: 0, bkRefTy: 'MANUAL', bkRefAmt: 15000, bkRefAmtM: 0, rt: 0, rb: 0, rm: 0 });
    e.refunds.push({ ty: 'BEFORE', sessIdx: 0, ah: 0, bkRefTy: 'MANUAL', bkRefAmt: 15000, bkRefAmtM: 0, rt: 0, rb: 0, rm: 0 });
    w.autoRunSet(true);

    // 기준값: 수강료는 1건째가 전액(30만) 가져가고 2건째는 0, 교재비는 15000 + 남은 5000
    assert.equal(e.refunds[0].rt, 300000);
    assert.equal(e.refunds[1].rt, 0);
    assert.equal(e.refunds[0].rb, 15000);
    assert.equal(e.refunds[1].rb, 5000);

    const snapshot = e.refunds.map(r => ({ rt: r.rt, rb: r.rb, rm: r.rm }));

    // 1번째 환불의 출처를 조회 — 내부적으로 그 환불을 뺀 채 한 번 더 계산한다.
    w.computeRefundBudgetSplit(e, e.refunds[0]);

    // 조회는 '읽기'일 뿐이므로 환불 금액은 단 1원도 달라지면 안 된다.
    // (버그가 있으면 2번째 환불이 "1번째가 없던 세계"의 값 rt=300000, rb=15000으로 남는다)
    assert.deepEqual(e.refunds.map(r => ({ rt: r.rt, rb: r.rb, rm: r.rm })), snapshot);

    // 환불 배열 자체도 원래 순서·개수 그대로여야 한다.
    assert.equal(e.refunds.length, 2);
});

// ── 환불 격리 스냅샷에는 규칙 버전이 함께 박혀야 한다 ──
//    baseline은 "그때의 엔진이 계산한 결과"를 데이터에 영구 저장하는 값이라, 나중에 차감
//    규칙이 바뀌면 옛 규칙으로 찍힌 스냅샷과 구분할 수단이 필요하다. 지금은 분기 처리를
//    하지 않지만, 그 판단 근거가 되는 ver가 빠지면 나중에 되돌릴 방법이 없다.
test('captureEnrollmentBaseline은 baseline에 규칙 버전(ver)을 함께 기록한다', () => {
    const w = freshEngine();
    w.C['바둑교실'] = { 1: { t: 120000, b: 20000, m: 0, mh: '4,4,4' } };
    w.E.push({ q: 1, g: 3, b: 1, n: 1, name: '김준혁', course: '바둑교실', refunds: [], adjusts: [], seq: 0 });
    w.autoRunSet(true);

    const e = w.E[0];
    w.captureEnrollmentBaseline(e);

    assert.equal(e.baseline.ver, w.BASELINE_VER);
    assert.equal(typeof e.baseline.ver, 'number');
    // 금액 필드는 종전과 동일하게 남아 있어야 한다(ver 추가가 기존 값을 밀어내면 안 됨).
    assert.equal(e.baseline.tc, 120000);
    assert.equal(e.baseline.bc, 20000);
});

// ── 교육비 청구서: 차수별 청구액(sessionT)은 환불이 실제로 영향을 준 차수에서만 깎인다 ──
// 예전엔 "환불 후 총액을 원래 시수 비율로 통째로 재분배"해서, 결석/포기가 없었던 다른
// 차수까지 덩달아 줄어드는 청구서 오류가 있었다(실제 신고로 발견). 아래 테스트는 그
// 오류가 재발하지 않는지 확인한다.

test('결석(DISEASE) 환불: 결석이 발생한 그 차수만 차수별 청구액이 줄고, 다른 차수는 원래 금액 그대로다', () => {
    const w = freshEngine();
    // 박하율/쿠키&클레이 3분기 실제 사례: t=70000, mh=3/3/4, 1차수 1시수 결석 → 환불 7000원
    w.C['쿠키&클레이(A)'] = { 3: { t: 70000, b: 0, m: 0, mh: '3,3,4', unit: 1 } };
    w.M['쿠키&클레이'] = { 3: { inst_m: 27000, mgmt_m: 1000, unit: 1 } }; // unitFee=7000
    const e = {
        q: 3, g: 1, b: 1, n: 6, name: '박하율', course: '쿠키&클레이(A)',
        refunds: [{ ty: 'DISEASE', sessIdx: 0, ah: 1, bkRefTy: 'NONE' }],
        adjusts: [],
    };

    const res = w.recalcEnrollment(e);
    assert.equal(res.cT, 63000); // 총액은 종전과 동일(70000-7000)
    // 원래(환불 없음) 차수별 청구는 21000/21000/28000 — 1차수만 21000→14000으로 줄고,
    // 2·3차수는 결석과 무관하므로 21000/28000 그대로여야 한다.
    assert.deepEqual(Array.from(res.sessionT), [14000, 21000, 28000]);
});

test('포기(STUDENT) 환불: 포기 이전 차수는 원래 금액 그대로, 포기한 차수는 부분액, 이후 차수는 0원이다', () => {
    const w = freshEngine();
    // 김태수/로봇과학(B) 실제 사례: t=77000, mh=4/4/3, 2차수(index1)에서 포기(ah=0, 그 차수 전액 환불)
    w.C['로봇과학(B)'] = { 1: { t: 77000, b: 0, m: 0, mh: '4,4,3' } };
    const e = {
        q: 1, g: 3, b: 2, n: 24, name: '김태수', course: '로봇과학(B)',
        refunds: [{ ty: 'STUDENT', sessIdx: 1, ah: 0, bkRefTy: 'NONE' }],
        adjusts: [],
    };

    const res = w.recalcEnrollment(e);
    assert.equal(res.cT, 28000); // 77000 - 49000(2차 전액 28000 + 3차 전액 21000)
    // 1차수(포기 이전)는 정상 수강했으니 원래 금액 28000 그대로, 2차수(포기, ah=0)는 0원,
    // 3차수(미진행)도 0원 — 이전엔 셋 다 10180/10180/7640으로 잘못 줄어들었었다.
    assert.deepEqual(Array.from(res.sessionT), [28000, 0, 0]);
});

test('포기(STUDENT) 환불(부분 진행): 진행률에 따라 그 차수만 부분액으로 줄고, 이전 차수는 그대로다', () => {
    const w = freshEngine();
    // 장현우/방송댄스(A) 실제 사례: t=85250, mh=4/3/4, 3차수(마지막, index2)에서 1시수만 참여 후 포기
    w.C['방송댄스(A)'] = { 1: { t: 85250, b: 0, m: 0, mh: '4,3,4' } };
    const e = {
        q: 1, g: 1, b: 1, n: 17, name: '장현우', course: '방송댄스(A)',
        refunds: [{ ty: 'STUDENT', sessIdx: 2, ah: 1, bkRefTy: 'NONE' }],
        adjusts: [],
    };

    const res = w.recalcEnrollment(e);
    // 3차수(31000) 중 진행률 1/4(<=1/3)이라 2/3 환불(20670원), 미진행 이후 차수 없음(마지막 차수라).
    assert.equal(res.cT, 85250 - 20670);
    // 1·2차수는 포기와 무관하니 원래 금액(31000/23250) 그대로, 3차수만 31000-20670=10330으로 줄어야 한다.
    assert.deepEqual(Array.from(res.sessionT), [31000, 23250, 10330]);
});

test('개시 전(BEFORE) 환불: 모든 차수의 청구액이 0원이 된다', () => {
    const w = freshEngine();
    w.C['미술'] = { 1: { t: 90000, b: 0, m: 0, mh: '4,4,4' } };
    const e = {
        q: 1, g: 1, b: 1, n: 1, name: '테스트', course: '미술',
        refunds: [{ ty: 'BEFORE', sessIdx: 0, ah: 0, bkRefTy: 'NONE' }],
        adjusts: [],
    };
    const res = w.recalcEnrollment(e);
    assert.equal(res.cT, 0);
    assert.deepEqual(Array.from(res.sessionT), [0, 0, 0]);
});

test('sessionT는 autoRunSet을 거친 실제 화면 표시값(sessDetails[].tT)에도 그대로 반영된다', () => {
    const w = freshEngine();
    w.C['쿠키&클레이(A)'] = { 3: { t: 70000, b: 0, m: 0, mh: '3,3,4', unit: 1 } };
    w.M['쿠키&클레이'] = { 3: { inst_m: 27000, mgmt_m: 1000, unit: 1 } };
    w.E.push({
        q: 3, g: 1, b: 1, n: 6, name: '박하율', course: '쿠키&클레이(A)',
        refunds: [{ ty: 'DISEASE', sessIdx: 0, ah: 1, bkRefTy: 'NONE' }],
        adjusts: [], seq: 0,
    });
    w.autoRunSet(true);
    const rec = w.Hs.find(h => h.c === '쿠키&클레이(A)');
    assert.equal(rec.sessDetails[0].tT, 14000);
    assert.equal(rec.sessDetails[1].tT, 21000);
    assert.equal(rec.sessDetails[2].tT, 28000);
});
