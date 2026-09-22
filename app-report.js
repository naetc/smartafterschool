/* ==========================================================================
   파일닉네임: app-report.js
   기능설명: 5스텝 "운영 보고서(A4 인쇄)" — 이미 계산돼 있는 연간(1~4분기) 데이터를
             한 장씩 집계·요약해서 인쇄용으로 보여준다.
   ⚠ 이 파일은 window.Hs/window.Ld/window.E/window.F/window.M/window.C 등 엔진이
      이미 만들어둔 결과를 "읽기"만 한다. 새로운 금액 계산 로직은 없음 — 정산
      규칙(core-rules.md)에 손대지 않는다.
   ========================================================================== */
'use strict';

// 💡 어떤 섹션을 인쇄에 포함할지. 체크박스 하나당 키 하나. 기본값은 전부 포함.
window.reportSectionToggle = {
    summary: true, deptEnroll: true, trend: true, deptPerf: true,
    budget: true, refAdj: true, transfer: true, deadline: true
};

window.REPORT_SECTIONS_META = [
    { key: 'summary',   label: '분기 총괄 요약' },
    { key: 'deptEnroll', label: '부서별 수강현황 (연인원)' },
    { key: 'trend',     label: '수강자 증가추이' },
    { key: 'deptPerf',  label: '부서별 실적 요약' },
    { key: 'budget',    label: '예산 집행 현황' },
    { key: 'refAdj',    label: '환불·조정 이력 요약' },
    { key: 'transfer',  label: '전입생 조정 현황' },
    { key: 'deadline',  label: '마감 현황 체크리스트' }
];

// 💡 5스텝 "운영 보고서" 탭을 처음 열 때 호출(index.html의 pill onclick).
window.initStep5Report = function() {
    if (typeof window.autoRunSet === 'function') window.autoRunSet(true);
    window.renderReportToggles();
    window.renderReport();
};

window.renderReportToggles = function() {
    const box = window.$('reportSectionToggles');
    if (!box) return;
    box.innerHTML = window.REPORT_SECTIONS_META.map(m => `
        <div class="form-check form-check-inline mb-0">
            <input class="form-check-input" type="checkbox" id="rptChk_${m.key}" ${window.reportSectionToggle[m.key] ? 'checked' : ''} onchange="window.reportSectionToggle['${m.key}']=this.checked; window.renderReport();">
            <label class="form-check-label" for="rptChk_${m.key}">${m.label}</label>
        </div>`).join('');
};

window.printReport = function() { window.print(); };

// --------------------------------------------------------------------------
// 공용 유틸
// --------------------------------------------------------------------------
// 강좌명 → 부서명. 강좌수(반수)가 2 이상이면 "부서명(A)", "부서명(B)"처럼 접미사가
// 붙는 규칙([app-ui-export.js]의 buildEduTabs와 동일 패턴)을 그대로 재사용한다.
function reportDeptOf(courseName) {
    return String(courseName || '').replace(/\s*\([A-Za-z가-힣0-9]+\)$/, '').trim();
}

function reportPct(part, total) {
    if (!total) return 0;
    return Math.round((part / total) * 1000) / 10;
}

// --------------------------------------------------------------------------
// 렌더 진입점
// --------------------------------------------------------------------------
window.renderReport = function() {
    const area = window.$('reportPrintArea');
    if (!area) return;
    if (typeof window.autoRunSet === 'function') window.autoRunSet(true);

    const title = (window.val('reportTitleInput')) || '방과후학교 운영 보고서';
    const now = new Date();
    const genDate = `${now.getFullYear()}. ${now.getMonth() + 1}. ${now.getDate()}.`;
    const accLabel = window.SysSet.accType === 'SEPARATED' ? '교재·재료비 분리형(3D)' : '교재비 통합형(2D)';

    let html = `
        <div class="text-center mb-4">
            <h3 class="fw-bold mb-1">${window.escHtml(title)}</h3>
            <div class="text-muted small">발행일: ${genDate} · 집계 기준: 1~4분기 전체 · 회계 유형: ${accLabel}</div>
        </div>`;

    const T = window.reportSectionToggle;
    if (T.summary)    html += buildReportSummarySection();
    if (T.deptEnroll) html += buildReportDeptEnrollSection();
    if (T.trend)      html += buildReportTrendSection();
    if (T.deptPerf)   html += buildReportDeptPerfSection();
    if (T.budget)     html += buildReportBudgetSection();
    if (T.refAdj)     html += buildReportRefAdjSection();
    if (T.transfer)   html += buildReportTransferSection();
    if (T.deadline)   html += buildReportDeadlineSection();

    area.innerHTML = html;
};

// --------------------------------------------------------------------------
// 1. 분기 총괄 요약
// --------------------------------------------------------------------------
function buildReportSummarySection() {
    const is3D = window.SysSet.accType === 'SEPARATED';
    let rows = '';
    const g = { cho3: 0, free: 0, self: 0, gross: 0 };
    let gStuIds = new Set(), gCIds = new Set(), gFIds = new Set();

    for (let q = 1; q <= 4; q++) {
        const rs = window.Hs.filter(h => h.q === q);
        const ids = new Set(rs.map(h => h.id));
        const cIds = new Set(rs.filter(h => h.isC).map(h => h.id));
        const fIds = new Set(rs.filter(h => h.isF).map(h => h.id));
        ids.forEach(x => gStuIds.add(x)); cIds.forEach(x => gCIds.add(x)); fIds.forEach(x => gFIds.add(x));

        const cho3Sum = rs.reduce((a, h) => a + h.tc + h.bc + (h.mc || 0), 0);
        const freeSum = rs.reduce((a, h) => a + h.tf + h.bf + (h.mf || 0), 0);
        const selfSum = rs.reduce((a, h) => a + h.finT + h.finB + (h.finM || 0), 0);
        const grossSum = rs.reduce((a, h) => a + h.sT + h.sB + (h.sM || 0), 0);
        g.cho3 += cho3Sum; g.free += freeSum; g.self += selfSum; g.gross += grossSum;

        rows += `<tr>
            <td class="fw-bold">${q}분기</td>
            <td>${ids.size}</td><td>${cIds.size}</td><td>${fIds.size}</td>
            <td class="text-end text-primary">${window.fmt(cho3Sum)}</td>
            <td class="text-end text-success">${window.fmt(freeSum)}</td>
            <td class="text-end text-danger fw-bold">${window.fmt(selfSum)}</td>
            <td class="text-end">${window.fmt(grossSum)}</td>
            <td>${reportPct(cho3Sum + freeSum, grossSum)}%</td>
        </tr>`;
    }

    return `
    <div class="report-section mb-4">
        <h5 class="fw-bold mb-3"><i class="bi bi-clipboard-data"></i> 1. 분기 총괄 요약</h5>
        <div class="small text-muted mb-2">대상자 수는 그 분기에 강좌를 하나라도 듣고 있는 학생 실인원 기준입니다. 지원율 = (초3+자유 지원액) ÷ 총 청구액.</div>
        <table class="table table-sm table-bordered text-center align-middle">
            <thead class="table-light">
                <tr><th>분기</th><th>수강 학생수</th><th>초3 대상</th><th>자유 대상</th><th>초3 지원액</th><th>자유 지원액</th><th>자부담 합계</th><th>총 청구액</th><th>지원율</th></tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
                <tr class="table-dark fw-bold">
                    <td>연간(연인원 제외 실인원)</td>
                    <td>${gStuIds.size}</td><td>${gCIds.size}</td><td>${gFIds.size}</td>
                    <td class="text-end text-primary">${window.fmt(g.cho3)}</td>
                    <td class="text-end text-success">${window.fmt(g.free)}</td>
                    <td class="text-end text-danger">${window.fmt(g.self)}</td>
                    <td class="text-end">${window.fmt(g.gross)}</td>
                    <td>${reportPct(g.cho3 + g.free, g.gross)}%</td>
                </tr>
            </tfoot>
        </table>
        ${!is3D ? '' : '<div class="small text-muted">※ 교재·재료비 분리형(3D) 기준 금액이 합산되어 있습니다.</div>'}
    </div>`;
}

// --------------------------------------------------------------------------
// 2. 부서별 수강현황 (전체 + 분기별, 연인원) — 강좌별로도 볼 수 있음
// --------------------------------------------------------------------------
// 💡 부서 묶음(반 합산)이 기본이지만, "가상마술(A)"·"가상마술(B)"처럼 반별로 나눠 보고
// 싶을 때가 있어 토글로 전환한다(2026-09-22 추가). 이 상태는 섹션 체크박스와 달리
// 인쇄 항목을 껐다 켜는 게 아니라 같은 섹션 안에서 집계 단위만 바꾸는 것이라 별도 변수로 둔다.
window.reportDeptEnrollByCourse = false;
window.toggleReportDeptEnrollGranularity = function(checked) {
    window.reportDeptEnrollByCourse = checked;
    window.renderReport();
};

function buildReportDeptEnrollSection() {
    const byCourse = !!window.reportDeptEnrollByCourse;
    const perKey = {};
    window.E.forEach(e => {
        const key = byCourse ? e.course : reportDeptOf(e.course);
        if (!perKey[key]) perKey[key] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
        if (perKey[key][e.q] != null) perKey[key][e.q]++;
        perKey[key].total++;
    });
    // 강좌별 모드에서도 같은 부서 소속 강좌끼리 붙어 보이도록, "가상마술(A)"·"가상마술(B)"
    // 처럼 반 접미사가 다른 것끼리 자연스럽게 이웃하는 문자열 정렬을 그대로 쓴다.
    const keys = Object.keys(perKey).sort();
    const qTot = { 1: 0, 2: 0, 3: 0, 4: 0 }; let grand = 0;
    keys.forEach(k => { for (let q = 1; q <= 4; q++) qTot[q] += perKey[k][q]; grand += perKey[k].total; });

    let rows = keys.map(k => {
        const r = perKey[k];
        return `<tr><td class="text-start ps-2 fw-bold">${window.escHtml(k)}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td class="fw-bold">${r.total}</td></tr>`;
    }).join('');

    if (!keys.length) rows = `<tr><td colspan="6" class="py-3 text-muted">등록된 수강 데이터가 없습니다.</td></tr>`;

    return `
    <div class="report-section mb-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="fw-bold mb-0"><i class="bi bi-people"></i> 2. ${byCourse ? '강좌별' : '부서별'} 수강현황 (전체 · 분기별)</h5>
            <div class="form-check form-switch mb-0 no-print">
                <input class="form-check-input" type="checkbox" id="rptDeptGranularity" ${byCourse ? 'checked' : ''} onchange="window.toggleReportDeptEnrollGranularity(this.checked)">
                <label class="form-check-label small" for="rptDeptGranularity">강좌별로 보기 (반 나눠서)</label>
            </div>
        </div>
        <div class="small text-muted mb-2">같은 학생이 여러 분기·여러 강좌를 들으면 각각 별도로 집계되는 연인원 기준입니다(실인원 아님).</div>
        <table class="table table-sm table-bordered text-center align-middle">
            <thead class="table-light"><tr><th>${byCourse ? '강좌명' : '부서(강좌)'}</th><th>1분기</th><th>2분기</th><th>3분기</th><th>4분기</th><th>연간 합계</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr class="table-dark fw-bold"><td>전체 합계</td><td>${qTot[1]}</td><td>${qTot[2]}</td><td>${qTot[3]}</td><td>${qTot[4]}</td><td>${grand}</td></tr></tfoot>
        </table>
    </div>`;
}

// --------------------------------------------------------------------------
// 3. 수강자 증가추이 (연인원, 분기별)
// --------------------------------------------------------------------------
function buildReportTrendSection() {
    const qTot = { 1: 0, 2: 0, 3: 0, 4: 0 };
    window.E.forEach(e => { if (qTot[e.q] != null) qTot[e.q]++; });
    const max = Math.max(1, qTot[1], qTot[2], qTot[3], qTot[4]);

    let bars = '';
    for (let q = 1; q <= 4; q++) {
        const pct = Math.round((qTot[q] / max) * 100);
        bars += `
        <div class="d-flex align-items-center mb-2">
            <div style="width:55px;" class="fw-bold small">${q}분기</div>
            <div class="report-bar-track flex-grow-1" style="height:22px;">
                <div class="report-bar-fill" style="width:${pct}%; height:100%;"></div>
            </div>
            <div style="width:80px;" class="text-end small fw-bold">${window.fmt(qTot[q])}건</div>
        </div>`;
    }

    let deltaRows = '';
    for (let q = 2; q <= 4; q++) {
        const prev = qTot[q - 1], cur = qTot[q], diff = cur - prev;
        const pct = reportPct(diff, prev);
        const sign = diff > 0 ? '+' : '';
        deltaRows += `<tr><td>${q - 1}분기 → ${q}분기</td><td class="${diff >= 0 ? 'text-primary' : 'text-danger'} fw-bold">${sign}${window.fmt(diff)}건</td><td>${sign}${pct}%</td></tr>`;
    }

    return `
    <div class="report-section mb-4">
        <h5 class="fw-bold mb-3"><i class="bi bi-graph-up-arrow"></i> 3. 수강자 증가추이</h5>
        <div class="row g-4">
            <div class="col-md-7">${bars}</div>
            <div class="col-md-5">
                <table class="table table-sm table-bordered text-center align-middle mb-0">
                    <thead class="table-light"><tr><th>구간</th><th>증감</th><th>증감률</th></tr></thead>
                    <tbody>${deltaRows}</tbody>
                </table>
            </div>
        </div>
    </div>`;
}

// --------------------------------------------------------------------------
// 4. 부서별 실적 요약 (연간 실제 청구·지원 금액 — 예산 대비가 아니라 실적 그 자체)
// --------------------------------------------------------------------------
function buildReportDeptPerfSection() {
    const is3D = window.SysSet.accType === 'SEPARATED';
    const perDept = {};
    window.Hs.forEach(h => {
        const dept = reportDeptOf(h.c);
        if (!perDept[dept]) perDept[dept] = { cnt: 0, gross: 0, cho3: 0, free: 0, self: 0 };
        const d = perDept[dept];
        d.cnt++;
        d.gross += h.sT + h.sB + (h.sM || 0);
        d.cho3 += h.tc + h.bc + (h.mc || 0);
        d.free += h.tf + h.bf + (h.mf || 0);
        d.self += h.finT + h.finB + (h.finM || 0);
    });
    const depts = Object.keys(perDept).sort();
    let rows = depts.map(d => {
        const r = perDept[d];
        return `<tr><td class="text-start ps-2 fw-bold">${window.escHtml(d)}</td><td>${r.cnt}</td><td class="text-end">${window.fmt(r.gross)}</td><td class="text-end text-primary">${window.fmt(r.cho3)}</td><td class="text-end text-success">${window.fmt(r.free)}</td><td class="text-end text-danger">${window.fmt(r.self)}</td></tr>`;
    }).join('');
    if (!depts.length) rows = `<tr><td colspan="6" class="py-3 text-muted">데이터가 없습니다.</td></tr>`;

    return `
    <div class="report-section mb-4">
        <h5 class="fw-bold mb-3"><i class="bi bi-bar-chart"></i> 4. 부서별 실적 요약</h5>
        <div class="small text-muted mb-2">1스텝에 입력한 월 단가(강사료·수용비)는 부서마다 산정 방식이 달라 예산 대비 집행률로 환산하지 않았습니다. 실제로 청구·지원된 금액만 연간 합계로 보여줍니다.</div>
        <table class="table table-sm table-bordered text-center align-middle">
            <thead class="table-light"><tr><th>부서(강좌)</th><th>연간 수강건수</th><th>총 청구액</th><th>초3 지원액</th><th>자유 지원액</th><th>자부담액</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
        ${is3D ? '' : ''}
    </div>`;
}

// --------------------------------------------------------------------------
// 5. 예산 집행 현황 (한도 대비 소진율 + 한도초과 경고)
// --------------------------------------------------------------------------
function buildReportBudgetSection() {
    const overruns = (typeof window.getBudgetOverruns === 'function') ? window.getBudgetOverruns() : [];

    // 학생별 {사용액, 한도} 원자료를 먼저 모아두고, 평균/총 집행률/구간분포를 전부 같은
    // 데이터에서 뽑는다. 평균(단순평균)만 보면 학생마다 한도가 달라도(전입 조정 등) 다
    // 똑같은 비중으로 섞이고, 한도에 바짝 붙은 학생이 몇 명인지도 안 보인다.
    const cStats = [], fStats = [];
    Object.values(window.Ld || {}).forEach(L => {
        const rows = window.Hs.filter(h => h.id === L.id);
        if (L.isC && L.cTotal > 0) cStats.push({ used: rows.reduce((a, h) => a + h.tc + h.bc + (h.mc || 0), 0), cap: L.cTotal });
        if (L.isF && L.fTotal > 0) fStats.push({ used: rows.reduce((a, h) => a + h.tf + h.bf + (h.mf || 0), 0), cap: L.fTotal });
    });

    // 예산 집행률: (사용액 총합÷한도 총합). 한도가 전원 동일하면 개인별 평균과 대수적으로
    // 완전히 같은 값이라 굳이 둘 다 보여줄 필요가 없다(전입 조정으로 한도가 갈릴 때만
    // 달라지는데, 그건 "구간별 인원 분포" 표에서 이미 드러난다). 총액 기준이 "예산 집행
    // 현황"이라는 섹션 제목과도 더 맞아서 이 하나만 남긴다.
    const totalRate = list => { const u = list.reduce((a, s) => a + s.used, 0), c = list.reduce((a, s) => a + s.cap, 0); return c > 0 ? Math.round((u / c) * 1000) / 10 : 0; };
    // 구간분포: 한도에 바짝 붙은(90%+) 학생이 몇 명인지 — 다음 분기 초과 위험 신호
    const bucketOf = list => {
        const b = { high: 0, mid: 0, low: 0 };
        list.forEach(s => { const r = s.used / s.cap; if (r >= 0.9) b.high++; else if (r >= 0.5) b.mid++; else b.low++; });
        return b;
    };
    const cBucket = bucketOf(cStats), fBucket = bucketOf(fStats);
    const bucketRow = (label, b, total, colorClass) => `<tr>
        <td class="text-start ps-2 fw-bold">${label}</td>
        <td class="${colorClass} fw-bold">${b.high}명</td>
        <td>${b.mid}명</td>
        <td>${b.low}명</td>
        <td class="fw-bold">${total}명</td>
    </tr>`;

    const byKind = {};
    overruns.forEach(o => { if (!byKind[o.kind]) byKind[o.kind] = { cnt: 0, over: 0 }; byKind[o.kind].cnt++; byKind[o.kind].over += o.over; });
    const kindRows = Object.keys(byKind).map(k => `<tr><td class="text-start ps-2">${window.escHtml(k)}</td><td class="text-danger fw-bold">${byKind[k].cnt}명</td><td class="text-end text-danger">${window.fmt(byKind[k].over)}원</td></tr>`).join('')
        || `<tr><td colspan="3" class="py-2 text-muted">한도를 초과한 학생이 없습니다.</td></tr>`;

    const SHOW_MAX = 12;
    const detailRows = overruns.slice(0, SHOW_MAX).map(o => `<tr><td>${window.escHtml(o.dp)}</td><td>${window.escHtml(o.nm)}</td><td class="text-start">${window.escHtml(o.kind)}</td><td class="text-end">${window.fmt(o.used)}</td><td class="text-end">${window.fmt(o.cap)}</td><td class="text-end text-danger fw-bold">${window.fmt(o.over)}</td></tr>`).join('');

    return `
    <div class="report-section mb-4">
        <h5 class="fw-bold mb-3"><i class="bi bi-wallet2"></i> 5. 예산 집행 현황</h5>
        <div class="row g-3 mb-3">
            <div class="col-md-6">
                <div class="border rounded p-2 text-center h-100">
                    <div class="small text-muted">초3 지원금 예산 집행률</div>
                    <div class="fs-4 fw-bold text-primary">${totalRate(cStats)}%</div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="border rounded p-2 text-center h-100">
                    <div class="small text-muted">자유수강권 예산 집행률</div>
                    <div class="fs-4 fw-bold text-success">${totalRate(fStats)}%</div>
                </div>
            </div>
        </div>
        <div class="small text-muted mb-1">한도 소진 구간별 인원 — 90% 이상은 다음 분기에 한도를 넘길 위험이 있는 학생입니다.</div>
        <table class="table table-sm table-bordered text-center align-middle mb-3">
            <thead class="table-light"><tr><th>구분</th><th class="text-danger">90% 이상</th><th>50~90%</th><th>50% 미만</th><th>대상 인원</th></tr></thead>
            <tbody>
                ${cStats.length ? bucketRow('초3 지원금', cBucket, cStats.length, 'text-danger') : ''}
                ${fStats.length ? bucketRow('자유수강권', fBucket, fStats.length, 'text-danger') : ''}
                ${(!cStats.length && !fStats.length) ? '<tr><td colspan="5" class="py-2 text-muted">대상 학생이 없습니다.</td></tr>' : ''}
            </tbody>
        </table>
        <table class="table table-sm table-bordered text-center align-middle mb-3">
            <thead class="table-light"><tr><th>구분</th><th>초과 인원</th><th>초과 총액</th></tr></thead>
            <tbody>${kindRows}</tbody>
        </table>
        ${overruns.length ? `
        <div class="small fw-bold mb-1">한도 초과 상세${overruns.length > SHOW_MAX ? ` (초과액 큰 순 ${SHOW_MAX}명, 전체 ${overruns.length}명)` : ''}</div>
        <table class="table table-sm table-bordered text-center align-middle">
            <thead class="table-light"><tr><th>학적</th><th>이름</th><th>구분</th><th>사용액</th><th>한도</th><th>초과액</th></tr></thead>
            <tbody>${detailRows}</tbody>
        </table>` : ''}
    </div>`;
}

// --------------------------------------------------------------------------
// 6. 환불·조정 이력 요약
// --------------------------------------------------------------------------
function buildReportRefAdjSection() {
    const perQ = { 1: { refCnt: 0, refAmt: 0, adjCnt: 0, adjAmt: 0 }, 2: { refCnt: 0, refAmt: 0, adjCnt: 0, adjAmt: 0 }, 3: { refCnt: 0, refAmt: 0, adjCnt: 0, adjAmt: 0 }, 4: { refCnt: 0, refAmt: 0, adjCnt: 0, adjAmt: 0 } };
    window.E.forEach(e => {
        const p = perQ[e.q]; if (!p) return;
        (e.refunds || []).forEach(r => { p.refCnt++; p.refAmt += (r.rt || 0) + (r.rb || 0) + (r.rm || 0); });
        (e.adjusts || []).forEach(a => {
            if (a.title && a.title.includes('[예외설정]')) return; // 공제 우선순위 등 설정 로그는 금액 조정이 아니므로 제외
            p.adjCnt++; p.adjAmt += (a.amtT || 0) + (a.amtB || 0) + (a.amtM || 0);
        });
    });

    let rows = '', totRef = { cnt: 0, amt: 0 }, totAdj = { cnt: 0, amt: 0 };
    for (let q = 1; q <= 4; q++) {
        const p = perQ[q];
        totRef.cnt += p.refCnt; totRef.amt += p.refAmt; totAdj.cnt += p.adjCnt; totAdj.amt += p.adjAmt;
        rows += `<tr><td class="fw-bold">${q}분기</td><td>${p.refCnt}건</td><td class="text-end text-danger">${window.fmt(p.refAmt)}</td><td>${p.adjCnt}건</td><td class="text-end ${p.adjAmt >= 0 ? 'text-primary' : 'text-danger'}">${window.fmt(p.adjAmt)}</td></tr>`;
    }

    let extinct = { cho3: 0, free: 0 };
    if (typeof window.getCarryForwardAmount === 'function') {
        Object.values(window.Ld || {}).forEach(L => {
            const cf = window.getCarryForwardAmount(L, 4);
            extinct.cho3 += cf.cho3; extinct.free += cf.free;
        });
    }

    return `
    <div class="report-section mb-4">
        <h5 class="fw-bold mb-3"><i class="bi bi-arrow-return-left"></i> 6. 환불·조정 이력 요약</h5>
        <div class="small text-muted mb-2">조정 금액은 순증감(늘어난 조정 − 줄어든 조정)이며, [예외설정] 공제 우선순위 로그는 제외했습니다.</div>
        <table class="table table-sm table-bordered text-center align-middle mb-2">
            <thead class="table-light"><tr><th>분기</th><th>환불 건수</th><th>환불 총액</th><th>조정 건수</th><th>조정 순증감액</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr class="table-dark fw-bold"><td>연간 합계</td><td>${totRef.cnt}건</td><td class="text-end">${window.fmt(totRef.amt)}</td><td>${totAdj.cnt}건</td><td class="text-end">${window.fmt(totAdj.amt)}</td></tr></tfoot>
        </table>
        <div class="alert alert-warning py-2 px-3 small mb-0">
            <i class="bi bi-info-circle"></i> 4분기에 환불로 아낀 지원금은 이월할 다음 분기가 없어 <b>소멸</b> 처리됩니다(core-rules.md 제6조 4항) — 초3 ${window.fmt(extinct.cho3)}원, 자유수강권 ${window.fmt(extinct.free)}원.
        </div>
    </div>`;
}

// --------------------------------------------------------------------------
// 7. 전입생 조정 현황
// --------------------------------------------------------------------------
function buildReportTransferSection() {
    const cho3Map = new Map();
    window.E.forEach(e => {
        if (e.transCho3Amt == null) return;
        const id = window.uid(e.g, e.b, e.n, e.name);
        cho3Map.set(id, { dp: window.dsp(e.g, e.b, e.n), nm: e.name, amt: e.transCho3Amt });
    });
    const cho3List = Array.from(cho3Map.values());
    const freeList = (window.F || []).filter(f => f.transFreeAmt != null).map(f => ({ dp: window.dsp(f.g, f.b, f.n), nm: f.name, amt: f.transFreeAmt }));

    const rowsOf = list => list.length
        ? list.map(x => `<tr><td>${window.escHtml(x.dp)}</td><td>${window.escHtml(x.nm)}</td><td class="text-end fw-bold">${window.fmt(x.amt)}원</td></tr>`).join('')
        : `<tr><td colspan="3" class="py-2 text-muted">전입 조정 대상이 없습니다.</td></tr>`;

    return `
    <div class="report-section mb-4">
        <h5 class="fw-bold mb-3"><i class="bi bi-sliders"></i> 7. 전입생 조정 현황</h5>
        <div class="row g-3">
            <div class="col-md-6">
                <div class="fw-bold text-primary mb-1">🧒 초3 지원금 전입 조정 (${cho3List.length}명)</div>
                <table class="table table-sm table-bordered text-center align-middle">
                    <thead class="table-light"><tr><th>학적</th><th>이름</th><th>이관 잔액</th></tr></thead>
                    <tbody>${rowsOf(cho3List)}</tbody>
                </table>
            </div>
            <div class="col-md-6">
                <div class="fw-bold text-success mb-1">🎟️ 자유수강권 전입 조정 (${freeList.length}명)</div>
                <table class="table table-sm table-bordered text-center align-middle">
                    <thead class="table-light"><tr><th>학적</th><th>이름</th><th>이관 잔액</th></tr></thead>
                    <tbody>${rowsOf(freeList)}</tbody>
                </table>
            </div>
        </div>
    </div>`;
}

// --------------------------------------------------------------------------
// 8. 마감 현황 체크리스트
// --------------------------------------------------------------------------
function buildReportDeadlineSection() {
    // 분기마다 차수 개수가 다를 수 있어(mh 콤마 개수), 표 폭을 맞추려면 전체 분기 중 최대값을 먼저 구한다.
    const maxSessByQ = {};
    let globalMaxSess = 1;
    for (let q = 1; q <= 4; q++) {
        let maxSess = 1;
        Object.keys(window.C || {}).forEach(c => {
            const m = (window.C[c]?.[q]?.mh || '4,4,4').split(',').filter(x => window.num(x) > 0).length;
            if (m > maxSess) maxSess = m;
        });
        maxSessByQ[q] = maxSess;
        if (maxSess > globalMaxSess) globalMaxSess = maxSess;
    }

    let rows = '';
    for (let q = 1; q <= 4; q++) {
        let cells = '';
        for (let i = 0; i < globalMaxSess; i++) {
            if (i >= maxSessByQ[q]) { cells += `<td class="text-muted">-</td>`; continue; }
            const closed = !!(window.SysSet.closedSess && window.SysSet.closedSess[`${q}_${i}`]);
            cells += `<td class="${closed ? 'table-success' : 'table-warning'} fw-bold">${closed ? '🔒 마감' : '미마감'}</td>`;
        }
        rows += `<tr><td class="fw-bold">${q}분기</td>${cells}</tr>`;
    }
    let head = ''; for (let i = 1; i <= globalMaxSess; i++) head += `<th>${i}차수</th>`;

    return `
    <div class="report-section mb-4">
        <h5 class="fw-bold mb-3"><i class="bi bi-lock"></i> 8. 마감 현황 체크리스트</h5>
        <div class="small text-muted mb-2">제출 전 아직 마감하지 않은 차수가 없는지 확인하세요. 마감된 차수는 엔진이 바뀌어도 금액이 고정됩니다.</div>
        <table class="table table-sm table-bordered text-center align-middle">
            <thead class="table-light"><tr><th>분기</th>${head}</tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}
