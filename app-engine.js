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
        L.fTotal = L.isF ? ((fInfo.transFreeAmt !== undefined) ? fInfo.transFreeAmt : window.BUDGET.FREE_ANNUAL) : 0;
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
        L.isC = L.items.some(it => it.e.g === 3 || it.e.g === '3'); 
        const cTrans = L.items.find(it => it.e.transCho3Amt !== undefined)?.e.transCho3Amt;
        L.cTotal = L.isC ? ((cTrans !== undefined) ? cTrans : window.BUDGET.CHO3_ANNUAL) : 0;
        L.spentC = 0; 
    });

    for (let curQ = 1; curQ <= 4; curQ++) {
       Object.keys(window.Ld).forEach(id => {
            const L = window.Ld[id];

            // 💡 [핵심 버그 픽스] 초3 상반기 캡(Cap) 역산 공식 적용
            // 이전 학교 기사용액 = 50만 원 - 현재 입력된 연간 한도
            let prevUsedCho3 = window.BUDGET.CHO3_ANNUAL - L.cTotal;
            // 1,2분기 한도 = Math.max(0, 25만 원 - 기사용액)
            let curCho3Cap = (curQ <= 2) ? Math.max(0, window.BUDGET.CHO3_H1_CAP - prevUsedCho3) : L.cTotal;
            
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

// 💡 환불이력서용: 환불 건 하나가 초3/자유/자부담 중 어디서 나온 금액인지 3분할 계산.
// 이 엔진은 이벤트를 하나씩 기록하는 방식이 아니라 "현재 상태 전체"를 매번 다시 계산하는
// 구조라, 환불 건 자체에는 예산별 출처가 저장돼 있지 않다. 그래서 "이 환불이 없었다면?"을
// 가정해 해당 등록(enrollment)만 그 환불을 뺀 채로 전체를 한 번 더 계산하고(다른 학생·다른
// 환불은 그대로 둠), 실제(환불 반영) 결과와의 차이를 그 환불액의 예산별 출처로 삼는다.
// 차감은 순서대로 진행되므로 이 환불보다 앞서 처리되는 항목들의 계산은 전혀 바뀌지 않고
// (뒤쪽 항목의 잔여 예산만 바뀜), 그래서 이 차이값은 모호함 없이 정확하다.
window.computeRefundBudgetSplit = function(targetE, targetR) {
    const actualH = window.Hs.find(h => h.e === targetE && h.q === targetE.q);
    if (!actualH || !targetE.refunds) return null;
    const rIdx = targetE.refunds.indexOf(targetR);
    if (rIdx < 0) return null;

    const savedLd = window.Ld, savedHs = window.Hs;
    const removed = targetE.refunds.splice(rIdx, 1)[0];
    let counterH;
    try {
        window.autoRunSet(true);
        counterH = window.Hs.find(h => h.e === targetE && h.q === targetE.q);
    } finally {
        targetE.refunds.splice(rIdx, 0, removed);
        window.Ld = savedLd; window.Hs = savedHs; // 실제 상태 복원 (재계산 없이 그대로 되돌림)
    }
    if (!counterH) return null;

    return {
        cho3T: (counterH.tc || 0) - (actualH.tc || 0), cho3B: (counterH.bc || 0) - (actualH.bc || 0), cho3M: (counterH.mc || 0) - (actualH.mc || 0),
        freeT: (counterH.tf || 0) - (actualH.tf || 0), freeB: (counterH.bf || 0) - (actualH.bf || 0), freeM: (counterH.mf || 0) - (actualH.mf || 0),
        selfT: (counterH.finT || 0) - (actualH.finT || 0), selfB: (counterH.finB || 0) - (actualH.finB || 0), selfM: (counterH.finM || 0) - (actualH.finM || 0)
    };
};