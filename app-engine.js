/* ==========================================================================
   파일닉네임: app-engine.js
   기능설명: [PRO] 코어 규칙(학기당 25만, 100% 이월, 발생주의 순차 차감) 완벽 적용 엔진
   ========================================================================== */
'use strict';

// 1. 차수별 시수 분할 안분 매커니즘 (절사금액 보정 포함 - 수강료 전용)
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

// 2. 학생별 환불, 조정액 수동 보정 및 가감 연산 (실부담금 도출)
window.recalcEnrollment = function(e) {
    const base = window.C[e.course]?.[e.q] || {t:0, b:0, mh:'4,4,4'};
    const mhArr = base.mh.split(',').map(Number);
    let cT = base.t; let cB = base.b;

    (e.refunds || []).forEach(r => {
        let rT = 0, rB = 0;
        if (r.ty === 'BEFORE') { rT = cT; rB = cB; }
        else if (r.ty === 'STUDENT') {
            const tH = mhArr.reduce((a,b)=>a+b, 0);
            let pS = 0; for(let i=0; i<r.sessIdx; i++) pS += mhArr[i];
            const p = (pS + r.ah) / tH;
            if (p <= 1/3) rT = cT * (2/3);
            else if (p <= 1/2) rT = cT * (1/2);
            else rT = 0;
            rT = Math.trunc(rT/10)*10;
        }
        else if (r.ty === 'DISEASE') {
            const tH = mhArr.reduce((a,b)=>a+b, 0);
            rT = Math.trunc((cT * (r.ah / tH))/10)*10;
        }
        
        if (r.bkRefTy === 'FULL') rB = cB;
        else if (r.bkRefTy === 'MANUAL') rB = window.num(r.bkRefAmt);

        r.rt = Math.min(cT, Math.max(0, rT));
        r.rb = Math.min(cB, Math.max(0, rB));
        cT -= r.rt; cB -= r.rb;
    });

    (e.adjusts || []).forEach(a => {
        if (!a.title.includes('[예외설정]')) { cT += window.num(a.amtT); cB += window.num(a.amtB); }
    });

    return { t: base.t, b: base.b, cT: Math.max(0, cT), cB: Math.max(0, cB) };
};

// 3. 🌟 핵심 연산 엔진 (1분기~4분기 통합 타임라인 런타임)
window.autoRunSet = function(skipRender = false) {
    if (!window.SysSet) window.SysSet = {};
    window.Hs = []; window.Ld = {};

    // 3-1. 모든 학생의 기초 데이터 셋업 (분기 구분 없이 모두 로드)
    window.E.forEach(e => {
        const id = window.uid(e.g, e.b, e.n, e.name);
        if (!window.Ld[id]) window.Ld[id] = { id, dp: window.dsp(e.g, e.b, e.n), nm: e.name, isC: false, isF: false, items: [], qBal: {}, cB: 0, fB: 0 };
        
        const res = window.recalcEnrollment(e);
        window.Ld[id].items.push({ 
            e, bs: res, cT: res.cT, cB: res.cB, 
            q_tc: 0, q_bc: 0, q_tf: 0, q_bf: 0, 
            finT: 0, finB: 0, sessDetails: {} 
        });
    });

    // 3-2. 대상자 식별 및 지갑(Wallet) 기초 셋업
    Object.keys(window.Ld).forEach(id => {
        const L = window.Ld[id];
        const fInfo = window.F.find(x => window.uid(x.g, x.b, x.n, x.name) === id);
        
        L.isF = !!fInfo;
        L.fB = L.isF ? 600000 : 0; // 자유수강권: 연간 60만원 일괄 세팅
        
        L.isC = L.items.some(it => it.e.g === 3);
        L.cB = 0; // 초3 지원금: 분기 루프를 돌면서 충전됨
    });

    const engineMode = window.SysSet.deductMode || 'ITEM_FIRST';

    // 🌟 [코어 엔진] 1분기부터 4분기까지 시간의 흐름대로 관통하는 메인 루프
    for (let curQ = 1; curQ <= 4; curQ++) {
        Object.keys(window.Ld).forEach(id => {
            const L = window.Ld[id];

            // 💡 [코어 규칙 준수] 1학기(1분기)와 2학기(3분기) 시작 시 25만 원씩 지갑에 '추가(Add)' 충전
            // 2분기와 4분기는 충전 없이 이전 분기에서 이월된 잔액을 그대로 사용함
            if (L.isC) {
                if (curQ === 1 || curQ === 3) {
                    L.cB += 250000; 
                }
            }

            // 이번 분기에 수강하는 강좌만 추출
            let qItems = L.items.filter(it => it.e.q === curQ);
            if (qItems.length === 0) {
                L.qBal[curQ] = { cB: L.cB, fB: L.fB }; // 수강이 없어도 지갑 잔액은 이월 보존
                return;
            }

            let maxSess = 1;
            qItems.forEach(it => {
                const mhArr = (window.C[it.e.course]?.[curQ]?.mh || '4,4,4').split(',').map(Number);
                if (mhArr.length > maxSess) maxSess = mhArr.length;
            });

            // 🌟 해당 분기 내부의 '차수별' 순차 차감 루프
            for (let sIdx = 0; sIdx < maxSess; sIdx++) {
                const sessKey = `${curQ}_${sIdx}`;
                const isLocked = window.SysSet.closedSess && window.SysSet.closedSess[sessKey];

                // 🔒 마감된 차수: 과거 금액을 지갑에서 선 차감
                if (isLocked) {
                    qItems.forEach(it => {
                        const lockData = window.SysSet.closedSess[sessKey][`${L.id}_${it.e.course}`];
                        if (lockData) {
                            L.cB -= (lockData.cho3Amt + lockData.cho3Bk);
                            L.fB -= (lockData.freeAmt + lockData.freeBk);

                            it.sessDetails[sIdx] = {
                                tT: lockData.cho3Amt + lockData.freeAmt + lockData.selfAmt,
                                tB: lockData.cho3Bk + lockData.freeBk + lockData.selfBk,
                                tc: lockData.cho3Amt, bc: lockData.cho3Bk,
                                tf: lockData.freeAmt, bf: lockData.freeBk,
                                finT: lockData.selfAmt, finB: lockData.selfBk,
                                remCho3: Math.max(0, L.cB), remFree: Math.max(0, L.fB)
                            };

                            it.q_tc += lockData.cho3Amt; it.q_bc += lockData.cho3Bk;
                            it.q_tf += lockData.freeAmt; it.q_bf += lockData.freeBk;
                        } else {
                            it.sessDetails[sIdx] = { tT:0, tB:0, tc:0, bc:0, tf:0, bf:0, finT:0, finB:0, remCho3: Math.max(0, L.cB), remFree: Math.max(0, L.fB) };
                        }
                    });
                    continue; 
                }

                // 🔓 진행 중인 차수: 실부담금 배정 및 결제
                let sessionCourses = [];
                qItems.forEach(it => {
                    const mhArr = (window.C[it.e.course]?.[curQ]?.mh || '4,4,4').split(',').map(Number);
                    if (sIdx >= mhArr.length) return;

                    let tT = window.getSessSplit(it.cT, sIdx, mhArr);
                    const firstActive = mhArr.findIndex(h => h > 0);
                    let tB = (sIdx === firstActive) ? it.cB : 0; // 교재비는 첫 차수 100% 청구

                    if (tT !== 0 || tB !== 0) {
                        sessionCourses.push({ it, tT, tB, tc:0, bc:0, tf:0, bf:0 });
                    } else {
                        it.sessDetails[sIdx] = { tT:0, tB:0, tc:0, bc:0, tf:0, bf:0, finT:0, finB:0, remCho3: Math.max(0, L.cB), remFree: Math.max(0, L.fB) };
                    }
                });

                // 💳 초3 결제
                if (L.isC && sessionCourses.length > 0) {
                    let sorted = [...sessionCourses].sort((a,b) => (a.it.e.seq||0) - (b.it.e.seq||0) || a.it.e.course.localeCompare(b.it.e.course));
                    if (engineMode === 'ITEM_FIRST') {
                        for (let pass = 0; pass < 2; pass++) {
                            sorted.forEach(sc => {
                                if (L.cB <= 0) return;
                                let rule = (sc.it.e.overrideCho3 || window.SysSet.cho3Priority || 'T,B').split(',');
                                let type = rule[pass]; if (!type) return;
                                let req = (type === 'T') ? (sc.tT - sc.tc) : (sc.tB - sc.bc);
                                let ded = Math.min(Math.max(0, req), Math.max(0, L.cB));
                                if (type === 'T') sc.tc += ded; else sc.bc += ded;
                                L.cB -= ded;
                            });
                        }
                    } else {
                        sorted.forEach(sc => {
                            for (let pass = 0; pass < 2; pass++) {
                                if (L.cB <= 0) return;
                                let rule = (sc.it.e.overrideCho3 || window.SysSet.cho3Priority || 'T,B').split(',');
                                let type = rule[pass]; if (!type) return;
                                let req = (type === 'T') ? (sc.tT - sc.tc) : (sc.tB - sc.bc);
                                let ded = Math.min(Math.max(0, req), Math.max(0, L.cB));
                                if (type === 'T') sc.tc += ded; else sc.bc += ded;
                                L.cB -= ded;
                            }
                        });
                    }
                }

                // 💳 자유수강권 결제
                if (L.isF && sessionCourses.length > 0) {
                    let sorted = [...sessionCourses].sort((a,b) => (a.it.e.seq||0) - (b.it.e.seq||0) || a.it.e.course.localeCompare(b.it.e.course));
                    if (engineMode === 'ITEM_FIRST') {
                        for (let pass = 0; pass < 2; pass++) {
                            sorted.forEach(sc => {
                                if (L.fB <= 0) return;
                                let rule = (sc.it.e.overrideFree || window.SysSet.freePriority || 'T,B').split(',');
                                let type = rule[pass]; if (!type) return;
                                let req = (type === 'T') ? (sc.tT - sc.tc - sc.tf) : (sc.tB - sc.bc - sc.bf);
                                let ded = Math.min(Math.max(0, req), Math.max(0, L.fB));
                                if (type === 'T') sc.tf += ded; else sc.bf += ded;
                                L.fB -= ded;
                            });
                        }
                    } else {
                        sorted.forEach(sc => {
                            for (let pass = 0; pass < 2; pass++) {
                                if (L.fB <= 0) return;
                                let rule = (sc.it.e.overrideFree || window.SysSet.freePriority || 'T,B').split(',');
                                let type = rule[pass]; if (!type) return;
                                let req = (type === 'T') ? (sc.tT - sc.tc - sc.tf) : (sc.tB - sc.bc - sc.bf);
                                let ded = Math.min(Math.max(0, req), Math.max(0, L.fB));
                                if (type === 'T') sc.tf += ded; else sc.bf += ded;
                                L.fB -= ded;
                            }
                        });
                    }
                }

                // 📝 차수별 결과 저장 (현재 잔액 캡처)
                sessionCourses.forEach(sc => {
                    let finT = sc.tT - sc.tc - sc.tf;
                    let finB = sc.tB - sc.bc - sc.bf;
                    sc.it.sessDetails[sIdx] = {
                        tT: sc.tT, tB: sc.tB, tc: sc.tc, bc: sc.bc, tf: sc.tf, bf: sc.bf,
                        finT, finB,
                        remCho3: Math.max(0, L.cB), remFree: Math.max(0, L.fB) // 💡 실시간 잔액 캡처
                    };
                    sc.it.q_tc += sc.tc; sc.it.q_bc += sc.bc;
                    sc.it.q_tf += sc.tf; sc.it.q_bf += sc.bf;
                });
            }

            L.qBal[curQ] = { cB: L.cB, fB: L.fB }; // 분기 종료 후 최종 이월 지갑 캡처

            // 💡 Hs 배열에 전역 데이터 적재 (화면 렌더링용)
            qItems.forEach(it => {
                it.finT = it.cT - it.q_tc - it.q_tf;
                it.finB = it.cB - it.q_bc - it.q_bf;

                let fBadge = '';
                if (L.isF) fBadge = `<span class="badge badge-free">자유</span>`;
                else if (L.isC) fBadge = `<span class="badge badge-cho3">초3</span>`;
                else fBadge = `<span class="badge bg-light text-secondary border">일반</span>`;

                window.Hs.push({
                    q: curQ, id: L.id, dp: L.dp, nm: L.nm, c: it.e.course, e: it.e,
                    origT: it.bs.t, origB: it.bs.b, sT: it.cT, sB: it.cB,
                    tc: it.q_tc, bc: it.q_bc, tf: it.q_tf, bf: it.q_bf,
                    finT: it.finT, finB: it.finB, isC: L.isC, isF: L.isF,
                    fBadge, sessDetails: it.sessDetails
                });
            });
        });
    }

    // 화면 갱신 (전역 렌더링 함수가 있다면 호출)
    if (!skipRender && window.renderSetTabs) window.renderSetTabs();
};