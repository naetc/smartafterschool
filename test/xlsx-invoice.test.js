/* ==========================================================================
   교육비 청구서 엑셀 파일 검증 — ExcelJS 서식 전환 (2026-11-24)

   퍼즈(B1~B3)는 파일로 그리기 직전의 모델(행 값)을 수천 건 검사한다. 여기서는 그 모델이
   **진짜 파일에 그대로 옮겨지는지**를 대표 시나리오로 확인한다. 앱의 exInvoice와
   XL.download를 그대로 실행하고, 저장될 파일을 ExcelJS로 다시 연다.

   [불변식] 정답 금액을 몰라도 참이어야 하는 성질
     F1 파일 데이터 칸 = 모델 행 값 (열 순서·행 순서 그대로)
     F2 합계 행: 숫자 열마다 SUM 수식이 정확히 데이터 행 범위를 덮고, 저장된 값 = 파일 데이터 합
     F3 합계 숫자가 제 열에 있다(머리글의 '계/강사료/수용비'와 같은 열) — 4스텝 2칸 밀림 같은 사고 방지
     F4 숫자 칸은 숫자로 저장되고 천단위 서식이 붙는다(문자로 저장되면 엑셀 합계에서 빠진다)
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { exportBook, exportFile } = require('./harness');
const { buildScenario } = require('./fuzz-engine');

// 파일에서 머리행·데이터·합계 행을 찾는다. 머리행은 '부서명' 칸, 합계 행은 '합계' 칸으로 찾는다.
function readInvoice(wb) {
    const ws = wb.worksheets[0];
    const rowVals = r => { const v = ws.getRow(r).values; return v.slice(1); }; // ExcelJS 행 값은 1부터
    let head = 0;
    for (let r = 1; r <= ws.rowCount; r++) if (ws.getCell(r, 1).value === '부서명') { head = r; break; }
    assert.ok(head > 0, '머리행(부서명)을 찾지 못했다');
    let total = 0;
    for (let r = head + 2; r <= ws.rowCount; r++) if (ws.getCell(r, 1).value === '합계') { total = r; break; }
    return { ws, head, dataStart: head + 2, total, rowVals };
}

async function checkScenario(seed) {
    const w = buildScenario(seed);
    w.recomputeAll();
    let checked = 0;
    for (let q = 1; q <= 4; q++) {
        for (const s of ['ALL', 1]) {
            const book = exportBook(w, 'exInvoice', { q, p_sInvoice: s });
            if (!book) continue;
            const { rows, columns } = book.sheets[0];
            const file = await exportFile(w, 'exInvoice', { q, p_sInvoice: s });
            assert.ok(file, `seed ${seed} ${q}분기: 모델은 있는데 파일이 저장되지 않았다`);
            const { ws, head, dataStart, total, rowVals } = readInvoice(file.wb);
            const tag = `seed ${seed} ${q}분기 ${s}`;

            // F1
            assert.equal(total - dataStart, rows.length, `${tag}: 데이터 행 수`);
            rows.forEach((row, i) => {
                const got = rowVals(dataStart + i);
                columns.forEach((key, c) => assert.equal(got[c], row[key], `${tag}: ${i + 1}행 ${key}`));
            });

            // F2·F3·F4
            const sub = rowVals(head + 1);
            columns.forEach((key, c) => {
                const cell = ws.getCell(total, c + 1);
                if (typeof rows[0][key] !== 'number') return;
                const L = ws.getColumn(c + 1).letter;
                assert.equal(cell.value.formula, `SUM(${L}${dataStart}:${L}${total - 1})`, `${tag}: ${key} 합계 수식 범위`);
                const sum = rows.reduce((a, _, i) => a + ws.getCell(dataStart + i, c + 1).value, 0);
                // ExcelJS는 계산값 0을 파일에 적지 않는다(열 때 다시 계산: fullCalcOnLoad)
                assert.equal(cell.value.result ?? 0, sum, `${tag}: ${key} 합계 값`);
                if (key.includes('_')) assert.equal(sub[c], key.endsWith('강사료') ? '강사료' : key.endsWith('수용비') ? '수용비' : '계', `${tag}: ${key} 열 머리글`);
                for (let i = 0; i < rows.length; i++) {
                    const dc = ws.getCell(dataStart + i, c + 1);
                    assert.equal(typeof dc.value, 'number', `${tag}: ${key} 칸이 숫자가 아니다`);
                    assert.ok(dc.numFmt && dc.numFmt.includes('#,##0'), `${tag}: ${key} 칸에 천단위 서식이 없다`);
                }
            });
            checked++;
        }
    }
    return checked;
}

test('[교육비 청구서] 진짜 파일 = 모델, 합계 행은 수식·값·열 위치가 맞다 (무작위 12건)', async () => {
    let n = 0;
    for (let seed = 1; seed <= 12; seed++) n += await checkScenario(seed);
    assert.ok(n >= 12, `검사한 파일이 너무 적다: ${n}`);
});

test('[교육비 청구서] 문서 모양: 제목 병합, 2줄 머리글, 머리행 고정, A4 가로 인쇄', async () => {
    const w = buildScenario(3);
    w.recomputeAll();
    let q = 1; while (q <= 4 && !exportBook(w, 'exInvoice', { q, p_sInvoice: 'ALL' })) q++;
    const file = await exportFile(w, 'exInvoice', { q, p_sInvoice: 'ALL' });
    const ws = file.wb.worksheets[0];
    const { head } = readInvoice(file.wb);
    const ncol = ws.getRow(head).cellCount;

    assert.match(String(ws.getCell(1, 1).value), /교육비 청구서/);
    assert.ok(ws.getCell(1, ncol).isMerged, '제목이 표 너비만큼 병합되지 않았다');
    assert.equal(ws.getCell(head, 3).value, '수강료 원가');
    assert.equal(ws.getCell(head + 1, 3).value, '계');
    assert.ok(ws.getCell(head + 1, 1).isMerged, '부서명 머리글이 2줄로 병합되지 않았다');
    assert.equal(ws.views[0].ySplit, head + 1, '머리행 아래로 틀 고정이 안 됐다');
    assert.equal(ws.pageSetup.orientation, 'landscape');
    assert.equal(ws.pageSetup.fitToWidth, 1);
    assert.equal(file.filename, `방과후_강사비청구서_${q}분기.xlsx`);
});
