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
