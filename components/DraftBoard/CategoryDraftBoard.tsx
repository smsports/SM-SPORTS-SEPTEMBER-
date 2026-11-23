import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuction } from '../../hooks/useAuction';
import { useTheme } from '../../contexts/ThemeContext';
import { Player, Team, AuctionCategory, DraftBoardState, DraftPickHistory, DraftCelebrationData, PendingDraftPickRequest } from '../../types';
import { db, auth } from '../../firebase';
import { 
    Users, Clock, Trophy, ChevronRight, CheckCircle2, AlertCircle, 
    Search, Filter, LayoutGrid, Table as TableIcon, Undo2, RotateCcw, 
    Play, Pause, FastForward, Check, X, Shield, Wallet, Sparkles, 
    Crown, Tag, Eye, ArrowRight, Gavel, RefreshCw, Monitor, Cast, Copy, ExternalLink,
    Volume2, VolumeX, Maximize, Minimize, Columns, Zap, Lock, Ban, Star
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
import { compactTeamPlayerEntry, safeBuildTeamUpdatePayload, resolveDraftTeamSquad } from '../../utils';

interface Props {
    isAdmin?: boolean;
    isCurator?: boolean;
    isTeamOwner?: boolean;
    myTeam?: Team | null;
    isProjectorView?: boolean;
    isOBSView?: boolean;
    auctionId?: string;
}

export const CategoryDraftBoard: React.FC<Props> = ({
    isAdmin = false,
    isCurator = false,
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
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'SOLD' | 'WISHLIST'>('ALL');

    // Audio & Time's Up Alert States
    const [isMuted, setIsMuted] = useState<boolean>(isDraftAudioMuted());
    const [isTimeUpDismissed, setIsTimeUpDismissed] = useState<boolean>(false);
    const prevSecondsRef = useRef<number>(draftState.timerTimeRemaining);
    const [pickError, setPickError] = useState<string | null>(null);
    const [pickNotice, setPickNotice] = useState<string | null>(null);
    const [pendingPickRequests, setPendingPickRequests] = useState<PendingDraftPickRequest[]>([]);
    const [isRequestPopupMinimized, setIsRequestPopupMinimized] = useState<boolean>(false);
    const [isApprovingPopup, setIsApprovingPopup] = useState<boolean>(false);
    const lastTopRequestIdRef = useRef<string | null>(null);
    const [lastProcessedRequestNotice, setLastProcessedRequestNotice] = useState<string | null>(null);
    const dismissedRequestIdsRef = useRef<Set<string>>(new Set());
    const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pickNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const showProcessedNotice = (text: string) => {
        setLastProcessedRequestNotice(text);
        if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = setTimeout(() => {
            setLastProcessedRequestNotice(null);
        }, 8000);
    };
    const showPickNotice = (text: string) => {
        setPickNotice(text);
        if (pickNoticeTimerRef.current) clearTimeout(pickNoticeTimerRef.current);
        pickNoticeTimerRef.current = setTimeout(() => {
            setPickNotice(null);
        }, 7000);
    };

    useEffect(() => {
        const topId = pendingPickRequests[0]?.requestId || null;
        if (topId && topId !== lastTopRequestIdRef.current) {
            setIsRequestPopupMinimized(false);
        }
        lastTopRequestIdRef.current = topId;
    }, [pendingPickRequests]);
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

    const isPermissionErr = (err: any) =>
        err?.code === 'permission-denied' ||
        String(err?.message || '').toLowerCase().includes('permission');

    const dispatchCuratorRelay = async (action: string, data?: Record<string, any>) => {
        if (!auctionId) return;
        try {
            if (!auth.currentUser) {
                await auth.signInAnonymously();
            }
        } catch {
            // proceed best-effort
        }
        const actionId = `cur_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const cleanPayload = JSON.parse(JSON.stringify({
            actionId,
            auctionId,
            action,
            data: data || {},
            status: 'PENDING',
            requestedByUid: auth.currentUser?.uid || null,
            requestedAt: Date.now()
        }));

        let dispatched = false;
        try {
            await db.collection('scoringAssets').doc(`curator_action_${auctionId}`).set(cleanPayload);
            dispatched = true;
        } catch (e) {
            console.warn('Curator relay scoringAssets dispatch skipped:', e);
        }
        try {
            await db.collection('auctions').doc(auctionId).collection('auctionLogs').add({
                type: 'CURATOR_ACTION',
                ...cleanPayload,
                message: `Curator action: ${action}`,
                timestamp: Date.now()
            });
            dispatched = true;
        } catch (e) {
            console.warn('Curator relay auctionLogs dispatch skipped:', e);
        }
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                const ch = new BroadcastChannel(`sm_curator_action_${auctionId}`);
                ch.postMessage({ type: 'CURATOR_ACTION', payload: cleanPayload });
                ch.close();
                dispatched = true;
            }
        } catch {
            // optional
        }

        if (!dispatched) {
            setPickError('Permission denied: Could not save or relay Curator action. Please ensure Admin Dashboard is open or sign in.');
            throw new Error('Missing or insufficient permissions.');
        }

        if (action !== 'UPDATE_AUCTION_FIELDS') {
            showProcessedNotice(`Curator command (${action.replace(/_/g, ' ')}) sent to Admin Console.`);
        }
    };

    const updateAuctionFieldsWithRelay = async (fields: Record<string, any>) => {
        if (!auctionId) return;
        try {
            await db.collection('auctions').doc(auctionId).update(fields);
        } catch (err: any) {
            if (isCurator && isPermissionErr(err)) {
                await dispatchCuratorRelay('UPDATE_AUCTION_FIELDS', { fields });
            } else {
                throw err;
            }
        }
    };

    // Reset Turn Timer handler
    const handleResetTimer = async () => {
        if (!auctionId) return;
        const defaultSec = Number(draftState.turnTimerSeconds || 45);
        setIsTimeUpDismissed(false);
        await updateAuctionFieldsWithRelay({
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
            await updateAuctionFieldsWithRelay({
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

    // Turn timer effect for active timer (Curator defers to active Admin unless Admin update timestamp is >2.5s stale)
    useEffect(() => {
        if (!isAdmin || !draftState.isTimerRunning) return;

        const interval = setInterval(() => {
            if (isCurator && Date.now() - Number(draftStateRef.current.updatedAt || 0) < 2500) {
                return;
            }
            if (draftState.timerTimeRemaining > 1) {
                db.collection('auctions').doc(auctionId).update({
                    'draftBoardState.timerTimeRemaining': draftState.timerTimeRemaining - 1,
                    'draftBoardState.updatedAt': Date.now()
                }).catch(() => {});
            } else if (draftState.timerTimeRemaining === 1) {
                db.collection('auctions').doc(auctionId).update({
                    'draftBoardState.timerTimeRemaining': 0,
                    'draftBoardState.isTimerRunning': false,
                    'draftBoardState.updatedAt': Date.now()
                }).catch(() => {});
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [isAdmin, isCurator, draftState.isTimerRunning, draftState.timerTimeRemaining, auctionId]);

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

    // Canonical ordered list of all category names respecting Admin Category Display Order
    const orderedCategoryNames = useMemo(() => {
        const namesSet = new Set<string>();
        categories.forEach(c => c.name && namesSet.add(c.name));
        if (namesSet.size === 0) {
            namesSet.add('Batsman');
            namesSet.add('Bowler');
            namesSet.add('All-Rounder');
            namesSet.add('Wicketkeeper');
        }
        players.forEach(p => {
            const cat = p.category || p.role || 'Uncategorized';
            if (cat) namesSet.add(cat);
        });

        const baseList = Array.from(namesSet);
        const customOrder = draftState.categoryOrder || [];
        if (customOrder.length === 0) return baseList;

        const orderMap = new Map<string, number>();
        customOrder.forEach((name, idx) => {
            orderMap.set(name.trim().toLowerCase(), idx);
        });

        return [...baseList].sort((a, b) => {
            const idxA = orderMap.get(a.trim().toLowerCase());
            const idxB = orderMap.get(b.trim().toLowerCase());
            if (idxA !== undefined && idxB !== undefined) return idxA - idxB;
            if (idxA !== undefined) return -1;
            if (idxB !== undefined) return 1;
            return 0;
        });
    }, [categories, players, draftState.categoryOrder]);

    // Admin-curated wishlist set synced via draftBoardState.wishlistPlayerIds
    const adminWishlistSet = useMemo(() => {
        const raw = draftState.wishlistPlayerIds || [];
        return new Set(raw.map(id => String(id)));
    }, [draftState.wishlistPlayerIds]);

    const handleToggleAdminWishlist = async (player: Player) => {
        if (!auctionId || !isAdmin) return;
        const pid = String(player.id);
        const currentIds = (draftState.wishlistPlayerIds || []).map(id => String(id));
        const exists = currentIds.includes(pid);
        const nextIds = exists
            ? currentIds.filter(id => id !== pid)
            : [...currentIds, pid];

        await updateAuctionFieldsWithRelay({
            'draftBoardState.wishlistPlayerIds': nextIds,
            'draftBoardState.updatedAt': Date.now()
        }).catch((err: any) => {
            console.error('Failed to update admin wishlist:', err);
        });
    };

    const handleClearAdminWishlist = async () => {
        if (!auctionId || !isAdmin || adminWishlistSet.size === 0) return;
        if (!window.confirm('Clear all players from Admin Wishlist?')) return;
        await updateAuctionFieldsWithRelay({
            'draftBoardState.wishlistPlayerIds': [],
            'draftBoardState.updatedAt': Date.now()
        }).catch((err: any) => {
            console.error('Failed to clear admin wishlist:', err);
        });
        if (statusFilter === 'WISHLIST') {
            setStatusFilter('ALL');
        }
    };

    // Group players by Category / Role
    const categoryGroups = useMemo(() => {
        const list = orderedCategoryNames;

        // Filter players according to query and status
        const filtered = players.filter(p => {
            const matchesQuery = searchQuery === '' || 
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.role && p.role.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase()));

            const isSold = p.status === 'SOLD' || draftPickMap.has(String(p.id));
            const matchesStatus = statusFilter === 'ALL' ||
                (statusFilter === 'AVAILABLE' && !isSold) ||
                (statusFilter === 'SOLD' && isSold) ||
                (statusFilter === 'WISHLIST' && adminWishlistSet.has(String(p.id)));

            return matchesQuery && matchesStatus;
        });

        const groups: { category: string; players: Player[]; availableCount: number; soldCount: number }[] = [];

        list.forEach(catName => {
            const catPlayers = filtered.filter(p => {
                const pCat = (p.category || p.role || 'Uncategorized').trim().toLowerCase();
                return pCat === catName.trim().toLowerCase();
            });

            if (catPlayers.length > 0 || (selectedCategoryFilter === 'ALL' && statusFilter === 'ALL' && searchQuery === '')) {
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
    }, [orderedCategoryNames, players, draftPickMap, searchQuery, statusFilter, selectedCategoryFilter, adminWishlistSet]);

    const playersRef = useRef(players);
    playersRef.current = players;
    const teamsRef = useRef(teams);
    teamsRef.current = teams;
    const draftStateRef = useRef(draftState);
    draftStateRef.current = draftState;
    const draftPickMapRef = useRef(draftPickMap);
    draftPickMapRef.current = draftPickMap;
    const processedPickRequestsRef = useRef<Set<string>>(new Set());
    const reconcilingKeysRef = useRef<Set<string>>(new Set());

    // Helper to persist player & team subcollection docs (reads fresh team doc so list size matches strict rules, falls back to query if doc id differs)
    const syncPlayerAndTeamDocs = async (
        targetPlayer: Player,
        targetTeam: Team,
        effectivePrice: number
    ): Promise<void> => {
        const playerAlreadySynced =
            targetPlayer.status === 'SOLD' &&
            String(targetPlayer.soldToId || targetPlayer.teamId || '') === String(targetTeam.id);

        if (!playerAlreadySynced) {
            const playerUpdateData = JSON.parse(JSON.stringify({
                status: 'SOLD',
                soldTo: targetTeam.name || 'Team',
                soldToId: targetTeam.id,
                teamId: targetTeam.id,
                soldPrice: effectivePrice,
                soldAt: Date.now()
            }));
            const playersCol = db.collection('auctions').doc(auctionId).collection('players');
            try {
                await playersCol.doc(String(targetPlayer.id)).update(playerUpdateData);
            } catch (pErr: any) {
                const isNotFound = pErr?.code === 'not-found' || String(pErr?.message || '').toLowerCase().includes('no document to update');
                if (!isNotFound) throw pErr;
                let matchedSnap = await playersCol.where('id', '==', targetPlayer.id).limit(1).get();
                if (matchedSnap.empty) {
                    matchedSnap = await playersCol.where('id', '==', String(targetPlayer.id)).limit(1).get();
                }
                if (!matchedSnap.empty) {
                    await matchedSnap.docs[0].ref.update(playerUpdateData);
                } else {
                    throw pErr;
                }
            }
        }

        const teamsCol = db.collection('auctions').doc(auctionId).collection('teams');
        let teamDocRef = teamsCol.doc(String(targetTeam.id));
        let freshData: any = targetTeam;
        let freshPlayers: any[] = targetTeam.players || [];
        let freshBudget = Number(targetTeam.budget || 0);
        try {
            let freshSnap: any = await teamDocRef.get();
            if (!freshSnap.exists) {
                let qSnap = await teamsCol.where('id', '==', targetTeam.id).limit(1).get();
                if (qSnap.empty) {
                    qSnap = await teamsCol.where('id', '==', String(targetTeam.id)).limit(1).get();
                }
                if (!qSnap.empty) {
                    freshSnap = qSnap.docs[0];
                    teamDocRef = freshSnap.ref;
                }
            }
            if (freshSnap.exists) {
                const snapData = freshSnap.data() as any;
                freshData = snapData || targetTeam;
                if (Array.isArray(snapData?.players)) {
                    freshPlayers = snapData.players;
                }
                if (typeof snapData?.budget === 'number') {
                    freshBudget = snapData.budget;
                }
            }
        } catch {
            // Fall back to snapshot state if direct read fails
        }

        const alreadyInSquad = freshPlayers.some((p: any) => String(p?.id) === String(targetPlayer.id));
        if (!alreadyInSquad) {
            const minimalPlayer = compactTeamPlayerEntry({
                id: targetPlayer.id,
                name: targetPlayer.name || '',
                role: targetPlayer.role || 'Player',
                category: targetPlayer.category || 'General',
                photoUrl: targetPlayer.photoUrl || '',
                basePrice: Number(targetPlayer.basePrice || globalBasePrice || 0),
                soldPrice: effectivePrice,
                status: 'SOLD',
                soldTo: targetTeam.name || '',
                jerseyNumber: targetPlayer.jerseyNumber || '',
                jerseyName: targetPlayer.jerseyName || ''
            });
            const updatedTeamPlayers = [...freshPlayers, minimalPlayer];
            const updatedBudget = Math.max(0, freshBudget - effectivePrice);
            const teamUpdatePayload = await safeBuildTeamUpdatePayload(freshData, updatedBudget, updatedTeamPlayers);

            await teamDocRef.update(teamUpdatePayload);
        }
    };

    // Handle Assign Player to Team
    const handleAssignPlayer = async (player: Player, teamId: string | number, price: number): Promise<{ ok: boolean; error?: string }> => {
        if (!auctionId) return { ok: false, error: 'Missing auction ID.' };
        setPickError(null);

        if (player.status === 'SOLD' || draftPickMapRef.current.has(String(player.id))) {
            const msg = `${player.name} is already sold.`;
            setPickError(msg);
            return { ok: false, error: msg };
        }

        const currentDraft = draftStateRef.current;

        if (isTeamOwner && !isAdmin) {
            if (currentDraft.teamPickingEnabled === false) {
                const msg = 'Picking is currently locked by the auction admin.';
                setPickError(msg);
                return { ok: false, error: msg };
            }
            if (!myTeam || String(myTeam.id) !== String(currentDraft.currentTeamId)) {
                const msg = 'Please wait for your team turn before drafting a player.';
                setPickError(msg);
                return { ok: false, error: msg };
            }
        }

        const effectiveTeamId = (isTeamOwner && !isAdmin && myTeam) ? myTeam.id : teamId;
        const targetTeam = teamsRef.current.find(t => String(t.id) === String(effectiveTeamId));
        if (!targetTeam) return { ok: false, error: 'Target team not found.' };

        const effectivePrice = Math.max(0, Number(price || 0));

        // Compact media helper: keep HTTPS URLs (<1000 chars), drop raw Base64 blobs from root auction doc
        // so draftBoardState.history & lastSoldCelebration never trigger Firestore's 1 MiB document limit.
        const compactMediaRef = (url?: string): string => {
            if (!url) return '';
            if (url.startsWith('data:') && url.length > 1000) return '';
            return url;
        };

        const newPick: DraftPickHistory = {
            id: `pick_${Date.now()}`,
            round: Number(currentDraft.currentRound || 1),
            pickNumber: Number(currentDraft.history?.length || 0) + 1,
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

        const sanitizedPriorHistory = (currentDraft.history || []).map(h => ({
            ...h,
            teamLogo: compactMediaRef(h.teamLogo),
            playerPhoto: compactMediaRef(h.playerPhoto)
        }));
        const updatedHistory = [...sanitizedPriorHistory, newPick];

        const currentOrder = (currentDraft.roundOrder && currentDraft.roundOrder.length > 0)
            ? currentDraft.roundOrder 
            : teamsRef.current.map(t => t.id);

        const nextTurnIndex = Number(currentDraft.currentTurnIndex || 0) + 1;
        const isRoundFinished = nextTurnIndex >= currentOrder.length;

        const nextRound = Number(currentDraft.currentRound || 1);
        const nextTeamId = isRoundFinished ? null : (currentOrder[nextTurnIndex] ?? null);
        const nextStatus: 'IDLE' | 'IN_PROGRESS' | 'ROUND_COMPLETED' = isRoundFinished ? 'ROUND_COMPLETED' : 'IN_PROGRESS';

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
            'draftBoardState.timerTimeRemaining': Number(currentDraft.turnTimerSeconds || 45),
            'draftBoardState.isTimerRunning': !isRoundFinished,
            'draftBoardState.selectedPlayerId': null,
            'draftBoardState.lastSoldCelebration': celebrationData,
            'draftBoardState.updatedAt': Date.now()
        }));

        try {
            if (!auth.currentUser) {
                await auth.signInAnonymously();
            }

            if (isAdmin) {
                try {
                    await syncPlayerAndTeamDocs(player, targetTeam, effectivePrice);
                    await db.collection('auctions').doc(auctionId).update(draftBoardAtomicUpdate);
                } catch (adminErr: any) {
                    if (isCurator && isPermissionErr(adminErr)) {
                        await dispatchCuratorRelay('ASSIGN_PLAYER', {
                            playerId: player.id,
                            teamId: targetTeam.id,
                            price: effectivePrice
                        });
                        setActivePlayerForModal(null);
                        return { ok: true };
                    }
                    throw adminErr;
                }
            } else {
                // TEAM OWNER FLOW:
                const isApprovalRequired = currentDraft.pickRequestApprovalEnabled === true;
                let directRootSucceeded = false;
                let shouldDispatchRelay = isApprovalRequired;

                if (!isApprovalRequired) {
                    // 1) Update root draftBoardState FIRST when direct picking is active so history, turn advance, SOLD popup & sound sync immediately
                    try {
                        await db.collection('auctions').doc(auctionId).update(draftBoardAtomicUpdate);
                        directRootSucceeded = true;
                    } catch (rootErr: any) {
                        const isPerm = rootErr?.code === 'permission-denied' || String(rootErr?.message || '').toLowerCase().includes('permission');
                        if (!isPerm) {
                            throw rootErr;
                        }
                        shouldDispatchRelay = true;
                    }
                }

                if (directRootSucceeded) {
                    // Best-effort sync of subcollection docs; if restricted for anonymous users, Admin's auto-reconcile effect syncs them cleanly.
                    try {
                        await syncPlayerAndTeamDocs(player, targetTeam, effectivePrice);
                    } catch (subErr: any) {
                        console.warn('Subcollection sync deferred to Admin auto-reconcile:', subErr?.code || subErr?.message);
                    }
                } else if (shouldDispatchRelay) {
                    // 2) Dispatch Pick Request to Admin Panel via signed-in writable collections (scoringAssets + auctionLogs) + BroadcastChannel.
                    const requestId = `pickreq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                    const reqPayload = {
                        auctionId,
                        requestId,
                        playerId: String(player.id),
                        playerName: player.name || '',
                        teamId: String(targetTeam.id),
                        teamName: targetTeam.name || '',
                        price: effectivePrice,
                        round: nextRound,
                        turnIndex: Number(currentDraft.currentTurnIndex || 0),
                        status: 'PENDING',
                        requiresApproval: isApprovalRequired,
                        requestedByUid: auth.currentUser?.uid || null,
                        requestedAt: Date.now()
                    };

                    let relayDispatched = false;
                    try {
                        await db.collection('scoringAssets').doc(`draft_pick_${auctionId}`).set(reqPayload);
                        relayDispatched = true;
                    } catch (err) {
                        console.warn('Relay scoringAssets dispatch skipped:', err);
                    }
                    try {
                        await db.collection('auctions').doc(auctionId).collection('auctionLogs').add({
                            type: 'DRAFT_PICK_REQUEST',
                            ...reqPayload,
                            message: `${targetTeam.name} requested pick: ${player.name}`,
                            timestamp: Date.now()
                        });
                        relayDispatched = true;
                    } catch (err) {
                        console.warn('Relay auctionLogs dispatch skipped:', err);
                    }
                    try {
                        if (typeof BroadcastChannel !== 'undefined') {
                            const ch = new BroadcastChannel(`sm_draft_pick_${auctionId}`);
                            ch.postMessage({ type: 'DRAFT_PICK_REQUEST', payload: reqPayload });
                            ch.close();
                            relayDispatched = true;
                        }
                    } catch {
                        // BroadcastChannel optional
                    }

                    if (!relayDispatched) {
                        throw new Error('Missing or insufficient permissions.');
                    }

                    // When Admin Pick Request Approval Mode is ON, return immediately with a positive notice and wait for Admin approval
                    if (isApprovalRequired) {
                        setActivePlayerForModal(null);
                        showPickNotice(`Pick request sent to Admin for approval: ${player.name} (${targetTeam.name}). Waiting for Admin to mark SOLD.`);
                        return { ok: true };
                    }

                    // Otherwise wait up to 8s for connected Admin Draft Board to auto-finalize the relay request
                    const relayResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
                        let settled = false;
                        let unsubAuction: () => void = () => {};
                        let unsubPlayerDoc: () => void = () => {};
                        let unsubReq: () => void = () => {};
                        let channel: BroadcastChannel | null = null;

                        const finish = (res: { ok: boolean; error?: string }) => {
                            if (settled) return;
                            settled = true;
                            clearTimeout(timeoutId);
                            unsubAuction();
                            unsubPlayerDoc();
                            unsubReq();
                            if (channel) {
                                try { channel.close(); } catch {}
                            }
                            resolve(res);
                        };

                        const timeoutId = setTimeout(() => {
                            finish({
                                ok: false,
                                error: 'Pick request sent to Admin Panel! Keep the Admin Draft Dashboard open so the Admin can finalize or approve your pick.'
                            });
                        }, 8000);

                        unsubAuction = db.collection('auctions').doc(auctionId).onSnapshot((snap) => {
                            const data = snap.data() as any;
                            const hist: any[] = data?.draftBoardState?.history || [];
                            const lastCel = data?.draftBoardState?.lastSoldCelebration;
                            if (
                                hist.some(h => String(h.playerId) === String(player.id)) ||
                                (lastCel && String(lastCel.playerId) === String(player.id))
                            ) {
                                finish({ ok: true });
                            }
                        }, () => {});

                        unsubPlayerDoc = db.collection('auctions').doc(auctionId).collection('players').doc(String(player.id)).onSnapshot((snap) => {
                            const pData = snap.data() as any;
                            if (pData?.status === 'SOLD') {
                                finish({ ok: true });
                            }
                        }, () => {});

                        unsubReq = db.collection('scoringAssets').doc(`draft_pick_${auctionId}`).onSnapshot((snap) => {
                            const reqData = snap.data() as any;
                            if (reqData && reqData.requestId === requestId && reqData.status === 'ERROR') {
                                finish({ ok: false, error: reqData.errorMessage || 'Pick rejected by auction rules.' });
                            }
                        }, () => {});

                        try {
                            if (typeof BroadcastChannel !== 'undefined') {
                                channel = new BroadcastChannel(`sm_draft_pick_${auctionId}`);
                                channel.onmessage = (ev) => {
                                    if (ev?.data?.type === 'DRAFT_PICK_RESULT' && ev.data.requestId === requestId) {
                                        finish({ ok: !!ev.data.ok, error: ev.data.error });
                                    }
                                };
                            }
                        } catch {
                            // optional
                        }
                    });

                    if (!relayResult.ok) {
                        setPickError(relayResult.error || 'Unable to confirm pick.');
                        return { ok: false, error: relayResult.error };
                    }
                }
            }

            // Confetti celebration
            confetti({
                particleCount: 50,
                spread: 70,
                origin: { y: 0.6 }
            });

            setActivePlayerForModal(null);
            return { ok: true };
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
            const friendlyErr =
                err?.message?.includes('permission') || err?.code === 'permission-denied'
                    ? 'Assignment failed: Missing or insufficient permissions. Please verify Firestore rules are deployed or sign in as Admin.'
                    : `Assignment failed: ${err?.message || 'Unable to save pick.'}`;
            setPickError(friendlyErr);
            return { ok: false, error: friendlyErr };
        }
    };

    const handleAssignPlayerRef = useRef(handleAssignPlayer);
    handleAssignPlayerRef.current = handleAssignPlayer;

    const broadcastRelayResult = (requestId: string, ok: boolean, error?: string) => {
        try {
            if (typeof BroadcastChannel !== 'undefined' && auctionId) {
                const ch = new BroadcastChannel(`sm_draft_pick_${auctionId}`);
                ch.postMessage({ type: 'DRAFT_PICK_RESULT', requestId, ok, error });
                ch.close();
            }
        } catch {
            // optional
        }
    };

    const upsertPendingRequest = (req: PendingDraftPickRequest) => {
        setPendingPickRequests(prev => {
            const idx = prev.findIndex(r => r.requestId === req.requestId);
            if (idx >= 0) {
                const existing = prev[idx];
                if (
                    existing.status === req.status &&
                    existing.errorMessage === req.errorMessage &&
                    existing.requiresApproval === req.requiresApproval &&
                    existing.playerName === req.playerName &&
                    existing.teamName === req.teamName &&
                    existing.logDocId === (req.logDocId ?? existing.logDocId)
                ) {
                    return prev;
                }
                const copy = [...prev];
                copy[idx] = { ...existing, ...req };
                return copy;
            }
            return [req, ...prev];
        });
    };

    const removePendingRequest = (requestId: string) => {
        setPendingPickRequests(prev => prev.filter(r => r.requestId !== requestId));
    };

    const enqueueAndProcessPickRequestRef = useRef<
        (req: any, source: 'SCORING_ASSETS' | 'AUCTION_LOGS' | 'BROADCAST') => Promise<void>
    >(async () => {});

    enqueueAndProcessPickRequestRef.current = async (
        req: any,
        source: 'SCORING_ASSETS' | 'AUCTION_LOGS' | 'BROADCAST'
    ) => {
        if (!isAdmin || !auctionId || !req) return;
        const requestId = String(req.requestId || req.id || '').trim();
        if (!requestId || !req.playerId || !req.teamId) return;
        if (req.status === 'PROCESSED' || req.status === 'ERROR') return;
        if (dismissedRequestIdsRef.current.has(requestId)) return;

        // Generous 30-min window and never drop negative clock-skew offsets
        const rawTs = Number(req.requestedAt || req.timestamp || 0);
        if (rawTs > 0 && Date.now() - rawTs > 30 * 60 * 1000) return;

        const matchedPlayer = playersRef.current.find(p => String(p.id) === String(req.playerId));
        const matchedTeam = teamsRef.current.find(t => String(t.id) === String(req.teamId));
        const alreadySold = (matchedPlayer?.status === 'SOLD') || draftPickMapRef.current.has(String(req.playerId));

        if (alreadySold) {
            removePendingRequest(requestId);
            if (source === 'SCORING_ASSETS') {
                db.collection('scoringAssets').doc(`draft_pick_${auctionId}`).update({
                    status: 'PROCESSED',
                    processedAt: Date.now()
                }).catch(() => {});
            }
            broadcastRelayResult(requestId, true);
            return;
        }

        const requiresManualApproval = draftStateRef.current.pickRequestApprovalEnabled === true || req.requiresApproval === true;

        const normalizedReq: PendingDraftPickRequest = {
            requestId,
            auctionId,
            playerId: String(req.playerId),
            playerName: String(req.playerName || matchedPlayer?.name || 'Player'),
            teamId: String(req.teamId),
            teamName: String(req.teamName || matchedTeam?.name || 'Team'),
            price: Number(req.price || 0),
            round: Number(req.round || draftStateRef.current.currentRound || 1),
            turnIndex: Number(req.turnIndex ?? draftStateRef.current.currentTurnIndex ?? 0),
            status: 'PENDING',
            requestedAt: rawTs || Date.now(),
            source,
            logDocId: req._logDocId || req.logDocId || (source === 'AUCTION_LOGS' && req.id ? String(req.id) : undefined),
            requiresApproval: requiresManualApproval
        };

        // Always make incoming request visibly appear in Admin Panel immediately
        upsertPendingRequest(normalizedReq);

        // When Pick Request Approval Mode is active, do NOT auto-finalize — keep visible for Admin Approve/Dismiss
        if (requiresManualApproval) return;

        // Wait until players & teams collections are hydrated before auto-finalizing
        if (!matchedPlayer || !matchedTeam) return;

        if (processedPickRequestsRef.current.has(requestId)) return;
        processedPickRequestsRef.current.add(requestId);

        const markRelayDocs = (status: 'PROCESSED' | 'ERROR', errorMessage?: string) => {
            const payload: Record<string, any> = status === 'PROCESSED'
                ? { status: 'PROCESSED', processedAt: Date.now() }
                : { status: 'ERROR', errorMessage: errorMessage || 'Pick rejected.' };
            db.collection('scoringAssets').doc(`draft_pick_${auctionId}`).get().then(snap => {
                if (snap.exists && (snap.data()?.requestId === requestId || source === 'SCORING_ASSETS')) {
                    snap.ref.update(payload).catch(() => {});
                }
            }).catch(() => {});
            if (normalizedReq.logDocId) {
                db.collection('auctions').doc(auctionId).collection('auctionLogs').doc(normalizedReq.logDocId).update(payload).catch(() => {});
            }
        };

        const currentDraft = draftStateRef.current;
        if (currentDraft.teamPickingEnabled === false) {
            const lockMsg = 'Team picking is currently locked by Admin. Click Approve & Mark SOLD to override or Dismiss.';
            upsertPendingRequest({ ...normalizedReq, errorMessage: lockMsg });
            if (source === 'SCORING_ASSETS') {
                markRelayDocs('ERROR', 'Picking is currently locked by Admin.');
            }
            broadcastRelayResult(requestId, false, 'Picking is currently locked by Admin.');
            return;
        }

        if (String(normalizedReq.teamId) !== String(currentDraft.currentTeamId)) {
            const turnMsg = 'Turn changed before pick arrived. Click Approve & Mark SOLD to assign anyway or Dismiss.';
            upsertPendingRequest({ ...normalizedReq, errorMessage: turnMsg });
            if (source === 'SCORING_ASSETS') {
                markRelayDocs('ERROR', 'Turn already passed before pick arrived.');
            }
            broadcastRelayResult(requestId, false, 'Turn already passed before pick arrived.');
            return;
        }

        const res = await handleAssignPlayerRef.current(matchedPlayer, matchedTeam.id, normalizedReq.price);
        if (res.ok) {
            removePendingRequest(requestId);
            showProcessedNotice(`Auto-Finalized: ${normalizedReq.playerName} → ${normalizedReq.teamName}`);
            markRelayDocs('PROCESSED');
            broadcastRelayResult(requestId, true);
        } else {
            const errMsg = res.error || 'Auto-finalize failed. Click Approve & Mark SOLD to retry.';
            upsertPendingRequest({ ...normalizedReq, errorMessage: errMsg });
            markRelayDocs('ERROR', errMsg);
            broadcastRelayResult(requestId, false, errMsg);
        }
    };

    const handleApprovePickRequest = async (req: PendingDraftPickRequest) => {
        if (!isAdmin || !auctionId) return;
        const matchedPlayer = playersRef.current.find(p => String(p.id) === String(req.playerId));
        const matchedTeam = teamsRef.current.find(t => String(t.id) === String(req.teamId));

        if (!matchedPlayer || !matchedTeam) {
            upsertPendingRequest({
                ...req,
                errorMessage: 'Player or team record not loaded yet. Please wait a moment and try again.'
            });
            return;
        }

        const markApprovedDocs = () => {
            const payload = { status: 'PROCESSED', processedAt: Date.now() };
            db.collection('scoringAssets').doc(`draft_pick_${auctionId}`).get().then(snap => {
                if (snap.exists && snap.data()?.requestId === req.requestId) {
                    snap.ref.update(payload).catch(() => {});
                }
            }).catch(() => {});
            if (req.logDocId) {
                db.collection('auctions').doc(auctionId).collection('auctionLogs').doc(req.logDocId).update(payload).catch(() => {});
            }
        };

        if (matchedPlayer.status === 'SOLD' || draftPickMapRef.current.has(String(matchedPlayer.id))) {
            removePendingRequest(req.requestId);
            showProcessedNotice(`${req.playerName} is already marked SOLD.`);
            markApprovedDocs();
            broadcastRelayResult(req.requestId, true);
            return;
        }

        const res = await handleAssignPlayerRef.current(matchedPlayer, matchedTeam.id, Number(req.price || 0));
        if (res.ok) {
            processedPickRequestsRef.current.add(req.requestId);
            removePendingRequest(req.requestId);
            showProcessedNotice(`Approved: ${req.playerName} → ${req.teamName}`);
            markApprovedDocs();
            broadcastRelayResult(req.requestId, true);
        } else {
            upsertPendingRequest({
                ...req,
                errorMessage: res.error || 'Failed to mark player SOLD. Please check Admin sign-in.'
            });
        }
    };

    const handleDismissPickRequest = (requestId: string) => {
        dismissedRequestIdsRef.current.add(requestId);
        const targetReq = pendingPickRequests.find(r => r.requestId === requestId);
        removePendingRequest(requestId);
        if (auctionId) {
            const errPayload = { status: 'ERROR', errorMessage: 'Pick request dismissed by Admin.' };
            db.collection('scoringAssets').doc(`draft_pick_${auctionId}`).get().then(snap => {
                if (snap.exists && snap.data()?.requestId === requestId) {
                    snap.ref.update(errPayload).catch(() => {});
                }
            }).catch(() => {});
            if (targetReq?.logDocId) {
                db.collection('auctions').doc(auctionId).collection('auctionLogs').doc(targetReq.logDocId).update(errPayload).catch(() => {});
            }
            if (isCurator) {
                dispatchCuratorRelay('DISMISS_PICK_REQUEST', { requestId }).catch(() => {});
            }
        }
        broadcastRelayResult(requestId, false, 'Pick request dismissed by Admin.');
    };

    // ADMIN RELAY PROCESSOR: Listen to scoringAssets, auctionLogs, and BroadcastChannel for incoming Team Owner pick requests
    useEffect(() => {
        if (!isAdmin || !auctionId) return;

        const unsubScoringReq = db.collection('scoringAssets').doc(`draft_pick_${auctionId}`).onSnapshot((snap) => {
            if (snap.exists) {
                enqueueAndProcessPickRequestRef.current(snap.data(), 'SCORING_ASSETS');
            }
        }, (err) => {
            console.warn('Admin scoringAssets relay listener notice:', err?.code || err?.message);
        });

        const unsubLogReq = db.collection('auctions').doc(auctionId).collection('auctionLogs')
            .where('type', '==', 'DRAFT_PICK_REQUEST')
            .onSnapshot((snap) => {
                snap.docChanges().forEach(change => {
                    if (change.type === 'added' || change.type === 'modified') {
                        enqueueAndProcessPickRequestRef.current({ ...change.doc.data(), _logDocId: change.doc.id }, 'AUCTION_LOGS');
                    }
                });
            }, (err) => {
                console.warn('Admin auctionLogs relay listener notice:', err?.code || err?.message);
            });

        let channel: BroadcastChannel | null = null;
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                channel = new BroadcastChannel(`sm_draft_pick_${auctionId}`);
                channel.onmessage = (ev) => {
                    if (ev?.data?.type === 'DRAFT_PICK_REQUEST' && ev.data.payload) {
                        enqueueAndProcessPickRequestRef.current(ev.data.payload, 'BROADCAST');
                    }
                };
            }
        } catch {
            // optional
        }

        return () => {
            unsubScoringReq();
            unsubLogReq();
            if (channel) {
                try { channel.close(); } catch {}
            }
        };
    }, [isAdmin, auctionId]);

    // Also consume already-streamed state.auctionLog entries from AuctionContext in Admin Panel
    useEffect(() => {
        if (!isAdmin || !auctionId || !state.auctionLog?.length) return;
        state.auctionLog.forEach(entry => {
            if (entry?.type === 'DRAFT_PICK_REQUEST') {
                enqueueAndProcessPickRequestRef.current(entry, 'AUCTION_LOGS');
            }
        });
    }, [isAdmin, auctionId, state.auctionLog]);

    // Auto-prune SOLD requests & retry any queued requests once players/teams finish loading
    useEffect(() => {
        if (!isAdmin || pendingPickRequests.length === 0) return;
        const soldIds = new Set<string>();
        pendingPickRequests.forEach(req => {
            const mp = players.find(p => String(p.id) === String(req.playerId));
            const isSold = (mp?.status === 'SOLD') || draftPickMap.has(String(req.playerId));
            if (isSold) {
                soldIds.add(req.requestId);
            } else if (
                !req.requiresApproval &&
                draftState.pickRequestApprovalEnabled !== true &&
                !processedPickRequestsRef.current.has(req.requestId) &&
                mp &&
                teams.some(t => String(t.id) === String(req.teamId))
            ) {
                enqueueAndProcessPickRequestRef.current(req, req.source || 'AUCTION_LOGS');
            }
        });
        if (soldIds.size > 0) {
            setPendingPickRequests(prev => prev.filter(r => !soldIds.has(r.requestId)));
        }
    }, [isAdmin, pendingPickRequests, players, teams, draftPickMap, draftState.pickRequestApprovalEnabled]);

    // ADMIN AUTO-RECONCILE: Keep /players and /teams subcollections synced with draftBoardState.history AND scrub stale undone players
    useEffect(() => {
        if (!isAdmin || isCurator || !auctionId || players.length === 0) return;

        // 1. Ensure picks recorded in draftBoardState.history are synced to /players and /teams
        if (draftState.history?.length) {
            draftState.history.forEach(async (pick) => {
                const p = playersRef.current.find(pl => String(pl.id) === String(pick.playerId));
                const t = teamsRef.current.find(tm => String(tm.id) === String(pick.teamId));
                if (!p || !t) return;

                const playerNeedsSync = p.status !== 'SOLD' || String(p.soldToId || p.teamId || '') !== String(t.id);
                const teamNeedsSync = !(t.players || []).some(tp => String(tp.id) === String(p.id));
                if (!playerNeedsSync && !teamNeedsSync) return;

                const reconcileKey = `${pick.id}_${p.id}_${t.id}`;
                if (reconcilingKeysRef.current.has(reconcileKey)) return;
                reconcilingKeysRef.current.add(reconcileKey);

                try {
                    await syncPlayerAndTeamDocs(p, t, Number(pick.soldPrice || 0));
                } catch (err) {
                    reconcilingKeysRef.current.delete(reconcileKey);
                    console.warn('Admin auto-reconcile notice:', err);
                }
            });
        }

        // 2. Automatically scrub any stale undone/POOL/UNSOLD entries remaining inside team.players
        const historyPlayerIds = new Set((draftState.history || []).map(h => String(h.playerId)));
        const playerByIdMap = new Map<string, Player>();
        const playerByNameMap = new Map<string, Player>();
        players.forEach(pl => {
            if (pl.id !== undefined && pl.id !== null) playerByIdMap.set(String(pl.id).trim().toLowerCase(), pl);
            if (pl.name) playerByNameMap.set(pl.name.trim().toLowerCase(), pl);
        });

        teams.forEach(async (t) => {
            const rawSquad = t.players || [];
            if (rawSquad.length === 0) return;

            const hasStaleEntry = rawSquad.some((tp: any) => {
                const tpIdKey = String(tp?.id ?? '').trim().toLowerCase();
                const tpNameKey = String(tp?.name || '').trim().toLowerCase();
                if (historyPlayerIds.has(String(tp?.id))) return false;
                const authP = (tpIdKey && playerByIdMap.get(tpIdKey)) || (tpNameKey && playerByNameMap.get(tpNameKey));
                if (!authP) return false;
                return (
                    authP.status === 'POOL' ||
                    authP.status === 'UNSOLD' ||
                    (!authP.status && !authP.soldTo && !(authP as any).soldToId && !authP.teamId)
                );
            });

            if (!hasStaleEntry) return;

            const cleanSquad = resolveDraftTeamSquad(t, players, draftState.history || []);
            const scrubKey = `scrub_${t.id}_${rawSquad.length}_${cleanSquad.length}`;
            if (reconcilingKeysRef.current.has(scrubKey)) return;
            reconcilingKeysRef.current.add(scrubKey);

            try {
                const cleanPayload = await safeBuildTeamUpdatePayload(t, undefined, cleanSquad);
                await db.collection('auctions').doc(auctionId).collection('teams').doc(String(t.id)).update(cleanPayload);
            } catch (err) {
                reconcilingKeysRef.current.delete(scrubKey);
                console.warn('Admin stale-squad scrub notice:', err);
            }
        });
    }, [isAdmin, isCurator, auctionId, draftState.history, players, teams]);

    // Core Undo executor (reusable for both direct clicks and Curator relay)
    const executeUndoPlayerById = async (playerId: string | number) => {
        const player = playersRef.current.find(p => String(p.id) === String(playerId));
        if (!player || !auctionId) return;

        const pickInfo = draftPickMapRef.current.get(String(player.id));
        const soldTeamId = pickInfo?.teamId || player.soldToId || player.teamId;
        const soldPrice = Number(pickInfo?.soldPrice ?? player.soldPrice ?? 0);
        const undoneNameLower = String(player.name || '').trim().toLowerCase();

        // 1. Revert player in players subcollection back to POOL
        const playerResetData = {
            status: 'POOL',
            soldTo: null,
            soldToId: null,
            teamId: null,
            soldPrice: null,
            soldAt: null
        };
        await db.collection('auctions').doc(auctionId).collection('players').doc(String(player.id)).update(
            JSON.parse(JSON.stringify(playerResetData))
        );

        // 2. Refund primary team budget and remove player from ALL teams that may hold stale entries
        for (const t of teamsRef.current) {
            const isSoldTeam = soldTeamId && String(t.id) === String(soldTeamId);
            const hasEntry = (t.players || []).some(p =>
                String(p.id) === String(player.id) ||
                (undoneNameLower && String(p.name || '').trim().toLowerCase() === undoneNameLower)
            );
            if (!isSoldTeam && !hasEntry) continue;

            const updatedBudget = isSoldTeam ? Number(t.budget || 0) + soldPrice : undefined;
            const updatedSquad = (t.players || []).filter(p =>
                String(p.id) !== String(player.id) &&
                (!undoneNameLower || String(p.name || '').trim().toLowerCase() !== undoneNameLower)
            );
            const teamPayload = await safeBuildTeamUpdatePayload(t, updatedBudget, updatedSquad);
            await db.collection('auctions').doc(auctionId).collection('teams').doc(String(t.id)).update(teamPayload);
        }

        // 3. Remove pick from draftBoardState.history
        const currentDraft = draftStateRef.current;
        const updatedHistory = (currentDraft.history || []).filter(h => String(h.playerId) !== String(player.id));
        const cleanHistory = JSON.parse(JSON.stringify(updatedHistory));

        const payload = {
            draftBoardState: {
                ...currentDraft,
                history: cleanHistory,
                updatedAt: Date.now()
            }
        };
        await db.collection('auctions').doc(auctionId).set(JSON.parse(JSON.stringify(payload)), { merge: true });
    };

    const startNextRoundAction = async () => {
        if (!auctionId) return;
        const currentDraft = draftStateRef.current;
        const currentTeams = teamsRef.current;
        const nextRoundNumber = Number(currentDraft.currentRound || 1) + 1;
        const isSnake = currentDraft.orderType === 'SNAKE';
        const reversed = [...currentTeams.map(t => t.id)].reverse();
        const newRoundOrder = (isSnake && nextRoundNumber % 2 === 0)
            ? reversed
            : currentTeams.map(t => t.id);

        const nextPayload = {
            draftBoardState: {
                ...currentDraft,
                currentRound: nextRoundNumber,
                currentTurnIndex: 0,
                currentTeamId: newRoundOrder[0] || null,
                roundOrder: newRoundOrder,
                roundStatus: 'IN_PROGRESS',
                timerTimeRemaining: Number(currentDraft.turnTimerSeconds || 45),
                isTimerRunning: true,
                updatedAt: Date.now()
            }
        };
        const cleanNext = JSON.parse(JSON.stringify(nextPayload));
        try {
            await db.collection('auctions').doc(auctionId).set(cleanNext, { merge: true });
        } catch (err: any) {
            if (isCurator && isPermissionErr(err)) {
                await dispatchCuratorRelay('START_NEXT_ROUND');
            } else {
                throw err;
            }
        }
    };

    // ADMIN CURATOR RELAY PROCESSOR: Executes Curator commands sent from remote Curator browser when direct Firestore writes are restricted
    const processedCuratorActionsRef = useRef<Set<string>>(new Set());
    const processCuratorActionRef = useRef<(req: any) => Promise<void>>(async () => {});

    processCuratorActionRef.current = async (req: any) => {
        if (!isAdmin || isCurator || !auctionId || !req) return;
        const actionId = String(req.actionId || req.id || '').trim();
        const action = String(req.action || '').trim();
        if (!actionId || !action) return;
        if (req.status === 'PROCESSED') return;
        if (processedCuratorActionsRef.current.has(actionId)) return;

        const rawTs = Number(req.requestedAt || req.timestamp || 0);
        if (rawTs > 0 && Date.now() - rawTs > 15 * 60 * 1000) return;

        processedCuratorActionsRef.current.add(actionId);
        const data = req.data || {};

        try {
            if (action === 'UPDATE_AUCTION_FIELDS' && data.fields) {
                await db.collection('auctions').doc(auctionId).update(data.fields);
            } else if (action === 'ASSIGN_PLAYER') {
                const mp = playersRef.current.find(p => String(p.id) === String(data.playerId));
                const mt = teamsRef.current.find(t => String(t.id) === String(data.teamId));
                if (mp && mt && mp.status !== 'SOLD' && !draftPickMapRef.current.has(String(mp.id))) {
                    await handleAssignPlayerRef.current(mp, mt.id, Number(data.price || 0));
                }
            } else if (action === 'DISMISS_PICK_REQUEST' && data.requestId) {
                handleDismissPickRequest(String(data.requestId));
            } else if (action === 'UNDO_PLAYER' && data.playerId) {
                await executeUndoPlayerById(data.playerId);
            } else if (action === 'START_NEXT_ROUND') {
                await startNextRoundAction();
            } else if (action === 'REOPEN_DRAFT') {
                await db.collection('auctions').doc(auctionId).update({
                    status: 'ACTIVE',
                    'draftBoardState.roundStatus': 'IN_PROGRESS',
                    'draftBoardState.broadcastView': 'PLAYERS',
                    'draftBoardState.updatedAt': Date.now()
                });
            } else if (action === 'UNDO_LAST_PICK') {
                const currentDraft = draftStateRef.current;
                const history = currentDraft.history || [];
                if (history.length > 0) {
                    const lastPick = history[history.length - 1];
                    await db.collection('auctions').doc(auctionId).collection('players').doc(String(lastPick.playerId)).update({
                        status: 'POOL',
                        soldTo: null,
                        soldToId: null,
                        teamId: null,
                        soldPrice: null,
                        soldAt: null
                    });
                    const t = teamsRef.current.find(tm => String(tm.id) === String(lastPick.teamId));
                    if (t) {
                        const teamPayload = await safeBuildTeamUpdatePayload(
                            t,
                            Number(t.budget || 0) + Number(lastPick.soldPrice || 0),
                            (t.players || []).filter(p => String(p.id) !== String(lastPick.playerId))
                        );
                        await db.collection('auctions').doc(auctionId).collection('teams').doc(String(t.id)).update(teamPayload);
                    }
                    await db.collection('auctions').doc(auctionId).update(JSON.parse(JSON.stringify({
                        'draftBoardState.history': history.slice(0, -1),
                        'draftBoardState.currentTurnIndex': Math.max(0, Number(currentDraft.currentTurnIndex || 0) - 1),
                        'draftBoardState.currentTeamId': lastPick.teamId || null,
                        'draftBoardState.roundStatus': 'IN_PROGRESS',
                        'draftBoardState.timerTimeRemaining': Number(currentDraft.turnTimerSeconds || 45),
                        'draftBoardState.isTimerRunning': false,
                        'draftBoardState.updatedAt': Date.now()
                    })));
                }
            } else if (action === 'RESET_CURRENT_ROUND') {
                const currentDraft = draftStateRef.current;
                const currentRound = currentDraft.currentRound;
                const currentRoundPicks = (currentDraft.history || []).filter(h => h.round === currentRound);
                const roundRefundsByTeam = new Map<string, { refund: number; removedIds: Set<string>; removedNames: Set<string> }>();
                for (const pick of currentRoundPicks) {
                    await db.collection('auctions').doc(auctionId).collection('players').doc(String(pick.playerId)).update({
                        status: 'POOL', soldTo: null, soldToId: null, teamId: null, soldPrice: null, soldAt: null
                    });
                    const tKey = String(pick.teamId || '');
                    if (tKey) {
                        if (!roundRefundsByTeam.has(tKey)) {
                            roundRefundsByTeam.set(tKey, { refund: 0, removedIds: new Set(), removedNames: new Set() });
                        }
                        const entry = roundRefundsByTeam.get(tKey)!;
                        entry.refund += Number(pick.soldPrice || 0);
                        entry.removedIds.add(String(pick.playerId));
                        if (pick.playerName) entry.removedNames.add(String(pick.playerName).trim().toLowerCase());
                    }
                }
                for (const [tKey, info] of roundRefundsByTeam.entries()) {
                    const t = teamsRef.current.find(tm => String(tm.id) === tKey);
                    if (t) {
                        const teamPayload = await safeBuildTeamUpdatePayload(
                            t,
                            Number(t.budget || 0) + info.refund,
                            (t.players || []).filter(p =>
                                !info.removedIds.has(String(p.id)) &&
                                !info.removedNames.has(String(p.name || '').trim().toLowerCase())
                            )
                        );
                        await db.collection('auctions').doc(auctionId).collection('teams').doc(String(t.id)).update(teamPayload);
                    }
                }
                const remainingHistory = (currentDraft.history || []).filter(h => h.round !== currentRound);
                const firstTeamId = currentDraft.roundOrder?.[0] || teamsRef.current[0]?.id || null;
                await db.collection('auctions').doc(auctionId).update(JSON.parse(JSON.stringify({
                    'draftBoardState.history': remainingHistory,
                    'draftBoardState.currentTurnIndex': 0,
                    'draftBoardState.currentTeamId': firstTeamId,
                    'draftBoardState.roundStatus': 'IDLE',
                    'draftBoardState.timerTimeRemaining': Number(currentDraft.turnTimerSeconds || 45),
                    'draftBoardState.isTimerRunning': false,
                    'draftBoardState.updatedAt': Date.now()
                })));
            } else if (action === 'RESET_FULL_DRAFT') {
                const currentDraft = draftStateRef.current;
                const allDraftPicks = currentDraft.history || [];
                const playersCol = db.collection('auctions').doc(auctionId).collection('players');
                const playerIdsToReset = new Set<string>();
                playersRef.current.forEach(p => {
                    if (p.id !== undefined && p.id !== null) playerIdsToReset.add(String(p.id));
                });
                allDraftPicks.forEach(pick => {
                    if (pick.playerId !== undefined && pick.playerId !== null) playerIdsToReset.add(String(pick.playerId));
                });
                const resetList = Array.from(playerIdsToReset);
                const batchSize = 300;
                for (let i = 0; i < resetList.length; i += batchSize) {
                    const batch = db.batch();
                    resetList.slice(i, i + batchSize).forEach(pid => {
                        batch.update(playersCol.doc(pid), {
                            status: 'POOL', soldTo: null, soldToId: null, teamId: null, soldPrice: null, soldAt: null
                        });
                    });
                    await batch.commit();
                }
                for (const t of teamsRef.current) {
                    const spent = allDraftPicks.filter(p => String(p.teamId) === String(t.id)).reduce((s, p) => s + (p.soldPrice || 0), 0);
                    const teamPayload = await safeBuildTeamUpdatePayload(
                        t,
                        Number(t.budget || 0) + spent,
                        []
                    );
                    await db.collection('auctions').doc(auctionId).collection('teams').doc(String(t.id)).update(teamPayload);
                }
                await db.collection('auctions').doc(auctionId).update(JSON.parse(JSON.stringify({
                    'draftBoardState.currentRound': 1,
                    'draftBoardState.currentTurnIndex': 0,
                    'draftBoardState.currentTeamId': teamsRef.current[0]?.id || null,
                    'draftBoardState.roundOrder': teamsRef.current.map(t => t.id),
                    'draftBoardState.roundStatus': 'IDLE',
                    'draftBoardState.timerTimeRemaining': Number(currentDraft.turnTimerSeconds || 45),
                    'draftBoardState.isTimerRunning': false,
                    'draftBoardState.history': [],
                    'draftBoardState.updatedAt': Date.now()
                })));
            }

            db.collection('scoringAssets').doc(`curator_action_${auctionId}`).get().then(snap => {
                if (snap.exists && snap.data()?.actionId === actionId) {
                    snap.ref.update({ status: 'PROCESSED', processedAt: Date.now() }).catch(() => {});
                }
            }).catch(() => {});
        } catch (err) {
            console.warn('Admin Curator Relay processing error:', err);
        }
    };

    useEffect(() => {
        if (!isAdmin || isCurator || !auctionId) return;

        const unsubCuratorScoring = db.collection('scoringAssets').doc(`curator_action_${auctionId}`).onSnapshot((snap) => {
            if (snap.exists) {
                processCuratorActionRef.current(snap.data());
            }
        }, () => {});

        const unsubCuratorLogs = db.collection('auctions').doc(auctionId).collection('auctionLogs')
            .where('type', '==', 'CURATOR_ACTION')
            .onSnapshot((snap) => {
                snap.docChanges().forEach(change => {
                    if (change.type === 'added' || change.type === 'modified') {
                        processCuratorActionRef.current(change.doc.data());
                    }
                });
            }, () => {});

        let ch: BroadcastChannel | null = null;
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                ch = new BroadcastChannel(`sm_curator_action_${auctionId}`);
                ch.onmessage = (ev) => {
                    if (ev?.data?.type === 'CURATOR_ACTION' && ev.data.payload) {
                        processCuratorActionRef.current(ev.data.payload);
                    }
                };
            }
        } catch {
            // optional
        }

        return () => {
            unsubCuratorScoring();
            unsubCuratorLogs();
            if (ch) {
                try { ch.close(); } catch {}
            }
        };
    }, [isAdmin, isCurator, auctionId]);

    useEffect(() => {
        if (!isAdmin || isCurator || !auctionId || !state.auctionLog?.length) return;
        state.auctionLog.forEach(entry => {
            if (entry?.type === 'CURATOR_ACTION') {
                processCuratorActionRef.current(entry);
            }
        });
    }, [isAdmin, isCurator, auctionId, state.auctionLog]);

    // Handle Undo Specific Player
    const handleUndoSpecificPlayer = async (player: Player) => {
        if (!auctionId || !isAdmin) return;

        const confirmMsg = `Are you sure you want to UNDO selection for "${player.name}"?\nThis will revert the player to AVAILABLE and return them to the draft pool.`;
        if (!window.confirm(confirmMsg)) return;

        try {
            await executeUndoPlayerById(player.id);
            if (activePlayerForModal?.id === player.id) {
                setActivePlayerForModal(null);
            }
        } catch (err: any) {
            if (isCurator && isPermissionErr(err)) {
                await dispatchCuratorRelay('UNDO_PLAYER', { playerId: player.id });
                if (activePlayerForModal?.id === player.id) {
                    setActivePlayerForModal(null);
                }
            } else {
                console.error("Failed to undo player sale:", err);
                alert(`Undo failed: ${err.message}`);
            }
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
    const hideNumbers = Boolean(draftState.hidePlayerNumbers || state.hidePlayerNumbers);

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
                        try {
                            await db.collection('auctions').doc(auctionId).update({
                                status: 'ACTIVE',
                                'draftBoardState.roundStatus': 'IN_PROGRESS',
                                'draftBoardState.broadcastView': 'PLAYERS',
                                'draftBoardState.updatedAt': Date.now()
                            });
                        } catch (err: any) {
                            if (isCurator && isPermissionErr(err)) {
                                await dispatchCuratorRelay('REOPEN_DRAFT');
                            } else {
                                throw err;
                            }
                        }
                    }}
                />
                <SoldCelebrationPopup
                    celebrationData={draftState.lastSoldCelebration}
                    durationMs={soldPopupDurationMs}
                    customSoldAudioUrl={customAudio?.soldMusicUrl}
                    players={players}
                    teams={teams}
                    hidePlayerNumbers={hideNumbers}
                />
            </>
        );
    }

    // Team Owner View: Render dedicated TeamDraftDashboard with multi-option tabs
    if (isTeamOwner && myTeam && !isProjectorView && !isOBSView) {
        return (
            <div className="flex flex-col h-full min-h-0 w-full overflow-hidden relative">
                {pickNotice && (
                    <div className="shrink-0 mx-3 mt-2 px-4 py-2.5 rounded-xl bg-emerald-950/95 border border-emerald-500 text-emerald-100 text-xs font-bold flex items-center justify-between gap-3 shadow-xl z-50">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>{pickNotice}</span>
                        </div>
                        <button type="button" onClick={() => setPickNotice(null)} className="p-1 hover:bg-emerald-800/60 rounded-lg text-emerald-200">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}
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
                    soldPopupDurationMs={soldPopupDurationMs}
                    onNominatePlayer={(p) => {
                        setPickError(null);
                        setPickNotice(null);
                        setActivePlayerForModal(p);
                    }}
                    isDark={isDark}
                />
                {activePlayerForModal && (
                    <DraftNominationModal
                        player={activePlayerForModal}
                        teams={teams}
                        allPlayers={players}
                        draftHistory={draftState.history || []}
                        currentTurnTeam={currentTurnTeam}
                        myTeam={myTeam}
                        isAdmin={isAdmin}
                        isMyTurn={isMyTurn}
                        isPickingAllowed={draftState.teamPickingEnabled !== false}
                        isPickRequestMode={draftState.pickRequestApprovalEnabled === true}
                        isSoldOverride={activePlayerForModal.status === 'SOLD' || draftPickMap.has(String(activePlayerForModal.id))}
                        soldToTeamName={draftPickMap.get(String(activePlayerForModal.id))?.teamName || activePlayerForModal.soldTo}
                        errorMessage={pickError}
                        hidePlayerNumbers={hideNumbers}
                        onClose={() => {
                            setPickError(null);
                            setActivePlayerForModal(null);
                        }}
                        onAssign={async (player, teamId, price) => { await handleAssignPlayer(player, teamId, price); }}
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
                            <img src={activeUnsoldBanner.playerPhoto} alt={activeUnsoldBanner.playerName} className="w-full h-full object-contain" />
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
                        hidePlayerNumbers={hideNumbers}
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
                                        Squad: {resolveDraftTeamSquad(currentTurnTeam, players, draftState.history || []).length} Players
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
                        hidePlayerNumbers={hideNumbers}
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
                                        <div className="w-full h-14 rounded overflow-hidden bg-zinc-950 relative flex items-center justify-center">
                                            {player.photoUrl ? (
                                                <img src={player.photoUrl} alt={player.name} className={`w-full h-full object-contain ${isSold ? 'opacity-25 grayscale contrast-125' : ''}`} />
                                            ) : (
                                                <div className={`w-full h-full flex items-center justify-center font-black text-xs text-zinc-500 ${isSold ? 'opacity-25 grayscale' : ''}`}>
                                                    {player.name.charAt(0)}
                                                </div>
                                            )}
                                            {isSold && (
                                                <div
                                                    style={{ containerType: 'size' }}
                                                    className="absolute inset-0 z-20 bg-gradient-to-b from-red-950/80 via-red-900/75 to-black/95 flex flex-col items-center justify-center p-[4%] text-center pointer-events-none select-none overflow-hidden"
                                                >
                                                    <div
                                                        style={{ fontSize: 'clamp(9px, 24cqmin, 22px)' }}
                                                        className="w-[112%] py-[4%] bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white font-black uppercase tracking-[0.14em] leading-none border-y border-red-200/80 shadow-lg -rotate-3"
                                                    >
                                                        SOLD
                                                    </div>
                                                </div>
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
                        hidePlayerNumbers={hideNumbers}
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

                        {/* Broadcast Copy Links: Projector & OBS (Admin Only — hidden for Curator) */}
                        {isAdmin && !isCurator && !isProjectorView && !isOBSView && (
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

                        {/* Curator Console Badge */}
                        {isCurator && !isProjectorView && !isOBSView && (
                            <span className="px-3 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <Shield className="w-3.5 h-3.5" /> Curator Console
                            </span>
                        )}

                        {/* Admin Mode Switcher Back to Live Bidding */}
                        {isAdmin && !isCurator && !isProjectorView && !isOBSView && (
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
                            {orderedCategoryNames.map(catName => {
                                const count = players.filter(p => (p.category || p.role || 'Uncategorized').trim().toLowerCase() === catName.trim().toLowerCase()).length;
                                return (
                                    <button
                                        key={catName}
                                        onClick={() => setSelectedCategoryFilter(catName)}
                                        className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                                            selectedCategoryFilter.trim().toLowerCase() === catName.trim().toLowerCase()
                                                ? 'bg-blue-600 text-white shadow-md'
                                                : isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        {catName} ({count})
                                    </button>
                                );
                            })}
                        </div>

                        {/* Status, Wishlist & Search */}
                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                            {isAdmin && (
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter(prev => prev === 'WISHLIST' ? 'ALL' : 'WISHLIST')}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 transition-all active:scale-95 ${
                                        statusFilter === 'WISHLIST'
                                            ? 'bg-yellow-500 text-black border-yellow-300 shadow-lg shadow-yellow-500/25'
                                            : adminWishlistSet.size > 0
                                                ? 'bg-yellow-500/15 border-yellow-400/50 text-yellow-300 hover:bg-yellow-500/25'
                                                : isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                    }`}
                                    title="Show Admin Wishlist Players Grouped Category-Wise"
                                >
                                    <Star className={`w-3.5 h-3.5 ${statusFilter === 'WISHLIST' ? 'fill-black text-black' : adminWishlistSet.size > 0 ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                                    <span>Wishlist ({adminWishlistSet.size})</span>
                                </button>
                            )}

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
                                {isAdmin && <option value="WISHLIST">★ Wishlist Only ({adminWishlistSet.size})</option>}
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
                        {isAdmin && !isProjectorView && !isOBSView && lastProcessedRequestNotice && (
                            <div className="px-4 py-2.5 rounded-xl bg-emerald-950/90 border border-emerald-500 text-emerald-100 text-xs font-black uppercase tracking-wider flex items-center justify-between gap-3 shadow-lg">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                    <span>{lastProcessedRequestNotice}</span>
                                </div>
                                <button type="button" onClick={() => setLastProcessedRequestNotice(null)} className="p-1 hover:bg-emerald-800/60 rounded-lg text-emerald-200">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                        {isAdmin && !isProjectorView && !isOBSView && pendingPickRequests.length > 0 && (
                            <div className="p-3.5 rounded-2xl border-2 border-emerald-400 bg-gradient-to-r from-emerald-950/90 via-zinc-950 to-emerald-950/90 space-y-2.5 shadow-xl">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-amber-400" /> Incoming Team Pick Requests ({pendingPickRequests.length})
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {isRequestPopupMinimized && (
                                            <button
                                                type="button"
                                                onClick={() => setIsRequestPopupMinimized(false)}
                                                className="px-3 py-1 rounded-full bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black uppercase tracking-wider shadow active:scale-95 transition-all"
                                            >
                                                Open Big Popup
                                            </button>
                                        )}
                                        <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-500 text-black animate-pulse">
                                            Approve or Auto-Finalize
                                        </span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {pendingPickRequests.map(req => (
                                        <div key={req.requestId} className="p-2.5 rounded-xl bg-black/75 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-black uppercase text-white truncate">
                                                    {req.playerName} <span className="text-amber-300">&rarr; {req.teamName}</span>
                                                </p>
                                                {req.errorMessage ? (
                                                    <p className="text-[10px] text-red-300 font-semibold mt-0.5">{req.errorMessage}</p>
                                                ) : (
                                                    <p className="text-[10px] text-emerald-300/80 font-bold uppercase">Round {req.round}</p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => handleApprovePickRequest(req)}
                                                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-wider flex items-center gap-1 shadow active:scale-95 transition-all"
                                                >
                                                    <Check className="w-3.5 h-3.5 stroke-[3]" /> Approve &amp; Mark SOLD
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDismissPickRequest(req.requestId)}
                                                    className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-red-600/80 text-zinc-300 hover:text-white font-black text-[10px] uppercase border border-zinc-700 transition-all"
                                                    title="Dismiss pick request"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
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

                    {isAdmin && statusFilter === 'WISHLIST' && (
                        <div className="p-4 rounded-2xl border-2 border-yellow-500/60 bg-gradient-to-r from-yellow-950/60 via-zinc-900 to-amber-950/50 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-yellow-500/20 border border-yellow-400/60 flex items-center justify-center text-yellow-400 shrink-0">
                                    <Star className="w-5 h-5 fill-yellow-400" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-wider text-yellow-300">
                                        Admin Wishlist — Category-Wise View ({adminWishlistSet.size} Players)
                                    </h3>
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                        Grouped under each Category Name &amp; synced live to Team Portals
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {adminWishlistSet.size > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleClearAdminWishlist}
                                        className="px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 text-[10px] font-black uppercase tracking-wider transition-all"
                                    >
                                        Clear Wishlist
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('ALL')}
                                    className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 text-[10px] font-black uppercase tracking-wider transition-all"
                                >
                                    Back to All Players
                                </button>
                            </div>
                        </div>
                    )}

                    {isAdmin && statusFilter !== 'WISHLIST' && adminWishlistSet.size > 0 && (
                        <div className="px-4 py-2.5 rounded-2xl border border-yellow-500/40 bg-yellow-950/30 flex flex-wrap items-center justify-between gap-2 shadow-sm">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black uppercase tracking-wider text-yellow-300 flex items-center gap-1.5">
                                    <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" /> Admin Wishlist ({adminWishlistSet.size}):
                                </span>
                                {orderedCategoryNames.map(catName => {
                                    const countInCat = players.filter(p => adminWishlistSet.has(String(p.id)) && (p.category || p.role || 'Uncategorized').trim().toLowerCase() === catName.trim().toLowerCase()).length;
                                    if (countInCat === 0) return null;
                                    return (
                                        <button
                                            key={catName}
                                            type="button"
                                            onClick={() => {
                                                setSelectedCategoryFilter(catName);
                                                setStatusFilter('WISHLIST');
                                            }}
                                            className="px-2 py-0.5 rounded-lg bg-yellow-500/15 hover:bg-yellow-500/30 border border-yellow-400/40 text-[10px] font-black uppercase text-yellow-200 transition-all"
                                        >
                                            {catName} ({countInCat})
                                        </button>
                                    );
                                })}
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedCategoryFilter('ALL');
                                    setStatusFilter('WISHLIST');
                                }}
                                className="px-3 py-1 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-black text-[10px] uppercase tracking-wider shadow transition-all active:scale-95"
                            >
                                View Category-Wise Wishlist
                            </button>
                        </div>
                    )}

                    {viewMode === 'TABLE' && statusFilter !== 'WISHLIST' ? (
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
                            hidePlayerNumbers={hideNumbers}
                            onUndoPlayer={handleUndoSpecificPlayer}
                        />
                    ) : statusFilter === 'WISHLIST' && categoryGroups.every(g => g.players.length === 0) ? (
                        <div className={`p-12 text-center rounded-3xl border ${isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-white'} space-y-2`}>
                            <Star className="w-10 h-10 text-yellow-500/40 mx-auto" />
                            <p className={`text-sm font-black uppercase ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                                No Players Added to Wishlist Yet
                            </p>
                            <p className="text-xs text-zinc-500 max-w-md mx-auto">
                                Click the star icon on any player card on the Draft Board to add them to the Wishlist. They will appear grouped by Category Name here and in Team Logins.
                            </p>
                        </div>
                    ) : (
                        // CATEGORY ROWS AND COLUMNS GRID FORMAT
                        categoryGroups.map(group => {
                            if (selectedCategoryFilter !== 'ALL' && group.category.toLowerCase() !== selectedCategoryFilter.toLowerCase()) {
                                return null;
                            }
                            if (statusFilter === 'WISHLIST' && group.players.length === 0) {
                                return null;
                            }

                            return (
                                <div key={group.category} className="space-y-4">
                                    {/* Category Section Header Banner */}
                                    <div className={`flex items-center justify-between px-4 py-2.5 rounded-2xl border shadow-sm ${
                                        statusFilter === 'WISHLIST'
                                            ? isDark ? 'bg-yellow-950/30 border-yellow-500/40' : 'bg-yellow-50 border-yellow-300'
                                            : isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-blue-100'
                                    }`}>
                                        <div className="flex items-center gap-2.5">
                                            <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${statusFilter === 'WISHLIST' ? 'bg-yellow-400' : 'bg-blue-500'}`} />
                                            <h3 className={`text-sm md:text-base font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                                {group.category}
                                            </h3>
                                            <span className="text-[10px] font-bold text-gray-400">
                                                ({group.players.length} {statusFilter === 'WISHLIST' ? 'Wishlisted' : 'Players'})
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-3 text-xs">
                                            <span className="text-[10px] font-bold text-emerald-500">
                                                Available: {statusFilter === 'WISHLIST' ? group.players.filter(p => p.status !== 'SOLD' && !draftPickMap.has(String(p.id))).length : group.availableCount}
                                            </span>
                                            <span className="text-[10px] font-bold text-zinc-400">
                                                Sold: {statusFilter === 'WISHLIST' ? group.players.filter(p => p.status === 'SOLD' || draftPickMap.has(String(p.id))).length : group.soldCount}
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
                                            const isWishlisted = adminWishlistSet.has(String(player.id));

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
                                                            : isWishlisted
                                                            ? isDark
                                                                ? 'bg-zinc-900 border-yellow-400/80 ring-1 ring-yellow-400/30 hover:border-yellow-300 hover:shadow-xl'
                                                                : 'bg-yellow-50/70 border-yellow-400 hover:shadow-xl'
                                                            : isAdmin && draftState.autoAllotEnabled
                                                            ? 'bg-zinc-900 border-amber-400/90 ring-2 ring-amber-400/40 hover:border-amber-300 hover:shadow-xl hover:shadow-amber-500/20 hover:scale-[1.02]'
                                                            : isDark
                                                                ? 'bg-zinc-900 border-zinc-700/80 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10'
                                                                : 'bg-white border-gray-300 hover:border-blue-500 hover:shadow-xl'
                                                    }`}
                                                >
                                                    {/* Top Bar on box: Role, Wishlist Star & Jersey # */}
                                                    <div className="flex items-center justify-between gap-1 mb-1 z-10">
                                                        <span className="text-[8px] md:text-[9px] font-black uppercase px-2 py-0.5 rounded bg-black/70 text-amber-400 border border-amber-500/30 truncate max-w-[60%]">
                                                            {player.role || player.category || 'PLAYER'}
                                                        </span>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            {isAdmin && !isProjectorView && !isOBSView && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleToggleAdminWishlist(player);
                                                                    }}
                                                                    className={`p-1 rounded-md border transition-all ${
                                                                        isWishlisted
                                                                            ? 'bg-yellow-500/20 border-yellow-400/60 text-yellow-400 shadow-sm'
                                                                            : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:text-yellow-300 hover:border-yellow-400/40'
                                                                    }`}
                                                                    title={isWishlisted ? 'Remove from Admin Wishlist' : 'Add to Admin Wishlist'}
                                                                >
                                                                    <Star className={`w-3 h-3 ${isWishlisted ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                                                                </button>
                                                            )}
                                                            {!hideNumbers && (player.jerseyNumber ? (
                                                                <span className="text-[9px] md:text-[10px] font-black text-white bg-zinc-800 px-1.5 py-0.5 rounded">
                                                                    #{player.jerseyNumber}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[9px] font-bold text-zinc-500">
                                                                    #{player.id}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Player Photo with FULL-FRAME FIT-TO-SIZE LARGE SOLD COVER */}
                                                    <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 my-1 flex items-center justify-center">
                                                        {player.photoUrl ? (
                                                            <img 
                                                                src={player.photoUrl} 
                                                                alt={player.name} 
                                                                className={`w-full h-full object-contain transition-transform duration-300 ${
                                                                    isSold
                                                                        ? 'opacity-25 grayscale contrast-125'
                                                                        : !isProjectorView && !isOBSView ? 'group-hover:scale-105' : ''
                                                                }`} 
                                                            />
                                                        ) : (
                                                            <div className={`w-full h-full flex items-center justify-center font-black text-2xl text-zinc-600 bg-zinc-900 ${isSold ? 'opacity-25 grayscale' : ''}`}>
                                                                {player.name.charAt(0)}
                                                            </div>
                                                        )}

                                                        {/* FULL-FRAME FIT-TO-SIZE LARGE SOLD COVER */}
                                                        {isSold && (
                                                            <div
                                                                style={{ containerType: 'size' }}
                                                                className="absolute inset-0 z-20 bg-gradient-to-b from-red-950/80 via-red-900/75 to-black/95 flex flex-col items-center justify-center p-[5%] text-center pointer-events-none select-none overflow-hidden"
                                                            >
                                                                <div
                                                                    style={{ fontSize: 'clamp(14px, 24cqmin, 40px)' }}
                                                                    className="w-[112%] py-[4.5%] bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white font-black uppercase tracking-[0.16em] leading-none border-y-2 border-red-200/85 shadow-[0_6px_22px_rgba(220,38,38,0.85)] -rotate-3"
                                                                >
                                                                    SOLD
                                                                </div>
                                                                <div className="mt-[6%] flex flex-col items-center justify-center gap-[4%] max-w-full px-1">
                                                                    {soldTeamLogo && (
                                                                        <img
                                                                            src={soldTeamLogo}
                                                                            alt=""
                                                                            style={{ width: 'clamp(18px, 24cqmin, 40px)', height: 'clamp(18px, 24cqmin, 40px)' }}
                                                                            className="rounded-full object-contain bg-white p-[1.5px] shadow-md border border-amber-400 shrink-0"
                                                                        />
                                                                    )}
                                                                    <p
                                                                        style={{ fontSize: 'clamp(8px, 10.5cqmin, 15px)' }}
                                                                        className="font-black text-amber-300 uppercase tracking-tight line-clamp-2 leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,1)] max-w-full"
                                                                    >
                                                                        {soldTeamName}
                                                                    </p>
                                                                </div>
                                                            </div>
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
                                pendingPickRequests={pendingPickRequests}
                                onApprovePickRequest={handleApprovePickRequest}
                                onDismissPickRequest={handleDismissPickRequest}
                                lastProcessedRequestNotice={lastProcessedRequestNotice}
                                isCurator={isCurator}
                                curatorPassword={state.curatorPassword || ''}
                                onUpdateAuctionFields={updateAuctionFieldsWithRelay}
                                onCuratorRelayAction={isCurator ? dispatchCuratorRelay : undefined}
                                onStartNextRound={startNextRoundAction}
                            />
                        </div>
                    ) : (
                        /* Spectator / Team Owner Side Dossier */
                        <div className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l p-4 overflow-y-auto custom-scrollbar border-zinc-800 bg-zinc-900/30">
                            <div className="space-y-5">
                                {/* Team Owner's Active Squad Summary */}
                                {myTeam && (() => {
                                    const resolvedMySquad = resolveDraftTeamSquad(myTeam, players, draftState.history || []);
                                    return (
                                        <div className={`p-4 rounded-2xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`}>
                                            <div className="flex items-center justify-between mb-3 border-b pb-2 border-white/5">
                                                <div className="flex items-center gap-2">
                                                    <Crown className="w-4 h-4 text-amber-500" />
                                                    <h4 className="text-xs font-black uppercase text-white">Your Squad ({resolvedMySquad.length})</h4>
                                                </div>
                                                <span className="text-xs font-black text-blue-400">{resolvedMySquad.length} Drafted</span>
                                            </div>
                                            <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                                {resolvedMySquad.length > 0 ? (
                                                    resolvedMySquad.map(p => (
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
                                    );
                                })()}

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
                                                        <img src={h.playerPhoto} alt="" className="w-7 h-7 rounded-lg object-contain bg-zinc-950 shrink-0" />
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
                                                        R{h.round}{!hideNumbers ? ` #${h.pickNumber}` : ''}
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
                    allPlayers={players}
                    draftHistory={draftState.history || []}
                    currentTurnTeam={currentTurnTeam}
                    myTeam={myTeam}
                    isAdmin={isAdmin}
                    isMyTurn={isMyTurn}
                    isPickingAllowed={draftState.teamPickingEnabled !== false}
                    isPickRequestMode={draftState.pickRequestApprovalEnabled === true}
                    isSoldOverride={activePlayerForModal.status === 'SOLD' || draftPickMap.has(String(activePlayerForModal.id))}
                    soldToTeamName={draftPickMap.get(String(activePlayerForModal.id))?.teamName || activePlayerForModal.soldTo}
                    errorMessage={pickError}
                    hidePlayerNumbers={hideNumbers}
                    isWishlisted={isAdmin ? adminWishlistSet.has(String(activePlayerForModal.id)) : false}
                    onToggleWishlist={isAdmin ? handleToggleAdminWishlist : undefined}
                    onClose={() => {
                        setPickError(null);
                        setActivePlayerForModal(null);
                    }}
                    onAssign={async (player, teamId, price) => { await handleAssignPlayer(player, teamId, price); }}
                    onUndoPlayer={handleUndoSpecificPlayer}
                />
            )}

            {renderUnsoldBannerOverlay()}

            {/* BIG TEAM PICK REQUEST APPROVAL POPUP (ADMIN & CURATOR DASHBOARD) */}
            {isAdmin && !isProjectorView && !isOBSView && pendingPickRequests.length > 0 && !isRequestPopupMinimized && (() => {
                const activeReq = pendingPickRequests[0];
                const reqPlayer = players.find(p => String(p.id) === String(activeReq.playerId));
                const reqTeam = teams.find(t => String(t.id) === String(activeReq.teamId));

                return (
                    <div className="fixed inset-0 z-[900] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
                        <div className="relative w-full max-w-2xl rounded-[2rem] border-2 border-emerald-400 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black shadow-[0_0_80px_rgba(16,185,129,0.45)] overflow-hidden animate-in zoom-in-95 duration-200">
                            {/* Top Glowing Header Banner */}
                            <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-9 h-9 rounded-xl bg-black/25 border border-white/25 flex items-center justify-center text-amber-300 shrink-0">
                                        <Sparkles className="w-5 h-5 animate-pulse" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-100">
                                            Incoming Team Pick Request
                                        </p>
                                        <h3 className="text-base sm:text-lg font-black uppercase tracking-tight text-white leading-tight">
                                            Approval Required • Round {activeReq.round}
                                        </h3>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {pendingPickRequests.length > 1 && (
                                        <span className="px-2.5 py-1 rounded-full bg-black/40 border border-white/20 text-amber-300 text-[10px] font-black uppercase tracking-wider">
                                            1 of {pendingPickRequests.length} Pending
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setIsRequestPopupMinimized(true)}
                                        className="px-2.5 py-1.5 rounded-xl bg-black/30 hover:bg-black/50 text-white text-[10px] font-black uppercase tracking-wider border border-white/20 transition-all"
                                        title="Minimize popup to bar"
                                    >
                                        Minimize
                                    </button>
                                </div>
                            </div>

                            {/* Body Content: Player Card + Requesting Team Showcase */}
                            <div className="p-6 sm:p-8 space-y-6">
                                <div className="flex flex-col sm:flex-row items-center gap-6">
                                    {/* Big Player Photo */}
                                    <div className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-3xl overflow-hidden border-2 border-amber-400/70 bg-zinc-900 shadow-2xl shrink-0">
                                        {reqPlayer?.photoUrl ? (
                                            <img
                                                src={reqPlayer.photoUrl}
                                                alt={activeReq.playerName}
                                                className="w-full h-full object-contain"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-4xl font-black text-zinc-500 bg-zinc-900">
                                                {activeReq.playerName.charAt(0)}
                                            </div>
                                        )}
                                        {!hideNumbers && reqPlayer?.jerseyNumber && (
                                            <span className="absolute top-2 right-2 px-2 py-0.5 rounded-lg bg-black/80 border border-amber-400/50 text-amber-300 font-black text-xs">
                                                #{reqPlayer.jerseyNumber}
                                            </span>
                                        )}
                                    </div>

                                    {/* Player & Team Details */}
                                    <div className="flex-1 min-w-0 text-center sm:text-left space-y-3 w-full">
                                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                                            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-black uppercase tracking-wider">
                                                {reqPlayer?.category || 'Draft Pool'}
                                            </span>
                                            <span className="px-2.5 py-0.5 rounded-lg bg-blue-500/20 border border-blue-400/40 text-blue-300 text-[10px] font-black uppercase tracking-wider">
                                                {reqPlayer?.role || 'Player'}
                                            </span>
                                        </div>

                                        <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-white leading-none truncate">
                                            {activeReq.playerName}
                                        </h2>

                                        {/* Requesting Franchise Box */}
                                        <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-emerald-500/40 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                {reqTeam?.logoUrl ? (
                                                    <img
                                                        src={reqTeam.logoUrl}
                                                        alt={activeReq.teamName}
                                                        className="w-11 h-11 rounded-xl object-contain bg-white p-1 border border-emerald-400/50 shrink-0 shadow"
                                                    />
                                                ) : (
                                                    <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white font-black text-lg flex items-center justify-center shrink-0">
                                                        {activeReq.teamName.charAt(0)}
                                                    </div>
                                                )}
                                                <div className="min-w-0 text-left">
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">
                                                        Requested By Team
                                                    </p>
                                                    <p className="text-base sm:text-lg font-black uppercase tracking-tight text-white truncate">
                                                        {activeReq.teamName}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0 pl-3 border-l border-zinc-800">
                                                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Squad</p>
                                                <p className="text-sm font-black text-amber-300 tabular-nums">
                                                    {reqTeam?.players?.length || 0} Picks
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {activeReq.errorMessage && (
                                    <div className="px-4 py-3 rounded-2xl bg-red-950/90 border border-red-500/70 text-red-200 text-xs font-bold flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                                        <span>{activeReq.errorMessage}</span>
                                    </div>
                                )}

                                {/* Big Action Buttons */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                                    <button
                                        type="button"
                                        disabled={isApprovingPopup}
                                        onClick={() => handleDismissPickRequest(activeReq.requestId)}
                                        className="sm:col-span-1 py-4 px-4 rounded-2xl bg-zinc-900 hover:bg-red-600/90 text-zinc-300 hover:text-white border-2 border-zinc-700 hover:border-red-500 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        <X className="w-4 h-4 stroke-[3]" /> Dismiss
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isApprovingPopup}
                                        onClick={async () => {
                                            setIsApprovingPopup(true);
                                            try {
                                                await handleApprovePickRequest(activeReq);
                                            } finally {
                                                setIsApprovingPopup(false);
                                            }
                                        }}
                                        className="sm:col-span-2 py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-500 hover:from-emerald-400 hover:to-green-400 text-black font-black text-sm sm:text-base uppercase tracking-wider shadow-[0_10px_35px_rgba(16,185,129,0.5)] flex items-center justify-center gap-2.5 transition-all active:scale-95 disabled:opacity-60"
                                    >
                                        <Check className="w-5 h-5 stroke-[3]" />
                                        {isApprovingPopup ? 'Processing SOLD...' : 'Approve & Mark SOLD'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* CONFIGURABLE SOLD CELEBRATION POPUP ACROSS ALL SCREENS */}
            <SoldCelebrationPopup
                celebrationData={draftState.lastSoldCelebration}
                durationMs={soldPopupDurationMs}
                customSoldAudioUrl={customAudio?.soldMusicUrl}
                players={players}
                teams={teams}
                hidePlayerNumbers={hideNumbers}
            />
        </div>
    );
};

export default CategoryDraftBoard;
