import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuction } from '../../hooks/useAuction';
import { useTheme } from '../../contexts/ThemeContext';
import { Player, Team, AuctionCategory, DraftBoardState, DraftPickHistory, DraftCelebrationData } from '../../types';
import { db, auth } from '../../firebase';
import { 
    Users, Clock, Trophy, ChevronRight, CheckCircle2, AlertCircle, 
    Search, Filter, LayoutGrid, Table as TableIcon, Undo2, RotateCcw, 
    Play, Pause, FastForward, Check, X, Shield, Wallet, Sparkles, 
    Crown, Tag, Eye, ArrowRight, Gavel, RefreshCw, Monitor, Cast, Copy, ExternalLink,
    Volume2, VolumeX, Maximize, Minimize, Columns, Zap, Lock, Ban
} from 'lucide-react';
import DraftAdminControls from './DraftAdminControls';
import DraftNominationModal from './DraftNominationModal';
import DraftTableView from './DraftTableView';
import ProjectorFitBoard from './ProjectorFitBoard';
import ProjectorSquadsView from './ProjectorSquadsView';
import DraftAuctionSummary from './DraftAuctionSummary';
import TeamDraftDashboard from './TeamDraftDashboard';
import SoldCelebrationPopup from './SoldCelebrationPopup';
import { getDraftTheme } from '../../utils/draftThemes';
import confetti from 'canvas-confetti';
import { playCountdownTickSound, playHeartbeatSound, playTimeUpSound, playUnsoldSoundTrack, isDraftAudioMuted, setDraftAudioMuted, mergeCustomAudioConfig } from '../../utils/draftAudio';

interface Props {
    isAdmin?: boolean;
    isTeamOwner?: boolean;
    myTeam?: Team | null;
    isProjectorView?: boolean;
    isOBSView?: boolean;
    auctionId?: string;
}

export const CategoryDraftBoard: React.FC<Props> = ({
    isAdmin = false,
    isTeamOwner = false,
    myTeam = null,
    isProjectorView = false,
    isOBSView = false,
    auctionId: propAuctionId
}) => {
    const { state, userProfile, activeAuctionId, updateAuctionType } = useAuction();
    const { id: paramAuctionId } = useParams<{ id: string }>();
    const { theme } = useTheme();
    const isDark = theme === 'dark' || isProjectorView || isOBSView;

    const auctionId = propAuctionId || activeAuctionId || paramAuctionId || (state as any).id || (state as any).auctionId || localStorage.getItem('last_auction_id') || '';
    const players = state.players || [];
    const teams = state.teams || [];
    const categories = state.categories || [];
    const globalBasePrice = Number(state.basePrice || 100);

    // Initial draft board state fallback
    const draftState: DraftBoardState = useMemo(() => {
        if (state.draftBoardState) {
            return state.draftBoardState;
        }
        return {
            currentRound: 1,
            roundStatus: 'IDLE',
            currentTurnIndex: 0,
            currentTeamId: teams[0]?.id || null,
            turnTimerSeconds: 45,
            timerTimeRemaining: 45,
            isTimerRunning: false,
            roundOrder: teams.map(t => t.id),
            orderType: 'SNAKE',
            history: []
        };
    }, [state.draftBoardState, teams]);

    // View mode: Grid Matrix vs Table (Defaults to TABLE on Projector & OBS for full Fit-to-Page consumption)
    const [viewMode, setViewMode] = useState<'GRID' | 'TABLE'>(
        draftState.displayMode || (isProjectorView || isOBSView ? 'TABLE' : 'GRID')
    );
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'SOLD'>('ALL');

    // Audio & Time's Up Alert States
    const [isMuted, setIsMuted] = useState<boolean>(isDraftAudioMuted());
    const [isTimeUpDismissed, setIsTimeUpDismissed] = useState<boolean>(false);
    const prevSecondsRef = useRef<number>(draftState.timerTimeRemaining);
    const [pickError, setPickError] = useState<string | null>(null);
    const [activeUnsoldBanner, setActiveUnsoldBanner] = useState<{
        playerName: string;
        role?: string;
        category?: string;
        playerPhoto?: string;
        timestamp: number;
    } | null>(null);
    const prevUnsoldTsRef = useRef<number>(Number(draftState.lastUnsoldEvent?.timestamp || 0));

    const customAudio = mergeCustomAudioConfig(state.customAudio, draftState.customAudio);
    const soldPopupSeconds = Number(draftState.soldPopupDurationSeconds ?? state.soldPopupDurationSeconds ?? 5);
    const soldPopupDurationMs = Math.max(0, isNaN(soldPopupSeconds) ? 5 : soldPopupSeconds) * 1000;

    // Projector layout mode: 'COLUMNS' (Category columns side-by-side) | 'GRID' (Dynamic auto-fit grid) | 'TABLE' (Multi-pane table)
    const [projectorMode, setProjectorMode] = useState<'COLUMNS' | 'GRID' | 'TABLE'>('COLUMNS');
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

    const handleToggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
        } else {
            document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
        }
    };

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Sync viewMode from Firestore if Admin changes it
    useEffect(() => {
        if (draftState.displayMode) {
            setViewMode(draftState.displayMode);
        } else if (isProjectorView || isOBSView) {
            setViewMode('TABLE');
        }
    }, [draftState.displayMode, isProjectorView, isOBSView]);

    // Reset Time's Up dismissed flag whenever timer restarts or has positive time
    useEffect(() => {
        if (draftState.timerTimeRemaining > 0) {
            setIsTimeUpDismissed(false);
        }
    }, [draftState.timerTimeRemaining]);

    // Countdown Audio Effects: Heartbeat & Tik-tik during last 10s, Custom or 3-ring Buzzer at 0s
    useEffect(() => {
        const prevSec = prevSecondsRef.current;
        const currentSec = draftState.timerTimeRemaining;
        prevSecondsRef.current = currentSec;

        // Heartbeat & Tik-Tik sound in last 10s of active turn
        if (draftState.isTimerRunning && currentSec <= 10 && currentSec > 0 && currentSec !== prevSec) {
            playCountdownTickSound();
        }

        // Arena Time's Up sound (custom or 3-ring buzzer) immediately upon reaching 0s from a positive number
        if (currentSec === 0 && prevSec > 0) {
            playTimeUpSound(customAudio?.timeUpMusicUrl, 0.85);
        }
    }, [draftState.timerTimeRemaining, draftState.isTimerRunning, customAudio?.timeUpMusicUrl]);

    // Unsold Event Sound & Broadcast Toast Effect
    useEffect(() => {
        const ev = draftState.lastUnsoldEvent;
        if (!ev || !ev.timestamp) return;
        const ts = Number(ev.timestamp);
        if (ts <= prevUnsoldTsRef.current) return;
        prevUnsoldTsRef.current = ts;

        if (Date.now() - ts < 15000) {
            playUnsoldSoundTrack(customAudio?.unsoldMusicUrl, 0.85);
            setActiveUnsoldBanner(ev);
            const timer = setTimeout(() => {
                setActiveUnsoldBanner(null);
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [draftState.lastUnsoldEvent?.timestamp, customAudio?.unsoldMusicUrl]);

    // Reset Turn Timer handler
    const handleResetTimer = async () => {
        if (!auctionId) return;
        const defaultSec = Number(draftState.turnTimerSeconds || 45);
        setIsTimeUpDismissed(false);
        await db.collection('auctions').doc(auctionId).update({
            'draftBoardState.timerTimeRemaining': defaultSec,
            'draftBoardState.isTimerRunning': true,
            'draftBoardState.roundStatus': 'IN_PROGRESS',
            'draftBoardState.updatedAt': Date.now()
        }).catch(() => {});
    };

    // Dismiss Time's Up alert
    const handleDismissTimeUp = () => {
        setIsTimeUpDismissed(true);
    };

    // Toggle sound
    const handleToggleSound = () => {
        const nextMuted = !isMuted;
        setDraftAudioMuted(nextMuted);
        setIsMuted(nextMuted);
    };

    // Switch view mode and sync to Firestore
    const handleSwitchViewMode = async (mode: 'GRID' | 'TABLE') => {
        setViewMode(mode);
        if (isAdmin && auctionId) {
            await db.collection('auctions').doc(auctionId).update({
                'draftBoardState.displayMode': mode,
                'draftBoardState.updatedAt': Date.now()
            }).catch(() => {});
        }
    };

    // Selected player for preview / assignment
    const [activePlayerForModal, setActivePlayerForModal] = useState<Player | null>(null);

    // Copy feedback states
    const [copiedProjector, setCopiedProjector] = useState(false);
    const [copiedOBS, setCopiedOBS] = useState(false);

    const handleCopyProjector = () => {
        if (!auctionId) {
            alert("Auction ID not loaded yet. Please wait a moment and try again.");
            return;
        }
        const url = `${window.location.origin}/#/projector/${auctionId}`;
        navigator.clipboard.writeText(url);
        setCopiedProjector(true);
        setTimeout(() => setCopiedProjector(false), 2000);
    };

    const handleCopyOBS = () => {
        if (!auctionId) {
            alert("Auction ID not loaded yet. Please wait a moment and try again.");
            return;
        }
        const url = `${window.location.origin}/#/obs-overlay/${auctionId}`;
        navigator.clipboard.writeText(url);
        setCopiedOBS(true);
        setTimeout(() => setCopiedOBS(false), 2000);
    };

    const handleOpenProjector = () => {
        if (!auctionId) {
            alert("Auction ID not loaded yet.");
            return;
        }
        window.open(`${window.location.origin}/#/projector/${auctionId}`, '_blank');
    };

    const handleOpenOBS = () => {
        if (!auctionId) {
            alert("Auction ID not loaded yet.");
            return;
        }
        window.open(`${window.location.origin}/#/obs-overlay/${auctionId}`, '_blank');
    };

    // Turn timer effect for active timer
    useEffect(() => {
        if (!isAdmin || !draftState.isTimerRunning) return;

        const interval = setInterval(() => {
            if (draftState.timerTimeRemaining > 1) {
                // Update local countdown or periodic DB sync
                db.collection('auctions').doc(auctionId).update({
                    'draftBoardState.timerTimeRemaining': draftState.timerTimeRemaining - 1,
                    'draftBoardState.updatedAt': Date.now()
                }).catch(() => {});
            } else if (draftState.timerTimeRemaining === 1) {
                // Timer finished
                db.collection('auctions').doc(auctionId).update({
                    'draftBoardState.timerTimeRemaining': 0,
                    'draftBoardState.isTimerRunning': false,
                    'draftBoardState.updatedAt': Date.now()
                }).catch(() => {});
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [isAdmin, draftState.isTimerRunning, draftState.timerTimeRemaining, auctionId]);

    // Current turn team
    const currentTurnTeam = useMemo(() => {
        if (!draftState.currentTeamId) return null;
        return teams.find(t => String(t.id) === String(draftState.currentTeamId)) || null;
    }, [draftState.currentTeamId, teams]);

    // Is it currently my team's turn?
    const isMyTurn = isTeamOwner && myTeam && String(myTeam.id) === String(draftState.currentTeamId);

    // Active picking team name for Auto-Allot mode
    const activePickingTeamName = useMemo(() => {
        if (draftState.targetPickingTeamId && draftState.targetPickingTeamId !== 'CURRENT_TURN') {
            const t = teams.find(tm => String(tm.id) === String(draftState.targetPickingTeamId));
            return t ? t.name : 'Selected Team';
        }
        return currentTurnTeam ? currentTurnTeam.name : 'Round Order';
    }, [draftState.targetPickingTeamId, currentTurnTeam, teams]);

    // Map of players sold in draft (playerId -> DraftPickHistory)
    const draftPickMap = useMemo(() => {
        const map = new Map<string, DraftPickHistory>();
        (draftState.history || []).forEach(h => {
            map.set(String(h.playerId), h);
        });
        return map;
    }, [draftState.history]);

    // Group players by Category / Role
    const categoryGroups = useMemo(() => {
        // Collect all distinct category/role names
        const namesSet = new Set<string>();
        
        // Add configured categories first
        categories.forEach(c => namesSet.add(c.name));

        // Add standard roles if no categories
        if (namesSet.size === 0) {
            namesSet.add('Batsman');
            namesSet.add('Bowler');
            namesSet.add('All-Rounder');
            namesSet.add('Wicketkeeper');
        }

        // Add any categories present on players
        players.forEach(p => {
            const cat = p.category || p.role || 'Uncategorized';
            if (cat) namesSet.add(cat);
        });

        const list = Array.from(namesSet);

        // Filter players according to query and status
        const filtered = players.filter(p => {
            const matchesQuery = searchQuery === '' || 
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.role && p.role.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase()));

            const isSold = p.status === 'SOLD' || draftPickMap.has(String(p.id));
            const matchesStatus = statusFilter === 'ALL' ||
                (statusFilter === 'AVAILABLE' && !isSold) ||
                (statusFilter === 'SOLD' && isSold);

            return matchesQuery && matchesStatus;
        });

        const groups: { category: string; players: Player[]; availableCount: number; soldCount: number }[] = [];

        list.forEach(catName => {
            const catPlayers = filtered.filter(p => {
                const pCat = (p.category || p.role || 'Uncategorized').trim().toLowerCase();
                return pCat === catName.trim().toLowerCase();
            });

            if (catPlayers.length > 0 || selectedCategoryFilter === 'ALL') {
                const totalInCat = players.filter(p => (p.category || p.role || 'Uncategorized').trim().toLowerCase() === catName.trim().toLowerCase());
                const soldInCat = totalInCat.filter(p => p.status === 'SOLD' || draftPickMap.has(String(p.id))).length;
                const availableInCat = totalInCat.length - soldInCat;

                groups.push({
                    category: catName,
                    players: catPlayers,
                    availableCount: availableInCat,
                    soldCount: soldInCat
                });
            }
        });

        // Add uncategorized if any left
        const mappedIds = new Set(groups.flatMap(g => g.players.map(p => String(p.id))));
        const remainder = filtered.filter(p => !mappedIds.has(String(p.id)));
        if (remainder.length > 0) {
            groups.push({
                category: 'Other / General',
                players: remainder,
                availableCount: remainder.filter(p => p.status !== 'SOLD' && !draftPickMap.has(String(p.id))).length,
                soldCount: remainder.filter(p => p.status === 'SOLD' || draftPickMap.has(String(p.id))).length
            });
        }

        return groups;
    }, [categories, players, draftPickMap, searchQuery, statusFilter, selectedCategoryFilter]);

    // Handle Assign Player to Team
    const handleAssignPlayer = async (player: Player, teamId: string | number, price: number) => {
        if (!auctionId) return;
        setPickError(null);

        if (isTeamOwner && !isAdmin) {
            if (draftState.teamPickingEnabled === false) {
                setPickError('Picking is currently locked by the auction admin.');
                return;
            }
            if (!myTeam || String(myTeam.id) !== String(draftState.currentTeamId)) {
                setPickError('Please wait for your team turn before drafting a player.');
                return;
            }
        }

        const effectiveTeamId = (isTeamOwner && !isAdmin && myTeam) ? myTeam.id : teamId;
        const targetTeam = teams.find(t => String(t.id) === String(effectiveTeamId));
        if (!targetTeam) return;

        const effectivePrice = Math.max(0, Number(price || 0));

        try {
            // Ensure Firebase Auth session (anonymous or signed-in) before writing to Firestore
            if (!auth.currentUser) {
                await auth.signInAnonymously();
            }

            // 1. Mark player as SOLD in Firestore players subcollection
            const playerUpdateData = {
                status: 'SOLD',
                soldTo: targetTeam.name || 'Team',
                soldToId: targetTeam.id,
                teamId: targetTeam.id,
                soldPrice: effectivePrice,
                soldAt: Date.now()
            };
            await db.collection('auctions').doc(auctionId).collection('players').doc(String(player.id)).update(
                JSON.parse(JSON.stringify(playerUpdateData))
            );

            // 2. Update team budget and squad (clean payload to eliminate any undefined values)
            const updatedBudget = Math.max(0, Number(targetTeam.budget || 0) - effectivePrice);
            const minimalPlayer = {
                id: player.id,
                name: player.name || '',
                role: player.role || 'Player',
                category: player.category || 'General',
                photoUrl: player.photoUrl || '',
                basePrice: Number(player.basePrice || globalBasePrice || 0),
                soldPrice: effectivePrice,
                status: 'SOLD',
                soldTo: targetTeam.name || '',
                jerseyNumber: player.jerseyNumber || '',
                jerseyName: player.jerseyName || ''
            };
            const updatedTeamPlayers = [...(targetTeam.players || []), minimalPlayer];

            await db.collection('auctions').doc(auctionId).collection('teams').doc(String(targetTeam.id)).update({
                budget: updatedBudget,
                players: JSON.parse(JSON.stringify(updatedTeamPlayers))
            });

            // Compact media helper: keep HTTPS URLs (<1000 chars), drop raw Base64 blobs from root auction doc
            // so draftBoardState.history & lastSoldCelebration never trigger Firestore's 1 MiB document limit.
            const compactMediaRef = (url?: string): string => {
                if (!url) return '';
                if (url.startsWith('data:') && url.length > 1000) return '';
                return url;
            };

            // 3. Record draft pick in history with guaranteed non-undefined values
            const newPick: DraftPickHistory = {
                id: `pick_${Date.now()}`,
                round: Number(draftState.currentRound || 1),
                pickNumber: Number(draftState.history?.length || 0) + 1,
                teamId: targetTeam.id,
                teamName: targetTeam.name || '',
                teamLogo: compactMediaRef(targetTeam.logoUrl),
                playerId: player.id,
                playerName: player.name || '',
                playerCategory: player.category || player.role || 'Player',
                playerRole: player.role || 'Player',
                playerPhoto: compactMediaRef(player.photoUrl),
                soldPrice: effectivePrice,
                timestamp: Date.now()
            };

            const sanitizedPriorHistory = (draftState.history || []).map(h => ({
                ...h,
                teamLogo: compactMediaRef(h.teamLogo),
                playerPhoto: compactMediaRef(h.playerPhoto)
            }));
            const updatedHistory = [...sanitizedPriorHistory, newPick];

            // 4. Advance turn to next team in round order
            const currentOrder = (draftState.roundOrder && draftState.roundOrder.length > 0)
                ? draftState.roundOrder 
                : teams.map(t => t.id);

            const nextTurnIndex = Number(draftState.currentTurnIndex || 0) + 1;
            const isRoundFinished = nextTurnIndex >= currentOrder.length;

            const nextRound = Number(draftState.currentRound || 1);
            const nextTeamId = isRoundFinished ? null : (currentOrder[nextTurnIndex] ?? null);
            const nextStatus: 'IDLE' | 'IN_PROGRESS' | 'ROUND_COMPLETED' = isRoundFinished ? 'ROUND_COMPLETED' : 'IN_PROGRESS';

            // Clean atomic dot-notation update to preserve concurrent admin toggles & satisfy security rules
            const cleanHistory = JSON.parse(JSON.stringify(updatedHistory));
            const celebrationData: DraftCelebrationData = {
                playerId: player.id,
                playerName: player.name || '',
                playerPhoto: compactMediaRef(player.photoUrl),
                role: player.role || player.category || 'Player',
                category: player.category || 'General',
                jerseyNumber: player.jerseyNumber || '',
                teamId: targetTeam.id,
                teamName: targetTeam.name || '',
                teamLogo: compactMediaRef(targetTeam.logoUrl),
                timestamp: Date.now()
            };

            const draftBoardAtomicUpdate = JSON.parse(JSON.stringify({
                'draftBoardState.history': cleanHistory,
                'draftBoardState.currentRound': nextRound,
                'draftBoardState.currentTurnIndex': isRoundFinished ? currentOrder.length : nextTurnIndex,
                'draftBoardState.currentTeamId': nextTeamId,
                'draftBoardState.roundStatus': nextStatus,
                'draftBoardState.timerTimeRemaining': Number(draftState.turnTimerSeconds || 45),
                'draftBoardState.isTimerRunning': !isRoundFinished,
                'draftBoardState.selectedPlayerId': null,
                'draftBoardState.lastSoldCelebration': celebrationData,
                'draftBoardState.updatedAt': Date.now()
            }));

            await db.collection('auctions').doc(auctionId).update(draftBoardAtomicUpdate);

            // Confetti celebration
            confetti({
                particleCount: 50,
                spread: 70,
                origin: { y: 0.6 }
            });

            setActivePlayerForModal(null);
        } catch (err: any) {
            const errInfo = {
                error: err?.message || String(err),
                code: err?.code || 'unknown',
                operationType: 'update',
                path: `auctions/${auctionId}`,
                authInfo: {
                    userId: auth.currentUser?.uid || null,
                    isAnonymous: auth.currentUser?.isAnonymous ?? null,
                    isTeamOwner,
                    isAdmin
                }
            };
            console.error("Failed to assign player in draft:", JSON.stringify(errInfo));
            setPickError(
                err?.message?.includes('permission') || err?.code === 'permission-denied'
                    ? 'Assignment failed: Missing or insufficient permissions. Please verify Firestore rules are deployed or contact Admin.'
                    : `Assignment failed: ${err?.message || 'Unable to save pick.'}`
            );
        }
    };

    // Handle Undo Specific Player
    const handleUndoSpecificPlayer = async (player: Player) => {
        if (!auctionId || !isAdmin) return;

        const pickInfo = draftPickMap.get(String(player.id));
        const soldTeamId = pickInfo?.teamId || player.soldToId || player.teamId;
        const soldPrice = Number(pickInfo?.soldPrice ?? player.soldPrice ?? 0);

        const confirmMsg = `Are you sure you want to UNDO selection for "${player.name}"?\nThis will revert the player to AVAILABLE and return them to the draft pool.`;
        if (!window.confirm(confirmMsg)) return;

        try {
            // 1. Revert player in players subcollection
            const playerResetData = {
                status: 'UNSOLD',
                soldTo: null,
                soldToId: null,
                teamId: null,
                soldPrice: null,
                soldAt: null
            };
            await db.collection('auctions').doc(auctionId).collection('players').doc(String(player.id)).update(
                JSON.parse(JSON.stringify(playerResetData))
            );

            // 2. Refund team budget and remove player from team's squad
            if (soldTeamId) {
                const targetTeam = teams.find(t => String(t.id) === String(soldTeamId));
                if (targetTeam) {
                    const restoredBudget = Number(targetTeam.budget || 0) + soldPrice;
                    const updatedSquad = (targetTeam.players || []).filter(p => String(p.id) !== String(player.id));

                    await db.collection('auctions').doc(auctionId).collection('teams').doc(String(targetTeam.id)).update({
                        budget: restoredBudget,
                        players: JSON.parse(JSON.stringify(updatedSquad))
                    });
                }
            }

            // 3. Remove pick from draftBoardState.history
            const updatedHistory = (draftState.history || []).filter(h => String(h.playerId) !== String(player.id));
            const cleanHistory = JSON.parse(JSON.stringify(updatedHistory));

            const payload = {
                draftBoardState: {
                    ...draftState,
                    history: cleanHistory,
                    updatedAt: Date.now()
                }
            };
            await db.collection('auctions').doc(auctionId).set(JSON.parse(JSON.stringify(payload)), { merge: true });

            if (activePlayerForModal?.id === player.id) {
                setActivePlayerForModal(null);
            }
        } catch (err: any) {
            console.error("Failed to undo player sale:", err);
            alert(`Undo failed: ${err.message}`);
        }
    };

    // 1. Check if all players in the pool are sold
    const allPlayersSold = players.length > 0 && players.every(p => {
        const isSoldInState = p.status === 'SOLD';
        const isSoldInHistory = draftPickMap.has(String(p.id)) || (draftState.history || []).some(h => String(h.playerId) === String(p.id));
        return isSoldInState || isSoldInHistory;
    });

    // 2. Check if all squads are filled to capacity
    const allSquadsFilled = teams.length > 0 && teams.every(t => {
        const squadLimit = t.maxPlayers;
        if (!squadLimit || squadLimit <= 0) return false;
        const fromHistory = (draftState.history || []).filter(h => String(h.teamId) === String(t.id)).length;
        const fromSquad = (t.players || []).filter(p => !(draftState.history || []).some(h => String(h.playerId) === String(p.id))).length;
        return (fromHistory + fromSquad) >= squadLimit;
    });

    const isEligibleToComplete = allPlayersSold || allSquadsFilled;

    // Check if draft auction is completed or summary view is triggered
    const isAuctionFinished = (state as any).status === 'FINISHED' || 
                              draftState.roundStatus === 'COMPLETED' || 
                              draftState.roundStatus === 'FINISHED' || 
                              (isEligibleToComplete && draftState.broadcastView === 'SUMMARY');

    if (isAuctionFinished) {
        return (
            <>
                <DraftAuctionSummary
                    tournamentName={state.tournamentName}
                    auctionLogoUrl={state.auctionLogoUrl}
                    systemLogoUrl={state.systemLogoUrl}
                    teams={teams}
                    players={players}
                    draftPickMap={draftPickMap}
                    draftState={draftState}
                    isAdmin={isAdmin}
                    isProjectorView={isProjectorView}
                    isOBSView={isOBSView}
                    auctionId={auctionId}
                    onReopenDraft={async () => {
                        if (!auctionId) return;
                        await db.collection('auctions').doc(auctionId).update({
                            status: 'ACTIVE',
                            'draftBoardState.roundStatus': 'IN_PROGRESS',
                            'draftBoardState.broadcastView': 'PLAYERS',
                            'draftBoardState.updatedAt': Date.now()
                        });
                    }}
                />
                <SoldCelebrationPopup
                    celebrationData={draftState.lastSoldCelebration}
                    durationMs={soldPopupDurationMs}
                    customSoldAudioUrl={customAudio?.soldMusicUrl}
                    players={players}
                    teams={teams}
                />
            </>
        );
    }

    // Team Owner View: Render dedicated TeamDraftDashboard with multi-option tabs
    if (isTeamOwner && myTeam && !isProjectorView && !isOBSView) {
        return (
            <div className="flex flex-col h-full min-h-0 w-full overflow-hidden relative">
                {pickError && (
                    <div className="shrink-0 mx-3 mt-2 px-4 py-2.5 rounded-xl bg-red-950/95 border border-red-500 text-red-100 text-xs font-bold flex items-center justify-between gap-3 shadow-xl z-50">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                            <span>{pickError}</span>
                        </div>
                        <button type="button" onClick={() => setPickError(null)} className="p-1 hover:bg-red-800/60 rounded-lg text-red-200">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}
                <TeamDraftDashboard
                    myTeam={myTeam}
                    teams={teams}
                    players={players}
                    categories={categories}
                    draftState={draftState}
                    draftPickMap={draftPickMap}
                    auctionId={auctionId || ''}
                    globalBasePrice={globalBasePrice}
                    customSoldAudioUrl={customAudio.soldMusicUrl}
                    onNominatePlayer={(p) => {
                        setPickError(null);
                        setActivePlayerForModal(p);
                    }}
                    isDark={isDark}
                />
                {activePlayerForModal && (
                    <DraftNominationModal
                        player={activePlayerForModal}
                        teams={teams}
                        currentTurnTeam={currentTurnTeam}
                        myTeam={myTeam}
                        isAdmin={isAdmin}
                        isMyTurn={isMyTurn}
                        isPickingAllowed={draftState.teamPickingEnabled !== false}
                        onClose={() => setActivePlayerForModal(null)}
                        onAssign={(player, teamId, price) => handleAssignPlayer(player, teamId, price)}
                        onUndoPlayer={handleUndoSpecificPlayer}
                    />
                )}
            </div>
        );
    }

    // Handle Quick Allot Player directly to the active picking team in 1 click
    const handleQuickAllotPlayer = async (player: Player) => {
        if (!auctionId) return;

        // Determine target team
        let targetTeamId: string | number | null = null;
        if (draftState.targetPickingTeamId && draftState.targetPickingTeamId !== 'CURRENT_TURN') {
            targetTeamId = draftState.targetPickingTeamId;
        } else {
            targetTeamId = draftState.currentTeamId || (draftState.roundOrder && draftState.roundOrder[draftState.currentTurnIndex]) || teams[0]?.id;
        }

        if (!targetTeamId) {
            alert("Please select a team for this picking round first!");
            return;
        }

        const targetTeam = teams.find(t => String(t.id) === String(targetTeamId));
        if (!targetTeam) return;

        const price = Number(player.basePrice || 0);
        await handleAssignPlayer(player, targetTeam.id, price);
    };

    const themeConfig = getDraftTheme(draftState.broadcastTheme);
    const obsMode = isOBSView ? (draftState.obsDisplayMode || 'FULL_BOARD') : 'FULL_BOARD';
    const isObsTransparent = isOBSView && (obsMode !== 'FULL_BOARD' || !!draftState.obsTransparentBg);

    const renderUnsoldBannerOverlay = () => {
        if (!activeUnsoldBanner) return null;
        return (
            <div className="fixed bottom-6 right-6 z-[950] pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center gap-3.5 px-5 py-3.5 rounded-2xl bg-red-950/95 border-2 border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.5)] backdrop-blur-xl">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-900 border border-red-400/50 shrink-0 flex items-center justify-center">
                        {activeUnsoldBanner.playerPhoto ? (
                            <img src={activeUnsoldBanner.playerPhoto} alt={activeUnsoldBanner.playerName} className="w-full h-full object-cover object-top" />
                        ) : (
                            <Ban className="w-6 h-6 text-red-400" />
                        )}
                    </div>
                    <div>
                        <span className="px-2 py-0.5 rounded bg-red-600 text-white text-[9px] font-black uppercase tracking-widest">
                            UNSOLD PASS
                        </span>
                        <h4 className="text-base font-black text-white uppercase tracking-tight mt-0.5">
                            {activeUnsoldBanner.playerName}
                        </h4>
                        <p className="text-[10px] font-bold text-red-300 uppercase tracking-wider">
                            {activeUnsoldBanner.category || activeUnsoldBanner.role || 'Returned to Pool'}
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    // MINIMAL / VIDEO-SAFE OBS OVERLAY MODES (Top 70%+ or Full Canvas stays 100% transparent for live video feed)
    if (isOBSView && obsMode !== 'FULL_BOARD') {
        if (obsMode === 'HIDDEN') {
            return (
                <div className="h-full w-full bg-transparent relative overflow-hidden pointer-events-none">
                    {renderUnsoldBannerOverlay()}
                    <SoldCelebrationPopup
                        celebrationData={draftState.lastSoldCelebration}
                        durationMs={soldPopupDurationMs}
                        customSoldAudioUrl={customAudio?.soldMusicUrl}
                        players={players}
                        teams={teams}
                    />
                </div>
            );
        }

        if (obsMode === 'CURRENT_TEAM_ONLY') {
            return (
                <div className="h-full w-full bg-transparent relative overflow-hidden pointer-events-none flex flex-col justify-end p-5 md:p-8">
                    <div className="max-w-xl bg-zinc-950/90 backdrop-blur-xl border-2 border-amber-400/70 rounded-2xl p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.85)] flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            {currentTurnTeam?.logoUrl ? (
                                <img src={currentTurnTeam.logoUrl} alt={currentTurnTeam.name} className="w-12 h-12 rounded-xl object-contain bg-white p-1 border-2 border-amber-400 shrink-0 shadow" />
                            ) : (
                                <div className="w-12 h-12 rounded-xl bg-amber-500 text-black font-black text-xl flex items-center justify-center shrink-0">
                                    {currentTurnTeam ? currentTurnTeam.name.charAt(0) : <Trophy className="w-6 h-6" />}
                                </div>
                            )}
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded bg-amber-500 text-black text-[9px] font-black uppercase tracking-wider">
                                        Round {draftState.currentRound}
                                    </span>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                                        Picking Now ({draftState.currentTurnIndex + 1}/{draftState.roundOrder?.length || teams.length})
                                    </span>
                                </div>
                                <h3 className="text-lg md:text-xl font-black uppercase tracking-tight text-white truncate mt-0.5">
                                    {currentTurnTeam ? currentTurnTeam.name : (draftState.roundStatus === 'ROUND_COMPLETED' ? `Round ${draftState.currentRound} Done` : 'Awaiting Turn')}
                                </h3>
                                {currentTurnTeam && (
                                    <p className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">
                                        Squad: {currentTurnTeam.players?.length || 0} Players
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className={`px-3.5 py-2 rounded-xl border-2 shrink-0 text-center ${
                            draftState.timerTimeRemaining <= 10 && draftState.isTimerRunning
                                ? 'bg-red-600/30 border-red-400 text-red-300 animate-pulse'
                                : 'bg-zinc-900/90 border-zinc-700 text-white'
                        }`}>
                            <p className="text-[8px] font-black uppercase tracking-widest text-zinc-400">Timer</p>
                            <p className="text-xl font-black tabular-nums leading-tight">{draftState.timerTimeRemaining}s</p>
                        </div>
                    </div>

                    {renderUnsoldBannerOverlay()}
                    <SoldCelebrationPopup
                        celebrationData={draftState.lastSoldCelebration}
                        durationMs={soldPopupDurationMs}
                        customSoldAudioUrl={customAudio?.soldMusicUrl}
                        players={players}
                        teams={teams}
                    />
                </div>
            );
        }

        if (obsMode === 'BOTTOM_CATEGORY_STRIP') {
            const targetCat = draftState.obsCategoryFilter && draftState.obsCategoryFilter !== 'ALL'
                ? draftState.obsCategoryFilter
                : (draftState.broadcastCategoryFilter && draftState.broadcastCategoryFilter !== 'ALL'
                    ? draftState.broadcastCategoryFilter
                    : categoryGroups[0]?.category || '');
            const obsGroup = categoryGroups.find(g => g.category.toLowerCase() === targetCat.toLowerCase()) || categoryGroups[0];
            const stripPlayers = obsGroup ? obsGroup.players : [];

            return (
                <div className="h-full w-full bg-transparent relative overflow-hidden pointer-events-none flex flex-col justify-end">
                    {/* Docked Lower-Third Category & Pick Bar */}
                    <div className="w-full max-h-[34vh] bg-zinc-950/92 backdrop-blur-xl border-t-2 border-amber-400/70 shadow-[0_-10px_40px_rgba(0,0,0,0.85)] px-3 py-2 flex flex-col gap-1.5">
                        {/* Strip Header Row */}
                        <div className="flex items-center justify-between gap-3 shrink-0">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <span className="px-2.5 py-0.5 rounded-lg bg-amber-500 text-black font-black text-[10px] uppercase tracking-wider shrink-0">
                                    {obsGroup?.category || 'Category'}
                                </span>
                                <span className="text-[10px] font-bold text-emerald-400 uppercase shrink-0">
                                    Avail: {obsGroup?.availableCount ?? 0}
                                </span>
                                <span className="text-[10px] font-bold text-zinc-400 uppercase shrink-0">
                                    Sold: {obsGroup?.soldCount ?? 0}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-yellow-300 font-black text-[10px] uppercase shrink-0">
                                    Round {draftState.currentRound}
                                </span>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                                {currentTurnTeam && (
                                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-400/50">
                                        {currentTurnTeam.logoUrl ? (
                                            <img src={currentTurnTeam.logoUrl} alt="" className="w-5 h-5 rounded-full object-contain bg-white p-0.5" />
                                        ) : null}
                                        <span className="text-[10px] font-black uppercase text-amber-300">
                                            Pick: {currentTurnTeam.name}
                                        </span>
                                    </div>
                                )}
                                <div className={`px-2.5 py-1 rounded-xl border text-xs font-black tabular-nums ${
                                    draftState.timerTimeRemaining <= 10 && draftState.isTimerRunning
                                        ? 'bg-red-600/30 border-red-400 text-red-300 animate-pulse'
                                        : 'bg-zinc-900 border-zinc-700 text-white'
                                }`}>
                                    {draftState.timerTimeRemaining}s
                                </div>
                            </div>
                        </div>

                        {/* Compact Fit-to-Strip Player Cards */}
                        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1.5 overflow-hidden">
                            {stripPlayers.map(player => {
                                const pickInfo = draftPickMap.get(String(player.id));
                                const isSold = player.status === 'SOLD' || !!pickInfo;
                                const soldTeamName = pickInfo?.teamName || player.soldTo || 'Sold';
                                return (
                                    <div
                                        key={player.id}
                                        className={`rounded-lg border p-1 flex flex-col items-center text-center relative overflow-hidden ${
                                            isSold
                                                ? 'bg-red-950/75 border-red-500/70'
                                                : 'bg-zinc-900/90 border-zinc-700/80'
                                        }`}
                                    >
                                        <div className="w-full h-11 rounded overflow-hidden bg-zinc-950 relative">
                                            {player.photoUrl ? (
                                                <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover object-top" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center font-black text-xs text-zinc-500">
                                                    {player.name.charAt(0)}
                                                </div>
                                            )}
                                            {isSold && (
                                                <span className="absolute top-0.5 left-1/2 -translate-x-1/2 px-1 py-[1px] rounded bg-red-600 text-white text-[7px] font-black uppercase leading-none shadow">
                                                    SOLD
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[9px] font-black text-white truncate w-full mt-0.5 leading-tight uppercase">
                                            {player.name}
                                        </p>
                                        <p className={`text-[7.5px] font-bold truncate w-full leading-tight uppercase ${
                                            isSold ? 'text-amber-300' : 'text-emerald-400'
                                        }`}>
                                            {isSold ? soldTeamName : (player.role || 'Avail')}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {renderUnsoldBannerOverlay()}
                    <SoldCelebrationPopup
                        celebrationData={draftState.lastSoldCelebration}
                        durationMs={soldPopupDurationMs}
                        customSoldAudioUrl={customAudio?.soldMusicUrl}
                        players={players}
                        teams={teams}
                    />
                </div>
            );
        }
    }

    return (
        <div className={`flex flex-col h-full min-h-0 w-full overflow-hidden transition-all duration-300 ${
            isObsTransparent
                ? 'bg-transparent text-white'
                : isProjectorView || isOBSView
                    ? themeConfig.containerBg
                    : isDark
                        ? 'bg-zinc-950 text-white'
                        : 'bg-slate-50 text-gray-900'
        }`}>
            {/* TOP HEADER: ROUND & ACTIVE TURN BANNER */}
            <div className={`shrink-0 ${isProjectorView || isOBSView ? `px-3 py-1.5 border-b ${themeConfig.headerBg} ${themeConfig.headerBorder}` : isDark ? 'p-3 md:p-5 border-b bg-zinc-900/90 border-zinc-800' : 'p-3 md:p-5 border-b bg-white/95 border-gray-200'} backdrop-blur-md shadow-lg z-20`}>
                <div className={`flex ${isProjectorView || isOBSView ? 'flex-row items-center justify-between gap-2 overflow-x-auto custom-scrollbar' : 'flex-col lg:flex-row items-center justify-between gap-4'}`}>
                    {/* Broadcast Branding: Tournament Name & Logo */}
                    {(isProjectorView || isOBSView) && (
                        <div className="flex items-center gap-2.5 pr-3 border-r border-white/10 shrink-0">
                            {state.auctionLogoUrl ? (
                                <img src={state.auctionLogoUrl} alt="" className="h-8 w-8 object-contain bg-white rounded-lg p-0.5 shadow-md shrink-0" />
                            ) : state.systemLogoUrl ? (
                                <img src={state.systemLogoUrl} alt="" className="h-7 w-auto object-contain shrink-0" />
                            ) : (
                                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black shrink-0">
                                    <Trophy className="w-4 h-4" />
                                </div>
                            )}
                            <div>
                                <h1 className="text-xs md:text-sm font-black uppercase italic tracking-tight text-white leading-tight truncate max-w-[160px] md:max-w-xs">
                                    {state.tournamentName || "LIVE AUCTION"}
                                </h1>
                                <span className="text-[8px] font-bold text-amber-400 tracking-widest uppercase flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> {isOBSView ? 'OBS Broadcast' : 'Projector View'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Left: Round & Turn Info */}
                    <div className="flex flex-wrap items-center gap-2 md:gap-3 shrink-0">
                        <div className="flex items-center gap-2">
                            {/* BRIGHT GLOWING ROUND BADGE WITH HIGH-CONTRAST GOLD NUMBER PILL */}
                            <div className={`px-3 py-1.5 rounded-2xl flex items-center gap-2 shrink-0 ${themeConfig.roundBadgeClass}`}>
                                <Trophy className="w-4 h-4 shrink-0 stroke-[2.5]" />
                                <span className="font-black text-xs md:text-sm uppercase tracking-wider drop-shadow">
                                    Round
                                </span>
                                <span className="px-2.5 py-0.5 rounded-lg bg-zinc-950 text-yellow-300 font-black text-xs md:text-sm border-2 border-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.6)]">
                                    {draftState.currentRound}
                                </span>
                            </div>

                            <span className={`px-2.5 py-1.5 rounded-2xl text-[10px] md:text-xs font-black uppercase tracking-widest border shrink-0 ${
                                draftState.roundStatus === 'IN_PROGRESS' 
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]' 
                                    : draftState.roundStatus === 'ROUND_COMPLETED'
                                    ? 'bg-blue-500/20 text-blue-300 border-blue-400 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.3)]'
                                    : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                            }`}>
                                {draftState.roundStatus === 'IN_PROGRESS' ? '● Draft Active' :
                                 draftState.roundStatus === 'ROUND_COMPLETED' ? '★ Round Completed' : 'Draft Ready'}
                            </span>
                        </div>

                        {/* Current Active Team Turn */}
                        {currentTurnTeam ? (
                            <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded-2xl border transition-all shrink-0 ${
                                isMyTurn 
                                    ? 'bg-amber-500/15 border-amber-500/50 shadow-lg shadow-amber-500/10 ring-2 ring-amber-500/30 animate-pulse' 
                                    : isDark ? 'bg-zinc-800/80 border-zinc-700' : 'bg-gray-100 border-gray-200'
                            }`}>
                                {currentTurnTeam.logoUrl ? (
                                    <img src={currentTurnTeam.logoUrl} alt={currentTurnTeam.name} className="w-7 h-7 rounded-full object-contain bg-white p-0.5 border" />
                                ) : (
                                    <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                                        {currentTurnTeam.name.charAt(0)}
                                    </div>
                                )}
                                <div>
                                    <div className="flex items-center gap-1">
                                        <p className="text-[8px] font-black uppercase tracking-wider text-amber-500">
                                            {isMyTurn ? 'YOUR TURN' : 'PICK TURN'}
                                        </p>
                                        <span className="text-[8px] font-bold text-gray-400">
                                            ({draftState.currentTurnIndex + 1}/{draftState.roundOrder?.length || teams.length})
                                        </span>
                                    </div>
                                    <p className={`text-xs font-black uppercase tracking-tight truncate max-w-[120px] md:max-w-[180px] ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                        {currentTurnTeam.name}
                                    </p>
                                </div>
                                <div className="pl-2 border-l border-white/10 text-right">
                                    <p className="text-[7px] font-bold text-gray-400 uppercase tracking-wider">Squad</p>
                                    <p className="text-xs font-black text-blue-400 tabular-nums">
                                        {currentTurnTeam.players?.length || 0}
                                    </p>
                                </div>
                            </div>
                        ) : draftState.roundStatus === 'ROUND_COMPLETED' ? (
                            <div className="px-3 py-1.5 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-black uppercase tracking-wider shrink-0">
                                Round {draftState.currentRound} Finished!
                            </div>
                        ) : null}
                    </div>

                    {/* Center: Live Timer with Reset & Sound Toggle */}
                    <div className="flex items-center gap-2 shrink-0">
                        <div className={`px-2.5 md:px-3 py-1.5 rounded-2xl border flex items-center gap-1.5 shadow-md ${
                            draftState.timerTimeRemaining <= 10 && draftState.isTimerRunning
                                ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse'
                                : isDark ? 'bg-zinc-800/80 border-zinc-700' : 'bg-gray-100 border-gray-200'
                        }`}>
                            <Clock className={`w-3.5 h-3.5 ${draftState.timerTimeRemaining <= 10 && draftState.isTimerRunning ? 'text-red-500 animate-spin' : 'text-amber-400'}`} />
                            <div className="flex items-baseline gap-1">
                                <span className="text-lg md:text-xl font-black tabular-nums">
                                    {draftState.timerTimeRemaining}s
                                </span>
                                <span className="text-[8px] font-bold text-gray-400 uppercase">Turn</span>
                            </div>
                        </div>

                        {/* Interactive Controls (Admin and Team Portals only, removed from Projector & OBS displays) */}
                        {!isProjectorView && !isOBSView && (
                            <>
                                {/* Reset Timer Button */}
                                <button
                                    type="button"
                                    onClick={handleResetTimer}
                                    className="px-2.5 py-1.5 rounded-2xl border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 font-black text-xs uppercase tracking-wider flex items-center gap-1 active:scale-95 shadow-sm transition-all"
                                    title="Reset Turn Timer to default seconds"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Reset</span>
                                </button>

                                {/* Audio Sound Toggle */}
                                <button
                                    type="button"
                                    onClick={handleToggleSound}
                                    className="p-1.5 md:p-2 rounded-2xl border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-all shadow-sm active:scale-95"
                                    title={isMuted ? 'Unmute Countdown Sounds' : 'Mute Countdown Sounds'}
                                >
                                    {isMuted ? (
                                        <VolumeX className="w-4 h-4 text-zinc-500" />
                                    ) : (
                                        <Volume2 className="w-4 h-4 text-emerald-400" />
                                    )}
                                </button>
                            </>
                        )}

                        {/* View Switcher: Grid vs Table (Admin & Team Portals only, hidden on Projector / OBS) */}
                        {!isProjectorView && !isOBSView && (
                            <div className={`flex p-1 rounded-2xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-100 border-gray-200'}`}>
                                <button
                                    onClick={() => handleSwitchViewMode('GRID')}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                                        viewMode === 'GRID' 
                                            ? 'bg-blue-600 text-white shadow-md' 
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                    title="Category Rows and Columns Grid Matrix"
                                >
                                    <LayoutGrid className="w-3.5 h-3.5" /> Grid Board
                                </button>
                                <button
                                    onClick={() => handleSwitchViewMode('TABLE')}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                                        viewMode === 'TABLE' 
                                            ? 'bg-blue-600 text-white shadow-md' 
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                    title="Full Players Table View"
                                >
                                    <TableIcon className="w-3.5 h-3.5" /> Table View
                                </button>
                            </div>
                        )}

                        {/* Broadcast Copy Links: Projector & OBS (Admin Only) */}
                        {isAdmin && !isProjectorView && !isOBSView && (
                            <div className="flex items-center gap-2">
                                <div className="flex items-center rounded-xl overflow-hidden border border-blue-500/30 shadow-sm">
                                    <button
                                        type="button"
                                        onClick={handleCopyProjector}
                                        className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 ${
                                            copiedProjector 
                                                ? 'bg-emerald-600 text-white' 
                                                : isDark ? 'bg-zinc-900 text-blue-400 hover:bg-zinc-800 hover:text-white' : 'bg-white text-blue-600 hover:bg-gray-50'
                                        }`}
                                        title="Copy Projector Screen URL to Clipboard"
                                    >
                                        {copiedProjector ? <Check className="w-3.5 h-3.5 text-white" /> : <Monitor className="w-3.5 h-3.5" />}
                                        <span>{copiedProjector ? 'Projector Copied!' : 'Copy Projector'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleOpenProjector}
                                        className={`px-2 py-1.5 border-l border-blue-500/30 text-blue-400 hover:text-white hover:bg-blue-600 transition-all ${
                                            isDark ? 'bg-zinc-900' : 'bg-white'
                                        }`}
                                        title="Open Projector Screen in New Tab"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                <div className="flex items-center rounded-xl overflow-hidden border border-purple-500/30 shadow-sm">
                                    <button
                                        type="button"
                                        onClick={handleCopyOBS}
                                        className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 ${
                                            copiedOBS 
                                                ? 'bg-emerald-600 text-white' 
                                                : isDark ? 'bg-zinc-900 text-purple-400 hover:bg-zinc-800 hover:text-white' : 'bg-white text-purple-600 hover:bg-gray-50'
                                        }`}
                                        title="Copy OBS Broadcast Overlay URL to Clipboard"
                                    >
                                        {copiedOBS ? <Check className="w-3.5 h-3.5 text-white" /> : <Cast className="w-3.5 h-3.5" />}
                                        <span>{copiedOBS ? 'OBS Copied!' : 'Copy OBS'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleOpenOBS}
                                        className={`px-2 py-1.5 border-l border-purple-500/30 text-purple-400 hover:text-white hover:bg-purple-600 transition-all ${
                                            isDark ? 'bg-zinc-900' : 'bg-white'
                                        }`}
                                        title="Open OBS Broadcast Overlay in New Tab"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Admin Mode Switcher Back to Live Bidding */}
                        {isAdmin && !isProjectorView && !isOBSView && (
                            <button
                                type="button"
                                onClick={() => updateAuctionType('BIDDING')}
                                className="px-3.5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 transition-all shadow-sm active:scale-95"
                                title="Switch back to Live Bidding Auction"
                            >
                                <Gavel className="w-3.5 h-3.5" /> 🔨 Live Bidding
                            </button>
                        )}
                    </div>
                </div>

                {/* Filter and Search Toolbar (Hidden on Projector / OBS for full-screen clean display) */}
                {!isProjectorView && !isOBSView && (
                    <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-black/5 dark:border-white/5">
                        {/* Category Filter Pills */}
                        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                            <button
                                onClick={() => setSelectedCategoryFilter('ALL')}
                                className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                                    selectedCategoryFilter === 'ALL'
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                All Categories ({players.length})
                            </button>
                            {categories.map(cat => {
                                const count = players.filter(p => (p.category || p.role || '').toLowerCase() === cat.name.toLowerCase()).length;
                                return (
                                    <button
                                        key={cat.id || cat.name}
                                        onClick={() => setSelectedCategoryFilter(cat.name)}
                                        className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                                            selectedCategoryFilter === cat.name
                                                ? 'bg-blue-600 text-white shadow-md'
                                                : isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        {cat.name} ({count})
                                    </button>
                                );
                            })}
                        </div>

                        {/* Status & Search */}
                        <div className="flex items-center gap-2.5 w-full sm:w-auto">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as any)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold border focus:outline-none ${
                                    isDark ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-800'
                                }`}
                            >
                                <option value="ALL">All Status</option>
                                <option value="AVAILABLE">Available Only</option>
                                <option value="SOLD">Sold Only</option>
                            </select>

                            <div className="relative flex-1 sm:w-64">
                                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search player name, role..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className={`w-full pl-9 pr-4 py-1.5 rounded-xl text-xs font-bold border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                        isDark ? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500' : 'bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400'
                                    }`}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* TIME'S UP ALERT BANNER WITH RESET AND OK BUTTONS (Admin & Portal only) */}
            {draftState.timerTimeRemaining === 0 && !isTimeUpDismissed && draftState.roundStatus === 'IN_PROGRESS' && !isProjectorView && !isOBSView && (
                <div className="shrink-0 mx-3 md:mx-6 mt-3 p-3.5 rounded-2xl bg-gradient-to-r from-red-950/95 via-red-900/95 to-red-950/95 border-2 border-red-500 shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-pulse z-30">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center font-black shadow-lg shrink-0">
                            <Clock className="w-6 h-6 animate-spin" />
                        </div>
                        <div>
                            <h4 className="text-sm md:text-base font-black uppercase tracking-wider text-white flex items-center gap-2">
                                <span>⏰ TIME&apos;S UP!</span>
                                {currentTurnTeam && (
                                    <span className="text-amber-400 font-black">— {currentTurnTeam.name} Turn Expired</span>
                                )}
                            </h4>
                            <p className="text-[10px] md:text-xs text-red-200 font-bold uppercase tracking-wider">
                                Countdown reached 0s. Reset timer to give extra time, or click OK to proceed.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={handleResetTimer}
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 flex items-center gap-1.5 transition-all"
                        >
                            <RotateCcw className="w-4 h-4" /> Reset Timer
                        </button>
                        <button
                            onClick={handleDismissTimeUp}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 flex items-center gap-1.5 transition-all"
                        >
                            <Check className="w-4 h-4 stroke-[3]" /> OK
                        </button>
                    </div>
                </div>
            )}

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
                {/* Projector & OBS Display: Dedicated 100% Fit-to-Screen Board with ZERO scrolling */}
                {isOBSView && obsMode === 'TOP_HEADER_ONLY' ? (
                    <div className="flex-1 bg-transparent pointer-events-none" />
                ) : isProjectorView || isOBSView ? (
                    draftState.broadcastView === 'SQUADS' ? (
                        <div className={`flex-1 min-h-0 w-full h-full overflow-hidden p-1 ${isObsTransparent ? 'bg-transparent' : themeConfig.containerBg} flex flex-col`}>
                            <ProjectorSquadsView
                                teams={teams}
                                players={players}
                                draftPickMap={draftPickMap}
                                draftState={draftState}
                                selectedTeamId={draftState.selectedTeamSquadId || 'ALL'}
                                isDark={!themeConfig.isLightMode}
                            />
                        </div>
                    ) : (
                        <div className={`flex-1 min-h-0 w-full h-full overflow-hidden p-1 ${isObsTransparent ? 'bg-transparent' : themeConfig.containerBg} flex flex-col`}>
                            <ProjectorFitBoard
                                players={players}
                                categories={categories}
                                teams={teams}
                                draftPickMap={draftPickMap}
                                draftState={draftState}
                                categoryGroups={categoryGroups}
                                layoutMode={draftState.projectorLayoutMode || 'ROWS'}
                                categoryFilter={draftState.broadcastCategoryFilter || 'ALL'}
                                isDark={!themeConfig.isLightMode}
                                transparentBg={isObsTransparent}
                            />
                        </div>
                    )
                ) : (
                    /* Admin & Team Owner Interactive View */
                    <div className="flex-1 min-h-0 p-3 md:p-6 overflow-y-auto custom-scrollbar space-y-6">
                        {pickError && (
                            <div className="px-4 py-2.5 rounded-xl bg-red-950/90 border border-red-500 text-red-100 text-xs font-bold flex items-center justify-between gap-3 shadow-lg">
                                <div className="flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                                    <span>{pickError}</span>
                                </div>
                                <button type="button" onClick={() => setPickError(null)} className="p-1 hover:bg-red-800/60 rounded-lg text-red-200">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                        {isAdmin && !isProjectorView && !isOBSView && draftState.autoAllotEnabled && (
                            <div className="px-3.5 py-2 rounded-xl border border-amber-500/60 bg-amber-950/40 flex items-center justify-between gap-2 text-xs">
                                <span className="font-black text-amber-300 uppercase flex items-center gap-1.5">
                                    <Zap className="w-3.5 h-3.5 fill-current" /> 1-Click Auto-Allot Active &rarr; {activePickingTeamName}
                                </span>
                                <span className="text-[10px] text-amber-200/80 font-bold">Manage in Settings</span>
                            </div>
                        )}

                    {viewMode === 'TABLE' ? (
                        <DraftTableView
                            players={players}
                            categories={categories}
                            teams={teams}
                            draftPickMap={draftPickMap}
                            onSelectPlayer={(p) => {
                                const isSold = p.status === 'SOLD' || draftPickMap.has(String(p.id));
                                if (isAdmin && draftState.autoAllotEnabled && !isSold) {
                                    handleQuickAllotPlayer(p);
                                } else {
                                    setActivePlayerForModal(p);
                                }
                            }}
                            isDark={isDark}
                            isAdmin={isAdmin}
                            isProjectorView={isProjectorView}
                            isOBSView={isOBSView}
                            onUndoPlayer={handleUndoSpecificPlayer}
                        />
                    ) : (
                        // CATEGORY ROWS AND COLUMNS GRID FORMAT
                        categoryGroups.map(group => {
                            if (selectedCategoryFilter !== 'ALL' && group.category.toLowerCase() !== selectedCategoryFilter.toLowerCase()) {
                                return null;
                            }

                            return (
                                <div key={group.category} className="space-y-4">
                                    {/* Category Section Header Banner */}
                                    <div className={`flex items-center justify-between px-4 py-2.5 rounded-2xl border shadow-sm ${
                                        isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-blue-100'
                                    }`}>
                                        <div className="flex items-center gap-2.5">
                                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                                            <h3 className={`text-sm md:text-base font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                                {group.category}
                                            </h3>
                                            <span className="text-[10px] font-bold text-gray-400">
                                                ({group.players.length} Players)
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-3 text-xs">
                                            <span className="text-[10px] font-bold text-emerald-500">
                                                Available: {group.availableCount}
                                            </span>
                                            <span className="text-[10px] font-bold text-zinc-400">
                                                Sold: {group.soldCount}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Players Grid (Rows and Columns) */}
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
                                        {group.players.map(player => {
                                            const pickInfo = draftPickMap.get(String(player.id));
                                            const isSold = player.status === 'SOLD' || !!pickInfo;
                                            const soldTeamName = pickInfo?.teamName || player.soldTo || 'Assigned';
                                            const soldPrice = pickInfo?.soldPrice ?? player.soldPrice ?? globalBasePrice;
                                            const soldTeamLogo = pickInfo?.teamLogo;

                                            return (
                                                <div
                                                    key={player.id}
                                                    onClick={!isProjectorView && !isOBSView ? () => {
                                                        if (isAdmin && draftState.autoAllotEnabled && !isSold) {
                                                            handleQuickAllotPlayer(player);
                                                        } else {
                                                            setActivePlayerForModal(player);
                                                        }
                                                    } : undefined}
                                                    className={`group relative rounded-2xl border-2 p-2 flex flex-col justify-between transition-all duration-200 overflow-hidden ${
                                                        isProjectorView || isOBSView ? 'cursor-default select-none' : 'cursor-pointer'
                                                    } ${
                                                        isSold
                                                            ? isDark 
                                                                ? 'bg-gradient-to-b from-red-950/40 via-zinc-900 to-zinc-950 border-red-500/70 shadow-lg shadow-red-500/10 ring-1 ring-red-500/30' 
                                                                : 'bg-red-50/90 border-red-400 shadow-md ring-1 ring-red-400/30'
                                                            : isAdmin && draftState.autoAllotEnabled
                                                            ? 'bg-zinc-900 border-amber-400/90 ring-2 ring-amber-400/40 hover:border-amber-300 hover:shadow-xl hover:shadow-amber-500/20 hover:scale-[1.02]'
                                                            : isDark
                                                                ? 'bg-zinc-900 border-zinc-700/80 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10'
                                                                : 'bg-white border-gray-300 hover:border-blue-500 hover:shadow-xl'
                                                    }`}
                                                >
                                                    {/* Top Bar on box: Role and Jersey # only - NO BASE PRICE */}
                                                    <div className="flex items-center justify-between gap-1 mb-1 z-10">
                                                        <span className="text-[8px] md:text-[9px] font-black uppercase px-2 py-0.5 rounded bg-black/70 text-amber-400 border border-amber-500/30 truncate max-w-[70%]">
                                                            {player.role || player.category || 'PLAYER'}
                                                        </span>
                                                        {player.jerseyNumber ? (
                                                            <span className="text-[9px] md:text-[10px] font-black text-white bg-zinc-800 px-1.5 py-0.5 rounded">
                                                                #{player.jerseyNumber}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[9px] font-bold text-zinc-500">
                                                                #{player.id}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Player Photo with BOLD SOLD Box Overlay */}
                                                    <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 my-1">
                                                        {player.photoUrl ? (
                                                            <img 
                                                                src={player.photoUrl} 
                                                                alt={player.name}
                                                                className={`w-full h-full object-cover object-top transition-transform duration-300 ${
                                                                    !isProjectorView && !isOBSView ? 'group-hover:scale-105' : ''
                                                                }`} 
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center font-black text-2xl text-zinc-600 bg-zinc-900">
                                                                {player.name.charAt(0)}
                                                            </div>
                                                        )}

                                                        {/* SOLD OVERLAY: Keeps face visible with top badge and bottom winning franchise gradient banner */}
                                                        {isSold && (
                                                            <>
                                                                <div className="absolute top-1 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white font-black text-[9px] uppercase tracking-widest shadow-xl rounded-md z-20 whitespace-nowrap border border-red-300">
                                                                    SOLD
                                                                </div>
                                                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent pt-3 pb-1 px-1 flex flex-col items-center justify-center text-center z-20">
                                                                    {soldTeamLogo && (
                                                                        <img src={soldTeamLogo} alt="" className="w-5 h-5 rounded-full object-contain bg-white p-0.5 mb-0.5 shadow-md border border-amber-400" />
                                                                    )}
                                                                    <p className="text-[9px] md:text-[10px] font-black text-amber-300 uppercase tracking-tight line-clamp-1 leading-tight drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">
                                                                        {soldTeamName}
                                                                    </p>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>

                                                    {/* Player Name */}
                                                    <div className="text-center mt-0.5">
                                                        <h4 className={`text-xs md:text-sm font-black uppercase tracking-tight line-clamp-1 ${
                                                            isDark ? 'text-white' : 'text-gray-900'
                                                        }`}>
                                                            {player.name}
                                                        </h4>
                                                    </div>

                                                    {/* Bottom Status Box: Bold Fit-To-Size Sold and Team Name */}
                                                    <div className="mt-1.5 pt-1 border-t border-black/10 dark:border-white/10 flex items-center justify-between text-[9px]">
                                                        {isSold ? (
                                                            <div className="w-full py-1 px-1.5 rounded-lg bg-gradient-to-r from-red-600/20 via-amber-500/25 to-yellow-500/20 border-2 border-amber-400/70 shadow-sm flex items-center justify-between gap-1 overflow-hidden">
                                                                <div className="flex items-center gap-1.5 min-w-0">
                                                                    <span className="px-1.5 py-0.5 rounded bg-red-600 text-white font-black text-[8px] md:text-[9px] uppercase tracking-wider shrink-0 shadow">
                                                                        SOLD
                                                                    </span>
                                                                    <span className="text-[10px] md:text-xs font-black uppercase tracking-tight text-amber-300 truncate drop-shadow">
                                                                        {soldTeamName}
                                                                    </span>
                                                                </div>
                                                                {isAdmin && !isProjectorView && !isOBSView && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleUndoSpecificPlayer(player);
                                                                        }}
                                                                        className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-red-600/30 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 transition-all flex items-center gap-1 active:scale-95 shrink-0 shadow-sm ml-auto"
                                                                        title={`Undo ${player.name} sale & restore to Available`}
                                                                    >
                                                                        <Undo2 className="w-2.5 h-2.5" /> Undo
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className={`w-full py-1 px-1.5 rounded-lg border flex items-center justify-center text-center shadow-sm transition-all ${
                                                                isAdmin && draftState.autoAllotEnabled
                                                                    ? 'bg-amber-500/25 border-amber-400 text-amber-300 font-black shadow-amber-500/20'
                                                                    : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 font-black'
                                                            }`}>
                                                                <span className="uppercase text-[8px] md:text-[9px] flex items-center justify-center gap-1">
                                                                    {isAdmin && draftState.autoAllotEnabled ? (
                                                                        <>
                                                                            <Zap className="w-2.5 h-2.5 fill-current" /> Allot to {activePickingTeamName}
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Check className="w-2.5 h-2.5 stroke-[3]" /> Available
                                                                        </>
                                                                    )}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Right Column: Admin Draft Controls Panel (If Admin) or Live Pick History & Squad - Hidden on Projector / OBS */}
                {!isProjectorView && !isOBSView && (
                    isAdmin ? (
                        <div className="w-full lg:w-96 shrink-0 border-t lg:border-t-0 lg:border-l p-4 overflow-y-auto custom-scrollbar border-zinc-800 bg-zinc-900/50">
                            <DraftAdminControls
                                draftState={draftState}
                                customAudio={customAudio}
                                teams={teams}
                                players={players}
                                categories={categories}
                                auctionId={auctionId}
                                onStartNextRound={async () => {
                                    const nextRoundNumber = draftState.currentRound + 1;
                                    const isSnake = draftState.orderType === 'SNAKE';
                                    // In Snake draft, reverse the team order for even rounds
                                    const reversed = [...teams.map(t => t.id)].reverse();
                                    const newRoundOrder = (isSnake && nextRoundNumber % 2 === 0) 
                                        ? reversed 
                                        : teams.map(t => t.id);

                                    const nextPayload = {
                                        draftBoardState: {
                                            ...draftState,
                                            currentRound: nextRoundNumber,
                                            currentTurnIndex: 0,
                                            currentTeamId: newRoundOrder[0] || null,
                                            roundOrder: newRoundOrder,
                                            roundStatus: 'IN_PROGRESS',
                                            timerTimeRemaining: Number(draftState.turnTimerSeconds || 45),
                                            isTimerRunning: true,
                                            updatedAt: Date.now()
                                        }
                                    };
                                    const cleanNext = JSON.parse(JSON.stringify(nextPayload));
                                    await db.collection('auctions').doc(auctionId).set(cleanNext, { merge: true });
                                }}
                            />
                        </div>
                    ) : (
                        /* Spectator / Team Owner Side Dossier */
                        <div className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l p-4 overflow-y-auto custom-scrollbar border-zinc-800 bg-zinc-900/30">
                            <div className="space-y-5">
                                {/* Team Owner's Active Squad Summary */}
                                {myTeam && (
                                    <div className={`p-4 rounded-2xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`}>
                                        <div className="flex items-center justify-between mb-3 border-b pb-2 border-white/5">
                                            <div className="flex items-center gap-2">
                                                <Crown className="w-4 h-4 text-amber-500" />
                                                <h4 className="text-xs font-black uppercase text-white">Your Squad ({myTeam.players?.length || 0})</h4>
                                            </div>
                                            <span className="text-xs font-black text-blue-400">{myTeam.players?.length || 0} Drafted</span>
                                        </div>
                                        <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                            {(myTeam.players || []).length > 0 ? (
                                                myTeam.players.map(p => (
                                                    <div key={p.id} className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-zinc-800/60">
                                                        <span className="font-bold text-white text-[11px] truncate">{p.name}</span>
                                                        <span className="text-[9px] text-zinc-400 font-bold uppercase">{p.role || 'Player'}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-[10px] text-zinc-500 font-bold uppercase text-center py-4">No picks yet</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Recent Draft Picks Feed */}
                                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`}>
                                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-500 mb-3 flex items-center gap-2">
                                        <Sparkles className="w-4 h-4" /> Recent Draft Picks
                                    </h4>
                                    <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                                        {(draftState.history || []).slice().reverse().map(h => (
                                            <div key={h.id} className="p-2 rounded-xl border border-zinc-800 bg-zinc-800/40 flex items-center justify-between gap-2 text-xs">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {h.playerPhoto ? (
                                                        <img src={h.playerPhoto} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0" />
                                                    ) : (
                                                        <div className="w-7 h-7 rounded-lg bg-zinc-700 flex items-center justify-center font-bold text-[10px]">
                                                            {h.playerName.charAt(0)}
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-white truncate text-[11px]">{h.playerName}</p>
                                                        <p className="text-[8px] text-amber-400 uppercase font-black">{h.teamName}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300">
                                                        R{h.round} #{h.pickNumber}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                        {(!draftState.history || draftState.history.length === 0) && (
                                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest text-center py-6 font-bold">
                                                Draft picks will appear here live
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                )}
            </div>

            {/* PLAYER NOMINATION & ASSIGNMENT MODAL */}
            {activePlayerForModal && (
                <DraftNominationModal
                    player={activePlayerForModal}
                    teams={teams}
                    currentTurnTeam={currentTurnTeam}
                    myTeam={myTeam}
                    isAdmin={isAdmin}
                    isMyTurn={isMyTurn}
                    isPickingAllowed={draftState.teamPickingEnabled !== false}
                    onClose={() => setActivePlayerForModal(null)}
                    onAssign={(player, teamId, price) => handleAssignPlayer(player, teamId, price)}
                    onUndoPlayer={handleUndoSpecificPlayer}
                />
            )}

            {renderUnsoldBannerOverlay()}

            {/* CONFIGURABLE SOLD CELEBRATION POPUP ACROSS ALL SCREENS */}
            <SoldCelebrationPopup
                celebrationData={draftState.lastSoldCelebration}
                durationMs={soldPopupDurationMs}
                customSoldAudioUrl={customAudio?.soldMusicUrl}
                players={players}
                teams={teams}
            />
        </div>
    );
};

export default CategoryDraftBoard;
