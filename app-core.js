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

// 3. UI 필터링 및 네비게이션 제어 변수
window.f_eq = '1'; window.f_ec = 'ALL'; window.s4_filt = 'A'; window.s4_cFilter = 'ALL';
window.curS4Tab = 'STU'; window.s4_sessFilter = 'ALL'; window.s4_chkAdj = false;
window.s4_chkRef = false; window.s4_chkDed = false; window.sortState = { col: 'DP', asc: true };

// 4. 모달 인스턴스 핸들러
window.mdlConsole = null; window.mdlCrsSummary = null; window.mdlFreeStart = null;
window.mdlUpload = null; window.mdlWelcome = null; window.mdlSettings = null;

// 5. 거래 키 및 변수 관리
window.KEY = 'bgh_260628';
window.gQ = 1; window.cUid = ''; window.cEnrolls = []; window.cActiveEIdx = -1;
window.curEditFreeIdx = -1; window.lastSaved = null; window.pendingEnrollData = [];
window.SysSet = { closedSess: {}, cho3Priority: 'T,B', freePriority: 'T,B', deductMode: 'ITEM_FIRST', accType: 'INTEGRATED', useMaterialFee: false };

// 6. 상태 변경 파이프라인
window.commitState = function(actionCallback, customData = null) {
    if (actionCallback) actionCallback();
    window.E.forEach(e => { if (typeof window.recalcEnrollment === 'function') window.recalcEnrollment(e); });
    if (typeof window.autoRunSet === 'function') window.autoRunSet(true);
    if (typeof window.save === 'function') window.save();
    window.renderAll(customData);
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
    window.commitState(() => { if (typeof window.regenerateC === 'function') window.regenerateC(); });
    if (typeof window.initStep5 === 'function') window.initStep5();
};

// 9. 환경설정 및 회계 유형 제어
window.tempAccType = 'INTEGRATED';

window.previewAccType = function(type) {
    window.tempAccType = type;
    const cardInt = window.$('card_acc_int'); const cardSep = window.$('card_acc_sep'); const confirmBtn = window.$('btn_confirm_acc_type');
    if (type === 'INTEGRATED') {
        cardInt.classList.add('border-primary', 'bg-primary', 'bg-opacity-10'); cardInt.querySelector('.card-title').classList.replace('text-secondary', 'text-primary');
        cardSep.classList.remove('border-primary', 'bg-primary', 'bg-opacity-10'); cardSep.querySelector('.card-title').classList.replace('text-primary', 'text-secondary');
        confirmBtn.className = 'btn btn-primary btn-lg px-5 fw-bold shadow-sm'; confirmBtn.innerHTML = `<i class="bi bi-check-circle"></i> "교재통합형(2단)"으로 실무 시작하기`;
    } else {
        cardSep.classList.add('border-primary', 'bg-primary', 'bg-opacity-10'); cardSep.querySelector('.card-title').classList.replace('text-secondary', 'text-primary');
        cardInt.classList.remove('border-primary', 'bg-primary', 'bg-opacity-10'); cardInt.querySelector('.card-title').classList.replace('text-primary', 'text-secondary');
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
    });
    if(window.mdlSettings) window.mdlSettings.hide();
    alert('✅ 환경설정이 저장되고 정산 장부가 새로운 연산 유형에 맞춰 즉시 재연산되었습니다.');
};

window.updateSettingsBadge = function() {
    const badge = window.$('currentDeductSettingBadge'); if (!badge) return;
    const cP = window.SysSet.cho3Priority || 'T,B'; const fP = window.SysSet.freePriority || 'T,B'; const dM = window.SysSet.deductMode || 'ITEM_FIRST';
    const getPName = v => v.includes('M') ? v.replace(/,/g,'➔') : (v === 'T,B' ? '수강료 우선' : v === 'B,T' ? '교재비 우선' : '수강료 전용');
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
window.exitSandboxAndReset = function() {
    if (confirm("가상 데이터 시뮬레이션을 종료하고, 실무 장부 세팅을 위해 시스템을 초기화하시겠습니까?")) {
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
    if(!confirm('🚨 경고: 모든 데이터(부서, 수강생, 정산내역 등)가 영구적으로 삭제됩니다.\n정말 초기화하시겠습니까? (백업 권장)')) return;
    if(prompt('데이터를 모두 지우려면 한글로 "초기화"라고 입력해 주세요.') !== '초기화') return alert('초기화가 취소되었습니다.');
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
            if (!confirm('🚨 경고: 기존 장부 데이터가 모두 지워지고 선택한 백업 파일로 덮어쓰기 됩니다.\n진행하시겠습니까?')) { this.value = ''; return; }
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
                alert('✅ 백업 데이터 복구가 성공적으로 완료되었습니다.'); location.reload();
            } catch(err) { alert('❌ 백업 파일이 손상되었거나 형식이 올바르지 않습니다.'); console.error(err); } finally { this.value = ''; }
        });
    }
});

// 💡 업데이트 공지 티커: 저장소에 함께 배포되는 updates.json을 직접 읽어온다.
// (예전 구글시트+JSONP 방식은 셀 위치를 추정하는 방식이라 깨지기 쉬웠고, 외부 서비스 장애에도
//  영향을 받았음. 기능을 배포하는 커밋 안에서 updates.json에 항목을 추가하면 자동으로 반영된다.)
window.fetchAnnouncements = async function() {
    const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    try {
        const res = await fetch('updates.json?_=' + Date.now());
        if (!res.ok) return;
        const list = await res.json();

        const now = new Date();
        const DAY = 24 * 60 * 60 * 1000;
        const active = list.filter(item => {
            const start = new Date(item.date);
            if (isNaN(start)) return false;
            // until을 명시하지 않으면 게시 시작일로부터 14일간 자동 노출 후 스스로 사라진다.
            const end = item.until ? new Date(item.until) : new Date(start.getTime() + 14 * DAY);
            return now >= start && now <= end;
        });

        if (active.length === 0) return;

        const tickerContent = window.$('announcementContent');
        const tickerWrapper = window.$('tickerWrapper');
        if (tickerContent && tickerWrapper) {
            tickerContent.innerHTML = active.map(item => `📢 ${escapeHtml(item.message)}`).join('&nbsp;&nbsp;&nbsp; | &nbsp;&nbsp;&nbsp;');
            tickerWrapper.style.display = 'block';
        }
    } catch (e) {
        console.error('업데이트 공지 로딩 오류:', e);
    }
};

// 💡 시스템 시작 시 업데이트 공지 티커 실행
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof window.fetchAnnouncements === 'function') window.fetchAnnouncements();
    }, 1000);
});