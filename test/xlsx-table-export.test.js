/* ==========================================================================
   화면 표 → 엑셀(exportAsExcel)의 학적 열 분리 검증 — 2026-11-24

   [결함] 4스텝 학생별·강좌별 표를 엑셀로 받으면 맨 아래 합계 행의 숫자가 왼쪽으로
   정확히 2칸 밀렸다. 학적(1-1-1)을 학년/반/번호 3칸으로 나눌 때 학생 행만 2칸 늘고,
   학적 열을 가로로 덮는 "총 합계" 병합 칸은 그대로였기 때문이다.

   [불변식] 학적 열을 나눈 뒤에도
     · 모든 행의 길이가 같다(어느 행도 다른 행보다 칸이 적지 않다)
     · 합계 행의 각 숫자는 그 위 학생 행들의 같은 열 합계와 같다
   ※ 예전 코드는 HTML 복제본을 고치는 방식이라 Node에서 돌릴 수 없다. 수정 전 실패는
     브라우저에서 실제 파일로 재현했다(학생별·강좌별 모두 합계가 2칸 왼쪽, 2026-11-24).
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { freshUi, ensureXl, ensureExcelJs, ExcelJSNode } = require('./harness');

const w = freshUi();
const S = v => ({ t: 's', v });
const N = v => ({ t: 'n', v });
const H = () => S(w.DP_MARK.HEAD);
const D = dp => S(w.DP_MARK.CELL + dp);
// vm 샌드박스 객체는 프로토타입이 달라 deepEqual이 실패하므로 평범한 객체로 바꿔 비교한다(빈칸은 null).
const plain = o => JSON.parse(JSON.stringify(o));
const mg = (r1, c1, r2, c2) => ({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });

// 열마다: 합계 행의 숫자 = 학생 행 숫자의 합
function assertTotalsLineUp(grid, firstDataRow, totalRow) {
    const width = grid[0].length;
    grid.forEach((row, i) => assert.equal(row.length, width, `${i}행 길이가 다르다`));
    let checked = 0;
    grid[totalRow].forEach((cell, c) => {
        if (!cell || cell.t !== 'n') return;
        let sum = 0;
        for (let r = firstDataRow; r < totalRow; r++) if (grid[r][c] && grid[r][c].t === 'n') sum += grid[r][c].v;
        assert.equal(cell.v, sum, `${c}열: 합계 ${cell.v} ≠ 학생 합 ${sum}`);
        checked++;
    });
    assert.ok(checked > 0, '검사한 합계 칸이 없다');
}

test('강좌별 표: "총 합계"가 학적 열을 가로로 덮어도 합계가 제 열에 남는다', () => {
    // 분기 | 학적 | 이름 | 수강료 | 교재비
    const grid = [
        [S('분기'), H(), S('이름'), S('금액'), undefined],
        [undefined, undefined, undefined, S('수강료'), S('교재비')],
        [S('1분기'), D('1-2-3'), S('가'), N(100), N(10)],
        [S('1분기'), D('2-1-5'), S('나'), N(200), N(20)],
        [S('총 합계'), undefined, undefined, N(300), N(30)],
    ];
    const merges = [mg(0, 0, 1, 0), mg(0, 1, 1, 1), mg(0, 2, 1, 2), mg(0, 3, 0, 4), mg(4, 0, 4, 2)];
    const out = plain(w.splitDpColumns(grid, merges));

    assertTotalsLineUp(out.grid, 2, 4);
    assert.deepEqual(out.grid[0].slice(1, 4).map(c => c.v), ['학년', '반', '번호']);
    assert.deepEqual(out.grid[2].slice(1, 4).map(c => c.v), [1, 2, 3]);
    assert.equal(out.grid[1][5].v, '수강료');
    assert.equal(out.grid[4][5].v, 300);           // 수강료 합계가 수강료 아래에
    assert.deepEqual(out.merges.find(m => m.s.r === 4), mg(4, 0, 4, 4));   // 총 합계 병합이 2칸 넓어짐
    assert.deepEqual(out.merges.find(m => m.s.r === 0 && m.s.c === 5), mg(0, 5, 0, 6)); // 오른쪽 병합은 2칸 이동
    assert.equal(out.merges.filter(m => m.s.r === 0 && m.e.r === 1 && m.s.c >= 1 && m.s.c <= 3).length, 3);
});

test('학생별 표: 학적이 여러 강좌 행을 세로로 묶어도(rowspan) 어긋나지 않는다', () => {
    // 학적 | 이름 | 강좌 | 수강료 — 한 학생이 강좌 2개
    const grid = [
        [H(), S('이름'), S('강좌'), S('수강료')],
        [D('3-1-7'), S('가'), S('로봇'), N(100)],
        [undefined, undefined, S('바둑'), N(50)],
        [D('3-2-1'), S('나'), S('로봇'), N(100)],
        [S('검색된 학생 총 합계'), undefined, undefined, N(250)],
    ];
    const merges = [mg(1, 0, 2, 0), mg(1, 1, 2, 1), mg(4, 0, 4, 2)];
    const out = plain(w.splitDpColumns(grid, merges));

    assertTotalsLineUp(out.grid, 1, 4);
    assert.equal(out.grid[0][5].v, '수강료');
    assert.equal(out.grid[4][5].v, 250);
    // 세로 병합은 학년·반·번호 세 열 각각에 생긴다
    assert.deepEqual(out.merges.filter(m => m.s.r === 1 && m.e.r === 2 && m.s.c <= 2).map(m => m.s.c).sort(), [0, 1, 2]);
    assert.deepEqual(out.merges.find(m => m.s.r === 1 && m.s.c === 3), mg(1, 3, 2, 3));   // 이름 병합은 2칸 이동
});

test('학적이 1-1-1 꼴이 아니면 글자 그대로 첫 칸에 둔다', () => {
    const out = plain(w.splitDpColumns([[H()], [D('전출')]], []));
    assert.equal(out.grid[1][0].v, '전출');
    assert.equal(out.grid[1].length, 3);
});

test('학적 열이 없는 표는 건드리지 않는다', () => {
    const grid = [[S('강좌명'), S('합')], [S('로봇'), N(1)], [S('총 합계'), N(1)]];
    const merges = [mg(0, 0, 0, 1)];
    const out = plain(w.splitDpColumns(grid, merges));
    assert.deepEqual(out.grid, grid);
    assert.deepEqual(out.merges, merges);
});

// 화면 표 → 서식 입힌 엑셀(XL.fromGrid): 학적을 나눈 격자를 진짜 파일로 쓰고 다시 읽는다.
// 제목 줄이 위에 붙어도 합계 숫자는 머리글과 같은 열에 있어야 하고, 금액은 숫자로 남아야 한다.
test('서식 입힌 파일에서도 합계가 제 열에 있고 금액은 숫자다', async () => {
    ensureXl(w);
    w.ExcelJS = ensureExcelJs(w);
    const grid = [
        [S('분기'), H(), S('이름'), S('금액'), undefined],
        [undefined, undefined, undefined, S('수강료'), S('교재비')],
        [S('1분기'), D('1-2-3'), S('가'), N(100000), N(10)],
        [S('1분기'), D('2-1-5'), S('나'), N(200000), N(20)],
        [S('총 합계'), undefined, undefined, N(300000), N(30)],
    ];
    const merges = [mg(0, 0, 1, 0), mg(0, 1, 1, 1), mg(0, 2, 1, 2), mg(0, 3, 0, 4), mg(4, 0, 4, 2)];
    const out = w.splitDpColumns(grid, merges);
    const { wb, off, headRows } = w.XL.fromGrid(out.grid, out.merges, { title: '4스텝 강좌별' });
    const back = new ExcelJSNode.Workbook();
    await back.xlsx.load(await wb.xlsx.writeBuffer());
    const ws = back.worksheets[0];

    assert.equal(headRows, 2);
    assert.equal(ws.getCell(1, 1).value, '4스텝 강좌별');
    const hr = off + 2, tr = off + 5;                       // 머리글 2번째 줄, 합계 행
    assert.equal(ws.getCell(hr, 6).value, '수강료');
    assert.equal(ws.getCell(tr, 6).value, 300000, '수강료 합계가 수강료 열에 없다');
    assert.equal(ws.getCell(tr, 7).value, 30);
    assert.equal(ws.getCell(off + 3, 2).value, 1, '학년이 숫자로 나뉘지 않았다');
    assert.ok(ws.getCell(off + 3, 6).numFmt.includes('#,##0'));
    assert.ok(ws.getCell(tr, 6).font.bold, '합계 행이 굵지 않다');
    assert.equal(ws.views[0].ySplit, off + headRows);
});
