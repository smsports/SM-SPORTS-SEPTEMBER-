import React, { useState, useRef } from 'react';
import { Team, Player, RegisteredPlayer, RegistrationConfig } from '../types';
import { jsPDF } from 'jspdf';
import { 
  Download, X, CheckSquare, Square, FileText, ChevronDown, Check, 
  Loader2, Sparkles, Shield, User, Image as ImageIcon, Crown, Phone, Shirt, Eye
} from 'lucide-react';
import { resolveTeamSquad } from '../utils';

export interface PhotoFieldOption {
  id: string;
  label: string;
  category: 'basic' | 'jersey' | 'financial' | 'contact';
}

const DEFAULT_PHOTO_FIELDS: PhotoFieldOption[] = [
  { id: 'photo', label: 'Player Photo', category: 'basic' },
  { id: 'playerNumber', label: 'Player #', category: 'basic' },
  { id: 'name', label: 'Player Name', category: 'basic' },
  { id: 'role', label: 'Role / Speciality', category: 'basic' },
  { id: 'category', label: 'Category / Group', category: 'basic' },
  { id: 'captainBadge', label: 'Captain (C) Badge', category: 'basic' },
  { id: 'jerseyName', label: 'Jersey Name', category: 'jersey' },
  { id: 'jerseyNumber', label: 'Jersey Number', category: 'jersey' },
  { id: 'jerseySize', label: 'Jersey Size', category: 'jersey' },
  { id: 'soldPrice', label: 'Sold / Acquisition Price', category: 'financial' },
  { id: 'basePrice', label: 'Base Price', category: 'financial' },
  { id: 'mobile', label: 'Contact / Phone', category: 'contact' },
  { id: 'dob', label: 'Date of Birth', category: 'contact' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  teams: Team[];
  allPlayers?: Player[];
  initialTeamId?: string | number;
  tournamentName?: string;
  registrations?: RegisteredPlayer[];
  registrationConfig?: RegistrationConfig;
  systemLogoUrl?: string;
}

// Convert image url to base64 safely for jsPDF embedding
const loadImageDataUrl = async (url: string): Promise<string | null> => {
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => resolve(null), 4000);

    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(img.naturalWidth || 400, 400);
        canvas.height = Math.min(img.naturalHeight || 400, 400);
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', 0.85);
        resolve(data);
      } catch (e) {
        resolve(null);
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };

    img.src = url;
  });
};

export const TeamPhotoPdfExportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  teams,
  allPlayers = [],
  initialTeamId,
  tournamentName = 'Tournament Championship',
  registrations = [],
  registrationConfig,
  systemLogoUrl
}) => {
  const [selectedTeamId, setSelectedTeamId] = useState<string | number>(
    initialTeamId || 'ALL'
  );
  const [pdfTheme, setPdfTheme] = useState<'WHITE' | 'DARK'>('WHITE');
  const [cardsPerPage, setCardsPerPage] = useState<4 | 6>(4);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string>('');

  // Selected fields for photo cards
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([
    'photo',
    'playerNumber',
    'name',
    'role',
    'category',
    'captainBadge',
    'jerseyName',
    'jerseyNumber',
    'jerseySize',
    'soldPrice',
    'mobile'
  ]);

  if (!isOpen) return null;

  const toggleField = (id: string) => {
    setSelectedFieldIds(prev => 
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const selectAllFields = () => {
    setSelectedFieldIds(DEFAULT_PHOTO_FIELDS.map(f => f.id));
  };

  const resetFields = () => {
    setSelectedFieldIds([
      'photo', 'playerNumber', 'name', 'role', 'category', 
      'captainBadge', 'jerseyName', 'jerseyNumber', 'jerseySize', 'soldPrice', 'mobile'
    ]);
  };

  // Target team preview
  const previewTeam = selectedTeamId === 'ALL'
    ? teams[0]
    : teams.find(t => String(t.id) === String(selectedTeamId)) || teams[0];

  const previewSquad = previewTeam ? resolveTeamSquad(previewTeam, allPlayers) : [];

  // Captain resolution
  const getTeamCaptainInfo = (team: Team, squad: Player[]) => {
    if (team.captainName) {
      return {
        name: team.captainName,
        isOwner: false,
        photo: team.captainPhoto
      };
    }
    const ownerName = team.ownerName || team.owner || '';
    if (team.isOwnerCaptain !== false && ownerName) {
      return {
        name: ownerName,
        isOwner: true,
        photo: team.ownerPhoto
      };
    }
    const captPlayer = squad.find(p => p.isCaptain);
    if (captPlayer) {
      return {
        name: captPlayer.name,
        isOwner: false,
        photo: captPlayer.photoUrl
      };
    }
    return null;
  };

  const handleGeneratePdf = async () => {
    setIsExporting(true);
    setExportProgress('Preparing teams and player photos...');

    try {
      const targetTeams = selectedTeamId === 'ALL'
        ? teams
        : teams.filter(t => String(t.id) === String(selectedTeamId));

      if (targetTeams.length === 0) {
        alert("No teams available to export.");
        setIsExporting(false);
        return;
      }

      // Initialize jsPDF A4 in Portrait (210 x 297 mm)
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = 210;
      const pageHeight = 297;
      const isDark = pdfTheme === 'DARK';

      let isFirstPage = true;

      for (let tIdx = 0; tIdx < targetTeams.length; tIdx++) {
        const team = targetTeams[tIdx];
        setExportProgress(`Processing team ${tIdx + 1} of ${targetTeams.length}: ${team.name}...`);

        // Resolve complete squad including directly assigned players
        const squad = resolveTeamSquad(team, allPlayers);
        const captainInfo = getTeamCaptainInfo(team, squad);
        const ownerName = team.ownerName || team.owner || '';
        const isOwnerCaptain = team.isOwnerCaptain !== false && !team.captainName && !!ownerName;

        // Squad items list (including owner at top if owner is captain and not in squad)
        const squadList: Player[] = [];
        const ownerInSquad = squad.find(p => p.name.trim().toLowerCase() === ownerName.trim().toLowerCase());

        if (isOwnerCaptain && !ownerInSquad && ownerName) {
          const ownerReg = registrations.find(r => r.fullName.trim().toLowerCase() === ownerName.trim().toLowerCase());
          squadList.push({
            id: 'owner_captain',
            name: ownerName,
            photoUrl: team.ownerPhoto || ownerReg?.profilePic || team.logoUrl || '',
            category: 'Franchise Owner',
            role: 'Captain & Owner',
            basePrice: 0,
            soldPrice: 0,
            nationality: 'India',
            speciality: 'Captain',
            stats: { matches: 0, runs: 0, wickets: 0 },
            isCaptain: true,
            mobile: team.ownerPhone || ownerReg?.mobile || '',
            jerseyName: ownerReg?.jerseyName || ownerName,
            jerseyNumber: ownerReg?.jerseyNumber || '01',
            jerseySize: ownerReg?.jerseySize || 'L'
          });
        }

        squadList.push(...squad);

        // Preload player photos to base64
        const playerPhotos: Record<string, string | null> = {};
        for (const p of squadList) {
          const key = String(p.id ?? p.name);
          const reg = registrations.find(r => r.fullName.trim().toLowerCase() === p.name.trim().toLowerCase());
          const photoUrl = p.photoUrl || reg?.profilePic || '';
          if (photoUrl) {
            playerPhotos[key] = await loadImageDataUrl(photoUrl);
          } else {
            playerPhotos[key] = null;
          }
        }

        // Layout parameters
        // 4 cards per page: 2 columns x 2 rows
        // 6 cards per page: 2 columns x 3 rows
        const cols = 2;
        const rows = cardsPerPage === 4 ? 2 : 3;
        const totalCardsPerPage = cols * rows;
        const totalPagesForTeam = Math.ceil(Math.max(1, squadList.length) / totalCardsPerPage);

        for (let pIdx = 0; pIdx < totalPagesForTeam; pIdx++) {
          if (!isFirstPage) {
            doc.addPage();
          }
          isFirstPage = false;

          // 1. Page Background
          if (isDark) {
            doc.setFillColor(15, 23, 42); // slate-900
            doc.rect(0, 0, pageWidth, pageHeight, 'F');
          } else {
            doc.setFillColor(255, 255, 255);
            doc.rect(0, 0, pageWidth, pageHeight, 'F');
          }

          // 2. Header Banner
          const marginX = 12;
          const headerY = 12;

          // Header Card
          doc.setFillColor(isDark ? 30 : 248, isDark ? 41 : 250, isDark ? 59 : 252);
          doc.setDrawColor(isDark ? 51 : 226, isDark ? 65 : 232, isDark ? 85 : 240);
          doc.roundedRect(marginX, headerY, pageWidth - (marginX * 2), 26, 3, 3, 'FD');

          // Left brand logo & title
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          if (isDark) {
            doc.setTextColor(251, 191, 36); // Amber Gold
          } else {
            doc.setTextColor(30, 58, 138); // Deep Navy
          }
          doc.text('SM SPORTS', marginX + 5, headerY + 8);

          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(isDark ? 148 : 100, isDark ? 163 : 116, isDark ? 184 : 139);
          doc.text('OFFICIAL SQUAD DOSSIER & PHOTO ROSTER', marginX + 5, headerY + 13);

          // Team Name & Captain Badge in header
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          doc.setTextColor(isDark ? 255 : 15, isDark ? 255 : 23, isDark ? 255 : 42);
          doc.text(team.name.toUpperCase(), marginX + 5, headerY + 21);

          // Right side tournament name & stats
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(isDark ? 251 : 30, isDark ? 191 : 41, isDark ? 36 : 59);
          doc.text(tournamentName.toUpperCase(), pageWidth - marginX - 5, headerY + 8, { align: 'right' });

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(isDark ? 203 : 71, isDark ? 213 : 85, isDark ? 225 : 105);

          const captText = captainInfo ? `Captain: ${captainInfo.name} (C)` : 'Captain: TBA';
          const ownerText = ownerName ? `Owner: ${ownerName}` : '';
          const subtitleRight = [ownerText, captText].filter(Boolean).join(' • ');
          doc.text(subtitleRight, pageWidth - marginX - 5, headerY + 14, { align: 'right' });

          const totalSpent = squad.reduce((sum, sp) => sum + (Number(sp.soldPrice) || 0), 0);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(isDark ? 52 : 22, isDark ? 211 : 101, isDark ? 153 : 52); // green
          doc.text(`Squad: ${squad.length} Players | Spent: Rs. ${totalSpent.toLocaleString()} | Purse: Rs. ${Number(team.budget || 0).toLocaleString()}`, pageWidth - marginX - 5, headerY + 21, { align: 'right' });

          // 3. Grid of Player Cards
          const gridStartY = headerY + 30;
          const gridAvailableHeight = pageHeight - gridStartY - 16;
          const gapX = 6;
          const gapY = 6;
          const cardWidth = (pageWidth - (marginX * 2) - gapX) / cols; // ~87 mm each
          const cardHeight = (gridAvailableHeight - (gapY * (rows - 1))) / rows;

          const startIndex = pIdx * totalCardsPerPage;
          const pageCards = squadList.slice(startIndex, startIndex + totalCardsPerPage);

          for (let cIdx = 0; cIdx < pageCards.length; cIdx++) {
            const player = pageCards[cIdx];
            const colPos = cIdx % cols;
            const rowPos = Math.floor(cIdx / cols);

            const cardX = marginX + colPos * (cardWidth + gapX);
            const cardY = gridStartY + rowPos * (cardHeight + gapY);

            const reg = registrations.find(r => r.fullName.trim().toLowerCase() === player.name.trim().toLowerCase());
            const key = String(player.id ?? player.name);
            const photoData = playerPhotos[key];

            const isPlayerCaptain = (captainInfo && captainInfo.name.trim().toLowerCase() === player.name.trim().toLowerCase()) ||
                                   player.isCaptain === true;

            // Card Background
            doc.setFillColor(isDark ? 24 : 255, isDark ? 32 : 255, isDark ? 47 : 255);
            doc.setDrawColor(isDark ? 51 : 226, isDark ? 65 : 232, isDark ? 85 : 240);
            doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 3, 3, 'FD');

            // Left column inside card: Photo (width: ~30mm)
            const photoWidth = cardsPerPage === 4 ? 32 : 28;
            const photoHeight = cardsPerPage === 4 ? 38 : 32;
            const photoX = cardX + 4;
            const photoY = cardY + 4;

            if (selectedFieldIds.includes('photo')) {
              // Photo Frame
              doc.setFillColor(isDark ? 30 : 241, isDark ? 41 : 245, isDark ? 59 : 249);
              doc.roundedRect(photoX, photoY, photoWidth, photoHeight, 2, 2, 'F');

              if (photoData) {
                try {
                  doc.addImage(photoData, 'JPEG', photoX, photoY, photoWidth, photoHeight);
                } catch (e) {
                  // Fallback letter avatar
                  doc.setFont('helvetica', 'bold');
                  doc.setFontSize(16);
                  doc.setTextColor(isDark ? 148 : 156, isDark ? 163 : 163, isDark ? 184 : 175);
                  doc.text(player.name.charAt(0).toUpperCase(), photoX + (photoWidth / 2), photoY + (photoHeight / 2) + 3, { align: 'center' });
                }
              } else {
                // Initial Letter
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(16);
                doc.setTextColor(isDark ? 148 : 156, isDark ? 163 : 163, isDark ? 184 : 175);
                doc.text(player.name.charAt(0).toUpperCase(), photoX + (photoWidth / 2), photoY + (photoHeight / 2) + 3, { align: 'center' });
              }

              // Photo frame border
              doc.setDrawColor(isDark ? 71 : 203, isDark ? 85 : 213, isDark ? 105 : 225);
              doc.roundedRect(photoX, photoY, photoWidth, photoHeight, 2, 2, 'D');
            }

            // Player # Badge overlay on top of photo
            const playerNum = reg?.playerNumber || (player as any).playerNumber || `#${startIndex + cIdx + 1}`;
            if (selectedFieldIds.includes('playerNumber')) {
              doc.setFillColor(isDark ? 251 : 37, isDark ? 191 : 99, isDark ? 36 : 235);
              doc.roundedRect(photoX + 1, photoY + 1, 14, 5, 1, 1, 'F');
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(6.5);
              doc.setTextColor(isDark ? 0 : 255, isDark ? 0 : 255, isDark ? 0 : 255);
              doc.text(String(playerNum), photoX + 8, photoY + 4.5, { align: 'center' });
            }

            // Right column inside card: Text details
            const textX = photoX + photoWidth + 4;
            const maxTextWidth = cardWidth - photoWidth - 11;
            let currentTextY = cardY + 7;

            // Player Name & Captain Badge
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(cardsPerPage === 4 ? 10 : 9);
            doc.setTextColor(isDark ? 255 : 17, isDark ? 255 : 24, isDark ? 255 : 39);
            
            const rawName = player.name.toUpperCase();
            const displayName = rawName.length > 18 ? rawName.substring(0, 16) + '..' : rawName;
            doc.text(displayName, textX, currentTextY);

            // Captain Badge
            if (isPlayerCaptain && selectedFieldIds.includes('captainBadge')) {
              const nameWidth = doc.getTextWidth(displayName);
              const badgeX = Math.min(textX + nameWidth + 2, cardX + cardWidth - 14);
              doc.setFillColor(245, 158, 11); // Amber
              doc.roundedRect(badgeX, currentTextY - 3.5, 9, 4.5, 1, 1, 'F');
              doc.setFontSize(6);
              doc.setTextColor(0, 0, 0);
              doc.text('(C)', badgeX + 4.5, currentTextY - 0.5, { align: 'center' });
            }

            currentTextY += 5;

            // Role & Category badges
            if (selectedFieldIds.includes('role') || selectedFieldIds.includes('category')) {
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(6.5);
              doc.setTextColor(isDark ? 96 : 37, isDark ? 165 : 99, isDark ? 250 : 235);
              const roleCat = [
                selectedFieldIds.includes('role') ? (player.role || player.speciality || reg?.playerType || 'Player') : null,
                selectedFieldIds.includes('category') ? (player.category || 'Standard') : null
              ].filter(Boolean).join(' • ');
              doc.text(roleCat.toUpperCase(), textX, currentTextY);
              currentTextY += 5;
            }

            // Divider line
            doc.setDrawColor(isDark ? 51 : 241, isDark ? 65 : 245, isDark ? 85 : 249);
            doc.line(textX, currentTextY - 1, cardX + cardWidth - 4, currentTextY - 1);
            currentTextY += 2;

            // Jersey Specs (Jersey Name, Number, Size)
            const showJersey = selectedFieldIds.includes('jerseyName') || 
                               selectedFieldIds.includes('jerseyNumber') || 
                               selectedFieldIds.includes('jerseySize');

            if (showJersey) {
              const jName = player.jerseyName || reg?.jerseyName || '-';
              const jNum = player.jerseyNumber || reg?.jerseyNumber || '-';
              const jSize = player.jerseySize || reg?.jerseySize || '-';

              doc.setFillColor(isDark ? 30 : 248, isDark ? 41 : 250, isDark ? 59 : 252);
              doc.roundedRect(textX, currentTextY, maxTextWidth, 11, 1.5, 1.5, 'F');

              doc.setFont('helvetica', 'bold');
              doc.setFontSize(5.5);
              doc.setTextColor(isDark ? 148 : 100, isDark ? 163 : 116, isDark ? 184 : 139);
              doc.text('JERSEY NAME', textX + 2, currentTextY + 4);
              doc.text('NO.', textX + maxTextWidth - 17, currentTextY + 4);
              doc.text('SIZE', textX + maxTextWidth - 7, currentTextY + 4);

              doc.setFont('helvetica', 'bold');
              doc.setFontSize(7);
              doc.setTextColor(isDark ? 255 : 30, isDark ? 255 : 41, isDark ? 255 : 59);
              const truncatedJName = jName.length > 12 ? jName.substring(0, 11) + '..' : jName;
              doc.text(truncatedJName.toUpperCase(), textX + 2, currentTextY + 8.5);
              doc.text(String(jNum), textX + maxTextWidth - 17, currentTextY + 8.5);
              doc.text(String(jSize), textX + maxTextWidth - 7, currentTextY + 8.5);

              currentTextY += 13.5;
            }

            // Financial & Contact Block
            if (selectedFieldIds.includes('soldPrice') || selectedFieldIds.includes('basePrice')) {
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(6);
              doc.setTextColor(isDark ? 148 : 107, isDark ? 163 : 114, isDark ? 184 : 128);
              doc.text('ACQUISITION PRICE:', textX, currentTextY);

              doc.setFont('helvetica', 'bold');
              doc.setFontSize(7.5);
              doc.setTextColor(isDark ? 52 : 22, isDark ? 211 : 101, isDark ? 153 : 52); // green
              const priceText = player.soldPrice !== undefined
                ? `Rs. ${Number(player.soldPrice).toLocaleString()}`
                : `Base: Rs. ${Number(player.basePrice || 0).toLocaleString()}`;
              doc.text(priceText, textX + 25, currentTextY);
              currentTextY += 4.5;
            }

            if (selectedFieldIds.includes('mobile')) {
              const phone = player.mobile || reg?.mobile || '';
              if (phone) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(6);
                doc.setTextColor(isDark ? 148 : 107, isDark ? 163 : 114, isDark ? 184 : 128);
                doc.text('TEL: ', textX, currentTextY);
                doc.setFont('helvetica', 'bold');
                doc.text(phone, textX + 7, currentTextY);
                currentTextY += 4.5;
              }
            }

            if (selectedFieldIds.includes('dob')) {
              const dob = player.dob || reg?.dob || '';
              if (dob) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(6);
                doc.setTextColor(isDark ? 148 : 107, isDark ? 163 : 114, isDark ? 184 : 128);
                doc.text('DOB: ', textX, currentTextY);
                doc.setFont('helvetica', 'bold');
                doc.text(dob, textX + 8, currentTextY);
              }
            }
          }

          // 4. Page Footer
          const footerY = pageHeight - 8;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(isDark ? 100 : 156, isDark ? 116 : 163, isDark ? 139 : 175);
          doc.text('SM SPORTS • Official Tournament Management System', marginX, footerY);
          doc.text(`Team: ${team.name} • Page ${pIdx + 1} of ${totalPagesForTeam}`, pageWidth - marginX, footerY, { align: 'right' });
        }
      }

      // Save document
      const cleanTeamName = selectedTeamId === 'ALL'
        ? 'ALL_TEAMS'
        : (teams.find(t => String(t.id) === String(selectedTeamId))?.name || 'TEAM').replace(/\s+/g, '_');

      const fileName = `SM_SPORTS_${cleanTeamName}_Photo_Cards_Squad_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);

    } catch (err: any) {
      console.error("Photo PDF generation failed:", err);
      alert("Failed to generate Photo Cards PDF: " + (err.message || 'Unknown error'));
    } finally {
      setIsExporting(false);
      setExportProgress('');
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      <div className="bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between bg-gray-50/60 dark:bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  SM SPORTS
                </span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Official Dossier Exporter
                </span>
              </div>
              <h2 className="text-lg font-black uppercase text-gray-900 dark:text-white tracking-tight mt-0.5">
                Squad Photo Cards PDF Export
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">

          {/* Configuration Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Team Selection */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                Franchise Team
              </label>
              <select
                value={String(selectedTeamId)}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="w-full bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-xs font-bold uppercase text-gray-800 dark:text-zinc-200 outline-none focus:border-emerald-500 transition-all"
              >
                <option value="ALL">★ All Teams ({teams.length} Franchises)</option>
                {teams.map(t => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name} (Code: {t.teamCode || 'T000'})
                  </option>
                ))}
              </select>
            </div>

            {/* Cards Per Page */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                Cards Layout Per Page
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCardsPerPage(4)}
                  className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider border flex items-center justify-center gap-1.5 transition-all ${
                    cardsPerPage === 4
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                      : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:border-emerald-400'
                  }`}
                >
                  4 Cards / Page
                </button>
                <button
                  type="button"
                  onClick={() => setCardsPerPage(6)}
                  className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider border flex items-center justify-center gap-1.5 transition-all ${
                    cardsPerPage === 6
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                      : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:border-emerald-400'
                  }`}
                >
                  6 Cards / Page
                </button>
              </div>
            </div>

            {/* Document Palette */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                Document Palette
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPdfTheme('WHITE')}
                  className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider border flex items-center justify-center gap-1.5 transition-all ${
                    pdfTheme === 'WHITE'
                      ? 'bg-slate-900 border-slate-900 text-white dark:bg-white dark:border-white dark:text-slate-900 shadow-sm'
                      : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400'
                  }`}
                >
                  Classic White
                </button>
                <button
                  type="button"
                  onClick={() => setPdfTheme('DARK')}
                  className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider border flex items-center justify-center gap-1.5 transition-all ${
                    pdfTheme === 'DARK'
                      ? 'bg-amber-500 border-amber-500 text-black shadow-sm'
                      : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400'
                  }`}
                >
                  Dark Slate Gold
                </button>
              </div>
            </div>

          </div>

          {/* Fields Selection */}
          <div className="p-4 bg-gray-50/70 dark:bg-zinc-900/50 rounded-2xl border border-gray-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-gray-700 dark:text-zinc-200 tracking-wider flex items-center gap-1.5">
                <Shirt className="w-3.5 h-3.5 text-blue-500" /> Player Card Fields To Include ({selectedFieldIds.length}/{DEFAULT_PHOTO_FIELDS.length})
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllFields}
                  className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Select All
                </button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onClick={resetFields}
                  className="text-[10px] font-black uppercase text-gray-500 hover:underline"
                >
                  Reset Defaults
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {DEFAULT_PHOTO_FIELDS.map(f => {
                const isSelected = selectedFieldIds.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggleField(f.id)}
                    className={`py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider border flex items-center gap-2 transition-all text-left ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-xs'
                        : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <Square className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">{f.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Preview Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-gray-700 dark:text-zinc-200 tracking-wider flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-amber-500" /> Preview Roster: {previewTeam?.name} ({previewSquad.length} Players)
              </span>
              <span className="text-[10px] font-bold text-gray-400 uppercase">
                Includes directly assigned players
              </span>
            </div>

            {/* Sample Card Previews */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-gray-100/50 dark:bg-zinc-900/30 rounded-2xl border border-gray-200 dark:border-zinc-800">
              {previewSquad.length === 0 ? (
                <div className="col-span-2 py-8 text-center text-gray-400 text-xs font-bold uppercase tracking-widest">
                  No players assigned yet in this team roster
                </div>
              ) : (
                previewSquad.slice(0, 2).map((p, idx) => {
                  const reg = registrations.find(r => r.fullName.trim().toLowerCase() === p.name.trim().toLowerCase());
                  const isPlayerCaptain = (previewTeam?.captainName && previewTeam.captainName.trim().toLowerCase() === p.name.trim().toLowerCase()) || p.isCaptain;

                  return (
                    <div
                      key={p.id}
                      className="p-3 bg-white dark:bg-zinc-950 rounded-xl border border-gray-200 dark:border-zinc-800 flex gap-3 shadow-sm"
                    >
                      {/* Photo preview */}
                      <div className="w-16 h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 shrink-0 relative flex items-center justify-center">
                        {p.photoUrl || reg?.profilePic ? (
                          <img src={p.photoUrl || reg?.profilePic} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-black text-gray-400 text-lg">{p.name[0]?.toUpperCase()}</span>
                        )}
                        <span className="absolute top-1 left-1 bg-amber-500 text-black text-[7px] font-black px-1 rounded">
                          #{reg?.playerNumber || idx + 1}
                        </span>
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-xs uppercase text-gray-900 dark:text-white truncate">
                            {p.name}
                          </span>
                          {isPlayerCaptain && (
                            <span className="px-1.5 py-0.2 bg-amber-500 text-black text-[7px] font-black rounded uppercase">
                              Captain (C)
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                          {p.role} • {p.category}
                        </p>
                        <div className="text-[8px] font-bold text-gray-500 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-900 p-1.5 rounded-md flex justify-between">
                          <span>Jersey: {p.jerseyName || reg?.jerseyName || p.name}</span>
                          <span>No: {p.jerseyNumber || reg?.jerseyNumber || '-'}</span>
                          <span>Size: {p.jerseySize || reg?.jerseySize || 'L'}</span>
                        </div>
                        <p className="text-[9px] font-black text-emerald-600 dark:text-emerald-400">
                          ₹{Number(p.soldPrice || p.basePrice || 0).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-gray-50/60 dark:bg-zinc-900/40">
          <div>
            {exportProgress && (
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {exportProgress}
              </p>
            )}
            {!exportProgress && (
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Branded with SM SPORTS • Ready for print or sharing
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={isExporting}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating PDF...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" /> Download Photo Cards PDF
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default TeamPhotoPdfExportModal;
