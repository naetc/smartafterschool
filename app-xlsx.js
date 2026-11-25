/* ==========================================================================
   파일닉네임: app-xlsx.js
   기능설명: 5스텝 서식을 '문서처럼 보이는' 엑셀로 저장하는 공용 도구 (2026-11-24)

   [왜 따로 두나]
   SheetJS(XLSX) 무료판은 값만 저장하고 글꼴·테두리·배경·숫자 서식을 저장하지 못한다.
   그래서 서식 파일이 흰 바탕에 숫자만 늘어선 모양이었다. 출석부처럼 ExcelJS를 쓰면
   제목 병합, 머리행 배경, 테두리, 천단위 콤마, 합계 행, 열 너비, 인쇄 설정까지 넣을 수 있다.
   디자인은 2026-09 정정 서식(v2026_offset의 app-forms-xlsx.js)에서 가져왔다.

   [모델 → 파일]
   서식 함수(exInvoice 등)는 금액을 담은 '모델'만 만들고, 파일로 그리는 일은 여기서 한다.
     model = { sheets: [{ name, title, sub, meta, columns, rows, total, notes }] }
     columns: [{ key, label, group?, tone?, width?, type: 'num'|'int'|'text', align?, sum? }]
       num  = 금액(천단위 서식, 합계 대상)   int = 학년·반·번호·연번(숫자로 저장, 합계 안 함)
     emptyText: 내역이 없을 때 표 안에 띄울 안내
     plain: true면 제목 줄 없이 1행부터 머리글 — 시스템에 다시 올리는 업로드 양식용
     rows: [{ [key]: 값 }]                 ← 테스트가 붙잡는 값이 바로 이것이다
     total: { label } | null               ← 합계 행. 숫자 열마다 SUM 수식으로 넣는다
   ⚠ 이 파일은 금액을 계산하지 않는다. 합계 행도 화면에 보일 값(result)은 rows를 더한 것이고,
     엑셀에서 열면 SUM 수식으로 다시 계산된다. 두 값은 같아야 하며 테스트가 확인한다.
   ========================================================================== */
'use strict';

window.XL = (function () {
    const FONT = '맑은 고딕';
    const S = {
        TITLE: { name: FONT, size: 15, bold: true },
        SUB: { name: FONT, size: 9, color: { argb: 'FF6B7280' } },
        BASE: { name: FONT, size: 10 },
        // 0은 '-'로, 음수는 빨갛게. 행정 서식에서 0을 '-'로 쓰는 관행을 따른다.
        NUM: '#,##0;[Red]-#,##0;"-"',
        HEAD_BG: 'FFE8EEF7',
        TOT_BG: 'FFF2F4F7',
    };
    // 화면 표와 같은 색 축: 원가(회색) / 초3(파랑) / 자유(초록) / 자부담(빨강)
    const TONE = {
        base: 'FFF1F3F5',
        cho3: 'FFE7F0FD',
        free: 'FFE8F5EC',
        self: 'FFFDECEC',
    };
    const THIN = { style: 'thin', color: { argb: 'FFB9BFC7' } };
    const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
    const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

    function today() {
        const d = new Date();
        return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
    }

    // 시트 하나를 그린다. 반환값은 머리행·데이터·합계 행 번호(테스트와 디버깅용).
    function drawSheet(wb, sh) {
        const ws = wb.addWorksheet(String(sh.name).substring(0, 31));
        const cols = sh.columns;
        const n = cols.length;
        ws.columns = cols.map(c => ({ width: c.width || (c.type === 'num' ? 12 : 14) }));

        // ── 제목 · 부제 · 작성일 ──
        // plain: 다시 업로드하는 양식(1행 = 머리글이어야 읽힌다)은 제목 줄 없이 머리행부터 시작한다.
        if (!sh.plain) {
            const t = ws.addRow([sh.title || '']);
            t.font = S.TITLE; t.height = 26;
            ws.mergeCells(t.number, 1, t.number, n);
            t.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
            if (sh.sub) {
                const s = ws.addRow([sh.sub]); s.font = S.SUB;
                ws.mergeCells(s.number, 1, s.number, n);
            }
            const m = ws.addRow([sh.meta || `작성일 ${today()}`]); m.font = S.SUB;
            ws.mergeCells(m.number, 1, m.number, n);
            m.getCell(1).alignment = { horizontal: 'right' };
            ws.addRow([]);
        }

        // ── 머리행: 묶음(group)이 있으면 2줄 ──
        const grouped = cols.some(c => c.group);
        const headTop = ws.rowCount + 1;
        const styleHead = (cell, col) => {
            cell.font = { ...S.BASE, bold: true };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.fill = fill((col && TONE[col.tone]) || S.HEAD_BG);
            cell.border = BORDER;
        };
        if (grouped) {
            const r1 = ws.addRow(cols.map(c => c.group || c.label));
            const r2 = ws.addRow(cols.map(c => (c.group ? c.label : '')));
            r1.height = 20; r2.height = 20;
            cols.forEach((c, i) => { styleHead(r1.getCell(i + 1), c); styleHead(r2.getCell(i + 1), c); });
            // 묶음 없는 열은 세로로, 같은 묶음이 이어지는 열은 가로로 병합
            for (let i = 0; i < n;) {
                if (!cols[i].group) { ws.mergeCells(r1.number, i + 1, r2.number, i + 1); i++; continue; }
                let j = i;
                while (j + 1 < n && cols[j + 1].group === cols[i].group) j++;
                if (j > i) ws.mergeCells(r1.number, i + 1, r1.number, j + 1);
                i = j + 1;
            }
        } else {
            const r = ws.addRow(cols.map(c => c.label));
            r.height = 20;
            cols.forEach((c, i) => styleHead(r.getCell(i + 1), c));
        }
        const headEnd = ws.rowCount;

        // ── 데이터 ──
        const dataStart = headEnd + 1;
        sh.rows.forEach(row => {
            const r = ws.addRow(cols.map(c => row[c.key] == null ? '' : row[c.key]));
            cols.forEach((c, i) => {
                const cell = r.getCell(i + 1);
                cell.font = S.BASE;
                cell.border = BORDER;
                cell.alignment = { vertical: 'middle', horizontal: c.align || (c.type === 'num' ? 'right' : 'center') };
                if (c.type === 'num') cell.numFmt = S.NUM;
            });
        });
        // 내역이 없으면 표 안에 안내 한 줄(빈 표만 있으면 파일이 고장 난 것처럼 보인다)
        if (!sh.rows.length && sh.emptyText) {
            const r = ws.addRow([sh.emptyText]);
            ws.mergeCells(r.number, 1, r.number, n);
            const cell = r.getCell(1);
            cell.font = S.SUB; cell.border = BORDER;
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            r.height = 28;
        }
        const dataEnd = ws.rowCount;

        // ── 합계 행: 숫자 열마다 SUM 수식(+ 계산해 둔 값) ──
        let totalRow = null;
        if (sh.total && sh.rows.length) {
            const r = ws.addRow([]);
            totalRow = r.number;
            // 'int'(학년·반·번호·연번처럼 더하면 안 되는 숫자)는 합계 대상이 아니다
            const firstNum = cols.findIndex(c => c.type === 'num' && c.sum !== false);
            cols.forEach((c, i) => {
                const cell = r.getCell(i + 1);
                if (c.type === 'num' && c.sum !== false) {
                    const L = ws.getColumn(i + 1).letter;
                    const result = sh.rows.reduce((a, row) => a + (Number(row[c.key]) || 0), 0);
                    cell.value = { formula: `SUM(${L}${dataStart}:${L}${dataEnd})`, result };
                    cell.numFmt = S.NUM;
                    cell.alignment = { vertical: 'middle', horizontal: 'right' };
                } else {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                }
                cell.font = { ...S.BASE, bold: true };
                cell.fill = fill(S.TOT_BG);
                cell.border = { ...BORDER, top: { style: 'double', color: { argb: 'FF6B7280' } } };
            });
            // "합계" 글자는 숫자 열 앞의 칸들을 합쳐서 쓴다
            const span = firstNum > 0 ? firstNum : 1;
            r.getCell(1).value = sh.total.label || '합계';
            if (span > 1) ws.mergeCells(r.number, 1, r.number, span);
        }

        // ── 아래 설명 ──
        if (sh.notes && sh.notes.length) {
            ws.addRow([]);
            sh.notes.forEach(txt => {
                const r = ws.addRow([txt]); r.font = S.SUB;
                ws.mergeCells(r.number, 1, r.number, n);
                r.getCell(1).alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
            });
        }

        // ── 보기·인쇄: 머리행 고정, A4 가로 한 장 너비, 머리행 반복 ──
        ws.views = [{ state: 'frozen', ySplit: headEnd, xSplit: sh.freezeCols || 1 }];
        ws.pageSetup = {
            paperSize: 9, orientation: sh.portrait ? 'portrait' : 'landscape',
            fitToPage: true, fitToWidth: 1, fitToHeight: 0,
            margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
            printTitlesRow: `${headTop}:${headEnd}`,
        };
        ws.headerFooter = { oddFooter: '&C&P / &N' };
        return { headTop, headEnd, dataStart, dataEnd, totalRow };
    }

    function build(model) {
        const wb = new ExcelJS.Workbook();
        wb.creator = '방과후 스마트 정산 시스템';
        wb.created = new Date();
        // 합계 행의 SUM 수식을 파일을 열 때 다시 계산하게 한다. ExcelJS는 계산값이 0이면
        // 파일에 값을 적지 않아서, 이 설정이 없으면 일부 뷰어에서 0인 합계 칸이 비어 보인다.
        wb.calcProperties.fullCalcOnLoad = true;
        const layout = model.sheets.map(sh => drawSheet(wb, sh));
        return { wb, layout };
    }

    // 화면 표를 그대로 옮긴 격자(exportAsExcel이 만든 SheetJS 셀 격자 + 병합)를 같은 디자인으로 그린다.
    //   · 맨 위에 제목·작성일, 그 아래 표
    //   · 첫 숫자 행 앞까지를 머리행으로 보고 배경·굵게, 숫자 칸은 천단위 서식
    //   · '합계'·'총계' 글자가 있는 행은 합계 행 모양(연회색 바탕·굵게·위 이중선)
    // 값과 칸 위치는 격자 그대로다(합계도 화면 값을 옮길 뿐 수식으로 바꾸지 않는다).
    function fromGrid(grid, merges, opt) {
        opt = opt || {};
        const wb = new ExcelJS.Workbook();
        wb.creator = '방과후 스마트 정산 시스템';
        wb.created = new Date();
        const ws = wb.addWorksheet(String(opt.sheet || '정산내역').substring(0, 31));
        const n = Math.max(1, grid.reduce((w, row) => Math.max(w, row.length), 0));

        const t = ws.addRow([opt.title || '']);
        t.font = S.TITLE; t.height = 26;
        ws.mergeCells(1, 1, 1, n);
        const m = ws.addRow([`작성일 ${today()}`]); m.font = S.SUB;
        ws.mergeCells(2, 1, 2, n);
        m.getCell(1).alignment = { horizontal: 'right' };
        ws.addRow([]);
        const off = ws.rowCount;                        // 격자 0행 = 엑셀 off+1행

        const isNum = cell => !!cell && cell.t === 'n' && typeof cell.v === 'number';
        let headRows = grid.findIndex(row => row.some(isNum));
        if (headRows < 0) headRows = Math.min(1, grid.length);
        const colW = new Array(n).fill(8);

        grid.forEach((row, r) => {
            const xr = ws.getRow(off + r + 1);
            const isHead = r < headRows;
            const isTotal = !isHead && row.some(c => c && typeof c.v === 'string' && /합계|총계/.test(c.v));
            for (let c = 0; c < n; c++) {
                const src = row[c];
                const cell = xr.getCell(c + 1);
                if (src && src.v !== undefined && src.v !== null && src.v !== '') cell.value = src.v;
                cell.font = { ...S.BASE, bold: isHead || isTotal };
                cell.border = isTotal ? { ...BORDER, top: { style: 'double', color: { argb: 'FF6B7280' } } } : BORDER;
                if (isHead) cell.fill = fill(S.HEAD_BG);
                else if (isTotal) cell.fill = fill(S.TOT_BG);
                if (isNum(src)) {
                    cell.numFmt = S.NUM;
                    cell.alignment = { vertical: 'middle', horizontal: 'right' };
                } else {
                    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: isHead };
                }
                const len = src && src.v != null ? String(isNum(src) ? src.v.toLocaleString() : src.v).length : 0;
                if (!isHead) colW[c] = Math.max(colW[c], Math.min(30, len * (isNum(src) ? 1.2 : 1.9) + 2));
            }
        });
        merges.forEach(mg => {
            try { ws.mergeCells(off + mg.s.r + 1, mg.s.c + 1, off + mg.e.r + 1, mg.e.c + 1); } catch (e) { /* 겹치는 병합은 건너뜀 */ }
        });
        colW.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
        ws.views = [{ state: 'frozen', ySplit: off + headRows, xSplit: 0 }];
        ws.pageSetup = {
            paperSize: 9, orientation: n > 8 ? 'landscape' : 'portrait',
            fitToPage: true, fitToWidth: 1, fitToHeight: 0,
            margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
            printTitlesRow: headRows ? `${off + 1}:${off + headRows}` : undefined,
        };
        ws.headerFooter = { oddFooter: '&C&P / &N' };
        return { wb, off, headRows };
    }

    async function saveWorkbook(wb, filename) {
        const buf = await wb.xlsx.writeBuffer();
        window.saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
    }

    // 파일로 저장. (테스트 하네스는 이 함수를 붙잡아 model을 그대로 검사한다)
    async function download(model, filename) {
        const { wb } = build(model);
        const buf = await wb.xlsx.writeBuffer();
        window.saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
    }

    return { build, download, fromGrid, saveWorkbook, STYLE: S, TONE };
})();
