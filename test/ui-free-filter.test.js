/* ==========================================================================
   3스텝 자유수강권 명단(renderF)의 "지원 시점 수동 조작" / "전입 조정된 학생만"
   필터 검증.

   2026-09-21 이전의 필터는 강좌별 override(f.courses)가 서로 다른 경우(isMixed)만
   잡았다. 그런데 실 운영 백업 4개를 집계해 보니 f.courses를 쓴 학생이 단 한 명도
   없었고(0명), 지원시점은 전부 등록 화면의 f.startQ/f.startSess로 들어와 있었다.
   그래서 필터를 켜면 언제나 "대상자가 없습니다"가 떴다 — 정작 시점을 지정한 16명이
   통째로 빠진 채로.

   ⚠ 이 파일의 테스트는 반드시 수정 전 app-ui-steps.js에서 실패해야 한다.
      (CLAUDE.md 검증 3원칙 中 2 — 통과만 하는 테스트는 아무것도 지키지 않는다)
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { freshUi } = require('./harness');

// 피아노·바이올린 두 강좌, 1분기 3차수(4,4,4)짜리 기본 세팅.
function setup() {
    const w = freshUi();
    w.C = {
        '피아노':   { 1: { mh: '4,4,4', T: 60000, B: 10000 } },
        '바이올린': { 1: { mh: '4,4,4', T: 60000, B: 10000 } },
    };
    return w;
}

function addStu(w, n, name, fProps, courses = ['피아노', '바이올린']) {
    w.F.push({ g: 1, b: 1, n, name, startQ: 1, startSess: 0, courses: {}, ...fProps });
    courses.forEach(c => w.E.push({ q: 1, g: 1, b: 1, n, name, course: c, refunds: [], adjusts: [], seq: 0 }));
}

function onlyCustom(w, on) {
    w.el('chkOnlyCustomFree').checked = on;
    w.el('chkTransFree').checked = false;
    w.renderF();
    return w.renderedNames('tbFree');
}

test('"지원 시점 수동 조작" 필터는 등록 화면에서 시작분기를 지정한 학생을 잡아낸다', () => {
    const w = setup();
    addStu(w, 1, '기본1분기', {});
    addStu(w, 2, '2분기부터', { startQ: 2 });

    assert.deepStrictEqual(onlyCustom(w, false).sort(), ['2분기부터', '기본1분기']);
    assert.deepStrictEqual(onlyCustom(w, true), ['2분기부터']);
});

test('"지원 시점 수동 조작" 필터는 시작차수만 지정한 학생도 잡아낸다', () => {
    const w = setup();
    addStu(w, 1, '기본1분기', {});
    addStu(w, 2, '3차수부터', { startSess: 2 });

    assert.deepStrictEqual(onlyCustom(w, true), ['3차수부터']);
});

test('"지원 시점 수동 조작" 필터는 모달에서 전 강좌를 똑같은 시점으로 바꾼 학생도 잡아낸다', () => {
    // 강좌끼리 값이 같으면 isMixed가 false라 예전 필터가 놓치던 경우.
    const w = setup();
    addStu(w, 1, '기본1분기', {});
    addStu(w, 2, '전강좌2차수', { courses: { '피아노': { q: 1, s: 1, h: 1 }, '바이올린': { q: 1, s: 1, h: 1 } } });

    assert.deepStrictEqual(onlyCustom(w, true), ['전강좌2차수']);
});

test('"지원 시점 수동 조작" 필터는 강좌마다 시점이 다른 학생을 계속 잡아낸다(기존 동작 보존)', () => {
    const w = setup();
    addStu(w, 1, '기본1분기', {});
    addStu(w, 2, '강좌별다름', { courses: { '피아노': { q: 1, s: 0, h: 1 }, '바이올린': { q: 1, s: 2, h: 1 } } });

    assert.deepStrictEqual(onlyCustom(w, true), ['강좌별다름']);
});

test('"지원 시점 수동 조작" 필터는 육아기 근로시간 단축 학생을 계속 잡아낸다(기존 동작 보존)', () => {
    const w = setup();
    addStu(w, 1, '기본1분기', {});
    addStu(w, 2, '육아기단축', { reason: 'CHILDCARE_REDUCED', endQ: 1, endSess: 1 });

    assert.deepStrictEqual(onlyCustom(w, true), ['육아기단축']);
});

test('시점을 전혀 건드리지 않은 학생은 "지원 시점 수동 조작" 필터에 걸리지 않는다', () => {
    const w = setup();
    addStu(w, 1, '기본A', {});
    addStu(w, 2, '기본B', {});
    addStu(w, 3, '전입만', { transFreeAmt: 300000 }); // 전입 조정은 시점과 무관

    assert.deepStrictEqual(onlyCustom(w, true), []);
});

test('"전입 조정된 학생만" 필터는 transFreeAmt가 있는 학생만 남긴다', () => {
    const w = setup();
    addStu(w, 1, '기본', {});
    addStu(w, 2, '전입', { transFreeAmt: 300000 });
    addStu(w, 3, '전입0원', { transFreeAmt: 0 }); // 0원도 명시적 조정이므로 대상

    w.el('chkOnlyCustomFree').checked = false;
    w.el('chkTransFree').checked = true;
    w.renderF();
    assert.deepStrictEqual(w.renderedNames('tbFree').sort(), ['전입', '전입0원']);
});

test('두 필터를 같이 켜면 교집합(시점 조작 + 전입 조정)만 남는다', () => {
    const w = setup();
    addStu(w, 1, '시점만', { startQ: 2 });
    addStu(w, 2, '전입만', { transFreeAmt: 300000 });
    addStu(w, 3, '둘다', { startQ: 3, transFreeAmt: 200000 });

    w.el('chkOnlyCustomFree').checked = true;
    w.el('chkTransFree').checked = true;
    w.renderF();
    assert.deepStrictEqual(w.renderedNames('tbFree'), ['둘다']);
});

test('전입 뱃지(routeToFilter)를 누르면 다른 필터가 꺼져서 뱃지 숫자와 목록 건수가 일치한다', () => {
    const w = setup();
    addStu(w, 1, '시점만', { startQ: 2 });
    addStu(w, 2, '전입A', { transFreeAmt: 300000 });
    addStu(w, 3, '전입B', { transFreeAmt: 200000 });

    w.el('chkOnlyCustomFree').checked = true; // 사용자가 미리 켜 둔 상태
    w.routeToFilter('FREE');

    assert.strictEqual(w.el('chkOnlyCustomFree').checked, false, '시점 필터가 꺼져 있어야 한다');
    assert.strictEqual(w.el('chkTransFree').checked, true);
    assert.deepStrictEqual(w.renderedNames('tbFree').sort(), ['전입A', '전입B']);
    assert.match(w.el('glbBadgeFree').innerText, /자유수강: 2명/);
});

test('필터를 켜면 명단 제목의 인원수가 "전체명 중 표시건수"로 바뀐다', () => {
    const w = setup();
    addStu(w, 1, '기본', {});
    addStu(w, 2, '시점조작', { startQ: 2 });

    onlyCustom(w, false);
    assert.strictEqual(String(w.el('cnt_f').innerText), '2', '필터가 없으면 전체 인원만 표시');

    onlyCustom(w, true);
    assert.strictEqual(String(w.el('cnt_f').innerText), '2명 중 1', '필터가 걸리면 걸러진 건수까지 표시');
});
