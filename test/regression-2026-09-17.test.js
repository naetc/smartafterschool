/* ==========================================================================
   파일닉네임: test/regression-2026-09-17.test.js
   기능설명: 퍼즈 테스트 엔진(test/fuzz-engine.js)으로 찾아낸 차감 연산 결함 5건의
             재발 방지 테스트. 각 테스트는 "수정 전이라면 반드시 실패하는" 최소 시나리오다.

   ⚠ 이 파일의 테스트가 깨지면 core-rules.md의 헌법 조항이 깨진 것이다. 금액을 기대값에
     맞추려 하지 말고, 왜 깨졌는지부터 확인할 것.

   [발견 경위] 2026-09-17. 무작위 시나리오 1,000건 중 667건에서 불변식 위반이 나왔고,
   원인을 추적해 아래 5건으로 좁혔다. 실제 운영 백업 4건(6월/8월/9월/마이그레이션)의
   총액은 수정 전후가 1원도 다르지 않았다 — 특정 편집 순서에서만 터지는 잠복 결함이었다.
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { freshEngine } = require('./harness');

// ⚠ 여기서 재연산 순서를 직접 흉내내면 안 된다. 결함 2는 "commitState가 동결값을 다시
//   맞춰주지 않는다"는 것이 본질이라, 테스트가 자기 손으로 updateFrozenSplit을 부르면
//   버그가 가려져서 수정 전 코드로도 통과해버린다(실제로 그랬다).
//   그래서 화면과 똑같이 실제 window.commitState를 그대로 호출한다.
function commit(w, fn) {
    w.commitState(fn || (() => {}), null, '테스트');
}

// 환불 1건을 실제 UI(addConsoleRef)와 같은 순서로 등록한다.
function addRefund(w, e, refund) {
    commit(w, () => {
        w.captureEnrollmentBaseline(e); // 반드시 push 이전에
        e.refunds.push(refund);
        w.updateFrozenSplit(e);
    });
}

// ── 결함 1: 워터폴 차감액이 음수가 되어 지원금이 벗겨지고 예산이 늘어남 ──────────
test('결함1: 환불 강좌의 교재비를 정정해도, 이미 배정된 수강료 지원금이 벗겨지지 않는다', () => {
    const w = freshEngine({ cho3Annual: 500000 });
    w.C['환불강좌(A)'] = { 1: { t: 90000, b: 10000, m: 0, mh: '4,4,4', unit: 1 } };
    w.M['환불강좌'] = { 1: { inst_m: 30000, mgmt_m: 1000, unit: 1 } };
    const e = { q: 1, g: 3, b: 1, n: 1, name: '홍길동', course: '환불강좌(A)', seq: 0, refunds: [], adjusts: [] };
    w.E.push(e);
    w.autoRunSet(true);

    addRefund(w, e, { ty: 'STUDENT', sessIdx: 2, ah: 0, bkRefTy: 'NONE', bkRefAmt: 0 });
    const before = w.Hs.find(h => h.e === e);
    assert.equal(before.tc, 60000, '환불 직후: 수강료 60,000원이 초3에서 나가야 한다');
    assert.equal(before.bc, 10000);
    assert.equal(before.finT, 0);

    // 2스텝에서 교재비만 10,000 → 14,000원으로 정정 (실무에서 흔한 동작)
    w.C['환불강좌(A)'][1].b = 14000;
    commit(w);

    const after = w.Hs.find(h => h.e === e);
    // 수정 전에는 tc가 60,000 → 0으로 무너지고 자부담이 60,000원 생겼다.
    assert.equal(after.tc, 60000, '교재비를 고쳤다고 수강료 지원금이 사라지면 안 된다');
    assert.equal(after.finT, 0, '수강료 자부담이 생기면 안 된다');
    // 예산 잔액이 거꾸로 늘어나(=돈이 복사되어) 다른 강좌로 새면 안 된다.
    const L = Object.values(w.Ld)[0];
    assert.ok(L.qBal[1].cB <= 500000 - (after.tc + after.bc), '예산 잔액이 실제 사용액과 모순되면 안 된다');
});

test('결함1: 차감 단계는 어떤 경우에도 예산 잔액을 늘리지 않는다(음수 차감 금지)', () => {
    const w = freshEngine({ cho3Annual: 500000 });
    w.C['가(A)'] = { 1: { t: 90000, b: 10000, m: 0, mh: '4,4,4', unit: 1 } };
    w.C['나(B)'] = { 1: { t: 50000, b: 0, m: 0, mh: '4,4,4', unit: 1 } };
    w.M['가'] = { 1: { inst_m: 30000, mgmt_m: 1000, unit: 1 } };
    w.M['나'] = { 1: { inst_m: 16000, mgmt_m: 600, unit: 1 } };
    const st = { g: 3, b: 1, n: 1, name: '홍길동' };
    const eA = { ...st, q: 1, course: '가(A)', seq: 0, refunds: [], adjusts: [] };
    const eB = { ...st, q: 1, course: '나(B)', seq: 1, refunds: [], adjusts: [] };
    w.E.push(eA, eB);
    w.autoRunSet(true);

    addRefund(w, eA, { ty: 'STUDENT', sessIdx: 2, ah: 0, bkRefTy: 'NONE', bkRefAmt: 0 });
    const balBefore = Object.values(w.Ld)[0].qBal[1].cB;

    // 교재비를 4,000원 올렸다 = 돈을 더 쓴다. 예산 잔액은 같거나 줄어야지 늘어날 수 없다.
    w.C['가(A)'][1].b = 14000;
    commit(w);
    const balAfter = Object.values(w.Ld)[0].qBal[1].cB;

    // 수정 전에는 음수 차감이 예산을 되돌려줘서 잔액이 100,000 → 166,000원으로 늘어났고,
    // 그 66,000원이 같은 학생의 다른 강좌로 새어 나갔다.
    assert.ok(balAfter <= balBefore,
        `청구액을 올렸는데 예산 잔액이 늘어났다 (${balBefore} → ${balAfter}). 차감 단계가 예산에 돈을 돌려주고 있다.`);

    // 환불과 무관한 나(B) 강좌가 영향을 받으면 안 된다(환불 격리 요구사항).
    const hB = w.Hs.find(h => h.e === eB);
    assert.equal(hB.tc, 50000);
    assert.equal(hB.finT, 0);
});

// ── 결함 2: 조정 등록 시 frozenSplit이 갱신되지 않아 자부담이 음수 ───────────────
test('결함2: 환불 강좌에 감액 조정을 넣어도 자부담이 음수가 되지 않는다', () => {
    const w = freshEngine({ cho3Annual: 500000 });
    w.C['테스트(A)'] = { 1: { t: 90000, b: 0, m: 0, mh: '4,4,4', unit: 1 } };
    w.M['테스트'] = { 1: { inst_m: 30000, mgmt_m: 1000, unit: 1 } };
    const e = { q: 1, g: 3, b: 1, n: 1, name: '홍길동', course: '테스트(A)', seq: 0, refunds: [], adjusts: [] };
    w.E.push(e);
    w.autoRunSet(true);

    addRefund(w, e, { ty: 'STUDENT', sessIdx: 2, ah: 0, bkRefTy: 'NONE', bkRefAmt: 0 });
    // 환불 후 -15,000원 감액 조정 (청구액 60,000 → 45,000)
    e.adjusts.push({ title: '감액조정', amtT: -15000, amtB: 0, amtM: 0 });
    commit(w);

    const h = w.Hs.find(h => h.e === e);
    assert.equal(h.sT, 45000);
    assert.ok(h.finT >= 0, `자부담이 음수면 청구서에 마이너스 금액이 찍힌다 (실제: ${h.finT})`);
    assert.equal(h.tc + h.tf + h.finT, h.sT, '3분할 합계는 항상 청구액과 같아야 한다');
    assert.equal(h.tc, 45000, '지원금 공제액도 줄어든 청구액에 맞춰 내려가야 한다');
});

// ── 결함 3: 환불 2건 이상일 때 차수별 청구액이 분기 청구액과 안 맞음 ──────────────
test('결함3: 환불을 두 번 넣어 전액 환불이 되면 차수별 청구액도 전부 0원이 된다', () => {
    const w = freshEngine();
    w.C['테스트(A)'] = { 1: { t: 40000, b: 0, m: 0, mh: '3,3,3', unit: 1 } };
    w.M['테스트'] = { 1: { inst_m: 30000, mgmt_m: 1000, unit: 1 } };
    const e = { q: 1, g: 1, b: 1, n: 1, name: '홍길동', course: '테스트(A)', seq: 0, refunds: [], adjusts: [] };
    w.E.push(e);
    w.autoRunSet(true);

    // 1차수에서 3시수 진행 후 포기 → 그 차수는 0원, 이후 차수 전부 환불
    addRefund(w, e, { ty: 'STUDENT', sessIdx: 0, ah: 3, bkRefTy: 'NONE', bkRefAmt: 0 });
    // 이어서 2차수 기준으로 한 번 더 포기 처리
    addRefund(w, e, { ty: 'STUDENT', sessIdx: 1, ah: 3, bkRefTy: 'NONE', bkRefAmt: 0 });

    const res = w.recalcEnrollment(e);
    const sessSum = res.sessionT.reduce((a, b) => a + b, 0);
    // 수정 전에는 분기 청구액 0원인데 차수별 합계가 13,330원 남아 청구서에 그대로 찍혔다.
    assert.equal(sessSum, res.cT, `차수별 청구액 합계(${sessSum})는 분기 청구액(${res.cT})과 같아야 한다`);
});

// ── 결함 4: 감액 조정의 초과분이 증발해 차수별 청구액이 과다 계상 ────────────────
test('결함4: 감액 조정이 마지막 차수 금액보다 커도 차수별 합계가 분기 청구액과 일치한다', () => {
    const w = freshEngine();
    w.C['테스트(A)'] = { 1: { t: 40000, b: 0, m: 0, mh: '4,4,3', unit: 1 } };
    w.M['테스트'] = { 1: { inst_m: 30000, mgmt_m: 1000, unit: 1 } };
    // 4,4,3 → 차수별 [14540, 14540, 10920]. 마지막 차수(10,920)보다 큰 -15,000원 조정.
    const e = {
        q: 1, g: 1, b: 1, n: 1, name: '홍길동', course: '테스트(A)', seq: 0,
        refunds: [], adjusts: [{ title: '감액조정', amtT: -15000, amtB: 0, amtM: 0 }],
    };
    w.E.push(e);
    commit(w);

    const res = w.recalcEnrollment(e);
    const sessSum = res.sessionT.reduce((a, b) => a + b, 0);
    assert.equal(res.cT, 25000);
    // 수정 전에는 초과분 4,080원이 증발해 차수합이 29,080원(과다 청구)이었다.
    assert.equal(sessSum, 25000, `차수별 합계(${sessSum})가 분기 청구액과 달라 청구서가 과다 청구된다`);
});

// ── 결함 5: 0시수 차수가 섞이면 마지막 차수가 연산에서 통째로 누락 ───────────────
test('결함5: 중간 차수가 휴강(0시수)인 강좌도 모든 차수가 연산에 포함된다', () => {
    const w = freshEngine({ cho3Annual: 500000 });
    w.C['테스트(A)'] = { 1: { t: 90000, b: 20000, m: 0, mh: '4,0,4', unit: 1 } };
    w.M['테스트'] = { 1: { inst_m: 30000, mgmt_m: 1000, unit: 1 } };
    w.E.push({ q: 1, g: 3, b: 1, n: 1, name: '홍길동', course: '테스트(A)', seq: 0, refunds: [], adjusts: [] });
    w.autoRunSet(true);

    const h = w.Hs[0];
    const sds = Object.values(h.sessDetails);
    const sumT = sds.reduce((a, s) => a + s.tT, 0);
    // 수정 전에는 3차수가 통째로 빠져 차수합 45,000원 / 초3 공제도 45,000원으로 반토막 났다.
    assert.equal(sumT, h.sT, `차수별 청구액 합계(${sumT})가 분기 청구액(${h.sT})과 같아야 한다`);
    assert.equal(h.tc, 90000, '지원금이 남아있는데 절반만 공제되면 안 된다');
    assert.equal(h.finT, 0, '자부담이 생기면 안 된다');
});

test('결함5: 첫 차수가 휴강(0시수)이어도 교재비 부과 차수와 금액이 유지된다', () => {
    const w = freshEngine({ cho3Annual: 500000 });
    w.C['테스트(A)'] = { 1: { t: 90000, b: 20000, m: 0, mh: '0,4,4', unit: 1 } };
    w.M['테스트'] = { 1: { inst_m: 30000, mgmt_m: 1000, unit: 1 } };
    w.E.push({ q: 1, g: 3, b: 1, n: 1, name: '홍길동', course: '테스트(A)', seq: 0, refunds: [], adjusts: [] });
    w.autoRunSet(true);

    const h = w.Hs[0];
    const sds = Object.values(h.sessDetails);
    assert.equal(sds.reduce((a, s) => a + s.tT, 0), h.sT);
    assert.equal(sds.reduce((a, s) => a + s.tB, 0), h.sB);
    assert.equal(h.tc + h.bc, 110000, '수강료 90,000 + 교재비 20,000 전액이 초3에서 나가야 한다');
});

// ── 한도 초과 감지: 금액은 안 고치고 "넘었다"는 사실만 알려준다 ────────────────
test('한도 초과 감지: 정상 상태에서는 아무것도 보고하지 않는다', () => {
    const w = freshEngine({ cho3Annual: 500000 });
    w.C['테스트(A)'] = { 1: { t: 90000, b: 0, m: 0, mh: '4,4,4', unit: 1 } };
    w.M['테스트'] = { 1: { inst_m: 30000, mgmt_m: 1000, unit: 1 } };
    w.E.push({ q: 1, g: 3, b: 1, n: 1, name: '홍길동', course: '테스트(A)', seq: 0, refunds: [], adjusts: [] });
    w.autoRunSet(true);
    // ⚠ vm 샌드박스가 만든 배열은 프로토타입이 달라 deepEqual이 못 쓴다. 길이로 비교한다.
    assert.equal(w.getBudgetOverruns().length, 0, '한도 안이면 경고가 뜨면 안 된다(거짓 경보 금지)');
});

test('한도 초과 감지: 마감 이후 요금이 올라 확정 금액이 한도를 넘으면 잡아낸다', () => {
    const w = freshEngine({ cho3Annual: 100000, cho3H1Cap: 100000 });
    w.C['테스트(A)'] = { 1: { t: 90000, b: 0, m: 0, mh: '4,4,4', unit: 1 } };
    w.M['테스트'] = { 1: { inst_m: 30000, mgmt_m: 1000, unit: 1 } };
    const e = { q: 1, g: 3, b: 1, n: 1, name: '홍길동', course: '테스트(A)', seq: 0, refunds: [], adjusts: [] };
    w.E.push(e);
    w.autoRunSet(true);
    assert.equal(w.getBudgetOverruns().length, 0);

    // 1·2·3차수를 전부 마감(현재 화면값을 그대로 박제)
    const h = w.Hs[0];
    [0, 1, 2].forEach(s => {
        const sd = h.sessDetails[s];
        w.SysSet.closedSess[`1_${s}`] = {
            [`${h.id}_${h.c}`]: {
                cho3Amt: sd.tc, cho3Bk: sd.bc, cho3Mt: sd.mc,
                freeAmt: sd.tf, freeBk: sd.bf, freeMt: sd.mf,
                selfAmt: sd.finT, selfBk: sd.finB, selfMt: sd.finM,
            },
        };
    });
    // 마감 뒤에 한도를 낮춰버린 상황(= 확정 금액이 한도를 넘게 되는 모든 경우의 대표)
    w.SysSet.cho3Annual = 50000; w.SysSet.cho3H1Cap = 50000;
    w.autoRunSet(true);

    const over = w.getBudgetOverruns();
    assert.ok(over.length > 0, '마감된 확정 금액이 한도를 넘었는데 아무 경고도 없으면 그대로 제출된다');
    assert.equal(over[0].nm, '홍길동');
    assert.ok(over[0].over > 0);
    assert.ok(over[0].lockedQs.includes(1), '원인이 된 마감 분기를 함께 알려줘야 찾아갈 수 있다');

    // ⚠ 핵심: 감지만 하고 금액은 절대 건드리지 않는다.
    assert.equal(w.Hs[0].tc, 90000, '마감된 확정 금액을 시스템이 말없이 깎으면 안 된다');
});

/* ══════════════════════════════════════════════════════════════════════════
   조정(adjust)과 환불(refund)의 구분 — core-rules.md 제6조

   조정은 정산 자체의 정정이므로 지원금 연산에 반영되어야 하고, 환불은 정산 후의
   사건이므로 격리되어 다음 분기로 이월된다. 예전에는 둘을 같은 취급해서,
   환불이 있는 강좌에 조정을 넣으면 지원금 잔액이 남아 있는데도 자부담이 생겼다.
   ══════════════════════════════════════════════════════════════════════════ */

// 환불이 걸린 강좌 하나를 만들어 돌려준다.
function refundedCourse(opts = {}) {
    const w = freshEngine({ cho3Annual: 500000, cho3H1Cap: 250000 });
    w.C['테스트(A)'] = { 1: { t: 90000, b: opts.b || 0, m: 0, mh: '4,4,4', unit: 1 } };
    w.M['테스트'] = { 1: { inst_m: 30000, mgmt_m: 1000, unit: 1 } };
    const e = { q: 1, g: 3, b: 1, n: 1, name: '홍길동', course: '테스트(A)', seq: 0, refunds: [], adjusts: [] };
    w.E.push(e);
    commit(w);
    addRefund(w, e, { ty: 'STUDENT', sessIdx: 2, ah: 0, bkRefTy: 'NONE', bkRefAmt: 0 });
    return { w, e };
}

test('조정: 환불 강좌에 증액 조정을 넣으면, 늘어난 금액도 지원금에서 처리된다', () => {
    const { w, e } = refundedCourse();
    // 환불 후 청구액 60,000 / baseline(환불 전) 90,000.
    // +50,000 하면 청구액 110,000으로 baseline을 훌쩍 넘는다 — 예전에는 여기서 초과분이
    // 전부 자부담으로 떨어졌다(초3 잔액이 16만원 남아 있는데도).
    commit(w, () => { e.adjusts.push({ title: '증액', amtT: 50000, amtB: 0, amtM: 0 }); });

    const h = w.Hs.find(x => x.e === e);
    assert.equal(h.sT, 110000);
    assert.equal(h.tc, 110000, '지원금 잔액이 남아 있으면 조정 증액분도 지원금이 부담해야 한다');
    assert.equal(h.finT, 0, '예산이 남아 있는데 자부담이 생기면 안 된다');
});

test('조정: 교재비 증액 조정도 지원금에서 처리된다(환불이 교재비를 안 건드린 경우)', () => {
    const { w, e } = refundedCourse({ b: 10000 });
    // 환불은 수강료만 건드렸으므로 교재비 baseline은 원가 그대로 10,000원.
    // 예전에는 이 때문에 교재비를 단돈 2,000원만 올려도 즉시 자부담이 됐다.
    commit(w, () => { e.adjusts.push({ title: '교재비 증액', amtT: 0, amtB: 4000, amtM: 0 }); });

    const h = w.Hs.find(x => x.e === e);
    assert.equal(h.sB, 14000);
    assert.equal(h.bc, 14000, '교재비 조정분도 지원금이 부담해야 한다');
    assert.equal(h.finB, 0);
});

test('조정: 감액 조정을 넣으면 지원금 공제액도 같이 줄어든다(자부담 음수 금지)', () => {
    const { w, e } = refundedCourse();
    commit(w, () => { e.adjusts.push({ title: '감액', amtT: -20000, amtB: 0, amtM: 0 }); });

    const h = w.Hs.find(x => x.e === e);
    assert.equal(h.sT, 40000);
    assert.equal(h.tc, 40000);
    assert.equal(h.finT, 0);
    assert.equal(h.tc + h.tf + h.finT, h.sT);
});

test('baseline: 조정으로 청구액이 바뀌면 baseline도 따라 다시 잡힌다', () => {
    const { w, e } = refundedCourse();
    assert.equal(e.baseline.tc, 90000, '환불 직후 baseline은 환불 전 금액(90,000)이다');

    commit(w, () => { e.adjusts.push({ title: '감액', amtT: -40000, amtB: 0, amtM: 0 }); });
    // baseline은 "환불이 없었다면 받았을 3분할"이므로, 조정 후 원가 기준 50,000원이 되어야 한다.
    // 예전에는 90,000 그대로 남아서, 조정으로 줄어든 40,000원까지 '환불로 아낀 돈'으로
    // 잘못 분류되어 다음 분기로 이월됐다.
    assert.equal(e.baseline.tc, 50000, '조정을 반영해 baseline이 다시 잡혀야 한다');
});

test('baseline: 환불을 추가로 넣어도 baseline은 흔들리지 않는다(멱등)', () => {
    const { w, e } = refundedCourse();
    const before = JSON.stringify(e.baseline);
    addRefund(w, e, { ty: 'DISEASE', sessIdx: 0, ah: 1, bkRefTy: 'NONE', bkRefAmt: 0 });
    assert.equal(JSON.stringify(e.baseline), before, 'baseline은 환불과 무관하게 고정이어야 한다');
});

test('경로 동등성: 조정을 환불보다 늦게 해도 제때 한 것과 최종 금액이 같다', () => {
    // 예산이 빠듯해 강좌끼리 경쟁하는 상황에서 검사해야 의미가 있다.
    const build = order => {
        const w = freshEngine({ cho3Annual: 150000, cho3H1Cap: 150000 });
        w.C['가(A)'] = { 1: { t: 100000, b: 0, m: 0, mh: '4,4,4', unit: 1 } };
        w.C['나(B)'] = { 1: { t: 100000, b: 0, m: 0, mh: '4,4,4', unit: 1 } };
        w.M['가'] = { 1: { inst_m: 33000, mgmt_m: 1000, unit: 1 } };
        w.M['나'] = { 1: { inst_m: 33000, mgmt_m: 1000, unit: 1 } };
        const st = { g: 3, b: 1, n: 1, name: '홍길동' };
        const e0 = { ...st, q: 1, course: '가(A)', seq: 0, refunds: [], adjusts: [] };
        const e1 = { ...st, q: 1, course: '나(B)', seq: 1, refunds: [], adjusts: [] };
        w.E.push(e0, e1);
        commit(w);
        const adj = () => commit(w, () => { e0.adjusts.push({ title: '조정', amtT: -40000, amtB: 0, amtM: 0 }); });
        const ref = () => addRefund(w, e0, { ty: 'STUDENT', sessIdx: 2, ah: 0, bkRefTy: 'NONE', bkRefAmt: 0 });
        if (order === 'A') { adj(); ref(); } else { ref(); adj(); }
        // ⚠ 두 경로는 서로 다른 vm 샌드박스에서 돌아가므로 배열 프로토타입이 달라
        //   deepEqual이 "구조는 같은데 다르다"고 판정한다. 문자열로 비교한다.
        return JSON.stringify(w.Hs.slice().sort((a, b) => a.c.localeCompare(b.c))
            .map(h => [h.c, h.sT, h.tc, h.finT]));
    };

    const 제때조정 = build('A');
    const 뒤늦은조정 = build('B');
    assert.equal(뒤늦은조정, 제때조정,
        '담당자가 일한 순서에 따라 학생이 내는 돈이 달라지면 안 된다');
});

// ── 파급효과 감지: 조정이 다른 강좌를 건드렸는지 알려준다 ────────────────────
test('파급효과: 예산이 남아 있으면 조정을 넣어도 다른 강좌는 안 바뀐다(거짓 경보 금지)', () => {
    const w = freshEngine({ cho3Annual: 500000, cho3H1Cap: 250000 });
    w.C['가(A)'] = { 1: { t: 50000, b: 0, m: 0, mh: '4,4,4', unit: 1 } };
    w.C['나(B)'] = { 1: { t: 50000, b: 0, m: 0, mh: '4,4,4', unit: 1 } };
    w.M['가'] = { 1: { inst_m: 16000, mgmt_m: 600, unit: 1 } };
    w.M['나'] = { 1: { inst_m: 16000, mgmt_m: 600, unit: 1 } };
    const st = { g: 3, b: 1, n: 1, name: '홍길동' };
    const e0 = { ...st, q: 1, course: '가(A)', seq: 0, refunds: [], adjusts: [] };
    const e1 = { ...st, q: 1, course: '나(B)', seq: 1, refunds: [], adjusts: [] };
    w.E.push(e0, e1);
    commit(w);

    const before = w.captureSplitSnapshot();
    commit(w, () => { e0.adjusts.push({ title: '증액', amtT: 30000, amtB: 0, amtM: 0 }); });
    assert.equal(w.diffSplitSnapshot(before, [e0]).length, 0,
        '예산이 넉넉하면 조정이 다른 강좌를 건드리지 않는다');
});

test('파급효과: 예산이 소진된 상태에서 조정을 넣으면 바뀐 다른 강좌를 집어낸다', () => {
    // 초3 한도 15만원인데 10만원짜리 강좌 2개 → 나(B)는 이미 일부만 지원받는 상태
    const w = freshEngine({ cho3Annual: 150000, cho3H1Cap: 150000 });
    w.C['가(A)'] = { 1: { t: 100000, b: 0, m: 0, mh: '4,4,4', unit: 1 } };
    w.C['나(B)'] = { 1: { t: 100000, b: 0, m: 0, mh: '4,4,4', unit: 1 } };
    w.M['가'] = { 1: { inst_m: 33000, mgmt_m: 1000, unit: 1 } };
    w.M['나'] = { 1: { inst_m: 33000, mgmt_m: 1000, unit: 1 } };
    const st = { g: 3, b: 1, n: 1, name: '홍길동' };
    const e0 = { ...st, q: 1, course: '가(A)', seq: 0, refunds: [], adjusts: [] };
    const e1 = { ...st, q: 1, course: '나(B)', seq: 1, refunds: [], adjusts: [] };
    w.E.push(e0, e1);
    commit(w);
    const 나_before = w.Hs.find(h => h.e === e1).tc;

    const before = w.captureSplitSnapshot();
    commit(w, () => { e0.adjusts.push({ title: '증액', amtT: 30000, amtB: 0, amtM: 0 }); });

    const changed = w.diffSplitSnapshot(before, [e0]);
    assert.equal(changed.length, 1, '가(A)를 조정했는데 나(B)도 바뀌었으면 잡아내야 한다');
    assert.equal(changed[0].c, '나(B)');
    assert.ok(changed[0].cho3.after < 나_before, '나(B)의 지원금이 줄어든 것이 보고돼야 한다');
    assert.ok(changed[0].self.after > changed[0].self.before, '그만큼 자부담이 늘어난 것도 보고돼야 한다');
});

test('파급효과: 직접 건드린 강좌는 보고 대상에서 빠진다', () => {
    const w = freshEngine({ cho3Annual: 150000, cho3H1Cap: 150000 });
    w.C['가(A)'] = { 1: { t: 100000, b: 0, m: 0, mh: '4,4,4', unit: 1 } };
    w.M['가'] = { 1: { inst_m: 33000, mgmt_m: 1000, unit: 1 } };
    const e0 = { g: 3, b: 1, n: 1, name: '홍길동', q: 1, course: '가(A)', seq: 0, refunds: [], adjusts: [] };
    w.E.push(e0);
    commit(w);

    const before = w.captureSplitSnapshot();
    commit(w, () => { e0.adjusts.push({ title: '증액', amtT: 30000, amtB: 0, amtM: 0 }); });
    assert.equal(w.diffSplitSnapshot(before, [e0]).length, 0,
        '사용자가 의도적으로 고친 강좌를 "다른 강좌가 바뀌었다"고 알리면 안 된다');
});

/* ══════════════════════════════════════════════════════════════════════════
   가상 실행(dry run) 되돌리기 — 조정 적용 전 미리보기의 안전성

   "이 조정을 넣으면 어떻게 되는가"를 보여주려면 실제로 넣어서 계산해봐야 한다.
   그 뒤 반드시 흔적 없이 원상복구돼야 한다. 여기서 한 톨이라도 어긋나면,
   사용자가 [취소]를 눌렀는데도 장부가 조용히 바뀌는 최악의 사고가 된다.
   ══════════════════════════════════════════════════════════════════════════ */

// 데이터와 화면 값을 통째로 문자열로 만든다(비교용 지문).
function fullFingerprint(w) {
    return JSON.stringify({
        data: { C: w.C, M: w.M, F: w.F, E: w.E, SysSet: w.SysSet },
        view: w.Hs.map(h => [h.q, h.id, h.c, h.sT, h.sB, h.sM,
            h.tc, h.bc, h.mc, h.tf, h.bf, h.mf, h.finT, h.finB, h.finM,
            JSON.stringify(h.sessDetails)]),
    });
}

// 실제 UI의 미리보기와 똑같은 가상 실행 절차.
function dryRun(w, targets, adjust) {
    const before = w.captureSplitSnapshot();
    const frozenSnap = w.snapshotFrozenState();
    let changed;
    try {
        targets.forEach(e => e.adjusts.push(adjust));
        w.recomputeAll();
        changed = w.diffSplitSnapshot(before, targets);
    } finally {
        targets.forEach(e => e.adjusts.pop());
        w.restoreFrozenState(frozenSnap);
        w.recomputeAll();
    }
    return changed;
}

// 환불·조정·마감이 뒤섞인, 되돌리기가 가장 어려운 상태를 만든다.
function messyScenario() {
    const w = freshEngine({ cho3Annual: 200000, cho3H1Cap: 150000, freeAnnual: 150000 });
    ['가(A)', '나(B)', '다(C)'].forEach((cn, i) => {
        w.C[cn] = { 1: { t: 90000, b: 10000, m: 0, mh: '4,4,4', unit: 1 } };
        w.M[cn.slice(0, 1)] = { 1: { inst_m: 30000, mgmt_m: 1000, unit: 1 } };
    });
    const st = { g: 3, b: 1, n: 1, name: '홍길동' };
    w.F.push({ ...st, startQ: 1, startSess: 0, courses: {} });
    const es = ['가(A)', '나(B)', '다(C)'].map((cn, i) => ({ ...st, q: 1, course: cn, seq: i, refunds: [], adjusts: [] }));
    w.E.push(...es);
    commit(w);
    addRefund(w, es[0], { ty: 'STUDENT', sessIdx: 2, ah: 0, bkRefTy: 'NONE', bkRefAmt: 0 });
    commit(w, () => { es[1].adjusts.push({ title: '기존조정', amtT: -5000, amtB: 0, amtM: 0 }); });
    return { w, es };
}

test('가상 실행: 조정을 미리 계산해봐도 데이터와 화면 값이 한 톨도 안 바뀐다', () => {
    const { w, es } = messyScenario();
    const before = fullFingerprint(w);

    dryRun(w, [es[2]], { title: '미리보기', amtT: 40000, amtB: 5000, amtM: 0 });

    assert.equal(fullFingerprint(w), before,
        '[취소]를 눌렀는데 장부가 바뀌면 안 된다 — 가상 실행이 흔적을 남겼다');
});

test('가상 실행: 마감된 차수가 섞여 있어도 원상복구된다', () => {
    const { w, es } = messyScenario();
    // 1분기 1차수를 마감해 스냅샷 재생 경로까지 타게 만든다
    const bucket = {};
    w.Hs.filter(h => h.q === 1).forEach(h => {
        const sd = h.sessDetails[0]; if (!sd) return;
        bucket[`${h.id}_${h.c}`] = { cho3Amt: sd.tc, cho3Bk: sd.bc, cho3Mt: sd.mc || 0,
            freeAmt: sd.tf, freeBk: sd.bf, freeMt: sd.mf || 0,
            selfAmt: sd.finT, selfBk: sd.finB, selfMt: sd.finM || 0 };
    });
    w.SysSet.closedSess['1_0'] = bucket;
    w.recomputeAll();
    const before = fullFingerprint(w);

    dryRun(w, [es[2]], { title: '미리보기', amtT: 30000, amtB: 0, amtM: 0 });

    assert.equal(fullFingerprint(w), before, '마감 스냅샷이 얽혀도 원상복구돼야 한다');
});

test('가상 실행: 여러 번 반복해도 상태가 누적으로 밀리지 않는다', () => {
    const { w, es } = messyScenario();
    const before = fullFingerprint(w);
    for (let i = 0; i < 5; i++) {
        dryRun(w, [es[0], es[2]], { title: '미리보기', amtT: (i % 2 ? 1 : -1) * 20000, amtB: 3000, amtM: 0 });
    }
    assert.equal(fullFingerprint(w), before, '미리보기를 여러 번 띄워도 장부가 밀리면 안 된다');
});

test('가상 실행: 미리 계산한 파급효과가 실제로 적용했을 때와 일치한다', () => {
    const { w, es } = messyScenario();
    const adj = { title: '증액', amtT: 40000, amtB: 0, amtM: 0 };

    const 예측 = dryRun(w, [es[2]], adj);

    // 같은 조정을 실제로 적용해 결과를 비교
    const before = w.captureSplitSnapshot();
    commit(w, () => { es[2].adjusts.push(adj); });
    const 실제 = w.diffSplitSnapshot(before, [es[2]]);

    assert.equal(JSON.stringify(예측), JSON.stringify(실제),
        '미리보기에서 보여준 숫자와 실제 적용 결과가 다르면 안내가 거짓말이 된다');
});

// ── autoRunSet 범위 축소(onlyId): 한 명만 돌려도 전체를 돌린 것과 같아야 한다 ──────
//    baseline 재포착이 매번 전교생을 계산하면 느려서(실 데이터 22명 일괄 조정에 236ms)
//    그 학생 한 명만 돌리도록 좁혔다. 예산이 학생 단위로 완결돼 있다는 전제(헌법 제1조)에
//    기대는 최적화라, 그 전제가 깨지면 금액이 조용히 달라진다. 여기서 못박아 둔다.
test('범위 축소: 학생 한 명만 계산해도 전체 계산과 값이 같다', () => {
    const w = freshEngine({ cho3Annual: 500000, cho3H1Cap: 250000, freeAnnual: 600000 });
    ['가(A)', '나(B)'].forEach(cn => {
        w.C[cn] = {};
        for (let q = 1; q <= 4; q++) w.C[cn][q] = { t: 90000, b: 10000, m: 0, mh: '4,4,4', unit: 1 };
        w.M[cn.slice(0, 1)] = { 1: { inst_m: 30000, mgmt_m: 1000, unit: 1 } };
    });
    // 학생 3명: 초3만 / 자유만 / 둘 다
    const students = [
        { g: 3, b: 1, n: 1, name: '초삼' },
        { g: 5, b: 1, n: 2, name: '자유' },
        { g: 3, b: 1, n: 3, name: '둘다' },
    ];
    w.F.push({ ...students[1], startQ: 1, startSess: 0, courses: {} });
    w.F.push({ ...students[2], startQ: 1, startSess: 0, courses: {} });
    students.forEach(st => {
        for (let q = 1; q <= 3; q++) {
            ['가(A)', '나(B)'].forEach((cn, i) => w.E.push({ ...st, q, course: cn, seq: i, refunds: [], adjusts: [] }));
        }
    });
    commit(w);

    // 전체 계산 결과를 학생별로 보관
    const full = {};
    w.Hs.forEach(h => { full[`${h.id}|${h.q}|${h.c}`] = [h.tc, h.bc, h.mc, h.tf, h.bf, h.mf, h.finT, h.finB, h.finM]; });

    // 학생 한 명씩만 계산해서 대조
    students.forEach(st => {
        const id = w.uid(st.g, st.b, st.n, st.name);
        w.autoRunSet(true, id);
        assert.ok(w.Hs.length > 0, '범위를 좁혀도 그 학생의 결과는 나와야 한다');
        w.Hs.forEach(h => {
            assert.equal(h.id, id, '지정한 학생 외의 결과가 섞이면 안 된다');
            assert.deepEqual(
                [h.tc, h.bc, h.mc, h.tf, h.bf, h.mf, h.finT, h.finB, h.finM],
                full[`${h.id}|${h.q}|${h.c}`],
                `${st.name} ${h.q}분기 ${h.c}: 한 명만 돌린 값이 전체 계산과 다르다`);
        });
    });

    // 다시 전체로 돌리면 원래대로 복구돼야 한다
    w.autoRunSet(true);
    assert.equal(Object.keys(w.Ld).length, students.length, '전체 재계산 후에는 모든 학생이 돌아와야 한다');
});

/* ══════════════════════════════════════════════════════════════════════════
   계산 결과 변경 감지 — 엔진이 바뀌어 금액이 달라진 걸 사용자가 모르고 지나가지 않게

   껍데기만 웹에 올려두고 장부는 각자 브라우저에 두는 구조라, 접속할 때마다 그 순간
   배포된 엔진으로 장부를 다시 계산한다. 원자료를 안 건드려도 금액이 달라질 수 있다.
   ══════════════════════════════════════════════════════════════════════════ */

function twoCourseStudent(opts = {}) {
    const w = freshEngine({ cho3Annual: opts.cho3 || 500000, cho3H1Cap: opts.cap || 250000 });
    w.C['가(A)'] = { 1: { t: 90000, b: 10000, m: 0, mh: '4,4,4', unit: 1 } };
    w.C['나(B)'] = { 1: { t: 60000, b: 0, m: 0, mh: '4,4,4', unit: 1 } };
    w.M['가'] = { 1: { inst_m: 30000, mgmt_m: 1000, unit: 1 } };
    w.M['나'] = { 1: { inst_m: 20000, mgmt_m: 800, unit: 1 } };
    const st = { g: 3, b: 1, n: 1, name: '홍길동' };
    w.E.push({ ...st, q: 1, course: '가(A)', seq: 0, refunds: [], adjusts: [] });
    w.E.push({ ...st, q: 1, course: '나(B)', seq: 1, refunds: [], adjusts: [] });
    commit(w);
    return w;
}

test('변경 감지: 아무것도 안 바뀌면 보고할 것이 없다(거짓 경보 금지)', () => {
    const w = twoCourseStudent();
    const before = w.captureComputedFingerprint();
    w.recomputeAll();                       // 데이터 그대로 두고 재연산만
    const after = w.captureComputedFingerprint();
    assert.equal(w.diffComputedFingerprint(before, after).length, 0,
        '같은 데이터·같은 엔진이면 아무 변화도 보고되면 안 된다');
});

test('변경 감지: 금액이 달라지면 어느 학생·강좌가 얼마나 바뀌었는지 짚어낸다', () => {
    const w = twoCourseStudent();
    const before = w.captureComputedFingerprint();

    // 엔진이 바뀐 상황을 흉내낸다 — 예산 한도가 줄어 배분이 달라지는 경우
    w.SysSet.cho3Annual = 120000; w.SysSet.cho3H1Cap = 120000;
    w.recomputeAll();
    const after = w.captureComputedFingerprint();

    const changes = w.diffComputedFingerprint(before, after);
    assert.ok(changes.length > 0, '금액이 달라졌는데 아무것도 보고하지 않으면 안 된다');

    const r = changes[0];
    assert.ok(r.dp && r.nm && r.course, '누가 어느 강좌인지 알 수 있어야 한다');
    assert.equal(r.before.length, 9);
    assert.equal(r.after.length, 9);
    assert.ok(r.fields.length > 0, '어떤 항목이 바뀌었는지 짚어줘야 한다');
    // 항목 이름이 사람이 읽을 수 있는 말이어야 한다(엑셀·모달에 그대로 나간다)
    assert.ok(/초3|자유|자부담/.test(r.fields[0].name));
    // 전/후 합계 차이가 실제 delta와 맞아야 한다
    const b = r.before, a = r.after;
    assert.equal(r.cho3Delta, (a[0]+a[1]+a[2]) - (b[0]+b[1]+b[2]));
    assert.equal(r.selfDelta, (a[6]+a[7]+a[8]) - (b[6]+b[7]+b[8]));
});

test('변경 감지: 사용자가 직접 데이터를 고친 경우는 경보 대상이 아니다', () => {
    // 실제 앱에서는 commitState가 저장 직전에 지문을 갱신하므로, 사용자 편집 뒤에는
    // 기준 지문도 최신이 된다. 그 상황을 그대로 재현해 경보가 안 뜨는지 본다.
    const w = twoCourseStudent();
    commit(w, () => { w.E[0].adjusts.push({ title: '증액', amtT: 20000, amtB: 0, amtM: 0 }); });
    const afterEdit = w.captureComputedFingerprint();   // 저장 시점의 지문
    w.recomputeAll();                                   // 다음 접속 시 재연산
    assert.equal(w.diffComputedFingerprint(afterEdit, w.captureComputedFingerprint()).length, 0,
        '사용자 편집으로 금액이 바뀐 것을 "엔진이 바뀌었다"고 알리면 안 된다');
});

test('변경 감지: 새로 생기거나 사라진 등록은 변경으로 세지 않는다', () => {
    const w = twoCourseStudent();
    const before = w.captureComputedFingerprint();
    commit(w, () => {
        w.E.push({ g: 3, b: 1, n: 2, name: '신입생', q: 1, course: '나(B)', seq: 0, refunds: [], adjusts: [] });
    });
    const changes = w.diffComputedFingerprint(before, w.captureComputedFingerprint());
    assert.ok(!changes.some(r => r.nm === '신입생'),
        '새로 등록한 학생은 "계산이 달라졌다"가 아니라 사용자가 한 일이다');
});

test('변경 감지: 지문에 버전과 시점이 함께 남는다', () => {
    const w = twoCourseStudent();
    const fp = w.captureComputedFingerprint();
    assert.ok('ver' in fp, '어느 버전에서 계산한 결과인지 남아야 한다');
    assert.ok(fp.at && !Number.isNaN(Date.parse(fp.at)), '언제 계산한 결과인지 남아야 한다');
    assert.equal(Object.keys(fp.rows).length, w.Hs.length, '정산행 수만큼 지문이 있어야 한다');
});
