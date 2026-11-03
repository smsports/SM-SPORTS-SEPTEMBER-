import React, { useState } from 'react';
import { Team } from '../types';
import { Download, Trophy, Users, Wallet, ArrowLeft, Sparkles, FileText, Shield, Crown, Image as ImageIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuction } from '../hooks/useAuction';
import TeamPosterModal from './TeamPosterModal';
import TeamPdfExportModal from './TeamPdfExportModal';
import TeamPhotoPdfExportModal from './TeamPhotoPdfExportModal';
import { resolveTeamSquad } from '../utils';

interface Props {
    team: Team;
}

const TeamPostAuctionView: React.FC<Props> = ({ team }) => {
    const navigate = useNavigate();
    const { state } = useAuction();
    const [showPosterModal, setShowPosterModal] = useState(false);
    const [showPdfModal, setShowPdfModal] = useState(false);
    const [showPhotoPdfModal, setShowPhotoPdfModal] = useState(false);

    // Resolve complete squad including directly assigned players
    const squadPlayers = resolveTeamSquad(team, state.players);

    const ownerName = team.ownerName || team.owner || '';
    const isOwnerCaptain = team.isOwnerCaptain !== false && !team.captainName && !!ownerName;
    const captainName = team.captainName || (isOwnerCaptain ? ownerName : '');

    const handleDownload = () => {
        // CSV Generation Logic
        const headers = ["Player Name", "Category", "Role", "Sold Price"];
        const rows = squadPlayers.map(p => [
            `"${p.name}"`, // Quote strings to handle commas
            `"${p.category}"`,
            `"${p.speciality || p.category}"`, 
            p.soldPrice || 0
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map(row => row.join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `${team.name.replace(/\s+/g, '_')}_Squad_List.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Calculate totals based on actual soldPrice in squad list
    const totalSpent = squadPlayers.reduce((sum, p) => sum + (Number(p.soldPrice) || 0), 0);

    return (
        <div className="container mx-auto p-2 md:p-8 max-w-6xl">
            
            <button onClick={() => navigate('/')} className="mb-4 md:mb-6 flex items-center text-gray-500 hover:text-blue-600 transition-colors text-sm md:text-base font-bold">
                <ArrowLeft className="w-4 h-4 mr-2"/> Back to Home
            </button>

            <div className="bg-white rounded-xl md:rounded-2xl shadow-xl md:shadow-2xl overflow-hidden border border-gray-200">
                {/* Header Banner */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 md:p-8 text-white flex flex-col md:flex-row justify-between items-center relative overflow-hidden text-center md:text-left">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none"></div>
                    
                    <div className="relative z-10 flex flex-col md:flex-row items-center gap-4 md:gap-6">
                        {team.logoUrl ? (
                            <img src={team.logoUrl} className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white p-2 border-4 border-white/20 shadow-xl object-contain"/>
                        ) : (
                            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-blue-600 flex items-center justify-center text-3xl md:text-4xl font-bold shadow-xl border-4 border-white/20">
                                {team.name.charAt(0)}
                            </div>
                        )}
                        <div>
                            <div className="inline-block bg-green-500/20 border border-green-500/30 px-3 py-1 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wider text-green-400 mb-2">
                                Auction Completed
                            </div>
                            <h1 className="text-2xl md:text-4xl font-black uppercase mb-1">{team.name}</h1>
                            {ownerName && (
                                <p className="text-amber-400 font-black text-xs md:text-sm uppercase tracking-wider flex items-center justify-center md:justify-start gap-1.5 mt-1">
                                    <Shield className="w-3.5 h-3.5" />
                                    <span>Owner: {ownerName}</span>
                                    {team.ownerPhone && <span className="text-slate-400 font-mono font-normal">• {team.ownerPhone}</span>}
                                </p>
                            )}
                            {captainName && (
                                <p className="text-blue-300 font-black text-xs md:text-sm uppercase tracking-wider flex items-center justify-center md:justify-start gap-1.5 mt-0.5">
                                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Team Captain: {captainName} (C)</span>
                                </p>
                            )}
                        </div>
                    </div>
                    
                    <div className="mt-6 md:mt-0 relative z-10">
                        <Trophy className="w-16 h-16 md:w-20 md:h-20 text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
                    </div>
                </div>

                {/* Statistics Grid - Compact on mobile */}
                <div className="grid grid-cols-3 gap-0 border-b border-gray-200 divide-x divide-gray-200 bg-gray-50">
                    <div className="p-3 md:p-6 flex flex-col items-center text-center">
                        <div className="bg-blue-100 p-2 md:p-3 rounded-full mb-2 md:mb-3 text-blue-600">
                            <Users className="w-4 h-4 md:w-6 md:h-6" />
                        </div>
                        <span className="text-gray-500 text-[10px] md:text-xs uppercase font-bold tracking-widest">Players</span>
                        <span className="text-lg md:text-3xl font-black text-gray-800 mt-1">{squadPlayers.length}</span>
                    </div>
                    <div className="p-3 md:p-6 flex flex-col items-center text-center">
                        <div className="bg-red-100 p-2 md:p-3 rounded-full mb-2 md:mb-3 text-red-600">
                            <Wallet className="w-4 h-4 md:w-6 md:h-6" />
                        </div>
                        <span className="text-gray-500 text-[10px] md:text-xs uppercase font-bold tracking-widest">Spent</span>
                        <span className="text-lg md:text-3xl font-black text-gray-800 mt-1">₹{totalSpent.toLocaleString()}</span>
                    </div>
                    <div className="p-3 md:p-6 flex flex-col items-center text-center">
                        <div className="bg-green-100 p-2 md:p-3 rounded-full mb-2 md:mb-3 text-green-600">
                            <Wallet className="w-4 h-4 md:w-6 md:h-6" />
                        </div>
                        <span className="text-gray-500 text-[10px] md:text-xs uppercase font-bold tracking-widest">Remaining</span>
                        <span className="text-lg md:text-3xl font-black text-green-600 mt-1">₹{Number(team.budget || 0).toLocaleString()}</span>
                    </div>
                </div>

                {/* Squad Table & Action Downloads */}
                <div className="p-4 md:p-8">
                    <div className="flex flex-col sm:flex-row justify-between items-center mb-4 md:mb-6 gap-3">
                        <h3 className="text-lg md:text-xl font-bold text-gray-800 border-l-4 border-blue-600 pl-3">
                            Purchased &amp; Assigned Players ({squadPlayers.length})
                        </h3>

                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                            <button
                                onClick={() => setShowPosterModal(true)}
                                className="flex-1 sm:flex-none bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black px-3.5 py-2 rounded-lg flex items-center justify-center font-black shadow-md transition-all active:scale-95 text-xs uppercase tracking-wider"
                            >
                                <Sparkles className="w-4 h-4 mr-1.5" /> Poster (Themes)
                            </button>
                            <button
                                onClick={() => setShowPdfModal(true)}
                                className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg flex items-center justify-center font-black shadow-md transition-all active:scale-95 text-xs uppercase tracking-wider"
                            >
                                <FileText className="w-4 h-4 mr-1.5" /> Squad PDF
                            </button>
                            <button
                                onClick={() => setShowPhotoPdfModal(true)}
                                className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg flex items-center justify-center font-black shadow-md transition-all active:scale-95 text-xs uppercase tracking-wider"
                                title="Download Photo Cards PDF with player photos, jersey info, and full details"
                            >
                                <ImageIcon className="w-4 h-4 mr-1.5" /> Photo PDF
                            </button>
                            <button 
                                onClick={handleDownload} 
                                className="flex-1 sm:flex-none bg-slate-700 hover:bg-slate-800 text-white px-3.5 py-2 rounded-lg flex items-center justify-center font-bold shadow-md transition-all active:scale-95 text-xs uppercase tracking-wider"
                            >
                                <Download className="w-4 h-4 mr-1.5" /> Excel
                            </button>
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm">
                        <table className="w-full text-left border-collapse min-w-[500px]">
                            <thead className="bg-gray-100 text-gray-500 text-xs uppercase font-bold tracking-wider">
                                <tr>
                                    <th className="p-3 md:p-4 border-b border-gray-200">#</th>
                                    <th className="p-3 md:p-4 border-b border-gray-200">Player Name</th>
                                    <th className="p-3 md:p-4 border-b border-gray-200">Role &amp; Category</th>
                                    <th className="p-3 md:p-4 border-b border-gray-200 text-right">Sold Price</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {squadPlayers.length > 0 ? squadPlayers.map((p, idx) => {
                                    const isPlayerCaptain = (captainName && p.name.trim().toLowerCase() === captainName.trim().toLowerCase()) || p.isCaptain;

                                    return (
                                        <tr key={p.id || idx} className="hover:bg-blue-50/50 transition-colors text-sm md:text-base">
                                            <td className="p-3 md:p-4 text-gray-400 font-mono">{String(idx + 1).padStart(2, '0')}</td>
                                            <td className="p-3 md:p-4">
                                                <div className="font-bold text-gray-800 flex items-center gap-2">
                                                    <span>{p.name}</span>
                                                    {isPlayerCaptain && (
                                                        <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-1.5 py-0.5 rounded border border-amber-300">
                                                            Captain (C)
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3 md:p-4">
                                                <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-md font-medium border border-gray-200 whitespace-nowrap">
                                                    {p.role || p.speciality || 'Player'} • {p.category || 'Standard'}
                                                </span>
                                            </td>
                                            <td className="p-3 md:p-4 text-right">
                                                <span className="font-mono font-bold text-green-700 text-base md:text-lg">
                                                    ₹{Number(p.soldPrice || p.basePrice || 0).toLocaleString()}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-gray-400 italic">
                                            No players were assigned to this team.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Poster Generator Modal */}
            <TeamPosterModal
                isOpen={showPosterModal}
                onClose={() => setShowPosterModal(false)}
                teams={[team]}
                allPlayers={state.players}
                initialTeamId={team.id}
                tournamentName={state.tournamentName || 'Championship Tournament'}
                registrations={state.registrations}
                systemLogoUrl={state.systemLogoUrl}
            />

            {/* Team PDF Exporter Modal */}
            <TeamPdfExportModal
                isOpen={showPdfModal}
                onClose={() => setShowPdfModal(false)}
                teams={[team]}
                allPlayers={state.players}
                initialTeamId={team.id}
                tournamentName={state.tournamentName || 'Official Squad Roster'}
                registrations={state.registrations}
                registrationConfig={state.registrationConfig}
                systemLogoUrl={state.systemLogoUrl}
            />

            {/* Team Photo Cards PDF Exporter Modal */}
            <TeamPhotoPdfExportModal
                isOpen={showPhotoPdfModal}
                onClose={() => setShowPhotoPdfModal(false)}
                teams={[team]}
                allPlayers={state.players}
                initialTeamId={team.id}
                tournamentName={state.tournamentName || 'Official Squad Photo Dossier'}
                registrations={state.registrations}
                registrationConfig={state.registrationConfig}
                systemLogoUrl={state.systemLogoUrl}
            />
        </div>
    );
};

export default TeamPostAuctionView;
