/* ==========================================================================
   파일닉네임: app-ui-steps.js
   기능설명: Step 1(부서/강좌), Step 2(수강생), Step 3(자유수강권) UI 렌더링 및 이벤트
   ========================================================================== */
'use strict';

window.renderM = function() {
    if(!window.$('tbMaster')) return;
    const keys = Object.keys(window.M);
    if(!keys.length) return window.$('tbMaster').innerHTML = '<tbody><tr><td class="text-muted py-3">등록 부서 없음</td></tr></tbody>';
    let h = `<thead class="table-light"><tr><th>부서명</th><th>강좌수</th><th>월 강사료</th><th>월 수용비</th><th>기초 교재비</th><th>주간단위</th><th>시수</th><th>삭제</th></tr></thead><tbody>`;
    keys.forEach(dept => {
        const d = window.M[dept][window.gQ] || {cnt:1,inst_m:0,mgmt_m:0,b:0,unit:1,mh:'4,4,4'};
        const safe = dept.replace(/'/g, "\\'");
        h += `<tr><td class="fw-bold align-middle text-primary">${dept}</td><td><input class="form-control form-control-sm text-center mx-auto" style="width:50px" value="${d.cnt}" onblur="window.updateM('${safe}','cnt',this)"></td><td><input class="fmt-num mx-auto" style="width:70px" value="${window.fmt(d.inst_m)}" onblur="window.updateM('${safe}','inst_m',this)"></td><td><input class="fmt-num mx-auto" style="width:70px" value="${window.fmt(d.mgmt_m)}" onblur="window.updateM('${safe}','mgmt_m',this)"></td><td><input class="fmt-num mx-auto" style="width:70px" value="${window.fmt(d.b)}" onblur="window.updateM('${safe}','b',this)"></td><td><input class="form-control form-control-sm text-center mx-auto" style="width:50px" value="${d.unit}" onblur="window.updateM('${safe}','unit',this)"></td><td><input class="form-control form-control-sm text-center mx-auto" style="width:60px" value="${d.mh}" onblur="window.updateM('${safe}','mh',this)"></td><td><button class="btn btn-sm btn-outline-danger py-0" onclick="window.delDept('${safe}')"><i class="bi bi-trash"></i></button></td></tr>`;
    });
    window.$('tbMaster').innerHTML = h + '</tbody>';
};

window.renderC = function() {
    if(!window.$('tbCourse')) return;
    const keys = Object.keys(window.C).filter(nm => window.C[nm][window.gQ]).sort();
    if (!keys.length) return window.$('tbCourse').innerHTML = '<tbody><tr><td class="text-muted py-3">산출 강좌 없음</td></tr></tbody>';
    let h = `<thead class="table-light"><tr><th>운영</th><th>생성 강좌명 (클릭: 팝업정산)</th><th class="table-warning">총 수강료(분기)</th><th class="table-warning text-primary">강사료</th><th class="table-warning text-danger">수용비</th><th class="table-info">기초 교재비</th><th>주간단위</th><th>시수</th><th>초기화</th></tr></thead><tbody>`;
    keys.forEach(nm => {
        const d = window.C[nm][window.gQ];
        const safe = nm.replace(/'/g, "\\'");
        const badge = d._isAuto === false ? '<span class="badge bg-danger ms-1" style="font-size:0.65rem;" title="수동 변경됨">수동</span>' : '';
        const isAct = d.isActive !== false;
        const trClass = isAct ? '' : 'bg-light opacity-50';
        h += `<tr class="${trClass}">
            <td><input type="checkbox" class="form-check-input" ${isAct ? 'checked' : ''} onclick="window.toggleCourseActive('${safe}', window.gQ, this.checked)"></td>
            <td class="course-link text-start" onclick="window.openCourseSummary('${safe}', window.gQ)">${nm} ${badge} ${isAct?'':'<span class="badge bg-secondary ms-1" style="font-size:0.65rem;">폐강</span>'}</td>
            <td class="fw-bold bg-light">${window.fmt(d.t)}</td>
            <td><input class="fmt-num mx-auto text-primary fw-bold" style="width:70px" value="${window.fmt(d.instTot)}" onblur="window.updateC('${safe}','instTot',this)" ${isAct?'':'disabled'}></td>
            <td><input class="fmt-num mx-auto text-danger fw-bold" style="width:70px" value="${window.fmt(d.mgmtTot)}" onblur="window.updateC('${safe}','mgmtTot',this)" ${isAct?'':'disabled'}></td>
            <td><input class="fmt-num mx-auto fw-bold" style="width:70px" value="${window.fmt(d.b)}" onblur="window.updateC('${safe}','b',this)" ${isAct?'':'disabled'}></td>
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
        alert('🔒 마감 변경 불가');
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

window.delDept = function(dept) {
    if(confirm('삭제하시겠습니까? 관련 수강생 정보도 함께 정돈됩니다.')) {
        window.commitState(() => {
            window.E = window.E.filter(e => !e.course.startsWith(dept));
            delete window.M[dept];
            window.regenerateC();
        });
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
                    newC[nm][q] = { t: qI+qM, b: md.b, mh: md.mh, instTot: qI, mgmtTot: qM, unit: md.unit || 1, _isAuto: true, isActive: oldActive };
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
        alert('🔒 마감된 분기이므로 수정불가');
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
    if (window.isQuarterLocked(q)) return alert('🔒 마감된 분기이므로 초기화불가');
    window.commitState(() => {
        if (window.C[nm] && window.C[nm][q]) window.C[nm][q]._isAuto = true;
        window.regenerateC();
    });
};

window.toggleCourseActive = function(cName, q, isChecked) {
    if (window.isQuarterLocked(q)) {
        alert('🔒 마감된 분기이므로 운영 여부를 변경할 수 없습니다.');
        window.renderC();
        return;
    }
    window.commitState(() => {
        if (window.C[cName] && window.C[cName][q]) { window.C[cName][q].isActive = isChecked; }
    });
};

window.addDeptMaster = function() {
    const dept = window.val('c_dept'); if (!dept) return;
    const base = {
        cnt: window.num(window.$('c_cnt').value)||1,
        inst_m: window.num(window.val('c_inst_m')),
        mgmt_m: window.num(window.val('c_mgmt_m')),
        b: window.num(window.val('c_b')),
        unit: window.num(window.$('c_unit').value)||1,
        mh: window.val('c_mh')||'4,4,4'
    };
    window.commitState(() => {
        window.M[dept] = { 1:{...base}, 2:{...base}, 3:{...base}, 4:{...base} };
        window.regenerateC();
    });
    ['c_dept','c_inst_m','c_mgmt_m','c_b','c_mh'].forEach(id => { if(window.$(id)) window.$(id).value=''; });
    alert('✅ 복사 등록 완료');
};

window.upCourse = async function() {
    const file = window.$('fileCourse').files[0]; if (!file) return;
    try {
        const buf = await window.readFileAsArrayBuffer(file); const rows = window.parseXlsx(buf);
        if (rows.some(r => {
            const d = String(r['부서명']||r['강좌명']||'').trim();
            return d && window.E.some(e => e.course.startsWith(d) && window.isQuarterLocked(e.q));
        })) return alert('🔒 마감 분기의 부서가 포함되어 있습니다. 마감 해제 후 시도하세요.');
        window.commitState(() => {
            rows.forEach(r => {
                const dept = String(r['부서명']||r['강좌명']||'').trim(); if (!dept) return;
                const cnt = window.num(r['강좌수'])||1, inst_m = window.num(r['월 강사료']||r['강사료']), mgmt_m = window.num(r['월 수용비']||r['수용비']), b = window.num(r['분기 기초 교재비']||r['교재비']||0), unit = window.num(r['주간단위'])||1, mh = String(r['차수별시수']||r['시수']||'4,4,4').trim();
                window.M[dept] = { 1:{cnt,inst_m,mgmt_m,b,unit,mh}, 2:{cnt,inst_m,mgmt_m,b,unit,mh}, 3:{cnt,inst_m,mgmt_m,b,unit,mh}, 4:{cnt,inst_m,mgmt_m,b,unit,mh} };
            });
            window.regenerateC();
        });
        alert('✅ 업로드 적용 완료');
    } catch(err) { alert('❌ 엑셀 구조 에러'); } finally { window.$('fileCourse').value=''; }
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
        alert(`✅ 업로드 완료 (신규: ${added}건)`);
    } catch(err) { alert('❌ 에러'); } finally { window.$('fileFree').value = ''; }
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

window.renderF = function() {
    if(window.$('cnt_f')) window.$('cnt_f').textContent = window.F.length;
    if(!window.$('tbFree')) return;
    const onlyCustom = window.$('chkOnlyCustomFree')?.checked;
    const ls = window.F.map((f, i) => {
        const stuId = window.uid(f.g, f.b, f.n, f.name); const myEnrolls = window.E.filter(e => window.uid(e.g, e.b, e.n, e.name) === stuId);
        const myCourseNames = [...new Set(myEnrolls.map(e => e.course))];
        let isMixed = false; let commonQ = f.startQ || 1; let commonS = f.startSess || 0; let commonH = 1;
        if (myCourseNames.length > 0) {
            const firstData = f.courses && f.courses[myCourseNames[0]] ? f.courses[myCourseNames[0]] : { q: f.startQ || 1, s: f.startSess || 0, h: 1 };
            commonQ = firstData.q; commonS = firstData.s; commonH = firstData.h || 1;
            for (let j = 1; j < myCourseNames.length; j++) {
                const cData = f.courses && f.courses[myCourseNames[j]] ? f.courses[myCourseNames[j]] : { q: f.startQ || 1, s: f.startSess || 0, h: 1 };
                if (cData.q !== commonQ || cData.s !== commonS || (cData.h || 1) !== commonH) { isMixed = true; break; }
            }
        } else { if (Object.keys(f.courses || {}).length > 0) isMixed = true; }
        return {...f, _i: i, _isMixed: isMixed, _cQ: commonQ, _cS: commonS, _cH: commonH};
    }).filter(f => { if(onlyCustom && !f._isMixed) return false; return true; })
    .sort((a, b) => a.g - b.g || a.b - b.b || a.n - b.n || a.name.localeCompare(b.name));
    
    if(window.F.length === 0) {
        window.$('tbFree').innerHTML = `<tr><td colspan="5" class="py-5 text-muted bg-light"><i class="bi bi-info-circle fs-3 d-block mb-2 text-success"></i>아직 자유수강권 대상자가 없습니다.<br>좌측에서 엑셀을 업로드하거나 개별 등록해주세요.</td></tr>`; return;
    }
    if(ls.length === 0 && onlyCustom) { window.$('tbFree').innerHTML = `<tr><td colspan="5" class="py-5 text-muted bg-light">강좌별로 시점이 다르게 지정된 학생이 없습니다.</td></tr>`; return; }
    
    window.$('tbFree').innerHTML = `<thead class="table-light"><tr><th>학적</th><th>이름</th><th>지원액</th><th>지원시점 (클릭수정)</th><th>관리</th></tr></thead><tbody>` + ls.map(f => {
        let btnClass = "btn-outline-secondary"; let btnText = "기본설정 ⚙️";
        if (f._isMixed) { btnClass = "btn-warning text-dark shadow-sm"; btnText = "강좌별 개별지정 ✏️"; }
        else if (f._cQ > 1 || f._cS > 0 || f._cH > 1) { btnClass = "btn-primary shadow-sm text-white"; const hStr = f._cH > 1 ? ` ${f._cH}시수` : ''; btnText = `${f._cQ}분기 ${f._cS+1}차수${hStr} 시작 ⚙️`; }
        return `<tr><td>${window.dsp(f.g,f.b,f.n)}</td><td class="fw-bold"><span class="clickable text-dark" onclick="window.openStuConsole('${window.uid(f.g,f.b,f.n,f.name).replace(/'/g,"\\'")}')">${f.name}</span></td><td class="text-success fw-bold">600,000</td><td><button class="btn btn-sm ${btnClass} rounded-pill py-0 px-3 fw-bold" onclick="window.changeFreeStart(${f._i})" title="클릭하여 지원 시점 변경" style="font-size:0.8rem;">${btnText}</button></td><td><button class="btn btn-sm btn-outline-danger py-0" onclick="window.delF(${f._i})">삭제</button></td></tr>`;
    }).join('') + `</tbody>`;
};

window.importFromPrevQuarter = function() {
    const targetQ = window.gQ; const prevQ = targetQ - 1;
    if (prevQ < 1) return alert('1분기는 이전 분기가 없으므로 가져올 수 없습니다.');
    const prevEnrolls = window.E.filter(e => e.q === prevQ);
    if (prevEnrolls.length === 0) return alert(`${prevQ}분기에 가져올 수강생 명단이 없습니다.`);
    const activeCoursesTargetQ = Object.keys(window.C).filter(c => window.C[c][targetQ] && window.C[c][targetQ].isActive !== false);
    if (activeCoursesTargetQ.length === 0) return alert(`🚨 ${targetQ}분기에 등록된(활성화된) 강좌가 없습니다. 1스텝에서 세팅해 주세요.`);
    const activeCoursesPrevQ = Object.keys(window.C).filter(c => window.C[c][prevQ] && window.C[c][prevQ].isActive !== false);

    const enrollsToImport = [];
    prevEnrolls.forEach(e => {
        const baseName = e.course.replace(/\([A-Za-z가-힣0-9]+\)$/, '').trim();
        const alreadyInTargetQ = window.E.some(x => x.q === targetQ && window.uid(x.g, x.b, x.n, x.name) === window.uid(e.g, e.b, e.n, e.name) && x.course.replace(/\([A-Za-z가-힣0-9]+\)$/, '').trim() === baseName);
        if (!alreadyInTargetQ) enrollsToImport.push(e);
    });
    if (enrollsToImport.length === 0) return alert(`🚨 ${prevQ}분기 수강생이 이미 현재 분기에 모두 존재합니다.\n명단을 다시 가져오시려면 현재 분기 명단을 [전체 비우기] 하신 후 시도해 주세요.`);

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
    alert(`✅ 명단 불러오기 완료!\n\n(자동 배정: ${directCnt}명, 매칭 실패: ${missingCnt}명)\n※ 실패 학생은 [누락명단 관리]에서 배정해 주세요.`);
};

window.upEnroll = async function() {
    const fs = Array.from(window.$('fileEnroll').files); if (!fs.length) return; const q = window.num(window.val('exEnQ'));
    if (window.isQuarterLocked(q)) { alert('🔒 해당 분기에 이미 마감된 차수가 있습니다.\n명단을 변경하거나 추가하려면 먼저 4스텝에서 모든 마감을 역순으로 해제해 주세요.'); window.$('fileEnroll').value = ''; return; }
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
    if(window.pendingEnrollData.length === 0) { window.$('fileEnroll').value = ''; return alert('업로드할 유효한 명단이 없습니다. (강좌명이나 양식을 확인하세요)'); }
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
    window.$('fileEnroll').value = ''; window.pendingEnrollData = []; alert(`✅ ${mode === 'OVERWRITE' ? '안전하게 덮어쓰기' : '추가(병합)'} 완료 (신규 등록: ${added}건)`);
};

window.addEnroll = function() {
    if(!window.val('e_c') || !window.val('e_nm')) return; const q = window.num(window.val('e_q')); if (window.isQuarterLocked(q)) return alert('🔒 마감 분기입니다.');
    window.commitState(() => {
        window.E.push({ q, g: window.num(window.val('e_g')), b: window.num(window.val('e_b')), n: window.num(window.val('e_n')), name: window.val('e_nm'), course: window.val('e_c'), cT: null, cB: null, rT: 0, rB: 0, mm: '', tMemo:'', bMemo:'', refunds: [], adjusts: [], auditLog: '엔진자동' });
    });
    window.$('e_nm').value = ''; window.$('e_n').focus();
};

window.delE = function(i) {
    if(window.isQuarterLocked(window.E[i].q)) return alert('🔒 마감 변경 불가');
    if(confirm('삭제하시겠습니까?')) { window.commitState(() => { window.E.splice(i,1); }); }
};

window.clearCurrentQuarterEnrolls = function() {
    const q = window.gQ; if (window.isQuarterLocked(q)) return alert(`🔒 ${q}분기에 마감된 차수가 있어 명단을 일괄 삭제할 수 없습니다.\n먼저 4스텝에서 마감을 해제해 주세요.`);
    const currentEnrolls = window.E.filter(e => e.q === q); if (currentEnrolls.length === 0) return alert(`${q}분기에 삭제할 명단이 없습니다.`);
    const hasHistory = currentEnrolls.some(e => (e.adjusts && e.adjusts.length > 0) || (e.refunds && e.refunds.length > 0));
    let msg = `정말 ${q}분기의 수강생 명단(${currentEnrolls.length}건)을 전부 삭제하시겠습니까?`;
    if (hasHistory) { msg = `🚨 경고: 현재 ${q}분기 명단에 [조정]이나 [환불] 이력이 있는 학생이 포함되어 있습니다!\n일괄 삭제 시 이 소중한 회계 기록들도 모두 함께 영구 삭제됩니다.\n\n정말 ${q}분기 명단을 모조리 지우시겠습니까?`; }
    if (confirm(msg)) {
        if (hasHistory && prompt('데이터를 강제로 지우시려면 "삭제"라고 입력해 주세요.') !== '삭제') return alert('삭제가 취소되었습니다.');
        window.commitState(() => { window.E = window.E.filter(e => e.q !== q); }); alert(`✅ ${q}분기 명단이 깔끔하게 비워졌습니다.`);
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
        const nameDisplay = isMissing ? `<span class="text-dark">${window.dsp(e.g,e.b,e.n)} ${e.name}</span>` : `<span class="clickable text-dark" onclick="window.openStuConsole('${window.uid(e.g,e.b,e.n,e.name).replace(/'/g,"\\'")}')">${window.dsp(e.g,e.b,e.n)} ${e.name}</span>`;

        h += `<tr class="${rowCls}">${chkHtml}<td>${qBadge}</td><td class="fw-bold">${nameDisplay}</td><td class="text-start">${cDisplay}</td><td class="text-primary fw-bold">${window.fmt(e.cT)}</td><td class="text-success fw-bold">${window.fmt(e.cB)}</td><td class="text-start" style="font-size:0.8rem;">${info} ${e.mm||''}</td><td><div class="btn-group"><button class="btn btn-sm btn-outline-primary py-0 fw-bold" onclick="window.openMoveModal([${e._i}])" ${locked?'disabled':''}>이동</button><button class="btn btn-sm btn-outline-danger py-0" onclick="window.delE(${e._i})" ${locked?'disabled':''}>삭제</button></div></td></tr>`;
    });
    window.$('tbEnroll').innerHTML = h + '</tbody>';
};