/* ==========================================================================
   교육비 청구서 케이스별 상세 (2026-11-26)

   행정망 품의는 "단가 × 인원" 행으로 나눠 올린다. 그래서 한 부서 안에서 원가·초3·자유·자부담
   (각 강사료·수용비) 12칸이 모두 같은 학생을 한 줄로 묶는다. 사유는 묶는 기준이 아니라 나열만 한다.
   부서 합계와의 일치는 퍼즈 B8이 수천 건 검사하고, 여기서는 대표 시나리오로
     · 어떤 학생이 어느 줄에 들어가는지(묶는 기준)
     · 진짜 파일의 [케이스별 상세] 시트가 모델 그대로이고, 단가 열은 합계에서 빠지는지
   를 확인한다.
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { freshExport, exportBook, exportFile, checkXlFile } = require('./harness');

// 축구 3분기 60,000원(강사료 57,000 + 수용비 3,000), 4학년 8명 + 3학년(초3) 1명
function scenario() {
    const w = freshExport({}, ['app-utils.js']);
    w.C['축구'] = { 3: { t: 60000, b: 10000, m: 0, mh: '4,4,4', instTot: 57000, mgmtTot: 3000 } };
    const stu = (n, extra = {}) => ({ g: 4, b: 1, n, name: `학생${n}`, q: 3, course: '축구', refunds: [], adjusts: [], ...extra });
    w.E = [
        stu(1), stu(2), stu(3), stu(4),
        stu(5, { adjusts: [{ title: '교재 미수령', amtT: 0, amtB: -10000, amtM: 0 }] }),       // 교재비만 조정 → 수강료는 당초대로
        stu(6, { refunds: [{ ty: 'STUDENT', sessIdx: 2, ah: 0, bkRefTy: 'NONE' }] }),            // 3차 포기
        stu(7, { refunds: [{ ty: 'STUDENT', sessIdx: 2, ah: 0, bkRefTy: 'NONE' }] }),            // 같은 금액의 환불 → 6번과 한 줄
        stu(8, { adjusts: [{ title: '할인', amtT: -10000, amtB: 0, amtM: 0 }] }),
        { g: 3, b: 1, n: 9, name: '초3학생', q: 3, course: '축구', refunds: [], adjusts: [] },
    ];
    w.recomputeAll();
    return w;
}

test('[청구서 케이스] 금액이 같은 학생끼리 한 줄, 사유는 나열만 한다', () => {
    const w = scenario();
    const cases = w.buildInvoiceCases(3, 'ALL');
    const byNames = cases.map(c => c.items.map(it => it.h.nm).sort().join(','));

    // 당초대로 수납한 일반 학생 5명(교재비만 조정한 5번 포함)이 첫 줄
    assert.equal(cases[0].no, 1);
    assert.equal(byNames[0], '학생1,학생2,학생3,학생4,학생5');
    assert.equal(cases[0].unit.sT, 60000);
    assert.equal(cases[0].unit.finT, 60000);
    assert.equal(w.fmtCaseCounts(cases[0].reasons), '정상', '교재비만 조정한 학생은 청구서(수강료) 사유가 없다');

    // 같은 금액의 환불 두 명은 한 줄, 할인 조정·초3 학생은 각자 한 줄
    assert.ok(byNames.includes('학생6,학생7'), byNames.join(' / '));
    assert.ok(byNames.includes('학생8'));
    assert.ok(byNames.includes('초3학생'));
    assert.equal(cases.length, 4);

    const refund = cases.find(c => c.cnt === 2);
    assert.match(w.fmtCaseCounts(refund.reasons), /^환불 3차 포기/);
    const cho3 = cases.find(c => c.items[0].h.nm === '초3학생');
    assert.equal(w.fmtCaseCounts(cho3.targets), '초3');
    assert.ok(cho3.unit.tc > 0);

    // 줄 금액 = 단가 × 인원, 모든 줄의 합 = 학생 9명 합
    const sum = k => cases.reduce((s, c) => s + c.tot[k], 0);
    w.INV_UNIT_KEYS.forEach(k => assert.equal(sum(k), w.invoiceItems(3, 'ALL').reduce((s, it) => s + ((k in it.split) ? it.split[k] : it.d[k]), 0), k));
    assert.equal(cases.reduce((s, c) => s + c.cnt, 0), 9);
});

test('[청구서 케이스] 청구서 파일에 [케이스별 상세] 시트가 있고 진짜 파일 = 모델, 단가 열은 합계에서 뺀다', async () => {
    const w = scenario();
    const book = exportBook(w, 'exInvoice', { q: 3, p_sInvoice: 'ALL' });
    assert.equal(book.sheets.length, 2);
    const sh = book.sheets[1];
    assert.equal(sh.name, '케이스별 상세');
    assert.deepEqual(sh.rows.map(r => r['케이스']), [1, 2, 3, 4]);
    assert.equal(sh.rows.reduce((s, r) => s + r['인원'], 0), book.sheets[0].rows[0]['청구인원']);

    const file = await exportFile(w, 'exInvoice', { q: 3, p_sInvoice: 'ALL' });
    assert.deepEqual(checkXlFile(book, file), []);
    // 단가 열의 합계 칸은 비어 있어야 한다(더하면 의미 없는 숫자가 찍힌다)
    const ws = file.wb.worksheets[1];
    const col = sh.columns.indexOf('단가_원가') + 1;
    const totalRow = ws.views[0].ySplit + sh.rows.length + 1;
    assert.equal(ws.getCell(totalRow, 1).value, '합계');
    assert.ok(ws.getCell(totalRow, col).value == null, '단가 열에 합계가 찍혔다');
});
