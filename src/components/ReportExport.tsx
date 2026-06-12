/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Client, MonthlyPackage, Activity, ACTIVITY_CONFIGS, isWithinAuditRange, getAuditPeriodLabel } from '../types';
import { Download, FileSpreadsheet, Percent, Calendar, CheckSquare, Award } from 'lucide-react';

interface ReportExportProps {
  clients: Client[];
  packages: MonthlyPackage[];
  activities: Activity[];
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

export default function ReportExport({
  clients,
  packages,
  activities,
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
}: ReportExportProps) {

  // Helper function to count completed items
  const countCompleted = (clientId: string, type: string) => {
    const config = ACTIVITY_CONFIGS[type as any];
    if (!config) return 0;
    
    return activities.filter(act => {
      // Must match client
      if (act.client_id !== clientId) return false;
      // Must match type
      if (act.activity_type !== type) return false;
      // Must match completion stage
      if (act.stage !== config.completionStage) return false;
      
      // Must match selected range of activity_date
      const date = new Date(act.activity_date);
      const actMonth = date.getMonth() + 1;
      const actYear = date.getFullYear();
      return isWithinAuditRange(actMonth, actYear, selectedMonth, selectedYear, auditMonths);
    }).length;
  };

  // Generate metrics for active clients
  const activeClients = clients.filter(c => c.status === 'Active');

  const clientReports = activeClients.map(client => {
    // Find packages that fall within the selected audit range
    const rangePkgs = packages.filter(
      p => p.client_id === client.id && 
           !p.is_deleted &&
           isWithinAuditRange(p.month, p.year, selectedMonth, selectedYear, auditMonths)
    );

    const rawMetrics = [
      { key: 'Poster', name: 'Posters', target: rangePkgs.reduce((sum, p) => sum + (p.posters_target || 0), 0), completed: countCompleted(client.id, 'Poster') },
      { key: 'Reel', name: 'Reels', target: rangePkgs.reduce((sum, p) => sum + (p.reels_target || 0), 0), completed: countCompleted(client.id, 'Reel') },
      { key: 'Video Editing', name: 'Video Editing', target: rangePkgs.reduce((sum, p) => sum + (p.video_target || 0), 0), completed: countCompleted(client.id, 'Video Editing') },
      { key: 'Ad Campaign', name: 'Ad Campaigns', target: rangePkgs.reduce((sum, p) => sum + (p.ads_target || 0), 0), completed: countCompleted(client.id, 'Ad Campaign') },
      { key: 'Blog', name: 'Blogs', target: rangePkgs.reduce((sum, p) => sum + (p.blogs_target || 0), 0), completed: countCompleted(client.id, 'Blog') },
      { key: 'Content Writing', name: 'Content Writing', target: rangePkgs.reduce((sum, p) => sum + (p.content_target || 0), 0), completed: countCompleted(client.id, 'Content Writing') },
      { key: 'Script Writing', name: 'Script Writing', target: rangePkgs.reduce((sum, p) => sum + (p.scripts_target || 0), 0), completed: countCompleted(client.id, 'Script Writing') },
      { key: 'Website Update', name: 'Website Updates', target: rangePkgs.reduce((sum, p) => sum + (p.website_updates_target || 0), 0), completed: countCompleted(client.id, 'Website Update') }
    ];

    const metrics = selectedAssetType === 'All'
      ? rawMetrics
      : rawMetrics.filter(m => m.key === selectedAssetType);

    const totalTarget = metrics.reduce((sum, m) => sum + m.target, 0);
    const totalCompleted = metrics.reduce((sum, m) => sum + m.completed, 0);
    
    // Capped fulfillment to align with SLA standards
    const totalFulfilledCapped = metrics.reduce((sum, m) => sum + Math.min(m.target, m.completed), 0);
    const completionPercent = totalTarget > 0 ? Math.round((totalFulfilledCapped / totalTarget) * 100) : 0;

    return {
      client,
      metrics,
      totalTarget,
      totalCompleted,
      completionPercent
    };
  });

  const agencyTotalTarget = clientReports.reduce((sum, r) => sum + r.totalTarget, 0);
  const agencyTotalCompleted = clientReports.reduce((sum, r) => sum + r.totalCompleted, 0);
  const agencyCompletionPercent = agencyTotalTarget > 0 ? Math.round((agencyTotalCompleted / agencyTotalTarget) * 100) : 0;

  // Export CSV
  const handleExportCSV = () => {
    const periodLabel = getAuditPeriodLabel(selectedMonth, selectedYear, auditMonths).replace(/"/g, '""');
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Client,Audit Period,Delivery Metrics,Promised SLA Target,Completed Deliverables,Fulfillment Rate\n';

    clientReports.forEach(r => {
      r.metrics.forEach(m => {
        const rate = m.target > 0 ? `${Math.round((m.completed / m.target) * 100)}%` : '0%';
        csvContent += `"${r.client.client_name}","${periodLabel}","${m.name}",${m.target},${m.completed},"${rate}"\n`;
      });
      csvContent += `"${r.client.client_name}" Team Totals,"${periodLabel}",_ALL_,${r.totalTarget},${r.totalCompleted},"${r.completionPercent}%"\n\n`;
    });

    csvContent += `AGENCY OPERATIONS AUTO SUMMARY,"${periodLabel}",,,,\n`;
    csvContent += `Total Promised targets across agency,${agencyTotalTarget},,,,\n`;
    csvContent += `Total Completed on schedule,${agencyTotalCompleted},,,,\n`;
    csvContent += `Fulfillment Ratio,${agencyCompletionPercent}%,,,,\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Agency_Operations_Fulfillment_Report_${selectedYear}_M${selectedMonth}_D${auditMonths}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export plaintext Summary formatted report
  const handleExportTextSummary = () => {
    const periodLabel = getAuditPeriodLabel(selectedMonth, selectedYear, auditMonths);
    let txt = `====================================================================\n`;
    txt += `          AGENCY OPERATIONS OS - FULFILLMENT AUDIT REPORT\n`;
    txt += `          Period: ${periodLabel}\n`;
    txt += `====================================================================\n\n`;
    txt += `AGENCY METRIC HIGHLIGHTS:\n`;
    txt += `- Total Monitored Clients: ${clientReports.length}\n`;
    txt += `- Total System Promised Targets: ${agencyTotalTarget} deliverables\n`;
    txt += `- Total Confirmed Completed Logs: ${agencyTotalCompleted} deliverables\n`;
    txt += `- Network Overall Fulfillment Rate: ${agencyCompletionPercent}%\n\n`;
    txt += `--------------------------------------------------------------------\n`;
    txt += `INDIVIDUAL CLIENT METRICS & PROOF-OF-WORK AUDIT\n`;
    txt += `--------------------------------------------------------------------\n\n`;

    clientReports.forEach(r => {
      txt += `Client Name: ${r.client.client_name}\n`;
      txt += `Industry Focus: ${r.client.industry}\n`;
      txt += `Audit Period: ${periodLabel}\n`;
      txt += `Fulfillment Ratio: ${r.completionPercent}% (${r.totalCompleted}/${r.totalTarget} items)\n`;
      txt += `Fulfillment Status: ${r.completionPercent < 80 ? 'BEHIND TARGET (RED FLAG)' : 'ON TARGET'}\n`;
      txt += `KPI breakdown:\n`;
      r.metrics.forEach(m => {
        txt += `   * ${m.name.padEnd(20)}: ${m.completed}/${m.target} items (${m.target > 0 ? Math.round((m.completed / m.target) * 100) : 0}%)\n`;
      });
      txt += `\n`;
    });

    const element = document.createElement('a');
    const file = new Blob([txt], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `Agency_Audit_Report_${selectedYear}_M${selectedMonth}_D${auditMonths}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="bg-white border border-gray-200 rounded overflow-hidden p-6 space-y-6 font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-200 pb-4 gap-4">
        <div>
          <h3 className="text-xs font-bold text-black font-mono uppercase tracking-wider">AUTOMATED SLA BUSINESS AUDITING</h3>
          <p className="text-[11px] text-gray-400 font-sans mt-0.5">Statistical outputs are computed in real-time from active verified deliverables</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 border border-gray-200 rounded px-2.5 py-1.5 bg-gray-50/75 select-none text-black font-mono flex-wrap">
            <span className="text-[10px] text-gray-400 font-bold mr-1">START:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent border-none text-xs font-mono py-0.5 focus:outline-none font-bold text-black"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                <option key={m} value={m}>{new Date(2026, m-1).toLocaleString('default', { month: 'short' }).toUpperCase()}</option>
              ))}
            </select>
            <span className="text-gray-300 text-xs font-mono">/</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent border-none text-xs font-mono py-0.5 focus:outline-none font-bold text-black"
            >
              {[2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            
            <span className="text-gray-300 text-xs font-mono mx-1">|</span>
            
            <span className="text-[10px] text-gray-400 font-bold mr-1">SPAN:</span>
            <select
              value={auditMonths}
              onChange={(e) => setAuditMonths(Number(e.target.value))}
              className="bg-transparent border-none text-xs font-mono py-0.5 focus:outline-none font-bold text-black"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                <option key={m} value={m}>
                  {m}M {m === 3 ? '(QTR)' : m === 6 ? '(HALF)' : m === 12 ? '(FULL)' : ''}
                </option>
              ))}
            </select>

            <span className="text-gray-300 text-xs font-mono mx-1">|</span>

            <span className="text-[10px] text-gray-400 font-bold mr-1">ASSET:</span>
            <select
              value={selectedAssetType}
              onChange={(e) => setSelectedAssetType(e.target.value)}
              className="bg-transparent border-none text-xs font-mono py-0.5 focus:outline-none font-bold text-black"
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

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportTextSummary}
              className="px-3.5 py-1.5 border border-gray-200 hover:border-black font-mono text-black hover:bg-gray-50 transition rounded-xs text-xs flex items-center gap-1.5 font-bold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> TXT SUMMARY
            </button>
            <button
              onClick={handleExportCSV}
              className="px-3.5 py-1.5 bg-black hover:bg-neutral-800 border border-black font-mono text-white transition rounded-xs text-xs flex items-center gap-1.5 font-bold cursor-pointer shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> EXPORT CSV METRICS
            </button>
          </div>
        </div>
      </div>

      {/* Highlights Bento Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded border border-gray-200 bg-white shadow-xs">
          <span className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-widest block">AGENCY COMPLETED WORK</span>
          <div className="mt-2 flex items-baseline gap-1 font-mono">
            <CheckSquare className="w-4 h-4 text-emerald-600 self-center" />
            <span className="text-xl font-bold font-mono text-black ml-1">{agencyTotalCompleted}</span>
            <span className="text-[11px] text-gray-400 font-mono">/ {agencyTotalTarget} promised</span>
          </div>
        </div>

        <div className="p-4 rounded border border-gray-200 bg-white shadow-xs">
          <span className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-widest block">NETWORK EFFICIENCY SPEC</span>
          <div className="mt-2 flex items-baseline gap-1 font-mono">
            <Percent className="w-4 h-4 text-emerald-600 self-center" />
            <span className="text-xl font-bold font-mono text-black ml-1">{agencyCompletionPercent}%</span>
            <span className="text-[10px] text-gray-400 uppercase font-mono ml-2">contract Avg</span>
          </div>
        </div>

        <div className="p-4 rounded border border-gray-200 bg-white shadow-xs">
          <span className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-widest block">COMPLIANCE CRITERIA STATUS</span>
          <div className="mt-2.5 flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${agencyCompletionPercent >= 80 ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-xs font-bold text-black font-mono uppercase tracking-wider">
              {agencyCompletionPercent >= 80 ? 'EXCELLENT STABILITY' : 'CRITICAL WARNING SLA'}
            </span>
          </div>
        </div>
      </div>

      {/* Detailed client reports tables */}
      <div className="space-y-6">
        <h4 className="text-[10px] font-bold font-mono text-gray-400 uppercase tracking-wider">CLIENT SLA PERFORMANCE DELIVERIES LIST</h4>
        
        {clientReports.map(({ client, metrics, totalTarget, totalCompleted, completionPercent }) => {
          const isBehind = completionPercent < 80;

          return (
            <div key={client.id} className="border border-gray-200 rounded overflow-hidden shadow-xs">
              <div className="px-5 py-4 bg-gray-50/75 flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 gap-2">
                <div>
                  <h5 className="text-xs font-bold text-black font-mono uppercase tracking-wide">{client.client_name}</h5>
                  <p className="text-[10px] text-gray-400 font-mono uppercase mt-0.5">{client.industry.toUpperCase()}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-gray-500 font-mono">
                    Total SLA Items: <strong className="text-black font-bold">{totalCompleted}/{totalTarget}</strong>
                  </span>
                  
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                    isBehind 
                      ? 'bg-rose-50 text-red-600 border-red-100' 
                      : 'bg-green-50 text-green-700 border-green-100'
                  }`}>
                    {completionPercent}% {isBehind ? 'BEHIND TARGET' : 'ON TRACK'}
                  </span>

                  {onAddActivity && (
                    <button
                      onClick={() => onAddActivity(client.id)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] uppercase font-mono font-bold rounded cursor-pointer transition-all shadow-xs border-0"
                    >
                      + Log Work
                    </button>
                  )}
                  {onGoToConfig && (
                    <button
                      onClick={() => onGoToConfig(client.id)}
                      className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white text-[10px] uppercase font-mono font-bold rounded cursor-pointer transition-all shadow-xs border-0"
                    >
                      Edit SLA Targets
                    </button>
                  )}
                </div>
              </div>

              {/* Package metrics sub grid */}
              <div className="p-4 bg-white">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-neutral-100 text-neutral-400">
                      <th className="pb-1.5 font-semibold text-[10px] uppercase">Asset Category</th>
                      <th className="pb-1.5 text-center font-semibold text-[10px] uppercase">Goal Target</th>
                      <th className="pb-1.5 text-center font-semibold text-[10px] uppercase">Delivered</th>
                      <th className="pb-1.5 text-right font-semibold text-[10px] uppercase">Status Ratio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {metrics.map(metric => {
                      const ratio = metric.target > 0 ? (metric.completed / metric.target) : 0;
                      const ratioPercent = Math.min(100, Math.round(ratio * 100));
                      const isSubBehind = metric.target > 0 && ratioPercent < 80;

                      return (
                        <tr key={metric.name} className="hover:bg-neutral-55/30 transition-colors">
                          <td className="py-2 text-neutral-800 font-sans font-medium">{metric.name}</td>
                          <td className="py-2 text-center font-semibold text-neutral-500">{metric.target}</td>
                          <td className={`py-2 text-center font-semibold ${
                            metric.completed >= metric.target && metric.target > 0 
                              ? 'text-emerald-700 font-bold' 
                              : 'text-neutral-900'
                          }`}>
                            {metric.completed}
                          </td>
                          <td className="py-2 text-right">
                            <span className={`text-[11px] font-bold ${
                              isSubBehind ? 'text-red-650' : ratioPercent >= 100 ? 'text-emerald-700' : 'text-neutral-600'
                            }`}>
                              {ratioPercent}%
                            </span>
                            <div className="w-16 h-1.5 bg-neutral-100 rounded-full inline-block ml-2 overflow-hidden align-middle">
                              <div
                                style={{ width: `${ratioPercent}%` }}
                                className={`h-full rounded-full ${isSubBehind ? 'bg-red-500' : 'bg-neutral-900'}`}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
