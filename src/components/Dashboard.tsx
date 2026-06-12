import React, { useState } from 'react';
import { Client, MonthlyPackage, Activity, ACTIVITY_CONFIGS, ActivityType, isWithinAuditRange, getAuditPeriodLabel, ASSET_KEYS } from '../types';
import { 
  Users, CheckCircle2, AlertTriangle, TrendingUp, Search, Filter, 
  ExternalLink, Calendar, ChevronRight, Activity as ActivityIcon, 
  CheckSquare, Layers, Clock, FileText, Globe, Award, Download, Paperclip, Trash2, Edit3
} from 'lucide-react';
import DeleteConfirmationModal from './DeleteConfirmationModal';

interface DashboardProps {
  clients: Client[];
  packages: MonthlyPackage[];
  activities: Activity[];
  onSelectClientDashboard: (client: Client) => void;
  selectedClient: Client | null;
  onClearSelectedClient: () => void;
  onEditActivity?: (activity: Activity) => void;
  onDeleteActivity?: (id: string) => void;
  currentRole: string;
  onAddActivity?: (clientId: string) => void;
  onGoToConfig?: (clientId: string) => void;
  selectedMonth: number;
  setSelectedMonth: (month: number) => void;
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  auditMonths: number;
  setAuditMonths: (months: number) => void;
  selectedAssetType: string;
  setSelectedAssetType: (type: string) => void;
}

export default function Dashboard({
  clients,
  packages,
  activities,
  onSelectClientDashboard,
  selectedClient,
  onClearSelectedClient,
  onEditActivity,
  onDeleteActivity,
  currentRole,
  onAddActivity,
  onGoToConfig,
  selectedMonth,
  setSelectedMonth,
  selectedYear,
  setSelectedYear,
  auditMonths,
  setAuditMonths,
  selectedAssetType,
  setSelectedAssetType
}: DashboardProps) {
  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterStage, setFilterStage] = useState<string>('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Delete activity confirmation modal states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteActivityId, setDeleteActivityId] = useState('');
  const [deleteActivityCode, setDeleteActivityCode] = useState('');

  // Helper function: Compute progress for a given client
  const getClientProgress = (client: Client) => {
    const rangePkgs = packages.filter(
      p => p.client_id === client.id && 
           !p.is_deleted &&
           isWithinAuditRange(p.month, p.year, selectedMonth, selectedYear, auditMonths)
    );
    
    const targets = {
      Poster: rangePkgs.reduce((sum, p) => sum + (p.posters_target || 0), 0),
      Reel: rangePkgs.reduce((sum, p) => sum + (p.reels_target || 0), 0),
      'Video Editing': rangePkgs.reduce((sum, p) => sum + (p.video_target || 0), 0),
      'Ad Campaign': rangePkgs.reduce((sum, p) => sum + (p.ads_target || 0), 0),
      Blog: rangePkgs.reduce((sum, p) => sum + (p.blogs_target || 0), 0),
      'Content Writing': rangePkgs.reduce((sum, p) => sum + (p.content_target || 0), 0),
      'Script Writing': rangePkgs.reduce((sum, p) => sum + (p.scripts_target || 0), 0),
      'Website Update': rangePkgs.reduce((sum, p) => sum + (p.website_updates_target || 0), 0)
    };

    // Filter active completed deliverables for this client in selected Month Range
    const clientActs = activities.filter(act => act.client_id === client.id && !act.is_deleted);
    
    const completed = {
      Poster: 0,
      Reel: 0,
      'Video Editing': 0,
      'Ad Campaign': 0,
      Blog: 0,
      'Content Writing': 0,
      'Script Writing': 0,
      'Website Update': 0
    };

    clientActs.forEach(act => {
      const config = ACTIVITY_CONFIGS[act.activity_type];
      if (config && act.stage === config.completionStage) {
        // Date within selected range
        const actDate = new Date(act.activity_date);
        const actMonth = actDate.getMonth() + 1;
        const actYear = actDate.getFullYear();
        if (isWithinAuditRange(actMonth, actYear, selectedMonth, selectedYear, auditMonths)) {
          completed[act.activity_type]++;
        }
      }
    });

    // SUM OR CHOSEN ASSET FILTER METRICS
    const totalPromised = selectedAssetType === 'All'
      ? Object.values(targets).reduce((sum, next) => sum + next, 0)
      : (targets[selectedAssetType as ActivityType] || 0);

    const totalCompletedRaw = selectedAssetType === 'All'
      ? Object.values(completed).reduce((sum, next) => sum + next, 0)
      : (completed[selectedAssetType as ActivityType] || 0);
    
    // Capped at target category wise for realistic fulfillment percentages
    let totalFulfilledCapped = 0;
    if (selectedAssetType === 'All') {
      Object.keys(targets).forEach((key) => {
        const t = targets[key as ActivityType];
        const c = completed[key as ActivityType];
        totalFulfilledCapped += Math.min(t, c);
      });
    } else {
      const t = targets[selectedAssetType as ActivityType] || 0;
      const c = completed[selectedAssetType as ActivityType] || 0;
      totalFulfilledCapped = Math.min(t, c);
    }

    const completionPercent = totalPromised > 0 
      ? Math.round((totalFulfilledCapped / totalPromised) * 100) 
      : 0;

    const pendingCount = Math.max(0, totalPromised - totalCompletedRaw);

    return {
      targets,
      completed,
      totalPromised,
      totalCompleted: totalCompletedRaw,
      pendingCount,
      completionPercent
    };
  };

  // ACTIVE CLIENTS COMPILATION (Filter non-deleted active)
  const activeClients = clients.filter(c => c.status === 'Active' && !c.is_deleted);
  
  // Aggregate stats across active clients
  let globalTotalPromised = 0;
  let globalTotalCompleted = 0;
  let globalPending = 0;

  const clientStats = activeClients.map(client => {
    const stats = getClientProgress(client);
    globalTotalPromised += stats.totalPromised;
    globalTotalCompleted += stats.totalCompleted;
    globalPending += stats.pendingCount;

    return {
      client,
      ...stats
    };
  });

  const aggregateCompletionPercent = activeClients.length > 0
    ? Math.min(100, Math.round(clientStats.reduce((sum, c) => sum + c.completionPercent, 0) / activeClients.length))
    : 0;

  const behindTargetClients = clientStats.filter(c => c.completionPercent < 80);

  // Filter activities dynamically for Client-Specific repository with GLOBAL SEARCH
  const getFilteredActivities = (clientId: string) => {
    return activities
      .filter(act => act.client_id === clientId && !act.is_deleted)
      .filter(act => {
        // Global Search Filter (matches ID code, client name, category type, title, description)
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          const client = clients.find(c => c.id === act.client_id);
          
          const matchesId = (act.activity_id_code || '').toLowerCase().includes(query);
          const matchesClient = client ? client.client_name.toLowerCase().includes(query) : false;
          const matchesType = act.activity_type.toLowerCase().includes(query);
          const matchesTitle = act.title.toLowerCase().includes(query) || (act.blog_title || '').toLowerCase().includes(query);
          const matchesDesc = act.description.toLowerCase().includes(query) || (act.remarks || '').toLowerCase().includes(query);

          if (!matchesId && !matchesClient && !matchesType && !matchesTitle && !matchesDesc) {
            return false;
          }
        }

        // Type filter
        if (filterType !== 'All' && act.activity_type !== filterType) return false;

        // Stage filter
        if (filterStage !== 'All' && act.stage !== filterStage) return false;

        // Date range filter
        if (startDate && act.activity_date < startDate) return false;
        if (endDate && act.activity_date > endDate) return false;

        return true;
      })
      .sort((a, b) => new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime());
  };

  // CHRONOLOGICAL TIMELINE (RECENT ACTIVITIES with Search supported)
  const getRecentFeed = (clientId?: string) => {
    const list = clientId 
      ? activities.filter(act => act.client_id === clientId && !act.is_deleted)
      : activities.filter(act => {
          const client = clients.find(c => c.id === act.client_id);
          return client?.status === 'Active' && !client.is_deleted && !act.is_deleted;
        });

    return list
      .filter(act => {
        // Drop items matching other categories if filtered
        if (selectedAssetType !== 'All' && act.activity_type !== selectedAssetType) return false;

        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        const client = clients.find(c => c.id === act.client_id);
        
        const matchesId = (act.activity_id_code || '').toLowerCase().includes(query);
        const matchesClient = client ? client.client_name.toLowerCase().includes(query) : false;
        const matchesType = act.activity_type.toLowerCase().includes(query);
        const matchesTitle = act.title.toLowerCase().includes(query);
        const matchesDesc = act.description.toLowerCase().includes(query);

        return matchesId || matchesClient || matchesType || matchesTitle || matchesDesc;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10); // recent 10 items
  };

  // Icons mapper for clean minimal grids
  const getIconForType = (type: ActivityType) => {
    switch (type) {
      case 'Poster': return <Layers className="w-4 h-4 text-neutral-500" />;
      case 'Reel': return <ActivityIcon className="w-4 h-4 text-neutral-500" />;
      case 'Video Editing': return <Layers className="w-4 h-4 text-neutral-500" />;
      case 'Ad Campaign': return <TrendingUp className="w-4 h-4 text-neutral-500" />;
      case 'Blog': return <FileText className="w-4 h-4 text-neutral-500" />;
      case 'Content Writing': return <CheckSquare className="w-4 h-4 text-neutral-500" />;
      case 'Script Writing': return <FileText className="w-4 h-4 text-neutral-500" />;
      case 'Website Update': return <Globe className="w-4 h-4 text-neutral-500" />;
    }
  };

  const getStatusPill = (percent: number) => {
    if (percent === 100) {
      return (
        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-mono font-bold uppercase tracking-tighter border border-blue-105 border-blue-100">
          Fulfilled
        </span>
      );
    } else if (percent >= 80) {
      return (
        <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-[10px] font-mono font-bold uppercase tracking-tighter border border-green-100">
          On Track
        </span>
      );
    } else if (percent >= 50) {
      return (
        <span className="px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded text-[10px] font-mono font-bold uppercase tracking-tighter border border-yellow-100">
          At Risk
        </span>
      );
    } else {
      return (
        <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-[10px] font-mono font-bold uppercase tracking-tighter border border-red-100">
          Behind
        </span>
      );
    }
  };

  const handleDeleteActivityClick = (id: string, code: string) => {
    setDeleteActivityId(id);
    setDeleteActivityCode(code);
    setDeleteModalOpen(true);
  };

  const executeConfirmedActivityDelete = () => {
    if (onDeleteActivity) {
      onDeleteActivity(deleteActivityId);
    }
    setDeleteModalOpen(false);
  };

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      
      {/* Activity Soft-delete confirmation modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        title={`DELETE DELIVERABLE RECORD`}
        message={`Are you sure you want to delete deliverable ${deleteActivityCode}? The record will be safely soft-deleted from active retainer counts, but will be auditable by administrators.`}
        onConfirm={executeConfirmedActivityDelete}
        onCancel={() => setDeleteModalOpen(false)}
      />

      {/* Global Month/Year Filters Controls in Dashboard Page Margin */}
      <div className="bg-white border border-gray-200 p-4 rounded flex flex-col md:flex-row justify-between items-center gap-4 animate-fade-in">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-neutral-500" />
          <span className="text-xs font-bold font-mono text-black uppercase">
            Active Retainer SLA Period:
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="text-[10px] uppercase font-mono text-gray-400 font-bold mr-1">START:</div>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="bg-white border border-gray-200 rounded px-3 py-1.5 text-xs font-mono font-bold focus:outline-none focus:border-black text-black"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
              <option key={m} value={m}>
                {new Date(2026, m - 1).toLocaleString('default', { month: 'long' }).toUpperCase()}
              </option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-white border border-gray-200 rounded px-3 py-1.5 text-xs font-mono font-bold focus:outline-none focus:border-black text-black"
          >
            {[2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <div className="w-px h-4 bg-gray-200 mx-1 hidden sm:block"></div>
          
          <div className="text-[10px] uppercase font-mono text-gray-400 font-bold mr-1">AUDIT SPAN:</div>
          <select
            value={auditMonths}
            onChange={(e) => setAuditMonths(Number(e.target.value))}
            className="bg-white border border-gray-200 rounded px-3 py-1.5 text-xs font-mono font-bold focus:outline-none focus:border-black text-black"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
              <option key={m} value={m}>
                {m} {m === 1 ? 'MONTH' : 'MONTHS'} {m === 3 ? '(QUARTER)' : m === 6 ? '(HALF YEAR)' : m === 12 ? '(FULL YEAR)' : ''}
              </option>
            ))}
          </select>

          <div className="w-px h-4 bg-gray-200 mx-1 hidden sm:block"></div>
          
          <div className="text-[10px] uppercase font-mono text-gray-400 font-bold mr-1">CATEGORY:</div>
          <select
            value={selectedAssetType}
            onChange={(e) => setSelectedAssetType(e.target.value)}
            className="bg-white border border-gray-200 rounded px-3 py-1.5 text-xs font-mono font-bold focus:outline-none focus:border-black text-black"
          >
            <option value="All">ALL ASSETS (CONSOLIDATED)</option>
            <option value="Poster">POSTER</option>
            <option value="Reel">REEL</option>
            <option value="Video Editing">VIDEO EDITING</option>
            <option value="Ad Campaign">AD CAMPAIGN</option>
            <option value="Blog">BLOG</option>
            <option value="Content Writing">CONTENT WRITING</option>
            <option value="Script Writing">SCRIPT WRITING</option>
            <option value="Website Update">WEBSITE UPDATE</option>
          </select>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* AGENCY-WIDE CONSOLIDATED OS DASHBOARD */}
      {/* ==================================================================== */}
      {!selectedClient ? (
        <>
          {/* Top KPI Cards Grid matching specified color borders */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white border border-gray-200 p-5 rounded">
              <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1">Active Accounts</div>
              <div className="text-2xl font-mono font-bold text-black">{activeClients.length}</div>
            </div>

            <div className="bg-white border border-gray-200 p-5 rounded">
              <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1">Overall SLA Fulfillment</div>
              <div className="text-2xl font-mono font-bold text-black">{aggregateCompletionPercent}%</div>
            </div>

            <div className="bg-white border border-gray-200 p-5 rounded border-l-4 border-l-green-500">
              <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1">Completed Deliverables</div>
              <div className="text-2xl font-mono font-bold text-green-600">{globalTotalCompleted}</div>
            </div>

            <div className="bg-white border border-gray-200 p-5 rounded border-l-4 border-l-red-500">
              <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1">Under Targets</div>
              <div className="text-2xl font-mono font-bold text-red-600">{globalPending}</div>
            </div>
          </div>

          {/* Behind SLA Warning (Red Alert / Behind Target Alert Banner) */}
          {behindTargetClients.length > 0 && (
            <div className="bg-red-50 border border-red-100 p-4 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse flex-shrink-0"></div>
                <div className="text-sm text-red-800 font-semibold font-sans">
                  <span>Alert:</span> {behindTargetClients.length} clients are currently behind monthly targets (&lt; 80% completion) for selected epoch.
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold text-red-600 tracking-wider">CRITICAL ATTENTION</span>
            </div>
          )}

          {/* Clients Retainer Performance Grid-Table */}
          <div className="bg-white border border-gray-200 rounded overflow-hidden flex flex-col">
            {/* Header row */}
            <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/75 flex-wrap gap-2">
              <div>
                <h3 className="text-xs font-bold text-black font-mono uppercase tracking-wider">CLIENT SLA PERFORMANCE INDEX</h3>
                <p className="text-[11px] text-gray-400 font-sans mt-0.5">Consolidated delivery board. Click client rows to drill down.</p>
              </div>
              <span className="text-[10px] uppercase font-mono font-bold bg-neutral-100 border border-neutral-200 text-neutral-600 px-3 py-1 rounded max-w-full text-center">
                PERIOD: {getAuditPeriodLabel(selectedMonth, selectedYear, auditMonths)}
              </span>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs text-neutral-800">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-400 font-mono uppercase text-[10px] font-bold">
                    <th className="py-3 px-6 font-bold">Client Name</th>
                    <th className="py-3 px-3 text-center font-bold">Progress (SLA)</th>
                    <th className="py-3 px-2 text-center font-bold">Posters</th>
                    <th className="py-3 px-2 text-center font-bold">Reels</th>
                    <th className="py-3 px-2 text-center font-bold">Videos</th>
                    <th className="py-3 px-2 text-center font-bold">Blogs</th>
                    <th className="py-3 px-2 text-center font-bold">Content</th>
                    <th className="py-3 px-2 text-center font-bold">Scripts</th>
                    <th className="py-3 px-2 text-center font-bold">Websites</th>
                    <th className="py-3 px-6 text-right font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {clientStats.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-gray-400 font-mono text-xs font-bold">
                        NO ACTIVE CLIENT CONTRACTS IN SYSTEM
                      </td>
                    </tr>
                  ) : (
                    clientStats.map(({ client, completionPercent, targets, completed }) => {
                      return (
                        <tr
                          key={client.id}
                          className="hover:bg-gray-50 cursor-pointer transition-colors align-middle group"
                          onClick={() => onSelectClientDashboard(client)}
                        >
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-sm text-black">
                                {client.logo_url}
                              </div>
                              <div>
                                <span className="font-bold text-sm text-[#111827] group-hover:underline">
                                  {client.client_name}
                                </span>
                                <span className="text-[10px] text-gray-400 font-bold font-mono block mt-0.5">{client.industry.toUpperCase()}</span>
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-3 align-middle">
                            <div className="w-28 sm:w-32 pr-4">
                              <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  style={{ width: `${completionPercent}%` }}
                                  className={`h-full rounded-full ${
                                    completionPercent === 100 
                                      ? 'bg-blue-500' 
                                      : completionPercent < 50 
                                      ? 'bg-red-500' 
                                      : completionPercent < 80 
                                      ? 'bg-yellow-500' 
                                      : 'bg-green-500'
                                  }`}
                                />
                              </div>
                              <div className="text-[10px] font-mono font-bold mt-1 text-gray-500 uppercase tracking-tighter">
                                {completionPercent}% Completed
                              </div>
                            </div>
                          </td>

                          {/* Deliverables ratio cells */}
                          <td className="py-4 px-2 text-center font-mono font-semibold text-xs text-neutral-800">
                            <span className={completed.Poster >= targets.Poster && targets.Poster > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}>
                              {completed.Poster}/{targets.Poster}
                            </span>
                          </td>
                          <td className="py-4 px-2 text-center font-mono font-semibold text-xs text-neutral-800">
                            <span className={completed.Reel >= targets.Reel && targets.Reel > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}>
                              {completed.Reel}/{targets.Reel}
                            </span>
                          </td>
                          <td className="py-4 px-2 text-center font-mono font-semibold text-xs text-neutral-800">
                            <span className={completed['Video Editing'] >= targets['Video Editing'] && targets['Video Editing'] > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}>
                              {completed['Video Editing']}/{targets['Video Editing']}
                            </span>
                          </td>
                          <td className="py-4 px-2 text-center font-mono font-semibold text-xs text-neutral-800">
                            <span className={completed.Blog >= targets.Blog && targets.Blog > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}>
                              {completed.Blog}/{targets.Blog}
                            </span>
                          </td>
                          <td className="py-4 px-2 text-center font-mono font-semibold text-xs text-neutral-800">
                            <span className={completed['Content Writing'] >= targets['Content Writing'] && targets['Content Writing'] > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}>
                              {completed['Content Writing']}/{targets['Content Writing']}
                            </span>
                          </td>
                          <td className="py-4 px-2 text-center font-mono font-semibold text-xs text-neutral-800">
                            <span className={completed['Script Writing'] >= targets['Script Writing'] && targets['Script Writing'] > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}>
                              {completed['Script Writing']}/{targets['Script Writing']}
                            </span>
                          </td>
                          <td className="py-4 px-2 text-center font-mono font-semibold text-xs text-neutral-800">
                            <span className={completed['Website Update'] >= targets['Website Update'] && targets['Website Update'] > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}>
                              {completed['Website Update']}/{targets['Website Update']}
                            </span>
                          </td>

                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-3">
                              {getStatusPill(completionPercent)}
                              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-black transition-colors" />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Consolidate Agency timeline feed */}
          <div className="bg-white border border-gray-200 rounded overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/75 flex justify-between items-center flex-wrap gap-2">
              <div>
                <h3 className="text-xs font-bold text-black font-mono uppercase tracking-wider">CONSOLIDATED AGENCY ACTIVITY LOG</h3>
                <p className="text-[11px] text-gray-400 font-sans mt-0.5">Chronological timeline of the latest 10 logs. Search filters apply instantly.</p>
              </div>
              <div className="relative w-full sm:w-64">
                <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-gray-400">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="Global Search (ID, Client, Title, Category)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded pl-8 pr-2.5 py-1 text-xs focus:outline-none focus:border-black font-mono"
                />
              </div>
            </div>
            
            <div className="divide-y divide-gray-150 p-6 space-y-4 max-h-[500px] overflow-y-auto">
              {getRecentFeed().length === 0 ? (
                <div className="text-center py-12 text-gray-450 text-gray-400 text-xs font-mono font-semibold">
                  NO RECENT DELIVERABLES LOGGED MATCHING FILTERS
                </div>
              ) : (
                getRecentFeed().map((act) => {
                  const client = clients.find(c => c.id === act.client_id);
                  const config = ACTIVITY_CONFIGS[act.activity_type];
                  const isFinal = act.stage === config?.completionStage;

                  return (
                    <div key={act.id} className="flex gap-4 pt-4 first:pt-0 pb-4 last:pb-0 items-start">
                      <div className="p-2.5 bg-gray-50 border border-gray-200 rounded">
                        {getIconForType(act.activity_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-neutral-400 bg-neutral-100 border border-neutral-150 px-1.5 py-0.2 rounded font-mono font-bold tracking-tighter">
                            {act.activity_id_code || 'ACT-2026-XXXX'}
                          </span>
                          <span className="text-xs font-bold text-black font-mono uppercase">
                            {client?.client_name || 'Partner Account'}
                          </span>
                          <span className="text-gray-300 text-xs font-mono">•</span>
                          <span className="text-xs font-bold text-black">{act.title}</span>
                          {isFinal ? (
                            <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded">
                              {act.stage} (Final Target)
                            </span>
                          ) : (
                            <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 bg-gray-100 border border-gray-200 text-gray-500 rounded">
                              {act.stage}
                            </span>
                          )}
                        </div>
                        
                        <p className="text-xs text-gray-500 mt-1">{act.description}</p>
                        
                        {/* Download and links wrapper */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-400 font-mono mt-2.5 items-center">
                          <span>Date: {act.activity_date}</span>
                          <span>•</span>
                          <span>Operator: {act.created_by}</span>
                          
                          {act.drive_link && (
                            <>
                              <span>•</span>
                              <a
                                href={act.drive_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-black hover:underline inline-flex items-center gap-0.5 font-bold"
                              >
                                Google Drive Link <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </>
                          )}

                          {/* List of server native files if attached */}
                          {act.files && act.files.map((file, fIdx) => (
                            <React.Fragment key={file.id || fIdx}>
                              <span>•</span>
                              <a
                                href={`/uploads/${file.file_path}`}
                                download={file.file_name}
                                target="_blank"
                                referrerPolicy="no-referrer"
                                rel="noopener noreferrer"
                                className="text-sky-600 hover:underline hover:text-sky-800 inline-flex items-center gap-1 font-bold font-mono border border-sky-100 bg-sky-50 px-1 py-0.2 rounded"
                              >
                                <Paperclip className="w-3 h-3" /> {file.file_name} <Download className="w-2.5 h-2.5" />
                              </a>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2.5 self-start">
                        {onEditActivity && (
                          <button
                            onClick={() => onEditActivity(act)}
                            className="p-1 px-2.5 text-[11px] font-mono border border-gray-200 rounded hover:bg-gray-50 transition cursor-pointer font-bold flex items-center gap-0.5"
                          >
                            <Edit3 className="w-3 h-3 text-neutral-400" /> edit
                          </button>
                        )}
                        {onDeleteActivity && (
                          <button
                            onClick={() => handleDeleteActivityClick(act.id, act.activity_id_code || '')}
                            className="p-1 px-2.5 text-[11px] font-mono border border-transparent rounded text-red-650 hover:bg-red-50 text-red-600 transition cursor-pointer font-bold flex items-center gap-0.5"
                          >
                            <Trash2 className="w-3 h-3 text-red-400" /> delete
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      ) : (
        // ====================================================================
        // SINGLE CLIENT RICH STATS & TIMELINE BOARD
        // ====================================================================
        <div className="space-y-6 animate-fade-in font-sans">
          
          {/* Header row / breadcrumb wrapper */}
          <div className="bg-white border border-gray-200 p-6 rounded flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-black text-white rounded flex items-center justify-center font-bold text-lg font-mono border border-gray-300 shadow-sm">
                {selectedClient.logo_url}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-black font-mono">{selectedClient.client_name}</h2>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 rounded font-bold">
                    {selectedClient.industry}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">Contract commenced on {selectedClient.start_date}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 self-stretch md:self-auto justify-between border-t md:border-t-0 pt-3 md:pt-0">
              <div className="text-right">
                <span className="text-[10px] font-mono text-gray-400 uppercase block tracking-wider font-bold">MONTHLY SLA COMPLIANCE</span>
                <span className="text-xl font-bold font-mono text-black">
                  {getClientProgress(selectedClient).completionPercent}%
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {onAddActivity && (
                  <button
                    onClick={() => onAddActivity(selectedClient.id)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-mono font-bold rounded cursor-pointer transition-all shadow-xs inline-flex items-center gap-1 uppercase"
                  >
                    🚀 Log New Work
                  </button>
                )}
                {onGoToConfig && (
                  <button
                    onClick={() => onGoToConfig(selectedClient.id)}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-mono font-bold rounded cursor-pointer transition-all shadow-xs inline-flex items-center gap-1 uppercase"
                  >
                    🎯 Update Targets
                  </button>
                )}
                <button
                  onClick={onClearSelectedClient}
                  className="px-3 py-1.5 bg-black hover:bg-neutral-800 text-white text-xs font-mono font-bold rounded cursor-pointer transition-all border border-black shadow"
                >
                  ← BACK TO DIRECTORY
                </button>
              </div>
            </div>
          </div>

          {/* Section 1: Monthly Package Progress Cards */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-400 font-mono uppercase tracking-widest">
              SLA Targets for {getAuditPeriodLabel(selectedMonth, selectedYear, auditMonths)}
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.keys(ACTIVITY_CONFIGS).map((key) => {
                const type = key as ActivityType;
                const stats = getClientProgress(selectedClient);
                const targetValue = stats.targets[type] || 0;
                const completedValue = stats.completed[type] || 0;
                const percent = targetValue > 0 ? Math.min(100, Math.round((completedValue / targetValue) * 100)) : 0;
                const isCategoryUnder = targetValue > 0 && percent < 80;

                return (
                  <div key={type} className="bg-white border border-gray-200 p-4 rounded hover:border-gray-400 transition-colors">
                    <div className="flex justify-between items-center text-gray-600 mb-1.5">
                      <span className="text-xs font-semibold text-black uppercase tracking-tight">{type}</span>
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 bg-gray-50 rounded border ${
                        targetValue === 0 
                          ? 'border-gray-100 text-gray-350 text-gray-400' 
                          : isCategoryUnder 
                          ? 'border-red-100 text-red-700 font-bold bg-red-50' 
                          : 'border-gray-200 text-black'
                      }`}>
                        {completedValue} / {targetValue}
                      </span>
                    </div>

                    <div className="font-mono mt-3">
                      <span className={`text-xl font-extrabold tracking-tight ${
                        targetValue === 0 
                          ? 'text-gray-355 text-gray-300' 
                          : isCategoryUnder 
                          ? 'text-red-650 text-red-600' 
                          : 'text-black'
                      }`}>
                        {percent}%
                      </span>
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mt-0.5">Fulfillment score</span>
                    </div>

                    <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 overflow-hidden">
                      <div
                        style={{ width: `${percent}%` }}
                        className={`h-full rounded-full ${isCategoryUnder ? 'bg-red-500' : 'bg-black'}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Recent Activity Timeline */}
          <div className="bg-white border border-gray-200 rounded overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/75 flex justify-between items-center">
              <h3 className="text-xs font-bold text-black font-mono uppercase tracking-wider">REJECTS, WORK-IN-PROGRESS & RECENT DELIVERIES FEED</h3>
            </div>
            
            <div className="divide-y divide-gray-150 p-6 space-y-4">
              {getRecentFeed(selectedClient.id).length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-xs font-mono font-bold">
                  NO CONTRACT DELIVERABLES LOGGED RECENTLY
                </div>
              ) : (
                getRecentFeed(selectedClient.id).map((act) => {
                  const config = ACTIVITY_CONFIGS[act.activity_type];
                  const isFinal = act.stage === config?.completionStage;

                  return (
                    <div key={act.id} className="flex gap-4 pt-4 first:pt-0 pb-4 last:pb-0 items-start">
                      <div className="p-2 bg-gray-50 border border-gray-200 rounded">
                        {getIconForType(act.activity_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] text-neutral-400 bg-neutral-100 border border-neutral-150 px-1.5 py-0.2 rounded font-mono font-bold tracking-tighter">
                            {act.activity_id_code || 'ACT-2026-XXXX'}
                          </span>
                          <span className="text-xs font-bold text-black font-mono uppercase">{act.activity_type}</span>
                          <span className="text-gray-300 text-xs font-mono">•</span>
                          {isFinal ? (
                            <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded">
                              {act.stage} (Counts in Monthly Retainer SLA)
                            </span>
                          ) : (
                            <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 bg-gray-100 border border-gray-200 text-gray-500 rounded font-semibold">
                              {act.stage}
                            </span>
                          )}
                        </div>
                        
                        <h4 className="text-xs font-semibold text-black mt-1">{act.title}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">{act.description}</p>
                        
                        {act.activity_type === 'Blog' && act.blog_title && (
                          <div className="mt-2 text-xs bg-gray-50 p-2 rounded border border-gray-200 font-sans space-y-1">
                            <div className="text-[10px] font-mono font-bold text-gray-400">PUBLISHED BLOG LINK:</div>
                            <div className="font-bold text-black">{act.blog_title}</div>
                            {act.blog_url && (
                              <a href={act.blog_url} target="_blank" rel="noopener noreferrer" className="text-neutral-600 hover:text-black flex items-center gap-0.5 underline mt-0.5 break-all">
                                {act.blog_url} <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-400 font-mono mt-3 items-center">
                          <span>Logged: {act.activity_date}</span>
                          <span>•</span>
                          <span>Creator: {act.created_by}</span>
                          {act.remarks && <span className="italic">• Remarks: {act.remarks}</span>}
                          {act.client_feedback && <span className="text-amber-700 font-semibold bg-amber-50 px-1 rounded">• Feedback: {act.client_feedback}</span>}
                          
                          {act.drive_link && (
                            <>
                              <span>•</span>
                              <a
                                href={act.drive_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-black hover:underline inline-flex items-center gap-0.5 font-bold"
                              >
                                OPEN GOOGLE DRIVE ASSET <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </>
                          )}

                          {/* List of server native files if attached */}
                          {act.files && act.files.map((file, fIdx) => (
                            <React.Fragment key={file.id || fIdx}>
                              <span>•</span>
                              <a
                                href={`/uploads/${file.file_path}`}
                                download={file.file_name}
                                target="_blank"
                                referrerPolicy="no-referrer"
                                rel="noopener noreferrer"
                                className="text-sky-600 hover:underline hover:text-sky-850 inline-flex items-center gap-1 font-bold font-mono border border-sky-100 bg-sky-50 px-1 py-0.2 rounded"
                              >
                                <Paperclip className="w-3 h-3" /> {file.file_name} <Download className="w-2.5 h-2.5" />
                              </a>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>

                      {/* Managers and Admins can edit/delete their deliverables */}
                      <div className="flex gap-2.5 self-start">
                        {onEditActivity && (
                          <button
                            onClick={() => onEditActivity(act)}
                            type="button"
                            className="px-2.5 py-1 text-[11px] font-mono border border-gray-200 rounded hover:bg-gray-50 transition cursor-pointer font-bold flex items-center gap-0.5"
                          >
                            <Edit3 className="w-3 h-3 text-neutral-400" /> Modify
                          </button>
                        )}
                        {onDeleteActivity && (
                          <button
                            onClick={() => handleDeleteActivityClick(act.id, act.activity_id_code || '')}
                            type="button"
                            className="px-2.5 py-1 text-[11px] font-mono border border-transparent rounded text-red-600 hover:bg-red-50 transition cursor-pointer font-bold flex items-center gap-0.5"
                          >
                            <Trash2 className="w-3 h-3 text-red-400" /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Section 3: Rich Retrievable Index / Table Finder */}
          <div className="bg-white border border-gray-200 rounded overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/75 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-black font-mono uppercase tracking-wider">RETRIEVABLE DELIVERABLES INDEX</h3>
                <p className="text-[11px] text-gray-400 font-sans mt-0.5">Filter, search by ID or title, and instantly retrieve verified assets</p>
              </div>

              {/* Reset filter helpers */}
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterType('All');
                  setFilterStage('All');
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-[10px] font-mono hover:underline text-gray-400 hover:text-black font-bold uppercase tracking-wider"
              >
                RESET FILTERS
              </button>
            </div>

            {/* Filter grid */}
            <div className="p-4 bg-gray-50 border-b border-gray-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-gray-400">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="ID, Title, Desc Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:border-black font-mono"
                />
              </div>

              <div>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-black font-mono"
                >
                  <option value="All">All Categories</option>
                  {Object.keys(ACTIVITY_CONFIGS).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={filterStage}
                  onChange={(e) => setFilterStage(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-black font-mono"
                >
                  <option value="All">All Stages</option>
                  <option value="Uploaded">Uploaded</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Published">Published</option>
                  <option value="Launched">Launched</option>
                  <option value="Completed">Completed</option>
                  <option value="Designed">Designed</option>
                  <option value="Edited">Edited</option>
                  <option value="Topic Assigned">Topic Assigned</option>
                  <option value="Written">Written</option>
                  <option value="Submitted">Submitted</option>
                  <option value="Draft Created">Draft Created</option>
                  <option value="Approved">Approved</option>
                </select>
              </div>

              <div>
                <input
                  type="date"
                  placeholder="Date From"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-black"
                />
              </div>

              <div>
                <input
                  type="date"
                  placeholder="Date To"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-black"
                />
              </div>
            </div>

            {/* Results table */}
            <div className="overflow-x-auto w-full font-sans">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 border-b border-gray-200 uppercase text-[10px] font-bold">
                    <th className="py-3 px-6">ID Code</th>
                    <th className="py-3 px-6">Asset Title</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-2 text-center">Date</th>
                    <th className="py-3 px-3 text-center">Stage</th>
                    <th className="py-3 px-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {getFilteredActivities(selectedClient.id).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-405 text-gray-400 text-xs font-bold">
                        NO DELIVERABLES MATCHING FILTER SCHEMAS
                      </td>
                    </tr>
                  ) : (
                    getFilteredActivities(selectedClient.id).map((act) => {
                      const isFinal = act.stage === ACTIVITY_CONFIGS[act.activity_type]?.completionStage;
                      return (
                        <tr key={act.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-6 font-bold text-neutral-500 font-mono text-xs">
                            {act.activity_id_code || 'ACT-2026-XXXX'}
                          </td>
                          <td className="py-3 px-6 font-bold text-[#111827] font-sans text-xs">
                            {act.title}
                          </td>
                          <td className="py-3 px-3 text-gray-500 font-mono text-xs">
                            {act.activity_type}
                          </td>
                          <td className="py-3 px-2 text-center text-gray-400 font-mono">
                            {act.activity_date}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded ${
                              isFinal 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-250 border-emerald-200' 
                                : 'bg-gray-100 text-gray-500 border border-gray-200'
                            }`}>
                              {act.stage}
                            </span>
                          </td>
                          <td className="py-3 px-6 text-right">
                            <div className="flex justify-end gap-1.5 flex-wrap">
                              {act.drive_link && (
                                <a
                                  href={act.drive_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1 bg-white hover:bg-black hover:text-white border border-gray-200 rounded text-[11px] font-mono font-bold inline-flex items-center gap-1 text-black transition-all shadow-xs"
                                >
                                  DRIVE <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                              
                              {/* Download button for static file path */}
                              {act.files && act.files.map((file, fIdx) => (
                                <a
                                  key={file.id || fIdx}
                                  href={`/uploads/${file.file_path}`}
                                  download={file.file_name}
                                  target="_blank"
                                  referrerPolicy="no-referrer"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-white border border-sky-200 rounded text-[11px] font-mono font-bold inline-flex items-center gap-1 transition-all shadow-xs"
                                >
                                  VIEW ATTACHMENT <Paperclip className="w-2.5 h-2.5" />
                                </a>
                              ))}

                              {onEditActivity && (
                                <button
                                  onClick={() => onEditActivity(act)}
                                  className="px-2 py-1 bg-white hover:bg-neutral-50 border border-gray-200 text-neutral-700 hover:text-black rounded text-[11px] font-mono font-bold inline-flex items-center gap-0.5 transition-all shadow-xs cursor-pointer"
                                >
                                  EDIT
                                </button>
                              )}

                              {onDeleteActivity && (
                                <button
                                  onClick={() => handleDeleteActivityClick(act.id, act.activity_id_code || '')}
                                  className="px-2 py-1 bg-white hover:bg-red-50 border border-[#FEE2E2] text-[#D01E1E] hover:text-[#B91C1C] rounded text-[11px] font-mono font-bold inline-flex items-center gap-0.5 transition-all shadow-xs cursor-pointer"
                                >
                                  DEL
                                </button>
                              )}
                              
                              {!act.drive_link && (!act.files || act.files.length === 0) && !onEditActivity && !onDeleteActivity && (
                                <span className="text-[10px] text-gray-400 font-mono">No attach links</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
