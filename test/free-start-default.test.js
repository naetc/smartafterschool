/* ==========================================================================
   "지원 시점 수동 조작" 모달이 미리 선택해 두는 기본값(freeCourseDefaultTiming)

   핵심 불변식:
     ▶ 모달을 열어 아무것도 건드리지 않고 저장해도, 자유수강권 공제액과 자부담이
       1원도 달라지면 안 된다.

   즉 "모달이 보여주는 기본값"과 "엔진이 override 없는 강좌에 실제로 적용하는 시점"이
   같은 뜻이어야 한다. 정답 금액을 몰라도 검사할 수 있으므로 조합을 전부 돌린다.

   2026-09-21 이전에는 모달 기본값이 분기만 그 강좌 첫 수강분기로 밀고 차수는 학생이
   지정한 값을 그대로 가져왔다. 그래서 "1분기 3차수부터" 학생의 3분기 개설 강좌에
   아무도 입력한 적 없는 "3분기 3차수"가 떴고, 그대로 저장하면 한 강좌에서 110,000원이
   움직였다(실 백업 기준 8명 / 10건, 자부담 약 486,050원 규모).
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { freshEngine, freshUi } = require('./harness');

const COURSE = '바이올린';

// 학생 한 명 + 강좌 하나(개설분기 openQs)로 장부를 세우고 분기별 금액을 뽑는다.
// courses를 넘기면 그 override를 적용한 상태로 계산한다.
function money(startQ, startSess, openQs, courses) {
    const w = freshEngine();
    w.C[COURSE] = {};
    openQs.forEach(q => { w.C[COURSE][q] = { t: 120000, b: 30000, m: 0, mh: '4,4,4' }; });
    w.F.push({ g: 1, b: 1, n: 1, name: '홍길동', startQ, startSess, courses: courses || {} });
    openQs.forEach(q => w.E.push({ q, g: 1, b: 1, n: 1, name: '홍길동', course: COURSE, refunds: [], adjusts: [], seq: 0 }));
    w.autoRunSet(true);
    // ⚠ vm 샌드박스에서 만들어진 객체는 프로토타입이 달라 deepStrictEqual이 구조가 같아도 실패한다.
    //    JSON으로 한 번 돌려 이 쪽 realm의 평범한 값으로 만든다.
    return JSON.parse(JSON.stringify(w.Hs.filter(h => h.nm === '홍길동')
        .sort((a, b) => a.q - b.q)
        .map(h => ({ q: h.q, 자유: h.tf + h.bf + (h.mf || 0), 자부담: h.finT + h.finB + (h.finM || 0) }))));
}

// 모달이 그 강좌 줄에 미리 선택해 두는 값
function modalDefault(startQ, startSess, openQs) {
    const u = freshUi();
    const f = { g: 1, b: 1, n: 1, name: '홍길동', startQ, startSess, courses: {} };
    const stuEnrolls = openQs.map(q => ({ q, g: 1, b: 1, n: 1, name: '홍길동', course: COURSE }));
    const d = u.freeCourseDefaultTiming(f, COURSE, stuEnrolls); // 샌드박스 객체 → 평범한 객체
    return { q: d.q, s: d.s, h: d.h };
}

test('모달 기본값: 강좌를 학생 지원시작 분기보다 늦게 듣기 시작하면 그 강좌 첫 분기 1차수로 잡는다', () => {
    // 학생은 "1분기 3차수부터", 강좌는 3분기 개설 → 3분기 1차수 (예전엔 3분기 3차수였다)
    assert.deepStrictEqual(modalDefault(1, 2, [3]), { q: 3, s: 0, h: 1 });
});

test('모달 기본값: 강좌가 학생 지원시작 분기부터 열려 있으면 학생이 지정한 분기·차수를 그대로 쓴다', () => {
    assert.deepStrictEqual(modalDefault(2, 1, [1, 2, 3]), { q: 2, s: 1, h: 1 });
    assert.deepStrictEqual(modalDefault(1, 2, [1]), { q: 1, s: 2, h: 1 });
    assert.deepStrictEqual(modalDefault(1, 0, [1]), { q: 1, s: 0, h: 1 });
});

test('【불변식】모달을 열어 아무것도 건드리지 않고 저장해도 금액이 1원도 안 바뀐다', () => {
    const 개설조합 = [[1], [3], [1, 2], [2, 3], [3, 4], [1, 2, 3, 4], [4]];
    let 검사한조합 = 0;

    for (const openQs of 개설조합) {
        for (let startQ = 1; startQ <= 4; startQ++) {
            for (let startSess = 0; startSess <= 2; startSess++) {
                const before = money(startQ, startSess, openQs, {});
                const def = modalDefault(startQ, startSess, openQs);
                const after = money(startQ, startSess, openQs, { [COURSE]: def });

                assert.deepStrictEqual(
                    after, before,
                    `지원시작 ${startQ}분기 ${startSess + 1}차수 / 강좌개설 ${openQs.join(',')}분기\n` +
                    `  모달 기본값 ${def.q}분기 ${def.s + 1}차수 ${def.h}시수를 그대로 저장했더니 금액이 달라졌다.\n` +
                    `  저장 전: ${JSON.stringify(before)}\n  저장 후: ${JSON.stringify(after)}`
                );
                검사한조합++;
            }
        }
    }
    assert.ok(검사한조합 === 84, `조합 수 확인: ${검사한조합}`);
});

test('모달 기본값에서 실제로 시점을 늦추면 그만큼 자유수강권 공제가 줄어든다(기능은 살아 있다)', () => {
    // 1분기만 열린 강좌를 "2차수부터" 지원으로 늦추면 1차수분은 자부담으로 남아야 한다
    const 기본 = money(1, 0, [1], {});
    const 늦춤 = money(1, 0, [1], { [COURSE]: { q: 1, s: 1, h: 1 } });
    assert.ok(늦춤[0].자유 < 기본[0].자유, '시점을 늦췄는데 공제액이 줄지 않았다');
    assert.ok(늦춤[0].자부담 > 기본[0].자부담, '시점을 늦췄는데 자부담이 늘지 않았다');
});
