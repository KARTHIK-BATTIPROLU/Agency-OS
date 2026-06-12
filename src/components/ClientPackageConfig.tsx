import React, { useState, useEffect } from 'react';
import { Client, MonthlyPackage, ClientStatus, User, UserRole } from '../types';
import { Plus, Trash2, Edit3, Settings, ShieldAlert, Check, X, Calendar, UserCheck, RefreshCw } from 'lucide-react';
import DeleteConfirmationModal from './DeleteConfirmationModal';

interface ClientPackageConfigProps {
  clients: Client[];
  packages: MonthlyPackage[];
  users: User[];
  currentRole: string;
  onSaveClient: (client: Omit<Client, 'created_at'> & { id?: string }) => void;
  onDeleteClient: (id: string) => void;
  onRestoreClient: (id: string) => void;
  onSavePackage: (pkg: Omit<MonthlyPackage, 'created_at'> & { id?: string }) => void;
  onSaveUser: (user: { id?: string, name: string, email: string, role: UserRole }) => void;
  onDeleteUser: (id: string) => void;
  onRestoreUser: (id: string) => void;
  initialClientId?: string;
  onToggleRole?: () => void;
}

export default function ClientPackageConfig({
  clients,
  packages,
  users,
  currentRole,
  onSaveClient,
  onDeleteClient,
  onRestoreClient,
  onSavePackage,
  onSaveUser,
  onDeleteUser,
  onRestoreUser,
  initialClientId,
  onToggleRole
}: ClientPackageConfigProps) {
  const isAdmin = currentRole === 'Admin';

  const [activeTab, setActiveTab] = useState<'clients' | 'packages' | 'users'>('clients');
  const [showArchived, setShowArchived] = useState(false);

  // Client editor states
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [clientName, setClientName] = useState('');
  const [industry, setIndustry] = useState('');
  const [status, setStatus] = useState<ClientStatus>('Active');
  const [startDate, setStartDate] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');

  // Package target editor states
  const [selectedClientId, setSelectedClientId] = useState('');
  const [month, setMonth] = useState<number>(6); // Default June
  const [year, setYear] = useState<number>(2026); // Default 2026
  
  // Package metrics
  const [posters, setPosters] = useState(0);
  const [reels, setReels] = useState(0);
  const [videos, setVideos] = useState(0);
  const [ads, setAds] = useState(0);
  const [blogs, setBlogs] = useState(0);
  const [content, setContent] = useState(0);
  const [scripts, setScripts] = useState(0);
  const [website, setWebsite] = useState(0);

  // User editor states
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRoleLocal, setUserRoleLocal] = useState<UserRole>('Manager');

  // Reusable delete confirmation modal states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargetType, setDeleteTargetType] = useState<'client' | 'user'>('client');
  const [deleteTargetId, setDeleteTargetId] = useState('');
  const [deleteTargetName, setDeleteTargetName] = useState('');

  // Set default selected client on tab change or initialClientId
  const activeClientsOnly = clients.filter(c => !c.is_deleted);
  useEffect(() => {
    if (initialClientId) {
      setSelectedClientId(initialClientId);
      setActiveTab('packages');
    } else if (activeClientsOnly.length > 0 && !selectedClientId) {
      setSelectedClientId(activeClientsOnly[0].id);
    }
  }, [activeClientsOnly, selectedClientId, initialClientId]);

  // Load package values when selected client changes
  useEffect(() => {
    if (selectedClientId) {
      const match = packages.find(
        p => p.client_id === selectedClientId && p.month === month && p.year === year && !p.is_deleted
      );
      if (match) {
        setPosters(match.posters_target);
        setReels(match.reels_target);
        setVideos(match.video_target);
        setAds(match.ads_target);
        setBlogs(match.blogs_target);
        setContent(match.content_target);
        setScripts(match.scripts_target);
        setWebsite(match.website_updates_target);
      } else {
        // Clear targets
        setPosters(0);
        setReels(0);
        setVideos(0);
        setAds(0);
        setBlogs(0);
        setContent(0);
        setScripts(0);
        setWebsite(0);
      }
    }
  }, [selectedClientId, month, year, packages]);

  const handleEditClientClick = (client: Client) => {
    setEditingClient(client);
    setClientName(client.client_name);
    setIndustry(client.industry);
    setStatus(client.status);
    setStartDate(client.start_date);
    setPriority(client.priority || 'Medium');
    setIsAddingClient(false);
  };

  const handleCreateClientClick = () => {
    setEditingClient(null);
    setClientName('');
    setIndustry('');
    setStatus('Active');
    setStartDate(new Date().toISOString().split('T')[0]);
    setPriority('Medium');
    setIsAddingClient(true);
  };

  const handleCancelClient = () => {
    setIsAddingClient(false);
    setEditingClient(null);
  };

  const handleSaveClientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    if (!clientName.trim() || !industry.trim()) {
      alert('Fill all mandatory client details.');
      return;
    }

    onSaveClient({
      id: editingClient?.id,
      client_name: clientName.trim(),
      industry: industry.trim(),
      status,
      start_date: startDate,
      logo_url: clientName.trim().charAt(0).toUpperCase(),
      priority
    });

    handleCancelClient();
  };

  const handleSavePackageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    if (!selectedClientId) {
      alert('Select a valid client first.');
      return;
    }

    const matchPkg = packages.find(
      p => p.client_id === selectedClientId && p.month === month && p.year === year && !p.is_deleted
    );

    onSavePackage({
      id: matchPkg?.id,
      client_id: selectedClientId,
      month,
      year,
      posters_target: Number(posters),
      reels_target: Number(reels),
      video_target: Number(videos),
      ads_target: Number(ads),
      blogs_target: Number(blogs),
      content_target: Number(content),
      scripts_target: Number(scripts),
      website_updates_target: Number(website)
    });

    alert('Monthly targets saved successfully.');
  };

  // --- Users management handlers ---
  const handleEditUserClick = (u: User) => {
    setEditingUser(u);
    setUserName(u.name);
    setUserEmail(u.email);
    setUserRoleLocal(u.role);
    setIsAddingUser(false);
  };

  const handleCreateUserClick = () => {
    setEditingUser(null);
    setUserName('');
    setUserEmail('');
    setUserRoleLocal('Manager');
    setIsAddingUser(true);
  };

  const handleCancelUser = () => {
    setIsAddingUser(false);
    setEditingUser(null);
  };

  const handleSaveUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!userName.trim() || !userEmail.trim()) {
      alert('Please fill out all user information fields.');
      return;
    }

    onSaveUser({
      id: editingUser?.id,
      name: userName.trim(),
      email: userEmail.trim(),
      role: userRoleLocal
    });

    handleCancelUser();
  };

  // Trigger Confirmation Modal for Deletions
  const triggerDeleteConfirmation = (type: 'client' | 'user', id: string, name: string) => {
    setDeleteTargetType(type);
    setDeleteTargetId(id);
    setDeleteTargetName(name);
    setDeleteModalOpen(true);
  };

  const executeConfirmedDelete = () => {
    if (deleteTargetType === 'client') {
      onDeleteClient(deleteTargetId);
    } else {
      onDeleteUser(deleteTargetId);
    }
    setDeleteModalOpen(false);
  };

  if (!isAdmin) {
    return (
      <div className="bg-white border border-gray-200 p-8 text-center max-w-lg mx-auto my-12 space-y-4">
        <ShieldAlert className="w-10 h-10 text-red-650 text-red-600 mx-auto" />
        <h3 className="text-sm font-bold text-black font-mono uppercase tracking-wider">ACCESS RESTRICTED — AUDITOR LEVEL</h3>
        <p className="text-xs text-gray-500 leading-relaxed font-sans">
          You are currently logged in as a <strong className="text-black">Social Media Manager</strong>. Managing client lifecycles, resetting databases, and configuring monthly targets is restricted to the <strong className="text-black">Admin (Agency Owner)</strong> role to protect target audit logs.
        </p>
        {onToggleRole && (
          <button
            type="button"
            onClick={onToggleRole}
            className="w-full mt-2 bg-black hover:bg-neutral-800 text-white font-bold py-2 px-4 rounded text-xs font-mono uppercase tracking-wider cursor-pointer transition-colors shadow-xs"
          >
            Switch to Admin (Agency Owner) Role
          </button>
        )}
        <p className="text-[10px] text-gray-400 font-mono uppercase tracking-wider block pt-2 border-t border-gray-100">
          Or toggle the active role in the desktop sidebar OS Controls list or mobile hamburger menu.
        </p>
      </div>
    );
  }

  // Filter lists based on showArchived soft-delete state
  const renderedClients = showArchived 
    ? clients 
    : clients.filter(c => !c.is_deleted);

  const renderedUsers = showArchived 
    ? users 
    : users.filter(u => !u.is_deleted);

  return (
    <div className="bg-white border border-gray-200 rounded overflow-hidden font-sans">
      
      {/* Sub-panel Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        title={`DELETE RETRIEVAL VERIFICATION`}
        message={`Are you sure you want to delete ${deleteTargetName}? This will instantly archive the data and mark it as soft-deleted in our Firestore data layer.`}
        onConfirm={executeConfirmedDelete}
        onCancel={() => setDeleteModalOpen(false)}
      />

      {/* Tab Switcher Headers matching navigation parameters */}
      <div className="flex bg-gray-50 border-b border-gray-200 p-1 flex-wrap">
        <button
          onClick={() => setActiveTab('clients')}
          className={`flex-1 min-w-[120px] py-2 text-[11px] font-bold font-mono rounded transition-all ${
            activeTab === 'clients' 
              ? 'bg-black text-white' 
              : 'text-gray-500 hover:text-black'
          }`}
        >
          CLIENT DIRECTORY
        </button>
        <button
          onClick={() => setActiveTab('packages')}
          className={`flex-1 min-w-[120px] py-2 text-[11px] font-bold font-mono rounded transition-all ${
            activeTab === 'packages' 
              ? 'bg-black text-white' 
              : 'text-gray-500 hover:text-black'
          }`}
        >
          MONTH RECONCILIATION TARGETS
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`flex-1 min-w-[120px] py-2 text-[11px] font-bold font-mono rounded transition-all ${
            activeTab === 'users' 
              ? 'bg-black text-white' 
              : 'text-gray-500 hover:text-black'
          }`}
        >
          OPERATIONAL STAFF (USERS)
        </button>
      </div>

      <div className="p-6">
        
        {/* Soft-delete toggles checkbox in header */}
        {activeTab !== 'packages' && (
          <div className="flex justify-end mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded border-gray-300 text-black focus:ring-black h-3.5 w-3.5"
              />
              <span className="text-[10px] uppercase font-mono font-bold text-gray-400">Show soft-deleted / archived records</span>
            </label>
          </div>
        )}

        {activeTab === 'clients' ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-gray-200 gap-3">
              <div>
                <h3 className="text-xs font-bold text-black font-mono uppercase tracking-wide">CLIENT MANAGEMENT</h3>
                <p className="text-[11px] text-gray-400 font-sans mt-0.5">Control live retainer contracts, start-dates, and priorities</p>
              </div>
              {!isAddingClient && !editingClient && (
                <button
                  onClick={handleCreateClientClick}
                  className="px-3 py-1.5 bg-black hover:bg-neutral-800 text-white text-xs rounded border hover:border-black flex items-center gap-1 font-mono transition-colors font-bold cursor-pointer border-black shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> ADD CLIENT CONTRACT
                </button>
              )}
            </div>

            {/* Editing / Creating Form Container */}
            {(isAddingClient || editingClient) && (
              <form onSubmit={handleSaveClientSubmit} className="bg-gray-50 p-5 rounded border border-gray-200 space-y-4">
                <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                  <h4 className="text-xs font-bold font-mono text-black uppercase">
                    {editingClient ? 'EDIT REGISTER PROFILE' : 'REGISTER NEW PARTNER CONTRACT'}
                  </h4>
                  <button type="button" onClick={handleCancelClient} className="text-gray-400 hover:text-black">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono mb-1">CONTRACT NAME *</label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="e.g. Acme Dentistry Corp"
                      className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-sans font-semibold text-black"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono mb-1">INDUSTRY SECTOR *</label>
                    <input
                      type="text"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      placeholder="e.g. Healthcare & Medical"
                      className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-sans font-semibold text-black"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono mb-1">CONTRACT STATUS</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ClientStatus)}
                      className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-mono font-bold"
                    >
                      <option value="Active">Active</option>
                      <option value="Paused">Paused</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono mb-1">CONTRACT START DATE</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-mono font-bold"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono mb-1">PRIORITY BAND</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as any)}
                      className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-mono font-bold"
                    >
                      <option value="Low">Low Priority</option>
                      <option value="Medium">Medium Priority</option>
                      <option value="High">High Priority</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCancelClient}
                    className="px-4 py-2 bg-white border border-gray-202 bg-neutral-100 hover:bg-neutral-200 text-black rounded text-xs font-bold font-mono transition"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-black border border-black text-white rounded text-xs flex items-center gap-1 font-mono font-bold hover:bg-neutral-850 transition shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5" /> SAVE CONTRACT
                  </button>
                </div>
              </form>
            )}

            {/* Clients Listing Grid */}
            <div className="space-y-4">
              {renderedClients.length === 0 ? (
                <div className="text-center text-xs font-mono py-12 border border-gray-150 border-dashed text-gray-400 rounded">
                  NO CLIENT PARTNERS FOUND IN DATABASE
                </div>
              ) : (
                renderedClients.map(client => (
                  <div
                    key={client.id}
                    className={`border p-4 rounded flex flex-col md:flex-row justify-between items-start md:items-center hover:border-gray-400 transition-colors bg-white gap-4 ${
                      client.is_deleted ? 'border-dashed border-red-200 opacity-60 bg-red-50/25' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-black border border-gray-300 flex items-center justify-center font-bold text-white font-mono text-sm shadow-xs">
                        {client.logo_url}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-black">{client.client_name}</h4>
                          <span className={`text-[9px] uppercase font-mono px-1.5 py-0.2 rounded font-bold border ${
                            client.status === 'Active' 
                              ? 'bg-green-50 text-green-700 border-green-100' 
                              : client.status === 'Paused'
                              ? 'bg-amber-50 text-amber-700 border-amber-100'
                              : 'bg-gray-100 text-gray-500 border border-gray-200'
                          }`}>
                            {client.status}
                          </span>
                          {client.priority === 'High' && (
                            <span className="text-[9px] bg-red-50 border border-red-100 text-red-650 font-mono px-1.5 py-0.2 rounded uppercase font-bold tracking-tighter">
                              VIP RETR
                            </span>
                          )}
                          {client.is_deleted && (
                            <span className="text-[9px] bg-red-600 border border-red-700 text-white font-mono px-1.5 py-0.2 rounded uppercase font-bold tracking-tighter">
                              SOFT DELETED
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 font-sans mt-0.5">{client.industry.toUpperCase()} • COMMENCED {client.start_date}</p>
                      </div>
                    </div>

                    <div className="flex gap-2 self-stretch md:self-auto justify-end">
                      {client.is_deleted ? (
                        <button
                          onClick={() => onRestoreClient(client.id)}
                          className="p-1 px-3 text-xs text-emerald-700 hover:bg-emerald-50 border border-emerald-250 border-emerald-200 rounded flex items-center gap-1 transition-all cursor-pointer font-bold font-mono"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> RESTORE CONTRACT
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEditClientClick(client)}
                            className="p-1 px-3 text-xs text-gray-550 hover:text-black rounded border border-gray-200 hover:bg-gray-50 flex items-center gap-1 transition-all cursor-pointer font-bold font-mono"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> MODIFY
                          </button>
                          <button
                            onClick={() => triggerDeleteConfirmation('client', client.id, client.client_name)}
                            type="button"
                            className="p-1 px-3 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 border border-transparent rounded flex items-center gap-1 transition-all cursor-pointer font-bold font-mono"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> REMOVE
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : activeTab === 'packages' ? (
          <div className="space-y-6">
            <div className="pb-3 border-b border-gray-200 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
              <div>
                <h3 className="text-xs font-bold text-black font-mono uppercase tracking-wide">CLIENT RETAINER DEFINITION</h3>
                <p className="text-[11px] text-gray-400 font-sans mt-0.5">Determine monthly deliverables targets to measure real-time fulfillment</p>
              </div>

              {/* Filtering / Client Select */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="bg-white border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-black font-sans font-bold"
                >
                  <option value="" disabled>Select client...</option>
                  {clients.filter(c => !c.is_deleted).map(c => (
                    <option key={c.id} value={c.id}>{c.client_name.toUpperCase()}</option>
                  ))}
                </select>

                <div className="flex items-center gap-1">
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="bg-white border border-gray-200 rounded px-2.5 py-1.5 text-xs font-mono font-bold focus:outline-none"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                      <option key={m} value={m}>{new Date(2026, m-1).toLocaleString('default', { month: 'short' }).toUpperCase()}</option>
                    ))}
                  </select>

                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="bg-white border border-gray-200 rounded px-2.5 py-1.5 text-xs font-mono font-bold focus:outline-none"
                  >
                    {[2025, 2026, 2027].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Target Values input Grid */}
            <form onSubmit={handleSavePackageSubmit} className="space-y-6">
              <div className="bg-white rounded border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-2 mb-0 bg-gray-50 border-b border-gray-200 p-4">
                  <Calendar className="w-4 h-4 text-black" />
                  <span className="text-xs font-bold font-mono text-black uppercase">
                    SLA METRICS: {clients.find(c => c.id === selectedClientId)?.client_name || 'SELECT CLIENT'} (MONTH: {new Date(2026, month-1).toLocaleString('default', { month: 'long' }).toUpperCase()} {year})
                  </span>
                </div>

                <div className="p-6 space-y-6">
                  {selectedClientId ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono">Posters SLA Target</label>
                          <input
                            type="number"
                            min={0}
                            value={posters}
                            onChange={(e) => setPosters(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-white border border-gray-200 rounded mt-1.5 px-3 py-2 text-xs font-mono focus:outline-none focus:border-black font-semibold text-black"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono">Reels SLA Target</label>
                          <input
                            type="number"
                            min={0}
                            value={reels}
                            onChange={(e) => setReels(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-white border border-gray-200 rounded mt-1.5 px-3 py-2 text-xs font-mono focus:outline-none focus:border-black font-semibold text-black"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono">Videos SLA Target</label>
                          <input
                            type="number"
                            min={0}
                            value={videos}
                            onChange={(e) => setVideos(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-white border border-gray-200 rounded mt-1.5 px-3 py-2 text-xs font-mono focus:outline-none focus:border-black font-semibold text-black"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono">Ads SLA Target</label>
                          <input
                            type="number"
                            min={0}
                            value={ads}
                            onChange={(e) => setAds(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-white border border-gray-200 rounded mt-1.5 px-3 py-2 text-xs font-mono focus:outline-none focus:border-black font-semibold text-black"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono">Blogs SLA Target</label>
                          <input
                            type="number"
                            min={0}
                            value={blogs}
                            onChange={(e) => setBlogs(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-white border border-gray-200 rounded mt-1.5 px-3 py-2 text-xs font-mono focus:outline-none focus:border-black font-semibold text-black"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono">Content SLA Target</label>
                          <input
                            type="number"
                            min={0}
                            value={content}
                            onChange={(e) => setContent(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-white border border-gray-200 rounded mt-1.5 px-3 py-2 text-xs font-mono focus:outline-none focus:border-black font-semibold text-black"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono">Scripts SLA Target</label>
                          <input
                            type="number"
                            min={0}
                            value={scripts}
                            onChange={(e) => setScripts(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-white border border-gray-200 rounded mt-1.5 px-3 py-2 text-xs font-mono focus:outline-none focus:border-black font-semibold text-black"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono">Web SLA Target</label>
                          <input
                            type="number"
                            min={0}
                            value={website}
                            onChange={(e) => setWebsite(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-white border border-gray-200 rounded mt-1.5 px-3 py-2 text-xs font-mono focus:outline-none focus:border-black font-semibold text-black"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center font-mono py-8 text-xs text-gray-400">
                      SELECT A REGISTERED CONTRACT CLIENT FIRST TO VIEW OR EDIT RETENTION METRICS
                    </div>
                  )}
                </div>
              </div>

              {selectedClientId && (
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-black hover:bg-neutral-800 text-white rounded text-xs font-bold font-mono flex items-center gap-1.5 transition-all shadow-xs border border-white hover:border-black cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" /> SAVE MONTHLY RETAINER SLA TARGETS
                  </button>
                </div>
              )}
            </form>
          </div>
        ) : (
          /* USERS Tab Content */
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-gray-200 gap-3">
              <div>
                <h3 className="text-xs font-bold text-black font-mono uppercase tracking-wide">OPERATIONAL STAFF (USERS)</h3>
                <p className="text-[11px] text-gray-400 font-sans mt-0.5">Control agency members, specific logging authorizations and credentials</p>
              </div>
              {!isAddingUser && !editingUser && (
                <button
                  onClick={handleCreateUserClick}
                  className="px-3 py-1.5 bg-black hover:bg-neutral-800 text-white text-xs rounded border hover:border-black flex items-center gap-1 font-mono transition-colors font-bold cursor-pointer border-black shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> REGISTER TEAM OPERATOR
                </button>
              )}
            </div>

            {/* Editing / Creating Form Container for Users */}
            {(isAddingUser || editingUser) && (
              <form onSubmit={handleSaveUserSubmit} className="bg-gray-50 p-5 rounded border border-gray-200 space-y-4">
                <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                  <h4 className="text-xs font-bold font-mono text-black uppercase">
                    {editingUser ? 'MODIFY OPERATOR ROLE' : 'REGISTER NEW OPERATOR'}
                  </h4>
                  <button type="button" onClick={handleCancelUser} className="text-gray-400 hover:text-black">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono mb-1">OPERATOR FULL NAME *</label>
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="e.g. Sarah Connor"
                      className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-sans font-semibold text-black"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono mb-1">EMAIL ADDRESS *</label>
                    <input
                      type="email"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      placeholder="e.g. sarah@agency.com"
                      className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-sans font-semibold text-black"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono mb-1">SYSTEM ROLE</label>
                    <select
                      value={userRoleLocal}
                      onChange={(e) => setUserRoleLocal(e.target.value as UserRole)}
                      className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-mono font-bold"
                    >
                      <option value="Admin">Admin (Agency Owner)</option>
                      <option value="Manager">Social Media Manager</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCancelUser}
                    className="px-4 py-2 bg-white border border-gray-202 bg-neutral-100 hover:bg-neutral-200 text-black rounded text-xs font-bold font-mono transition"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-black border border-black text-white rounded text-xs flex items-center gap-1 font-mono font-bold hover:bg-neutral-850 transition shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5" /> SAVE OPERATOR
                  </button>
                </div>
              </form>
            )}

            {/* Users Listing Grid */}
            <div className="space-y-4">
              {renderedUsers.length === 0 ? (
                <div className="text-center text-xs font-mono py-12 border border-gray-150 border-dashed text-gray-400 rounded">
                  NO USERS FOUND IN OPERATIONS DIRECTORY
                </div>
              ) : (
                renderedUsers.map(u => (
                  <div
                    key={u.id}
                    className={`border p-4 rounded flex flex-col md:flex-row justify-between items-start md:items-center hover:border-gray-400 transition-colors bg-white gap-4 ${
                      u.is_deleted ? 'border-dashed border-red-200 opacity-60 bg-red-50/25' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-neutral-600 text-white flex items-center justify-center font-bold font-mono text-sm shadow-xs border border-gray-200">
                        {u.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-black">{u.name}</h4>
                          <span className={`text-[9px] uppercase font-mono px-1.5 py-0.2 border rounded font-semibold text-neutral-600 bg-neutral-100`}>
                            {u.role}
                          </span>
                          {u.is_deleted && (
                            <span className="text-[9px] bg-red-600 border border-red-700 text-white font-mono px-1.5 py-0.2 rounded uppercase font-bold tracking-tighter">
                              SOFT DELETED
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 font-sans mt-0.5">{u.email} • CREATED AT {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}</p>
                      </div>
                    </div>

                    <div className="flex gap-2 self-stretch md:self-auto justify-end">
                      {u.is_deleted ? (
                        <button
                          onClick={() => onRestoreUser(u.id)}
                          className="p-1 px-3 text-xs text-emerald-700 hover:bg-emerald-50 border border-emerald-250 border-emerald-200 rounded flex items-center gap-1 transition-all cursor-pointer font-bold font-mono"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> RESTORE USER
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEditUserClick(u)}
                            className="p-1 px-3 text-xs text-gray-550 hover:text-black rounded border border-gray-200 hover:bg-gray-50 flex items-center gap-1 transition-all cursor-pointer font-bold font-mono"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> MODIFY
                          </button>
                          <button
                            onClick={() => triggerDeleteConfirmation('user', u.id, u.name)}
                            type="button"
                            className="p-1 px-3 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 border border-transparent rounded flex items-center gap-1 transition-all cursor-pointer font-bold font-mono"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> REMOVE
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
