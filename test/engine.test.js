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
