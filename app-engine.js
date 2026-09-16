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

    (e.refunds || []).forEach(r => {
        let rT = 0, rB = 0, rM = 0;
        
        // 1. 수강료 환불 계산 (교재/재료비 로직 분리)
        if (r.ty === 'BEFORE') { 
            rT = base.t; // 개시 전 전액 환불
        } else {
            const bT = window.getSessSplit(base.t, r.sessIdx, mhArr); // 해당 차수의 수강료

            if (r.ty === 'DISEASE') {
                // 결석(일할계산): 마스터 데이터 기반 '단가' 산출 및 올림(Math.ceil) 적용
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
    });

    (e.adjusts || []).forEach(a => {
        if (!a.title.includes('[예외설정]')) { cT += window.num(a.amtT); cB += window.num(a.amtB); cM += window.num(a.amtM || 0); }
    });

    return { t: base.t, b: base.b, m: base.m || 0, cT: Math.max(0, cT), cB: Math.max(0, cB), cM: Math.max(0, cM) };
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

// 이 강좌가 생애 처음 환불을 받기 직전, 라이브 엔진이 계산해둔 분할값을 스냅샷으로 저장한다.
// e.baseline이 이미 있으면 절대 덮어쓰지 않는다(항상 "환불이 하나도 없었을 때" 상태를 대표해야
// 함). 반드시 e.refunds.push(...) 하기 전에 호출해야 한다.
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
        tc: h.tc, bc: h.bc, mc: h.mc || 0,
        tf: h.tf, bf: h.bf, mf: h.mf || 0,
        finT: h.finT, finB: h.finB, finM: h.finM || 0
    };
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

window.autoRunSet = function(skipRender = false) {
    if (!window.SysSet) window.SysSet = {};
    window.Hs = []; window.Ld = {};

    window.E.forEach(e => {
        const id = window.uid(e.g, e.b, e.n, e.name);
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
                const mhArr = (window.C[it.e.course]?.[curQ]?.mh || '4,4,4').split(',').map(Number).filter(x => x > 0);
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
            //      다른 강좌들의 화면 값이 그대로 바뀌는 걸 확인했다. 반면 타겟(rem_tT 등, 이
            //      강좌 자신이 얼마를 라이브 워터폴에서 제외할지)은 frozenSplit 기준이어야
            //      정확히 0이 되어 이 강좌 자신이 워터폴에서 빠진다.
            qItems.forEach(it => {
                const fs = it.e.frozenSplit;
                const bl = it.e.baseline;
                if (fs && bl && it.locked_tT === 0 && it.locked_tB === 0 && it.locked_tM === 0) {
                    L.cB -= (bl.tc + bl.bc + (bl.mc || 0));
                    L.fB -= (bl.tf + bl.bf + (bl.mf || 0));
                    it.locked_tT += fs.tc + fs.tf + fs.finT;
                    it.locked_tB += fs.bc + fs.bf + fs.finB;
                    it.locked_tM += (fs.mc || 0) + (fs.mf || 0) + (fs.finM || 0);
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

            // ---------------------------------------------------------
            // 📜 [헌법 제1, 3조 적용] 초3 지원금 차감 연산
            // ---------------------------------------------------------
            const runCho3Deduction = () => {
                if (!(L.isC && sorted.length > 0 && L.cB > 0)) return;
                if (window.SysSet.deductMode === 'COURSE_FIRST') {
                    sorted.forEach(sc => {
                        let rule = (sc.e.overrideCho3 || window.SysSet.cho3Priority || 'T,B').split(',');
                        rule.forEach(type => {
                            if (type === 'T') { let d = Math.min(L.cB, sc.rem_tT - sc.u_tc - sc.u_tf); sc.u_tc += d; L.cB -= d; }
                            if (type === 'B') { let d = Math.min(L.cB, sc.rem_tB - sc.u_bc - sc.u_bf); sc.u_bc += d; L.cB -= d; }
                            if (type === 'M') { let d = Math.min(L.cB, sc.rem_tM - sc.u_mc - sc.u_mf); sc.u_mc += d; L.cB -= d; }
                        });
                    });
                } else {
                    // 항목 우선(ITEM_FIRST): 각자의 N순위 주머니를 내밀어 동시에 차감
                    for (let step = 0; step < 3; step++) {
                        sorted.forEach(sc => {
                            let rule = (sc.e.overrideCho3 || window.SysSet.cho3Priority || 'T,B').split(',');
                            if (step < rule.length) {
                                let type = rule[step];
                                if (type === 'T') { let d = Math.min(L.cB, sc.rem_tT - sc.u_tc - sc.u_tf); sc.u_tc += d; L.cB -= d; }
                                if (type === 'B') { let d = Math.min(L.cB, sc.rem_tB - sc.u_bc - sc.u_bf); sc.u_bc += d; L.cB -= d; }
                                if (type === 'M') { let d = Math.min(L.cB, sc.rem_tM - sc.u_mc - sc.u_mf); sc.u_mc += d; L.cB -= d; }
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
                            if (type === 'T') { let d = Math.min(L.fB, sc.rem_tT - sc.u_tc - sc.u_tf, sc.freeCeilT - sc.u_tf); sc.u_tf += d; L.fB -= d; }
                            if (type === 'B') { let d = sc.freeBlockBM ? 0 : Math.min(L.fB, sc.rem_tB - sc.u_bc - sc.u_bf); sc.u_bf += d; L.fB -= d; }
                            if (type === 'M') { let d = sc.freeBlockBM ? 0 : Math.min(L.fB, sc.rem_tM - sc.u_mc - sc.u_mf); sc.u_mf += d; L.fB -= d; }
                        });
                    });
                } else {
                    // 항목 우선(ITEM_FIRST): 각자의 N순위 주머니를 내밀어 동시에 차감
                    for (let step = 0; step < 3; step++) {
                        sorted.forEach(sc => {
                            let rule = (sc.e.overrideFree || window.SysSet.freePriority || 'T,B').split(',');
                            if (step < rule.length) {
                                let type = rule[step];
                                if (type === 'T') { let d = Math.min(L.fB, sc.rem_tT - sc.u_tc - sc.u_tf, sc.freeCeilT - sc.u_tf); sc.u_tf += d; L.fB -= d; }
                                if (type === 'B') { let d = sc.freeBlockBM ? 0 : Math.min(L.fB, sc.rem_tB - sc.u_bc - sc.u_bf); sc.u_bf += d; L.fB -= d; }
                                if (type === 'M') { let d = sc.freeBlockBM ? 0 : Math.min(L.fB, sc.rem_tM - sc.u_mc - sc.u_mf); sc.u_mf += d; L.fB -= d; }
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

                        let s_tT = window.getSessSplit(it.cT, sIdx, mhArr);
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