import React, { useMemo, useState } from 'react';
import {
  Task, Client, User, ApprovalStage, APPROVAL_STAGES, nextApprovalStage,
} from '../types';
import { GitPullRequest, ChevronRight, RotateCcw, Clock, ChevronDown } from 'lucide-react';

interface ApprovalsTabProps {
  tasks: Task[];
  clients: Client[];
  users: User[];
  onApprovalAction: (id: string, stage: string, note?: string) => void;
}

const STAGE_ACCENT: Record<ApprovalStage, string> = {
  'Draft': 'border-gray-300 bg-gray-50',
  'Internal Review': 'border-blue-300 bg-blue-50/40',
  'Sent to Client': 'border-amber-300 bg-amber-50/40',
  'Revision Requested': 'border-rose-300 bg-rose-50/40',
  'Approved': 'border-green-300 bg-green-50/40',
  'Published': 'border-violet-300 bg-violet-50/40',
};

export default function ApprovalsTab({ tasks, clients, users, onApprovalAction }: ApprovalsTabProps) {
  const activeTasks = useMemo(() => tasks.filter(t => !t.is_deleted), [tasks]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const clientName = (id?: string) => clients.find(c => c.id === id)?.client_name || '—';
  const userName = (id?: string) => users.find(u => u.id === id)?.name || 'Unassigned';

  const grouped = useMemo(() => {
    const map: Record<ApprovalStage, Task[]> = {
      'Draft': [], 'Internal Review': [], 'Sent to Client': [],
      'Revision Requested': [], 'Approved': [], 'Published': [],
    };
    for (const t of activeTasks) {
      const stage = (t.approval_stage || 'Draft') as ApprovalStage;
      if (map[stage]) map[stage].push(t);
    }
    return map;
  }, [activeTasks]);

  const advance = (t: Task) => {
    const next = nextApprovalStage(t.approval_stage);
    if (next) onApprovalAction(t.id, next);
  };

  const requestRevision = (t: Task) => {
    const note = window.prompt('Revision note (what needs to change?)') || '';
    onApprovalAction(t.id, 'Revision Requested', note);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <GitPullRequest className="w-5 h-5 text-black" />
        <div>
          <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-black">Approval Pipeline</h2>
          <p className="text-[11px] text-gray-400 font-sans">Move deliverables through Draft → Review → Client → Approved → Published.</p>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {APPROVAL_STAGES.map(stage => {
          const next = stage === 'Revision Requested' ? 'Internal Review' : nextApprovalStage(stage);
          return (
            <div key={stage} className="flex-shrink-0 w-72">
              <div className={`rounded-t border-t-2 ${STAGE_ACCENT[stage]} px-3 py-2 flex items-center justify-between`}>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-700">{stage}</span>
                <span className="text-[10px] font-mono font-bold bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-500">{grouped[stage].length}</span>
              </div>
              <div className="bg-gray-50/60 border border-gray-200 border-t-0 rounded-b p-2 space-y-2 min-h-[120px]">
                {grouped[stage].length === 0 && (
                  <div className="text-[10px] text-gray-300 font-mono uppercase text-center py-6">Empty</div>
                )}
                {grouped[stage].map(t => (
                  <div key={t.id} className="bg-white border border-gray-200 rounded p-2.5 shadow-xs">
                    <div className="font-bold text-xs text-[#111827] leading-snug">{t.title}</div>
                    <div className="text-[10px] text-gray-400 font-mono mt-1 flex items-center gap-1 flex-wrap">
                      <span>{clientName(t.client_id)}</span>
                      <span className="text-gray-300">•</span>
                      <span>{userName(t.assignee_id)}</span>
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {next && (
                        <button
                          onClick={() => advance(t)}
                          className="px-2 py-1 bg-black hover:bg-neutral-800 text-white rounded text-[10px] font-bold font-mono flex items-center gap-1 transition-colors"
                        >
                          {next} <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                      {(stage === 'Internal Review' || stage === 'Sent to Client') && (
                        <button
                          onClick={() => requestRevision(t)}
                          className="px-2 py-1 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded text-[10px] font-bold font-mono flex items-center gap-1 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" /> Revise
                        </button>
                      )}
                      {(t.approval_history?.length || 0) > 0 && (
                        <button
                          onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                          className="px-1.5 py-1 text-gray-400 hover:text-black rounded text-[10px] font-bold font-mono flex items-center gap-1"
                        >
                          <Clock className="w-3 h-3" />
                          {expanded === t.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </button>
                      )}
                    </div>

                    {expanded === t.id && (t.approval_history?.length || 0) > 0 && (
                      <div className="mt-2 border-t border-gray-100 pt-2 space-y-1">
                        {t.approval_history!.slice().reverse().map((ev, i) => (
                          <div key={i} className="text-[10px] text-gray-500 font-mono">
                            <span className="font-bold text-neutral-700">{ev.stage}</span>
                            <span className="text-gray-300"> — </span>
                            {ev.by} · {new Date(ev.at).toLocaleDateString()}
                            {ev.note && <div className="text-gray-400 italic pl-1">“{ev.note}”</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
