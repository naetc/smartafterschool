/* ==========================================================================
   파일닉네임: test/fuzz-engine.js
   기능설명: 정산 엔진 속성기반(property-based) 퍼즈 테스트 엔진.

   engine.test.js는 "이 입력에는 이 금액이 나와야 한다"를 손으로 하나씩 못박는
   회귀 테스트다. 사람이 미리 생각해낸 경우만 검사할 수 있다는 한계가 있다.

   이 파일은 반대 방향이다. 무작위 시나리오(학생·강좌·환불·조정·마감·자유수강권
   지원시점 등)를 수천 건 만들어 돌린 뒤, 금액이 얼마인지는 따지지 않고
   "어떤 경우에도 반드시 참이어야 하는 성질(불변식)"만 검사한다.
   예: 초3 + 자유 + 자부담은 언제나 청구액과 1원도 안 틀려야 한다.

   덕분에 사람이 상상하지 못한 입력 조합에서 생기는 회계 오류를 자동으로 찾아낸다.

   [검사하는 불변식]
     A1 3분할 합계 = 청구액   A2 음수 금지        A3 비대상자 지원 금지
     A4 차수합 = 분기합       A5 차수 내부 3분할   A6 한도 초과 미감지 금지(+거짓경보 금지)
     A7 멱등성                A9 경로 동등성(조정을 언제 했든 최종 금액이 같은가)
     A10 가상 실행 복원(조정 미리보기가 장부에 흔적을 남기지 않는가)

   [실행]
     npm run fuzz              기본 2,000건
     npm run fuzz -- 5000      5,000건
     npm run fuzz -- 5000 3001 seed 3001부터 5,000건
     node test/fuzz-engine.js --seed 116   특정 시나리오 하나만 상세 덤프

   [재현성] 시나리오는 seed 기반 결정론적 난수로 만든다. 위반이 보고된 seed를
            --seed로 다시 돌리면 언제나 똑같은 시나리오가 재현된다.

   ⚠ 이 파일은 개인정보를 일절 쓰지 않는다. 전부 합성 데이터다.
   ========================================================================== */
'use strict';

const { freshEngine } = require('./harness');

// ── 결정론적 난수 (seed로 시나리오를 100% 재현하기 위해 Math.random을 쓰지 않는다) ──
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makeGen(seed) {
    const r = mulberry32(seed);
    const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    return { int, pick: arr => arr[int(0, arr.length - 1)], chance: p => r() < p };
}

// 💡 app-core.js의 commitState가 데이터 변경 후에 하는 재연산 그대로.
//    ⚠ 여기서 순서를 직접 흉내내지 말고 반드시 window.recomputeAll()을 부를 것.
//      예전에는 recalc → updateFrozenSplit → autoRunSet을 손으로 나열했는데, 나중에
//      commitState에 recaptureBaseline 단계가 추가되면서 퍼즈 시나리오만 그 단계를
//      건너뛰게 됐다. 그 결과 "실제 앱에서는 없는 상태"를 만들어 놓고 검사하느라
//      A10이 엉뚱하게 477건 실패했다. 재연산 경로는 앱과 한 곳에서 공유해야 한다.
function commitLike(w) {
    w.recomputeAll();
}

const COURSE_NAMES = ['과학실험', '방송댄스', '쿠키클레이', '바이올린', '코딩', '축구', '한자'];
// 💡 0이 섞인 패턴('4,0,4' 등)은 parseMh가 지금은 막지만, 구버전에서 만들어진 백업 파일이나
//    손으로 고친 JSON에는 들어올 수 있다. 엔진이 그런 데이터에도 금액을 잃지 않는지 같이 본다.
const MH_PATTERNS = ['4,4,4', '4,3,3', '4,4,3', '3,3,3', '5,4,4', '4,4', '4', '4,0,4', '0,4,4', '4,4,0', '2,2,2,2', '11,11,11'];

// ── 무작위 시나리오 생성 ────────────────────────────────────────────────
function buildScenario(seed) {
    const g = makeGen(seed);
    const w = freshEngine({
        cho3Priority: g.pick(['T,B', 'B,T', 'T,B,M', 'B,M,T', 'M,T,B']),
        freePriority: g.pick(['T,B', 'B,T', 'T,B,M', 'B,M,T', 'M,T,B']),
        deductMode: g.pick(['ITEM_FIRST', 'COURSE_FIRST']),
        useMaterialFee: g.chance(0.5),
        cho3Annual: g.pick([500000, 500000, 250000, 380000]),
        cho3H1Cap: 250000,
        freeAnnual: g.pick([600000, 600000, 300000, 450000]),
        cho3Grades: g.pick([[3], [3], [3, 4]]),
    });

    // 강좌 요금표(C) / 부서 마스터(M)
    const courses = [];
    const nCourse = g.int(2, 5);
    for (let i = 0; i < nCourse; i++) {
        const base = COURSE_NAMES[i % COURSE_NAMES.length];
        const name = `${base}(${String.fromCharCode(65 + i)})`;
        courses.push(name);
        w.C[name] = {}; w.M[base] = {};
        for (let q = 1; q <= 4; q++) {
            const mh = g.pick(MH_PATTERNS);
            const t = g.int(0, 12) * 10000;
            const b = g.chance(0.6) ? g.int(0, 6) * 5000 : 0;
            const m = g.chance(0.3) ? g.int(0, 4) * 3000 : 0;
            const inst = Math.round(t * 0.96 / 10) * 10;
            w.C[name][q] = { t, b, m, mh, instTot: inst, mgmtTot: t - inst, unit: g.pick([1, 1, 2]), isActive: true };
            w.M[base][q] = { cnt: 2, inst_m: g.int(2, 4) * 10000, mgmt_m: 1000, b, unit: w.C[name][q].unit, mh };
        }
    }

    // 학생 · 자유수강권(F) · 등록(E)
    const nStu = g.int(1, 8);
    for (let i = 0; i < nStu; i++) {
        const st = { g: g.pick([1, 2, 3, 3, 3, 4, 5, 6]), b: 1, n: i + 1, name: `학생${i + 1}` };

        if (g.chance(0.5)) {
            const f = { ...st, startQ: 1, startSess: 0, courses: {} };
            if (g.chance(0.35)) { f.startQ = g.int(1, 4); f.startSess = g.int(0, 2); }
            if (g.chance(0.25)) {   // 육아기 근로시간 단축 (차감순서 역전 + 지원기간 종료)
                f.reason = 'CHILDCARE_REDUCED';
                f.endQ = g.int(f.startQ, 4); f.endSess = g.int(0, 2); f.endHour = g.int(1, 4);
            }
            if (g.chance(0.2)) f.transFreeAmt = g.int(0, 60) * 10000;   // 전학생 이관 잔액
            w.F.push(f);
        }

        for (let q = 1; q <= 4; q++) {
            courses.filter(() => g.chance(0.45)).forEach((cn, ci) => {
                const e = {
                    q, ...st, course: cn, seq: ci, refunds: [], adjusts: [],
                    overrideCho3: g.chance(0.2) ? g.pick(['T,B', 'B,T', 'M,T,B']) : null,
                    overrideFree: g.chance(0.2) ? g.pick(['T,B', 'B,T', 'M,T,B']) : null,
                };
                if (g.chance(0.08)) e.transCho3Amt = g.int(0, 50) * 10000;
                w.E.push(e);
            });
        }
    }

    // 환불 — 실제 UI(addConsoleRef)와 똑같은 순서로 baseline/frozenSplit 파이프라인을 태운다.
    commitLike(w);
    w.E.forEach(e => {
        if (!g.chance(0.18)) return;
        const mhLen = w.C[e.course][e.q].mh.split(',').length;
        for (let k = 0, n = g.int(1, 2); k < n; k++) {
            const bkRefTy = g.pick(['NONE', 'FULL', 'MANUAL']);
            const r = {
                sessIdx: g.int(0, mhLen - 1),
                ty: g.pick(['BEFORE', 'DISEASE', 'STUDENT']),
                ah: g.int(0, 4),
                bkRefTy,
                bkRefAmt: bkRefTy === 'MANUAL' ? g.int(0, 5) * 5000 : 0,
                bkRefAmtM: bkRefTy === 'MANUAL' ? g.int(0, 3) * 3000 : 0,
            };
            w.captureEnrollmentBaseline(e);   // 반드시 push 이전에
            e.refunds.push(r);
            w.updateFrozenSplit(e);
            commitLike(w);
        }
    });

    // 조정(개별 조정 등록) — 실제 UI는 commitState를 거치므로, commitState가 하는 일
    // (전체 recalc → 동결값 재동기화 → autoRunSet)을 그대로 흉내낸다.
    w.E.forEach(e => {
        if (!g.chance(0.07)) return;
        e.adjusts.push({ title: '임의조정', amtT: g.int(-3, 3) * 5000, amtB: g.int(-2, 2) * 2000, amtM: 0 });
    });
    commitLike(w);

    // 강좌 요금표 정정 — 환불/조정이 들어간 뒤에 2스텝에서 요금을 고치는 실무 동작.
    // 동결된 강좌의 청구액이 사후에 바뀌는 대표 경로라 반드시 섞어서 돌려본다.
    if (g.chance(0.25)) {
        const cn = g.pick(courses), q = g.int(1, 4);
        const rec = w.C[cn][q];
        rec.b = Math.max(0, rec.b + g.int(-2, 2) * 2000);
        rec.t = Math.max(0, rec.t + g.int(-2, 2) * 5000);
        commitLike(w);
    }

    // 차수 마감(closedSess) — 현재 화면값을 그대로 박제하는 실제 마감 동작을 흉내낸다.
    if (g.chance(0.3)) {
        commitLike(w);
        const lockQ = g.int(1, 3), lockS = g.int(0, 1);
        const bucket = {};
        w.Hs.filter(h => h.q === lockQ).forEach(h => {
            const sd = h.sessDetails[lockS];
            if (!sd) return;
            bucket[`${h.id}_${h.c}`] = {
                cho3Amt: sd.tc, cho3Bk: sd.bc, cho3Mt: sd.mc,
                freeAmt: sd.tf, freeBk: sd.bf, freeMt: sd.mf,
                selfAmt: sd.finT, selfBk: sd.finB, selfMt: sd.finM,
            };
        });
        w.SysSet.closedSess[`${lockQ}_${lockS}`] = bucket;
    }

    commitLike(w);
    return w;
}

// ── 불변식(어떤 입력에도 반드시 참이어야 하는 성질) ──────────────────────
function checkInvariants(w) {
    const V = [];
    const fail = (code, msg, ctx) => V.push({ code, msg, ctx });

    w.Hs.forEach(h => {
        const tag = `Q${h.q} ${h.nm}(${h.dp}) ${h.c}`;

        // [A1] 3분할 합계 무결성 — 초3 + 자유 + 자부담 = 청구액 (헌법 제1조)
        if (h.tc + h.tf + h.finT !== h.sT) fail('A1-수강료3분할', `${h.tc}+${h.tf}+${h.finT} != ${h.sT}`, tag);
        if (h.bc + h.bf + h.finB !== h.sB) fail('A1-교재비3분할', `${h.bc}+${h.bf}+${h.finB} != ${h.sB}`, tag);
        if (h.mc + h.mf + h.finM !== h.sM) fail('A1-재료비3분할', `${h.mc}+${h.mf}+${h.finM} != ${h.sM}`, tag);

        // [A2] 음수 금지 — 청구서에 마이너스 금액이 찍히면 안 된다
        ['tc', 'bc', 'mc', 'tf', 'bf', 'mf', 'finT', 'finB', 'finM'].forEach(k => {
            if (h[k] < 0) fail('A2-음수금액', `${k}=${h[k]}`, tag);
        });

        // [A3] 자격 — 대상자가 아닌 학생에게 지원금이 배정되면 안 된다
        if (!h.isC && (h.tc || h.bc || h.mc)) fail('A3-초3자격', `비대상인데 ${h.tc}/${h.bc}/${h.mc}`, tag);
        if (!h.isF && (h.tf || h.bf || h.mf)) fail('A3-자유자격', `비대상인데 ${h.tf}/${h.bf}/${h.mf}`, tag);

        // [A4] 차수 합계 = 분기 합계 (헌법 제2조: 선차감 후안분)
        //      깨지면 교육비 청구서(차수별)와 정산표(분기별) 금액이 서로 안 맞는다.
        const sds = Object.values(h.sessDetails || {});
        const sum = k => sds.reduce((a, s) => a + (s[k] || 0), 0);
        if (sum('tT') !== h.sT) fail('A4-차수합_수강료청구', `차수합 ${sum('tT')} != 분기 ${h.sT}`, tag);
        if (sum('tB') !== h.sB) fail('A4-차수합_교재비청구', `차수합 ${sum('tB')} != 분기 ${h.sB}`, tag);
        if (sum('tc') !== h.tc) fail('A4-차수합_초3', `차수합 ${sum('tc')} != 분기 ${h.tc}`, tag);
        if (sum('tf') !== h.tf) fail('A4-차수합_자유', `차수합 ${sum('tf')} != 분기 ${h.tf}`, tag);
        if (sum('bc') !== h.bc) fail('A4-차수합_초3교재', `차수합 ${sum('bc')} != 분기 ${h.bc}`, tag);
        if (sum('bf') !== h.bf) fail('A4-차수합_자유교재', `차수합 ${sum('bf')} != 분기 ${h.bf}`, tag);

        // [A5] 차수 내부에서도 3분할이 맞아야 한다
        sds.forEach((s, i) => {
            if (s.tc + s.tf + s.finT !== s.tT) fail('A5-차수내3분할', `차수${i}: ${s.tc}+${s.tf}+${s.finT} != ${s.tT}`, tag);
            if (s.bc + s.bf + s.finB !== s.tB) fail('A5-차수내3분할B', `차수${i} 교재비 불일치`, tag);
            if (s.finT < 0 || s.finB < 0 || s.finM < 0) fail('A5-차수내음수', `차수${i}: ${s.finT}/${s.finB}/${s.finM}`, tag);
        });
    });

    // [A6] 학생별 예산 한도 (헌법 제1조) — 넘으면 교육청에 과다 청구가 된다.
    //
    // 💡 다만 한도 초과 자체를 무조건 실패로 볼 수는 없다. 마감(closedSess)·환불 동결
    //    (frozenSplit)된 금액은 "이미 확정된 회계"라서 엔진이 그대로 재생하도록 설계돼 있고,
    //    확정 이후에 요금표나 조정이 바뀌면 합계가 한도를 넘을 수 있다. 이때 시스템이 금액을
    //    말없이 깎아버리면 이미 결재가 올라간 분기의 숫자가 바뀐다.
    //    그래서 정책은 "감지해서 사람에게 알린다"(window.getBudgetOverruns)이고,
    //    이 테스트가 잡아야 할 진짜 사고는 "넘었는데 아무도 모르는 것"이다.
    //    → 경고로 보고되면 통과, 조용히 넘어가면 실패.
    const reported = (typeof w.getBudgetOverruns === 'function') ? w.getBudgetOverruns() : [];
    const isReported = (id, kindPrefix) => reported.some(o => o.id === id && o.kind.startsWith(kindPrefix));

    Object.values(w.Ld).forEach(L => {
        const rows = w.Hs.filter(h => h.id === L.id);
        const usedC = rows.reduce((a, h) => a + h.tc + h.bc + h.mc, 0);
        const usedF = rows.reduce((a, h) => a + h.tf + h.bf + h.mf, 0);
        if (usedC > L.cTotal && !isReported(L.id, '초3지원금(연간)')) {
            fail('A6-초3연간한도_미감지', `사용 ${usedC} > 한도 ${L.cTotal} 인데 경고가 안 뜬다`, L.nm);
        }
        if (usedF > L.fTotal && !isReported(L.id, '자유수강권')) {
            fail('A6-자유연간한도_미감지', `사용 ${usedF} > 한도 ${L.fTotal} 인데 경고가 안 뜬다`, L.nm);
        }
        const h1 = rows.filter(h => h.q <= 2).reduce((a, h) => a + h.tc + h.bc + h.mc, 0);
        const h1cap = Math.max(0, w.SysSet.cho3H1Cap - (w.SysSet.cho3Annual - L.cTotal));
        if (L.isC && h1 > h1cap && !isReported(L.id, '초3지원금(상반기)')) {
            fail('A6-초3상반기한도_미감지', `1~2분기 ${h1} > 한도 ${h1cap} 인데 경고가 안 뜬다`, L.nm);
        }
    });

    // [A6b] 거짓 경보 금지 — 실제로 안 넘었는데 경고가 뜨면 사용자가 경고 자체를 무시하게 된다.
    reported.forEach(o => {
        const rows = w.Hs.filter(h => h.id === o.id);
        const used = o.kind.startsWith('자유')
            ? rows.reduce((a, h) => a + h.tf + h.bf + h.mf, 0)
            : rows.filter(h => (o.kind.includes('상반기') ? h.q <= 2 : true))
                  .reduce((a, h) => a + h.tc + h.bc + h.mc, 0);
        if (used <= o.cap) fail('A6b-거짓경보', `${o.kind}: 실제 사용 ${used} <= 한도 ${o.cap} 인데 경고가 떴다`, o.nm);
    });

    // [A10] 가상 실행(dry run) 되돌리기 — 4스텝의 "조정 미리보기"가 기대는 성질.
    //   조정을 넣으면 어떻게 되는지 보여주려면 실제로 넣어서 계산해봐야 한다. 그 뒤 도로 빼고
    //   다시 계산했을 때 데이터도 화면 값도 원래대로 돌아와야 한다. 여기가 어긋나면
    //   사용자가 [취소]를 눌렀는데도 장부가 조용히 바뀌는 사고가 된다.
    //   ⚠ 키 순서까지 같아야 한다 — commitState가 snapshotState()의 JSON 문자열을 비교해
    //     "데이터가 실제로 바뀌었는지"를 판단하기 때문이다(값이 같아도 순서가 다르면 오인한다).
    if (typeof w.recomputeAll === 'function' && w.E.length > 0) {
        const fp = () => JSON.stringify({
            data: { C: w.C, M: w.M, F: w.F, E: w.E, SysSet: w.SysSet },
            view: w.Hs.map(h => [h.q, h.id, h.c, h.tc, h.bc, h.mc, h.tf, h.bf, h.mf, h.finT, h.finB, h.finM]),
        });
        const target = w.E.find(e => e.baseline) || w.E[0];
        const fpBefore = fp();
        const frozenSnap = w.snapshotFrozenState();
        try {
            target.adjusts.push({ title: '가상실행', amtT: 30000, amtB: 5000, amtM: 0 });
            w.recomputeAll();
        } finally {
            target.adjusts.pop();
            w.restoreFrozenState(frozenSnap);
            w.recomputeAll();
        }
        if (fp() !== fpBefore) fail('A10-가상실행복원', '조정을 미리 계산해본 뒤 되돌렸는데 상태가 원래대로 안 돌아왔다', target.course);
    }

    // [A7] 멱등성 — 데이터를 안 바꾸고 재연산만 하면 결과가 똑같아야 한다.
    //      깨지면 사용자가 탭만 눌러도 금액이 바뀌는 셈이라 신뢰가 무너진다.
    const snap = () => JSON.stringify(w.Hs.map(h => [h.q, h.id, h.c, h.tc, h.bc, h.mc, h.tf, h.bf, h.mf, h.finT, h.finB, h.finM]));
    const a = snap(); w.autoRunSet(true);
    const b = snap(); w.autoRunSet(true);
    if (a !== b) fail('A7-멱등성', '재연산 1회 후 결과가 달라짐', '');
    else if (b !== snap()) fail('A7-멱등성', '재연산 2회 후 결과가 달라짐', '');

    return V;
}

// ── [A9] 경로 동등성 ────────────────────────────────────────────────────
//
// 조정(adjust)은 정산의 정정이고 환불(refund)은 정산 후의 사건이다(core-rules.md 제6조).
// 그래서 실무에서 조정을 깜빡하고 환불부터 처리한 뒤 뒤늦게 조정을 넣더라도, 최종 금액은
// "처음부터 순서대로 했을 때"와 같아야 한다. 안 그러면 담당자가 일을 한 순서에 따라
// 학생이 내는 돈이 달라진다.
//
//   A경로(정상)      : 조정 → 정산 → 환불
//   B경로(뒤늦은 조정): 정산 → 환불 → 조정
//
// 이 검사는 같은 시나리오를 두 순서로 각각 돌려 최종 3분할을 통째로 비교한다.
// 2026-09-17 수정 전에는 2,000건 중 72%가 달랐다(자부담 최대 31,000원 차이).
function buildPathScenario(seed, order) {
    const g = makeGen(seed);
    const nCourse = g.int(1, 3);
    const budget = g.pick([500000, 250000, 150000]); // 여유~부족을 두루 섞는다
    const w = freshEngine({
        cho3Annual: budget, cho3H1Cap: Math.min(250000, budget), freeAnnual: 600000,
        cho3Priority: g.pick(['T,B', 'B,T']), freePriority: g.pick(['T,B', 'B,T']),
        deductMode: g.pick(['ITEM_FIRST', 'COURSE_FIRST']), cho3Grades: [3],
    });

    const names = [];
    for (let i = 0; i < nCourse; i++) {
        const cn = `강좌${i}(A)`;
        names.push(cn);
        w.C[cn] = { 1: { t: g.int(4, 12) * 10000, b: g.chance(0.6) ? g.int(0, 4) * 5000 : 0, m: 0, mh: g.pick(['4,4,4', '4,3,3']), unit: 1 } };
        w.M[`강좌${i}`] = { 1: { cnt: 1, inst_m: g.int(2, 4) * 10000, mgmt_m: 1000, unit: 1 } };
    }

    const st = { g: 3, b: 1, n: 1, name: '홍길동' };
    if (g.chance(0.4)) w.F.push({ ...st, startQ: 1, startSess: 0, courses: {} });
    const es = names.map((cn, i) => ({ ...st, q: 1, course: cn, seq: i, refunds: [], adjusts: [] }));
    w.E.push(...es);

    const target = es[g.int(0, es.length - 1)];  // 환불과 조정이 모두 걸릴 강좌
    const refund = { ty: g.pick(['STUDENT', 'DISEASE']), sessIdx: g.int(0, 2), ah: g.int(0, 3), bkRefTy: 'NONE', bkRefAmt: 0 };
    const adjust = { title: '조정', amtT: g.int(-3, 5) * 5000, amtB: g.int(-1, 3) * 2000, amtM: 0 };

    const doAdjust = () => w.commitState(() => { target.adjusts.push(adjust); });
    const doRefund = () => w.commitState(() => {
        w.captureEnrollmentBaseline(target);
        target.refunds.push(refund);
        w.updateFrozenSplit(target);
    });

    w.commitState(() => {});
    if (order === 'A') { doAdjust(); doRefund(); } else { doRefund(); doAdjust(); }
    return w;
}

function checkPathEquivalence(seed) {
    const snap = w => w.Hs.slice().sort((a, b) => a.c.localeCompare(b.c))
        .map(h => [h.c, h.sT, h.sB, h.tc, h.bc, h.tf, h.bf, h.finT, h.finB]);

    let A, B;
    try { A = snap(buildPathScenario(seed, 'A')); B = snap(buildPathScenario(seed, 'B')); }
    catch (err) { return [{ code: 'A9-실행오류', msg: err.message, ctx: '' }]; }

    if (JSON.stringify(A) === JSON.stringify(B)) return [];

    const selfA = A.reduce((s, r) => s + r[7] + r[8], 0);
    const selfB = B.reduce((s, r) => s + r[7] + r[8], 0);
    const bad = A.find((r, i) => JSON.stringify(r) !== JSON.stringify(B[i])) || A[0];
    return [{
        code: 'A9-경로동등성',
        msg: `조정을 언제 했느냐에 따라 금액이 달라진다. 자부담 총액 A(제때)=${selfA} vs B(뒤늦게)=${selfB}`,
        ctx: bad[0],
    }];
}

// ── 단일 시나리오 상세 덤프 (위반 seed 재현용) ───────────────────────────
function dumpScenario(seed) {
    const w = buildScenario(seed);
    const S = w.SysSet;
    console.log(`=== seed ${seed} ===`);
    console.log(`SysSet: 모드=${S.deductMode} 초3순서=${S.cho3Priority} 자유순서=${S.freePriority}`);
    console.log(`        초3연간=${S.cho3Annual} 상반기캡=${S.cho3H1Cap} 자유연간=${S.freeAnnual} 대상학년=${JSON.stringify(S.cho3Grades)}`);
    console.log(`        마감차수=${JSON.stringify(Object.keys(S.closedSess || {}))}`);
    const V = checkInvariants(w).concat(checkPathEquivalence(seed));
    Object.values(w.Ld).forEach(L => {
        const rows = w.Hs.filter(h => h.id === L.id);
        console.log(`\n[${L.nm}] 초3대상=${L.isC}(한도 ${L.cTotal}) 자유대상=${L.isF}(한도 ${L.fTotal}) 사유=${L.reason || '일반'}`);
        rows.forEach(h => {
            console.log(`  Q${h.q} ${h.c.padEnd(14)} mh=${(w.C[h.c][h.q] || {}).mh}` +
                ` 청구 ${h.sT}/${h.sB}/${h.sM} | 초3 ${h.tc}/${h.bc}/${h.mc}` +
                ` | 자유 ${h.tf}/${h.bf}/${h.mf} | 자부담 ${h.finT}/${h.finB}/${h.finM}` +
                (h.e.refunds?.length ? ` [환불${h.e.refunds.length}]` : '') +
                (h.e.adjusts?.length ? ' [조정]' : '') +
                (h.e.frozenSplit ? ' [동결]' : ''));
            if (h.e.refunds?.length) console.log(`       환불 ${JSON.stringify(h.e.refunds)}`);
            if (h.e.adjusts?.length) console.log(`       조정 ${JSON.stringify(h.e.adjusts)}`);
            if (h.e.baseline) console.log(`       baseline ${JSON.stringify(h.e.baseline)}\n       frozen   ${JSON.stringify(h.e.frozenSplit)}`);
        });
    });
    console.log(V.length ? `\n❌ 불변식 위반 ${V.length}건` : '\n✅ 불변식 위반 없음');
    V.forEach(v => console.log(`   [${v.code}] ${v.ctx} :: ${v.msg}`));
    return V.length;
}

// ── 대량 실행 ──────────────────────────────────────────────────────────
function runFuzz(N, START) {
    const byCode = new Map();
    let failedSeeds = 0, crashed = 0;
    const t0 = Date.now();

    for (let seed = START; seed < START + N; seed++) {
        let w;
        try { w = buildScenario(seed); }
        catch (err) {
            crashed++;
            const k = `엔진예외: ${String(err.message).slice(0, 70)}`;
            if (!byCode.has(k)) byCode.set(k, { n: 0, seeds: [], sample: '' });
            const r = byCode.get(k); r.n++; if (r.seeds.length < 6) r.seeds.push(seed);
            continue;
        }
        const V = checkInvariants(w).concat(checkPathEquivalence(seed));
        if (V.length) failedSeeds++;
        V.forEach(v => {
            if (!byCode.has(v.code)) byCode.set(v.code, { n: 0, seeds: [], sample: '' });
            const r = byCode.get(v.code);
            r.n++; if (r.seeds.length < 6) r.seeds.push(seed);
            if (!r.sample) r.sample = `${v.ctx} :: ${v.msg}`;
        });
    }

    console.log(`\n=== 정산 엔진 퍼즈 테스트: ${N}건 (seed ${START}~${START + N - 1}), ${((Date.now() - t0) / 1000).toFixed(1)}초 ===`);
    console.log(`위반이 발생한 시나리오: ${failedSeeds} / ${N}${crashed ? `   (엔진 예외 ${crashed}건)` : ''}\n`);
    if (!byCode.size) { console.log('✅ 모든 불변식 통과'); return 0; }

    [...byCode.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([code, r]) => {
        console.log(`[${code}]  ${r.n}건`);
        console.log(`   재현: node test/fuzz-engine.js --seed ${r.seeds[0]}   (다른 seed: ${r.seeds.slice(1).join(', ') || '없음'})`);
        if (r.sample) console.log(`   예시: ${r.sample}`);
        console.log('');
    });
    return failedSeeds;
}

// ── CLI ────────────────────────────────────────────────────────────────
if (require.main === module) {
    const args = process.argv.slice(2);
    const si = args.indexOf('--seed');
    if (si >= 0) {
        process.exitCode = dumpScenario(Number(args[si + 1])) ? 1 : 0;
    } else {
        process.exitCode = runFuzz(Number(args[0]) || 2000, Number(args[1]) || 1) ? 1 : 0;
    }
}

module.exports = { buildScenario, checkInvariants, checkPathEquivalence, dumpScenario, runFuzz };
