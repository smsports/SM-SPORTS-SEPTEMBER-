
import React, { useState } from 'react';
import { useAuction } from '../hooks/useAuction';
import { Team, UserRole } from '../types';
import { Download, Trophy, Users, Wallet, ArrowLeft, Eye, X, RefreshCw, AlertOctagon, ChevronDown, ChevronUp, FileSpreadsheet, Sparkles, FileText, Image as ImageIcon, Shield, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TeamPostAuctionView from './TeamPostAuctionView';
import TeamPosterModal from './TeamPosterModal';
import TeamPdfExportModal from './TeamPdfExportModal';
import TeamPhotoPdfExportModal from './TeamPhotoPdfExportModal';
import AuctionAwardsModal from './AuctionAwardsModal';
import { SummaryExportHub } from './SummaryExportHub';
import { resolveTeamSquad, findPlayerRegistration, getPlayerFieldValue } from '../utils';
import { downloadMultiSheetStyledExcel, downloadStyledRegistrationExcel, StyledExcelColumn, StyledExcelSheetSpec } from '../utils/styledExcelExport';

const AdminPostAuctionView: React.FC = () => {
    const { state, userProfile, resetAuction } = useAuction();
    const navigate = useNavigate();
    const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
    const [isResetting, setIsResetting] = useState(false);
    const [showExportOptions, setShowExportOptions] = useState(false);
    const [showPosterModal, setShowPosterModal] = useState(false);
    const [showPdfModal, setShowPdfModal] = useState(false);
    const [showPhotoPdfModal, setShowPhotoPdfModal] = useState(false);
    const [showAwardsModal, setShowAwardsModal] = useState(false);
    const [modalTeamId, setModalTeamId] = useState<string | number | undefined>(undefined);

    const isAdmin = userProfile?.role === UserRole.ADMIN || userProfile?.role === UserRole.SUPER_ADMIN;

    // Define Fields for Export (including Jersey Details)
    const basicFields = [
        { id: 'playerNumber', label: 'Player Number' },
        { id: 'name', label: 'Player Name' },
        { id: 'category', label: 'Category' },
        { id: 'role', label: 'Role' },
        { id: 'soldPrice', label: 'Sold Price' },
        { id: 'teamName', label: 'Team Name' },
        { id: 'jerseyName', label: 'Jersey Name' },
        { id: 'jerseyNumber', label: 'Jersey Number' },
        { id: 'jerseySize', label: 'Jersey Size' },
        { id: 'mobile', label: 'Mobile' },
        { id: 'dob', label: 'DOB' },
        { id: 'gender', label: 'Gender' },
        { id: 'playerType', label: 'Player Type (Reg)' },
    ];

    const customFields = state.registrationConfig?.customFields || [];
    const allFieldOptions = [
        ...basicFields,
        ...customFields.map(f => ({ id: f.id, label: f.label }))
    ];

    const [selectedFieldIds] = useState<string[]>([
        'playerNumber', 'name', 'category', 'role', 'soldPrice', 'teamName',
        'jerseyName', 'jerseyNumber', 'jerseySize', 'mobile'
    ]);

    // Calculate Global Stats
    const totalSpent = state.teams.reduce((acc, team) => {
        const squad = resolveTeamSquad(team, state.players);
        return acc + squad.reduce((tSum, p) => tSum + (Number(p.soldPrice) || 0), 0);
    }, 0);

    const totalSoldPlayers = state.teams.reduce((acc, team) => {
        const squad = resolveTeamSquad(team, state.players);
        return acc + squad.length;
    }, 0);

    const buildStyledRow = (p: any, team: Team) => {
        const regData = findPlayerRegistration(p, state.registrations) as any;
        const row: Record<string, any> = {
            playerNumber: getPlayerFieldValue(p, regData, 'playerNumber', '-'),
            name: p.name || '-',
            category: p.category || '-',
            role: p.role || p.speciality || '-',
            soldPrice: Number(p.soldPrice || 0),
            teamName: team.name || '-',
            jerseyName: getPlayerFieldValue(p, regData, 'jerseyName', '-'),
            jerseyNumber: getPlayerFieldValue(p, regData, 'jerseyNumber', '-'),
            jerseySize: getPlayerFieldValue(p, regData, 'jerseySize', '-'),
            mobile: getPlayerFieldValue(p, regData, 'mobile', '-'),
            dob: getPlayerFieldValue(p, regData, 'dob', '-'),
            gender: getPlayerFieldValue(p, regData, 'gender', '-'),
            playerType: getPlayerFieldValue(p, regData, 'playerType', '-'),
        };

        customFields.forEach(cf => {
            row[`cf_${cf.id}`] = getPlayerFieldValue(p, regData, cf.id, '-');
        });

        return row;
    };

    const handleExport = async (teamOnly?: Team) => {
        const targetTeams = teamOnly ? [teamOnly] : state.teams;
        const columns: StyledExcelColumn[] = [];
        const addCol = (id: string, header: string, align: 'left' | 'center' | 'right' = 'left', minWidth = 14) => {
            if (selectedFieldIds.includes(id)) columns.push({ key: id, header, align, minWidth });
        };

        addCol('playerNumber', 'Player #', 'center', 11);
        addCol('name', 'Player Name', 'left', 22);
        addCol('category', 'Category', 'center', 14);
        addCol('role', 'Role', 'left', 16);
        addCol('soldPrice', 'Sold Price', 'right', 13);
        addCol('teamName', 'Team Name', 'left', 18);
        addCol('jerseyName', 'Jersey Name', 'left', 18);
        addCol('jerseyNumber', 'Jersey No.', 'center', 12);
        addCol('jerseySize', 'Jersey Size', 'center', 12);
        addCol('mobile', 'Mobile', 'center', 15);
        addCol('dob', 'DOB', 'center', 13);
        addCol('gender', 'Gender', 'center', 11);
        addCol('playerType', 'Player Type (Reg)', 'left', 16);
        customFields.forEach(cf => addCol(`cf_${cf.id}`, cf.label, 'left', 16));

        const masterRows: Record<string, any>[] = [];
        const teamSheets: StyledExcelSheetSpec[] = [];

        targetTeams.forEach(team => {
            const squad = resolveTeamSquad(team, state.players);
            const teamRows = squad.map(p => buildStyledRow(p, team));
            masterRows.push(...teamRows);
            if (!teamOnly && teamRows.length > 0) {
                teamSheets.push({
                    sheetName: team.name,
                    columns,
                    rows: teamRows,
                    includeSlNo: true,
                });
            }
        });

        if (masterRows.length === 0) {
            alert("No data to export.");
            return;
        }

        const fileName = teamOnly
            ? `${teamOnly.name.replace(/\s+/g, '_')}_Detailed_Squad.xlsx`
            : `MASTER_AUCTION_DATA_${new Date().toISOString().split('T')[0]}.xlsx`;

        if (teamOnly) {
            await downloadStyledRegistrationExcel({
                fileName,
                sheetName: teamOnly.name,
                columns,
                rows: masterRows,
                includeSlNo: true,
            });
        } else {
            await downloadMultiSheetStyledExcel({
                fileName,
                sheets: [
                    {
                        sheetName: 'Master Data',
                        columns,
                        rows: masterRows,
                        includeSlNo: true,
                    },
                    ...teamSheets,
                ],
            });
        }
    };

    const handleFullReset = async () => {
        if (!window.confirm("DANGER: Are you sure you want to RESET the entire auction? This will wipe all sales, reset budgets, and clear history. This cannot be undone.")) return;
        setIsResetting(true);
        try {
            await resetAuction();
        } catch (e) {
            console.error(e);
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-6xl">
            {/* Modal for viewing individual team details */}
            {selectedTeam && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-2xl overflow-y-auto relative shadow-2xl">
                        <button 
                            onClick={() => setSelectedTeam(null)}
                            className="absolute top-4 right-4 z-50 bg-white/20 hover:bg-red-500 hover:text-white text-gray-800 p-2 rounded-full transition-all backdrop-blur-md"
                        >
                            <X className="w-6 h-6" />
                        </button>
                        <div className="pt-10">
                             <TeamPostAuctionView team={selectedTeam} />
                        </div>
                    </div>
                </div>
            )}

            <button onClick={() => navigate(isAdmin ? '/admin' : '/')} className="mb-6 flex items-center text-gray-500 hover:text-blue-600 transition-colors">
                <ArrowLeft className="w-4 h-4 mr-2"/> {isAdmin ? 'Back to Dashboard' : 'Back to Home'}
            </button>

            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200 mb-8">
                {/* Header */}
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-8 text-white relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="inline-block bg-yellow-500/20 border border-yellow-500/30 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-yellow-400 mb-2">
                            Auction Completed
                        </div>
                        <h1 className="text-3xl font-bold mb-2">Auction Summary Report</h1>
                        <p className="text-gray-400 text-sm">Review final standings, statistics, and team performance.</p>
                    </div>
                    <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-white/5 to-transparent"></div>
                </div>

                {/* Global Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-200 border-b border-gray-200 bg-gray-50">
                    <div className="p-6 text-center">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Total Turnover</p>
                        <p className="text-3xl font-black text-green-600">{totalSpent}</p>
                    </div>
                    <div className="p-6 text-center">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Players Sold</p>
                        <p className="text-3xl font-black text-blue-600">{totalSoldPlayers}</p>
                    </div>
                    <div className="p-6 flex flex-col items-center justify-center gap-2">
                        {isAdmin ? (
                            <>
                                <div className="grid grid-cols-2 gap-2 w-full">
                                    <button 
                                        onClick={() => { setModalTeamId(undefined); setShowPosterModal(true); }}
                                        className="bg-amber-500 hover:bg-amber-400 text-black px-3 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-md flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                                    >
                                        <Sparkles className="w-4 h-4 mr-1.5 shrink-0" /> Posters
                                    </button>
                                    <button 
                                        onClick={() => { setModalTeamId('ALL'); setShowPdfModal(true); }}
                                        className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-md flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                                    >
                                        <FileText className="w-4 h-4 mr-1.5 shrink-0" /> Master PDF
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2 w-full">
                                    <button 
                                        onClick={() => handleExport()}
                                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl font-black text-[11px] uppercase tracking-wider shadow flex items-center justify-center transition-all active:scale-95"
                                    >
                                        <Download className="w-3.5 h-3.5 mr-1.5 shrink-0" /> Master Excel
                                    </button>
                                    <button 
                                        onClick={() => setShowExportOptions(!showExportOptions)}
                                        className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-xl font-bold text-[11px] uppercase tracking-wider shadow flex items-center justify-center transition-all"
                                    >
                                        <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 shrink-0" /> 
                                        {showExportOptions ? 'Hide Export Hub' : 'Export Hub'}
                                        {showExportOptions ? <ChevronUp className="w-3.5 h-3.5 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 ml-1" />}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="text-gray-400 text-sm italic">Master Export (Admin Only)</div>
                        )}
                    </div>
                </div>

                {/* Full Registration-Style Export Hub Panel */}
                {isAdmin && showExportOptions && (
                    <div className="p-4 sm:p-6 bg-zinc-50 border-b border-gray-200 animate-in fade-in slide-in-from-top-4 duration-300">
                        <SummaryExportHub
                            teams={state.teams}
                            players={state.players}
                            registrations={state.registrations}
                            registrationConfig={state.registrationConfig}
                            auctionTitle={state.tournamentName || 'Auction'}
                            auctionLogoUrl={(state as any).logoUrl}
                            systemBranding={{
                                logo: state.systemLogoUrl || '',
                                tagline: state.systemTagline || 'Your streaming partner'
                            }}
                            isDark={false}
                            defaultExpanded={true}
                        />
                    </div>
                )}
            </div>

            {/* Teams Grid */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h2 className="text-xl font-bold text-gray-800 flex items-center">
                    <Users className="w-5 h-5 mr-2 text-blue-600"/> Team Performance ({state.teams.length})
                </h2>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setShowAwardsModal(true)}
                        className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black px-4 py-2 rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition-all"
                    >
                        <Trophy className="w-4 h-4 stroke-[2.5]" /> Auction Awards &amp; Leaderboard
                    </button>
                    <button
                        onClick={() => { setModalTeamId(undefined); setShowPosterModal(true); }}
                        className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-black px-3.5 py-2 rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                    >
                        <Sparkles className="w-4 h-4 text-amber-600" /> Squad Posters (All Themes)
                    </button>
                    <button
                        onClick={() => { setModalTeamId('ALL'); setShowPdfModal(true); }}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-black px-3.5 py-2 rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                    >
                        <FileText className="w-4 h-4 text-blue-600" /> Team PDFs (Select Fields)
                    </button>
                    <button
                        onClick={() => { setModalTeamId('ALL'); setShowPhotoPdfModal(true); }}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-black px-3.5 py-2 rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                        title="Export printable PDF with player photos, jersey specifications, and complete roster details"
                    >
                        <ImageIcon className="w-4 h-4 text-emerald-600" /> Squad Photo Cards PDF
                    </button>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                {state.teams.map(team => {
                    const squad = resolveTeamSquad(team, state.players);
                    const teamSpent = squad.reduce((sum, p) => sum + (Number(p.soldPrice) || 0), 0);
                    const ownerName = team.ownerName || team.owner || '';
                    const isOwnerCaptain = team.isOwnerCaptain !== false && !team.captainName && !!ownerName;
                    const captainName = team.captainName || (isOwnerCaptain ? ownerName : '');

                    return (
                        <div key={team.id} className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow overflow-hidden flex flex-col">
                            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {team.logoUrl ? (
                                        <img src={team.logoUrl} className="w-10 h-10 rounded-full border border-gray-200 object-contain" alt={team.name}/>
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500 uppercase">
                                            {team.name.charAt(0)}
                                        </div>
                                    )}
                                    <div>
                                        <h3 className="font-bold text-gray-800 truncate max-w-[150px]">{team.name}</h3>
                                        {ownerName && (
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1 mt-0.5">
                                                <Shield className="w-2.5 h-2.5 text-amber-500" />
                                                <span>Owner: {ownerName}</span>
                                            </p>
                                        )}
                                        {captainName && (
                                            <p className="text-[10px] text-blue-600 font-black uppercase tracking-wider flex items-center gap-1 mt-0.5">
                                                <Crown className="w-2.5 h-2.5 text-amber-500" />
                                                <span>Captain: {captainName} (C)</span>
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600">{squad.length} Players</span>
                            </div>
                            
                            <div className="p-5 grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-gray-400 text-xs uppercase font-bold tracking-widest">Spent</p>
                                    <p className="font-black text-gray-800 text-lg">₹{teamSpent.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 text-xs uppercase font-bold tracking-widest">Remaining</p>
                                    <p className="font-black text-green-600 text-lg">₹{team.budget.toLocaleString()}</p>
                                </div>
                            </div>

                            <div className="mt-auto flex flex-col gap-2 p-4 bg-gray-50 border-t border-gray-100">
                                <div className="grid grid-cols-3 gap-1.5">
                                    <button 
                                        onClick={() => { setModalTeamId(team.id); setShowPosterModal(true); }}
                                        className="bg-amber-50 border border-amber-300 hover:bg-amber-500 hover:text-black text-amber-900 font-black py-2 rounded-lg transition-all flex items-center justify-center text-[9px] uppercase tracking-wider shadow-sm active:scale-95"
                                        title="Download Squad Poster in multiple themes"
                                    >
                                        <Sparkles className="w-3 h-3 mr-1 text-amber-600" /> Poster
                                    </button>
                                    <button 
                                        onClick={() => { setModalTeamId(team.id); setShowPdfModal(true); }}
                                        className="bg-blue-50 border border-blue-200 hover:bg-blue-600 hover:text-white text-blue-700 font-black py-2 rounded-lg transition-all flex items-center justify-center text-[9px] uppercase tracking-wider shadow-sm active:scale-95"
                                        title="Download customizable PDF with jersey & owner details"
                                    >
                                        <FileText className="w-3 h-3 mr-1" /> PDF
                                    </button>
                                    <button 
                                        onClick={() => { setModalTeamId(team.id); setShowPhotoPdfModal(true); }}
                                        className="bg-emerald-50 border border-emerald-300 hover:bg-emerald-600 hover:text-white text-emerald-800 font-black py-2 rounded-lg transition-all flex items-center justify-center text-[9px] uppercase tracking-wider shadow-sm active:scale-95"
                                        title="Download Photo Cards PDF with player photos and jersey details"
                                    >
                                        <ImageIcon className="w-3 h-3 mr-1 text-emerald-600" /> Photo PDF
                                    </button>
                                </div>

                                <button 
                                    onClick={() => setSelectedTeam({ ...team, players: squad })}
                                    className="w-full bg-white border border-gray-300 hover:border-blue-400 hover:text-blue-600 text-gray-600 font-bold py-2 rounded-lg transition-all flex items-center justify-center text-xs uppercase tracking-widest shadow-sm active:scale-95"
                                >
                                    <Eye className="w-4 h-4 mr-2" /> View Squad
                                </button>

                                {isAdmin && (
                                    <button 
                                        onClick={() => handleExport(team)}
                                        className="w-full bg-slate-100 hover:bg-slate-200 border border-gray-200 text-gray-600 font-bold py-1.5 rounded-lg transition-all flex items-center justify-center text-[10px] uppercase tracking-widest active:scale-95"
                                    >
                                        <Download className="w-3 h-3 mr-1.5" /> Export Excel
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* DANGER ZONE - ADMIN ONLY */}
            {isAdmin && (
                <div className="mt-12 border-t-2 border-red-100 pt-8">
                    <h3 className="text-red-700 font-bold uppercase tracking-wider text-sm mb-4 flex items-center">
                        <AlertOctagon className="w-4 h-4 mr-2" /> Danger Zone
                    </h3>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div>
                            <h4 className="font-bold text-red-800">Reset Entire Auction</h4>
                            <p className="text-sm text-red-600">This will wipe all sales data, reset team budgets, and set the auction status to 'Not Started'. This cannot be undone.</p>
                        </div>
                        <button 
                            onClick={handleFullReset}
                            disabled={isResetting}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg shadow transition-colors flex items-center whitespace-nowrap active:scale-95"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${isResetting ? 'animate-spin' : ''}`} />
                            {isResetting ? 'Resetting...' : 'Reset Auction'}
                        </button>
                    </div>
                </div>
            )}

            {/* Poster Generator Modal */}
            <TeamPosterModal
                isOpen={showPosterModal}
                onClose={() => setShowPosterModal(false)}
                teams={state.teams}
                allPlayers={state.players}
                initialTeamId={modalTeamId}
                tournamentName={state.tournamentName || 'Championship Tournament'}
                registrations={state.registrations}
                systemLogoUrl={state.systemLogoUrl}
            />

            {/* Team PDF Exporter Modal */}
            <TeamPdfExportModal
                isOpen={showPdfModal}
                onClose={() => setShowPdfModal(false)}
                teams={state.teams}
                allPlayers={state.players}
                initialTeamId={modalTeamId}
                tournamentName={state.tournamentName || 'Official Squad Roster'}
                registrations={state.registrations}
                registrationConfig={state.registrationConfig}
                systemLogoUrl={state.systemLogoUrl}
            />

            {/* Team Photo Cards PDF Exporter Modal */}
            <TeamPhotoPdfExportModal
                isOpen={showPhotoPdfModal}
                onClose={() => setShowPhotoPdfModal(false)}
                teams={state.teams}
                allPlayers={state.players}
                initialTeamId={modalTeamId}
                tournamentName={state.tournamentName || 'Official Squad Photo Dossier'}
                registrations={state.registrations}
                registrationConfig={state.registrationConfig}
                systemLogoUrl={state.systemLogoUrl}
            />

            {/* Auction Awards & Leaderboard Modal */}
            <AuctionAwardsModal
                isOpen={showAwardsModal}
                onClose={() => setShowAwardsModal(false)}
                teams={state.teams}
                allPlayers={state.players}
                tournamentName={state.tournamentName || 'Official Championship'}
                registrations={state.registrations}
                auctionLog={state.auctionLog}
                systemLogoUrl={state.systemLogoUrl}
            />
        </div>
    );
};

export default AdminPostAuctionView;
