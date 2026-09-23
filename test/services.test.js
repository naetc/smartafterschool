/* ==========================================================================
   부가 서비스(백업·복구·엑셀 서식) 회귀 테스트 — 2026-09-23

   엔진이 맞아도 행정실에 나가는 건 엑셀 파일이고, 장부를 옮기는 건 백업 파일이다.
   이날 두 군데에서 실제 결함이 나왔는데 기존 테스트 121건은 전부 통과하고 있었다.
     - 교육비 청구서 파일(exInvoice)이 화면 미리보기와 다른 반올림을 썼다(실데이터 7건, 최대 10원).
     - [복구] 버튼이 전입 한도를 버려서, 복구하면 전입생이 연간 한도 전액을 다시 받았다.
   여기 테스트는 모두 앱의 실제 함수(sysBackup, 복구 리스너, loadData, exInvoice)를 그대로 부른다.
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { freshEngine, exportBook, backupText, simulateRestore, simulateReload } = require('./harness');
const { buildScenario, checkServiceInvariants, checkBackupRoundTrip } = require('./fuzz-engine');

async function roundTrip(w) {
    const { saved, errors } = await simulateRestore(backupText(w));
    assert.deepEqual(errors, [], '복구 중 오류 알림이 떴다');
    return simulateReload(saved);
}

test('[복구] 백업 파일을 복구해도 전입 한도와 강좌 이동 기록이 사라지지 않는다', async () => {
    const w = freshEngine({}, ['app-db.js']);
    const 요금 = { t: 400000, b: 0, m: 0, mh: '4,4,4' };
    w.C['로봇과학'] = { 1: { ...요금 }, 2: { ...요금 }, 3: { ...요금 } };
    const 전입생 = { g: 4, b: 1, n: 1, name: '전입생' };
    w.F = [{ ...전입생, startQ: 1, startSess: 0, courses: {}, transFreeAmt: 300000 }];
    w.E = [
        { ...전입생, q: 1, course: '로봇과학', refunds: [], adjusts: [] },
        { ...전입생, q: 2, course: '로봇과학', refunds: [], adjusts: [] },
        // 3분기(상반기 캡이 없는 분기)라야 초3 전입 한도가 그대로 드러난다
        { g: 3, b: 1, n: 2, name: '초3전입', q: 3, course: '로봇과학', refunds: [], adjusts: [], transCho3Amt: 120000, oldQ: 2, oldCourse: '과학실험' },
    ];
    w.recomputeAll();
    const 자유합 = x => x.Hs.reduce((s, h) => s + h.tf + h.bf, 0);
    const 초3합 = x => x.Hs.reduce((s, h) => s + h.tc + h.bc, 0);
    assert.equal(자유합(w), 300000);
    assert.equal(초3합(w), 120000);

    const w2 = await roundTrip(w);

    assert.equal(w2.F[0].transFreeAmt, 300000, '자유수강권 전입 한도가 사라졌다');
    const e = w2.E.find(x => x.name === '초3전입');
    assert.equal(e.transCho3Amt, 120000, '초3 전입 한도가 사라졌다');
    assert.equal(e.oldQ, 2);
    assert.equal(e.oldCourse, '과학실험');
    assert.equal(자유합(w2), 300000, '복구 뒤 전입생이 연간 한도 전액(600,000)을 받는다');
    assert.equal(초3합(w2), 120000);
});

test('[교육비 청구서] 다운로드 파일의 강사료·수용비 배분이 화면 미리보기와 같다', () => {
    // 실데이터에서 어긋났던 조합: 수강료 93,000 = 강사료 90,000 + 수용비 3,000, 초3 공제 10,750.
    // 10,750 × (90,000/93,000) = 10,403.2 → 미리보기는 10원 올림 10,410, 예전 파일은 반올림 10,400.
    const w = freshEngine({ cho3Annual: 10750, cho3H1Cap: 10750 }, ['app-ui-export.js']);
    w.C['방송댄스(B)'] = { 3: { t: 93000, b: 0, m: 0, mh: '4,4,4', instTot: 90000, mgmtTot: 3000 } };
    w.E = [{ g: 3, b: 1, n: 13, name: '학생', q: 3, course: '방송댄스(B)', refunds: [], adjusts: [] }];
    w.recomputeAll();

    const h = w.Hs[0];
    assert.equal(h.tc, 10750);
    const preview = w.splitInvoiceRow(h, w.C['방송댄스(B)'][3]);
    const row = exportBook(w, 'exInvoice', { q: 3, p_sInvoice: 'ALL' }).sheets[0].rows[0];

    assert.equal(preview.tc_i, 10410);
    assert.equal(row['초3공제_강사료'], preview.tc_i, '파일과 미리보기의 초3공제 강사료가 다르다');
    assert.equal(row['초3공제_수용비'], preview.tc_m);
    assert.equal(row['자부담_강사료'], preview.finT_i);
    assert.equal(row['원가_강사료'] + row['원가_수용비'], row['원가_수강료(계)']);
});

// 무작위 시나리오로 부가 서비스 불변식(B1~B7)을 돌린다. 전체 판은 `npm run fuzz`.
// '알려진 한계'(known: B6k)는 fuzz-engine.js의 checkServiceInvariants 주석 참고.
test('[부가 서비스 불변식] 무작위 150건: 서식 합계·미리보기 일치·백업 왕복에 위반이 없다', async () => {
    const bad = [];
    for (let seed = 1; seed <= 150; seed++) {
        const w = buildScenario(seed);
        const V = checkServiceInvariants(w).concat(await checkBackupRoundTrip(w));
        V.filter(v => !v.known).forEach(v => bad.push(`seed ${seed} [${v.code}] ${v.ctx} ${v.msg}`));
    }
    assert.deepEqual(bad.slice(0, 5), [], `위반 ${bad.length}건 — node test/fuzz-engine.js --seed N 으로 재현`);
});
