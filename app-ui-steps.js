/* ==========================================================================
   파일닉네임: app-ui-steps.js
   기능설명: Step 1(부서/강좌), Step 2(수강생), Step 3(자유수강권) UI 렌더링 및 이벤트
   ========================================================================== */
'use strict';

window.renderM = function() {
    // 3D 모드일 때만 단일 등록 폼에 '기초 재료비' 칸을 오픈함
    if(window.$('c_m_wrap')) window.$('c_m_wrap').style.display = (window.SysSet.accType === 'SEPARATED') ? 'block' : 'none';

    if(!window.$('tbMaster')) return;
    const keys = Object.keys(window.M);
    if(!keys.length) return window.$('tbMaster').innerHTML = '<tbody><tr><td class="text-muted py-3">등록 부서 없음</td></tr></tbody>';

    const is3D = window.SysSet.accType === 'SEPARATED';
    const thM = is3D ? '<th class="table-info text-success">기초 재료비</th>' : '';
    
    // 💡 헤더에 '운영' 열 추가
    let h = `<thead class="table-light"><tr>
        <th>운영${window.tt('체크를 끄면 이 부서(강좌)를 이번 분기에 폐강 처리합니다. 이미 등록된 수강생이 있으면 경고 후, 확인 시 2스텝의 미배정(누락) 명단으로 자동 이동됩니다.')}</th><th>부서명</th><th>강좌수${window.tt('2 이상 입력하면 "부서명(A)", "부서명(B)"처럼 반별로 개별 강좌가 자동 복제되어 강좌 요금표에 올라갑니다.')}</th><th>월 강사료</th><th>월 수용비</th><th>기초 교재비</th>${thM}
        <th>주간단위${window.tt('이 강좌가 원래 1달(4주)에 몇 시간 진행되는 걸 기준으로 강사료가 책정됐는지를 나타냅니다. 예: 1=월 4시간 기준.')}</th><th>차수별시수${window.tt('이번 분기에 각 차수(1차,2차,3차...)가 실제로 몇 시간씩 진행됐는지를 콤마로 구분해 입력합니다. 예: 4,4,4 (공휴일로 한 차수만 줄었다면 4,3,4 처럼 그 칸만 고치면 됩니다).')}</th><th>삭제</th>
    </tr></thead><tbody>`;
    
    keys.forEach(dept => {
        const d = window.M[dept][window.gQ] || {cnt:1,inst_m:0,mgmt_m:0,b:0,m:0,unit:1,mh:'4,4,4'};
        const safe = dept.replace(/'/g, "\\'");
        
        // 💡 부서의 활성화 여부 판별 및 시각적 처리
        const isAct = d.isActive !== false;
        const trClass = isAct ? '' : 'bg-light opacity-50';
        
        const tdM = is3D ? `<td><input class="fmt-num mx-auto fw-bold text-success" style="width:70px" value="${window.fmt(d.m||0)}" onblur="window.updateM('${safe}','m',this)" ${isAct?'':'disabled'}></td>` : '';
        
        h += `<tr class="${trClass}">
            <td><input type="checkbox" class="form-check-input" ${isAct ? 'checked' : ''} onclick="window.toggleDeptActive('${safe}', window.gQ, this.checked)"></td>
            <td class="fw-bold align-middle text-primary">${dept} ${isAct?'':'<span class="badge bg-secondary ms-1" style="font-size:0.65rem;">미운영</span>'}</td>
            <td><input class="form-control form-control-sm text-center mx-auto" style="width:50px" value="${d.cnt}" onblur="window.updateM('${safe}','cnt',this)" ${isAct?'':'disabled'}></td>
            <td><input class="fmt-num mx-auto" style="width:70px" value="${window.fmt(d.inst_m)}" onblur="window.updateM('${safe}','inst_m',this)" ${isAct?'':'disabled'}></td>
            <td><input class="fmt-num mx-auto" style="width:70px" value="${window.fmt(d.mgmt_m)}" onblur="window.updateM('${safe}','mgmt_m',this)" ${isAct?'':'disabled'}></td>
            <td><input class="fmt-num mx-auto" style="width:70px" value="${window.fmt(d.b)}" onblur="window.updateM('${safe}','b',this)" ${isAct?'':'disabled'}></td>
            ${tdM}
            <td><input class="form-control form-control-sm text-center mx-auto" style="width:50px" value="${d.unit}" onblur="window.updateM('${safe}','unit',this)" ${isAct?'':'disabled'}></td>
            <td><input class="form-control form-control-sm text-center mx-auto" style="width:60px" value="${d.mh}" onblur="window.updateM('${safe}','mh',this)" ${isAct?'':'disabled'}></td>
            <td><button class="btn btn-sm btn-outline-danger py-0" onclick="window.delDept('${safe}')"><i class="bi bi-trash"></i></button></td>
        </tr>`;
    });
    window.$('tbMaster').innerHTML = h + '</tbody>';
};

// 💡 1스텝: 부서 운영(활성화/비활성화) 토글 및 누락명단 연동
window.toggleDeptActive = async function(dept, q, isChecked) {
    if (window.isQuarterLocked(q)) {
        window.showAlert('🔒 마감된 분기이므로 운영 여부를 변경할 수 없습니다.');
        window.renderM();
        return;
    }

    let affectedEnrolls = [];
    if (!isChecked) {
        affectedEnrolls = window.E.filter(e => e.q === q && (e.course === dept || e.course.startsWith(dept + '(')));
        if (affectedEnrolls.length > 0) {
            const msg = `🚨 [경고] 해당 부서에 등록된 수강생이 ${affectedEnrolls.length}명 있습니다.\n\n미운영(폐강) 처리 시 이 학생들은 모두 2스텝의 '미배정(누락)' 명단으로 강제 이동되며, 2스텝에서 재배정해야 합니다.\n\n정말 미운영 처리하시겠습니까?`;
            if (!(await window.showConfirm(msg))) {
                window.renderM(); return;
            }
        }
    }

    window.commitState(() => {
        if (!isChecked && affectedEnrolls.length > 0) {
            affectedEnrolls.forEach(e => {
                e.oldCourse = e.course; e.oldQ = e.q;
                e.course = '미배정(누락)'; e.mm = '부서 미운영(폐강)으로 인한 재배정 요망';
            });
        }
        if (window.M[dept] && window.M[dept][q]) { window.M[dept][q].isActive = isChecked; }
        Object.keys(window.C).forEach(cName => {
            if (cName === dept || cName.startsWith(dept + '(')) {
                if (window.C[cName] && window.C[cName][q]) { window.C[cName][q].isActive = isChecked; }
            }
        });
        if(window.$('e_c')) window.$('e_c').innerHTML = '<option value="">강좌선택</option>' + Object.keys(window.C).filter(c => window.C[c][window.gQ] && window.C[c][window.gQ].isActive !== false).sort().map(nm => `<option value="${nm}">${nm}</option>`).join('');
    });
    // 🗑️ 중복 호출 제거됨 (window.renderM, window.renderC, window.renderE, window.autoRunSet 등)
};

window.renderC = function() {
    if(!window.$('tbCourse')) return;
    const keys = Object.keys(window.C).filter(nm => window.C[nm][window.gQ]).sort();
    if (!keys.length) return window.$('tbCourse').innerHTML = '<tbody><tr><td class="text-muted py-3">산출 강좌 없음</td></tr></tbody>';

    // 💡 [3D 확장] 회계 유형에 따라 재료비 헤더 동적 생성
    const is3D = window.SysSet.accType === 'SEPARATED';
	const thM = is3D ? '<th class="table-info text-success">기초 재료비</th>' : '';
	let h = `<thead class="table-light"><tr>
		<th>운영${window.tt('체크를 끄면 이 강좌를 이번 분기에 폐강 처리합니다. 이미 등록된 수강생이 있으면 경고 후, 확인 시 2스텝의 미배정(누락) 명단으로 자동 이동됩니다.')}</th><th>생성 강좌명</th><th class="table-warning">총 수강료(분기)</th>
		<th class="table-warning text-primary">강사료</th><th class="table-warning text-danger">수용비</th>
		<th class="table-info">기초 교재비</th>${thM}
		<th>주간단위</th><th>차수별시수</th><th>초기화</th>
	</tr></thead><tbody>`;
    keys.forEach(nm => {
        const d = window.C[nm][window.gQ];
        const safe = nm.replace(/'/g, "\\'");
        const badge = d._isAuto === false ? '<span class="badge bg-danger ms-1" style="font-size:0.65rem;" title="수동 변경됨">수동</span>' : '';
        const isAct = d.isActive !== false;
        const trClass = isAct ? '' : 'bg-light opacity-50';
        
        // 💡 [3D 확장] 회계 유형에 따라 재료비 입력칸 동적 생성
        const tdM = is3D ? `<td><input class="fmt-num mx-auto fw-bold text-success" style="width:70px" value="${window.fmt(d.m||0)}" onblur="window.updateC('${safe}','m',this)" ${isAct?'':'disabled'}></td>` : '';

        h += `<tr class="${trClass}">
            <td><input type="checkbox" class="form-check-input" ${isAct ? 'checked' : ''} onclick="window.toggleCourseActive('${safe}', window.gQ, this.checked)"></td>
            <td class="course-link text-start" onclick="window.openCourseSummary('${safe}', window.gQ)">${nm} ${badge} ${isAct?'':'<span class="badge bg-secondary ms-1" style="font-size:0.65rem;">폐강</span>'}</td>
            <td class="fw-bold bg-light">${window.fmt(d.t)}</td>
            <td><input class="fmt-num mx-auto text-primary fw-bold" style="width:70px" value="${window.fmt(d.instTot)}" onblur="window.updateC('${safe}','instTot',this)" ${isAct?'':'disabled'}></td>
            <td><input class="fmt-num mx-auto text-danger fw-bold" style="width:70px" value="${window.fmt(d.mgmtTot)}" onblur="window.updateC('${safe}','mgmtTot',this)" ${isAct?'':'disabled'}></td>
            <td><input class="fmt-num mx-auto fw-bold" style="width:70px" value="${window.fmt(d.b)}" onblur="window.updateC('${safe}','b',this)" ${isAct?'':'disabled'}></td>
            ${tdM}
            <td><input class="form-control form-control-sm text-center mx-auto fw-bold text-success" style="width:50px" value="${d.unit||1}" onblur="window.updateC('${safe}','unit',this)" ${isAct?'':'disabled'}></td>
            <td><input class="form-control form-control-sm text-center mx-auto fw-bold" style="width:60px" value="${d.mh}" onblur="window.updateC('${safe}','mh',this)" ${isAct?'':'disabled'}></td>
            <td><button class="btn btn-sm btn-outline-secondary py-0" onclick="window.resetC('${safe}', window.gQ)" title="마스터 기준으로 복구" ${isAct?'':'disabled'}><i class="bi bi-arrow-clockwise"></i></button></td>
        </tr>`;
    });
    window.$('tbCourse').innerHTML = h + '</tbody>';
};

window.updateM = function(dept, k, el) {
    if(!window.M[dept] || !window.M[dept][window.gQ]) return;
    if (window.isQuarterLocked(window.gQ)) {
        window.showAlert('🔒 마감 변경 불가');
        el.value = (k==='mh')?window.M[dept][window.gQ][k]:window.fmt(window.M[dept][window.gQ][k]);
        return;
    }
    window.commitState(() => {
        if (k === 'mh') window.M[dept][window.gQ][k] = el.value.trim();
        else {
            window.M[dept][window.gQ][k] = window.num(el.value);
            el.value = window.fmt(window.M[dept][window.gQ][k]);
        }
        window.regenerateC();
    });
};

// 💡 1스텝: 부서 완전 삭제 및 강력한 경고 / 수강생 누락 처리 연결
window.delDept = async function(dept) {
    const msg = `🚨 [강력 경고] 부서 완전 삭제\n\n'${dept}' 부서를 삭제하면 1~4분기 전체의 마스터 데이터가 영구히 삭제됩니다!\n\n또한, 기존 이 부서(강좌)에 속해 있던 모든 수강생들은 자동으로 '미배정(누락)' 상태로 전환되므로, 삭제 후 반드시 2스텝 [누락명단 관리]에서 다른 강좌로 안전하게 재배정해 주셔야 합니다.\n\n정말 삭제하시겠습니까?`;

    if(await window.showConfirm(msg)) {
        window.commitState(() => {
            window.E.forEach(e => {
                if (e.course === dept || e.course.startsWith(dept + '(')) {
                    e.oldCourse = e.course; e.oldQ = e.q;
                    e.course = '미배정(누락)'; e.mm = '부서 마스터 완전 삭제로 인한 재배정 요망';
                }
            });
            delete window.M[dept];
            window.regenerateC();
        });
        // 🗑️ 중복 호출 제거됨
    }
};

window.regenerateC = function() {
    const newC = {};
    Object.keys(window.M).forEach(dept => {
        [1,2,3,4].forEach(q => {
            const md = window.M[dept][q]; if (!md) return;
            const mhArr = (md.mh||'4,4,4').split(',').map(x=>window.num(x)).filter(x=>x>0);
            const tH = mhArr.reduce((a,b)=>a+b, 0);
            const uS = (md.unit||1)*4;
            const qI = Math.round(((md.inst_m/uS)*tH)/10)*10;
            const qM = Math.round(((md.mgmt_m/uS)*tH)/10)*10;
            
            for(let i=0; i<md.cnt; i++) {
                let nm = md.cnt > 1 ? `${dept}(${String.fromCharCode(65+i)})` : dept;
                if (!newC[nm]) newC[nm] = {};
                let oldC = window.C[nm]?.[q] || window.C[dept]?.[q] || window.C[`${dept}(A)`]?.[q];
                let oldActive = oldC && oldC.isActive !== undefined ? oldC.isActive : true;
                
                if (!oldC || oldC._isAuto !== false) {
                    // 💡 [3D 확장] 마스터에서 생성될 때 재료비(m) 값을 계승함
                    newC[nm][q] = { t: qI+qM, b: md.b, m: md.m || 0, mh: md.mh, instTot: qI, mgmtTot: qM, unit: md.unit || 1, _isAuto: true, isActive: oldActive };
                } else {
                    newC[nm][q] = { ...oldC, isActive: oldActive };
                    if (newC[nm][q].unit === undefined) newC[nm][q].unit = md.unit || 1;
                }
            }
        });
    });
    window.C = newC;
    if(window.$('e_c')) window.$('e_c').innerHTML = '<option value="">강좌선택</option>' + Object.keys(window.C).filter(c => window.C[c][window.gQ] && window.C[c][window.gQ].isActive !== false).sort().map(nm => `<option value="${nm}">${nm}</option>`).join('');
};

window.updateC = function(nm, key, el) {
    if (window.isQuarterLocked(window.gQ)) {
        window.showAlert('🔒 마감된 분기이므로 수정불가');
        el.value = (key==='mh') ? window.C[nm][window.gQ][key] : window.fmt(window.C[nm][window.gQ][key]);
        return;
    }
    const oldVal = window.C[nm][window.gQ][key];
    let newVal = (key==='mh') ? el.value.trim() : window.num(el.value);
    if (oldVal === newVal) {
        el.value = (key==='mh') ? newVal : window.fmt(newVal);
        return;
    }
    window.commitState(() => {
        if (key === 'mh') window.C[nm][window.gQ][key] = newVal;
        else { window.C[nm][window.gQ][key] = newVal; el.value = window.fmt(newVal); }
        if (key === 'unit' || key === 'mh') {
            const deptNm = nm.replace(/\([A-Z]\)$/, '');
            const md = window.M[deptNm]?.[window.gQ];
            if (md) {
                const currentMhArr = (window.C[nm][window.gQ].mh||'4,4,4').split(',').map(x=>window.num(x)).filter(x=>x>0);
                const tH = currentMhArr.reduce((a,b)=>a+b, 0);
                const uS = (window.C[nm][window.gQ].unit || 1) * 4;
                window.C[nm][window.gQ].instTot = Math.round(((md.inst_m/uS)*tH)/10)*10;
                window.C[nm][window.gQ].mgmtTot = Math.round(((md.mgmt_m/uS)*tH)/10)*10;
            }
        }
        if (key === 'instTot' || key === 'mgmtTot' || key === 'unit' || key === 'mh') {
            window.C[nm][window.gQ].t = window.C[nm][window.gQ].instTot + window.C[nm][window.gQ].mgmtTot;
        }
        window.C[nm][window.gQ]._isAuto = false;
    });
};

window.resetC = function(nm, q) {
    if (window.isQuarterLocked(q)) return window.showAlert('🔒 마감된 분기이므로 초기화불가');
    window.commitState(() => {
        if (window.C[nm] && window.C[nm][q]) window.C[nm][q]._isAuto = true;
        window.regenerateC();
    });
};

// 💡 1스텝: 개별 강좌 운영 토글 및 누락명단 연동
window.toggleCourseActive = async function(cName, q, isChecked) {
    if (window.isQuarterLocked(q)) {
        window.showAlert('🔒 마감된 분기이므로 운영 여부를 변경할 수 없습니다.');
        window.renderC();
        return;
    }

    let affectedEnrolls = [];
    if (!isChecked) {
        affectedEnrolls = window.E.filter(e => e.q === q && e.course === cName);
        if (affectedEnrolls.length > 0) {
            const msg = `🚨 [경고] 해당 강좌에 등록된 수강생이 ${affectedEnrolls.length}명 있습니다.\n\n미운영(폐강) 처리 시 이 학생들은 모두 2스텝의 '미배정(누락)' 명단으로 강제 이동되며, 2스텝에서 재배정해야 합니다.\n\n정말 미운영 처리하시겠습니까?`;
            if (!(await window.showConfirm(msg))) {
                window.renderC(); return;
            }
        }
    }

    window.commitState(() => {
        if (!isChecked && affectedEnrolls.length > 0) {
            affectedEnrolls.forEach(e => {
                e.oldCourse = e.course; e.oldQ = e.q;
                e.course = '미배정(누락)'; e.mm = '강좌 미운영(폐강)으로 인한 재배정 요망';
            });
        }
        if (window.C[cName] && window.C[cName][q]) { window.C[cName][q].isActive = isChecked; }
        if(window.$('e_c')) window.$('e_c').innerHTML = '<option value="">강좌선택</option>' + Object.keys(window.C).filter(c => window.C[c][window.gQ] && window.C[c][window.gQ].isActive !== false).sort().map(nm => `<option value="${nm}">${nm}</option>`).join('');
    });
    // 🗑️ 중복 호출 제거됨
};

/* ==========================================================================
   💡 1스텝: 수동 단일 등록 기능 (3D 재료비 파싱 추가)
   ========================================================================== */
window.addDeptMaster = function() {
    const dept = window.val('c_dept'); if (!dept) return;
    const is3D = window.SysSet.accType === 'SEPARATED'; // 회계 유형 감지
    
    const base = {
        cnt: window.num(window.$('c_cnt').value)||1,
        inst_m: window.num(window.val('c_inst_m')),
        mgmt_m: window.num(window.val('c_mgmt_m')),
        b: window.num(window.val('c_b')),
        m: is3D ? window.num(window.val('c_m')) : 0, // 💡 3D일 때만 재료비 값 인식
        unit: window.num(window.$('c_unit').value)||1,
        mh: window.val('c_mh')||'4,4,4'
    };
    
    window.commitState(() => {
        window.M[dept] = { 1:{...base}, 2:{...base}, 3:{...base}, 4:{...base} };
        window.regenerateC();
    });
    
    // 💡 입력 성공 후 폼 초기화 대상에 c_m 추가
    ['c_dept','c_inst_m','c_mgmt_m','c_b','c_m','c_mh'].forEach(id => { if(window.$(id)) window.$(id).value=''; });
    window.showAlert('✅ 부서/강좌 등록이 완료되었습니다.');
};

/* ==========================================================================
   💡 1스텝: 엑셀 대량 업로드 파서 (재료비 열 동적 인식)
   ========================================================================== */
window.upCourse = async function() {
    const file = window.$('fileCourse').files[0]; if (!file) return;
    const is3D = window.SysSet.accType === 'SEPARATED';
    
    try {
        const buf = await window.readFileAsArrayBuffer(file); const rows = window.parseXlsx(buf);
        if (rows.some(r => {
            const d = String(r['부서명']||r['강좌명']||'').trim();
            return d && window.E.some(e => e.course.startsWith(d) && window.isQuarterLocked(e.q));
        })) return window.showAlert('🔒 마감 분기의 부서가 포함되어 있습니다. 4스텝에서 마감 해제 후 시도하세요.');
        
        window.commitState(() => {
            rows.forEach(r => {
                const dept = String(r['부서명']||r['강좌명']||'').trim(); if (!dept) return;
                
                const cnt = window.num(r['강좌수'])||1;
                const inst_m = window.num(r['월 강사료']||r['강사료']);
                const mgmt_m = window.num(r['월 수용비']||r['수용비']);
                const b = window.num(r['분기 기초 교재비']||r['교재비']||0);
                
                // 💡 3D 모드일 경우에만 엑셀에서 재료비 파싱
                const m = is3D ? window.num(r['분기 기초 재료비']||r['재료비']||0) : 0; 
                
                const unit = window.num(r['주간단위'])||1;
                const mh = String(r['차수별시수']||r['시수']||'4,4,4').trim();
                
                window.M[dept] = { 1:{cnt,inst_m,mgmt_m,b,m,unit,mh}, 2:{cnt,inst_m,mgmt_m,b,m,unit,mh}, 3:{cnt,inst_m,mgmt_m,b,m,unit,mh}, 4:{cnt,inst_m,mgmt_m,b,m,unit,mh} };
            });
            window.regenerateC();
        });
        window.showAlert('✅ 엑셀 업로드 및 마스터 등록이 완료되었습니다.');
    } catch(err) { 
        window.showAlert('❌ 엑셀 구조 에러. 양식을 다시 확인해 주세요.'); 
    } finally { 
        window.$('fileCourse').value=''; 
    }
};

window.upFree = async function() {
    const file = window.$('fileFree').files[0]; if (!file) return;
    try {
        const buf = await window.readFileAsArrayBuffer(file); const rows = window.parseXlsx(buf);
        let added = 0;
        window.commitState(() => {
            rows.forEach(r => {
                const nm = String(r['이름']||r['성명']||'').trim(); if (!nm) return;
                const g=window.num(r['학년']), b=window.num(r['반']), n=window.num(r['번호']), k=window.uid(g,b,n,nm);
                const sQ=window.num(r['시작분기'])||1, sS=Math.max(0, (window.num(r['시작차수'])||1)-1);
                if (!window.F.some(x => window.uid(x.g,x.b,x.n,x.name)===k)) {
                    window.F.push({g,b,n,name:nm, startQ:sQ, startSess:sS, courses:{}});
                    added++;
                }
            });
        });
        window.showAlert(`✅ 업로드 완료 (신규: ${added}건)`);
    } catch(err) { window.showAlert('❌ 에러'); } finally { window.$('fileFree').value = ''; }
};

window.addFree = function() {
    const nm = window.val('f_nm'); if (!nm) return;
    window.commitState(() => {
        window.F.push({g:window.num(window.val('f_g')), b:window.num(window.val('f_b')), n:window.num(window.val('f_n')), name:nm, startQ:window.num(window.val('f_sq')), startSess:window.num(window.val('f_ss'))-1, courses:{} });
    });
    ['f_n','f_nm'].forEach(id => { if(window.$(id)) window.$(id).value = ''; });
    if(window.$('f_n')) window.$('f_n').focus();
};

window.delF = function(i) { window.commitState(() => { window.F.splice(i,1); }); };

window.changeFreeStart = function(i) {
    const f = window.F[i]; window.curEditFreeIdx = i;
    if(window.$('fs_stuName')) window.$('fs_stuName').textContent = f.name + " 지원시점 설정";
    f.courses = f.courses || {};
    const stuId = window.uid(f.g, f.b, f.n, f.name);
    const stuEnrolls = window.E.filter(e => window.uid(e.g, e.b, e.n, e.name) === stuId);
    const uniqueCourses = [...new Set(stuEnrolls.map(e => e.course))];
    let html = '';
    if (uniqueCourses.length === 0) {
        html = `<div class="text-muted small text-center py-4"><i class="bi bi-exclamation-circle fs-3 text-warning d-block mb-2 text-warning"></i>해당 학생이 현재 분기에 수강 중인 강좌 정보가 없습니다.<br>이전 단계인 <b>Step 2 (수강생 명단 관리)</b>에서 명단이 먼저 올바르게 등록되었는지 확인해 주세요.</div>`;
    } else {
        uniqueCourses.forEach((cName) => {
            const cData = f.courses[cName] || { q: f.startQ || 1, s: f.startSess || 0, h: 1 };
            html += `<div class="row g-2 align-items-center mb-2 pb-2 border-bottom fs-row" data-course="${cName.replace(/"/g, '&quot;')}"><div class="col-12 fw-bold text-primary small text-start">${cName}</div><div class="col-4"><select class="form-select form-select-sm fs-q" onchange="window.updateFsHours(this)"><option value="1" ${cData.q==1?'selected':''}>1분기</option><option value="2" ${cData.q==2?'selected':''}>2분기</option><option value="3" ${cData.q==3?'selected':''}>3분기</option><option value="4" ${cData.q==4?'selected':''}>4분기</option></select></div><div class="col-4"><select class="form-select form-select-sm fs-s" onchange="window.updateFsHours(this)"><option value="0" ${cData.s==0?'selected':''}>1차수</option><option value="1" ${cData.s==1?'selected':''}>2차수</option><option value="2" ${cData.s==2?'selected':''}>3차수</option></select></div><div class="col-4"><select class="form-select form-select-sm fs-h border-primary fw-bold" data-selected="${cData.h}"></select></div></div>`;
        });
    }
    if(window.$('fs_courseList')) window.$('fs_courseList').innerHTML = html;
    document.querySelectorAll('.fs-row').forEach(row => { window.updateFsHours(row.querySelector('.fs-q')); });
    if(window.mdlFreeStart) window.mdlFreeStart.show();
};

window.updateFsHours = function(el) {
    const row = el.closest('.fs-row'); const course = row.getAttribute('data-course');
    const q = window.num(row.querySelector('.fs-q').value); const s = window.num(row.querySelector('.fs-s').value);
    const hSelect = row.querySelector('.fs-h'); const selectedH = window.num(hSelect.getAttribute('data-selected')) || 1;
    const base = window.C[course]?.[q] || {mh: '4,4,4'};
    const mhArr = (base.mh || '4,4,4').split(',').map(x=>window.num(x)).filter(x=>x>0);
    const maxH = mhArr[s] || 4;
    let options = '';
    for(let i=1; i<=maxH; i++) {
        options += `<option value="${i}" ${i===Math.min(selectedH, maxH) ? 'selected':''}>${i}시수 째~</option>`;
    }
    hSelect.innerHTML = options;
    hSelect.onchange = function() { this.setAttribute('data-selected', this.value); };
};

window.saveFreeStart = function() {
    if (window.curEditFreeIdx < 0) return;
    window.commitState(() => {
        const f = window.F[window.curEditFreeIdx]; f.courses = {}; let isAllDefault = true;
        document.querySelectorAll('.fs-row').forEach(row => {
            const course = row.getAttribute('data-course'); const q = window.num(row.querySelector('.fs-q').value);
            const s = window.num(row.querySelector('.fs-s').value); const h = window.num(row.querySelector('.fs-h').value);
            if (q !== f.startQ || s !== f.startSess || h !== 1) { isAllDefault = false; }
            f.courses[course] = { q, s, h };
        });
        if (isAllDefault) f.courses = {};
    });
    if(window.mdlFreeStart) window.mdlFreeStart.hide();
};

window.resetFreeStart = function() {
    if (window.curEditFreeIdx < 0) return;
    window.commitState(() => { window.F[window.curEditFreeIdx].courses = {}; });
    if(window.mdlFreeStart) window.mdlFreeStart.hide();
};

window.importFromPrevQuarter = function() {
    const targetQ = window.gQ; const prevQ = targetQ - 1;
    if (prevQ < 1) return window.showAlert('1분기는 이전 분기가 없으므로 가져올 수 없습니다.');
    const prevEnrolls = window.E.filter(e => e.q === prevQ);
    if (prevEnrolls.length === 0) return window.showAlert(`${prevQ}분기에 가져올 수강생 명단이 없습니다.`);
    const activeCoursesTargetQ = Object.keys(window.C).filter(c => window.C[c][targetQ] && window.C[c][targetQ].isActive !== false);
    if (activeCoursesTargetQ.length === 0) return window.showAlert(`🚨 ${targetQ}분기에 등록된(활성화된) 강좌가 없습니다. 1스텝에서 세팅해 주세요.`);
    const activeCoursesPrevQ = Object.keys(window.C).filter(c => window.C[c][prevQ] && window.C[c][prevQ].isActive !== false);

    const enrollsToImport = [];
    prevEnrolls.forEach(e => {
        const baseName = e.course.replace(/\([A-Za-z가-힣0-9]+\)$/, '').trim();
        const alreadyInTargetQ = window.E.some(x => x.q === targetQ && window.uid(x.g, x.b, x.n, x.name) === window.uid(e.g, e.b, e.n, e.name) && x.course.replace(/\([A-Za-z가-힣0-9]+\)$/, '').trim() === baseName);
        if (!alreadyInTargetQ) enrollsToImport.push(e);
    });
    if (enrollsToImport.length === 0) return window.showAlert(`🚨 ${prevQ}분기 수강생이 이미 현재 분기에 모두 존재합니다.\n명단을 다시 가져오시려면 현재 분기 명단을 [전체 비우기] 하신 후 시도해 주세요.`);

    let directCnt = 0, missingCnt = 0;
    enrollsToImport.forEach(e => {
        const baseName = e.course.replace(/\([A-Za-z가-힣0-9]+\)$/, '').trim();
        const prevOptions = activeCoursesPrevQ.filter(c => c.replace(/\([A-Za-z가-힣0-9]+\)$/, '').trim() === baseName);
        const targetOptions = activeCoursesTargetQ.filter(c => c.replace(/\([A-Za-z가-힣0-9]+\)$/, '').trim() === baseName);
        let targetCourse = '미배정(누락)';
        if (activeCoursesTargetQ.includes(e.course) && prevOptions.length === targetOptions.length) { targetCourse = e.course; directCnt++; }
        else { missingCnt++; }
        if (targetCourse === '미배정(누락)') {
            window.E.push({ ...e, q: targetQ, course: targetCourse, oldQ: prevQ, oldCourse: e.course, cT: null, cB: null, rT: 0, rB: 0, mm: '부서 매칭 실패 (재배정 필요)', tMemo: '', bMemo: '', refunds: [], adjusts: [], auditLog: '엔진자동' });
        } else {
            window.E.push({ ...e, q: targetQ, course: targetCourse, cT: null, cB: null, rT: 0, rB: 0, mm: '이전 분기에서 가져옴', tMemo: '', bMemo: '', refunds: [], adjusts: [], auditLog: '엔진자동' });
        }
    });
    window.save(); window.autoRunSet(true); window.renderE(); window.renderSetTabs();
    window.showAlert(`✅ 명단 불러오기 완료!\n\n(자동 배정: ${directCnt}명, 매칭 실패: ${missingCnt}명)\n※ 실패 학생은 [누락명단 관리]에서 배정해 주세요.`);
};

window.upEnroll = async function() {
    const fs = Array.from(window.$('fileEnroll').files); if (!fs.length) return; const q = window.num(window.val('exEnQ'));
    if (window.isQuarterLocked(q)) { window.showAlert('🔒 해당 분기에 이미 마감된 차수가 있습니다.\n명단을 변경하거나 추가하려면 먼저 4스텝에서 모든 마감을 역순으로 해제해 주세요.'); window.$('fileEnroll').value = ''; return; }
    window.pendingEnrollData = [];
    for (const f of fs) {
        const buf = await window.readFileAsArrayBuffer(f); const wb = XLSX.read(new Uint8Array(buf), {type:'array'});
        wb.SheetNames.forEach(sn => {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], {defval:''}); if (rows.length === 0) return;
            const isUnified = rows[0].hasOwnProperty('강좌명');
            for (const r of rows) {
                const nm = String(r['이름']||r['성명']||'').trim(); if (!nm) continue;
                let c = ''; if (isUnified) { c = String(r['강좌명']||'').trim(); if (!window.C[c]) continue; } else { c = sn.trim(); if (!window.C[c]) continue; }
                const g=window.num(r['학년']), b=window.num(r['반']), n=window.num(r['번호']); window.pendingEnrollData.push({ q, g, b, n, name: nm, course: c, mm: String(r['비고']||'').trim() });
            }
        });
    }
    if(window.pendingEnrollData.length === 0) { window.$('fileEnroll').value = ''; return window.showAlert('업로드할 유효한 명단이 없습니다. (강좌명이나 양식을 확인하세요)'); }
    if(window.mdlUpload) window.mdlUpload.show(); else window.execEnrollUpload('APPEND');
};

window.execEnrollUpload = function(mode) {
    if(window.mdlUpload) window.mdlUpload.hide();
    const q = window.pendingEnrollData.length > 0 ? window.pendingEnrollData[0].q : window.gQ; let added = 0;
    window.commitState(() => {
        if (mode === 'OVERWRITE') {
            const uploadedCourses = [...new Set(window.pendingEnrollData.map(d => d.course))];
            window.E = window.E.filter(e => { if (e.q === q && uploadedCourses.includes(e.course)) { const hasHistory = (e.adjusts && e.adjusts.length > 0) || (e.refunds && e.refunds.length > 0) || window.isQuarterLocked(e.q); if (hasHistory) return true; return false; } return true; });
        }
        const exist = new Set(window.E.map(e => `${e.q}_${e.course}_${window.uid(e.g,e.b,e.n,e.name)}`));
        window.pendingEnrollData.forEach(r => {
            const id = `${r.q}_${r.course}_${window.uid(r.g,r.b,r.n,r.name)}`;
            if (!exist.has(id)) { window.E.push({ q: r.q, g: r.g, b: r.b, n: r.n, name: r.name, course: r.course, cT: null, cB: null, rT: 0, rB: 0, mm: r.mm, tMemo:'', bMemo:'', refunds: [], adjusts: [], auditLog: '엔진자동' }); exist.add(id); added++; }
        });
    });
    window.$('fileEnroll').value = ''; window.pendingEnrollData = []; window.showAlert(`✅ ${mode === 'OVERWRITE' ? '안전하게 덮어쓰기' : '추가(병합)'} 완료 (신규 등록: ${added}건)`);
};

window.addEnroll = function() {
    if(!window.val('e_c') || !window.val('e_nm')) return; const q = window.num(window.val('e_q')); if (window.isQuarterLocked(q)) return window.showAlert('🔒 마감 분기입니다.');
    window.commitState(() => {
        window.E.push({ q, g: window.num(window.val('e_g')), b: window.num(window.val('e_b')), n: window.num(window.val('e_n')), name: window.val('e_nm'), course: window.val('e_c'), cT: null, cB: null, rT: 0, rB: 0, mm: '', tMemo:'', bMemo:'', refunds: [], adjusts: [], auditLog: '엔진자동' });
    });
    window.$('e_nm').value = ''; window.$('e_n').focus();
};

window.delE = async function(i) {
    if(window.isQuarterLocked(window.E[i].q)) return window.showAlert('🔒 마감 변경 불가');
    if(await window.showConfirm('삭제하시겠습니까?')) { window.commitState(() => { window.E.splice(i,1); }); }
};

window.clearCurrentQuarterEnrolls = async function() {
    const q = window.gQ; if (window.isQuarterLocked(q)) return window.showAlert(`🔒 ${q}분기에 마감된 차수가 있어 명단을 일괄 삭제할 수 없습니다.\n먼저 4스텝에서 마감을 해제해 주세요.`);
    const currentEnrolls = window.E.filter(e => e.q === q); if (currentEnrolls.length === 0) return window.showAlert(`${q}분기에 삭제할 명단이 없습니다.`);
    const hasHistory = currentEnrolls.some(e => (e.adjusts && e.adjusts.length > 0) || (e.refunds && e.refunds.length > 0));
    let msg = `정말 ${q}분기의 수강생 명단(${currentEnrolls.length}건)을 전부 삭제하시겠습니까?`;
    if (hasHistory) { msg = `🚨 경고: 현재 ${q}분기 명단에 [조정]이나 [환불] 이력이 있는 학생이 포함되어 있습니다!\n일괄 삭제 시 이 소중한 회계 기록들도 모두 함께 영구 삭제됩니다.\n\n정말 ${q}분기 명단을 모조리 지우시겠습니까?`; }
    if (await window.showConfirm(msg)) {
        if (hasHistory && (await window.showPrompt('데이터를 강제로 지우시려면 "삭제"라고 입력해 주세요.')) !== '삭제') return window.showAlert('삭제가 취소되었습니다.');
        window.commitState(() => { window.E = window.E.filter(e => e.q !== q); }); window.showAlert(`✅ ${q}분기 명단이 깔끔하게 비워졌습니다.`);
    }
};

window.toggleQ = function(q) { window.f_eq = (window.f_eq === String(q)) ? 'ALL' : String(q); window.renderE(); };
window.toggleC = function(c) { window.f_ec = (window.f_ec === c) ? 'ALL' : c; window.renderE(); };

window.renderEFilters = function() {
    const el = window.$('tbMatrix'); if (!el) return;
    let cKeys = Object.keys(window.C).filter(c => {
        const isAct = window.C[c] && window.C[c][window.gQ] && window.C[c][window.gQ].isActive !== false;
        const hasStu = window.E.some(e => e.q === window.gQ && e.course === c);
        return isAct || hasStu;
    }).sort();
    const hasMissing = window.E.some(e => e.q === window.gQ && e.course === '미배정(누락)');
    if (hasMissing && !cKeys.includes('미배정(누락)')) cKeys.push('미배정(누락)');
    if (!cKeys.length) return el.innerHTML = "<tr><td class='text-muted py-2'>강좌 없음</td></tr>";
    
    const stat = {}; cKeys.forEach(c => stat[c] = {1:0,2:0,3:0,4:0,tot:0});
    const qTot = {1:0,2:0,3:0,4:0,tot:0};
    window.E.forEach(e => { if (stat[e.course]) { stat[e.course][e.q]++; stat[e.course].tot++; qTot[e.q]++; qTot.tot++; } });
    
    let h = `<thead class="table-light"><tr><th><button class="btn btn-sm btn-dark w-100" onclick="window.f_eq='ALL';window.f_ec='ALL';window.renderE();">전체</button></th>`;
    cKeys.forEach(c => {
        const btnClass = window.f_ec === c ? 'btn-primary fw-bold' : (c === '미배정(누락)' ? 'btn-outline-danger fw-bold' : 'btn-outline-primary');
        h += `<th><button class="btn btn-sm w-100 ${btnClass}" onclick="window.toggleC('${c.replace(/'/g,"\\'")}')">${c}</button></th>`;
    });
    h += `<th class="bg-secondary text-white">계</th></tr></thead><tbody>`;
    [1,2,3,4].forEach(q => {
        h += `<tr><td><button class="btn btn-sm w-100 ${window.f_eq===String(q)?'btn-primary fw-bold':'btn-outline-primary'}" onclick="window.setQTab(${q});">${q}분기</button></td>`;
        cKeys.forEach(c => {
            const cellClass = (window.f_eq===String(q)&&(window.f_ec==='ALL'||window.f_ec===c)) ? 'bg-primary bg-opacity-10 fw-bold' : '';
            const textClass = (c === '미배정(누락)' && stat[c][q] > 0) ? 'text-danger fw-bold' : '';
            h += `<td class="${cellClass} ${textClass}">${stat[c][q]||'-'}</td>`;
        });
        h += `<td class="fw-bold bg-light">${qTot[q]}</td></tr>`;
    });
    window.$('tbMatrix').innerHTML = h + `</tbody>`;
};

window.selectTransferStu = function(stuUid) {
    window.$('transMultiSelectArea').classList.add('d-none'); 
    const target = window.E.find(e => window.uid(e.g, e.b, e.n, e.name) === stuUid);
    if (!target) return;
    
    const isCho3 = (target.g === 3 || target.g === '3');
    const fInfo = window.F.find(f => window.uid(f.g, f.b, f.n, f.name) === stuUid);
    const isFree = !!fInfo;
    
    if(!isCho3 && !isFree) {
        window.$('transResultArea').innerHTML = `<div class="alert alert-danger py-2 small mb-0 fw-bold">❌ 이 학생은 초3 지원금 대상자도, 자유수강권 대상자도 아닙니다.</div>`;
        return;
    }

    // 💡 꼬리표 존재 여부 명확히 판별
    const hasTransFree = fInfo && fInfo.transFreeAmt !== undefined;
    const hasTransCho3 = isCho3 && target.transCho3Amt !== undefined;

    const curF_Amt = hasTransFree ? fInfo.transFreeAmt : 600000;
    const curC_Amt = hasTransCho3 ? target.transCho3Amt : 500000;

    let html = `<div class="card border-dark shadow-sm mb-2"><div class="card-header bg-dark text-white py-2 fw-bold"><i class="bi bi-person-check-fill"></i> ${target.name} (${window.dsp(target.g, target.b, target.n)})</div><div class="card-body p-3">`;
    
    // 🎟️ 자유수강 폼 (명시적 스위치 토글 적용)
    if(isFree) {
        html += `
        <div class="mb-3 p-2 bg-success bg-opacity-10 border border-success rounded">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="badge bg-success fs-6">🎟️ 자유수강권 (대상)</span>
                <div class="form-check form-switch mb-0">
                    <input class="form-check-input bg-success border-success" type="checkbox" id="chkUseTransFree" ${hasTransFree ? 'checked' : ''} onchange="window.$('transFreeInput').disabled = !this.checked">
                    <label class="form-check-label small fw-bold text-success" for="chkUseTransFree">전입(조정) 적용</label>
                </div>
            </div>
            <div class="d-flex align-items-center gap-2">
                <span class="text-dark small fw-bold">▶ 연간 한도 조정 입력 (기본 60만 원):</span>
                <div class="input-group input-group-sm" style="width:140px;">
                    <input type="number" id="transFreeInput" class="form-control text-end fw-bold text-success" value="${curF_Amt}" ${hasTransFree ? '' : 'disabled'}>
                    <span class="input-group-text">원</span>
                </div>
            </div>
        </div>`;
    } else {
        html += `<div class="mb-3 p-2 bg-light border rounded opacity-50"><span class="badge bg-secondary mb-1">🎟️ 자유수강권 (대상아님)</span><input type="number" id="transFreeInput" class="form-control form-control-sm w-25" disabled value="0"></div>`;
    }

    // 🧒 초3지원 폼 (명시적 스위치 토글 적용)
    if(isCho3) {
        html += `
        <div class="mb-3 p-2 bg-primary bg-opacity-10 border border-primary rounded">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="badge bg-primary fs-6">🧒 초3 지원금 (대상)</span>
                <div class="form-check form-switch mb-0">
                    <input class="form-check-input bg-primary border-primary" type="checkbox" id="chkUseTransCho3" ${hasTransCho3 ? 'checked' : ''} onchange="window.$('transCho3Input').disabled = !this.checked">
                    <label class="form-check-label small fw-bold text-primary" for="chkUseTransCho3">전입(조정) 적용</label>
                </div>
            </div>
            <div class="d-flex align-items-center gap-2">
                <span class="text-dark small fw-bold">▶ 연간 한도 조정 입력 (기본 50만 원):</span>
                <div class="input-group input-group-sm" style="width:140px;">
                    <input type="number" id="transCho3Input" class="form-control text-end fw-bold text-primary" value="${curC_Amt}" ${hasTransCho3 ? '' : 'disabled'}>
                    <span class="input-group-text">원</span>
                </div>
            </div>
        </div>`;
    } else {
        html += `<div class="mb-3 p-2 bg-light border rounded opacity-50"><span class="badge bg-secondary mb-1">🧒 초3 지원금 (대상아님)</span><input type="number" id="transCho3Input" class="form-control form-control-sm w-25" disabled value="0"></div>`;
    }

    html += `<div class="text-end border-top pt-3"><button class="btn btn-danger fw-bold px-4 shadow" onclick="window.saveTransferAmt('${stuUid.replace(/'/g, "\\'")}')"><i class="bi bi-save"></i> 지원금 설정 저장 및 적용</button></div></div></div>`;
    
    window.$('transResultArea').innerHTML = html;
};

// 💡 꼬리표 명시적 통제 및 저장 로직
window.saveTransferAmt = function(stuUid) {
    const chkFree = window.$('chkUseTransFree');
    const chkCho3 = window.$('chkUseTransCho3');
    const fInput = window.$('transFreeInput');
    const cInput = window.$('transCho3Input');
    
    window.commitState(() => {
        // 1. 자유수강권 명시적 제어
        const fInfo = window.F.find(f => window.uid(f.g, f.b, f.n, f.name) === stuUid);
        if (fInfo) {
            if (chkFree && chkFree.checked && fInput && fInput.value !== "") {
                fInfo.transFreeAmt = window.num(fInput.value);
            } else {
                delete fInfo.transFreeAmt; // 스위치가 꺼져있으면 꼬리표 영구 삭제
            }
        }
        
        // 2. 초3 지원금 명시적 제어
        let amtCho3 = undefined;
        if (chkCho3 && chkCho3.checked && cInput && cInput.value !== "") {
            amtCho3 = window.num(cInput.value);
        }
        
        window.E.forEach(e => {
            if (window.uid(e.g, e.b, e.n, e.name) === stuUid) {
                if (amtCho3 !== undefined) {
                    e.transCho3Amt = amtCho3;
                } else {
                    delete e.transCho3Amt; // 스위치가 꺼져있으면 모든 분기의 꼬리표 일괄 삭제
                }
            }
        });
    });
    
    // (※ window.commitState 내부에서 window.save()가 자동으로 호출되어 DB에 즉시 영구 기록됩니다.)
    
    window.showAlert('✅ 전입생 한도 금액이 명시적으로 저장되었습니다.\n변경된 설정에 따라 장부가 즉시 재계산됩니다.');
    window.$('transResultArea').innerHTML = ''; window.$('transSearchInput').value = '';
    window.renderTransferList();
};



/* ==========================================================================
   💡 글로벌 전입생 뱃지 생성기
   ========================================================================== */
window.getTransferBadges = function(stuUid) {
    let badges = '';
    const fInfo = window.F.find(f => window.uid(f.g, f.b, f.n, f.name) === stuUid);
    if (fInfo && fInfo.transFreeAmt !== undefined) {
        badges += `<span class="badge bg-success ms-1" style="font-size:0.7rem;" title="자유수강권 전입조정">전입(자유)</span>`;
    }
    const eInfo = window.E.find(e => window.uid(e.g, e.b, e.n, e.name) === stuUid);
    if (eInfo && eInfo.transCho3Amt !== undefined) {
        badges += `<span class="badge bg-primary ms-1" style="font-size:0.7rem;" title="초3지원금 전입조정">전입(초3)</span>`;
    }
    return badges;
};

// 💡 2스텝으로 이동하는 헬퍼 함수
window.goToStep2 = function() {
    const btn = document.querySelector('#myTab button[data-bs-target="#step2"]');
    if(btn) btn.click();
};

/* ==========================================================================
   💡 2스텝 명단 렌더링 갱신 (전입 뱃지 표출 추가)
   ========================================================================== */
window.renderE = function() {
    window.renderEFilters(); if(!window.$('tbEnroll')) return;
    if(window.$('btnManageMissing')) {
        const missingCnt = window.E.filter(e => e.q === window.gQ && e.course === '미배정(누락)').length;
        if (missingCnt > 0) { window.$('btnManageMissing').classList.remove('d-none'); window.$('cnt_missing').innerText = missingCnt; }
        else { window.$('btnManageMissing').classList.add('d-none'); if (window.f_ec === '미배정(누락)') { window.f_ec = 'ALL'; window.renderEFilters(); } }
    }
    if(window.$('btnClearAllQ')) { window.f_ec === 'ALL' ? window.$('btnClearAllQ').classList.remove('d-none') : window.$('btnClearAllQ').classList.add('d-none'); }
    if(window.$('grpBatchActions')) { window.f_ec === 'ALL' ? window.$('grpBatchActions').classList.add('d-none') : window.$('grpBatchActions').classList.remove('d-none'); }

    const ls = window.E.map((e,i)=>({...e,_i:i})).filter(e => {
        if(window.f_eq !== 'ALL' && String(e.q) !== window.f_eq) return false;
        if(window.f_ec !== 'ALL' && e.course !== window.f_ec) return false;
        return true;
    }).sort((a,b) => {
        if (window.f_ec === '미배정(누락)') {
            const aOld = a.oldCourse || ''; const bOld = b.oldCourse || '';
            if (aOld !== bOld) return aOld.localeCompare(bOld);
        }
        return a.q - b.q || a.g - b.g || a.b - b.b || a.n - b.n || a.name.localeCompare(b.name);
    });
    
    if(window.$('cnt_e')) window.$('cnt_e').textContent = ls.length;
    if (ls.length === 0) {
        let msg = window.E.length === 0 ? `<i class="bi bi-emoji-smile fs-2 d-block mb-2 text-primary"></i>수강생 데이터가 비어 있습니다.<br><button class="btn btn-outline-primary btn-sm mt-3 fw-bold" onclick="document.querySelector('#myTab button[data-bs-target=\\'#step1\\']').click()">👉 1스텝 부서 세팅 먼저 확인하기</button>` : `<i class="bi bi-search fs-2 d-block mb-2 text-secondary"></i>조건에 맞는 수강생이 없습니다.`;
        window.$('tbEnroll').innerHTML = `<tr><td colspan="8" class="py-5 text-muted bg-light">${msg}</td></tr>`; return;
    }
    
    let h = `<thead class="table-light"><tr>`;
    if (window.f_ec !== 'ALL') h += `<th><input type="checkbox" id="chkAllE" onclick="window.toggleAllE(this)" class="form-check-input"></th>`;
    h += `<th>분기</th><th>학적/이름 (팝업콘솔)</th><th>강좌명 (팝업명세)</th><th>실부담(수강료)</th><th>실부담(교재비)</th><th>상세 증빙 적요</th><th>관리</th></tr></thead><tbody>`;
    
    ls.forEach(e => {
        const locked = window.isQuarterLocked(e.q), rowCls = locked ? 'locked-row' : (e.course === '미배정(누락)' ? 'bg-danger bg-opacity-10' : '');
        const info = (e.adjusts?.length>0 ? `<span class="badge bg-warning text-dark me-1">조정</span>` : '') + (e.refunds?.length>0 ? `<span class="badge bg-danger">환불</span>` : '');
        let chkHtml = ''; if (window.f_ec !== 'ALL') chkHtml = `<td><input type="checkbox" class="form-check-input row-chk" value="${e._i}" ${locked?'disabled':''}></td>`;
        const isMissing = e.course === '미배정(누락)' && e.oldCourse;
        const qBadge = isMissing ? `<span class="badge bg-danger">${e.oldQ}분기(누락)</span>` : `<span class="badge bg-secondary">${e.q}분기</span>`;
        const cDisplay = isMissing ? `<span class="text-danger fw-bold"><i class="bi bi-arrow-right-circle-fill"></i> ${e.oldCourse}</span>` : `<span class="course-link" onclick="event.stopPropagation(); window.openCourseSummary('${e.course.replace(/'/g, "\\'")}', ${e.q})">${e.course}</span>`;
        
        // 💡 2스텝 글로벌 뱃지 적용
        const stuUid = window.uid(e.g, e.b, e.n, e.name);
        const transBadges = window.getTransferBadges(stuUid);
        const nameDisplay = isMissing ? `<span class="text-dark">${window.dsp(e.g,e.b,e.n)} ${e.name}</span>` : `<span class="clickable text-dark" onclick="window.openStuConsole('${stuUid.replace(/'/g,"\\'")}')">${window.dsp(e.g,e.b,e.n)} ${e.name}</span> ${transBadges}`;

        h += `<tr class="${rowCls}">${chkHtml}<td>${qBadge}</td><td class="fw-bold">${nameDisplay}</td><td class="text-start">${cDisplay}</td><td class="text-primary fw-bold">${window.fmt(e.cT)}</td><td class="text-success fw-bold">${window.fmt(e.cB)}</td><td class="text-start" style="font-size:0.8rem;">${info} ${e.mm||''}</td><td><div class="btn-group"><button class="btn btn-sm btn-outline-primary py-0 fw-bold" onclick="window.openMoveModal([${e._i}])" ${locked?'disabled':''}>이동</button><button class="btn btn-sm btn-outline-danger py-0" onclick="window.delE(${e._i})" ${locked?'disabled':''}>삭제</button></div></td></tr>`;
    });
    window.$('tbEnroll').innerHTML = h + '</tbody>';
};

/* ==========================================================================
   💡 Step 3: 지원금(자유/초3) 통합 뷰 및 전입생 관리 콘솔 로직
   ========================================================================== */

window.routeToFilter = function(type) {
    if (type === 'FREE') {
        window.$('free-tab').click();
        const chk = window.$('chkTransFree'); if(chk) chk.checked = true;
    } else {
        window.$('cho3-tab').click();
        const chk = window.$('chkTransCho3'); if(chk) chk.checked = true;
    }
    window.renderF();
};

window.renderF = function() {
    let freeHtml = ''; let cho3Html = '';
    let fTransCnt = 0, cTransCnt = 0;
    
    const baseFree = 600000; const baseCho3 = 500000;
    const chkOnlyCustomFree = window.$('chkOnlyCustomFree')?.checked;
    const chkTransFree = window.$('chkTransFree')?.checked;
    const chkTransCho3 = window.$('chkTransCho3')?.checked;

    // 🎟️ 자유수강권 명단
    const lsF = window.F.map((f, i) => {
        const stuId = window.uid(f.g, f.b, f.n, f.name);
        const myEnrolls = window.E.filter(e => window.uid(e.g, e.b, e.n, e.name) === stuId);
        const myCourseNames = [...new Set(myEnrolls.map(e => e.course))];
        let isMixed = false; let commonQ = f.startQ || 1; let commonS = f.startSess || 0; let commonH = 1;
        
        if (myCourseNames.length > 0) {
            const firstData = f.courses && f.courses[myCourseNames[0]] ? f.courses[myCourseNames[0]] : { q: f.startQ || 1, s: f.startSess || 0, h: 1 };
            commonQ = firstData.q; commonS = firstData.s; commonH = firstData.h || 1;
            for (let j = 1; j < myCourseNames.length; j++) {
                const cData = f.courses && f.courses[myCourseNames[j]] ? f.courses[myCourseNames[j]] : { q: f.startQ || 1, s: f.startSess || 0, h: 1 };
                if (cData.q !== commonQ || cData.s !== commonS || (cData.h || 1) !== commonH) { isMixed = true; break; }
            }
        } else if (Object.keys(f.courses || {}).length > 0) { isMixed = true; }
        
        const hasSusi = (commonQ > 1 || commonS > 0 || commonH > 1 || isMixed);
        const hasTrans = (f.transFreeAmt !== undefined);
        if (hasTrans) fTransCnt++;

        return {...f, _i: i, _isMixed: isMixed, _cQ: commonQ, _cS: commonS, _cH: commonH, _hasSusi: hasSusi, _hasTrans: hasTrans, _stuId: stuId};
    }).filter(f => {
        if (chkOnlyCustomFree && !f._isMixed) return false;
        if (chkTransFree && !f._hasTrans) return false;
        return true;
    }).sort((a, b) => a.g - b.g || a.b - b.b || a.n - b.n || a.name.localeCompare(b.name));

    if (lsF.length === 0) {
        freeHtml = `<tr><td colspan="6" class="py-5 text-muted bg-light">조건에 맞는 자유수강권 대상자가 없습니다.</td></tr>`;
    } else {
        freeHtml = `<thead class="table-light"><tr><th>학적</th><th>이름</th><th>연간 총지원금</th><th class="table-success">현재 조정된 잔액</th><th class="table-warning">지원 시점 수동 조작</th><th>관리</th></tr></thead><tbody>` + lsF.map(f => {
            let btnClass = "btn-outline-secondary"; let btnText = "1분기(기본) ⚙️";
            if (f._isMixed) { btnClass = "btn-warning text-dark shadow-sm"; btnText = "강좌별 개별지정 ✏️"; }
            else if (f._hasSusi) { btnClass = "btn-primary shadow-sm text-white"; const hStr = f._cH > 1 ? ` ${f._cH}시수` : ''; btnText = `${f._cQ}분기 ${f._cS+1}차수${hStr} 시작 ⚙️`; }
            
            const curBal = f._hasTrans ? f.transFreeAmt : baseFree;
            let nmBadge = f._hasTrans ? `<span class="badge bg-success ms-1" style="font-size:0.7rem;">전입(자유)</span>` : '';
            const balStr = f._hasTrans ? `<span class="text-danger fw-bold fs-6">${window.fmt(curBal)}</span>` : `<span class="text-success fw-bold">${window.fmt(curBal)}</span>`;

            return `<tr><td>${window.dsp(f.g,f.b,f.n)}</td><td class="fw-bold"><span class="clickable text-dark" onclick="window.openStuConsole('${f._stuId.replace(/'/g,"\\'")}')">${f.name}</span> ${nmBadge}</td><td class="text-secondary fw-bold">600,000</td><td class="bg-success bg-opacity-10">${balStr}</td><td class="bg-warning bg-opacity-10"><button class="btn btn-sm ${btnClass} rounded-pill py-0 px-3 fw-bold" onclick="window.changeFreeStart(${f._i})" title="클릭하여 지원 시점 변경" style="font-size:0.8rem;">${btnText}</button></td><td><button class="btn btn-sm btn-outline-danger py-0 bg-white" onclick="window.delF(${f._i})">삭제</button></td></tr>`;
        }).join('') + `</tbody>`;
    }

    // 🧒 초3 지원금 명단
    const uniqueCho3 = {};
    window.E.forEach(e => {
        if (e.g === 3 || e.g === '3') {
            const stuId = window.uid(e.g, e.b, e.n, e.name);
            if (!uniqueCho3[stuId]) uniqueCho3[stuId] = { g: e.g, b: e.b, n: e.n, name: e.name, transCho3Amt: e.transCho3Amt, _stuId: stuId };
            else if (e.transCho3Amt !== undefined) uniqueCho3[stuId].transCho3Amt = e.transCho3Amt;
        }
    });

    const lsC = Object.values(uniqueCho3).map(c => {
        const hasTrans = c.transCho3Amt !== undefined;
        if (hasTrans) cTransCnt++;
        return { ...c, _hasTrans: hasTrans };
    }).filter(c => {
        if (chkTransCho3 && !c._hasTrans) return false;
        return true;
    }).sort((a, b) => a.b - b.b || a.n - b.n || a.name.localeCompare(b.name));

    if (lsC.length === 0) {
        cho3Html = `<tr><td colspan="5" class="py-5 text-muted bg-light">조건에 맞는 초등학교 3학년 대상자가 없습니다.</td></tr>`;
    } else {
        cho3Html = `<thead class="table-light"><tr><th>학적</th><th>이름</th><th>연간 총지원금</th><th class="table-primary">현재 조정된 잔액</th><th class="table-secondary">상태</th></tr></thead><tbody>` + lsC.map(c => {
            const curBal = c._hasTrans ? c.transCho3Amt : baseCho3;
            const nmBadge = c._hasTrans ? `<span class="badge bg-primary ms-1" style="font-size:0.7rem;">전입(초3)</span>` : '';
            const balStr = c._hasTrans ? `<span class="text-danger fw-bold fs-6">${window.fmt(curBal)}</span>` : `<span class="text-primary fw-bold">${window.fmt(curBal)}</span>`;
            const statusTxt = c._hasTrans ? `<span class="text-danger fw-bold small">조정됨</span>` : `<span class="text-muted small">기본추출</span>`;

            return `<tr><td>${window.dsp(c.g,c.b,c.n)}</td><td class="fw-bold"><span class="clickable text-dark" onclick="window.openStuConsole('${c._stuId.replace(/'/g,"\\'")}')">${c.name}</span> ${nmBadge}</td><td class="text-secondary fw-bold">500,000</td><td class="bg-primary bg-opacity-10">${balStr}</td><td>${statusTxt}</td></tr>`;
        }).join('') + `</tbody>`;
    }

    if(window.$('tbFree')) window.$('tbFree').innerHTML = freeHtml;
    if(window.$('tbCho3')) window.$('tbCho3').innerHTML = cho3Html;
    if(window.$('cnt_f')) window.$('cnt_f').innerText = window.F.length;
    if(window.$('cnt_c')) window.$('cnt_c').innerText = Object.keys(uniqueCho3).length;

    if(window.$('glbBadgeFree')) {
        window.$('glbBadgeFree').innerText = `자유수강: ${fTransCnt}명`;
        window.$('glbBadgeFree').className = fTransCnt > 0 ? 'badge bg-success text-white clickable p-2' : 'badge bg-success bg-opacity-10 border border-success text-success clickable p-2';
    }
    if(window.$('glbBadgeCho3')) {
        window.$('glbBadgeCho3').innerText = `초3지원: ${cTransCnt}명`;
        window.$('glbBadgeCho3').className = cTransCnt > 0 ? 'badge bg-primary text-white clickable p-2' : 'badge bg-primary bg-opacity-10 border border-primary text-primary clickable p-2';
    }
};

window.openTransferModal = function() {
    window.$('transSearchInput').value = '';
    window.$('transResultArea').innerHTML = '';
    window.$('transMultiSelectArea').classList.add('d-none');
    window.renderTransferList();
    let modal = bootstrap.Modal.getInstance(window.$('mdlTransferManage')) || new bootstrap.Modal(window.$('mdlTransferManage'));
    modal.show();
};

window.searchTransferStu = function() {
    window.$('transResultArea').innerHTML = '';
    const keyword = window.$('transSearchInput').value.trim().replace(/\s+/g, '');
    if(!keyword) return window.showAlert('검색할 이름이나 학적을 입력하세요.');
    
    const uniqueMap = {};
    window.E.forEach(e => {
        if (e.name === keyword || window.dsp(e.g,e.b,e.n).replace(/-/g,'') === keyword.replace(/-/g,'')) {
            const uid = window.uid(e.g, e.b, e.n, e.name);
            if (!uniqueMap[uid]) uniqueMap[uid] = e;
        }
    });
    
    const matched = Object.values(uniqueMap);
    if(matched.length === 0) return window.showAlert('🚨 수강 명단(2스텝)에 등록되지 않은 학생입니다.\n먼저 수강생으로 등록해 주세요.');
    
    // 👥 동명이인 방어
    if (matched.length > 1) {
        let multiHtml = `<div class="alert alert-warning py-2 mb-0 border-warning"><strong class="text-dark"><i class="bi bi-people-fill"></i> 검색 결과가 ${matched.length}건 존재합니다. 정확한 학생을 선택해주세요.</strong><div class="d-flex flex-wrap gap-2 mt-2">`;
        matched.forEach(t => {
            const stuUid = window.uid(t.g, t.b, t.n, t.name);
            multiHtml += `<button class="btn btn-sm btn-outline-dark fw-bold" onclick="window.selectTransferStu('${stuUid.replace(/'/g, "\\'")}')">${window.dsp(t.g, t.b, t.n)} ${t.name}</button>`;
        });
        multiHtml += `</div></div>`;
        window.$('transMultiSelectArea').innerHTML = multiHtml;
        window.$('transMultiSelectArea').classList.remove('d-none');
        return;
    }
    window.selectTransferStu(window.uid(matched[0].g, matched[0].b, matched[0].n, matched[0].name));
};




window.delTransferAmt = async function(stuUid) {
    if(!(await window.showConfirm('이 학생의 전입생 조정 꼬리표를 완전히 지우고, 연간 기본금 전체를 사용하는 일반 상태로 복구하시겠습니까?'))) return;
    
    window.commitState(() => {
        const fInfo = window.F.find(f => window.uid(f.g, f.b, f.n, f.name) === stuUid);
        if (fInfo) delete fInfo.transFreeAmt;
        window.E.forEach(e => { if (window.uid(e.g, e.b, e.n, e.name) === stuUid) delete e.transCho3Amt; });
    });
    window.renderTransferList();
};

window.renderTransferList = function() {
    let listHtml = ''; const transMap = {};
    
    window.F.forEach(f => {
        if (f.transFreeAmt !== undefined) {
            const id = window.uid(f.g, f.b, f.n, f.name);
            transMap[id] = { hak: window.dsp(f.g, f.b, f.n), name: f.name, fAmt: f.transFreeAmt, cAmt: null, uid: id };
        }
    });
    window.E.forEach(e => {
        if (e.transCho3Amt !== undefined) {
            const id = window.uid(e.g, e.b, e.n, e.name);
            if (!transMap[id]) transMap[id] = { hak: window.dsp(e.g, e.b, e.n), name: e.name, fAmt: null, cAmt: e.transCho3Amt, uid: id };
            else transMap[id].cAmt = e.transCho3Amt;
        }
    });

    const results = Object.values(transMap);
    if (results.length === 0) { listHtml = `<tr><td colspan="5" class="text-muted py-4">조정 이력이 없습니다.</td></tr>`; } 
    else {
        results.forEach(r => {
            const fStr = r.fAmt !== null ? `<strong class="text-success">${window.fmt(r.fAmt)}</strong>` : `<span class="text-muted small">대상아님</span>`;
            const cStr = r.cAmt !== null ? `<strong class="text-primary">${window.fmt(r.cAmt)}</strong>` : `<span class="text-muted small">대상아님</span>`;
            listHtml += `<tr><td>${r.hak}</td><td class="fw-bold text-dark">${r.name}</td><td class="bg-success bg-opacity-10">${fStr}</td><td class="bg-primary bg-opacity-10">${cStr}</td><td><button class="btn btn-sm btn-outline-secondary py-0 me-1 bg-white" onclick="window.$('transSearchInput').value='${r.name}'; window.searchTransferStu();" title="수정"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger py-0 bg-white" onclick="window.delTransferAmt('${r.uid.replace(/'/g, "\\'")}')" title="삭제"><i class="bi bi-trash"></i></button></td></tr>`;
        });
    }
    if(window.$('tbTransferList')) window.$('tbTransferList').innerHTML = listHtml;
};