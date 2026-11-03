import React, { useState } from 'react';
import { Team, Player, RegisteredPlayer, RegistrationConfig } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download, X, CheckSquare, Square, FileText, ChevronDown, Check, Loader2, Sparkles, Shield, User, Crown } from 'lucide-react';
import { resolveTeamSquad } from '../utils';

export interface FieldOption {
  id: string;
  label: string;
  category: 'basic' | 'jersey' | 'financial' | 'custom';
}

const DEFAULT_FIELDS: FieldOption[] = [
  { id: 'playerNumber', label: 'Player #', category: 'basic' },
  { id: 'name', label: 'Player Name', category: 'basic' },
  { id: 'role', label: 'Role / Speciality', category: 'basic' },
  { id: 'category', label: 'Category', category: 'basic' },
  { id: 'captainStatus', label: 'Captain / Role Tag', category: 'basic' },
  { id: 'jerseyName', label: 'Jersey Name', category: 'jersey' },
  { id: 'jerseyNumber', label: 'Jersey Number', category: 'jersey' },
  { id: 'jerseySize', label: 'Jersey Size', category: 'jersey' },
  { id: 'basePrice', label: 'Base Price', category: 'financial' },
  { id: 'soldPrice', label: 'Sold Price', category: 'financial' },
  { id: 'mobile', label: 'Contact / Mobile', category: 'basic' },
  { id: 'dob', label: 'Date of Birth', category: 'basic' },
  { id: 'gender', label: 'Gender', category: 'basic' }
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

export const TeamPdfExportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  teams,
  allPlayers = [],
  initialTeamId,
  tournamentName = 'Tournament Official Squad',
  registrations = [],
  registrationConfig,
  systemLogoUrl
}) => {
  const [selectedTeamId, setSelectedTeamId] = useState<string | number>(
    initialTeamId || 'ALL'
  );
  const [pdfTheme, setPdfTheme] = useState<'STANDARD' | 'ADVAYA'>('STANDARD');
  const [isExporting, setIsExporting] = useState(false);

  // Combine default fields with registration custom fields
  const customFields: FieldOption[] = (registrationConfig?.customFields || []).map(cf => ({
    id: `cf_${cf.id}`,
    label: cf.label,
    category: 'custom'
  }));

  const allAvailableFields: FieldOption[] = [...DEFAULT_FIELDS, ...customFields];

  // Default selected fields include jersey details and core player info
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([
    'playerNumber',
    'name',
    'role',
    'category',
    'captainStatus',
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

  const selectAll = () => {
    setSelectedFieldIds(allAvailableFields.map(f => f.id));
  };

  const deselectAll = () => {
    setSelectedFieldIds(['name', 'role', 'soldPrice']);
  };

  const handleGeneratePdf = async () => {
    if (selectedFieldIds.length === 0) {
      alert('Please select at least one field to include in the PDF.');
      return;
    }

    setIsExporting(true);

    try {
      // Determine target teams
      const targetTeams = selectedTeamId === 'ALL'
        ? teams
        : teams.filter(t => String(t.id) === String(selectedTeamId));

      const doc = new jsPDF({
        orientation: selectedFieldIds.length > 7 ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const isAdvaya = pdfTheme === 'ADVAYA';
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      for (let tIdx = 0; tIdx < targetTeams.length; tIdx++) {
        const team = targetTeams[tIdx];
        if (tIdx > 0) {
          doc.addPage();
        }

        // Background styling
        if (isAdvaya) {
          doc.setFillColor(15, 23, 42); // Deep dark blue / slate
          doc.rect(0, 0, pageWidth, pageHeight, 'F');
        }

        // Header Banner
        const headerY = 14;
        doc.setFont('helvetica', 'bold');

        // Brand name: SM SPORTS
        doc.setFontSize(16);
        if (isAdvaya) {
          doc.setTextColor(251, 191, 36); // Gold
        } else {
          doc.setTextColor(30, 58, 138); // Deep Navy
        }
        doc.text('SM SPORTS', 14, headerY);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(isAdvaya ? 148 : 100, isAdvaya ? 163 : 116, isAdvaya ? 184 : 139);
        doc.text('OFFICIAL TEAM SQUAD & JERSEY SPECIFICATION', 14, headerY + 5);

        // Tournament Title right aligned
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(isAdvaya ? 255 : 30, isAdvaya ? 255 : 41, isAdvaya ? 255 : 59);
        doc.text(tournamentName.toUpperCase(), pageWidth - 14, headerY, { align: 'right' });

        // Team Box
        const teamBoxY = headerY + 12;
        doc.setFillColor(isAdvaya ? 30 : 248, isAdvaya ? 41 : 250, isAdvaya ? 59 : 252);
        doc.roundedRect(14, teamBoxY, pageWidth - 28, 22, 3, 3, 'F');

        // Team Name & Owner as Captain
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(isAdvaya ? 251 : 15, isAdvaya ? 191 : 23, isAdvaya ? 36 : 42);
        doc.text(team.name.toUpperCase(), 20, teamBoxY + 8);

        // Resolve complete squad including directly assigned players
        const teamPlayers = resolveTeamSquad(team, allPlayers);

        // Mention Owner & Captain
        const ownerName = team.ownerName || team.owner || '';
        const isOwnerCaptain = team.isOwnerCaptain !== false && !team.captainName && !!ownerName;
        const captainName = team.captainName || (isOwnerCaptain ? ownerName : '');
        const ownerPhone = team.ownerPhone ? ` • Tel: ${team.ownerPhone}` : '';

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(isAdvaya ? 203 : 71, isAdvaya ? 213 : 85, isAdvaya ? 225 : 105);

        const subHeaders: string[] = [];
        if (ownerName) subHeaders.push(`Owner: ${ownerName}${ownerPhone}`);
        if (captainName) subHeaders.push(`Captain: ${captainName} (C)`);
        if (subHeaders.length === 0) subHeaders.push(`Franchise Squad List • Team Code: ${team.teamCode || 'T000'}`);

        doc.text(subHeaders.join(' • '), 20, teamBoxY + 15);

        // Stats on right of box
        const spent = teamPlayers.reduce((acc, p) => acc + (Number(p.soldPrice) || 0), 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(`Players: ${teamPlayers.length}`, pageWidth - 20, teamBoxY + 8, { align: 'right' });
        doc.setTextColor(isAdvaya ? 52 : 22, isAdvaya ? 211 : 101, isAdvaya ? 153 : 52); // green
        doc.text(`Spent: Rs. ${spent.toLocaleString()} | Remaining: Rs. ${Number(team.budget || 0).toLocaleString()}`, pageWidth - 20, teamBoxY + 15, { align: 'right' });

        // Build Table Columns & Rows
        const activeColumns = allAvailableFields.filter(f => selectedFieldIds.includes(f.id));
        const head = [activeColumns.map(c => c.label)];

        // Squad roster rows
        const rows: any[] = [];

        // If owner is designated as captain and not in players list, insert owner at top
        const ownerInPlayers = teamPlayers.find(p => p.name.trim().toLowerCase() === ownerName.trim().toLowerCase());
        if (isOwnerCaptain && !ownerInPlayers && ownerName) {
          const ownerReg = registrations.find(r => r.fullName.trim().toLowerCase() === ownerName.trim().toLowerCase());
          const ownerRow = activeColumns.map(col => {
            switch (col.id) {
              case 'playerNumber': return '#1';
              case 'name': return `${ownerName} (C)`;
              case 'role': return 'Captain & Owner';
              case 'category': return 'Franchise Owner';
              case 'captainStatus': return 'Captain (C)';
              case 'jerseyName': return ownerReg?.jerseyName || ownerName;
              case 'jerseyNumber': return ownerReg?.jerseyNumber || '-';
              case 'jerseySize': return ownerReg?.jerseySize || '-';
              case 'basePrice': return '-';
              case 'soldPrice': return 'Retained / Owner';
              case 'mobile': return team.ownerPhone || ownerReg?.mobile || '-';
              case 'dob': return ownerReg?.dob || '-';
              case 'gender': return ownerReg?.gender || '-';
              default:
                if (col.id.startsWith('cf_')) {
                  const cfKey = col.id.replace('cf_', '');
                  return ownerReg ? (ownerReg as any)[cfKey] || '-' : '-';
                }
                return '-';
            }
          });
          rows.push(ownerRow);
        }

        // Add player rows
        teamPlayers.forEach((p, pIdx) => {
          const reg = registrations.find(r => r.fullName.trim().toLowerCase() === p.name.trim().toLowerCase());
          const isPlayerCaptain = (captainName && p.name.trim().toLowerCase() === captainName.trim().toLowerCase()) || p.isCaptain;

          const row = activeColumns.map(col => {
            switch (col.id) {
              case 'playerNumber':
                return reg?.playerNumber || `#${rows.length + 1}`;
              case 'name':
                return isPlayerCaptain ? `${p.name} (C)` : p.name;
              case 'role':
                return p.role || p.speciality || reg?.playerType || '-';
              case 'category':
                return p.category || '-';
              case 'captainStatus':
                return isPlayerCaptain ? 'Captain (C)' : 'Player';
              case 'jerseyName':
                return reg?.jerseyName || p.jerseyName || p.name;
              case 'jerseyNumber':
                return reg?.jerseyNumber || p.jerseyNumber || '-';
              case 'jerseySize':
                return reg?.jerseySize || p.jerseySize || '-';
              case 'basePrice':
                return p.basePrice ? `Rs. ${p.basePrice}` : '-';
              case 'soldPrice':
                return p.soldPrice ? `Rs. ${p.soldPrice}` : '0';
              case 'mobile':
                return reg?.mobile || p.mobile || '-';
              case 'dob':
                return reg?.dob || '-';
              case 'gender':
                return reg?.gender || '-';
              default:
                if (col.id.startsWith('cf_')) {
                  const cfKey = col.id.replace('cf_', '');
                  return reg ? (reg as any)[cfKey] || '-' : '-';
                }
                return '-';
            }
          });
          rows.push(row);
        });

        // Generate Table via autoTable
        autoTable(doc, {
          head: head,
          body: rows.length > 0 ? rows : [['No players found in this team', ...new Array(activeColumns.length - 1).fill('-')]],
          startY: teamBoxY + 28,
          theme: isAdvaya ? 'grid' : 'striped',
          headStyles: {
            fillColor: isAdvaya ? [251, 191, 36] : [30, 58, 138],
            textColor: isAdvaya ? [0, 0, 0] : [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
            cellPadding: 2.5
          },
          bodyStyles: {
            textColor: isAdvaya ? [241, 245, 249] : [30, 41, 59],
            fillColor: isAdvaya ? [15, 23, 42] : undefined,
            fontSize: 7.5,
            cellPadding: 2
          },
          alternateRowStyles: isAdvaya ? {
            fillColor: [24, 34, 53]
          } : {
            fillColor: [248, 250, 252]
          },
          styles: {
            lineColor: isAdvaya ? [51, 65, 85] : [226, 232, 240],
            lineWidth: 0.1,
            overflow: 'linebreak'
          },
          margin: { left: 14, right: 14, bottom: 20 },
          didDrawPage: (data) => {
            // Footer on each page
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(isAdvaya ? 148 : 100, isAdvaya ? 163 : 116, isAdvaya ? 184 : 139);
            doc.text('POWERED BY SM SPORTS • OFFICIAL AUCTION PORTAL', 14, pageHeight - 10);
            doc.text(`Page ${data.pageNumber}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
          }
        });
      }

      // Download file
      const fileName = selectedTeamId === 'ALL'
        ? `SM_SPORTS_ALL_TEAMS_ROSTER_${new Date().toISOString().split('T')[0]}.pdf`
        : `${(targetTeams[0]?.name || 'Team').replace(/[^a-zA-Z0-9_-]/g, '_')}_Official_Squad.pdf`;

      doc.save(fileName);
      onClose();
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      alert('Error generating PDF document. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] w-full max-w-4xl shadow-2xl overflow-hidden my-auto flex flex-col">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                Download Team-Wise Squad PDF
              </h2>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                Select columns including Jersey Name, Number, Size, and Owner/Captain details
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Controls */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
          
          {/* Top Options: Select Team & Theme */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">
                Target Team
              </label>
              <div className="relative">
                <select
                  value={selectedTeamId}
                  onChange={e => setSelectedTeamId(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wider pr-10 appearance-none outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="ALL">All Teams (Master Squad Compilation)</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({(t.players || []).length} players)
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">
                Document Color Scheme
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPdfTheme('STANDARD')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    pdfTheme === 'STANDARD'
                      ? 'border-blue-500 bg-blue-500/15 text-blue-400'
                      : 'border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <p className="text-[10px] font-black uppercase tracking-wider">Clean White</p>
                  <p className="text-[8px] opacity-70 uppercase tracking-widest">Formal High-Contrast</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPdfTheme('ADVAYA')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    pdfTheme === 'ADVAYA'
                      ? 'border-amber-400 bg-amber-400/15 text-amber-400'
                      : 'border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <p className="text-[10px] font-black uppercase tracking-wider">Advaya Gold</p>
                  <p className="text-[8px] opacity-70 uppercase tracking-widest">Dark Gold VIP Theme</p>
                </button>
              </div>
            </div>
          </div>

          {/* Field Selection Area */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" /> Select Fields to Include in Squad PDF
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 transition-colors"
                >
                  Reset Defaults
                </button>
              </div>
            </div>

            {/* Jersey fields highlighted */}
            <div className="bg-zinc-950/60 p-4 rounded-2xl border border-zinc-800 mb-4">
              <p className="text-[10px] font-black uppercase text-amber-400 tracking-wider mb-2.5 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-amber-400" /> Jersey &amp; Equipment Specifications
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {allAvailableFields.filter(f => f.category === 'jersey').map(f => {
                  const isChecked = selectedFieldIds.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggleField(f.id)}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                        isChecked
                          ? 'border-amber-400/80 bg-amber-500/10 text-amber-300 shadow-sm'
                          : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {isChecked ? <CheckSquare className="w-4 h-4 text-amber-400 shrink-0" /> : <Square className="w-4 h-4 text-zinc-500 shrink-0" />}
                      <span className="text-[10px] font-black uppercase tracking-wider truncate">{f.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* All other fields */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {allAvailableFields.filter(f => f.category !== 'jersey').map(f => {
                const isChecked = selectedFieldIds.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggleField(f.id)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                      isChecked
                        ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                        : 'border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                    }`}
                  >
                    {isChecked ? <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" /> : <Square className="w-4 h-4 text-zinc-600 shrink-0" />}
                    <span className="text-[10px] font-black uppercase tracking-wider truncate">{f.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between gap-4">
          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            {selectedFieldIds.length} Columns Selected • Owner Designated as Captain
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white text-xs font-black uppercase tracking-widest transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGeneratePdf}
              disabled={isExporting}
              className="bg-blue-600 hover:bg-blue-500 text-white font-black px-6 py-2.5 rounded-xl text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-blue-600/25 active:scale-95 transition-all disabled:opacity-50"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isExporting ? 'Generating PDF...' : 'Download PDF Document'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default TeamPdfExportModal;
