import React, { useState, useRef } from 'react';
import {
    FileSpreadsheet,
    FileDown,
    Loader2,
    X,
    CheckSquare,
    Palette,
    LayoutList,
    CheckCircle,
    Check,
    Plus,
    ChevronDown,
    ChevronUp,
    SlidersHorizontal,
    Shirt
} from 'lucide-react';
import { AuctionCategory, FormField, Player, RegisteredPlayer } from '../types';
import { downloadStyledRegistrationExcel, StyledExcelColumn } from '../utils/styledExcelExport';
import { generateRegistrationStylePDF, RegistrationPdfRecord } from '../utils/registrationPdfExport';

interface RegistrationExportHubProps {
    registrations: RegisteredPlayer[];
    filteredRegistrations: RegisteredPlayer[];
    players: Player[];
    selectedRegIds: string[];
    customFields: FormField[];
    categories: AuctionCategory[];
    auctionTitle: string;
    auctionLogoUrl?: string;
    systemBranding: { logo: string; tagline: string };
    isDark: boolean;
    onNotify: (message: string, type?: 'error' | 'success') => void;
    onSelectAllVisible: () => void;
    onClearSelection: () => void;
}

const CORE_FIELD_OPTIONS = [
    { id: 'playerNumber', label: 'Player #' },
    { id: 'fullName', label: 'Full Name' },
    { id: 'mobile', label: 'Mobile' },
    { id: 'dob', label: 'DOB' },
    { id: 'gender', label: 'Gender' },
    { id: 'playerType', label: 'Role / Type' },
    { id: 'category', label: 'Category' },
    { id: 'status', label: 'Reg Status' },
    { id: 'paymentStatus', label: 'Payment Status' },
    { id: 'submittedAt', label: 'Submitted Date' },
    { id: 'profilePic', label: 'Photo (PDF)' },
];

const JERSEY_FIELD_OPTIONS = [
    { id: 'jerseyName', label: 'Jersey Name' },
    { id: 'jerseyNumber', label: 'Jersey Number' },
    { id: 'jerseySize', label: 'Jersey Size' },
];

export const RegistrationExportHub: React.FC<RegistrationExportHubProps> = ({
    registrations,
    filteredRegistrations,
    players,
    selectedRegIds,
    customFields,
    categories,
    auctionTitle,
    auctionLogoUrl,
    systemBranding,
    isDark,
    onNotify,
    onSelectAllVisible,
    onClearSelection,
}) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [selectedFields, setSelectedFields] = useState<string[]>([
        'playerNumber',
        'fullName',
        'mobile',
        'dob',
        'gender',
        'playerType',
        'category',
        'status',
        'profilePic',
        'jerseyName',
        'jerseyNumber',
        'jerseySize',
    ]);
    const [pdfTheme, setPdfTheme] = useState<'NORMAL' | 'ADVAYA'>('NORMAL');
    const [playersPerPage, setPlayersPerPage] = useState<1 | 2 | 4 | 6 | 9 | 'LIST'>(1);
    const [exportCategorizedPDF, setExportCategorizedPDF] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
    const [pdfProgress, setPdfProgress] = useState(0);
    const isPdfCancelled = useRef(false);

    const allFieldIds = [
        ...CORE_FIELD_OPTIONS.map((f) => f.id),
        ...JERSEY_FIELD_OPTIONS.map((f) => f.id),
        ...(customFields || []).map((f) => `cf_${f.id}`),
    ];

    const resolveEnrichedRecords = (sourceRegs: RegisteredPlayer[]): RegistrationPdfRecord[] => {
        return sourceRegs.map((reg) => {
            const approvedPlayer =
                players.find((p) => p.registrationId && String(p.registrationId) === String(reg.id)) ||
                players.find((p) => String(p.id) === String(reg.id)) ||
                players.find(
                    (p) =>
                        p.name &&
                        reg.fullName &&
                        p.name.trim().toLowerCase() === reg.fullName.trim().toLowerCase()
                );

            const pickVal = (key: string, fallback: any = '') => {
                const rVal = (reg as any)[key];
                if (rVal !== undefined && rVal !== null && String(rVal).trim() !== '') return rVal;
                const pVal = approvedPlayer ? (approvedPlayer as any)[key] : undefined;
                if (pVal !== undefined && pVal !== null && String(pVal).trim() !== '') return pVal;
                return fallback;
            };

            const customMerged: Record<string, any> = {};
            (customFields || []).forEach((cf) => {
                customMerged[cf.id] = pickVal(cf.id, '');
            });

            const feePaid = reg.amountPaid || reg.finalFeePaid || reg.amountExpected || 0;
            const paymentLabel =
                reg.paymentStatus === 'PAID'
                    ? `PAID${feePaid ? ` (₹${feePaid})` : ''}`
                    : reg.paymentStatus || 'FREE';

            return {
                ...reg,
                ...customMerged,
                id: String(reg.id),
                playerNumber: pickVal('playerNumber', undefined),
                fullName: reg.fullName || approvedPlayer?.name || '',
                mobile: pickVal('mobile', ''),
                dob: pickVal('dob', ''),
                gender: pickVal('gender', ''),
                playerType: approvedPlayer?.role || approvedPlayer?.speciality || reg.playerType || '',
                category: approvedPlayer?.category || reg.category || 'Standard',
                status: reg.status || 'PENDING',
                paymentStatus: reg.paymentStatus || 'FREE',
                paymentSummary: paymentLabel,
                profilePic: reg.profilePic || approvedPlayer?.photoUrl || '',
                jerseyName: pickVal('jerseyName', ''),
                jerseyNumber: pickVal('jerseyNumber', ''),
                jerseySize: pickVal('jerseySize', ''),
                submittedAt: reg.submittedAt || 0,
            };
        });
    };

    const getTargetRegistrations = (onlySelected: boolean): RegisteredPlayer[] => {
        if (onlySelected) {
            return registrations.filter((r) => selectedRegIds.includes(String(r.id)));
        }
        return filteredRegistrations;
    };

    const toggleField = (fieldId: string) => {
        setSelectedFields((prev) =>
            prev.includes(fieldId) ? prev.filter((f) => f !== fieldId) : [...prev, fieldId]
        );
    };

    const handleExportExcel = async (onlySelected: boolean) => {
        const targetRegs = getTargetRegistrations(onlySelected);
        if (targetRegs.length === 0) {
            onNotify(
                onlySelected
                    ? 'Please select at least one registration using the checkboxes below.'
                    : 'No registrations found to export.',
                'error'
            );
            return;
        }

        const excelColumnDefs: StyledExcelColumn[] = [];
        const addCol = (id: string, header: string, align: 'left' | 'center' | 'right' = 'left', minWidth = 14) => {
            if (selectedFields.includes(id)) {
                excelColumnDefs.push({ key: id, header, align, minWidth });
            }
        };

        addCol('playerNumber', 'Player #', 'center', 11);
        addCol('fullName', 'Full Name', 'left', 22);
        addCol('mobile', 'Mobile', 'center', 15);
        addCol('dob', 'DOB', 'center', 13);
        addCol('gender', 'Gender', 'center', 11);
        addCol('playerType', 'Role / Type', 'left', 16);
        addCol('category', 'Category', 'center', 14);
        addCol('jerseyName', 'Jersey Name', 'left', 18);
        addCol('jerseyNumber', 'Jersey No.', 'center', 12);
        addCol('jerseySize', 'Jersey Size', 'center', 12);

        (customFields || []).forEach((cf) => {
            addCol(`cf_${cf.id}`, cf.label, 'left', 16);
        });

        addCol('status', 'Status', 'center', 13);
        addCol('paymentStatus', 'Payment', 'center', 16);
        addCol('submittedAt', 'Submitted At', 'center', 20);

        if (excelColumnDefs.length === 0) {
            onNotify('Select at least one tabular field (other than Photo) to export Excel.', 'error');
            return;
        }

        setIsGeneratingExcel(true);
        try {
            const enriched = resolveEnrichedRecords(targetRegs).sort((a, b) => {
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

            const rows = enriched.map((rec) => {
                const row: Record<string, any> = {
                    playerNumber:
                        rec.playerNumber !== undefined && rec.playerNumber !== null && rec.playerNumber !== ''
                            ? Number(rec.playerNumber) || rec.playerNumber
                            : '-',
                    fullName: rec.fullName || '-',
                    mobile: rec.mobile || '-',
                    dob: rec.dob || '-',
                    gender: rec.gender || '-',
                    playerType: rec.playerType || '-',
                    category: rec.category || '-',
                    jerseyName: rec.jerseyName || '-',
                    jerseyNumber:
                        rec.jerseyNumber !== undefined && rec.jerseyNumber !== null && String(rec.jerseyNumber).trim() !== ''
                            ? rec.jerseyNumber
                            : '-',
                    jerseySize: rec.jerseySize || '-',
                    status: rec.status || '-',
                    paymentStatus: rec.paymentSummary || rec.paymentStatus || '-',
                    submittedAt: rec.submittedAt ? new Date(rec.submittedAt).toLocaleDateString() : '-',
                };

                (customFields || []).forEach((cf) => {
                    const val = rec[cf.id];
                    row[`cf_${cf.id}`] =
                        val !== undefined && val !== null && String(val).trim() !== '' ? val : '-';
                });

                return row;
            });

            const safeTitle = (auctionTitle || 'Tournament').replace(/\s+/g, '_');
            await downloadStyledRegistrationExcel({
                fileName: `${onlySelected ? `SELECTED_${rows.length}_` : ''}REGISTRATIONS_${safeTitle}.xlsx`,
                sheetName: 'Player Registrations',
                columns: excelColumnDefs,
                rows,
                includeSlNo: true,
            });

            onNotify(
                onlySelected
                    ? `Styled Excel exported for ${rows.length} selected registrations!`
                    : `Styled Excel exported for ${rows.length} registrations!`,
                'success'
            );
        } catch (err: any) {
            console.error('Styled Excel Export Error:', err);
            onNotify('Failed to generate Excel: ' + (err?.message || 'Unknown error'), 'error');
        } finally {
            setIsGeneratingExcel(false);
        }
    };

    const handleExportPDF = async (onlySelected: boolean) => {
        const targetRegs = getTargetRegistrations(onlySelected);
        if (targetRegs.length === 0) {
            onNotify(
                onlySelected
                    ? 'Please select at least one registration using the checkboxes below.'
                    : 'No registrations found to export.',
                'error'
            );
            return;
        }
        if (selectedFields.length === 0) {
            onNotify('Please select at least one field to include in the PDF.', 'error');
            return;
        }

        setIsGeneratingPDF(true);
        isPdfCancelled.current = false;
        setPdfProgress(0);

        try {
            const enriched = resolveEnrichedRecords(targetRegs);
            const safeTitle = (auctionTitle || 'Tournament').replace(/\s+/g, '_');
            const fileName = onlySelected
                ? `${safeTitle}_Selected_${enriched.length}_Registrations.pdf`
                : `${safeTitle}_Player_Registrations.pdf`;

            await generateRegistrationStylePDF({
                records: enriched,
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
                subtitle: 'Official Player Registrations',
                onProgress: (pct) => setPdfProgress(pct),
                isCancelledRef: isPdfCancelled,
            });

            onNotify(
                onlySelected
                    ? `PDF with ${enriched.length} selected registrations generated!`
                    : `PDF with ${enriched.length} registrations generated!`,
                'success'
            );
        } catch (err: any) {
            if (err?.message === 'PDF_CANCELLED') {
                onNotify('PDF Export Cancelled', 'success');
            } else {
                console.error('Registration PDF Error:', err);
                onNotify('Failed to generate PDF: ' + (err?.message || 'Unknown error'), 'error');
            }
        } finally {
            setIsGeneratingPDF(false);
            isPdfCancelled.current = false;
        }
    };

    const visibleAllSelected =
        filteredRegistrations.length > 0 &&
        filteredRegistrations.every((r) => selectedRegIds.includes(String(r.id)));

    return (
        <div
            className={`${
                isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200 shadow-sm'
            } p-6 sm:p-8 rounded-[2.5rem] border space-y-6`}
        >
            {/* Header + Action Buttons */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                <div className="flex items-start gap-3">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 shrink-0">
                        <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h2
                                className={`text-xl sm:text-2xl font-black uppercase tracking-tighter ${
                                    isDark ? 'text-white' : 'text-gray-800'
                                }`}
                            >
                                Registration Export Hub
                            </h2>
                            {selectedRegIds.length > 0 && (
                                <span className="bg-blue-600/10 text-blue-600 border border-blue-500/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                                    <CheckSquare className="w-3 h-3" /> {selectedRegIds.length} Selected
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={() => setIsExpanded((v) => !v)}
                                className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 transition-all ${
                                    isDark
                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                                        : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                                }`}
                            >
                                <SlidersHorizontal className="w-3 h-3" />
                                {isExpanded ? 'Hide Options' : 'Customize Fields & Layout'}
                                {isExpanded ? (
                                    <ChevronUp className="w-3 h-3" />
                                ) : (
                                    <ChevronDown className="w-3 h-3" />
                                )}
                            </button>
                        </div>
                        <p
                            className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${
                                isDark ? 'text-zinc-500' : 'text-gray-400'
                            }`}
                        >
                            Styled Excel (SL No. + Bold Yellow Headers + All Borders) &amp; A4 Player Card PDF •{' '}
                            {selectedRegIds.length > 0
                                ? `${selectedRegIds.length} selected`
                                : `${filteredRegistrations.length} visible (${registrations.length} total)`}
                        </p>
                    </div>
                </div>

                {/* Export Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                    {isGeneratingPDF && (
                        <button
                            type="button"
                            onClick={() => {
                                isPdfCancelled.current = true;
                            }}
                            className="bg-red-50 text-red-600 border border-red-200 px-4 py-3 rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-red-500 hover:text-white transition-all active:scale-95 animate-pulse"
                        >
                            <X className="w-4 h-4" /> Cancel PDF
                        </button>
                    )}

                    {/* Excel Buttons */}
                    {selectedRegIds.length > 0 ? (
                        <>
                            <button
                                type="button"
                                onClick={() => handleExportExcel(true)}
                                disabled={isGeneratingExcel}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
                                title="Download styled Excel for only the selected players"
                            >
                                {isGeneratingExcel ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <FileSpreadsheet className="w-4 h-4" />
                                )}
                                Excel ({selectedRegIds.length} Selected)
                            </button>
                            <button
                                type="button"
                                onClick={() => handleExportExcel(false)}
                                disabled={isGeneratingExcel}
                                className={`${
                                    isDark
                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700'
                                        : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                } border px-4 py-3 rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50`}
                                title="Download styled Excel for all visible registrations"
                            >
                                <FileSpreadsheet className="w-4 h-4" /> Excel All ({filteredRegistrations.length})
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={() => handleExportExcel(false)}
                            disabled={isGeneratingExcel}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
                        >
                            {isGeneratingExcel ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <FileSpreadsheet className="w-4 h-4" />
                            )}
                            Export Excel ({filteredRegistrations.length})
                        </button>
                    )}

                    {/* PDF Buttons */}
                    {selectedRegIds.length > 0 ? (
                        <>
                            <button
                                type="button"
                                onClick={() => handleExportPDF(true)}
                                disabled={isGeneratingPDF}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 transition-all shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50"
                                title={`Export PDF containing only the ${selectedRegIds.length} selected registrations`}
                            >
                                {isGeneratingPDF ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <FileDown className="w-4 h-4" />
                                )}
                                {isGeneratingPDF
                                    ? `Generating ${pdfProgress}%`
                                    : `Extract PDF (${selectedRegIds.length} Selected)`}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleExportPDF(false)}
                                disabled={isGeneratingPDF}
                                className={`${
                                    isDark
                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700'
                                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                } border px-4 py-3 rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50`}
                                title="Export PDF for all visible registrations"
                            >
                                <FileDown className="w-4 h-4" /> PDF All ({filteredRegistrations.length})
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={() => handleExportPDF(false)}
                            disabled={isGeneratingPDF}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 transition-all shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50"
                        >
                            {isGeneratingPDF ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <FileDown className="w-4 h-4" />
                            )}
                            {isGeneratingPDF
                                ? `Generating ${pdfProgress}%`
                                : `Generate PDF (${filteredRegistrations.length})`}
                        </button>
                    )}
                </div>
            </div>

            {isExpanded && (
                <div
                    className={`grid grid-cols-1 lg:grid-cols-12 gap-6 pt-6 border-t ${
                        isDark ? 'border-zinc-800' : 'border-gray-100'
                    }`}
                >
                    {/* Left Column: PDF Theme & Layout */}
                    <div className="lg:col-span-5 space-y-5">
                        {/* Theme Selection */}
                        <div className="space-y-2.5">
                            <label
                                className={`block text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${
                                    isDark ? 'text-zinc-500' : 'text-gray-400'
                                }`}
                            >
                                <Palette className="w-3.5 h-3.5 text-blue-500" /> PDF Document Theme
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: 'NORMAL', label: 'Standard White', desc: 'Clean & Professional' },
                                    { id: 'ADVAYA', label: 'Premium Dark', desc: 'Gold & Black Warrior' },
                                ].map((theme) => (
                                    <button
                                        key={theme.id}
                                        type="button"
                                        onClick={() => setPdfTheme(theme.id as any)}
                                        className={`p-3 rounded-xl border-2 text-left transition-all relative overflow-hidden ${
                                            pdfTheme === theme.id
                                                ? 'border-blue-600 bg-blue-50/50 shadow-md shadow-blue-600/10'
                                                : isDark
                                                ? 'border-zinc-800 bg-zinc-800/50 hover:border-zinc-700'
                                                : 'border-gray-100 bg-gray-50/50 hover:border-blue-200'
                                        }`}
                                    >
                                        <p
                                            className={`text-[10px] font-black uppercase tracking-widest ${
                                                pdfTheme === theme.id
                                                    ? 'text-blue-600'
                                                    : isDark
                                                    ? 'text-zinc-200'
                                                    : 'text-gray-700'
                                            }`}
                                        >
                                            {theme.label}
                                        </p>
                                        <p
                                            className={`text-[8px] font-bold uppercase tracking-widest mt-0.5 ${
                                                isDark ? 'text-zinc-500' : 'text-gray-400'
                                            }`}
                                        >
                                            {theme.desc}
                                        </p>
                                        {pdfTheme === theme.id && (
                                            <div className="absolute top-2 right-2 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                                                <CheckCircle className="w-2.5 h-2.5 text-white" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Players Per Page */}
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <label
                                    className={`block text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${
                                        isDark ? 'text-zinc-500' : 'text-gray-400'
                                    }`}
                                >
                                    <LayoutList className="w-3.5 h-3.5 text-blue-500" /> Players Per Page (PDF)
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={exportCategorizedPDF}
                                        onChange={(e) => setExportCategorizedPDF(e.target.checked)}
                                    />
                                    <div
                                        className={`w-8 h-4 rounded-full relative transition-all ${
                                            exportCategorizedPDF
                                                ? 'bg-blue-600'
                                                : isDark
                                                ? 'bg-zinc-700'
                                                : 'bg-gray-200'
                                        }`}
                                    >
                                        <div
                                            className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-all ${
                                                exportCategorizedPDF ? 'translate-x-4' : ''
                                            }`}
                                        />
                                    </div>
                                    <span
                                        className={`text-[9px] font-black uppercase tracking-wider ${
                                            isDark ? 'text-zinc-400' : 'text-gray-500'
                                        }`}
                                    >
                                        Group by Category
                                    </span>
                                </label>
                            </div>
                            <div className="grid grid-cols-6 gap-1.5">
                                {[1, 2, 4, 6, 9, 'LIST'].map((num) => (
                                    <button
                                        key={num}
                                        type="button"
                                        onClick={() => setPlayersPerPage(num as any)}
                                        className={`py-2.5 rounded-xl border-2 text-center transition-all ${
                                            playersPerPage === num
                                                ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20'
                                                : isDark
                                                ? 'border-zinc-800 bg-zinc-800 text-zinc-400 hover:border-zinc-700'
                                                : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-blue-200'
                                        }`}
                                    >
                                        <p className="text-[10px] font-black uppercase">
                                            {num === 'LIST' ? 'List' : num}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Player Selection Quick Controls */}
                        <div
                            className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-2 ${
                                isDark ? 'bg-zinc-950/60 border-zinc-800' : 'bg-blue-50/50 border-blue-100'
                            }`}
                        >
                            <span
                                className={`text-[10px] font-black uppercase tracking-wider ${
                                    isDark ? 'text-zinc-300' : 'text-blue-900'
                                }`}
                            >
                                Select Required Players: {selectedRegIds.length} checked
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={onSelectAllVisible}
                                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
                                        visibleAllSelected
                                            ? 'bg-blue-600 border-blue-600 text-white'
                                            : isDark
                                            ? 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700'
                                            : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50'
                                    }`}
                                >
                                    {visibleAllSelected
                                        ? `Deselect Visible (${filteredRegistrations.length})`
                                        : `Select All Visible (${filteredRegistrations.length})`}
                                </button>
                                {selectedRegIds.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={onClearSelection}
                                        className="px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider text-red-600 hover:bg-red-50 transition-all"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Field Selector */}
                    <div className="lg:col-span-7 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <label
                                className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${
                                    isDark ? 'text-zinc-400' : 'text-gray-500'
                                }`}
                            >
                                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-500" />
                                Select Fields for Excel &amp; PDF ({selectedFields.length} Selected)
                            </label>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setSelectedFields(allFieldIds)}
                                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
                                        isDark
                                            ? 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700'
                                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    Select All
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setSelectedFields([
                                            'playerNumber',
                                            'fullName',
                                            'mobile',
                                            'playerType',
                                            'jerseyName',
                                            'jerseyNumber',
                                            'jerseySize',
                                        ])
                                    }
                                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
                                        isDark
                                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                                            : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                                    }`}
                                >
                                    Jersey + Basic
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setSelectedFields([
                                            'playerNumber',
                                            'fullName',
                                            'mobile',
                                            'dob',
                                            'gender',
                                            'playerType',
                                            'category',
                                            'status',
                                            'profilePic',
                                            'jerseyName',
                                            'jerseyNumber',
                                            'jerseySize',
                                        ])
                                    }
                                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
                                        isDark
                                            ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                    }`}
                                >
                                    Reset Defaults
                                </button>
                            </div>
                        </div>

                        {/* Core & Status Fields */}
                        <div className="space-y-1.5">
                            <p
                                className={`text-[9px] font-black uppercase tracking-widest ${
                                    isDark ? 'text-zinc-500' : 'text-gray-400'
                                }`}
                            >
                                Player &amp; Registration Details (SL No. auto-added in Excel)
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {CORE_FIELD_OPTIONS.map((field) => {
                                    const active = selectedFields.includes(field.id);
                                    return (
                                        <button
                                            key={field.id}
                                            type="button"
                                            onClick={() => toggleField(field.id)}
                                            className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all flex items-center gap-1.5 ${
                                                active
                                                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-600/20'
                                                    : isDark
                                                    ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-blue-500'
                                                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-blue-300'
                                            }`}
                                        >
                                            {field.label}
                                            {active ? (
                                                <Check className="w-2.5 h-2.5" />
                                            ) : (
                                                <Plus className="w-2.5 h-2.5 opacity-40" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Jersey Fields */}
                        <div className="space-y-1.5">
                            <p
                                className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                                    isDark ? 'text-amber-400' : 'text-amber-600'
                                }`}
                            >
                                <Shirt className="w-3 h-3" /> Jersey Details
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {JERSEY_FIELD_OPTIONS.map((field) => {
                                    const active = selectedFields.includes(field.id);
                                    return (
                                        <button
                                            key={field.id}
                                            type="button"
                                            onClick={() => toggleField(field.id)}
                                            className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all flex items-center gap-1.5 ${
                                                active
                                                    ? 'bg-amber-500 border-amber-500 text-black shadow-sm shadow-amber-500/20'
                                                    : isDark
                                                    ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-amber-500'
                                                    : 'bg-amber-50/40 border-amber-200/70 text-amber-800 hover:border-amber-400'
                                            }`}
                                        >
                                            {field.label}
                                            {active ? (
                                                <Check className="w-2.5 h-2.5" />
                                            ) : (
                                                <Plus className="w-2.5 h-2.5 opacity-40" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Custom Registration Form Fields */}
                        {customFields && customFields.length > 0 && (
                            <div className="space-y-1.5">
                                <p
                                    className={`text-[9px] font-black uppercase tracking-widest ${
                                        isDark ? 'text-emerald-400' : 'text-emerald-600'
                                    }`}
                                >
                                    Custom Registration Fields ({customFields.length})
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {customFields.map((cf) => {
                                        const fid = `cf_${cf.id}`;
                                        const active = selectedFields.includes(fid);
                                        return (
                                            <button
                                                key={fid}
                                                type="button"
                                                onClick={() => toggleField(fid)}
                                                className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all flex items-center gap-1.5 ${
                                                    active
                                                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                                                        : isDark
                                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-emerald-500'
                                                        : 'bg-emerald-50/40 border-emerald-200/70 text-emerald-800 hover:border-emerald-400'
                                                }`}
                                            >
                                                {cf.label}
                                                {active ? (
                                                    <Check className="w-2.5 h-2.5" />
                                                ) : (
                                                    <Plus className="w-2.5 h-2.5 opacity-40" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
