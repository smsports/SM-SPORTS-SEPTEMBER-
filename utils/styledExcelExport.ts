import ExcelJS from 'exceljs';

export interface StyledExcelColumn {
    key: string;
    header: string;
    align?: 'left' | 'center' | 'right';
    minWidth?: number;
}

export interface StyledExcelSheetSpec {
    sheetName: string;
    columns: StyledExcelColumn[];
    rows: Record<string, any>[];
    includeSlNo?: boolean;
}

export interface StyledExcelOptions {
    fileName: string;
    sheetName?: string;
    columns: StyledExcelColumn[];
    rows: Record<string, any>[];
    includeSlNo?: boolean;
}

export interface MultiSheetStyledExcelOptions {
    fileName: string;
    sheets: StyledExcelSheetSpec[];
}

const ALL_THIN_BORDERS: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } },
};

const HEADER_YELLOW_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFF00' },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
    name: 'Calibri',
    size: 11,
    bold: true,
    color: { argb: 'FF000000' },
};

const BODY_FONT: Partial<ExcelJS.Font> = {
    name: 'Calibri',
    size: 10,
    color: { argb: 'FF111827' },
};

const sanitizeSheetName = (name: string, existingNames: Set<string>): string => {
    const cleaned = (name || 'Sheet1').replace(/[\[\]\*\?\/\\:]/g, '').trim() || 'Sheet1';
    let candidate = cleaned.substring(0, 31);
    let suffix = 1;
    while (existingNames.has(candidate.toLowerCase())) {
        const suffixStr = `_${suffix++}`;
        candidate = `${cleaned.substring(0, 31 - suffixStr.length)}${suffixStr}`;
    }
    existingNames.add(candidate.toLowerCase());
    return candidate;
};

const appendStyledWorksheet = (
    workbook: ExcelJS.Workbook,
    spec: StyledExcelSheetSpec,
    existingNames: Set<string>
) => {
    const safeName = sanitizeSheetName(spec.sheetName, existingNames);
    const worksheet = workbook.addWorksheet(safeName, {
        views: [{ state: 'frozen', ySplit: 1 }],
    });

    const includeSlNo = spec.includeSlNo !== false;
    const finalColumns: StyledExcelColumn[] = includeSlNo
        ? [{ key: '__slNo', header: 'SL No.', align: 'center', minWidth: 9 }, ...spec.columns]
        : [...spec.columns];

    const colWidths: number[] = finalColumns.map((col) =>
        Math.max(col.minWidth || 12, col.header.length + 5)
    );

    // 1. Heading Row (Bold + Yellow Cell + All Borders)
    const headerRow = worksheet.addRow(finalColumns.map((c) => c.header));
    headerRow.height = 26;

    headerRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = HEADER_FONT;
        cell.fill = HEADER_YELLOW_FILL;
        cell.border = ALL_THIN_BORDERS;
        cell.alignment = {
            vertical: 'middle',
            horizontal: 'center',
            wrapText: true,
        };
    });

    // 2. Data Rows (All Thin Borders + Organized Alignment)
    spec.rows.forEach((rowData, rowIndex) => {
        const values = finalColumns.map((col, colIdx) => {
            if (col.key === '__slNo') {
                return rowIndex + 1;
            }
            const rawVal = rowData[col.key];
            const cleanVal =
                rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== ''
                    ? rawVal
                    : '-';

            const strLen = String(cleanVal)
                .split('\n')
                .reduce((max, line) => Math.max(max, line.length), 0);
            colWidths[colIdx] = Math.min(44, Math.max(colWidths[colIdx], strLen + 4));
            return cleanVal;
        });

        const dataRow = worksheet.addRow(values);

        const maxLines = values.reduce((max, val, cIdx) => {
            const text = String(val ?? '');
            const lineBreaks = text.split('\n').length;
            const approxWrap = Math.ceil(text.length / Math.max(12, colWidths[cIdx] - 2));
            return Math.max(max, lineBreaks, approxWrap);
        }, 1);
        dataRow.height = Math.max(20, Math.min(64, maxLines * 15 + 6));

        dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const colDef = finalColumns[colNumber - 1];
            cell.font = BODY_FONT;
            cell.border = ALL_THIN_BORDERS;
            cell.alignment = {
                vertical: 'middle',
                horizontal: colDef?.align || 'left',
                wrapText: true,
            };
        });
    });

    // 3. Auto-Calculated Column Widths
    worksheet.columns = finalColumns.map((col, idx) => ({
        key: col.key,
        width: colWidths[idx],
    }));

    // 4. Enable Excel AutoFilter
    if (finalColumns.length > 0) {
        worksheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: finalColumns.length },
        };
    }
};

const triggerWorkbookDownload = async (workbook: ExcelJS.Workbook, fileName: string) => {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadStyledRegistrationExcel = async ({
    fileName,
    sheetName = 'Player Registrations',
    columns,
    rows,
    includeSlNo = true,
}: StyledExcelOptions): Promise<void> => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SM Sports';
    workbook.created = new Date();

    const existingNames = new Set<string>();
    appendStyledWorksheet(workbook, { sheetName, columns, rows, includeSlNo }, existingNames);
    await triggerWorkbookDownload(workbook, fileName);
};

export const downloadMultiSheetStyledExcel = async ({
    fileName,
    sheets,
}: MultiSheetStyledExcelOptions): Promise<void> => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SM Sports';
    workbook.created = new Date();

    const existingNames = new Set<string>();
    sheets.forEach((sheet) => {
        appendStyledWorksheet(workbook, sheet, existingNames);
    });
    await triggerWorkbookDownload(workbook, fileName);
};
