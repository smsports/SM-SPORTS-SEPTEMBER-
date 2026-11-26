import React, { useEffect, useMemo, useState } from 'react';
import { Team, Player, DraftBoardState, DraftPickHistory, RegisteredPlayer, RegistrationConfig } from '../../types';
import { Trophy, Download, RotateCcw, Printer, Sparkles, FileText, Image as ImageIcon, FileSpreadsheet, SlidersHorizontal } from 'lucide-react';
import confetti from 'canvas-confetti';
import { getDraftTheme } from '../../utils/draftThemes';
import { resolveDraftTeamSquad, findPlayerRegistration, getPlayerFieldValue, compactTeamPlayersList } from '../../utils';
import { downloadMultiSheetStyledExcel, downloadStyledRegistrationExcel, StyledExcelColumn, StyledExcelSheetSpec } from '../../utils/styledExcelExport';
import TeamPdfExportModal from '../TeamPdfExportModal';
import TeamPhotoPdfExportModal from '../TeamPhotoPdfExportModal';
import { SummaryExportHub } from '../SummaryExportHub';

interface Props {
    tournamentName?: string;
    auctionLogoUrl?: string;
    systemLogoUrl?: string;
    teams: Team[];
    players: Player[];
    registrations?: RegisteredPlayer[];
    registrationConfig?: RegistrationConfig;
    draftPickMap: Map<string, DraftPickHistory>;
    draftState: DraftBoardState;
    isAdmin?: boolean;
    isProjectorView?: boolean;
    isOBSView?: boolean;
    auctionId?: string;
    onReopenDraft?: () => Promise<void>;
}

export const DraftAuctionSummary: React.FC<Props> = ({
    tournamentName = "LIVE AUCTION",
    auctionLogoUrl,
    systemLogoUrl,
    teams,
    players,
    registrations = [],
    registrationConfig,
    draftPickMap,
    draftState,
    isAdmin = false,
    isProjectorView = false,
    isOBSView = false,
    auctionId,
    onReopenDraft
}) => {
    const themeConfig = getDraftTheme(draftState.broadcastTheme);
    const hideNumbers = Boolean(draftState.hidePlayerNumbers);
    const [showPdfModal, setShowPdfModal] = useState(false);
    const [showPhotoPdfModal, setShowPhotoPdfModal] = useState(false);
    const [showExportHubModal, setShowExportHubModal] = useState(false);
    const [pdfTargetTeamId, setPdfTargetTeamId] = useState<string | number>('ALL');
    const customFields = registrationConfig?.customFields || [];

    // Launch celebratory confetti on summary display
    useEffect(() => {
        try {
            confetti({
                particleCount: 100,
                spread: 100,
                origin: { y: 0.4 }
            });
            const t1 = setTimeout(() => {
                confetti({
                    particleCount: 60,
                    angle: 60,
                    spread: 60,
                    origin: { x: 0, y: 0.6 }
                });
                confetti({
                    particleCount: 60,
                    angle: 120,
                    spread: 60,
                    origin: { x: 1, y: 0.6 }
                });
            }, 500);
            return () => clearTimeout(t1);
        } catch (_) {}
    }, []);

    // Build consolidated team squads (resolved against authoritative players & draft history)
    const teamSquads = useMemo(() => {
        return teams.map(team => {
            const roster = resolveDraftTeamSquad(team, players, draftState.history || []).map((p, idx) => {
                const reg = findPlayerRegistration(p, registrations);
                const pick = draftPickMap.get(String(p.id));
                const resolved: Record<string, any> = {
                    ...p,
                    id: p.id,
                    name: p.name,
                    role: p.role || p.category || 'Player',
                    category: p.category || 'General',
                    photoUrl: p.photoUrl || reg?.profilePic || '',
                    soldPrice: Number(p.soldPrice || 0),
                    round: p.round ?? pick?.round ?? '',
                    pickNumber: p.pickNumber ?? pick?.pickNumber ?? (idx + 1),
                    playerNumber: getPlayerFieldValue(p, reg, 'playerNumber', ''),
                    jerseyName: getPlayerFieldValue(p, reg, 'jerseyName', ''),
                    jerseyNumber: getPlayerFieldValue(p, reg, 'jerseyNumber', ''),
                    jerseySize: getPlayerFieldValue(p, reg, 'jerseySize', ''),
                    mobile: getPlayerFieldValue(p, reg, 'mobile', ''),
                    dob: getPlayerFieldValue(p, reg, 'dob', ''),
                    gender: getPlayerFieldValue(p, reg, 'gender', ''),
                    registrationId: p.registrationId || reg?.id || ''
                };
                customFields.forEach(cf => {
                    resolved[cf.id] = getPlayerFieldValue(p, reg, cf.id, '');
                });
                return resolved as Player & { round?: number | string; pickNumber?: number | string };
            });

            const totalSpent = roster.reduce((sum, p) => sum + (Number(p.soldPrice) || 0), 0);

            return {
                team,
                squad: roster,
                totalSpent
            };
        });
    }, [teams, players, draftState.history, registrations, draftPickMap, customFields]);

    // Normalized teams + players for TeamPdfExportModal & TeamPhotoPdfExportModal
    const { exportTeams, exportPlayers } = useMemo(() => {
        const playerMap = new Map<string, Player>();
        players.forEach(p => playerMap.set(String(p.id), p));
        const mappedTeams = teamSquads.map(({ team, squad }) => {
            squad.forEach(sp => {
                playerMap.set(String(sp.id), {
                    ...(playerMap.get(String(sp.id)) || ({} as Player)),
                    ...sp,
                    status: 'SOLD',
                    soldTo: team.name
                });
            });
            return {
                ...team,
                players: compactTeamPlayersList(squad) as unknown as Player[]
            };
        });
        return {
            exportTeams: mappedTeams,
            exportPlayers: Array.from(playerMap.values())
        };
    }, [players, teamSquads]);

    // Global stats
    const totalSold = useMemo(() => {
        return players.filter(p => p.status === 'SOLD' || draftPickMap.has(String(p.id))).length;
    }, [players, draftPickMap]);

    // Category breakdown
    const categoryCounts = useMemo(() => {
        const map = new Map<string, number>();
        players.forEach(p => {
            const isSold = p.status === 'SOLD' || draftPickMap.has(String(p.id));
            if (isSold) {
                const cat = p.category || p.role || 'Player';
                map.set(cat, (map.get(cat) || 0) + 1);
            }
        });
        return Array.from(map.entries());
    }, [players, draftPickMap]);

    const buildExcelColumns = (): StyledExcelColumn[] => [
        { key: 'teamName', header: 'Team Name', align: 'left', minWidth: 18 },
        { key: 'pickNumber', header: 'Pick #', align: 'center', minWidth: 9 },
        { key: 'round', header: 'Round', align: 'center', minWidth: 9 },
        { key: 'playerNumber', header: 'Player #', align: 'center', minWidth: 11 },
        { key: 'name', header: 'Player Name', align: 'left', minWidth: 22 },
        { key: 'category', header: 'Category', align: 'center', minWidth: 14 },
        { key: 'role', header: 'Role', align: 'left', minWidth: 16 },
        { key: 'soldPrice', header: 'Sold Price', align: 'right', minWidth: 13 },
        { key: 'jerseyName', header: 'Jersey Name', align: 'left', minWidth: 18 },
        { key: 'jerseyNumber', header: 'Jersey No.', align: 'center', minWidth: 12 },
        { key: 'jerseySize', header: 'Jersey Size', align: 'center', minWidth: 12 },
        { key: 'mobile', header: 'Mobile Number', align: 'center', minWidth: 15 },
        { key: 'dob', header: 'DOB', align: 'center', minWidth: 13 },
        { key: 'gender', header: 'Gender', align: 'center', minWidth: 11 },
        ...customFields.map(cf => ({
            key: `cf_${cf.id}`,
            header: cf.label,
            align: 'left' as const,
            minWidth: 16
        }))
    ];

    const buildExcelRow = (team: Team, p: any, idx: number) => {
        const reg = findPlayerRegistration(p, registrations);
        const row: Record<string, any> = {
            teamName: team.name,
            pickNumber: p.pickNumber || (idx + 1),
            round: p.round || '-',
            playerNumber: getPlayerFieldValue(p, reg, 'playerNumber', '-'),
            name: p.name || '-',
            category: p.category || '-',
            role: p.role || p.speciality || '-',
            soldPrice: Number(p.soldPrice || 0),
            jerseyName: getPlayerFieldValue(p, reg, 'jerseyName', '-'),
            jerseyNumber: getPlayerFieldValue(p, reg, 'jerseyNumber', '-'),
            jerseySize: getPlayerFieldValue(p, reg, 'jerseySize', '-'),
            mobile: getPlayerFieldValue(p, reg, 'mobile', '-'),
            dob: getPlayerFieldValue(p, reg, 'dob', '-'),
            gender: getPlayerFieldValue(p, reg, 'gender', '-')
        };
        customFields.forEach(cf => {
            row[`cf_${cf.id}`] = getPlayerFieldValue(p, reg, cf.id, '-');
        });
        return row;
    };

    // Export Master Excel (Master Data sheet + Individual Team sheets) with SL No., Bold Yellow Headers, All Borders
    const handleExportMasterExcel = async () => {
        const columns = buildExcelColumns();
        const masterRows: any[] = [];
        const teamSheets: StyledExcelSheetSpec[] = [];

        teamSquads.forEach(({ team, squad }) => {
            const tRows: any[] = [];
            squad.forEach((p, idx) => {
                const row = buildExcelRow(team, p, idx);
                masterRows.push(row);
                tRows.push(row);
            });
            if (tRows.length > 0) {
                teamSheets.push({
                    sheetName: team.name,
                    columns,
                    rows: tRows,
                    includeSlNo: true
                });
            }
        });

        if (masterRows.length === 0) {
            alert('No drafted players to export.');
            return;
        }

        await downloadMultiSheetStyledExcel({
            fileName: `${tournamentName.replace(/\s+/g, '_')}_Master_Draft_Summary.xlsx`,
            sheets: [
                {
                    sheetName: 'Master Data',
                    columns,
                    rows: masterRows,
                    includeSlNo: true
                },
                ...teamSheets
            ]
        });
    };

    // Export Individual Team Excel with Jersey Details & Styling
    const handleExportTeamExcel = async (team: Team) => {
        const entry = teamSquads.find(ts => String(ts.team.id) === String(team.id));
        if (!entry || entry.squad.length === 0) {
            alert(`No drafted players found for ${team.name}.`);
            return;
        }
        const columns = buildExcelColumns();
        const rows = entry.squad.map((p, idx) => buildExcelRow(team, p, idx));
        await downloadStyledRegistrationExcel({
            fileName: `${team.name.replace(/\s+/g, '_')}_Squad_With_Jersey.xlsx`,
            sheetName: team.name,
            columns,
            rows,
            includeSlNo: true
        });
    };

    // Print summary
    const handlePrint = () => {
        window.print();
    };

    // Dynamic grid columns for all teams in summary
    const teamsGridCols = useMemo(() => {
        const count = teams.length;
        if (count <= 2) return 'grid-cols-2';
        if (count <= 4) return 'grid-cols-2 lg:grid-cols-4';
        if (count <= 6) return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6';
        if (count <= 8) return 'grid-cols-2 md:grid-cols-4';
        return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5';
    }, [teams.length]);

    return (
        <div className={`w-full h-full min-h-0 flex flex-col p-2 md:p-3 overflow-hidden select-none ${themeConfig.containerBg}`}>
            {/* Grand Header */}
            <div className={`shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-2xl border mb-2 shadow-2xl backdrop-blur-md ${themeConfig.headerBg} ${themeConfig.headerBorder}`}>
                {/* Left: Tournament Identity */}
                <div className="flex items-center gap-3">
                    {auctionLogoUrl ? (
                        <img src={auctionLogoUrl} alt="" className="w-10 h-10 rounded-xl object-contain bg-white p-1 border shadow" />
                    ) : systemLogoUrl ? (
                        <img src={systemLogoUrl} alt="" className="h-9 w-auto object-contain" />
                    ) : (
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black shadow">
                            <Trophy className="w-6 h-6" />
                        </div>
                    )}
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[9px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1 shadow-sm">
                                <Sparkles className="w-3 h-3 text-emerald-400 animate-spin" /> AUCTION COMPLETED
                            </span>
                            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                                Official Summary
                            </span>
                        </div>
                        <h1 className="text-base md:text-xl font-black uppercase italic tracking-tight text-white drop-shadow">
                            {tournamentName}
                        </h1>
                    </div>
                </div>

                {/* Center / Right: Global Metrics & Admin Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Metrics Badges */}
                    <div className="hidden sm:flex items-center gap-2">
                        <div className="px-3 py-1 rounded-xl bg-black/60 border border-white/10 text-center">
                            <p className="text-[7px] font-bold text-zinc-400 uppercase tracking-wider">Players Drafted</p>
                            <p className="text-sm font-black text-emerald-400">{totalSold} / {players.length}</p>
                        </div>
                        <div className="px-3 py-1 rounded-xl bg-black/60 border border-white/10 text-center">
                            <p className="text-[7px] font-bold text-zinc-400 uppercase tracking-wider">Franchises</p>
                            <p className="text-sm font-black text-amber-400">{teams.length}</p>
                        </div>
                    </div>

                    {/* Admin Action Buttons (Hidden on Projector & OBS for clean broadcast) */}
                    {!isProjectorView && !isOBSView && isAdmin && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <button
                                onClick={handleExportMasterExcel}
                                className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
                                title="Download Master Data + Team Sheets Excel with Jersey Details"
                            >
                                <FileSpreadsheet className="w-3.5 h-3.5" /> Master Excel
                            </button>
                            <button
                                onClick={() => setShowExportHubModal(true)}
                                className="py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
                                title="Select specific fields, specific players, Styled Excel or Registration-style PDF"
                            >
                                <SlidersHorizontal className="w-3.5 h-3.5" /> Export Hub
                            </button>
                            <button
                                onClick={() => { setPdfTargetTeamId('ALL'); setShowPdfModal(true); }}
                                className="py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
                                title="Download Master or Team PDF with Jersey Name, Number, Size & Custom Fields"
                            >
                                <FileText className="w-3.5 h-3.5" /> PDF (Master / Team)
                            </button>
                            <button
                                onClick={() => { setPdfTargetTeamId('ALL'); setShowPhotoPdfModal(true); }}
                                className="py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
                                title="Download Photo Cards PDF with Player Photos and Jersey Specs"
                            >
                                <ImageIcon className="w-3.5 h-3.5" /> Photo PDF
                            </button>
                            <button
                                onClick={handlePrint}
                                className="py-2 px-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                                title="Print Summary Document"
                            >
                                <Printer className="w-3.5 h-3.5" />
                            </button>
                            {onReopenDraft && (
                                <button
                                    onClick={onReopenDraft}
                                    className="py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5 active:scale-95 transition-all"
                                    title="Reopen Draft Auction to make more picks"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" /> Reopen Draft
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Category Summary Bar */}
            {categoryCounts.length > 0 && (
                <div className="shrink-0 flex items-center gap-2 mb-2 px-3 py-1.5 rounded-xl bg-zinc-950/80 border border-white/10 overflow-x-auto custom-scrollbar">
                    <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 shrink-0">
                        Category Draft Counts:
                    </span>
                    {categoryCounts.map(([catName, count]) => (
                        <div key={catName} className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-black/60 border border-white/10 text-[9px] font-bold text-white shrink-0">
                            <span className="text-amber-400 font-black">{catName}:</span>
                            <span className="text-emerald-400 font-black">{count}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Team Squads Grid (Consumes 100% Height with Zero Scrolling on Projector) */}
            <div className={`grid ${teamsGridCols} auto-rows-fr gap-2 flex-1 min-h-0 w-full overflow-hidden`}>
                {teamSquads.map(({ team, squad, totalSpent }) => {
                    return (
                        <div 
                            key={team.id}
                            className={`h-full min-h-0 flex flex-col rounded-2xl border-2 p-2 overflow-hidden shadow-2xl ${themeConfig.cardBg} ${themeConfig.cardBorder}`}
                        >
                            {/* Team Header */}
                            <div className="shrink-0 flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/10 gap-1">
                                <div className="flex items-center gap-2 min-w-0 pr-1">
                                    {team.logoUrl ? (
                                        <img 
                                            src={team.logoUrl} 
                                            alt={team.name} 
                                            className="w-8 h-8 rounded-full object-contain bg-white p-0.5 border-2 border-amber-400/80 shrink-0 shadow-md" 
                                        />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0 border border-amber-400">
                                            {team.name.charAt(0)}
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <h3 className="font-black uppercase tracking-tight text-white text-xs md:text-sm truncate drop-shadow">
                                            {team.name}
                                        </h3>
                                        <div className="flex items-center gap-1.5 text-[8px] font-bold text-amber-400 uppercase">
                                            <span>{squad.length} Drafted</span>
                                            {totalSpent > 0 && <span>• ₹{totalSpent.toLocaleString()}</span>}
                                        </div>
                                    </div>
                                </div>

                                {!isProjectorView && !isOBSView && isAdmin && (
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => handleExportTeamExcel(team)}
                                            className="px-1.5 py-1 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white text-[8px] font-black uppercase tracking-wider flex items-center gap-0.5 shadow-xs"
                                            title={`Export ${team.name} Excel with Jersey Details`}
                                        >
                                            <Download className="w-2.5 h-2.5" /> XLS
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setPdfTargetTeamId(team.id); setShowPdfModal(true); }}
                                            className="px-1.5 py-1 rounded-lg bg-blue-600/90 hover:bg-blue-500 text-white text-[8px] font-black uppercase tracking-wider flex items-center gap-0.5 shadow-xs"
                                            title={`Export ${team.name} PDF with Jersey Details`}
                                        >
                                            <FileText className="w-2.5 h-2.5" /> PDF
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Squad Roster Body (Fits 100% Height) */}
                            <div className="flex-1 min-h-0 flex flex-col justify-start gap-1 overflow-hidden">
                                {squad.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-zinc-600 text-center p-2 border border-dashed border-zinc-800/80 rounded-xl">
                                        <p className="text-[10px] font-black uppercase text-zinc-500">No Draft Picks</p>
                                    </div>
                                ) : (
                                    squad.map((player, idx) => (
                                        <div 
                                            key={player.id}
                                            className="flex-1 min-h-[26px] max-h-[40px] flex items-center justify-between px-2 py-0.5 rounded-lg bg-zinc-950/90 border border-white/[0.08] overflow-hidden"
                                        >
                                            <div className="flex items-center gap-1.5 min-w-0 pr-1">
                                                {!hideNumbers && (
                                                    <span className="text-[8px] font-bold text-zinc-500 w-3.5 shrink-0">
                                                        #{idx + 1}
                                                    </span>
                                                )}
                                                {player.photoUrl ? (
                                                    <img 
                                                        src={player.photoUrl} 
                                                        alt="" 
                                                        className="w-5 h-5 rounded-md object-cover border border-zinc-700 shrink-0" 
                                                    />
                                                ) : (
                                                    <div className="w-5 h-5 rounded-md bg-zinc-800 text-zinc-400 font-black text-[9px] flex items-center justify-center shrink-0">
                                                        {player.name.charAt(0)}
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <p className="font-black uppercase text-white text-[10px] md:text-xs truncate leading-tight drop-shadow">
                                                        {player.name}
                                                    </p>
                                                </div>
                                            </div>

                                            <span className="text-[8px] font-bold text-amber-400 uppercase px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/20 shrink-0">
                                                {player.role || player.category}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {!isProjectorView && !isOBSView && isAdmin && (
                <>
                    <TeamPdfExportModal
                        isOpen={showPdfModal}
                        onClose={() => setShowPdfModal(false)}
                        teams={exportTeams}
                        allPlayers={exportPlayers}
                        initialTeamId={pdfTargetTeamId}
                        tournamentName={tournamentName}
                        registrations={registrations}
                        registrationConfig={registrationConfig}
                        systemLogoUrl={systemLogoUrl}
                    />
                    <TeamPhotoPdfExportModal
                        isOpen={showPhotoPdfModal}
                        onClose={() => setShowPhotoPdfModal(false)}
                        teams={exportTeams}
                        allPlayers={exportPlayers}
                        initialTeamId={pdfTargetTeamId}
                        tournamentName={tournamentName}
                        registrations={registrations}
                        registrationConfig={registrationConfig}
                        systemLogoUrl={systemLogoUrl}
                    />
                    {showExportHubModal && (
                        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
                            <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-[2rem] shadow-2xl custom-scrollbar">
                                <SummaryExportHub
                                    teams={teams}
                                    players={players}
                                    registrations={registrations}
                                    registrationConfig={registrationConfig}
                                    auctionTitle={tournamentName}
                                    auctionLogoUrl={auctionLogoUrl}
                                    systemBranding={{
                                        logo: systemLogoUrl || '',
                                        tagline: 'Your streaming partner'
                                    }}
                                    draftHistory={draftState.history || []}
                                    draftPickMap={draftPickMap}
                                    isDark={true}
                                    defaultExpanded={true}
                                    onClose={() => setShowExportHubModal(false)}
                                />
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default DraftAuctionSummary;
