/* ==========================================================================
   파일닉네임: app-ui-settle.js
   기능설명: Step 4 정산 마감, 예외처리(환불/조정), 모달(학생콘솔, 강좌명세서) UI
   ========================================================================== */
'use strict';

/* ==========================================================================
   💡 [신규 추가] 특정 강좌의 '모든 차수'가 100% 마감되었는지 판별하는 함수
   ========================================================================== */
window.isFullyLocked = function(q, cName) {
    if (!window.C || !window.C[cName] || !window.C[cName][q]) return false;
    const mhArr = (window.C[cName][q].mh || '4,4,4').split(',').filter(x => window.num(x) > 0);
    const maxSess = mhArr.length;
    if (maxSess === 0) return false;
    // 마지막 차수가 마감되어 있다면 전체 마감으로 간주 (순차 마감 원칙)
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

/* ==========================================================================
   💡 메인 렌더링 함수: (원본 기능 100% 보존 + 전역 차수 필터 스위칭 적용)
   ========================================================================== */
window.renderSetTabs = function() {
    // 💡 1. s4_q 드롭다운 대신 전역 분기 변수(gQ) 사용
    const qVal = window.gQ; 
    const searchEl = window.$('s4_search');
    const searchKeyword = searchEl ? searchEl.value.trim().toLowerCase() : ''; 
    
    // 💡 2. 전역 차수 필터 값 가져오기
    const sessNode = document.querySelector('input[name="s4_sessFilt"]:checked');
    const globalSessFilt = sessNode ? sessNode.value : 'ALL';

    function getTargetBadges(isC, isF) {
        let b = '';
        if (isC) b += `<span class="badge badge-cho3">초3</span>`;
        if (isF) b += `<span class="badge badge-free">자유</span>`;
        if (!b) b = `<span class="badge bg-light text-secondary border">일반</span>`;
        return b;
    }

    function getDedBadge(e) {
        if (e.overrideCho3 || e.overrideFree) {
            return `<span class="badge bg-primary text-white" title="개별공제 설정됨">🔵 개별공제</span>`;
        }
        return '';
    }

    const rawHList = window.Hs.filter(h => (h.q===qVal) && (window.s4_filt==='A' || (window.s4_filt==='F'&&h.isF) || (window.s4_filt==='C'&&h.isC)));
    
    // 💡 3. 데이터 스위칭 (차수가 선택되면 해당 차수 데이터로 바꿔치기)
    const hList = rawHList.map(hItem => {
        if (globalSessFilt !== 'ALL') {
            const sIdx = Number(globalSessFilt);
            const sd = hItem.sessDetails && hItem.sessDetails[sIdx];
            if (sd) {
                return { ...hItem, sT: sd.tT, sB: sd.tB, tc: sd.tc, bc: sd.bc, tf: sd.tf, bf: sd.bf, finT: sd.finT, finB: sd.finB };
            } else {
                return { ...hItem, sT: 0, sB: 0, tc: 0, bc: 0, tf: 0, bf: 0, finT: 0, finB: 0 };
            }
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
    
    // (개발자님 원본) 마감 체크박스 렌더링 유지
    const chkWrap = window.$('closeSessChecks');
    if(chkWrap) {
        chkWrap.style.setProperty('display', 'flex', 'important'); 
        let chks = `<span class="small fw-bold text-dark d-flex align-items-center">🔒 시스템마감:</span>`;
        let maxSess = 1; 
        Object.keys(window.C).forEach(c => { 
            const m = (window.C[c]?.[qVal]?.mh || '4,4,4').split(',').filter(x => window.num(x) > 0).length; 
            if (m > maxSess) maxSess = m; 
        });
        for (let i = 0; i < maxSess; i++) { 
            const key = `${qVal}_${i}`; 
            const isChecked = window.SysSet.closedSess[key] ? 'checked' : ''; 
            const isHardLocked = window.SysSet.closedSess[key] && window.SysSet.closedSess[key]._isHardLocked;
            const lblClass = isHardLocked ? 'text-danger fw-bold' : 'fw-bold'; 
            const icon = isHardLocked ? '🛠️ ' : (isChecked ? '🔒 ' : '');
            chks += `<div class="form-check form-check-inline mb-0 ms-2"><input class="form-check-input ${isHardLocked?'border-danger':'border-warning'}" type="checkbox" id="chkClose_${i}" ${isChecked} onchange="window.toggleSessCheck(${qVal}, ${i}, this.checked)"><label class="form-check-label small ${lblClass}" for="chkClose_${i}">${icon}${i+1}차</label></div>`; 
        }
        chkWrap.innerHTML = chks;
    }
    
    if (hList.length === 0) {
        let emptyHtml = `<tr><td colspan="15" class="py-5 text-muted bg-light"><i class="bi bi-folder-x fs-2 d-block mb-2 text-danger"></i>조건에 맞는 정산 데이터가 없습니다.</td></tr>`;
        if(window.$('tbStat')) window.$('tbStat').innerHTML = emptyHtml; 
        if(window.$('tbStuDtl')) window.$('tbStuDtl').innerHTML = emptyHtml; 
        if(window.$('tbCrseDtl')) window.$('tbCrseDtl').innerHTML = emptyHtml; 
        return;
    }

    // --- (개발자님 원본) tbStat 렌더링 유지 ---
    let sH = ''; const st = {}; 
    hList.forEach(h => { 
        if (!st[h.c]) st[h.c] = {cnt:0,sT:0,sB:0,tc:0,bc:0,tf:0,bf:0,fT:0,fB:0}; 
        const s = st[h.c]; s.cnt++; s.sT+=h.sT; s.sB+=h.sB; s.tc+=h.tc; s.bc+=h.bc; s.tf+=h.tf; s.bf+=h.bf; s.fT+=h.finT; s.fB+=h.finB; 
    });
    Object.keys(st).sort().forEach(c => { 
        const s = st[c]; 
        sH += `<tr><td class="course-link" onclick="window.openCourseSummary('${c.replace(/'/g, "\\'")}', ${qVal})">${c}</td><td class="table-warning fw-bold">${s.cnt}</td><td class="table-warning">${window.fmt(s.sT)}</td><td class="table-warning">${window.fmt(s.sB)}</td><td class="bg-cho3 text-primary">${window.fmt(s.tc)}</td><td class="bg-cho3">${window.fmt(s.bc)}</td><td class="bg-free text-success">${window.fmt(s.tf)}</td><td class="bg-free">${window.fmt(s.bf)}</td><td class="table-danger fw-bold text-danger">${window.fmt(s.fT)}</td><td class="table-danger text-danger fw-bold">${window.fmt(s.fB)}</td></tr>`; 
    });
    sH += `<tr class="table-dark fw-bold sticky-bottom-row">
    <td colspan="2" class="text-warning">총 합계</td>
    <td class="text-warning">${window.fmt(hList.reduce((s,h)=>s+h.sT,0))}</td><td class="text-warning">${window.fmt(hList.reduce((s,h)=>s+h.sB,0))}</td><td class="text-primary">${window.fmt(hList.reduce((s,h)=>s+h.tc,0))}</td><td class="text-primary">${window.fmt(hList.reduce((s,h)=>s+h.bc,0))}</td><td class="text-success">${window.fmt(hList.reduce((s,h)=>s+h.tf,0))}</td><td class="text-success">${window.fmt(hList.reduce((s,h)=>s+h.bf,0))}</td><td class="text-danger">${window.fmt(hList.reduce((s,h)=>s+h.finT,0))}</td><td class="text-danger">${window.fmt(hList.reduce((s,h)=>s+h.finB,0))}</td></tr>`;
    if(window.$('tbStat')) window.$('tbStat').innerHTML = sH;

    // --- (개발자님 원본) tbStuDtl 렌더링 유지 ---
    const stuList = hList.filter(h => 
        (searchKeyword === '' || h.nm.toLowerCase().includes(searchKeyword) || h.dp.includes(searchKeyword)) && checkExFilt(h)
    );
    
    let stuH = '';
    if (stuList.length === 0) {
        stuH = `<tr><td colspan="15" class="py-5 text-muted bg-light">검색 및 필터 조건에 맞는 데이터가 없습니다.</td></tr>`;
    } else {
        const lMap = {}; 
        stuList.forEach(h => { if (!lMap[h.id]) lMap[h.id] = {L: window.Ld[h.id], items:[]}; lMap[h.id].items.push(h); });
        let lArr = Object.values(lMap);
        lArr.sort((a,b) => { 
            let res = 0; 
            if (window.sortState.col === 'DP') { 
                let aP = a.L.dp.split('-').map(Number); let bP = b.L.dp.split('-').map(Number); 
                res = (aP[0]-bP[0]) || (aP[1]-bP[1]) || (aP[2]-bP[2]); 
            } else if (window.sortState.col === 'NM') res = a.L.nm.localeCompare(b.L.nm); 
            else if (window.sortState.col === 'C') res = (a.L.qBal[qVal]?.cB||0) - (b.L.qBal[qVal]?.cB||0); 
            else if (window.sortState.col === 'F') res = (a.L.qBal[qVal]?.fB||0) - (b.L.qBal[qVal]?.fB||0); 
            return window.sortState.asc ? res : -res; 
        });
        
        ['DP','NM','C','F'].forEach(c => { 
            const el = window.$('sort_'+c); 
            if(el) { el.innerHTML = window.sortState.asc ? '<i class="bi bi-caret-up-fill text-primary"></i>' : '<i class="bi bi-caret-down-fill text-primary"></i>'; } 
        });

       lArr.forEach(grp => { 
            let targetBadge = getTargetBadges(grp.L.isC, grp.L.isF);
            
            // 💡 [코어 UI 연동] 선택된 작업 시점(차수)에 맞는 '잔액 스냅샷' 가져오기
            let snapBalC = 0; let snapBalF = 0;
            if (globalSessFilt !== 'ALL') {
                const sIdx = Number(globalSessFilt);
                // 엔진이 해당 차수 결제 직후에 캡처해둔 잔액(remCho3, remFree)을 꺼냄
                const sd = grp.items[0].sessDetails[sIdx];
                if (sd) {
                    snapBalC = sd.remCho3 || 0;
                    snapBalF = sd.remFree || 0;
                }
            } else {
                // '전체 차수' 조회 시에는 분기 종료 시점의 최종 이월 잔액을 표시
                snapBalC = grp.L.qBal[qVal] ? grp.L.qBal[qVal].cB : 0; 
                snapBalF = grp.L.qBal[qVal] ? grp.L.qBal[qVal].fB : 0;
            }

            grp.items.forEach((h, idx) => { 
                let auditBadge = window.getExceptionBadges(h.e);
                stuH += `<tr>`; 
                if (idx === 0) {
                    // 꺼내온 snapBalC, snapBalF를 화면에 출력
                    stuH += `<td rowspan="${grp.items.length}">${grp.L.dp}</td><td rowspan="${grp.items.length}" class="fw-bold"><span class="clickable text-dark" onclick="window.openStuConsole('${grp.L.id}')">${grp.L.nm}</span></td><td rowspan="${grp.items.length}">${targetBadge}</td><td rowspan="${grp.items.length}" class="text-primary fw-bold">${window.fmt(snapBalC)}</td><td rowspan="${grp.items.length}" class="text-success fw-bold">${window.fmt(snapBalF)}</td>`; 
                }
                stuH += `<td>${h.q}분기</td><td class="course-link text-start" onclick="window.openCourseSummary('${h.c.replace(/'/g, "\\'")}', ${h.q})">${h.c}</td><td class="table-warning">${window.fmt(h.sT)}</td><td class="table-warning">${window.fmt(h.sB)}</td><td class="bg-cho3 text-primary">${window.fmt(h.tc)}</td><td class="bg-cho3 text-primary">${window.fmt(h.bc)}</td><td class="bg-free text-success">${window.fmt(h.tf)}</td><td class="bg-free text-success">${window.fmt(h.bf)}</td><td class="table-danger text-danger fw-bold">${window.fmt(h.finT)}</td><td class="table-danger text-danger fw-bold">${window.fmt(h.finB)}</td><td class="align-middle text-start col-reason">${getDedBadge(h.e)} ${auditBadge}</td></tr>`; 
            }); 
        });
        stuH += `<tr class="table-dark fw-bold sticky-bottom-row">
            <td colspan="7" class="text-end pe-3 text-warning">검색된 학생 총 합계</td>
            <td class="text-warning">${window.fmt(stuList.reduce((s,h)=>s+h.sT,0))}</td>
            <td class="text-warning">${window.fmt(stuList.reduce((s,h)=>s+h.sB,0))}</td>
            <td class="text-primary">${window.fmt(stuList.reduce((s,h)=>s+h.tc,0))}</td>
            <td class="text-primary">${window.fmt(stuList.reduce((s,h)=>s+h.bc,0))}</td>
            <td class="text-success">${window.fmt(stuList.reduce((s,h)=>s+h.tf,0))}</td>
            <td class="text-success">${window.fmt(stuList.reduce((s,h)=>s+h.bf,0))}</td>
            <td class="text-danger">${window.fmt(stuList.reduce((s,h)=>s+h.finT,0))}</td>
            <td class="text-danger">${window.fmt(stuList.reduce((s,h)=>s+h.finB,0))}</td>
            <td></td>
        </tr>`;
    }
    if(window.$('tbStuDtl')) window.$('tbStuDtl').innerHTML = stuH;

    // --- (개발자님 원본) tbCrseDtl 렌더링 유지 ---
    if(window.$('cFilterBtnGroup')) { 
        let cKeys = Object.keys(window.C).filter(c => {
            const isAct = window.C[c] && window.C[c][qVal] && window.C[c][qVal].isActive !== false;
            const hasData = hList.some(h => h.c === c);
            return isAct || hasData;
        }).sort();
        if (hList.some(h => h.c === '미배정(누락)') && !cKeys.includes('미배정(누락)')) { cKeys.push('미배정(누락)'); }

        let bh = `<button class="btn btn-sm ${window.s4_cFilter==='ALL'?'btn-primary fw-bold':'btn-outline-secondary'}" onclick="window.s4_cFilter='ALL';window.renderSetTabs();">전체강좌</button>`; 
        cKeys.forEach(c => { 
            const btnClass = window.s4_cFilter === c ? 'btn-primary fw-bold' : (c === '미배정(누락)' ? 'btn-outline-danger fw-bold' : 'btn-outline-secondary');
            bh += `<button class="btn btn-sm ${btnClass} ms-1" onclick="window.s4_cFilter='${c.replace(/'/g,"\\'")}';window.renderSetTabs();">${c}</button>`; 
        }); 
        window.$('cFilterBtnGroup').innerHTML = bh; 
    }
    
    // 💡 4. 강좌 탭 내부에 있던 중복 차수 필터(sessFilterBtnGroup)는 비워서 제거합니다.
    if(window.$('sessFilterBtnGroup')) {
        window.$('sessFilterBtnGroup').innerHTML = '';
    }

    let cList = hList; 
    if (window.s4_cFilter !== 'ALL') cList = cList.filter(h => h.c === window.s4_cFilter);
    cList = cList.filter(h => checkExFilt(h));

    const cSum = {sT:0, sB:0, tc:0, bc:0, tf:0, bf:0, finT:0, finB:0}; 
    cList.forEach(h => { cSum.sT+=h.sT; cSum.sB+=h.sB; cSum.tc+=h.tc; cSum.bc+=h.bc; cSum.tf+=h.tf; cSum.bf+=h.bf; cSum.finT+=h.finT; cSum.finB+=h.finB; });
    let crsH = '';
    
    if (cList.length === 0) {
        crsH = `<tr><td colspan="14" class="py-5 text-muted bg-light">검색 및 필터 조건에 맞는 데이터가 없습니다.</td></tr>`;
    } else {
        cList.forEach(h => { 
            let targetBadge = getTargetBadges(h.isC, h.isF); let auditBadge = window.getExceptionBadges(h.e);
            const termStr = globalSessFilt !== 'ALL' ? `${Number(globalSessFilt)+1}차수` : `${h.q}분기`;
            crsH += `<tr><td>${termStr}</td><td>${h.dp}</td><td class="fw-bold"><span class="clickable text-dark" onclick="window.openStuConsole('${h.id}')">${h.nm}</span></td><td>${targetBadge}</td><td class="course-link" onclick="window.openCourseSummary('${h.c.replace(/'/g, "\\'")}', ${h.q})">${h.c}</td><td class="table-warning">${window.fmt(h.sT)}</td><td class="table-warning">${window.fmt(h.sB)}</td><td class="bg-cho3 text-primary">${window.fmt(h.tc)}</td><td class="bg-cho3 text-primary">${window.fmt(h.bc)}</td><td class="bg-free text-success">${window.fmt(h.tf)}</td><td class="bg-free text-success">${window.fmt(h.bf)}</td><td class="table-danger text-danger fw-bold">${window.fmt(h.finT)}</td><td class="table-danger text-danger fw-bold">${window.fmt(h.finB)}</td><td class="align-middle text-start col-reason">${getDedBadge(h.e)} ${auditBadge}</td></tr>`; 
        });
        crsH += `<tr class="table-dark fw-bold sticky-bottom-row"><td colspan="5" class="text-end pe-3 text-warning">총 합계</td><td>${window.fmt(cSum.sT)}</td><td>${window.fmt(cSum.sB)}</td><td class="text-primary">${window.fmt(cSum.tc)}</td><td class="text-primary">${window.fmt(cSum.bc)}</td><td class="text-success">${window.fmt(cSum.tf)}</td><td class="text-success">${window.fmt(cSum.bf)}</td><td class="text-danger">${window.fmt(cSum.finT)}</td><td class="text-danger">${window.fmt(cSum.finB)}</td><td></td></tr>`;
    }

    if(window.$('tbCrseDtl')) {
        window.$('tbCrseDtl').innerHTML = crsH;
    }
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
                    snapshot[`${h.id}_${h.c}`] = { selfAmt: h.sessDetails[sessIdx].finT, selfBk: h.sessDetails[sessIdx].finB, cho3Amt: h.sessDetails[sessIdx].tc, cho3Bk: h.sessDetails[sessIdx].bc, freeAmt: h.sessDetails[sessIdx].tf, freeBk: h.sessDetails[sessIdx].bf }; 
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
    const headers = [ "분기", "학년", "반", "번호", "이름", "강좌명", "분기 수강료(원가)", "분기 교재비(원가)", "초3지원_수강료공제", "초3지원_교재비공제", "자유수강_수강료공제", "자유수강_교재비공제", "최종_수강료자부담", "최종_교재비자부담" ];
    let excelData = [headers];
    ls.forEach(h => { excelData.push([ h.q, h.g, h.ban, h.num, h.nm, h.c, h.sT, h.sB, h.tc, h.bc, h.tf, h.bf, h.finT, h.finB ]); });
    const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet(excelData);
    ws['!cols'] = [ {wpx: 40}, {wpx: 40}, {wpx: 40}, {wpx: 40}, {wpx: 80}, {wpx: 130}, {wpx: 120}, {wpx: 120}, {wpx: 130}, {wpx: 130}, {wpx: 130}, {wpx: 130}, {wpx: 120}, {wpx: 120} ];
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
    const base = window.C[e.course]?.[e.q] || {t:0, b:0, mh:'4,4,4'}; 
    const mhArr = (base.mh || '4,4,4').split(',').map(x=>window.num(x)).filter(x=>x>0); 
    const ty = window.val('c_ref_ty'); const sIdx = window.num(window.$('c_ref_idx')?.value); 
    const ah = window.num(window.val('c_ref_ah')); const bkTy = window.val('c_ref_bk_ty');
    let rt = 0, rb = 0; 
    if (ty === 'BEFORE') { rt = base.t; } else { 
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
    if (bkTy === 'FULL') rb = base.b; else if (bkTy === 'MANUAL') rb = window.num(window.val('c_ref_bk_amt'));
    if(window.$('c_ref_preview')) { window.$('c_ref_preview').innerHTML = `💡 예상 환불액: 수강료 <span class="text-danger">${window.fmt(rt)}</span>원 / 교재비 <span class="text-danger">${window.fmt(rb)}</span>원`; } 
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
    const L = window.Ld[window.cUid] || { cB:0, fB:0, isC: false, isF: false, qBal: { 0: {cB:0, fB:0} } }; 
    const activeQ = window.gQ; 
    const balC = L.qBal ? (L.qBal[activeQ] ? L.qBal[activeQ].cB : 0) : 0; 
    const balF = L.qBal ? (L.qBal[activeQ] ? L.qBal[activeQ].fB : 0) : 0;
    let qTotalSelf = 0; window.Hs.filter(h => h.id === window.cUid && h.q === activeQ).forEach(h => { qTotalSelf += (h.finT + h.finB); });
    const txtC = L.isC ? `<span class="text-primary">${window.fmt(balC)}원</span>` : `<span class="text-muted fs-6 fw-normal">대상아님</span>`;
    const txtF = L.isF ? `<span class="text-success">${window.fmt(balF)}원</span>` : `<span class="text-muted fs-6 fw-normal">대상아님</span>`;
    
    window.$('consoleTop').innerHTML = `<div><span class="small fw-bold text-primary">[${activeQ}분기] 초3 잔액</span><h5 class="fw-bold mb-0">${txtC}</h5></div><div><span class="small fw-bold text-success">[${activeQ}분기] 자유 잔액</span><h5 class="fw-bold mb-0">${txtF}</h5></div><div><span class="small fw-bold text-danger">[${activeQ}분기] 총 자부담금</span><h5 class="text-danger fw-bold mb-0">${window.fmt(qTotalSelf)}원</h5></div>`;
    
    let tT=0, tB=0, tcT=0, tcB=0, tfT=0, tfB=0, finT=0, finB=0;
    let tBodyHtml = `<table class="table table-sm table-bordered text-center align-middle mb-0" style="font-size:0.9rem;"><thead class="table-light"><tr><th rowspan="2" class="align-middle" style="min-width: 130px;">강좌명(차감순)</th><th colspan="2">실부담금(지원전)</th><th colspan="2" class="bg-cho3 text-primary">초3 공제</th><th colspan="2" class="bg-free text-success">자유 공제</th><th colspan="2" class="text-danger fw-bold">최종(자부담)</th></tr><tr><th>수강료</th><th>교재비</th><th class="bg-cho3 text-primary">수강</th><th class="bg-cho3 text-primary">교재</th><th class="bg-free text-success">수강</th><th class="bg-free text-success">교재</th><th class="text-danger">수강</th><th class="text-danger">교재</th></tr></thead><tbody>`;
    window.cEnrolls.forEach(i => { 
        const e = window.E[i]; const isActive = (i === window.cActiveEIdx);
        const hItem = window.Hs.find(h => h.e === e) || { sT:e.cT, sB:e.cB, tc:0, bc:0, tf:0, bf:0, finT:e.cT, finB:e.cB };
        let trClass = 'clickable'; if (isActive) trClass += ' table-primary border-primary fw-bold';
        tT += hItem.sT; tB += hItem.sB; tcT += hItem.tc; tcB += hItem.bc; tfT += hItem.tf; tfB += hItem.bf; finT += hItem.finT; finB += hItem.finB;
        tBodyHtml += `<tr class="${trClass}" onclick="window.setConsoleActive(${i})"><td class="text-start ps-1 text-nowrap"><div class="d-inline-flex flex-column align-items-center me-1 no-print" style="vertical-align: middle; width: 14px;"><i class="bi bi-caret-up-fill text-secondary clickable" style="font-size: 0.7rem; line-height: 0.5;" onclick="event.stopPropagation(); window.moveCourseSeq(${i}, -1)" title="순서 올리기 (우선 차감)"></i><i class="bi bi-caret-down-fill text-secondary clickable" style="font-size: 0.7rem; line-height: 0.5; margin-top: 2px;" onclick="event.stopPropagation(); window.moveCourseSeq(${i}, 1)" title="순서 내리기"></i></div><span class="course-link" onclick="event.stopPropagation(); window.openCourseSummary('${e.course.replace(/'/g, "\\'")}', ${e.q})">${e.course}</span>${isActive ? '<i class="bi bi-arrow-right-circle-fill text-primary float-end mt-1 ms-1"></i>' : ''}</td><td>${window.fmt(hItem.sT)}</td><td>${window.fmt(hItem.sB)}</td><td class="bg-cho3 fw-bold">${window.fmt(hItem.tc)}</td><td class="bg-cho3 fw-bold">${window.fmt(hItem.bc)}</td><td class="bg-free fw-bold">${window.fmt(hItem.tf)}</td><td class="bg-free fw-bold">${window.fmt(hItem.bf)}</td><td class="text-danger fw-bold">${window.fmt(hItem.finT)}</td><td class="text-danger fw-bold">${window.fmt(hItem.finB)}</td></tr>`; 
    }); 
    tBodyHtml += `<tr class="table-dark fw-bold"><td class="text-warning text-end pe-2">총계</td><td class="text-warning">${window.fmt(tT)}</td><td class="text-warning">${window.fmt(tB)}</td><td class="text-primary">${window.fmt(tcT)}</td><td class="text-primary">${window.fmt(tcB)}</td><td class="text-success">${window.fmt(tfT)}</td><td class="text-success">${window.fmt(tfB)}</td><td class="text-danger fs-6">${window.fmt(finT)}</td><td class="text-danger fs-6">${window.fmt(finB)}</td></tr></tbody></table>`;
    window.$('consoleTableContainer').innerHTML = tBodyHtml;

    let timelineHtml = `<table class="table table-sm table-hover table-bordered text-center align-middle mb-0" style="font-size:0.85rem;"><thead class="table-light"><tr><th>강좌명</th><th>유형</th><th>사유</th><th>수강료 변화</th><th>교재비 변화</th><th class="no-print">삭제</th></tr></thead><tbody>`;
    let histCnt = 0;
    window.cEnrolls.forEach(i => {
        const e = window.E[i]; const locked = window.isQuarterLocked(e.q); const dis = locked ? 'disabled' : '';
        e.adjusts.forEach((a, idx) => { 
            histCnt++; 
            let typeBadge = `<span class="badge bg-warning text-dark border border-warning">조정</span>`;
            let displayTitle = a.title;
            if (a.title.includes('[예외설정]')) { typeBadge = `<span class="badge bg-primary text-white border border-primary">개별공제</span>`; displayTitle = a.title.replace('[예외설정]', '').trim(); }
            timelineHtml += `<tr><td class="text-start ps-2">${e.course}</td><td>${typeBadge}</td><td class="text-start">${displayTitle}</td><td>${window.fmt(a.amtT)}</td><td>${window.fmt(a.amtB)}</td><td class="no-print"><button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="window.setConsoleActive(${i}); setTimeout(()=>window.delConsoleHist('adj', ${idx}), 50)" ${dis} title="해당 강좌 타겟팅 후 삭제"><i class="bi bi-x"></i></button></td></tr>`; 
        });
        e.refunds.forEach((r, idx) => { 
            histCnt++; 
            timelineHtml += `<tr><td class="text-start ps-2">${e.course}</td><td><span class="badge bg-danger text-white">환불</span></td><td class="text-start">${r.tyNm}</td><td class="text-danger">-${window.fmt(r.rt)}</td><td class="text-danger">-${window.fmt(r.rb)}</td><td class="no-print"><button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="window.setConsoleActive(${i}); setTimeout(()=>window.delConsoleHist('ref', ${idx}), 50)" ${dis} title="해당 강좌 타겟팅 후 삭제"><i class="bi bi-x"></i></button></td></tr>`; 
        });
    });
    if(!histCnt) timelineHtml += `<tr><td colspan="6" class="text-muted py-3">금액 변동 이력이 없습니다.</td></tr>`;
    timelineHtml += `</tbody></table>`;
    window.$('consoleTimelineContainer').innerHTML = timelineHtml;

    const e = window.E[window.cActiveEIdx], q = e.q, base = window.C[e.course]?.[q] || {t:0,b:0,mh:'4,4,4'}; 
    const fullyLocked = window.isFullyLocked(q, e.course);
    const partiallyLocked = window.isQuarterLocked(q) && !fullyLocked;
    const dis = fullyLocked ? 'disabled' : ''; 
    
    let lockBadge = '';
    if (fullyLocked) lockBadge = '<span class="badge bg-danger"><i class="bi bi-lock-fill"></i> 전체 마감됨</span>';
    else if (partiallyLocked) lockBadge = '<span class="badge bg-warning text-dark border border-warning"><i class="bi bi-unlock-fill"></i> 부분 마감됨(진행중)</span>';

    let hAction = `<h6 class="fw-bold text-dark border-bottom pb-2 d-flex justify-content-between align-items-center"><span><i class="bi bi-crosshair text-primary"></i> 제어 대상: <span class="text-primary">${e.course}</span></span>${lockBadge}</h6>`;
    hAction += `<div class="card mb-2 border-warning no-print"><div class="card-header bg-warning bg-opacity-10 py-1 fw-bold small text-dark">✍️ 1. 실부담금 강제 조정</div><div class="card-body p-2"><input type="text" id="c_adj_title" class="form-control form-control-sm mb-1" placeholder="조정 사유 (예: 다자녀할인)" ${dis}><div class="d-flex gap-1 mb-2"><input type="number" id="c_adj_t" class="form-control form-control-sm text-end" placeholder="수강료 증감액" ${dis}><input type="number" id="c_adj_b" class="form-control form-control-sm text-end" placeholder="교재비 증감액" ${dis}></div><button class="btn btn-warning btn-sm w-100 fw-bold shadow-sm" onclick="window.addConsoleAdj()" ${dis}>조정액 반영</button></div></div>`;
    
    // 💡 차수별 선택 옵션 (마감된 차수는 드롭다운에서 선택 불가하도록 명시)
    const options = base.mh.split(',').map((_,idx)=> {
        const isSessLocked = window.SysSet.closedSess && window.SysSet.closedSess[`${q}_${idx}`];
        return `<option value="${idx}" ${isSessLocked ? 'disabled' : ''}>${idx+1}차수 환불 ${isSessLocked ? '(🔒마감됨)' : ''}</option>`;
    }).join('');
    
    hAction += `<div class="card mb-2 border-danger no-print"><div class="card-header bg-danger bg-opacity-10 py-1 fw-bold small text-dark">💸 2. 환불 및 결석 처리</div><div class="card-body p-2"><select id="c_ref_ty" class="form-select form-select-sm mb-1" onchange="window.toggleRefInputs(); window.previewConsoleRef();" ${dis}><option value="BEFORE">개시전(전액환불)</option><option value="DISEASE">결석(일할계산)</option><option value="STUDENT">포기(구간합산)</option></select><div class="d-flex gap-1 mb-1"><select id="c_ref_idx" class="form-select form-select-sm w-50" onchange="window.updateConsoleRefHours(); window.previewConsoleRef();" ${dis}>${options}</select><select id="c_ref_ah" class="form-select form-select-sm w-50" onchange="window.previewConsoleRef()" ${dis}></select></div><div class="border-top pt-1 mt-1 mb-2"><label class="small text-muted mb-1">교재비 반환 옵션</label><select id="c_ref_bk_ty" class="form-select form-select-sm mb-1" onchange="window.toggleRefInputs(); window.previewConsoleRef();" ${dis}><option value="NONE">반환 안함</option><option value="FULL">분기 전액 반환</option><option value="MANUAL">수동 금액 입력</option></select><input type="number" id="c_ref_bk_amt" class="form-control form-control-sm d-none" placeholder="수동 반환액" oninput="window.previewConsoleRef()" ${dis}></div><div id="c_ref_preview" class="text-center small fw-bold text-danger mb-1 bg-light rounded py-1">예상: 수강료 0 / 교재비 0</div><button class="btn btn-danger btn-sm w-100 fw-bold shadow-sm" onclick="window.addConsoleRef()" ${dis}>환불 승인</button></div></div>`;
    
    const curC = e.overrideCho3 || ''; const curF = e.overrideFree || '';
    const defC = window.SysSet.cho3Priority || 'T,B'; const defF = window.SysSet.freePriority || 'T,B';
    function nm(v) { return v==='T,B'?'수강료 ➔ 교재비':v==='B,T'?'교재비 ➔ 수강료':'수강료 전용'; }

    hAction += `<div class="card border-primary no-print"><div class="card-header bg-primary text-white py-1 fw-bold small">⚙️ 3. 개별공제 설정 (Local Override)</div><div class="card-body p-2">
        <label class="small fw-bold text-primary mb-1">초3 지원금 예외</label>
        <select id="c_rule_cho3" class="form-select form-select-sm mb-2 border-primary bg-primary bg-opacity-10" ${dis}>
            <option value="" ${curC===''?'selected':''}>🌐 기본값 (${nm(defC)})</option>
            <option value="T,B" ${curC==='T,B'?'selected':''}>⚠️ [예외] 수강료 ➔ 교재비</option>
            <option value="B,T" ${curC==='B,T'?'selected':''}>⚠️ [예외] 교재비 ➔ 수강료</option>
            <option value="T" ${curC==='T'?'selected':''}>⚠️ [예외] 수강료 전용</option>
        </select>
        <label class="small fw-bold text-success mb-1">자유수강권 예외</label>
        <select id="c_rule_free" class="form-select form-select-sm mb-3 border-success bg-success bg-opacity-10" ${dis}>
            <option value="" ${curF===''?'selected':''}>🌐 기본값 (${nm(defF)})</option>
            <option value="T,B" ${curF==='T,B'?'selected':''}>⚠️ [예외] 수강료 ➔ 교재비</option>
            <option value="B,T" ${curF==='B,T'?'selected':''}>⚠️ [예외] 교재비 ➔ 수강료</option>
            <option value="T" ${curF==='T'?'selected':''}>⚠️ [예외] 수강료 전용</option>
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
            if (bkTy === 'MANUAL') window.$('c_ref_bk_amt').classList.remove('d-none'); 
            else window.$('c_ref_bk_amt').classList.add('d-none'); 
        } 
        window.updateConsoleRefHours(); 
    };
    setTimeout(() => { window.updateConsoleRefHours(); window.toggleRefInputs(); window.previewConsoleRef(); }, 0);
};

window.setConsoleActive = function(i) { window.cActiveEIdx = i; window.renderConsole(); };

window.addConsoleAdj = function() { 
    const e = window.E[window.cActiveEIdx]; 
    if (window.isFullyLocked(e.q, e.course)) return alert('🔒 전체 마감된 강좌이므로 조정이 불가합니다.'); 
    const t = window.val('c_adj_title'), aT = window.num(window.val('c_adj_t')), aB = window.num(window.val('c_adj_b')); 
    if(!t) return alert('조정 사유 필수'); 
    window.commitState(() => { e.adjusts.push({ title:t, amtT:aT, amtB:aB }); }); 
};

window.addConsoleRef = function() { 
    const e = window.E[window.cActiveEIdx]; 
    if (window.isFullyLocked(e.q, e.course)) return alert('🔒 전체 마감된 강좌입니다.'); 
    const si = window.num(window.$('c_ref_idx').value);
    
    // 💡 개별 차수 락(Lock) 이중 방어
    if (window.SysSet.closedSess && window.SysSet.closedSess[`${e.q}_${si}`]) {
        return alert(`🔒 ${si+1}차수는 이미 마감되었습니다.\n환불을 진행하려면 먼저 4스텝에서 ${si+1}차 마감을 해제해 주세요.`);
    }

    const ty = window.val('c_ref_ty'), ah = window.num(window.val('c_ref_ah')), bkTy = window.val('c_ref_bk_ty'); 
    const bkAmt = bkTy === 'MANUAL' ? window.num(window.val('c_ref_bk_amt')) : 0; 
    window.commitState(() => { e.refunds.push({ sessIdx:si, ty, ah, reqBk:false, bkRefTy: bkTy, bkRefAmt: bkAmt, rt:0, rb:0, tyNm:'' }); }); 
};

window.saveConsoleRule = function() {
    const e = window.E[window.cActiveEIdx]; 
    if (window.isFullyLocked(e.q, e.course)) return alert('🔒 전체 마감된 분기입니다.');
    const oC = window.val('c_rule_cho3') || null; const oF = window.val('c_rule_free') || null;
    function rNm(v) { if(v==='T,B') return '수강료우선'; if(v==='B,T') return '교재비우선'; if(v==='T') return '수강료전용'; return ''; }
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
    
    // 💡 환불 내역 삭제 시, 해당 환불이 속한 차수의 마감 여부 방어
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

window.openCourseSummary = function(cName, q, mode = 'EDIT') {
    if(!window.$('crsSummaryTitle') || !window.mdlCrsSummary) return;
    window.curCrsName = cName; window.curCrsQ = q; window.curCrsIsExact = !!window.C[cName];
    window.curCrsMode = mode; window.curCrsSess = 'ALL'; 

    // 상태 판별 및 뱃지 생성
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
        window.$('bulk_memo').value = ''; window.$('bulk_amt').value = '';
        const wrap = window.$('bulkActionWrap'); 
        if (wrap) wrap.style.display = fullyLocked ? 'none' : 'flex'; // 전체 마감 시에만 숨김
    }

    window.renderCourseModalBody([]); window.mdlCrsSummary.show();
};
/* ==========================================================================
   💡 강좌 명세서(모달창) 내부 테이블 렌더링 (부분 마감 허용 로직 적용)
   ========================================================================== */
window.renderCourseModalBody = function(savedUids = []) {
    const cName = window.curCrsName; 
    const q = window.curCrsQ; 
    const isExact = window.curCrsIsExact; 
    
    // 💡 1. 구형 로직(isQuarterLocked) 대신 신형 로직(isFullyLocked)을 선언합니다.
    const fullyLocked = window.isFullyLocked(q, cName);
    
    const mode = window.curCrsMode || 'EDIT';
    const sessFilt = window.curCrsSess || 'ALL'; 

    const list = window.Hs.filter(h => h.q === q && (isExact ? h.c === cName : h.c.replace(/\s*\([A-Za-z가-힣0-9]+\)$/, '').trim() === cName));
    let base = {t:0, b:0}; 
    if (isExact) { base = window.C[cName]?.[q] || {t:0, b:0}; } 
    else if (list.length > 0) { base = window.C[list[0].c]?.[q] || {t:0, b:0}; }
    
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

    window.$('crsSummaryTop').innerHTML = `<div class="p-2 bg-light border rounded text-center"><div class="d-flex justify-content-around"><div><strong>기초 수강료:</strong> ${window.fmt(base.t)}원</div><div><strong>기초 교재비:</strong> ${window.fmt(base.b)}원</div><div><strong>${headerLabel}:</strong> <span class="text-primary fw-bold">${list.length}명</span></div></div>${sessBtnHtml}</div>`;
    
    let h = '';
    if(!list.length) { 
        h = `<tr><td colspan="15" class="text-muted py-4">수강생이 없습니다.</td></tr>`; 
        if(window.$('crsSummaryHead')) window.$('crsSummaryHead').innerHTML = `<tr><th>안내</th></tr>`;
    } else {
        list.sort((a,b)=>{ let aP = a.dp.split('-').map(Number); let bP = b.dp.split('-').map(Number); return (aP[0]-bP[0]) || (aP[1]-bP[1]) || (aP[2]-bP[2]); });
        
        if (mode === 'REPORT') {
            if(window.$('crsSummaryHead')) window.$('crsSummaryHead').innerHTML = `<tr><th>학적</th><th>이름</th><th>대상</th><th>실부담 수강료</th><th>실부담 교재비</th><th class="bg-cho3">초3 수강</th><th class="bg-cho3">초3 교재</th><th class="bg-free">자유 수강</th><th class="bg-free">자유 교재</th><th class="text-danger">최종 수강</th><th class="text-danger">최종 교재</th><th>산출근거</th></tr>`;
            
            const cSum = {sT:0, sB:0, tc:0, bc:0, tf:0, bf:0, finT:0, finB:0};
            list.forEach(hItem => { 
                let d = hItem;
                if (sessFilt !== 'ALL') {
                    const tSess = Number(sessFilt);
                    const sd = hItem.sessDetails[tSess];
                    if (sd) { d = { ...hItem, sT: sd.tT, sB: sd.tB, tc: sd.tc, bc: sd.bc, tf: sd.tf, bf: sd.bf, finT: sd.finT, finB: sd.finB }; }
                    else { d = { ...hItem, sT: 0, sB: 0, tc: 0, bc: 0, tf: 0, bf: 0, finT: 0, finB: 0 }; }
                }

                cSum.sT += d.sT; cSum.sB += d.sB; cSum.tc+=d.tc; cSum.bc+=d.bc; cSum.tf+=d.tf; cSum.bf+=d.bf; cSum.finT+=d.finT; cSum.finB+=d.finB;
                
                let targetBadge = '';
                if (hItem.isC) targetBadge += `<span class="badge badge-cho3">초3</span>`;
                if (hItem.isF) targetBadge += `<span class="badge badge-free">자유</span>`;
                if (!targetBadge) targetBadge = `<span class="badge bg-light text-secondary border">일반</span>`;
                
                let auditBadge = window.getExceptionBadges(hItem.e);
                const classNameTag = !isExact ? `<span class="badge bg-secondary ms-1" style="font-size:0.7em;">${hItem.c.replace(cName,'').replace(/[()]/g,'').trim()}반</span>` : '';
                
                h += `<tr><td>${hItem.dp}</td><td class="fw-bold text-start ps-2"><span class="clickable text-dark" onclick="window.openStuConsole('${hItem.id}')">${hItem.nm}</span>${classNameTag}</td><td>${targetBadge}</td><td>${window.fmt(d.sT)}</td><td>${window.fmt(d.sB)}</td><td class="bg-cho3 text-primary">${window.fmt(d.tc)}</td><td class="bg-cho3 text-primary">${window.fmt(d.bc)}</td><td class="bg-free text-success">${window.fmt(d.tf)}</td><td class="bg-free text-success">${window.fmt(d.bf)}</td><td class="text-danger fw-bold">${window.fmt(d.finT)}</td><td class="text-danger fw-bold">${window.fmt(d.finB)}</td><td class="text-start" style="font-size:0.8rem;">${auditBadge}</td></tr>`; 
            });
            h += `<tr class="table-dark fw-bold sticky-bottom-row"><td colspan="3" class="text-end pe-3 text-warning">총 합계</td><td class="text-warning">${window.fmt(cSum.sT)}</td><td class="text-warning">${window.fmt(cSum.sB)}</td><td class="text-primary">${window.fmt(cSum.tc)}</td><td class="text-primary">${window.fmt(cSum.bc)}</td><td class="text-success">${window.fmt(cSum.tf)}</td><td class="text-success">${window.fmt(cSum.bf)}</td><td class="text-danger">${window.fmt(cSum.finT)}</td><td class="text-danger">${window.fmt(cSum.finB)}</td><td></td></tr>`;
            
        } else {
            if(window.$('crsSummaryHead')) window.$('crsSummaryHead').innerHTML = `<tr><th><input type="checkbox" id="chkAllStu" class="form-check-input" checked onclick="window.toggleAllCourseStu(this)"></th><th>학적</th><th>이름</th><th>대상</th><th>실부담 수강료</th><th>실부담 교재비</th><th class="table-warning" style="width: 120px;">🎯 개별 금액(±)</th><th class="table-warning" style="width: 160px;">📝 개별 사유(선택)</th><th class="table-warning" style="width: 70px;">관리</th></tr>`;
            
            const cSum = {sT:0, sB:0};
            list.forEach(hItem => { 
                cSum.sT += hItem.sT; cSum.sB += hItem.sB;
                const classNameTag = !isExact ? `<span class="badge bg-secondary ms-1" style="font-size:0.7em;">${hItem.c.replace(cName,'').replace(/[()]/g,'').trim()}반</span>` : '';
                const uidStr = hItem.id; 
                
                // 💡 2. '전체 마감(fullyLocked)'일 때만 입력창을 비활성화하도록 처리합니다.
                const dis = fullyLocked ? 'disabled' : ''; 
                
                let totalAdjT = hItem.e.adjusts.reduce((sum, a) => sum + (a.amtT || 0), 0); let totalAdjB = hItem.e.adjusts.reduce((sum, a) => sum + (a.amtB || 0), 0);
                let adjLedgerBadge = '';
                if (totalAdjT !== 0 || totalAdjB !== 0) {
                    adjLedgerBadge = `<div class="mt-1 d-flex gap-1" style="font-size:0.7rem;">${totalAdjT !== 0 ? `<span class="badge ${totalAdjT < 0 ? 'bg-danger bg-opacity-10 text-danger border border-danger' : 'bg-primary bg-opacity-10 text-primary border border-primary'} py-0 px-1">수강료교정 ${totalAdjT > 0 ? '+' : ''}${window.fmt(totalAdjT)}</span>` : ''}${totalAdjB !== 0 ? `<span class="badge ${totalAdjB < 0 ? 'bg-danger bg-opacity-10 text-danger border border-danger' : 'bg-info bg-opacity-10 text-info border border-info'} py-0 px-1">교재비교정 ${totalAdjB > 0 ? '+' : ''}${window.fmt(totalAdjB)}</span>` : ''}</div>`;
                }
                const flashClass = savedUids.includes(uidStr) ? 'row-flash-success' : '';
                
                // 💡 3. 하단의 input 태그들에 ${dis}가 적용되어, 부분 마감 상태에서는 입력창이 정상적으로 동작합니다.
                h += `<tr class="${flashClass}"><td><input type="checkbox" class="form-check-input crs-stu-chk" value="${uidStr}" checked ${dis}></td><td>${hItem.dp}</td><td class="fw-bold text-start ps-2"><span class="clickable text-dark" onclick="window.openStuConsole('${uidStr}')">${hItem.nm}</span>${classNameTag}${adjLedgerBadge}</td><td>${hItem.fBadge}</td><td class="text-primary fw-bold bg-light">${window.fmt(hItem.sT)}</td><td class="text-success fw-bold bg-light">${window.fmt(hItem.sB)}</td><td class="bg-warning bg-opacity-10"><input type="number" id="inl_amt_${uidStr}" class="form-control form-control-sm border-warning text-end fw-bold" placeholder="0" ${dis}></td><td class="bg-warning bg-opacity-10"><input type="text" id="inl_memo_${uidStr}" class="form-control form-control-sm border-warning" placeholder="공통사유 따름" ${dis} onkeydown="if(event.key==='Enter') window.applyInlineAdjustment('${uidStr}')"></td><td class="bg-warning bg-opacity-10"><button class="btn btn-sm btn-dark py-0 px-2" onclick="window.applyInlineAdjustment('${uidStr}')" ${dis} title="이 학생만 개별 저장">저장</button></td></tr>`; 
            });
            h += `<tr class="table-dark fw-bold sticky-bottom-row"><td colspan="4" class="text-end pe-3 text-warning">총 합계 (실시간)</td><td class="text-warning">${window.fmt(cSum.sT)}</td><td class="text-warning">${window.fmt(cSum.sB)}</td><td colspan="3"></td></tr>`;
        }
    }
    window.$('crsSummaryBody').innerHTML = h;
};

window.applyBulkAdjustment = function() {
    if (window.isFullyLocked(window.curCrsQ, window.curCrsName)) return alert('🔒 전체 마감된 강좌이므로 조정할 수 없습니다.');
    const amt = window.num(window.val('bulk_amt')); if (amt === 0) return alert('조정할 금액(0 제외)을 입력해 주세요.');
    const type = window.val('bulk_type'); const typeNm = type === 'T' ? '수강료' : '교재비';
    const memo = window.val('bulk_memo') || `[${window.curCrsName}] ${typeNm} 일괄조정`;
    const checkedBoxes = document.querySelectorAll('.crs-stu-chk:checked'); if (checkedBoxes.length === 0) return alert('선택된 학생이 없습니다.');

    let applyCount = 0; let savedUids = []; 
    window.commitState(() => {
        checkedBoxes.forEach(chk => {
            const eId = chk.value;
            const targetEnrollments = window.E.filter(e => window.uid(e.g, e.b, e.n, e.name) === eId && e.q === window.curCrsQ && (window.curCrsIsExact ? e.course === window.curCrsName : e.course.startsWith(window.curCrsName)));
            targetEnrollments.forEach(e => { e.adjusts.push({ title: memo, amtT: type === 'T' ? amt : 0, amtB: type === 'B' ? amt : 0 }); applyCount++; });
            savedUids.push(eId);
        });
    }, { savedUids });
    if (applyCount > 0) window.$('bulk_amt').value = '';
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

window.applyInlineAdjustment = function(eId) {
    if (window.isFullyLocked(window.curCrsQ, window.curCrsName)) return alert('🔒 전체 마감된 강좌입니다.');
    const amt = window.num(window.val(`inl_amt_${eId}`)); if (amt === 0) return alert('조정할 금액을 입력해 주세요.');
    const type = window.val('bulk_type'); const typeNm = type === 'T' ? '수강료' : '교재비';
    const indMemo = window.val(`inl_memo_${eId}`); const bulkMemo = window.val('bulk_memo'); const memo = indMemo || bulkMemo || `[${window.curCrsName}] ${typeNm} 개별조정`;

    window.commitState(() => {
        const targetEnrollments = window.E.filter(e => window.uid(e.g, e.b, e.n, e.name) === eId && e.q === window.curCrsQ && (window.curCrsIsExact ? e.course === window.curCrsName : e.course.startsWith(window.curCrsName)));
        targetEnrollments.forEach(e => { e.adjusts.push({ title: memo, amtT: type === 'T' ? amt : 0, amtB: type === 'B' ? amt : 0 }); });
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

/* ==========================================================================
   💡 복원된 기능: 엑셀 교정본 강제 마감 업로드 (Hard Lock Migration)
   ========================================================================== */
window.upMigration = async function(inputEl) {
    const file = inputEl.files[0];
    if (!file) return;

    if (!confirm('🚨 경고: 업로드한 엑셀(교정본)의 데이터로 현재 장부의 금액을 강제 덮어쓰고 마감(Lock) 처리하시겠습니까?\n\n※ 시스템의 자동 연산 로직보다 이 엑셀 파일의 금액이 최우선으로 반영됩니다.')) {
        inputEl.value = ''; return;
    }

    try {
        const buf = await window.readFileAsArrayBuffer(file);
        const rows = window.parseXlsx(buf);
        if (rows.length === 0) throw new Error('데이터가 비어있습니다.');

        let applyCount = 0;
        
        window.commitState(() => {
            rows.forEach(r => {
                const q = Number(r['분기']);
                const g = Number(r['학년']);
                const b = Number(r['반']);
                const n = Number(r['번호']);
                const nm = String(r['이름']||'').trim();
                const c = String(r['강좌명']||'').trim();

                if (!q || !nm || !c) return;

                // 엑셀에서 교정된 수동 금액 추출
                const tc = Number(r['초3지원_수강료공제']) || 0;
                const bc = Number(r['초3지원_교재비공제']) || 0;
                const tf = Number(r['자유수강_수강료공제']) || 0;
                const bf = Number(r['자유수강_교재비공제']) || 0;
                const finT = Number(r['최종_수강료자부담']) || 0;
                const finB = Number(r['최종_교재비자부담']) || 0;

                const stuId = window.uid(g, b, n, nm);
                const lockKey = `${stuId}_${c}`;

                // 해당 강좌의 차수 계산 (기본 3차수)
                const mhArr = (window.C[c]?.[q]?.mh || '4,4,4').split(',').filter(x => Number(x) > 0);
                const maxSess = mhArr.length || 1;

                // 💡 엑셀의 총합 데이터를 1차수(sessIdx:0)에 강제 주입하고, 나머지 차수는 0으로 처리하여 총액을 완벽히 맞춤
                window.SysSet.closedSess = window.SysSet.closedSess || {};

                for (let sIdx = 0; sIdx < maxSess; sIdx++) {
                    const sessKey = `${q}_${sIdx}`;
                    
                    // 강제 락(Hard Lock) 생성
                    if (!window.SysSet.closedSess[sessKey]) {
                        window.SysSet.closedSess[sessKey] = { _isHardLocked: true };
                    }
                    window.SysSet.closedSess[sessKey]._isHardLocked = true;

                    if (sIdx === 0) {
                        // 1차수에 엑셀 금액 전액 밀어넣기
                        window.SysSet.closedSess[sessKey][lockKey] = {
                            cho3Amt: tc, cho3Bk: bc,
                            freeAmt: tf, freeBk: bf,
                            selfAmt: finT, selfBk: finB
                        };
                    } else {
                        // 이후 차수는 0으로 잠금
                        window.SysSet.closedSess[sessKey][lockKey] = {
                            cho3Amt: 0, cho3Bk: 0, freeAmt: 0, freeBk: 0, selfAmt: 0, selfBk: 0
                        };
                    }
                }
                applyCount++;
            });
        });

        alert(`✅ 총 ${applyCount}건의 데이터가 엑셀 교정본을 기준으로 강제 덮어쓰기 및 마감(Lock) 되었습니다.\n\n4스텝 체크박스에 🛠️(강제 마감) 아이콘이 표시됩니다.`);
        
    } catch (err) {
        console.error(err);
        alert('❌ 엑셀 파일을 읽는 중 오류가 발생했습니다. 시스템에서 다운로드한 [교정본] 양식 그대로 업로드했는지 확인해 주세요.');
    } finally {
        inputEl.value = ''; // 재사용을 위해 input 초기화
    }
};