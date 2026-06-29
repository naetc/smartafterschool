/* ==========================================================================
   파일닉네임: app-ui-settle.js
   기능설명: Step 4 정산 마감, 예외처리(환불/조정), 모달(학생콘솔, 강좌명세서) UI
   ========================================================================== */
'use strict';

window.isFullyLocked = function(q, cName) {
    if (!window.C || !window.C[cName] || !window.C[cName][q]) return false;
    const mhArr = (window.C[cName][q].mh || '4,4,4').split(',').filter(x => window.num(x) > 0);
    const maxSess = mhArr.length;
    if (maxSess === 0) return false;
    return !!(window.SysSet.closedSess && window.SysSet.closedSess[`${q}_${maxSess - 1}`]);
};

window.setFilt = function(f) { 
    window.s4_filt = f; 
    if(window.$('fBtnA')) window.$('fBtnA').className = f === 'A' ? 'btn btn-sm btn-dark fw-bold' : 'btn btn-sm btn-outline-dark'; 
    if(window.$('fBtnF')) window.$('fBtnF').className = f === 'F' ? 'btn btn-sm btn-success fw-bold' : 'btn btn-sm btn-outline-success'; 
    if(window.$('fBtnC')) window.$('fBtnC').className = f === 'C' ? 'btn btn-sm btn-primary fw-bold' : 'btn btn-sm btn-outline-primary'; 
    window.renderSetTabs(); 
};

window.handleGlobalSearch = function() {
    const val = window.$('s4_search').value.trim();
    if (val && window.curS4Tab !== 'STU') {
        const btn = document.querySelector('#s4SubTabs button[data-bs-target="#tStuDtl"]');
        if (btn) btn.click();
    }
    window.renderSetTabs();
};

window.renderSetTabs = function() {
    const is3D = window.SysSet.accType === 'SEPARATED';
    const qVal = window.gQ; 
    const searchEl = window.$('s4_search');
    const searchKeyword = searchEl ? searchEl.value.trim().toLowerCase() : ''; 
    const sessNode = document.querySelector('input[name="s4_sessFilt"]:checked');
    const globalSessFilt = sessNode ? sessNode.value : 'ALL';

    function getTargetBadges(isC, isF) {
        let b = ''; if (isC) b += `<span class="badge badge-cho3">초3</span>`; if (isF) b += `<span class="badge badge-free">자유</span>`;
        if (!b) b = `<span class="badge bg-light text-secondary border">일반</span>`; return b;
    }
    function getDedBadge(e) { return (e.overrideCho3 || e.overrideFree) ? `<span class="badge bg-primary text-white">🔵 개별공제</span>` : ''; }

    const rawHList = window.Hs.filter(h => (h.q===qVal) && (window.s4_filt==='A' || (window.s4_filt==='F'&&h.isF) || (window.s4_filt==='C'&&h.isC)));
    
    const hList = rawHList.map(hItem => {
        if (globalSessFilt !== 'ALL') {
            const sIdx = Number(globalSessFilt);
            const sd = hItem.sessDetails && hItem.sessDetails[sIdx];
            if (sd) return { ...hItem, sT: sd.tT, sB: sd.tB, sM: sd.tM||0, tc: sd.tc, bc: sd.bc, mc: sd.mc||0, tf: sd.tf, bf: sd.bf, mf: sd.mf||0, finT: sd.finT, finB: sd.finB, finM: sd.finM||0 };
            else return { ...hItem, sT: 0, sB: 0, sM: 0, tc: 0, bc: 0, mc: 0, tf: 0, bf: 0, mf: 0, finT: 0, finB: 0, finM: 0 };
        }
        return hItem;
    });
    
    ['chkFiltAdj', 'chkFiltRef', 'chkFiltDed', 'chkFiltC_Adj', 'chkFiltC_Ref', 'chkFiltC_Ded'].forEach(id => {
        if(window.$(id)) {
            if(id.includes('Adj')) window.$(id).checked = !!window.s4_chkAdj;
            if(id.includes('Ref')) window.$(id).checked = !!window.s4_chkRef;
            if(id.includes('Ded')) window.$(id).checked = !!window.s4_chkDed;
        }
    });

    const hasExFilt = window.s4_chkAdj || window.s4_chkRef || window.s4_chkDed;
    function checkExFilt(h) {
        if (!hasExFilt) return true; 
        const hasAdj = h.e.adjusts && h.e.adjusts.some(a => !a.title.includes('[예외설정]'));
        const hasRef = h.e.refunds && h.e.refunds.length > 0;
        const hasDed = h.e.overrideCho3 || h.e.overrideFree;
        return (window.s4_chkAdj && hasAdj) || (window.s4_chkRef && hasRef) || (window.s4_chkDed && hasDed);
    }
    
    const chkWrap = window.$('closeSessChecks');
    if(chkWrap) {
        chkWrap.style.setProperty('display', 'flex', 'important'); 
        let chks = `<span class="small fw-bold text-dark d-flex align-items-center">🔒 시스템마감:</span>`;
        let maxSess = 1; Object.keys(window.C).forEach(c => { const m = (window.C[c]?.[qVal]?.mh || '4,4,4').split(',').filter(x => window.num(x) > 0).length; if (m > maxSess) maxSess = m; });
        for (let i = 0; i < maxSess; i++) { 
            const key = `${qVal}_${i}`; const isChecked = window.SysSet.closedSess[key] ? 'checked' : ''; 
            const isHardLocked = window.SysSet.closedSess[key] && window.SysSet.closedSess[key]._isHardLocked;
            const lblClass = isHardLocked ? 'text-danger fw-bold' : 'fw-bold'; const icon = isHardLocked ? '🛠️ ' : (isChecked ? '🔒 ' : '');
            chks += `<div class="form-check form-check-inline mb-0 ms-2"><input class="form-check-input ${isHardLocked?'border-danger':'border-warning'}" type="checkbox" id="chkClose_${i}" ${isChecked} onchange="window.toggleSessCheck(${qVal}, ${i}, this.checked)"><label class="form-check-label small ${lblClass}" for="chkClose_${i}">${icon}${i+1}차</label></div>`; 
        }
        chkWrap.innerHTML = chks;
    }
    
    if (hList.length === 0) {
        let emptyHtml = `<tr><td colspan="20" class="py-5 text-muted bg-light"><i class="bi bi-folder-x fs-2 d-block mb-2 text-danger"></i>데이터가 없습니다.</td></tr>`;
        if(window.$('tbStat')) window.$('tbStat').innerHTML = emptyHtml; 
        if(window.$('tbStuDtl')) window.$('tbStuDtl').innerHTML = emptyHtml; 
        if(window.$('tbCrseDtl')) window.$('tbCrseDtl').innerHTML = emptyHtml; 
        return;
    }

    let sH = ''; const st = {}; 
    hList.forEach(h => { 
        if (!st[h.c]) st[h.c] = {cnt:0,sT:0,sB:0,sM:0,tc:0,bc:0,mc:0,tf:0,bf:0,mf:0,fT:0,fB:0,fM:0}; 
        const s = st[h.c]; s.cnt++; s.sT+=h.sT; s.sB+=h.sB; s.sM+=(h.sM||0); s.tc+=h.tc; s.bc+=h.bc; s.mc+=(h.mc||0); s.tf+=h.tf; s.bf+=h.bf; s.mf+=(h.mf||0); s.fT+=h.finT; s.fB+=h.finB; s.fM+=(h.finM||0); 
    });
    Object.keys(st).sort().forEach(c => { 
        const s = st[c]; 
        const tdM_T = is3D ? `<td class="table-warning text-success">${window.fmt(s.sM)}</td>` : '';
        const tdM_C = is3D ? `<td class="bg-cho3 text-success">${window.fmt(s.mc)}</td>` : '';
        const tdM_F = is3D ? `<td class="bg-free text-success">${window.fmt(s.mf)}</td>` : '';
        const tdM_R = is3D ? `<td class="table-danger text-success fw-bold">${window.fmt(s.fM)}</td>` : '';
        sH += `<tr><td class="course-link" onclick="window.openCourseSummary('${c.replace(/'/g, "\\'")}', ${qVal})">${c}</td><td class="table-warning fw-bold">${s.cnt}</td><td class="table-warning">${window.fmt(s.sT)}</td><td class="table-warning">${window.fmt(s.sB)}</td>${tdM_T}<td class="bg-cho3 text-primary">${window.fmt(s.tc)}</td><td class="bg-cho3">${window.fmt(s.bc)}</td>${tdM_C}<td class="bg-free text-success">${window.fmt(s.tf)}</td><td class="bg-free">${window.fmt(s.bf)}</td>${tdM_F}<td class="table-danger fw-bold text-danger">${window.fmt(s.fT)}</td><td class="table-danger text-danger fw-bold">${window.fmt(s.fB)}</td>${tdM_R}</tr>`; 
    });
    
    const sumTot = (key) => hList.reduce((sum, h) => sum + (h[key]||0), 0);
    const sumHtmlM_T = is3D ? `<td class="text-warning">${window.fmt(sumTot('sM'))}</td>` : '';
    const sumHtmlM_C = is3D ? `<td class="text-primary">${window.fmt(sumTot('mc'))}</td>` : '';
    const sumHtmlM_F = is3D ? `<td class="text-success">${window.fmt(sumTot('mf'))}</td>` : '';
    const sumHtmlM_R = is3D ? `<td class="text-danger">${window.fmt(sumTot('finM'))}</td>` : '';
    sH += `<tr class="table-dark fw-bold sticky-bottom-row"><td colspan="2" class="text-warning">총 합계</td><td class="text-warning">${window.fmt(sumTot('sT'))}</td><td class="text-warning">${window.fmt(sumTot('sB'))}</td>${sumHtmlM_T}<td class="text-primary">${window.fmt(sumTot('tc'))}</td><td class="text-primary">${window.fmt(sumTot('bc'))}</td>${sumHtmlM_C}<td class="text-success">${window.fmt(sumTot('tf'))}</td><td class="text-success">${window.fmt(sumTot('bf'))}</td>${sumHtmlM_F}<td class="text-danger">${window.fmt(sumTot('finT'))}</td><td class="text-danger">${window.fmt(sumTot('finB'))}</td>${sumHtmlM_R}</tr>`;
    if(window.$('tbStat')) window.$('tbStat').innerHTML = sH;

    const stuList = hList.filter(h => (searchKeyword === '' || h.nm.toLowerCase().includes(searchKeyword) || h.dp.includes(searchKeyword)) && checkExFilt(h));
    let stuH = '';
    if (stuList.length === 0) {
        stuH = `<tr><td colspan="20" class="py-5 text-muted bg-light">조건에 맞는 데이터가 없습니다.</td></tr>`;
    } else {
        const lMap = {}; stuList.forEach(h => { if (!lMap[h.id]) lMap[h.id] = {L: window.Ld[h.id], items:[]}; lMap[h.id].items.push(h); });
        let lArr = Object.values(lMap);
        lArr.sort((a,b) => { 
            let res = 0; 
            if (window.sortState.col === 'DP') { let aP = a.L.dp.split('-').map(Number); let bP = b.L.dp.split('-').map(Number); res = (aP[0]-bP[0]) || (aP[1]-bP[1]) || (aP[2]-bP[2]); } 
            else if (window.sortState.col === 'NM') res = a.L.nm.localeCompare(b.L.nm); 
            else if (window.sortState.col === 'C') res = (a.L.qBal[qVal]?.cB||0) - (b.L.qBal[qVal]?.cB||0); 
            else if (window.sortState.col === 'F') res = (a.L.qBal[qVal]?.fB||0) - (b.L.qBal[qVal]?.fB||0); 
            return window.sortState.asc ? res : -res; 
        });
        
        ['DP','NM','C','F'].forEach(c => { const el = window.$('sort_'+c); if(el) { el.innerHTML = window.sortState.asc ? '<i class="bi bi-caret-up-fill text-primary"></i>' : '<i class="bi bi-caret-down-fill text-primary"></i>'; } });

        lArr.forEach(grp => { 
            let targetBadge = getTargetBadges(grp.L.isC, grp.L.isF);
            let snapBalC = 0; let snapBalF = 0;
            if (globalSessFilt !== 'ALL') {
                const sd = grp.items[0].sessDetails[Number(globalSessFilt)];
                if (sd) { snapBalC = sd.remCho3 || 0; snapBalF = sd.remFree || 0; }
            } else { snapBalC = grp.L.qBal[qVal] ? grp.L.qBal[qVal].cB : 0; snapBalF = grp.L.qBal[qVal] ? grp.L.qBal[qVal].fB : 0; }
			// 💡 [수정1] 엔진의 차감 연산 순서(e.seq)에 맞춰 4스텝 화면의 강좌 순서도 정렬!
            grp.items.sort((a,b) => (a.e.seq||0) - (b.e.seq||0) || a.c.localeCompare(b.c));
            grp.items.forEach((h, idx) => { 
                let auditBadge = window.getExceptionBadges(h.e);
                const tdM_T = is3D ? `<td class="table-warning text-success">${window.fmt(h.sM)}</td>` : '';
                const tdM_C = is3D ? `<td class="bg-cho3 text-success">${window.fmt(h.mc)}</td>` : '';
                const tdM_F = is3D ? `<td class="bg-free text-success">${window.fmt(h.mf)}</td>` : '';
                const tdM_R = is3D ? `<td class="table-danger text-success fw-bold">${window.fmt(h.finM)}</td>` : '';

                stuH += `<tr>`; 
                if (idx === 0) stuH += `<td rowspan="${grp.items.length}">${grp.L.dp}</td><td rowspan="${grp.items.length}" class="fw-bold"><span class="clickable text-dark" onclick="window.openStuConsole('${grp.L.id}')">${grp.L.nm}</span></td><td rowspan="${grp.items.length}">${targetBadge}</td><td rowspan="${grp.items.length}" class="text-primary fw-bold">${window.fmt(snapBalC)}</td><td rowspan="${grp.items.length}" class="text-success fw-bold">${window.fmt(snapBalF)}</td>`; 
                stuH += `<td>${h.q}분기</td><td class="course-link text-start" onclick="window.openCourseSummary('${h.c.replace(/'/g, "\\'")}', ${h.q})">${h.c}</td><td class="table-warning">${window.fmt(h.sT)}</td><td class="table-warning">${window.fmt(h.sB)}</td>${tdM_T}<td class="bg-cho3 text-primary">${window.fmt(h.tc)}</td><td class="bg-cho3 text-primary">${window.fmt(h.bc)}</td>${tdM_C}<td class="bg-free text-success">${window.fmt(h.tf)}</td><td class="bg-free text-success">${window.fmt(h.bf)}</td>${tdM_F}<td class="table-danger text-danger fw-bold">${window.fmt(h.finT)}</td><td class="table-danger text-danger fw-bold">${window.fmt(h.finB)}</td>${tdM_R}<td class="align-middle text-start col-reason">${getDedBadge(h.e)} ${auditBadge}</td></tr>`; 
            }); 
        });
        
        const sumTotStu = (key) => stuList.reduce((sum, h) => sum + (h[key]||0), 0);
        const stHtmlM_T = is3D ? `<td class="text-warning">${window.fmt(sumTotStu('sM'))}</td>` : '';
        const stHtmlM_C = is3D ? `<td class="text-primary">${window.fmt(sumTotStu('mc'))}</td>` : '';
        const stHtmlM_F = is3D ? `<td class="text-success">${window.fmt(sumTotStu('mf'))}</td>` : '';
        const stHtmlM_R = is3D ? `<td class="text-danger">${window.fmt(sumTotStu('finM'))}</td>` : '';

        stuH += `<tr class="table-dark fw-bold sticky-bottom-row"><td colspan="7" class="text-end pe-3 text-warning">검색된 학생 총 합계</td><td class="text-warning">${window.fmt(sumTotStu('sT'))}</td><td class="text-warning">${window.fmt(sumTotStu('sB'))}</td>${stHtmlM_T}<td class="text-primary">${window.fmt(sumTotStu('tc'))}</td><td class="text-primary">${window.fmt(sumTotStu('bc'))}</td>${stHtmlM_C}<td class="text-success">${window.fmt(sumTotStu('tf'))}</td><td class="text-success">${window.fmt(sumTotStu('bf'))}</td>${stHtmlM_F}<td class="text-danger">${window.fmt(sumTotStu('finT'))}</td><td class="text-danger">${window.fmt(sumTotStu('finB'))}</td>${stHtmlM_R}<td></td></tr>`;
    }
    if(window.$('tbStuDtl')) window.$('tbStuDtl').innerHTML = stuH;

    if(window.$('cFilterBtnGroup')) { 
        let cKeys = Object.keys(window.C).filter(c => { const isAct = window.C[c] && window.C[c][qVal] && window.C[c][qVal].isActive !== false; const hasData = hList.some(h => h.c === c); return isAct || hasData; }).sort();
        if (hList.some(h => h.c === '미배정(누락)') && !cKeys.includes('미배정(누락)')) { cKeys.push('미배정(누락)'); }
        let bh = `<button class="btn btn-sm ${window.s4_cFilter==='ALL'?'btn-primary fw-bold':'btn-outline-secondary'}" onclick="window.s4_cFilter='ALL';window.renderSetTabs();">전체강좌</button>`; 
        cKeys.forEach(c => { const btnClass = window.s4_cFilter === c ? 'btn-primary fw-bold' : (c === '미배정(누락)' ? 'btn-outline-danger fw-bold' : 'btn-outline-secondary'); bh += `<button class="btn btn-sm ${btnClass} ms-1" onclick="window.s4_cFilter='${c.replace(/'/g,"\\'")}';window.renderSetTabs();">${c}</button>`; }); 
        window.$('cFilterBtnGroup').innerHTML = bh; 
    }
    if(window.$('sessFilterBtnGroup')) window.$('sessFilterBtnGroup').innerHTML = '';

    let cList = hList; 
    if (window.s4_cFilter !== 'ALL') cList = cList.filter(h => h.c === window.s4_cFilter);
    cList = cList.filter(h => checkExFilt(h));

    let crsH = '';
    if (cList.length === 0) {
        crsH = `<tr><td colspan="20" class="py-5 text-muted bg-light">조건에 맞는 데이터가 없습니다.</td></tr>`;
    } else {
        cList.forEach(h => { 
            let targetBadge = getTargetBadges(h.isC, h.isF); let auditBadge = window.getExceptionBadges(h.e);
            const termStr = globalSessFilt !== 'ALL' ? `${Number(globalSessFilt)+1}차수` : `${h.q}분기`;
            
            const tdM_T = is3D ? `<td class="table-warning text-success">${window.fmt(h.sM)}</td>` : '';
            const tdM_C = is3D ? `<td class="bg-cho3 text-success">${window.fmt(h.mc)}</td>` : '';
            const tdM_F = is3D ? `<td class="bg-free text-success">${window.fmt(h.mf)}</td>` : '';
            const tdM_R = is3D ? `<td class="table-danger text-success fw-bold">${window.fmt(h.finM)}</td>` : '';

            crsH += `<tr><td>${termStr}</td><td>${h.dp}</td><td class="fw-bold"><span class="clickable text-dark" onclick="window.openStuConsole('${h.id}')">${h.nm}</span></td><td>${targetBadge}</td><td class="course-link" onclick="window.openCourseSummary('${h.c.replace(/'/g, "\\'")}', ${h.q})">${h.c}</td><td class="table-warning">${window.fmt(h.sT)}</td><td class="table-warning">${window.fmt(h.sB)}</td>${tdM_T}<td class="bg-cho3 text-primary">${window.fmt(h.tc)}</td><td class="bg-cho3 text-primary">${window.fmt(h.bc)}</td>${tdM_C}<td class="bg-free text-success">${window.fmt(h.tf)}</td><td class="bg-free text-success">${window.fmt(h.bf)}</td>${tdM_F}<td class="table-danger text-danger fw-bold">${window.fmt(h.finT)}</td><td class="table-danger text-danger fw-bold">${window.fmt(h.finB)}</td>${tdM_R}<td class="align-middle text-start col-reason">${getDedBadge(h.e)} ${auditBadge}</td></tr>`; 
        });

        const sumTotCrs = (key) => cList.reduce((sum, h) => sum + (h[key]||0), 0);
        const crHtmlM_T = is3D ? `<td class="text-warning">${window.fmt(sumTotCrs('sM'))}</td>` : '';
        const crHtmlM_C = is3D ? `<td class="text-primary">${window.fmt(sumTotCrs('mc'))}</td>` : '';
        const crHtmlM_F = is3D ? `<td class="text-success">${window.fmt(sumTotCrs('mf'))}</td>` : '';
        const crHtmlM_R = is3D ? `<td class="text-danger">${window.fmt(sumTotCrs('finM'))}</td>` : '';

        crsH += `<tr class="table-dark fw-bold sticky-bottom-row"><td colspan="5" class="text-end pe-3 text-warning">총 합계</td><td class="text-warning">${window.fmt(sumTotCrs('sT'))}</td><td class="text-warning">${window.fmt(sumTotCrs('sB'))}</td>${crHtmlM_T}<td class="text-primary">${window.fmt(sumTotCrs('tc'))}</td><td class="text-primary">${window.fmt(sumTotCrs('bc'))}</td>${crHtmlM_C}<td class="text-success">${window.fmt(sumTotCrs('tf'))}</td><td class="text-success">${window.fmt(sumTotCrs('bf'))}</td>${crHtmlM_F}<td class="text-danger">${window.fmt(sumTotCrs('finT'))}</td><td class="text-danger">${window.fmt(sumTotCrs('finB'))}</td>${crHtmlM_R}<td></td></tr>`;
    }
    if(window.$('tbCrseDtl')) window.$('tbCrseDtl').innerHTML = crsH;
};

window.toggleSessCheck = function(targetQ, sessIdx, isChecked) {
    const key = `${targetQ}_${sessIdx}`;
    if (!isChecked) {
        let maxSess = 0; Object.keys(window.C).forEach(c => { const m = (window.C[c]?.[targetQ]?.mh || '4,4,4').split(',').filter(x => window.num(x) > 0).length; if (m > maxSess) maxSess = m; });
        for (let i = sessIdx + 1; i < maxSess; i++) { if (window.SysSet.closedSess[`${targetQ}_${i}`]) { alert(`🚨 역순 해제 오류: 이후 차수(${i+1}차) 마감이 아직 닫혀 있어 ${sessIdx+1}차수를 해제할 수 없습니다.\n가장 최근 차수부터 역순으로 마감을 해제해 주세요.`); window.$('chkClose_'+sessIdx).checked = true; return; } }
        const isHardLocked = window.SysSet.closedSess[key] && window.SysSet.closedSess[key]._isHardLocked;
        if (isHardLocked) {
            const ans = prompt(`🚨 경고: 강제 교정 데이터 초기화 위험\n\n이 차수는 '엑셀 강제 업로드'를 통해 수동으로 고정된 데이터입니다.\n마감을 해제하면 보정된 금액 정보가 모두 [영구 삭제]되며, 시스템 공식으로 전면 재계산됩니다.\n\n정말 해제하시려면 '재계산'이라고 입력하세요.`);
            if (ans !== '재계산') { window.$('chkClose_'+sessIdx).checked = true; return; }
        } else { if (!confirm(`해당 분기 ${sessIdx+1}차 마감을 해제하시겠습니까?`)) { window.$('chkClose_'+sessIdx).checked = true; return; } }
        
        window.commitState(() => { delete window.SysSet.closedSess[key]; }); alert('마감이 해제되었습니다.');
    } else {
        for (let i = 0; i < sessIdx; i++) { if (!window.SysSet.closedSess[`${targetQ}_${i}`]) { alert(`🚨 마감 순서 오류: 이전 차수(${i+1}차)가 아직 마감되지 않았습니다.\n순차적으로 마감해 주세요.`); window.$('chkClose_'+sessIdx).checked = false; return; } }
        if (confirm(`해당 분기 ${sessIdx+1}차수를 마감하시겠습니까?\n\n이 시점의 청구액이 안전하게 고정됩니다. 이후 발생하는 환불액은 과거 장부를 건드리지 않고 별도로 모아서 확인할 수 있습니다.`)) {
            window.commitState(() => {
                const snapshot = { _isHardLocked: false }; const ls = window.Hs.filter(h => h.q === targetQ);
                ls.forEach(h => { 
                    const mhArr = (window.C[h.c]?.[targetQ]?.mh || '4,4,4').split(',').map(x => window.num(x)).filter(x => x > 0); if (sessIdx >= mhArr.length) return; 
                    snapshot[`${h.id}_${h.c}`] = { selfAmt: h.sessDetails[sessIdx].finT, selfBk: h.sessDetails[sessIdx].finB, selfMt: h.sessDetails[sessIdx].finM||0, cho3Amt: h.sessDetails[sessIdx].tc, cho3Bk: h.sessDetails[sessIdx].bc, cho3Mt: h.sessDetails[sessIdx].mc||0, freeAmt: h.sessDetails[sessIdx].tf, freeBk: h.sessDetails[sessIdx].bf, freeMt: h.sessDetails[sessIdx].mf||0 }; 
                });
                window.SysSet.closedSess[key] = snapshot; 
            });
            alert('마감되었습니다.');
        } else window.$('chkClose_'+sessIdx).checked = false;
    }
};

window.dlRoundtripExcel = function() {
    window.autoRunSet(true); 
    const qVal = window.num(window.val('s4_q')) || window.gQ; 
    const ls = window.Hs.filter(h => h.q === qVal); 
    if(!ls.length) return alert('다운로드할 정산 데이터가 없습니다.');
    const is3D = window.SysSet.accType === 'SEPARATED';

    let headers = [ "분기", "학년", "반", "번호", "이름", "강좌명", "분기 수강료(원가)", "분기 교재비(원가)" ];
    if (is3D) headers.push("분기 재료비(원가)");
    headers.push("초3지원_수강료공제", "초3지원_교재비공제");
    if (is3D) headers.push("초3지원_재료비공제");
    headers.push("자유수강_수강료공제", "자유수강_교재비공제");
    if (is3D) headers.push("자유수강_재료비공제");
    headers.push("최종_수강료자부담", "최종_교재비자부담");
    if (is3D) headers.push("최종_재료비자부담");

    let excelData = [headers];
    ls.forEach(h => { 
        let row = [ h.q, h.g, h.ban, h.num, h.nm, h.c, h.sT, h.sB ];
        if (is3D) row.push(h.sM || 0);
        row.push(h.tc, h.bc);
        if (is3D) row.push(h.mc || 0);
        row.push(h.tf, h.bf);
        if (is3D) row.push(h.mf || 0);
        row.push(h.finT, h.finB);
        if (is3D) row.push(h.finM || 0);
        excelData.push(row); 
    });

    const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, "분기상세_교정본");
    XLSX.writeFile(wb, `[${qVal}분기]방과후_정산결과_교정용_${new Date().toISOString().split('T')[0]}.xlsx`);
};

window.switchFromStuToCourse = function(cName, q) { 
    if(window.mdlConsole && window.mdlConsole._isShown) window.mdlConsole.hide(); 
    setTimeout(() => window.openCourseSummary(cName, q), 350); 
};

window.openStuConsole = function(uidStr) { 
    if(window.mdlCrsSummary && window.mdlCrsSummary._isShown) window.mdlCrsSummary.hide(); 
    window.cUid = uidStr; window.cEnrolls = []; 
    window.E.forEach((e, idx) => { if (window.uid(e.g, e.b, e.n, e.name) === uidStr && e.q === window.gQ) window.cEnrolls.push(idx); }); 
    if(window.cEnrolls.length === 0) return alert('해당 분기에 수강 내역이 없습니다.'); 
    window.cEnrolls.sort((a, b) => (window.E[a].seq || 0) - (window.E[b].seq || 0) || window.E[a].course.localeCompare(window.E[b].course));
    window.autoRunSet(true); window.cActiveEIdx = window.cEnrolls[0]; const p = uidStr.split('-'); 
    if(window.$('consoleTitle')) window.$('consoleTitle').innerHTML = `<i class="bi bi-person-lines-fill"></i> [${p[0]}학년 ${p[1]}반] ${p[3]} 통합 회계 콘솔 <span class="text-primary">(${window.gQ}분기)</span>`; 
    window.renderConsole(); setTimeout(() => window.mdlConsole.show(), 350); 
};

window.previewConsoleRef = function() { 
    if(window.cActiveEIdx < 0) return; const e = window.E[window.cActiveEIdx]; 
    const is3D = window.SysSet.accType === 'SEPARATED';
    const base = window.C[e.course]?.[e.q] || {t:0, b:0, m:0, mh:'4,4,4'}; 
    const mhArr = (base.mh || '4,4,4').split(',').map(x=>window.num(x)).filter(x=>x>0); 
    const ty = window.val('c_ref_ty'); const sIdx = window.num(window.$('c_ref_idx')?.value); 
    const ah = window.num(window.val('c_ref_ah')); const bkTy = window.val('c_ref_bk_ty');
    let rt = 0, rb = 0, rm = 0; 
    if (ty === 'BEFORE') { rt = base.t; rm = base.m || 0; } else { 
        const bT = window.getSessSplit(base.t, sIdx, mhArr); 
        if (ty === 'DISEASE') { 
            const md = window.M[e.course.replace(/\([A-Z]\)$/, '')]?.[e.q] || {}; 
            const cUnit = base.unit || md.unit || 1; 
            const unitFee = Math.ceil(((md.inst_m||0)+(md.mgmt_m||0))/(cUnit*4)/10)*10; 
            rt = Math.ceil((unitFee * ah)/10)*10; 
        } else if (ty === 'STUDENT') { 
            if (ah === 0) { rt = bT; } else { 
                const ratio = ah/(mhArr[sIdx]||4); 
                if (ratio <= 1/3) rt=Math.ceil(bT*(2/3)/10)*10; 
                else if (ratio <= 1/2) rt=Math.ceil(bT*(1/2)/10)*10; 
            } 
            for (let j = sIdx + 1; j < mhArr.length; j++) rt += window.getSessSplit(base.t, j, mhArr); 
        } 
    } 
    if (bkTy === 'FULL') { rb = base.b; rm = base.m || 0; } 
    else if (bkTy === 'MANUAL') { 
        rb = window.num(window.val('c_ref_bk_amt'));
        if(is3D) rm = window.num(window.val('c_ref_bk_amt_m'));
    }else {
        // '반환안함'을 포함한 그 외의 모든 경우 재료비 환불 0
        rb = 0;
        rm = 0;
    }
    
    let prevStr = `💡 예상 환불액: 수강료 <span class="text-danger">${window.fmt(rt)}</span>원 / 교재비 <span class="text-danger">${window.fmt(rb)}</span>원`;
    if(is3D) prevStr += ` / 재료비 <span class="text-danger">${window.fmt(rm)}</span>원`;
    if(window.$('c_ref_preview')) window.$('c_ref_preview').innerHTML = prevStr; 
};

window.updateConsoleRefHours = function() { 
    const e = window.E[window.cActiveEIdx]; if(!e) return; 
    const base = window.C[e.course]?.[e.q] || {t:0, b:0, mh:'4,4,4'}; 
    const mhArr = (base.mh || '4,4,4').split(',').map(x=>window.num(x)).filter(x=>x>0); 
    const idxEl = window.$('c_ref_idx'); const ahEl = window.$('c_ref_ah'); if(!idxEl || !ahEl) return; 
    const sIdx = window.num(idxEl.value); const maxH = mhArr[sIdx] || 4; 
    const currentVal = window.num(ahEl.value || 0); let opts = ''; 
    for(let i=0; i<=maxH; i++) { opts += `<option value="${i}" ${i === Math.min(currentVal, maxH) ? 'selected' : ''}>${i}시수</option>`; } 
    ahEl.innerHTML = opts; 
};

window.renderConsole = function() {
    const is3D = window.SysSet.accType === 'SEPARATED'; 
    const L = window.Ld[window.cUid] || { cB:0, fB:0, isC: false, isF: false, qBal: { 0: {cB:0, fB:0} } }; 
    const activeQ = window.gQ; 
    const balC = L.qBal ? (L.qBal[activeQ] ? L.qBal[activeQ].cB : 0) : 0; 
    const balF = L.qBal ? (L.qBal[activeQ] ? L.qBal[activeQ].fB : 0) : 0;
    
    let qTotalSelf = 0; 
    window.Hs.filter(h => h.id === window.cUid && h.q === activeQ).forEach(h => { 
        qTotalSelf += (h.finT + h.finB + (h.finM || 0)); 
    });
    
    const txtC = L.isC ? `<span class="text-primary">${window.fmt(balC)}원</span>` : `<span class="text-muted fs-6 fw-normal">대상아님</span>`;
    const txtF = L.isF ? `<span class="text-success">${window.fmt(balF)}원</span>` : `<span class="text-muted fs-6 fw-normal">대상아님</span>`;
    
    window.$('consoleTop').innerHTML = `<div><span class="small fw-bold text-primary">[${activeQ}분기] 초3 잔액</span><h5 class="fw-bold mb-0">${txtC}</h5></div><div><span class="small fw-bold text-success">[${activeQ}분기] 자유 잔액</span><h5 class="fw-bold mb-0">${txtF}</h5></div><div><span class="small fw-bold text-danger">[${activeQ}분기] 총 자부담금</span><h5 class="text-danger fw-bold mb-0">${window.fmt(qTotalSelf)}원</h5></div>`;
    
    let tT=0, tB=0, tM=0, tcT=0, tcB=0, tcM=0, tfT=0, tfB=0, tfM=0, finT=0, finB=0, finM=0;
    
    // 💡 오류 수정: <table ...> 태그를 명확히 열어줍니다.
    let tHeadHtml = `<table class="table table-sm table-bordered text-center align-middle mb-0" style="font-size:0.9rem;">
        <thead class="table-light"><tr>
        <th rowspan="2" class="align-middle" style="min-width: 130px;">강좌명(차감순)</th>
        <th colspan="${is3D?3:2}">실부담금(지원전)</th>
        <th colspan="${is3D?3:2}" class="bg-cho3 text-primary">초3 공제</th>
        <th colspan="${is3D?3:2}" class="bg-free text-success">자유 공제</th>
        <th colspan="${is3D?3:2}" class="text-danger fw-bold">최종(자부담)</th>
    </tr><tr>
        <th>수강</th><th>교재</th>${is3D?'<th>재료</th>':''}
        <th class="bg-cho3 text-primary">수강</th><th class="bg-cho3 text-primary">교재</th>${is3D?'<th class="bg-cho3 text-primary">재료</th>':''}
        <th class="bg-free text-success">수강</th><th class="bg-free text-success">교재</th>${is3D?'<th class="bg-free text-success">재료</th>':''}
        <th class="text-danger">수강</th><th class="text-danger">교재</th>${is3D?'<th class="text-danger">재료</th>':''}
    </tr></thead><tbody>`;
    
    let tBodyHtml = tHeadHtml;
    window.cEnrolls.forEach(i => { 
        const e = window.E[i]; const isActive = (i === window.cActiveEIdx);
        const hItem = window.Hs.find(h => h.e === e) || { sT:e.cT, sB:e.cB, sM:e.cM||0, tc:0, bc:0, mc:0, tf:0, bf:0, mf:0, finT:e.cT, finB:e.cB, finM:e.cM||0 };
        
        tT += hItem.sT; tB += hItem.sB; tM += (hItem.sM||0);
        tcT += hItem.tc; tcB += hItem.bc; tcM += (hItem.mc||0);
        tfT += hItem.tf; tfB += hItem.bf; tfM += (hItem.mf||0);
        finT += hItem.finT; finB += hItem.finB; finM += (hItem.finM||0);

        let trClass = isActive ? 'table-primary border-primary fw-bold' : '';
        
        // 💡 [수정2] <tr>에서 clickable 클래스 제거 -> 언더바 사라짐 (대신 cursor:pointer 추가)
        tBodyHtml += `<tr class="${trClass}" style="cursor:pointer;" onclick="window.setConsoleActive(${i})">
            <td class="text-start ps-1 text-nowrap">
                <div class="d-inline-flex flex-column align-items-center me-1 no-print" style="vertical-align: middle; width: 14px;">
                    <i class="bi bi-caret-up-fill text-secondary clickable" style="font-size: 0.7rem; line-height: 0.5;" onclick="event.stopPropagation(); window.moveCourseSeq(${i}, -1)" title="순서 올리기 (우선 차감)"></i>
                    <i class="bi bi-caret-down-fill text-secondary clickable" style="font-size: 0.7rem; line-height: 0.5; margin-top: 2px;" onclick="event.stopPropagation(); window.moveCourseSeq(${i}, 1)" title="순서 내리기"></i>
                </div>
                <span class="course-link" onclick="event.stopPropagation(); window.openCourseSummary('${e.course.replace(/'/g, "\\'")}', ${e.q})">${e.course}</span>
                ${isActive ? '<i class="bi bi-arrow-right-circle-fill text-primary float-end mt-1 ms-1"></i>' : ''}
            </td>
            <td>${window.fmt(hItem.sT)}</td><td>${window.fmt(hItem.sB)}</td>${is3D?`<td class="text-success">${window.fmt(hItem.sM||0)}</td>`:''}
            <td class="bg-cho3 fw-bold">${window.fmt(hItem.tc)}</td><td class="bg-cho3 fw-bold">${window.fmt(hItem.bc)}</td>${is3D?`<td class="bg-cho3 fw-bold">${window.fmt(hItem.mc||0)}</td>`:''}
            <td class="bg-free fw-bold">${window.fmt(hItem.tf)}</td><td class="bg-free fw-bold">${window.fmt(hItem.bf)}</td>${is3D?`<td class="bg-free fw-bold">${window.fmt(hItem.mf||0)}</td>`:''}
            <td class="text-danger fw-bold">${window.fmt(hItem.finT)}</td><td class="text-danger fw-bold">${window.fmt(hItem.finB)}</td>${is3D?`<td class="text-danger fw-bold">${window.fmt(hItem.finM||0)}</td>`:''}
        </tr>`; 
    }); 
    
    tBodyHtml += `<tr class="table-dark fw-bold">
        <td class="text-warning text-end pe-2">총계</td>
        <td class="text-warning">${window.fmt(tT)}</td><td class="text-warning">${window.fmt(tB)}</td>${is3D?`<td class="text-warning">${window.fmt(tM)}</td>`:''}
        <td class="text-primary">${window.fmt(tcT)}</td><td class="text-primary">${window.fmt(tcB)}</td>${is3D?`<td class="text-primary">${window.fmt(tcM)}</td>`:''}
        <td class="text-success">${window.fmt(tfT)}</td><td class="text-success">${window.fmt(tfB)}</td>${is3D?`<td class="text-success">${window.fmt(tfM)}</td>`:''}
        <td class="text-danger fs-6">${window.fmt(finT)}</td><td class="text-danger fs-6">${window.fmt(finB)}</td>${is3D?`<td class="text-danger fs-6">${window.fmt(finM)}</td>`:''}
    </tr></tbody></table>`;
    window.$('consoleTableContainer').innerHTML = tBodyHtml;

    const thM_Hist = is3D ? `<th>재료비 변화</th>` : '';
    let timelineHtml = `<table class="table table-sm table-hover table-bordered text-center align-middle mb-0" style="font-size:0.85rem;"><thead class="table-light"><tr><th>강좌명</th><th>유형</th><th>사유</th><th>수강료 변화</th><th>교재비 변화</th>${thM_Hist}<th class="no-print">삭제</th></tr></thead><tbody>`;
    let histCnt = 0;
    
    // 💡 [수정3] 값이 0일 경우 '-' 기호를 붙이지 않는 포맷 함수 도입
    const fmtRef = (val) => val === 0 ? '0' : `-${window.fmt(val)}`;

    window.cEnrolls.forEach(i => {
        const e = window.E[i]; const locked = window.isQuarterLocked(e.q); const dis = locked ? 'disabled' : '';
        e.adjusts.forEach((a, idx) => { 
            histCnt++; 
            let typeBadge = `<span class="badge bg-warning text-dark border border-warning">조정</span>`;
            let displayTitle = a.title;
            if (a.title.includes('[예외설정]')) { typeBadge = `<span class="badge bg-primary text-white border border-primary">개별공제</span>`; displayTitle = a.title.replace('[예외설정]', '').trim(); }
            const tdM = is3D ? `<td>${window.fmt(a.amtM||0)}</td>` : '';
            timelineHtml += `<tr><td class="text-start ps-2">${e.course}</td><td>${typeBadge}</td><td class="text-start">${displayTitle}</td><td>${window.fmt(a.amtT)}</td><td>${window.fmt(a.amtB)}</td>${tdM}<td class="no-print"><button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="window.setConsoleActive(${i}); setTimeout(()=>window.delConsoleHist('adj', ${idx}), 50)" ${dis} title="해당 강좌 타겟팅 후 삭제"><i class="bi bi-x"></i></button></td></tr>`; 
        });
        e.refunds.forEach((r, idx) => { 
            histCnt++; 
            const tdM = is3D ? `<td class="text-danger">${fmtRef(r.rm||0)}</td>` : '';
            // 💡 [수정3] 환불 내역 출력 시 fmtRef 사용
            timelineHtml += `<tr><td class="text-start ps-2">${e.course}</td><td><span class="badge bg-danger text-white">환불</span></td><td class="text-start">${r.tyNm||r.ty}</td><td class="text-danger">${fmtRef(r.rt)}</td><td class="text-danger">${fmtRef(r.rb)}</td>${tdM}<td class="no-print"><button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="window.setConsoleActive(${i}); setTimeout(()=>window.delConsoleHist('ref', ${idx}), 50)" ${dis} title="해당 강좌 타겟팅 후 삭제"><i class="bi bi-x"></i></button></td></tr>`; 
        });
    });
    if(!histCnt) timelineHtml += `<tr><td colspan="${is3D?7:6}" class="text-muted py-3">금액 변동 이력이 없습니다.</td></tr>`;
    timelineHtml += `</tbody></table>`;
    window.$('consoleTimelineContainer').innerHTML = timelineHtml;

    const e = window.E[window.cActiveEIdx], q = e.q, base = window.C[e.course]?.[q] || {t:0,b:0,m:0,mh:'4,4,4'}; 
    const fullyLocked = window.isFullyLocked(q, e.course);
    const partiallyLocked = window.isQuarterLocked(q) && !fullyLocked;
    const dis = fullyLocked ? 'disabled' : ''; 
    
    let lockBadge = '';
    if (fullyLocked) lockBadge = '<span class="badge bg-danger"><i class="bi bi-lock-fill"></i> 전체 마감됨</span>';
    else if (partiallyLocked) lockBadge = '<span class="badge bg-warning text-dark border border-warning"><i class="bi bi-unlock-fill"></i> 부분 마감됨(진행중)</span>';

    let hAction = `<h6 class="fw-bold text-dark border-bottom pb-2 d-flex justify-content-between align-items-center"><span><i class="bi bi-crosshair text-primary"></i> 제어 대상: <span class="text-primary">${e.course}</span></span>${lockBadge}</h6>`;
    
    // 💡 1. 실부담금 강제 조정 패널
    const adjM_Input = is3D ? `<input type="number" id="c_adj_m" class="form-control form-control-sm text-end border-success text-success fw-bold" placeholder="재료비 증감" ${dis}>` : '';
    hAction += `<div class="card mb-2 border-warning no-print"><div class="card-header bg-warning bg-opacity-10 py-1 fw-bold small text-dark">✍️ 1. 실부담금 강제 조정</div><div class="card-body p-2"><input type="text" id="c_adj_title" class="form-control form-control-sm mb-1" placeholder="조정 사유 (예: 다자녀할인)" ${dis}><div class="d-flex gap-1 mb-2"><input type="number" id="c_adj_t" class="form-control form-control-sm text-end" placeholder="수강료 증감" ${dis}><input type="number" id="c_adj_b" class="form-control form-control-sm text-end" placeholder="교재비 증감" ${dis}>${adjM_Input}</div><button class="btn btn-warning btn-sm w-100 fw-bold shadow-sm" onclick="window.addConsoleAdj()" ${dis}>조정액 반영</button></div></div>`;
    
    // 💡 2. 환불 및 결석 처리 패널
    const options = base.mh.split(',').map((_,idx)=> {
        const isSessLocked = window.SysSet.closedSess && window.SysSet.closedSess[`${q}_${idx}`];
        return `<option value="${idx}" ${isSessLocked ? 'disabled' : ''}>${idx+1}차수 환불 ${isSessLocked ? '(🔒마감됨)' : ''}</option>`;
    }).join('');
    
    const refM_Input = is3D ? `<input type="number" id="c_ref_bk_amt_m" class="form-control form-control-sm d-none border-success text-success fw-bold" placeholder="재료비 환불" oninput="window.previewConsoleRef()" ${dis}>` : '';
    hAction += `<div class="card mb-2 border-danger no-print"><div class="card-header bg-danger bg-opacity-10 py-1 fw-bold small text-dark">💸 2. 환불 및 결석 처리</div><div class="card-body p-2"><select id="c_ref_ty" class="form-select form-select-sm mb-1" onchange="window.toggleRefInputs(); window.previewConsoleRef();" ${dis}><option value="BEFORE">개시전(전액환불)</option><option value="DISEASE">결석(일할계산)</option><option value="STUDENT">포기(구간합산)</option></select><div class="d-flex gap-1 mb-1"><select id="c_ref_idx" class="form-select form-select-sm w-50" onchange="window.updateConsoleRefHours(); window.previewConsoleRef();" ${dis}>${options}</select><select id="c_ref_ah" class="form-select form-select-sm w-50" onchange="window.previewConsoleRef()" ${dis}></select></div><div class="border-top pt-1 mt-1 mb-2"><label class="small text-muted mb-1">교재/재료비 반환 옵션</label><select id="c_ref_bk_ty" class="form-select form-select-sm mb-1" onchange="window.toggleRefInputs(); window.previewConsoleRef();" ${dis}><option value="NONE">반환 안함</option><option value="FULL">분기 전액 반환</option><option value="MANUAL">수동 금액 입력</option></select><div class="d-flex gap-1"><input type="number" id="c_ref_bk_amt" class="form-control form-control-sm d-none" placeholder="교재비 환불" oninput="window.previewConsoleRef()" ${dis}>${refM_Input}</div></div><div id="c_ref_preview" class="text-center small fw-bold text-danger mb-1 bg-light rounded py-1">예상: 수강료 0 / 교재비 0</div><button class="btn btn-danger btn-sm w-100 fw-bold shadow-sm" onclick="window.addConsoleRef()" ${dis}>환불 승인</button></div></div>`;
    
    // 💡 3. 개별공제 설정
    const curC = e.overrideCho3 || ''; const curF = e.overrideFree || '';
    const defC = window.SysSet.cho3Priority || (is3D ? 'T,B,M' : 'T,B'); 
    const defF = window.SysSet.freePriority || (is3D ? 'T,B,M' : 'T,B');

    const opts2D = [
        { v: 'T,B', l: '수강료 ➔ 교재비' },
        { v: 'B,T', l: '교재비 ➔ 수강료' },
        { v: 'T', l: '수강료 전용 (교재비 불가)' }
    ];
    const opts3D = [
        { v: 'T,B,M', l: '수강료 ➔ 교재비 ➔ 재료비' },
        { v: 'T,M,B', l: '수강료 ➔ 재료비 ➔ 교재비' },
        { v: 'B,M,T', l: '교재비 ➔ 재료비 ➔ 수강료' },
        { v: 'M,B,T', l: '재료비 ➔ 교재비 ➔ 수강료' },
        { v: 'T', l: '수강료 전용 (교재/재료비 불가)' }
    ];
    
    const arrOpts = is3D ? opts3D : opts2D;
    function getOptName(val) { const found = arrOpts.find(o => o.v === val); return found ? found.l : val; }

    let cho3OptsHtml = `<option value="" ${curC===''?'selected':''}>🌐 기본값 (${getOptName(defC)})</option>`;
    arrOpts.forEach(o => { cho3OptsHtml += `<option value="${o.v}" ${curC===o.v?'selected':''}>⚠️ [예외] ${o.l}</option>`; });

    let freeOptsHtml = `<option value="" ${curF===''?'selected':''}>🌐 기본값 (${getOptName(defF)})</option>`;
    arrOpts.forEach(o => { freeOptsHtml += `<option value="${o.v}" ${curF===o.v?'selected':''}>⚠️ [예외] ${o.l}</option>`; });

    hAction += `<div class="card border-primary no-print"><div class="card-header bg-primary text-white py-1 fw-bold small">⚙️ 3. 개별공제 설정 (Local Override)</div><div class="card-body p-2">
        <label class="small fw-bold text-primary mb-1">초3 지원금 예외</label>
        <select id="c_rule_cho3" class="form-select form-select-sm mb-2 border-primary bg-primary bg-opacity-10" ${dis}>
            ${cho3OptsHtml}
        </select>
        <label class="small fw-bold text-success mb-1">자유수강권 예외</label>
        <select id="c_rule_free" class="form-select form-select-sm mb-3 border-success bg-success bg-opacity-10" ${dis}>
            ${freeOptsHtml}
        </select>
        <button class="btn btn-dark btn-sm w-100 fw-bold shadow-sm py-2" onclick="window.saveConsoleRule()" ${dis}><i class="bi bi-check-circle-fill"></i> 개별공제 저장</button>
    </div></div>`;
    
    window.$('consoleActionPanel').innerHTML = hAction;

    window.toggleRefInputs = function() { 
        const ty = window.$('c_ref_ty')?.value; 
        const bkTy = window.$('c_ref_bk_ty')?.value; 
        if(ty === 'BEFORE') { 
            if(window.$('c_ref_idx')) window.$('c_ref_idx').disabled = true; 
            if(window.$('c_ref_ah')) window.$('c_ref_ah').disabled = true; 
        } else { 
            if(window.$('c_ref_idx')) window.$('c_ref_idx').disabled = fullyLocked; 
            if(window.$('c_ref_ah')) window.$('c_ref_ah').disabled = fullyLocked; 
        } 
        
        if (window.$('c_ref_bk_amt')) { 
            if (bkTy === 'MANUAL') {
                window.$('c_ref_bk_amt').classList.remove('d-none'); 
                if (window.$('c_ref_bk_amt_m')) window.$('c_ref_bk_amt_m').classList.remove('d-none'); 
            } else {
                window.$('c_ref_bk_amt').classList.add('d-none'); 
                if (window.$('c_ref_bk_amt_m')) window.$('c_ref_bk_amt_m').classList.add('d-none'); 
            }
        } 
        window.updateConsoleRefHours(); 
    };
    setTimeout(() => { window.updateConsoleRefHours(); window.toggleRefInputs(); window.previewConsoleRef(); }, 0);
};

window.setConsoleActive = function(i) { window.cActiveEIdx = i; window.renderConsole(); };

window.addConsoleAdj = function() { 
    const e = window.E[window.cActiveEIdx]; 
    if (window.isFullyLocked(e.q, e.course)) return alert('🔒 전체 마감된 강좌이므로 조정이 불가합니다.'); 
    
    const is3D = window.SysSet.accType === 'SEPARATED';
    const t = window.val('c_adj_title');
    const aT = window.num(window.val('c_adj_t'));
    const aB = window.num(window.val('c_adj_b')); 
    const aM = is3D ? window.num(window.val('c_adj_m')) : 0; 
    
    if(!t) return alert('조정 사유 필수'); 
    window.commitState(() => { e.adjusts.push({ title:t, amtT:aT, amtB:aB, amtM:aM }); }); 
};

window.addConsoleRef = function() { 
    const e = window.E[window.cActiveEIdx]; 
    if (window.isFullyLocked(e.q, e.course)) return alert('🔒 전체 마감된 강좌입니다.'); 
    const si = window.num(window.$('c_ref_idx').value);
    
    if (window.SysSet.closedSess && window.SysSet.closedSess[`${e.q}_${si}`]) {
        return alert(`🔒 ${si+1}차수는 이미 마감되었습니다.\n환불을 진행하려면 먼저 4스텝에서 ${si+1}차 마감을 해제해 주세요.`);
    }
// 💡 [누락되었던 핵심 코드 추가] 기초 금액 정보(base)를 먼저 정의합니다.
    const base = window.C[e.course]?.[e.q] || {t:0, b:0, m:0, mh:'4,4,4'};
    const is3D = window.SysSet.accType === 'SEPARATED';
    const ty = window.val('c_ref_ty');
    const ah = window.num(window.val('c_ref_ah'));
    const bkTy = window.val('c_ref_bk_ty'); 
    const bkAmt = bkTy === 'MANUAL' ? window.num(window.val('c_ref_bk_amt')) : 0; 
    const bkAmtM = (is3D && bkTy === 'MANUAL') ? window.num(window.val('c_ref_bk_amt_m')) : 0; 
    
	// 재료비 환불액(rm) 변수 정의 추가
    let finalRm = (bkTy === 'FULL') ? (base.m || 0) : (bkTy === 'MANUAL' ? bkAmtM : 0);
	
    window.commitState(() => { 
        e.refunds.push({ sessIdx:si, ty, ah, reqBk:false, bkRefTy: bkTy, bkRefAmt: bkAmt, bkRefAmtM: bkAmtM, rt:0, rb:0, rm: finalRm, tyNm:'' });
    }); 
};

window.saveConsoleRule = function() {
    const e = window.E[window.cActiveEIdx]; 
    if (window.isFullyLocked(e.q, e.course)) return alert('🔒 전체 마감된 분기입니다.');
    const oC = window.val('c_rule_cho3') || null; const oF = window.val('c_rule_free') || null;
    
    function rNm(v) { 
        if(v==='T,B,M') return '수강➔교재➔재료'; if(v==='T,M,B') return '수강➔재료➔교재';
        if(v==='B,M,T') return '교재➔재료➔수강'; if(v==='M,B,T') return '재료➔교재➔수강';
        if(v==='T,B') return '수강료우선'; if(v==='B,T') return '교재비우선'; 
        if(v==='T') return '수강료전용'; return ''; 
    }
    
    window.commitState(() => {
        e.adjusts = (e.adjusts || []).filter(a => !a.title.includes('[예외설정]'));
        e.overrideCho3 = oC; e.overrideFree = oF;
        let finalLogs = []; if (oC) finalLogs.push(`초3:${rNm(oC)}`); if (oF) finalLogs.push(`자유:${rNm(oF)}`);
        if (finalLogs.length > 0) e.adjusts.push({ title: `[예외설정] ${finalLogs.join(', ')}`, amtT: 0, amtB: 0 });
    });
};

window.delConsoleHist = function(ty, idx) { 
    const e = window.E[window.cActiveEIdx]; 
    if (window.isFullyLocked(e.q, e.course)) return alert('🔒 전체 마감된 강좌입니다.'); 
    
    if (ty === 'ref') {
        const ref = e.refunds[idx];
        if (window.SysSet.closedSess && window.SysSet.closedSess[`${e.q}_${ref.sessIdx}`]) {
            return alert(`🔒 해당 환불이 속한 ${ref.sessIdx+1}차수는 이미 마감되었습니다.\n이력을 삭제하시려면 먼저 차수 마감을 해제해 주세요.`);
        }
    }

    window.commitState(() => { 
        if (ty === 'adj') {
            const adj = e.adjusts[idx];
            if (adj.title.includes('[예외설정]')) {
                if (!confirm('이 이력을 삭제하면 설정된 개별 공제 룰이 모두 글로벌 설정(기본값)으로 초기화됩니다.\n진행하시겠습니까?')) return;
                e.overrideCho3 = null; e.overrideFree = null;
                e.adjusts = e.adjusts.filter(a => !a.title.includes('[예외설정]'));
            } else { e.adjusts.splice(idx, 1); }
        } else { e.refunds.splice(idx, 1); }
    }); 
};

window.moveCourseSeq = function(eIdx, dir) {
    const e = window.E[eIdx]; if (window.isQuarterLocked(e.q)) return alert('🔒 마감된 분기이므로 순서를 변경할 수 없습니다.');
    window.commitState(() => {
        let siblings = window.E.filter(x => window.uid(x.g, x.b, x.n, x.name) === window.cUid && x.q === e.q);
        siblings.sort((a,b) => (a.seq || 0) - (b.seq || 0) || a.course.localeCompare(b.course));
        siblings.forEach((x, i) => { x.seq = i; });
        const currIdx = siblings.findIndex(x => x === e); const targetIdx = currIdx + dir;
        if (targetIdx >= 0 && targetIdx < siblings.length) {
            let temp = siblings[currIdx].seq; siblings[currIdx].seq = siblings[targetIdx].seq; siblings[targetIdx].seq = temp;
            window.cEnrolls.sort((a, b) => (window.E[a].seq || 0) - (window.E[b].seq || 0) || window.E[a].course.localeCompare(window.E[b].course));
        }
    });
};

window.curCrsName = ''; window.curCrsQ = 1; window.curCrsIsExact = false; window.curMoveIdxs = [];

// 1. 팝업창을 열 때 입력칸 초기화 및 3D(재료비) 모드 동적 표출
window.openCourseSummary = function(cName, q, mode = 'EDIT') {
    if(!window.$('crsSummaryTitle') || !window.mdlCrsSummary) return;
    window.curCrsName = cName; window.curCrsQ = q; window.curCrsIsExact = !!window.C[cName];
    window.curCrsMode = mode; window.curCrsSess = 'ALL'; 

    const fullyLocked = window.isFullyLocked(q, cName);
    const partiallyLocked = window.isQuarterLocked(q) && !fullyLocked;
    let badge = '';
    if (fullyLocked) badge = `<span class="badge bg-danger align-middle ms-2" style="font-size:0.8rem;"><i class="bi bi-lock-fill"></i> 전체 마감됨</span>`;
    else if (partiallyLocked) badge = `<span class="badge bg-warning text-dark align-middle ms-2" style="font-size:0.8rem;"><i class="bi bi-unlock-fill"></i> 부분 마감됨(진행중)</span>`;

    if (mode === 'REPORT') {
        window.$('crsSummaryTitle').innerHTML = `<i class="bi bi-file-earmark-text-fill"></i> [${q}분기] ${cName} 상세 명세서 (조회전용)` + badge;
        if (window.$('bulkActionWrap')) window.$('bulkActionWrap').style.display = 'none';
    } else {
        window.$('crsSummaryTitle').innerHTML = `<i class="bi bi-collection-play-fill"></i> [${q}분기] ${cName} 정산 명세 및 일괄 조정` + badge;
        
        // 💡 3구역 입력칸 초기화 및 3D 동적 할당
        if(window.$('bulk_memo')) window.$('bulk_memo').value = ''; 
        if(window.$('bulk_adj_t')) window.$('bulk_adj_t').value = ''; 
        if(window.$('bulk_adj_b')) window.$('bulk_adj_b').value = '';
        if(window.$('bulk_adj_m')) {
            window.$('bulk_adj_m').value = '';
            window.$('bulk_adj_m').style.display = (window.SysSet.accType === 'SEPARATED') ? 'block' : 'none';
        }
        
        const wrap = window.$('bulkActionWrap'); 
        if (wrap) wrap.style.display = fullyLocked ? 'none' : 'flex'; 
    }

    window.renderCourseModalBody([]); window.mdlCrsSummary.show();
};

window.renderCourseModalBody = function(savedUids = []) {
    const is3D = window.SysSet.accType === 'SEPARATED';
    const cName = window.curCrsName; 
    const q = window.curCrsQ; 
    const isExact = window.curCrsIsExact; 
    const fullyLocked = window.isFullyLocked(q, cName);
    const mode = window.curCrsMode || 'EDIT';
    const sessFilt = window.curCrsSess || 'ALL'; 

    const list = window.Hs.filter(h => h.q === q && (isExact ? h.c === cName : h.c.replace(/\s*\([A-Za-z가-힣0-9]+\)$/, '').trim() === cName));
    let base = {t:0, b:0, m:0}; 
    if (isExact) { base = window.C[cName]?.[q] || {t:0, b:0, m:0}; } 
    else if (list.length > 0) { base = window.C[list[0].c]?.[q] || {t:0, b:0, m:0}; }
    
    let headerLabel = mode === 'REPORT' ? '정산인원' : '수강인원';
    
    let sessBtnHtml = '';
    if (mode === 'REPORT') {
        const maxSess = (base.mh || '4,4,4').split(',').filter(x => window.num(x) > 0).length || 3;
        sessBtnHtml = `<div class="btn-group btn-group-sm mt-3 w-100" role="group"><button type="button" class="btn ${sessFilt==='ALL'?'btn-dark':'btn-outline-dark'}" onclick="window.curCrsSess='ALL'; window.renderCourseModalBody();">전체 차수</button>`;
        for (let i=0; i<maxSess; i++) {
            sessBtnHtml += `<button type="button" class="btn ${sessFilt===String(i)?'btn-dark':'btn-outline-dark'}" onclick="window.curCrsSess='${i}'; window.renderCourseModalBody();">${i+1}차수만</button>`;
        }
        sessBtnHtml += `</div>`;
    }

    const mBaseHtml = is3D ? `<div><strong>기초 재료비:</strong> ${window.fmt(base.m||0)}원</div>` : '';
    window.$('crsSummaryTop').innerHTML = `<div class="p-2 bg-light border rounded text-center"><div class="d-flex justify-content-around"><div><strong>기초 수강료:</strong> ${window.fmt(base.t)}원</div><div><strong>기초 교재비:</strong> ${window.fmt(base.b)}원</div>${mBaseHtml}<div><strong>${headerLabel}:</strong> <span class="text-primary fw-bold">${list.length}명</span></div></div>${sessBtnHtml}</div>`;
    
    let h = '';
    if(!list.length) { 
        h = `<tr><td colspan="15" class="text-muted py-4">수강생이 없습니다.</td></tr>`; 
        if(window.$('crsSummaryHead')) window.$('crsSummaryHead').innerHTML = `<tr><th>안내</th></tr>`;
    } else {
        list.sort((a,b)=>{ let aP = a.dp.split('-').map(Number); let bP = b.dp.split('-').map(Number); return (aP[0]-bP[0]) || (aP[1]-bP[1]) || (aP[2]-bP[2]); });
        
        if (mode === 'REPORT') {
            const thM = is3D ? `<th class="table-warning">재료비</th><th class="bg-cho3">초3 재료</th><th class="bg-free">자유 재료</th><th class="text-danger">최종 재료</th>` : '';
            if(window.$('crsSummaryHead')) window.$('crsSummaryHead').innerHTML = `<tr><th>학적</th><th>이름</th><th>대상</th><th class="table-warning">수강료</th><th class="table-warning">교재비</th><th class="bg-cho3">초3 수강</th><th class="bg-cho3">초3 교재</th><th class="bg-free">자유 수강</th><th class="bg-free">자유 교재</th><th class="text-danger">최종 수강</th><th class="text-danger">최종 교재</th>${thM}<th>산출근거</th></tr>`;
            
            const cSum = {sT:0, sB:0, sM:0, tc:0, bc:0, mc:0, tf:0, bf:0, mf:0, finT:0, finB:0, finM:0};
            list.forEach(hItem => { 
                let d = hItem;
                if (sessFilt !== 'ALL') {
                    const tSess = Number(sessFilt);
                    const sd = hItem.sessDetails[tSess];
                    if (sd) { d = { ...hItem, sT: sd.tT, sB: sd.tB, sM: sd.tM||0, tc: sd.tc, bc: sd.bc, mc: sd.mc||0, tf: sd.tf, bf: sd.bf, mf: sd.mf||0, finT: sd.finT, finB: sd.finB, finM: sd.finM||0 }; }
                    else { d = { ...hItem, sT: 0, sB: 0, sM: 0, tc: 0, bc: 0, mc: 0, tf: 0, bf: 0, mf: 0, finT: 0, finB: 0, finM: 0 }; }
                }

                cSum.sT += d.sT; cSum.sB += d.sB; cSum.sM += (d.sM||0); cSum.tc+=d.tc; cSum.bc+=d.bc; cSum.mc+=(d.mc||0); cSum.tf+=d.tf; cSum.bf+=d.bf; cSum.mf+=(d.mf||0); cSum.finT+=d.finT; cSum.finB+=d.finB; cSum.finM+=(d.finM||0);
                
                let targetBadge = '';
                if (hItem.isC) targetBadge += `<span class="badge badge-cho3">초3</span>`;
                if (hItem.isF) targetBadge += `<span class="badge badge-free">자유</span>`;
                if (!targetBadge) targetBadge = `<span class="badge bg-light text-secondary border">일반</span>`;
                
                let auditBadge = window.getExceptionBadges(hItem.e);
                const classNameTag = !isExact ? `<span class="badge bg-secondary ms-1" style="font-size:0.7em;">${hItem.c.replace(cName,'').replace(/[()]/g,'').trim()}반</span>` : '';
                
                const tdM = is3D ? `<td>${window.fmt(d.sM||0)}</td><td class="bg-cho3 text-primary">${window.fmt(d.mc||0)}</td><td class="bg-free text-success">${window.fmt(d.mf||0)}</td><td class="text-danger fw-bold">${window.fmt(d.finM||0)}</td>` : '';

                h += `<tr><td>${hItem.dp}</td><td class="fw-bold text-start ps-2"><span class="clickable text-dark" onclick="window.openStuConsole('${hItem.id}')">${hItem.nm}</span>${classNameTag}</td><td>${targetBadge}</td><td>${window.fmt(d.sT)}</td><td>${window.fmt(d.sB)}</td><td class="bg-cho3 text-primary">${window.fmt(d.tc)}</td><td class="bg-cho3 text-primary">${window.fmt(d.bc)}</td><td class="bg-free text-success">${window.fmt(d.tf)}</td><td class="bg-free text-success">${window.fmt(d.bf)}</td><td class="text-danger fw-bold">${window.fmt(d.finT)}</td><td class="text-danger fw-bold">${window.fmt(d.finB)}</td>${tdM}<td class="text-start" style="font-size:0.8rem;">${auditBadge}</td></tr>`; 
            });
            
            const tdSumM = is3D ? `<td class="text-warning">${window.fmt(cSum.sM)}</td><td class="text-primary">${window.fmt(cSum.mc)}</td><td class="text-success">${window.fmt(cSum.mf)}</td><td class="text-danger">${window.fmt(cSum.finM)}</td>` : '';
            h += `<tr class="table-dark fw-bold sticky-bottom-row"><td colspan="3" class="text-end pe-3 text-warning">총 합계</td><td class="text-warning">${window.fmt(cSum.sT)}</td><td class="text-warning">${window.fmt(cSum.sB)}</td><td class="text-primary">${window.fmt(cSum.tc)}</td><td class="text-primary">${window.fmt(cSum.bc)}</td><td class="text-success">${window.fmt(cSum.tf)}</td><td class="text-success">${window.fmt(cSum.bf)}</td><td class="text-danger">${window.fmt(cSum.finT)}</td><td class="text-danger">${window.fmt(cSum.finB)}</td>${tdSumM}<td></td></tr>`;
            
        } else {
            const thM = is3D ? `<th class="table-warning">실부담 재료비</th>` : '';
            const thM_adj = is3D ? `<th class="table-warning" style="width: 80px;">재료(±)</th>` : '';
            if(window.$('crsSummaryHead')) window.$('crsSummaryHead').innerHTML = `<tr><th><input type="checkbox" id="chkAllStu" class="form-check-input" checked onclick="window.toggleAllCourseStu(this)"></th><th>학적</th><th>이름</th><th>대상</th><th>실부담 수강료</th><th>실부담 교재비</th>${thM}<th class="table-warning" style="width: 80px;">수강(±)</th><th class="table-warning" style="width: 80px;">교재(±)</th>${thM_adj}<th class="table-warning" style="width: 140px;">📝 사유(선택)</th><th class="table-warning" style="width: 60px;">관리</th></tr>`;
            
            const cSum = {sT:0, sB:0, sM:0};
            list.forEach(hItem => { 
                cSum.sT += hItem.sT; cSum.sB += hItem.sB; cSum.sM += (hItem.sM||0);
                const classNameTag = !isExact ? `<span class="badge bg-secondary ms-1" style="font-size:0.7em;">${hItem.c.replace(cName,'').replace(/[()]/g,'').trim()}반</span>` : '';
                const uidStr = hItem.id; 
                const dis = fullyLocked ? 'disabled' : ''; 
                
                let totalAdjT = hItem.e.adjusts.reduce((sum, a) => sum + (a.amtT || 0), 0); 
                let totalAdjB = hItem.e.adjusts.reduce((sum, a) => sum + (a.amtB || 0), 0);
                let totalAdjM = is3D ? hItem.e.adjusts.reduce((sum, a) => sum + (a.amtM || 0), 0) : 0;
                
                let adjLedgerBadge = '';
                if (totalAdjT !== 0 || totalAdjB !== 0 || totalAdjM !== 0) {
                    adjLedgerBadge = `<div class="mt-1 d-flex gap-1" style="font-size:0.7rem;">${totalAdjT !== 0 ? `<span class="badge ${totalAdjT < 0 ? 'bg-danger bg-opacity-10 text-danger border border-danger' : 'bg-primary bg-opacity-10 text-primary border border-primary'} py-0 px-1">수강 ${totalAdjT > 0 ? '+' : ''}${window.fmt(totalAdjT)}</span>` : ''}${totalAdjB !== 0 ? `<span class="badge ${totalAdjB < 0 ? 'bg-danger bg-opacity-10 text-danger border border-danger' : 'bg-info bg-opacity-10 text-info border border-info'} py-0 px-1">교재 ${totalAdjB > 0 ? '+' : ''}${window.fmt(totalAdjB)}</span>` : ''}${totalAdjM !== 0 ? `<span class="badge ${totalAdjM < 0 ? 'bg-danger bg-opacity-10 text-danger border border-danger' : 'bg-success bg-opacity-10 text-success border border-success'} py-0 px-1">재료 ${totalAdjM > 0 ? '+' : ''}${window.fmt(totalAdjM)}</span>` : ''}</div>`;
                }
                const flashClass = savedUids.includes(uidStr) ? 'row-flash-success' : '';
                const tdM = is3D ? `<td class="text-success fw-bold bg-light">${window.fmt(hItem.sM||0)}</td>` : '';
                const tdM_adj = is3D ? `<td class="bg-warning bg-opacity-10"><input type="number" id="inl_m_${uidStr}" class="form-control form-control-sm border-warning text-end fw-bold" placeholder="0" ${dis}></td>` : '';

                h += `<tr class="${flashClass}"><td><input type="checkbox" class="form-check-input crs-stu-chk" value="${uidStr}" checked ${dis}></td><td>${hItem.dp}</td><td class="fw-bold text-start ps-2"><span class="clickable text-dark" onclick="window.openStuConsole('${uidStr}')">${hItem.nm}</span>${classNameTag}${adjLedgerBadge}</td><td>${hItem.fBadge}</td><td class="text-primary fw-bold bg-light">${window.fmt(hItem.sT)}</td><td class="text-secondary fw-bold bg-light">${window.fmt(hItem.sB)}</td>${tdM}<td class="bg-warning bg-opacity-10"><input type="number" id="inl_t_${uidStr}" class="form-control form-control-sm border-warning text-end fw-bold" placeholder="0" ${dis}></td><td class="bg-warning bg-opacity-10"><input type="number" id="inl_b_${uidStr}" class="form-control form-control-sm border-warning text-end fw-bold" placeholder="0" ${dis}></td>${tdM_adj}<td class="bg-warning bg-opacity-10"><input type="text" id="inl_memo_${uidStr}" class="form-control form-control-sm border-warning" placeholder="공통사유 따름" ${dis} onkeydown="if(event.key==='Enter') window.applyInlineAdjustment('${uidStr}')"></td><td class="bg-warning bg-opacity-10"><button class="btn btn-sm btn-dark py-0 px-2" onclick="window.applyInlineAdjustment('${uidStr}')" ${dis} title="이 학생만 개별 저장">저장</button></td></tr>`; 
            });
            const tdSumM = is3D ? `<td class="text-warning">${window.fmt(cSum.sM)}</td>` : '';
            const tdSpan = is3D ? 4 : 3;
            h += `<tr class="table-dark fw-bold sticky-bottom-row"><td colspan="4" class="text-end pe-3 text-warning">총 합계 (실시간)</td><td class="text-warning">${window.fmt(cSum.sT)}</td><td class="text-warning">${window.fmt(cSum.sB)}</td>${tdSumM}<td colspan="${tdSpan}"></td></tr>`;
        }
    }
    window.$('crsSummaryBody').innerHTML = h;
};

// 3. 일괄 적용 함수 (3개의 칸에서 값을 동시에 읽어옴)
window.applyBulkAdjustment = function() {
    if (window.isFullyLocked(window.curCrsQ, window.curCrsName)) return alert('🔒 전체 마감된 강좌이므로 조정할 수 없습니다.');
    const is3D = window.SysSet.accType === 'SEPARATED';
    
    const aT = window.num(window.val('bulk_adj_t'));
    const aB = window.num(window.val('bulk_adj_b'));
    const aM = is3D ? window.num(window.val('bulk_adj_m')) : 0;
    
    if (aT === 0 && aB === 0 && aM === 0) return alert('수강료, 교재비, 재료비 중 하나 이상 조정할 금액을 입력해 주세요.');
    
    let typeNmArr = [];
    if(aT !== 0) typeNmArr.push('수강료'); if(aB !== 0) typeNmArr.push('교재비'); if(aM !== 0) typeNmArr.push('재료비');
    const memo = window.val('bulk_memo') || `[${window.curCrsName}] ${typeNmArr.join('/')} 일괄조정`;
    const checkedBoxes = document.querySelectorAll('.crs-stu-chk:checked'); if (checkedBoxes.length === 0) return alert('선택된 학생이 없습니다.');

    let applyCount = 0; let savedUids = []; 
    window.commitState(() => {
        checkedBoxes.forEach(chk => {
            const eId = chk.value;
            const targetEnrollments = window.E.filter(e => window.uid(e.g, e.b, e.n, e.name) === eId && e.q === window.curCrsQ && (window.curCrsIsExact ? e.course === window.curCrsName : e.course.startsWith(window.curCrsName)));
            targetEnrollments.forEach(e => { e.adjusts.push({ title: memo, amtT: aT, amtB: aB, amtM: aM }); applyCount++; });
            savedUids.push(eId);
        });
    }, { savedUids });
    
    if (applyCount > 0) {
        window.$('bulk_adj_t').value = ''; window.$('bulk_adj_b').value = '';
        if(window.$('bulk_adj_m')) window.$('bulk_adj_m').value = '';
    }
};

window.resetBulkAdjustment = function() {
    if (window.isFullyLocked(window.curCrsQ, window.curCrsName)) return alert('🔒 전체 마감된 강좌입니다.');
    const checkedBoxes = document.querySelectorAll('.crs-stu-chk:checked'); 
    if (checkedBoxes.length === 0) return alert('선택된 학생이 없습니다.');
    if (!confirm(`선택한 학생(${checkedBoxes.length}명)의 이 강좌에 대한 '모든 금액 조정 내역'을 초기화하시겠습니까?`)) return;

    let applyCount = 0; let savedUids = []; 
    window.commitState(() => {
        checkedBoxes.forEach(chk => {
            const eId = chk.value;
            const targetEnrollments = window.E.filter(e => window.uid(e.g, e.b, e.n, e.name) === eId && e.q === window.curCrsQ && (window.curCrsIsExact ? e.course === window.curCrsName : e.course.startsWith(window.curCrsName)));
            targetEnrollments.forEach(e => { e.adjusts = (e.adjusts || []).filter(a => a.title.includes('[예외설정]')); applyCount++; });
            savedUids.push(eId);
        });
    }, { savedUids }); 
    if (applyCount > 0) window.$('bulk_amt').value = '';
};

// 4. 개별 라인 적용 함수 (해당 줄의 3개 칸에서 값을 동시에 읽어옴)
window.applyInlineAdjustment = function(eId) {
    if (window.isFullyLocked(window.curCrsQ, window.curCrsName)) return alert('🔒 전체 마감된 강좌입니다.');
    const is3D = window.SysSet.accType === 'SEPARATED';
    
    const aT = window.num(window.val(`inl_t_${eId}`));
    const aB = window.num(window.val(`inl_b_${eId}`));
    const aM = is3D ? window.num(window.val(`inl_m_${eId}`)) : 0;

    if (aT === 0 && aB === 0 && aM === 0) return alert('수강료, 교재비, 재료비 중 하나 이상 조정할 금액을 입력해 주세요.');
    
    let typeNmArr = [];
    if(aT !== 0) typeNmArr.push('수강료'); if(aB !== 0) typeNmArr.push('교재비'); if(aM !== 0) typeNmArr.push('재료비');

    const indMemo = window.val(`inl_memo_${eId}`); const bulkMemo = window.val('bulk_memo'); 
    const memo = indMemo || bulkMemo || `[${window.curCrsName}] ${typeNmArr.join('/')} 개별조정`;

    window.commitState(() => {
        const targetEnrollments = window.E.filter(e => window.uid(e.g, e.b, e.n, e.name) === eId && e.q === window.curCrsQ && (window.curCrsIsExact ? e.course === window.curCrsName : e.course.startsWith(window.curCrsName)));
        targetEnrollments.forEach(e => { e.adjusts.push({ title: memo, amtT: aT, amtB: aB, amtM: aM }); });
    }, { savedUids: [eId] });
};

window.batchDeleteAction = function() {
    const targets = document.querySelectorAll('.row-chk:checked');
    if (targets.length === 0) return alert('삭제할 학생을 선택하세요.');
    if (!confirm(`선택한 ${targets.length}명의 학생을 삭제하시겠습니까?`)) return;
    window.commitState(() => {
        const idxs = Array.from(targets).map(c => window.num(c.value)).sort((a,b) => b-a);
        idxs.forEach(i => window.E.splice(i, 1));
    });
};

window.openMoveModal = function(idxArr) {
    if (!idxArr || idxArr.length === 0) return;
    const hasLocked = idxArr.some(i => window.isQuarterLocked(window.E[i].q));
    if (hasLocked) return alert('🔒 마감된 분기의 학생이 포함되어 이동할 수 없습니다.');

    window.curMoveIdxs = idxArr;
    const activeCourses = Object.keys(window.C).filter(c => window.C[c][window.gQ] && window.C[c][window.gQ].isActive !== false).sort();
    if (activeCourses.length === 0) return alert('이동할 수 있는 강좌가 없습니다.');

    const currentCourse = window.E[idxArr[0]].course;
    
    if (idxArr.length === 1) {
        const e = window.E[idxArr[0]];
        if(window.$('mv_stuName')) window.$('mv_stuName').innerText = `${window.dsp(e.g, e.b, e.n)} ${e.name}`;
    } else {
        if(window.$('mv_stuName')) window.$('mv_stuName').innerText = `선택된 ${idxArr.length}명`;
    }
    
    let opts = `<option value="">-- 변경할 강좌 선택 --</option>`;
    activeCourses.forEach(c => { if (c !== currentCourse) opts += `<option value="${c}">${c}</option>`; });
    if(window.$('mv_courseSelect')) window.$('mv_courseSelect').innerHTML = opts;
    
    const modalEl = document.getElementById('mdlMoveCourse');
    if (modalEl) {
        const modalObj = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modalObj.show();
    } else { alert('팝업창을 찾을 수 없습니다.'); }
};

window.batchMoveAction = function() {
    const targets = document.querySelectorAll('.row-chk:checked');
    if (targets.length === 0) return alert('이동할 학생을 선택하세요.');
    const idxArr = Array.from(targets).map(c => window.num(c.value));
    window.openMoveModal(idxArr);
};

window.execMoveCourse = function() {
    if (!window.curMoveIdxs || window.curMoveIdxs.length === 0) return;
    const targetCourse = window.val('mv_courseSelect');
    if (!targetCourse) return alert('이동할 강좌를 선택해 주세요.');

    let successCnt = 0;
    window.commitState(() => {
        window.curMoveIdxs.forEach(i => {
            const e = window.E[i];
            const exist = window.E.some(x => x !== e && x.q === e.q && window.uid(x.g, x.b, x.n, x.name) === window.uid(e.g, e.b, e.n, e.name) && x.course === targetCourse);
            if (!exist) { 
                e.course = targetCourse; 
                if (e.oldCourse) {
                    e.mm = `이전 분기에서 가져옴 (원래: ${e.oldCourse})`;
                    delete e.oldQ; delete e.oldCourse;
                } else if (e.mm === '🚨 부서 매칭 실패 (재배정 필요)' || e.mm === '부서 매칭 실패 (재배정 필요)') {
                    e.mm = '이전 분기에서 가져옴';
                }
                successCnt++; 
            }
        });
    });

    const modalEl = document.getElementById('mdlMoveCourse');
    if (modalEl) { const modalObj = bootstrap.Modal.getInstance(modalEl); if (modalObj) modalObj.hide(); }
    alert(`✅ ${successCnt}명의 학생이 [${targetCourse}](으)로 변경되었습니다.`);
    window.curMoveIdxs = [];
};

window.upMigration = async function(inputEl) {
    const file = inputEl.files[0]; if (!file) return;
    if (!confirm('🚨 경고: 업로드한 엑셀(교정본)의 데이터로 현재 장부의 금액을 강제 덮어쓰고 마감(Lock) 처리하시겠습니까?')) { inputEl.value = ''; return; }

    const is3D = window.SysSet.accType === 'SEPARATED';

    try {
        const buf = await window.readFileAsArrayBuffer(file);
        const rows = window.parseXlsx(buf);
        if (rows.length === 0) throw new Error('데이터가 비어있습니다.');
        let applyCount = 0;
        
        window.commitState(() => {
            rows.forEach(r => {
                const q = Number(r['분기']), g = Number(r['학년']), b = Number(r['반']), n = Number(r['번호']);
                const nm = String(r['이름']||'').trim(), c = String(r['강좌명']||'').trim();
                if (!q || !nm || !c) return;

                const tc = Number(r['초3지원_수강료공제']) || 0;
                const bc = Number(r['초3지원_교재비공제']) || 0;
                const mc = is3D ? (Number(r['초3지원_재료비공제']) || 0) : 0;
                
                const tf = Number(r['자유수강_수강료공제']) || 0;
                const bf = Number(r['자유수강_교재비공제']) || 0;
                const mf = is3D ? (Number(r['자유수강_재료비공제']) || 0) : 0;
                
                const finT = Number(r['최종_수강료자부담']) || 0;
                const finB = Number(r['최종_교재비자부담']) || 0;
                const finM = is3D ? (Number(r['최종_재료비자부담']) || 0) : 0;

                const lockKey = `${window.uid(g, b, n, nm)}_${c}`;
                const maxSess = ((window.C[c]?.[q]?.mh || '4,4,4').split(',').filter(x => Number(x) > 0)).length || 1;

                window.SysSet.closedSess = window.SysSet.closedSess || {};

                for (let sIdx = 0; sIdx < maxSess; sIdx++) {
                    const sessKey = `${q}_${sIdx}`;
                    if (!window.SysSet.closedSess[sessKey]) window.SysSet.closedSess[sessKey] = { _isHardLocked: true };
                    window.SysSet.closedSess[sessKey]._isHardLocked = true;

                    if (sIdx === 0) {
                        window.SysSet.closedSess[sessKey][lockKey] = {
                            cho3Amt: tc, cho3Bk: bc, cho3Mt: mc,
                            freeAmt: tf, freeBk: bf, freeMt: mf,
                            selfAmt: finT, selfBk: finB, selfMt: finM
                        };
                    } else {
                        window.SysSet.closedSess[sessKey][lockKey] = {
                            cho3Amt: 0, cho3Bk: 0, cho3Mt: 0, freeAmt: 0, freeBk: 0, freeMt: 0, selfAmt: 0, selfBk: 0, selfMt: 0
                        };
                    }
                }
                applyCount++;
            });
        });

        alert(`✅ 총 ${applyCount}건의 데이터가 엑셀 교정본을 기준으로 강제 마감(Lock) 되었습니다.\n\n4스텝 체크박스에 🛠️(강제 마감) 아이콘이 표시됩니다.`);
    } catch (err) {
        alert('❌ 엑셀 파싱 중 오류가 발생했습니다. 다운로드한 양식을 그대로 업로드했는지 확인해 주세요.');
    } finally { inputEl.value = ''; }
};