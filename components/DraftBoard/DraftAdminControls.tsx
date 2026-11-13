import React, { useState, useMemo, useEffect } from 'react';
import { DraftBoardState, Team, Player, DraftPickHistory, AuctionCategory, ObsDraftDisplayMode } from '../../types';
import { db } from '../../firebase';
import { uploadAudioOrFallback } from '../../utils';
import { previewAudioSound, stopCustomAudio } from '../../utils/draftAudio';
import { 
    Play, Pause, FastForward, Undo2, RotateCcw, AlertTriangle, 
    Clock, Settings, Shield, RefreshCw, ChevronRight, CheckCircle2,
    Users, Shuffle, ArrowRight, Monitor, Cast, ExternalLink, Copy, Check,
    LayoutGrid, Columns, Table as TableIcon, LayoutList, Eye, Filter,
    Trophy, Palette, Sparkles, Zap, Lock, Music, Upload, Volume2, Square,
    Trash2, Timer, Layers, EyeOff, Ban
} from 'lucide-react';
import { DRAFT_THEMES, DraftThemeKey, getDraftTheme } from '../../utils/draftThemes';

interface Props {
    draftState: DraftBoardState;
    teams: Team[];
    players: Player[];
    categories?: AuctionCategory[];
    auctionId: string;
    onStartNextRound: () => Promise<void>;
}

export const DraftAdminControls: React.FC<Props> = ({
    draftState,
    teams,
    players,
    categories = [],
    auctionId,
    onStartNextRound
}) => {
    const [confirmAction, setConfirmAction] = useState<{
        title: string;
        message: string;
        action: () => Promise<void>;
    } | null>(null);

    const [activeSection, setActiveSection] = useState<'MAIN' | 'SETTINGS'>('MAIN');
    const [isProcessing, setIsProcessing] = useState(false);
    const [copiedProjector, setCopiedProjector] = useState(false);
    const [copiedOBS, setCopiedOBS] = useState(false);
    const [uploadingSoundKey, setUploadingSoundKey] = useState<'sold' | 'timeup' | 'unsold' | null>(null);
    const [audioFeedback, setAudioFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
    const [customPopupSec, setCustomPopupSec] = useState<string>(String(draftState.soldPopupDurationSeconds ?? 5));
    const [unsoldPlayerId, setUnsoldPlayerId] = useState<string>('');

    useEffect(() => {
        if (draftState.soldPopupDurationSeconds !== undefined) {
            setCustomPopupSec(String(draftState.soldPopupDurationSeconds));
        }
    }, [draftState.soldPopupDurationSeconds]);

    const getBaseUrl = () => {
        const { protocol, host, pathname } = window.location;
        return `${protocol}//${host}${pathname.endsWith('/') ? pathname : pathname + '/'}`;
    };

    const handleCopyProjector = () => {
        const url = `${getBaseUrl()}#/projector/${auctionId}`;
        navigator.clipboard.writeText(url);
        setCopiedProjector(true);
        setTimeout(() => setCopiedProjector(false), 2000);
    };

    const handleOpenProjector = () => {
        window.open(`${getBaseUrl()}#/projector/${auctionId}`, '_blank');
    };

    const handleCopyOBS = () => {
        const url = `${getBaseUrl()}#/obs-overlay/${auctionId}`;
        navigator.clipboard.writeText(url);
        setCopiedOBS(true);
        setTimeout(() => setCopiedOBS(false), 2000);
    };

    const handleOpenOBS = () => {
        window.open(`${getBaseUrl()}#/obs-overlay/${auctionId}`, '_blank');
    };

    // Timer Duration Options
    const timerOptions = [15, 30, 45, 60, 90, 120];

    // Toggle timer running
    const handleToggleTimer = async () => {
        if (!auctionId) return;
        const newRunning = !draftState.isTimerRunning;
        await db.collection('auctions').doc(auctionId).update({
            'draftBoardState.isTimerRunning': newRunning,
            'draftBoardState.roundStatus': newRunning ? 'IN_PROGRESS' : 'PAUSED',
            'draftBoardState.updatedAt': Date.now()
        });
    };

    // Change Turn Timer duration
    const handleChangeTimerDuration = async (seconds: number) => {
        if (!auctionId) return;
        await db.collection('auctions').doc(auctionId).update({
            'draftBoardState.turnTimerSeconds': seconds,
            'draftBoardState.timerTimeRemaining': seconds,
            'draftBoardState.updatedAt': Date.now()
        });
    };

    // Reset Turn Timer to default duration
    const handleResetTimer = async () => {
        if (!auctionId) return;
        const defaultSec = Number(draftState.turnTimerSeconds || 45);
        await db.collection('auctions').doc(auctionId).update({
            'draftBoardState.timerTimeRemaining': defaultSec,
            'draftBoardState.isTimerRunning': true,
            'draftBoardState.roundStatus': 'IN_PROGRESS',
            'draftBoardState.updatedAt': Date.now()
        });
    };

    // Skip / Pass Current Team Turn
    const handleSkipTurn = async () => {
        if (!auctionId) return;
        const currentOrder = draftState.roundOrder && draftState.roundOrder.length > 0 
            ? draftState.roundOrder 
            : teams.map(t => t.id);

        const nextTurnIndex = draftState.currentTurnIndex + 1;
        const isRoundFinished = nextTurnIndex >= currentOrder.length;

        await db.collection('auctions').doc(auctionId).update(JSON.parse(JSON.stringify({
            'draftBoardState.currentTurnIndex': isRoundFinished ? currentOrder.length : nextTurnIndex,
            'draftBoardState.currentTeamId': isRoundFinished ? null : (currentOrder[nextTurnIndex] ?? null),
            'draftBoardState.roundStatus': isRoundFinished ? 'ROUND_COMPLETED' : 'IN_PROGRESS',
            'draftBoardState.timerTimeRemaining': draftState.turnTimerSeconds || 45,
            'draftBoardState.isTimerRunning': !isRoundFinished,
            'draftBoardState.updatedAt': Date.now()
        })));
    };

    // UNDO LAST PICK
    const handleUndoLastPick = async () => {
        const history = draftState.history || [];
        if (history.length === 0) return;

        const lastPick = history[history.length - 1];
        setIsProcessing(true);

        try {
            // 1. Revert player status to UNSOLD
            await db.collection('auctions').doc(auctionId).collection('players').doc(String(lastPick.playerId)).update({
                status: 'UNSOLD',
                soldTo: null,
                soldToId: null,
                teamId: null,
                soldPrice: null,
                soldAt: null
            });

            // 2. Refund team purse and remove player from squad
            const targetTeam = teams.find(t => String(t.id) === String(lastPick.teamId));
            if (targetTeam) {
                const refundedBudget = Number(targetTeam.budget || 0) + Number(lastPick.soldPrice || 0);
                const updatedSquad = (targetTeam.players || []).filter(p => String(p.id) !== String(lastPick.playerId));

                await db.collection('auctions').doc(auctionId).collection('teams').doc(String(targetTeam.id)).update({
                    budget: refundedBudget,
                    players: updatedSquad
                });
            }

            // 3. Step back the draft turn to this team
            const updatedHistory = history.slice(0, -1);
            const prevTurnIndex = Math.max(0, draftState.currentTurnIndex - 1);

            const cleanHistory = JSON.parse(JSON.stringify(updatedHistory));
            await db.collection('auctions').doc(auctionId).update(JSON.parse(JSON.stringify({
                'draftBoardState.history': cleanHistory,
                'draftBoardState.currentTurnIndex': prevTurnIndex,
                'draftBoardState.currentTeamId': lastPick.teamId || null,
                'draftBoardState.roundStatus': 'IN_PROGRESS',
                'draftBoardState.timerTimeRemaining': draftState.turnTimerSeconds || 45,
                'draftBoardState.isTimerRunning': false,
                'draftBoardState.updatedAt': Date.now()
            })));
        } catch (err: any) {
            alert(`Undo failed: ${err.message}`);
        } finally {
            setIsProcessing(false);
            setConfirmAction(null);
        }
    };

    // CANCEL / RESET CURRENT ROUND
    const handleResetCurrentRound = async () => {
        const currentRound = draftState.currentRound;
        const currentRoundPicks = (draftState.history || []).filter(h => h.round === currentRound);

        setIsProcessing(true);
        try {
            // Revert all picks in current round
            for (const pick of currentRoundPicks) {
                await db.collection('auctions').doc(auctionId).collection('players').doc(String(pick.playerId)).update({
                    status: 'UNSOLD',
                    soldTo: null,
                    soldToId: null,
                    teamId: null,
                    soldPrice: null,
                    soldAt: null
                });

                const t = teams.find(tm => String(tm.id) === String(pick.teamId));
                if (t) {
                    const refundedBudget = Number(t.budget || 0) + Number(pick.soldPrice || 0);
                    const updatedSquad = (t.players || []).filter(p => String(p.id) !== String(pick.playerId));
                    await db.collection('auctions').doc(auctionId).collection('teams').doc(String(t.id)).update({
                        budget: refundedBudget,
                        players: updatedSquad
                    });
                }
            }

            const remainingHistory = (draftState.history || []).filter(h => h.round !== currentRound);
            const firstTeamId = draftState.roundOrder && draftState.roundOrder.length > 0 ? draftState.roundOrder[0] : (teams[0]?.id || null);

            await db.collection('auctions').doc(auctionId).update(JSON.parse(JSON.stringify({
                'draftBoardState.history': JSON.parse(JSON.stringify(remainingHistory)),
                'draftBoardState.currentTurnIndex': 0,
                'draftBoardState.currentTeamId': firstTeamId || null,
                'draftBoardState.roundStatus': 'IDLE',
                'draftBoardState.timerTimeRemaining': draftState.turnTimerSeconds || 45,
                'draftBoardState.isTimerRunning': false,
                'draftBoardState.updatedAt': Date.now()
            })));
        } catch (err: any) {
            alert(`Reset round failed: ${err.message}`);
        } finally {
            setIsProcessing(false);
            setConfirmAction(null);
        }
    };

    // RESET FULL DRAFT
    const handleResetFullDraft = async () => {
        setIsProcessing(true);
        try {
            // Revert ALL draft-sold players back to UNSOLD
            const allDraftPicks = draftState.history || [];
            for (const pick of allDraftPicks) {
                await db.collection('auctions').doc(auctionId).collection('players').doc(String(pick.playerId)).update({
                    status: 'UNSOLD',
                    soldTo: null,
                    soldToId: null,
                    teamId: null,
                    soldPrice: null,
                    soldAt: null
                });
            }

            // Restore all team budgets and squad
            for (const t of teams) {
                // Calculate total spent in draft
                const spentInDraft = allDraftPicks.filter(p => String(p.teamId) === String(t.id)).reduce((sum, p) => sum + (p.soldPrice || 0), 0);
                const restoredBudget = Number(t.budget || 0) + spentInDraft;
                const draftPlayerIds = new Set(allDraftPicks.map(p => String(p.playerId)));
                const remainingSquad = (t.players || []).filter(p => !draftPlayerIds.has(String(p.id)));

                await db.collection('auctions').doc(auctionId).collection('teams').doc(String(t.id)).update({
                    budget: restoredBudget,
                    players: JSON.parse(JSON.stringify(remainingSquad))
                });
            }

            // Reset draft state to Round 1
            const firstTeamId = teams[0]?.id || null;
            await db.collection('auctions').doc(auctionId).update(JSON.parse(JSON.stringify({
                'draftBoardState.currentRound': 1,
                'draftBoardState.currentTurnIndex': 0,
                'draftBoardState.currentTeamId': firstTeamId || null,
                'draftBoardState.roundOrder': teams.map(t => t.id),
                'draftBoardState.roundStatus': 'IDLE',
                'draftBoardState.timerTimeRemaining': draftState.turnTimerSeconds || 45,
                'draftBoardState.isTimerRunning': false,
                'draftBoardState.history': [],
                'draftBoardState.updatedAt': Date.now()
            })));
        } catch (err: any) {
            alert(`Reset full draft failed: ${err.message}`);
        } finally {
            setIsProcessing(false);
            setConfirmAction(null);
        }
    };

    // Extract all unique categories present in tournament
    const availableCategories = useMemo(() => {
        const set = new Set<string>();
        (categories || []).forEach(c => {
            if (c.name) set.add(c.name);
        });
        players.forEach(p => {
            const cat = p.category || p.role;
            if (cat) set.add(cat);
        });
        return Array.from(set);
    }, [categories, players]);

    // Switch Projector & OBS View: Players Draft Board vs Team Squads vs Summary
    const handleSetBroadcastView = async (view: 'PLAYERS' | 'SQUADS' | 'SUMMARY') => {
        if (!auctionId) return;
        await db.collection('auctions').doc(auctionId).update({
            'draftBoardState.broadcastView': view,
            'draftBoardState.updatedAt': Date.now()
        }).catch(console.error);
    };

    // Switch Broadcast Theme across all screens
    const handleSetBroadcastTheme = async (themeKey: DraftThemeKey) => {
        if (!auctionId) return;
        await db.collection('auctions').doc(auctionId).update({
            'draftBoardState.broadcastTheme': themeKey,
            'draftBoardState.updatedAt': Date.now()
        }).catch(console.error);
    };

    // Complete Draft Auction and broadcast Summary page
    const handleCompleteAuction = async () => {
        if (!auctionId) return;
        setIsProcessing(true);
        try {
            await db.collection('auctions').doc(auctionId).update({
                status: 'FINISHED',
                'draftBoardState.roundStatus': 'COMPLETED',
                'draftBoardState.broadcastView': 'SUMMARY',
                'draftBoardState.isTimerRunning': false,
                'draftBoardState.updatedAt': Date.now()
            });
        } catch (err: any) {
            alert(`Failed to complete draft auction: ${err.message}`);
        } finally {
            setIsProcessing(false);
            setConfirmAction(null);
        }
    };

    // Reopen / Resume Draft Auction
    const handleReopenDraftAuction = async () => {
        if (!auctionId) return;
        setIsProcessing(true);
        try {
            await db.collection('auctions').doc(auctionId).update({
                status: 'ACTIVE',
                'draftBoardState.roundStatus': 'IN_PROGRESS',
                'draftBoardState.broadcastView': 'PLAYERS',
                'draftBoardState.updatedAt': Date.now()
            });
        } catch (err: any) {
            alert(`Failed to resume draft auction: ${err.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    // Switch Projector Layout Mode: ROWS, COLUMNS, GRID, TABLE
    const handleSetProjectorLayoutMode = async (mode: 'ROWS' | 'COLUMNS' | 'GRID' | 'TABLE') => {
        if (!auctionId) return;
        await db.collection('auctions').doc(auctionId).update({
            'draftBoardState.projectorLayoutMode': mode,
            'draftBoardState.updatedAt': Date.now()
        }).catch(console.error);
    };

    // Switch Category Broadcast Filter ("Show only necessary category")
    const handleSetBroadcastCategoryFilter = async (categoryName: string) => {
        if (!auctionId) return;
        await db.collection('auctions').doc(auctionId).update({
            'draftBoardState.broadcastCategoryFilter': categoryName,
            'draftBoardState.updatedAt': Date.now()
        }).catch(console.error);
    };

    // Switch Focused Team Squad
    const handleSetSelectedTeamSquad = async (teamId: string | number | 'ALL') => {
        if (!auctionId) return;
        await db.collection('auctions').doc(auctionId).update({
            'draftBoardState.selectedTeamSquadId': teamId,
            'draftBoardState.updatedAt': Date.now()
        }).catch(console.error);
    };

    // OBS Overlay Display Controls (Video-safe minimal overlays)
    const handleSetObsDisplayMode = async (mode: ObsDraftDisplayMode) => {
        if (!auctionId) return;
        await db.collection('auctions').doc(auctionId).update({
            'draftBoardState.obsDisplayMode': mode,
            'draftBoardState.updatedAt': Date.now()
        }).catch(console.error);
    };

    const handleSetObsCategoryFilter = async (categoryName: string) => {
        if (!auctionId) return;
        await db.collection('auctions').doc(auctionId).update({
            'draftBoardState.obsCategoryFilter': categoryName,
            'draftBoardState.updatedAt': Date.now()
        }).catch(console.error);
    };

    const handleToggleObsTransparent = async () => {
        if (!auctionId) return;
        await db.collection('auctions').doc(auctionId).update({
            'draftBoardState.obsTransparentBg': !draftState.obsTransparentBg,
            'draftBoardState.updatedAt': Date.now()
        }).catch(console.error);
    };

    // Sold Popup Duration Control (0 = Off, else seconds)
    const handleSetSoldPopupDuration = async (seconds: number) => {
        if (!auctionId) return;
        const clamped = Math.max(0, Math.min(60, Math.round(seconds)));
        setCustomPopupSec(String(clamped));
        await db.collection('auctions').doc(auctionId).update({
            'draftBoardState.soldPopupDurationSeconds': clamped,
            soldPopupDurationSeconds: clamped,
            'draftBoardState.updatedAt': Date.now()
        }).catch(console.error);
    };

    // Upload Custom Audio (Sold / Time Up / Unsold)
    const handleUploadCustomAudio = async (soundKey: 'sold' | 'timeup' | 'unsold', file: File) => {
        if (!auctionId || !file) return;
        setUploadingSoundKey(soundKey);
        setAudioFeedback(null);
        try {
            const url = await uploadAudioOrFallback(file, auctionId, soundKey);
            const urlField = soundKey === 'sold' ? 'soldMusicUrl' : soundKey === 'timeup' ? 'timeUpMusicUrl' : 'unsoldMusicUrl';
            const nameField = soundKey === 'sold' ? 'soldMusicName' : soundKey === 'timeup' ? 'timeUpMusicName' : 'unsoldMusicName';

            const updateData: Record<string, any> = {
                [`draftBoardState.customAudio.${urlField}`]: url,
                [`draftBoardState.customAudio.${nameField}`]: file.name,
                'draftBoardState.updatedAt': Date.now()
            };
            // Avoid duplicating large inline data URLs onto root customAudio to protect 1 MiB limit
            if (!url.startsWith('data:')) {
                updateData[`customAudio.${urlField}`] = url;
                updateData[`customAudio.${nameField}`] = file.name;
            } else {
                updateData[`customAudio.${urlField}`] = '';
                updateData[`customAudio.${nameField}`] = '';
            }

            await db.collection('auctions').doc(auctionId).update(updateData);
            setAudioFeedback({ type: 'success', text: `Uploaded "${file.name}" for ${soundKey.toUpperCase()}!` });
        } catch (err: any) {
            console.error('Failed to upload custom audio:', err);
            setAudioFeedback({ type: 'error', text: err?.message || 'Audio upload failed.' });
        } finally {
            setUploadingSoundKey(null);
        }
    };

    // Clear Custom Audio back to default synthesized sound
    const handleClearCustomAudio = async (soundKey: 'sold' | 'timeup' | 'unsold') => {
        if (!auctionId) return;
        setAudioFeedback(null);
        const urlField = soundKey === 'sold' ? 'soldMusicUrl' : soundKey === 'timeup' ? 'timeUpMusicUrl' : 'unsoldMusicUrl';
        const nameField = soundKey === 'sold' ? 'soldMusicName' : soundKey === 'timeup' ? 'timeUpMusicName' : 'unsoldMusicName';
        await db.collection('auctions').doc(auctionId).update({
            [`draftBoardState.customAudio.${urlField}`]: '',
            [`draftBoardState.customAudio.${nameField}`]: '',
            [`customAudio.${urlField}`]: '',
            [`customAudio.${nameField}`]: '',
            'draftBoardState.updatedAt': Date.now()
        }).catch(console.error);
        setAudioFeedback({ type: 'success', text: `Reset ${soundKey.toUpperCase()} sound to default.` });
    };

    // Trigger Unsold Event + Unsold Music across displays
    const handleTriggerUnsoldEvent = async () => {
        if (!auctionId) return;
        const selectedP = unsoldPlayerId ? players.find(p => String(p.id) === String(unsoldPlayerId)) : null;
        try {
            if (selectedP && selectedP.status !== 'SOLD') {
                await db.collection('auctions').doc(auctionId).collection('players').doc(String(selectedP.id)).update({
                    status: 'UNSOLD'
                }).catch(() => {});
            }
            await db.collection('auctions').doc(auctionId).update(JSON.parse(JSON.stringify({
                'draftBoardState.lastUnsoldEvent': {
                    playerId: selectedP?.id || '',
                    playerName: selectedP?.name || 'Lot Passed (Unsold)',
                    playerPhoto: selectedP?.photoUrl || '',
                    role: selectedP?.role || '',
                    category: selectedP?.category || '',
                    timestamp: Date.now()
                },
                'draftBoardState.updatedAt': Date.now()
            })));
            setAudioFeedback({ type: 'success', text: `Broadcast UNSOLD & played Unsold Music${selectedP ? ` for ${selectedP.name}` : ''}.` });
        } catch (err: any) {
            setAudioFeedback({ type: 'error', text: err?.message || 'Failed to trigger Unsold event.' });
        }
    };

    // 1. Check if all players in the pool are sold
    const allPlayersSold = useMemo(() => {
        if (!players || players.length === 0) return false;
        return players.every(p => {
            const isSoldInState = p.status === 'SOLD';
            const isSoldInHistory = (draftState.history || []).some(h => String(h.playerId) === String(p.id));
            return isSoldInState || isSoldInHistory;
        });
    }, [players, draftState.history]);

    // 2. Check if all squads are filled to capacity
    const allSquadsFilled = useMemo(() => {
        if (!teams || teams.length === 0) return false;
        let hasLimit = false;
        for (const t of teams) {
            const squadLimit = t.maxPlayers;
            if (squadLimit && squadLimit > 0) {
                hasLimit = true;
                const fromHistory = (draftState.history || []).filter(h => String(h.teamId) === String(t.id)).length;
                const fromSquad = (t.players || []).filter(p => !(draftState.history || []).some(h => String(h.playerId) === String(p.id))).length;
                const total = fromHistory + fromSquad;
                if (total < squadLimit) {
                    return false;
                }
            }
        }
        return hasLimit;
    }, [teams, draftState.history]);

    // Complete Option & Generate Summary is eligible ONLY after squads are filled OR all players are sold
    const isEligibleToComplete = allPlayersSold || allSquadsFilled || draftState.roundStatus === 'COMPLETED' || draftState.roundStatus === 'FINISHED';
    const totalSoldPlayers = players.filter(p => p.status === 'SOLD' || (draftState.history || []).some(h => String(h.playerId) === String(p.id))).length;

    return (
        <div className="space-y-4">
            {/* Header + Section Switcher */}
            <div className="space-y-3 border-b pb-3 border-zinc-800">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-blue-500" />
                        <div>
                            <h3 className="text-sm font-black uppercase text-white tracking-wider">
                                Draft Admin Controls
                            </h3>
                            <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">
                                {activeSection === 'MAIN'
                                    ? 'Round Selection • OBS • Projector'
                                    : 'Audio • Automation • Order • Reset'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Main Page vs Separate Settings Section Navigation */}
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-black/70 border border-zinc-800">
                    <button
                        type="button"
                        onClick={() => setActiveSection('MAIN')}
                        className={`py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                            activeSection === 'MAIN'
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                        <Monitor className="w-3.5 h-3.5" />
                        <span>Main Controls</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveSection('SETTINGS')}
                        className={`py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                            activeSection === 'SETTINGS'
                                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30'
                                : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                        <Settings className="w-3.5 h-3.5" />
                        <span>Settings</span>
                    </button>
                </div>
            </div>

            {activeSection === 'MAIN' ? (
                /* =====================================================================
                   MAIN PAGE: ONLY ROUND SELECTION, OBS SETTINGS, AND PROJECTOR SETTINGS
                   ===================================================================== */
                <div className="space-y-5">
                    {/* 1. ROUND SELECTION & TURN CONTROL */}
                    <div className="p-4 rounded-2xl border-2 border-amber-500/40 bg-gradient-to-b from-amber-950/25 to-zinc-900/90 space-y-3 shadow-xl">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                                <Clock className="w-4 h-4 text-amber-400" /> Round Selection
                            </h4>
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[9px] font-black uppercase">
                                Round {draftState.currentRound} • {draftState.roundStatus === 'IN_PROGRESS' ? 'Active' : draftState.roundStatus === 'ROUND_COMPLETED' ? 'Done' : 'Ready'}
                            </span>
                        </div>

                        {draftState.roundStatus === 'ROUND_COMPLETED' && (
                            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-900/50 via-indigo-900/40 to-zinc-900 border border-blue-500/50 text-center space-y-2">
                                <p className="text-[11px] font-black uppercase tracking-wider text-blue-300">
                                    🎉 Round {draftState.currentRound} Complete!
                                </p>
                                <button
                                    type="button"
                                    onClick={onStartNextRound}
                                    className="w-full py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-widest bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    <Play className="w-3.5 h-3.5 fill-white" /> Start Round {draftState.currentRound + 1}
                                </button>
                            </div>
                        )}

                        {/* Picking Team Selector */}
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                                <span>Player Picking Round For:</span>
                                <span className="text-amber-400 font-bold truncate max-w-[130px]">
                                    {draftState.targetPickingTeamId && draftState.targetPickingTeamId !== 'CURRENT_TURN'
                                        ? teams.find(t => String(t.id) === String(draftState.targetPickingTeamId))?.name || 'Selected Team'
                                        : teams.find(t => String(t.id) === String(draftState.currentTeamId))?.name || 'Turn Order'}
                                </span>
                            </label>
                            <select
                                value={String(draftState.targetPickingTeamId || 'CURRENT_TURN')}
                                onChange={async (e) => {
                                    const val = e.target.value;
                                    if (!auctionId) return;
                                    const updatePayload: any = {
                                        'draftBoardState.targetPickingTeamId': val,
                                        'draftBoardState.updatedAt': Date.now()
                                    };
                                    if (val !== 'CURRENT_TURN') {
                                        updatePayload['draftBoardState.currentTeamId'] = val;
                                    }
                                    await db.collection('auctions').doc(auctionId).update(updatePayload);
                                }}
                                className="w-full bg-black/80 border border-amber-500/40 rounded-xl px-3 py-2 text-xs font-black text-white focus:outline-none focus:border-amber-400 uppercase tracking-wide cursor-pointer shadow-inner"
                            >
                                <option value="CURRENT_TURN">
                                    🎯 Follow Turn Order ({teams.find(t => String(t.id) === String(draftState.currentTeamId))?.name || 'Round Order'})
                                </option>
                                {teams.map(t => (
                                    <option key={t.id} value={String(t.id)}>
                                        {t.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Turn Timer Controls */}
                        <div className="flex items-center gap-2 pt-1">
                            <button
                                type="button"
                                onClick={handleToggleTimer}
                                className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-md ${
                                    draftState.isTimerRunning
                                        ? 'bg-amber-500 text-black shadow-amber-500/20'
                                        : 'bg-emerald-600 text-white shadow-emerald-600/20 hover:bg-emerald-500'
                                }`}
                            >
                                {draftState.isTimerRunning ? (
                                    <><Pause className="w-3.5 h-3.5 fill-black" /> Pause</>
                                ) : (
                                    <><Play className="w-3.5 h-3.5 fill-white" /> Start</>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={handleResetTimer}
                                className="py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 flex items-center justify-center gap-1 transition-all active:scale-95 shadow-sm"
                                title="Reset Turn Timer to default duration"
                            >
                                <RotateCcw className="w-3.5 h-3.5" /> Reset
                            </button>

                            <button
                                type="button"
                                onClick={handleSkipTurn}
                                className="py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 flex items-center justify-center gap-1 transition-all active:scale-95"
                                title="Skip current team's turn"
                            >
                                <FastForward className="w-3.5 h-3.5" /> Skip
                            </button>
                        </div>

                        {draftState.timerTimeRemaining === 0 && (
                            <div className="p-3 rounded-xl bg-red-600/20 border-2 border-red-500/60 text-center space-y-2 animate-pulse">
                                <p className="text-xs font-black uppercase tracking-wider text-red-400 flex items-center justify-center gap-1.5">
                                    <Clock className="w-4 h-4 text-red-400" /> Time&apos;s Up! Turn Expired
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleResetTimer}
                                        className="flex-1 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-black shadow-md flex items-center justify-center gap-1"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" /> Reset
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            await db.collection('auctions').doc(auctionId).update({
                                                'draftBoardState.isTimerRunning': false,
                                                'draftBoardState.updatedAt': Date.now()
                                            });
                                        }}
                                        className="flex-1 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white shadow-md flex items-center justify-center gap-1"
                                    >
                                        <Check className="w-3.5 h-3.5 stroke-[3]" /> OK
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                            <span className="text-[9px] font-bold uppercase text-zinc-400">Turn Secs:</span>
                            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                                {timerOptions.map(sec => (
                                    <button
                                        key={sec}
                                        type="button"
                                        onClick={() => handleChangeTimerDuration(sec)}
                                        className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                                            draftState.turnTimerSeconds === sec
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                        }`}
                                    >
                                        {sec}s
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 2. OBS SETTINGS */}
                    <div className="p-4 rounded-2xl border-2 border-purple-500/40 bg-gradient-to-b from-purple-950/30 to-zinc-900/90 space-y-3 shadow-xl">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                                <Cast className="w-4 h-4 text-purple-400" /> OBS Settings
                            </h4>
                            <button
                                type="button"
                                onClick={handleToggleObsTransparent}
                                className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all ${
                                    draftState.obsTransparentBg || (draftState.obsDisplayMode && draftState.obsDisplayMode !== 'FULL_BOARD')
                                        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                                }`}
                                title="Keep background transparent so OBS video feed stays visible underneath"
                            >
                                {draftState.obsTransparentBg || (draftState.obsDisplayMode && draftState.obsDisplayMode !== 'FULL_BOARD')
                                    ? 'Transparent BG: ON'
                                    : 'Solid Theme BG'}
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                            {([
                                { id: 'CURRENT_TEAM_ONLY', label: 'Current Team Only', icon: Users },
                                { id: 'BOTTOM_CATEGORY_STRIP', label: 'Bottom Category', icon: Layers },
                                { id: 'TOP_HEADER_ONLY', label: 'Top Bar Only', icon: LayoutList },
                                { id: 'FULL_BOARD', label: 'Full Board', icon: LayoutGrid },
                                { id: 'HIDDEN', label: 'Popups Only (Clear)', icon: EyeOff }
                            ] as const).map(opt => {
                                const Icon = opt.icon;
                                const activeMode = draftState.obsDisplayMode || 'FULL_BOARD';
                                const isSelected = activeMode === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => handleSetObsDisplayMode(opt.id)}
                                        className={`py-2 px-2 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all border ${
                                            isSelected
                                                ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                                                : 'bg-zinc-900/90 text-zinc-400 border-zinc-800 hover:text-white'
                                        }`}
                                    >
                                        <Icon className="w-3.5 h-3.5 shrink-0" />
                                        <span className="truncate">{opt.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {(draftState.obsDisplayMode === 'BOTTOM_CATEGORY_STRIP') && (
                            <div className="space-y-1.5 pt-2 border-t border-white/10">
                                <label className="text-[9px] font-black uppercase tracking-wider text-purple-300 flex items-center justify-between">
                                    <span>Bottom Strip Category:</span>
                                    <span className="text-amber-400">{draftState.obsCategoryFilter || availableCategories[0] || 'Default'}</span>
                                </label>
                                <select
                                    value={draftState.obsCategoryFilter || availableCategories[0] || ''}
                                    onChange={(e) => handleSetObsCategoryFilter(e.target.value)}
                                    className="w-full bg-black/80 border border-purple-500/40 rounded-xl px-3 py-2 text-xs font-black text-white focus:outline-none focus:border-purple-400 uppercase"
                                >
                                    {availableCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                            <button
                                type="button"
                                onClick={handleOpenOBS}
                                className="p-2 rounded-xl border border-purple-500/40 bg-purple-600/20 hover:bg-purple-600 text-white font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                            >
                                <Cast className="w-3.5 h-3.5" /> Open OBS
                            </button>
                            <button
                                type="button"
                                onClick={handleCopyOBS}
                                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-95"
                            >
                                {copiedOBS ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                {copiedOBS ? 'Copied' : 'Copy OBS'}
                            </button>
                        </div>
                    </div>

                    {/* 3. PROJECTOR SETTINGS */}
                    <div className="p-4 rounded-2xl border-2 border-blue-500/40 bg-gradient-to-b from-blue-950/30 to-zinc-900/90 space-y-4 shadow-xl">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                                <Monitor className="w-4 h-4" /> Projector Settings
                            </h4>
                            <span className="text-[8px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Sync Active
                            </span>
                        </div>

                        {/* View Mode */}
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                                <span>Projector &amp; OBS View Mode:</span>
                                <span className="text-amber-400">
                                    {draftState.broadcastView === 'SQUADS' 
                                        ? 'Team Squads' 
                                        : draftState.broadcastView === 'SUMMARY' 
                                        ? 'Final Summary' 
                                        : 'Draft Board'}
                                </span>
                            </label>
                            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/60 border border-white/10">
                                <button
                                    type="button"
                                    onClick={() => handleSetBroadcastView('PLAYERS')}
                                    className={`py-2 px-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all ${
                                        draftState.broadcastView === 'PLAYERS' || !draftState.broadcastView
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    <LayoutGrid className="w-3 h-3" /> Draft Board
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSetBroadcastView('SQUADS')}
                                    className={`py-2 px-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all ${
                                        draftState.broadcastView === 'SQUADS'
                                            ? 'bg-amber-500 text-black shadow-md font-black'
                                            : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    <Users className="w-3 h-3" /> Squads
                                </button>
                                <button
                                    type="button"
                                    disabled={!isEligibleToComplete}
                                    onClick={() => isEligibleToComplete && handleSetBroadcastView('SUMMARY')}
                                    className={`py-2 px-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all ${
                                        draftState.broadcastView === 'SUMMARY'
                                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md font-black'
                                            : isEligibleToComplete
                                            ? 'text-zinc-400 hover:text-white'
                                            : 'text-zinc-600 opacity-40 cursor-not-allowed'
                                    }`}
                                    title={isEligibleToComplete ? 'Broadcast Summary Screen' : 'Summary unlocks once all squads are filled or all players are sold'}
                                >
                                    {isEligibleToComplete ? <Trophy className="w-3 h-3" /> : <Lock className="w-3 h-3 text-zinc-500" />} Summary
                                </button>
                            </div>
                        </div>

                        {/* Broadcast Theme */}
                        <div className="space-y-2 pt-2 border-t border-white/5">
                            <div className="flex items-center justify-between">
                                <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                                    <Palette className="w-3 h-3 text-purple-400" /> Broadcast Theme:
                                </label>
                                <span className="text-[9px] font-black text-amber-400 uppercase">
                                    {getDraftTheme(draftState.broadcastTheme).name}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-1.5">
                                {Object.values(DRAFT_THEMES).map(theme => {
                                    const isSelected = (draftState.broadcastTheme || 'DARK_OBSIDIAN') === theme.key;
                                    return (
                                        <button
                                            key={theme.key}
                                            type="button"
                                            onClick={() => handleSetBroadcastTheme(theme.key)}
                                            className={`p-2 rounded-xl border text-left transition-all flex flex-col justify-between gap-1 ${
                                                isSelected
                                                    ? 'bg-gradient-to-r from-purple-950/60 to-zinc-900 border-purple-500 shadow-md ring-1 ring-purple-500/50'
                                                    : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`w-3.5 h-3.5 rounded-full border ${theme.previewBorder} ${theme.previewBg} shadow-sm shrink-0`} />
                                                    <span className={`text-[9px] font-black uppercase tracking-tight truncate ${
                                                        isSelected ? 'text-white' : 'text-zinc-300'
                                                    }`}>
                                                        {theme.name}
                                                    </span>
                                                </div>
                                                {isSelected && (
                                                    <Check className="w-3 h-3 text-purple-400 shrink-0 stroke-[3]" />
                                                )}
                                            </div>
                                            <p className="text-[7.5px] text-zinc-500 truncate leading-none">
                                                {theme.description}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Layout Style / Category Filter OR Team Squad Showcase */}
                        {draftState.broadcastView !== 'SQUADS' && draftState.broadcastView !== 'SUMMARY' ? (
                            <>
                                <div className="space-y-1.5 pt-2 border-t border-white/5">
                                    <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                                        <span>Projector Layout Style:</span>
                                        <span className="text-amber-400 font-bold">{draftState.projectorLayoutMode || 'ROWS'}</span>
                                    </label>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => handleSetProjectorLayoutMode('ROWS')}
                                            className={`py-2 px-2 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all border ${
                                                (draftState.projectorLayoutMode || 'ROWS') === 'ROWS'
                                                    ? 'bg-amber-500 text-black border-amber-400 shadow-md font-black'
                                                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                                            }`}
                                        >
                                            <LayoutList className="w-3.5 h-3.5" /> Left Category Rows
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSetProjectorLayoutMode('COLUMNS')}
                                            className={`py-2 px-2 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all border ${
                                                draftState.projectorLayoutMode === 'COLUMNS'
                                                    ? 'bg-amber-500 text-black border-amber-400 shadow-md font-black'
                                                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                                            }`}
                                        >
                                            <Columns className="w-3.5 h-3.5" /> Category Columns
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSetProjectorLayoutMode('GRID')}
                                            className={`py-2 px-2 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all border ${
                                                draftState.projectorLayoutMode === 'GRID'
                                                    ? 'bg-amber-500 text-black border-amber-400 shadow-md font-black'
                                                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                                            }`}
                                        >
                                            <LayoutGrid className="w-3.5 h-3.5" /> Auto Grid
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSetProjectorLayoutMode('TABLE')}
                                            className={`py-2 px-2 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all border ${
                                                draftState.projectorLayoutMode === 'TABLE'
                                                    ? 'bg-amber-500 text-black border-amber-400 shadow-md font-black'
                                                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                                            }`}
                                        >
                                            <TableIcon className="w-3.5 h-3.5" /> Multi Table
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2 pt-2 border-t border-white/5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                                            <Filter className="w-3 h-3 text-amber-500" /> Necessary Category Filter:
                                        </label>
                                        <span className="text-[9px] font-black text-amber-400 uppercase">
                                            {draftState.broadcastCategoryFilter || 'ALL'}
                                        </span>
                                    </div>

                                    <div className="flex flex-wrap gap-1">
                                        <button
                                            type="button"
                                            onClick={() => handleSetBroadcastCategoryFilter('ALL')}
                                            className={`py-1 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border ${
                                                (!draftState.broadcastCategoryFilter || draftState.broadcastCategoryFilter === 'ALL')
                                                    ? 'bg-blue-600 text-white border-blue-400 shadow-sm'
                                                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                                            }`}
                                        >
                                            ★ All Categories ({players.length})
                                        </button>
                                        {availableCategories.map(cat => {
                                            const catCount = players.filter(p => (p.category || p.role || '').toLowerCase() === cat.toLowerCase()).length;
                                            const isSelected = draftState.broadcastCategoryFilter?.toLowerCase() === cat.toLowerCase();

                                            return (
                                                <button
                                                    key={cat}
                                                    type="button"
                                                    onClick={() => handleSetBroadcastCategoryFilter(cat)}
                                                    className={`py-1 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border ${
                                                        isSelected
                                                            ? 'bg-amber-500 text-black border-amber-400 shadow-sm font-black'
                                                            : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                                                    }`}
                                                >
                                                    {cat} ({catCount})
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-2 pt-2 border-t border-white/5">
                                <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                                    <span>Showcase Team on Big Screen:</span>
                                    <span className="text-amber-400">
                                        {draftState.selectedTeamSquadId && draftState.selectedTeamSquadId !== 'ALL'
                                            ? teams.find(t => String(t.id) === String(draftState.selectedTeamSquadId))?.name || 'Selected'
                                            : 'All Teams Overview'}
                                    </span>
                                </label>
                                <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto custom-scrollbar">
                                    <button
                                        type="button"
                                        onClick={() => handleSetSelectedTeamSquad('ALL')}
                                        className={`py-1 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border ${
                                            (!draftState.selectedTeamSquadId || draftState.selectedTeamSquadId === 'ALL')
                                                ? 'bg-amber-500 text-black border-amber-400 font-black shadow-sm'
                                                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                                        }`}
                                    >
                                        🏆 All Teams Overview
                                    </button>
                                    {teams.map(t => {
                                        const isSelected = String(draftState.selectedTeamSquadId) === String(t.id);
                                        return (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => handleSetSelectedTeamSquad(t.id)}
                                                className={`py-1 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border ${
                                                    isSelected
                                                        ? 'bg-amber-500 text-black border-amber-400 font-black shadow-sm'
                                                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                                                }`}
                                            >
                                                {t.logoUrl ? (
                                                    <img src={t.logoUrl} alt="" className="w-3.5 h-3.5 rounded-full object-contain bg-white" />
                                                ) : null}
                                                <span className="truncate max-w-[100px]">{t.name}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                            <button
                                type="button"
                                onClick={handleOpenProjector}
                                className="p-2 rounded-xl border border-blue-500/40 bg-blue-600/20 hover:bg-blue-600 text-white font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                            >
                                <Monitor className="w-3.5 h-3.5" /> Open Projector
                            </button>
                            <button
                                type="button"
                                onClick={handleCopyProjector}
                                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-95"
                            >
                                {copiedProjector ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                {copiedProjector ? 'Copied' : 'Copy Projector'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                /* =====================================================================
                   SEPARATE SETTINGS SECTION: ALL OTHER SETTINGS & ADMIN CONFIGURATION
                   ===================================================================== */
                <div className="space-y-5">
                    {/* 1. 1-CLICK AUTO-ALLOT MODE */}
                    <div className="p-4 rounded-2xl border-2 border-amber-500/40 bg-gradient-to-b from-amber-950/30 to-zinc-900/90 space-y-3 shadow-xl">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                                    <Zap className="w-4 h-4 text-amber-400" /> 1-Click Auto-Allot Mode
                                </h4>
                                <p className="text-[9px] text-zinc-400 mt-0.5">
                                    {draftState.autoAllotEnabled
                                        ? 'Clicking any player on the board instantly assigns them.'
                                        : 'Assign players directly without confirmation modals.'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={async () => {
                                    if (!auctionId) return;
                                    await db.collection('auctions').doc(auctionId).update({
                                        'draftBoardState.autoAllotEnabled': !draftState.autoAllotEnabled,
                                        'draftBoardState.updatedAt': Date.now()
                                    });
                                }}
                                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all shrink-0 ${
                                    draftState.autoAllotEnabled
                                        ? 'bg-amber-500 text-black shadow-md shadow-amber-500/30 font-black'
                                        : 'bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700'
                                }`}
                            >
                                <Zap className="w-3 h-3 fill-current" />
                                {draftState.autoAllotEnabled ? 'ACTIVE' : 'DISABLED'}
                            </button>
                        </div>
                    </div>

                    {/* 2. TEAM SELF-PICKING PERMISSION CONTROL */}
                    <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5 shadow-md">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                                    {draftState.teamPickingEnabled !== false ? (
                                        <Users className="w-4 h-4 text-emerald-400" />
                                    ) : (
                                        <Lock className="w-4 h-4 text-red-400" />
                                    )}
                                    Team Login Picking
                                </h4>
                                <p className="text-[9px] text-zinc-400 mt-0.5">
                                    {draftState.teamPickingEnabled !== false
                                        ? 'Captains can draft players during their turn'
                                        : 'Picking locked in team portal (Admin picks only)'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={async () => {
                                    if (!auctionId) return;
                                    const nextState = draftState.teamPickingEnabled === false ? true : false;
                                    await db.collection('auctions').doc(auctionId).update({
                                        'draftBoardState.teamPickingEnabled': nextState,
                                        'draftBoardState.updatedAt': Date.now()
                                    });
                                }}
                                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md active:scale-95 shrink-0 ${
                                    draftState.teamPickingEnabled !== false
                                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 border border-emerald-400'
                                        : 'bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/50'
                                }`}
                                title="Toggle whether teams can pick in their login portal"
                            >
                                {draftState.teamPickingEnabled !== false ? (
                                    <>
                                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                                        <span>ENABLED</span>
                                    </>
                                ) : (
                                    <>
                                        <Lock className="w-3.5 h-3.5" />
                                        <span>LOCKED</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* 3. SOLD POPUP TIMING & CUSTOM MUSIC (SOLD / TIME UP / UNSOLD) */}
                    <div className="p-4 rounded-2xl border-2 border-emerald-500/35 bg-gradient-to-b from-emerald-950/25 to-zinc-900/90 space-y-4 shadow-xl">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                                <Music className="w-4 h-4" /> Audio &amp; Sold Popup Timing
                            </h4>
                            <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                                {Number(draftState.soldPopupDurationSeconds ?? 5) === 0 ? 'Popup Off' : `${draftState.soldPopupDurationSeconds ?? 5}s Popup`}
                            </span>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                                <Timer className="w-3 h-3 text-amber-400" /> Sold Popup Display Time (Seconds):
                            </label>
                            <div className="flex flex-wrap gap-1">
                                {[0, 2, 3, 5, 8, 10, 15].map(sec => {
                                    const currentSec = Number(draftState.soldPopupDurationSeconds ?? 5);
                                    const active = currentSec === sec;
                                    return (
                                        <button
                                            key={sec}
                                            type="button"
                                            onClick={() => handleSetSoldPopupDuration(sec)}
                                            className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${
                                                active
                                                    ? 'bg-amber-500 text-black border-amber-400 shadow-sm'
                                                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                                            }`}
                                        >
                                            {sec === 0 ? 'Off' : `${sec}s`}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min={0}
                                    max={60}
                                    value={customPopupSec}
                                    onChange={(e) => setCustomPopupSec(e.target.value)}
                                    className="w-20 bg-black/70 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs font-black text-white focus:outline-none focus:border-amber-400"
                                />
                                <button
                                    type="button"
                                    onClick={() => handleSetSoldPopupDuration(Number(customPopupSec) || 0)}
                                    className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider"
                                >
                                    Set Sec
                                </button>
                                <span className="text-[9px] text-zinc-500">Applies to All Screens</span>
                            </div>
                        </div>

                        <div className="space-y-2.5 pt-2 border-t border-white/10">
                            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">
                                Upload Custom Event Music (MP3 / WAV / OGG):
                            </p>
                            {([
                                {
                                    key: 'sold' as const,
                                    label: 'Sold Music',
                                    url: draftState.customAudio?.soldMusicUrl,
                                    name: draftState.customAudio?.soldMusicName
                                },
                                {
                                    key: 'timeup' as const,
                                    label: 'Time Up Music',
                                    url: draftState.customAudio?.timeUpMusicUrl,
                                    name: draftState.customAudio?.timeUpMusicName
                                },
                                {
                                    key: 'unsold' as const,
                                    label: 'Unsold Music',
                                    url: draftState.customAudio?.unsoldMusicUrl,
                                    name: draftState.customAudio?.unsoldMusicName
                                }
                            ]).map(item => (
                                <div key={item.key} className="p-2.5 rounded-xl bg-black/50 border border-zinc-800 space-y-1.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black uppercase text-white">{item.label}</p>
                                            <p className="text-[8.5px] text-zinc-400 truncate max-w-[170px]">
                                                {item.name ? item.name : (item.url ? 'Custom audio uploaded' : 'Default Stadium Synth')}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => previewAudioSound(item.key, item.url)}
                                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-emerald-600 text-emerald-400 hover:text-white transition-all"
                                                title={`Play ${item.label}`}
                                            >
                                                <Volume2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => stopCustomAudio()}
                                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-all"
                                                title="Stop Audio"
                                            >
                                                <Square className="w-3 h-3" />
                                            </button>
                                            {item.url && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleClearCustomAudio(item.key)}
                                                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-600 text-red-400 hover:text-white transition-all"
                                                    title={`Reset ${item.label}`}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <label className={`w-full py-1.5 px-2.5 rounded-lg border border-dashed text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                                        uploadingSoundKey === item.key
                                            ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                                            : 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                                    }`}>
                                        <Upload className="w-3 h-3" />
                                        <span>{uploadingSoundKey === item.key ? 'Uploading...' : `Upload ${item.label}`}</span>
                                        <input
                                            type="file"
                                            accept="audio/*"
                                            disabled={uploadingSoundKey !== null}
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    handleUploadCustomAudio(item.key, file);
                                                    e.target.value = '';
                                                }
                                            }}
                                        />
                                    </label>
                                </div>
                            ))}
                        </div>

                        <div className="pt-2 border-t border-white/10 space-y-1.5">
                            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                                <Ban className="w-3 h-3 text-red-400" /> Broadcast Unsold &amp; Play Unsold Music:
                            </label>
                            <div className="flex items-center gap-1.5">
                                <select
                                    value={unsoldPlayerId}
                                    onChange={(e) => setUnsoldPlayerId(e.target.value)}
                                    className="flex-1 min-w-0 bg-black/70 border border-zinc-700 rounded-lg px-2 py-1.5 text-[10px] font-bold text-white focus:outline-none"
                                >
                                    <option value="">General Pass (No specific player)</option>
                                    {players.filter(p => p.status !== 'SOLD').map(p => (
                                        <option key={p.id} value={String(p.id)}>{p.name} ({p.category || p.role})</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={handleTriggerUnsoldEvent}
                                    className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[9px] font-black uppercase tracking-wider shrink-0 flex items-center gap-1"
                                >
                                    <Ban className="w-3 h-3" /> Unsold
                                </button>
                            </div>
                        </div>

                        {audioFeedback && (
                            <div className={`px-3 py-2 rounded-xl text-[10px] font-bold border ${
                                audioFeedback.type === 'error'
                                    ? 'bg-red-950/80 border-red-500/60 text-red-200'
                                    : 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200'
                            }`}>
                                {audioFeedback.text}
                            </div>
                        )}
                    </div>

                    {/* 4. DRAFT ORDER METHOD (SNAKE VS LINEAR) */}
                    <div className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                                <Shuffle className="w-3.5 h-3.5 text-blue-500" /> Draft Order Method
                            </h4>
                            <span className="text-[9px] font-black text-blue-400 uppercase">
                                {draftState.orderType || 'SNAKE'}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={async () => {
                                    await db.collection('auctions').doc(auctionId).update({
                                        'draftBoardState.orderType': 'SNAKE',
                                        'draftBoardState.updatedAt': Date.now()
                                    });
                                }}
                                className={`p-2.5 rounded-xl border text-center transition-all ${
                                    draftState.orderType === 'SNAKE'
                                        ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-black'
                                        : 'bg-zinc-800/60 border-zinc-700 text-zinc-400 font-bold'
                                }`}
                            >
                                <p className="text-[10px] uppercase">Snake Draft</p>
                                <p className="text-[8px] opacity-70">1&rarr;N then N&rarr;1</p>
                            </button>

                            <button
                                type="button"
                                onClick={async () => {
                                    await db.collection('auctions').doc(auctionId).update({
                                        'draftBoardState.orderType': 'LINEAR',
                                        'draftBoardState.updatedAt': Date.now()
                                    });
                                }}
                                className={`p-2.5 rounded-xl border text-center transition-all ${
                                    draftState.orderType === 'LINEAR'
                                        ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-black'
                                        : 'bg-zinc-800/60 border-zinc-700 text-zinc-400 font-bold'
                                }`}
                            >
                                <p className="text-[10px] uppercase">Linear Draft</p>
                                <p className="text-[8px] opacity-70">1&rarr;N each round</p>
                            </button>
                        </div>
                    </div>

                    {/* 5. COMPLETE AUCTION & FINAL SUMMARY */}
                    {isEligibleToComplete ? (
                        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/70 via-teal-950/50 to-zinc-900 border-2 border-emerald-500/50 space-y-3 shadow-xl">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                                    <Trophy className="w-4 h-4 text-emerald-400" /> Tournament Draft Conclusion
                                </h4>
                                <span className="text-[9px] font-black text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 rounded-full uppercase">
                                    {allPlayersSold ? 'All Players Sold' : 'All Squads Filled'}
                                </span>
                            </div>
                            <p className="text-[10px] text-zinc-300 leading-relaxed">
                                All squads are filled or all players have been sold! Click below to conclude the auction and broadcast the Final Summary celebration page with squads, stats, and Excel export.
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setConfirmAction({
                                            title: 'COMPLETE DRAFT AUCTION?',
                                            message: 'This will finish the tournament draft and display the Final Summary celebration screen on the Projector, OBS Overlay, and Admin dashboard.',
                                            action: handleCompleteAuction
                                        });
                                    }}
                                    className="flex-1 py-3 px-3 rounded-xl font-black text-xs uppercase tracking-wider bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 active:scale-95 transition-all"
                                >
                                    <Trophy className="w-4 h-4" /> Complete Auction &amp; View Summary
                                </button>
                                {(draftState.roundStatus === 'COMPLETED' || draftState.roundStatus === 'FINISHED' || draftState.broadcastView === 'SUMMARY') && (
                                    <button
                                        type="button"
                                        onClick={handleReopenDraftAuction}
                                        className="py-3 px-3 rounded-xl font-black text-xs uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-500/40 shadow-sm flex items-center justify-center gap-1 active:scale-95 transition-all"
                                        title="Reopen draft and continue drafting players"
                                    >
                                        <RefreshCw className="w-4 h-4" /> Resume Draft
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-bold">
                                <span className="text-zinc-400 flex items-center gap-1">
                                    <Lock className="w-3 h-3 text-amber-500" /> Complete Option &amp; Summary
                                </span>
                                <span className="text-amber-400 font-mono">
                                    {totalSoldPlayers}/{players.length} Sold
                                </span>
                            </div>
                            <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                <div 
                                    className="bg-gradient-to-r from-amber-500 to-yellow-400 h-full rounded-full transition-all duration-300"
                                    style={{ 
                                        width: `${Math.round((totalSoldPlayers / Math.max(1, players.length)) * 100)}%` 
                                    }}
                                />
                            </div>
                            <p className="text-[8.5px] text-zinc-500 uppercase tracking-wider leading-tight">
                                Complete option and generate summary will be visible only after squads are filled or all players are sold.
                            </p>
                        </div>
                    )}

                    {/* 6. SAFETY & ROLLBACK CONTROLS */}
                    <div className="space-y-2 pt-2 border-t border-zinc-800">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">
                            Safety &amp; Rollback Controls
                        </h4>

                        <button
                            type="button"
                            disabled={(draftState.history || []).length === 0 || isProcessing}
                            onClick={() => {
                                const lastPick = draftState.history[draftState.history.length - 1];
                                setConfirmAction({
                                    title: `Undo Last Pick: ${lastPick.playerName}?`,
                                    message: `This will mark ${lastPick.playerName} as UNSOLD, return them to the draft pool, and restore the turn to ${lastPick.teamName}.`,
                                    action: handleUndoLastPick
                                });
                            }}
                            className="w-full py-2.5 px-3 rounded-xl font-bold text-xs uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40"
                        >
                            <Undo2 className="w-4 h-4 text-amber-400" /> Undo Last Pick
                        </button>

                        <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => {
                                setConfirmAction({
                                    title: `Reset Round ${draftState.currentRound}?`,
                                    message: `This will revert ALL players drafted during Round ${draftState.currentRound} back to UNSOLD and restore them to the draft pool.`,
                                    action: handleResetCurrentRound
                                });
                            }}
                            className="w-full py-2.5 px-3 rounded-xl font-bold text-xs uppercase tracking-wider bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40"
                        >
                            <RotateCcw className="w-4 h-4" /> Reset Current Round
                        </button>

                        <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => {
                                setConfirmAction({
                                    title: 'RESET ENTIRE DRAFT AUCTION?',
                                    message: 'WARNING: This will reset all rounds, set all drafted players back to UNSOLD, and reset team squads. This cannot be undone.',
                                    action: handleResetFullDraft
                                });
                            }}
                            className="w-full py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40"
                        >
                            <AlertTriangle className="w-4 h-4" /> Reset Full Draft
                        </button>
                    </div>
                </div>
            )}

            {/* CONFIRMATION MODAL */}
            {confirmAction && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl text-center space-y-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center mx-auto">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                        <h3 className="text-base font-black uppercase text-white">
                            {confirmAction.title}
                        </h3>
                        <p className="text-xs text-zinc-400 font-medium leading-relaxed">
                            {confirmAction.message}
                        </p>
                        <div className="flex items-center gap-3 pt-2">
                            <button
                                onClick={() => setConfirmAction(null)}
                                className="flex-1 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 font-bold text-xs uppercase hover:bg-zinc-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmAction.action}
                                disabled={isProcessing}
                                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase shadow-lg shadow-red-600/30"
                            >
                                {isProcessing ? 'Processing...' : 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DraftAdminControls;
