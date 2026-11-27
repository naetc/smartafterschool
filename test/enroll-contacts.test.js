/* ==========================================================================
   수강생 명단의 연락처·귀가방법(선택 열) (2026-11-27)

   스마트 출석부의 연락처 마스터는 저장되지 않아 새로고침하면 사라졌다(그래서 없앴다). 대신 2스텝 수강생 명단
   양식에 두 열을 선택값으로 받아 등록(e.phone / e.goHome)에 저장한다. 금액 계산과는 무관하다.
     · 새 등록에 저장, 이미 있는 등록은 두 칸만 채우고(금액·이력은 그대로) 빈 칸은 기존 값을 지우지 않는다
     · 마감 분기용 CONTACT_ONLY는 새 등록을 만들지 않는다
     · 조회 순서: 같은 분기 등록 → 최근 분기 등록(칸마다 따로)
     · 백업 → 복구 → 새로고침 뒤에도 남고, 정산 금액은 그대로다
     · 수강현황 종합 명단에 연락처 열이 생긴다
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { freshUi, exportBook, backupText, simulateRestore, simulateReload } = require('./harness');

function world() {
    const w = freshUi({}, ['app-ui-export.js', 'app-db.js']);
    w.C['축구'] = { 3: { t: 60000, b: 0, m: 0, mh: '4,4,4' }, 4: { t: 60000, b: 0, m: 0, mh: '4,4,4' } };
    w.C['미술'] = { 4: { t: 50000, b: 10000, m: 0, mh: '4,4,4' } };
    w.E = [
        { q: 4, g: 4, b: 1, n: 1, name: '학생1', course: '축구', refunds: [], adjusts: [{ title: '할인', amtT: -10000, amtB: 0, amtM: 0 }] },
    ];
    w.recomputeAll();
    w.showAlert = () => {};
    return w;
}
const row = (o) => ({ q: 4, g: 4, b: 1, n: 1, name: '학생1', course: '축구', mm: '', phone: '', goHome: '', ...o });

test('[연락처] 양식 머리글을 읽는다 — 다른 이름도 허용, 빈 칸은 빈 값', () => {
    const w = world();
    assert.deepEqual({ ...w.readContactCols({ '연락처': ' 010-1 ', '귀가방법': '돌봄' }) }, { phone: '010-1', goHome: '돌봄' });
    assert.deepEqual({ ...w.readContactCols({ '휴대전화': '010-2', '하원': '도보' }) }, { phone: '010-2', goHome: '도보' });
    assert.deepEqual({ ...w.readContactCols({ '이름': 'x' }) }, { phone: '', goHome: '' });
});

test('[연락처] 새 등록엔 저장, 이미 있는 등록은 두 칸만 채운다(금액·조정 그대로)', () => {
    const w = world();
    const before = JSON.stringify(w.Hs.map(h => [h.sT, h.finT]));
    w.pendingEnrollData = [
        row({ phone: '010-1111', goHome: '돌봄' }),                                   // 이미 있음 → 두 칸만
        row({ g: 5, n: 2, name: '학생2', course: '미술', phone: '010-2222' }),         // 새 등록
    ];
    w.execEnrollUpload('APPEND');
    assert.equal(w.E.length, 2);
    const e1 = w.E.find(e => e.name === '학생1');
    assert.equal(e1.phone, '010-1111'); assert.equal(e1.goHome, '돌봄');
    assert.equal(e1.adjusts.length, 1, '조정 이력이 그대로');
    assert.equal(w.E.find(e => e.name === '학생2').phone, '010-2222');
    assert.equal(w.E.find(e => e.name === '학생2').goHome, undefined, '빈 칸은 필드를 만들지 않는다');
    w.recomputeAll();
    assert.equal(JSON.stringify(w.Hs.filter(h => h.nm === '학생1').map(h => [h.sT, h.finT])), before);

    // 빈 칸으로 다시 올려도 기존 값을 지우지 않는다
    w.pendingEnrollData = [row({ goHome: '도보' })];
    w.execEnrollUpload('APPEND');
    assert.equal(e1.phone, '010-1111'); assert.equal(e1.goHome, '도보');
});

test('[연락처] 마감 분기용 CONTACT_ONLY는 새 등록을 만들지 않는다', () => {
    const w = world();
    let msg = '';
    w.showAlert = m => { msg = m; };
    w.pendingEnrollData = [row({ phone: '010-1111' }), row({ g: 5, n: 2, name: '학생2', course: '미술', phone: '010-2222' })];
    w.execEnrollUpload('CONTACT_ONLY');
    assert.equal(w.E.length, 1);
    assert.equal(w.E[0].phone, '010-1111');
    // 결과는 명단 확인·수정 모달로 간다(rcState.report)
    const rp = w.rcState.report;
    assert.equal(rp.mode, 'CONTACT_ONLY'); assert.equal(rp.updated, 1); assert.equal(rp.added, 0);
    assert.equal(rp.skipped.length, 1); assert.match(rp.skipped[0].reason, /마감 분기/);
});

test('[연락처] 조회 순서: 같은 분기 → 최근 분기', () => {
    const w = world();
    w.E.push({ q: 3, g: 4, b: 1, n: 1, name: '학생1', course: '축구', refunds: [], adjusts: [], phone: '010-OLD', goHome: '보호자' });
    w.E[0].phone = '010-NEW';
    assert.deepEqual({ ...w.studentContact(4, 1, 1, '학생1', 4) }, { phone: '010-NEW', goHome: '보호자' }, '칸마다 따로: 귀가방법은 3분기 값');
    assert.equal(w.studentContact(4, 1, 1, '학생1', 3).phone, '010-OLD', '요청한 분기 값이 먼저');
    assert.equal(w.studentContact(9, 9, 9, '없음', 4).phone, '');
});

test('[연락처] 백업 → 복구 → 새로고침 뒤에도 남고 금액은 그대로, 종합 명단에 열이 생긴다', async () => {
    const w = world();
    w.pendingEnrollData = [row({ phone: '010-1111', goHome: '돌봄' })];
    w.execEnrollUpload('APPEND');
    w.recomputeAll();
    const money = x => JSON.stringify(x.Hs.map(h => [h.q, h.id, h.c, h.sT, h.tc, h.tf, h.finT]));
    const { saved } = await simulateRestore(backupText(w));
    const w2 = await simulateReload(saved, ['app-utils.js', 'app-ui-export.js']);
    assert.equal(w2.E[0].phone, '010-1111'); assert.equal(w2.E[0].goHome, '돌봄');
    assert.equal(money(w2), money(w));

    const list = exportBook(w2, 'exEnrollReport', { q: 4 }).sheets[2].rows;
    assert.equal(list[0]['연락처'], '010-1111'); assert.equal(list[0]['귀가방법'], '돌봄');
});

test('[연락처] 아무도 연락처가 없으면 종합 명단에 열이 없다', () => {
    const w = world();
    const cols = exportBook(w, 'exEnrollReport', { q: 4 }).sheets[2].columns;
    assert.ok(!cols.includes('연락처'));
});

// 양식의 [작성안내] 시트(2026-11-27)는 업로드 때 건너뛰어야 한다 — 양식을 진짜 파일로 만들어 진짜 upEnroll에 넣는다.
test('[명단 양식] 작성안내 시트는 건너뛰고, 예시 행만 학생으로 읽힌다 (통합·강좌별)', async () => {
    const path = require('path');
    const { exportFile } = require('./harness');
    const XLSXNode = require(path.join(__dirname, '..', 'vendor/xlsx/xlsx.full.min.js'));
    for (const [fn, course] of [['dlSampleUnified', '로봇과학'], ['dlSampleSeparate', '로봇과학']]) {
        const w = freshUi({}, ['app-ui-export.js']);
        w.C = { '로봇과학': { 1: { t: 60000, b: 0, m: 0, mh: '4,4,4' } } };
        w.E = [];
        const file = await exportFile(w, fn, { q: 1 });
        assert.equal(file.wb.worksheets[0].name, '작성안내');
        // 필수 열은 파랑, 선택 열은 회색 머리글
        const data = file.wb.worksheets[1];
        const head = {}; data.getRow(1).eachCell((c, i) => { head[c.value] = c.fill?.fgColor?.argb; });
        assert.notEqual(head['이름'], head['연락처'], '필수·선택 머리글 색이 다르다');
        assert.equal(head['이름'], head['학년']);
        assert.equal(head['연락처'], head['귀가방법']);
        assert.ok(!('비고' in head), '비고 열은 양식에서 뺐다(2026-11-27)');

        w.XLSX = XLSXNode;
        w.$('fileEnroll').files = [{ name: 'x.xlsx' }];
        w.$('exEnQ').value = '1';
        w.readFileAsArrayBuffer = async () => file.buffer;
        w.mdlUpload = null;                                   // 확인 창 없이 바로 추가(병합)
        let alertMsg = ''; w.showAlert = m => { alertMsg = m; };
        await w.upEnroll();
        assert.equal(w.E.length, 1, `${fn}: 예시 학생 1명만 등록 (${alertMsg})`);
        assert.equal(w.rcState.report.added, 1);
        assert.equal(w.rcState.report.skipped.length, 0, '[작성안내] 시트는 건너뛴 줄로 세지 않는다');
        assert.equal(w.E[0].course, course);
        assert.equal(w.E[0].phone, '010-1234-5678');
    }
});

// 업로드에서 빠진 줄을 이유와 함께 보고한다(예전에는 말없이 버렸다) — 진짜 파일을 진짜 upEnroll에 넣는다.
async function uploadRows(w, sheets) {
    const path = require('path');
    const XLSXNode = require(path.join(__dirname, '..', 'vendor/xlsx/xlsx.full.min.js'));
    const wb = XLSXNode.utils.book_new();
    sheets.forEach(([name, rows]) => XLSXNode.utils.book_append_sheet(wb, XLSXNode.utils.json_to_sheet(rows), name));
    const buf = XLSXNode.write(wb, { type: 'buffer', bookType: 'xlsx' });
    w.XLSX = XLSXNode;
    w.$('fileEnroll').files = [{ name: 'x.xlsx' }];
    w.$('exEnQ').value = '4';
    w.readFileAsArrayBuffer = async () => buf;
    w.mdlUpload = null;
    w.showAlert = () => {};
    await w.upEnroll();
    return w.rcState && w.rcState.report;
}

test('[명단 확인] 강좌명이 안 맞거나 이름이 빈 줄은 이유와 함께 보고한다', async () => {
    const w = world();
    const rp = await uploadRows(w, [
        ['통합', [
            { '강좌명': '축구', '학년': 4, '반': 1, '번호': 1, '이름': '학생1', '연락처': '010-1' },   // 이미 등록 → 연락처 갱신
            { '강좌명': '미술', '학년': 5, '반': 1, '번호': 2, '이름': '학생2', '비고': '신규등록' },      // 신규(옛 양식의 비고는 무시)
            { '강좌명': '미술', '학년': 5, '반': 1, '번호': 2, '이름': '학생2' },                        // 같은 줄 반복 → 변경 없음
            { '강좌명': '축구교실', '학년': 5, '반': 1, '번호': 3, '이름': '학생3' },                    // 강좌명 없음
            { '강좌명': '미술', '학년': 5, '반': 1, '번호': 4, '이름': '' },                            // 이름 빈 줄
        ]],
        ['바둑', [{ '학년': 1, '반': 1, '번호': 1, '이름': '학생9' }]],                                // 시트 이름이 강좌에 없음
    ]);
    assert.equal(rp.added, 1); assert.equal(rp.updated, 1); assert.equal(rp.same, 1);
    const reasons = rp.skipped.map(x => `${x.sheet}:${x.row}:${x.reason}`);
    assert.deepEqual([...reasons], ['통합:5:강좌명이 1스텝에 없음', '통합:6:이름이 비어 있음', '바둑:2:시트 이름(강좌명)이 1스텝에 없음']);
    assert.equal(w.E.find(e => e.name === '학생2').mm, '', '업로드 파일의 비고는 적요에 넣지 않는다');
});

test('[명단 확인] 올릴 줄이 하나도 없어도 빠진 이유를 보여 준다', async () => {
    const w = world();
    const rp = await uploadRows(w, [['통합', [{ '강좌명': '없는강좌', '학년': 1, '반': 1, '번호': 1, '이름': '학생' }]]]);
    assert.equal(rp.mode, 'NONE'); assert.equal(rp.skipped.length, 1);
    assert.equal(w.E.length, 1, '장부는 그대로');
});

test('[명단 확인] 저장: 연락처·귀가는 학생 단위로 그 분기 모든 강좌에, 적요·금액은 그대로', () => {
    const w = world();
    w.E.push({ q: 4, g: 4, b: 1, n: 1, name: '학생1', course: '미술', refunds: [], adjusts: [], phone: '010-OLD', mm: '정산 메모' });
    w.E.push({ q: 3, g: 4, b: 1, n: 1, name: '학생1', course: '축구', refunds: [], adjusts: [], phone: '010-Q3' });
    w.recomputeAll();
    const money = () => JSON.stringify(w.Hs.map(h => [h.q, h.c, h.sT, h.tc, h.tf, h.finT]));
    const before = money();
    const id = w.uid(4, 1, 1, '학생1');
    const r = w.applyRosterEdits(4, [{ uid: id, phone: '010-NEW', goHome: '돌봄' }]);
    assert.deepEqual({ ...r }, { nStu: 1 });
    const q4 = w.E.filter(e => e.q === 4);
    assert.deepEqual(q4.map(e => [e.course, e.phone, e.goHome]), [['축구', '010-NEW', '돌봄'], ['미술', '010-NEW', '돌봄']]);
    assert.equal(w.E.find(e => e.q === 3).phone, '010-Q3', '다른 분기는 그대로');
    assert.equal(q4.find(e => e.course === '미술').mm, '정산 메모', '적요는 건드리지 않는다');
    assert.equal(money(), before, '금액 불변');
    // 빈 값으로 저장하면 그 칸을 지운다(모달에서 지우기)
    w.applyRosterEdits(4, [{ uid: id, goHome: '' }]);
    assert.ok(w.E.filter(e => e.q === 4).every(e => !('goHome' in e) && e.phone === '010-NEW'));
    assert.equal(w.undoLabel.startsWith('명단 확인·수정(4분기)'), true, '되돌리기 한 번으로 취소할 수 있다');
});

test('[명단 확인] 강좌별 확인: 강좌마다 수강 학생 수와 연락처 없는 학생 수(학생 단위 기준)', () => {
    const w = world();
    w.E = [
        { q: 4, g: 1, b: 1, n: 1, name: '가', course: '축구', refunds: [], adjusts: [], phone: '010-1' },
        { q: 4, g: 1, b: 1, n: 1, name: '가', course: '미술', refunds: [], adjusts: [] },          // 같은 학생: 다른 강좌에 연락처 있음 → 있음
        { q: 4, g: 1, b: 1, n: 2, name: '나', course: '미술', refunds: [], adjusts: [] },
        { q: 4, g: 1, b: 1, n: 3, name: '다', course: '미술', refunds: [], adjusts: [], goHome: '도보' },
        { q: 3, g: 1, b: 1, n: 4, name: '라', course: '미술', refunds: [], adjusts: [] },          // 다른 분기는 세지 않음
    ];
    assert.deepEqual([...w.rosterCourseStats(4)].map(c => [c.course, c.n, c.missing]), [['미술', 3, 1], ['축구', 1, 0]]);
});

// 엑셀 칸이 숫자 서식이면 01012345678이 1012345678로 올라온다(2026-11-27 실무 보고). 0을 되살리고 꼴을 맞춘다.
test('[연락처] 앞자리 0이 지워진 번호를 되살리고 010-1234-5678 꼴로 맞춘다', () => {
    const w = world();
    const cases = [
        [1012345678, '010-1234-5678'], ['1012345678', '010-1234-5678'], ['01012345678', '010-1234-5678'],
        ['010-1234-5678', '010-1234-5678'], ['010 1234 5678', '010-1234-5678'], [111234567, '011-123-4567'],
        [212345678, '02-1234-5678'], [21234567, '02-123-4567'], [3112345678, '031-1234-5678'],
        ['15881234', '15881234'], ['엄마 010-1111-2222', '엄마 010-1111-2222'], ['', ''], [null, ''],
    ];
    cases.forEach(([v, want]) => assert.equal(w.normPhone(v), want, String(v)));
});

test('[연락처] 숫자 칸으로 올라온 번호도 업로드 때 010으로 저장된다 + 예전 값도 바르게 보인다', async () => {
    const w = world();
    await uploadRows(w, [['통합', [{ '강좌명': '미술', '학년': 5, '반': 1, '번호': 2, '이름': '학생2', '연락처': 1012345678 }]]]);
    assert.equal(w.E.find(e => e.name === '학생2').phone, '010-1234-5678');
    // 이 수정 전에 '1012345678'로 저장된 값: 장부는 그대로 두고 보여 줄 때만 바로잡는다
    const e = w.E.find(x => x.name === '학생1'); e.phone = '1099998888';
    assert.equal(w.studentContact(e.g, e.b, e.n, e.name, e.q).phone, '010-9999-8888');
});

test('[명단 양식] 연락처 열은 텍스트 서식이라 엑셀이 0을 지우지 않는다', async () => {
    const { exportFile } = require('./harness');
    const w = freshUi({}, ['app-ui-export.js']);
    w.C = { '로봇과학': { 1: { t: 60000, b: 0, m: 0, mh: '4,4,4' } } };
    w.E = [];
    const file = await exportFile(w, 'dlSampleUnified', { q: 1 });
    const ws = file.wb.worksheets[1];
    let col = 0; ws.getRow(1).eachCell((c, i) => { if (c.value === '연락처') col = i; });
    assert.ok(col);
    assert.equal(ws.getCell(2, col).numFmt, '@', '예시 칸');
    assert.equal(ws.getColumn(col).numFmt, '@', '열 전체(사용자가 새로 입력하는 줄)');
    let other = 0; ws.getRow(1).eachCell((c, i) => { if (c.value === '이름') other = i; });
    assert.notEqual(ws.getColumn(other).numFmt, '@', '다른 열은 그대로');
});

// 명단 확인창의 '○분기 값 사용 중' 안내: 이번 분기에 없는 값만, 칸마다 가장 최근 분기 값과 그 분기를 알려 준다.
test('[명단 확인] 다른 분기 값: 이번 분기 제외, 칸마다 최근 분기, 이름 띄어쓰기 무시', () => {
    const w = world();
    const p = { g: 6, b: 2, n: 7, refunds: [], adjusts: [], course: '미술' };
    w.E = [
        { ...p, q: 4, name: '홍길동' },                                   // 이번 분기: 비어 있음
        { ...p, q: 1, name: '홍 길동', phone: '1011112222', goHome: '도보' },   // 띄어 쓴 이름도 같은 학생
        { ...p, q: 3, name: '홍길동', phone: '010-3333-4444' },          // 연락처는 3분기가 최근, 귀가는 1분기에만
        { ...p, q: 2, name: '홍길순', phone: '010-9999-9999' },          // 다른 학생
    ];
    const o = w.otherQuarterContact(6, 2, 7, '홍길동', 4);
    assert.deepEqual({ ...o.phone }, { v: '010-3333-4444', q: 3 });
    assert.deepEqual({ ...o.goHome }, { v: '도보', q: 1 });
    // 이번 분기 값은 '다른 분기 값'이 아니다
    assert.equal(w.otherQuarterContact(6, 2, 7, '홍길동', 3).phone.q, 1);
    assert.equal(w.otherQuarterContact(6, 2, 7, '홍길동', 3).phone.v, '010-1111-2222', '앞자리 0 복구');
    assert.equal(w.otherQuarterContact(6, 2, 8, '홍길동', 4).phone, null);
});
