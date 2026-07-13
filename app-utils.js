/* ==========================================================================
   파일닉네임: app-utils.js
   기능설명: 파일 파싱, 입출력 포맷터, 다중 다운로드 및 데이터 생성 유틸리티
   ========================================================================== */
'use strict';

// 💡 툴팁 기능: 헷갈리기 쉬운 용어 옆에 ? 아이콘을 붙이면, 마우스를 올렸을 때 설명이 뜬다.
// 사용법: 라벨 뒤에 ${window.tt('설명 문구')} 를 붙여서 템플릿 문자열에 삽입
window.tt = function(text) {
    const escaped = String(text).replace(/"/g, '&quot;');
    return `<i class="bi bi-question-circle text-muted ms-1" data-bs-toggle="tooltip" data-bs-placement="top" title="${escaped}" style="cursor:help; font-size:0.85em;"></i>`;
};

// 화면에 새로 그려지는 부분(표, 모달 등)에 툴팁 아이콘이 있으면 자동으로 활성화
window.initTooltips = function(root) {
    if (typeof bootstrap === 'undefined' || !bootstrap.Tooltip) return;
    (root || document).querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (el) {
        if (!bootstrap.Tooltip.getInstance(el)) new bootstrap.Tooltip(el);
    });
};

// 동적으로 렌더링되는 화면들(표 갱신, 콘솔 모달 등)은 매번 initTooltips를 호출하기 번거로우니,
// DOM 변화를 감지해서 새로 추가된 툴팁 아이콘을 자동으로 초기화한다.
document.addEventListener('DOMContentLoaded', function () {
    window.initTooltips();
    const observer = new MutationObserver(function () { window.initTooltips(); });
    observer.observe(document.body, { childList: true, subtree: true });
});

// 💡 환불 사유 표시명. 정상적으로는 등록 시점에 tyNm(예쁜 한글 사유)이 같이 저장되지만,
// tyNm이 도입되기 전에 저장된 옛 백업을 불러온 경우를 대비해 영문 코드(ty)만 있어도
// 화면/엑셀에 영문 코드가 그대로 노출되지 않도록 여기서 한글로 재구성해준다.
window.refTyName = function (r) {
    if (!r) return '';
    if (r.tyNm) return r.tyNm;
    const si = (r.sessIdx ?? 0) + 1;
    if (r.ty === 'BEFORE') return '개시전(전액)';
    if (r.ty === 'DISEASE') return `${si}차 결석(${r.ah || 0}시수)`;
    if (r.ty === 'STUDENT') return `${si}차 포기(${r.ah || 0}시수)`;
    return r.ty || '';
};

// 💡 alert/confirm/prompt 대체용 다이얼로그. 브라우저 네이티브 팝업 대신 앱과 톤이 맞는
// Bootstrap 모달을 쓴다. 셋 다 Promise를 반환하므로 호출부는 async 함수 안에서 await로 쓴다.
let __dlgResolve = null;

function __setupDialog(message, opts) {
    window.$('dlgMessage').textContent = message;
    const input = window.$('dlgInput');
    const cancelBtn = window.$('dlgCancelBtn');
    if (opts.showInput) {
        input.classList.remove('d-none');
        input.value = opts.defaultValue || '';
    } else {
        input.classList.add('d-none');
    }
    cancelBtn.classList.toggle('d-none', !opts.showCancel);
}

function __resolveDialog(value) {
    if (__dlgResolve) { const r = __dlgResolve; __dlgResolve = null; r(value); }
}

window.showAlert = function (message) {
    return new Promise(resolve => {
        __dlgResolve = resolve;
        __setupDialog(message, { showCancel: false, showInput: false });
        window.mdlDialog.show();
        setTimeout(() => window.$('dlgOkBtn').focus(), 300);
    });
};

window.showConfirm = function (message) {
    return new Promise(resolve => {
        __dlgResolve = resolve;
        __setupDialog(message, { showCancel: true, showInput: false });
        window.mdlDialog.show();
        setTimeout(() => window.$('dlgOkBtn').focus(), 300);
    });
};

// 💡 사후 안내용 토스트: 확인/취소가 필요 없는 결과 알림(예: 금액 변경 반영 결과)에 사용.
// 모달과 달리 화면을 막지 않고 잠시 떴다가 자동으로 사라진다.
window.showToast = function (message) {
    if (!window.mdlToast) return;
    const body = window.$('appToastBody');
    if (body) body.textContent = message;
    window.mdlToast.show();
};

window.showPrompt = function (message, defaultValue = '') {
    return new Promise(resolve => {
        __dlgResolve = resolve;
        __setupDialog(message, { showCancel: true, showInput: true, defaultValue });
        window.mdlDialog.show();
        setTimeout(() => window.$('dlgInput').focus(), 300);
    });
};

document.addEventListener('DOMContentLoaded', function () {
    const okBtn = window.$('dlgOkBtn');
    const cancelBtn = window.$('dlgCancelBtn');
    const input = window.$('dlgInput');
    const modalEl = window.$('mdlDialog');
    if (!okBtn || !cancelBtn || !input || !modalEl) return;

    okBtn.addEventListener('click', () => {
        const isPromptMode = !input.classList.contains('d-none');
        const result = isPromptMode ? input.value : true;
        window.mdlDialog.hide();
        __resolveDialog(result);
    });
    cancelBtn.addEventListener('click', () => {
        const isPromptMode = !input.classList.contains('d-none');
        window.mdlDialog.hide();
        __resolveDialog(isPromptMode ? null : false);
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); }
    });
    // 백드롭 클릭은 막혀있지만(static), ESC로 닫히는 경우까지 대비해 미응답 상태로 남지 않도록 처리
    modalEl.addEventListener('hidden.bs.modal', () => {
        const isPromptMode = !input.classList.contains('d-none');
        __resolveDialog(isPromptMode ? null : false);
    });
});


// 💡 차수별시수("4,4,4" 형태) 입력 오기 방지: 형식 검증 + 실시간 미리보기.
// 숫자와 콤마만 허용하고, 0 이하 값은 차수로 인정하지 않는다.
window.parseMh = function (str) {
    const cleaned = String(str || '').replace(/\s+/g, '');
    if (!/^\d+(,\d+)*$/.test(cleaned)) return null;
    const arr = cleaned.split(',').map(Number);
    if (arr.some(x => x <= 0)) return null;
    return arr;
};

window.mhPreviewText = function (str) {
    const arr = window.parseMh(str);
    if (!arr) return '⚠ 형식 오류(숫자,콤마만)';
    return `→ ${arr.length}차수 · 총 ${arr.reduce((a, b) => a + b, 0)}시수`;
};

window.updateMhPreview = function (el) {
    const out = el.parentElement && el.parentElement.querySelector('.mh-preview');
    if (out) out.textContent = window.mhPreviewText(el.value);
};

// 💡 차수별시수 팝오버: 입력창을 클릭하면 "4,4,4" 형태 그대로 유지하면서
// 차수별로 나눠 스피너(숫자 입력의 기본 업다운 버튼)로 조정할 수 있게 해준다.
window.closeMhPopover = function () {
    const pop = document.getElementById('mhPopover');
    if (!pop) return;
    const target = pop._targetEl;
    pop.remove();
    if (window._mhPopoverOutsideHandler) document.removeEventListener('mousedown', window._mhPopoverOutsideHandler, true);
    if (window._mhPopoverEscHandler) document.removeEventListener('keydown', window._mhPopoverEscHandler, true);
    if (target) target.dispatchEvent(new Event('blur'));
};

window.openMhPopover = function (el) {
    if (el.disabled) return;
    window.closeMhPopover();

    const parsed = window.parseMh(el.value);
    const fallback = String(el.value || '').split(',').map(v => parseInt(v, 10)).filter(n => !isNaN(n) && n > 0);
    const arr = (parsed && parsed.length) ? parsed.slice() : (fallback.length ? fallback : [4, 4, 4]);

    const pop = document.createElement('div');
    pop.id = 'mhPopover';
    pop.className = 'mh-popover shadow';
    pop._targetEl = el;

    arr.forEach((v, idx) => {
        const grp = document.createElement('div');
        grp.className = 'mh-popover-item';
        const label = document.createElement('label');
        label.textContent = `${idx + 1}차`;
        const inp = document.createElement('input');
        inp.type = 'number'; inp.min = '1'; inp.step = '1'; inp.value = v;
        inp.className = 'form-control form-control-sm text-center';
        inp.addEventListener('input', () => {
            arr[idx] = Math.max(1, window.num(inp.value) || 1);
            el.value = arr.join(',');
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        grp.appendChild(label); grp.appendChild(inp);
        pop.appendChild(grp);
    });

    document.body.appendChild(pop);
    const r = el.getBoundingClientRect();
    pop.style.top = `${r.bottom + window.scrollY + 4}px`;
    pop.style.left = `${r.left + window.scrollX}px`;

    window._mhPopoverOutsideHandler = (e) => { if (!pop.contains(e.target) && e.target !== el) window.closeMhPopover(); };
    window._mhPopoverEscHandler = (e) => { if (e.key === 'Escape') window.closeMhPopover(); };
    document.addEventListener('mousedown', window._mhPopoverOutsideHandler, true);
    document.addEventListener('keydown', window._mhPopoverEscHandler, true);
};

document.addEventListener('focusin', (e) => {
    if (e.target.classList && e.target.classList.contains('mh-input') && !e.target.disabled) {
        window.openMhPopover(e.target);
    }
});

// 💡 표 형태 입력칸(부서마스터/강좌요금표/일괄조정)에서 엑셀처럼 엔터=아래, 쉬프트+엔터=위로 이동.
// 탭/쉬프트+탭은 브라우저 기본 동작(좌우 이동)을 그대로 쓰므로 별도 처리하지 않는다.
const NAV_SELECTOR = 'input:not([type="checkbox"]):not([disabled]), select:not([disabled])';

// 타이핑 자체로는 표가 다시 그려지지 않는 곳(강좌 콘솔 일괄조정 등)용: 그냥 옆 칸으로 포커스만 옮긴다.
function focusAdjacentRow(el, rowOffset) {
    const tr = el.closest('tr'); if (!tr) return;
    const cells = Array.from(tr.querySelectorAll(NAV_SELECTOR));
    const colIdx = cells.indexOf(el); if (colIdx === -1) return;
    let targetTr = tr;
    for (let i = 0; i < Math.abs(rowOffset); i++) {
        targetTr = rowOffset > 0 ? targetTr.nextElementSibling : targetTr.previousElementSibling;
        if (!targetTr) return;
    }
    const target = targetTr.querySelectorAll(NAV_SELECTOR)[colIdx];
    if (target) { target.focus(); if (target.select) target.select(); }
}

// 부서마스터/강좌요금표용: blur로 값이 적용되며 표 전체가 다시 그려지므로,
// 재렌더링 전에 위치(행/열)를 기억해뒀다가 새로 그려진 표에서 같은 위치를 찾아 포커스한다.
function commitAndFocusAdjacentRow(el, rowOffset) {
    const table = el.closest('table'); if (!table) return;
    const tr = el.closest('tr');
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const rowIdx = rows.indexOf(tr);
    const cells = Array.from(tr.querySelectorAll(NAV_SELECTOR));
    const colIdx = cells.indexOf(el);
    const tableId = table.id;
    const isCntField = el.dataset.field === 'cnt'; // 강좌수는 확인창이 뜨는 별도 흐름이라 자동 이동은 생략

    el.blur(); // 값 적용(및 재렌더링)이 동기적으로 끝난다

    if (isCntField || rowIdx === -1 || colIdx === -1) return;
    const freshTable = document.getElementById(tableId); if (!freshTable) return;
    const freshRows = freshTable.querySelectorAll('tbody tr');
    // 위/아래로 더 이상 이동할 행이 없으면(첫 행에서 위로, 마지막 행에서 아래로),
    // 포커스가 body로 빠지지 않도록 원래 있던 자리(재렌더링된 같은 칸)에 그대로 둔다.
    const targetRow = freshRows[rowIdx + rowOffset] || freshRows[rowIdx];
    if (!targetRow) return;
    const target = targetRow.querySelectorAll(NAV_SELECTOR)[colIdx];
    if (target) { target.focus(); if (target.select) target.select(); }
}

// 💡 1~3스텝의 "개별 등록" 폼들: 엔터로 다음 칸 이동, 마지막 칸에서 엔터 시 등록 버튼 실행
const REG_FORMS = [
    { fields: ['c_dept', 'c_cnt', 'c_inst_m', 'c_mgmt_m', 'c_b', 'c_m', 'c_unit', 'c_mh'], submit: 'addDeptMaster' }, // 1스텝: 부서/강좌
    { fields: ['e_q', 'e_c', 'e_g', 'e_b', 'e_n', 'e_nm'], submit: 'addEnroll' }, // 2스텝: 수강생
    { fields: ['f_g', 'f_b', 'f_n', 'f_nm', 'f_sq', 'f_ss'], submit: 'addFree' }, // 3스텝: 자유수강권 대상자
];

document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    const el = e.target;

    const form = REG_FORMS.find(f => f.fields.includes(el.id));
    if (form) {
        e.preventDefault();
        const visible = form.fields.filter(id => { const f = window.$(id); return f && f.offsetParent !== null; });
        const idx = visible.indexOf(el.id);
        if (idx === -1) return;
        if (idx === visible.length - 1) { if (typeof window[form.submit] === 'function') window[form.submit](); }
        else { const next = window.$(visible[idx + 1]); if (next) { next.focus(); next.select && next.select(); } }
        return;
    }

    if (!(el.tagName === 'INPUT' || el.tagName === 'SELECT') || el.type === 'checkbox') return;
    const rowOffset = e.shiftKey ? -1 : 1;

    // 부서마스터 / 강좌요금표
    const table = el.closest('table');
    if (table && (table.id === 'tbMaster' || table.id === 'tbCourse')) {
        e.preventDefault();
        commitAndFocusAdjacentRow(el, rowOffset);
        return;
    }

    // 강좌 콘솔(일괄조정 모달): 사유 칸은 기존 "엔터=이 학생만 저장" 동작을 그대로 둔다
    if (el.closest('#mdlCourseSummary')) {
        if (el.id && el.id.startsWith('inl_memo_')) return;
        e.preventDefault();
        focusAdjacentRow(el, rowOffset);
    }
});

window.readFileAsArrayBuffer = function(file) { return new Promise((r, j) => { const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.onerror = () => j(new Error('파일 읽기 실패')); rd.readAsArrayBuffer(file); }); };
window.readFileAsText = function(file) { return new Promise((r, j) => { const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.onerror = () => j(new Error('파일 읽기 실패')); rd.readAsText(file, 'utf-8'); }); };
window.parseXlsx = function(buffer) { const wb = XLSX.read(new Uint8Array(buffer), {type:'array'}); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''}); };

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


window.exportAsExcel = function(tableId, title) { const el = window.$(tableId); if(!el) return window.showAlert('데이터가 없습니다.'); const wb = XLSX.utils.table_to_book(el, {sheet: "정산내역", display: true}); XLSX.writeFile(wb, `${title}_${new Date().toISOString().slice(0,10)}.xlsx`); };
window.exportAsImage = function(tableId, title) { const el = window.$(tableId); if(!el) return window.showAlert('데이터가 없습니다.'); html2canvas(el, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => { const link = document.createElement('a'); link.download = `${title}_${new Date().toISOString().slice(0,10)}.png`; link.href = canvas.toDataURL('image/png'); link.click(); }); };
window.printElement = function(tableId, title) { const el = window.$(tableId); if(!el) return window.showAlert('데이터가 없습니다.'); const win = window.open('', '_blank', 'width=1000,height=800'); const bsHref = new URL('vendor/bootstrap/bootstrap.min.css', location.href).href; win.document.write('<html><head><title>인쇄 - ' + title + '</title>'); win.document.write('<link href="' + bsHref + '" rel="stylesheet">'); win.document.write('<style>body{padding:20px; font-family:"Malgun Gothic",sans-serif;} table{width:100%; border-collapse:collapse; text-align:center; font-size:12px;} th,td{border:1px solid #000; padding:4px;} th{background-color:#f1f3f5 !important; font-weight:bold; -webkit-print-color-adjust:exact;} h3 { font-size: 18px !important; margin-bottom: 15px !important; }</style>'); win.document.write('</head><body><h3 style="font-weight:bold; text-align:center;">' + title + '</h3>'); win.document.write(el.outerHTML); win.document.write('</body></html>'); win.document.close(); win.focus(); setTimeout(() => { win.print(); win.close(); }, 800); };

window.exportCurrentStep4 = function(type) { const activeTabBtn = document.querySelector('#step4 .nav-tabs .nav-link.active'); if(!activeTabBtn) return; const targetId = activeTabBtn.getAttribute('data-bs-target').replace('#', ''); const title = '4스텝_' + activeTabBtn.innerText.trim().replace(/[^가-힣a-zA-Z0-9]/g, '_'); if (type === 'EXCEL') window.exportAsExcel(targetId, title); else if (type === 'IMAGE') window.exportAsImage(targetId, title); else if (type === 'PRINT') window.printElement(targetId, title); };
window.exportModalView = function(type, targetId) { let title = '상세명세서'; if(targetId === 'mdlStuConsoleBody' && window.$('consoleTitle')) { title = window.$('consoleTitle').innerText.trim().replace(/[^가-힣a-zA-Z0-9]/g, '_'); } if(targetId === 'mdlCourseSummaryBody' && window.$('crsSummaryTitle')) { title = window.$('crsSummaryTitle').innerText.trim().replace(/[^가-힣a-zA-Z0-9]/g, '_'); } if (type === 'EXCEL') window.exportAsExcel(targetId, title); else if (type === 'IMAGE') window.exportAsImage(targetId, title); else if (type === 'PRINT') window.printElement(targetId, title); };

window.getExceptionBadges = function(eObj) {
    let badges = [];
    if (eObj.adjusts && eObj.adjusts.length > 0) { eObj.adjusts.forEach(adj => { if (!adj.title.includes('[예외설정]')) badges.push(`<span class="badge bg-warning text-dark border border-warning">조정:${adj.title}</span>`); }); }
    if (eObj.refunds && eObj.refunds.length > 0) { eObj.refunds.forEach(ref => badges.push(`<span class="badge bg-danger text-white border border-danger">환불:${window.refTyName(ref)}</span>`)); }
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