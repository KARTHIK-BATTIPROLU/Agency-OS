import React, { useMemo, useState } from 'react';
import {
  Task, TaskStatus, TaskPriority, Client, User,
  TASK_STATUSES, TASK_PRIORITIES,
} from '../types';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import { Plus, X, Check, Edit3, Trash2, ListChecks, Search } from 'lucide-react';

interface TasksTabProps {
  tasks: Task[];
  clients: Client[];
  users: User[];
  currentUser: User | null;
  onSaveTask: (task: Partial<Task>) => void;
  onDeleteTask: (id: string) => void;
}

const STATUS_BADGE: Record<TaskStatus, string> = {
  'To Do': 'bg-gray-100 text-gray-600 border-gray-200',
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-100',
  'Blocked': 'bg-rose-50 text-rose-700 border-rose-100',
  'Done': 'bg-green-50 text-green-700 border-green-100',
};

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  'Low': 'bg-gray-100 text-gray-500 border-gray-200',
  'Medium': 'bg-amber-50 text-amber-700 border-amber-100',
  'High': 'bg-red-50 text-red-700 border-red-100',
};

const LABEL = 'block text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1 font-mono';
const INPUT = 'w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-sans';
const SELECT = 'bg-white border border-gray-200 rounded px-3 py-1.5 text-xs font-mono font-bold focus:outline-none focus:border-black text-black';

export default function TasksTab({ tasks, clients, users, currentUser, onSaveTask, onDeleteTask }: TasksTabProps) {
  const activeTasks = useMemo(() => tasks.filter(t => !t.is_deleted), [tasks]);

  // Filters
  const [search, setSearch] = useState('');
  const [filterClient, setFilterClient] = useState('All');
  const [filterAssignee, setFilterAssignee] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');

  // Modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  const clientName = (id?: string) => clients.find(c => c.id === id)?.client_name || '—';
  const userName = (id?: string) => users.find(u => u.id === id)?.name || 'Unassigned';

  const filtered = activeTasks.filter(t => {
    if (filterClient !== 'All' && t.client_id !== filterClient) return false;
    if (filterAssignee !== 'All' && t.assignee_id !== filterAssignee) return false;
    if (filterStatus !== 'All' && t.status !== filterStatus) return false;
    if (filterPriority !== 'All' && t.priority !== filterPriority) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${t.title} ${t.description || ''} ${clientName(t.client_id)}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const openCreate = () => { setEditing(null); setIsFormOpen(true); };
  const openEdit = (t: Task) => { setEditing(t); setIsFormOpen(true); };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-black" />
          <div>
            <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-black">Task Board</h2>
            <p className="text-[11px] text-gray-400 font-sans">Assignment, ownership & delivery status across the agency.</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-black hover:bg-neutral-800 text-white rounded text-xs font-bold font-mono flex items-center gap-1.5 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> NEW TASK
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 p-3 rounded flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-gray-400"><Search className="w-3.5 h-3.5" /></span>
          <input
            type="text" placeholder="Search tasks..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:border-black font-mono"
          />
        </div>
        <select className={SELECT} value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
          <option value="All">All Clients</option>
          {clients.filter(c => !c.is_deleted).map(c => <option key={c.id} value={c.id}>{c.client_name}</option>)}
        </select>
        <select className={SELECT} value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}>
          <option value="All">All Owners</option>
          {users.filter(u => !u.is_deleted).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className={SELECT} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="All">All Status</option>
          {TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={SELECT} value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
          <option value="All">All Priority</option>
          {TASK_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-800">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-400 font-mono uppercase text-[10px] font-bold">
                <th className="py-3 px-4">Task</th>
                <th className="py-3 px-3">Client</th>
                <th className="py-3 px-3">Owner</th>
                <th className="py-3 px-3">Due</th>
                <th className="py-3 px-3 text-center">Priority</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center">Stage</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="py-10 text-center text-gray-400 font-mono text-xs uppercase tracking-wider">No tasks match the current filters.</td></tr>
              )}
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors align-middle group">
                  <td className="py-3 px-4">
                    <div className="font-bold text-sm text-[#111827]">{t.title}</div>
                    {t.description && <div className="text-[11px] text-gray-400 mt-0.5 line-clamp-1 max-w-xs">{t.description}</div>}
                  </td>
                  <td className="py-3 px-3 text-gray-600">{clientName(t.client_id)}</td>
                  <td className="py-3 px-3 text-gray-600">{userName(t.assignee_id)}</td>
                  <td className="py-3 px-3 font-mono text-[11px] text-gray-500">{t.due_date || '—'}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${PRIORITY_BADGE[t.priority]}`}>{t.priority}</span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${STATUS_BADGE[t.status]}`}>{t.status}</span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border bg-neutral-100 text-neutral-600 border-neutral-200">{t.approval_stage}</span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(t)} className="p-1 px-2 text-xs text-gray-500 hover:text-black rounded border border-gray-200 hover:bg-gray-50 flex items-center gap-1 font-bold font-mono">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(t)} className="p-1 px-2 text-xs text-red-600 hover:bg-red-50 border border-transparent rounded flex items-center gap-1 font-bold font-mono">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isFormOpen && (
        <TaskFormModal
          task={editing}
          clients={clients}
          users={users}
          allTasks={activeTasks}
          defaultOwner={currentUser?.id}
          onCancel={() => setIsFormOpen(false)}
          onSave={(data) => { onSaveTask(data); setIsFormOpen(false); }}
        />
      )}

      <DeleteConfirmationModal
        isOpen={!!deleteTarget}
        title="Remove Task"
        message={`Delete task "${deleteTarget?.title}"? This soft-deletes it from the board.`}
        onConfirm={() => { if (deleteTarget) onDeleteTask(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Create / Edit modal
// ---------------------------------------------------------------------
interface TaskFormModalProps {
  task: Task | null;
  clients: Client[];
  users: User[];
  allTasks: Task[];
  defaultOwner?: string;
  onCancel: () => void;
  onSave: (data: Partial<Task>) => void;
}

function TaskFormModal({ task, clients, users, allTasks, defaultOwner, onCancel, onSave }: TaskFormModalProps) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [clientId, setClientId] = useState(task?.client_id || '');
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id || defaultOwner || '');
  const [dueDate, setDueDate] = useState(task?.due_date || '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || 'Medium');
  const [status, setStatus] = useState<TaskStatus>(task?.status || 'To Do');
  const [dependencies, setDependencies] = useState<string[]>(task?.dependencies || []);

  const toggleDependency = (id: string) => {
    setDependencies(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      ...(task ? { id: task.id } : {}),
      title: title.trim(),
      description,
      client_id: clientId || undefined,
      assignee_id: assigneeId || undefined,
      due_date: dueDate || undefined,
      priority,
      status,
      dependencies,
    });
  };

  const dependencyChoices = allTasks.filter(t => t.id !== task?.id);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/75 sticky top-0">
          <h3 className="text-xs font-bold text-black font-mono uppercase tracking-wider">{task ? 'Edit Task' : 'Create Task'}</h3>
          <button onClick={onCancel} type="button" className="text-gray-400 hover:text-black p-1 rounded hover:bg-gray-100 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={LABEL}>Task Title <span className="text-red-500">*</span></label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} placeholder="e.g. Draft April reel scripts" required />
          </div>
          <div>
            <label className={LABEL}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={INPUT} rows={2} placeholder="Optional details..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Client</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={INPUT + ' font-mono'}>
                <option value="">— None —</option>
                {clients.filter(c => !c.is_deleted).map(c => <option key={c.id} value={c.id}>{c.client_name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Owner</label>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={INPUT + ' font-mono'}>
                <option value="">Unassigned</option>
                {users.filter(u => !u.is_deleted).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={LABEL}>Due Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={INPUT + ' font-mono'} />
            </div>
            <div>
              <label className={LABEL}>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={INPUT + ' font-mono'}>
                {TASK_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className={INPUT + ' font-mono'}>
                {TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {dependencyChoices.length > 0 && (
            <div>
              <label className={LABEL}>Depends On</label>
              <div className="border border-gray-200 rounded p-2 max-h-28 overflow-y-auto space-y-1">
                {dependencyChoices.map(dep => (
                  <label key={dep.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                    <input type="checkbox" checked={dependencies.includes(dep.id)} onChange={() => toggleDependency(dep.id)} />
                    <span className="truncate">{dep.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end items-center gap-3 border-t border-gray-200 pt-4">
            <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 rounded text-xs font-bold font-mono text-black transition-colors">CANCEL</button>
            <button type="submit" className="px-4 py-2 bg-black hover:bg-neutral-800 text-white rounded text-xs font-bold font-mono flex items-center gap-1 transition-colors"><Check className="w-4 h-4" /> {task ? 'SAVE' : 'CREATE'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
