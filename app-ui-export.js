/* ==========================================================================
   파일닉네임: app-ui-export.js
   기능설명: Step 5 행정 지원 자동 서식 추출 (고지서, 명렬표, 환불신청서 Excel/Print)
   ========================================================================== */
'use strict';

window.eduDataCached = []; 

window.initStep5 = function() { 
    if (typeof window.autoRunSet === 'function') window.autoRunSet(true); 
    window.renderPreviewInvoice(); 
    window.renderPreviewRef(); 
    window.renderPreviewRoster(); 
    if (typeof window.buildEduTabs === 'function') window.buildEduTabs();
};

/* --------------------------------------------------------------------------
   0. 에듀파인 수납요구서 렌더링 (원작자 기능 보존 및 3D 확장)
   -------------------------------------------------------------------------- */
window.buildEduTabs = function() { 
    const is3D = window.SysSet.accType === 'SEPARATED';
    const q = window.gQ; 
    const ls = window.Hs.filter(h => h.q === q && (h.finT > 0 || h.finB > 0 || (is3D && h.finM > 0))); 
    const grouped = {}; 
    ls.forEach(h => { 
        const baseC = h.c.replace(/\s*\([A-Za-z가-힣0-9]+\)$/, '').trim(); 
        if (!grouped[baseC]) grouped[baseC] = []; 
        grouped[baseC].push(h); 
    });
    window.eduDataCached = []; 
    Object.keys(grouped).forEach(bc => { 
        const sub = grouped[bc]; 
        sub.filter(h => h.finT > 0).forEach(h => { window.eduDataCached.push({ sheet: bc + ' 수강료', g: h.e.g, b: h.e.b, n: h.e.n, nm: h.nm, amt: h.finT }); }); 
        sub.filter(h => h.finB > 0).forEach(h => { window.eduDataCached.push({ sheet: bc + ' 교재비', g: h.e.g, b: h.e.b, n: h.e.n, nm: h.nm, amt: h.finB }); }); 
        if (is3D) {
            sub.filter(h => h.finM > 0).forEach(h => { window.eduDataCached.push({ sheet: bc + ' 재료비', g: h.e.g, b: h.e.b, n: h.e.n, nm: h.nm, amt: h.finM }); }); 
        }
    }); 
    const sheetNames = [...new Set(window.eduDataCached.map(d => d.sheet))]; 
    
    // 💡 [수정4] btn-primary 클래스를 제거하고 css에 있는 active 클래스만 토글하도록 수정
    let hTabs = sheetNames.map((sn, idx) => `<button class="sheet-pill ${idx===0?'active':''}" onclick="window.renderEduSheet('${sn}', this)">${sn}</button>`).join(''); 
    
    if(window.$('eduSheetTabs')) window.$('eduSheetTabs').innerHTML = hTabs || '<div class="small text-muted py-3">해당 분기에 수납 대상(자부담)이 없습니다.</div>'; 
    if(sheetNames.length) window.renderEduSheet(sheetNames[0]); else if(window.$('prev_edu')) window.$('prev_edu').innerHTML = ''; 
};

window.renderEduSheet = function(sn, el) { 
    if(el) { 
        // 💡 [수정4] 버튼 묶음에서 active를 지우고 현재 클릭된 버튼에만 active 부여
        Array.from(el.parentNode.children).forEach(b => b.classList.remove('active')); 
        el.classList.add('active'); 
    } 
    const filtered = window.eduDataCached.filter(d => d.sheet === sn); 
    const total = filtered.reduce((s, d) => s + d.amt, 0); 
    let h = `<tr class="table-dark fw-bold sticky-total-row"><td colspan="2" class="text-warning text-end">시트 합계</td><td class="text-danger">${window.fmt(total)}원</td><td></td></tr>`; 
    h += filtered.map(d => { 
        const stuUid = window.uid(d.g, d.b, d.n, d.nm).replace(/'/g,"\\'"); 
        return `<tr><td>${window.dsp(d.g, d.b, d.n)}</td><td class="fw-bold"><span class="clickable text-dark" onclick="window.openStuConsole('${stuUid}')">${d.nm}</span></td><td class="text-danger fw-bold">${window.fmt(d.amt)}</td><td>${sn}</td></tr>`; 
    }).join(''); 
    if(window.$('prev_edu')) window.$('prev_edu').innerHTML = h; 
};

window.exEdu = function() { 
    const q = window.gQ; if (!window.eduDataCached.length) return alert('추출할 내역이 없습니다.'); 
    const wb = XLSX.utils.book_new(); const sg = {}; 
    window.eduDataCached.forEach(r => { 
        if(!sg[r.sheet]) sg[r.sheet]=[]; 
        sg[r.sheet].push({ '* 학과': r.sheet.replace(/ 수강료| 교재비| 재료비/g, ''), '* 학년': r.g, '* 반': r.b, '* 번호': r.n, '* 성명': r.nm, '* 대상금액': r.amt }); 
    }); 
    Object.keys(sg).forEach(sn => { 
        const total = sg[sn].reduce((sum, r) => sum + r['* 대상금액'], 0); 
        sg[sn].push({ '* 학과': '총계', '* 학년': '', '* 반': '', '* 번호': '', '* 성명': '', '* 대상금액': total }); 
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sg[sn]), sn.substring(0, 31)); 
    }); 
    XLSX.writeFile(wb, `${q}분기_에듀파인_수납요구서.xlsx`); 
};

/* --------------------------------------------------------------------------
   1. 교육비 청구서 (Invoice) 추출 로직 (강사비/수용비 3단 세분화 및 부서별 집계)
   -------------------------------------------------------------------------- */
window.renderPreviewInvoice = function() { 
    const q = window.num(window.val('p_qInvoice')) || window.gQ; 
    const sFilt = window.val('p_sInvoice') || 'ALL';
    
    const ls = window.Hs.filter(h => h.q === q); 
    const cGroup = {}; 
    
    ls.forEach(hItem => {
        let d = hItem;
        if (sFilt !== 'ALL') {
            const sd = hItem.sessDetails[Number(sFilt)];
            if (!sd) return; 
            // 지출용 청구서이므로 수강료 데이터만 사용
            d = { ...hItem, sT: sd.tT, tc: sd.tc, tf: sd.tf, finT: sd.finT };
        }
        if (d.sT === 0 && d.finT === 0) return;

        // 부서명(baseC) 추출
        const baseC = d.c.replace(/\s*\([A-Za-z가-힣0-9]+\)$/, '').trim();
        
        // 💡 1. 강사료/수용비 안분 비율 계산
        let cConf = window.C[d.c]?.[q] || {t:0, instTot:0, mgmtTot:0};
        let ratio = 1;
        if (cConf.t > 0) ratio = cConf.instTot / cConf.t;

        // 💡 2. 각 항목별(원가, 초3, 자유)로 강사료/수용비 정확히 쪼개기 (10원 단위 반올림)
        let sT_i = Math.round((d.sT * ratio) / 10) * 10;
        let sT_m = d.sT - sT_i;

        let tc_i = Math.round((d.tc * ratio) / 10) * 10;
        let tc_m = d.tc - tc_i;

        let tf_i = Math.round((d.tf * ratio) / 10) * 10;
        let tf_m = d.tf - tf_i;

        // 💡 3. 자부담은 (원가 - 공제) 공식을 그대로 적용하여 회계 무결성 유지!
        let finT_i = sT_i - tc_i - tf_i;
        let finT_m = sT_m - tc_m - tf_m;

        if (!cGroup[baseC]) cGroup[baseC] = { 
            c: baseC, cnt: 0, 
            sT: 0, sT_i: 0, sT_m: 0, 
            tc: 0, tc_i: 0, tc_m: 0, 
            tf: 0, tf_i: 0, tf_m: 0, 
            finT: 0, finT_i: 0, finT_m: 0 
        };
        
        const g = cGroup[baseC];
        g.cnt++;
        g.sT += d.sT; g.sT_i += sT_i; g.sT_m += sT_m;
        g.tc += d.tc; g.tc_i += tc_i; g.tc_m += tc_m;
        g.tf += d.tf; g.tf_i += tf_i; g.tf_m += tf_m;
        g.finT += d.finT; g.finT_i += finT_i; g.finT_m += finT_m;
    });

    const data = Object.values(cGroup).sort((a,b) => a.c.localeCompare(b.c));
    
    let h = ''; 
    if (!data.length) {
        h = `<tr><td colspan="14" class="py-5 text-muted bg-light">청구 내역이 없습니다.</td></tr>`; 
    } else { 
        let t_cnt=0, t_sT=0, t_sT_i=0, t_sT_m=0, t_tc=0, t_tc_i=0, t_tc_m=0, t_tf=0, t_tf_i=0, t_tf_m=0, t_finT=0, t_finT_i=0, t_finT_m=0;
        
        // 💡 예전 스크린샷과 동일한 2단 그룹 헤더 구조 완벽 복원 (수/교/재 -> 계/강/수)
        if(window.$('tbInvHead')) {
            window.$('tbInvHead').innerHTML = `<tr>
                <th rowspan="2" class="align-middle" style="min-width: 100px;">부서명</th>
                <th rowspan="2" class="align-middle">청구<br>인원</th>
                <th colspan="3" class="bg-secondary bg-opacity-10">수강료 원가(총액)</th>
                <th colspan="3" class="bg-cho3 text-primary">초3 수강료 공제</th>
                <th colspan="3" class="bg-free text-success">자유 수강료 공제</th>
                <th colspan="3" class="bg-danger bg-opacity-10 text-danger">자부담(수납액)</th>
            </tr>
            <tr>
                <th class="bg-secondary bg-opacity-10">수강료(계)</th>
                <th class="bg-secondary bg-opacity-10 text-primary">강사료</th>
                <th class="bg-secondary bg-opacity-10 text-danger">수용비</th>
                <th class="bg-cho3 text-primary">수강료(계)</th>
                <th class="bg-cho3 text-primary">강사료</th>
                <th class="bg-cho3 text-primary">수용비</th>
                <th class="bg-free text-success">수강료(계)</th>
                <th class="bg-free text-success">강사료</th>
                <th class="bg-free text-success">수용비</th>
                <th class="bg-danger bg-opacity-10 text-danger">최종청구(계)</th>
                <th class="bg-danger bg-opacity-10 text-danger">강사료</th>
                <th class="bg-danger bg-opacity-10 text-danger">수용비</th>
            </tr>`;
        }
        
        data.forEach(g => {
            t_cnt += g.cnt;
            t_sT += g.sT; t_sT_i += g.sT_i; t_sT_m += g.sT_m;
            t_tc += g.tc; t_tc_i += g.tc_i; t_tc_m += g.tc_m;
            t_tf += g.tf; t_tf_i += g.tf_i; t_tf_m += g.tf_m;
            t_finT += g.finT; t_finT_i += g.finT_i; t_finT_m += g.finT_m;

            h += `<tr>
                <td class="text-start fw-bold">
                    <span class="clickable text-primary" style="cursor:pointer; text-decoration:underline;" onclick="window.openCourseSummary('${g.c.replace(/'/g, "\\'")}', ${q}, 'REPORT')">
                        <i class="bi bi-window"></i> ${g.c}
                    </span>
                </td>
                <td>${g.cnt}명</td>
                <td class="bg-light fw-bold">${window.fmt(g.sT)}</td>
                <td class="bg-light text-primary">${window.fmt(g.sT_i)}</td>
                <td class="bg-light text-danger">${window.fmt(g.sT_m)}</td>
                <td class="bg-cho3 fw-bold">${window.fmt(g.tc)}</td>
                <td class="bg-cho3 text-primary">${window.fmt(g.tc_i)}</td>
                <td class="bg-cho3 text-danger">${window.fmt(g.tc_m)}</td>
                <td class="bg-free fw-bold">${window.fmt(g.tf)}</td>
                <td class="bg-free text-primary">${window.fmt(g.tf_i)}</td>
                <td class="bg-free text-danger">${window.fmt(g.tf_m)}</td>
                <td class="bg-danger bg-opacity-10 fw-bold text-danger">${window.fmt(g.finT)}</td>
                <td class="bg-danger bg-opacity-10 text-primary">${window.fmt(g.finT_i)}</td>
                <td class="bg-danger bg-opacity-10 text-danger">${window.fmt(g.finT_m)}</td>
            </tr>`;
        });
        
        h += `<tr class="table-dark fw-bold sticky-total-row">
            <td class="text-warning text-end">총 합계</td><td class="text-warning">${t_cnt}명</td>
            <td class="text-warning">${window.fmt(t_sT)}</td>
            <td class="text-warning">${window.fmt(t_sT_i)}</td>
            <td class="text-warning">${window.fmt(t_sT_m)}</td>
            <td class="text-primary">${window.fmt(t_tc)}</td>
            <td class="text-primary">${window.fmt(t_tc_i)}</td>
            <td class="text-primary">${window.fmt(t_tc_m)}</td>
            <td class="text-success">${window.fmt(t_tf)}</td>
            <td class="text-success">${window.fmt(t_tf_i)}</td>
            <td class="text-success">${window.fmt(t_tf_m)}</td>
            <td class="text-danger">${window.fmt(t_finT)}</td>
            <td class="text-danger">${window.fmt(t_finT_i)}</td>
            <td class="text-danger">${window.fmt(t_finT_m)}</td>
        </tr>`;
    } 
    if(window.$('prev_inv')) window.$('prev_inv').innerHTML = h; 
};

window.exInvoice = function() { 
    const q = window.num(window.val('p_qInvoice')) || window.gQ; 
    const sFilt = window.val('p_sInvoice') || 'ALL';
    
    const ls = window.Hs.filter(h => h.q === q); 
    const cGroup = {}; 
    
    ls.forEach(hItem => {
        let d = hItem;
        if (sFilt !== 'ALL') {
            const sd = hItem.sessDetails[Number(sFilt)];
            if (!sd) return; 
            d = { ...hItem, sT: sd.tT, tc: sd.tc, tf: sd.tf, finT: sd.finT };
        }
        if (d.sT === 0 && d.finT === 0) return;

        const baseC = d.c.replace(/\s*\([A-Za-z가-힣0-9]+\)$/, '').trim();
        
        let cConf = window.C[d.c]?.[q] || {t:0, instTot:0, mgmtTot:0};
        let ratio = 1;
        if (cConf.t > 0) ratio = cConf.instTot / cConf.t;

        let sT_i = Math.round((d.sT * ratio) / 10) * 10;
        let sT_m = d.sT - sT_i;
        let tc_i = Math.round((d.tc * ratio) / 10) * 10;
        let tc_m = d.tc - tc_i;
        let tf_i = Math.round((d.tf * ratio) / 10) * 10;
        let tf_m = d.tf - tf_i;
        let finT_i = sT_i - tc_i - tf_i;
        let finT_m = sT_m - tc_m - tf_m;

        if (!cGroup[baseC]) cGroup[baseC] = { 
            c: baseC, cnt: 0, 
            sT: 0, sT_i: 0, sT_m: 0, tc: 0, tc_i: 0, tc_m: 0, 
            tf: 0, tf_i: 0, tf_m: 0, finT: 0, finT_i: 0, finT_m: 0 
        };
        
        const g = cGroup[baseC];
        g.cnt++;
        g.sT += d.sT; g.sT_i += sT_i; g.sT_m += sT_m;
        g.tc += d.tc; g.tc_i += tc_i; g.tc_m += tc_m;
        g.tf += d.tf; g.tf_i += tf_i; g.tf_m += tf_m;
        g.finT += d.finT; g.finT_i += finT_i; g.finT_m += finT_m;
    });

    const data = Object.values(cGroup).sort((a,b) => a.c.localeCompare(b.c));
    if (!data.length) return alert('추출할 내역이 없습니다.'); 

    const rows = data.map(r => { 
        return { 
            '부서명': r.c, 
            '청구인원': r.cnt, 
            '원가_수강료(계)': r.sT, 
            '원가_강사료': r.sT_i,
            '원가_수용비': r.sT_m,
            '초3공제_수강료(계)': r.tc,
            '초3공제_강사료': r.tc_i,
            '초3공제_수용비': r.tc_m,
            '자유공제_수강료(계)': r.tf,
            '자유공제_강사료': r.tf_i,
            '자유공제_수용비': r.tf_m,
            '자부담_최종청구(계)': r.finT,
            '자부담_강사료': r.finT_i,
            '자부담_수용비': r.finT_m
        };
    }); 
    
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), `청구서(${q}분기)`); 
    XLSX.writeFile(wb, `방과후_강사비청구서_${q}분기.xlsx`); 
};

/* --------------------------------------------------------------------------
   2. 출석부/명렬표 (Roster) 추출 로직
   -------------------------------------------------------------------------- */
window.getRosterData = function(q) { 
    const ls = window.Hs.filter(h => h.q === q).sort((a,b) => a.c.localeCompare(b.c) || a.e.g-b.e.g || a.e.b-b.e.b || a.e.n-b.e.n); 
    return ls.map(h => ({ g: h.e.g, ban: h.e.b, n: h.e.n, nm: h.nm, c: h.c, t: h.sT, b: h.sB, m: h.sM || 0, tot: h.sT + h.sB + (h.sM || 0) })); 
};

window.renderPreviewRoster = function() { 
    const is3D = window.SysSet.accType === 'SEPARATED';
    const q = window.gQ; const data = window.getRosterData(q); 
    let h = ''; 
    if (!data.length) h = `<tr><td colspan="${is3D ? 8 : 7}" class="py-5 text-muted bg-light">명렬표 데이터가 없습니다.</td></tr>`; 
    else { 
        let totT = 0, totB = 0, totM = 0, totAll = 0; 
        const thM = is3D ? `<th>재료비</th>` : '';
        if(window.$('prev_ros')) window.$('prev_ros').parentElement.querySelector('thead').innerHTML = `<tr><th>연번</th><th>학적</th><th>이름</th><th>강좌명</th><th>수강료</th><th>교재비</th>${thM}<th>합계(원가)</th></tr>`;
        
        data.forEach((r, idx) => { 
            totT += r.t; totB += r.b; totM += r.m; totAll += r.tot; 
            const stuUid = window.uid(r.g, r.ban, r.n, r.nm).replace(/'/g,"\\'"); 
            const tdM = is3D ? `<td>${window.fmt(r.m)}</td>` : '';
            h += `<tr><td>${idx+1}</td><td>${window.dsp(r.g,r.ban,r.n)}</td><td class="fw-bold"><span class="clickable text-dark" onclick="window.openStuConsole('${stuUid}')">${r.nm}</span></td><td class="text-start">${r.c}</td><td>${window.fmt(r.t)}</td><td>${window.fmt(r.b)}</td>${tdM}<td class="fw-bold text-danger">${window.fmt(r.tot)}</td></tr>`; 
        }); 
        const sumM = is3D ? `<td class="text-warning">${window.fmt(totM)}</td>` : '';
        h += `<tr class="table-dark fw-bold sticky-total-row"><td colspan="4" class="text-warning text-end">총계</td><td class="text-warning">${window.fmt(totT)}</td><td class="text-warning">${window.fmt(totB)}</td>${sumM}<td class="text-danger">${window.fmt(totAll)}</td></tr>`; 
    } 
    if(window.$('prev_ros')) window.$('prev_ros').innerHTML = h; 
};

window.exRoster = function() { 
    const is3D = window.SysSet.accType === 'SEPARATED';
    const q = window.gQ; const data = window.getRosterData(q); 
    if (!data.length) return alert('추출할 명단이 없습니다.'); 
    const wb = XLSX.utils.book_new(); 
    const rows = data.map((r, idx) => { 
        let obj = { '연번': idx+1, '학년': r.g, '반': r.ban, '번호': r.n, '이름': r.nm, '강좌명': r.c, '수강료': r.t, '교재비': r.b };
        if (is3D) obj['재료비'] = r.m;
        obj['합계(원가)'] = r.tot;
        return obj;
    }); 
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), `명렬표(${q}분기)`); XLSX.writeFile(wb, `방과후_명렬표_${q}분기.xlsx`); 
};

/* --------------------------------------------------------------------------
   3. 환불신청서 (Refund Receipt) 추출 로직
   -------------------------------------------------------------------------- */
window.renderPreviewRef = function() { 
    const is3D = window.SysSet.accType === 'SEPARATED';
    const q = window.num(window.val('p_q2')) || window.gQ; 
    const ls = []; 
    window.E.filter(e => e.q === q && e.refunds && e.refunds.length > 0).forEach(e => { e.refunds.forEach(r => { ls.push({ e, r }); }); }); 
    ls.sort((a,b) => new Date(a.r.date) - new Date(b.r.date)); 

    let h = ''; 
    if (!ls.length) h = `<tr><td colspan="${is3D ? 8 : 7}" class="py-5 text-muted bg-light">해당 분기에 환불 내역이 없습니다.</td></tr>`; 
    else { 
        let totT = 0, totB = 0, totM = 0; 
        const thM = is3D ? `<th class="bg-danger bg-opacity-10 text-danger">재료비 환불</th>` : '';
        if(window.$('prev_ref')) window.$('prev_ref').parentElement.querySelector('thead').innerHTML = `<tr><th>환불일자</th><th>학적/이름</th><th>강좌명</th><th>사유/기준</th><th class="bg-danger bg-opacity-10 text-danger">수강료 환불</th><th class="bg-danger bg-opacity-10 text-danger">교재비 환불</th>${thM}<th>합계</th></tr>`;
        
        ls.forEach(x => { 
            totT += x.r.rt||0; totB += x.r.rb||0; totM += x.r.rm||0; 
            const stuUid = window.uid(x.e.g, x.e.b, x.e.n, x.e.name).replace(/'/g,"\\'"); 
            const tdM = is3D ? `<td class="text-danger">${window.fmt(x.r.rm||0)}</td>` : '';
            h += `<tr><td>${x.r.date||'-'}</td><td class="fw-bold"><span class="clickable text-dark" onclick="window.openStuConsole('${stuUid}')">${window.dsp(x.e.g,x.e.b,x.e.n)} ${x.e.name}</span></td><td class="text-start">${x.e.course}</td><td>${x.r.ty}</td><td class="text-danger">${window.fmt(x.r.rt||0)}</td><td class="text-danger">${window.fmt(x.r.rb||0)}</td>${tdM}<td class="fw-bold text-danger">${window.fmt((x.r.rt||0)+(x.r.rb||0)+(x.r.rm||0))}</td></tr>`; 
        }); 
        
        const sumM = is3D ? `<td class="text-danger">${window.fmt(totM)}</td>` : '';
        h += `<tr class="table-dark fw-bold sticky-total-row"><td colspan="4" class="text-warning text-end">환불 총합계</td><td class="text-danger">${window.fmt(totT)}</td><td class="text-danger">${window.fmt(totB)}</td>${sumM}<td class="text-danger">${window.fmt(totT+totB+totM)}</td></tr>`; 
    } 
    if(window.$('prev_ref')) window.$('prev_ref').innerHTML = h; 
};

window.exRef = function() { 
    const is3D = window.SysSet.accType === 'SEPARATED';
    const q = window.num(window.val('p_q2')) || window.gQ; 
    const ls = []; 
    window.E.filter(e => e.q === q && e.refunds && e.refunds.length > 0).forEach(e => { e.refunds.forEach(r => { ls.push({ e, r }); }); }); 
    if (!ls.length) return alert('추출할 환불 내역이 없습니다.'); 
    ls.sort((a,b) => new Date(a.r.date) - new Date(b.r.date)); 

    const wb = XLSX.utils.book_new(); 
    const rows = ls.map((x, idx) => { 
        let obj = { '연번': idx+1, '환불일자': x.r.date||'', '학년': x.e.g, '반': x.e.b, '번호': x.e.n, '이름': x.e.name, '강좌명': x.e.course, '환불사유': x.r.ty, '수강료환불액': x.r.rt||0, '교재비환불액': x.r.rb||0 };
        if (is3D) obj['재료비환불액'] = x.r.rm||0;
        obj['총환불액'] = (x.r.rt||0)+(x.r.rb||0)+(x.r.rm||0);
        return obj;
    }); 
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), `환불내역(${q}분기)`); XLSX.writeFile(wb, `방과후_환불대장_${q}분기.xlsx`); 
};