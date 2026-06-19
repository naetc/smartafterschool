'use strict';

const $  = id => document.getElementById(id);
const val = id => $(id)?.value.trim() || '';
const num = v  => parseInt(String(v).replace(/,/g,'')) || 0;
const fmt = n  => Number(n||0).toLocaleString();

// 💡 이름 내부 공백 제거로 초기화 오류 방지
const uid = (g,b,n,nm) => `${+g||0}-${+b||0}-${+n||0}-${String(nm||'').replace(/\s+/g, '')}`;
const dsp = (g,b,n)    => `${+g||0}-${+b||0}-${+n||0}`;

function readFileAsArrayBuffer(file) { return new Promise((r, j) => { const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.onerror = () => j(new Error('파일 읽기 실패')); rd.readAsArrayBuffer(file); }); }
function readFileAsText(file) { return new Promise((r, j) => { const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.onerror = () => j(new Error('파일 읽기 실패')); rd.readAsText(file, 'utf-8'); }); }
function parseXlsx(buffer) { const wb = XLSX.read(new Uint8Array(buffer), {type:'array'}); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''}); }

let C={}, M={}, F=[], E=[], Ld={}, Hs=[];
let f_eq='1', f_ec='ALL'; 
let s4_filt='A', curS4Tab='STAT', s4_cFilter='ALL';
let sortState = { col: 'DP', asc: true }; 
let mdlConsole, mdlCrsSummary, mdlFreeStart, mdlUpload, mdlWelcome, mdlSettings; 
let pendingEnrollData = []; 
let SysSet = { closedSess: {}, deductPriority: ['T', 'B'] };

const KEY = 'bgh_260617';

window.gQ = 1;
let cUid = '', cEnrolls = [], cActiveEIdx = -1, curEditFreeIdx = -1;

window.isQuarterLocked = function(q) { return Object.keys(SysSet.closedSess || {}).some(k => k.startsWith(q + '_')); };

// --- IndexedDB 고속 비동기 저장 엔진 ---
const DB_NAME = 'BghAppDB';
const STORE_NAME = 'bgh_store';

function initDB() { return new Promise((resolve, reject) => { const req = indexedDB.open(DB_NAME, 1); req.onupgradeneeded = e => { const db = e.target.result; if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME); }; req.onsuccess = e => resolve(e.target.result); req.onerror = e => reject(e.target.error); }); }
async function dbGet(key) { const db = await initDB(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, 'readonly'); const req = tx.objectStore(STORE_NAME).get(key); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function dbSet(key, val) { const db = await initDB(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, 'readwrite'); const req = tx.objectStore(STORE_NAME).put(val, key); req.onsuccess = () => resolve(); req.onerror = () => reject(req.error); }); }
async function dbClear() { const db = await initDB(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, 'readwrite'); const req = tx.objectStore(STORE_NAME).clear(); req.onsuccess = () => resolve(); req.onerror = () => reject(req.error); }); }

// --- 데이터 로드 ---
async function loadData() {
    try {
        let raw = await dbGet(KEY);
        let migrated = false;
        if (!raw) {
            const localRaw = localStorage.getItem(KEY);
            if (localRaw) { raw = localRaw; migrated = true; } else return false;
        }
        const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
        C = d.C || {}; M = d.M || {}; 
        SysSet = d.SysSet || { closedSess: {}, deductPriority: ['T', 'B'] }; 
        SysSet.closedSess = SysSet.closedSess || {};
        SysSet.deductPriority = SysSet.deductPriority || ['T', 'B'];
        
        F = (d.F || []).map(x => ({ g: +(x.g||0), b: +(x.b||0), n: +(x.n||0), name: String(x.name||''), startQ: +(x.startQ||1), startSess: +(x.startSess||0), courses: x.courses || {} }));
        E = (d.E || []).map(x => ({ q: +(x.q||1), g: +(x.g||0), b: +(x.b||0), n: +(x.n||0), name: String(x.name||''), course: String(x.course||''), cT: (x.cT != null) ? +x.cT : null, cB: (x.cB != null) ? +x.cB : null, rT: +(x.rT||0), rB: +(x.rB||0), mm: String(x.mm||''), tMemo: String(x.tMemo||''), bMemo: String(x.bMemo||''), refunds: x.refunds || [], adjusts: x.adjusts || [], auditLog: String(x.auditLog||'엔진자동') }));
        Object.keys(M).forEach(dept => { if (M[dept].cnt !== undefined) { const old = M[dept]; M[dept] = {1:{...old}, 2:{...old}, 3:{...old}, 4:{...old}}; } });
        
        if (migrated) { await save(); localStorage.removeItem(KEY); }
        return true;
    } catch(e) { console.error('로딩 오류', e); return false; }
}

async function save() {
    try {
        const raw = JSON.stringify({C, M, F, E, SysSet});
        await dbSet(KEY, raw); 
        updateStorageUsage(raw); 
    } catch(e) { console.error('저장 실패', e); }
}

function loadManual() { if($('manualContent') && typeof manualMarkdown !== 'undefined' && typeof marked !== 'undefined') { $('manualContent').innerHTML = marked.parse(manualMarkdown); } }

window.sysBackup = function() {
    const blob = new Blob([JSON.stringify({C, M, F, E, SysSet})], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `방과후정산_백업_${new Date().toISOString().slice(0,10)}.json`; a.click();
};

function updateStorageUsage(rawString = '') {
    const el = $('storageUsage'); if (!el) return; 
    const kb = ((rawString.length * 2) / 1024).toFixed(1);
    el.innerHTML = `💾 DB저장소: <span class="text-success">${kb} KB</span> (안전저장됨)`;
}

window.addEventListener('beforeunload', function (e) {
    const confirmationMessage = "종료 전 우측 상단의 [백업]을 눌러 데이터를 PC에 보관하셨나요? (캐시 삭제 시 데이터가 유실될 수 있습니다.)";
    e.preventDefault();
    e.returnValue = confirmationMessage; 
    return confirmationMessage;
});

window.setQTab = function(q) {
    window.gQ = q; 
    [1,2,3,4].forEach(i => $('btnQTab'+i)?.classList.remove('active'));
    $('btnQTab'+q)?.classList.add('active');
    ['exEnQ', 's4_q', 'p_q1', 'p_qInvoice', 'p_q2', 'e_q'].forEach(id => { if($(id)) $(id).value = String(q); });
    f_eq = String(q);
    if($('lblMasterTab')) $('lblMasterTab').innerHTML = `<i class="bi bi-building"></i> [${q}분기] 부서 마스터`;
    if($('lblCourseTab')) $('lblCourseTab').innerHTML = `<i class="bi bi-list-check"></i> [${q}분기] 강좌 요금표`;
    regenerateC(); renderE(); autoRunSet(true); renderSetTabs();
    if (typeof initStep5 === 'function') initStep5();
};

window.addEventListener('DOMContentLoaded', () => {
    if($('mdlStuConsole') && typeof bootstrap !== 'undefined') mdlConsole = new bootstrap.Modal($('mdlStuConsole'));
    if($('mdlCourseSummary') && typeof bootstrap !== 'undefined') mdlCrsSummary = new bootstrap.Modal($('mdlCourseSummary'));
    if($('mdlFreeStart') && typeof bootstrap !== 'undefined') mdlFreeStart = new bootstrap.Modal($('mdlFreeStart'));
    if($('mdlEnrollUpload') && typeof bootstrap !== 'undefined') mdlUpload = new bootstrap.Modal($('mdlEnrollUpload'));
    if($('mdlWelcome') && typeof bootstrap !== 'undefined') mdlWelcome = new bootstrap.Modal($('mdlWelcome'));
    if($('mdlSettings') && typeof bootstrap !== 'undefined') mdlSettings = new bootstrap.Modal($('mdlSettings'));

    loadManual(); 
    
    loadData().then(hasData => {
        if (!hasData || (Object.keys(M).length === 0 && F.length === 0 && E.length === 0)) {
            mdlWelcome.show();
            updateStorageUsage('');
        } else {
            startupRoutines();
            updateStorageUsage(JSON.stringify({C, M, F, E, SysSet}));
        }
    });

    if($('restoreFile')) {
        $('restoreFile').addEventListener('change', async function() {
            const file = this.files[0]; if (!file) return; if (!confirm('기존 장부를 덮어씁니다. 진행?')) return;
            try {
                const text = await readFileAsText(file); const d = JSON.parse(text);
                C=d.C||{}; M=d.M||{}; SysSet=d.SysSet||{closedSess:{}}; SysSet.closedSess=SysSet.closedSess||{};
                SysSet.deductPriority = SysSet.deductPriority || ['T', 'B'];
                F=(d.F||[]).map(x=>({g:+(x.g??0), b:+(x.b??0), n:+(x.n??0), name:String(x.name||''), startQ: +(x.startQ||1), startSess: +(x.startSess||0), courses: x.courses||{} }));
                E=(d.E||[]).map(x=>({q:+(x.q||1), g:+(x.g??0), b:+(x.b??0), n:+(x.n??0), name:String(x.name||''), course:String(x.course||''), cT:(x.cT!=null)?+x.cT:null, cB:(x.cB!=null)?+x.cB:null, rT:+(x.rT||0), rB:+(x.rB||0), mm:String(x.mm||''), tMemo:String(x.tMemo||''), bMemo:String(x.bMemo||''), refunds:x.refunds||[], adjusts:x.adjusts||[], auditLog:String(x.auditLog||'엔진자동')}));
                Object.keys(M).forEach(dept => { if (M[dept].cnt !== undefined) { const old = M[dept]; M[dept] = {1:{...old}, 2:{...old}, 3:{...old}, 4:{...old}}; } });
                await save(); location.reload();
            } catch(err) { alert('❌ 데이터 파손'); }
        });
    }
    if($('tabStep4Btn')) { $('tabStep4Btn').addEventListener('shown.bs.tab', () => { autoRunSet(false); }); }
});

// ✅ 뱃지 업데이트를 최상단으로 이동
function startupRoutines() { 
    updateSettingBadge(); 
    E.forEach(e => recalcEnrollment(e)); 
    save(); 
    setQTab(1); 
    renderF(); 
    renderE(); 
    renderStaticHeaders(); 
}

window.startGateway = async function(mode) {
    mdlWelcome.hide();
    if (mode === 'REAL') {
        C = {}; M = {}; F = []; E = []; Ld = {}; Hs = []; SysSet = { closedSess: {}, deductPriority: ['T', 'B'] }; 
        await save(); startupRoutines();
    } else {
        generateDummyData();
        await save(); startupRoutines();
        alert('자유 샌드박스 모드입니다. 대용량 가상 데이터가 세팅되었습니다.\n마음껏 시스템을 테스트해 보세요!');
    }
};

window.resetAllData = async function() {
    if(!confirm('🚨 경고: 모든 데이터(부서, 수강생, 정산내역 등)가 영구적으로 삭제됩니다.\n정말 초기화하시겠습니까? (백업 권장)')) return;
    if(prompt('데이터를 모두 지우려면 한글로 "초기화"라고 입력해 주세요.') !== '초기화') return alert('초기화가 취소되었습니다.');
    C = {}; M = {}; F = []; E = []; Ld = {}; Hs = []; SysSet = { closedSess: {}, deductPriority: ['T', 'B'] }; 
    await dbClear(); localStorage.removeItem(KEY); location.reload();
};

window.openSettings = function() {
    const pStr = (SysSet.deductPriority || ['T', 'B']).join(',');
    document.querySelectorAll('input[name="optDeduct"]').forEach(el => { el.checked = (el.value === pStr); });
    if(mdlSettings) mdlSettings.show();
};

window.updateSettingBadge = function() {
    const badge = $('currentDeductSettingBadge');
    if (!badge) return;
    const pStr = (SysSet.deductPriority || ['T', 'B']).join(',');
    let text = "";
    if (pStr === 'T,B') text = "<span class='text-primary'>[표준형]</span> 수강료 ➔ 교재비 우선 차감";
    else if (pStr === 'B,T') text = "<span class='text-success'>[교재 우선형]</span> 교재비 ➔ 수강료 우선 차감";
    else if (pStr === 'T') text = "<span class='text-danger'>[수강료 전용]</span> 수강료만 차감 (교재비 자부담)";
    badge.innerHTML = `<i class="bi bi-info-circle-fill"></i> 현재 연산 설정 : <strong>${text}</strong>`;
};

window.saveSettings = function() {
    const val = document.querySelector('input[name="optDeduct"]:checked').value;
    SysSet.deductPriority = val.split(',');
    save(); updateSettingBadge(); autoRunSet(true); renderSetTabs(); renderE();
    if(mdlSettings) mdlSettings.hide();
    alert('✅ 환경설정이 저장되고 정산 장부가 즉시 재연산되었습니다.');
};

function generateDummyData() {
    C = {}; M = {}; F = []; E = []; SysSet = { closedSess: {}, deductPriority: ['T', 'B'] };
    M = { 
        '로봇과학': { 1:{cnt:2,inst_m:35000,mgmt_m:2000,b:45000,unit:1,mh:'4,4,4'}, 2:{cnt:2,inst_m:35000,mgmt_m:2000,b:45000,unit:1,mh:'4,4,4'}, 3:{cnt:2,inst_m:35000,mgmt_m:2000,b:45000,unit:1,mh:'4,4,4'}, 4:{cnt:2,inst_m:35000,mgmt_m:2000,b:45000,unit:1,mh:'4,4,4'} },
        '생명과학': { 1:{cnt:3,inst_m:40000,mgmt_m:2000,b:50000,unit:1,mh:'4,4,4'}, 2:{cnt:3,inst_m:40000,mgmt_m:2000,b:50000,unit:1,mh:'4,4,4'}, 3:{cnt:3,inst_m:40000,mgmt_m:2000,b:50000,unit:1,mh:'4,4,4'}, 4:{cnt:3,inst_m:40000,mgmt_m:2000,b:50000,unit:1,mh:'4,4,4'} },
        '창의수학': { 1:{cnt:2,inst_m:30000,mgmt_m:1000,b:20000,unit:1,mh:'4,4,4'}, 2:{cnt:2,inst_m:30000,mgmt_m:1000,b:20000,unit:1,mh:'4,4,4'}, 3:{cnt:2,inst_m:30000,mgmt_m:1000,b:20000,unit:1,mh:'4,4,4'}, 4:{cnt:2,inst_m:30000,mgmt_m:1000,b:20000,unit:1,mh:'4,4,4'} },
        '영어회화': { 1:{cnt:3,inst_m:50000,mgmt_m:2000,b:30000,unit:2,mh:'8,8,8'}, 2:{cnt:3,inst_m:50000,mgmt_m:2000,b:30000,unit:2,mh:'8,8,8'}, 3:{cnt:3,inst_m:50000,mgmt_m:2000,b:30000,unit:2,mh:'8,8,8'}, 4:{cnt:3,inst_m:50000,mgmt_m:2000,b:30000,unit:2,mh:'8,8,8'} },
        '체육교실': { 1:{cnt:2,inst_m:25000,mgmt_m:1500,b:0,unit:1,mh:'4,4,4'}, 2:{cnt:2,inst_m:25000,mgmt_m:1500,b:0,unit:1,mh:'4,4,4'}, 3:{cnt:2,inst_m:25000,mgmt_m:1500,b:0,unit:1,mh:'4,4,4'}, 4:{cnt:2,inst_m:25000,mgmt_m:1500,b:0,unit:1,mh:'4,4,4'} }
    }; 
    regenerateC(); const cNames = Object.keys(C);
    const surNames = "김이박최정강조윤장임한오서신권황안송류전홍고문양손배조백허유남심노정하곽성차주우구신임나전민유진지엄채원천방공강현함변염여추노도소신석선설마길주연방위표명기반왕금옥육인맹제모장남탁국여진어은편구용".split("");
    const firstNames = "민준서준도윤예준시우하준주원지호지훈준우건우현우지안서진동현단우하진민재현준준서태윤지훈성민승우도현서원정우민성준혁은우시윤윤우연우승민우진지환민석유찬승현진우지성태민준영건희동욱지용동규정민재윤호진동윤승호재민태훈성현지율민규재현재원태현동민승준태경승훈현빈성준시현윤재지환지민동진".split("");
    
    F.push({ g:1, b:1, n:1, name:'김자유(도중)', startQ:2, startSess:1, courses:{} });
    E.push({ q:1, g:1, b:1, n:1, name:'김자유(도중)', course:'로봇과학(A)', cT:null, cB:null, rT:0, rB:0, mm:'', tMemo:'', bMemo:'', refunds:[], adjusts:[], auditLog:'엔진자동' });
    E.push({ q:2, g:1, b:1, n:1, name:'김자유(도중)', course:'로봇과학(A)', cT:null, cB:null, rT:0, rB:0, mm:'', tMemo:'', bMemo:'', refunds:[], adjusts:[], auditLog:'엔진자동' });
    
    E.push({ q:1, g:3, b:2, n:5, name:'박초삼(할인)', course:'창의수학(B)', cT:null, cB:null, rT:0, rB:0, mm:'', tMemo:'', bMemo:'', refunds:[], adjusts:[{title:'다자녀할인', amtT:-15000, amtB:-5000}], auditLog:'예외적용' });
    E.push({ q:1, g:4, b:3, n:12, name:'최환불(포기)', course:'영어회화(A)', cT:null, cB:null, rT:0, rB:0, mm:'', tMemo:'', bMemo:'', refunds:[{sessIdx:1, ty:'STUDENT', ah:0, bkRefTy:'FULL', bkRefAmt:0, rt:0, rb:0, tyNm:''}], adjusts:[], auditLog:'예외적용' });
    E.push({ q:1, g:2, b:1, n:7, name:'이헤비(다중)', course:'로봇과학(A)', cT:null, cB:null, rT:0, rB:0, mm:'', tMemo:'', bMemo:'', refunds:[], adjusts:[], auditLog:'엔진자동' });
    E.push({ q:1, g:2, b:1, n:7, name:'이헤비(다중)', course:'생명과학(B)', cT:null, cB:null, rT:0, rB:0, mm:'', tMemo:'', bMemo:'', refunds:[], adjusts:[], auditLog:'엔진자동' });
    E.push({ q:1, g:2, b:1, n:7, name:'이헤비(다중)', course:'체육교실(A)', cT:null, cB:null, rT:0, rB:0, mm:'', tMemo:'', bMemo:'', refunds:[], adjusts:[], auditLog:'엔진자동' });

    for(let i=0; i<100; i++) {
        let g = Math.floor(Math.random()*6)+1, b = Math.floor(Math.random()*5)+1, n = Math.floor(Math.random()*30)+1;
        let nm = surNames[Math.floor(Math.random()*surNames.length)] + firstNames[Math.floor(Math.random()*firstNames.length)] + firstNames[Math.floor(Math.random()*firstNames.length)];
        let cCount = Math.floor(Math.random()*2)+1; 
        for(let j=0; j<cCount; j++) {
            let cNm = cNames[Math.floor(Math.random()*cNames.length)];
            let qs = [1, 2, 3, 4]; let enQs = qs.filter(() => Math.random() > 0.3); 
            enQs.forEach(q => {
                let adjust = []; if(Math.random() < 0.05) adjust.push({title:'장부교정', amtT:-Math.floor(Math.random()*5)*1000, amtB:0});
                E.push({ q, g, b, n, name:nm, course:cNm, cT:null, cB:null, rT:0, rB:0, mm:'', tMemo:'', bMemo:'', refunds:[], adjusts:adjust, auditLog:(adjust.length?'예외적용':'엔진자동') });
            });
        }
        if(Math.random() < 0.1) F.push({ g, b, n, name:nm, startQ:1, startSess:0, courses:{} });
    }
}

function renderStaticHeaders() {
    if($('tbStatHead')) $('tbStatHead').innerHTML = `<tr><th rowspan="2">강좌명</th><th rowspan="2">신청인원</th><th colspan="2" class="table-warning">실부담금(지원전) 총액</th><th colspan="2" class="bg-cho3">초3 공제합계</th><th colspan="2" class="bg-free">자유수강 공제합계</th><th colspan="2" class="table-danger">최종 징수액(자부담)</th></tr><tr><th class="table-warning">수강료계</th><th class="table-warning">교재비계</th><th class="bg-cho3">수강료</th><th class="bg-cho3">교재비</th><th class="bg-free">수강료</th><th class="bg-free">교재비</th><th class="table-danger">수강료합</th><th class="table-danger">교재비합</th></tr>`;
    if($('tbStuDtlHead')) $('tbStuDtlHead').innerHTML = `<tr><th rowspan="2" class="clickable text-dark bg-light" onclick="sortStu('DP')">학적 <span id="sort_DP"><i class="bi bi-arrow-down-up text-muted opacity-50"></i></span></th><th rowspan="2" class="clickable text-dark bg-light" onclick="sortStu('NM')">이름 <span id="sort_NM"><i class="bi bi-arrow-down-up text-muted opacity-50"></i></span></th><th rowspan="2">대상</th><th colspan="2">지원금 잔여</th><th rowspan="2">분기</th><th rowspan="2">강좌명</th><th colspan="2">실부담금(지원전)</th><th colspan="2" class="bg-cho3">초3 공제</th><th colspan="2" class="bg-free">자유 공제</th><th colspan="2" class="text-danger fw-bold">최종징수(자부담)</th><th rowspan="2" class="table-secondary">산출근거</th></tr><tr><th class="clickable text-primary bg-light" onclick="sortStu('C')">초3잔액 <span id="sort_C"><i class="bi bi-arrow-down-up text-muted opacity-50"></i></span></th><th class="clickable text-success bg-light" onclick="sortStu('F')">자유잔액 <span id="sort_F"><i class="bi bi-arrow-down-up text-muted opacity-50"></i></span></th><th>수강료</th><th>교재비</th><th class="bg-cho3">수강료</th><th class="bg-cho3">교재비</th><th class="bg-free">수강료</th><th class="bg-free">교재비</th><th class="text-danger">수강료</th><th class="text-danger">교재비</th></tr>`;
    if($('tbCrseDtlHead')) $('tbCrseDtlHead').innerHTML = `<tr><th rowspan="2">분기</th><th rowspan="2">학적</th><th rowspan="2">이름</th><th rowspan="2">대상</th><th rowspan="2">강좌명</th><th colspan="2">실부담금(지원전)</th><th colspan="2" class="bg-cho3">초3 공제</th><th colspan="2" class="bg-free">자유 공제</th><th colspan="2" class="text-danger fw-bold">최종징수(자부담)</th><th rowspan="2" class="table-secondary">산출근거</th></tr><tr><th>수강료</th><th>교재비</th><th class="bg-cho3">수강료</th><th class="bg-cho3">교재비</th><th class="bg-free">수강료</th><th class="bg-free">교재비</th><th class="text-danger">수강료</th><th class="text-danger">교재비</th></tr>`;
    if($('tbInvHead')) $('tbInvHead').innerHTML = `<tr><th>순번</th><th>강좌명</th><th>수강료<br>단가</th><th>강사료<br>단가</th><th>수용비<br>단가</th><th class="table-warning">수익자<br>인원</th><th class="table-warning">수강료</th><th class="table-warning">강사료</th><th class="table-warning">수용비</th><th class="table-primary text-primary">초3<br>인원</th><th class="table-primary text-primary">수강료</th><th class="table-primary text-primary">강사료</th><th class="table-primary text-primary">수용비</th><th class="table-success text-success">자유<br>인원</th><th class="table-success text-success">수강료</th><th class="table-success text-success">강사료</th><th class="table-success text-success">수용비</th><th class="table-danger text-danger">합계<br>인원</th><th class="table-danger text-danger">수강료</th><th class="table-danger text-danger">강사료</th><th class="table-danger text-danger">수용비</th><th class="table-secondary text-danger">차액</th><th>비고</th></tr>`;
}

window.sortStu = function(col) {
    if (sortState.col === col) sortState.asc = !sortState.asc;
    else { sortState.col = col; sortState.asc = true; }
    renderSetTabs();
};

window.dlSampleCourse = function() { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{부서명:'과학실험', 강좌수:2, '월 강사료':30000, '월 수용비':2000, '분기 기초 교재비':50000, 주간단위:1, 차수별시수:'4,4,4'}]), '부서마스터'); XLSX.writeFile(wb, '부서양식.xlsx'); };
window.upCourse = async function() { const file = $('fileCourse').files[0]; if (!file) return; try { const buf = await readFileAsArrayBuffer(file); const rows = parseXlsx(buf); if (rows.some(r => { const d = String(r['부서명']||r['강좌명']||'').trim(); return d && E.some(e => e.course.startsWith(d) && isQuarterLocked(e.q)); })) return alert('🔒 마감 분기의 부서 포함됨. 마감 해제 후 시도하세요.'); rows.forEach(r => { const dept = String(r['부서명']||r['강좌명']||'').trim(); if (!dept) return; const cnt = num(r['강좌수'])||1, inst_m = num(r['월 강사료']||r['강사료']), mgmt_m = num(r['월 수용비']||r['수용비']), b = num(r['분기 기초 교재비']||r['교재비']||0), unit = num(r['주간단위'])||1, mh = String(r['차수별시수']||r['시수']||'4,4,4').trim(); M[dept] = { 1:{cnt,inst_m,mgmt_m,b,unit,mh}, 2:{cnt,inst_m,mgmt_m,b,unit,mh}, 3:{cnt,inst_m,mgmt_m,b,unit,mh}, 4:{cnt,inst_m,mgmt_m,b,unit,mh} }; }); regenerateC(); E.forEach(e => { if (!isQuarterLocked(e.q) && M[e.course.replace(/\([A-Z]\)$/, '')]) recalcEnrollment(e); }); save(); renderE(); alert('✅ 업로드 적용 완료'); } catch(err) { alert('❌ 엑셀 구조 에러'); } finally { $('fileCourse').value=''; } };
window.addDeptMaster = function() { const dept = val('c_dept'); if (!dept) return; const base = { cnt: num($('c_cnt').value)||1, inst_m: num(val('c_inst_m')), mgmt_m: num(val('c_mgmt_m')), b: num(val('c_b')), unit: num($('c_unit').value)||1, mh: val('c_mh')||'4,4,4' }; M[dept] = { 1:{...base}, 2:{...base}, 3:{...base}, 4:{...base} }; regenerateC(); ['c_dept','c_inst_m','c_mgmt_m','c_b','c_mh'].forEach(id => { if($(id)) $(id).value=''; }); alert('✅ 복사 등록 완료'); };

window.updateM = function(dept, k, el) { 
    if(!M[dept] || !M[dept][window.gQ]) return; 
    if (isQuarterLocked(window.gQ)) { alert('🔒 마감 변경 불가'); el.value = (k==='mh')?M[dept][window.gQ][k]:fmt(M[dept][window.gQ][k]); return; } 
    if (k === 'mh') M[dept][window.gQ][k] = el.value.trim(); else { M[dept][window.gQ][k] = num(el.value); el.value = fmt(M[dept][window.gQ][k]); } 
    regenerateC(); const aff = E.filter(e => e.course.startsWith(dept) && e.q === window.gQ); aff.forEach(e => recalcEnrollment(e)); save(); renderE(); 
};

window.delDept = function(dept) { if(confirm('삭제?')) { E = E.filter(e => !e.course.startsWith(dept)); delete M[dept]; regenerateC(); } };

// 💡 1스텝 강좌별 주간단위 반영
window.regenerateC = function() { 
    const newCKeys = new Set();
    Object.keys(M).forEach(dept => { 
        [1,2,3,4].forEach(q => { 
            const md = M[dept][q]; if (!md) return; 
            const mhArr = (md.mh||'4,4,4').split(',').map(x=>num(x)).filter(x=>x>0); const tH = mhArr.reduce((a,b)=>a+b, 0); const uS = (md.unit||1)*4; 
            const qI = Math.round(((md.inst_m/uS)*tH)/10)*10; 
            const qM = Math.round(((md.mgmt_m/uS)*tH)/10)*10; 
            for(let i=0; i<md.cnt; i++) { 
                let nm = md.cnt>1 ? `${dept}(${String.fromCharCode(65+i)})` : dept; newCKeys.add(nm);
                if (!C[nm]) C[nm] = {}; 
                if (!C[nm][q] || C[nm][q]._isAuto !== false) { 
                    C[nm][q] = { t: qI+qM, b: md.b, mh: md.mh, instTot: qI, mgmtTot: qM, unit: md.unit || 1, _isAuto: true }; 
                } else {
                    if (C[nm][q].unit === undefined) C[nm][q].unit = md.unit || 1;
                }
            } 
        }); 
    }); 
    Object.keys(C).forEach(nm => { if(!newCKeys.has(nm)) delete C[nm]; }); save(); renderM(); renderC(); 
    if($('e_c')) $('e_c').innerHTML = '<option value="">강좌선택</option>' + Object.keys(C).map(nm => `<option value="${nm}">${nm}</option>`).join(''); 
};

// 💡 강좌 단가 수정 (주간단위 및 시수 변경 시 자동 재계산)
window.updateC = function(nm, key, el) {
    if (isQuarterLocked(window.gQ)) { alert('🔒 마감된 분기이므로 금액을 수정할 수 없습니다.'); el.value = (key==='mh') ? C[nm][window.gQ][key] : fmt(C[nm][window.gQ][key]); return; }
    const oldVal = C[nm][window.gQ][key]; let newVal = (key==='mh') ? el.value.trim() : num(el.value);
    if (oldVal === newVal) { el.value = (key==='mh') ? newVal : fmt(newVal); return; }
    
    if (key === 'mh') C[nm][window.gQ][key] = newVal; else { C[nm][window.gQ][key] = newVal; el.value = fmt(newVal); }
    
    if (key === 'unit' || key === 'mh') {
        const deptNm = nm.replace(/\([A-Z]\)$/, ''); 
        const md = M[deptNm]?.[window.gQ];
        if (md) {
            const currentMhArr = (C[nm][window.gQ].mh||'4,4,4').split(',').map(x=>num(x)).filter(x=>x>0);
            const tH = currentMhArr.reduce((a,b)=>a+b, 0);
            const currentUnit = C[nm][window.gQ].unit || 1;
            const uS = currentUnit * 4; 
            
            C[nm][window.gQ].instTot = Math.round(((md.inst_m/uS)*tH)/10)*10;
            C[nm][window.gQ].mgmtTot = Math.round(((md.mgmt_m/uS)*tH)/10)*10;
        }
    }

    if (key === 'instTot' || key === 'mgmtTot' || key === 'unit' || key === 'mh') { 
        C[nm][window.gQ].t = C[nm][window.gQ].instTot + C[nm][window.gQ].mgmtTot; 
    }
    
    C[nm][window.gQ]._isAuto = false; 
    const aff = E.filter(e => e.course === nm && e.q === window.gQ); 
    aff.forEach(e => recalcEnrollment(e)); 
    save(); renderC(); renderE(); autoRunSet(true); renderSetTabs();
};

window.resetC = function(nm, q) {
    if (isQuarterLocked(q)) return alert('🔒 마감된 분기이므로 초기화할 수 없습니다.');
    if (C[nm] && C[nm][q]) C[nm][q]._isAuto = true; regenerateC();
    const aff = E.filter(e => e.course === nm && e.q === q); aff.forEach(e => recalcEnrollment(e)); save(); renderE(); autoRunSet(true); renderSetTabs();
};

function renderM() { if(!$('tbMaster')) return; const keys = Object.keys(M); if(!keys.length) return $('tbMaster').innerHTML = '<tbody><tr><td class="text-muted py-3">등록 부서 없음</td></tr></tbody>'; let h = `<thead class="table-light"><tr><th>부서명</th><th>강좌수</th><th>월 강사료</th><th>월 수용비</th><th>기초 교재비</th><th>주간단위</th><th>시수</th><th>삭제</th></tr></thead><tbody>`; keys.forEach(dept => { const d = M[dept][window.gQ] || {cnt:1,inst_m:0,mgmt_m:0,b:0,unit:1,mh:'4,4,4'}; const safe = dept.replace(/'/g, "\\'"); h += `<tr><td class="fw-bold align-middle text-primary">${dept}</td><td><input class="form-control form-control-sm text-center mx-auto" style="width:50px" value="${d.cnt}" onblur="updateM('${safe}','cnt',this)"></td><td><input class="fmt-num mx-auto" style="width:70px" value="${fmt(d.inst_m)}" onblur="updateM('${safe}','inst_m',this)"></td><td><input class="fmt-num mx-auto" style="width:70px" value="${fmt(d.mgmt_m)}" onblur="updateM('${safe}','mgmt_m',this)"></td><td><input class="fmt-num mx-auto" style="width:70px" value="${fmt(d.b)}" onblur="updateM('${safe}','b',this)"></td><td><input class="form-control form-control-sm text-center mx-auto" style="width:50px" value="${d.unit}" onblur="updateM('${safe}','unit',this)"></td><td><input class="form-control form-control-sm text-center mx-auto" style="width:60px" value="${d.mh}" onblur="updateM('${safe}','mh',this)"></td><td><button class="btn btn-sm btn-outline-danger py-0" onclick="delDept('${safe}')"><i class="bi bi-trash"></i></button></td></tr>`; }); $('tbMaster').innerHTML = h + '</tbody>'; }

function renderC() { 
    if(!$('tbCourse')) return; const keys = Object.keys(C); if (!keys.length) return $('tbCourse').innerHTML = '<tbody><tr><td class="text-muted py-3">산출 강좌 없음</td></tr></tbody>'; 
    let h = `<thead class="table-light"><tr><th>생성 강좌명 (클릭: 팝업정산)</th><th class="table-warning">총 수강료(분기)</th><th class="table-warning text-primary">강사료</th><th class="table-warning text-danger">수용비</th><th class="table-info">기초 교재비</th><th>주간단위</th><th>시수</th><th>초기화</th></tr></thead><tbody>`; 
    keys.forEach(nm => { 
        const d = C[nm][window.gQ] || {t:0,b:0,mh:'',instTot:0,mgmtTot:0, unit:1}; const safe = nm.replace(/'/g, "\\'");
        const badge = d._isAuto === false ? '<span class="badge bg-danger ms-1" style="font-size:0.65rem;" title="수동 변경됨">수동</span>' : '';
        h += `<tr><td class="course-link text-start" onclick="openCourseSummary('${safe}', window.gQ)">${nm} ${badge}</td><td class="fw-bold bg-light">${fmt(d.t)}</td><td><input class="fmt-num mx-auto text-primary fw-bold" style="width:70px" value="${fmt(d.instTot)}" onblur="updateC('${safe}','instTot',this)"></td><td><input class="fmt-num mx-auto text-danger fw-bold" style="width:70px" value="${fmt(d.mgmtTot)}" onblur="updateC('${safe}','mgmtTot',this)"></td><td><input class="fmt-num mx-auto fw-bold" style="width:70px" value="${fmt(d.b)}" onblur="updateC('${safe}','b',this)"></td><td><input class="form-control form-control-sm text-center mx-auto fw-bold text-success" style="width:50px" value="${d.unit||1}" onblur="updateC('${safe}','unit',this)"></td><td><input class="form-control form-control-sm text-center mx-auto fw-bold" style="width:60px" value="${d.mh}" onblur="updateC('${safe}','mh',this)"></td><td><button class="btn btn-sm btn-outline-secondary py-0" onclick="resetC('${safe}', window.gQ)" title="마스터 기준으로 복구"><i class="bi bi-arrow-clockwise"></i></button></td></tr>`; 
    }); 
    $('tbCourse').innerHTML = h + '</tbody>'; 
}

window.dlSampleFree = function() { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{학년:1, 반:1, 번호:1, 이름:'홍길동', 시작분기:1, 시작차수:1}]), '명단'); XLSX.writeFile(wb, '자유수강권.xlsx'); };
window.upFree = async function() { const file = $('fileFree').files[0]; if (!file) return; try { const buf = await readFileAsArrayBuffer(file); const rows = parseXlsx(buf); let added = 0; rows.forEach(r => { const nm = String(r['이름']||r['성명']||'').trim(); if (!nm) return; const g=num(r['학년']), b=num(r['반']), n=num(r['번호']), k=uid(g,b,n,nm); const sQ=num(r['시작분기'])||1, sS=Math.max(0, (num(r['시작차수'])||1)-1); if (!F.some(x => uid(x.g,x.b,x.n,x.name)===k)) { F.push({g,b,n,name:nm, startQ:sQ, startSess:sS, courses:{}}); added++; } }); save(); renderF(); alert(`✅ 업로드 완료 (신규: ${added}건)`); } catch(err) { alert('❌ 에러'); } finally { $('fileFree').value = ''; } };
window.addFree = function() { const nm = val('f_nm'); if (!nm) return; F.push({g:num(val('f_g')), b:num(val('f_b')), n:num(val('f_n')), name:nm, startQ:num(val('f_sq')), startSess:num(val('f_ss'))-1, courses:{} }); save(); renderF(); ['f_n','f_nm'].forEach(id => { if($(id)) $(id).value = ''; }); if($('f_n')) $('f_n').focus(); };
window.delF = function(i) { F.splice(i,1); save(); renderF(); };
window.changeFreeStart = function(i) { const f = F[i]; curEditFreeIdx = i; if($('fs_stuName')) $('fs_stuName').textContent = f.name + " 지원시점 설정"; f.courses = f.courses || {}; const stuId = uid(f.g, f.b, f.n, f.name); const stuEnrolls = E.filter(e => uid(e.g, e.b, e.n, e.name) === stuId); const uniqueCourses = [...new Set(stuEnrolls.map(e => e.course))]; let html = ''; if (uniqueCourses.length === 0) { html = '<div class="text-muted small text-center py-3">해당 학생이 수강 중인 강좌가 없습니다.</div>'; } else { uniqueCourses.forEach((cName) => { const cData = f.courses[cName] || { q: f.startQ || 1, s: f.startSess || 0, h: 1 }; html += `<div class="row g-2 align-items-center mb-2 pb-2 border-bottom fs-row" data-course="${cName.replace(/"/g, '&quot;')}"><div class="col-12 fw-bold text-primary small text-start">${cName}</div><div class="col-4"><select class="form-select form-select-sm fs-q" onchange="updateFsHours(this)"><option value="1" ${cData.q==1?'selected':''}>1분기</option><option value="2" ${cData.q==2?'selected':''}>2분기</option><option value="3" ${cData.q==3?'selected':''}>3분기</option><option value="4" ${cData.q==4?'selected':''}>4분기</option></select></div><div class="col-4"><select class="form-select form-select-sm fs-s" onchange="updateFsHours(this)"><option value="0" ${cData.s==0?'selected':''}>1차수</option><option value="1" ${cData.s==1?'selected':''}>2차수</option><option value="2" ${cData.s==2?'selected':''}>3차수</option></select></div><div class="col-4"><select class="form-select form-select-sm fs-h border-primary fw-bold" data-selected="${cData.h}"></select></div></div>`; }); } if($('fs_courseList')) $('fs_courseList').innerHTML = html; document.querySelectorAll('.fs-row').forEach(row => { updateFsHours(row.querySelector('.fs-q')); }); if(mdlFreeStart) mdlFreeStart.show(); };
window.updateFsHours = function(el) { const row = el.closest('.fs-row'); const course = row.getAttribute('data-course'); const q = num(row.querySelector('.fs-q').value); const s = num(row.querySelector('.fs-s').value); const hSelect = row.querySelector('.fs-h'); const selectedH = num(hSelect.getAttribute('data-selected')) || 1; const base = C[course]?.[q] || {mh: '4,4,4'}; const mhArr = (base.mh || '4,4,4').split(',').map(x=>num(x)).filter(x=>x>0); const maxH = mhArr[s] || 4; let options = ''; for(let i=1; i<=maxH; i++) { options += `<option value="${i}" ${i===Math.min(selectedH, maxH) ? 'selected':''}>${i}시수 째~</option>`; } hSelect.innerHTML = options; hSelect.onchange = function() { this.setAttribute('data-selected', this.value); }; };
window.saveFreeStart = function() { if (curEditFreeIdx < 0) return; const f = F[curEditFreeIdx]; f.courses = {}; let isAllDefault = true; document.querySelectorAll('.fs-row').forEach(row => { const course = row.getAttribute('data-course'); const q = num(row.querySelector('.fs-q').value); const s = num(row.querySelector('.fs-s').value); const h = num(row.querySelector('.fs-h').value); if (q !== f.startQ || s !== f.startSess || h !== 1) { isAllDefault = false; } f.courses[course] = { q, s, h }; }); if (isAllDefault) { f.courses = {}; } if(mdlFreeStart) mdlFreeStart.hide(); save(); renderF(); autoRunSet(true); renderE(); renderSetTabs(); };
window.resetFreeStart = function() { if (curEditFreeIdx < 0) return; F[curEditFreeIdx].courses = {}; if(mdlFreeStart) mdlFreeStart.hide(); save(); renderF(); autoRunSet(true); renderE(); renderSetTabs(); };

function renderF() { 
    if($('cnt_f')) $('cnt_f').textContent = F.length; if(!$('tbFree')) return; 
    const onlyCustom = $('chkOnlyCustomFree')?.checked; 
    
    // 💡 [패치] .sort() 체인을 추가하여 무조건 학적(학년-반-번호)순으로 정렬
    const ls = F.map((f, i) => ({...f, _i: i})).filter(f => { 
        const isCustom = Object.keys(f.courses || {}).length > 0; 
        if(onlyCustom && !isCustom) return false; return true; 
    }).sort((a, b) => a.g - b.g || a.b - b.b || a.n - b.n || a.name.localeCompare(b.name)); 
    
    if(F.length === 0) { $('tbFree').innerHTML = `<tr><td colspan="5" class="py-5 text-muted bg-light"><i class="bi bi-info-circle fs-3 d-block mb-2 text-success"></i>아직 자유수강권 대상자가 없습니다.<br>좌측에서 엑셀을 업로드하거나 개별 등록해주세요.</td></tr>`; return; } 
    if(ls.length === 0 && onlyCustom) { $('tbFree').innerHTML = `<tr><td colspan="5" class="py-5 text-muted bg-light">강좌별 개별 지정이 세팅된 학생이 없습니다.</td></tr>`; return; } 
    
    $('tbFree').innerHTML = `<thead class="table-light"><tr><th>학적</th><th>이름</th><th>지원액</th><th>지원시점 (클릭수정)</th><th>관리</th></tr></thead><tbody>` + ls.map(f => { 
        const isCustom = Object.keys(f.courses || {}).length > 0; 
        let btnClass = "btn-outline-success"; let btnText = "기본설정 ⚙️";
        if (isCustom) { btnClass = "btn-warning text-dark"; btnText = "강좌별 개별지정 ✏️"; } 
        else if (f.startQ > 1 || f.startSess > 0) { btnClass = "btn-info text-dark border-info"; btnText = `${f.startQ}분기 ${f.startSess+1}차수 시작 ⚙️`; }
        return `<tr><td>${dsp(f.g,f.b,f.n)}</td><td class="fw-bold"><span class="clickable text-dark" onclick="openStuConsole('${uid(f.g,f.b,f.n,f.name).replace(/'/g,"\\'")}')">${f.name}</span></td><td class="text-success fw-bold">600,000</td><td><button class="btn btn-sm ${btnClass} rounded-pill py-0 px-3 fw-bold shadow-sm" onclick="changeFreeStart(${f._i})" title="클릭하여 강좌별 지원 시점 변경" style="font-size:0.8rem;">${btnText}</button></td><td><button class="btn btn-sm btn-outline-danger py-0" onclick="delF(${f._i})">삭제</button></td></tr>`; 
    }).join('') + `</tbody>`; 
}

window.migrateToNextQuarter = function() {
    const nextQ = window.gQ + 1; if (nextQ > 4) return alert('이미 4분기이므로 이월할 수 없습니다.');
    if (!confirm(`${window.gQ}분기의 수강생 명단(강좌 유지)을 ${nextQ}분기로 복사하시겠습니까?\n\n이월 완료 후 3스텝에서 이탈자만 선택하여 삭제하시면 됩니다.`)) return;
    const currentEnrollments = E.filter(e => e.q === window.gQ); let addedCount = 0;
    currentEnrollments.forEach(e => {
        const exist = E.some(x => x.q === nextQ && uid(x.g, x.b, x.n, x.name) === uid(e.g, e.b, e.n, e.name) && x.course === e.course);
        if (!exist) { const nextE = { ...e, q: nextQ, cT: null, cB: null, rT: 0, rB: 0, mm: '분기 이월', tMemo: '', bMemo: '', refunds: [], adjusts: [], auditLog: '엔진자동' }; recalcEnrollment(nextE); E.push(nextE); addedCount++; }
    });
    save(); renderE(); autoRunSet(true); renderSetTabs(); alert(`✅ ${nextQ}분기로 ${addedCount}건의 명단이 성공적으로 이월되었습니다.`); window.setQTab(nextQ);
};

window.dlSampleUnified = function() { const wb = XLSX.utils.book_new(); const unifiedSample = [{'강좌명': '로봇과학', '학년': 1, '반': 1, '번호': 1, '이름': '홍길동', '비고': '신규등록'}]; XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unifiedSample), '통합업로드양식'); XLSX.writeFile(wb, '수강생명단_통합양식.xlsx'); };
window.dlSampleSeparate = function() { const wb = XLSX.utils.book_new(); const courses = Object.keys(C); const separateSample = [{'학년': 1, '반': 1, '번호': 1, '이름': '김철수', '비고': '신규등록'}]; if (courses.length === 0) { XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(separateSample), '강좌명(수정요망)'); } else { courses.forEach(c => { const safeName = c.substring(0, 31).replace(/[\[\]*?:\/\\]/g, ''); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(separateSample), safeName); }); } XLSX.writeFile(wb, '수강생명단_강좌별시트양식.xlsx'); };

window.upEnroll = async function() { 
    const fs = Array.from($('fileEnroll').files); if (!fs.length) return; const q = num(val('exEnQ')); 
    if (isQuarterLocked(q)) { alert('🔒 해당 분기에 이미 마감된 차수가 있습니다.\n명단을 변경하거나 추가하려면 먼저 4스텝에서 모든 마감을 역순으로 해제해 주세요.'); $('fileEnroll').value = ''; return; }
    pendingEnrollData = []; 
    for (const f of fs) { 
        const buf = await readFileAsArrayBuffer(f); const wb = XLSX.read(new Uint8Array(buf), {type:'array'}); 
        wb.SheetNames.forEach(sn => { 
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], {defval:''}); if (rows.length === 0) return;
            const isUnified = rows[0].hasOwnProperty('강좌명');
            for (const r of rows) { 
                const nm = String(r['이름']||r['성명']||'').trim(); if (!nm) continue; 
                let c = ''; if (isUnified) { c = String(r['강좌명']||'').trim(); if (!C[c]) continue; } else { c = sn.trim(); if (!C[c]) continue; }
                const g=num(r['학년']), b=num(r['반']), n=num(r['번호']); pendingEnrollData.push({ q, g, b, n, name: nm, course: c, mm: String(r['비고']||'').trim() });
            } 
        }); 
    }
    if(pendingEnrollData.length === 0) { $('fileEnroll').value = ''; return alert('업로드할 유효한 명단이 없습니다. (강좌명이나 양식을 확인하세요)'); }
    if(mdlUpload) mdlUpload.show(); else execEnrollUpload('APPEND'); 
};

window.execEnrollUpload = function(mode) {
    if(mdlUpload) mdlUpload.hide();
    const q = pendingEnrollData.length > 0 ? pendingEnrollData[0].q : window.gQ; let added = 0;
    if (mode === 'OVERWRITE') {
        const uploadedCourses = [...new Set(pendingEnrollData.map(d => d.course))];
        E = E.filter(e => { if (e.q === q && uploadedCourses.includes(e.course)) { const hasHistory = (e.adjusts && e.adjusts.length > 0) || (e.refunds && e.refunds.length > 0) || isQuarterLocked(e.q); if (hasHistory) return true; return false; } return true; });
    }
    const exist = new Set(E.map(e => `${e.q}_${e.course}_${uid(e.g,e.b,e.n,e.name)}`)); 
    pendingEnrollData.forEach(r => {
        const id = `${r.q}_${r.course}_${uid(r.g,r.b,r.n,r.name)}`;
        if (!exist.has(id)) { let newE = { q: r.q, g: r.g, b: r.b, n: r.n, name: r.name, course: r.course, cT: null, cB: null, rT: 0, rB: 0, mm: r.mm, tMemo:'', bMemo:'', refunds: [], adjusts: [], auditLog: '엔진자동' }; recalcEnrollment(newE); E.push(newE); exist.add(id); added++; }
    });
    save(); renderE(); autoRunSet(true); renderSetTabs(); $('fileEnroll').value = ''; pendingEnrollData = [];
    alert(`✅ ${mode === 'OVERWRITE' ? '안전하게 덮어쓰기' : '추가(병합)'} 완료 (신규 등록: ${added}건)`);
};

window.addEnroll = function() { if(!val('e_c') || !val('e_nm')) return; const q = num(val('e_q')); if (isQuarterLocked(q)) return alert('🔒 마감 분기'); let newE = { q, g: num(val('e_g')), b: num(val('e_b')), n: num(val('e_n')), name: val('e_nm'), course: val('e_c'), cT: null, cB: null, rT: 0, rB: 0, mm: '', tMemo:'', bMemo:'', refunds: [], adjusts: [], auditLog: '엔진자동' }; recalcEnrollment(newE); E.push(newE); save(); renderE(); $('e_nm').value = ''; $('e_n').focus(); };
window.delE = function(i) { if(isQuarterLocked(E[i].q)) return alert('🔒 마감 변경 불가'); if(confirm('삭제?')) { E.splice(i,1); save(); renderE(); } };
window.toggleQ = function(q) { f_eq = (f_eq === String(q)) ? 'ALL' : String(q); renderE(); };
window.toggleC = function(c) { f_ec = (f_ec === c) ? 'ALL' : c; renderE(); };

function renderEFilters() { const el = $('tbMatrix'); if (!el) return; const cKeys = Object.keys(C).sort(); if (!cKeys.length) return el.innerHTML = "<tr><td class='text-muted py-2'>강좌 없음</td></tr>"; const stat = {}; cKeys.forEach(c => stat[c] = {1:0,2:0,3:0,4:0,tot:0}); const qTot = {1:0,2:0,3:0,4:0,tot:0}; E.forEach(e => { if (stat[e.course]) { stat[e.course][e.q]++; stat[e.course].tot++; qTot[e.q]++; qTot.tot++; } }); let h = `<thead class="table-light"><tr><th><button class="btn btn-sm btn-dark w-100" onclick="f_eq='ALL';f_ec='ALL';renderE();">전체</button></th>`; cKeys.forEach(c => h += `<th><button class="btn btn-sm w-100 ${f_ec===c?'btn-primary fw-bold':'btn-outline-primary'}" onclick="toggleC('${c.replace(/'/g,"\\'")}')">${c}</button></th>`); h += `<th class="bg-secondary text-white">계</th></tr></thead><tbody>`; [1,2,3,4].forEach(q => { h += `<tr><td><button class="btn btn-sm w-100 ${f_eq===String(q)?'btn-primary fw-bold':'btn-outline-primary'}" onclick="window.setQTab(${q});">${q}분기</button></td>`; cKeys.forEach(c => h += `<td class="${(f_eq===String(q)&&(f_ec==='ALL'||f_ec===c))?'bg-primary bg-opacity-10 fw-bold':''}">${stat[c][q]||'-'}</td>`); h += `<td class="fw-bold bg-light">${qTot[q]}</td></tr>`; }); $('tbMatrix').innerHTML = h + `</tbody>`; }

function renderE() { 
    renderEFilters(); if(!$('tbEnroll')) return; 
    const oA = $('chkOnlyAdjust')?.checked, oR = $('chkOnlyRefund')?.checked; 
    
    // 💡 [패치] .sort() 부분을 분기 -> 학년 -> 반 -> 번호 순으로 변경
    const ls = E.map((e,i)=>({...e,_i:i})).filter(e => { 
        if(f_eq !== 'ALL' && String(e.q) !== f_eq) return false; 
        if(f_ec !== 'ALL' && e.course !== f_ec) return false; 
        if(oA && (!e.adjusts || e.adjusts.length === 0)) return false; 
        if(oR && (!e.refunds || e.refunds.length === 0)) return false; 
        return true; 
    }).sort((a,b) => a.q - b.q || a.g - b.g || a.b - b.b || a.n - b.n || a.name.localeCompare(b.name)); 
    
    if($('cnt_e')) $('cnt_e').textContent = ls.length; 

    if (ls.length === 0) { let msg = E.length === 0 ? `<i class="bi bi-emoji-smile fs-2 d-block mb-2 text-primary"></i>수강생 데이터가 비어 있습니다.<br><button class="btn btn-outline-primary btn-sm mt-3 fw-bold" onclick="document.querySelector('#myTab button[data-bs-target=\\'#step1\\']').click()">👉 1스텝 부서 세팅 먼저 확인하기</button>` : `<i class="bi bi-search fs-2 d-block mb-2 text-secondary"></i>조건에 맞는 수강생이 없습니다.`; $('tbEnroll').innerHTML = `<tr><td colspan="7" class="py-5 text-muted bg-light">${msg}</td></tr>`; return; } 
    
    let h = `<thead class="table-light"><tr><th>분기</th><th>학적/이름 (팝업콘솔)</th><th>강좌명 (팝업명세)</th><th>실부담금(지원전) 수강료</th><th>실부담금(지원전) 교재비</th><th>상세 증빙 적요</th><th>관리</th></tr></thead><tbody>`; 
    ls.forEach(e => { 
        const locked = isQuarterLocked(e.q), rowCls = locked ? 'locked-row' : ''; 
        const info = (e.adjusts?.length>0 ? `<span class="badge bg-warning text-dark me-1">조정</span>` : '') + (e.refunds?.length>0 ? `<span class="badge bg-danger">환불</span>` : ''); 
        h += `<tr class="${rowCls}"><td><span class="badge bg-secondary">${e.q}분기</span></td><td class="fw-bold"><span class="clickable text-dark" onclick="openStuConsole('${uid(e.g,e.b,e.n,e.name).replace(/'/g,"\\'")}')">${dsp(e.g,e.b,e.n)} ${e.name}</span></td><td class="course-link" onclick="openCourseSummary('${e.course.replace(/'/g, "\\'")}', ${e.q})">${e.course}</td><td class="text-primary fw-bold">${fmt(e.cT)}</td><td class="text-success fw-bold">${fmt(e.cB)}</td><td class="text-start" style="font-size:0.8rem;">${info} ${e.mm||''}</td><td><button class="btn btn-sm btn-outline-danger py-0" onclick="delE(${e._i})" ${locked?'disabled':''}>삭제</button></td></tr>`; 
    }); 
    $('tbEnroll').innerHTML = h + '</tbody>'; 
}

// ✅ Math.round를 Math.trunc(단순 절사)로 변경하여 음수 파생 방지
window.getSessSplit = function(tAmt, sIdx, mhArr) { 
    if (tAmt === 0) return 0; 
    const isMinus = tAmt < 0; 
    const absAmt = Math.abs(tAmt); 
    const totalHours = mhArr.reduce((a, b) => a + b, 0); 
    
    if (sIdx === mhArr.length - 1) { 
        let pSum = 0; 
        for(let j=0; j<sIdx; j++) pSum += Math.trunc((absAmt * (mhArr[j]/totalHours))/10)*10; 
        const res = absAmt - pSum; 
        return isMinus ? -res : res; 
    } 
    else { 
        const res = Math.trunc((absAmt * (mhArr[sIdx]/totalHours))/10)*10; 
        return isMinus ? -res : res; 
    } 
};

window.recalcEnrollment = function(e) {
    const base = C[e.course]?.[e.q] || {t:0, b:0, mh:'4,4,4'}; const mhArr = (base.mh || '4,4,4').split(',').map(x=>num(x)).filter(x=>x>0);
    e.adjusts = e.adjusts || []; e.refunds = e.refunds || [];
    let totAdjT = e.adjusts.reduce((s, a) => s + (a.amtT || 0), 0); let totAdjB = e.adjusts.reduce((s, a) => s + (a.amtB || 0), 0);
    let tMemos = [], bMemos = [];

    e.refunds.forEach(r => {
        let rt = 0, rb = 0, tyNm = '';
        if (r.ty === 'BEFORE') { rt = base.t; tyNm = `[개시전(분기전액)] 환:${fmt(rt)}`; }
        else {
            const bT = getSessSplit(base.t, r.sessIdx, mhArr);
            // 💡 [패치] 강좌별 주간단위를 기준으로 결석 환불액 정확도 교정
            if (r.ty === 'DISEASE') { 
                const md = M[e.course.replace(/\([A-Z]\)$/, '')]?.[e.q] || {}; 
                const cUnit = base.unit || md.unit || 1; 
                const unitFee = Math.ceil(((md.inst_m||0)+(md.mgmt_m||0))/(cUnit*4)/10)*10; 
                rt = Math.ceil((unitFee * r.ah)/10)*10; 
                tyNm = `[결석(${r.sessIdx+1}차)] 환:${fmt(rt)}`; 
            }
            else if (r.ty === 'STUDENT') { if (r.ah === 0) { rt = bT; } else { const ratio = r.ah/(mhArr[r.sessIdx]||4); if (ratio <= 1/3) rt=Math.ceil(bT*(2/3)/10)*10; else if (ratio <= 1/2) rt=Math.ceil(bT*(1/2)/10)*10; } for (let j = r.sessIdx + 1; j < mhArr.length; j++) rt += getSessSplit(base.t, j, mhArr); tyNm = `[포기(${r.sessIdx+1}차)] 환:${fmt(rt)}`; }
        }
        
        if (r.bkRefTy === 'FULL') { rb = base.b; }
        else if (r.bkRefTy === 'MANUAL') { rb = r.bkRefAmt || 0; }
        else if (r.reqBk && !r.bkRefTy) { rb = r.ty === 'BEFORE' ? base.b : getSessSplit(base.b, r.sessIdx, mhArr); }

        r.rt = rt; r.rb = rb; r.tyNm = tyNm;
        if (r.rt>0) tMemos.push(r.tyNm); if (r.rb>0) bMemos.push(`[교재환불] -${fmt(r.rb)}`);
    });
    e.adjusts.forEach(a => { if(a.amtT!==0) tMemos.push(`[조정]${a.title}:${fmt(a.amtT)}`); if(a.amtB!==0) bMemos.push(`[교재조정]${a.title}:${fmt(a.amtB)}`); });
    e.tMemo = tMemos.join(', '); e.bMemo = bMemos.join(', '); e.mm = [e.tMemo, e.bMemo].filter(Boolean).join(' | ');
    e.rT = e.refunds.reduce((s,r)=>s+r.rt,0); e.rB = e.refunds.reduce((s,r)=>s+r.rb,0);
    e.cT = Math.max(0, base.t + totAdjT - e.rT); e.cB = Math.max(0, base.b + totAdjB - e.rB);
    e.auditLog = '엔진자동';
    if (e.adjusts.length > 0 || e.refunds.length > 0) { e.auditLog = '예외적용'; }
    if (isQuarterLocked(e.q)) { e.auditLog = '마감/이관'; }
};

window.switchFromStuToCourse = function(cName, q) { if(mdlConsole && mdlConsole._isShown) mdlConsole.hide(); setTimeout(() => openCourseSummary(cName, q), 350); };

window.openStuConsole = function(uidStr) { 
    if(mdlCrsSummary && mdlCrsSummary._isShown) mdlCrsSummary.hide();
    cUid = uidStr; cEnrolls = []; 
    E.forEach((e, idx) => { if (uid(e.g, e.b, e.n, e.name) === uidStr) cEnrolls.push(idx); }); 
    if(cEnrolls.length === 0) return alert('내역이 없습니다.'); 
    cEnrolls.sort((a, b) => { const qA = E[a].q, qB = E[b].q; if (qA === window.gQ && qB !== window.gQ) return -1; if (qA !== window.gQ && qB === window.gQ) return 1; if (qA !== qB) return qA - qB; return E[a].course.localeCompare(E[b].course); });
    autoRunSet(true); cActiveEIdx = cEnrolls[0]; 
    const p = uidStr.split('-'); if($('consoleTitle')) $('consoleTitle').innerHTML = `<i class="bi bi-person-lines-fill"></i> [${p[0]}학년 ${p[1]}반] ${p[3]} 통합 회계 콘솔`; 
    renderConsole(); setTimeout(() => mdlConsole.show(), 350); 
};

window.previewConsoleRef = function() { 
    if(cActiveEIdx < 0) return; 
    const e = E[cActiveEIdx]; const base = C[e.course]?.[e.q] || {t:0, b:0, mh:'4,4,4'}; 
    const mhArr = (base.mh || '4,4,4').split(',').map(x=>num(x)).filter(x=>x>0); 
    const ty = val('c_ref_ty'); const sIdx = num($('c_ref_idx')?.value); const ah = num(val('c_ref_ah')); 
    const bkTy = val('c_ref_bk_ty');
    
    let rt = 0, rb = 0; 
    if (ty === 'BEFORE') { rt = base.t; } 
    else { 
        const bT = getSessSplit(base.t, sIdx, mhArr); 
        // 💡 [패치] 강좌별 주간단위를 기준으로 결석 환불액 정확도 교정
        if (ty === 'DISEASE') { 
            const md = M[e.course.replace(/\([A-Z]\)$/, '')]?.[e.q] || {}; 
            const cUnit = base.unit || md.unit || 1;
            const unitFee = Math.ceil(((md.inst_m||0)+(md.mgmt_m||0))/(cUnit*4)/10)*10; 
            rt = Math.ceil((unitFee * ah)/10)*10; 
        } 
        else if (ty === 'STUDENT') { if (ah === 0) { rt = bT; } else { const ratio = ah/(mhArr[sIdx]||4); if (ratio <= 1/3) rt=Math.ceil(bT*(2/3)/10)*10; else if (ratio <= 1/2) rt=Math.ceil(bT*(1/2)/10)*10; } for (let j = sIdx + 1; j < mhArr.length; j++) rt += getSessSplit(base.t, j, mhArr); } 
    } 
    
    if (bkTy === 'FULL') rb = base.b;
    else if (bkTy === 'MANUAL') rb = num(val('c_ref_bk_amt'));

    if($('c_ref_preview')) { $('c_ref_preview').innerHTML = `💡 예상 환불액: 수강료 <span class="text-danger">${fmt(rt)}</span>원 / 교재비 <span class="text-danger">${fmt(rb)}</span>원`; } 
};
window.updateConsoleRefHours = function() { const e = E[cActiveEIdx]; if(!e) return; const base = C[e.course]?.[e.q] || {t:0, b:0, mh:'4,4,4'}; const mhArr = (base.mh || '4,4,4').split(',').map(x=>num(x)).filter(x=>x>0); const idxEl = $('c_ref_idx'); const ahEl = $('c_ref_ah'); if(!idxEl || !ahEl) return; const sIdx = num(idxEl.value); const maxH = mhArr[sIdx] || 4; const currentVal = num(ahEl.value || 0); let opts = ''; for(let i=0; i<=maxH; i++) { opts += `<option value="${i}" ${i === Math.min(currentVal, maxH) ? 'selected' : ''}>${i}시수</option>`; } ahEl.innerHTML = opts; };

window.renderConsole = function() {
    const L = Ld[cUid] || { cB:0, fB:0, isC: false, isF: false, qBal: { 0: {cB:0, fB:0} } }; 
    const activeQ = E[cActiveEIdx]?.q || window.gQ; 
    
    const balC = L.qBal ? (L.qBal[activeQ] ? L.qBal[activeQ].cB : 0) : 0;
    const balF = L.qBal ? (L.qBal[activeQ] ? L.qBal[activeQ].fB : 0) : 0;
    
    let qTotalSelf = 0; Hs.filter(h => h.id === cUid && h.q === activeQ).forEach(h => { qTotalSelf += (h.finT + h.finB); });

    const txtC = L.isC ? `<span class="text-primary">${fmt(balC)}원</span>` : `<span class="text-muted fs-6 fw-normal">대상아님</span>`;
    const txtF = L.isF ? `<span class="text-success">${fmt(balF)}원</span>` : `<span class="text-muted fs-6 fw-normal">대상아님</span>`;
    
    $('consoleTop').innerHTML = `<div><span class="small fw-bold text-primary">[${activeQ}분기 기준] 초3 잔액</span><h5 class="fw-bold mb-0">${txtC}</h5></div><div><span class="small fw-bold text-success">[${activeQ}분기 기준] 자유 잔액</span><h5 class="fw-bold mb-0">${txtF}</h5></div><div><span class="small fw-bold text-danger">[${activeQ}분기] 총 징수액(자부담)</span><h5 class="text-danger fw-bold mb-0">${fmt(qTotalSelf)}원</h5></div>`;
    
    let hLeft = ''; 
    cEnrolls.forEach(i => { 
        const e = E[i]; const isActive = (i === cActiveEIdx); const isCurrentQ = (e.q === window.gQ);
        let boxCls = 'p-2 border rounded mb-2 clickable'; let badgeCls = 'badge me-1 ';
        if (isActive) { boxCls += ' bg-primary bg-opacity-10 border-primary text-primary fw-bold shadow-sm'; badgeCls += 'bg-primary'; } 
        else if (isCurrentQ) { boxCls += ' bg-white border-primary border-opacity-50 text-dark'; badgeCls += 'bg-primary bg-opacity-75'; } 
        else { boxCls += ' bg-light border-secondary border-opacity-25 text-muted opacity-75'; badgeCls += 'bg-secondary'; }
        hLeft += `<div class="${boxCls}" onclick="setConsoleActive(${i})"><span class="${badgeCls}">${e.q}분기</span> ${e.course}</div>`; 
    }); 
    $('consoleLeft').innerHTML = hLeft;

    const e = E[cActiveEIdx], q = e.q, base = C[e.course]?.[q] || {t:0,b:0,mh:'4,4,4'}; const totAdjT = e.adjusts.reduce((s,a)=>s+a.amtT, 0); const totAdjB = e.adjusts.reduce((s,a)=>s+a.amtB, 0); 
    const locked = isQuarterLocked(q), dis = locked ? 'disabled' : ''; let pendingMsg = '';
    
    if (L.isF && L.fData) { let sQ = L.fData.startQ || 1; let sS = L.fData.startSess || 0; let sH = 1; if (L.fData.courses && L.fData.courses[e.course]) { sQ = L.fData.courses[e.course].q; sS = L.fData.courses[e.course].s; sH = L.fData.courses[e.course].h || 1; } if (q < sQ) { pendingMsg = `<div class="alert alert-secondary py-2 mb-3 small fw-bold border-secondary shadow-sm"><i class="bi bi-pause-circle-fill me-2"></i>지원 대기: 이 강좌는 <span class="text-danger">[${sQ}분기 ${sS+1}차수 ${sH}시수]</span>부터 지원이 개시됩니다. (현재 분기 전액 자부담)</div>`; } else if (q === sQ && (sS > 0 || sH > 1)) { pendingMsg = `<div class="alert alert-info py-2 mb-3 small fw-bold border-info shadow-sm"><i class="bi bi-info-circle-fill me-2"></i>도중 개시: 이 강좌는 이번 분기 <span class="text-primary">[${sS+1}차수 ${sH}시수]</span>부터 지원이 개시되어 일부 자부담이 혼재되어 있습니다.</div>`; } }

    const hItem = Hs.find(h => h.e === e) || { tc:0, bc:0, tf:0, bf:0, finT:e.cT, finB:e.cB };
    const adjStrT = (totAdjT - e.rT) !== 0 ? `<span class="text-warning fw-bold">${(totAdjT - e.rT) > 0 ? '+' : ''}${fmt(totAdjT - e.rT)}</span>` : `0`;
    const adjStrB = (totAdjB - e.rB) !== 0 ? `<span class="text-warning fw-bold">${(totAdjB - e.rB) > 0 ? '+' : ''}${fmt(totAdjB - e.rB)}</span>` : `0`;

    let hRight = pendingMsg + `<h6 class="fw-bold text-dark border-bottom pb-2 d-flex justify-content-between align-items-center"><span class="clickable text-primary" onclick="switchFromStuToCourse('${e.course.replace(/'/g, "\\'")}', ${q})" title="강좌 명세서 화면으로 이동" id="pingPongLink">[${q}분기] ${e.course} 정산 명세 <i class="bi bi-box-arrow-up-right ms-1"></i></span>${locked?'<span class="badge bg-danger ms-2"><i class="bi bi-lock-fill"></i> 마감됨 (사후 입력 모드)</span>':''}</h6>`;
    hRight += `<table class="table table-sm table-bordered text-center align-middle mb-3 bg-white" style="font-size:0.8rem;">
        <thead class="table-light">
            <tr>
                <th rowspan="2" class="align-middle">구분</th>
                <th rowspan="2" class="align-middle">기초 금액</th>
                <th rowspan="2" class="align-middle">조정/환불</th>
                <th rowspan="2" class="bg-light fw-bold align-middle">실부담금(A)<br><span class="text-muted fw-normal" style="font-size:0.7em;">(지원전)</span></th>
                <th colspan="2" class="border-bottom-0">지원 공제(B)</th>
                <th rowspan="2" class="table-danger text-danger align-middle">최종 징수액<br><span class="fw-normal" style="font-size:0.7em;">(A-B)</span></th>
            </tr>
            <tr>
                <th class="bg-cho3 text-primary border-top-0" style="font-size:0.8em;">초3 공제</th>
                <th class="bg-free text-success border-top-0" style="font-size:0.8em;">자유 공제</th>
            </tr>
        </thead>
        <tbody>
            <tr><td class="fw-bold bg-light">수강료</td><td>${fmt(base.t)}</td><td>${adjStrT}</td><td class="fw-bold bg-light">${fmt(e.cT)}</td><td class="bg-cho3 text-primary">-${fmt(hItem.tc)}</td><td class="bg-free text-success">-${fmt(hItem.tf)}</td><td class="table-danger fw-bold text-danger">${fmt(hItem.finT)}</td></tr>
            <tr><td class="fw-bold bg-light">교재비</td><td>${fmt(base.b)}</td><td>${adjStrB}</td><td class="fw-bold bg-light">${fmt(e.cB)}</td><td class="bg-cho3 text-primary">-${fmt(hItem.bc)}</td><td class="bg-free text-success">-${fmt(hItem.bf)}</td><td class="table-danger fw-bold text-danger">${fmt(hItem.finB)}</td></tr>
        </tbody>
    </table>`;

    hRight += `<ul class="nav nav-pills mb-2 no-print" id="cTabs"><li class="nav-item"><button class="nav-link active py-1 small" data-bs-toggle="pill" data-bs-target="#tAdj">✍️ 분기 금액 조정</button></li><li class="nav-item"><button class="nav-link py-1 small ms-2" data-bs-toggle="pill" data-bs-target="#tRef">💸 환불/결석</button></li></ul>`;
    hRight += `<div class="tab-content border p-3 rounded bg-white mb-3 shadow-sm no-print"><div class="tab-pane fade show active" id="tAdj"><div class="row g-1 mb-2"><div class="col-6"><input type="text" id="c_adj_title" class="form-control form-control-sm" placeholder="예: 1분기 장부 보정, 다자녀할인" ${dis}></div><div class="col-3"><input type="number" id="c_adj_t" class="form-control form-control-sm text-end" placeholder="수강료 증감" ${dis}></div><div class="col-3"><input type="number" id="c_adj_b" class="form-control form-control-sm text-end" placeholder="교재비 증감" ${dis}></div></div><div class="text-end"><button class="btn btn-warning btn-sm fw-bold" onclick="addConsoleAdj()" ${dis}>조정 반영</button></div></div>`;
    
    const options = base.mh.split(',').map((_,idx)=>`<option value="${idx}">${idx+1}차수 환불</option>`).join('');
    hRight += `<div class="tab-pane fade" id="tRef"><div class="row g-1 mb-2">
            <div class="col-4"><select id="c_ref_ty" class="form-select form-select-sm" onchange="toggleRefInputs(); previewConsoleRef();" ${dis}><option value="BEFORE">개시전(수강료전액)</option><option value="DISEASE">결석(수강료일할)</option><option value="STUDENT">포기(수강료구간합산)</option></select></div>
            <div class="col-4"><select id="c_ref_idx" class="form-select form-select-sm" onchange="updateConsoleRefHours(); previewConsoleRef();" ${dis}>${options}</select></div>
            <div class="col-4"><select id="c_ref_ah" class="form-select form-select-sm" onchange="previewConsoleRef()" ${dis}></select></div>
            <div class="col-12 mt-2 border-top pt-2">
                <label class="small fw-bold text-dark mb-1">교재비 반환 방식:</label>
                <div class="d-flex gap-2 align-items-center">
                    <select id="c_ref_bk_ty" class="form-select form-select-sm" onchange="toggleRefInputs(); previewConsoleRef();" ${dis}>
                        <option value="NONE">해당없음(환불안함)</option>
                        <option value="FULL">분기 전액 환불</option>
                        <option value="MANUAL">수동 금액 입력</option>
                    </select>
                    <input type="number" id="c_ref_bk_amt" class="form-control form-control-sm d-none" placeholder="환불할 금액" oninput="previewConsoleRef()" ${dis}>
                </div>
            </div>
        </div>
        <div id="c_ref_preview" class="text-end small fw-bold text-primary mb-2">💡 예상 환불액: 수강료 0원 / 교재비 0원</div>
        <div class="text-end"><button class="btn btn-danger btn-sm fw-bold" onclick="addConsoleRef()" ${dis}>환불 등록</button></div>
    </div></div>`;

    hRight += `<div class="small fw-bold text-muted mb-1">⏱️ 처리 이력 타임라인 (메모 격리 연동)</div><table class="table table-sm table-bordered text-center align-middle mb-0" style="font-size:0.75rem;"><thead class="table-light"><tr><th>유형</th><th>사유</th><th>수강료</th><th>교재비</th><th class="no-print">삭제</th></tr></thead><tbody>`;
    let cnt = 0; e.adjusts.forEach((a, i) => { cnt++; hRight += `<tr><td><span class="badge bg-warning text-dark">조정</span></td><td class="text-start">${a.title}</td><td>${fmt(a.amtT)}</td><td>${fmt(a.amtB)}</td><td class="no-print"><button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="delConsoleHist('adj', ${i})" ${dis}><i class="bi bi-x"></i></button></td></tr>`; }); e.refunds.forEach((r, i) => { cnt++; hRight += `<tr><td><span class="badge bg-danger">환불</span></td><td class="text-start">${r.tyNm}</td><td class="text-danger">-${fmt(r.rt)}</td><td class="text-danger">-${fmt(r.rb)}</td><td class="no-print"><button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="delConsoleHist('ref', ${i})" ${dis}><i class="bi bi-x"></i></button></td></tr>`; }); if(!cnt) hRight += `<tr><td colspan="5" class="text-muted">내역이 없습니다.</td></tr>`; hRight += `</tbody></table>`;
    $('consoleRight').innerHTML = hRight;
    window.toggleRefInputs = function() { 
        const ty = $('c_ref_ty')?.value; 
        const bkTy = $('c_ref_bk_ty')?.value;
        const isLocked = isQuarterLocked(e.q); 
        if(ty === 'BEFORE') { if($('c_ref_idx')) $('c_ref_idx').disabled = true; if($('c_ref_ah')) $('c_ref_ah').disabled = true; } 
        else { if($('c_ref_idx')) $('c_ref_idx').disabled = isLocked; if($('c_ref_ah')) $('c_ref_ah').disabled = isLocked; } 
        if ($('c_ref_bk_amt')) { if (bkTy === 'MANUAL') $('c_ref_bk_amt').classList.remove('d-none'); else $('c_ref_bk_amt').classList.add('d-none'); }
        updateConsoleRefHours(); 
    };
    setTimeout(() => { updateConsoleRefHours(); toggleRefInputs(); previewConsoleRef(); }, 0);
};

window.setConsoleActive = function(i) { cActiveEIdx = i; renderConsole(); };

// 💡 4스텝 화면 동기화를 위해 renderSetTabs() 호출
window.addConsoleAdj = function() { const e = E[cActiveEIdx]; if (isQuarterLocked(e.q)) return; const t = val('c_adj_title'), aT = num(val('c_adj_t')), aB = num(val('c_adj_b')); if(!t) return alert('조정 사유 필수'); e.adjusts.push({ title:t, amtT:aT, amtB:aB }); recalcEnrollment(e); save(); autoRunSet(true); renderConsole(); renderE(); renderSetTabs(); };
window.addConsoleRef = function() { const e = E[cActiveEIdx]; if (isQuarterLocked(e.q)) return; const si = num($('c_ref_idx').value), ty = val('c_ref_ty'), ah = num(val('c_ref_ah')), bkTy = val('c_ref_bk_ty'); const bkAmt = bkTy === 'MANUAL' ? num(val('c_ref_bk_amt')) : 0; e.refunds.push({ sessIdx:si, ty, ah, reqBk:false, bkRefTy: bkTy, bkRefAmt: bkAmt, rt:0, rb:0, tyNm:'' }); recalcEnrollment(e); save(); autoRunSet(true); renderConsole(); renderE(); renderSetTabs(); };
window.delConsoleHist = function(ty, idx) { const e = E[cActiveEIdx]; if (isQuarterLocked(e.q)) return; if(ty==='adj') e.adjusts.splice(idx,1); else e.refunds.splice(idx,1); recalcEnrollment(e); save(); autoRunSet(true); renderConsole(); renderE(); renderSetTabs(); };

// ==========================================
// 💡 [강좌 통합 회계 컨트롤러] 렌더링 및 실시간 피드백 기능 로직
// ==========================================
window.curCrsName = '';
window.curCrsQ = 1;
window.curCrsIsExact = false;

// ⚡ 시각적 피드백을 위한 애니메이션 스타일 동적 주입 (style.css 수정 필요 없음)
if (!document.getElementById('core-flash-styles')) {
    const style = document.createElement('style');
    style.id = 'core-flash-styles';
    style.innerHTML = `
        @keyframes flashGreen {
            0% { background-color: rgba(25, 135, 84, 0.25) !important; }
            100% { background-color: transparent; }
        }
        .row-flash-success { animation: flashGreen 1.5s ease-out; }
    `;
    document.head.appendChild(style);
}

window.openCourseSummary = function(cName, q) {
    autoRunSet(true); 
    if(!$('crsSummaryTitle') || !mdlCrsSummary) return;
    
    window.curCrsName = cName;
    window.curCrsQ = q;
    window.curCrsIsExact = !!C[cName];
    
    $('crsSummaryTitle').innerHTML = `<i class="bi bi-collection-play-fill"></i> [${q}분기] ${cName} 정산 명세 및 일괄 조정`;
    $('bulk_memo').value = '';
    $('bulk_amt').value = '';
    
    const isLocked = isQuarterLocked(q);
    const wrap = $('bulkActionWrap');
    if (wrap) wrap.style.display = isLocked ? 'none' : 'flex';

    renderCourseModalBody([]); // 초기 진입 시에는 반짝임 없음
    mdlCrsSummary.show();
};

// 💡 [패치] savedUids 배열을 받아 저장 성공한 학생의 행에 실시간 반짝임 효과 부여
window.renderCourseModalBody = function(savedUids = []) {
    const cName = window.curCrsName;
    const q = window.curCrsQ;
    const isExact = window.curCrsIsExact;
    const isLocked = isQuarterLocked(q);
    
    const list = Hs.filter(h => h.q === q && (isExact ? h.c === cName : h.c.replace(/\s*\([A-Za-z가-힣0-9]+\)$/, '').trim() === cName));
    let base = {t:0, b:0};
    if (isExact) { base = C[cName]?.[q] || {t:0, b:0}; } else if (list.length > 0) { base = C[list[0].c]?.[q] || {t:0, b:0}; }
    
    $('crsSummaryTop').innerHTML = `<div class="p-2 bg-light border rounded d-flex justify-content-around text-center"><div><strong>기초 수강료:</strong> ${fmt(base.t)}원</div><div><strong>기초 교재비:</strong> ${fmt(base.b)}원</div><div><strong>수강인원:</strong> <span class="text-primary fw-bold">${list.length}명</span></div></div>`;
    
    let h = '';
    if(!list.length) {
        h = `<tr><td colspan="9" class="text-muted py-4">수강생이 없습니다.</td></tr>`;
    } else {
        const cSum = {sT:0, sB:0};
        list.sort((a,b)=>{
            let aP = a.dp.split('-').map(Number);
            let bP = b.dp.split('-').map(Number);
            return (aP[0]-bP[0]) || (aP[1]-bP[1]) || (aP[2]-bP[2]);
        }).forEach(hItem => { 
            cSum.sT += hItem.sT; cSum.sB += hItem.sB;
            const classNameTag = !isExact ? `<span class="badge bg-secondary ms-1" style="font-size:0.7em;">${hItem.c.replace(cName,'').replace(/[()]/g,'').trim()}반</span>` : '';
            const uidStr = hItem.id;
            const dis = isLocked ? 'disabled' : '';
            
            // 💡 [UX 혁신 1] 이 강좌에서 해당 학생에게 누적된 실시간 조정액 계산
            let totalAdjT = hItem.e.adjusts.reduce((sum, a) => sum + (a.amtT || 0), 0);
            let totalAdjB = hItem.e.adjusts.reduce((sum, a) => sum + (a.amtB || 0), 0);
            let adjLedgerBadge = '';
            if (totalAdjT !== 0 || totalAdjB !== 0) {
                adjLedgerBadge = `<div class="mt-1 d-flex gap-1" style="font-size:0.7rem;">
                    ${totalAdjT !== 0 ? `<span class="badge ${totalAdjT < 0 ? 'bg-danger bg-opacity-10 text-danger border border-danger' : 'bg-primary bg-opacity-10 text-primary border border-primary'} py-0 px-1">수강료교정 ${totalAdjT > 0 ? '+' : ''}${fmt(totalAdjT)}</span>` : ''}
                    ${totalAdjB !== 0 ? `<span class="badge ${totalAdjB < 0 ? 'bg-danger bg-opacity-10 text-danger border border-danger' : 'bg-info bg-opacity-10 text-info border border-info'} py-0 px-1">교재비교정 ${totalAdjB > 0 ? '+' : ''}${fmt(totalAdjB)}</span>` : ''}
                </div>`;
            }

            // 💡 [UX 혁신 2] 방금 저장된 학생 UID가 있다면 해당 행에 애니메이션 클래스 바인딩
            const flashClass = savedUids.includes(uidStr) ? 'row-flash-success' : '';
            
            h += `<tr class="${flashClass}">
                <td><input type="checkbox" class="form-check-input crs-stu-chk" value="${uidStr}" checked ${dis}></td>
                <td>${hItem.dp}</td>
                <td class="fw-bold text-start ps-2">
                    <span class="clickable text-dark" onclick="openStuConsole('${uidStr}')">${hItem.nm}</span>${classNameTag}
                    ${adjLedgerBadge} 
                </td>
                <td>${hItem.fBadge}</td>
                <td class="text-primary fw-bold bg-light">${fmt(hItem.sT)}</td>
                <td class="text-success fw-bold bg-light">${fmt(hItem.sB)}</td>
                <td class="bg-warning bg-opacity-10"><input type="number" id="inl_amt_${uidStr}" class="form-control form-control-sm border-warning text-end fw-bold" placeholder="0" ${dis}></td>
                <td class="bg-warning bg-opacity-10"><input type="text" id="inl_memo_${uidStr}" class="form-control form-control-sm border-warning" placeholder="공통사유 따름" ${dis} onkeydown="if(event.key==='Enter') applyInlineAdjustment('${uidStr}')"></td>
                <td class="bg-warning bg-opacity-10"><button class="btn btn-sm btn-dark py-0 px-2" onclick="applyInlineAdjustment('${uidStr}')" ${dis} title="이 학생만 개별 저장">저장</button></td>
            </tr>`; 
        });
        h += `<tr class="table-dark fw-bold sticky-total-row">
                <td colspan="4" class="text-end pe-3 text-warning">총 합계 (실시간)</td>
                <td class="text-warning">${fmt(cSum.sT)}</td>
                <td class="text-warning">${fmt(cSum.sB)}</td>
                <td colspan="3"></td>
              </tr>`;
    }
    $('crsSummaryBody').innerHTML = h;
};

window.toggleAllCourseStu = function(el) {
    document.querySelectorAll('.crs-stu-chk').forEach(chk => {
        if(!chk.disabled) chk.checked = el.checked;
    });
};

window.applyBulkAdjustment = function() {
    if (isQuarterLocked(window.curCrsQ)) return alert('🔒 마감된 분기입니다.');
    const amt = num(val('bulk_amt'));
    if (amt === 0) return alert('조정할 금액(0 제외)을 입력해 주세요.');
    const type = val('bulk_type'); 
    const typeNm = type === 'T' ? '수강료' : '교재비';
    const memo = val('bulk_memo') || `[${window.curCrsName}] ${typeNm} 일괄조정`;
    const checkedBoxes = document.querySelectorAll('.crs-stu-chk:checked');
    if (checkedBoxes.length === 0) return alert('선택된 학생이 없습니다.');

    let applyCount = 0;
    let savedUids = []; // 💡 일괄 적용 대상 학생 타겟 수집
    checkedBoxes.forEach(chk => {
        const eId = chk.value;
        const targetEnrollments = E.filter(e => uid(e.g, e.b, e.n, e.name) === eId && e.q === window.curCrsQ && (window.curCrsIsExact ? e.course === window.curCrsName : e.course.startsWith(window.curCrsName)));
        targetEnrollments.forEach(e => {
            e.adjusts.push({ title: memo, amtT: type === 'T' ? amt : 0, amtB: type === 'B' ? amt : 0 });
            recalcEnrollment(e);
            applyCount++;
        });
        savedUids.push(eId);
    });

    if (applyCount > 0) {
        save(); autoRunSet(true); renderCourseModalBody(savedUids); renderE(); renderSetTabs();
        $('bulk_amt').value = '';
    }
};

window.applyInlineAdjustment = function(eId) {
    if (isQuarterLocked(window.curCrsQ)) return alert('🔒 마감된 분기입니다.');
    const amt = num(val(`inl_amt_${eId}`));
    if (amt === 0) return alert('조정할 금액을 입력해 주세요.');
    const type = val('bulk_type'); 
    const typeNm = type === 'T' ? '수강료' : '교재비';
    const indMemo = val(`inl_memo_${eId}`);
    const bulkMemo = val('bulk_memo');
    const memo = indMemo || bulkMemo || `[${window.curCrsName}] ${typeNm} 개별조정`;

    const targetEnrollments = E.filter(e => uid(e.g, e.b, e.n, e.name) === eId && e.q === window.curCrsQ && (window.curCrsIsExact ? e.course === window.curCrsName : e.course.startsWith(window.curCrsName)));
    
    if (targetEnrollments.length > 0) {
        targetEnrollments.forEach(e => {
            e.adjusts.push({ title: memo, amtT: type === 'T' ? amt : 0, amtB: type === 'B' ? amt : 0 });
            recalcEnrollment(e);
        });
        save(); autoRunSet(true); renderCourseModalBody([eId]); renderE(); renderSetTabs(); // 💡 단일 학생 행 반반짝임 효과 전송
    }
};

window.setFilt = function(f) { s4_filt = f; if($('fBtnA')) $('fBtnA').className = f === 'A' ? 'btn btn-sm btn-dark fw-bold' : 'btn btn-sm btn-outline-dark'; if($('fBtnF')) $('fBtnF').className = f === 'F' ? 'btn btn-sm btn-success fw-bold' : 'btn btn-sm btn-outline-success'; if($('fBtnC')) $('fBtnC').className = f === 'C' ? 'btn btn-sm btn-primary fw-bold' : 'btn btn-sm btn-outline-primary'; renderSetTabs(); };

// ==========================================
// 💡 코어 로직: 글로벌 통차감 및 수혜 과목 몰아주기(Sticky Sort)
// ==========================================
window.autoRunSet = function(silent = false) {
    Ld = {}; Hs = []; 
    if (!E.length) { if (!silent) renderSetTabs(); return; }
    const freeMap = new Map(); F.forEach(f => freeMap.set(uid(f.g,f.b,f.n,f.name), f));

    E.forEach(e => {
        const id  = uid(e.g,e.b,e.n,e.name); const fData = freeMap.get(id); const isF = !!fData, isC = String(e.g) === '3';
        if (!Ld[id]) Ld[id] = { id, dp: dsp(e.g,e.b,e.n), nm: e.name, isF, isC, cB: 0, fB: isF ? 600000 : 0, fData, ty: (isF?'자유':'')+(isC?'초3':'')||'일반', enrolls: [] };
        Ld[id].enrolls.push(e);
    });
    
    Object.values(Ld).forEach(L => {
        L.cB = 0; 
        L.qBal = { 0: { cB: 0, fB: L.fB } }; 
        
        [1, 2, 3, 4].forEach(curQ => {
            if (L.isC) { if (curQ === 1) L.cB += 250000; if (curQ === 3) L.cB += 250000; }
            
            const qEnrolls = L.enrolls.filter(e => e.q === curQ).sort((a,b) => a.course.localeCompare(b.course));
            
            let items = qEnrolls.map(e => {
                const bs = C[e.course]?.[curQ] || {t:0,b:0,mh:'4,4,4'};
                const mhArr = (bs.mh || '4,4,4').split(',').map(x=>num(x)).filter(x=>x>0);
                
                let rem_cT = e.cT, rem_cB = e.cB;
                let sessTargets = [];
                let maxFreeT = 0, maxFreeB = 0;
                let lock_tc=0, lock_bc=0, lock_tf=0, lock_bf=0, lock_finT=0, lock_finB=0;

                for(let sIdx=0; sIdx<mhArr.length; sIdx++) {
                    let bT = getSessSplit(bs.t, sIdx, mhArr);
                    let tT = 0, tB = 0;
                    
                    if (sIdx === mhArr.length - 1) { tT = rem_cT; } else { tT = Math.max(0, Math.min(rem_cT, bT)); rem_cT -= tT; }
                    if (sIdx === 0) { tB = rem_cB; rem_cB = 0; } else { tB = 0; }
                    
                    let elgRatio = 1.0;
                    if (L.isF && L.fData) {
                        let sQ = L.fData.startQ || 1, sS = L.fData.startSess || 0, sH = 1;
                        if (L.fData.courses && L.fData.courses[e.course]) {
                            sQ = L.fData.courses[e.course].q; sS = L.fData.courses[e.course].s; sH = L.fData.courses[e.course].h || 1;
                        }
                        if (curQ < sQ) elgRatio = 0;
                        else if (curQ === sQ) {
                            if (sIdx < sS) elgRatio = 0;
                            else if (sIdx === sS) {
                                let maxH = mhArr[sIdx] || 4;
                                elgRatio = Math.max(0, maxH - sH + 1) / maxH;
                            }
                        }
                    }
                    
                    maxFreeT += Math.floor(tT * elgRatio / 10) * 10;
                    maxFreeB += Math.floor(tB * elgRatio / 10) * 10;
                    
                    let st = { sIdx, tT, tB, bT, bB: (sIdx===0?bs.b:0), tc:0, bc:0, tf:0, bf:0, finT:0, finB:0, _isLocked: false };
                    
                    let closedSnapshot = null;
                    if (SysSet.closedSess && SysSet.closedSess[`${curQ}_${sIdx}`]) {
                        closedSnapshot = SysSet.closedSess[`${curQ}_${sIdx}`][`${L.id}_${e.course}`];
                    }
                    if (closedSnapshot) {
                        st.tc = closedSnapshot.cho3Amt || 0; st.bc = closedSnapshot.cho3Bk || 0;
                        st.tf = closedSnapshot.freeAmt || 0; st.bf = closedSnapshot.freeBk || 0;
                        st.finT = closedSnapshot.selfAmt || 0; st.finB = closedSnapshot.selfBk || 0;
                        st._isLocked = true;
                        
                        lock_tc += st.tc; lock_bc += st.bc;
                        lock_tf += st.tf; lock_bf += st.bf;
                        lock_finT += st.finT; lock_finB += st.finB;
                    }
                    sessTargets.push(st);
                }
                return { 
                    e, bs, cT: e.cT, cB: e.cB, mhArr, sessTargets, 
                    maxFreeT, maxFreeB,
                    q_tc: lock_tc, q_bc: lock_bc, q_tf: lock_tf, q_bf: lock_bf,
                    lock_tc, lock_bc, lock_tf, lock_bf, lock_finT, lock_finB 
                };
            });

            items.forEach(it => {
                if (L.isC) L.cB -= (it.lock_tc + it.lock_bc);
                if (L.isF) L.fB -= (it.lock_tf + it.lock_bf);
            });

            const dp = SysSet.deductPriority || ['T', 'B'];

            if (L.isC) {
                dp.forEach(type => {
                    items.sort((a,b) => {
                        let aTouched = (a.q_tc > 0 || a.q_bc > 0) ? -1 : 1;
                        let bTouched = (b.q_tc > 0 || b.q_bc > 0) ? -1 : 1;
                        if (aTouched !== bTouched) return aTouched - bTouched;
                        return a.e.course.localeCompare(b.e.course);
                    });
                    items.forEach(it => {
                        if (L.cB <= 0) return;
                        let targetAmt = (type === 'T') ? (it.cT - it.q_tc) : (it.cB - it.q_bc);
                        let ded = Math.min(targetAmt, Math.max(0, L.cB));
                        if (type === 'T') it.q_tc += ded; else if (type === 'B') it.q_bc += ded;
                        L.cB -= ded;
                    });
                });
            }

            if (L.isF) {
                dp.forEach(type => {
                    items.sort((a,b) => {
                        let aTouched = (a.q_tc > 0 || a.q_bc > 0 || a.q_tf > 0 || a.q_bf > 0) ? -1 : 1;
                        let bTouched = (b.q_tc > 0 || b.q_bc > 0 || b.q_tf > 0 || b.q_bf > 0) ? -1 : 1;
                        if (aTouched !== bTouched) return aTouched - bTouched;
                        return a.e.course.localeCompare(b.e.course);
                    });
                    items.forEach(it => {
                        if (L.fB <= 0) return;
                        let req = (type === 'T') ? (it.cT - it.q_tc - it.q_tf) : (it.cB - it.q_bc - it.q_bf);
                        let maxEligible = (type === 'T') ? (it.maxFreeT - it.q_tf) : (it.maxFreeB - it.q_bf);
                        let targetAmt = Math.min(req, Math.max(0, maxEligible));
                        let ded = Math.min(targetAmt, Math.max(0, L.fB));
                        if (type === 'T') it.q_tf += ded; else if (type === 'B') it.q_bf += ded;
                        L.fB -= ded;
                    });
                });
            }

            items.forEach(it => {
                let dist_tc = it.q_tc - it.lock_tc;
                let dist_bc = it.q_bc - it.lock_bc;
                let dist_tf = it.q_tf - it.lock_tf;
                let dist_bf = it.q_bf - it.lock_bf;
                let dist_finT = it.cT - it.q_tc - it.q_tf - it.lock_finT;
                let dist_finB = it.cB - it.q_bc - it.q_bf - it.lock_finB;

                const init_dist_tc = dist_tc;
                const init_dist_tf = dist_tf;
                const init_dist_finT = dist_finT;

                let unlockedSess = it.sessTargets.filter(st => !st._isLocked);
                let sum_tT = unlockedSess.reduce((s, x) => s + x.tT, 0);

                for (let i = 0; i < unlockedSess.length; i++) {
                    let st = unlockedSess[i];
                    let isLast = (i === unlockedSess.length - 1);
                    let ratio = sum_tT === 0 ? 0 : (st.tT / sum_tT);

                    if (isLast) {
                        st.tc = dist_tc; st.tf = dist_tf; st.finT = dist_finT;
                    } else {
                        // ✅ Math.round -> Math.trunc 로 교체
                        st.tc = Math.trunc((init_dist_tc * ratio) / 10) * 10;
                        st.tf = Math.trunc((init_dist_tf * ratio) / 10) * 10;
                        st.finT = Math.trunc((init_dist_finT * ratio) / 10) * 10;
                        dist_tc -= st.tc; dist_tf -= st.tf; dist_finT -= st.finT;
                    }

                    if (i === 0) {
                        st.bc = dist_bc; st.bf = dist_bf; st.finB = dist_finB;
                    } else {
                        st.bc = 0; st.bf = 0; st.finB = 0;
                    }
                }

                let fStatus = 'NONE'; let fBadge = '';
                if (L.isF) {
                    let sQ = L.fData.startQ || 1, sS = L.fData.startSess || 0, sH = L.fData.courses?.[it.e.course]?.h || 1;
                    if (L.fData.courses && L.fData.courses[it.e.course]) { sQ = L.fData.courses[it.e.course].q; sS = L.fData.courses[it.e.course].s; }
                    if (curQ < sQ) { fStatus = 'PENDING'; fBadge = `<span class="badge bg-light text-secondary border border-secondary">자유(대기)</span>`; } else if (curQ === sQ && (sS > 0 || sH > 1)) { fStatus = 'PARTIAL'; fBadge = `<span class="badge" style="background-color:#a3cfbb; color:#0a3622;">자유(${sS+1}차 ${sH}시수~)</span>`; } else { fStatus = 'FULL'; fBadge = `<span class="badge bg-success">자유</span>`; }
                } else if (L.isC) { fBadge = `<span class="badge bg-primary">초3</span>`; } else { fBadge = `<span class="badge bg-secondary">일반</span>`; }

                Hs.push({ q: curQ, id: L.id, dp: L.dp, nm: L.nm, c: it.e.course, e: it.e, origT: it.bs.t, origB: it.bs.b, sT: it.cT, sB: it.cB, tc: it.q_tc, bc: it.q_bc, tf: it.q_tf, bf: it.q_bf, finT: (it.cT - it.q_tc - it.q_tf), finB: (it.cB - it.q_bc - it.q_bf), sessDetails: it.sessTargets, isF: L.isF, fStatus, fBadge, isC: L.isC, g: it.e.g, ban: it.e.b, num: it.e.n });
            });
            
            L.qBal[curQ] = { cB: Math.max(0, L.cB), fB: Math.max(0, L.fB) }; 
        });
    }); 
    if (!silent) renderSetTabs();
};

window.toggleSessCheck = function(targetQ, sessIdx, isChecked) {
    const key = `${targetQ}_${sessIdx}`;
    if (!isChecked) {
        let maxSess = 0; Object.keys(C).forEach(c => { const m = (C[c]?.[targetQ]?.mh || '4,4,4').split(',').filter(x => num(x) > 0).length; if (m > maxSess) maxSess = m; });
        for (let i = sessIdx + 1; i < maxSess; i++) { if (SysSet.closedSess[`${targetQ}_${i}`]) { alert(`🚨 역순 해제 오류: 이후 차수(${i+1}차) 마감이 아직 닫혀 있어 ${sessIdx+1}차수를 해제할 수 없습니다.\n가장 최근 차수부터 역순으로 마감을 해제해 주세요.`); $('chkClose_'+sessIdx).checked = true; return; } }
        const isHardLocked = SysSet.closedSess[key] && SysSet.closedSess[key]._isHardLocked;
        if (isHardLocked) {
            const ans = prompt(`🚨 경고: 강제 교정 데이터 초기화 위험\n\n이 차수는 '엑셀 강제 업로드'를 통해 수동으로 고정된 데이터입니다.\n마감을 해제하면 보정된 금액 정보가 모두 [영구 삭제]되며, 시스템 공식으로 전면 재계산됩니다.\n\n정말 해제하시려면 '재계산'이라고 입력하세요.`);
            if (ans !== '재계산') { $('chkClose_'+sessIdx).checked = true; return; }
        } else { if (!confirm(`해당 분기 ${sessIdx+1}차 마감을 해제하시겠습니까?`)) { $('chkClose_'+sessIdx).checked = true; return; } }
        delete SysSet.closedSess[key]; save(); alert('마감이 해제되었습니다.'); autoRunSet(true); renderSetTabs(); renderE();
    } else {
        for (let i = 0; i < sessIdx; i++) { if (!SysSet.closedSess[`${targetQ}_${i}`]) { alert(`🚨 마감 순서 오류: 이전 차수(${i+1}차)가 아직 마감되지 않았습니다.\n순차적으로 마감해 주세요.`); $('chkClose_'+sessIdx).checked = false; return; } }
        if (confirm(`해당 분기 ${sessIdx+1}차수를 마감하시겠습니까?\n\n이 시점의 청구액이 안전하게 고정됩니다. 이후 발생하는 환불액은 과거 장부를 건드리지 않고, [5스텝 - 환불/조정 이력서] 메뉴에서 별도로 모아서 확인할 수 있습니다.`)) {
            autoRunSet(true); const snapshot = { _isHardLocked: false }; const ls = Hs.filter(h => h.q === targetQ);
            ls.forEach(h => { const mhArr = (C[h.c]?.[targetQ]?.mh || '4,4,4').split(',').map(x => num(x)).filter(x => x > 0); if (sessIdx >= mhArr.length) return; snapshot[`${h.id}_${h.c}`] = { selfAmt: h.sessDetails[sessIdx].finT, selfBk: h.sessDetails[sessIdx].finB, cho3Amt: h.sessDetails[sessIdx].tc, cho3Bk: h.sessDetails[sessIdx].bc, freeAmt: h.sessDetails[sessIdx].tf, freeBk: h.sessDetails[sessIdx].bf }; });
            SysSet.closedSess[key] = snapshot; save(); alert('마감되었습니다.'); renderSetTabs(); renderE();
        } else $('chkClose_'+sessIdx).checked = false;
    }
};

window.renderSetTabs = function() {
    const qVal = num(val('s4_q')) || window.gQ; 
    const searchEl = $('s4_search');
    const searchKeyword = searchEl ? searchEl.value.trim().toLowerCase() : ''; 
    
    // 💡 1. 전체 기본 리스트 (통계 및 강좌 탭에 사용, 학생 검색어 무시)
    const hList = Hs.filter(h => 
        (h.q===qVal) && 
        (s4_filt==='A' || (s4_filt==='F'&&h.isF) || (s4_filt==='C'&&h.isC))
    );
    
    const chkWrap = $('closeSessChecks');
    if(chkWrap) {
        chkWrap.style.setProperty('display', 'flex', 'important'); let chks = `<span class="small fw-bold text-dark d-flex align-items-center">🔒 시스템마감:</span>`;
        let maxSess = 1; Object.keys(C).forEach(c => { const m = (C[c]?.[qVal]?.mh || '4,4,4').split(',').filter(x => num(x) > 0).length; if (m > maxSess) maxSess = m; });
        for (let i = 0; i < maxSess; i++) { 
            const key = `${qVal}_${i}`; const isChecked = SysSet.closedSess[key] ? 'checked' : ''; 
            const isHardLocked = SysSet.closedSess[key] && SysSet.closedSess[key]._isHardLocked;
            const lblClass = isHardLocked ? 'text-danger fw-bold' : 'fw-bold'; const icon = isHardLocked ? '🛠️ ' : (isChecked ? '🔒 ' : '');
            chks += `<div class="form-check form-check-inline mb-0 ms-2"><input class="form-check-input ${isHardLocked?'border-danger':'border-warning'}" type="checkbox" id="chkClose_${i}" ${isChecked} onchange="toggleSessCheck(${qVal}, ${i}, this.checked)"><label class="form-check-label small ${lblClass}" for="chkClose_${i}">${icon}${i+1}차</label></div>`; 
        }
        chkWrap.innerHTML = chks;
    }
    
    if (hList.length === 0) {
        let emptyHtml = `<tr><td colspan="15" class="py-5 text-muted bg-light"><i class="bi bi-folder-x fs-2 d-block mb-2 text-danger"></i>조건에 맞는 정산 데이터가 없습니다.</td></tr>`;
        if($('tbStat')) $('tbStat').innerHTML = emptyHtml; if($('tbStuDtl')) $('tbStuDtl').innerHTML = emptyHtml; if($('tbCrseDtl')) $('tbCrseDtl').innerHTML = emptyHtml; return;
    }

    // --- 탭 1. 통계 화면 렌더링 ---
    let sH = ''; const st = {}; hList.forEach(h => { if (!st[h.c]) st[h.c] = {cnt:0,sT:0,sB:0,tc:0,bc:0,tf:0,bf:0,fT:0,fB:0}; const s = st[h.c]; s.cnt++; s.sT+=h.sT; s.sB+=h.sB; s.tc+=h.tc; s.bc+=h.bc; s.tf+=h.tf; s.bf+=h.bf; s.fT+=h.finT; s.fB+=h.finB; });
    Object.keys(st).sort().forEach(c => { const s = st[c]; sH += `<tr><td class="course-link" onclick="openCourseSummary('${c.replace(/'/g, "\\'")}', ${qVal})">${c}</td><td class="table-warning fw-bold">${s.cnt}</td><td class="table-warning">${fmt(s.sT)}</td><td class="table-warning">${fmt(s.sB)}</td><td class="bg-cho3 text-primary">${fmt(s.tc)}</td><td class="bg-cho3">${fmt(s.bc)}</td><td class="bg-free text-success">${fmt(s.tf)}</td><td class="bg-free">${fmt(s.bf)}</td><td class="table-danger fw-bold text-danger">${fmt(s.fT)}</td><td class="table-danger text-danger fw-bold">${fmt(s.fB)}</td></tr>`; });
    sH += `<tr class="table-dark fw-bold sticky-total-row"><td colspan="2" class="text-warning">총 합계</td><td class="text-warning">${fmt(hList.reduce((s,h)=>s+h.sT,0))}</td><td class="text-warning">${fmt(hList.reduce((s,h)=>s+h.sB,0))}</td><td class="text-primary">${fmt(hList.reduce((s,h)=>s+h.tc,0))}</td><td class="text-primary">${fmt(hList.reduce((s,h)=>s+h.bc,0))}</td><td class="text-success">${fmt(hList.reduce((s,h)=>s+h.tf,0))}</td><td class="text-success">${fmt(hList.reduce((s,h)=>s+h.bf,0))}</td><td class="text-danger">${fmt(hList.reduce((s,h)=>s+h.finT,0))}</td><td class="text-danger">${fmt(hList.reduce((s,h)=>s+h.finB,0))}</td></tr>`;
    if($('tbStat')) $('tbStat').innerHTML = sH;

    // --- 💡 탭 2. 학생 상세 조회 렌더링 (여기서만 검색어 필터 적용!) ---
    const stuList = hList.filter(h => searchKeyword === '' || h.nm.toLowerCase().includes(searchKeyword) || h.dp.includes(searchKeyword));
    
    let stuH = '';
    if (stuList.length === 0) {
        stuH = `<tr><td colspan="15" class="py-5 text-muted bg-light">검색 결과가 없습니다.</td></tr>`;
    } else {
        const lMap = {}; stuList.forEach(h => { if (!lMap[h.id]) lMap[h.id] = {L: Ld[h.id], items:[]}; lMap[h.id].items.push(h); });
        let lArr = Object.values(lMap);
        
        lArr.sort((a,b) => {
            let res = 0;
            if (sortState.col === 'DP') {
                let aP = a.L.dp.split('-').map(Number);
                let bP = b.L.dp.split('-').map(Number);
                res = (aP[0]-bP[0]) || (aP[1]-bP[1]) || (aP[2]-bP[2]);
            }
            else if (sortState.col === 'NM') res = a.L.nm.localeCompare(b.L.nm);
            else if (sortState.col === 'C') res = (a.L.qBal[qVal]?.cB||0) - (b.L.qBal[qVal]?.cB||0);
            else if (sortState.col === 'F') res = (a.L.qBal[qVal]?.fB||0) - (b.L.qBal[qVal]?.fB||0);
            return sortState.asc ? res : -res;
        });

        ['DP','NM','C','F'].forEach(c => {
            const el = $('sort_'+c);
            if(el) { el.innerHTML = sortState.asc ? '<i class="bi bi-caret-up-fill text-primary"></i>' : '<i class="bi bi-caret-down-fill text-primary"></i>'; }
        });

        lArr.forEach(grp => { 
            let globalBadge = '';
            if (grp.L.isF) globalBadge = `<span class="badge bg-success">자유대상</span>`; else if (grp.L.isC) globalBadge = `<span class="badge bg-primary">초3</span>`; else globalBadge = `<span class="badge bg-secondary">일반</span>`;
            grp.items.forEach((h, idx) => { 
                let auditBadge = '';
                if(h.e.auditLog === '예외적용') auditBadge = `<span class="badge bg-warning text-dark border border-warning">예외적용</span>`; else if(h.e.auditLog === '마감/이관') auditBadge = `<span class="badge bg-danger">마감/이관</span>`; else auditBadge = `<span class="badge bg-light text-secondary border">엔진자동</span>`;
                stuH += `<tr>`; 
                if (idx === 0) {
                    const snapBalC = grp.L.qBal[qVal] ? grp.L.qBal[qVal].cB : 0;
                    const snapBalF = grp.L.qBal[qVal] ? grp.L.qBal[qVal].fB : 0;
                    stuH += `<td rowspan="${grp.items.length}">${grp.L.dp}</td><td rowspan="${grp.items.length}" class="fw-bold"><span class="clickable text-dark" onclick="openStuConsole('${grp.L.id}')">${grp.L.nm}</span></td><td rowspan="${grp.items.length}">${globalBadge}</td><td rowspan="${grp.items.length}" class="text-primary">${fmt(snapBalC)}</td><td rowspan="${grp.items.length}" class="text-success">${fmt(snapBalF)}</td>`; 
                }
                stuH += `<td>${h.q}</td><td class="course-link text-start" onclick="openCourseSummary('${h.c.replace(/'/g, "\\'")}', ${h.q})">${h.c} <span class="ms-1" style="font-size:0.75em;">${h.fBadge}</span></td><td>${fmt(h.sT)}</td><td>${fmt(h.sB)}</td><td class="bg-cho3 text-primary">${fmt(h.tc)}</td><td class="bg-cho3 text-primary">${fmt(h.bc)}</td><td class="bg-free text-success">${fmt(h.tf)}</td><td class="bg-free text-success">${fmt(h.bf)}</td><td class="text-danger fw-bold">${fmt(h.finT)}</td><td class="text-danger fw-bold">${fmt(h.finB)}</td><td class="align-middle">${auditBadge}</td></tr>`; 
            }); 
        });
    }
    if($('tbStuDtl')) $('tbStuDtl').innerHTML = stuH;

    // --- 탭 3. 강좌 상세 조회 렌더링 ---
    if($('cFilterBtnGroup')) { 
        let bh = `<button class="btn btn-sm ${s4_cFilter==='ALL'?'btn-primary fw-bold':'btn-outline-secondary'}" onclick="s4_cFilter='ALL';renderSetTabs();">전체강좌</button>`; 
        Object.keys(C).forEach(c => { bh += `<button class="btn btn-sm ${s4_cFilter===c?'btn-primary fw-bold':'btn-outline-secondary'} ms-1" onclick="s4_cFilter='${c.replace(/'/g,"\\'")}';renderSetTabs();">${c}</button>`; }); 
        $('cFilterBtnGroup').innerHTML = bh; 
    }
    
    let cList = hList; if (s4_cFilter !== 'ALL') cList = cList.filter(h => h.c === s4_cFilter);
    const cSum = {sT:0, sB:0, tc:0, bc:0, tf:0, bf:0, finT:0, finB:0}; 
    cList.forEach(h => { cSum.sT+=h.sT; cSum.sB+=h.sB; cSum.tc+=h.tc; cSum.bc+=h.bc; cSum.tf+=h.tf; cSum.bf+=h.bf; cSum.finT+=h.finT; cSum.finB+=h.finB; });
    let crsH = `<tr class="table-warning fw-bold sticky-total-row"><td colspan="5" class="text-end pe-3">총 합계</td><td>${fmt(cSum.sT)}</td><td>${fmt(cSum.sB)}</td><td class="text-primary">${fmt(cSum.tc)}</td><td class="text-primary">${fmt(cSum.bc)}</td><td class="text-success">${fmt(cSum.tf)}</td><td class="text-success">${fmt(cSum.bf)}</td><td class="text-danger">${fmt(cSum.finT)}</td><td class="text-danger">${fmt(cSum.finB)}</td><td></td></tr>`;
    
    cList.forEach(h => { 
        let auditBadge = '';
        if(h.e.auditLog === '예외적용') auditBadge = `<span class="badge bg-warning text-dark border border-warning">예외적용</span>`; else if(h.e.auditLog === '마감/이관') auditBadge = `<span class="badge bg-danger">마감/이관</span>`; else auditBadge = `<span class="badge bg-light text-secondary border">엔진자동</span>`;
        crsH += `<tr><td>${h.q}분기</td><td>${h.dp}</td><td class="fw-bold"><span class="clickable text-dark" onclick="openStuConsole('${h.id}')">${h.nm}</span></td><td>${h.fBadge}</td><td class="course-link" onclick="openCourseSummary('${h.c.replace(/'/g, "\\'")}', ${h.q})">${h.c}</td><td>${fmt(h.sT)}</td><td>${fmt(h.sB)}</td><td class="bg-cho3 text-primary">${fmt(h.tc)}</td><td class="bg-cho3 text-primary">${fmt(h.bc)}</td><td class="bg-free text-success">${fmt(h.tf)}</td><td class="bg-free text-success">${fmt(h.bf)}</td><td class="text-danger fw-bold">${fmt(h.finT)}</td><td class="text-danger fw-bold">${fmt(h.finB)}</td><td class="align-middle">${auditBadge}</td></tr>`; 
    });
    if($('tbCrseDtl')) $('tbCrseDtl').innerHTML = crsH;
};
// 💡 교정본 다운로드
window.dlRoundtripExcel = function() {
    autoRunSet(true);
    const qVal = num(val('s4_q')) || window.gQ;
    const ls = Hs.filter(h => h.q === qVal);
    if(!ls.length) return alert('다운로드할 정산 데이터가 없습니다.');

    const headers = [
        "분기", "학년", "반", "번호", "이름", "강좌명",
        "분기 수강료(원가)", "분기 교재비(원가)",
        "초3지원_수강료공제", "초3지원_교재비공제",
        "자유수강_수강료공제", "자유수강_교재비공제",
        "최종_수강료자부담", "최종_교재비자부담"
    ];

    let excelData = [headers];

    ls.forEach(h => {
        excelData.push([
            h.q, h.g, h.ban, h.num, h.nm, h.c,
            h.sT, h.sB,
            h.tc, h.bc,
            h.tf, h.bf,
            h.finT, h.finB
        ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(excelData);

    ws['!cols'] = [
        {wpx: 40}, {wpx: 40}, {wpx: 40}, {wpx: 40}, {wpx: 80}, {wpx: 130},
        {wpx: 120}, {wpx: 120}, {wpx: 130}, {wpx: 130},
        {wpx: 130}, {wpx: 130}, {wpx: 120}, {wpx: 120}
    ];

    XLSX.utils.book_append_sheet(wb, ws, "분기상세_교정본");
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `[${qVal}분기]방과후_정산결과_교정용_${today}.xlsx`);
};

window.upMigration = async function(input) { 
    const file = input.files[0]; if(!file) return; 
    try { 
        const buf = await readFileAsArrayBuffer(file); 
        const rows = parseXlsx(buf); 

        if (rows.length > 0 && !rows[0].hasOwnProperty('차수')) {
            alert('🚫 업로드 차단!\n\n현재 업로드하신 파일은 [분기 총계] 교정본입니다.\n강제 마감(이관)은 특정 차수(월)의 금액을 고정하는 기능이므로, 반드시 [차수] 열이 포함된 이전 양식을 사용하셔야 합니다.');
            input.value = ''; return;
        }

        let lockedSessions = []; 
        rows.forEach(r => { 
            const q = num(r['분기']), sIdx = num(r['차수']) - 1; 
            if(q && sIdx >= 0) { 
                const key = `${q}_${sIdx}`; 
                if(SysSet.closedSess[key] && Object.keys(SysSet.closedSess[key]).length > 0) { 
                    const label = `${q}분기 ${sIdx + 1}차`; 
                    if(!lockedSessions.includes(label)) lockedSessions.push(label); 
                } 
            } 
        }); 
        if(lockedSessions.length > 0) { 
            alert(`🚫 업로드 차단!\n\n현재 교정본 파일에 이미 마감된 차수(${lockedSessions.join(', ')})가 포함되어 있습니다.\n\n데이터를 덮어쓰려면 먼저 4스텝 우측 상단의 [🔒 시스템마감] 체크박스를 수동으로 해제하여 마감을 풀어주세요.`); 
            input.value = ''; return; 
        } 
        rows.forEach(r => { 
            const q = num(r['분기']), sIdx = num(r['차수']) - 1; 
            const g = num(r['학년']), b = num(r['반']), n = num(r['번호']), nm = String(r['이름']||'').trim(), c = String(r['강좌명']||'').trim(); 
            if(!q || sIdx < 0 || !nm || !c) return; 
            const id = uid(g, b, n, nm); const key = `${q}_${sIdx}`; 
            if (!SysSet.closedSess[key]) SysSet.closedSess[key] = { _isHardLocked: true }; else SysSet.closedSess[key]._isHardLocked = true; 
            SysSet.closedSess[key][`${id}_${c}`] = { selfAmt: num(r['자부담_수강료']), selfBk: num(r['자부담_교재비']), cho3Amt: num(r['초3_수강료']), cho3Bk: num(r['초3_교재비']), freeAmt: num(r['자유_수강료']), freeBk: num(r['자유_교재비']) }; 
        }); 
        save(); alert(`✅ 교정 데이터 반영 및 마감(하드락) 처리가 안전하게 완료되었습니다.`); 
        input.value = ''; autoRunSet(true); renderSetTabs(); renderE(); 
    } catch(err) { alert('❌ 업로드 실패: 엑셀 규격을 다시 확인해 주세요.'); input.value = ''; } 
};

let eduDataCached = []; 
window.initStep5 = function() { autoRunSet(true); buildEduTabs(); renderPreviewInvoice(); renderPreviewRef(); renderPreviewRoster(); };

function buildEduTabs() { 
    const q = window.gQ; 
    const ls = Hs.filter(h => h.q === q && (h.finT > 0 || h.finB > 0)); 
    const grouped = {}; 
    ls.forEach(h => { 
        const baseC = h.c.replace(/\s*\([A-Za-z가-힣0-9]+\)$/, '').trim(); 
        // ✅ bc 오타를 baseC로 수정
        if (!grouped[baseC]) grouped[baseC] = []; 
        grouped[baseC].push(h); 
    });
    
    eduDataCached = []; 
    Object.keys(grouped).forEach(bc => { 
        const sub = grouped[bc]; 
        sub.filter(h => h.finT > 0).forEach(h => { eduDataCached.push({ sheet: bc + ' 수강료', g: h.g, b: h.ban, n: h.num, nm: h.nm, amt: h.finT }); }); 
        sub.filter(h => h.finB > 0).forEach(h => { eduDataCached.push({ sheet: bc + ' 재료비', g: h.g, b: h.ban, n: h.num, nm: h.nm, amt: h.finB }); }); 
    }); 
    
    const sheetNames = [...new Set(eduDataCached.map(d => d.sheet))]; 
    let hTabs = sheetNames.map((sn, idx) => `<button class="sheet-pill ${idx===0?'active':''}" onclick="renderEduSheet('${sn}', this)">${sn}</button>`).join(''); 
    $('eduSheetTabs').innerHTML = hTabs || '<div class="small text-muted py-3">해당 분기에 수납 대상(자부담)이 없습니다.</div>'; 
    if(sheetNames.length) renderEduSheet(sheetNames[0]); else $('prev_edu').innerHTML = ''; 
}

window.renderEduSheet = function(sn, el) { 
    if(el) { Array.from(el.parentNode.children).forEach(b => b.classList.remove('active')); el.classList.add('active'); } 
    const filtered = eduDataCached.filter(d => d.sheet === sn); 
    const total = filtered.reduce((s, d) => s + d.amt, 0); 
    let h = `<tr class="sticky-total-row fw-bold"><td colspan="2" class="text-end">시트 합계</td><td class="text-danger">${fmt(total)}원</td><td></td></tr>`; 
    h += filtered.map(d => { 
        const stuUid = uid(d.g, d.b, d.n, d.nm).replace(/'/g,"\\'"); 
        return `<tr><td>${dsp(d.g, d.b, d.n)}</td><td class="fw-bold"><span class="clickable text-dark" onclick="openStuConsole('${stuUid}')">${d.nm}</span></td><td>${fmt(d.amt)}</td><td>${sn}</td></tr>`; 
    }).join(''); 
    $('prev_edu').innerHTML = h; 
};

window.exEdu = function() { 
    const q = window.gQ; if (!eduDataCached.length) return alert('추출할 내역이 없습니다.'); 
    const wb = XLSX.utils.book_new(); const sg = {}; 
    eduDataCached.forEach(r => { if(!sg[r.sheet]) sg[r.sheet]=[]; sg[r.sheet].push({ '* 학과': r.sheet.replace(/ 수강료| 재료비/g, ''), '* 학년': r.g, '* 반': r.b, '* 번호': r.n, '* 성명': r.nm, '* 대상금액': r.amt }); }); 
    Object.keys(sg).forEach(sn => { 
        const total = sg[sn].reduce((sum, r) => sum + r['* 대상금액'], 0); 
        sg[sn].push({ '* 학과': '총계', '* 학년': '', '* 반': '', '* 번호': '', '* 성명': '', '* 대상금액': total }); 
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sg[sn]), sn.substring(0, 31)); 
    }); 
    XLSX.writeFile(wb, `${q}분기_에듀파인_수납요구서.xlsx`); 
};

function getInvoiceData(q, sVal) { const ls = Hs.filter(h => h.q === q); const grouped = {}; ls.forEach(h => { const mhArr = (C[h.c]?.[q]?.mh || '4,4,4').split(',').map(x => num(x)).filter(x => x > 0); const baseC = h.c.replace(/\s*\([A-Za-z가-힣0-9]+\)$/, '').trim(); const cd = C[h.c]?.[q] || { instTot: 0, mgmtTot: 0 }; let baseT=0, baseM=0, baseI=0, sSelf=0, sCho=0, sFree=0; if (sVal === 'ALL') { baseT = h.origT; if (baseT <= 0) return; baseM = cd.mgmtTot; baseI = baseT - baseM; sSelf = h.finT; sCho = h.tc; sFree = h.tf; } else { const sIdx = num(sVal) - 1; if (sIdx >= mhArr.length) return; baseT = h.sessDetails[sIdx].bT; if (baseT <= 0) return; baseM = getSessSplit(cd.mgmtTot, sIdx, mhArr); baseI = baseT - baseM; let closedSnapshot = null; if (SysSet.closedSess && SysSet.closedSess[`${q}_${sIdx}`]) closedSnapshot = SysSet.closedSess[`${q}_${sIdx}`][`${h.id}_${h.c}`]; if (closedSnapshot) { sSelf = closedSnapshot.selfAmt || 0; sCho = closedSnapshot.cho3Amt || 0; sFree = closedSnapshot.freeAmt || 0; } else { sSelf = h.sessDetails[sIdx].finT; sCho = h.sessDetails[sIdx].tc; sFree = h.sessDetails[sIdx].tf; } } let totF = sSelf + sCho + sFree; let mSelf=0, mCho=0, mFree=0, iSelf=0, iCho=0, iFree=0; if (totF > 0) { let totalM = baseT > 0 ? Math.floor(totF * (baseM / baseT) / 10) * 10 : 0; let remM = totalM; if (sSelf > 0) { mSelf = Math.floor((sSelf / totF) * totalM / 10) * 10; remM -= mSelf; } if (sCho > 0) { mCho = Math.floor((sCho / totF) * totalM / 10) * 10; remM -= mCho; } if (sFree > 0) { mFree = remM; remM = 0; } else if (sCho > 0) { mCho += remM; remM = 0; } else if (sSelf > 0) { mSelf += remM; remM = 0; } iSelf = sSelf - mSelf; iCho = sCho - mCho; iFree = sFree - mFree; } if(!grouped[baseC]) grouped[baseC] = { c:baseC, baseT, baseI, baseM, selfCnt:0, selfFee:0, selfInst:0, selfMgmt:0, cho3Cnt:0, cho3Fee:0, cho3Inst:0, cho3Mgmt:0, freeCnt:0, freeFee:0, freeInst:0, freeMgmt:0, totCnt:0, totFee:0, totInst:0, totMgmt:0, memos:[] }; const g = grouped[baseC]; if(sSelf>0){ g.selfCnt++; g.selfFee+=sSelf; g.selfInst+=iSelf; g.selfMgmt+=mSelf; } if(sCho>0){ g.cho3Cnt++; g.cho3Fee+=sCho; g.cho3Inst+=iCho; g.cho3Mgmt+=mCho; } if(sFree>0){ g.freeCnt++; g.freeFee+=sFree; g.freeInst+=iFree; g.freeMgmt+=mFree; } if (totF > 0 || baseT > 0) { g.totCnt++; g.totFee += totF; g.totInst += (iSelf + iCho + iFree); g.totMgmt += (mSelf + mCho + mFree); if(h.e.tMemo) g.memos.push(`${h.nm}(${h.e.tMemo})`); } }); return Object.values(grouped).sort((a,b) => a.c.localeCompare(b.c)); }
window.renderPreviewInvoice = function() { const q = window.gQ, sVal = val('p_sInvoice'); const data = getInvoiceData(q, sVal); let h = ''; if(!data.length) h = `<tr><td colspan=\"23\" class=\"text-muted py-5 bg-light\"><i class=\"bi bi-folder-x fs-2 d-block mb-2 text-danger\"></i>출력할 청구서 데이터가 없습니다.</td></tr>`; else { let tSelf=0, tSelfI=0, tSelfM=0, tCho=0, tChoI=0, tChoM=0, tFree=0, tFreeI=0, tFreeM=0, tTot=0, tTotI=0, tTotM=0; data.forEach(g => { tSelf+=g.selfFee; tSelfI+=g.selfInst; tSelfM+=g.selfMgmt; tCho+=g.cho3Fee; tChoI+=g.cho3Inst; tChoM+=g.cho3Mgmt; tFree+=g.freeFee; tFreeI+=g.freeInst; tFreeM+=g.freeMgmt; tTot+=g.totFee; tTotI+=g.totInst; tTotM+=g.totMgmt; }); h += `<tr class=\"sticky-total-row fw-bold text-center\"><td colspan=\"5\" class=\"text-end pe-3\">총 합계</td><td></td><td class=\"text-warning\">${fmt(tSelf)}</td><td class=\"text-warning\">${fmt(tSelfI)}</td><td class=\"text-warning\">${fmt(tSelfM)}</td><td></td><td class=\"text-primary\">${fmt(tCho)}</td><td class=\"text-primary\">${fmt(tChoI)}</td><td class=\"text-primary\">${fmt(tChoM)}</td><td></td><td class=\"text-success\">${fmt(tFree)}</td><td class=\"text-success\">${fmt(tFreeI)}</td><td class=\"text-success\">${fmt(tFreeM)}</td><td></td><td class=\"text-danger fs-6\">${fmt(tTot)}</td><td class=\"text-danger\">${fmt(tTotI)}</td><td class=\"text-danger\">${fmt(tTotM)}</td><td colspan=\"2\"></td></tr>`; data.forEach((g, idx) => { const uniqueMemos = [...new Set(g.memos)]; const diffFee = g.totFee - (g.baseT * g.totCnt); h += `<tr><td>${idx+1}</td><td class=\"course-link\" onclick=\"openCourseSummary('${g.c.replace(/'/g, "\\'")}', window.gQ)\">${g.c}</td><td>${fmt(g.baseT)}</td><td>${fmt(g.baseI)}</td><td>${fmt(g.baseM)}</td><td class=\"table-warning\">${g.selfCnt}</td><td class=\"table-warning\">${fmt(g.selfFee)}</td><td class=\"table-warning\">${fmt(g.selfInst)}</td><td class=\"table-warning\">${fmt(g.selfMgmt)}</td><td class=\"table-primary text-primary\">${g.cho3Cnt}</td><td class=\"table-primary text-primary\">${fmt(g.cho3Fee)}</td><td class=\"table-primary text-primary\">${fmt(g.cho3Inst)}</td><td class=\"table-primary text-primary\">${fmt(g.cho3Mgmt)}</td><td class=\"table-success text-success\">${g.freeCnt}</td><td class=\"table-success text-success\">${fmt(g.freeFee)}</td><td class=\"table-success text-success\">${fmt(g.freeInst)}</td><td class=\"table-success text-success\">${fmt(g.freeMgmt)}</td><td class=\"table-danger fw-bold text-danger\">${g.totCnt}</td><td class=\"table-danger fw-bold text-danger\">${fmt(g.totFee)}</td><td class=\"table-danger text-danger\">${fmt(g.totInst)}</td><td class=\"table-danger text-danger\">${fmt(g.totMgmt)}</td><td class=\"table-secondary text-danger fw-bold\">${fmt(diffFee)}</td><td class=\"text-start small\" style=\"max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;\" title=\"${uniqueMemos.join(', ')}\">${uniqueMemos.join(', ')}</td></tr>`; }); } if($('prev_inv')) $('prev_inv').innerHTML = h; };
window.exInvoice = function() { const q = window.gQ, sVal = val('p_sInvoice'); const data = getInvoiceData(q, sVal); if (!data.length) return alert('출력할 데이터가 없습니다.'); const wb = XLSX.utils.book_new(); const aoa = [ [`방과후학교 ${q}분기 ${sVal==='ALL'?'전체합산':sVal+'차'} 교육비 청구서`], [], [`1. 교육기간 : `], [`2. 입금계좌 : `], [`3. 청구내용 : `], [], [ '순번', '부서명', '1인당수강료', '1인당강사료', '1인당수용비', '수익자인원', '수익자수강료', '수익자강사료', '수익자수용비', '초3인원', '초3수강료', '초3강사료', '초3수용비', '자유인원', '자유수강료', '자유강사료', '자유수용비', '합계인원', '합계수강료', '합계강사료', '합계수용비', '차액(환불/조정)', '비고(수강료적요)' ] ]; let idx = 1; let tSelf=0, tSelfI=0, tSelfM=0, tCho=0, tChoI=0, tChoM=0, tFree=0, tFreeI=0, tFreeM=0, tTot=0, tTotI=0, tTotM=0; data.forEach(g => { const diffFee = g.totFee - (g.baseT * g.totCnt); aoa.push([ idx++, g.c, g.baseT, g.baseI, g.baseM, g.selfCnt, g.selfFee, g.selfInst, g.selfMgmt, g.cho3Cnt, g.cho3Fee, g.cho3Inst, g.cho3Mgmt, g.freeCnt, g.freeFee, g.freeInst, g.freeMgmt, g.totCnt, g.totFee, g.totInst, g.totMgmt, diffFee, [...new Set(g.memos)].join(', ') ]); tSelf+=g.selfFee; tSelfI+=g.selfInst; tSelfM+=g.selfMgmt; tCho+=g.cho3Fee; tChoI+=g.cho3Inst; tChoM+=g.cho3Mgmt; tFree+=g.freeFee; tFreeI+=g.freeInst; tFreeM+=g.freeMgmt; tTot+=g.totFee; tTotI+=g.totInst; tTotM+=g.totMgmt; }); aoa.push(['총계', '', '', '', '', '', tSelf, tSelfI, tSelfM, '', tCho, tChoI, tChoM, '', tFree, tFreeI, tFreeM, '', tTot, tTotI, tTotM, '', '']); const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!merges'] = [ {s:{r:0,c:0},e:{r:0,c:22}}, {s:{r:2,c:0},e:{r:2,c:3}}, {s:{r:2,c:4},e:{r:2,c:22}}, {s:{r:3,c:0},e:{r:3,c:3}}, {s:{r:3,c:4},e:{r:3,c:22}}, {s:{r:4,c:0},e:{r:4,c:22}} ]; XLSX.utils.book_append_sheet(wb, ws, `${sVal==='ALL'?'전체':sVal+'차'} 청구서`); XLSX.writeFile(wb, `${q}분기_${sVal==='ALL'?'전체합산':sVal+'차'}_교육비청구서.xlsx`); };
window.exRef = function() { const q = window.gQ; const data = E.filter(e => e.q === q && (e.rT>0 || e.rB>0 || (e.adjusts&&e.adjusts.length>0))).map(e => ({ q: e.q, c: e.course, dp: dsp(e.g,e.b,e.n), nm: e.name, g: e.g, b: e.b, n: e.n, rT: e.rT, rB: e.rB, cT: e.cT, cB: e.cB, mm: e.mm })); if (!data.length) return alert('환불 내역이 없습니다.'); const wb = XLSX.utils.book_new(); const rows = data.map(r => ({ '분기': r.q+'분기', '학년': r.g, '반': r.b, '번호': r.n, '이름': r.nm, '강좌명': r.c, '환불_수강료': r.rT, '환불_교재비': r.rB, '실부담_수강료': r.cT, '실부담_교재비': r.cB, '사유_상세': r.mm })); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), '환불조정내역'); XLSX.writeFile(wb, `${q}분기_환불_조정_사후증빙용_${new Date().toISOString().slice(0,10)}.xlsx`); };
window.renderPreviewRef = function() { const q = window.gQ; const data = E.filter(e => e.q === q && (e.rT>0 || e.rB>0 || (e.adjusts&&e.adjusts.length>0))).map(e => ({ q: e.q, c: e.course, dp: dsp(e.g,e.b,e.n), nm: e.name, g: e.g, b: e.b, n: e.n, rT: e.rT, rB: e.rB, cT: e.cT, cB: e.cB, mm: e.mm })); let h = ''; if(!data.length) h = `<tr><td colspan="7" class="text-muted py-3">환불/조정 내역이 없습니다.</td></tr>`; else { data.forEach(r => { const stuUid = uid(r.g, r.b, r.n, r.nm).replace(/'/g,"\\'"); const safeCourse = r.c.replace(/'/g, "\\'"); h += `<tr><td>${r.q}분기</td><td class="course-link" onclick="openCourseSummary('${safeCourse}', ${r.q})">${r.c}</td><td>${r.dp}</td><td class="fw-bold"><span class="clickable text-dark" onclick="openStuConsole('${stuUid}')">${r.nm}</span></td><td class="text-danger">${fmt(r.rT)}</td><td class="text-danger">${fmt(r.rB)}</td><td class="text-start" style="font-size:0.8rem;">${r.mm}</td></tr>`; }); } if($('prev_ref')) $('prev_ref').innerHTML = h; };
function getRosterData(q) { const tg = val('p_tg'), so = val('p_so'); let rows = Hs.filter(h => h.q === q).map(h => { let t=0, b=0; if (tg==='SELF') {t=h.finT;b=h.finB;} else if (tg==='CHO3') {t=h.tc;b=h.bc;} else if (tg==='FREE') {t=h.tf;b=h.bf;} else {t=h.sT;b=h.sB;} return { g: h.g, ban: h.ban, n: h.num, nm: h.nm, c: h.c, t, b, tot: t+b }; }).filter(x => x.tot > 0); rows.sort((a,b) => so==='C' ? a.c.localeCompare(b.c)||a.g-b.g||a.ban-b.ban||a.n-b.n : a.g-b.g||a.ban-b.ban||a.n-b.n||a.nm.localeCompare(b.nm)); return rows; }
window.renderPreviewRoster = function() { const q = window.gQ; const data = getRosterData(q); let h = ''; if(!data.length) h = `<tr><td colspan="7" class="text-muted py-3">명단이 없습니다.</td></tr>`; else { let totT=0, totB=0, totAll=0; data.forEach(r => { totT+=r.t; totB+=r.b; totAll+=r.tot; }); h += `<tr class="sticky-total-row fw-bold text-center"><td colspan="4" class="text-end pe-3">총 합계</td><td>${fmt(totT)}</td><td>${fmt(totB)}</td><td class="text-danger fs-6">${fmt(totAll)}</td></tr>`; data.forEach((r, i) => { const stuUid = uid(r.g, r.ban, r.n, r.nm).replace(/'/g,"\\'"); const safeCourse = r.c.replace(/'/g, "\\'"); h += `<tr><td>${i+1}</td><td>${dsp(r.g, r.ban, r.n)}</td><td class="fw-bold"><span class="clickable text-dark" onclick="openStuConsole('${stuUid}')">${r.nm}</span></td><td class="course-link" onclick="openCourseSummary('${safeCourse}', window.gQ)">${r.c}</td><td>${fmt(r.t)}</td><td>${fmt(r.b)}</td><td class="fw-bold text-primary">${fmt(r.tot)}</td></tr>`; }); } if($('prev_ros')) $('prev_ros').innerHTML = h; };
window.exRoster = function() { const q = window.gQ, tg = val('p_tg'), data = getRosterData(q); if (!data.length) return alert('명단이 없습니다.'); const wb = XLSX.utils.book_new(); const sheetData = data.map((x, i) => ({ '연번': i+1, '학년': x.g, '반': x.ban, '번호': x.n, '이름': x.nm, '과목': x.c, '수강료': x.t, '교재비': x.b, '합계': x.tot })); const sumT = sheetData.reduce((sum, x) => sum + x['수강료'], 0), sumB = sheetData.reduce((sum, x) => sum + x['교재비'], 0), sumTot = sheetData.reduce((sum, x) => sum + x['합계'], 0); sheetData.push({ '연번': '총계', '학년': '', '반': '', '번호': '', '이름': '', '과목': '', '수강료': sumT, '교재비': sumB, '합계': sumTot }); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetData), '정산명단'); XLSX.writeFile(wb, `${q}분기_${tg}_정산명단.xlsx`); };

// --- UI 화면 직접 내보내기 (Excel, Image, Print) 엔진 ---
window.exportAsExcel = function(targetId, title) {
    const el = document.getElementById(targetId); if (!el) return; const tables = el.querySelectorAll('table'); if (tables.length === 0) return alert('추출할 표가 없습니다.');
    const wb = XLSX.utils.book_new();
    tables.forEach((table, idx) => {
        const clone = table.cloneNode(true); clone.querySelectorAll('.no-print').forEach(n => n.remove());
        let hasSplitHakjuk = false;
        Array.from(clone.rows).forEach(row => {
            let hakjukCell = null;
            Array.from(row.cells).forEach(cell => {
                const txt = cell.textContent.trim();
                if (cell.tagName === 'TH' && txt.includes('학적') && !txt.includes('학적순')) { hakjukCell = cell; } 
                else if (/^\d+-\d+-\d+$/.test(txt)) {
                    hasSplitHakjuk = true; const parts = txt.split('-'); const rowspan = cell.getAttribute('rowspan') || 1;
                    const td1 = document.createElement(cell.tagName); td1.innerHTML = parts[0]; td1.setAttribute('rowspan', rowspan);
                    const td2 = document.createElement(cell.tagName); td2.innerHTML = parts[1]; td2.setAttribute('rowspan', rowspan);
                    const td3 = document.createElement(cell.tagName); td3.innerHTML = parts[2]; td3.setAttribute('rowspan', rowspan);
                    cell.replaceWith(td1, td2, td3);
                }
            });
            if (hakjukCell) {
                hasSplitHakjuk = true; const rowspan = hakjukCell.getAttribute('rowspan') || 1;
                const th1 = document.createElement(hakjukCell.tagName); th1.innerHTML = '학년'; th1.setAttribute('rowspan', rowspan);
                const th2 = document.createElement(hakjukCell.tagName); th2.innerHTML = '반'; th2.setAttribute('rowspan', rowspan);
                const th3 = document.createElement(hakjukCell.tagName); th3.innerHTML = '번호'; th3.setAttribute('rowspan', rowspan);
                hakjukCell.replaceWith(th1, th2, th3);
            }
        });
        if (hasSplitHakjuk) {
            Array.from(clone.rows).forEach(row => {
                if (row.cells.length > 0) { const firstCell = row.cells[0]; if (firstCell.textContent.includes('총 합계')) { const currentColspan = parseInt(firstCell.getAttribute('colspan') || 1); firstCell.setAttribute('colspan', currentColspan + 2); } }
            });
        }
        const ws = XLSX.utils.table_to_sheet(clone); XLSX.utils.book_append_sheet(wb, ws, tables.length > 1 ? `Sheet${idx+1}` : '정산결과');
    });
    XLSX.writeFile(wb, `${title}_${new Date().toISOString().slice(0,10)}.xlsx`);
};

window.exportAsImage = function(targetId, title) {
    const el = document.getElementById(targetId); if (!el) return;
    const scrollables = el.querySelectorAll('.table-responsive, [style*="max-height"]'); const originalStyles = [];
    scrollables.forEach((node, i) => { originalStyles[i] = { maxHeight: node.style.maxHeight, overflowY: node.style.overflowY }; node.style.maxHeight = 'none'; node.style.overflowY = 'visible'; });
    const parentOrig = { maxHeight: el.style.maxHeight, overflowY: el.style.overflowY }; el.style.maxHeight = 'none'; el.style.overflowY = 'visible';
    html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true }).then(canvas => {
        const link = document.createElement('a'); link.download = `${title}_${new Date().toISOString().slice(0,10)}.png`; link.href = canvas.toDataURL('image/png'); link.click(); restoreStyles();
    }).catch(err => { console.error('이미지 캡처 오류', err); alert('화면 캡처 중 오류가 발생했습니다.'); restoreStyles(); });
    function restoreStyles() {
        el.style.maxHeight = parentOrig.maxHeight; el.style.overflowY = parentOrig.overflowY;
        scrollables.forEach((node, i) => { node.style.maxHeight = originalStyles[i].maxHeight; node.style.overflowY = originalStyles[i].overflowY; });
    }
};

window.printElement = function(targetId, title) {
    const el = document.getElementById(targetId); if (!el) return; const win = window.open('', '_blank', 'width=1100,height=800'); win.document.write('<html><head><title>' + title + '</title>');
    document.querySelectorAll('link[rel="stylesheet"], style').forEach(node => { win.document.write(node.outerHTML); });
    win.document.write('<style>body { padding:20px; background:#fff !important; font-size: 12px !important; } .no-print { display:none !important; } table { page-break-inside:auto; width: 100% !important; table-layout: auto !important; } tr { page-break-inside:avoid; page-break-after:auto; } thead { display:table-header-group; } th, td { font-size: 10px !important; padding: 4px 2px !important; word-break: keep-all !important; white-space: normal !important; } .table-responsive, [style*="max-height"] { max-height: none !important; overflow: visible !important; height: auto !important; } h3 { font-size: 18px !important; margin-bottom: 15px !important; }</style>');
    win.document.write('</head><body><h3 style="font-weight:bold; text-align:center;">' + title + '</h3>'); win.document.write(el.outerHTML); win.document.write('</body></html>'); win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 800); 
};

window.exportCurrentStep4 = function(type) {
    const activeTabBtn = document.querySelector('#step4 .nav-tabs .nav-link.active'); if(!activeTabBtn) return;
    const targetId = activeTabBtn.getAttribute('data-bs-target').replace('#', ''); const title = '4스텝_' + activeTabBtn.innerText.trim().replace(/[^가-힣a-zA-Z0-9]/g, '_');
    if (type === 'EXCEL') exportAsExcel(targetId, title); else if (type === 'IMAGE') exportAsImage(targetId, title); else if (type === 'PRINT') printElement(targetId, title);
};

window.exportModalView = function(type, targetId) {
    let title = '상세명세서';
    if(targetId === 'mdlStuConsoleBody' && document.getElementById('consoleTitle')) { title = document.getElementById('consoleTitle').innerText.trim().replace(/[^가-힣a-zA-Z0-9]/g, '_'); }
    if(targetId === 'mdlCourseSummaryBody' && document.getElementById('crsSummaryTitle')) { title = document.getElementById('crsSummaryTitle').innerText.trim().replace(/[^가-힣a-zA-Z0-9]/g, '_'); }
    if (type === 'EXCEL') exportAsExcel(targetId, title); else if (type === 'IMAGE') exportAsImage(targetId, title); else if (type === 'PRINT') printElement(targetId, title);
};