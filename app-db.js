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
        window.lastSaved = d.lastSaved || null;
        
        window.F = (d.F || []).map(x => ({ 
            g: +(x.g||0), b: +(x.b||0), n: +(x.n||0), 
            name: String(x.name||''), startQ: +(x.startQ||1), 
            startSess: +(x.startSess||0), courses: x.courses || {} 
        }));
        
        window.E = (d.E || []).map(x => ({ 
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
        window.updateStorageUsage(raw, now);
    } catch(e) { 
        console.error('브라우저 내부 DB 엔진 데이터 바인딩 실패:', e); 
    }
};

// 4. 로컬 스토리지 점유율 및 디스크 캐시 시간 표시부
window.updateStorageUsage = function(rawString = '', timestamp = null) {
    const el = window.$('storageUsage'); if (!el) return;
    const timeToDisplay = timestamp || window.lastSaved;
    const timeStr = timeToDisplay ? new Date(timeToDisplay).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '기록 없음';
    const kb = ((rawString.length * 2) / 1024).toFixed(1);
    el.innerHTML = `💾 DB: <span class="text-success">${kb} KB</span> (저장:${timeStr})`;
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