import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuction } from '../hooks/useAuction';
import { SpinWheelItem, SpinWheelState, Team, Player } from '../types';
import confetti from 'canvas-confetti';
import { 
  Trophy, User, Sparkles, X, Shuffle, CheckSquare, Square, 
  Search, Filter, Monitor, Cast, Eye, EyeOff, Volume2, VolumeX,
  RotateCcw, Trash2, CheckCircle2, ChevronRight, Plus, ListPlus, Gift, FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const SLICE_COLORS = [
  '#F59E0B', '#10B981', '#3B82F6', '#EC4899', 
  '#8B5CF6', '#14B8A6', '#F97316', '#06B6D4',
  '#EAB308', '#6366F1', '#84CC16', '#EF4444'
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SpinningWheelModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { state, updateSpinWheelState } = useAuction();
  const { teams = [], players = [], unsoldPlayers = [], categories = [] } = state;

  const [mode, setMode] = useState<'TEAMS' | 'PLAYERS' | 'CUSTOM'>('TEAMS');
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  
  // Custom items states
  const [customItems, setCustomItems] = useState<SpinWheelItem[]>(() => {
    try {
      const saved = localStorage.getItem('spin_wheel_custom_items');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [
      { id: 'custom-1', name: 'Option 1', type: 'CUSTOM', color: SLICE_COLORS[0] },
      { id: 'custom-2', name: 'Option 2', type: 'CUSTOM', color: SLICE_COLORS[1] },
      { id: 'custom-3', name: 'Option 3', type: 'CUSTOM', color: SLICE_COLORS[2] },
      { id: 'custom-4', name: 'Option 4', type: 'CUSTOM', color: SLICE_COLORS[3] },
    ];
  });
  const [customInputText, setCustomInputText] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [showBulkAdd, setShowBulkAdd] = useState(false);

  // Player filter states
  const [playerFilterMode, setPlayerFilterMode] = useState<'ALL' | 'UNSOLD' | 'CATEGORY'>('UNSOLD');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [playerSearch, setPlayerSearch] = useState('');

  // Wheel animation states
  const [rotation, setRotation] = useState<number>(0);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [winner, setWinner] = useState<SpinWheelItem | null>(null);
  const [showWinnerPopup, setShowWinnerPopup] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Broadcast toggle states
  const [showOnProjector, setShowOnProjector] = useState<boolean>(false);
  const [showOnOBS, setShowOnOBS] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentRotationRef = useRef<number>(0);

  // Sync broadcast state if already active in state
  useEffect(() => {
    if (state.spinWheelState) {
      if (state.spinWheelState.showOnProjector !== undefined) {
        setShowOnProjector(state.spinWheelState.showOnProjector);
      }
      if (state.spinWheelState.showOnOBS !== undefined) {
        setShowOnOBS(state.spinWheelState.showOnOBS);
      }
    }
  }, [state.spinWheelState]);

  // Persist custom items to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('spin_wheel_custom_items', JSON.stringify(customItems));
    } catch {}
  }, [customItems]);

  // Initialize selection when teams or players load
  useEffect(() => {
    if (teams.length > 0 && selectedTeamIds.length === 0) {
      setSelectedTeamIds(teams.map(t => String(t.id)));
    }
  }, [teams]);

  useEffect(() => {
    if (players.length > 0 && selectedPlayerIds.length === 0) {
      // Default to unsold players or first 20 players if none unsold
      const defaultIds = unsoldPlayers.length > 0 
        ? unsoldPlayers.map(p => String(p.id))
        : players.slice(0, 20).map(p => String(p.id));
      setSelectedPlayerIds(defaultIds);
    }
  }, [players, unsoldPlayers]);

  // Audio synthesizer for ticking mechanical sound
  const playTickSound = () => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(650, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.03);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.03);
    } catch {
      // Ignore audio failure
    }
  };

  // Convert selected teams to Wheel Items
  const teamItems: SpinWheelItem[] = useMemo(() => {
    return teams
      .filter(t => selectedTeamIds.includes(String(t.id)))
      .map((t, idx) => ({
        id: String(t.id),
        name: t.name,
        shortName: t.shortName || t.name.slice(0, 4),
        type: 'TEAM',
        logoUrl: t.logoUrl,
        color: SLICE_COLORS[idx % SLICE_COLORS.length]
      }));
  }, [teams, selectedTeamIds]);

  // Filtered Players for selection UI
  const filteredPlayers = useMemo(() => {
    let list = players;
    if (playerFilterMode === 'UNSOLD') {
      const unsoldIdSet = new Set(unsoldPlayers.map(p => String(p.id)));
      list = players.filter(p => unsoldIdSet.has(String(p.id)) || p.status === 'UNSOLD' || (!p.status && !p.soldTo));
    } else if (playerFilterMode === 'CATEGORY' && selectedCategory !== 'ALL') {
      list = players.filter(p => (p.category || '').toLowerCase().trim() === selectedCategory.toLowerCase().trim());
    }

    if (playerSearch.trim()) {
      const q = playerSearch.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q) || (p.role || '').toLowerCase().includes(q));
    }

    return list;
  }, [players, unsoldPlayers, playerFilterMode, selectedCategory, playerSearch]);

  // Convert selected players to Wheel Items
  const playerItems: SpinWheelItem[] = useMemo(() => {
    const selectedSet = new Set(selectedPlayerIds);
    return players
      .filter(p => selectedSet.has(String(p.id)))
      .map((p, idx) => ({
        id: String(p.id),
        name: p.name,
        type: 'PLAYER',
        logoUrl: p.photoUrl,
        category: p.category,
        role: p.role,
        basePrice: p.basePrice,
        color: SLICE_COLORS[idx % SLICE_COLORS.length]
      }));
  }, [players, selectedPlayerIds]);

  // Convert custom items or active items
  const activeItems = useMemo(() => {
    if (mode === 'TEAMS') return teamItems;
    if (mode === 'PLAYERS') return playerItems;
    return customItems;
  }, [mode, teamItems, playerItems, customItems]);

  // Custom Item Handlers
  const handleAddCustomItem = (nameToAdd?: string) => {
    const text = (nameToAdd || customInputText).trim();
    if (!text) return;
    const newItem: SpinWheelItem = {
      id: 'custom-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      name: text,
      shortName: text.length > 8 ? text.slice(0, 8) : undefined,
      type: 'CUSTOM',
      color: SLICE_COLORS[customItems.length % SLICE_COLORS.length]
    };
    const nextCustom = [...customItems, newItem];
    setCustomItems(nextCustom);
    if (!nameToAdd) setCustomInputText('');
  };

  const handleBulkAdd = () => {
    if (!bulkText.trim()) return;
    const lines = bulkText
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    
    const newItems: SpinWheelItem[] = lines.map((line, idx) => ({
      id: 'custom-' + Date.now() + '-' + idx + '-' + Math.random().toString(36).substr(2, 4),
      name: line,
      shortName: line.length > 8 ? line.slice(0, 8) : undefined,
      type: 'CUSTOM',
      color: SLICE_COLORS[(customItems.length + idx) % SLICE_COLORS.length]
    }));
    
    setCustomItems(prev => [...prev, ...newItems]);
    setBulkText('');
    setShowBulkAdd(false);
  };

  const handleDeleteCustomItem = (id: string) => {
    setCustomItems(prev => prev.filter(item => item.id !== id));
  };

  const handleLoadNumbersPreset = () => {
    const items: SpinWheelItem[] = Array.from({ length: 8 }, (_, i) => ({
      id: `custom-num-${i + 1}-${Date.now()}`,
      name: `Option ${i + 1}`,
      shortName: `#${i + 1}`,
      type: 'CUSTOM',
      color: SLICE_COLORS[i % SLICE_COLORS.length]
    }));
    setCustomItems(items);
  };

  const handleLoadPrizesPreset = () => {
    const prizes = ['Grand Prize', 'Wildcard', 'Extra ₹50L', 'Bonus Pick', 'Skip Turn', 'Double Bid'];
    const items: SpinWheelItem[] = prizes.map((p, idx) => ({
      id: `custom-prize-${idx}-${Date.now()}`,
      name: p,
      shortName: p.length > 8 ? p.slice(0, 8) : undefined,
      type: 'CUSTOM',
      color: SLICE_COLORS[idx % SLICE_COLORS.length]
    }));
    setCustomItems(items);
  };

  const handleClearCustom = () => {
    setCustomItems([]);
  };

  // Sync to Firestore whenever broadcast settings change
  const syncToBroadcast = (overrideState?: Partial<SpinWheelState>) => {
    const projState = overrideState?.showOnProjector !== undefined ? overrideState.showOnProjector : showOnProjector;
    const obsState = overrideState?.showOnOBS !== undefined ? overrideState.showOnOBS : showOnOBS;

    if (!projState && !obsState) {
      if (state.spinWheelState?.isActive) {
        updateSpinWheelState(null);
      }
      return;
    }

    const payload: SpinWheelState = {
      isActive: true,
      showOnProjector: projState,
      showOnOBS: obsState,
      mode,
      items: activeItems,
      isSpinning,
      targetRotation: rotation,
      winner,
      showWinnerPopup,
      updatedAt: Date.now(),
      ...overrideState
    };

    updateSpinWheelState(payload);
  };

  // Toggle broadcast switches
  const toggleProjector = (val: boolean) => {
    setShowOnProjector(val);
    syncToBroadcast({ showOnProjector: val });
  };

  const toggleOBS = (val: boolean) => {
    setShowOnOBS(val);
    syncToBroadcast({ showOnOBS: val });
  };

  const hideAllBroadcasts = () => {
    setShowOnProjector(false);
    setShowOnOBS(false);
    updateSpinWheelState(null);
  };

  // Draw the Wheel on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || activeItems.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 12;
    const sliceAngle = (2 * Math.PI) / activeItems.length;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((rotation * Math.PI) / 180);

    // Draw slices
    activeItems.forEach((item, index) => {
      const angle = index * sliceAngle;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, angle, angle + sliceAngle);
      ctx.closePath();

      ctx.fillStyle = item.color || SLICE_COLORS[index % SLICE_COLORS.length];
      ctx.fill();

      // Divider stroke
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Text label inside slice
      ctx.save();
      ctx.rotate(angle + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 5;
      ctx.font = activeItems.length > 20 ? 'bold 11px sans-serif' : activeItems.length > 12 ? 'bold 13px sans-serif' : 'bold 15px sans-serif';

      const displayName = item.shortName || item.name;
      const maxTextWidth = radius - 40;
      let text = displayName;
      if (ctx.measureText(text).width > maxTextWidth) {
        while (ctx.measureText(text + '...').width > maxTextWidth && text.length > 3) {
          text = text.slice(0, -1);
        }
        text += '...';
      }

      ctx.fillText(text, radius - 18, 0);
      ctx.restore();
    });

    ctx.restore();

    // Outer rim ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Metallic center hub
    ctx.beginPath();
    ctx.arc(centerX, centerY, 32, 0, 2 * Math.PI);
    ctx.fillStyle = '#09090B';
    ctx.fill();
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 14, 0, 2 * Math.PI);
    ctx.fillStyle = '#F59E0B';
    ctx.fill();
  }, [activeItems, rotation]);

  // Spin Wheel Physics Algorithm
  const handleSpin = () => {
    if (isSpinning || activeItems.length < 2) return;

    setIsSpinning(true);
    setShowWinnerPopup(false);
    setWinner(null);

    // Pick random target winner
    const targetIdx = Math.floor(Math.random() * activeItems.length);
    const targetItem = activeItems[targetIdx];

    // Compute stopping angle so the target slice lands at 12 o'clock pointer (270° in canvas coords)
    const sliceDegrees = 360 / activeItems.length;
    // Slice k angle center: k * sliceDegrees + sliceDegrees / 2
    // When wheel rotates by R, angle at 270 is: (270 - R) mod 360
    // So R = 270 - (k * sliceDegrees + sliceDegrees / 2)
    const targetSliceCenter = targetIdx * sliceDegrees + sliceDegrees / 2;
    // Add small random jitter inside slice so it doesn't always hit dead center
    const jitter = (Math.random() - 0.5) * (sliceDegrees * 0.5);
    
    // Add 6 to 8 full revolutions for excitement
    const fullSpins = (6 + Math.floor(Math.random() * 2)) * 360;
    const currentBase = currentRotationRef.current % 360;
    let targetNormalized = (270 - (targetSliceCenter + jitter)) % 360;
    if (targetNormalized < 0) targetNormalized += 360;
    
    const targetRot = currentRotationRef.current + fullSpins + ((targetNormalized - currentBase + 360) % 360);
    const duration = 5200; // 5.2 seconds
    const startTime = Date.now();
    const startRot = currentRotationRef.current;

    // Sync spin start to Projector/OBS
    syncToBroadcast({
      isSpinning: true,
      targetIndex: targetIdx,
      targetRotation: targetRot,
      spinDuration: duration,
      spinStartTime: startTime,
      winner: null,
      showWinnerPopup: false
    });

    let lastTickAngle = startRot;

    const easeOutQuart = (x: number): number => 1 - Math.pow(1 - x, 4);

    const step = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(1, Math.max(0, elapsed / duration));
      const curAngle = startRot + (targetRot - startRot) * easeOutQuart(progress);

      setRotation(curAngle);
      currentRotationRef.current = curAngle;

      // Check if we crossed a slice boundary to trigger tick sound
      if (Math.abs(curAngle - lastTickAngle) >= sliceDegrees) {
        playTickSound();
        lastTickAngle = curAngle;
      }

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        // Spin Finished!
        setIsSpinning(false);
        setRotation(targetRot);
        currentRotationRef.current = targetRot;
        setWinner(targetItem);
        setShowWinnerPopup(true);

        // Confetti burst
        confetti({
          particleCount: 160,
          spread: 90,
          origin: { y: 0.55 },
          zIndex: 99999
        });

        // Sync winner to Projector/OBS
        syncToBroadcast({
          isSpinning: false,
          targetRotation: targetRot,
          winner: targetItem,
          showWinnerPopup: true
        });
      }
    };

    animationFrameRef.current = requestAnimationFrame(step);
  };

  // Remove winner from the wheel and spin again
  const handleRemoveWinnerAndSpinAgain = () => {
    if (!winner) return;

    if (mode === 'TEAMS') {
      setSelectedTeamIds(prev => prev.filter(id => id !== winner.id));
    } else if (mode === 'PLAYERS') {
      setSelectedPlayerIds(prev => prev.filter(id => id !== winner.id));
    } else {
      setCustomItems(prev => prev.filter(item => item.id !== winner.id));
    }

    setShowWinnerPopup(false);
    setWinner(null);
    syncToBroadcast({ showWinnerPopup: false, winner: null });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-zinc-950 border-2 border-amber-500/30 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Top Header */}
        <div className="p-5 md:p-6 border-b border-white/10 flex flex-wrap items-center justify-between gap-4 bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/10">
              <Shuffle className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white italic">
                  Spinning Wheel
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Live Randomizer
                </span>
              </div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">
                Independent tool • Does not alter live auction bids or player status
              </p>
            </div>
          </div>

          {/* Broadcast Controls & Sound */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2.5 rounded-xl border transition-all text-xs flex items-center gap-1.5 ${
                soundEnabled 
                  ? 'bg-zinc-900 border-white/20 text-amber-400' 
                  : 'bg-zinc-900/50 border-white/10 text-zinc-600'
              }`}
              title={soundEnabled ? 'Mute Tick Sound' : 'Enable Tick Sound'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Projector Toggle */}
            <button
              onClick={() => toggleProjector(!showOnProjector)}
              className={`px-3.5 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all ${
                showOnProjector 
                  ? 'bg-emerald-500 text-black border-emerald-400 shadow-lg shadow-emerald-500/20' 
                  : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-white'
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span>Projector: {showOnProjector ? 'ON' : 'OFF'}</span>
            </button>

            {/* OBS Overlay Toggle */}
            <button
              onClick={() => toggleOBS(!showOnOBS)}
              className={`px-3.5 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all ${
                showOnOBS 
                  ? 'bg-cyan-500 text-black border-cyan-400 shadow-lg shadow-cyan-500/20' 
                  : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-white'
              }`}
            >
              <Cast className="w-4 h-4" />
              <span>OBS: {showOnOBS ? 'ON' : 'OFF'}</span>
            </button>

            {(showOnProjector || showOnOBS) && (
              <button
                onClick={hideAllBroadcasts}
                className="px-3 py-2 rounded-xl bg-red-600/20 border border-red-500/40 text-red-400 hover:bg-red-600 hover:text-white text-[10px] font-black uppercase tracking-wider transition-all"
                title="Hide immediately from all broadcast screens"
              >
                Hide Screens
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2.5 rounded-xl bg-zinc-900 border border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white transition-all ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Left Side Controls / Right Side Wheel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto">
          
          {/* Left Column: Mode & Item Selection */}
          <div className="lg:col-span-5 p-5 md:p-6 border-b lg:border-b-0 lg:border-r border-white/10 flex flex-col space-y-5 bg-zinc-900/30 overflow-y-auto max-h-[600px] lg:max-h-none">
            
            {/* Mode Segmented Buttons */}
            <div>
              <label className="block text-[9px] font-black uppercase tracking-[0.25em] text-zinc-500 mb-2">
                1. Select Draw Type
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-900 rounded-2xl border border-white/10">
                <button
                  type="button"
                  onClick={() => { setMode('TEAMS'); setShowWinnerPopup(false); }}
                  className={`py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                    mode === 'TEAMS' 
                      ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' 
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Trophy className="w-3.5 h-3.5" /> Teams ({teams.length})
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('PLAYERS'); setShowWinnerPopup(false); }}
                  className={`py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                    mode === 'PLAYERS' 
                      ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' 
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <User className="w-3.5 h-3.5" /> Players ({players.length})
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('CUSTOM'); setShowWinnerPopup(false); }}
                  className={`py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                    mode === 'CUSTOM' 
                      ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' 
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Gift className="w-3.5 h-3.5" /> Custom ({customItems.length})
                </button>
              </div>
            </div>

            {/* TEAMS SELECTION LIST */}
            {mode === 'TEAMS' && (
              <div className="space-y-3 flex-1 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    {selectedTeamIds.length} of {teams.length} Teams on Wheel
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedTeamIds(teams.map(t => String(t.id)))}
                      className="text-[9px] font-black uppercase tracking-wider text-amber-400 hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-zinc-600">•</span>
                    <button
                      type="button"
                      onClick={() => setSelectedTeamIds([])}
                      className="text-[9px] font-black uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto max-h-[360px] pr-1">
                  {teams.map(team => {
                    const isSelected = selectedTeamIds.includes(String(team.id));
                    return (
                      <div
                        key={team.id}
                        onClick={() => {
                          setSelectedTeamIds(prev => 
                            isSelected ? prev.filter(id => id !== String(team.id)) : [...prev, String(team.id)]
                          );
                        }}
                        className={`p-3 rounded-2xl border-2 flex items-center gap-3 cursor-pointer transition-all select-none ${
                          isSelected 
                            ? 'bg-amber-500/10 border-amber-500/40 text-white' 
                            : 'bg-zinc-900/40 border-white/5 text-zinc-500 hover:border-white/20'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-amber-500 border-amber-400 text-black' : 'border-zinc-700 bg-zinc-800'
                        }`}>
                          {isSelected && <CheckSquare className="w-3.5 h-3.5" />}
                        </div>

                        <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-white/10 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                          {team.logoUrl ? (
                            <img src={team.logoUrl} alt={team.name} className="max-w-full max-h-full object-contain" />
                          ) : (
                            <span className="text-xs font-black text-amber-400">{team.name.charAt(0)}</span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black uppercase truncate">{team.name}</p>
                          <p className="text-[9px] font-bold text-zinc-500 uppercase">{team.shortName || `Purse: ₹${team.budget}`}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PLAYERS SELECTION LIST */}
            {mode === 'PLAYERS' && (
              <div className="space-y-3 flex-1 flex flex-col">
                {/* Filter Pills */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPlayerFilterMode('UNSOLD')}
                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
                      playerFilterMode === 'UNSOLD' 
                        ? 'bg-amber-500 text-black' 
                        : 'bg-zinc-900 text-zinc-400 hover:text-white border border-white/5'
                    }`}
                  >
                    Unsold ({unsoldPlayers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayerFilterMode('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
                      playerFilterMode === 'ALL' 
                        ? 'bg-amber-500 text-black' 
                        : 'bg-zinc-900 text-zinc-400 hover:text-white border border-white/5'
                    }`}
                  >
                    All ({players.length})
                  </button>

                  {categories.length > 0 && (
                    <select
                      value={selectedCategory}
                      onChange={(e) => {
                        setSelectedCategory(e.target.value);
                        setPlayerFilterMode('CATEGORY');
                      }}
                      className="px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider bg-zinc-900 border border-white/10 text-zinc-300 outline-none"
                    >
                      <option value="ALL">All Categories</option>
                      {categories.map(c => (
                        <option key={c.id || c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Search input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    placeholder="Search player by name, role or category..."
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-black uppercase tracking-widest text-zinc-400">
                    {selectedPlayerIds.length} Players on Wheel
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const idsToAdd = filteredPlayers.map(p => String(p.id));
                        setSelectedPlayerIds(prev => Array.from(new Set([...prev, ...idsToAdd])));
                      }}
                      className="font-black uppercase text-amber-400 hover:underline"
                    >
                      Select Filtered ({filteredPlayers.length})
                    </button>
                    <span className="text-zinc-600">•</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPlayerIds([])}
                      className="font-black uppercase text-zinc-500 hover:text-zinc-300"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Scrollable players list */}
                <div className="space-y-1.5 overflow-y-auto max-h-[300px] pr-1">
                  {filteredPlayers.map(player => {
                    const isSelected = selectedPlayerIds.includes(String(player.id));
                    return (
                      <div
                        key={player.id}
                        onClick={() => {
                          setSelectedPlayerIds(prev =>
                            isSelected ? prev.filter(id => id !== String(player.id)) : [...prev, String(player.id)]
                          );
                        }}
                        className={`p-2.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-all select-none ${
                          isSelected 
                            ? 'bg-amber-500/10 border-amber-500/30 text-white' 
                            : 'bg-zinc-900/40 border-white/5 text-zinc-500 hover:border-white/15'
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-amber-500 border-amber-400 text-black' : 'border-zinc-700 bg-zinc-800'
                        }`}>
                          {isSelected && <CheckSquare className="w-3 h-3" />}
                        </div>

                        <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                          {player.photoUrl ? (
                            <img src={player.photoUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-4 h-4 text-zinc-500" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black uppercase truncate">{player.name}</p>
                          <p className="text-[9px] font-bold text-zinc-500 uppercase flex items-center gap-1.5">
                            <span>{player.category || 'Standard'}</span>
                            {player.role && <span>• {player.role}</span>}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CUSTOM FIELDS SELECTION & MANAGEMENT */}
            {mode === 'CUSTOM' && (
              <div className="space-y-3.5 flex-1 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    {customItems.length} Custom Options on Wheel
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowBulkAdd(!showBulkAdd)}
                      className="text-[9px] font-black uppercase tracking-wider text-amber-400 hover:underline flex items-center gap-1"
                    >
                      <ListPlus className="w-3 h-3" />
                      {showBulkAdd ? 'Single Input' : 'Bulk Paste'}
                    </button>
                    <span className="text-zinc-600">•</span>
                    <button
                      type="button"
                      onClick={handleClearCustom}
                      className="text-[9px] font-black uppercase tracking-wider text-zinc-500 hover:text-red-400"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                {/* Presets Row */}
                <div className="flex items-center gap-1.5 pb-1 border-b border-white/5">
                  <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Presets:</span>
                  <button
                    type="button"
                    onClick={handleLoadNumbersPreset}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[9px] font-black uppercase tracking-wider border border-white/10 transition-all"
                  >
                    1 - 8 Options
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadPrizesPreset}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[9px] font-black uppercase tracking-wider border border-white/10 transition-all"
                  >
                    Prize Pool
                  </button>
                </div>

                {/* Single Add Input */}
                {!showBulkAdd ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddCustomItem();
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={customInputText}
                      onChange={(e) => setCustomInputText(e.target.value)}
                      placeholder="Add custom option (e.g. Prize, Task, Team)..."
                      className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-500 transition-all"
                    />
                    <button
                      type="submit"
                      disabled={!customInputText.trim()}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-400 text-black font-black uppercase text-xs tracking-wider flex items-center gap-1.5 shrink-0 transition-all"
                    >
                      <Plus className="w-4 h-4" /> Add
                    </button>
                  </form>
                ) : (
                  /* Bulk Add Area */
                  <div className="p-3 bg-zinc-900/80 rounded-2xl border border-amber-500/20 space-y-2">
                    <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                      Paste items separated by commas or line breaks:
                    </p>
                    <textarea
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      placeholder="Option 1&#10;Option 2&#10;Option 3, Option 4..."
                      rows={3}
                      className="w-full bg-zinc-950 border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-amber-500 resize-none font-mono"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowBulkAdd(false)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white text-[10px] font-black uppercase"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleBulkAdd}
                        disabled={!bulkText.trim()}
                        className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-[10px] font-black uppercase tracking-wider"
                      >
                        Add All Options
                      </button>
                    </div>
                  </div>
                )}

                {/* List of custom options */}
                <div className="space-y-1.5 overflow-y-auto max-h-[300px] pr-1">
                  {customItems.length === 0 ? (
                    <div className="py-8 text-center border border-dashed border-white/10 rounded-2xl">
                      <Gift className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                      <p className="text-xs text-zinc-400 font-bold">No custom options added yet</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">Use the input above or pick a preset</p>
                    </div>
                  ) : (
                    customItems.map((item, idx) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/10 flex items-center justify-between gap-3 group hover:border-amber-500/30 transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                            style={{ backgroundColor: item.color || SLICE_COLORS[idx % SLICE_COLORS.length] }}
                          />
                          <span className="text-xs font-black uppercase text-white truncate">
                            {item.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomItem(item.id)}
                          className="p-1 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-80 group-hover:opacity-100"
                          title="Delete option"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Wheel Canvas & Spin Action */}
          <div className="lg:col-span-7 p-6 flex flex-col items-center justify-center relative min-h-[440px] bg-gradient-to-b from-zinc-950 via-zinc-900/40 to-zinc-950">
            
            {activeItems.length < 2 ? (
              <div className="text-center p-8 border-2 border-dashed border-white/10 rounded-3xl max-w-sm">
                <Shuffle className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                <h3 className="text-sm font-black uppercase tracking-wider text-white mb-1">
                  Not Enough Items Selected
                </h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Please select or add at least 2 {mode === 'TEAMS' ? 'teams' : mode === 'PLAYERS' ? 'players' : 'custom options'} from the left panel to populate the wheel.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center w-full">
                
                {/* Pointer at 12 o'clock */}
                <div className="relative flex flex-col items-center">
                  <div className="absolute -top-3 z-30 flex flex-col items-center drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]">
                    <div className="w-0 h-0 border-l-[14px] border-l-transparent border-r-[14px] border-r-transparent border-t-[26px] border-t-amber-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-zinc-950 border border-amber-400 -mt-5 z-40" />
                  </div>

                  {/* Wheel canvas container */}
                  <div className="relative rounded-full p-2 bg-gradient-to-b from-amber-500/30 via-zinc-900 to-black border-4 border-amber-500/50 shadow-[0_0_60px_rgba(245,158,11,0.2)]">
                    <canvas
                      ref={canvasRef}
                      width={380}
                      height={380}
                      className="rounded-full shadow-2xl block"
                    />
                  </div>
                </div>

                {/* Spin Button */}
                <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full max-w-md justify-center">
                  <button
                    type="button"
                    onClick={handleSpin}
                    disabled={isSpinning || activeItems.length < 2}
                    className={`w-full py-4 px-8 rounded-2xl font-black uppercase tracking-[0.25em] text-sm transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 ${
                      isSpinning 
                        ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                        : 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black shadow-amber-500/25 hover:shadow-amber-500/40'
                    }`}
                  >
                    <Sparkles className={`w-5 h-5 ${isSpinning ? 'animate-spin' : ''}`} />
                    {isSpinning ? 'SPINNING...' : 'SPIN WHEEL NOW'}
                  </button>
                </div>

                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-3">
                  {activeItems.length} {mode === 'TEAMS' ? 'Teams' : mode === 'PLAYERS' ? 'Players' : 'Options'} currently in wheel pool
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* WINNER CELEBRATION MODAL */}
      <AnimatePresence>
        {showWinnerPopup && winner && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-2xl"
          >
            <div className="relative max-w-md w-full bg-gradient-to-b from-zinc-900 via-zinc-950 to-black border-4 border-amber-500 rounded-[2.5rem] p-8 text-center shadow-[0_0_100px_rgba(245,158,11,0.5)] overflow-hidden">
              <button
                onClick={() => setShowWinnerPopup(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-black uppercase tracking-[0.25em] text-[10px] mb-6">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                <span>LUCKY DRAW WINNER</span>
              </div>

              {winner.type === 'TEAM' ? (
                <div className="flex flex-col items-center">
                  <div className="w-32 h-32 rounded-3xl bg-zinc-900 border-4 border-amber-500 p-3 shadow-2xl flex items-center justify-center mb-4 overflow-hidden">
                    {winner.logoUrl ? (
                      <img src={winner.logoUrl} alt={winner.name} className="max-w-full max-h-full object-contain drop-shadow-lg" />
                    ) : (
                      <Trophy className="w-16 h-16 text-amber-400" />
                    )}
                  </div>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-400 mb-1">
                    WINNING TEAM
                  </h4>
                  <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white italic mb-2">
                    {winner.name}
                  </h2>
                  {winner.shortName && (
                    <span className="px-3 py-1 rounded-lg bg-white/10 text-zinc-300 font-bold text-xs uppercase tracking-wider mb-4">
                      {winner.shortName}
                    </span>
                  )}
                </div>
              ) : winner.type === 'PLAYER' ? (
                <div className="flex flex-col items-center">
                  <div className="w-32 h-32 rounded-3xl bg-zinc-900 border-4 border-amber-500 p-1.5 shadow-2xl flex items-center justify-center mb-4 overflow-hidden">
                    {winner.logoUrl ? (
                      <img src={winner.logoUrl} alt={winner.name} className="w-full h-full object-cover rounded-2xl" />
                    ) : (
                      <User className="w-16 h-16 text-amber-400" />
                    )}
                  </div>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-400 mb-1">
                    SELECTED PLAYER
                  </h4>
                  <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white italic mb-2">
                    {winner.name}
                  </h2>

                  <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
                    {winner.category && (
                      <span className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-black text-xs uppercase tracking-wider border border-amber-500/30">
                        {winner.category}
                      </span>
                    )}
                    {winner.role && (
                      <span className="px-3 py-1 rounded-lg bg-blue-500/20 text-blue-300 font-black text-xs uppercase tracking-wider border border-blue-500/30">
                        {winner.role}
                      </span>
                    )}
                    {winner.basePrice !== undefined && winner.basePrice > 0 && (
                      <span className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-black text-xs uppercase tracking-wider border border-emerald-500/30">
                        ₹{winner.basePrice.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-32 h-32 rounded-3xl bg-zinc-900 border-4 border-amber-500 p-3 shadow-2xl flex items-center justify-center mb-4 overflow-hidden relative group">
                    <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/20 to-purple-500/20" />
                    <Gift className="w-16 h-16 text-amber-400 relative z-10 animate-bounce" />
                  </div>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-400 mb-1">
                    CUSTOM DRAW SELECTION
                  </h4>
                  <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white italic mb-2">
                    {winner.name}
                  </h2>
                  <span className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-black text-xs uppercase tracking-wider border border-amber-500/30 mb-4">
                    Winner Picked
                  </span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-1 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleSpin}
                  className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2 shadow-lg"
                >
                  <RotateCcw className="w-4 h-4" /> Spin Again
                </button>

                <button
                  type="button"
                  onClick={handleRemoveWinnerAndSpinAgain}
                  className="w-full py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black uppercase tracking-wider text-[10px] transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" /> Remove Winner & Spin Again
                </button>

                <button
                  type="button"
                  onClick={() => setShowWinnerPopup(false)}
                  className="w-full py-2.5 rounded-xl bg-transparent hover:bg-white/5 text-zinc-500 hover:text-white font-black uppercase tracking-widest text-[9px] transition-all"
                >
                  Close Result
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
