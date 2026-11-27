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
    assert.match(msg, /갱신: 1건/); assert.match(msg, /1건은 마감 분기라/);
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
