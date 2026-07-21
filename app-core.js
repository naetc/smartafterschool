/* ==========================================================================
   파일닉네임: app-core.js
   기능설명: 시스템 전역 변수 선언, 코어 상태 관리 및 라이프사이클 부트스트랩
   ========================================================================== */
'use strict';

// 1. 코어 유틸리티 전역 바인딩
window.$  = id => document.getElementById(id);
window.val = id => window.$(id)?.value.trim() || '';
window.num = v  => parseInt(String(v).replace(/,/g,'')) || 0;
window.fmt = n  => Number(n||0).toLocaleString();
window.uid = (g,b,n,nm) => `${+g||0}-${+b||0}-${+n||0}-${String(nm||'').replace(/\s+/g, '')}`;
window.dsp = (g,b,n)    => `${+g||0}-${+b||0}-${+n||0}`;
window.APP_VERSION = (function() {
    const script = document.querySelector('script[src*="app-core.js"]');
    if (script && script.src.includes('?v=')) return script.src.split('?v=')[1].split('&')[0];
    return 'Dev';
})();

// 2. 시스템 상태 및 비즈니스 데이터 저장소 선언
window.C = {}; window.M = {}; window.F = []; window.E = []; window.Ld = {}; window.Hs = [];

// 2-1. 예산 기본값 상수 (core-rules.md 제1조 '주머니 이론'의 기본 한도).
//      app-engine.js(연산)와 app-ui-steps.js(전입생 입력 UI)가 함께 참조하는 단일 소스.
window.BUDGET = {
    CHO3_ANNUAL: 500000,   // 초3 지원금 연간 총액 기본값
    CHO3_H1_CAP: 250000,   // 초3 지원금 상반기(1~2분기) 한도
    FREE_ANNUAL: 600000    // 자유수강권 연간 총액 기본값
};

// 2-2. 수용비는 강사료의 5%를 초과할 수 없다는 행정 규정의 한도값 (단일 소스).
window.MGMT_RATIO_LIMIT = 0.05;

// 3. UI 필터링 및 네비게이션 제어 변수
window.f_eq = '1'; window.f_ec = 'ALL'; window.s4_filt = 'A'; window.s4_cFilter = 'ALL';
window.curS4Tab = 'STU'; window.s4_sessFilter = 'ALL'; window.s4_chkAdj = false;
window.s4_chkRef = false; window.s4_chkDed = false; window.sortState = { col: 'DP', asc: true };

// 4. 모달 인스턴스 핸들러
window.mdlConsole = null; window.mdlCrsSummary = null; window.mdlFreeStart = null;
window.mdlUpload = null; window.mdlWelcome = null; window.mdlSettings = null; window.mdlToast = null;

// 5. 거래 키 및 변수 관리
window.KEY = 'bgh_260628';
window.gQ = 1; window.cUid = ''; window.cEnrolls = []; window.cActiveEIdx = -1;
window.curEditFreeIdx = -1; window.lastSaved = null; window.pendingEnrollData = [];
window.SysSet = { closedSess: {}, cho3Priority: 'T,B', freePriority: 'T,B', deductMode: 'ITEM_FIRST', accType: 'INTEGRATED', useMaterialFee: false };

// 6. 상태 변경 파이프라인
function snapshotState() {
    return JSON.stringify({ C:window.C, M:window.M, F:window.F, E:window.E, SysSet:window.SysSet });
}

// 💡 되돌리기(실행취소)용 단일 슬롯. 스택이 아니라 "직전 동작 1건"만 기억한다.
//    깊은 스택으로 만들면 여러 번 눌렀을 때 분기 마감(SysSet.closedSess) 시점 이전까지
//    되감겨 마감이 우회될 위험이 있어, 의도적으로 1단계로 제한했다.
window.undoSnapshot = null;
window.undoLabel = ''; // 💡 스냅샷을 찍을 당시 어떤 작업이었는지 짧은 설명. 되돌리기 확인창에 노출한다.

window.commitState = function(actionCallback, customData = null, label = '') {
    const preSnapshot = snapshotState();
    if (actionCallback) actionCallback();
    window.E.forEach(e => { if (typeof window.recalcEnrollment === 'function') window.recalcEnrollment(e); });
    if (typeof window.autoRunSet === 'function') window.autoRunSet(true);

    // 실제로 데이터가 바뀐 경우에만 되돌리기 슬롯을 갱신한다.
    // (예: 분기 탭 전환처럼 재연산만 하고 실제 변경은 없는 commitState 호출이
    //  직전의 의미 있는 편집을 덮어써 버리는 것을 방지)
    if (snapshotState() !== preSnapshot) {
        window.undoSnapshot = preSnapshot;
        window.undoLabel = label || '직전 작업';
        if (typeof window.updateUndoButton === 'function') window.updateUndoButton();
    }

    if (typeof window.save === 'function') window.save();
    window.renderAll(customData);
};

window.undoLastAction = async function() {
    if (!window.undoSnapshot) {
        if (typeof window.showToast === 'function') window.showToast('되돌릴 수 있는 데이터가 없습니다.');
        return;
    }
    // 💡 실행 전에 "무엇을" 되돌리는지 먼저 보여주고 사용자가 직접 결정하게 한다.
    //    한참 전에 해둔 작업이 되돌리기 대상으로 남아있는 채 다른 화면을 보다가
    //    무심코 눌렀을 때, 뭘 잃는지도 모르고 되돌려지는 상황을 막기 위함.
    const labelText = window.undoLabel || '직전 작업';
    if (!(await window.showConfirm(`되돌릴 작업: "${labelText}"\n\n이 작업 이전 상태로 되돌리시겠습니까?`))) return;

    const d = JSON.parse(window.undoSnapshot);
    window.C = d.C; window.M = d.M; window.F = d.F; window.E = d.E; window.SysSet = d.SysSet;
    window.undoSnapshot = null; window.undoLabel = '';

    window.E.forEach(e => { if (typeof window.recalcEnrollment === 'function') window.recalcEnrollment(e); });
    if (typeof window.autoRunSet === 'function') window.autoRunSet(true);
    if (typeof window.save === 'function') window.save();
    window.renderAll();
    if (typeof window.updateUndoButton === 'function') window.updateUndoButton();
    if (typeof window.showToast === 'function') window.showToast(`"${labelText}" 작업을 되돌렸어요.`);
};

window.updateUndoButton = function() {
    const btn = window.$('btnUndo');
    if (!btn) return;
    // 💡 disabled 속성을 쓰면 클릭 이벤트 자체가 막혀서 "되돌릴 게 없다"는 토스트를
    //    띄울 수 없으므로, 시각적으로만 흐리게 하고 클릭은 항상 받는다.
    btn.classList.toggle('opacity-50', !window.undoSnapshot);
    btn.title = window.undoSnapshot ? `되돌리기: ${window.undoLabel}` : '되돌릴 작업이 없습니다';
};

// 7. 모듈별 UI 통합 재렌더링 트리거
window.renderAll = function(customData = null) {
    if (typeof window.updateSettingsBadge === 'function') window.updateSettingsBadge();
    if (typeof window.renderM === 'function') window.renderM();
    if (typeof window.renderC === 'function') window.renderC();
    if (typeof window.renderF === 'function') window.renderF();
    if (typeof window.renderE === 'function') window.renderE();
    if (typeof window.renderSetTabs === 'function') window.renderSetTabs();
    if (window.mdlConsole && window.mdlConsole._isShown && typeof window.renderConsole === 'function') window.renderConsole();
    if (window.mdlCrsSummary && window.mdlCrsSummary._isShown && typeof window.renderCourseModalBody === 'function') window.renderCourseModalBody(customData?.savedUids || []);
};

// 8. 분기 탭 제어 시스템
window.setQTab = function(q) {
    window.gQ = q;
    [1,2,3,4].forEach(i => window.$('btnQTab'+i)?.classList.remove('active'));
    window.$('btnQTab'+q)?.classList.add('active');
    ['exEnQ', 's4_q', 'e_q'].forEach(id => { if(window.$(id)) window.$(id).value = String(q); });
    window.f_eq = String(q);
    if(window.$('lblMasterTab')) window.$('lblMasterTab').innerHTML = `<i class="bi bi-building"></i> [${q}분기] 부서 마스터`;
    if(window.$('lblCourseTab')) window.$('lblCourseTab').innerHTML = `<i class="bi bi-list-check"></i> [${q}분기] 강좌 요금표`;
    window.commitState(() => { if (typeof window.regenerateC === 'function') window.regenerateC(); }, null, '분기 탭 전환');
    if (typeof window.initStep5 === 'function') window.initStep5();
};

// 9. 환경설정 및 회계 유형 제어
window.tempAccType = 'INTEGRATED';

window.previewAccType = function(type) {
    window.tempAccType = type;
    const cardInt = window.$('card_acc_int'); const cardSep = window.$('card_acc_sep'); const confirmBtn = window.$('btn_confirm_acc_type');
    if (type === 'INTEGRATED') {
        cardInt.classList.add('border-primary', 'acc-type-selected'); cardInt.querySelector('.card-title').classList.replace('text-secondary', 'text-primary');
        cardSep.classList.remove('border-primary', 'acc-type-selected'); cardSep.querySelector('.card-title').classList.replace('text-primary', 'text-secondary');
        confirmBtn.className = 'btn btn-primary btn-lg px-5 fw-bold shadow-sm'; confirmBtn.innerHTML = `<i class="bi bi-check-circle"></i> "교재통합형(2단)"으로 실무 시작하기`;
    } else {
        cardSep.classList.add('border-primary', 'acc-type-selected'); cardSep.querySelector('.card-title').classList.replace('text-secondary', 'text-primary');
        cardInt.classList.remove('border-primary', 'acc-type-selected'); cardInt.querySelector('.card-title').classList.replace('text-primary', 'text-secondary');
        confirmBtn.className = 'btn btn-dark btn-lg px-5 fw-bold shadow-sm'; confirmBtn.innerHTML = `<i class="bi bi-check-circle"></i> "교재분리형(3단)"으로 실무 시작하기`;
    }
};

window.renderPriorityOptions = function(containerId, name, checkedVal) {
    const is3D = window.SysSet.accType === 'SEPARATED';
    const opts2D = [ { v: 'T,B', l: '수강료 ➔ 교재비' }, { v: 'B,T', l: '교재비 ➔ 수강료' }, { v: 'T', l: '<span class="text-danger">수강료 전용 (교재비 공제 불가)</span>' } ];
    const opts3D = [ { v: 'T,B,M', l: '수강료 ➔ 교재비 ➔ 재료비' }, { v: 'T,M,B', l: '수강료 ➔ 재료비 ➔ 교재비' }, { v: 'B,M,T', l: '교재비 ➔ 재료비 ➔ 수강료' }, { v: 'M,B,T', l: '재료비 ➔ 교재비 ➔ 수강료' }, { v: 'T', l: '<span class="text-danger">수강료 전용</span>' } ];
    let html = ''; const arr = is3D ? opts3D : opts2D;
    arr.forEach((opt, idx) => {
        const id = `${name}_${idx}`; const isChecked = checkedVal === opt.v ? 'checked' : '';
        html += `<div class="form-check mb-2"><input class="form-check-input" type="radio" name="${name}" value="${opt.v}" id="${id}" ${isChecked}> <label class="form-check-label fw-bold" for="${id}">${opt.l}</label></div>`;
    });
    window.$(containerId).innerHTML = html;
};

window.openSettings = function() {
    const dM = window.SysSet.deductMode || 'ITEM_FIRST';
    document.querySelectorAll('input[name="optDeductMode"]').forEach(el => { el.checked = (el.value === dM); });
    window.renderPriorityOptions('cho3SettingGroup', 'optCho3', window.SysSet.cho3Priority || 'T,B');
    window.renderPriorityOptions('freeSettingGroup', 'optFree', window.SysSet.freePriority || 'T,B');
    if(window.mdlSettings) window.mdlSettings.show();
};

window.saveSettings = function() {
    const cVal = document.querySelector('input[name="optCho3"]:checked')?.value || 'T,B';
    const fVal = document.querySelector('input[name="optFree"]:checked')?.value || 'T,B';
    const dMode = document.querySelector('input[name="optDeductMode"]:checked')?.value || 'ITEM_FIRST';
    window.commitState(() => {
        window.SysSet.cho3Priority = cVal;
        window.SysSet.freePriority = fVal;
        window.SysSet.deductMode = dMode;
    }, null, '환경설정 변경(공제 우선순위/방식)');
    if(window.mdlSettings) window.mdlSettings.hide();
    window.showAlert('✅ 환경설정이 저장되고 정산 장부가 새로운 연산 유형에 맞춰 즉시 재연산되었습니다.');
};

window.updateSettingsBadge = function() {
    const badge = window.$('currentDeductSettingBadge'); if (!badge) return;
    const cP = window.SysSet.cho3Priority || 'T,B'; const fP = window.SysSet.freePriority || 'T,B'; const dM = window.SysSet.deductMode || 'ITEM_FIRST';
    const getPName = v => v.includes('M') ? v.replace(/T/g,'수').replace(/B/g,'교').replace(/M/g,'재').replace(/,/g,'➔') : (v === 'T,B' ? '수강료 우선' : v === 'B,T' ? '교재비 우선' : '수강료 전용');
    const getMName = v => v === 'ITEM_FIRST' ? '항목 우선' : '강좌 우선';
    const tNm = window.SysSet.accType === 'SEPARATED' ? '분리형(3D)' : '통합형(2D)';
    badge.innerHTML = `유형: <strong class="text-dark">${tNm} (${getMName(dM)})</strong> | 초3: ${getPName(cP)} | 자유: ${getPName(fP)}`;
};

// 💡 2-1. 위젯 토글 함수 (최소화/최대화)
window.toggleSandboxWidget = function() {
    const body = document.getElementById('sandboxWidgetBody');
    const toggleBtn = document.querySelector('#sandboxWidget .card-header button');
    
    if (body.style.display === 'none') {
        body.style.display = 'block';
        toggleBtn.innerText = '-';
    } else {
        body.style.display = 'none';
        toggleBtn.innerText = '+';
    }
};

// 💡 2-4. 샌드박스 스텝 이동 로직은 app-tutorial.js로 이관됨

// 💡 2-2. 샌드박스 종료 및 복귀 함수 (다이렉트 분기점)
window.exitSandboxAndReset = async function() {
    if (await window.showConfirm("가상 데이터 시뮬레이션을 종료하고, 실무 장부 세팅을 위해 시스템을 초기화하시겠습니까?")) {
        window.C = {}; window.M = {}; window.F = []; window.E = [];
        
        // 💡 꼬리표 떼기 (안전장치)
        if (window.SysSet) window.SysSet.isSandbox = false; 
        
        if (typeof window.save === 'function') window.save();
        
        document.getElementById('sandboxWidget').style.display = 'none';
        
        window.setQTab(1);
        const step1Btn = document.querySelector('#myTab button[data-bs-target="#step1"]');
        if (step1Btn) step1Btn.click();
        
        if (window.mdlWelcome) window.mdlWelcome.show();
    }
};

// 💡 2-3. 게이트웨이 로직 수정 (라우팅 및 위젯 호출)
window.startGateway = async function(mode) {
    if(window.mdlWelcome) window.mdlWelcome.hide();
    
    const is3D = window.tempAccType === 'SEPARATED';
    const cho3Pri = is3D ? 'T,B,M' : 'T,B';
    const freePri = is3D ? 'T,B,M' : 'T,B';

    if (mode === 'REAL') { 
        window.C = {}; window.M = {}; window.F = []; window.E = []; 
        window.SysSet = { 
            closedSess: {}, 
            accType: window.tempAccType, 
            useMaterialFee: is3D,
            cho3Priority: cho3Pri, 
            freePriority: freePri,
            deductMode: 'ITEM_FIRST',
            isSandbox: false // 💡 실무 모드 각인
        }; 
        if (typeof window.save === 'function') await window.save(); 
        window.startupRoutines(); 
    } else { 
        // SANDBOX 모드 실행
        if (typeof window.generateDummyData === 'function') {
            window.SysSet = { 
                closedSess: {}, 
                accType: window.tempAccType, 
                useMaterialFee: is3D,
                cho3Priority: cho3Pri, 
                freePriority: freePri,
                deductMode: 'ITEM_FIRST',
                isSandbox: true // 💡 샌드박스 모드 각인
            };
            
            window.generateDummyData(is3D); 
            if (typeof window.initTutorialWidget === 'function') window.initTutorialWidget();
            
            if (typeof window.save === 'function') await window.save(); 
            window.startupRoutines(); 
            
            setTimeout(() => {
                window.setQTab(2); 
                const step2Btn = document.querySelector('#myTab button[data-bs-target="#step2"]');
                if(step2Btn) step2Btn.click(); 
            }, 100);
        }
    }
};

window.isQuarterLocked = function(q) { return Object.keys(window.SysSet.closedSess || {}).some(k => k.startsWith(q + '_')); };

window.addEventListener('DOMContentLoaded', () => {
    if(window.$('mdlStuConsole') && typeof bootstrap !== 'undefined') window.mdlConsole = new bootstrap.Modal(window.$('mdlStuConsole'));
    if(window.$('mdlCourseSummary') && typeof bootstrap !== 'undefined') window.mdlCrsSummary = new bootstrap.Modal(window.$('mdlCourseSummary'));
    if(window.$('mdlFreeStart') && typeof bootstrap !== 'undefined') window.mdlFreeStart = new bootstrap.Modal(window.$('mdlFreeStart'));
    if(window.$('mdlEnrollUpload') && typeof bootstrap !== 'undefined') window.mdlUpload = new bootstrap.Modal(window.$('mdlEnrollUpload'));
    if(window.$('mdlWelcome') && typeof bootstrap !== 'undefined') window.mdlWelcome = new bootstrap.Modal(window.$('mdlWelcome'));
    if(window.$('mdlSettings') && typeof bootstrap !== 'undefined') window.mdlSettings = new bootstrap.Modal(window.$('mdlSettings'));
    if(window.$('mdlUpdateHistory') && typeof bootstrap !== 'undefined') window.mdlUpdateHistory = new bootstrap.Modal(window.$('mdlUpdateHistory'));
    if(window.$('mdlDialog') && typeof bootstrap !== 'undefined') window.mdlDialog = new bootstrap.Modal(window.$('mdlDialog'));
    if(window.$('appToast') && typeof bootstrap !== 'undefined') window.mdlToast = new bootstrap.Toast(window.$('appToast'), { delay: 4000 });

    const step4TabBtn = window.$('tabStep4Btn');
    if (step4TabBtn) {
        step4TabBtn.addEventListener('shown.bs.tab', () => {
            const targetMap = { 'STU': '#tStuDtl', 'CRS': '#tCrseDtl', 'STAT': '#tStat' };
            const targetId = targetMap[window.curS4Tab] || '#tStuDtl';
            const btn = document.querySelector(`#s4SubTabs button[data-bs-target="${targetId}"]`);
            if (btn) btn.click();
        });
    }
    if (typeof window.loadData === 'function') {
        window.loadData().then(hasData => {
            if (!hasData || (Object.keys(window.M).length === 0 && window.F.length === 0 && window.E.length === 0)) {
                window.mdlWelcome.show(); if (typeof window.updateStorageUsage === 'function') window.updateStorageUsage('');
                if (typeof window.updateUndoButton === 'function') window.updateUndoButton();
            } else {
                window.startupRoutines(); if (typeof window.updateStorageUsage === 'function') window.updateStorageUsage(JSON.stringify({C:window.C, M:window.M, F:window.F, E:window.E, SysSet:window.SysSet}));
            }
        });
    }
    const docTitle = document.querySelector('title'); if (docTitle) docTitle.innerText = `방과후 정산 시스템 (v${window.APP_VERSION})`;
    const badgeEl = window.$('versionBadge'); if (badgeEl) badgeEl.innerText = `v${window.APP_VERSION}`;
});

window.startupRoutines = function() {
    window.setQTab(1);
    if (typeof window.updateUndoButton === 'function') window.updateUndoButton();
    if (typeof window.renderStaticHeaders === 'function') window.renderStaticHeaders();
    if (typeof window.updateSettingsBadge === 'function') window.updateSettingsBadge();

    // 💡 [거시적 통제] 시스템 상태에 따른 위젯 강제 노출/숨김
    const widget = document.getElementById('sandboxWidget');
    if (widget) {
        if (window.SysSet && window.SysSet.isSandbox) {
            widget.style.display = 'block'; // 샌드박스면 무조건 노출
            if (typeof window.initTutorialWidget === 'function') {
                window.initTutorialWidget(); // 새로고침 시 기본과정 1스텝으로 리셋
            }
        } else {
            widget.style.display = 'none'; // 실무 모드면 무조건 숨김(보안)
        }
    }
};

window.resetAllData = async function() {
    if(!(await window.showConfirm('🚨 경고: 모든 데이터(부서, 수강생, 정산내역 등)가 영구적으로 삭제됩니다.\n정말 초기화하시겠습니까? (백업 권장)'))) return;
    if((await window.showPrompt('데이터를 모두 지우려면 한글로 "초기화"라고 입력해 주세요.')) !== '초기화') return window.showAlert('초기화가 취소되었습니다.');
    window.C = {}; window.M = {}; window.F = []; window.E = []; window.Ld = {}; window.Hs = [];
    window.SysSet = { closedSess: {}, cho3Priority: 'T,B', freePriority: 'T,B', accType: 'INTEGRATED', deductMode: 'ITEM_FIRST', useMaterialFee: false };
    if (typeof window.dbClear === 'function') await window.dbClear();
    localStorage.removeItem(window.KEY); location.reload();
};

window.addEventListener('DOMContentLoaded', () => {
    const restoreInput = window.$('restoreFile');
    if(restoreInput) {
        restoreInput.addEventListener('change', async function() {
            const file = this.files[0]; if (!file) return;
            if (!(await window.showConfirm('🚨 경고: 기존 장부 데이터가 모두 지워지고 선택한 백업 파일로 덮어쓰기 됩니다.\n진행하시겠습니까?'))) { this.value = ''; return; }
            try {
                const text = await window.readFileAsText(file); const d = JSON.parse(text);
                window.C = d.C || {}; window.M = d.M || {}; window.SysSet = d.SysSet || {};
                window.SysSet.cho3Priority = window.SysSet.cho3Priority || 'T,B';
                window.SysSet.freePriority = window.SysSet.freePriority || 'T,B';
                window.SysSet.accType = window.SysSet.accType || 'INTEGRATED';
                window.SysSet.closedSess = window.SysSet.closedSess || {};
                window.F = (d.F || []).map(x=>({g:+(x.g??0), b:+(x.b??0), n:+(x.n??0), name:String(x.name||''), startQ: +(x.startQ||1), startSess: +(x.startSess||0), courses: x.courses||{} }));
                window.E = (d.E || []).map(x=>({q:+(x.q||1), g:+(x.g??0), b:+(x.b??0), n:+(x.n??0), name:String(x.name||''), course:String(x.course||''), cT:(x.cT!=null)?+x.cT:null, cB:(x.cB!=null)?+x.cB:null, rT:+(x.rT||0), rB:+(x.rB||0), mm:String(x.mm||''), tMemo:String(x.tMemo||''), bMemo:String(x.bMemo||''), refunds:x.refunds||[], adjusts:x.adjusts||[], auditLog:String(x.auditLog||'엔진자동'), overrideCho3: x.overrideCho3||null, overrideFree: x.overrideFree||null, seq: x.seq||0}));
                Object.keys(window.M).forEach(dept => { if (window.M[dept].cnt !== undefined) { const old = window.M[dept]; window.M[dept] = {1:{...old}, 2:{...old}, 3:{...old}, 4:{...old}}; } });
                if (typeof window.save === 'function') await window.save();
                window.showAlert('✅ 백업 데이터 복구가 성공적으로 완료되었습니다.'); location.reload();
            } catch(err) { window.showAlert('❌ 백업 파일이 손상되었거나 형식이 올바르지 않습니다.'); console.error(err); } finally { this.value = ''; }
        });
    }
});

// 💡 업데이트 공지 티커: updates.js(window.APP_UPDATES)를 읽어서 보여준다.
// (예전 구글시트+JSONP 방식은 셀 위치를 추정하는 방식이라 깨지기 쉬웠고, 외부 서비스 장애에도
//  영향을 받았음. fetch()로 JSON을 읽는 방식은 index.html을 더블클릭으로 직접 열었을 때
//  브라우저가 file:// 프로토콜의 fetch를 막아버려서 <script> 태그 방식을 그대로 씀.
//  기능을 배포하는 커밋 안에서 updates.js 배열에 항목을 추가하면 자동으로 반영된다.)
window.fetchAnnouncements = function() {
    const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    try {
        const list = window.APP_UPDATES || [];

        const now = new Date();
        const DAY = 24 * 60 * 60 * 1000;
        const active = list
            .map((item, i) => ({ item, i }))
            .filter(({ item }) => {
                const start = new Date(item.date);
                if (isNaN(start)) return false;
                // until을 명시하지 않으면 게시 시작일로부터 14일간 자동 노출 후 스스로 사라진다.
                const end = item.until ? new Date(item.until) : new Date(start.getTime() + 14 * DAY);
                return now >= start && now <= end;
            })
            // 최신 업데이트가 먼저 노출되도록 정렬. 같은 날짜면 배열에 나중에 추가된(더 최근에 배포된) 항목이 먼저 오도록 원래 순서를 역순으로 tie-break.
            .sort((a, b) => (new Date(b.item.date) - new Date(a.item.date)) || (b.i - a.i))
            .map(({ item }) => item);

        if (active.length === 0) return;

        const tickerContent = window.$('announcementContent');
        const tickerWrapper = window.$('tickerWrapper');
        if (tickerContent && tickerWrapper) {
            tickerContent.innerHTML = active.map(item => `📢 ${escapeHtml(item.message)}`).join('&nbsp;&nbsp;&nbsp; | &nbsp;&nbsp;&nbsp;');
            tickerWrapper.style.display = 'block';
            if (typeof window.applyTickerSpeed === 'function') window.applyTickerSpeed();
        }
    } catch (e) {
        console.error('업데이트 공지 로딩 오류:', e);
    }
};

// 💡 티커 속도/정지 설정. 공지가 길든 짧든 체감 속도(px/초)가 똑같도록,
// 한 바퀴 도는 데 걸리는 시간을 매번 콘텐츠의 실제 픽셀 너비 기준으로 다시 계산한다.
// 한 바퀴가 끝나면 PAUSE_SEC만큼 멈췄다가 처음부터 다시 시작한다.
window.TICKER_PX_PER_SEC = 150; // 기존 184px/s보다 약 20% 느리게 조정
window.TICKER_PAUSE_SEC = 3;    // 한 바퀴 끝나고 쉬는 시간

window.applyTickerSpeed = function() {
    const tickerContent = window.$('announcementContent');
    if (!tickerContent) return;

    const distancePx = tickerContent.scrollWidth; // padding-left:100% 덕분에 이 값 자체가 "총 이동거리"와 같다
    if (distancePx <= 0) return;

    const scrollSec = distancePx / window.TICKER_PX_PER_SEC;
    const totalSec = scrollSec + window.TICKER_PAUSE_SEC;
    const scrollPct = (scrollSec / totalSec) * 100;

    let styleTag = document.getElementById('tickerDynamicStyle');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'tickerDynamicStyle';
        document.head.appendChild(styleTag);
    }
    // 0%~scrollPct% 구간에서 왼쪽으로 다 이동하고, scrollPct%~100% 구간은 그 자리에 멈춰있는(=정지) 채로 둔다.
    styleTag.textContent = `
        @keyframes ticker {
            0% { transform: translateX(0); }
            ${scrollPct.toFixed(2)}% { transform: translateX(-100%); }
            100% { transform: translateX(-100%); }
        }
    `;
    tickerContent.style.animationDuration = `${totalSec.toFixed(2)}s`;
};

window.addEventListener('resize', () => {
    if (typeof window.applyTickerSpeed === 'function') window.applyTickerSpeed();
});

// 💡 티커 배너를 클릭하면 만료 여부와 상관없이 전체 업데이트 이력을 최신순으로 보여준다.
window.openUpdateHistory = function() {
    const list = window.$('updateHistoryList');
    if (!list) return;
    const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // 같은 날짜면 배열에 나중에 추가된(더 최근에 배포된) 항목이 먼저 오도록 원래 순서를 역순으로 tie-break.
    const sorted = (window.APP_UPDATES || [])
        .map((item, i) => ({ item, i }))
        .sort((a, b) => (new Date(b.item.date) - new Date(a.item.date)) || (b.i - a.i))
        .map(({ item }) => item);

    list.innerHTML = sorted.length === 0
        ? '<li class="list-group-item text-muted text-center">등록된 업데이트 이력이 없습니다.</li>'
        : sorted.map(item => `
            <li class="list-group-item">
                <div class="small text-muted fw-bold mb-1">${escapeHtml(item.date)}</div>
                <div>${escapeHtml(item.message)}</div>
            </li>
        `).join('');

    if (window.mdlUpdateHistory) window.mdlUpdateHistory.show();
};

// 💡 시스템 시작 시 업데이트 공지 티커 실행
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof window.fetchAnnouncements === 'function') window.fetchAnnouncements();
    }, 1000);
});