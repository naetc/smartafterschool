/* ==========================================================================
   파일닉네임: app-db.js
   기능설명: IndexedDB 비동기 영속화 레이어 및 백업/시스템 복구 트랜잭션 관리
   ========================================================================== */
'use strict';

const DB_NAME = 'BghAppDB';
const STORE_NAME = 'bgh_store';

// 1. 데이터베이스 초기 활성화
window.initDB = function() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = e => reject(e.target.error);
    });
};

// 2. 비동기 트랜잭션 단위 입출력 제어
window.dbGet = async function(key) {
    const db = await window.initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

window.dbSet = async function(key, val) {
    const db = await window.initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).put(val, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

window.dbClear = async function() {
    const db = await window.initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

// 3. 어플리케이션 데이터 마이그레이션 및 파싱 로드
window.loadData = async function() {
    try {
        let raw = await window.dbGet(window.KEY);
        let migrated = false;
        if (!raw) {
            const localRaw = localStorage.getItem(window.KEY);
            if (localRaw) { raw = localRaw; migrated = true; } else return false;
        }
        
        const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
        window.C = d.C || {}; 
        window.M = d.M || {}; 
        window.SysSet = d.SysSet || {}; 
        
        if (window.SysSet.deductPriority) {
            let oldVal = Array.isArray(window.SysSet.deductPriority) ? window.SysSet.deductPriority.join(',') : window.SysSet.deductPriority;
            window.SysSet.cho3Priority = oldVal;
            window.SysSet.freePriority = oldVal;
            delete window.SysSet.deductPriority;
            migrated = true;
        } else {
            window.SysSet.cho3Priority = window.SysSet.cho3Priority || 'T,B';
            window.SysSet.freePriority = window.SysSet.freePriority || 'T,B';
        }
        window.SysSet.closedSess = window.SysSet.closedSess || {};
        // 💡 지원금 금액 설정(연도별 정책 변경 대응) 마이그레이션: 기존 저장분에 없으면 기본값으로 채운다.
        window.SysSet.cho3Annual = window.SysSet.cho3Annual ?? window.BUDGET.CHO3_ANNUAL;
        window.SysSet.cho3H1Cap = window.SysSet.cho3H1Cap ?? window.BUDGET.CHO3_H1_CAP;
        window.SysSet.freeAnnual = window.SysSet.freeAnnual ?? window.BUDGET.FREE_ANNUAL;
        window.SysSet.cho3Grades = (Array.isArray(window.SysSet.cho3Grades) && window.SysSet.cho3Grades.length) ? window.SysSet.cho3Grades : [3];
        window.lastSaved = d.lastSaved || null;
        
        window.F = (d.F || []).map(x => ({ 
            ...x, // 💡 핵심: 기존 DB에 기록된 모든 속성(현재/미래 변수)을 100% 무조건 흡수
            g: +(x.g||0), b: +(x.b||0), n: +(x.n||0), 
            name: String(x.name||''), startQ: +(x.startQ||1), 
            startSess: +(x.startSess||0), courses: x.courses || {} 
        }));
        
        window.E = (d.E || []).map(x => ({ 
            ...x, // 💡 핵심: 기존 DB에 기록된 모든 속성을 100% 흡수 (transCho3Amt, cM 등 증발 원천 차단)
            q: +(x.q||1), g: +(x.g||0), b: +(x.b||0), n: +(x.n||0), name: String(x.name||''), 
            course: String(x.course||''), oldQ: x.oldQ || null, oldCourse: x.oldCourse || null, 
            cT: (x.cT != null) ? +x.cT : null, cB: (x.cB != null) ? +x.cB : null, 
            rT: +(x.rT||0), rB: +(x.rB||0), mm: String(x.mm||''), tMemo: String(x.tMemo||''), 
            bMemo: String(x.bMemo||''), refunds: x.refunds || [], adjusts: x.adjusts || [], 
            auditLog: String(x.auditLog||'엔진자동'), overrideCho3: x.overrideCho3 || null, 
            overrideFree: x.overrideFree || null, seq: x.seq || 0 
        }));
        
        Object.keys(window.M).forEach(dept => { 
            if (window.M[dept].cnt !== undefined) { 
                const old = window.M[dept]; 
                window.M[dept] = {1:{...old}, 2:{...old}, 3:{...old}, 4:{...old}}; 
            } 
        });
        
        if (migrated) { await window.save(); localStorage.removeItem(window.KEY); }
        return true;
    } catch(e) { 
        console.error('영속 파일 데이터 직렬화 로딩 오류:', e); 
        return false; 
    }
};

window.save = async function() {
    try {
        const now = Date.now();
        const raw = JSON.stringify({ C:window.C, M:window.M, F:window.F, E:window.E, SysSet:window.SysSet, lastSaved: now });
        await window.dbSet(window.KEY, raw);
        // ⚠️ 순서 주의: markSaveState(true)로 실패 플래그를 먼저 해제해야 한다.
        //    반대로 하면 updateStorageUsage가 saveFailed 가드에 걸려 그냥 빠져나가고,
        //    저장이 복구됐는데도 빨간 경고 문구가 화면에 그대로 남는다.
        window.markSaveState(true);
        window.updateStorageUsage(raw, now);
    } catch(e) {
        // ⚠️ 저장 실패를 console에만 남기면, 사용자는 '저장된 줄 알고' 작업을 계속하다가
        //    그날 입력한 데이터를 통째로 잃는다. 정산 시스템에서 가장 위험한 실패 모드이므로
        //    반드시 화면에 띄운다. (시크릿 모드, 디스크 용량 부족, 브라우저 저장소 정책 변경 등
        //    실제로 일어나는 상황이다.)
        console.error('브라우저 내부 DB 엔진 데이터 바인딩 실패:', e);
        window.markSaveState(false, e);
    }
};

// 4. 로컬 스토리지 점유율 및 디스크 캐시 시간 표시부
window.updateStorageUsage = function(rawString = '', timestamp = null) {
    const el = window.$('storageUsage'); if (!el) return;
    // 저장 실패 경고가 떠 있는 동안에는 정상 문구로 덮어쓰지 않는다(경고가 사라지면 안 됨).
    if (window.saveFailed) return;
    const timeToDisplay = timestamp || window.lastSaved;
    const timeStr = timeToDisplay ? new Date(timeToDisplay).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '기록 없음';
    const kb = ((rawString.length * 2) / 1024).toFixed(1);
    el.innerHTML = `💾 브라우저에 저장됨: ${timeStr}, <span class="text-success">${kb}KB</span>`;
};

// 4-1. 저장 성공/실패 상태 표시.
//      토스트는 몇 초 뒤 사라지므로 '저장에 실패했다'는 사실은 항상 화면에 떠 있는
//      저장 표시줄(#storageUsage)을 빨갛게 바꿔서 알린다. 토스트는 상태가 바뀌는
//      순간(정상→실패, 실패→정상)에만 한 번 띄운다 — 편집할 때마다 실패가 반복되는
//      상황에서 토스트가 매번 뜨면 사용자가 오히려 무시하게 되기 때문.
window.saveFailed = false;

window.markSaveState = function(ok, err) {
    const wasFailed = window.saveFailed;
    window.saveFailed = !ok;

    if (!ok) {
        const el = window.$('storageUsage');
        if (el) {
            el.innerHTML = '<span class="text-danger fw-bold">⚠️ 저장 실패 — 지금 즉시 [백업]을 눌러 PC에 파일로 보관하세요!</span>';
            el.title = err ? String((err && err.message) || err) : '';
        }
        if (!wasFailed && typeof window.showToast === 'function') {
            window.showToast('⚠️ 브라우저에 저장하지 못했습니다. 작업 내용이 사라질 수 있으니 지금 [백업] 버튼을 눌러 PC에 파일로 보관하세요.');
        }
    } else if (wasFailed && typeof window.showToast === 'function') {
        window.showToast('✅ 저장이 정상으로 돌아왔습니다.');
    }
};

// 5. 수동 외부 행정 감사 파일 백업/복구 시스템 트리거
window.sysBackup = function() { 
    const blob = new Blob([JSON.stringify({C:window.C, M:window.M, F:window.F, E:window.E, SysSet:window.SysSet})], {type:'application/json'}); 
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); 
    a.download = `방과후정산_백업_${new Date().toISOString().slice(0,10)}.json`; a.click(); 
};

// 6. 페이지 이탈 감지 및 휘발방지 얼럿 가드
window.addEventListener('beforeunload', function (e) {
    const msg = "종료 전 우측 상단의 [백업]을 눌러 데이터를 PC에 보관하셨나요? (캐시 삭제 시 데이터 유실 위험)";
    e.preventDefault(); e.returnValue = msg; return msg;
});