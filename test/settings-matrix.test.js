/* ==========================================================================
   파일닉네임: test/settings-matrix.test.js
   기능설명: 환경설정 조합별 회귀 테스트.

   이 시스템은 환경설정이 여러 갈래다. 그런데 결함을 고칠 때는 보통 한 가지 설정에서만
   확인하게 되고, "다른 설정에서도 그대로인가"는 놓치기 쉽다. 여기서 조합을 전부 돌린다.

   ⚠ app-engine.js는 accType(2D/3D)도 useMaterialFee도 읽지 않는다 — 둘 다 화면 플래그다.
     엔진이 실제로 갈라지는 축은 셋뿐이다:
       · deductMode   : ITEM_FIRST(항목우선) / COURSE_FIRST(강좌우선)
       · 공제 우선순위 : T,B / B,T / T,B,M / B,M,T / M,T,B …
       · 데이터에 재료비(m)가 있는지  ← '3D를 켠다'의 실질
     그래서 조합은 이 셋으로 만든다.

   [테스트 구성]
     · 앞부분: 조합 12가지를 한 검사당 전부 돌린다(실패하면 어느 조합인지 메시지에 나온다).
     · 뒷부분: 3D에서만 의미가 있는 '보고' 기능들(지문·변경감지·파급효과·한도경고)이
       재료비를 빠뜨리지 않는지 따로 본다.

   [판별력] 2026-09-17 작업 전 코드(b2ca059)로 같은 검사를 돌리면 120건 중 108건이 깨진다.
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { freshEngine } = require('./harness');

const commit = (w, fn) => w.commitState(fn || (() => {}), null, '테스트');
const addRefund = (w, e, r) => commit(w, () => {
    w.captureEnrollmentBaseline(e);   // 반드시 push 이전에
    e.refunds.push(r);
    w.updateFrozenSplit(e);
});

// ── 조합 ────────────────────────────────────────────────────────────────
const COMBOS = [];
['ITEM_FIRST', 'COURSE_FIRST'].forEach(deductMode => {
    [false, true].forEach(is3D => {
        const prios = is3D
            ? [['T,B,M', 'T,B,M'], ['B,M,T', 'M,T,B'], ['M,T,B', 'B,M,T']]
            : [['T,B', 'T,B'], ['B,T', 'B,T'], ['T,B', 'B,T']];
        prios.forEach(([cho3P, freeP]) => COMBOS.push({ deductMode, is3D, cho3P, freeP }));
    });
});

const label = c =>
    `${c.deductMode === 'ITEM_FIRST' ? '항목우선' : '강좌우선'}/${c.is3D ? '3D' : '2D'}/초3:${c.cho3P}·자유:${c.freeP}`;

// 조합 설정 + 강좌 목록으로 시나리오 하나를 만든다.
function mk(cfg, courses, budget = {}) {
    const w = freshEngine({
        cho3Annual: budget.cho3 || 500000,
        cho3H1Cap: budget.cap || 250000,
        freeAnnual: budget.free || 600000,
        cho3Priority: cfg.cho3P,
        freePriority: cfg.freeP,
        deductMode: cfg.deductMode,
        accType: cfg.is3D ? 'SEPARATED' : 'INTEGRATED',
        useMaterialFee: cfg.is3D,
        cho3Grades: [3],
    });
    const st = { g: 3, b: 1, n: 1, name: '홍길동' };
    courses.forEach((c, i) => {
        const cn = `강좌${i}(A)`;
        w.C[cn] = { 1: { t: c.t, b: c.b, m: cfg.is3D ? (c.m ?? 6000) : 0, mh: c.mh || '4,4,4', unit: 1 } };
        w.M[`강좌${i}`] = { 1: { inst_m: 30000, mgmt_m: 1000, unit: 1 } };
        w.E.push({ ...st, q: 1, course: cn, seq: i, refunds: [], adjusts: [] });
    });
    // 초3·자유수강권이 모두 얽히도록 자유수강권 대상으로도 등록한다.
    w.F.push({ ...st, startQ: 1, startSess: 0, courses: {} });
    return w;
}

// 모든 조합에 같은 검사를 돌리고, 실패하면 어느 조합인지 밝힌다.
function forEachCombo(fn) {
    COMBOS.forEach(cfg => fn(cfg, msg => `[${label(cfg)}] ${msg}`));
}

// ══════════════════════════════════════════════════════════════════════════
//  조합 12가지 공통 검사
// ══════════════════════════════════════════════════════════════════════════

test('모든 설정: 환불 뒤 요금표를 고쳐도 지원금이 벗겨지거나 예산이 늘지 않는다 (결함1)', () => {
    forEachCombo((cfg, why) => {
        const w = mk(cfg, [{ t: 90000, b: 10000 }]);
        const e = w.E[0];
        commit(w);
        addRefund(w, e, { ty: 'STUDENT', sessIdx: 2, ah: 0, bkRefTy: 'NONE' });
        const balBefore = Object.values(w.Ld)[0].qBal[1].cB;
        const tcBefore = w.Hs.find(h => h.e === e).tc;

        w.C[e.course][1].b += 4000;        // 환불 뒤 교재비 정정
        commit(w);

        const h = w.Hs.find(x => x.e === e);
        assert.ok(h.tc >= tcBefore, why(`수강료 지원금이 ${tcBefore} → ${h.tc}로 벗겨졌다`));
        assert.ok(Object.values(w.Ld)[0].qBal[1].cB <= balBefore,
            why('청구액을 올렸는데 예산 잔액이 늘어났다'));
    });
});

test('모든 설정: 환불 강좌에 감액 조정을 넣어도 자부담이 음수가 되지 않는다 (결함2)', () => {
    forEachCombo((cfg, why) => {
        const w = mk(cfg, [{ t: 90000, b: 10000 }]);
        const e = w.E[0];
        commit(w);
        addRefund(w, e, { ty: 'STUDENT', sessIdx: 2, ah: 0, bkRefTy: 'NONE' });
        commit(w, () => e.adjusts.push({ title: '감액', amtT: -20000, amtB: 0, amtM: 0 }));

        const h = w.Hs.find(x => x.e === e);
        assert.ok(h.finT >= 0 && h.finB >= 0 && h.finM >= 0,
            why(`자부담이 음수다 (${h.finT}/${h.finB}/${h.finM})`));
        assert.equal(h.tc + h.tf + h.finT, h.sT, why('수강료 3분할 합계가 청구액과 다르다'));
    });
});

test('모든 설정: 환불이 여러 건이어도 차수별 청구액 합계가 분기 청구액과 같다 (결함3)', () => {
    forEachCombo((cfg, why) => {
        const w = mk(cfg, [{ t: 40000, b: 0, mh: '3,3,3' }]);
        const e = w.E[0];
        commit(w);
        addRefund(w, e, { ty: 'STUDENT', sessIdx: 0, ah: 3, bkRefTy: 'NONE' });
        addRefund(w, e, { ty: 'STUDENT', sessIdx: 1, ah: 3, bkRefTy: 'NONE' });

        const res = w.recalcEnrollment(e);
        assert.equal(res.sessionT.reduce((a, b) => a + b, 0), res.cT,
            why('차수별 합계와 분기 청구액이 어긋난다(청구서 과다/과소 청구)'));
    });
});

test('모든 설정: 감액 조정이 마지막 차수보다 커도 차수합이 유지된다 (결함4)', () => {
    forEachCombo((cfg, why) => {
        const w = mk(cfg, [{ t: 40000, b: 0, mh: '4,4,3' }]);
        w.E[0].adjusts.push({ title: '감액', amtT: -15000, amtB: 0, amtM: 0 });
        commit(w);

        const res = w.recalcEnrollment(w.E[0]);
        assert.equal(res.sessionT.reduce((a, b) => a + b, 0), res.cT,
            why('감액 초과분이 증발해 차수합이 분기 청구액과 다르다'));
    });
});

test('모든 설정: 0시수 차수가 섞여도 모든 차수가 연산에 포함된다 (결함5)', () => {
    forEachCombo((cfg, why) => {
        const w = mk(cfg, [{ t: 90000, b: 20000, mh: '4,0,4' }]);
        commit(w);

        const h = w.Hs[0];
        const sds = Object.values(h.sessDetails);
        assert.equal(sds.reduce((a, s) => a + s.tT, 0), h.sT, why('수강료 차수합 불일치'));
        assert.equal(sds.reduce((a, s) => a + s.tB, 0), h.sB, why('교재비 차수합 불일치'));
    });
});

test('모든 설정: 예산이 남아 있으면 조정 증액분도 지원금이 부담한다 (헌법 제6조)', () => {
    forEachCombo((cfg, why) => {
        const w = mk(cfg, [{ t: 90000, b: 10000 }]);
        const e = w.E[0];
        commit(w);
        addRefund(w, e, { ty: 'STUDENT', sessIdx: 2, ah: 0, bkRefTy: 'NONE' });
        // baseline(환불 전 원가)을 훌쩍 넘는 증액 — 예산이 넉넉하므로 전부 지원돼야 한다.
        commit(w, () => e.adjusts.push({
            title: '증액', amtT: 60000, amtB: 5000, amtM: cfg.is3D ? 3000 : 0,
        }));

        const h = w.Hs.find(x => x.e === e);
        assert.equal(h.finT, 0, why('수강료 조정 증액분이 자부담으로 떨어졌다'));
        assert.equal(h.finB, 0, why('교재비 조정 증액분이 자부담으로 떨어졌다'));
        assert.equal(h.finM, 0, why('재료비 조정 증액분이 자부담으로 떨어졌다'));
    });
});

test('모든 설정: 조정을 환불보다 늦게 해도 최종 금액이 같다 (경로 동등성, 헌법 제6조 5항)', () => {
    forEachCombo((cfg, why) => {
        const run = order => {
            const w = mk(cfg, [{ t: 100000, b: 0 }, { t: 100000, b: 0 }], { cho3: 150000, cap: 150000 });
            const e0 = w.E[0];
            commit(w);
            const adj = () => commit(w, () => e0.adjusts.push({ title: '조정', amtT: -40000, amtB: 0, amtM: 0 }));
            const ref = () => addRefund(w, e0, { ty: 'STUDENT', sessIdx: 2, ah: 0, bkRefTy: 'NONE' });
            if (order === 'A') { adj(); ref(); } else { ref(); adj(); }
            // ⚠ 두 경로는 서로 다른 vm 샌드박스라 배열 프로토타입이 달라 deepEqual을 못 쓴다.
            return JSON.stringify(w.Hs.slice().sort((a, b) => a.c.localeCompare(b.c))
                .map(h => [h.c, h.sT, h.tc, h.tf, h.finT, h.bc, h.bf, h.finB, h.mc, h.mf, h.finM]));
        };
        assert.equal(run('B'), run('A'),
            why('담당자가 일한 순서에 따라 학생이 내는 돈이 달라진다'));
    });
});

test('모든 설정: 조정 미리보기(가상 실행)가 장부에 흔적을 남기지 않는다', () => {
    forEachCombo((cfg, why) => {
        const w = mk(cfg, [{ t: 90000, b: 10000 }, { t: 60000, b: 5000 }]);
        const e = w.E[0];
        commit(w);
        addRefund(w, e, { ty: 'STUDENT', sessIdx: 2, ah: 0, bkRefTy: 'NONE' });

        const fp = () => JSON.stringify({
            data: { C: w.C, M: w.M, F: w.F, E: w.E, SysSet: w.SysSet },
            view: w.Hs.map(h => [h.tc, h.bc, h.mc, h.tf, h.bf, h.mf, h.finT, h.finB, h.finM]),
        });
        const before = fp();

        const snapFrozen = w.snapshotFrozenState();
        w.E[1].adjusts.push({ title: '미리보기', amtT: 30000, amtB: 5000, amtM: cfg.is3D ? 3000 : 0 });
        w.recomputeAll();
        w.E[1].adjusts.pop();
        w.restoreFrozenState(snapFrozen);
        w.recomputeAll();

        assert.equal(fp(), before, why('[취소]를 눌렀는데 장부가 바뀐다'));
    });
});

test('모든 설정: 마감 확정 금액이 한도를 넘으면 감지하고, 금액은 건드리지 않는다 (헌법 제5조)', () => {
    forEachCombo((cfg, why) => {
        const w = mk(cfg, [{ t: 90000, b: 10000 }], { cho3: 200000, cap: 200000 });
        commit(w);
        assert.equal(w.getBudgetOverruns().length, 0, why('정상 상태인데 거짓 경보가 떴다'));

        // 1분기 전 차수를 마감해 확정 금액을 박제한 뒤 한도를 낮춘다.
        const h = w.Hs[0];
        [0, 1, 2].forEach(s => {
            const sd = h.sessDetails[s];
            if (!sd) return;
            w.SysSet.closedSess[`1_${s}`] = {
                [`${h.id}_${h.c}`]: {
                    cho3Amt: sd.tc, cho3Bk: sd.bc, cho3Mt: sd.mc || 0,
                    freeAmt: sd.tf, freeBk: sd.bf, freeMt: sd.mf || 0,
                    selfAmt: sd.finT, selfBk: sd.finB, selfMt: sd.finM || 0,
                },
            };
        });
        w.SysSet.cho3Annual = 30000; w.SysSet.cho3H1Cap = 30000; w.SysSet.freeAnnual = 30000;
        w.recomputeAll();

        assert.ok(w.getBudgetOverruns().length > 0, why('한도를 넘었는데 아무 경고도 없다'));
        const used = w.Hs.reduce((a, x) => a + x.tc + x.bc + (x.mc || 0) + x.tf + x.bf + (x.mf || 0), 0);
        assert.ok(used > 0, why('마감된 확정 금액을 시스템이 말없이 깎았다'));
    });
});

test('모든 설정: 3분할 합계가 1원도 어긋나지 않고 음수도 없다 (헌법 제1조)', () => {
    forEachCombo((cfg, why) => {
        const w = mk(cfg, [{ t: 90000, b: 10000 }, { t: 70000, b: 20000 }], { cho3: 120000, cap: 120000 });
        const e = w.E[0];
        commit(w);
        addRefund(w, e, { ty: 'DISEASE', sessIdx: 1, ah: 2, bkRefTy: 'MANUAL', bkRefAmt: 3000, bkRefAmtM: 1000 });
        commit(w, () => w.E[1].adjusts.push({
            title: '조정', amtT: 10000, amtB: -2000, amtM: cfg.is3D ? 1000 : 0,
        }));

        w.Hs.forEach(h => {
            assert.equal(h.tc + h.tf + h.finT, h.sT, why(`${h.c} 수강료 3분할 불일치`));
            assert.equal(h.bc + h.bf + h.finB, h.sB, why(`${h.c} 교재비 3분할 불일치`));
            assert.equal(h.mc + h.mf + h.finM, h.sM, why(`${h.c} 재료비 3분할 불일치`));
            [h.tc, h.bc, h.mc, h.tf, h.bf, h.mf, h.finT, h.finB, h.finM].forEach(v => {
                assert.ok(v >= 0, why(`${h.c}에 음수 금액(${v})이 있다`));
            });
        });
    });
});

// ══════════════════════════════════════════════════════════════════════════
//  3D(교재분리형) 전용 — '보고' 기능이 재료비를 빠뜨리지 않는가
//  엔진 계산은 위에서 봤고, 여기는 사용자에게 보여주는 값이 대상이다.
// ══════════════════════════════════════════════════════════════════════════

const CFG_3D = { deductMode: 'ITEM_FIRST', is3D: true, cho3P: 'T,B,M', freeP: 'T,B,M' };

function mk3D(budget) {
    const w = mk(CFG_3D, [{ t: 90000, b: 20000, m: 15000 }, { t: 90000, b: 20000, m: 15000 }], budget);
    commit(w);
    return w;
}

test('3D: 계산 결과 지문이 재료비 3칸을 담는다', () => {
    const w = mk3D();
    const row = Object.values(w.captureComputedFingerprint().rows)[0];
    const h = w.Hs[0];
    assert.equal(row.length, 9, '지문은 초3·자유·자부담 × 수강료·교재비·재료비 = 9칸이다');
    assert.equal(row[2], h.mc); assert.equal(row[5], h.mf); assert.equal(row[8], h.finM);
    assert.ok(h.mc + h.mf + h.finM > 0, '재료비가 0이면 이 테스트가 헛돈다');
});

test('3D: 변경 감지가 재료비 변화를 잡아내고 한글 항목명을 붙인다', () => {
    const w = mk3D();
    const before = w.captureComputedFingerprint();
    w.SysSet.cho3Annual = 100000; w.SysSet.cho3H1Cap = 100000; w.SysSet.freeAnnual = 60000;
    w.recomputeAll();

    const changes = w.diffComputedFingerprint(before, w.captureComputedFingerprint());
    assert.ok(changes.length > 0, '재료비가 달라졌는데 아무것도 보고하지 않는다');
    const names = new Set(changes.flatMap(c => c.fields.map(f => f.name)));
    assert.ok([...names].some(n => /재료비/.test(n)),
        `항목명에 재료비가 없다 (${[...names].join(', ')})`);

    // 요약 델타가 재료비까지 합산해야 모달·엑셀의 합계가 맞는다.
    const c = changes[0], b = c.before, a = c.after;
    assert.equal(c.cho3Delta, (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
    assert.equal(c.freeDelta, (a[3] + a[4] + a[5]) - (b[3] + b[4] + b[5]));
    assert.equal(c.selfDelta, (a[6] + a[7] + a[8]) - (b[6] + b[7] + b[8]));
});

test('3D: 재료비만 조정해도 다른 강좌로 가는 파급을 보고한다', () => {
    // ⚠ 예산을 너무 조이면 다른 강좌의 재료비가 이미 '지원 0원'이라 뺏어올 것이 없어
    //   파급이 안 일어난다(그건 정상이다). 나머지 강좌가 재료비 지원을 일부 받는 선으로 잡는다.
    const w = mk3D({ cho3: 130000, cap: 130000, free: 115000 });
    const 나_before = w.Hs.find(h => h.c === '강좌1(A)');
    assert.ok(나_before.mc + 나_before.mf > 0, '다른 강좌가 재료비 지원을 받고 있어야 의미 있는 검사다');

    const before = w.captureSplitSnapshot();
    commit(w, () => w.E[0].adjusts.push({ title: '재료비 증액', amtT: 0, amtB: 0, amtM: 40000 }));

    const changed = w.diffSplitSnapshot(before, [w.E[0]]);
    assert.equal(changed.length, 1, '재료비 조정이 다른 강좌를 건드렸는데 보고하지 않는다');
    assert.equal(changed[0].c, '강좌1(A)');
    assert.ok(changed[0].self.after > changed[0].self.before, '자부담이 늘어난 것이 보고돼야 한다');
});

test('3D: 한도 초과액 계산에 재료비 사용분이 포함된다', () => {
    const w = mk3D({ cho3: 400000, cap: 400000 });
    assert.equal(w.getBudgetOverruns().length, 0, '정상 상태인데 거짓 경보가 떴다');

    const h = w.Hs[0];
    [0, 1, 2].forEach(s => {
        const sd = h.sessDetails[s];
        if (!sd) return;
        w.SysSet.closedSess[`1_${s}`] = {
            [`${h.id}_${h.c}`]: {
                cho3Amt: sd.tc, cho3Bk: sd.bc, cho3Mt: sd.mc || 0,
                freeAmt: sd.tf, freeBk: sd.bf, freeMt: sd.mf || 0,
                selfAmt: sd.finT, selfBk: sd.finB, selfMt: sd.finM || 0,
            },
        };
    });
    w.SysSet.cho3Annual = 20000; w.SysSet.cho3H1Cap = 20000; w.SysSet.freeAnnual = 20000;
    w.recomputeAll();

    const over = w.getBudgetOverruns();
    assert.ok(over.length > 0, '마감 확정 금액이 한도를 넘었는데 경고가 없다');
    const cho3Over = over.find(o => o.kind.startsWith('초3'));
    if (cho3Over) {
        const rows = w.Hs.filter(x => x.id === cho3Over.id);
        const withM = rows.reduce((a, x) => a + x.tc + x.bc + (x.mc || 0), 0);
        const noM = rows.reduce((a, x) => a + x.tc + x.bc, 0);
        assert.equal(cho3Over.used, withM, '초과액이 재료비를 빼고 계산됐다');
        assert.notEqual(withM, noM, '재료비가 0이면 이 테스트가 헛돈다');
    }
});

test('2D: 재료비를 안 쓰는 설정에서도 지문 형식은 같고 재료비 칸은 0이다', () => {
    const w = mk({ deductMode: 'ITEM_FIRST', is3D: false, cho3P: 'T,B', freeP: 'T,B' },
        [{ t: 90000, b: 20000 }]);
    commit(w);

    const row = Object.values(w.captureComputedFingerprint().rows)[0];
    assert.equal(row.length, 9, '2D여도 지문 형식은 9칸으로 통일한다(2D↔3D 전환 시 비교가 깨지지 않게)');
    assert.deepEqual([row[2], row[5], row[8]], [0, 0, 0], '2D인데 재료비 칸에 값이 들어갔다');
    const h = w.Hs[0];
    assert.equal(h.tc + h.tf + h.finT, h.sT);
});
