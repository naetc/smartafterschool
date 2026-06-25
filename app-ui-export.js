/* ==========================================================================
   파일닉네임: app-ui-export.js
   기능설명: Step 5 행정 지원 자동 서식 추출 (엑셀 Export 및 표 렌더링)
   ========================================================================== */
'use strict';

window.eduDataCached = []; 

window.initStep5 = function() { 
    if (typeof window.autoRunSet === 'function') window.autoRunSet(true); 
    window.buildEduTabs(); 
    window.renderPreviewInvoice(); 
    window.renderPreviewRef(); 
    window.renderPreviewRoster(); 
};

window.buildEduTabs = function() { 
    const q = window.gQ; 
    const ls = window.Hs.filter(h => h.q === q && (h.finT > 0 || h.finB > 0)); 
    const grouped = {}; 
    ls.forEach(h => { 
        const baseC = h.c.replace(/\s*\([A-Za-z가-힣0-9]+\)$/, '').trim(); 
        if (!grouped[baseC]) grouped[baseC] = []; 
        grouped[baseC].push(h); 
    });
    window.eduDataCached = []; 
    Object.keys(grouped).forEach(bc => { 
        const sub = grouped[bc]; 
        sub.filter(h => h.finT > 0).forEach(h => { window.eduDataCached.push({ sheet: bc + ' 수강료', g: h.g, b: h.ban, n: h.num, nm: h.nm, amt: h.finT }); }); 
        sub.filter(h => h.finB > 0).forEach(h => { window.eduDataCached.push({ sheet: bc + ' 재료비', g: h.g, b: h.ban, n: h.num, nm: h.nm, amt: h.finB }); }); 
    }); 
    const sheetNames = [...new Set(window.eduDataCached.map(d => d.sheet))]; 
    let hTabs = sheetNames.map((sn, idx) => `<button class="sheet-pill ${idx===0?'active':''}" onclick="window.renderEduSheet('${sn}', this)">${sn}</button>`).join(''); 
    window.$('eduSheetTabs').innerHTML = hTabs || '<div class="small text-muted py-3">해당 분기에 수납 대상(자부담)이 없습니다.</div>'; 
    if(sheetNames.length) window.renderEduSheet(sheetNames[0]); else window.$('prev_edu').innerHTML = ''; 
};

window.renderEduSheet = function(sn, el) { 
    if(el) { Array.from(el.parentNode.children).forEach(b => b.classList.remove('active')); el.classList.add('active'); } 
    const filtered = window.eduDataCached.filter(d => d.sheet === sn); 
    const total = filtered.reduce((s, d) => s + d.amt, 0); 
    let h = `<tr class="sticky-total-row fw-bold"><td colspan="2" class="text-end">시트 합계</td><td class="text-danger">${window.fmt(total)}원</td><td></td></tr>`; 
    h += filtered.map(d => { 
        const stuUid = window.uid(d.g, d.b, d.n, d.nm).replace(/'/g,"\\'"); 
        return `<tr><td>${window.dsp(d.g, d.b, d.n)}</td><td class="fw-bold"><span class="clickable text-dark" onclick="window.openStuConsole('${stuUid}')">${d.nm}</span></td><td>${window.fmt(d.amt)}</td><td>${sn}</td></tr>`; 
    }).join(''); 
    window.$('prev_edu').innerHTML = h; 
};

window.exEdu = function() { 
    const q = window.gQ; if (!window.eduDataCached.length) return alert('추출할 내역이 없습니다.'); 
    const wb = XLSX.utils.book_new(); const sg = {}; 
    window.eduDataCached.forEach(r => { 
        if(!sg[r.sheet]) sg[r.sheet]=[]; 
        sg[r.sheet].push({ '* 학과': r.sheet.replace(/ 수강료| 재료비/g, ''), '* 학년': r.g, '* 반': r.b, '* 번호': r.n, '* 성명': r.nm, '* 대상금액': r.amt }); 
    }); 
    Object.keys(sg).forEach(sn => { 
        const total = sg[sn].reduce((sum, r) => sum + r['* 대상금액'], 0); 
        sg[sn].push({ '* 학과': '총계', '* 학년': '', '* 반': '', '* 번호': '', '* 성명': '', '* 대상금액': total }); 
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sg[sn]), sn.substring(0, 31)); 
    }); 
    XLSX.writeFile(wb, `${q}분기_에듀파인_수납요구서.xlsx`); 
};

window.getInvoiceData = function(q, sVal) { 
    const ls = window.Hs.filter(h => h.q === q); const grouped = {}; 
    ls.forEach(h => { 
        const mhArr = (window.C[h.c]?.[q]?.mh || '4,4,4').split(',').map(x => window.num(x)).filter(x => x > 0); 
        const baseC = h.c.replace(/\s*\([A-Za-z가-힣0-9]+\)$/, '').trim(); 
        const cd = window.C[h.c]?.[q] || { instTot: 0, mgmtTot: 0 }; 
        let baseT=0, baseM=0, baseI=0, sSelf=0, sCho=0, sFree=0; 
        if (sVal === 'ALL') { 
            baseT = h.origT; if (baseT <= 0) return; 
            baseM = cd.mgmtTot; baseI = baseT - baseM; 
            sSelf = h.finT; sCho = h.tc; sFree = h.tf; 
        } else { 
            const sIdx = window.num(sVal) - 1; if (sIdx >= mhArr.length) return; 
            baseT = h.sessDetails[sIdx].bT; if (baseT <= 0) return; 
            baseM = window.getSessSplit(cd.mgmtTot, sIdx, mhArr); baseI = baseT - baseM; 
            let closedSnapshot = null; 
            if (window.SysSet.closedSess && window.SysSet.closedSess[`${q}_${sIdx}`]) closedSnapshot = window.SysSet.closedSess[`${q}_${sIdx}`][`${h.id}_${h.c}`]; 
            if (closedSnapshot) { sSelf = closedSnapshot.selfAmt || 0; sCho = closedSnapshot.cho3Amt || 0; sFree = closedSnapshot.freeAmt || 0; } 
            else { sSelf = h.sessDetails[sIdx].finT; sCho = h.sessDetails[sIdx].tc; sFree = h.sessDetails[sIdx].tf; } 
        } 
        let totF = sSelf + sCho + sFree; let mSelf=0, mCho=0, mFree=0, iSelf=0, iCho=0, iFree=0; 
        if (totF > 0) { 
            let totalM = baseT > 0 ? Math.floor(totF * (baseM / baseT) / 10) * 10 : 0; let remM = totalM; 
            if (sSelf > 0) { mSelf = Math.floor((sSelf / totF) * totalM / 10) * 10; remM -= mSelf; } 
            if (sCho > 0) { mCho = Math.floor((sCho / totF) * totalM / 10) * 10; remM -= mCho; } 
            if (sFree > 0) { mFree = remM; remM = 0; } else if (sCho > 0) { mCho += remM; remM = 0; } else if (sSelf > 0) { mSelf += remM; remM = 0; } 
            iSelf = sSelf - mSelf; iCho = sCho - mCho; iFree = sFree - mFree; 
        } 
        if(!grouped[baseC]) grouped[baseC] = { c:baseC, baseT, baseI, baseM, selfCnt:0, selfFee:0, selfInst:0, selfMgmt:0, cho3Cnt:0, cho3Fee:0, cho3Inst:0, cho3Mgmt:0, freeCnt:0, freeFee:0, freeInst:0, freeMgmt:0, totCnt:0, totFee:0, totInst:0, totMgmt:0, memos:[] }; 
        const g = grouped[baseC]; 
        if(sSelf>0){ g.selfCnt++; g.selfFee+=sSelf; g.selfInst+=iSelf; g.selfMgmt+=mSelf; } 
        if(sCho>0){ g.cho3Cnt++; g.cho3Fee+=sCho; g.cho3Inst+=iCho; g.cho3Mgmt+=mCho; } 
        if(sFree>0){ g.freeCnt++; g.freeFee+=sFree; g.freeInst+=iFree; g.freeMgmt+=mFree; } 
        if (totF > 0 || baseT > 0) { g.totCnt++; g.totFee += totF; g.totInst += (iSelf + iCho + iFree); g.totMgmt += (mSelf + mCho + mFree); if(h.e.tMemo) g.memos.push(`${h.nm}(${h.e.tMemo})`); } 
    }); 
    return Object.values(grouped).sort((a,b) => a.c.localeCompare(b.c)); 
};

window.renderPreviewInvoice = function() { 
    const q = window.gQ, sVal = window.val('p_sInvoice'); 
    const data = window.getInvoiceData(q, sVal); 

    // 💡 첨부해주신 이미지와 완벽히 동일한 1줄(단일행) 23열 구조의 헤더로 변경
    if(window.$('tbInvHead')) {
        window.$('tbInvHead').innerHTML = `
            <tr>
                <th class="align-middle">순번</th>
                <th class="align-middle">강좌명</th>
                <th class="align-middle">수강료<br>단가</th>
                <th class="align-middle">강사료<br>단가</th>
                <th class="align-middle">수용비<br>단가</th>
                <th class="align-middle table-warning">수익자<br>인원</th>
                <th class="align-middle table-warning">수강료</th>
                <th class="align-middle table-warning">강사료</th>
                <th class="align-middle table-warning">수용비</th>
                <th class="align-middle bg-cho3">초3<br>인원</th>
                <th class="align-middle bg-cho3">수강료</th>
                <th class="align-middle bg-cho3">강사료</th>
                <th class="align-middle bg-cho3">수용비</th>
                <th class="align-middle bg-free">자유<br>인원</th>
                <th class="align-middle bg-free">수강료</th>
                <th class="align-middle bg-free">강사료</th>
                <th class="align-middle bg-free">수용비</th>
                <th class="align-middle table-danger">합계<br>인원</th>
                <th class="align-middle table-danger">수강료</th>
                <th class="align-middle table-danger">강사료</th>
                <th class="align-middle table-danger">수용비</th>
                <th class="align-middle">차액</th>
                <th class="align-middle">비고</th>
            </tr>`;
    }

    let h = ''; 
    if(!data.length) h = `<tr><td colspan="23" class="text-muted py-5 bg-light"><i class="bi bi-folder-x fs-2 d-block mb-2 text-danger"></i>출력할 청구서 데이터가 없습니다.</td></tr>`; 
    else { 
        let tSelf=0, tSelfI=0, tSelfM=0, tCho=0, tChoI=0, tChoM=0, tFree=0, tFreeI=0, tFreeM=0, tTot=0, tTotI=0, tTotM=0; 
        data.forEach(g => { tSelf+=g.selfFee; tSelfI+=g.selfInst; tSelfM+=g.selfMgmt; tCho+=g.cho3Fee; tChoI+=g.cho3Inst; tChoM+=g.cho3Mgmt; tFree+=g.freeFee; tFreeI+=g.freeInst; tFreeM+=g.freeMgmt; tTot+=g.totFee; tTotI+=g.totInst; tTotM+=g.totMgmt; }); 
        
        // 데이터 반복문 및 합계열 렌더링 시작
        h += `<tr class="sticky-bottom-row fw-bold text-center"><td colspan="5" class="text-end pe-3">총 합계</td><td></td><td class="text-warning">${window.fmt(tSelf)}</td><td class="text-warning">${window.fmt(tSelfI)}</td><td class="text-warning">${window.fmt(tSelfM)}</td><td></td><td class="text-primary">${window.fmt(tCho)}</td><td class="text-primary">${window.fmt(tChoI)}</td><td class="text-primary">${window.fmt(tChoM)}</td><td></td><td class="text-success">${window.fmt(tFree)}</td><td class="text-success">${window.fmt(tFreeI)}</td><td class="text-success">${window.fmt(tFreeM)}</td><td></td><td class="text-danger fs-6">${window.fmt(tTot)}</td><td class="text-danger">${window.fmt(tTotI)}</td><td class="text-danger">${window.fmt(tTotM)}</td><td colspan="2"></td></tr>`; 
        
        data.forEach((g, idx) => { 
            const uniqueMemos = [...new Set(g.memos)]; const diffFee = g.totFee - (g.baseT * g.totCnt); 
            h += `<tr><td>${idx+1}</td><td class="course-link" onclick="window.openCourseSummary('${g.c.replace(/'/g, "\\'")}', window.gQ, 'REPORT')">${g.c}</td><td>${window.fmt(g.baseT)}</td><td>${window.fmt(g.baseI)}</td><td>${window.fmt(g.baseM)}</td><td class="table-warning">${g.selfCnt}</td><td class="table-warning">${window.fmt(g.selfFee)}</td><td class="table-warning">${window.fmt(g.selfInst)}</td><td class="table-warning">${window.fmt(g.selfMgmt)}</td><td class="bg-cho3 text-primary">${g.cho3Cnt}</td><td class="bg-cho3 text-primary">${window.fmt(g.cho3Fee)}</td><td class="bg-cho3 text-primary">${window.fmt(g.cho3Inst)}</td><td class="bg-cho3 text-primary">${window.fmt(g.cho3Mgmt)}</td><td class="bg-free text-success">${g.freeCnt}</td><td class="bg-free text-success">${window.fmt(g.freeFee)}</td><td class="bg-free text-success">${window.fmt(g.freeInst)}</td><td class="bg-free text-success">${window.fmt(g.freeMgmt)}</td><td class="table-danger fw-bold text-danger">${g.totCnt}</td><td class="table-danger fw-bold text-danger">${window.fmt(g.totFee)}</td><td class="table-danger text-danger">${window.fmt(g.totInst)}</td><td class="table-danger text-danger">${window.fmt(g.totMgmt)}</td><td class="table-secondary text-danger fw-bold">${window.fmt(diffFee)}</td><td class="text-start small" style="max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${uniqueMemos.join(', ')}">${uniqueMemos.join(', ')}</td></tr>`; 
        }); 
    } 
    if(window.$('prev_inv')) window.$('prev_inv').innerHTML = h; 
};

window.exInvoice = function() { 
    const q = window.gQ, sVal = window.val('p_sInvoice'); const data = window.getInvoiceData(q, sVal); 
    if (!data.length) return alert('출력할 데이터가 없습니다.'); 
    const wb = XLSX.utils.book_new(); 
    const aoa = [ [`방과후학교 ${q}분기 ${sVal==='ALL'?'전체합산':sVal+'차'} 교육비 청구서`], [], [`1. 교육기간 : `], [`2. 입금계좌 : `], [`3. 청구내용 : `], [], [ '순번', '부서명', '1인당수강료', '1인당강사료', '1인당수용비', '수익자인원', '수익자수강료', '수익자강사료', '수익자수용비', '초3인원', '초3수강료', '초3강사료', '초3수용비', '자유인원', '자유수강료', '자유강사료', '자유수용비', '합계인원', '합계수강료', '합계강사료', '합계수용비', '차액(환불/조정)', '비고(수강료적요)' ] ]; 
    let idx = 1; let tSelf=0, tSelfI=0, tSelfM=0, tCho=0, tChoI=0, tChoM=0, tFree=0, tFreeI=0, tFreeM=0, tTot=0, tTotI=0, tTotM=0; 
    data.forEach(g => { 
        const diffFee = g.totFee - (g.baseT * g.totCnt); 
        aoa.push([ idx++, g.c, g.baseT, g.baseI, g.baseM, g.selfCnt, g.selfFee, g.selfInst, g.selfMgmt, g.cho3Cnt, g.cho3Fee, g.cho3Inst, g.cho3Mgmt, g.freeCnt, g.freeFee, g.freeInst, g.freeMgmt, g.totCnt, g.totFee, g.totInst, g.totMgmt, diffFee, [...new Set(g.memos)].join(', ') ]); 
        tSelf+=g.selfFee; tSelfI+=g.selfInst; tSelfM+=g.selfMgmt; tCho+=g.cho3Fee; tChoI+=g.cho3Inst; tChoM+=g.cho3Mgmt; tFree+=g.freeFee; tFreeI+=g.freeInst; tFreeM+=g.freeMgmt; tTot+=g.totFee; tTotI+=g.totInst; tTotM+=g.totMgmt; 
    }); 
    aoa.push(['총계', '', '', '', '', '', tSelf, tSelfI, tSelfM, '', tCho, tChoI, tChoM, '', tFree, tFreeI, tFreeM, '', tTot, tTotI, tTotM, '', '']); 
    const ws = XLSX.utils.aoa_to_sheet(aoa); 
    ws['!merges'] = [ {s:{r:0,c:0},e:{r:0,c:22}}, {s:{r:2,c:0},e:{r:2,c:3}}, {s:{r:2,c:4},e:{r:2,c:22}}, {s:{r:3,c:0},e:{r:3,c:3}}, {s:{r:3,c:4},e:{r:3,c:22}}, {s:{r:4,c:0},e:{r:4,c:22}} ]; 
    XLSX.utils.book_append_sheet(wb, ws, `${sVal==='ALL'?'전체':sVal+'차'} 청구서`); 
    XLSX.writeFile(wb, `${q}분기_${sVal==='ALL'?'전체합산':sVal+'차'}_교육비청구서.xlsx`); 
};

window.renderPreviewRef = function() { 
    const q = window.gQ; 
    const data = window.E.filter(e => e.q === q && (e.rT>0 || e.rB>0 || (e.adjusts&&e.adjusts.length>0))).map(e => ({ q: e.q, c: e.course, dp: window.dsp(e.g,e.b,e.n), nm: e.name, g: e.g, b: e.b, n: e.n, rT: e.rT, rB: e.rB, cT: e.cT, cB: e.cB, mm: e.mm })); 
    
    let h = ''; 
    if(!data.length) h = `<tr><td colspan="7" class="text-muted py-3">환불/조정 내역이 없습니다.</td></tr>`; 
    else { 
        data.forEach(r => { 
            const stuUid = window.uid(r.g, r.b, r.n, r.nm).replace(/'/g,"\\'"); 
            const safeCourse = r.c.replace(/'/g, "\\'"); 
            
            // 💡 1. 학적(dp) 중복 출력 제거 및 7열 구조 복원
            h += `<tr><td>${r.q}분기</td><td class="course-link" onclick="window.openCourseSummary('${safeCourse}', ${r.q}, 'REPORT')">${r.c}</td><td>${r.dp}</td><td class="fw-bold"><span class="clickable text-dark" onclick="window.openStuConsole('${stuUid}')">${r.nm}</span></td><td class="text-danger">${window.fmt(r.rT)}</td><td class="text-danger">${window.fmt(r.rB)}</td><td class="text-start" style="font-size:0.8rem;">${r.mm}</td></tr>`; 
        }); 
    } 
    if(window.$('prev_ref')) window.$('prev_ref').innerHTML = h; 
};

window.exRef = function() { 
    const q = window.gQ; 
    const data = window.E.filter(e => e.q === q && (e.rT>0 || e.rB>0 || (e.adjusts&&e.adjusts.length>0))).map(e => ({ q: e.q, c: e.course, dp: window.dsp(e.g,e.b,e.n), nm: e.name, g: e.g, b: e.b, n: e.n, rT: e.rT, rB: e.rB, cT: e.cT, cB: e.cB, mm: e.mm })); 
    if (!data.length) return alert('환불 내역이 없습니다.'); 
    const wb = XLSX.utils.book_new(); 
    const rows = data.map(r => ({ '분기': r.q+'분기', '학년': r.g, '반': r.b, '번호': r.n, '이름': r.nm, '강좌명': r.c, '환불_수강료': r.rT, '환불_교재비': r.rB, '실부담_수강료': r.cT, '실부담_교재비': r.cB, '사유_상세': r.mm })); 
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), '환불조정내역'); 
    XLSX.writeFile(wb, `${q}분기_환불_조정_사후증빙용_${new Date().toISOString().slice(0,10)}.xlsx`); 
};

window.getRosterData = function(q) { 
    const tg = window.val('p_tg'), so = window.val('p_so'); 
    let rows = window.Hs.filter(h => h.q === q).map(h => { 
        let t=0, b=0; 
        if (tg==='SELF') {t=h.finT;b=h.finB;} else if (tg==='CHO3') {t=h.tc;b=h.bc;} else if (tg==='FREE') {t=h.tf;b=h.bf;} else {t=h.sT;b=h.sB;} 
        return { g: h.g, ban: h.ban, n: h.num, nm: h.nm, c: h.c, t, b, tot: t+b }; 
    }).filter(x => x.tot > 0); 
    rows.sort((a,b) => so==='C' ? a.c.localeCompare(b.c)||a.g-b.g||a.ban-b.ban||a.n-b.n : a.g-b.g||a.ban-b.ban||a.n-b.n||a.nm.localeCompare(b.nm)); 
    return rows; 
};

window.renderPreviewRoster = function() { 
    const q = window.gQ; const data = window.getRosterData(q); let h = ''; 
    if(!data.length) { h = `<tr><td colspan="7" class="text-muted py-3">명단이 없습니다.</td></tr>`; } 
    else { 
        let totT=0, totB=0, totAll=0; 
        data.forEach((r, idx) => { 
            totT+=r.t; totB+=r.b; totAll+=r.tot; 
            const stuUid = window.uid(r.g, r.ban, r.n, r.nm).replace(/'/g,"\\'"); 
            h += `<tr><td>${idx+1}</td><td>${window.dsp(r.g,r.ban,r.n)}</td><td class="fw-bold"><span class="clickable text-dark" onclick="window.openStuConsole('${stuUid}')">${r.nm}</span></td><td>${r.c}</td><td>${window.fmt(r.t)}</td><td>${window.fmt(r.b)}</td><td class="fw-bold text-danger">${window.fmt(r.tot)}</td></tr>`; 
        }); 
        h += `<tr class="table-dark fw-bold sticky-total-row"><td colspan="4" class="text-warning text-end">총계</td><td class="text-warning">${window.fmt(totT)}</td><td class="text-warning">${window.fmt(totB)}</td><td class="text-danger">${window.fmt(totAll)}</td></tr>`; 
    } 
    if(window.$('prev_ros')) window.$('prev_ros').innerHTML = h; 
};

window.exRoster = function() { 
    const q = window.gQ; const data = window.getRosterData(q); 
    if (!data.length) return alert('추출할 명단이 없습니다.'); 
    const wb = XLSX.utils.book_new(); 
    const rows = data.map((r, idx) => ({ '연번': idx + 1, '학년': r.g, '반': r.ban, '번호': r.n, '이름': r.nm, '강좌명': r.c, '수강료': r.t, '교재비': r.b, '합계': r.tot })); 
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), '정산명단'); 
    const tg = window.val('p_tg'); let tgNm = "전체금액"; 
    if (tg === 'SELF') tgNm = "자부담"; else if (tg === 'CHO3') tgNm = "초3지원"; else if (tg === 'FREE') tgNm = "자유수강"; 
    XLSX.writeFile(wb, `${q}분기_${tgNm}_명단_${new Date().toISOString().slice(0,10)}.xlsx`); 
};