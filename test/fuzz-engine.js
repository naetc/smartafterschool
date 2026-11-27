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
     A11 지원시점 창 기본값의 무해성(창을 열어 그대로 저장해도 금액이 그대로인가)
     A12 상계 지정(제6조 3의2)이 그 분기 그 학생의 자부담을 늘리지 않는가, 되돌리면 원상복구되는가
     A13 한 학생의 상계 지정이 다른 학생 금액을 바꾸지 않는가
     A9b 경로 동등성 — 환불 뒤 같은 학생의 다른 강좌를 편집(조정·요금표·개별공제)해도 결과가 같은가

   [부가 서비스 불변식 — 계산 결과가 파일·백업으로 나갈 때] (2026-09-23 추가)
     엔진이 맞아도 행정실에 나가는 건 엑셀 파일이다. 2026-09-23에 교육비 청구서 파일이
     화면 미리보기와 다른 반올림을 쓰고 있었고, [복구] 버튼이 전입 한도를 버리고 있었다.
     둘 다 엔진 테스트로는 안 잡혔다. 그래서 파일과 백업을 앱의 실제 함수로 만들어 검사한다.
     B1 청구서 파일 = 화면 미리보기(splitInvoiceRow)   B2 청구서 합계 = 엔진 합계, 행 안에서 강사료+수용비 = 계
     B3 청구서 차수별 파일의 합 = 분기 전체 파일        B4 수납요구서 합계 = 엔진 자부담 합계
     B5 명렬표 합계 = 엔진 합계(원가·초3·자유·자부담)   B6 환불 이력서 3분할 합 = 환불액
     B7 백업 → 다른 PC에서 복구 → 새로고침 해도 장부의 모든 값과 금액이 그대로
     B8 청구서 케이스별 상세 시트를 부서마다 더하면 부서 줄과 같다, 줄 금액 = 단가 × 인원 (2026-11-26)
     B9 수강현황 종합 파일 6시트 합계 = 엔진, 어느 줄이든 원가 + 환불·조정 = 초3 + 자유 + 자부담 (2026-11-27)

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

const { freshEngine, exportBook, backupText, simulateRestore, simulateReload } = require('./harness');

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
    // 💡 A11이 "지원 시점 수동 조작" 창의 기본값 계산(freeCourseDefaultTiming)을 앱과 똑같이
    //    써야 해서 화면 파일까지 같이 올린다. 규칙을 퍼즈 쪽에 베껴 쓰면 판별력이 사라진다.
    //    B군은 백업(app-db.js)과 서식(app-ui-export.js, app-utils.js)을 실제 함수로 만든다.
    //    파일을 더 올려도 난수를 뽑는 순서는 그대로라 기존 seed의 시나리오는 바뀌지 않는다.
    }, ['app-db.js', 'app-ui-steps.js', 'app-ui-export.js', 'app-utils.js']);

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

    // 환불 지원금 상계 지정(제6조 3의2, 2026-11-25) — 환불이 있는 학생·분기 일부를 상계로.
    // ⚠ 별도 난수열을 쓴다. 위 g에서 더 뽑으면 기존 seed의 시나리오가 통째로 바뀌어,
    //   예전에 기록한 재현 seed(--seed 116 등)가 다른 장부를 가리키게 된다.
    const og = makeGen(seed * 7919 + 13);
    commitLike(w);
    w.SysSet.refundOffset = {};
    refundStuQuarters(w).forEach(({ q, id }) => {
        if (og.chance(0.4)) w.SysSet.refundOffset[w.refundOffsetKey(q, id)] = { at: 'fuzz' };
    });

    commitLike(w);
    return w;
}

// 환불이 한 건이라도 있는 (분기, 학생) 목록
function refundStuQuarters(w) {
    const seen = new Map();
    w.E.forEach(e => {
        if (!(e.refunds || []).length) return;
        const id = w.uid(e.g, e.b, e.n, e.name);
        seen.set(`${e.q}|${id}`, { q: e.q, id });
    });
    return [...seen.values()];
}

// ── [A12·A13] 환불 지원금 상계 지정 (2026-11-25, 헌법 제6조 3의2) ─────────────
// 환불이 있는 학생·분기의 지정을 하나씩 뒤집어 보고(이월 ↔ 상계), 정답 금액 없이 성질만 본다.
//   A12  이월 → 상계로 바꾸면 그 학생의 ① 그 분기 자부담 ② 연간 자부담이 늘지 않는다
//        (상계 → 이월이면 반대로 줄지 않는다) — 상계는 남은 자부담을 덮을 뿐 학생에게 불리할 수 없다
//   A13  다른 학생의 금액은 1원도 안 바뀐다
//   A12c 다시 뒤집으면 원래 금액으로 정확히 돌아온다(지정은 되돌릴 수 있어야 한다)
function checkOffsetInvariants(w) {
    const V = [];
    const fail = (code, msg, ctx) => V.push({ code, msg, ctx });
    w.recomputeAll();
    const view = () => JSON.stringify(w.Hs.map(h => [h.id, h.q, h.c, h.tc, h.bc, h.mc || 0, h.tf, h.bf, h.mf || 0, h.finT, h.finB, h.finM || 0]));
    const selfOf = (id, q) => w.Hs.filter(h => h.id === id && (q == null || h.q === q)).reduce((a, h) => a + h.finT + h.finB + (h.finM || 0), 0);
    const others = id => JSON.stringify(w.Hs.filter(h => h.id !== id).map(h => [h.id, h.q, h.c, h.tc, h.bc, h.tf, h.bf, h.finT, h.finB]));

    refundStuQuarters(w).slice(0, 4).forEach(({ q, id }) => {
        const map = w.SysSet.refundOffset = w.SysSet.refundOffset || {};
        const key = w.refundOffsetKey(q, id);
        const wasOn = !!map[key];
        const full0 = view(), selfQ0 = selfOf(id, q), selfY0 = selfOf(id), oth0 = others(id);
        const tag = `${q}분기 ${id} ${wasOn ? '상계→이월' : '이월→상계'}`;

        if (wasOn) delete map[key]; else map[key] = { at: 'fuzz' };
        w.recomputeAll();
        const selfQ1 = selfOf(id, q), selfY1 = selfOf(id);
        const toOffset = !wasOn;
        // 상계 쪽 자부담 ≤ 이월 쪽 자부담
        const [offQ, carQ, offY, carY] = toOffset ? [selfQ1, selfQ0, selfY1, selfY0] : [selfQ0, selfQ1, selfY0, selfY1];
        // ⚠ 알려진 한계(A12k, 2026-11-25 분석): 이월은 환불 시점의 동결값(frozenSplit)을 그대로
        //   재생하고, 상계는 지금 규칙으로 다시 계산한다. 그래서 동결값이 지금 규칙보다 지원금을
        //   더 주고 있는 학생은 상계 쪽 자부담이 더 클 수 있다. 확인된 두 경우만 '알려진 한계'로 센다.
        //   ① 이월 상태에서 이미 한도 초과(제5조 감지 대상) — 상계가 한도를 지키는 쪽이다
        //   ② 그 분기 안에서 자유수강권 지원 기간이 시작·종료(늦은 시작, 육아기 종료) — 차수 비례 계산과
        //      환불의 '자부담부터 벗기기'가 서로 다르게 나눈다. 어느 쪽이 맞는지는 별도 검토 대상.
        //   어느 경우든 상계 지정 전 미리보기에 자부담 증가가 그대로 보이므로 사람이 판단할 수 있다.
        let known = '';
        if (offQ > carQ && offQ - carQ <= 10) known = '10원반올림';
        else if (offQ > carQ) {
            // 한도 초과 여부는 '이월' 상태에서 본다. 지금 상태: wasOn이면 이월, 아니면 상계.
            if (!wasOn) { delete map[key]; w.recomputeAll(); }
            const overCarry = w.getBudgetOverruns().some(o => o.id === id);
            if (!wasOn) { map[key] = { at: 'fuzz' }; w.recomputeAll(); }
            const f = w.F.find(x => w.uid(x.g, x.b, x.n, x.name) === id);
            const windowInQ = !!f && ((f.startQ === q && f.startSess > 0) || (f.reason === 'CHILDCARE_REDUCED' && f.endQ === q));
            const L = Object.values(w.Ld).find(x => x.id === id);
            const both = !!(L && L.isC && L.isF);
            known = overCarry ? '이월상태한도초과' : windowInQ ? '분기안지원기간경계' : both ? '초3자유동시대상' : '';
        }
        //   ③ 10원 이하 차이 — 환불의 '벗기기'와 워터폴의 차수 안분이 10원 올림을 다르게 한다.
        //   ④ 초3·자유를 둘 다 받는 학생 — 워터폴은 초3을 순서대로 먼저 배정할 뿐 최적 배분을 찾지
        //      않는다. 그래서 다시 계산하면 귀한 초3이 자유로도 덮을 수 있던 앞 강좌에 들어가고, 초3만
        //      덮을 수 있던 항목(예: 자유 우선순위에 없는 재료비)이 자부담이 될 수 있다(seed 2212).
        //      환불이 없는 학생에게도 똑같이 생기는 엔진의 기존 성질이다.
        // ※ '연간' 자부담은 불변식이 아니다(2026-11-25 퍼즈로 확인). 상계는 지원금을 이번 분기로
        //   당겨 쓰는데, 초3은 상반기 한도가 있고 초3·자유가 덮는 항목이 다를 수 있어서, 당겨 쓴 만큼
        //   다음 분기에 그 지원금만 덮던 항목이 자부담이 될 수 있다(예: seed 1846). 그래서 연간 변화는
        //   검사하지 않고, 상계 지정 미리보기가 모든 분기의 변화를 보여 주게 했다.
        void offY; void carY;
        if (offQ > carQ) {
            if (known) V.push({ code: 'A12k-' + known, msg: `상계 ${offQ} > 이월 ${carQ}`, ctx: tag, known: true });
            else fail('A12-상계분기자부담', `상계 ${offQ} > 이월 ${carQ}`, tag);
        }
        if (others(id) !== oth0) fail('A13-다른학생불변', '다른 학생 금액이 바뀌었다', tag);

        if (wasOn) map[key] = { at: 'fuzz' }; else delete map[key];
        w.recomputeAll();
        if (view() !== full0) fail('A12c-되돌리기', '지정을 원래대로 돌렸는데 금액이 처음과 다르다', tag);
    });
    return V;
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

    // [A11] 지원시점 창 기본값의 무해성 — "지원 시점 수동 조작" 창을 열어 아무것도 건드리지
    //   않고 [저장]을 눌렀을 때 금액이 1원도 달라지면 안 된다. 창이 미리 선택해 둔 기본값이,
    //   엔진이 override 없는 강좌에 실제로 적용하는 시점과 같은 뜻이어야 한다는 성질이다.
    //   어긋나면 담당자는 창에 뜬 시점을 사실로 믿는데 장부는 다른 시점으로 굴러간다.
    //   (2026-09-21: 창이 분기만 강좌 개설분기로 밀고 차수는 학생 지정값을 그대로 가져와,
    //    "1분기 3차수부터" 학생의 3분기 강좌에 아무도 입력한 적 없는 "3분기 3차수"가 떴다.
    //    그대로 저장하면 한 강좌에서 110,000원이 움직였다.)
    //   ⚠ 기본값 규칙을 여기에 베껴 쓰지 말 것. 앱과 같은 함수를 불러야 판별력이 생긴다.
    //   비교 기준은 "override가 아예 없는 상태"가 아니라 "엔진이 실제로 적용하는 시점을 명시
    //   override로 적은 상태"다. 둘 다 같은 override 경로를 타야 순수하게 '시점 규칙'만 비교된다.
    //   (override 없음 ↔ 그와 같은 뜻의 명시 override는 지금 엔진에서 완전히 같지는 않다.
    //    freeCeilT가 차수별 몫을 더해 만드는데, mh의 마지막 차수 시수가 0이면(예 '4,4,0')
    //    나머지를 떠안는 그 차수를 건너뛰어 상한이 10원쯤 모자라진다. seed 3703에서 잡혔다.
    //    지금 앱에서는 만들 수 없는 mh이고 실 운영 백업에도 없어서 별건으로 남겨둔다.
    //    여기서 그 차이까지 같이 보면 시점 규칙의 회귀를 가려버린다.)
    if (typeof w.freeCourseDefaultTiming === 'function' && w.F.length && w.E.length) {
        const origCourses = w.F.map(f => f.courses);
        const view = () => JSON.stringify(w.Hs.map(h => [h.q, h.id, h.c, h.tc, h.bc, h.mc, h.tf, h.bf, h.mf, h.finT, h.finB, h.finM]));
        const frozenSnap = w.snapshotFrozenState();
        // 강좌마다 override가 없는 자리에 timing(f, 강좌, 수강내역)이 돌려주는 시점을 채워 넣고 재연산한다.
        const fillAndRun = (timing) => {
            w.F.forEach((f, i) => {
                const id = w.uid(f.g, f.b, f.n, f.name);
                const mine = w.E.filter(e => w.uid(e.g, e.b, e.n, e.name) === id);
                f.courses = { ...(origCourses[i] || {}) };
                [...new Set(mine.map(e => e.course))].forEach(cn => {
                    if (!f.courses[cn]) f.courses[cn] = timing(f, cn, mine);
                });
            });
            w.autoRunSet(true);
            return view();
        };
        try {
            // 엔진이 override 없는 강좌에 실제로 적용하는 시점 = 학생 단위 시작 분기·차수
            const 엔진시점 = fillAndRun(f => ({ q: f.startQ || 1, s: f.startSess || 0, h: 1 }));
            const 창기본값 = fillAndRun(w.freeCourseDefaultTiming);
            if (창기본값 !== 엔진시점) fail('A11-지원시점창기본값', '창이 미리 골라둔 시점이 엔진이 실제로 적용하는 시점과 다른 금액을 낸다', '');
        } finally {
            w.F.forEach((f, i) => { f.courses = origCourses[i]; });
            w.restoreFrozenState(frozenSnap);
            w.autoRunSet(true);
        }
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

// ── [B] 부가 서비스 불변식: 엑셀 서식 ──────────────────────────────────────
// 서식 파일은 앱의 내보내기 함수(exInvoice 등)를 그대로 실행해 만든다(harness.exportBook).
// 비교 기준은 엔진 결과(Hs)이거나 화면 미리보기가 쓰는 함수다. 정답 금액은 따지지 않는다.
const INVOICE_PARTS = [['원가', '원가_수강료(계)', 'sT'], ['초3공제', '초3공제_수강료(계)', 'tc'],
    ['자유공제', '자유공제_수강료(계)', 'tf'], ['자부담', '자부담_최종청구(계)', 'finT']];
const baseCourse = c => c.replace(/\s*\([A-Za-z가-힣0-9]+\)$/, '').trim(); // exInvoice와 같은 부서 묶음 규칙
const sumBy = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);

// ⚠ '알려진 한계'(known)는 실패로 세지 않고 따로 보고한다. 2026-09-23 퍼즈로 찾았고, 고치려면
//   사용자 판단이 필요해서 남겨 둔 것이다. 이 조건에 딱 맞지 않는 위반은 여전히 실패다.
//   - B6k: 같은 강좌·같은 항목에 감액 조정과 환불이 겹쳐 청구액보다 많이 깎인 경우. 엔진은 청구액을
//          0에서 멈추지만 환불 이력서엔 환불액이 그대로 찍혀 3분할 합과 안 맞는다(2,000건 중 254건,
//          전부 이 유형). 실제 운영 백업에서는 0건.
//   (청구서 자부담 열의 -10원 음수는 한때 B2k로 여기 있었지만 2026-09-23에 splitInvoiceRow를 고쳐
//    이제 B2 실패로 센다.)
function checkServiceInvariants(w) {
    const V = [];
    const fail = (code, msg, ctx) => V.push({ code, msg, ctx });
    const note = (code, msg, ctx) => V.push({ code, msg, ctx, known: true });
    const is3D = w.SysSet.accType === 'SEPARATED';
    w.recomputeAll();

    for (let q = 1; q <= 4; q++) {
        const Hq = w.Hs.filter(h => h.q === q);
        if (!Hq.length) continue;
        const tag = `${q}분기`;

        // ── 교육비 청구서 (분기 전체) ──
        const inv = exportBook(w, 'exInvoice', { q, p_sInvoice: 'ALL' });
        const rows = inv ? inv.sheets[0].rows : [];
        const byDept = Object.fromEntries(rows.map(r => [r['부서명'], r]));

        // [B2] 파일 합계 = 엔진 합계. 제외되는 행(수강료·자부담 모두 0)은 A1에 의해 모든 금액이 0이다.
        INVOICE_PARTS.forEach(([, col, key]) => {
            const a = sumBy(rows, r => r[col]), b = sumBy(Hq, h => h[key]);
            if (a !== b) fail('B2-청구서합계', `${col}: 파일 ${a} != 엔진 ${b}`, tag);
        });
        // [B2] 행 안에서 강사료 + 수용비 = 계, 파일에 음수가 찍히지 않는다
        rows.forEach(r => INVOICE_PARTS.forEach(([p, col]) => {
            const i = r[`${p}_강사료`], m = r[`${p}_수용비`];
            if (i + m !== r[col]) fail('B2-청구서행내합계', `${r['부서명']} ${p}: ${i}+${m} != ${r[col]}`, tag);
            if (i < 0 || m < 0) fail('B2-청구서음수', `${r['부서명']} ${p}: 강사료 ${i} / 수용비 ${m}`, tag);
        }));

        // [B1] 파일 = 화면 미리보기. 미리보기(renderPreviewInvoice)는 splitInvoiceRow로 행마다 쪼갠다.
        const expect = {};
        Hq.filter(h => !(h.sT === 0 && h.finT === 0)).forEach(h => {
            const s = w.splitInvoiceRow(h, w.C[h.c]?.[q]);
            const e = expect[baseCourse(h.c)] = expect[baseCourse(h.c)] || { 원가: 0, 초3공제: 0, 자유공제: 0, 자부담: 0 };
            e.원가 += s.sT_i; e.초3공제 += s.tc_i; e.자유공제 += s.tf_i; e.자부담 += s.finT_i;
        });
        Object.entries(expect).forEach(([dept, e]) => {
            const r = byDept[dept];
            if (!r) { fail('B1-청구서미리보기', `${dept}: 미리보기엔 있는데 파일에 없다`, tag); return; }
            Object.keys(e).forEach(p => {
                if (r[`${p}_강사료`] !== e[p]) fail('B1-청구서미리보기', `${dept} ${p}_강사료: 파일 ${r[`${p}_강사료`]} != 미리보기 ${e[p]}`, tag);
            });
        });

        // [B3] 차수별로 받은 파일을 합치면 분기 전체 파일과 같다(계 열). 강사료·수용비는 차수마다
        //      10원 올림을 하므로 합이 달라질 수 있어 비교하지 않는다.
        // sessDetails는 배열이 아니라 차수 번호를 키로 쓰는 객체다(.length가 없다).
        const nSess = Math.max(0, ...Hq.map(h => Math.max(-1, ...Object.keys(h.sessDetails || {}).map(Number)) + 1));
        const sessSum = {};
        for (let s = 1; s <= nSess; s++) {
            const b = exportBook(w, 'exInvoice', { q, p_sInvoice: s });
            (b ? b.sheets[0].rows : []).forEach(r => {
                const acc = sessSum[r['부서명']] = sessSum[r['부서명']] || {};
                INVOICE_PARTS.forEach(([, col]) => { acc[col] = (acc[col] || 0) + r[col]; });
            });
        }
        rows.forEach(r => INVOICE_PARTS.forEach(([, col]) => {
            const got = (sessSum[r['부서명']] || {})[col] || 0;
            if (got !== r[col]) fail('B3-청구서차수합', `${r['부서명']} ${col}: 차수별 합 ${got} != 분기 ${r[col]}`, tag);
        }));

        // [B8] 케이스별 상세 시트(2026-11-26): 부서마다 케이스 줄을 더하면 [청구서] 시트의 그 부서 줄과
        //      12칸·인원 모두 같다(학생이 빠지거나 두 번 들어가지 않는다). 줄 금액 = 1인 단가 × 인원.
        //      차수별 파일에도 같은 성질이 성립해야 하므로 마지막 차수 하나도 함께 본다.
        const checkCases = (book, sTag) => {
            const main = book ? book.sheets[0].rows : [];
            const cs = book && book.sheets[1] ? book.sheets[1].rows : null;
            if (main.length && !cs) { fail('B8-케이스시트없음', '청구서 파일에 케이스별 상세 시트가 없다', sTag); return; }
            const acc = {};
            (cs || []).forEach(r => {
                const a = acc[r['부서명']] = acc[r['부서명']] || {};
                Object.keys(r).forEach(k => { if (typeof r[k] === 'number' && !k.startsWith('단가_') && k !== '케이스') a[k] = (a[k] || 0) + r[k]; });
                [['원가_수강료(계)', '단가_원가'], ['초3공제_수강료(계)', '단가_초3'], ['자유공제_수강료(계)', '단가_자유'], ['자부담_최종청구(계)', '단가_자부담']]
                    .forEach(([col, u]) => { if (r[u] * r['인원'] !== r[col]) fail('B8-케이스단가', `${r['부서명']} #${r['케이스']} ${col}: ${r[u]}×${r['인원']} != ${r[col]}`, sTag); });
            });
            main.forEach(r => Object.keys(r).forEach(k => {
                if (typeof r[k] !== 'number') return;
                const ck = k === '청구인원' ? '인원' : k;
                const got = (acc[r['부서명']] || {})[ck] || 0;
                if (got !== r[k]) fail('B8-케이스합계', `${r['부서명']} ${k}: 케이스 합 ${got} != 부서 ${r[k]}`, sTag);
            }));
            Object.keys(acc).forEach(d => { if (!main.some(r => r['부서명'] === d)) fail('B8-케이스합계', `${d}: 케이스엔 있는데 부서 줄이 없다`, sTag); });
        };
        checkCases(inv, tag);
        if (nSess > 0) checkCases(exportBook(w, 'exInvoice', { q, p_sInvoice: nSess }), `${tag} ${nSess}차수`);

        // [B4] 에듀파인 수납요구서: 시트 행 합계 = 엔진 자부담 합계, 시트마다 총계 행 = 그 시트 합
        w.gQ = q; w.buildEduTabs();
        const edu = exportBook(w, 'exEdu', { q });
        let eduSum = 0;
        (edu ? edu.sheets : []).forEach(sh => {
            const body = sh.rows.filter(r => r['* 학과'] !== '총계');
            const total = sh.rows.find(r => r['* 학과'] === '총계');
            const s = sumBy(body, r => r['* 대상금액']);
            eduSum += s;
            if (!total || total['* 대상금액'] !== s) fail('B4-수납요구서총계', `${sh.name}: 총계 ${total && total['* 대상금액']} != 행 합 ${s}`, tag);
        });
        const selfSum = sumBy(Hq, h => h.finT + h.finB + (is3D ? (h.finM || 0) : 0));
        if (eduSum !== selfSum) fail('B4-수납요구서합계', `파일 ${eduSum} != 엔진 자부담 ${selfSum}`, tag);

        // [B5] 명렬표: 대상별 합계 = 엔진 합계
        [['ALL', h => h.sT + h.sB + (h.sM || 0)], ['CHO3', h => h.tc + h.bc + (h.mc || 0)],
            ['FREE', h => h.tf + h.bf + (h.mf || 0)], ['SELF', h => h.finT + h.finB + (h.finM || 0)]].forEach(([tg, f]) => {
            const b = exportBook(w, 'exRoster', { q, p_tg: tg });
            const col = `합계(${w.getRosterModeLabel(tg)})`;
            const a = b ? sumBy(b.sheets[0].rows, r => r[col]) : 0;
            const e = sumBy(Hq, f);
            if (a !== e) fail('B5-명렬표합계', `${tg}: 파일 ${a} != 엔진 ${e}`, tag);
        });

        // [B6] 환불 이력서: 환불 한 건의 초3 + 자유 + 자부담 = 그 건의 환불액
        const ref = exportBook(w, 'exRef', { q });
        // [B6b] 예산별 시트(초3지원권·자유수강권·수익자부담)의 금액 = 전체 시트의 그 예산 열 (2026-11-24)
        if (ref) {
            const all = ref.sheets[0].rows;
            [['초3', '초3공제'], ['자유', '자유공제'], ['자부담', '자부담']].forEach(([bk, ak], i) => {
                const sh = ref.sheets[i + 1];
                const items = ['수강료', '교재비'].concat(is3D ? ['재료비'] : []);
                items.forEach(k => {
                    const a = sumBy(sh.rows, r => r[`${bk}_${k}`]), b = sumBy(all, r => r[`${ak}_${k}`]);
                    if (a !== b) fail('B6b-환불이력서예산시트', `${sh.name} ${k}: 시트 ${a} != 전체 ${b}`, tag);
                });
                sh.rows.forEach(r => {
                    const s = items.reduce((t, k) => t + r[`${bk}_${k}`], 0);
                    if (s !== r[`${bk}_합계`]) fail('B6b-환불이력서예산시트', `${sh.name} ${r['강좌명']}: 항목 합 ${s} != 합계 ${r[`${bk}_합계`]}`, tag);
                });
            });
        }
        (ref ? ref.sheets[0].rows : []).forEach(r => {
            const e = w.E.find(x => x.q === q && x.course === r['강좌명'] && x.name === r['이름'] && x.g === r['학년'] && x.b === r['반'] && x.n === r['번호']);
            [['수강료', '수강료환불액', 'amtT'], ['교재비', '교재비환불액', 'amtB']].concat(is3D ? [['재료비', '재료비환불액', 'amtM']] : []).forEach(([k, amt, adj]) => {
                const s = r[`초3공제_${k}`] + r[`자유공제_${k}`] + r[`자부담_${k}`];
                if (s === r[amt]) return;
                const msg = `${r['강좌명']} ${k}: ${r[`초3공제_${k}`]}+${r[`자유공제_${k}`]}+${r[`자부담_${k}`]} != 환불 ${r[amt]}`;
                if (e && (e.adjusts || []).some(a => (a[adj] || 0) < 0)) note('B6k-감액조정과환불중복', msg, tag);
                else fail('B6-환불이력서3분할', msg, tag);
            });
        });

        // [B9] 수강현황 종합 파일(2026-11-27): 시트 6개가 엔진·서로와 같은 돈을 말한다.
        //   · 강좌별·부서별·전체 명단의 원가/초3/자유/자부담 합 = 엔진(Hs) 합, 원가 + 환불·조정 = 엔진 청구액(sX)
        //   · 어느 줄이든 항목마다 원가 + 환불·조정 = 초3 + 자유 + 자부담, 지원 계 = 초3 + 자유
        //   · 초3·자유 명단 합 = 엔진 공제 합, 개인별 현황 합 = 전체 명단 합, 부서 칸 합 = 자부담 계
        //   · 인원: 수강 = 명단 줄 수. 개시 전 전액 환불(취소)은 파일에서 빠진다(사용자 결정 2026-11-27) —
        //     그래서 비교 대상 엔진 행도 취소를 뺀 HqE다. 취소 줄의 금액이 새면 아래 합계가 잡는다.
        const HqE = Hq.filter(h => !w.isEnrollCancelled(h));
        const er = exportBook(w, 'exEnrollReport', { q });
        if (HqE.length && !er) fail('B9-수강현황파일없음', '수강 내역이 있는데 파일이 안 만들어졌다', tag);
        if (er) {
            const sh = Object.fromEntries(er.sheets.map(s => [s.name, s]));
            const S = (n, k) => sumBy(sh[n].rows, r => r[k] || 0);
            const ITEMS = [['수강료', 'origT', 'tc', 'tf', 'finT', 'sT'], ['교재비', 'origB', 'bc', 'bf', 'finB', 'sB'], ['재료비', 'origM', 'mc', 'mf', 'finM', 'sM']];
            const hasM = er.sheets[0].columns.includes('원가_재료비');
            if (!hasM && HqE.some(h => h.origM || h.sM || h.finM || h.mc || h.mf)) fail('B9-수강현황재료비누락', '재료비가 있는데 재료비 열이 없다', tag);
            ITEMS.filter(([il]) => il !== '재료비' || hasM).forEach(([il, o, c, f, fin, s]) => {
                const eng = k => sumBy(HqE, h => h[k] || 0);
                ['수강현황(강좌별)', '부서별 현황', '전체 수강 명단'].forEach(n => {
                    [['원가', o], ['초3', c], ['자유', f], ['자부담', fin]].forEach(([bk, k]) => {
                        if (S(n, `${bk}_${il}`) !== eng(k)) fail('B9-수강현황합계', `${n} ${bk}_${il}: 파일 ${S(n, `${bk}_${il}`)} != 엔진 ${eng(k)}`, tag);
                    });
                    if (S(n, `원가_${il}`) + S(n, `환불·조정_${il}`) !== eng(s)) fail('B9-수강현황합계', `${n} ${il}: 원가+환불·조정 != 엔진 청구액 ${eng(s)}`, tag);
                    sh[n].rows.forEach(r => {
                        const L = r[`원가_${il}`] + r[`환불·조정_${il}`], R = r[`초3_${il}`] + r[`자유_${il}`] + r[`자부담_${il}`];
                        if (L !== R) fail('B9-수강현황행항등식', `${n} ${r['강좌명'] || r['부서']} ${il}: ${L} != ${R}`, tag);
                        if ((`지원 계_${il}` in r) && r[`지원 계_${il}`] !== r[`초3_${il}`] + r[`자유_${il}`]) fail('B9-수강현황행항등식', `${n} 지원 계_${il}`, tag);
                    });
                });
                if (S('초3 명단', `초3_${il}`) !== eng(c)) fail('B9-수강현황지원명단', `초3 명단 ${il}: ${S('초3 명단', `초3_${il}`)} != ${eng(c)}`, tag);
                if (S('자유수강권 명단', `자유_${il}`) !== eng(f)) fail('B9-수강현황지원명단', `자유 명단 ${il}: ${S('자유수강권 명단', `자유_${il}`)} != ${eng(f)}`, tag);
            });
            const its = ['수강료', '교재비'].concat(hasM ? ['재료비'] : []);
            const P = '개인별 현황';
            ['원가', '환불·조정', '초3', '자유', '자부담'].forEach(bk => {
                const a = S(P, `${bk}_계`), b = its.reduce((t, il) => t + S('전체 수강 명단', `${bk}_${il}`), 0);
                if (a !== b) fail('B9-수강현황개인별', `${bk}: 개인별 ${a} != 명단 ${b}`, tag);
            });
            sh[P].rows.forEach(r => {
                if (r['원가_계'] + r['환불·조정_계'] !== r['초3_계'] + r['자유_계'] + r['자부담_계']) fail('B9-수강현황개인별', `${r['이름']} 행 항등식`, tag);
                const d = Object.keys(r).filter(k => k.startsWith('부서_')).reduce((t, k) => t + (r[k] || 0), 0);
                if (d !== r['자부담_계']) fail('B9-수강현황개인별', `${r['이름']} 부서 칸 합 ${d} != 자부담 ${r['자부담_계']}`, tag);
            });
            ['수강현황(강좌별)', '부서별 현황'].forEach(n => {
                if (S(n, '수강') !== HqE.length) fail('B9-수강현황인원', `${n} 수강 ${S(n, '수강')} != ${HqE.length}`, tag);
            });
            if (sh['전체 수강 명단'].rows.length !== HqE.length) fail('B9-수강현황인원', `명단 ${sh['전체 수강 명단'].rows.length}줄 != ${HqE.length}`, tag);
            const nP = new Set(HqE.map(h => h.id)).size;
            if (sh['개인별 현황'].rows.length !== nP) fail('B9-수강현황인원', `개인별 ${sh['개인별 현황'].rows.length}명 != ${nP}`, tag);
        }
    }
    w.recomputeAll();
    return V;
}

// ── [B7] 백업 왕복 ─────────────────────────────────────────────────────
// [백업] → 다른 PC에서 [복구] → 새로고침. 세 단계 모두 앱의 실제 코드다.
// 원래 장부에 있던 값은 하나도 빠지거나 바뀌면 안 된다(복구가 기본값을 채워 넣는 건 괜찮다).
function lostOrChanged(orig, got, path, out) {
    if (out.length > 5) return out;
    if (orig === undefined) return out;
    if (orig === null || typeof orig !== 'object') {
        if (orig !== got) out.push(`${path}: ${JSON.stringify(orig)} → ${JSON.stringify(got)}`);
        return out;
    }
    if (got === null || typeof got !== 'object') { out.push(`${path}: 사라짐`); return out; }
    if (Array.isArray(orig) && (!Array.isArray(got) || got.length !== orig.length)) { out.push(`${path}: 배열 길이 ${orig.length} → ${got && got.length}`); return out; }
    Object.keys(orig).forEach(k => lostOrChanged(orig[k], got[k], `${path}.${k}`, out));
    return out;
}

async function checkBackupRoundTrip(w) {
    const V = [];
    const fail = (code, msg, ctx) => V.push({ code, msg, ctx });
    const view = x => JSON.stringify(x.Hs.map(h => [h.q, h.id, h.c, h.sT, h.sB, h.sM, h.tc, h.bc, h.mc, h.tf, h.bf, h.mf, h.finT, h.finB, h.finM]).sort());
    w.recomputeAll();
    const before = JSON.parse(JSON.stringify({ C: w.C, M: w.M, F: w.F, E: w.E, SysSet: w.SysSet }));
    const viewBefore = view(w);

    const { saved, errors } = await simulateRestore(backupText(w));
    if (errors.length || !saved) { fail('B7-복구실패', errors[0] || '복구 후 저장된 내용이 없다', ''); return V; }
    const w2 = await simulateReload(saved);

    const diffs = lostOrChanged(before, { C: w2.C, M: w2.M, F: w2.F, E: w2.E, SysSet: w2.SysSet }, '장부', []);
    if (diffs.length) fail('B7-백업왕복_값유실', diffs.slice(0, 3).join(' / '), '');
    if (view(w2) !== viewBefore) fail('B7-백업왕복_금액', '복구하고 새로고침했더니 3분할 금액이 달라졌다', '');
    return V;
}

async function checkAll(seed, w) {
    return checkInvariants(w)
        .concat(checkOffsetInvariants(w))
        .concat(checkServiceInvariants(w))
        .concat(await checkBackupRoundTrip(w))
        .concat(checkPathEquivalence(seed))
        .concat(checkOtherEditPathEquivalence(seed));
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

// ── [A9b] 경로 동등성 — 같은 학생의 '다른 강좌'를 편집할 때 (2026-11-25 추가) ─────
// A9는 환불한 강좌 자신만 조정해서, 환불 뒤 같은 학생의 다른 강좌를 바꾸는 경우를 못 봤다.
// 그 경우 환불 강좌의 baseline("환불이 없었다면 받았을 3분할")이 다시 계산되지 않아,
// 편집을 환불 전에 했을 때와 결과가 달랐다(조정·요금표·개별공제). 순서만 바꿔 두 번 돌려 비교한다.
//   A경로: 다른 강좌 편집 → 환불      B경로: 환불 → 다른 강좌 편집
// ⚠ 별도 난수열(seed*104729+7)을 써서 기존 A9 시나리오는 그대로 둔다.
function buildOtherEditScenario(seed, order) {
    const g = makeGen(seed * 104729 + 7);
    const nCourse = g.int(2, 3);
    const budget = g.pick([500000, 250000, 150000]);
    const w = freshEngine({
        cho3Annual: budget, cho3H1Cap: Math.min(250000, budget), freeAnnual: g.pick([600000, 300000]),
        cho3Priority: g.pick(['T,B', 'B,T']), freePriority: g.pick(['T,B', 'B,T']),
        deductMode: g.pick(['ITEM_FIRST', 'COURSE_FIRST']), cho3Grades: [3],
    });
    const names = [];
    for (let i = 0; i < nCourse; i++) {
        const cn = `강좌${i}(A)`;
        names.push(cn);
        w.C[cn] = { 1: { t: g.int(4, 30) * 10000, b: g.chance(0.6) ? g.int(0, 4) * 5000 : 0, m: 0, mh: g.pick(['4,4,4', '4,3,3']), unit: 1 } };
        w.M[`강좌${i}`] = { 1: { cnt: 1, inst_m: g.int(2, 4) * 10000, mgmt_m: 1000, unit: 1 } };
    }
    const st = { g: g.pick([3, 3, 5]), b: 1, n: 1, name: '홍길동' };
    if (st.g !== 3 || g.chance(0.4)) w.F.push({ ...st, startQ: 1, startSess: 0, courses: {} });
    const es = names.map((cn, i) => ({ ...st, q: 1, course: cn, seq: i, refunds: [], adjusts: [] }));
    w.E.push(...es);

    const ti = g.int(0, es.length - 1);
    const target = es[ti];                                   // 환불할 강좌
    const other = es[(ti + 1 + g.int(0, es.length - 2)) % es.length];   // 편집할 다른 강좌
    const refund = { ty: g.pick(['BEFORE', 'STUDENT', 'DISEASE']), sessIdx: g.int(0, 2), ah: g.int(0, 3), bkRefTy: g.pick(['NONE', 'FULL']), bkRefAmt: 0 };
    const kind = g.pick(['adjust', 'fee', 'override']);
    const amt = g.int(-6, 4) * 10000;
    const ov = g.pick(['B,T', 'T,B', 'T']);
    const edit = () => w.commitState(() => {
        if (kind === 'adjust') other.adjusts.push({ title: '조정', amtT: amt, amtB: 0, amtM: 0 });
        else if (kind === 'fee') w.C[other.course][1].t = Math.max(0, w.C[other.course][1].t + amt);
        else { other.overrideCho3 = ov; other.overrideFree = ov; }
    });
    const doRefund = () => w.commitState(() => {
        w.captureEnrollmentBaseline(target);
        target.refunds.push(refund);
        w.updateFrozenSplit(target);
    });
    w.commitState(() => {});
    if (order === 'A') { edit(); doRefund(); } else { doRefund(); edit(); }
    w.__kind = kind;
    return w;
}

function checkOtherEditPathEquivalence(seed) {
    const snap = w => w.Hs.slice().sort((a, b) => a.c.localeCompare(b.c))
        .map(h => [h.c, h.sT, h.sB, h.tc, h.bc, h.tf, h.bf, h.finT, h.finB]);
    let A, B, kind;
    try { const wa = buildOtherEditScenario(seed, 'A'); kind = wa.__kind; A = snap(wa); B = snap(buildOtherEditScenario(seed, 'B')); }
    catch (err) { return [{ code: 'A9b-실행오류', msg: err.message, ctx: '' }]; }
    if (JSON.stringify(A) === JSON.stringify(B)) return [];
    const selfA = A.reduce((s, r) => s + r[7] + r[8], 0);
    const selfB = B.reduce((s, r) => s + r[7] + r[8], 0);
    return [{ code: 'A9b-다른강좌편집경로', msg: `${kind}: 자부담 총액 편집먼저=${selfA} vs 환불먼저=${selfB}`, ctx: kind }];
}

// ── 단일 시나리오 상세 덤프 (위반 seed 재현용) ───────────────────────────
async function dumpScenario(seed) {
    const w = buildScenario(seed);
    const S = w.SysSet;
    console.log(`=== seed ${seed} ===`);
    console.log(`SysSet: 모드=${S.deductMode} 초3순서=${S.cho3Priority} 자유순서=${S.freePriority}`);
    console.log(`        초3연간=${S.cho3Annual} 상반기캡=${S.cho3H1Cap} 자유연간=${S.freeAnnual} 대상학년=${JSON.stringify(S.cho3Grades)}`);
    console.log(`        마감차수=${JSON.stringify(Object.keys(S.closedSess || {}))}`);
    const V = await checkAll(seed, w);
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
    const bad = V.filter(v => !v.known), known = V.filter(v => v.known);
    console.log(bad.length ? `\n❌ 불변식 위반 ${bad.length}건` : '\n✅ 불변식 위반 없음');
    bad.forEach(v => console.log(`   [${v.code}] ${v.ctx} :: ${v.msg}`));
    if (known.length) {
        console.log(`\n⚠ 주의(알려진 한계) ${known.length}건 — 실패로 세지 않음`);
        known.forEach(v => console.log(`   [${v.code}] ${v.ctx} :: ${v.msg}`));
    }
    return bad.length;
}

// ── 대량 실행 ──────────────────────────────────────────────────────────
async function runFuzz(N, START) {
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
        let V;
        try { V = await checkAll(seed, w); }
        catch (err) { V = [{ code: `검사예외: ${String(err.message).slice(0, 70)}`, msg: err.stack.split('\n')[1] || '', ctx: '' }]; }
        if (V.some(v => !v.known)) failedSeeds++;
        V.forEach(v => {
            if (!byCode.has(v.code)) byCode.set(v.code, { n: 0, seeds: [], sample: '', known: !!v.known });
            const r = byCode.get(v.code);
            r.n++; if (r.seeds.length < 6) r.seeds.push(seed);
            if (!r.sample) r.sample = `${v.ctx} :: ${v.msg}`;
        });
    }

    console.log(`\n=== 정산 엔진 퍼즈 테스트: ${N}건 (seed ${START}~${START + N - 1}), ${((Date.now() - t0) / 1000).toFixed(1)}초 ===`);
    console.log(`위반이 발생한 시나리오: ${failedSeeds} / ${N}${crashed ? `   (엔진 예외 ${crashed}건)` : ''}\n`);
    const print = ([code, r]) => {
        console.log(`[${code}]  ${r.n}건`);
        console.log(`   재현: node test/fuzz-engine.js --seed ${r.seeds[0]}   (다른 seed: ${r.seeds.slice(1).join(', ') || '없음'})`);
        if (r.sample) console.log(`   예시: ${r.sample}`);
        console.log('');
    };
    const all = [...byCode.entries()].sort((a, b) => b[1].n - a[1].n);
    const bad = all.filter(([, r]) => !r.known), known = all.filter(([, r]) => r.known);
    if (!bad.length && !crashed) console.log('✅ 모든 불변식 통과');
    bad.forEach(print);
    if (known.length) {
        console.log('⚠ 주의(알려진 한계) — 실패로 세지 않음. checkServiceInvariants 위 주석 참고\n');
        known.forEach(print);
    }
    return failedSeeds + crashed;
}

// ── CLI ────────────────────────────────────────────────────────────────
if (require.main === module) {
    const args = process.argv.slice(2);
    const si = args.indexOf('--seed');
    const main = si >= 0
        ? dumpScenario(Number(args[si + 1]))
        : runFuzz(Number(args[0]) || 2000, Number(args[1]) || 1);
    main.then(n => { process.exitCode = n ? 1 : 0; });
}

module.exports = { checkOtherEditPathEquivalence, buildOtherEditScenario, buildScenario, checkInvariants, checkOffsetInvariants, checkServiceInvariants, checkBackupRoundTrip, checkAll,
    checkPathEquivalence, dumpScenario, runFuzz };
