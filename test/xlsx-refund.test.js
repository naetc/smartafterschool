/* ==========================================================================
   환불 이력서 엑셀 파일 검증 — ExcelJS 서식 전환 (2026-11-24)

   퍼즈 B6(한 건의 초3 + 자유 + 자부담 = 환불액)과 B6b(예산별 시트 = 전체 시트의 그 예산 열)는
   모델을 수천 건 검사한다. 여기서는 그 모델이 진짜 파일에 그대로 옮겨지는지 본다.
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { exportBook, exportFile, checkXlFile } = require('./harness');
const { buildScenario } = require('./fuzz-engine');

// 환불이 있는 시나리오·분기를 모은다
function refundCases(maxSeed) {
    const out = [];
    for (let seed = 1; seed <= maxSeed; seed++) {
        const w = buildScenario(seed);
        w.recomputeAll();
        for (let q = 1; q <= 4; q++) if (exportBook(w, 'exRef', { q })) out.push({ seed, w, q });
    }
    return out;
}

test('[환불 이력서] 진짜 파일 = 모델 (4개 시트 모두, 합계 수식·값·서식)', async () => {
    const cases = refundCases(15);
    assert.ok(cases.length >= 5, `환불 있는 경우가 너무 적다: ${cases.length}`);
    const bad = [];
    for (const { seed, w, q } of cases) {
        const book = exportBook(w, 'exRef', { q });
        const file = await exportFile(w, 'exRef', { q });
        assert.equal(file.wb.worksheets.length, 4);
        checkXlFile(book, file).forEach(m => bad.push(`seed ${seed} ${q}분기: ${m}`));
    }
    assert.deepEqual(bad.slice(0, 5), []);
});

test('[환불 이력서] 학년·반·번호·연번은 숫자로 저장하되 합계를 내지 않는다', async () => {
    const { w, q } = refundCases(15)[0];
    const file = await exportFile(w, 'exRef', { q });
    const ws = file.wb.worksheets[0];
    const ds = ws.views[0].ySplit + 1;
    let tr = ds; while (ws.getCell(tr, 1).value !== '합계') tr++;
    for (let c = 1; c <= 4; c++) assert.equal(typeof ws.getCell(ds, c).value, 'number', `${c}열이 숫자가 아니다`);
    // 합계 글자는 금액 열 앞(연번~처리 8칸)을 합쳐 쓴다 — 학년·반·번호 칸에 합계가 없다
    assert.ok(ws.getCell(tr, 8).isMerged, '합계 글자 칸이 금액 열 앞까지 병합되지 않았다');
    assert.equal(typeof (ws.getCell(tr, 9).value || {}).formula, 'string', '첫 금액 열(수강료 환불)에 합계 수식이 없다');
    assert.equal(ws.getCell(ws.views[0].ySplit - 1, 8).value, '처리');
});

test('[환불 이력서] 예산에서 나간 환불이 없는 시트는 안내 문구를 띄운다', async () => {
    // 초3 대상이 아닌 학생만 있는 시나리오를 찾는다
    for (const { w, q } of refundCases(40)) {
        const book = exportBook(w, 'exRef', { q });
        const empty = book.sheets.findIndex(s => s.rows.length === 0);
        if (empty < 0) continue;
        const file = await exportFile(w, 'exRef', { q });
        const ws = file.wb.worksheets[empty];
        assert.match(String(ws.getCell(ws.views[0].ySplit + 1, 1).value), /환불 내역이 없습니다/);
        return;
    }
    assert.fail('빈 예산 시트가 있는 시나리오를 찾지 못했다');
});
