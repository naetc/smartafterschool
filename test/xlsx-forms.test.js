/* ==========================================================================
   나머지 서식 파일 검증 — 명렬표 · 업로드 양식 (2026-11-25 ExcelJS 서식 전환)

   · 명렬표: 진짜 파일 = 모델(checkXlFile). 금액 불변식은 퍼즈 B5가 모델로 검사한다.
   · 업로드 양식: 사용자가 채워서 다시 올리는 파일이다. 서식을 입혀도 앱의 업로드 파서
     (parseXlsx = SheetJS, 1행 머리글)로 읽으면 예시 행이 그대로 나와야 한다.
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { exportBook, exportFile, checkXlFile, freshEngine } = require('./harness');
const { buildScenario } = require('./fuzz-engine');
const XLSXNode = require(path.join(__dirname, '..', 'vendor/xlsx/xlsx.full.min.js'));

test('[명렬표] 진짜 파일 = 모델 (대상 4종 × 정렬 2종)', async () => {
    const bad = [];
    let n = 0;
    for (let seed = 1; seed <= 3; seed++) {
        const w = buildScenario(seed);
        w.recomputeAll();
        for (let q = 1; q <= 4; q++) for (const tg of ['ALL', 'SELF', 'CHO3', 'FREE']) for (const so of ['C', 'S']) {
            const book = exportBook(w, 'exRoster', { q, p_tg: tg, p_so: so });
            if (!book) continue;
            const file = await exportFile(w, 'exRoster', { q, p_tg: tg, p_so: so });
            checkXlFile(book, file).forEach(m => bad.push(`seed ${seed} ${q}분기 ${tg}/${so}: ${m}`));
            n++;
        }
    }
    assert.ok(n >= 10, `검사한 파일이 너무 적다: ${n}`);
    assert.deepEqual(bad.slice(0, 5), []);
});

test('[업로드 양식] 서식을 입혀도 업로드 파서가 읽는 값은 예시 행 그대로다', async () => {
    for (const accType of ['INTEGRATED', 'SEPARATED']) {
        const w = freshEngine({ accType }, ['app-utils.js', 'app-ui-export.js']);
        w.C = { '로봇과학(A)': {}, '바둑교실': {} };
        for (const fn of ['dlSampleCourse', 'dlSampleFree', 'dlSampleUnified', 'dlSampleSeparate']) {
            const book = exportBook(w, fn, { q: 1 });
            const file = await exportFile(w, fn, { q: 1 });
            const wb = XLSXNode.read(file.buffer, { type: 'buffer' });
            assert.deepEqual(wb.SheetNames, JSON.parse(JSON.stringify(book.sheets.map(s => s.name))), `${fn}: 시트 이름`);
            book.sheets.forEach((s, i) => {
                const parsed = XLSXNode.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { defval: '' });
                assert.deepEqual(parsed, JSON.parse(JSON.stringify(s.rows)), `${fn} ${s.name}: 업로드 파서가 읽은 값이 예시와 다르다`);
                // 1행이 곧 머리글이어야 한다(제목 줄이 끼면 업로드가 깨진다)
                assert.deepEqual(Object.keys(parsed[0]), Object.keys(s.rows[0]));
            });
        }
    }
});
