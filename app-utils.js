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
    if (r.ty === 'DISEASE') return `${si}차 일할계산(${r.ah || 0}시수)`;
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

// 💡 [버그 픽스] 확인→입력처럼 다이얼로그를 연속으로 열 때, 이전 모달의 hide()
// 애니메이션이 끝나기 전에 같은 모달로 show()를 다시 부르면 부트스트랩이 그 호출을
// 무시해버려서(전환 중이라) 다음 다이얼로그가 화면에 뜨지도 못한 채 취소 처리되던 문제.
// 버튼 클릭 시점엔 "이번에 확정된 값"만 기억해두고, 실제 Promise 해소는 모달이
// 완전히 닫힌 뒤(hidden.bs.modal)로 미뤄서 다음 show() 호출과 경합하지 않게 한다.
let __dlgPendingResult;
const __DLG_NO_RESULT = Symbol('no-result');
document.addEventListener('DOMContentLoaded', function () {
    const okBtn = window.$('dlgOkBtn');
    const cancelBtn = window.$('dlgCancelBtn');
    const input = window.$('dlgInput');
    const modalEl = window.$('mdlDialog');
    if (!okBtn || !cancelBtn || !input || !modalEl) return;
    __dlgPendingResult = __DLG_NO_RESULT;

    okBtn.addEventListener('click', () => {
        const isPromptMode = !input.classList.contains('d-none');
        __dlgPendingResult = isPromptMode ? input.value : true;
        window.mdlDialog.hide();
    });
    cancelBtn.addEventListener('click', () => {
        const isPromptMode = !input.classList.contains('d-none');
        __dlgPendingResult = isPromptMode ? null : false;
        window.mdlDialog.hide();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); }
    });
    // ESC나 백드롭 등 OK/취소 버튼을 거치지 않고 닫힌 경우까지 포함해, 모달이
    // 완전히 닫힌 뒤 단 한 곳에서만 Promise를 해소한다.
    modalEl.addEventListener('hidden.bs.modal', () => {
        const isPromptMode = !input.classList.contains('d-none');
        const result = __dlgPendingResult === __DLG_NO_RESULT ? (isPromptMode ? null : false) : __dlgPendingResult;
        __dlgPendingResult = __DLG_NO_RESULT;
        __resolveDialog(result);
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

// 💡 수용비는 강사료의 5%(window.MGMT_RATIO_LIMIT) 이내여야 한다는 행정 규정 검증.
//    부동소수점 오차로 경계값(정확히 5%)이 오검출되지 않도록 아주 작은 여유(1e-6)를 둔다.
window.checkMgmtRatio = function (instAmt, mgmtAmt) {
    return mgmtAmt <= (instAmt * window.MGMT_RATIO_LIMIT) + 1e-6;
};

// 💡 부서마스터(월강사료/월수용비)와 강좌요금표(강사료/수용비) 양쪽에서 공용으로 쓰는
//    "현재 비율 · 5% 한도액" 미리보기 텍스트. window.checkMgmtRatio와 같은 기준을 그대로 재사용해서
//    하드 블록 판정과 화면 표시가 서로 어긋나지 않게 한다.
window.mgmtRatioPreviewText = function (instAmt, mgmtAmt) {
    instAmt = window.num(instAmt) || 0;
    mgmtAmt = window.num(mgmtAmt) || 0;
    if (instAmt <= 0) return '<span class="text-muted">강사료 입력 필요</span>';
    const pct = (mgmtAmt / instAmt) * 100;
    const limitAmt = Math.floor(instAmt * window.MGMT_RATIO_LIMIT);
    const over = !window.checkMgmtRatio(instAmt, mgmtAmt);
    const cls = over ? 'text-danger fw-bold' : 'text-muted';
    return `<span class="${cls}">비율 ${pct.toFixed(1)}% · 한도 ${window.fmt(limitAmt)}원${over ? ' ⚠초과' : ''}</span>`;
};

// 💡 강사료/수용비 입력칸에 입력하는 즉시(oninput) 같은 행의 비율 미리보기를 갱신한다.
//    data-ratio-inst / data-ratio-mgmt 속성으로 짝을 찾으므로, 부서마스터·강좌요금표 두 표에서 공용으로 쓸 수 있다.
window.updateMgmtRatioPreview = function (el) {
    const tr = el.closest('tr'); if (!tr) return;
    const instEl = tr.querySelector('[data-ratio-inst]');
    const mgmtEl = tr.querySelector('[data-ratio-mgmt]');
    const previewEl = tr.querySelector('.mgmt-ratio-preview');
    if (!instEl || !mgmtEl || !previewEl) return;
    previewEl.innerHTML = window.mgmtRatioPreviewText(instEl.value, mgmtEl.value);
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


window.exportAsExcel = function(tableId, title) {
    const el = window.$(tableId); if (!el) return window.showAlert('데이터가 없습니다.');

    // 💡 엑셀 저장 시에만 "학적"(예: 1-1-1) 열을 학년/반/번호 3개 열로 분리한다.
    //    화면 표시에는 영향 없도록, 화면 밖에 임시로 만든 복제본에서만 변형한 뒤 바로 제거한다.
    //    (참고: SheetJS의 table_to_book은 "1-1-1" 같은 텍스트를 날짜로 오인식하는데,
    //     학년/반/번호로 쪼개 순수 숫자로 만들면 이 오인식도 함께 사라진다)
    const clone = el.cloneNode(true);
    clone.style.position = 'absolute'; clone.style.left = '-99999px';
    document.body.appendChild(clone);

    clone.querySelectorAll('[data-col="dp"]').forEach(cell => {
        const tag = cell.tagName.toLowerCase();
        const rowspan = cell.getAttribute('rowspan');
        const values = tag === 'th' ? ['학년', '반', '번호'] : cell.textContent.trim().split('-');
        const frag = document.createDocumentFragment();
        values.forEach(v => {
            const nc = document.createElement(tag);
            if (rowspan) nc.setAttribute('rowspan', rowspan);
            nc.textContent = v;
            frag.appendChild(nc);
        });
        cell.replaceWith(frag);
    });

    const wb = XLSX.utils.table_to_book(clone, {sheet: "정산내역", display: true});
    document.body.removeChild(clone);
    XLSX.writeFile(wb, `${title}_${new Date().toISOString().slice(0,10)}.xlsx`);
};
window.printElement = function(tableId, title) { const el = window.$(tableId); if(!el) return window.showAlert('데이터가 없습니다.'); const win = window.open('', '_blank', 'width=1000,height=800'); const bsHref = new URL('vendor/bootstrap/bootstrap.min.css', location.href).href; win.document.write('<html><head><title>인쇄 - ' + title + '</title>'); win.document.write('<link href="' + bsHref + '" rel="stylesheet">'); win.document.write('<style>body{padding:20px; font-family:"Malgun Gothic",sans-serif;} table{width:100%; border-collapse:collapse; text-align:center; font-size:12px;} th,td{border:1px solid #000; padding:4px;} th{background-color:#f1f3f5 !important; font-weight:bold; -webkit-print-color-adjust:exact;} h3 { font-size: 18px !important; margin-bottom: 15px !important; }</style>'); win.document.write('</head><body><h3 style="font-weight:bold; text-align:center;">' + title + '</h3>'); win.document.write(el.outerHTML); win.document.write('</body></html>'); win.document.close(); win.focus(); setTimeout(() => { win.print(); win.close(); }, 800); };

window.exportCurrentStep4 = function() { const activeTabBtn = document.querySelector('#s4SubTabs .nav-link.active'); if(!activeTabBtn) return; const targetId = activeTabBtn.getAttribute('data-bs-target').replace('#', ''); const title = '4스텝_' + activeTabBtn.innerText.trim().replace(/[^가-힣a-zA-Z0-9]/g, '_'); window.exportAsExcel(targetId, title); };
window.exportModalView = function(type, targetId) { let title = '상세명세서'; if(targetId === 'mdlStuConsoleBody' && window.$('consoleTitle')) { title = window.$('consoleTitle').innerText.trim().replace(/[^가-힣a-zA-Z0-9]/g, '_'); } if(targetId === 'mdlCourseSummaryBody' && window.$('crsSummaryTitle')) { title = window.$('crsSummaryTitle').innerText.trim().replace(/[^가-힣a-zA-Z0-9]/g, '_'); } if (type === 'EXCEL') window.exportAsExcel(targetId, title); else if (type === 'IMAGE') window.exportAsImage(targetId, title); else if (type === 'PRINT') window.printElement(targetId, title); };

window.getExceptionBadges = function(eObj) {
    let badges = [];
    if (eObj.adjusts && eObj.adjusts.length > 0) { eObj.adjusts.forEach(adj => { if (!adj.title.includes('[예외설정]')) badges.push(`<span class="badge bg-warning text-dark border border-warning">조정:${adj.title}</span>`); }); }
    if (eObj.refunds && eObj.refunds.length > 0) { eObj.refunds.forEach(ref => badges.push(`<span class="badge bg-danger text-white border border-danger">환불:${window.refTyName(ref)}</span>`)); }
    if (badges.length === 0) return '';
    return `<div class="exception-container d-flex flex-wrap gap-1">${badges.join('')}</div>`;
};

// 💡 조정/환불로 실부담 수강료·교재비·재료비가 바뀐 학생을, 그 바뀐 금액칸 바로 아래에
// 작은 뱃지로 표시. 학생콘솔·강좌콘솔 양쪽에서 공유하는 공용 로직(강좌콘솔이 먼저 갖고
// 있던 "이름 아래 조정 뱃지"를 두 화면 모두, 해당 금액칸으로 옮기고 환불도 함께 반영).
window.buildAmountBadges = function(e, key) {
    const adjAmt = (e.adjusts || []).filter(a => !a.title.includes('[예외설정]')).reduce((s, a) => s + (a['amt' + key] || 0), 0);
    const refAmt = (e.refunds || []).reduce((s, r) => s + (r['r' + key.toLowerCase()] || 0), 0);
    if (adjAmt === 0 && refAmt === 0) return '';
    let html = '';
    if (adjAmt !== 0) {
        const cls = adjAmt < 0 ? 'bg-danger bg-opacity-10 text-danger border border-danger' : 'bg-primary bg-opacity-10 text-primary border border-primary';
        html += `<span class="badge ${cls} py-0 px-1">조정${adjAmt > 0 ? '+' : ''}${window.fmt(adjAmt)}</span>`;
    }
    if (refAmt !== 0) {
        html += `<span class="badge bg-danger bg-opacity-10 text-danger border border-danger py-0 px-1">환불-${window.fmt(refAmt)}</span>`;
    }
    return `<div class="d-flex flex-wrap justify-content-center gap-1 mt-1" style="font-size:0.65rem; line-height:1.3;">${html}</div>`;
};

window.toggleAllE = function(el) { document.querySelectorAll('.row-chk').forEach(c => { if(!c.disabled) c.checked = el.checked; }); };
window.toggleAllCourseStu = function(el) { document.querySelectorAll('.crs-stu-chk').forEach(chk => { if(!chk.disabled) chk.checked = el.checked; }); if (typeof window.previewBulkRef === 'function') window.previewBulkRef(); };

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
    if(window.$('tbStuDtlHead')) window.$('tbStuDtlHead').innerHTML = `<tr><th rowspan="2" class="clickable text-dark" data-col="dp" onclick="window.sortStu('DP')">학적 <span id="sort_DP"><i class="bi bi-arrow-down-up text-muted opacity-50"></i></span></th><th rowspan="2" class="clickable text-dark" data-col="nm" onclick="window.sortStu('NM')">이름 <span id="sort_NM"><i class="bi bi-arrow-down-up text-muted opacity-50"></i></span></th><th rowspan="2">대상</th><th colspan="2">지원금 잔여</th><th rowspan="2">분기</th><th rowspan="2">강좌명</th><th colspan="${cSpan}" class="table-warning">실부담금(지원전)</th><th colspan="${cSpan}" class="bg-cho3">초3 공제</th><th colspan="${cSpan}" class="bg-free">자유 공제</th><th colspan="${cSpan}" class="table-danger fw-bold align-middle">최종징수(자부담)</th><th rowspan="2" class="table-secondary align-middle" style="min-width:160px;">산출근거${exFilterHtml1}</th></tr><tr><th class="clickable text-primary" onclick="window.sortStu('C')">초3잔액 <span id="sort_C"><i class="bi bi-arrow-down-up text-muted opacity-50"></i></span></th><th class="clickable text-success" onclick="window.sortStu('F')">자유잔액 <span id="sort_F"><i class="bi bi-arrow-down-up text-muted opacity-50"></i></span></th><th class="table-warning">수강료</th><th class="table-warning">교재비</th>${hM_T}<th class="bg-cho3">수강료</th><th class="bg-cho3">교재비</th>${hM_C}<th class="bg-free">수강료</th><th class="bg-free">교재비</th>${hM_F}<th class="table-danger text-danger">수강료</th><th class="table-danger text-danger">교재비</th>${hM_R}</tr>`;
    
    if(window.$('tbCrseDtlCols')) window.$('tbCrseDtlCols').innerHTML = window.buildCrseDtlColgroup(is3D);
    if(window.$('tbCrseDtlHead')) window.$('tbCrseDtlHead').innerHTML = `<tr><th rowspan="2">분기</th><th rowspan="2" data-col="dp">학적</th><th rowspan="2">이름</th><th rowspan="2">대상</th><th rowspan="2">강좌명</th><th colspan="${cSpan}" class="table-warning">실부담금(지원전)</th><th colspan="${cSpan}" class="bg-cho3">초3 공제</th><th colspan="${cSpan}" class="bg-free">자유 공제</th><th colspan="${cSpan}" class="table-danger fw-bold align-middle">최종징수(자부담)</th><th rowspan="2" class="table-secondary align-middle" style="min-width:160px;">산출근거${exFilterHtml2}</th></tr><tr><th class="table-warning">수강료</th><th class="table-warning">교재비</th>${hM_T}<th class="bg-cho3">수강료</th><th class="bg-cho3">교재비</th>${hM_C}<th class="bg-free">수강료</th><th class="bg-free">교재비</th>${hM_F}<th class="table-danger text-danger">수강료</th><th class="table-danger text-danger">교재비</th>${hM_R}</tr>`;
};

window.sortStu = function(col) { if (window.sortState.col === col) window.sortState.asc = !window.sortState.asc; else { window.sortState.col = col; window.sortState.asc = true; } window.renderSetTabs(); };

// 가상 데이터 샌드박스 생성기 (실제 시스템의 이월 Validation 완벽 모방 적용)
window.generateDummyData = function(is3D = false) {
    try {
        window.C = {}; window.M = {}; window.F = []; window.E = []; 
        
        // 3D 모드일 경우 가상의 재료비 금액을 세팅하는 헬퍼 함수
        const mVal = (val) => is3D ? val : 0;

        // 1. 부서 마스터 세팅
        // 💡 실제 시스템에서 부서 정보(개별 등록·엑셀 업로드)는 항상 1~4분기가 동일하게 채워지므로,
        //    샌드박스도 그 규칙을 그대로 따르도록 4개 분기 모두 채워둔다. (학생 명단(E)만 3·4분기를
        //    비워 가볍게 유지하며, 이는 부서 마스터와 무관한 별도의 경량화 조치다.)
        const deptBase = {
            '로봇과학': {cnt:2,inst_m:35000,mgmt_m:2000,b:40000,m:mVal(20000),unit:1,mh:'4,4,4'},
            '생명과학': {cnt:2,inst_m:38000,mgmt_m:2000,b:45000,m:mVal(25000),unit:1,mh:'4,4,4'},
            '컴퓨터교실': {cnt:2,inst_m:30000,mgmt_m:1000,b:15000,m:mVal(10000),unit:1,mh:'4,4,4'},
            '창의미술': {cnt:2,inst_m:40000,mgmt_m:2000,b:35000,m:mVal(30000),unit:1,mh:'4,4,4'},
            '바둑교실': {cnt:2,inst_m:32000,mgmt_m:1000,b:20000,m:mVal(5000),unit:1,mh:'4,4,4'},
            // 💡 "폐강" 자체는 튜토리얼에서 사용자가 1스텝 운영 체크를 직접 해제해서 체험하도록, 4개 분기 모두 정상 운영 상태로 둔다.
            '가상마술': {cnt:2,inst_m:35000,mgmt_m:1000,b:25000,m:mVal(15000),unit:1,mh:'4,4,4'}
        };
        window.M = {};
        Object.keys(deptBase).forEach(dept => {
            window.M[dept] = { 1:{...deptBase[dept]}, 2:{...deptBase[dept]}, 3:{...deptBase[dept]}, 4:{...deptBase[dept]} };
        });
        
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

/* ==========================================================================
   시작 업데이트 알림 (2026-09-17)

   업데이트 소식과 "그래서 내 장부 금액이 어떻게 됐나"를 한 창에서 보여준다.
   화면 최상단을 흐르던 띠 배너(티커)를 없애고 이리로 통합했다 — 둘이 서로 다른 곳에
   흩어져 있으면 정작 중요한 금액 변동을 놓치기 쉬웠기 때문이다.

   [언제 자동으로 뜨나] 마지막으로 본 버전 ≠ 현재 버전, 즉 업데이트 후 첫 접속 때 1회.
   같은 버전에서 다시 열면 뜨지 않는다(헤더 [업데이트] 버튼으로는 언제든 열 수 있다).
   ⚠ 매번 띄우면 안 된다. 공지는 기본 14일간 노출돼서 평상시에도 활성 공지가 늘 몇 건 있고,
     그러면 이 창이 거의 매일 뜨는데 '금액 영향' 칸은 대개 "변경 사항 없습니다"가 된다.
     2주면 [확인]을 반사적으로 누르는 습관이 생기고, 정작 금액이 달라졌을 때도 그냥 넘긴다.
     (app-core.js의 dirtySinceBackup 주석과 같은 원칙 — 진짜일 때만 띄워야 경고가 힘을 갖는다.)

   감지 로직 자체는 app-engine.js(captureComputedFingerprint / diffComputedFingerprint)에 있고,
   여기는 화면 표시와 엑셀 내보내기만 둔다.
   ========================================================================== */

window.pendingCalcChanges = null;   // 이번에 보고할 변경 내역(엑셀 내보내기에서 재사용)
window.showAllUpdates = false;      // 업데이트 목록을 전체 펼쳤는지(기본: 최근 것만)

const UPDATE_LIST_SHOW = 6;

// 업데이트 목록과 [전체보기/접기] 버튼을 현재 상태에 맞춰 그린다.
function renderUpdateList() {
    const ul = window.$('calcChangedUpdates');
    const btn = window.$('calcChangedMoreBtn');
    if (!ul) return;

    // 접힌 상태는 '노출 기간 안에 있는' 공지만, 펼친 상태는 만료된 것까지 전부(이력 겸용).
    const active = (typeof window.getActiveUpdates === 'function') ? window.getActiveUpdates() : [];
    const all = (window.APP_UPDATES || [])
        .map((item, i) => ({ item, i }))
        .sort((a, b) => (new Date(b.item.date) - new Date(a.item.date)) || (b.i - a.i))
        .map(({ item }) => item);

    const list = window.showAllUpdates ? all : active.slice(0, UPDATE_LIST_SHOW);

    ul.innerHTML = list.length === 0
        ? '<li class="list-group-item text-muted text-center small">최근 새 소식은 없습니다.</li>'
        : list.map(item => `
            <li class="list-group-item py-2">
                <div class="small text-muted fw-bold mb-1">${window.escHtml(item.date)}</div>
                <div class="small">${window.escHtml(item.message)}</div>
            </li>`).join('');

    if (btn) {
        btn.innerHTML = window.showAllUpdates
            ? '<i class="bi bi-chevron-up"></i> 최근 소식만 보기'
            : `<i class="bi bi-clock-history"></i> 지난 업데이트 전체보기 (${all.length}건)`;
    }
}

// [전체보기] ↔ [접기]. 목록만 다시 그리므로 창이 닫히거나 스크롤이 튀지 않는다.
window.toggleUpdateListAll = function() {
    window.showAllUpdates = !window.showAllUpdates;
    renderUpdateList();
};

// 앱 시작 시 1회 호출. autoRunSet이 끝나 window.Hs가 채워진 뒤여야 한다.
window.checkCalcResultChanged = function() {
    if (typeof window.captureComputedFingerprint !== 'function') return;
    if (!window.Hs || window.Hs.length === 0) return;          // 빈 장부면 비교할 게 없다
    if (window.SysSet && window.SysSet.isSandbox) return;      // 튜토리얼은 가상 데이터라 제외

    const current = window.captureComputedFingerprint();
    // ⚠ window.lastComputed가 아니라 loadedComputed를 본다. 부팅 중 setQTab이
    //   commitState를 거치면서 lastComputed를 이미 새 값으로 덮어썼기 때문이다.
    const saved = window.loadedComputed;

    // 기록이 없으면(이 기능 도입 전 장부 / 첫 실행) 조용히 기준점만 잡는다.
    if (!saved || !saved.rows) {
        window.lastComputed = current;
        if (typeof window.save === 'function') window.save();
        return;
    }

    const changes = window.diffComputedFingerprint(saved, current);
    const versionChanged = (saved.ver || '') !== (window.APP_VERSION || '');

    // 금액도 그대로고 버전도 그대로면 알릴 것이 없다.
    if (changes.length === 0 && !versionChanged) return;

    window.pendingCalcChanges = { saved, current, changes };

    if (changes.length === 0) {
        // 업데이트는 됐지만 금액은 그대로 — 소식만 전하고 기준을 최신으로 갱신한다.
        window.lastComputed = current;
        if (typeof window.save === 'function') window.save();
    }
    window.renderCalcChangeModal();
};

// 헤더 [업데이트] 버튼 — 언제든 같은 창을 연다(자동으로 뜨지 않는 날에도 볼 수 있게).
window.openUpdateModal = function() {
    if (!window.pendingCalcChanges) {
        const cur = (typeof window.captureComputedFingerprint === 'function' && window.Hs && window.Hs.length)
            ? window.captureComputedFingerprint() : null;
        window.pendingCalcChanges = { saved: window.loadedComputed || { ver: window.APP_VERSION }, current: cur, changes: [] };
    }
    window.renderCalcChangeModal();
};

window.renderCalcChangeModal = function() {
    const p = window.pendingCalcChanges;
    if (!p) return;
    window.showAllUpdates = false;   // 창을 열 때는 항상 접힌 상태로 시작
    const { saved, changes } = p;
    const hasChanges = changes.length > 0;

    // ── 제목/머리 색: 금액이 걸린 창과 단순 소식을 한눈에 구분되게 ──
    const header = window.$('calcChangedHeader');
    const title = window.$('calcChangedTitle');
    const closeBtn = window.$('calcChangedClose');
    if (header) header.className = `modal-header text-white py-2 ${hasChanges ? 'bg-danger' : 'bg-primary'}`;
    if (title) {
        const verTxt = (saved.ver && saved.ver !== window.APP_VERSION)
            ? `v${window.escHtml(saved.ver)} → v${window.escHtml(window.APP_VERSION)}`
            : `v${window.escHtml(window.APP_VERSION)}`;
        title.innerHTML = hasChanges
            ? `<i class="bi bi-exclamation-triangle-fill"></i> 시스템 업데이트로 계산 결과가 달라졌습니다 (${verTxt})`
            : `<i class="bi bi-bell-fill"></i> 시스템이 업데이트되었습니다 (${verTxt})`;
    }
    // 금액이 걸렸으면 무심코 닫을 수 없게 한다 — X를 숨기고 바깥클릭/ESC를 막는다.
    // [확인했습니다]를 누르는 것이 곧 "새 금액을 기준으로 삼는다"는 처리이기도 하다.
    if (closeBtn) closeBtn.style.display = hasChanges ? 'none' : '';
    const modalEl = window.$('mdlCalcChanged');
    if (modalEl) {
        modalEl.setAttribute('data-bs-backdrop', hasChanges ? 'static' : 'true');
        modalEl.setAttribute('data-bs-keyboard', hasChanges ? 'false' : 'true');
        // 부트스트랩은 인스턴스를 만들 때 옵션을 읽으므로, 바뀌었으면 인스턴스를 다시 만든다.
        if (window.mdlCalcChangedInst) { window.mdlCalcChangedInst.dispose(); window.mdlCalcChangedInst = null; }
    }

    // ── (2) 이번 업데이트 내용 ──
    // 공지는 기본 14일간 노출되어 스무 건씩 쌓인다. 창을 다 덮지 않도록 기본은 최근 것만 보여주고,
    // [전체보기]를 누르면 만료된 것까지 포함해 같은 자리에서 펼친다.
    // ⚠ 별도 모달로 띄우지 않는다 — 부트스트랩 모달을 겹쳐 열면 z-index가 같아(둘 다 1055)
    //   나중에 연 창이 오히려 뒤에 깔리고, backdrop이 2겹으로 쌓여 화면이 계속 어두워진다.
    renderUpdateList();

    // ── (1) 내 장부에 미친 영향 ──
    const noneBox = window.$('calcChangedNone');
    const detailBox = window.$('calcChangedDetail');
    const excelBtn = window.$('calcChangedExcelBtn');
    if (noneBox) noneBox.style.display = hasChanges ? 'none' : '';
    if (detailBox) detailBox.style.display = hasChanges ? '' : 'none';
    if (excelBtn) excelBtn.style.display = hasChanges ? '' : 'none';

    if (hasChanges) {
        const sum = k => changes.reduce((a, r) => a + r[k], 0);
        const sign = v => (v > 0 ? '+' : '') + window.fmt(v);
        const students = new Set(changes.map(r => r.id)).size;

        const el = window.$('calcChangedSummary');
        if (el) {
            el.innerHTML =
                `학생 <strong>${students}명</strong> / 강좌 <strong>${changes.length}건</strong>의 금액이 달라졌습니다.<br>` +
                `합계 변화 — 초3 <strong>${sign(sum('cho3Delta'))}원</strong> · 자유수강권 <strong>${sign(sum('freeDelta'))}원</strong> · ` +
                `학생 자부담 <strong class="text-danger">${sign(sum('selfDelta'))}원</strong>` +
                (saved.at ? `<br><span class="text-muted">이전 기록 시점: ${new Date(saved.at).toLocaleString('ko-KR')}</span>` : '');
        }

        // 한 행에 초3/자유/자부담을 이전·변경·차이 3열씩 나란히 둔다.
        const cell = (before, after) => {
            const d = after - before;
            const cls = d === 0 ? 'text-muted' : (d > 0 ? 'text-danger fw-bold' : 'text-primary fw-bold');
            return `<td>${window.fmt(before)}</td><td>${window.fmt(after)}</td>` +
                   `<td class="${cls}">${d === 0 ? '-' : sign(d)}</td>`;
        };
        const body = window.$('calcChangedBody');
        if (body) {
            body.innerHTML = changes.map(r => {
                const b = r.before, a = r.after;
                return `<tr>
                    <td>${window.escHtml(r.dp)}</td>
                    <td class="fw-bold">${window.escHtml(r.nm)}</td>
                    <td>${r.q}분기</td>
                    <td class="text-start">${window.escHtml(r.course)}</td>
                    ${cell(b[0] + b[1] + b[2], a[0] + a[1] + a[2])}
                    ${cell(b[3] + b[4] + b[5], a[3] + a[4] + a[5])}
                    ${cell(b[6] + b[7] + b[8], a[6] + a[7] + a[8])}
                </tr>`;
            }).join('');
        }
    }

    // ⚠ 변수 이름에 주의. 브라우저는 id를 가진 요소를 같은 이름의 전역(window.mdlCalcChanged)
    //   으로도 노출한다. 그래서 모달 인스턴스를 같은 이름에 담으려 하면, 이미 '요소'가 들어
    //   있어서 생성 조건을 건너뛰고 요소의 .show()를 부르다 터진다. 이름을 분리한다.
    if (!window.mdlCalcChangedInst && typeof bootstrap !== 'undefined' && modalEl) {
        window.mdlCalcChangedInst = new bootstrap.Modal(modalEl);
    }
    if (window.mdlCalcChangedInst) window.mdlCalcChangedInst.show();
};

// [확인했습니다] — 이제부터는 새 결과를 기준으로 삼는다.
window.acknowledgeCalcChange = function() {
    const p = window.pendingCalcChanges;
    window.pendingCalcChanges = null;
    if (!p || !p.current) return;
    if (p.changes.length === 0) return;   // 소식만 본 경우는 이미 기준이 갱신돼 있다
    window.lastComputed = p.current;
    if (typeof window.save === 'function') window.save();
    if (typeof window.showToast === 'function') {
        window.showToast('변경 내역을 확인 처리했습니다. 다음 업데이트부터 다시 비교합니다.');
    }
};

// 변경 내역을 엑셀로. 항목별(수강료/교재비/재료비)까지 펼쳐서 감사 근거로 쓸 수 있게 한다.
window.exportCalcChangeReport = function() {
    const p = window.pendingCalcChanges;
    if (!p || !p.changes.length || typeof XLSX === 'undefined') return window.showAlert('내보낼 변경 내역이 없습니다.');
    const { saved, changes } = p;

    const rows = changes.map(r => {
        const b = r.before, a = r.after;
        const trio = (i0, i1, i2) => [b[i0] + b[i1] + b[i2], a[i0] + a[i1] + a[i2]];
        const [cB, cA] = trio(0, 1, 2), [fB, fA] = trio(3, 4, 5), [sB, sA] = trio(6, 7, 8);
        return {
            '학적': r.dp, '이름': r.nm, '분기': `${r.q}분기`, '강좌명': r.course,
            '초3(이전)': cB, '초3(변경)': cA, '초3(차이)': cA - cB,
            '자유(이전)': fB, '자유(변경)': fA, '자유(차이)': fA - fB,
            '자부담(이전)': sB, '자부담(변경)': sA, '자부담(차이)': sA - sB,
            '초3수강료(이전)': b[0], '초3수강료(변경)': a[0],
            '초3교재비(이전)': b[1], '초3교재비(변경)': a[1],
            '초3재료비(이전)': b[2], '초3재료비(변경)': a[2],
            '자유수강료(이전)': b[3], '자유수강료(변경)': a[3],
            '자유교재비(이전)': b[4], '자유교재비(변경)': a[4],
            '자유재료비(이전)': b[5], '자유재료비(변경)': a[5],
            '자부담수강료(이전)': b[6], '자부담수강료(변경)': a[6],
            '자부담교재비(이전)': b[7], '자부담교재비(변경)': a[7],
            '자부담재료비(이전)': b[8], '자부담재료비(변경)': a[8],
        };
    });

    const info = [
        { '항목': '이전 버전', '값': saved.ver || '(기록 없음)' },
        { '항목': '현재 버전', '값': window.APP_VERSION },
        { '항목': '이전 기록 시점', '값': saved.at ? new Date(saved.at).toLocaleString('ko-KR') : '(기록 없음)' },
        { '항목': '확인 시점', '값': new Date().toLocaleString('ko-KR') },
        { '항목': '금액이 바뀐 학생 수', '값': new Set(changes.map(r => r.id)).size },
        { '항목': '금액이 바뀐 강좌 건수', '값': changes.length },
        { '항목': '초3 합계 변화', '값': changes.reduce((a, r) => a + r.cho3Delta, 0) },
        { '항목': '자유수강권 합계 변화', '값': changes.reduce((a, r) => a + r.freeDelta, 0) },
        { '항목': '학생 자부담 합계 변화', '값': changes.reduce((a, r) => a + r.selfDelta, 0) },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(info), '요약');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), '변경내역');
    XLSX.writeFile(wb, `계산결과_변경내역_${new Date().toISOString().slice(0, 10)}.xlsx`);
};
