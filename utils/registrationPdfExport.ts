import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { AuctionCategory, FormField } from '../types';

export interface RegistrationPdfRecord {
    id: string;
    playerNumber?: string | number;
    fullName: string;
    mobile?: string;
    dob?: string;
    gender?: string;
    playerType?: string;
    category?: string;
    status?: string;
    paymentStatus?: string;
    paymentSummary?: string;
    profilePic?: string;
    jerseyName?: string;
    jerseyNumber?: string | number;
    jerseySize?: string;
    submittedAt?: number;
    [key: string]: any;
}

export interface RegistrationPdfOptions {
    records: RegistrationPdfRecord[];
    selectedFields: string[];
    customFields: FormField[];
    pdfTheme: 'NORMAL' | 'ADVAYA';
    playersPerPage: 1 | 2 | 4 | 6 | 9 | 'LIST';
    exportCategorizedPDF: boolean;
    categories: AuctionCategory[];
    auctionTitle: string;
    auctionLogoUrl?: string;
    systemBranding: { logo: string; tagline: string };
    fileName: string;
    subtitle?: string;
    onProgress?: (pct: number) => void;
    isCancelledRef?: { current: boolean };
}

const escapeHtml = (val: any): string => {
    if (val === undefined || val === null) return '';
    return String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

export const generateRegistrationStylePDF = async ({
    records,
    selectedFields,
    customFields,
    pdfTheme,
    playersPerPage,
    exportCategorizedPDF,
    categories,
    auctionTitle,
    auctionLogoUrl,
    systemBranding,
    fileName,
    subtitle = 'Official Player Registrations',
    onProgress,
    isCancelledRef,
}: RegistrationPdfOptions): Promise<void> => {
    const doc = new jsPDF('p', 'mm', 'a4');

    const pdfContainer = document.createElement('div');
    pdfContainer.style.position = 'fixed';
    pdfContainer.style.left = '-9999px';
    pdfContainer.style.top = '0';
    pdfContainer.style.width = '210mm';
    document.body.appendChild(pdfContainer);

    try {
        const sortedRecords = [...records];

        if (exportCategorizedPDF) {
            const categoryOrder: { [name: string]: number } = {};
            [...categories]
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .forEach((cat, idx) => {
                    categoryOrder[cat.name] = idx;
                });

            sortedRecords.sort((a, b) => {
                const catA = a.category || 'Standard';
                const catB = b.category || 'Standard';
                if (catA !== catB) {
                    const orderA = categoryOrder[catA] ?? 999;
                    const orderB = categoryOrder[catB] ?? 999;
                    if (orderA !== orderB) return orderA - orderB;
                }
                const numA =
                    a.playerNumber !== undefined && a.playerNumber !== null && a.playerNumber !== ''
                        ? Number(a.playerNumber)
                        : 999999;
                const numB =
                    b.playerNumber !== undefined && b.playerNumber !== null && b.playerNumber !== ''
                        ? Number(b.playerNumber)
                        : 999999;
                if (numA !== numB) return numA - numB;
                return (a.submittedAt || 0) - (b.submittedAt || 0);
            });
        } else {
            sortedRecords.sort((a, b) => {
                const numA =
                    a.playerNumber !== undefined && a.playerNumber !== null && a.playerNumber !== ''
                        ? Number(a.playerNumber)
                        : 999999;
                const numB =
                    b.playerNumber !== undefined && b.playerNumber !== null && b.playerNumber !== ''
                        ? Number(b.playerNumber)
                        : 999999;
                if (numA !== numB) return numA - numB;
                return (a.submittedAt || 0) - (b.submittedAt || 0);
            });
        }

        const actualPlayersPerPage = playersPerPage === 'LIST' ? 14 : (playersPerPage as number);

        interface PDFPageData {
            category: string;
            players: RegistrationPdfRecord[];
            globalStartIndex: number;
        }

        const pagesToRender: PDFPageData[] = [];
        if (sortedRecords.length > 0) {
            if (exportCategorizedPDF) {
                const groups: { [cat: string]: { reg: RegistrationPdfRecord; globalIdx: number }[] } = {};
                const categoriesInOrder: string[] = [];

                sortedRecords.forEach((reg, idx) => {
                    const cat = reg.category || 'Standard';
                    if (!groups[cat]) {
                        groups[cat] = [];
                        categoriesInOrder.push(cat);
                    }
                    groups[cat].push({ reg, globalIdx: idx });
                });

                categoriesInOrder.forEach((cat) => {
                    const catPlayers = groups[cat];
                    const catPages = Math.ceil(catPlayers.length / actualPlayersPerPage);
                    for (let i = 0; i < catPages; i++) {
                        const chunk = catPlayers.slice(
                            i * actualPlayersPerPage,
                            (i + 1) * actualPlayersPerPage
                        );
                        pagesToRender.push({
                            category: cat,
                            players: chunk.map((cp) => cp.reg),
                            globalStartIndex: chunk[0].globalIdx,
                        });
                    }
                });
            } else {
                const totalPages = Math.ceil(sortedRecords.length / actualPlayersPerPage);
                for (let i = 0; i < totalPages; i++) {
                    pagesToRender.push({
                        category: 'All',
                        players: sortedRecords.slice(
                            i * actualPlayersPerPage,
                            (i + 1) * actualPlayersPerPage
                        ),
                        globalStartIndex: i * actualPlayersPerPage,
                    });
                }
            }
        }

        const totalPages = pagesToRender.length;

        for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
            if (isCancelledRef?.current) {
                throw new Error('PDF_CANCELLED');
            }
            onProgress?.(Math.round(((pageIndex + 1) / totalPages) * 100));

            const { players: pageRegs, globalStartIndex } = pagesToRender[pageIndex];

            let gridCols = 1;
            let gridRows = '1fr';
            let cardHeight = '235mm';

            if (playersPerPage === 1) {
                gridCols = 1;
                gridRows = '1fr';
                cardHeight = '235mm';
            } else if (playersPerPage === 2) {
                gridCols = 1;
                gridRows = 'repeat(2, 1fr)';
                cardHeight = '116mm';
            } else if (playersPerPage === 4) {
                gridCols = 2;
                gridRows = 'repeat(2, 1fr)';
                cardHeight = '116mm';
            } else if (playersPerPage === 6) {
                gridCols = 2;
                gridRows = 'repeat(3, 1fr)';
                cardHeight = '76mm';
            } else if (playersPerPage === 9) {
                gridCols = 3;
                gridRows = 'repeat(3, 1fr)';
                cardHeight = '76mm';
            } else if (playersPerPage === 'LIST') {
                gridCols = 1;
                gridRows = 'none';
                cardHeight = 'auto';
            }

            pdfContainer.innerHTML = `
                <div id="pdf-page" style="
                    width: 210mm;
                    height: 297mm;
                    padding: 8mm 10mm;
                    background: ${pdfTheme === 'ADVAYA' ? '#0a0a0a' : '#ffffff'};
                    color: ${pdfTheme === 'ADVAYA' ? '#fbbf24' : '#1f2937'};
                    font-family: sans-serif;
                    box-sizing: border-box;
                    position: relative;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                ">
                    ${pdfTheme === 'ADVAYA' ? `
                        <div style="position: absolute; top: 0; right: 0; width: 100mm; height: 100mm; background: radial-gradient(circle at top right, rgba(251,191,36,0.05) 0%, transparent 70%); pointer-events: none;"></div>
                        <div style="position: absolute; bottom: 0; left: 0; width: 100mm; height: 100mm; background: radial-gradient(circle at bottom left, rgba(251,191,36,0.05) 0%, transparent 70%); pointer-events: none;"></div>
                    ` : ''}

                    <!-- Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid ${pdfTheme === 'ADVAYA' ? '#fbbf24' : '#3b82f6'}; padding: 0 0 3mm 0; margin-bottom: 4mm; position: relative; z-index: 10; height: 25mm; flex-shrink: 0; box-sizing: border-box;">
                        <div style="display: flex; align-items: center; gap: 5mm;">
                            ${systemBranding.logo ? `<img src="${systemBranding.logo}" referrerpolicy="no-referrer" style="height: 18mm; width: 18mm; object-fit: contain; border-radius: 2mm;" />` : ''}
                            <div style="display: flex; flex-direction: column; justify-content: center;">
                                <h1 style="margin: 0; font-size: 22pt; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px; color: ${pdfTheme === 'ADVAYA' ? '#fbbf24' : '#1f2937'}; line-height: 1;">SM SPORTS</h1>
                                <p style="margin: 1mm 0 0 0; font-size: 10pt; font-weight: 700; opacity: 0.9; text-transform: uppercase; letter-spacing: 1.5px;">${escapeHtml(systemBranding.tagline)}</p>
                            </div>
                        </div>
                        <div style="text-align: right; display: flex; align-items: center; gap: 5mm;">
                            <div style="display: flex; flex-direction: column; justify-content: center;">
                                <h2 style="margin: 0; font-size: 15pt; font-weight: 900; text-transform: uppercase; color: ${pdfTheme === 'ADVAYA' ? '#fbbf24' : '#1f2937'}; line-height: 1;">${escapeHtml(auctionTitle || 'Tournament')}</h2>
                                <p style="margin: 1mm 0 0 0; font-size: 9pt; font-weight: 700; opacity: 0.7; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(subtitle)}</p>
                            </div>
                            ${auctionLogoUrl ? `<img src="${auctionLogoUrl}" referrerpolicy="no-referrer" style="height: 18mm; width: 18mm; object-fit: contain;" />` : ''}
                        </div>
                    </div>

                    <!-- Players Grid -->
                    <div style="
                        height: 238mm;
                        max-height: 238mm;
                        display: ${playersPerPage === 'LIST' ? 'flex' : 'grid'};
                        ${playersPerPage === 'LIST' ? 'flex-direction: column;' : ''}
                        grid-template-columns: repeat(${gridCols}, 1fr);
                        grid-template-rows: ${gridRows};
                        gap: 2mm;
                        align-content: start;
                        min-height: 0;
                        box-sizing: border-box;
                        overflow: hidden;
                    ">
                        ${pageRegs.map((reg, idx) => {
                            const currentCat = reg.category || 'Standard';
                            const prevReg = idx > 0 ? pageRegs[idx - 1] : null;
                            const prevCat = prevReg ? (prevReg.category || 'Standard') : null;
                            const showHeader = exportCategorizedPDF && currentCat !== prevCat;

                            const slNo = globalStartIndex + idx + 1;
                            const playerNum =
                                reg.playerNumber !== undefined && reg.playerNumber !== null && reg.playerNumber !== ''
                                    ? reg.playerNumber
                                    : slNo;
                            const isDense = (typeof playersPerPage === 'number' && playersPerPage > 4) || playersPerPage === 'LIST';
                            const isSingle = playersPerPage === 1;
                            const isList = playersPerPage === 'LIST';

                            const extraFieldsToDisplay = [
                                { id: 'category', label: 'Category', value: reg.category },
                                { id: 'paymentStatus', label: 'Payment', value: reg.paymentSummary || reg.paymentStatus },
                                { id: 'jerseyName', label: 'Jersey Name', value: reg.jerseyName },
                                { id: 'jerseyNumber', label: 'Jersey No.', value: reg.jerseyNumber },
                                { id: 'jerseySize', label: 'Jersey Size', value: reg.jerseySize },
                                ...(customFields || []).map((f) => ({
                                    id: `cf_${f.id}`,
                                    label: f.label,
                                    value: reg[f.id],
                                })),
                            ].filter((f) => selectedFields.includes(f.id));

                            let itemHtml = '';

                            if (isList) {
                                itemHtml = `
                                <div style="
                                    background: ${pdfTheme === 'ADVAYA' ? 'rgba(251,191,36,0.03)' : '#f9fafb'};
                                    border: 1px solid ${pdfTheme === 'ADVAYA' ? 'rgba(251,191,36,0.1)' : '#f1f5f9'};
                                    border-radius: 2mm;
                                    padding: 2mm 4mm;
                                    display: flex;
                                    align-items: center;
                                    gap: 3mm;
                                    margin-bottom: 1mm;
                                ">
                                    <div style="font-size: 9pt; font-weight: 900; min-width: 9mm; color: ${pdfTheme === 'ADVAYA' ? '#fbbf24' : '#3b82f6'};">
                                        ${selectedFields.includes('playerNumber') ? `#${escapeHtml(playerNum)}` : `${slNo}.`}
                                    </div>
                                    ${selectedFields.includes('profilePic') ? `
                                        <div style="width: 10mm; height: 10mm; border-radius: 1mm; overflow: hidden; flex-shrink: 0; background: #e2e8f0; display: flex; align-items: center; justify-content: center;">
                                            ${reg.profilePic ? `
                                                <img src="${reg.profilePic}" referrerpolicy="no-referrer" style="width: 100%; height: 100%; object-fit: cover;" />
                                            ` : `
                                                <span style="font-size: 6pt; font-weight: bold; color: #94a3b8; font-family: sans-serif;">${reg.fullName ? escapeHtml(reg.fullName.charAt(0).toUpperCase()) : '?'}</span>
                                            `}
                                        </div>
                                    ` : ''}
                                    <div style="flex: 1; min-width: 0;">
                                        ${selectedFields.includes('fullName') ? `<h3 style="margin: 0; font-size: 9.5pt; font-weight: 900; text-transform: uppercase; line-height: 1.2; padding: 0.5mm 0;">${escapeHtml(reg.fullName)}</h3>` : ''}
                                        <p style="margin: 0; font-size: 7pt; font-weight: 700; opacity: 0.65;">
                                            ${[
                                                selectedFields.includes('playerType') ? escapeHtml(reg.playerType) : null,
                                                selectedFields.includes('mobile') ? escapeHtml(reg.mobile) : null,
                                                selectedFields.includes('dob') && reg.dob ? `DOB: ${escapeHtml(reg.dob)}` : null,
                                                selectedFields.includes('gender') && reg.gender ? escapeHtml(reg.gender) : null,
                                                selectedFields.includes('status') && reg.status ? escapeHtml(reg.status) : null,
                                            ].filter(Boolean).join(' • ')}
                                        </p>
                                    </div>
                                    <div style="display: flex; gap: 3mm; flex-wrap: wrap; justify-content: flex-end; max-width: 52%;">
                                        ${extraFieldsToDisplay.map((field) => `
                                            <div style="text-align: right; min-width: 13mm;">
                                                <p style="margin: 0; font-size: 5pt; font-weight: 900; opacity: 0.5; text-transform: uppercase;">${escapeHtml(field.label)}</p>
                                                <p style="margin: 0; font-size: 7.5pt; font-weight: 700;">${escapeHtml(field.value || '-')}</p>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                                `;
                            } else {
                                const hasManyExtras = extraFieldsToDisplay.length > 6;
                                itemHtml = `
                                <div style="
                                    background: ${pdfTheme === 'ADVAYA' ? '#0f172a' : '#ffffff'};
                                    border: 2px solid ${pdfTheme === 'ADVAYA' ? 'rgba(251,191,36,0.2)' : '#e2e8f0'};
                                    border-radius: ${isSingle ? '10mm' : '3.5mm'};
                                    padding: ${isSingle ? '8mm 10mm' : isDense ? '3mm' : '5mm'};
                                    display: flex;
                                    flex-direction: column;
                                    justify-content: space-between;
                                    position: relative;
                                    overflow: hidden;
                                    height: ${cardHeight};
                                    box-sizing: border-box;
                                    box-shadow: ${pdfTheme === 'ADVAYA' ? 'none' : '0 4px 6px -1px rgb(0 0 0 / 0.05)'};
                                ">
                                    ${selectedFields.includes('playerNumber') ? `
                                        <div style="position: absolute; top: 0; right: 0; padding: ${isSingle ? '4mm 12mm' : '1.5mm 4mm'}; background: ${pdfTheme === 'ADVAYA' ? '#fbbf24' : '#2563eb'}; color: ${pdfTheme === 'ADVAYA' ? '#000000' : '#ffffff'}; font-size: ${isSingle ? '24pt' : isDense ? '8pt' : '10pt'}; font-weight: 900; border-bottom-left-radius: 3mm; z-index: 5; font-family: monospace;">
                                            #${escapeHtml(playerNum)}
                                        </div>
                                    ` : ''}
                                    <div style="display: flex; gap: ${isSingle ? '12mm' : '3.5mm'}; align-items: start;">
                                        ${selectedFields.includes('profilePic') ? `
                                            <div style="width: ${isSingle ? '68mm' : isDense ? '17mm' : '28mm'}; height: ${isSingle ? '80mm' : isDense ? '21mm' : '36mm'}; border-radius: ${isSingle ? '8mm' : '2.5mm'}; overflow: hidden; border: ${isSingle ? '6px' : '2px'} solid ${pdfTheme === 'ADVAYA' ? '#fbbf2444' : '#f1f5f9'}; flex-shrink: 0; background: ${pdfTheme === 'ADVAYA' ? '#1e293b' : '#f1f5f9'}; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                                                ${reg.profilePic ? `
                                                    <img src="${reg.profilePic}" referrerpolicy="no-referrer" style="width: 100%; height: 100%; object-fit: cover;" />
                                                ` : `
                                                    <span style="font-size: ${isSingle ? '48pt' : '18pt'}; font-weight: 900; color: #94a3b8; font-family: sans-serif;">${reg.fullName ? escapeHtml(reg.fullName.charAt(0).toUpperCase()) : '?'}</span>
                                                `}
                                            </div>
                                        ` : ''}
                                        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column;">
                                            ${selectedFields.includes('fullName') ? `
                                                <h3 style="margin: 0 0 1.5mm 0; padding-right: ${selectedFields.includes('playerNumber') ? (isSingle ? '30mm' : '12mm') : '0'}; font-size: ${isSingle ? '30pt' : isDense ? '8.5pt' : '11.5pt'}; font-weight: 900; text-transform: uppercase; line-height: 1.2; color: ${pdfTheme === 'ADVAYA' ? '#fbbf24' : '#0f172a'}; word-wrap: break-word; overflow-wrap: break-word; word-break: normal; letter-spacing: -0.2px;">
                                                    ${escapeHtml(reg.fullName)}
                                                </h3>
                                            ` : ''}
                                            ${selectedFields.includes('playerType') ? `
                                                <div style="font-size: ${isSingle ? '18pt' : isDense ? '6.5pt' : '8.5pt'}; font-weight: 800; color: ${pdfTheme === 'ADVAYA' ? '#e2e8f0' : '#2563eb'}; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.9; margin-bottom: 1.5mm;">
                                                    ${escapeHtml(reg.playerType || '-')}
                                                    ${exportCategorizedPDF ? `<span style="font-size: 0.85em; opacity: 0.7; margin-left: 2mm; font-weight: 600;">(${escapeHtml(currentCat)})</span>` : ''}
                                                </div>
                                            ` : ''}

                                            <div style="display: flex; flex-wrap: wrap; gap: ${isSingle ? '5mm 8mm' : '1.5mm 3mm'}; margin-top: ${isSingle ? '6mm' : '1mm'}; width: 100%; box-sizing: border-box;">
                                                ${selectedFields.includes('mobile') ? `
                                                    <div style="width: calc(50% - ${isSingle ? '4mm' : '1.5mm'}); min-width: 0; box-sizing: border-box; position: relative; z-index: 10;">
                                                        <p style="margin: 0; font-size: ${isSingle ? '10pt' : '6pt'}; font-weight: 800; color: ${pdfTheme === 'ADVAYA' ? 'rgba(255,255,255,0.45)' : '#64748b'}; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1.2;">Mobile</p>
                                                        <p style="margin: 0.5mm 0 0 0; font-size: ${isSingle ? '18pt' : isDense ? '7pt' : '9pt'}; font-weight: 700; color: ${pdfTheme === 'ADVAYA' ? '#ffffff' : '#334155'}; line-height: 1.25; word-wrap: break-word;">${escapeHtml(reg.mobile || '-')}</p>
                                                    </div>
                                                ` : ''}
                                                ${selectedFields.includes('dob') ? `
                                                    <div style="width: calc(50% - ${isSingle ? '4mm' : '1.5mm'}); min-width: 0; box-sizing: border-box; position: relative; z-index: 10;">
                                                        <p style="margin: 0; font-size: ${isSingle ? '10pt' : '6pt'}; font-weight: 800; color: ${pdfTheme === 'ADVAYA' ? 'rgba(255,255,255,0.45)' : '#64748b'}; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1.2;">DOB</p>
                                                        <p style="margin: 0.5mm 0 0 0; font-size: ${isSingle ? '18pt' : isDense ? '7pt' : '9pt'}; font-weight: 700; color: ${pdfTheme === 'ADVAYA' ? '#ffffff' : '#334155'}; line-height: 1.25; word-wrap: break-word;">${escapeHtml(reg.dob || '-')}</p>
                                                    </div>
                                                ` : ''}
                                                ${selectedFields.includes('gender') ? `
                                                    <div style="width: calc(50% - ${isSingle ? '4mm' : '1.5mm'}); min-width: 0; box-sizing: border-box; position: relative; z-index: 10;">
                                                        <p style="margin: 0; font-size: ${isSingle ? '10pt' : '6pt'}; font-weight: 800; color: ${pdfTheme === 'ADVAYA' ? 'rgba(255,255,255,0.45)' : '#64748b'}; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1.2;">Gender</p>
                                                        <p style="margin: 0.5mm 0 0 0; font-size: ${isSingle ? '18pt' : isDense ? '7pt' : '9pt'}; font-weight: 700; color: ${pdfTheme === 'ADVAYA' ? '#ffffff' : '#334155'}; line-height: 1.25; word-wrap: break-word;">${escapeHtml(reg.gender || '-')}</p>
                                                    </div>
                                                ` : ''}
                                                ${selectedFields.includes('status') ? `
                                                    <div style="width: calc(50% - ${isSingle ? '4mm' : '1.5mm'}); min-width: 0; box-sizing: border-box; position: relative; z-index: 10;">
                                                        <p style="margin: 0; font-size: ${isSingle ? '10pt' : '6pt'}; font-weight: 800; color: ${pdfTheme === 'ADVAYA' ? 'rgba(255,255,255,0.45)' : '#64748b'}; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1.2;">Status</p>
                                                        <p style="margin: 0.5mm 0 0 0; font-size: ${isSingle ? '18pt' : isDense ? '7pt' : '9pt'}; font-weight: 900; color: ${reg.status === 'APPROVED' ? '#10b981' : reg.status === 'REJECTED' ? '#ef4444' : '#f59e0b'}; line-height: 1.25; word-wrap: break-word;">${escapeHtml(reg.status || '-')}</p>
                                                    </div>
                                                ` : ''}
                                            </div>
                                        </div>
                                    </div>

                                    ${extraFieldsToDisplay.length > 0 ? `
                                        <div style="display: flex; flex-wrap: wrap; gap: ${isSingle ? '5mm 8mm' : hasManyExtras ? '1.5mm 3mm' : '2.5mm 4mm'}; padding-top: ${isSingle ? '7mm' : '2.5mm'}; border-top: 1.5px dashed ${pdfTheme === 'ADVAYA' ? 'rgba(251,191,36,0.2)' : '#cbd5e1'}; margin-top: auto; width: 100%; box-sizing: border-box;">
                                            ${extraFieldsToDisplay.map((field) => `
                                                <div style="width: calc(33.333% - ${isSingle ? '6mm' : '3mm'}); min-width: 0; box-sizing: border-box; position: relative; z-index: 10; display: flex; flex-direction: column;">
                                                    <p style="margin: 0; font-size: ${isSingle ? '9.5pt' : hasManyExtras && isDense ? '5.2pt' : '6pt'}; font-weight: 800; color: ${pdfTheme === 'ADVAYA' ? 'rgba(255,255,255,0.45)' : '#64748b'}; text-transform: uppercase; letter-spacing: 0.4px; line-height: 1.15;">${escapeHtml(field.label)}</p>
                                                    <p style="margin: 0.5mm 0 0 0; font-size: ${isSingle ? '15pt' : isDense ? (hasManyExtras ? '6.5pt' : '7.2pt') : '8.5pt'}; font-weight: 700; color: ${pdfTheme === 'ADVAYA' ? '#fbbf24' : '#1e293b'}; line-height: 1.25; word-wrap: break-word;">${escapeHtml(field.value || '-')}</p>
                                                </div>
                                            `).join('')}
                                        </div>
                                    ` : ''}
                                </div>
                                `;
                            }

                            return `
                                ${showHeader ? `
                                    <div style="grid-column: 1 / -1; padding: 2mm 4mm; background: ${pdfTheme === 'ADVAYA' ? '#fbbf24' : '#3b82f6'}; color: ${pdfTheme === 'ADVAYA' ? '#000000' : '#ffffff'}; border-radius: 1.5mm; font-size: 9pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; margin-top: 1mm; margin-bottom: 2mm; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                        Category: ${escapeHtml(currentCat)}
                                    </div>
                                ` : ''}
                                ${itemHtml}
                            `;
                        }).join('')}
                    </div>

                    <!-- Footer -->
                    <div style="margin-top: 4mm; padding-top: 3mm; border-top: 1px solid ${pdfTheme === 'ADVAYA' ? 'rgba(251,191,36,0.1)' : '#f1f5f9'}; display: flex; justify-content: space-between; align-items: center; opacity: 0.6; position: relative; z-index: 10;">
                        <div>
                            <p style="font-size: 8pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;">Generated by SM Sports Registry</p>
                            <p style="font-size: 7pt; font-weight: 700; margin-top: 0.5mm;">Official Tournament Document • ${new Date().toLocaleDateString()}</p>
                        </div>
                        <div style="text-align: right;">
                            <p style="font-size: 9pt; font-weight: 900; color: ${pdfTheme === 'ADVAYA' ? '#fbbf24' : '#3b82f6'};">PAGE ${pageIndex + 1} OF ${totalPages}</p>
                        </div>
                    </div>
                </div>
            `;

            const canvas = await html2canvas(pdfContainer.querySelector('#pdf-page') as HTMLElement, {
                scale: 2,
                useCORS: true,
                backgroundColor: pdfTheme === 'ADVAYA' ? '#0a0a0a' : '#ffffff',
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            if (pageIndex > 0) doc.addPage();
            doc.addImage(imgData, 'JPEG', 0, 0, 210, 297);
        }

        doc.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
    } finally {
        if (pdfContainer.parentNode) {
            document.body.removeChild(pdfContainer);
        }
    }
};
