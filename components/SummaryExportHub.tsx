import React, { useMemo, useRef, useState } from 'react';
import {
    Check,
    CheckCircle,
    CheckSquare,
    ChevronDown,
    ChevronUp,
    FileDown,
    FileSpreadsheet,
    Filter,
    LayoutList,
    Loader2,
    Palette,
    Plus,
    Search,
    Shirt,
    SlidersHorizontal,
    Square,
    Users,
    X,
} from 'lucide-react';
import {
    AuctionCategory,
    DraftPickHistory,
    FormField,
    Player,
    RegisteredPlayer,
    RegistrationConfig,
    Team,
} from '../types';
import {
    findPlayerRegistration,
    getPlayerFieldValue,
    resolveDraftTeamSquad,
    resolveTeamSquad,
} from '../utils';
import {
    downloadMultiSheetStyledExcel,
    downloadStyledRegistrationExcel,
    StyledExcelColumn,
    StyledExcelSheetSpec,
} from '../utils/styledExcelExport';
import {
    generateRegistrationStylePDF,
    RegistrationPdfRecord,
} from '../utils/registrationPdfExport';

export interface SummaryExportHubProps {
    teams: Team[];
    players: Player[];
    registrations?: RegisteredPlayer[];
    registrationConfig?: RegistrationConfig;
    categories?: AuctionCategory[];
    auctionTitle?: string;
    auctionLogoUrl?: string;
    systemBranding?: { logo: string; tagline: string };
    draftHistory?: DraftPickHistory[];
    draftPickMap?: Map<string, DraftPickHistory>;
    isDark?: boolean;
    defaultExpanded?: boolean;
    onNotify?: (message: string, type?: 'error' | 'success') => void;
    onClose?: () => void;
}

interface SummaryExportRow {
    key: string;
    playerId: string;
    teamId: string;
    teamName: string;
    isCaptain: boolean;
    playerNumber: string | number;
    name: string;
    category: string;
    role: string;
    soldPrice: number;
    isTraded: boolean;
    pickNumber: string | number;
    round: string | number;
    mobile: string;
    dob: string;
    gender: string;
    playerType: string;
    profilePic: string;
    jerseyName: string;
    jerseyNumber: string | number;
    jerseySize: string;
    customValues: Record<string, any>;
    submittedAt: number;
}

const CORE_SUMMARY_FIELDS = [
    { id: 'playerNumber', label: 'Player #' },
    { id: 'name', label: 'Player Name' },
    { id: 'teamName', label: 'Team Name' },
    { id: 'soldPrice', label: 'Sold Price' },
    { id: 'category', label: 'Category' },
    { id: 'role', label: 'Role' },
    { id: 'isTraded', label: 'Traded' },
    { id: 'mobile', label: 'Mobile' },
    { id: 'dob', label: 'DOB' },
    { id: 'gender', label: 'Gender' },
    { id: 'playerType', label: 'Role (Reg)' },
    { id: 'profilePic', label: 'Photo (PDF)' },
];

const DRAFT_EXTRA_FIELDS = [
    { id: 'pickNumber', label: 'Pick #' },
    { id: 'round', label: 'Round' },
];

const JERSEY_FIELDS = [
    { id: 'jerseyName', label: 'Jersey Name' },
    { id: 'jerseyNumber', label: 'Jersey Number' },
    { id: 'jerseySize', label: 'Jersey Size' },
];

const DEFAULT_SELECTED_FIELDS = [
    'playerNumber',
    'name',
    'teamName',
    'soldPrice',
    'category',
    'role',
    'mobile',
    'profilePic',
    'jerseyName',
    'jerseyNumber',
    'jerseySize',
];

export const SummaryExportHub: React.FC<SummaryExportHubProps> = ({
    teams,
    players,
    registrations = [],
    registrationConfig,
    categories = [],
    auctionTitle = 'Championship',
    auctionLogoUrl,
    systemBranding = { logo: '', tagline: 'Your streaming partner' },
    draftHistory,
    draftPickMap,
    isDark = false,
    defaultExpanded = true,
    onNotify,
    onClose,
}) => {
    const customFields: FormField[] = registrationConfig?.customFields || [];
    const isDraftMode = Array.isArray(draftHistory) && draftHistory.length > 0;

    const notify = (msg: string, type: 'error' | 'success' = 'success') => {
        if (onNotify) {
            onNotify(msg, type);
        } else if (type === 'error') {
            console.warn(msg);
        }
    };

    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [selectedFields, setSelectedFields] = useState<string[]>(() =>
        isDraftMode
            ? [...DEFAULT_SELECTED_FIELDS, 'pickNumber', 'round']
            : DEFAULT_SELECTED_FIELDS
    );
    const [teamFilter, setTeamFilter] = useState<string>('ALL');
    const [playerSearch, setPlayerSearch] = useState('');
    const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
    const [pdfTheme, setPdfTheme] = useState<'NORMAL' | 'ADVAYA'>('NORMAL');
    const [playersPerPage, setPlayersPerPage] = useState<1 | 2 | 4 | 6 | 9 | 'LIST'>(4);
    const [pdfGroupMode, setPdfGroupMode] = useState<'NONE' | 'team' | 'category'>('team');
    const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [pdfProgress, setPdfProgress] = useState(0);
    const isPdfCancelled = useRef(false);

    const allFieldOptions = useMemo(
        () => [
            ...CORE_SUMMARY_FIELDS,
            ...(isDraftMode ? DRAFT_EXTRA_FIELDS : []),
            ...JERSEY_FIELDS,
            ...customFields.map((cf) => ({ id: `cf_${cf.id}`, label: cf.label })),
        ],
        [isDraftMode, customFields]
    );

    const allFieldIds = useMemo(
        () => allFieldOptions.map((f) => f.id),
        [allFieldOptions]
    );

    // Authoritative consolidated squad rows across all teams (deduplicated per team)
    const allSummaryRows = useMemo<SummaryExportRow[]>(() => {
        const rows: SummaryExportRow[] = [];
        const seenPlayerIds = new Set<string>();

        teams.forEach((team) => {
            const squad = isDraftMode
                ? resolveDraftTeamSquad(team, players, draftHistory || [])
                : resolveTeamSquad(team, players);

            const ownerName = team.ownerName || team.owner || '';
            const isOwnerCaptain = team.isOwnerCaptain !== false && !team.captainName && !!ownerName;
            const captainName = team.captainName || (isOwnerCaptain ? ownerName : '');

            squad.forEach((p: any, idx: number) => {
                const pid = String(p.id || `${team.id}_${idx}_${p.name}`);
                if (seenPlayerIds.has(pid)) return;
                seenPlayerIds.add(pid);

                const reg = findPlayerRegistration(p, registrations);
                const pick = draftPickMap?.get(String(p.id));
                const isPlayerCaptain =
                    Boolean(p.isCaptain) ||
                    (captainName &&
                        p.name &&
                        String(p.name).trim().toLowerCase() === captainName.trim().toLowerCase()) ||
                    (team.captainId && String(team.captainId) === String(p.id));

                const customValues: Record<string, any> = {};
                customFields.forEach((cf) => {
                    customValues[cf.id] = getPlayerFieldValue(p, reg, cf.id, '');
                });

                rows.push({
                    key: `${team.id}::${pid}`,
                    playerId: pid,
                    teamId: String(team.id),
                    teamName: team.name,
                    isCaptain: Boolean(isPlayerCaptain),
                    playerNumber: getPlayerFieldValue(p, reg, 'playerNumber', ''),
                    name: p.name || '',
                    category: p.category || 'Standard',
                    role: p.role || p.speciality || '',
                    soldPrice: Number(p.soldPrice || 0),
                    isTraded: Boolean(p.isTraded),
                    pickNumber: p.pickNumber ?? pick?.pickNumber ?? idx + 1,
                    round: p.round ?? pick?.round ?? '',
                    mobile: getPlayerFieldValue(p, reg, 'mobile', ''),
                    dob: getPlayerFieldValue(p, reg, 'dob', ''),
                    gender: getPlayerFieldValue(p, reg, 'gender', ''),
                    playerType: getPlayerFieldValue(p, reg, 'playerType', p.role || ''),
                    profilePic: p.photoUrl || reg?.profilePic || '',
                    jerseyName: getPlayerFieldValue(p, reg, 'jerseyName', ''),
                    jerseyNumber: getPlayerFieldValue(p, reg, 'jerseyNumber', ''),
                    jerseySize: getPlayerFieldValue(p, reg, 'jerseySize', ''),
                    customValues,
                    submittedAt: reg?.submittedAt || 0,
                });
            });
        });

        return rows;
    }, [teams, players, registrations, customFields, isDraftMode, draftHistory, draftPickMap]);

    const filteredRows = useMemo(() => {
        const q = playerSearch.trim().toLowerCase();
        return allSummaryRows.filter((row) => {
            if (teamFilter !== 'ALL' && String(row.teamId) !== String(teamFilter)) return false;
            if (!q) return true;
            return (
                row.name.toLowerCase().includes(q) ||
                row.teamName.toLowerCase().includes(q) ||
                row.category.toLowerCase().includes(q) ||
                row.role.toLowerCase().includes(q) ||
                String(row.mobile || '').toLowerCase().includes(q) ||
                String(row.jerseyName || '').toLowerCase().includes(q) ||
                String(row.playerNumber || '').toLowerCase().includes(q)
            );
        });
    }, [allSummaryRows, teamFilter, playerSearch]);

    const selectedRows = useMemo(
        () => allSummaryRows.filter((r) => selectedRowKeys.includes(r.key)),
        [allSummaryRows, selectedRowKeys]
    );

    const toggleField = (fieldId: string) => {
        setSelectedFields((prev) =>
            prev.includes(fieldId) ? prev.filter((id) => id !== fieldId) : [...prev, fieldId]
        );
    };

    const toggleRow = (key: string) => {
        setSelectedRowKeys((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
        );
    };

    const allFilteredSelected =
        filteredRows.length > 0 && filteredRows.every((r) => selectedRowKeys.includes(r.key));

    const handleToggleAllFiltered = () => {
        const visibleKeys = filteredRows.map((r) => r.key);
        if (allFilteredSelected) {
            setSelectedRowKeys((prev) => prev.filter((k) => !visibleKeys.includes(k)));
        } else {
            setSelectedRowKeys((prev) => Array.from(new Set([...prev, ...visibleKeys])));
        }
    };

    const buildStyledColumns = (): StyledExcelColumn[] => {
        const cols: StyledExcelColumn[] = [];
        const add = (
            id: string,
            header: string,
            align: 'left' | 'center' | 'right' = 'left',
            minWidth = 14
        ) => {
            if (selectedFields.includes(id)) {
                cols.push({ key: id, header, align, minWidth });
            }
        };

        add('playerNumber', 'Player #', 'center', 11);
        add('name', 'Player Name', 'left', 22);
        add('teamName', 'Team Name', 'left', 18);
        add('category', 'Category', 'center', 14);
        add('role', 'Role', 'left', 16);
        add('soldPrice', 'Sold Price', 'right', 13);
        if (isDraftMode) {
            add('pickNumber', 'Pick #', 'center', 10);
            add('round', 'Round', 'center', 10);
        }
        add('isTraded', 'Traded', 'center', 10);
        add('jerseyName', 'Jersey Name', 'left', 18);
        add('jerseyNumber', 'Jersey No.', 'center', 12);
        add('jerseySize', 'Jersey Size', 'center', 12);
        add('mobile', 'Mobile', 'center', 15);
        add('dob', 'DOB', 'center', 13);
        add('gender', 'Gender', 'center', 11);
        add('playerType', 'Role (Reg)', 'left', 16);
        customFields.forEach((cf) => {
            add(`cf_${cf.id}`, cf.label, 'left', 16);
        });

        return cols;
    };

    const rowToStyledRecord = (r: SummaryExportRow): Record<string, any> => {
        const rec: Record<string, any> = {
            playerNumber:
                r.playerNumber !== '' && r.playerNumber !== undefined && r.playerNumber !== null
                    ? Number(r.playerNumber) || r.playerNumber
                    : '-',
            name: r.isCaptain ? `${r.name} (C)` : r.name || '-',
            teamName: r.teamName || '-',
            category: r.category || '-',
            role: r.role || '-',
            soldPrice: r.soldPrice || 0,
            pickNumber: r.pickNumber || '-',
            round: r.round || '-',
            isTraded: r.isTraded ? 'YES' : 'NO',
            jerseyName: r.jerseyName || '-',
            jerseyNumber:
                r.jerseyNumber !== '' && r.jerseyNumber !== undefined && r.jerseyNumber !== null
                    ? r.jerseyNumber
                    : '-',
            jerseySize: r.jerseySize || '-',
            mobile: r.mobile || '-',
            dob: r.dob || '-',
            gender: r.gender || '-',
            playerType: r.playerType || '-',
        };

        customFields.forEach((cf) => {
            const val = r.customValues[cf.id];
            rec[`cf_${cf.id}`] =
                val !== undefined && val !== null && String(val).trim() !== '' ? val : '-';
        });

        return rec;
    };

    const handleExportExcel = async (onlySelected: boolean) => {
        const targetRows = onlySelected ? selectedRows : filteredRows;
        if (targetRows.length === 0) {
            notify(
                onlySelected
                    ? 'Please select at least one player using the checkboxes.'
                    : 'No drafted or sold players found to export.',
                'error'
            );
            return;
        }

        const columns = buildStyledColumns();
        if (columns.length === 0) {
            notify('Please select at least one tabular field (other than Photo) for Excel export.', 'error');
            return;
        }

        setIsGeneratingExcel(true);
        try {
            const safeTitle = (auctionTitle || 'Auction').replace(/\s+/g, '_');
            const distinctTeamNames = Array.from(new Set(targetRows.map((r) => r.teamName)));

            if (!onlySelected && teamFilter === 'ALL' && distinctTeamNames.length > 1) {
                const sheets: StyledExcelSheetSpec[] = [
                    {
                        sheetName: 'Master Data',
                        columns,
                        rows: targetRows.map(rowToStyledRecord),
                        includeSlNo: true,
                    },
                ];

                teams.forEach((t) => {
                    const teamRows = targetRows.filter((r) => String(r.teamId) === String(t.id));
                    if (teamRows.length > 0) {
                        sheets.push({
                            sheetName: t.name,
                            columns,
                            rows: teamRows.map(rowToStyledRecord),
                            includeSlNo: true,
                        });
                    }
                });

                await downloadMultiSheetStyledExcel({
                    fileName: `${safeTitle}_Auction_Summary_${new Date().toISOString().split('T')[0]}.xlsx`,
                    sheets,
                });
                notify(`Master + Team Styled Excel exported (${targetRows.length} players)!`, 'success');
            } else {
                const selectedTeamObj = teams.find((t) => String(t.id) === String(teamFilter));
                const prefix = onlySelected
                    ? `SELECTED_${targetRows.length}_`
                    : selectedTeamObj
                    ? `${selectedTeamObj.name.replace(/\s+/g, '_')}_`
                    : '';

                await downloadStyledRegistrationExcel({
                    fileName: `${prefix}${safeTitle}_Summary.xlsx`,
                    sheetName: selectedTeamObj ? selectedTeamObj.name : 'Auction Summary',
                    columns,
                    rows: targetRows.map(rowToStyledRecord),
                    includeSlNo: true,
                });
                notify(`Styled Excel exported for ${targetRows.length} players!`, 'success');
            }
        } catch (err: any) {
            console.error('Summary Styled Excel Export Error:', err);
            notify('Failed to export Excel: ' + (err?.message || 'Unknown error'), 'error');
        } finally {
            setIsGeneratingExcel(false);
        }
    };

    const handleExportPDF = async (onlySelected: boolean) => {
        const targetRows = onlySelected ? selectedRows : filteredRows;
        if (targetRows.length === 0) {
            notify(
                onlySelected
                    ? 'Please select at least one player using the checkboxes.'
                    : 'No drafted or sold players found to export.',
                'error'
            );
            return;
        }
        if (selectedFields.length === 0) {
            notify('Please select at least one field to include in the PDF.', 'error');
            return;
        }

        setIsGeneratingPDF(true);
        isPdfCancelled.current = false;
        setPdfProgress(0);

        try {
            const pdfRecords: RegistrationPdfRecord[] = targetRows.map((r) => ({
                id: r.playerId,
                playerNumber: r.playerNumber,
                fullName: r.isCaptain ? `${r.name} (C)` : r.name,
                teamName: r.teamName,
                soldTo: r.teamName,
                soldPrice: r.soldPrice,
                category: r.category,
                playerType: r.role || r.playerType,
                isTraded: r.isTraded,
                mobile: r.mobile,
                dob: r.dob,
                gender: r.gender,
                profilePic: r.profilePic,
                jerseyName: r.jerseyName,
                jerseyNumber: r.jerseyNumber,
                jerseySize: r.jerseySize,
                submittedAt: r.submittedAt,
                ...r.customValues,
            }));

            const mappedPdfFields = selectedFields.map((f) => {
                if (f === 'name') return 'fullName';
                if (f === 'role') return 'playerType';
                return f;
            });

            const safeTitle = (auctionTitle || 'Auction').replace(/\s+/g, '_');
            const selectedTeamObj = teams.find((t) => String(t.id) === String(teamFilter));
            const fileName = onlySelected
                ? `${safeTitle}_Summary_Selected_${pdfRecords.length}_Players.pdf`
                : selectedTeamObj
                ? `${selectedTeamObj.name.replace(/\s+/g, '_')}_Summary.pdf`
                : `${safeTitle}_Auction_Summary.pdf`;

            await generateRegistrationStylePDF({
                records: pdfRecords,
                selectedFields: Array.from(new Set(mappedPdfFields)),
                customFields,
                pdfTheme,
                playersPerPage,
                exportCategorizedPDF: pdfGroupMode !== 'NONE',
                groupByField: pdfGroupMode === 'team' ? 'team' : 'category',
                categories,
                auctionTitle,
                auctionLogoUrl,
                systemBranding,
                fileName,
                subtitle: selectedTeamObj
                    ? `Official Squad Summary — ${selectedTeamObj.name}`
                    : 'Official Auction Summary',
                onProgress: (pct) => setPdfProgress(pct),
                isCancelledRef: isPdfCancelled,
            });

            notify(`PDF generated for ${pdfRecords.length} players!`, 'success');
        } catch (err: any) {
            if (err?.message === 'PDF_CANCELLED') {
                notify('PDF Export Cancelled', 'success');
            } else {
                console.error('Summary PDF Export Error:', err);
                notify('Failed to generate PDF: ' + (err?.message || 'Unknown error'), 'error');
            }
        } finally {
            setIsGeneratingPDF(false);
            isPdfCancelled.current = false;
        }
    };

    const cardBg = isDark
        ? 'bg-zinc-900 border-zinc-800 text-zinc-100'
        : 'bg-white border-gray-200 text-gray-800 shadow-sm';

    return (
        <div className={`${cardBg} rounded-[2rem] border p-5 sm:p-7 space-y-6`}>
            {/* Top Header & Action Buttons */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                <div className="flex items-start gap-3">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 shrink-0">
                        <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h2
                                className={`text-lg sm:text-xl font-black uppercase tracking-tight ${
                                    isDark ? 'text-white' : 'text-gray-900'
                                }`}
                            >
                                Summary Export Hub (Excel &amp; PDF)
                            </h2>
                            {selectedRowKeys.length > 0 && (
                                <span className="bg-blue-600/10 text-blue-600 border border-blue-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                                    <CheckSquare className="w-3 h-3" /> {selectedRowKeys.length} Selected
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
                                {isExpanded ? 'Hide Options' : 'Customize Fields & Players'}
                                {isExpanded ? (
                                    <ChevronUp className="w-3 h-3" />
                                ) : (
                                    <ChevronDown className="w-3 h-3" />
                                )}
                            </button>
                            {onClose && (
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className={`p-1.5 rounded-full border transition-all ${
                                        isDark
                                            ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-red-600 hover:text-white'
                                            : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-red-500 hover:text-white'
                                    }`}
                                    title="Close Export Hub"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <p
                            className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${
                                isDark ? 'text-zinc-500' : 'text-gray-400'
                            }`}
                        >
                            Styled Excel (SL No. + Bold Yellow Header + All Borders) &amp; A4 Player Card PDF •{' '}
                            {selectedRowKeys.length > 0
                                ? `${selectedRowKeys.length} selected`
                                : `${filteredRows.length} visible (${allSummaryRows.length} total)`}
                        </p>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                    {isGeneratingPDF && (
                        <button
                            type="button"
                            onClick={() => {
                                isPdfCancelled.current = true;
                            }}
                            className="bg-red-50 text-red-600 border border-red-200 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 hover:bg-red-500 hover:text-white transition-all animate-pulse"
                        >
                            <X className="w-4 h-4" /> Cancel PDF
                        </button>
                    )}

                    {selectedRowKeys.length > 0 ? (
                        <>
                            <button
                                type="button"
                                onClick={() => handleExportExcel(true)}
                                disabled={isGeneratingExcel}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
                            >
                                {isGeneratingExcel ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <FileSpreadsheet className="w-4 h-4" />
                                )}
                                Excel ({selectedRowKeys.length} Selected)
                            </button>
                            <button
                                type="button"
                                onClick={() => handleExportExcel(false)}
                                disabled={isGeneratingExcel}
                                className={`${
                                    isDark
                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700'
                                        : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                } border px-3.5 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 active:scale-95 disabled:opacity-50`}
                            >
                                <FileSpreadsheet className="w-4 h-4" /> Excel All ({filteredRows.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => handleExportPDF(true)}
                                disabled={isGeneratingPDF}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 shadow-md shadow-blue-600/20 active:scale-95 disabled:opacity-50"
                            >
                                {isGeneratingPDF ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <FileDown className="w-4 h-4" />
                                )}
                                {isGeneratingPDF
                                    ? `PDF ${pdfProgress}%`
                                    : `PDF (${selectedRowKeys.length} Selected)`}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleExportPDF(false)}
                                disabled={isGeneratingPDF}
                                className={`${
                                    isDark
                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700'
                                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                } border px-3.5 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 active:scale-95 disabled:opacity-50`}
                            >
                                <FileDown className="w-4 h-4" /> PDF All ({filteredRows.length})
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => handleExportExcel(false)}
                                disabled={isGeneratingExcel}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
                            >
                                {isGeneratingExcel ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <FileSpreadsheet className="w-4 h-4" />
                                )}
                                {teamFilter === 'ALL'
                                    ? `Export Master Excel (${filteredRows.length})`
                                    : `Export Team Excel (${filteredRows.length})`}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleExportPDF(false)}
                                disabled={isGeneratingPDF}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 shadow-md shadow-blue-600/20 active:scale-95 disabled:opacity-50"
                            >
                                {isGeneratingPDF ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <FileDown className="w-4 h-4" />
                                )}
                                {isGeneratingPDF
                                    ? `Generating ${pdfProgress}%`
                                    : `Generate PDF (${filteredRows.length})`}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {isExpanded && (
                <div
                    className={`space-y-6 pt-5 border-t ${
                        isDark ? 'border-zinc-800' : 'border-gray-100'
                    }`}
                >
                    {/* Top Grid: Field Selector + PDF Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Left: PDF Theme & Page Layout */}
                        <div className="lg:col-span-5 space-y-4">
                            <div className="space-y-2">
                                <label
                                    className={`block text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                                        isDark ? 'text-zinc-400' : 'text-gray-400'
                                    }`}
                                >
                                    <Palette className="w-3.5 h-3.5 text-blue-500" /> PDF Theme
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { id: 'NORMAL', label: 'Standard White', desc: 'Clean Printable' },
                                        { id: 'ADVAYA', label: 'Premium Dark', desc: 'Gold & Black' },
                                    ].map((t) => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setPdfTheme(t.id as 'NORMAL' | 'ADVAYA')}
                                            className={`p-3 rounded-xl border-2 text-left relative transition-all ${
                                                pdfTheme === t.id
                                                    ? 'border-blue-600 bg-blue-50/50 text-blue-700'
                                                    : isDark
                                                    ? 'border-zinc-800 bg-zinc-800/50 text-zinc-300 hover:border-zinc-700'
                                                    : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-blue-200'
                                            }`}
                                        >
                                            <p className="text-[10px] font-black uppercase tracking-wider">
                                                {t.label}
                                            </p>
                                            <p className="text-[8px] font-bold uppercase opacity-60 mt-0.5">
                                                {t.desc}
                                            </p>
                                            {pdfTheme === t.id && (
                                                <div className="absolute top-2 right-2 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                                                    <CheckCircle className="w-2.5 h-2.5 text-white" />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label
                                    className={`block text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                                        isDark ? 'text-zinc-400' : 'text-gray-400'
                                    }`}
                                >
                                    <LayoutList className="w-3.5 h-3.5 text-blue-500" /> Players Per Page (PDF)
                                </label>
                                <div className="grid grid-cols-6 gap-1.5">
                                    {([1, 2, 4, 6, 9, 'LIST'] as const).map((num) => (
                                        <button
                                            key={num}
                                            type="button"
                                            onClick={() => setPlayersPerPage(num)}
                                            className={`py-2 rounded-xl border-2 text-[10px] font-black uppercase transition-all ${
                                                playersPerPage === num
                                                    ? 'border-blue-600 bg-blue-600 text-white'
                                                    : isDark
                                                    ? 'border-zinc-800 bg-zinc-800 text-zinc-400'
                                                    : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-blue-200'
                                            }`}
                                        >
                                            {num === 'LIST' ? 'List' : num}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label
                                    className={`block text-[10px] font-black uppercase tracking-widest ${
                                        isDark ? 'text-zinc-400' : 'text-gray-400'
                                    }`}
                                >
                                    PDF Grouping
                                </label>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {[
                                        { id: 'team', label: 'By Team' },
                                        { id: 'category', label: 'By Category' },
                                        { id: 'NONE', label: 'Flat List' },
                                    ].map((g) => (
                                        <button
                                            key={g.id}
                                            type="button"
                                            onClick={() => setPdfGroupMode(g.id as any)}
                                            className={`py-2 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all ${
                                                pdfGroupMode === g.id
                                                    ? 'border-blue-600 bg-blue-600 text-white'
                                                    : isDark
                                                    ? 'border-zinc-800 bg-zinc-800 text-zinc-400'
                                                    : 'border-gray-200 bg-gray-50 text-gray-600'
                                            }`}
                                        >
                                            {g.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Right: Field Selection */}
                        <div className="lg:col-span-7 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <label
                                    className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                                        isDark ? 'text-zinc-400' : 'text-gray-500'
                                    }`}
                                >
                                    <SlidersHorizontal className="w-3.5 h-3.5 text-blue-500" />
                                    Select Fields ({selectedFields.length} Selected) • SL No. Auto-Added in Excel
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedFields(allFieldIds)}
                                        className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[9px] font-black uppercase tracking-wider hover:bg-blue-700"
                                    >
                                        Select All
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setSelectedFields([
                                                'playerNumber',
                                                'name',
                                                'teamName',
                                                'jerseyName',
                                                'jerseyNumber',
                                                'jerseySize',
                                                'mobile',
                                            ])
                                        }
                                        className="px-2.5 py-1 rounded-lg bg-amber-500 text-black text-[9px] font-black uppercase tracking-wider hover:bg-amber-400"
                                    >
                                        Jersey + Team
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setSelectedFields(
                                                isDraftMode
                                                    ? [...DEFAULT_SELECTED_FIELDS, 'pickNumber', 'round']
                                                    : DEFAULT_SELECTED_FIELDS
                                            )
                                        }
                                        className={`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider ${
                                            isDark
                                                ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                                                : 'bg-gray-50 border-gray-200 text-gray-600'
                                        }`}
                                    >
                                        Reset
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                                {[...CORE_SUMMARY_FIELDS, ...(isDraftMode ? DRAFT_EXTRA_FIELDS : [])].map((field) => {
                                    const active = selectedFields.includes(field.id);
                                    return (
                                        <button
                                            key={field.id}
                                            type="button"
                                            onClick={() => toggleField(field.id)}
                                            className={`px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all flex items-center gap-1 ${
                                                active
                                                    ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
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

                            <div className="space-y-1">
                                <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-1">
                                    <Shirt className="w-3 h-3" /> Jersey Details
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {JERSEY_FIELDS.map((field) => {
                                        const active = selectedFields.includes(field.id);
                                        return (
                                            <button
                                                key={field.id}
                                                type="button"
                                                onClick={() => toggleField(field.id)}
                                                className={`px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all flex items-center gap-1 ${
                                                    active
                                                        ? 'bg-amber-500 border-amber-500 text-black'
                                                        : isDark
                                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-amber-500'
                                                        : 'bg-amber-50/50 border-amber-200 text-amber-800 hover:border-amber-400'
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

                            {customFields.length > 0 && (
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">
                                        Custom Form Fields ({customFields.length})
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
                                                    className={`px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all flex items-center gap-1 ${
                                                        active
                                                            ? 'bg-emerald-600 border-emerald-600 text-white'
                                                            : isDark
                                                            ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-emerald-500'
                                                            : 'bg-emerald-50/50 border-emerald-200 text-emerald-800 hover:border-emerald-400'
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

                    {/* Player Selection Filter & Checklist */}
                    <div
                        className={`rounded-2xl border p-4 space-y-3 ${
                            isDark ? 'bg-zinc-950/60 border-zinc-800' : 'bg-gray-50/70 border-gray-200'
                        }`}
                    >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span
                                    className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                                        isDark ? 'text-zinc-300' : 'text-gray-700'
                                    }`}
                                >
                                    <Users className="w-3.5 h-3.5 text-blue-500" />
                                    Filter &amp; Select Required Players ({filteredRows.length})
                                </span>
                                <button
                                    type="button"
                                    onClick={handleToggleAllFiltered}
                                    className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 ${
                                        allFilteredSelected
                                            ? 'bg-blue-600 border-blue-600 text-white'
                                            : isDark
                                            ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                                            : 'bg-white border-gray-200 text-gray-600'
                                    }`}
                                >
                                    {allFilteredSelected ? (
                                        <CheckSquare className="w-3 h-3" />
                                    ) : (
                                        <Square className="w-3 h-3" />
                                    )}
                                    {allFilteredSelected ? 'Deselect Visible' : 'Select All Visible'}
                                </button>
                                {selectedRowKeys.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedRowKeys([])}
                                        className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase text-red-600 bg-red-50 border border-red-200 hover:bg-red-100"
                                    >
                                        Clear ({selectedRowKeys.length})
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-1.5">
                                    <Filter className="w-3.5 h-3.5 text-gray-400" />
                                    <select
                                        value={teamFilter}
                                        onChange={(e) => setTeamFilter(e.target.value)}
                                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border outline-none ${
                                            isDark
                                                ? 'bg-zinc-900 border-zinc-700 text-zinc-200'
                                                : 'bg-white border-gray-200 text-gray-700'
                                        }`}
                                    >
                                        <option value="ALL">All Teams ({allSummaryRows.length})</option>
                                        {teams.map((t) => (
                                            <option key={t.id} value={String(t.id)}>
                                                {t.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="relative">
                                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Search name, mobile, jersey..."
                                        value={playerSearch}
                                        onChange={(e) => setPlayerSearch(e.target.value)}
                                        className={`pl-8 pr-3 py-1.5 rounded-xl text-[10px] font-bold border outline-none w-52 ${
                                            isDark
                                                ? 'bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-500'
                                                : 'bg-white border-gray-200 text-gray-700 placeholder:text-gray-400'
                                        }`}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pr-1 custom-scrollbar">
                            {filteredRows.length === 0 ? (
                                <div className="col-span-full py-6 text-center text-[10px] font-bold uppercase text-gray-400">
                                    No sold/drafted players match this filter.
                                </div>
                            ) : (
                                filteredRows.map((row) => {
                                    const checked = selectedRowKeys.includes(row.key);
                                    return (
                                        <button
                                            key={row.key}
                                            type="button"
                                            onClick={() => toggleRow(row.key)}
                                            className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all ${
                                                checked
                                                    ? isDark
                                                        ? 'bg-blue-950/40 border-blue-500 text-white'
                                                        : 'bg-blue-50 border-blue-500 text-blue-950'
                                                    : isDark
                                                    ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                                                    : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300'
                                            }`}
                                        >
                                            {checked ? (
                                                <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                                            ) : (
                                                <Square className="w-4 h-4 text-gray-400 shrink-0" />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[11px] font-black uppercase truncate">
                                                    {row.playerNumber ? `#${row.playerNumber} ` : ''}
                                                    {row.name}
                                                    {row.isCaptain ? ' (C)' : ''}
                                                </p>
                                                <p className="text-[9px] font-bold opacity-70 truncate">
                                                    {row.teamName}
                                                    {row.jerseyName || row.jerseyNumber || row.jerseySize
                                                        ? ` • J:${[
                                                              row.jerseyName,
                                                              row.jerseyNumber ? `#${row.jerseyNumber}` : '',
                                                              row.jerseySize,
                                                          ]
                                                              .filter(Boolean)
                                                              .join('/')}`
                                                        : ''}
                                                </p>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SummaryExportHub;
