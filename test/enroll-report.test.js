/* ==========================================================================
   수강현황 종합 파일 (2026-11-27)

   학교에서 손으로 만들던 '수강신청 결과' 엑셀을 대신하는 6시트 파일. 시스템이 가진 데이터만 싣는다.
   금액 합계·항등식은 퍼즈 B9가 수천 건 검사하고, 여기서는 대표 시나리오로
     · 취소(개시 전 전액 환불)된 수강은 어느 시트에도 나오지 않는지(사용자 결정 2026-11-27)
     · 지원구분·상태 글자, 부서 묶음(과학(A)·(B) → 과학)
     · 수강생 명단에 연락처가 저장돼 있을 때만 연락처·귀가방법 열이 생기는지
     · 진짜 파일이 모델 그대로이고, 1인 단가 열은 합계에서 빠지고, 명단에 거름 단추가 있는지
   를 확인한다.
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { freshExport, exportBook, exportFile, checkXlFile } = require('./harness');

function scenario() {
    const w = freshExport({}, ['app-utils.js']);
    w.C['과학(A)'] = { 4: { t: 60000, b: 20000, m: 0, mh: '4,4,4' } };
    w.C['과학(B)'] = { 4: { t: 60000, b: 20000, m: 0, mh: '4,4,4' } };
    w.C['영어'] = { 4: { t: 90000, b: 10000, m: 0, mh: '4,4,4' } };
    const stu = (g, n, course, extra = {}) => ({ g, b: 1, n, name: `학생${g}${n}`, q: 4, course, refunds: [], adjusts: [], ...extra });
    w.E = [
        stu(4, 1, '과학(A)'), stu(4, 2, '과학(A)'),
        stu(4, 3, '과학(B)', { refunds: [{ ty: 'BEFORE', sessIdx: 0, ah: 0, bkRefTy: 'FULL' }] }),   // 개시 전 취소
        stu(4, 1, '영어'),                                                                              // 4-1은 두 부서
        stu(3, 1, '영어'),                                                                              // 초3
        stu(2, 1, '과학(B)', { adjusts: [{ title: '교재 미수령', amtT: 0, amtB: -20000, amtM: 0 }] }),  // 자유 + 교재비 조정
    ];
    w.F.push({ g: 2, b: 1, n: 1, name: '학생21', startQ: 1, startSess: 0, courses: {} });
    w.recomputeAll();
    return w;
}

test('[수강현황 종합] 취소된 수강은 빠진다, 부서·지원구분·상태', () => {
    const w = scenario();
    const book = exportBook(w, 'exEnrollReport', { q: 4 });
    assert.deepEqual([...book.sheets.map(s => s.name)], ['수강현황(강좌별)', '부서별 현황', '전체 수강 명단', '초3 명단', '자유수강권 명단', '개인별 현황']);
    const sh = Object.fromEntries(book.sheets.map(s => [s.name, s.rows]));

    const B = sh['수강현황(강좌별)'].find(r => r['강좌명'] === '과학(B)');
    assert.equal(B['수강'], 1, '취소한 4-3은 세지 않는다');
    assert.ok(!('신청' in B) && !('취소' in B) && !('강사명' in B), '시스템에 없는 칸·취소 칸은 없다');
    assert.equal(B['원가_수강료'], 60000, '취소 줄의 원가도 넣지 않는다');
    assert.equal(B['자유_인원'], 1);
    assert.equal(B['단가_수강료'], 60000);

    const sci = sh['부서별 현황'].find(r => r['부서'] === '과학');
    assert.equal(sci['반 수'], 2); assert.equal(sci['수강'], 3);

    const list = sh['전체 수강 명단'];
    assert.equal(list.length, 5, '취소 1줄을 뺀 5줄');
    assert.ok(!list.some(r => r['이름'] === '학생43'));
    assert.equal(list.find(r => r['이름'] === '학생31')['지원구분'], '초3');
    const free = list.find(r => r['이름'] === '학생21');
    assert.equal(free['지원구분'], '자유');
    assert.match(free['상태'], /^조정 교재 미수령/);
    assert.equal(free['환불·조정_교재비'], -20000);
    assert.ok(!('연락처' in list[0]), '저장된 연락처가 없으면 연락처 열도 없다');
    assert.deepEqual(list.slice(0, 2).map(r => r['학년']), [2, 3], '학적순');

    assert.equal(sh['초3 명단'].length, 1);
    assert.ok(sh['초3 명단'][0]['초3_계'] > 0);
    assert.equal(sh['자유수강권 명단'].length, 1);

    const p41 = sh['개인별 현황'].find(r => r['이름'] === '학생41');
    assert.equal(p41['강좌 수'], 2);
    assert.equal(p41['부서_과학'], 80000); assert.equal(p41['부서_영어'], 100000);
    assert.ok(!sh['개인별 현황'].some(r => r['이름'] === '학생43'), '취소만 한 학생은 개인별 현황에도 없다');
    assert.equal(sh['개인별 현황'].find(r => r['이름'] === '학생31')['부서_과학'], null, '듣지 않는 부서는 빈 칸');
});

test('[수강현황 종합] 수강생 명단에 연락처가 있으면 연락처·귀가방법 열이 생긴다', () => {
    const w = scenario();
    const e = w.E.find(x => x.name === '학생41' && x.course === '영어');
    e.phone = '010-0000-0000'; e.goHome = '돌봄';                                      // 다른 강좌(영어)에만 저장 → 과학 줄에도 나온다
    const list = exportBook(w, 'exEnrollReport', { q: 4 }).sheets[2].rows;
    const r = list.find(x => x['이름'] === '학생41');
    assert.equal(r['연락처'], '010-0000-0000'); assert.equal(r['귀가방법'], '돌봄');
    assert.equal(list.find(x => x['이름'] === '학생42')['연락처'], null);
});

test('[수강현황 종합] 진짜 파일 = 모델, 단가 열은 합계 제외, 명단에 거름 단추', async () => {
    const w = scenario();
    const book = exportBook(w, 'exEnrollReport', { q: 4 });
    const file = await exportFile(w, 'exEnrollReport', { q: 4 });
    assert.equal(file.filename, '방과후_수강현황종합_4분기.xlsx');
    assert.deepEqual(checkXlFile(book, file), []);
    // 강좌별 시트의 1인 단가 합계 칸에는 숫자가 없어야 한다(더하면 뜻 없는 숫자). '합계' 글자 병합 안에 들어간다
    const ws = file.wb.worksheets[0];
    const col = book.sheets[0].columns.indexOf('단가_수강료') + 1;
    const last = ws.rowCount;
    let totalRow = null;
    for (let r = last; r > 0; r--) if (ws.getCell(r, 1).value === '합계') { totalRow = r; break; }
    assert.ok(totalRow);
    const v = ws.getCell(totalRow, col).value;
    assert.ok(typeof v !== 'number' && !(v && v.formula), '단가 칸에 합계 숫자·수식이 없다');
    assert.ok(file.wb.worksheets[2].autoFilter, '전체 수강 명단에 거름 단추');
});
