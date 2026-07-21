/* ==========================================================================
   파일닉네임: app-engine.js
   기능설명: [PRO] 코어 규칙(학기당 25만, 100% 이월, 발생주의 순차 차감) 완벽 적용 엔진
   ========================================================================== */
'use strict';

window.getSessSplit = function(tAmt, sIdx, mhArr) {
    if (tAmt === 0) return 0; const isMinus = tAmt < 0; const absAmt = Math.abs(tAmt);
    const totalHours = mhArr.reduce((a, b) => a + b, 0);
    if (totalHours === 0) return 0;
    if (sIdx === mhArr.length - 1) {
        let pSum = 0;
        for(let j=0; j<sIdx; j++) pSum += Math.trunc((absAmt * (mhArr[j]/totalHours))/10)*10;
        const res = absAmt - pSum; return isMinus ? -res : res;
    } else {
        const res = Math.trunc((absAmt * (mhArr[sIdx]/totalHours))/10)*10;
        return isMinus ? -res : res;
    }
};

// 💡 자유수강권 강좌별 "지원시점"(F[].courses[강좌명] = {q,s,h}) 반영.
//    override.q보다 이른 분기는 전부 비대상, 이후 분기는 전부 대상, 같은 분기면
//    override.s 이전 차수는 비대상·override.s는 override.h시수째부터 비례 대상.
window.getFreeSessionEligible = function(sAmt, sIdx, override, curQ, sessHours) {
    if (!override) return sAmt;
    if (override.q > curQ) return 0;
    if (override.q < curQ) return sAmt;
    if (sIdx < override.s) return 0;
    if (sIdx > override.s) return sAmt;
    if (!sessHours) return sAmt;
    const startHour = Math.min(Math.max(override.h || 1, 1), sessHours);
    const eligFrac = (sessHours - startHour + 1) / sessHours;
    return Math.round(sAmt * eligFrac / 10) * 10;
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

                // 💡 자유수강권 지원시점(override): 설정된 강좌는 교재비/재료비를 항상 자부담으로 두고,
                //    수강료는 지원 시작 시점 이전 구간만큼을 자유수강권 차감 대상에서 제외한다.
                //    강좌별 override(f.courses)가 없으면, 등록 화면에서 지정한 학생 단위 기본 지원시점(f.startQ/startSess)을 따른다.
                const hasStudentDefault = L.fStartQ > 1 || L.fStartSess > 0;
                it.freeOverride = (L.freeCourses && L.freeCourses[it.e.course])
                    || (hasStudentDefault ? { q: L.fStartQ, s: L.fStartSess, h: 1 } : null);
                it.freeBlockBM = !!it.freeOverride;
                if (it.freeOverride) {
                    const ovMhArr = (window.C[it.e.course]?.[curQ]?.mh || '4,4,4').split(',').map(Number);
                    it.freeCeilT = ovMhArr.reduce((sum, h, sIdx) => {
                        if (h <= 0) return sum;
                        const sAmt = window.getSessSplit(it.cT, sIdx, ovMhArr);
                        return sum + window.getFreeSessionEligible(sAmt, sIdx, it.freeOverride, curQ, h);
                    }, 0);
                } else {
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
            if (L.isC && sorted.length > 0 && L.cB > 0) {
                if (window.SysSet.deductMode === 'COURSE_FIRST') {
                    sorted.forEach(sc => {
                        let rule = (sc.e.overrideCho3 || window.SysSet.cho3Priority || 'T,B').split(',');
                        rule.forEach(type => {
                            if (type === 'T') { let d = Math.min(L.cB, sc.rem_tT - sc.u_tc); sc.u_tc += d; L.cB -= d; }
                            if (type === 'B') { let d = Math.min(L.cB, sc.rem_tB - sc.u_bc); sc.u_bc += d; L.cB -= d; }
                            if (type === 'M') { let d = Math.min(L.cB, sc.rem_tM - sc.u_mc); sc.u_mc += d; L.cB -= d; }
                        });
                    });
                } else {
                    // 항목 우선(ITEM_FIRST): 각자의 N순위 주머니를 내밀어 동시에 차감
                    for (let step = 0; step < 3; step++) {
                        sorted.forEach(sc => {
                            let rule = (sc.e.overrideCho3 || window.SysSet.cho3Priority || 'T,B').split(',');
                            if (step < rule.length) {
                                let type = rule[step];
                                if (type === 'T') { let d = Math.min(L.cB, sc.rem_tT - sc.u_tc); sc.u_tc += d; L.cB -= d; }
                                if (type === 'B') { let d = Math.min(L.cB, sc.rem_tB - sc.u_bc); sc.u_bc += d; L.cB -= d; }
                                if (type === 'M') { let d = Math.min(L.cB, sc.rem_tM - sc.u_mc); sc.u_mc += d; L.cB -= d; }
                            }
                        });
                    }
                }
            }

            // ---------------------------------------------------------
            // 📜 [헌법 제1, 3조 적용] 자유수강권 차감 연산
            // ---------------------------------------------------------
            if (L.isF && sorted.length > 0 && L.fB > 0) {
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
            }

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

                        // 엔진이 확정한 분기 차감액(u_tc 등)에서 현재 차수의 몫(s_tT 등)만큼만 덜어옴
                        let s_tc = Math.min(s_tT, it.u_tc); it.u_tc -= s_tc;
                        let s_bc = Math.min(s_tB, it.u_bc); it.u_bc -= s_bc;
                        let s_mc = Math.min(s_tM, it.u_mc); it.u_mc -= s_mc;

                        // 💡 지원시점(override) 반영: 이 차수·이 시수구간이 자유수강권 대상 밖이면 0으로 캡
                        const sessFreeElig = window.getFreeSessionEligible(s_tT, sIdx, it.freeOverride, curQ, mhArr[sIdx]);
                        let s_tf = Math.min(s_tT - s_tc, sessFreeElig, it.u_tf); it.u_tf -= s_tf;
                        let s_bf = it.freeBlockBM ? 0 : Math.min(s_tB - s_bc, it.u_bf); it.u_bf -= s_bf;
                        let s_mf = it.freeBlockBM ? 0 : Math.min(s_tM - s_mc, it.u_mf); it.u_mf -= s_mf;

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
                if (L.isF) fBadge = `<span class="badge badge-free">자유</span>`;
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