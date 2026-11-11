export type DraftThemeKey = 
    | 'DARK_OBSIDIAN' 
    | 'IPL_NAVY' 
    | 'ADVAYA_GOLD' 
    | 'NEON_STADIUM' 
    | 'CRIMSON_DYNASTY' 
    | 'STUDIO_LIGHT';

export interface DraftThemeConfig {
    key: DraftThemeKey;
    name: string;
    description: string;
    previewBg: string;
    previewBorder: string;
    badgeStyle: string;
    containerBg: string;
    headerBg: string;
    headerBorder: string;
    roundBadgeClass: string;
    turnBadgeClass: string;
    cardBg: string;
    cardBorder: string;
    categoryStripBg: string;
    categoryStripBorder: string;
    categoryText: string;
    soldBadgeBg: string;
    textColor: string;
    subTextColor: string;
    isLightMode?: boolean;
}

export const DRAFT_THEMES: Record<DraftThemeKey, DraftThemeConfig> = {
    DARK_OBSIDIAN: {
        key: 'DARK_OBSIDIAN',
        name: 'Dark Obsidian',
        description: 'Classic SM Sports carbon black with bright golden badges',
        previewBg: 'bg-zinc-950',
        previewBorder: 'border-amber-500',
        badgeStyle: 'bg-amber-500 text-black',
        containerBg: 'bg-black text-white',
        headerBg: 'bg-zinc-900/90',
        headerBorder: 'border-zinc-800',
        roundBadgeClass: 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-zinc-950 font-black border-2 border-white shadow-[0_0_20px_rgba(245,158,11,0.7)]',
        turnBadgeClass: 'bg-amber-500/15 border-amber-500/50 text-amber-400',
        cardBg: 'bg-gradient-to-b from-zinc-900 to-zinc-950',
        cardBorder: 'border-zinc-700/80',
        categoryStripBg: 'bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950',
        categoryStripBorder: 'border-amber-500/40',
        categoryText: 'text-amber-400',
        soldBadgeBg: 'bg-gradient-to-b from-red-950/90 via-zinc-950 to-black border-red-500 shadow-red-500/30',
        textColor: 'text-white',
        subTextColor: 'text-zinc-400'
    },
    IPL_NAVY: {
        key: 'IPL_NAVY',
        name: 'IPL Premier Navy',
        description: 'Royal midnight navy stadium atmosphere with golden trophy glow',
        previewBg: 'bg-[#0a1128]',
        previewBorder: 'border-blue-400',
        badgeStyle: 'bg-blue-600 text-yellow-300',
        containerBg: 'bg-[#020617] text-white',
        headerBg: 'bg-[#0a1128]/95',
        headerBorder: 'border-blue-800/60 shadow-[0_4px_25px_rgba(30,58,138,0.3)]',
        roundBadgeClass: 'bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600 text-white font-black border-2 border-yellow-400 shadow-[0_0_25px_rgba(59,130,246,0.8)]',
        turnBadgeClass: 'bg-blue-950/60 border-blue-500/60 text-yellow-300',
        cardBg: 'bg-gradient-to-b from-[#0b1a30] to-[#040d1a]',
        cardBorder: 'border-blue-800/70',
        categoryStripBg: 'bg-gradient-to-b from-[#040d1a] via-[#0a1729] to-[#040d1a]',
        categoryStripBorder: 'border-blue-500/50',
        categoryText: 'text-yellow-400',
        soldBadgeBg: 'bg-gradient-to-b from-red-950 via-[#0b1a30] to-[#040d1a] border-red-500 shadow-red-500/30',
        textColor: 'text-white',
        subTextColor: 'text-blue-200'
    },
    ADVAYA_GOLD: {
        key: 'ADVAYA_GOLD',
        name: 'Advaya Luxury Gold',
        description: 'Pure matte black with radiant 24K gold neon borders and rich badges',
        previewBg: 'bg-black',
        previewBorder: 'border-yellow-400',
        badgeStyle: 'bg-yellow-500 text-black',
        containerBg: 'bg-[#050505] text-white',
        headerBg: 'bg-[#0c0c0c]/95',
        headerBorder: 'border-yellow-500/50 shadow-[0_0_30px_rgba(234,179,8,0.25)]',
        roundBadgeClass: 'bg-gradient-to-r from-yellow-500 via-amber-300 to-yellow-500 text-zinc-950 font-black border-2 border-white shadow-[0_0_30px_rgba(234,179,8,0.9)]',
        turnBadgeClass: 'bg-yellow-500/15 border-yellow-500/60 text-yellow-300',
        cardBg: 'bg-gradient-to-b from-[#141414] to-[#080808]',
        cardBorder: 'border-yellow-600/50',
        categoryStripBg: 'bg-gradient-to-b from-[#080808] via-[#141414] to-[#080808]',
        categoryStripBorder: 'border-yellow-500/60',
        categoryText: 'text-yellow-400',
        soldBadgeBg: 'bg-gradient-to-b from-red-950 via-[#141414] to-black border-red-500 shadow-red-500/40',
        textColor: 'text-white',
        subTextColor: 'text-amber-200/70'
    },
    NEON_STADIUM: {
        key: 'NEON_STADIUM',
        name: 'Neon Stadium',
        description: 'Electric cyber teal & emerald sports arena lighting',
        previewBg: 'bg-[#032820]',
        previewBorder: 'border-emerald-400',
        badgeStyle: 'bg-emerald-500 text-black',
        containerBg: 'bg-[#011410] text-white',
        headerBg: 'bg-[#02211b]/95',
        headerBorder: 'border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.3)]',
        roundBadgeClass: 'bg-gradient-to-r from-emerald-500 via-teal-300 to-emerald-500 text-zinc-950 font-black border-2 border-white shadow-[0_0_30px_rgba(16,185,129,0.8)]',
        turnBadgeClass: 'bg-emerald-500/15 border-emerald-500/60 text-emerald-300',
        cardBg: 'bg-gradient-to-b from-[#042d25] to-[#021813]',
        cardBorder: 'border-emerald-700/60',
        categoryStripBg: 'bg-gradient-to-b from-[#021813] via-[#042d25] to-[#021813]',
        categoryStripBorder: 'border-emerald-500/50',
        categoryText: 'text-emerald-400',
        soldBadgeBg: 'bg-gradient-to-b from-red-950 via-[#042d25] to-black border-red-500 shadow-red-500/40',
        textColor: 'text-white',
        subTextColor: 'text-emerald-200/70'
    },
    CRIMSON_DYNASTY: {
        key: 'CRIMSON_DYNASTY',
        name: 'Crimson Dynasty',
        description: 'Imperial ruby & velvet burgundy with brilliant gold championship accents',
        previewBg: 'bg-[#250408]',
        previewBorder: 'border-rose-400',
        badgeStyle: 'bg-red-600 text-white',
        containerBg: 'bg-[#120204] text-white',
        headerBg: 'bg-[#220407]/95',
        headerBorder: 'border-red-700/60 shadow-[0_0_30px_rgba(225,29,72,0.3)]',
        roundBadgeClass: 'bg-gradient-to-r from-red-600 via-rose-500 to-red-600 text-white font-black border-2 border-amber-300 shadow-[0_0_30px_rgba(239,68,68,0.8)]',
        turnBadgeClass: 'bg-red-950/60 border-red-500/60 text-amber-300',
        cardBg: 'bg-gradient-to-b from-[#2a060a] to-[#140204]',
        cardBorder: 'border-red-800/70',
        categoryStripBg: 'bg-gradient-to-b from-[#140204] via-[#2a060a] to-[#140204]',
        categoryStripBorder: 'border-red-500/60',
        categoryText: 'text-amber-400',
        soldBadgeBg: 'bg-gradient-to-b from-red-900 via-[#2a060a] to-black border-red-500 shadow-red-500/40',
        textColor: 'text-white',
        subTextColor: 'text-rose-200/70'
    },
    STUDIO_LIGHT: {
        key: 'STUDIO_LIGHT',
        name: 'Clean Studio Light',
        description: 'Crisp high-contrast daytime studio look for bright auditoriums',
        previewBg: 'bg-white',
        previewBorder: 'border-blue-600',
        badgeStyle: 'bg-blue-600 text-white',
        containerBg: 'bg-slate-100 text-slate-900',
        headerBg: 'bg-white text-slate-900',
        headerBorder: 'border-slate-300 shadow-md',
        roundBadgeClass: 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black border-2 border-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.4)]',
        turnBadgeClass: 'bg-blue-50 border-blue-300 text-blue-900 font-bold',
        cardBg: 'bg-white text-slate-900',
        cardBorder: 'border-slate-300 shadow-md',
        categoryStripBg: 'bg-slate-200/90',
        categoryStripBorder: 'border-slate-300',
        categoryText: 'text-blue-900 font-black',
        soldBadgeBg: 'bg-red-50 border-red-500 shadow-sm',
        textColor: 'text-slate-900',
        subTextColor: 'text-slate-600',
        isLightMode: true
    }
};

export const getDraftTheme = (key?: string): DraftThemeConfig => {
    if (key && key in DRAFT_THEMES) {
        return DRAFT_THEMES[key as DraftThemeKey];
    }
    return DRAFT_THEMES.DARK_OBSIDIAN;
};
