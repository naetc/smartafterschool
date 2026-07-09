/* ==========================================================================
   파일닉네임: app-utils.js
   기능설명: 파일 파싱, 입출력 포맷터, 다중 다운로드 및 데이터 생성 유틸리티
   ========================================================================== */
'use strict';

window.readFileAsArrayBuffer = function(file) { return new Promise((r, j) => { const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.onerror = () => j(new Error('파일 읽기 실패')); rd.readAsArrayBuffer(file); }); };
window.readFileAsText = function(file) { return new Promise((r, j) => { const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.onerror = () => j(new Error('파일 읽기 실패')); rd.readAsText(file, 'utf-8'); }); };
window.parseXlsx = function(buffer) { const wb = XLSX.read(new Uint8Array(buffer), {type:'array'}); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''}); };
window.loadManual = function() { if(window.$('manualContent') && typeof manualMarkdown !== 'undefined' && typeof marked !== 'undefined') { window.$('manualContent').innerHTML = marked.parse(manualMarkdown); } };

// 💡 1스텝 샘플 양식 다운로드 (3D 모드 대응)
window.dlSampleCourse = function() { 
    const is3D = window.SysSet.accType === 'SEPARATED';
    const wb = XLSX.utils.book_new(); 
    
    let sampleData = { '부서명':'과학실험', '강좌수':2, '월 강사료':30000, '월 수용비':2000, '분기 기초 교재비':50000 };
    if (is3D) sampleData['분기 기초 재료비'] = 10000; // 3D 모드일 때만 열 추가
    sampleData['주간단위'] = 1;
    sampleData['차수별시수'] = '4,4,4';

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([sampleData]), '부서마스터'); 
    XLSX.writeFile(wb, '부서양식.xlsx'); 
};
window.dlSampleFree = function() { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{학년:1, 반:1, 번호:1, 이름:'홍길동', 시작분기:1, 시작차수:1}]), '명단'); XLSX.writeFile(wb, '자유수강권.xlsx'); };
window.dlSampleUnified = function() { const wb = XLSX.utils.book_new(); const unifiedSample = [{'강좌명': '로봇과학', '학년': 1, '반': 1, '번호': 1, '이름': '홍길동', '비고': '신규등록'}]; XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unifiedSample), '통합업로드양식'); XLSX.writeFile(wb, '수강생명단_통합양식.xlsx'); };
window.dlSampleSeparate = function() { const wb = XLSX.utils.book_new(); const courses = Object.keys(window.C); const separateSample = [{'학년': 1, '반': 1, '번호': 1, '이름': '김철수', '비고': '신규등록'}]; if (courses.length === 0) { XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(separateSample), '강좌명(수정요망)'); } else { courses.forEach(c => { const safeName = c.substring(0, 31).replace(/[\[\]*?:\/\\]/g, ''); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(separateSample), safeName); }); } XLSX.writeFile(wb, '수강생명단_강좌별시트양식.xlsx'); };
// 💡 스마트 출석부: 연락처 마스터 양식 다운로드 추가
window.dlSampleContactMaster = function() { 
    const wb = XLSX.utils.book_new(); 
    const sample = [{ 
        '학년': 1, '반': 1, '번호': 1, '이름': '홍길동', 
        '연락처': '010-1234-5678', '귀가방법': '도보(학원)' 
    }]; 
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sample), '연락처마스터'); 
    XLSX.writeFile(wb, '스마트출석부_연락처마스터_양식.xlsx'); 
};


window.exportAsExcel = function(tableId, title) { const el = window.$(tableId); if(!el) return alert('데이터가 없습니다.'); const wb = XLSX.utils.table_to_book(el, {sheet: "정산내역", display: true}); XLSX.writeFile(wb, `${title}_${new Date().toISOString().slice(0,10)}.xlsx`); };
window.exportAsImage = function(tableId, title) { const el = window.$(tableId); if(!el) return alert('데이터가 없습니다.'); html2canvas(el, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => { const link = document.createElement('a'); link.download = `${title}_${new Date().toISOString().slice(0,10)}.png`; link.href = canvas.toDataURL('image/png'); link.click(); }); };
window.printElement = function(tableId, title) { const el = window.$(tableId); if(!el) return alert('데이터가 없습니다.'); const win = window.open('', '_blank', 'width=1000,height=800'); win.document.write('<html><head><title>인쇄 - ' + title + '</title>'); win.document.write('<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">'); win.document.write('<style>body{padding:20px; font-family:"Malgun Gothic",sans-serif;} table{width:100%; border-collapse:collapse; text-align:center; font-size:12px;} th,td{border:1px solid #000; padding:4px;} th{background-color:#f1f3f5 !important; font-weight:bold; -webkit-print-color-adjust:exact;} h3 { font-size: 18px !important; margin-bottom: 15px !important; }</style>'); win.document.write('</head><body><h3 style="font-weight:bold; text-align:center;">' + title + '</h3>'); win.document.write(el.outerHTML); win.document.write('</body></html>'); win.document.close(); win.focus(); setTimeout(() => { win.print(); win.close(); }, 800); };

window.exportCurrentStep4 = function(type) { const activeTabBtn = document.querySelector('#step4 .nav-tabs .nav-link.active'); if(!activeTabBtn) return; const targetId = activeTabBtn.getAttribute('data-bs-target').replace('#', ''); const title = '4스텝_' + activeTabBtn.innerText.trim().replace(/[^가-힣a-zA-Z0-9]/g, '_'); if (type === 'EXCEL') window.exportAsExcel(targetId, title); else if (type === 'IMAGE') window.exportAsImage(targetId, title); else if (type === 'PRINT') window.printElement(targetId, title); };
window.exportModalView = function(type, targetId) { let title = '상세명세서'; if(targetId === 'mdlStuConsoleBody' && window.$('consoleTitle')) { title = window.$('consoleTitle').innerText.trim().replace(/[^가-힣a-zA-Z0-9]/g, '_'); } if(targetId === 'mdlCourseSummaryBody' && window.$('crsSummaryTitle')) { title = window.$('crsSummaryTitle').innerText.trim().replace(/[^가-힣a-zA-Z0-9]/g, '_'); } if (type === 'EXCEL') window.exportAsExcel(targetId, title); else if (type === 'IMAGE') window.exportAsImage(targetId, title); else if (type === 'PRINT') window.printElement(targetId, title); };

window.getExceptionBadges = function(eObj) {
    let badges = [];
    if (eObj.adjusts && eObj.adjusts.length > 0) { eObj.adjusts.forEach(adj => { if (!adj.title.includes('[예외설정]')) badges.push(`<span class="badge bg-warning text-dark border border-warning">조정:${adj.title}</span>`); }); }
    if (eObj.refunds && eObj.refunds.length > 0) { eObj.refunds.forEach(ref => badges.push(`<span class="badge bg-danger text-white border border-danger">${ref.sessIdx+1}차 환불</span>`)); }
    if (badges.length === 0) return '';
    return `<div class="exception-container d-flex flex-wrap gap-1">${badges.join('')}</div>`;
};

window.toggleAllE = function(el) { document.querySelectorAll('.row-chk').forEach(c => { if(!c.disabled) c.checked = el.checked; }); };
window.toggleAllCourseStu = function(el) { document.querySelectorAll('.crs-stu-chk').forEach(chk => { if(!chk.disabled) chk.checked = el.checked; }); };

// 💡 4스텝 테이블 3개(통계, 학생별, 강좌별)의 헤더 동적 생성
// 💡 [버그 픽스] 필터(전체/자유수강/초3지원)를 바꿔도 열 너비가 내용에 따라 흔들리지 않도록
// 학생별 탭 표의 각 열 너비를 고정하는 colgroup을 생성한다.
window.buildStuDtlColgroup = function(is3D) {
    let html = '<col style="width:70px"><col style="width:90px"><col style="width:110px"><col style="width:85px"><col style="width:85px"><col style="width:55px"><col style="width:140px">';
    for (let i = 0; i < 4; i++) {
        html += '<col style="width:85px"><col style="width:85px">';
        if (is3D) html += '<col style="width:75px">';
    }
    html += '<col style="width:230px">';
    return html;
};

// 💡 강좌별 일괄 회계처리 탭: 분기,학적,이름,대상,강좌명 + 4개 그룹 + 산출근거
window.buildCrseDtlColgroup = function(is3D) {
    let html = '<col style="width:55px"><col style="width:80px"><col style="width:90px"><col style="width:110px"><col style="width:150px">';
    for (let i = 0; i < 4; i++) {
        html += '<col style="width:85px"><col style="width:85px">';
        if (is3D) html += '<col style="width:75px">';
    }
    html += '<col style="width:230px">';
    return html;
};

// 💡 분기별 총괄 통계 탭: 강좌명,신청인원 + 4개 그룹 (산출근거 없음)
window.buildStatColgroup = function(is3D) {
    let html = '<col style="width:220px"><col style="width:90px">';
    for (let i = 0; i < 4; i++) {
        html += '<col style="width:100px"><col style="width:100px">';
        if (is3D) html += '<col style="width:90px">';
    }
    return html;
};

window.renderStaticHeaders = function() {
    const is3D = window.SysSet.accType === 'SEPARATED';
    const cSpan = is3D ? 3 : 2;

    const hM_T = is3D ? '<th class="table-warning text-success">재료비</th>' : '';
    const hM_C = is3D ? '<th class="bg-cho3 text-success">재료비</th>' : '';
    const hM_F = is3D ? '<th class="bg-free text-success">재료비</th>' : '';
    const hM_R = is3D ? '<th class="table-danger text-success">재료비</th>' : '';

    if(window.$('tbStatCols')) window.$('tbStatCols').innerHTML = window.buildStatColgroup(is3D);
    if(window.$('tbStatHead')) window.$('tbStatHead').innerHTML = `<tr><th rowspan="2">강좌명</th><th rowspan="2">신청인원</th><th colspan="${cSpan}" class="table-warning">실부담금(지원전) 총액</th><th colspan="${cSpan}" class="bg-cho3">초3 공제합계</th><th colspan="${cSpan}" class="bg-free">자유수강 공제합계</th><th colspan="${cSpan}" class="table-danger">최종 징수액(자부담)</th></tr><tr><th class="table-warning">수강료계</th><th class="table-warning">교재비계</th>${hM_T}<th class="bg-cho3">수강료</th><th class="bg-cho3">교재비</th>${hM_C}<th class="bg-free">수강료</th><th class="bg-free">교재비</th>${hM_F}<th class="table-danger text-danger">수강료합</th><th class="table-danger text-danger">교재비합</th>${hM_R}</tr>`;
    
    const exFilterHtml1 = `<br><div class="d-flex justify-content-center gap-2 mt-1 no-print" style="font-size:0.75rem; font-weight:normal;"><label><input type="checkbox" onclick="window.s4_chkAdj=this.checked; window.renderSetTabs();" id="chkFiltAdj"> 조정</label><label><input type="checkbox" onclick="window.s4_chkRef=this.checked; window.renderSetTabs();" id="chkFiltRef"> 환불</label><label><input type="checkbox" onclick="window.s4_chkDed=this.checked; window.renderSetTabs();" id="chkFiltDed"> 개별공제</label></div>`;
    const exFilterHtml2 = `<br><div class="d-flex justify-content-center gap-2 mt-1 no-print" style="font-size:0.75rem; font-weight:normal;"><label><input type="checkbox" onclick="window.s4_chkAdj=this.checked; window.renderSetTabs();" id="chkFiltC_Adj"> 조정</label><label><input type="checkbox" onclick="window.s4_chkRef=this.checked; window.renderSetTabs();" id="chkFiltC_Ref"> 환불</label><label><input type="checkbox" onclick="window.s4_chkDed=this.checked; window.renderSetTabs();" id="chkFiltC_Ded"> 개별공제</label></div>`;

    if(window.$('tbStuDtlCols')) window.$('tbStuDtlCols').innerHTML = window.buildStuDtlColgroup(is3D);
    if(window.$('tbStuDtlHead')) window.$('tbStuDtlHead').innerHTML = `<tr><th rowspan="2" class="clickable text-dark" onclick="window.sortStu('DP')">학적 <span id="sort_DP"><i class="bi bi-arrow-down-up text-muted opacity-50"></i></span></th><th rowspan="2" class="clickable text-dark" onclick="window.sortStu('NM')">이름 <span id="sort_NM"><i class="bi bi-arrow-down-up text-muted opacity-50"></i></span></th><th rowspan="2">대상</th><th colspan="2">지원금 잔여</th><th rowspan="2">분기</th><th rowspan="2">강좌명</th><th colspan="${cSpan}" class="table-warning">실부담금(지원전)</th><th colspan="${cSpan}" class="bg-cho3">초3 공제</th><th colspan="${cSpan}" class="bg-free">자유 공제</th><th colspan="${cSpan}" class="table-danger fw-bold align-middle">최종징수(자부담)</th><th rowspan="2" class="table-secondary align-middle" style="min-width:160px;">산출근거${exFilterHtml1}</th></tr><tr><th class="clickable text-primary" onclick="window.sortStu('C')">초3잔액 <span id="sort_C"><i class="bi bi-arrow-down-up text-muted opacity-50"></i></span></th><th class="clickable text-success" onclick="window.sortStu('F')">자유잔액 <span id="sort_F"><i class="bi bi-arrow-down-up text-muted opacity-50"></i></span></th><th class="table-warning">수강료</th><th class="table-warning">교재비</th>${hM_T}<th class="bg-cho3">수강료</th><th class="bg-cho3">교재비</th>${hM_C}<th class="bg-free">수강료</th><th class="bg-free">교재비</th>${hM_F}<th class="table-danger text-danger">수강료</th><th class="table-danger text-danger">교재비</th>${hM_R}</tr>`;
    
    if(window.$('tbCrseDtlCols')) window.$('tbCrseDtlCols').innerHTML = window.buildCrseDtlColgroup(is3D);
    if(window.$('tbCrseDtlHead')) window.$('tbCrseDtlHead').innerHTML = `<tr><th rowspan="2">분기</th><th rowspan="2">학적</th><th rowspan="2">이름</th><th rowspan="2">대상</th><th rowspan="2">강좌명</th><th colspan="${cSpan}" class="table-warning">실부담금(지원전)</th><th colspan="${cSpan}" class="bg-cho3">초3 공제</th><th colspan="${cSpan}" class="bg-free">자유 공제</th><th colspan="${cSpan}" class="table-danger fw-bold align-middle">최종징수(자부담)</th><th rowspan="2" class="table-secondary align-middle" style="min-width:160px;">산출근거${exFilterHtml2}</th></tr><tr><th class="table-warning">수강료</th><th class="table-warning">교재비</th>${hM_T}<th class="bg-cho3">수강료</th><th class="bg-cho3">교재비</th>${hM_C}<th class="bg-free">수강료</th><th class="bg-free">교재비</th>${hM_F}<th class="table-danger text-danger">수강료</th><th class="table-danger text-danger">교재비</th>${hM_R}</tr>`;
};

window.sortStu = function(col) { if (window.sortState.col === col) window.sortState.asc = !window.sortState.asc; else { window.sortState.col = col; window.sortState.asc = true; } window.renderSetTabs(); };

// 가상 데이터 샌드박스 생성기 (실제 시스템의 이월 Validation 완벽 모방 적용)
window.generateDummyData = function(is3D = false) {
    try {
        window.C = {}; window.M = {}; window.F = []; window.E = []; 
        
        // 3D 모드일 경우 가상의 재료비 금액을 세팅하는 헬퍼 함수
        const mVal = (val) => is3D ? val : 0;

        // 1. 부서 마스터 세팅 (2분기에 가상마술 의도적 폐강 처리)
        window.M = {
            '로봇과학': { 
                1:{cnt:2,inst_m:35000,mgmt_m:2000,b:40000,m:mVal(20000),unit:1,mh:'4,4,4'}, 
                2:{cnt:2,inst_m:35000,mgmt_m:2000,b:40000,m:mVal(20000),unit:1,mh:'4,4,4'}
            },
            '생명과학': { 
                1:{cnt:2,inst_m:38000,mgmt_m:2000,b:45000,m:mVal(25000),unit:1,mh:'4,4,4'}, 
                2:{cnt:2,inst_m:38000,mgmt_m:2000,b:45000,m:mVal(25000),unit:1,mh:'4,4,4'}
            },
            '컴퓨터교실': { 
                1:{cnt:2,inst_m:30000,mgmt_m:1000,b:15000,m:mVal(10000),unit:1,mh:'4,4,4'}, 
                2:{cnt:2,inst_m:30000,mgmt_m:1000,b:15000,m:mVal(10000),unit:1,mh:'4,4,4'}
            },
            '창의미술': { 
                1:{cnt:2,inst_m:40000,mgmt_m:2000,b:35000,m:mVal(30000),unit:1,mh:'4,4,4'}, 
                2:{cnt:2,inst_m:40000,mgmt_m:2000,b:35000,m:mVal(30000),unit:1,mh:'4,4,4'}
            },
            '바둑교실': { 
                1:{cnt:2,inst_m:32000,mgmt_m:1000,b:20000,m:mVal(5000),unit:1,mh:'4,4,4'}, 
                2:{cnt:2,inst_m:32000,mgmt_m:1000,b:20000,m:mVal(5000),unit:1,mh:'4,4,4'}
            },
            '가상마술': { 
                1:{cnt:2,inst_m:35000,mgmt_m:1000,b:25000,m:mVal(15000),unit:1,mh:'4,4,4'}, 
                2:{cnt:2,inst_m:35000,mgmt_m:1000,b:25000,m:mVal(15000),unit:1,mh:'4,4,4'} // 💡 2분기도 정상 운영 상태로 둠 — "폐강" 자체는 튜토리얼에서 사용자가 1스텝 운영 체크를 직접 해제해서 체험하도록 함
            }
        };
        
        if (typeof window.regenerateC === 'function') window.regenerateC();
        
        const activeCoursesQ1 = Object.keys(window.C).filter(c => window.C[c][1] && window.C[c][1].isActive !== false).sort();
        const surnames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍'];
        const nameFirst = ['지', '서', '준', '하', '민', '도', '예', '현', '다', '우', '연', '은', '시', '하', '주', '태', '민', '유', '승', '나'];
        const nameLast = ['훈', '윤', '우', '은', '준', '우', '연', '민', '서', '빈', '아', '현', '진', '율', '원', '혁', '성', '환', '제', '솔'];
        
        const namePool = [];
        surnames.forEach(s => nameFirst.forEach(n1 => nameLast.forEach(n2 => namePool.push(s + n1 + n2))));
        namePool.sort(() => Math.random() - 0.5);

        // 2. 1분기 명단(Seed) 생성 (200명 무작위 배정)
        for (let i = 0; i < 200; i++) {
            let name = (i === 100 || i === 101) ? "김지훈" : namePool[i];
            let grade = (i % 6) + 1, ban = (i % 5) + 1, numInBan = (i % 25) + 1;
            let isCho3 = (grade === 3); let isFree = (i % 5 === 0);
            
            if (i === 10) { grade = 3; isCho3 = true; isFree = false; }
            if (i === 11) { grade = 3; isCho3 = true; isFree = true; }
            if (i === 12) { grade = 4; isCho3 = false; isFree = true; }
            
            let type = (isCho3 ? 1 : 0) + (isFree ? 2 : 0);
            let minC = [1, 1, 2, 3][type], maxC = [2, 2, 3, 4][type];
            let numCourses = Math.floor(Math.random() * (maxC - minC + 1)) + minC;
            let myCourses = [];
            
            for(let c=0; c<numCourses; c++) {
                let cName = activeCoursesQ1[(i + c*3) % activeCoursesQ1.length];
                if(!myCourses.includes(cName)) myCourses.push(cName);
            }
            
            if (isFree) { window.F.push({ g: grade, b: ban, n: numInBan, name: name, startQ: 1, startSess: 0, courses: {} }); }
            
            myCourses.forEach(cName => {
                window.E.push({ q: 1, g: grade, b: ban, n: numInBan, name: name, course: cName, cT: null, cB: null, cM: null, rT: 0, rB: 0, rM: 0, mm: '', tMemo:'', bMemo:'', refunds:[], adjusts:[], auditLog: '엔진자동' });
            });
        }

        // 3. 2분기 명단 파생 (실제 시스템의 이전 분기 가져오기 로직 100% 동일 적용)
        // 💡 3, 4분기는 샌드박스의 쾌적함을 위해 생성하지 않고 빈 공간으로 둡니다.
        const prevEnrolls = window.E.filter(e => e.q === 1);
        const activeCoursesTargetQ = Object.keys(window.C).filter(c => window.C[c][2] && window.C[c][2].isActive !== false);
        const activeCoursesPrevQ = Object.keys(window.C).filter(c => window.C[c][1] && window.C[c][1].isActive !== false);

        prevEnrolls.forEach(e => {
            const baseName = e.course.replace(/\([A-Za-z가-힣0-9]+\)$/, '').trim();
            const prevOptions = activeCoursesPrevQ.filter(c => c.replace(/\([A-Za-z가-힣0-9]+\)$/, '').trim() === baseName);
            const targetOptions = activeCoursesTargetQ.filter(c => c.replace(/\([A-Za-z가-힣0-9]+\)$/, '').trim() === baseName);
            
            let targetCourse = '미배정(누락)';
            // 타겟 분기(2분기)에 해당 강좌가 활성화되어 있으면 정상 배정, 아니면 누락 처리
            if (activeCoursesTargetQ.includes(e.course) && prevOptions.length === targetOptions.length) { 
                targetCourse = e.course; 
            }

            if (targetCourse === '미배정(누락)') {
                window.E.push({ ...e, q: 2, course: targetCourse, oldQ: 1, oldCourse: e.course, cT: null, cB: null, cM: null, rT: 0, rB: 0, rM: 0, mm: '부서 매칭 실패 (재배정 필요)', tMemo: '', bMemo: '', refunds: [], adjusts: [], auditLog: '엔진자동' });
            } else {
                window.E.push({ ...e, q: 2, course: targetCourse, cT: null, cB: null, cM: null, rT: 0, rB: 0, rM: 0, mm: '이전 분기에서 가져옴', tMemo: '', bMemo: '', refunds: [], adjusts: [], auditLog: '엔진자동' });
            }
        });

        // 💡 4. 심화과정 시나리오 연습용 데이터
        // 마감 차수 시나리오: 1분기 1~3차를 미리 마감 상태로 세팅 (역순 해제 연습용, 학생별 스냅샷은 비워둠 → 정상 계산되며 잠금 UI만 재현)
        window.SysSet.closedSess = window.SysSet.closedSess || {};
        window.SysSet.closedSess['1_0'] = { _isHardLocked: false };
        window.SysSet.closedSess['1_1'] = { _isHardLocked: false };
        window.SysSet.closedSess['1_2'] = { _isHardLocked: false };
    } catch(err) { console.error("데이터 생성 중 치명적 오류:", err); }
};