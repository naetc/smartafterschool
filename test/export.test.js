/* ==========================================================================
   내보내기(5스텝) 계산 회귀 테스트.

   engine.test.js가 지키는 건 '학생이 얼마를 내는가'까지다. 그 뒤에 이어지는
   "확정된 금액을 교육청 제출 서식으로 쪼개고 추리는" 계산(app-ui-export.js)은
   그동안 테스트가 없었는데, 실제로 결재가 올라가는 숫자는 이쪽이다.

   여기서는 DOM이 필요 없는 순수 계산 두 가지를 고정한다.
     - window.splitInvoiceRow : 지출 청구서의 강사료/수용비 안분
     - window.getRosterData   : 명단(초3/자유/자부담)별 금액 버킷 선택과 정렬
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { freshExport } = require('./harness.js');

// ──────────────────────────────────────────────────────────────────────────
// 청구서 안분 (splitInvoiceRow)
// ──────────────────────────────────────────────────────────────────────────

test('splitInvoiceRow: 강사료 몫만 10원 단위로 올림하고 수용비 몫은 나머지로 유도한다', () => {
    const w = freshExport();
    // 분기 수강료 12만원 = 강사료 96,250 + 수용비 3,750  → 안분 비율 0.802083…
    const conf = { t: 120000, instTot: 96250, mgmtTot: 3750 };
    const r = w.splitInvoiceRow({ sT: 120000, tc: 90000, tf: 0, finT: 30000 }, conf);

    assert.equal(r.sT_i, 96250);   // 원가의 강사료 몫 (sT=t이면 나머지 없이 정확히 instTot)
    assert.equal(r.sT_m, 23750);   // 원가의 수용비 몫 = 120000 - 96250

    // 90,000 × 0.802083… = 72,187.5 → 10원 단위 올림으로 72,190
    assert.equal(r.tc_i, 72190);
    assert.equal(r.tc_m, 17810);   // 90000 - 72190
});

test('splitInvoiceRow: 올림이 반올림과 실제로 다르게 작동한다(소수부가 .5 미만인 경우도 무조건 올림)', () => {
    const w = freshExport();
    // 실제로 5% 한도 초과가 재현됐던 사례: 로봇과학 분기수강료 59,850(강사료 57,000/수용비 2,850, 5.00%)
    // 에서 학생 청구액 32,100원을 안분하면 비율상 30,571.43원 — 소수부(.14…)는 반올림이면 아래(30,570)로
    // 떨어지지만, 올림은 무조건 위(30,580)로 올린다.
    const conf = { t: 59850, instTot: 57000, mgmtTot: 2850 };
    const r = w.splitInvoiceRow({ sT: 32100, tc: 0, tf: 0, finT: 32100 }, conf);

    assert.equal(r.sT_i, 30580);   // 반올림이었다면 30570이 나왔을 지점
    assert.equal(r.sT_m, 1520);    // 반올림이었다면 1530(=5.0049%, 5% 한도 초과)이 나왔을 지점
});

test('splitInvoiceRow: 강사료 몫 + 수용비 몫은 항상 원래 금액과 1원도 어긋나지 않는다', () => {
    const w = freshExport();
    const conf = { t: 110000, instTot: 83333, mgmtTot: 4160 }; // 일부러 안 떨어지는 비율
    // 10원 단위 올림 처리가 여러 소수부 위치에서도 항상 안전한지 여러 금액을 훑는다.
    for (let amt = 0; amt <= 200000; amt += 3330) {
        const r = w.splitInvoiceRow({ sT: amt, tc: 0, tf: 0, finT: amt }, conf);
        assert.equal(r.sT_i + r.sT_m, amt, `원가 ${amt}원에서 강사료+수용비 합이 어긋남`);
        assert.equal(r.sT_i % 10, 0, `강사료 몫 ${r.sT_i}이 10원 단위가 아님`);
    }
});

test('splitInvoiceRow: 강좌요금표의 수용비 비율이 5% 이내면, 10원 단위 금액에서는 학생별로 쪼개도 그 열(원가)의 수용비가 5%를 넘지 않는다', () => {
    const w = freshExport({}, ['app-utils.js']); // window.checkMgmtRatio 사용
    // 강사료 57,000 / 수용비 2,850 = 정확히 5.000%
    const conf = { t: 59850, instTot: 57000, mgmtTot: 2850 };
    for (let amt = 0; amt <= 200000; amt += 10) {
        const r = w.splitInvoiceRow({ sT: amt, tc: 0, tf: 0, finT: amt }, conf);
        assert.ok(
            w.checkMgmtRatio(r.sT_i, r.sT_m),
            `금액 ${amt}원에서 수용비(${r.sT_m})가 강사료(${r.sT_i})의 5%를 초과함`
        );
    }
});

test('splitInvoiceRow: 수동 조정으로 10원 단위가 아닌 소액(예: 15원)이 남아도 강사료 몫이 원금액을 넘어 수용비가 음수로 표시되지 않는다', () => {
    const w = freshExport();
    const conf = { t: 59850, instTot: 57000, mgmtTot: 2850 }; // 비율 0.952381…
    const r = w.splitInvoiceRow({ sT: 15, tc: 0, tf: 0, finT: 15 }, conf);

    // 올림만 했다면 ceil(15×0.952381/10)×10 = 20원으로 원금액(15원)을 넘어섰을 지점.
    assert.equal(r.sT_i, 15);
    assert.equal(r.sT_m, 0);
});

test('splitInvoiceRow: 자부담은 비율로 다시 계산하지 않고 (원가 - 초3 - 자유)로 유도한다', () => {
    const w = freshExport();
    const conf = { t: 120000, instTot: 96250, mgmtTot: 3750 };
    const d = { sT: 120000, tc: 90000, tf: 0, finT: 30000 };
    const r = w.splitInvoiceRow(d, conf);

    // 자부담 몫은 각각 '원가 몫 - 초3 몫 - 자유 몫'이어야 한다.
    assert.equal(r.finT_i, r.sT_i - r.tc_i - r.tf_i);
    assert.equal(r.finT_m, r.sT_m - r.tc_m - r.tf_m);

    // 그 결과 3분할(초3+자유+자부담)은 강사료/수용비 각각에서 원가와 정확히 맞는다.
    assert.equal(r.tc_i + r.tf_i + r.finT_i, r.sT_i);
    assert.equal(r.tc_m + r.tf_m + r.finT_m, r.sT_m);
    assert.equal(r.finT_i + r.finT_m, d.finT);
});

test('splitInvoiceRow: 초3·자유수강권이 섞여 있어도 3분할 합계 무결성이 유지된다', () => {
    const w = freshExport();
    const conf = { t: 137000, instTot: 101110, mgmtTot: 5050 };
    const d = { sT: 137000, tc: 61000, tf: 47000, finT: 29000 }; // 61000+47000+29000 = 137000
    const r = w.splitInvoiceRow(d, conf);

    assert.equal(r.tc_i + r.tf_i + r.finT_i, r.sT_i);
    assert.equal(r.tc_m + r.tf_m + r.finT_m, r.sT_m);
    assert.equal(r.sT_i + r.sT_m, d.sT);
});

test('splitInvoiceRow: 강좌요금표가 없으면 비율 1(전액 강사료)로 처리해 금액이 사라지지 않는다', () => {
    const w = freshExport();
    // 강좌 설정을 못 찾는 상황(강좌명 변경 직후 등)에서도 총액이 유실되면 안 된다.
    const r = w.splitInvoiceRow({ sT: 100000, tc: 40000, tf: 0, finT: 60000 }, null);
    assert.equal(r.ratio, 1);
    assert.equal(r.sT_i, 100000);
    assert.equal(r.sT_m, 0);
    assert.equal(r.sT_i + r.sT_m, 100000);
});

test('splitInvoiceRow: 수강료가 0인 강좌(교재비만 있는 경우)도 0으로 나누지 않는다', () => {
    const w = freshExport();
    const r = w.splitInvoiceRow({ sT: 0, tc: 0, tf: 0, finT: 0 }, { t: 0, instTot: 0, mgmtTot: 0 });
    assert.equal(r.ratio, 1);
    assert.ok(Number.isFinite(r.sT_i), '강사료 몫이 NaN/Infinity가 되면 안 된다');
    assert.equal(r.sT_i, 0);
    assert.equal(r.sT_m, 0);
});

// ──────────────────────────────────────────────────────────────────────────
// 명단 추출 (getRosterData)
// ──────────────────────────────────────────────────────────────────────────

// 초3 대상자 1명 + 비대상자 1명을 같은 강좌에 넣고 엔진을 실제로 돌린 상태를 만든다.
function seedRoster() {
    const w = freshExport();
    w.C['바둑교실'] = { 1: { t: 120000, b: 20000, m: 0, mh: '4,4,4' } };
    w.E.push({ q: 1, g: 3, b: 2, n: 7, name: '김초삼', course: '바둑교실', refunds: [], adjusts: [], seq: 0 });
    w.E.push({ q: 1, g: 5, b: 1, n: 3, name: '이일반', course: '바둑교실', refunds: [], adjusts: [], seq: 0 });
    w.autoRunSet(true);
    return w;
}

test('getRosterData: ALL은 지원금 적용 전 원가를, SELF는 최종 자부담을 돌려준다', () => {
    const w = seedRoster();

    const all = w.getRosterData(1, 'ALL');
    const cho3Row = all.find(r => r.nm === '김초삼');
    assert.equal(cho3Row.t, 120000); // 원가(지원 전)
    assert.equal(cho3Row.b, 20000);
    assert.equal(cho3Row.tot, 140000);

    const self = w.getRosterData(1, 'SELF');
    const selfCho3 = self.find(r => r.nm === '김초삼');
    const selfNormal = self.find(r => r.nm === '이일반');
    // 초3 학생은 상반기 한도(25만) 안이라 전액 지원 → 자부담 0
    assert.equal(selfCho3.t, 0);
    assert.equal(selfCho3.b, 0);
    // 비대상 학생은 전액 자부담
    assert.equal(selfNormal.t, 120000);
    assert.equal(selfNormal.b, 20000);
});

test('getRosterData: CHO3 명단은 대상자만 남기고 초3 공제액을 금액으로 쓴다', () => {
    const w = seedRoster();
    const rows = w.getRosterData(1, 'CHO3');

    assert.equal(rows.length, 1, '초3 대상자만 남아야 한다');
    assert.equal(rows[0].nm, '김초삼');
    assert.equal(rows[0].t, 120000); // 초3에서 공제된 수강료
    assert.equal(rows[0].b, 20000);  // 초3에서 공제된 교재비
});

test('getRosterData: 자유수강권 대상자가 없으면 FREE 명단은 비어 있다', () => {
    const w = seedRoster();
    assert.deepEqual(w.getRosterData(1, 'FREE'), []);
});

test('getRosterData: 정렬 기준(강좌순/학적순)에 따라 순서가 달라진다', () => {
    const w = freshExport();
    w.C['가야금'] = { 1: { t: 100000, b: 0, m: 0, mh: '4,4,4' } };
    w.C['탁구교실'] = { 1: { t: 100000, b: 0, m: 0, mh: '4,4,4' } };
    // 학적이 빠른 학생이 가나다순으로는 뒤에 오도록 배치
    w.E.push({ q: 1, g: 1, b: 1, n: 1, name: '앞학적', course: '탁구교실', refunds: [], adjusts: [], seq: 0 });
    w.E.push({ q: 1, g: 6, b: 9, n: 9, name: '뒤학적', course: '가야금', refunds: [], adjusts: [], seq: 0 });
    w.autoRunSet(true);

    // 기본(강좌순): 가야금 → 탁구교실
    assert.deepEqual(w.getRosterData(1, 'ALL', 'C').map(r => r.c), ['가야금', '탁구교실']);
    // 학적순: 1-1-1 → 6-9-9
    assert.deepEqual(w.getRosterData(1, 'ALL', 'S').map(r => r.nm), ['앞학적', '뒤학적']);
});

test('getRosterData: 다른 분기의 등록은 섞여 들어오지 않는다', () => {
    const w = seedRoster();
    w.C['바둑교실'][2] = { t: 120000, b: 0, m: 0, mh: '4,4,4' };
    w.E.push({ q: 2, g: 3, b: 2, n: 7, name: '김초삼', course: '바둑교실', refunds: [], adjusts: [], seq: 0 });
    w.autoRunSet(true);

    assert.equal(w.getRosterData(1, 'ALL').length, 2); // 1분기 2명만
    assert.equal(w.getRosterData(2, 'ALL').length, 1); // 2분기 1명만
});
