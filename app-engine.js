/* ==========================================================================
   파일닉네임: app-engine.js
   기능설명: [PRO] 코어 규칙(학기당 25만, 100% 이월, 발생주의 순차 차감) 완벽 적용 엔진
   ========================================================================== */
'use strict';

window.getSessSplit = function(tAmt, sIdx, mhArr) {
    if (tAmt === 0) return 0; const isMinus = tAmt < 0; const absAmt = Math.abs(tAmt);
    const totalHours = mhArr.reduce((a, b) => a + b, 0);
    if (totalHours === 0) return 0;
    // 💡 [버그 픽스] mhArr[j]/totalHours를 먼저 나눠 분수를 만든 뒤 absAmt를 곱하면, 그 분수가
    // 이진수로 딱 떨어지지 않을 때(예: 3/11) 부동소수점 오차로 인해 수학적으로는 10원 단위로
    // 정확히 떨어져야 할 값이 근소하게(예: 28500 → 28499.999999999996) 못 미치게 계산되고,
    // 그 상태로 Math.trunc를 하면 실제로는 없는 10원 단위 절사가 생겨버린다(그 10원은 마지막
    // 차수가 고스란히 떠안게 됨). absAmt와 mhArr[j]는 항상 정수이므로, 나눗셈보다 곱셈을
    // 먼저 해서(정수*정수는 항상 오차 없이 정확) 오차 없는 값을 얻은 뒤 마지막에 한 번만
    // 나누면 이 부동소수점 오차를 원천적으로 피할 수 있다.
    if (sIdx === mhArr.length - 1) {
        let pSum = 0;
        for(let j=0; j<sIdx; j++) pSum += Math.trunc((absAmt * mhArr[j] / totalHours)/10)*10;
        const res = absAmt - pSum; return isMinus ? -res : res;
    } else {
        const res = Math.trunc((absAmt * mhArr[sIdx] / totalHours)/10)*10;
        return isMinus ? -res : res;
    }
};

// 💡 자유수강권 강좌별 "지원시점"(F[].courses[강좌명] = {q,s,h}) 반영.
//    override.q보다 이른 분기는 전부 비대상, 이후 분기는 전부 대상, 같은 분기면
//    override.s 이전 차수는 비대상·override.s는 override.h시수째부터 비례 대상.
//    override.endQ/endS(있으면)는 대칭적인 종료 경계 — 육아기근로단축처럼 지원기간이
//    정해진 경우에 사용. 없으면 기존과 동일하게 시작 이후 무기한 대상(하위호환).
window.getFreeSessionEligible = function(sAmt, sIdx, override, curQ, sessHours) {
    if (!override) return sAmt;
    if (override.q > curQ) return 0;
    if (override.q === curQ && sIdx < override.s) return 0;
    if (override.endQ != null) {
        if (override.endQ < curQ) return 0;
        if (override.endQ === curQ && sIdx > override.endS) return 0;
    }
    if (!sessHours) return sAmt;
    let startHour = 1, endHour = sessHours;
    if (override.q === curQ && sIdx === override.s) startHour = Math.min(Math.max(override.h || 1, 1), sessHours);
    if (override.endQ === curQ && sIdx === override.endS) endHour = Math.min(Math.max(override.endH || sessHours, 1), sessHours);
    if (startHour > endHour) return 0;
    // 💡 [버그 픽스] getSessSplit과 동일한 이유로, (endHour-startHour+1)/sessHours를 먼저 나눠
    // 분수를 만든 뒤 곱하지 않고, 정수(sAmt × 대상 시수)를 먼저 곱한 뒤 마지막에 한 번만
    // 나눈다. Math.round라 Math.trunc보다는 오차에 덜 민감하지만, 결과가 10원 단위 경계에
    // 걸리는 조합에서는 이 순서 차이만으로 다른 값이 나올 수 있다.
    return Math.round(sAmt * (endHour - startHour + 1) / sessHours / 10) * 10;
};

// 💡 3D 마스터플랜: 환불/조정 시 재료비(M) 3차원 반영 완료
window.recalcEnrollment = function(e) {
    const base = window.C[e.course]?.[e.q] || {t:0, b:0, m:0, mh:'4,4,4'};
    const mhArr = base.mh.split(',').map(Number);
    let cT = base.t; let cB = base.b; let cM = base.m || 0;

    // 💡 차수별 수강료 청구액(교육비 청구서용) 추적. 원래는 "환불 후 총액을 원래 시수
    // 비율(mhArr)로 통째로 재분배"했는데, 그러면 결석/포기가 실제로 발생하지 않은 다른
    // 차수까지 덩달아 깎이는 버그가 있었다(예: 3차수에 포기해도 이미 정상 수강한 1·2차수
    // 청구액까지 줄어듦). 이제는 원래(환불 전) 차수별 분배값에서 시작해서, 환불이 생길
    // 때마다 "그 환불이 실제로 영향을 주는 차수"에서만 정확히 깎는다.
    let sessionT = mhArr.map((_, i) => window.getSessSplit(base.t, i, mhArr));
    const allSessIdx = sessionT.map((_, i) => i);
    // 💡 [버그 픽스] order는 "이 환불이 우선적으로 영향을 주는 차수"일 뿐, 거기서 반드시 다
    // 빠진다는 보장이 없다. 앞선 환불이 그 차수들을 이미 0원으로 만들어 놨으면 남은 금액이
    // 어느 차수에서도 안 빠지고 증발해서, 분기 청구액은 0원인데 차수별 청구액 합계는 남아
    // 있는 상태가 된다(교육비 청구서에 이미 포기한 강좌 금액이 그대로 찍힘).
    // order를 다 훑고도 남으면 나머지 차수에서 마저 뺀다 — 이미 0인 차수는 어차피 0원만
    // 가져가므로 order가 정상 동작한 경우의 결과는 전혀 바뀌지 않는다.
    const drainSessions = (order, amount) => {
        let rem = amount;
        for (const idx of [...order, ...allSessIdx]) {
            if (rem <= 0) break;
            const take = Math.min(sessionT[idx], rem);
            sessionT[idx] -= take;
            rem -= take;
        }
    };

    (e.refunds || []).forEach(r => {
        let rT = 0, rB = 0, rM = 0;
        
        // 1. 수강료 환불 계산 (교재/재료비 로직 분리)
        if (r.ty === 'BEFORE') { 
            rT = base.t; // 개시 전 전액 환불
        } else {
            const bT = window.getSessSplit(base.t, r.sessIdx, mhArr); // 해당 차수의 수강료

            if (r.ty === 'DISEASE') {
                // 일할계산: 마스터 데이터 기반 '단가' 산출 및 올림(Math.ceil) 적용
                const md = window.M[e.course.replace(/\([A-Z]\)$/, '')]?.[e.q] || {};
                const cUnit = base.unit || md.unit || 1;
                const unitFee = Math.ceil(((md.inst_m || 0) + (md.mgmt_m || 0)) / (cUnit * 4) / 10) * 10;
                rT = Math.ceil((unitFee * r.ah) / 10) * 10;
            } else if (r.ty === 'STUDENT') {
                // 포기(구간합산): 현재 차수 진행률 올림 계산 + 미진행 남은 차수 100% 합산
                if (r.ah === 0) {
                    rT = bT;
                } else {
                    const ratio = r.ah / (mhArr[r.sessIdx] || 4);
                    if (ratio <= 1/3) rT = Math.ceil(bT * (2/3) / 10) * 10;
                    else if (ratio <= 1/2) rT = Math.ceil(bT * (1/2) / 10) * 10;
                    else rT = 0;
                }
                for (let j = r.sessIdx + 1; j < mhArr.length; j++) {
                    rT += window.getSessSplit(base.t, j, mhArr);
                }
            }
        }
        
        // 2. 교재/재료비 환불 계산 (옵션에 따라 독립적으로 완벽 통제)
        if (r.bkRefTy === 'FULL') { 
            rB = cB; 
            rM = cM; 
        } 
        else if (r.bkRefTy === 'MANUAL') { 
            rB = window.num(r.bkRefAmt); 
            rM = window.num(r.bkRefAmtM || 0); 
        } 
        else {
            // 💡 '반환안함' 등 그 외의 모든 경우 강제 0원 처리
            rB = 0; 
            rM = 0; 
        }

        r.rt = Math.min(cT, Math.max(0, rT));
        r.rb = Math.min(cB, Math.max(0, rB));
        r.rm = Math.min(cM, Math.max(0, rM));
        cT -= r.rt; cB -= r.rb; cM -= r.rm;

        // 💡 이 환불이 실제로 영향을 주는 차수(들)에서만 정확히 차감(클램프된 r.rt 기준).
        if (r.ty === 'BEFORE') {
            drainSessions(sessionT.map((_, i) => i), r.rt); // 개시 전 전액 환불 → 앞 차수부터 순서대로 소진
        } else if (r.ty === 'DISEASE') {
            // 결석이 발생한 그 차수에서 우선 차감, 모자라면(드문 경우) 다른 차수에서 순서대로 보충
            drainSessions([r.sessIdx, ...sessionT.map((_, i) => i).filter(i => i !== r.sessIdx)], r.rt);
        } else if (r.ty === 'STUDENT') {
            // 미진행(포기 이후) 차수부터 먼저 0원으로 소진하고, 남으면 포기한 그 차수에서 차감
            const futureOrder = [];
            for (let j = r.sessIdx + 1; j < mhArr.length; j++) futureOrder.push(j);
            drainSessions([...futureOrder, r.sessIdx], r.rt);
        }
    });

    (e.adjusts || []).forEach(a => {
        if (!a.title.includes('[예외설정]')) {
            const amtT = window.num(a.amtT);
            cT += amtT; cB += window.num(a.amtB); cM += window.num(a.amtM || 0);
            // 조정(adjust)은 특정 차수에 묶인 개념이 아니므로, 단순화를 위해 마지막 차수에 반영한다.
            // 💡 [버그 픽스] 예전에는 마지막 차수 하나에만 얹고 Math.max(0, ...)으로 잘랐다.
            // 감액 조정이 마지막 차수 금액보다 크면(예: 마지막 차수 10,920원에 -15,000원 조정)
            // 초과분 4,080원이 그대로 증발해서, 분기 청구액은 25,000원인데 차수별 합계는
            // 29,080원이 되어 교육비 청구서가 과다 청구됐다. 감액은 뒤 차수부터 거슬러 올라가며
            // 실제로 있는 만큼 빼고, 증액은 기존대로 마지막 차수에 얹는다.
            if (amtT > 0 && sessionT.length) sessionT[sessionT.length - 1] += amtT;
            else if (amtT < 0 && sessionT.length) drainSessions(allSessIdx.slice().reverse(), -amtT);
        }
    });

    return { t: base.t, b: base.b, m: base.m || 0, cT: Math.max(0, cT), cB: Math.max(0, cB), cM: Math.max(0, cM), sessionT };
};

// 💡 환불 강좌 격리(baseline/frozenSplit): 한 강좌에 환불이 생겨도 같은 학생의 다른 강좌
// 배분(초3/자유/자부담)은 전혀 건드리지 않기 위한 스냅샷 장치. "마감"(SysSet.closedSess)과는
// 완전히 별개 — 마감은 차수(세션) 전체를 동결하지만, 이건 강좌(enrollment) 자신에게만
// 저장되는 분기-총액 단위 스냅샷이다.

// 환불로 타겟이 줄어들 때 baseline의 어느 버킷부터 뺄지 정한다. core-rules.md 제3조의2가
// 정한 "초3→자유" 충전 순서의 정확한 역순 — 즉 항상 자부담부터 줄고, 그다음이 나중에 채워진
// 지원금(보통 자유수강권, 육아기근로단축 학생은 초3)부터, 맨 마지막에 먼저 채워진 지원금이 줄어든다.
window.getRefundPeelOrder = function(e) {
    const id = window.uid(e.g, e.b, e.n, e.name);
    const fInfo = window.F.find(x => window.uid(x.g, x.b, x.n, x.name) === id);
    const isF = !!fInfo;
    const isC = window.isCho3Grade(e.g);
    const reverse = isC && isF && fInfo.reason === 'CHILDCARE_REDUCED';
    return reverse
        ? { T: ['finT', 'tc', 'tf'], B: ['finB', 'bc', 'bf'], M: ['finM', 'mc', 'mf'] }
        : { T: ['finT', 'tf', 'tc'], B: ['finB', 'bf', 'bc'], M: ['finM', 'mf', 'mc'] };
};

// 💡 baseline이 대표해야 하는 "청구액"의 지문. 환불만 뺀 상태(=조정·요금표는 반영된 상태)의
//    분기 청구액이다. 이 값이 그대로면 baseline을 다시 계산할 필요가 없으므로, 비싼 재포착
//    (recaptureBaseline)을 건너뛰는 판단에 쓴다.
window.baselineChargeKey = function(e) {
    const saved = e.refunds;
    e.refunds = [];
    const r = window.recalcEnrollment(e);
    e.refunds = saved;
    window.recalcEnrollment(e); // 위 호출이 덮어쓴 r.rt/r.rb/r.rm을 원래 환불 기준으로 되돌린다
    return `${r.cT}/${r.cB}/${r.cM}`;
};

// 이 강좌가 생애 처음 환불을 받기 직전, 라이브 엔진이 계산해둔 분할값을 스냅샷으로 저장한다.
// e.baseline이 이미 있으면 절대 덮어쓰지 않는다. 반드시 e.refunds.push(...) 하기 전에 호출한다.
window.captureEnrollmentBaseline = function(e) {
    if (e.baseline) return;
    let h = window.Hs && window.Hs.find(x => x.e === e && x.q === e.q);
    if (!h && typeof window.autoRunSet === 'function') {
        window.autoRunSet(true);
        h = window.Hs.find(x => x.e === e && x.q === e.q);
    }
    if (!h) return; // 방어: 아직 엔진 결과가 없는 비정상 상태면 조용히 skip
    e.baseline = {
        ver: window.BASELINE_VER,
        chg: window.baselineChargeKey(e),
        tc: h.tc, bc: h.bc, mc: h.mc || 0,
        tf: h.tf, bf: h.bf, mf: h.mf || 0,
        finT: h.finT, finB: h.finB, finM: h.finM || 0
    };
};

// ==========================================================================
// 💡 baseline 재포착 (2026-09-17)
//
// [baseline의 정의가 바뀌었다]
//   예전: "이 강좌가 처음 환불을 받기 직전, 화면에 떠 있던 값" — 찍힌 '시점'에 의존했다.
//   지금: "이 강좌에 환불이 없었다면 워터폴에서 받았을 3분할" — 현재 '상태'로만 결정된다.
//
// [왜 바꿨나]
//   환불은 정산 제출 '후'의 사건이라 격리해야 하지만, 조정은 정산 자체의 정정이라 지원금
//   연산에 반영돼야 한다(core-rules.md 제6조). 그런데 baseline이 시점에 의존하면, 조정을
//   환불보다 늦게 넣었을 때 "조정으로 줄어든 금액"까지 baseline에 남아 있게 되고, 그 차액이
//   '환불로 아낀 돈'으로 잘못 분류되어 다음 분기로 이월돼 버린다.
//   실측 결과, 같은 시나리오를 (조정→환불) 순서와 (환불→조정) 순서로 각각 돌렸을 때
//   최종 3분할이 2,000건 중 72%에서 달랐다(자부담 최대 31,000원 차이). 이 함수를 넣은 뒤
//   그 차이가 0%가 됐다 — 즉 "언제 조정했든 같은 값"이 보장된다.
//
// [어떻게]
//   이 강좌의 refunds만 잠시 비운 '반사실(counterfactual) 세계'에서 엔진을 돌리고, 그
//   결과를 baseline으로 삼는다. refunds를 없애는 것이 정의 그 자체이므로 환불을 추가/삭제
//   해도 결과가 같다(멱등). 조정·요금표가 바뀔 때만 값이 움직인다.
//
// ⚠ 비용: 반사실 세계를 위해 autoRunSet을 한 번 더 돌린다. 청구액이 그대로면 chg 지문으로
//   즉시 빠져나가므로 평상시 편집에는 추가 비용이 사실상 없다. 일괄 조정처럼 여러 건이
//   한꺼번에 바뀔 때만 비용이 붙는다(실 데이터 22건 기준 약 230ms).
// ==========================================================================
window.recaptureBaseline = function(e) {
    if (!e.baseline) return;
    const key = window.baselineChargeKey(e);
    if (e.baseline.chg === key) return; // 청구액이 그대로면 baseline도 그대로다

    const savedRefunds = e.refunds;
    const savedFrozen = e.frozenSplit;
    const savedBaseline = e.baseline;

    // 이 강좌에 환불이 없는 세계로 만들어 한 번 돌린다.
    // 이 학생 한 명만 돌리면 충분하다(예산은 학생 단위로 완결돼 있다).
    e.refunds = [];
    delete e.frozenSplit;
    delete e.baseline;
    const stuId = window.uid(e.g, e.b, e.n, e.name);
    window.E.forEach(x => { if (window.uid(x.g, x.b, x.n, x.name) === stuId) window.recalcEnrollment(x); });
    window.autoRunSet(true, stuId);
    const h = window.Hs.find(x => x.e === e && x.q === e.q);

    // 원상 복구 후 새 baseline 반영.
    // ⚠ 키를 넣는 순서가 중요하다. 위에서 delete로 지웠기 때문에 다시 넣으면 객체의 키 순서가
    //   바뀌는데, commitState는 snapshotState()의 JSON 문자열을 비교해 "데이터가 실제로
    //   바뀌었는지"를 판단한다. 값이 같은데 키 순서만 달라져도 변경으로 오인해서, 아무것도
    //   안 고쳤는데 되돌리기 슬롯이 덮어씌워지고 "저장 안 된 변경" 경고가 뜬다.
    //   원래 순서(baseline → frozenSplit)를 그대로 지킨다.
    e.refunds = savedRefunds;
    e.baseline = h ? {
        ver: window.BASELINE_VER,
        chg: key,
        tc: h.tc, bc: h.bc, mc: h.mc || 0,
        tf: h.tf, bf: h.bf, mf: h.mf || 0,
        finT: h.finT, finB: h.finB, finM: h.finM || 0
    } : savedBaseline;
    e.frozenSplit = savedFrozen;   // baseline 다음에 넣어야 원래 키 순서가 유지된다
    // 위에서 refunds를 잠시 비우며 r.rt/rb/rm이 덮어써졌으므로 이 학생 것만 되돌려 놓는다.
    window.E.forEach(x => { if (window.uid(x.g, x.b, x.n, x.name) === stuId) window.recalcEnrollment(x); });
};

// e.baseline + 현재 e.refunds 전체를 바탕으로 e.frozenSplit을 처음부터 다시 계산한다(증분 아님).
// 환불을 추가/삭제할 때마다 이 함수를 다시 호출하면 되고, 별도의 "잠금 해제" 절차는 없다.
// e.refunds가 완전히 비면(순 환불액이 0원이면) baseline/frozenSplit을 둘 다 지워서 그 강좌를
// 완전히 라이브 계산(폭포수 원칙)으로 되돌린다 — 환불이 없는 강좌를 계속 동결해두면, 그 강좌에
// 배정 안 된 지원금이 안 쓰인 채로 남고 자부담만 불필요하게 커지는 실질적 손해가 생기기 때문.
window.updateFrozenSplit = function(e) {
    if (!e.baseline) return;
    if (!e.refunds || e.refunds.length === 0) {
        delete e.baseline;
        delete e.frozenSplit;
        return;
    }
    const base = window.C[e.course]?.[e.q] || { t: 0, b: 0, m: 0 };
    const cur = window.recalcEnrollment(e); // 이 강좌 자신의 refunds/adjusts만으로 순수 계산(타 강좌 무관)
    const dT = Math.max(0, base.t - cur.cT);
    const dB = Math.max(0, base.b - cur.cB);
    const dM = Math.max(0, (base.m || 0) - cur.cM);

    const order = window.getRefundPeelOrder(e);
    const bl = e.baseline;
    const result = {
        tc: bl.tc, bc: bl.bc, mc: bl.mc,
        tf: bl.tf, bf: bl.bf, mf: bl.mf,
        finT: bl.finT, finB: bl.finB, finM: bl.finM
    };
    const peel = (keys, amount) => {
        let rem = amount;
        for (const k of keys) {
            if (rem <= 0) break;
            const take = Math.min(result[k], rem);
            result[k] -= take;
            rem -= take;
        }
    };
    peel(order.T, dT);
    peel(order.B, dB);
    peel(order.M, dM);

    e.frozenSplit = result;
};

// 💡 onlyId: 특정 학생 한 명만 계산하고 싶을 때 그 학생의 uid를 넘긴다.
//    지원금 예산은 학생 단위로 완결돼 있어(core-rules.md 제1조) 학생끼리 서로 영향을 주지
//    않으므로, 한 명만 돌려도 그 학생의 값은 전체를 돌린 것과 똑같이 나온다.
//    baseline 재포착(recaptureBaseline)은 "이 강좌에 환불이 없었다면?"을 알아보려고 엔진을
//    한 번 더 돌리는데, 그때마다 전교생을 계산하면 실 데이터(135명) 기준 22명 일괄 조정에
//    236ms가 들었다. 정작 필요한 건 그 학생 한 명뿐이라 onlyId로 범위를 좁힌다.
//    ⚠ 범위를 좁혀 돌리면 window.Ld/Hs에 그 학생만 남는다. 화면에 쓰기 전에 반드시
//      전체 autoRunSet을 다시 돌려야 한다(recomputeAll이 마지막에 그렇게 하고 있다).
window.autoRunSet = function(skipRender = false, onlyId = null) {
    if (!window.SysSet) window.SysSet = {};
    window.Hs = []; window.Ld = {};

    window.E.forEach(e => {
        const id = window.uid(e.g, e.b, e.n, e.name);
        if (onlyId && id !== onlyId) return;
        if (!window.Ld[id]) window.Ld[id] = { id, dp: window.dsp(e.g, e.b, e.n), nm: e.name, isC: false, isF: false, items: [], qBal: {}, cB: 0, fB: 0 };
        
        const res = window.recalcEnrollment(e);
        window.Ld[id].items.push({ 
            e, bs: res, cT: res.cT, cB: res.cB, cM: res.cM,
            q_tc: 0, q_bc: 0, q_mc: 0, q_tf: 0, q_bf: 0, q_mf: 0,
            finT: 0, finB: 0, finM: 0, sessDetails: {} 
        });
    });

    Object.keys(window.Ld).forEach(id => {
        const L = window.Ld[id];
        
        // 🎟️ 자유수강권
        const fInfo = window.F.find(x => window.uid(x.g, x.b, x.n, x.name) === id);
        L.isF = !!fInfo;
        L.fTotal = L.isF ? ((fInfo.transFreeAmt !== undefined) ? fInfo.transFreeAmt : window.SysSet.freeAnnual) : 0;
        L.spentF = 0;
        L.freeCourses = (fInfo && fInfo.courses) ? fInfo.courses : {}; // 💡 강좌별 지원시점(override)
        // 💡 등록 화면(개별/일괄)에서 지정한 학생 단위 기본 지원시점. 강좌별 override가 없는 강좌는 이 값을 따른다.
        L.fStartQ = fInfo ? (fInfo.startQ || 1) : 1;
        L.fStartSess = fInfo ? (fInfo.startSess || 0) : 0;
        // 💡 자유수강권 구분(사유). '육아기근로시간단축'은 지원기간(종료시점)과 초3/자유 차감순서 역전이 적용됨.
        L.reason = fInfo ? fInfo.reason : undefined;
        L.fEndQ = fInfo ? fInfo.endQ : undefined;
        L.fEndSess = fInfo ? fInfo.endSess : undefined;
        L.fEndHour = fInfo ? fInfo.endHour : undefined;

        // 🧒 초3 지원금
        L.isC = L.items.some(it => window.isCho3Grade(it.e.g));
        const cTrans = L.items.find(it => it.e.transCho3Amt !== undefined)?.e.transCho3Amt;
        L.cTotal = L.isC ? ((cTrans !== undefined) ? cTrans : window.SysSet.cho3Annual) : 0;
        L.spentC = 0; 
    });

    for (let curQ = 1; curQ <= 4; curQ++) {
       Object.keys(window.Ld).forEach(id => {
            const L = window.Ld[id];

            // 💡 [핵심 버그 픽스] 초3 상반기 캡(Cap) 역산 공식 적용
            // 이전 학교 기사용액 = 50만 원 - 현재 입력된 연간 한도
            let prevUsedCho3 = window.SysSet.cho3Annual - L.cTotal;
            // 1,2분기 한도 = Math.max(0, 상반기 한도 - 기사용액)
            let curCho3Cap = (curQ <= 2) ? Math.max(0, window.SysSet.cho3H1Cap - prevUsedCho3) : L.cTotal;
            
            L.cB = Math.max(0, curCho3Cap - L.spentC);
            L.fB = Math.max(0, L.fTotal - L.spentF);

            let qItems = L.items.filter(it => it.e.q === curQ);
            if (qItems.length === 0) { L.qBal[curQ] = { cB: L.cB, fB: L.fB }; return; }

            // (이하 시수 추출 등 로직 유지)
            let maxSess = 0;
            qItems.forEach(it => {
                // 💡 [버그 픽스] 예전에는 여기서 .filter(x => x > 0)으로 0시수 차수를 빼고 길이를
                // 셌다. 그런데 아래 안분 루프는 0을 포함한 원래 배열(mhArr)의 인덱스를 쓰기 때문에,
                // '4,0,4'처럼 중간이 휴강인 강좌는 maxSess가 2로 잡혀 3차수가 통째로 누락됐다.
                // 그 결과 분기 지원금 공제액까지 절반으로 줄고 나머지가 자부담이 되어버린다.
                // (지금은 parseMh가 0 입력을 막지만, 구버전 백업 복구나 손으로 고친 JSON에는
                //  0시수가 들어올 수 있고, 엔진 내부는 firstActive 등 0시수를 전제한 코드가 많다.)
                const mhArr = (window.C[it.e.course]?.[curQ]?.mh || '4,4,4').split(',').map(Number);
                if (mhArr.length > maxSess) maxSess = mhArr.length;
            });
            if (maxSess === 0) maxSess = 1;

            qItems.forEach(it => {
                it.rem_tT = it.cT; it.rem_tB = it.cB; it.rem_tM = it.cM;
                it.u_tc = 0; it.u_bc = 0; it.u_mc = 0;
                it.u_tf = 0; it.u_bf = 0; it.u_mf = 0;
                it.locked_tT = 0; it.locked_tB = 0; it.locked_tM = 0;
                it.q_tc = 0; it.q_bc = 0; it.q_mc = 0;
                it.q_tf = 0; it.q_bf = 0; it.q_mf = 0;

                // 💡 자유수강권 지원시점(override): 수강료는 지원 시작 시점 이전 구간만큼 자유수강권
                //    차감 대상에서 제외한다. 교재비/재료비는 그 분기 첫 유효차수 1시수째(=교재비가
                //    부과되는 시점)에 부과되므로, 지원 시작 시점이 그 시점과 같거나 더 이르면 함께
                //    공제 대상이 되고, 그보다 늦으면(도중 개시) 이미 지난 부과이므로 자부담으로 남는다.
                //    강좌별 override(f.courses)가 없으면, 등록 화면에서 지정한 학생 단위 기본 지원시점(f.startQ/startSess)을 따른다.
                //    육아기근로시간단축(reason)은 시작이 1분기1차수와 같아도 반드시 override가 생성돼야
                //    아래에서 종료 경계(endQ/endS)를 붙일 수 있으므로 hasStudentDefault에 별도로 포함시킨다.
                const hasStudentDefault = L.fStartQ > 1 || L.fStartSess > 0 || L.reason === 'CHILDCARE_REDUCED';
                it.freeOverride = (L.freeCourses && L.freeCourses[it.e.course])
                    || (hasStudentDefault ? { q: L.fStartQ, s: L.fStartSess, h: 1 } : null);
                if (it.freeOverride && L.reason === 'CHILDCARE_REDUCED') {
                    it.freeOverride = { ...it.freeOverride, endQ: L.fEndQ, endS: L.fEndSess, endH: L.fEndHour };
                }
                if (it.freeOverride) {
                    const ov = it.freeOverride;
                    const ovMhArr = (window.C[it.e.course]?.[curQ]?.mh || '4,4,4').split(',').map(Number);
                    const firstActive = ovMhArr.findIndex(h => h > 0);
                    const startsAtOrBeforeBM = (ov.q < curQ)
                        || (ov.q === curQ && (ov.s < firstActive || (ov.s === firstActive && (ov.h || 1) <= 1)));
                    const endsAtOrAfterBM = (ov.endQ == null)
                        || (ov.endQ > curQ)
                        || (ov.endQ === curQ && ov.endS >= firstActive);
                    it.freeBlockBM = !(startsAtOrBeforeBM && endsAtOrAfterBM);
                    it.freeCeilT = ovMhArr.reduce((sum, h, sIdx) => {
                        if (h <= 0) return sum;
                        const sAmt = window.getSessSplit(it.cT, sIdx, ovMhArr);
                        return sum + window.getFreeSessionEligible(sAmt, sIdx, ov, curQ, h);
                    }, 0);
                } else {
                    it.freeBlockBM = false;
                    it.freeCeilT = it.cT;
                }
            });

            // 1. 기(旣) 마감된 차수(Lock)의 금액을 예산과 타겟에서 선공제
            for (let sIdx = 0; sIdx < maxSess; sIdx++) {
                const sessKey = `${curQ}_${sIdx}`;
                if (window.SysSet.closedSess && window.SysSet.closedSess[sessKey]) {
                    qItems.forEach(it => {
                        const lockData = window.SysSet.closedSess[sessKey][`${L.id}_${it.e.course}`];
                        if (lockData) {
                            // 예산(큰 주머니)에서 이미 쓴 돈 빼기
                            L.cB -= (lockData.cho3Amt + lockData.cho3Bk + (lockData.cho3Mt||0));
                            L.fB -= (lockData.freeAmt + lockData.freeBk + (lockData.freeMt||0));
                            
                            // 타겟(작은 주머니)에서 이미 채운 돈 빼기 위해 잠금 합계 누적
                            it.locked_tT += lockData.cho3Amt + lockData.freeAmt + lockData.selfAmt;
                            it.locked_tB += lockData.cho3Bk + lockData.freeBk + lockData.selfBk;
                            it.locked_tM += (lockData.cho3Mt||0) + (lockData.freeMt||0) + (lockData.selfMt||0);
                        }
                    });
                }
            }

            // 1-2. 환불로 frozenSplit이 생긴 등록(분기-총액 단위)의 금액을 예산과 타겟에서 선공제.
            //      위 closedSess 선공제와 같은 패턴이나, 세션이 아니라 강좌 자신(e)에 저장된
            //      값을 쓴다. ⚠ 이미 위에서 closedSess로 선공제된 항목은 절대 다시 빼지 않는다
            //      (이중 차감 방지) — 한 강좌가 "일부 차수는 마감, 동시에 frozenSplit도 있는"
            //      경우, closedSess가 우선 적용되고 frozenSplit은 건너뛴다.
            //      ⚠ [핵심] 예산(L.cB/L.fB)에서는 frozenSplit(환불 후, 줄어든 값)이 아니라
            //      baseline(환불 전, 원래 소비하던 값)을 선공제한다. 그래야 이 강좌가 환불로
            //      덜 쓰게 된 만큼의 "여유분"이 같은 학생의 다른(아직 라이브인) 강좌로 흘러가지
            //      않고, 그대로 예산에 남아 다음 분기로 이월된다 — 이게 "환불 대상 강좌만
            //      건드리고 다른 강좌는 절대 안 건드린다"는 요구사항의 핵심이다. 실제로 직접
            //      실행해본 결과, frozenSplit으로 선공제하면 그 여유분을 살아있는 다른 강좌들이
            //      즉시 흡수해버려서(정상적인 폭포수 동작), 이 강좌 하나만 격리한 효과가 사라지고
            //      다른 강좌들의 화면 값이 그대로 바뀌는 걸 확인했다.
            //
            //      💡 타겟(locked_t*)에는 frozenSplit 전액이 아니라 자부담 몫(finT/finB/finM)만
            //      넣는다. 그래야 "이 강좌가 이미 확정한 금액"만큼만 워터폴에서 빠지고,
            //      조정으로 늘어난 금액은 정상적으로 워터폴에 재진입해 지원금을 받는다
            //      (core-rules.md 제6조: 조정은 정산의 정정이므로 지원금에서 처리한다).
            //      지원금 몫은 u_tc/u_tf에 그대로 선주입해두므로, 청구액이 안 바뀐 강좌는
            //      차감식 `rem_t* - u_*c - u_*f`가 정확히 0이 되어 예전과 동일하게 동작한다.
            //      전액을 넣던 예전 방식에서는 조정 증액분이 baseline을 넘는 순간부터
            //      지원금 잔액이 남아 있어도 전부 자부담으로 떨어졌다.
            qItems.forEach(it => {
                const fs = it.e.frozenSplit;
                const bl = it.e.baseline;
                if (fs && bl && it.locked_tT === 0 && it.locked_tB === 0 && it.locked_tM === 0) {
                    L.cB -= (bl.tc + bl.bc + (bl.mc || 0));
                    L.fB -= (bl.tf + bl.bf + (bl.mf || 0));
                    it.locked_tT += fs.finT;
                    it.locked_tB += fs.finB;
                    it.locked_tM += (fs.finM || 0);
                    it.u_tc = fs.tc; it.u_bc = fs.bc; it.u_mc = fs.mc || 0;
                    it.u_tf = fs.tf; it.u_bf = fs.bf; it.u_mf = fs.mf || 0;
                }
            });

            // 마감액을 제외한 '순수하게 연산해야 할 분기 잔여 타겟' 확정
            qItems.forEach(it => {
                it.rem_tT = Math.max(0, it.rem_tT - it.locked_tT);
                it.rem_tB = Math.max(0, it.rem_tB - it.locked_tB);
                it.rem_tM = Math.max(0, it.rem_tM - it.locked_tM);
            });

            // 공제할 금액이 남아있는 강좌만 추려서 정렬
            let unlockedCourses = qItems.filter(it => it.rem_tT > 0 || it.rem_tB > 0 || it.rem_tM > 0);
            let sorted = [...unlockedCourses].sort((a,b) => (a.e.seq||0) - (b.e.seq||0) || a.e.course.localeCompare(b.e.course));

            // 💡 [버그 픽스] 아래 두 차감 함수의 차감액 d는 반드시 Math.max(0, ...)으로 감싼다.
            //    d의 원래 식은 "min(예산잔액, rem_t? - u_?c - u_?f)"인데, rem_t?에는 이미
            //    locked_t?(= 동결 강좌의 u_?c/u_?f를 포함한 값)가 빠져 있다. 그래서 동결된 강좌가
            //    항목 하나 때문에 워터폴에 다시 들어오면 u_?를 두 번 빼는 셈이 되어 d가 음수가 됐다.
            //    그러면 `sc.u_tc += d`가 이미 배정된 지원금을 도로 벗겨내고, `L.cB -= d`가 예산
            //    잔액을 오히려 늘려서 그 돈이 다른 강좌로 새어 나갔다.
            //    실제 재현: 환불이 있는 강좌의 교재비를 10,000 → 14,000원으로 정정했더니 그 강좌의
            //    초3 공제 70,000원이 4,000원으로 줄고(=자부담 66,000원 증가), 예산 잔액은 거꾸로
            //    66,000원 늘어났다.
            //    "차감 단계는 절대 예산에 돈을 돌려주지 않는다"는 건 무조건 지켜야 할 성질이므로,
            //    원인을 어디서 고치든 이 클램프 자체는 안전장치로 남겨둔다.
            // ---------------------------------------------------------
            // 📜 [헌법 제1, 3조 적용] 초3 지원금 차감 연산
            // ---------------------------------------------------------
            const runCho3Deduction = () => {
                if (!(L.isC && sorted.length > 0 && L.cB > 0)) return;
                if (window.SysSet.deductMode === 'COURSE_FIRST') {
                    sorted.forEach(sc => {
                        let rule = (sc.e.overrideCho3 || window.SysSet.cho3Priority || 'T,B').split(',');
                        rule.forEach(type => {
                            if (type === 'T') { let d = Math.max(0, Math.min(L.cB, sc.rem_tT - sc.u_tc - sc.u_tf)); sc.u_tc += d; L.cB -= d; }
                            if (type === 'B') { let d = Math.max(0, Math.min(L.cB, sc.rem_tB - sc.u_bc - sc.u_bf)); sc.u_bc += d; L.cB -= d; }
                            if (type === 'M') { let d = Math.max(0, Math.min(L.cB, sc.rem_tM - sc.u_mc - sc.u_mf)); sc.u_mc += d; L.cB -= d; }
                        });
                    });
                } else {
                    // 항목 우선(ITEM_FIRST): 각자의 N순위 주머니를 내밀어 동시에 차감
                    for (let step = 0; step < 3; step++) {
                        sorted.forEach(sc => {
                            let rule = (sc.e.overrideCho3 || window.SysSet.cho3Priority || 'T,B').split(',');
                            if (step < rule.length) {
                                let type = rule[step];
                                if (type === 'T') { let d = Math.max(0, Math.min(L.cB, sc.rem_tT - sc.u_tc - sc.u_tf)); sc.u_tc += d; L.cB -= d; }
                                if (type === 'B') { let d = Math.max(0, Math.min(L.cB, sc.rem_tB - sc.u_bc - sc.u_bf)); sc.u_bc += d; L.cB -= d; }
                                if (type === 'M') { let d = Math.max(0, Math.min(L.cB, sc.rem_tM - sc.u_mc - sc.u_mf)); sc.u_mc += d; L.cB -= d; }
                            }
                        });
                    }
                }
            };

            // ---------------------------------------------------------
            // 📜 [헌법 제1, 3조 적용] 자유수강권 차감 연산
            // ---------------------------------------------------------
            const runFreeDeduction = () => {
                if (!(L.isF && sorted.length > 0 && L.fB > 0)) return;
                if (window.SysSet.deductMode === 'COURSE_FIRST') {
                    sorted.forEach(sc => {
                        let rule = (sc.e.overrideFree || window.SysSet.freePriority || 'T,B').split(',');
                        rule.forEach(type => {
                            if (type === 'T') { let d = Math.max(0, Math.min(L.fB, sc.rem_tT - sc.u_tc - sc.u_tf, sc.freeCeilT - sc.u_tf)); sc.u_tf += d; L.fB -= d; }
                            if (type === 'B') { let d = sc.freeBlockBM ? 0 : Math.max(0, Math.min(L.fB, sc.rem_tB - sc.u_bc - sc.u_bf)); sc.u_bf += d; L.fB -= d; }
                            if (type === 'M') { let d = sc.freeBlockBM ? 0 : Math.max(0, Math.min(L.fB, sc.rem_tM - sc.u_mc - sc.u_mf)); sc.u_mf += d; L.fB -= d; }
                        });
                    });
                } else {
                    // 항목 우선(ITEM_FIRST): 각자의 N순위 주머니를 내밀어 동시에 차감
                    for (let step = 0; step < 3; step++) {
                        sorted.forEach(sc => {
                            let rule = (sc.e.overrideFree || window.SysSet.freePriority || 'T,B').split(',');
                            if (step < rule.length) {
                                let type = rule[step];
                                if (type === 'T') { let d = Math.max(0, Math.min(L.fB, sc.rem_tT - sc.u_tc - sc.u_tf, sc.freeCeilT - sc.u_tf)); sc.u_tf += d; L.fB -= d; }
                                if (type === 'B') { let d = sc.freeBlockBM ? 0 : Math.max(0, Math.min(L.fB, sc.rem_tB - sc.u_bc - sc.u_bf)); sc.u_bf += d; L.fB -= d; }
                                if (type === 'M') { let d = sc.freeBlockBM ? 0 : Math.max(0, Math.min(L.fB, sc.rem_tM - sc.u_mc - sc.u_mf)); sc.u_mf += d; L.fB -= d; }
                            }
                        });
                    }
                }
            };

            // 💡 육아기근로시간단축 대상 초3 학생은 예외적으로 자유수강권을 초3이용권보다 먼저 소진한다.
            const reverseOrder = L.isC && L.isF && L.reason === 'CHILDCARE_REDUCED';
            if (reverseOrder) { runFreeDeduction(); runCho3Deduction(); }
            else { runCho3Deduction(); runFreeDeduction(); }

            // ---------------------------------------------------------
            // 📜 [헌법 제2조 적용] 연산 완료된 총액을 차수(Session)별로 안분
            // ---------------------------------------------------------
            for (let sIdx = 0; sIdx < maxSess; sIdx++) {
                const sessKey = `${curQ}_${sIdx}`;
                const isLocked = window.SysSet.closedSess && window.SysSet.closedSess[sessKey];

                qItems.forEach(it => {
                    if (isLocked) {
                        // 마감된 차수는 기존 데이터를 그대로 화면에 복원
                        const lockData = window.SysSet.closedSess[sessKey][`${L.id}_${it.e.course}`];
                        if (lockData) {
                            it.sessDetails[sIdx] = {
                                tT: lockData.cho3Amt + lockData.freeAmt + lockData.selfAmt, 
                                tB: lockData.cho3Bk + lockData.freeBk + lockData.selfBk, 
                                tM: (lockData.cho3Mt||0) + (lockData.freeMt||0) + (lockData.selfMt||0),
                                tc: lockData.cho3Amt, bc: lockData.cho3Bk, mc: (lockData.cho3Mt||0), 
                                tf: lockData.freeAmt, bf: lockData.freeBk, mf: (lockData.freeMt||0),
                                finT: lockData.selfAmt, finB: lockData.selfBk, finM: (lockData.selfMt||0), 
                                remCho3: Math.max(0, L.cB), remFree: Math.max(0, L.fB)
                            };
                            // 결과 누적
                            it.q_tc += lockData.cho3Amt; it.q_bc += lockData.cho3Bk; it.q_mc += (lockData.cho3Mt||0);
                            it.q_tf += lockData.freeAmt; it.q_bf += lockData.freeBk; it.q_mf += (lockData.freeMt||0);
                        } else {
                            it.sessDetails[sIdx] = { tT:0, tB:0, tM:0, tc:0, bc:0, mc:0, tf:0, bf:0, mf:0, finT:0, finB:0, finM:0, remCho3: Math.max(0, L.cB), remFree: Math.max(0, L.fB) };
                        }
                    } else {
                        // 열려있는 차수는 분기 공제액(u_tc 등)을 가져와서 채워 넣음
                        const mhArr = (window.C[it.e.course]?.[curQ]?.mh || '4,4,4').split(',').map(Number);
                        if (sIdx >= mhArr.length) return; // 범위를 넘으면 무시

                        // 💡 차수별 청구액은 recalcEnrollment가 환불별로 정확히 추적해둔 sessionT를
                        //    그대로 쓴다(총액을 원래 시수 비율로 재분배하면, 결석/포기하지 않은
                        //    다른 차수까지 덩달아 깎이는 버그가 있었음 — 교육비 청구서 오류 신고로 발견).
                        let s_tT = (it.bs.sessionT && it.bs.sessionT[sIdx] !== undefined) ? it.bs.sessionT[sIdx] : window.getSessSplit(it.cT, sIdx, mhArr);
                        const firstActive = mhArr.findIndex(h => h > 0);
                        let s_tB = (sIdx === firstActive) ? it.cB : 0;
                        let s_tM = (sIdx === firstActive) ? (it.cM || 0) : 0;

                        // 엔진이 확정한 분기 차감액(u_tc/u_tf 등)에서 현재 차수의 몫만큼만 덜어옴.
                        // 💡 지원시점(override) 반영: 자유수강권(tf)은 차수별 대상 여부 제약(sessFreeElig)이
                        //    있고 초3(tc)은 그런 제약이 없으므로, 제약이 있는 tf를 먼저 그 차수 한도만큼
                        //    배정한 뒤 tc가 나머지를 채우도록 한다. (반대 순서로 하면, 예를 들어 육아기
                        //    근로단축처럼 자유수강권 대상 구간이 분기 중간에 끝나는 경우 tc가 앞 차수를
                        //    먼저 다 차지해버려 뒤 차수의 tf가 갈 곳을 잃고, 분기 예산에서는 이미 빠졌는데
                        //    화면상 그 차수는 자부담으로 표시되는 회계 불일치가 생긴다.)
                        const sessFreeElig = window.getFreeSessionEligible(s_tT, sIdx, it.freeOverride, curQ, mhArr[sIdx]);
                        let s_tf = Math.min(s_tT, sessFreeElig, it.u_tf); it.u_tf -= s_tf;
                        let s_bf = it.freeBlockBM ? 0 : Math.min(s_tB, it.u_bf); it.u_bf -= s_bf;
                        let s_mf = it.freeBlockBM ? 0 : Math.min(s_tM, it.u_mf); it.u_mf -= s_mf;

                        let s_tc = Math.min(s_tT - s_tf, it.u_tc); it.u_tc -= s_tc;
                        let s_bc = Math.min(s_tB - s_bf, it.u_bc); it.u_bc -= s_bc;
                        let s_mc = Math.min(s_tM - s_mf, it.u_mc); it.u_mc -= s_mc;

                        it.sessDetails[sIdx] = {
                            tT: s_tT, tB: s_tB, tM: s_tM,
                            tc: s_tc, bc: s_bc, mc: s_mc,
                            tf: s_tf, bf: s_bf, mf: s_mf,
                            finT: s_tT - s_tc - s_tf, finB: s_tB - s_bc - s_bf, finM: s_tM - s_mc - s_mf,
                            remCho3: Math.max(0, L.cB), remFree: Math.max(0, L.fB)
                        };

                        // 화면 출력용 최종 누적치 갱신
                        it.q_tc += s_tc; it.q_bc += s_bc; it.q_mc += s_mc;
                        it.q_tf += s_tf; it.q_bf += s_bf; it.q_mf += s_mf;
                    }
                });
            }

            // 분기 연산이 끝난 후, 이번 분기에 실제로 차감된(쓰인) 총액을 누적 지출액(spent)에 더해줌
            let spentC_thisQ = 0; let spentF_thisQ = 0;
            qItems.forEach(it => {
                spentC_thisQ += (it.q_tc + it.q_bc + it.q_mc);
                spentF_thisQ += (it.q_tf + it.q_bf + it.q_mf);
            });
            L.spentC += spentC_thisQ;
            L.spentF += spentF_thisQ;

            L.qBal[curQ] = { cB: L.cB, fB: L.fB };
			
            qItems.forEach(it => {
                it.finT = it.cT - it.q_tc - it.q_tf;
                it.finB = it.cB - it.q_bc - it.q_bf;
                it.finM = it.cM - it.q_mc - it.q_mf;

                let fBadge = '';
                if (L.isF && L.reason === 'CHILDCARE_REDUCED') fBadge = `<span class="badge badge-childcare">육아</span>`;
                else if (L.isF) fBadge = `<span class="badge badge-free">자유</span>`;
                else if (L.isC) fBadge = `<span class="badge badge-cho3">초3</span>`;
                else fBadge = `<span class="badge bg-light text-secondary border">일반</span>`;

                window.Hs.push({
                    q: curQ, id: L.id, dp: L.dp, nm: L.nm, c: it.e.course, e: it.e,
                    origT: it.bs.t, origB: it.bs.b, origM: it.bs.m, sT: it.cT, sB: it.cB, sM: it.cM,
                    tc: it.q_tc, bc: it.q_bc, mc: it.q_mc, tf: it.q_tf, bf: it.q_bf, mf: it.q_mf,
                    finT: it.finT, finB: it.finB, finM: it.finM, isC: L.isC, isF: L.isF,
                    fBadge, sessDetails: it.sessDetails
                });
            });
        });
    }

    if (!skipRender && window.renderSetTabs) window.renderSetTabs();
};

// 💡 baseline/frozenSplit이 있는 강좌용: baseline에 refunds[0..idx]까지만 순서대로 peel한
// 결과를 돌려준다. updateFrozenSplit과 동일한 peel-off 규칙을 그대로 재사용 — 두 스냅샷의
// 차이를 보면 "그 구간의 환불들이 어디서 나왔는지"를 바로 알 수 있다(아래에서 활용).
window.peelBaselineUpTo = function(e, refunds) {
    const order = window.getRefundPeelOrder(e);
    const bl = e.baseline;
    const result = { tc: bl.tc, bc: bl.bc, mc: bl.mc, tf: bl.tf, bf: bl.bf, mf: bl.mf, finT: bl.finT, finB: bl.finB, finM: bl.finM };
    const peel = (keys, amount) => {
        let rem = amount;
        for (const k of keys) {
            if (rem <= 0) break;
            const take = Math.min(result[k], rem);
            result[k] -= take;
            rem -= take;
        }
    };
    refunds.forEach(r => {
        peel(order.T, r.rt || 0);
        peel(order.B, r.rb || 0);
        peel(order.M, r.rm || 0);
    });
    return result;
};

// 💡 환불이력서용: 환불 건 하나가 초3/자유/자부담 중 어디서 나온 금액인지 3분할 계산.
//
// [frozenSplit이 있는 강좌] baseline에서 이 환불 "직전까지"와 "이 환불까지" 각각 peel한
// 두 스냅샷의 차이가 곧 이 환불 하나의 출처다. 다른 강좌를 전혀 계산할 필요가 없다.
//
// [frozenSplit이 없는(아직 라이브인) 강좌] 예전 방식 그대로 유지: 이벤트 소싱이 아니라
// "현재 상태 전체"를 매번 다시 계산하는 구조라 환불 건 자체엔 출처가 저장돼 있지 않으므로,
// "이 환불이 없었다면?"을 가정해 해당 등록만 그 환불을 뺀 채로 한 번 더 계산하고(다른
// 학생·다른 환불은 그대로 둠) 실제 결과와의 차이를 출처로 삼는다.
// ⚠ [주의] 이 방식은 targetE에 frozenSplit이 있으면 절대 쓰면 안 된다 — 환불을 잠깐 빼도
// frozenSplit이 그대로 남아있어 "환불 없음"이 반영되지 않고, 엔진이 stale한 frozenSplit
// 기준으로 어중간하게(타겟의 일부만 라이브 워터폴에 재진입) 계산해버려 말이 안 되는 값이
// 나온다(실측으로 확인됨) — 그래서 위에서 frozenSplit 여부로 분기한다.
window.computeRefundBudgetSplit = function(targetE, targetR) {
    const rIdx = (targetE.refunds || []).indexOf(targetR);
    if (rIdx < 0) return null;

    if (targetE.baseline && targetE.frozenSplit) {
        const before = window.peelBaselineUpTo(targetE, targetE.refunds.slice(0, rIdx));
        const after = window.peelBaselineUpTo(targetE, targetE.refunds.slice(0, rIdx + 1));
        return {
            cho3T: before.tc - after.tc, cho3B: before.bc - after.bc, cho3M: before.mc - after.mc,
            freeT: before.tf - after.tf, freeB: before.bf - after.bf, freeM: before.mf - after.mf,
            selfT: before.finT - after.finT, selfB: before.finB - after.finB, selfM: before.finM - after.finM
        };
    }

    const actualH = window.Hs.find(h => h.e === targetE && h.q === targetE.q);
    if (!actualH) return null;

    const savedLd = window.Ld, savedHs = window.Hs;
    const removed = targetE.refunds.splice(rIdx, 1)[0];
    let counterH;
    try {
        window.autoRunSet(true);
        counterH = window.Hs.find(h => h.e === targetE && h.q === targetE.q);
    } finally {
        targetE.refunds.splice(rIdx, 0, removed);
        window.Ld = savedLd; window.Hs = savedHs; // 실제 상태 복원 (재계산 없이 그대로 되돌림)
        // ⚠ 위 autoRunSet은 recalcEnrollment를 거치며 각 환불 객체의 r.rt/r.rb/r.rm을 덮어쓴다.
        //   환불을 도로 끼워 넣기만 하면, 남은 환불들의 금액이 "이 환불이 없던 세계"의 값인 채로
        //   남는다(누적 상한이 달라지기 때문). 그 상태에서 사용자가 [백업]을 누르면 틀린 금액이
        //   JSON에 박제되므로, 복원된 refunds 기준으로 반드시 다시 계산해준다.
        //   (Ld/Hs는 위에서 참조로 되돌렸으므로 recalcEnrollment만으로 충분하다.)
        window.E.forEach(x => window.recalcEnrollment(x));
    }
    if (!counterH) return null;

    return {
        cho3T: (counterH.tc || 0) - (actualH.tc || 0), cho3B: (counterH.bc || 0) - (actualH.bc || 0), cho3M: (counterH.mc || 0) - (actualH.mc || 0),
        freeT: (counterH.tf || 0) - (actualH.tf || 0), freeB: (counterH.bf || 0) - (actualH.bf || 0), freeM: (counterH.mf || 0) - (actualH.mf || 0),
        selfT: (counterH.finT || 0) - (actualH.finT || 0), selfB: (counterH.finB || 0) - (actualH.finB || 0), selfM: (counterH.finM || 0) - (actualH.finM || 0)
    };
};

// 💡 이월 안내 뱃지용: 이 학생의 이 분기에서, frozenSplit이 baseline보다 적게 쓴(=환불로
// 아낀) 금액의 합계. 지원금 잔액엔 즉시 안 뜨고 다음 분기 시작 잔액에 반영되므로("다음 분기로
// 이월"), 화면에서 "잔액 0인데 왜 자부담이 있지?" 당황하지 않도록 별도로 안내해준다.
window.getCarryForwardAmount = function(L, q) {
    let cho3 = 0, free = 0;
    (L.items || []).forEach(it => {
        if (it.e.q !== q || !it.e.baseline || !it.e.frozenSplit) return;
        const bl = it.e.baseline, fs = it.e.frozenSplit;
        cho3 += (bl.tc + bl.bc + (bl.mc || 0)) - (fs.tc + fs.bc + (fs.mc || 0));
        free += (bl.tf + bl.bf + (bl.mf || 0)) - (fs.tf + fs.bf + (fs.mf || 0));
    });
    return { cho3, free };
};
// ==========================================================================
// 💡 지원금 한도 초과 감지 (2026-09-17 추가)
//
// [왜 필요한가]
// 마감(SysSet.closedSess)된 차수와 환불로 동결(frozenSplit)된 강좌의 금액은 "이미 확정된
// 회계"라서 엔진이 무조건 그대로 재생한다. 그런데 마감·동결 이후에 강좌 요금표를 고치거나
// 조정을 넣으면, 그 확정 금액이 학생의 연간 한도를 넘겨버릴 수 있다.
//
// 이때 "한도에 맞춰 잘라내기"와 "확정 금액 그대로 두기"는 서로 맞바꿀 수 없는 선택이다.
// 잘라내면 이미 마감한 분기의 숫자가 나중에 소리 없이 바뀌고, 그대로 두면 교육청에 과다
// 청구가 된다. 어느 쪽도 시스템이 혼자 정할 문제가 아니라서, 엔진은 금액을 건드리지 않고
// "넘었다"는 사실만 알려준다. 자르는 판단은 사람이 한다.
//
// autoRunSet이 끝난 뒤(= window.Hs / window.Ld가 채워진 상태) 호출해야 한다.
// ==========================================================================
window.getBudgetOverruns = function() {
    const out = [];
    if (!window.Ld || !window.Hs) return out;

    Object.values(window.Ld).forEach(L => {
        const rows = window.Hs.filter(h => h.id === L.id);
        if (rows.length === 0) return;

        const usedC = rows.reduce((a, h) => a + h.tc + h.bc + (h.mc || 0), 0);
        const usedF = rows.reduce((a, h) => a + h.tf + h.bf + (h.mf || 0), 0);

        // 이 학생이 어느 분기에서 넘겼는지 짚어줘야 사용자가 바로 찾아갈 수 있다.
        const quarters = [...new Set(rows.filter(h => h.tc || h.bc || h.mc || h.tf || h.bf || h.mf).map(h => h.q))].sort();
        // 원인 후보: 마감된 차수가 있는 분기 / 동결된(환불) 강좌
        const lockedQs = quarters.filter(q => window.isQuarterLocked && window.isQuarterLocked(q));
        const frozenCourses = rows.filter(h => h.e && h.e.frozenSplit).map(h => `${h.q}분기 ${h.c}`);

        const push = (kind, used, cap) => out.push({
            id: L.id, dp: L.dp, nm: L.nm, kind, used, cap, over: used - cap,
            quarters, lockedQs, frozenCourses,
        });

        if (L.isC && usedC > L.cTotal) push('초3지원금(연간)', usedC, L.cTotal);
        if (L.isF && usedF > L.fTotal) push('자유수강권(연간)', usedF, L.fTotal);

        // 초3 상반기(1~2분기) 한도. 전학생 이관액이 있으면 그만큼 상반기 한도도 줄어든다.
        if (L.isC) {
            const usedH1 = rows.filter(h => h.q <= 2).reduce((a, h) => a + h.tc + h.bc + (h.mc || 0), 0);
            const prevUsed = (window.SysSet.cho3Annual ?? window.BUDGET.CHO3_ANNUAL) - L.cTotal;
            const capH1 = Math.max(0, (window.SysSet.cho3H1Cap ?? window.BUDGET.CHO3_H1_CAP) - prevUsed);
            if (usedH1 > capH1) push('초3지원금(상반기)', usedH1, capH1);
        }
    });

    return out.sort((a, b) => b.over - a.over);
};

// ==========================================================================
// 💡 파급효과(side effect) 감지 (2026-09-17 추가)
//
// 조정은 지원금 연산에 반영되므로(core-rules.md 제6조 2항), 예산이 이미 소진된 학생에게
// 뒤늦은 조정을 넣으면 **같은 학생의 다른 강좌**가 받던 지원금을 끌어와 쓰게 된다.
// 금액 자체는 맞다 — 예산이 유한하니 누군가는 자부담이 되고, 조정을 제때 했더라도
// 똑같이 났을 결과다. 문제는 그 다른 강좌가 **이미 행정실에 제출한 건일 수 있다**는 것이다.
//
// 그래서 금액을 막지는 않고, "이번 편집으로 당신이 건드리지 않은 강좌도 바뀌었다"는
// 사실을 알려줘서 담당자가 재제출 여부를 판단할 수 있게 한다.
//
// 쓰는 법: 편집 직전에 captureSplitSnapshot()으로 찍어두고, commitState 직후에
//          diffSplitSnapshot(찍은것, [직접 건드린 등록들])으로 비교한다.
// ==========================================================================
window.captureSplitSnapshot = function() {
    const snap = new Map();
    (window.Hs || []).forEach(h => {
        snap.set(h.e, { q: h.q, c: h.c, nm: h.nm, dp: h.dp, id: h.id,
            tc: h.tc, bc: h.bc, mc: h.mc || 0, tf: h.tf, bf: h.bf, mf: h.mf || 0,
            finT: h.finT, finB: h.finB, finM: h.finM || 0 });
    });
    return snap;
};

// before 스냅샷과 현재 상태를 비교해, 직접 건드리지 않았는데 금액이 바뀐 등록만 돌려준다.
window.diffSplitSnapshot = function(before, touchedEnrollments = []) {
    const touched = new Set(touchedEnrollments);
    const out = [];
    (window.Hs || []).forEach(h => {
        if (touched.has(h.e)) return;          // 사용자가 의도적으로 건드린 강좌는 제외
        const b = before.get(h.e);
        if (!b) return;                        // 새로 생긴 등록은 비교 대상 아님
        const cho3Before = b.tc + b.bc + b.mc;
        const cho3After = h.tc + h.bc + (h.mc || 0);
        const freeBefore = b.tf + b.bf + b.mf;
        const freeAfter = h.tf + h.bf + (h.mf || 0);
        const selfBefore = b.finT + b.finB + b.finM;
        const selfAfter = h.finT + h.finB + (h.finM || 0);
        if (cho3Before === cho3After && freeBefore === freeAfter && selfBefore === selfAfter) return;
        out.push({
            q: h.q, c: h.c, nm: h.nm, dp: h.dp,
            cho3: { before: cho3Before, after: cho3After },
            free: { before: freeBefore, after: freeAfter },
            self: { before: selfBefore, after: selfAfter },
        });
    });
    return out;
};

// ==========================================================================
// 💡 가상 실행(dry run) 지원: 동결 상태 저장/복원 (2026-09-17)
//
// 4스텝의 "조정 미리보기"는 조정을 실제로 넣어 계산해본 뒤 도로 빼는 방식이다.
// 그런데 recomputeAll()만으로는 e.baseline이 정확히 원래대로 돌아오지 않는다 —
// recaptureBaseline은 청구액 지문(chg)이 같으면 재계산을 건너뛰는데, 그 지문은
// '이 강좌 자신의 청구액'만 담고 있어서 "같은 학생의 다른 강좌가 바뀌어 baseline이
// 달라져야 하는 경우"를 알아채지 못한다. 그래서 가상 실행이 강제로 재계산을 한 번
// 일으키면, 되돌린 뒤에도 그 재계산 결과가 남아버린다.
//
// 지문을 학생 전체로 넓히는 방법도 있지만, 매 편집마다 비용이 커진다. 가상 실행은
// 어차피 "잠깐 해보고 무조건 되돌리는" 용도이므로, 동결 스냅샷을 그대로 붙잡아 뒀다가
// 되돌리는 쪽이 싸고 확실하다.
//
// ⚠ 키 순서까지 원래대로 맞춘다. commitState가 snapshotState()의 JSON 문자열을 비교해
//   "데이터가 실제로 바뀌었는지"를 판단하기 때문에, 값이 같아도 순서가 다르면 변경으로
//   오인해서 되돌리기 슬롯이 덮어씌워지고 "저장 안 된 변경" 경고가 뜬다.
// ==========================================================================
window.snapshotFrozenState = function() {
    return window.E.map(e => ({ e, baseline: e.baseline, frozenSplit: e.frozenSplit }));
};

window.restoreFrozenState = function(snap) {
    snap.forEach(s => {
        delete s.e.baseline;
        delete s.e.frozenSplit;
        if (s.baseline !== undefined) s.e.baseline = s.baseline;
        if (s.frozenSplit !== undefined) s.e.frozenSplit = s.frozenSplit;
    });
};

// ==========================================================================
// 💡 계산 결과 지문(fingerprint)과 변경 감지 (2026-09-17 추가)
//
// [왜 필요한가]
// 이 시스템은 껍데기(HTML/JS)만 웹에 올려두고 장부는 각자 브라우저에 두는 구조다.
// 그래서 사용자가 접속할 때마다 "그 순간 배포돼 있는 엔진"으로 장부를 처음부터 다시
// 계산한다. 화면의 금액은 저장된 값이 아니라 매번 새로 유도되는 값이다.
//
// 문제는 여기서 생긴다. 원자료(C/M/F/E/SysSet)를 하나도 안 건드려도, 엔진이 바뀌면
// 어제 본 금액과 오늘 본 금액이 달라질 수 있다. 그런데 사용자는 그 사실조차 모른다.
// 이미 행정실에 제출한 숫자와 화면 숫자가 어긋나 있어도 알 방법이 없다.
//
// [어떻게]
// 저장할 때마다 "사용자가 방금 본 계산 결과"를 지문으로 함께 저장해두고, 앱을 열 때
// 현재 엔진으로 다시 계산한 결과와 대조한다. 다르면 무엇이 얼마나 달라졌는지 보고한다.
//
// ⚠ 버전 번호만 비교하면 안 된다. 업데이트 대부분은 화면만 바뀌는데 그때마다 경고를
//   띄우면 사람이 경고 자체를 무시하게 된다. 실제 '금액'이 달라졌을 때만 알려야 한다.
// ⚠ 사용자가 직접 데이터를 고치면 저장 시점에 지문도 같이 갱신되므로 경고가 뜨지 않는다.
//   데이터를 안 건드렸는데 금액이 달라진 경우 = 엔진이 바뀐 경우에만 걸린다.
//
// 마감(closedSess)된 차수는 애초에 스냅샷을 재생하므로 엔진이 바뀌어도 금액이 고정이다.
// 즉 "제출했으면 마감한다"가 가장 확실한 예방이고, 이 기능은 그 그물을 빠져나간 것을
// 잡는 안전망이다.
// ==========================================================================

// 현재 화면에 떠 있는 계산 결과를 압축해 기록한다. autoRunSet 직후에 호출해야 한다.
window.captureComputedFingerprint = function() {
    const rows = {};
    (window.Hs || []).forEach(h => {
        rows[`${h.q}|${h.id}|${h.c}`] = [
            h.tc, h.bc, h.mc || 0,
            h.tf, h.bf, h.mf || 0,
            h.finT, h.finB, h.finM || 0,
        ];
    });
    return { ver: window.APP_VERSION || '', at: new Date().toISOString(), rows };
};

// 저장된 지문과 현재 결과를 대조해, 금액이 달라진 행만 돌려준다.
// 등록 자체가 새로 생기거나 사라진 것은 사용자가 한 일이므로 변경으로 보지 않는다
// (그런 편집을 하면 저장 시점에 지문이 갱신된다).
window.diffComputedFingerprint = function(saved, current) {
    const out = [];
    if (!saved || !saved.rows || !current || !current.rows) return out;
    const label = { 0: '초3 수강료', 1: '초3 교재비', 2: '초3 재료비',
                    3: '자유 수강료', 4: '자유 교재비', 5: '자유 재료비',
                    6: '자부담 수강료', 7: '자부담 교재비', 8: '자부담 재료비' };

    Object.keys(current.rows).forEach(key => {
        const a = saved.rows[key];
        const b = current.rows[key];
        if (!a) return;                                   // 새로 생긴 등록 → 비교 대상 아님
        if (a.length === b.length && a.every((v, i) => v === b[i])) return;

        const [q, id, course] = key.split('|');
        const h = (window.Hs || []).find(x => `${x.q}|${x.id}|${x.c}` === key);
        const fields = [];
        b.forEach((v, i) => { if (a[i] !== v) fields.push({ name: label[i], before: a[i], after: v }); });
        out.push({
            key, q: +q, id, course,
            dp: h ? h.dp : id.split('-').slice(0, 3).join('-'),
            nm: h ? h.nm : id.split('-').slice(3).join('-'),
            before: a, after: b, fields,
            cho3Delta: (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2]),
            freeDelta: (b[3] + b[4] + b[5]) - (a[3] + a[4] + a[5]),
            selfDelta: (b[6] + b[7] + b[8]) - (a[6] + a[7] + a[8]),
        });
    });

    // 금액 변동이 큰 순으로 — 사용자가 먼저 봐야 할 것이 위로 온다.
    return out.sort((x, y) => Math.abs(y.selfDelta) - Math.abs(x.selfDelta) || x.q - y.q);
};
