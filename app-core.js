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
    if (script && script.src.includes('?v=')) {
        return script.src.split('?v=')[1].split('&')[0]; // ?v= 뒷부분 추출
    }
    return 'Dev'; // 쿼리스트링이 없을 때의 기본값
})();

// 2. 시스템 상태 및 비즈니스 데이터 저장소 선언
window.C = {};             // 연산된 강좌 요금 데이터 정보
window.M = {};             // 부서 마스터 원본 단가 정보 
window.F = [];             // 자유수강권 대상자 명단 수집 배열
window.E = [];             // 전체 수강 신청 학생 회계 원장 배열
window.Ld = {};            // 학생별로 그룹화된 4스텝 내부 스마트 메모리 객체
window.Hs = [];            // 차수별 시수 분할 계산이 완료된 스냅샷 데이터 구조

// 3. UI 필터링 및 네비게이션 제어 변수
window.f_eq = '1';
window.f_ec = 'ALL'; 
window.s4_filt = 'A';
window.s4_cFilter = 'ALL';
window.curS4Tab = 'STU'; 
window.s4_sessFilter = 'ALL';
window.s4_chkAdj = false; 
window.s4_chkRef = false; 
window.s4_chkDed = false; 
window.sortState = { col: 'DP', asc: true };

// 4. 모달 인스턴스 핸들러
window.mdlConsole = null;
window.mdlCrsSummary = null;
window.mdlFreeStart = null;
window.mdlUpload = null;
window.mdlWelcome = null;
window.mdlSettings = null;

// 5. 거래 키 및 변수 관리
window.KEY = 'bgh_260617';
window.gQ = 1;
window.cUid = '';
window.cEnrolls = [];
window.cActiveEIdx = -1;
window.curEditFreeIdx = -1;
window.lastSaved = null;
window.pendingEnrollData = [];
window.SysSet = { closedSess: {}, cho3Priority: 'T,B', freePriority: 'T,B' };

// 6. 상태 변경 파이프라인 (Commit State Engine)
window.commitState = function(actionCallback, customData = null) {
    if (actionCallback) actionCallback();
    window.E.forEach(e => {
        if (typeof window.recalcEnrollment === 'function') window.recalcEnrollment(e);
    }); 
    if (typeof window.autoRunSet === 'function') window.autoRunSet(true); 
    if (typeof window.save === 'function') window.save();
    window.renderAll(customData); 
};

// 7. 모듈별 UI 통합 재렌더링 트리거
window.renderAll = function(customData = null) {
    if (typeof window.updateSettingBadge === 'function') window.updateSettingBadge();
    if (typeof window.renderM === 'function') window.renderM();
    if (typeof window.renderC === 'function') window.renderC();
    if (typeof window.renderF === 'function') window.renderF();
    if (typeof window.renderE === 'function') window.renderE();
    if (typeof window.renderSetTabs === 'function') window.renderSetTabs();
    
    if (window.mdlConsole && window.mdlConsole._isShown && typeof window.renderConsole === 'function') window.renderConsole();
    if (window.mdlCrsSummary && window.mdlCrsSummary._isShown && typeof window.renderCourseModalBody === 'function') {
        window.renderCourseModalBody(customData?.savedUids || []);
    }
};

// 8. 분기 탭 제어 시스템
window.setQTab = function(q) {
    window.gQ = q; 
    [1,2,3,4].forEach(i => window.$('btnQTab'+i)?.classList.remove('active'));
    window.$('btnQTab'+q)?.classList.add('active');
    ['exEnQ', 's4_q', 'p_q1', 'p_qInvoice', 'p_q2', 'e_q'].forEach(id => { 
        if(window.$(id)) window.$(id).value = String(q); 
    });
    window.f_eq = String(q);
    if(window.$('lblMasterTab')) window.$('lblMasterTab').innerHTML = `<i class="bi bi-building"></i> [${q}분기] 부서 마스터`;
    if(window.$('lblCourseTab')) window.$('lblCourseTab').innerHTML = `<i class="bi bi-list-check"></i> [${q}분기] 강좌 요금표`;
    
    window.commitState(() => { 
        if (typeof window.regenerateC === 'function') window.regenerateC(); 
    }); 
    if (typeof window.initStep5 === 'function') window.initStep5();
};

// 9. 환경설정 모달 제어
window.openSettings = function() {
    const cP = window.SysSet.cho3Priority || 'T,B';
    const fP = window.SysSet.freePriority || 'T,B';
    document.querySelectorAll('input[name="optCho3"]').forEach(el => { el.checked = (el.value === cP); });
    document.querySelectorAll('input[name="optFree"]').forEach(el => { el.checked = (el.value === fP); });
    if(window.mdlSettings) window.mdlSettings.show();
};

window.updateSettingBadge = function() {
    const badge = window.$('currentDeductSettingBadge'); if (!badge) return;
    const rName = v => v==='T,B'?'수강료➔교재비':v==='B,T'?'교재비➔수강료':'수강료전용';
    badge.innerHTML = `<i class="bi bi-info-circle-fill"></i> 현재 설정: 초3(${rName(window.SysSet.cho3Priority||'T,B')}) | 자유(${rName(window.SysSet.freePriority||'T,B')})`;
};

window.saveSettings = function() {
    const cVal = document.querySelector('input[name="optCho3"]:checked').value;
    const fVal = document.querySelector('input[name="optFree"]:checked').value;
    window.commitState(() => { 
        window.SysSet.cho3Priority = cVal; 
        window.SysSet.freePriority = fVal; 
    });
    if(window.mdlSettings) window.mdlSettings.hide(); 
    alert('✅ 환경설정이 저장되고 정산 장부가 즉시 재연산되었습니다.');
};

// 10. 마감 여부 퀵 검증 논리식
window.isQuarterLocked = function(q) { 
    return Object.keys(window.SysSet.closedSess || {}).some(k => k.startsWith(q + '_')); 
};

// 11. 부트스트랩 인스턴스 초기 구성 및 이벤트 바인딩 인터셉터
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

    if (typeof window.loadManual === 'function') window.loadManual(); 
    
    if (typeof window.loadData === 'function') {
        window.loadData().then(hasData => {
            if (!hasData || (Object.keys(window.M).length === 0 && window.F.length === 0 && window.E.length === 0)) { 
                window.mdlWelcome.show(); 
                if (typeof window.updateStorageUsage === 'function') window.updateStorageUsage(''); 
            } else { 
                window.startupRoutines(); 
                if (typeof window.updateStorageUsage === 'function') window.updateStorageUsage(JSON.stringify({C:window.C, M:window.M, F:window.F, E:window.E, SysSet:window.SysSet})); 
            }
        });
    }
	// 💡 1. 브라우저 탭 타이틀에 버전 자동 표시
    const docTitle = document.querySelector('title');
    if (docTitle) docTitle.innerText = `방과후 정산 시스템 (v${window.APP_VERSION})`;

    // 💡 2. 화면 내에 id="versionBadge"가 있다면 버전 자동 기입
    const badgeEl = window.$('versionBadge');
    if (badgeEl) badgeEl.innerText = `v${window.APP_VERSION}`;
});

window.startupRoutines = function() { 
    window.setQTab(1); 
    if (typeof window.renderStaticHeaders === 'function') window.renderStaticHeaders(); 
};

window.startGateway = async function(mode) {
    window.mdlWelcome.hide();
    if (mode === 'REAL') { 
        window.C = {}; window.M = {}; window.F = []; window.E = []; window.SysSet = { closedSess: {}, cho3Priority: 'T,B', freePriority: 'T,B' }; 
        if (typeof window.save === 'function') await window.save(); 
        window.startupRoutines(); 
    } else { 
        if (typeof window.generateDummyData === 'function') {
            window.generateDummyData(); 
            if (typeof window.save === 'function') await window.save(); 
            window.startupRoutines(); 
            alert('자유 샌드박스 모드입니다. 대용량 가상 데이터가 세팅되었습니다.');
        }
    }
};

/* ==========================================================================
   💡 복원된 시스템 코어 기능 (초기화 및 백업 복구)
   ========================================================================== */

// 1. 공장 초기화 (Step 6 버튼)
window.resetAllData = async function() {
    if(!confirm('🚨 경고: 모든 데이터(부서, 수강생, 정산내역 등)가 영구적으로 삭제됩니다.\n정말 초기화하시겠습니까? (백업 권장)')) return;
    if(prompt('데이터를 모두 지우려면 한글로 "초기화"라고 입력해 주세요.') !== '초기화') return alert('초기화가 취소되었습니다.');
    
    // 글로벌 메모리 데이터 비우기
    window.C = {}; window.M = {}; window.F = []; window.E = []; window.Ld = {}; window.Hs = []; 
    window.SysSet = { closedSess: {}, cho3Priority: 'T,B', freePriority: 'T,B' }; 
    
    // DB 비우고 화면 새로고침
    if (typeof window.dbClear === 'function') await window.dbClear(); 
    localStorage.removeItem(window.KEY); 
    location.reload();
};

// 2. 백업 파일 복구 (우측 상단 복구 버튼)
window.addEventListener('DOMContentLoaded', () => {
    const restoreInput = window.$('restoreFile');
    if(restoreInput) {
        restoreInput.addEventListener('change', async function() {
            const file = this.files[0]; if (!file) return; 
            if (!confirm('🚨 경고: 기존 장부 데이터가 모두 지워지고 선택한 백업 파일로 덮어쓰기 됩니다.\n진행하시겠습니까?')) { this.value = ''; return; }
            try {
                const text = await window.readFileAsText(file); 
                const d = JSON.parse(text);
                
                window.C = d.C || {}; window.M = d.M || {}; window.SysSet = d.SysSet || {}; 
                window.SysSet.cho3Priority = window.SysSet.cho3Priority || 'T,B'; 
                window.SysSet.freePriority = window.SysSet.freePriority || 'T,B'; 
                window.SysSet.closedSess = window.SysSet.closedSess || {};
                
                window.F = (d.F || []).map(x=>({g:+(x.g??0), b:+(x.b??0), n:+(x.n??0), name:String(x.name||''), startQ: +(x.startQ||1), startSess: +(x.startSess||0), courses: x.courses||{} }));
                window.E = (d.E || []).map(x=>({q:+(x.q||1), g:+(x.g??0), b:+(x.b??0), n:+(x.n??0), name:String(x.name||''), course:String(x.course||''), cT:(x.cT!=null)?+x.cT:null, cB:(x.cB!=null)?+x.cB:null, rT:+(x.rT||0), rB:+(x.rB||0), mm:String(x.mm||''), tMemo:String(x.tMemo||''), bMemo:String(x.bMemo||''), refunds:x.refunds||[], adjusts:x.adjusts||[], auditLog:String(x.auditLog||'엔진자동'), overrideCho3: x.overrideCho3||null, overrideFree: x.overrideFree||null, seq: x.seq||0}));
                
                Object.keys(window.M).forEach(dept => { if (window.M[dept].cnt !== undefined) { const old = window.M[dept]; window.M[dept] = {1:{...old}, 2:{...old}, 3:{...old}, 4:{...old}}; } });
                
                if (typeof window.save === 'function') await window.save(); 
                alert('✅ 백업 데이터 복구가 성공적으로 완료되었습니다.');
                location.reload();
            } catch(err) { 
                alert('❌ 백업 파일이 손상되었거나 형식이 올바르지 않습니다.'); 
                console.error(err);
            } finally {
                this.value = ''; // 재사용을 위해 input 비우기
            }
        });
    }
});