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

// 💡 3D 마스터플랜: 환불/조정 시 재료비(M) 3차원 반영 완료
window.recalcEnrollment = function(e) {
    const base = window.C[e.course]?.[e.q] || {t:0, b:0, m:0, mh:'4,4,4'};
    const mhArr = base.mh.split(',').map(Number);
    let cT = base.t; let cB = base.b; let cM = base.m || 0;

    (e.refunds || []).forEach(r => {
        let rT = 0, rB = 0, rM = 0;
        if (r.ty === 'BEFORE') { rT = cT; rB = cB; rM = cM; }
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
        
        if (r.bkRefTy === 'FULL') { rB = cB; rM = cM; }
        else if (r.bkRefTy === 'MANUAL') { rB = window.num(r.bkRefAmt); rM = window.num(r.bkRefAmtM || 0); }

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
        const fInfo = window.F.find(x => window.uid(x.g, x.b, x.n, x.name) === id);
        L.isF = !!fInfo; L.fB = L.isF ? 600000 : 0; 
        L.isC = L.items.some(it => it.e.g === 3); L.cB = 0; 
    });

    for (let curQ = 1; curQ <= 4; curQ++) {
        Object.keys(window.Ld).forEach(id => {
            const L = window.Ld[id];

            if (L.isC) { if (curQ === 1 || curQ === 3) L.cB += 250000; }

            let qItems = L.items.filter(it => it.e.q === curQ);
            if (qItems.length === 0) { L.qBal[curQ] = { cB: L.cB, fB: L.fB }; return; }

            let maxSess = 1;
            qItems.forEach(it => {
                const mhArr = (window.C[it.e.course]?.[curQ]?.mh || '4,4,4').split(',').map(Number);
                if (mhArr.length > maxSess) maxSess = mhArr.length;
            });

            for (let sIdx = 0; sIdx < maxSess; sIdx++) {
                const sessKey = `${curQ}_${sIdx}`;
                const isLocked = window.SysSet.closedSess && window.SysSet.closedSess[sessKey];

                if (isLocked) {
                    qItems.forEach(it => {
                        const lockData = window.SysSet.closedSess[sessKey][`${L.id}_${it.e.course}`];
                        if (lockData) {
                            L.cB -= (lockData.cho3Amt + lockData.cho3Bk + (lockData.cho3Mt||0));
                            L.fB -= (lockData.freeAmt + lockData.freeBk + (lockData.freeMt||0));

                            it.sessDetails[sIdx] = {
                                tT: lockData.cho3Amt + lockData.freeAmt + lockData.selfAmt,
                                tB: lockData.cho3Bk + lockData.freeBk + lockData.selfBk,
                                tM: (lockData.cho3Mt||0) + (lockData.freeMt||0) + (lockData.selfMt||0),
                                tc: lockData.cho3Amt, bc: lockData.cho3Bk, mc: (lockData.cho3Mt||0),
                                tf: lockData.freeAmt, bf: lockData.freeBk, mf: (lockData.freeMt||0),
                                finT: lockData.selfAmt, finB: lockData.selfBk, finM: (lockData.selfMt||0),
                                remCho3: Math.max(0, L.cB), remFree: Math.max(0, L.fB)
                            };

                            it.q_tc += lockData.cho3Amt; it.q_bc += lockData.cho3Bk; it.q_mc += (lockData.cho3Mt||0);
                            it.q_tf += lockData.freeAmt; it.q_bf += lockData.freeBk; it.q_mf += (lockData.freeMt||0);
                        } else {
                            it.sessDetails[sIdx] = { tT:0, tB:0, tM:0, tc:0, bc:0, mc:0, tf:0, bf:0, mf:0, finT:0, finB:0, finM:0, remCho3: Math.max(0, L.cB), remFree: Math.max(0, L.fB) };
                        }
                    });
                    continue; 
                }

                let sessionCourses = [];
                qItems.forEach(it => {
                    const mhArr = (window.C[it.e.course]?.[curQ]?.mh || '4,4,4').split(',').map(Number);
                    if (sIdx >= mhArr.length) return;

                    let tT = window.getSessSplit(it.cT, sIdx, mhArr);
                    const firstActive = mhArr.findIndex(h => h > 0);
                    let tB = (sIdx === firstActive) ? it.cB : 0; 
                    let tM = (sIdx === firstActive) ? (it.cM || 0) : 0; 

                    if (tT !== 0 || tB !== 0 || tM !== 0) {
                        sessionCourses.push({ it, tT, tB, tM, tc:0, bc:0, mc:0, tf:0, bf:0, mf:0 });
                    } else {
                        it.sessDetails[sIdx] = { tT:0, tB:0, tM:0, tc:0, bc:0, mc:0, tf:0, bf:0, mf:0, finT:0, finB:0, finM:0, remCho3: Math.max(0, L.cB), remFree: Math.max(0, L.fB) };
                    }
                });

                if (L.isC && sessionCourses.length > 0 && L.cB > 0) {
                    let priorityRule = (qItems[0].e.overrideCho3 || window.SysSet.cho3Priority || 'T,B').split(',');
                    let totalT = sessionCourses.reduce((sum, sc) => sum + sc.tT, 0);
                    let totalB = sessionCourses.reduce((sum, sc) => sum + sc.tB, 0);
                    let totalM = sessionCourses.reduce((sum, sc) => sum + (sc.tM || 0), 0);
                    
                    let wT = 0, wB = 0, wM = 0; let remBudget = L.cB;

                    priorityRule.forEach(type => {
                        if (type === 'T') { let a = Math.min(remBudget, totalT); wT = a; remBudget -= a; }
                        if (type === 'B') { let a = Math.min(remBudget, totalB); wB = a; remBudget -= a; }
                        if (type === 'M') { let a = Math.min(remBudget, totalM); wM = a; remBudget -= a; }
                    });

                    let sorted = [...sessionCourses].sort((a,b) => (a.it.e.seq||0) - (b.it.e.seq||0) || a.it.e.course.localeCompare(b.it.e.course));
                    sorted.forEach(sc => {
                        let dedT = Math.min(sc.tT, wT); sc.tc += dedT; wT -= dedT; L.cB -= dedT;
                        let dedB = Math.min(sc.tB, wB); sc.bc += dedB; wB -= dedB; L.cB -= dedB;
                        let dedM = Math.min(sc.tM, wM); sc.mc += dedM; wM -= dedM; L.cB -= dedM;
                    });
                }

                if (L.isF && sessionCourses.length > 0 && L.fB > 0) {
                    let priorityRule = (qItems[0].e.overrideFree || window.SysSet.freePriority || 'T,B').split(',');
                    let totalT = sessionCourses.reduce((sum, sc) => sum + (sc.tT - sc.tc), 0);
                    let totalB = sessionCourses.reduce((sum, sc) => sum + (sc.tB - sc.bc), 0);
                    let totalM = sessionCourses.reduce((sum, sc) => sum + (sc.tM - sc.mc), 0);
                    
                    let wT = 0, wB = 0, wM = 0; let remBudget = L.fB;

                    priorityRule.forEach(type => {
                        if (type === 'T') { let a = Math.min(remBudget, totalT); wT = a; remBudget -= a; }
                        if (type === 'B') { let a = Math.min(remBudget, totalB); wB = a; remBudget -= a; }
                        if (type === 'M') { let a = Math.min(remBudget, totalM); wM = a; remBudget -= a; }
                    });

                    let sorted = [...sessionCourses].sort((a,b) => (a.it.e.seq||0) - (b.it.e.seq||0) || a.it.e.course.localeCompare(b.it.e.course));
                    sorted.forEach(sc => {
                        let dedT = Math.min(sc.tT - sc.tc, wT); sc.tf += dedT; wT -= dedT; L.fB -= dedT;
                        let dedB = Math.min(sc.tB - sc.bc, wB); sc.bf += dedB; wB -= dedB; L.fB -= dedB;
                        let dedM = Math.min(sc.tM - sc.mc, wM); sc.mf += dedM; wM -= dedM; L.fB -= dedM;
                    });
                }

                sessionCourses.forEach(sc => {
                    let finT = sc.tT - sc.tc - sc.tf;
                    let finB = sc.tB - sc.bc - sc.bf;
                    let finM = sc.tM - sc.mc - sc.mf;
                    
                    sc.it.sessDetails[sIdx] = {
                        tT: sc.tT, tB: sc.tB, tM: sc.tM, 
                        tc: sc.tc, bc: sc.bc, mc: sc.mc, 
                        tf: sc.tf, bf: sc.bf, mf: sc.mf,
                        finT, finB, finM,
                        remCho3: Math.max(0, L.cB), remFree: Math.max(0, L.fB)
                    };
                    sc.it.q_tc += sc.tc; sc.it.q_bc += sc.bc; sc.it.q_mc += sc.mc;
                    sc.it.q_tf += sc.tf; sc.it.q_bf += sc.bf; sc.it.q_mf += sc.mf;
                });
            }

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