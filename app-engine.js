/* ==========================================================================
   파일닉네임: app-engine.js
   기능설명: 차수별 시수 안분 계산, 전역/지역 예외 공제순위 정산 코어 연산 엔진
   ========================================================================== */
'use strict';

// 1. 차수별 시수 분할 안분 매커니즘 (절사금액 보정 포함)
window.getSessSplit = function(tAmt, sIdx, mhArr) { 
    if (tAmt === 0) return 0; const isMinus = tAmt < 0; const absAmt = Math.abs(tAmt); 
    const totalHours = mhArr.reduce((a, b) => a + b, 0); 
    if (sIdx === mhArr.length - 1) { 
        let pSum = 0; 
        for(let j=0; j<sIdx; j++) pSum += Math.trunc((absAmt * (mhArr[j]/totalHours))/10)*10; 
        const res = absAmt - pSum; return isMinus ? -res : res; 
    } else { 
        const res = Math.trunc((absAmt * (mhArr[sIdx]/totalHours))/10)*10; 
        return isMinus ? -res : res; 
    } 
};

// 2. 학생별 환불, 조정액 수동 보정 및 가감 연산
window.recalcEnrollment = function(e) {
    const base = window.C[e.course]?.[e.q] || {t:0, b:0, mh:'4,4,4'}; 
    const mhArr = (base.mh || '4,4,4').split(',').map(x=>window.num(x)).filter(x=>x>0);
    e.adjusts = e.adjusts || []; e.refunds = e.refunds || [];
    
    let totAdjT = e.adjusts.reduce((s, a) => s + (a.amtT || 0), 0); 
    let totAdjB = e.adjusts.reduce((s, a) => s + (a.amtB || 0), 0);
    let tMemos = [], bMemos = [];
    
    e.refunds.forEach(r => {
        let rt = 0, rb = 0, tyNm = '';
        if (r.ty === 'BEFORE') { rt = base.t; tyNm = `[개시전(분기전액)] 환:${window.fmt(rt)}`; }
        else {
            const bT = window.getSessSplit(base.t, r.sessIdx, mhArr);
            if (r.ty === 'DISEASE') { 
                const md = window.M[e.course.replace(/\([A-Z]\)$/, '')]?.[e.q] || {}; 
                const cUnit = base.unit || md.unit || 1; 
                const unitFee = Math.ceil(((md.inst_m||0)+(md.mgmt_m||0))/(cUnit*4)/10)*10; 
                rt = Math.ceil((unitFee * r.ah)/10)*10; tyNm = `[결석(${r.sessIdx+1}차)] 환:${window.fmt(rt)}`; 
            }
            else if (r.ty === 'STUDENT') { 
                if (r.ah === 0) { rt = bT; } else { 
                    const ratio = r.ah/(mhArr[r.sessIdx]||4); 
                    if (ratio <= 1/3) rt=Math.ceil(bT*(2/3)/10)*10; 
                    else if (ratio <= 1/2) rt=Math.ceil(bT*(1/2)/10)*10; 
                } 
                for (let j = r.sessIdx + 1; j < mhArr.length; j++) rt += window.getSessSplit(base.t, j, mhArr); 
                tyNm = `[포기(${r.sessIdx+1}차)] 환:${window.fmt(rt)}`; 
            }
        }
        if (r.bkRefTy === 'FULL') { rb = base.b; } 
        else if (r.bkRefTy === 'MANUAL') { rb = r.bkRefAmt || 0; } 
        else if (r.reqBk && !r.bkRefTy) { rb = r.ty === 'BEFORE' ? base.b : window.getSessSplit(base.b, r.sessIdx, mhArr); }
        r.rt = rt; r.rb = rb; r.tyNm = tyNm;
        if (r.rt>0) tMemos.push(r.tyNm); if (r.rb>0) bMemos.push(`[교재환불] -${window.fmt(r.rb)}`);
    });
    
    e.adjusts.forEach(a => { 
        if(a.amtT!==0) tMemos.push(`[조정]${a.title}:${window.fmt(a.amtT)}`); 
        if(a.amtB!==0) bMemos.push(`[교재조정]${a.title}:${window.fmt(a.amtB)}`); 
    });
    e.tMemo = tMemos.join(', '); e.bMemo = bMemos.join(', '); 
    
    let calcMm = [e.tMemo, e.bMemo].filter(Boolean).join(' | ');
    let specialMemo = (e.mm || '').split(' | ').find(m => m.includes('이전 분기') || m.includes('부서 매칭 실패') || m.includes('원래:'));
    if (specialMemo) { e.mm = calcMm ? `${specialMemo} | ${calcMm}` : specialMemo; } else { e.mm = calcMm; }

    e.rT = e.refunds.reduce((s,r)=>s+r.rt,0); e.rB = e.refunds.reduce((s,r)=>s+r.rb,0);
    e.cT = Math.max(0, base.t + totAdjT - e.rT); e.cB = Math.max(0, base.b + totAdjB - e.rB);
    e.auditLog = '엔진자동'; 
    if (e.adjusts.length > 0 || e.refunds.length > 0) e.auditLog = '예외적용'; 
    if (window.isQuarterLocked(e.q)) e.auditLog = '마감/이관'; 
};

// 3. 다중 지원금 고속 상계 매칭 맵 및 4스텝 원장 데이터 할당 엔진
window.autoRunSet = function(silent = false) {
    window.Ld = {}; window.Hs = []; 
    if (!window.E.length) { if (!silent) window.renderSetTabs(); return; }
    const freeMap = new Map(); window.F.forEach(f => freeMap.set(window.uid(f.g,f.b,f.n,f.name), f));

    window.E.forEach(e => {
        const id  = window.uid(e.g,e.b,e.n,e.name); const fData = freeMap.get(id); 
        const isF = !!fData, isC = String(e.g) === '3';
        if (!window.Ld[id]) window.Ld[id] = { id, dp: window.dsp(e.g,e.b,e.n), nm: e.name, isF, isC, cB: 0, fB: isF ? 600000 : 0, fData, ty: (isF?'자유':'')+(isC?'초3':'')||'일반', enrolls: [] };
        window.Ld[id].enrolls.push(e);
    });
    
    Object.values(window.Ld).forEach(L => {
        L.cB = 0; L.qBal = { 0: { cB: 0, fB: L.fB } }; 
        
        [1, 2, 3, 4].forEach(curQ => {
            if (L.isC) { if (curQ === 1) L.cB += 250000; if (curQ === 3) L.cB += 250000; }
            const qEnrolls = L.enrolls.filter(e => e.q === curQ).sort((a,b) => (a.seq || 0) - (b.seq || 0) || a.course.localeCompare(b.course));
            
            let items = qEnrolls.map(e => {
                const bs = window.C[e.course]?.[curQ] || {t:0,b:0,mh:'4,4,4'};
                const mhArr = (bs.mh || '4,4,4').split(',').map(x => window.num(x)).filter(x => x > 0);
                
                let rem_cT = e.cT, rem_cB = e.cB;
                let sessTargets = []; let maxFreeT = 0, maxFreeB = 0;
                let lock_tc=0, lock_bc=0, lock_tf=0, lock_bf=0, lock_finT=0, lock_finB=0;

                for(let sIdx=0; sIdx<mhArr.length; sIdx++) {
                    let bT = window.getSessSplit(bs.t, sIdx, mhArr);
                    let tT = 0, tB = 0;
                    
                    if (sIdx === mhArr.length - 1) { tT = rem_cT; } else { tT = Math.max(0, Math.min(rem_cT, bT)); rem_cT -= tT; }
                    if (sIdx === 0) { tB = rem_cB; rem_cB = 0; } else { tB = 0; }
                    
                    let elgRatio = 1.0;
                    if (L.isF && L.fData) {
                        let sQ = L.fData.startQ || 1, sS = L.fData.startSess || 0, sH = 1;
                        if (L.fData.courses && L.fData.courses[e.course]) {
                            sQ = L.fData.courses[e.course].q; sS = L.fData.courses[e.course].s; sH = L.fData.courses[e.course].h || 1;
                        }
                        if (curQ < sQ) elgRatio = 0;
                        else if (curQ === sQ) {
                            if (sIdx < sS) elgRatio = 0;
                            else if (sIdx === sS) {
                                let maxH = mhArr[sIdx] || 4;
                                elgRatio = Math.max(0, maxH - sH + 1) / maxH;
                            }
                        }
                    }
                    
                    maxFreeT += Math.floor(tT * elgRatio / 10) * 10; 
                    maxFreeB += Math.floor(tB * elgRatio / 10) * 10;
                    
                    let st = { sIdx, tT, tB, bT, bB: (sIdx===0?bs.b:0), tc:0, bc:0, tf:0, bf:0, finT:0, finB:0, _isLocked: false };
                    
                    let closedSnapshot = null;
                    if (window.SysSet.closedSess && window.SysSet.closedSess[`${curQ}_${sIdx}`]) {
                        closedSnapshot = window.SysSet.closedSess[`${curQ}_${sIdx}`][`${L.id}_${e.course}`];
                    }
                    if (closedSnapshot) {
                        st.tc = closedSnapshot.cho3Amt || 0; st.bc = closedSnapshot.cho3Bk || 0;
                        st.tf = closedSnapshot.freeAmt || 0; st.bf = closedSnapshot.freeBk || 0;
                        st.finT = closedSnapshot.selfAmt || 0; st.finB = closedSnapshot.selfBk || 0;
                        st._isLocked = true;
                        lock_tc += st.tc; lock_bc += st.bc; lock_tf += st.tf; lock_bf += st.bf; lock_finT += st.finT; lock_finB += st.finB;
                    }
                    sessTargets.push(st);
                }
                return { e, bs, cT: e.cT, cB: e.cB, mhArr, sessTargets, maxFreeT, maxFreeB, q_tc: lock_tc, q_bc: lock_bc, q_tf: lock_tf, q_bf: lock_bf, lock_tc, lock_bc, lock_tf, lock_bf, lock_finT, lock_finB };
            });

            items.forEach(it => { 
                if (L.isC) L.cB -= (it.lock_tc + it.lock_bc); 
                if (L.isF) L.fB -= (it.lock_tf + it.lock_bf); 
            });

            // 초3 공제 연산단계 (로컬 예외지정 반영)
            if (L.isC) {
                for (let pass = 0; pass < 2; pass++) {
                    items.sort((a,b) => {
                        let aTouched = (a.q_tc > 0 || a.q_bc > 0) ? -1 : 1; let bTouched = (b.q_tc > 0 || b.q_bc > 0) ? -1 : 1;
                        if (aTouched !== bTouched) return aTouched - bTouched;
                        return (a.e.seq || 0) - (b.e.seq || 0) || a.e.course.localeCompare(b.e.course);
                    });
                    items.forEach(it => {
                        if (L.cB <= 0) return;
                        let myDpStr = it.e.overrideCho3 ? it.e.overrideCho3 : (window.SysSet.cho3Priority || 'T,B');
                        let myDp = myDpStr.split(',');
                        let type = myDp[pass]; if (!type) return;
                        let targetAmt = (type === 'T') ? (it.cT - it.q_tc) : (it.cB - it.q_bc);
                        let ded = Math.min(targetAmt, Math.max(0, L.cB));
                        if (type === 'T') it.q_tc += ded; else if (type === 'B') it.q_bc += ded;
                        L.cB -= ded;
                    });
                }
            }

            // 자유수강권 공제 연산단계 (로컬 예외지정 반영)
            if (L.isF) {
                for (let pass = 0; pass < 2; pass++) {
                    items.sort((a,b) => {
                        let aTouched = (a.q_tc > 0 || a.q_bc > 0 || a.q_tf > 0 || a.q_bf > 0) ? -1 : 1; 
                        let bTouched = (b.q_tc > 0 || b.q_bc > 0 || b.q_tf > 0 || b.q_bf > 0) ? -1 : 1;
                        if (aTouched !== bTouched) return aTouched - bTouched;
                        return (a.e.seq || 0) - (b.e.seq || 0) || a.e.course.localeCompare(b.e.course);
                    });
                    items.forEach(it => {
                        if (L.fB <= 0) return;
                        let myDpStr = it.e.overrideFree ? it.e.overrideFree : (window.SysSet.freePriority || 'T,B');
                        let myDp = myDpStr.split(',');
                        let type = myDp[pass]; if (!type) return;
                        let req = (type === 'T') ? (it.cT - it.q_tc - it.q_tf) : (it.cB - it.q_bc - it.q_bf);
                        let maxEligible = (type === 'T') ? (it.maxFreeT - it.q_tf) : (it.maxFreeB - it.q_bf);
                        let targetAmt = Math.min(req, Math.max(0, maxEligible));
                        let ded = Math.min(targetAmt, Math.max(0, L.fB));
                        if (type === 'T') it.q_tf += ded; else if (type === 'B') it.q_bf += ded;
                        L.fB -= ded;
                    });
                }
            }

            items.forEach(it => {
                let dist_tc = it.q_tc - it.lock_tc, dist_bc = it.q_bc - it.lock_bc;
                let dist_tf = it.q_tf - it.lock_tf, dist_bf = it.q_bf - it.lock_bf;
                let dist_finT = it.cT - it.q_tc - it.q_tf - it.lock_finT, dist_finB = it.cB - it.q_bc - it.q_bf - it.lock_finB;
                const init_dist_tc = dist_tc, init_dist_tf = dist_tf, init_dist_finT = dist_finT;
                let unlockedSess = it.sessTargets.filter(st => !st._isLocked);
                let sum_tT = unlockedSess.reduce((s, x) => s + x.tT, 0);

                for (let i = 0; i < unlockedSess.length; i++) {
                    let st = unlockedSess[i]; let isLast = (i === unlockedSess.length - 1); 
                    let ratio = sum_tT === 0 ? 0 : (st.tT / sum_tT);
                    if (isLast) { st.tc = dist_tc; st.tf = dist_tf; st.finT = dist_finT; } 
                    else { 
                        st.tc = Math.trunc((init_dist_tc * ratio) / 10) * 10; 
                        st.tf = Math.trunc((init_dist_tf * ratio) / 10) * 10; 
                        st.finT = Math.trunc((init_dist_finT * ratio) / 10) * 10; 
                        dist_tc -= st.tc; dist_tf -= st.tf; dist_finT -= st.finT; 
                    }
                    if (i === 0) { st.bc = dist_bc; st.bf = dist_bf; st.finB = dist_finB; } else { st.bc = 0; st.bf = 0; st.finB = 0; }
                }

                let fStatus = 'NONE'; let fBadge = '';
                if (L.isC) { fBadge += `<span class="badge badge-cho3 me-1">초3</span>`; }
                if (L.isF) {
                    let sQ = L.fData.startQ || 1, sS = L.fData.startSess || 0, sH = L.fData.courses?.[it.e.course]?.h || 1;
                    if (L.fData.courses && L.fData.courses[it.e.course]) { sQ = L.fData.courses[it.e.course].q; sS = L.fData.courses[it.e.course].s; }
                    if (curQ < sQ) { fStatus = 'PENDING'; fBadge += `<span class="badge bg-light text-secondary border border-secondary">자유(대기)</span>`; } 
                    else if (curQ === sQ && (sS > 0 || sH > 1)) { fStatus = 'PARTIAL'; fBadge += `<span class="badge" style="background-color:#a3cfbb; color:#0a3622;">자유(${sS+1}차 ${sH}시수~)</span>`; } 
                    else { fStatus = 'FULL'; fBadge += `<span class="badge badge-free">자유</span>`; }
                } 
                if (!L.isC && !L.isF) { fBadge = `<span class="badge bg-light text-secondary border">일반</span>`; }

                window.Hs.push({ 
                    q: curQ, id: L.id, dp: L.dp, nm: L.nm, c: it.e.course, e: it.e, 
                    origT: it.bs.t, origB: it.bs.b, sT: it.cT, sB: it.cB, 
                    tc: it.q_tc, bc: it.q_bc, tf: it.q_tf, bf: it.q_bf, 
                    finT: (it.cT - it.q_tc - it.q_tf), finB: (it.cB - it.q_bc - it.q_bf), 
                    sessDetails: it.sessTargets, isF: L.isF, fStatus, fBadge, isC: L.isC, 
                    g: it.e.g, ban: it.e.b, num: it.e.n 
                });
            });
            L.qBal[curQ] = { cB: Math.max(0, L.cB), fB: Math.max(0, L.fB) }; 
        });
    }); 
    if (!silent && typeof window.renderSetTabs === 'function') window.renderSetTabs();
};