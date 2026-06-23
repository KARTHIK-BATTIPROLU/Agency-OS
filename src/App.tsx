import React, { useState, useEffect } from 'react';
import { Client, MonthlyPackage, Activity, User, UserRole, Role, Task, Invoice, ACTIVITY_CONFIGS, isWithinAuditRange, getAuditPeriodLabel } from './types';
import Dashboard from './components/Dashboard';
import ActivityForm from './components/ActivityForm';
import ClientPackageConfig from './components/ClientPackageConfig';
import ReportExport from './components/ReportExport';
import Login from './components/Login';
import TasksTab from './components/TasksTab';
import ApprovalsTab from './components/ApprovalsTab';
import InvoicesTab from './components/InvoicesTab';
import { auth } from './firebase';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { apiFetch } from './lib/api';
import {
  Activity as ActivityIcon, Users, FileSpreadsheet, Settings,
  Plus, CheckSquare, Sparkles, LogIn, LogOut, ChevronRight, UserCheck,
  HelpCircle, Menu, X, Landmark, Loader2,
  ListChecks, GitPullRequest, Receipt
} from 'lucide-react';

export default function App() {
  // Remote database states
  const [clients, setClients] = useState<Client[]>([]);
  const [packages, setPackages] = useState<MonthlyPackage[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  // Firebase Authentication state
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reports' | 'config' | 'tasks' | 'approvals' | 'invoices'>('dashboard');
  const [selectedClientForDashboard, setSelectedClientForDashboard] = useState<Client | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number>(6); // June
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [auditMonths, setAuditMonths] = useState<number>(1); // 1 month default range
  const [selectedAssetType, setSelectedAssetType] = useState<string>('All');
  const [isActivityFormOpen, setIsActivityFormOpen] = useState(false);
  const [activityToEdit, setActivityToEdit] = useState<Activity | null>(null);
  const [preselectedClientIdForForm, setPreselectedClientIdForForm] = useState<string | undefined>(undefined);
  const [preselectedClientIdForConfig, setPreselectedClientIdForConfig] = useState<string | undefined>(undefined);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Load all remote data from Firestore via backend APIs
  const loadAllData = async () => {
    try {
      setErrorText('');
      const [clientsRes, packagesRes, activitiesRes, usersRes, rolesRes] = await Promise.all([
        apiFetch('/api/clients/all'), // Get all including soft deleted for restoration
        apiFetch('/api/packages/all'),
        apiFetch('/api/activities/all'),
        apiFetch('/api/users/all'),
        apiFetch('/api/roles')
      ]);

      const failedEndpoints: string[] = [];
      let details = '';

      if (!clientsRes.ok) {
        failedEndpoints.push('clients');
        try { const errJson = await clientsRes.json(); details += ` Clients Error: ${errJson.error || JSON.stringify(errJson)}`; } catch { details += ' Clients failed with non-JSON response.'; }
      }
      if (!packagesRes.ok) {
        failedEndpoints.push('packages');
        try { const errJson = await packagesRes.json(); details += ` Packages Error: ${errJson.error || JSON.stringify(errJson)}`; } catch { details += ' Packages failed with non-JSON response.'; }
      }
      if (!activitiesRes.ok) {
        failedEndpoints.push('activities');
        try { const errJson = await activitiesRes.json(); details += ` Activities Error: ${errJson.error || JSON.stringify(errJson)}`; } catch { details += ' Activities failed with non-JSON response.'; }
      }
      if (!usersRes.ok) {
        failedEndpoints.push('users');
        try { const errJson = await usersRes.json(); details += ` Users Error: ${errJson.error || JSON.stringify(errJson)}`; } catch { details += ' Users failed with non-JSON response.'; }
      }
      if (!rolesRes.ok) {
        failedEndpoints.push('roles');
        try { const errJson = await rolesRes.json(); details += ` Roles Error: ${errJson.error || JSON.stringify(errJson)}`; } catch { details += ' Roles failed with non-JSON response.'; }
      }

      if (failedEndpoints.length > 0) {
        throw new Error(`Failed to load endpoints: ${failedEndpoints.join(', ')}.${details}`);
      }

      const [clientsData, packagesData, activitiesData, usersData, rolesData] = await Promise.all([
        clientsRes.json(),
        packagesRes.json(),
        activitiesRes.json(),
        usersRes.json(),
        rolesRes.json()
      ]);

      setClients(clientsData);
      setPackages(packagesData);
      setActivities(activitiesData);
      setUsers(usersData);
      setRoles(rolesData);

      // Resolve the signed-in identity from MongoDB. The server verifies the
      // Firebase ID token and returns the matching user record (with role).
      // Right after signup, the account-creation call on the login screen may
      // not have finished writing the MongoDB record yet, so a 404 here is
      // retried briefly before being treated as a real failure.
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (idToken) {
          let meRes = await apiFetch('/api/auth/me', { method: 'POST' });
          for (let attempt = 0; !meRes.ok && meRes.status === 404 && attempt < 3; attempt++) {
            await new Promise((r) => setTimeout(r, 350));
            meRes = await apiFetch('/api/auth/me', { method: 'POST' });
          }
          if (meRes.ok) {
            const me = await meRes.json();
            setCurrentUser(me);
            localStorage.setItem('agency_user_id_v2', me.id);
          } else {
            const errJson = await meRes.json().catch(() => ({}));
            throw new Error(errJson.error || 'Failed to resolve user identity.');
          }
        }
      } catch (identityErr: any) {
        console.error('Identity resolution failed', identityErr);
        setErrorText(identityErr.message || 'Could not resolve your account.');
      }

      // Load the MongoDB-backed Tasks & Invoices modules. These are resilient:
      // a failure here must not break the core Firestore-backed dashboard.
      try {
        const [tasksRes, invoicesRes] = await Promise.all([
          apiFetch('/api/tasks/all'),
          apiFetch('/api/invoices/all'),
        ]);
        if (tasksRes.ok) setTasks(await tasksRes.json());
        if (invoicesRes.ok) setInvoices(await invoicesRes.json());
      } catch (moduleErr) {
        console.error('Tasks/Invoices module load failed (non-fatal)', moduleErr);
      }
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || 'Error communicating with full-stack database.');
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to Firebase auth state. Until this resolves we don't know
  // whether to show the login screen or the dashboard.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthChecked(true);
      if (!user) {
        // Signed out: clear the resolved staff record.
        setCurrentUser(null);
      }
    });
    return unsubscribe;
  }, []);

  // Load data once a user is authenticated.
  useEffect(() => {
    if (firebaseUser) {
      setLoading(true);
      loadAllData();
    }
  }, [firebaseUser]);

  // Sign the operator out of Firebase.
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('agency_user_id_v2');
    } catch (err) {
      console.error('Sign out failed', err);
    }
  };

  // Sync chosen logged user identifier inside modern local storage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('agency_user_id_v2', currentUser.id);
    }
  }, [currentUser]);

  // Deliverable Activity actions (Create / Edit)
  const handleSaveActivity = async (activityData: Omit<Activity, 'id' | 'created_at'> & { id?: string, attached_files?: Array<{ file_name: string, file_path: string, storage_path?: string, file_type: string, is_new?: boolean }> }) => {
    try {
      setLoading(true);
      const isEdit = !!activityData.id;
      const response = await apiFetch('/api/activities', {
        method: 'POST',
        body: JSON.stringify(activityData)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Server rejected activity submission.');
      }

      setIsActivityFormOpen(false);
      setActivityToEdit(null);
      await loadAllData();
    } catch (err: any) {
      alert(`Could not log activity: ${err.message}`);
      setLoading(false);
    }
  };

  const handleEditActivityClick = (activity: Activity) => {
    setActivityToEdit(activity);
    setIsActivityFormOpen(true);
  };

  const handleDeleteActivity = async (id: string) => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/activities/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('API request failed');
      }
      await loadAllData();
    } catch (err: any) {
      alert(`Could not remove activity log: ${err.message}`);
      setLoading(false);
    }
  };

  // --- Tasks module actions (MongoDB-backed) ---
  const handleSaveTask = async (taskData: Partial<Task>) => {
    try {
      const payload = { ...taskData, created_by: taskData.created_by || currentUser?.name || 'system' };
      const response = await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Server rejected the task.');
      }
      await loadAllData();
    } catch (err: any) {
      alert(`Could not save task: ${err.message}`);
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      const response = await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('API request failed');
      await loadAllData();
    } catch (err: any) {
      alert(`Could not delete task: ${err.message}`);
    }
  };

  const handleTaskApproval = async (id: string, stage: string, note?: string) => {
    try {
      const response = await apiFetch(`/api/tasks/${id}/approval`, {
        method: 'POST',
        body: JSON.stringify({ stage, note, by: currentUser?.name || 'system' }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Approval update failed.');
      }
      await loadAllData();
    } catch (err: any) {
      alert(`Could not update approval stage: ${err.message}`);
    }
  };

  // --- Invoices module actions (MongoDB-backed) ---
  const handleSaveInvoice = async (invoiceData: Partial<Invoice>) => {
    try {
      const payload = { ...invoiceData, created_by: invoiceData.created_by || currentUser?.name || 'system' };
      const response = await apiFetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Server rejected the invoice.');
      }
      await loadAllData();
    } catch (err: any) {
      alert(`Could not save invoice: ${err.message}`);
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    try {
      const response = await apiFetch(`/api/invoices/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('API request failed');
      await loadAllData();
    } catch (err: any) {
      alert(`Could not delete invoice: ${err.message}`);
    }
  };

  const handleRecordPayment = async (id: string, payment: { amount: number; date?: string; method?: string; note?: string }) => {
    try {
      const response = await apiFetch(`/api/invoices/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify(payment),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Payment could not be recorded.');
      }
      await loadAllData();
    } catch (err: any) {
      alert(`Could not record payment: ${err.message}`);
    }
  };

  // Client actions
  const handleSaveClient = async (clientData: Omit<Client, 'created_at'> & { id?: string }) => {
    try {
      setLoading(true);
      const response = await apiFetch('/api/clients', {
        method: 'POST',
        body: JSON.stringify(clientData)
      });

      if (!response.ok) {
        throw new Error('Client saving error on backend.');
      }

      await loadAllData();
    } catch (err: any) {
      alert(err.message);
      setLoading(false);
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/clients/${clientId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('API deletion failed.');
      }
      await loadAllData();
    } catch (err: any) {
      alert(`Error archiving client contract: ${err.message}`);
      setLoading(false);
    }
  };

  const handleRestoreClient = async (clientId: string) => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/clients/${clientId}/restore`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Restoration failed.');
      }
      await loadAllData();
    } catch (err: any) {
      alert(`Could not restore contract active status: ${err.message}`);
      setLoading(false);
    }
  };

  // SLA Packages actions
  const handleSavePackage = async (packageData: Omit<MonthlyPackage, 'created_at'> & { id?: string }) => {
    try {
      setLoading(true);
      const response = await apiFetch('/api/packages', {
        method: 'POST',
        body: JSON.stringify(packageData)
      });
      if (!response.ok) {
        throw new Error('Monthly Package targets failed to serialize.');
      }
      await loadAllData();
    } catch (err: any) {
      alert(err.message);
      setLoading(false);
    }
  };

  // Staff User actions
  const handleSaveUser = async (userData: { id?: string, name: string, email: string, role: UserRole, password?: string }) => {
    try {
      setLoading(true);
      const isEdit = !!userData.id;
      const url = isEdit ? `/api/users/${userData.id}` : '/api/users';
      const response = await apiFetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(userData)
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Backend could not save user credentials.');
      }
      await loadAllData();
    } catch (err: any) {
      alert(err.message);
      setLoading(false);
    }
  };

  const handleCreateRole = async (name: string) => {
    try {
      setLoading(true);
      const response = await apiFetch('/api/roles', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Could not create role.');
      }
      await loadAllData();
    } catch (err: any) {
      alert(err.message);
      setLoading(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/roles/${roleId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Could not delete role.');
      }
      await loadAllData();
    } catch (err: any) {
      alert(err.message);
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (currentUser?.id === userId) {
      alert('Security lock: You cannot soft-delete your own logged system administrator profile.');
      return;
    }
    try {
      setLoading(true);
      const response = await apiFetch(`/api/users/${userId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('API delete request failed.');
      }
      await loadAllData();
    } catch (err: any) {
      alert(`Could not remove profile: ${err.message}`);
      setLoading(false);
    }
  };

  const handleRestoreUser = async (userId: string) => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/users/${userId}/restore`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('API restoration failed.');
      }
      await loadAllData();
    } catch (err: any) {
      alert(`Could not restore user account state: ${err.message}`);
      setLoading(false);
    }
  };

  // Reset database back to fresh empty starting mode
  const handleResetFailsafe = async () => {
    if (confirm('Failsafe Check: Are you sure you want to restore a fresh empty database? Custom Clients, SLA Metrics, and logged Deliverables will be deleted.')) {
      try {
        setLoading(true);
        const response = await apiFetch('/api/reset', {
          method: 'POST'
        });
        if (!response.ok) {
          throw new Error('Restoration post request unsuccessful.');
        }
        window.location.reload();
      } catch (err: any) {
        alert(`Error: ${err.message}`);
        setLoading(false);
      }
    }
  };

  // Filter lists to only show non-deleted elements in global footers
  const activeClientsOnly = clients.filter(c => !c.is_deleted && c.status === 'Active');
  const activeClientIds = new Set(activeClientsOnly.map(c => c.id));

  const activeActivitiesOnly = activities.filter(a => !a.is_deleted && activeClientIds.has(a.client_id));
  const activePackagesOnly = packages.filter(p => !p.is_deleted && activeClientIds.has(p.client_id));

  // Determine packages and activities for the footer metrics (filterable by the active dashboard drill-down user)
  const footerPackages = selectedClientForDashboard
    ? activePackagesOnly.filter(p => p.client_id === selectedClientForDashboard.id)
    : activePackagesOnly;

  const footerActivities = selectedClientForDashboard
    ? activeActivitiesOnly.filter(a => a.client_id === selectedClientForDashboard.id)
    : activeActivitiesOnly;

  // Precompute dynamic global footer statistics for chosen month range
  const currentMonthPackages = footerPackages.filter(p => 
    isWithinAuditRange(p.month, p.year, selectedMonth, selectedYear, auditMonths)
  );

  const totalPostersTarget = currentMonthPackages.reduce((sum, p) => sum + (p.posters_target || 0), 0);
  const totalReelsTarget = currentMonthPackages.reduce((sum, p) => sum + (p.reels_target || 0), 0);
  const totalBlogsTarget = currentMonthPackages.reduce((sum, p) => sum + (p.blogs_target || 0), 0);

  const totalPostersActive = footerActivities.filter(act => {
    if (act.activity_type !== 'Poster') return false;
    const actDate = new Date(act.activity_date);
    const actMonth = actDate.getMonth() + 1;
    const actYear = actDate.getFullYear();
    return isWithinAuditRange(actMonth, actYear, selectedMonth, selectedYear, auditMonths) && 
           act.stage === (ACTIVITY_CONFIGS['Poster']?.completionStage || 'Uploaded');
  }).length;

  const totalReelsActive = footerActivities.filter(act => {
    if (act.activity_type !== 'Reel') return false;
    const actDate = new Date(act.activity_date);
    const actMonth = actDate.getMonth() + 1;
    const actYear = actDate.getFullYear();
    return isWithinAuditRange(actMonth, actYear, selectedMonth, selectedYear, auditMonths) && 
           act.stage === (ACTIVITY_CONFIGS['Reel']?.completionStage || 'Uploaded');
  }).length;

  const totalBlogsActive = footerActivities.filter(act => {
    if (act.activity_type !== 'Blog') return false;
    const actDate = new Date(act.activity_date);
    const actMonth = actDate.getMonth() + 1;
    const actYear = actDate.getFullYear();
    return isWithinAuditRange(actMonth, actYear, selectedMonth, selectedYear, auditMonths) && 
           act.stage === (ACTIVITY_CONFIGS['Blog']?.completionStage || 'Published');
  }).length;

  // Wait for Firebase to report the current auth state before deciding
  // between the login screen and the dashboard.
  if (!authChecked) {
    return (
      <div className="h-screen w-screen bg-[#F9FAFB] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 text-black animate-spin" />
        <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#111827]">
          Verifying secure session...
        </span>
      </div>
    );
  }

  // Not signed in — render the authentication screen.
  if (!firebaseUser) {
    return <Login />;
  }

  // Elegant full-screen loader layout
  if (loading && clients.length === 0) {
    return (
      <div className="h-screen w-screen bg-[#F9FAFB] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 text-black animate-spin" />
        <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#111827]">
          Resolving Agency Operations OS Cloud Cache...
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen bg-[#F9FAFB] text-[#111827] font-sans overflow-hidden antialiased">
      
      {/* Sidebar Navigation - Left Side Panel for Desktop */}
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col flex-shrink-0">
        {/* Sidebar Header / Branding */}
        <div className="p-6 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 bg-black rounded flex items-center justify-center flex-shrink-0">
            <div className="w-4 h-4 border-2 border-white"></div>
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight uppercase text-[#111827] leading-none font-mono">Agency OS</h1>
            <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block mt-0.5">SLA MONITOR</span>
          </div>
        </div>

        {/* Sidebar Links group */}
        <nav className="flex-1 py-4 space-y-1">
          <div className="px-6 py-2 text-[10px] uppercase tracking-widest text-[#9ca3af] font-bold">Main Feed</div>
          
          <button
            onClick={() => {
              setActiveTab('dashboard');
              setSelectedClientForDashboard(null);
            }}
            className={`w-full flex items-center px-6 py-3 text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'dashboard' 
                ? 'bg-gray-50 border-r-2 border-black text-black' 
                : 'text-gray-500 hover:bg-gray-50 hover:text-black'
            }`}
          >
            <span className="mr-3 text-xs font-mono">{activeTab === 'dashboard' ? '■' : '□'}</span> Dashboard OS
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`w-full flex items-center px-6 py-3 text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'reports' 
                ? 'bg-gray-50 border-r-2 border-black text-black' 
                : 'text-gray-500 hover:bg-gray-50 hover:text-black'
            }`}
          >
            <span className="mr-3 text-xs font-mono">{activeTab === 'reports' ? '■' : '□'}</span> Report Hub
          </button>

          <div className="px-6 py-2 mt-3 text-[10px] uppercase tracking-widest text-[#9ca3af] font-bold">Operations</div>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`w-full flex items-center px-6 py-3 text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'tasks'
                ? 'bg-gray-50 border-r-2 border-black text-black'
                : 'text-gray-500 hover:bg-gray-50 hover:text-black'
            }`}
          >
            <ListChecks className="w-4 h-4 mr-3" /> Tasks
          </button>

          <button
            onClick={() => setActiveTab('approvals')}
            className={`w-full flex items-center px-6 py-3 text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'approvals'
                ? 'bg-gray-50 border-r-2 border-black text-black'
                : 'text-gray-500 hover:bg-gray-50 hover:text-black'
            }`}
          >
            <GitPullRequest className="w-4 h-4 mr-3" /> Approvals
          </button>

          <button
            onClick={() => setActiveTab('invoices')}
            className={`w-full flex items-center px-6 py-3 text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'invoices'
                ? 'bg-gray-50 border-r-2 border-black text-black'
                : 'text-gray-500 hover:bg-gray-50 hover:text-black'
            }`}
          >
            <Receipt className="w-4 h-4 mr-3" /> Invoices
          </button>

          <div className="px-6 py-2 mt-3 text-[10px] uppercase tracking-widest text-[#9ca3af] font-bold">Configuration</div>

          <button
            onClick={() => {
              setPreselectedClientIdForConfig(undefined);
              setActiveTab('config');
            }}
            className={`w-full flex items-center px-6 py-3 text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'config' 
                ? 'bg-gray-50 border-r-2 border-black text-black' 
                : 'text-gray-500 hover:bg-gray-50 hover:text-black'
            }`}
          >
            <span className="mr-3 text-xs font-mono">{activeTab === 'config' ? '■' : '□'}</span> OS Config {currentUser?.role !== 'Admin' && '⏱'}
          </button>

          <div className="px-6 py-6 mt-4 text-[10px] uppercase tracking-widest text-[#9ca3af] font-bold">OS Controls</div>

          <button
            onClick={handleResetFailsafe}
            className="w-full flex items-center px-6 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 text-left transition-all cursor-pointer font-mono font-bold"
          >
            <span className="mr-3">○</span> Delete & Reset DB
          </button>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center px-6 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50 hover:text-black text-left transition-all cursor-pointer font-sans font-bold"
          >
            <LogOut className="w-3.5 h-3.5 mr-3" /> Sign Out
          </button>
        </nav>

        {/* Dynamic add button at bottom of sidebar */}
        <div className="p-6 border-t border-gray-105 border-gray-100">
          <button
            onClick={() => {
              setActivityToEdit(null);
              setPreselectedClientIdForForm(undefined);
              setIsActivityFormOpen(true);
            }}
            className="w-full bg-black hover:bg-gray-900 text-white font-bold py-2.5 px-4 rounded text-sm active:scale-95 transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" /> ADD ACTIVITY
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden h-full">
        
        {/* Mobile Header (Rendered on responsive screen only) */}
        <header className="md:hidden h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0 z-40 sticky top-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white"></div>
            </div>
            <div>
              <h1 className="font-bold text-xs tracking-tight uppercase text-black leading-none font-mono">Agency OS</h1>
              <span className="text-[8px] uppercase tracking-widest text-gray-400 font-bold block">SLA MONITOR</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
               onClick={() => {
                 setActivityToEdit(null);
                 setPreselectedClientIdForForm(undefined);
                 setIsActivityFormOpen(true);
               }}
              className="px-2.5 py-1.5 bg-black hover:bg-gray-900 text-white text-[10px] uppercase font-mono font-bold rounded flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> LOG WORK
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-md hover:bg-gray-50 text-gray-600 border border-gray-200 bg-white"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Mobile Menu Area */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-gray-200 bg-white px-4 py-3 space-y-1 font-mono text-xs shadow-md z-45 flex-shrink-0 divide-y divide-gray-100 animate-fade-in">
            <div className="pb-2 space-y-1">
              <button
                onClick={() => {
                  setActiveTab('dashboard');
                  setSelectedClientForDashboard(null);
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left py-2 px-3 rounded font-bold flex items-center gap-2 ${
                  activeTab === 'dashboard' ? 'bg-gray-50 text-black border-l-2 border-black' : 'text-gray-500'
                }`}
              >
                <span>{activeTab === 'dashboard' ? '■' : '□'}</span> DASHBOARDS FEED
              </button>
              <button
                onClick={() => {
                  setActiveTab('reports');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left py-2 px-3 rounded font-bold flex items-center gap-2 ${
                  activeTab === 'reports' ? 'bg-gray-50 text-black border-l-2 border-black' : 'text-gray-500'
                }`}
              >
                <span>{activeTab === 'reports' ? '■' : '□'}</span> REPORTS HUB
              </button>
              <button
                onClick={() => { setActiveTab('tasks'); setMobileMenuOpen(false); }}
                className={`w-full text-left py-2 px-3 rounded font-bold flex items-center gap-2 ${
                  activeTab === 'tasks' ? 'bg-gray-50 text-black border-l-2 border-black' : 'text-gray-500'
                }`}
              >
                <ListChecks className="w-4 h-4" /> TASKS
              </button>
              <button
                onClick={() => { setActiveTab('approvals'); setMobileMenuOpen(false); }}
                className={`w-full text-left py-2 px-3 rounded font-bold flex items-center gap-2 ${
                  activeTab === 'approvals' ? 'bg-gray-50 text-black border-l-2 border-black' : 'text-gray-500'
                }`}
              >
                <GitPullRequest className="w-4 h-4" /> APPROVALS
              </button>
              <button
                onClick={() => { setActiveTab('invoices'); setMobileMenuOpen(false); }}
                className={`w-full text-left py-2 px-3 rounded font-bold flex items-center gap-2 ${
                  activeTab === 'invoices' ? 'bg-gray-50 text-black border-l-2 border-black' : 'text-gray-500'
                }`}
              >
                <Receipt className="w-4 h-4" /> INVOICES
              </button>
              <button
                onClick={() => {
                  setPreselectedClientIdForConfig(undefined);
                  setActiveTab('config');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left py-2 px-3 rounded font-bold flex items-center gap-2 ${
                  activeTab === 'config' ? 'bg-gray-50 text-black border-l-2 border-black' : 'text-gray-500'
                }`}
              >
                <span>{activeTab === 'config' ? '■' : '□'}</span> SLA CONFIGURATOR {currentUser?.role !== 'Admin' && '⏱'}
              </button>
            </div>
            
            <div className="pt-2 space-y-1">
              <button
                onClick={() => {
                  handleResetFailsafe();
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left py-2 px-3 rounded text-rose-600 flex items-center gap-2 font-mono"
              >
                <span>○</span> Delete & Reset Database
              </button>
            </div>
          </div>
        )}

        {/* Global Header Row - Desktop & Shared Container */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-8 flex-shrink-0 z-30">
          <div className="flex items-center gap-8">
            <div className="text-xs text-gray-400 font-mono tracking-wider">
              <span className="font-bold text-black uppercase font-sans">
                {currentUser?.role === 'Admin' ? 'ADMIN PANEL' : 'MANAGER VIEW'}
              </span> — ACTIVE MONITOR
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Avatar block */}
            <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center border border-gray-300 font-bold font-mono text-xs uppercase flex-shrink-0 shadow-xs">
              {currentUser?.name.substring(0, 2) || 'OP'}
            </div>
            
            <div className="text-xs text-right hidden sm:block">
              <div className="font-bold text-[#111827]">{currentUser?.name || 'Loading user...'}</div>
              <div className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">
                {currentUser?.role === 'Admin' ? 'Agency Owner' : 'Account Manager'}
              </div>
            </div>
          </div>
        </header>

        {/* Scrolling Inner Container Pane */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 bg-[#F9FAFB]">
          
          {errorText && (
            <div className="bg-red-50 border border-red-200 p-4 rounded text-xs font-mono text-red-700 font-semibold flex items-center justify-between">
              <span>Error Connecting Server: {errorText}</span>
              <button onClick={loadAllData} className="underline hover:text-black">RETRY CONNECTION</button>
            </div>
          )}

          {/* Active alerts banner */}
          <div className="bg-white border border-gray-200 p-4 rounded flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse flex-shrink-0"></div>
              <div className="text-xs text-gray-600 font-sans">
                <span className="font-bold text-black uppercase">Failsafe Slate Persistent Service</span> — Real-time performance monitors are active. Added clients and targets synchronize instantly.
              </div>
            </div>
            <button
              onClick={handleResetFailsafe}
              className="text-[10px] font-mono text-gray-400 hover:text-red-700 underline tracking-wider font-bold decoration-dotted cursor-pointer self-end sm:self-auto"
            >
              WIPE ALL DATABASES
            </button>
          </div>

          {/* Activity Entry Dialog / Modal (Retained with identical functionality) */}
          {isActivityFormOpen && currentUser && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded shadow-xl bg-white animate-scale-in">
                <ActivityForm
                  clients={clients}
                  currentRole={currentUser.role}
                  currentUsername={currentUser.name}
                  activityToEdit={activityToEdit}
                  preselectedClientId={preselectedClientIdForForm}
                  onSave={handleSaveActivity}
                  onCancel={() => {
                    setIsActivityFormOpen(false);
                    setActivityToEdit(null);
                    setPreselectedClientIdForForm(undefined);
                  }}
                />
              </div>
            </div>
          )}

          {/* Render Active View content */}
          {activeTab === 'dashboard' && (
            <Dashboard
              clients={clients}
              packages={packages}
              activities={activities}
              onSelectClientDashboard={(client) => setSelectedClientForDashboard(client)}
              selectedClient={selectedClientForDashboard}
              onClearSelectedClient={() => setSelectedClientForDashboard(null)}
              onEditActivity={handleEditActivityClick}
              onDeleteActivity={handleDeleteActivity}
              currentRole={currentUser?.role || 'Guest'}
              onAddActivity={(clientId) => {
                setActivityToEdit(null);
                setPreselectedClientIdForForm(clientId);
                setIsActivityFormOpen(true);
              }}
              onGoToConfig={(clientId) => {
                setPreselectedClientIdForConfig(clientId);
                setActiveTab('config');
              }}
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              selectedYear={selectedYear}
              setSelectedYear={setSelectedYear}
              auditMonths={auditMonths}
              setAuditMonths={setAuditMonths}
              selectedAssetType={selectedAssetType}
              setSelectedAssetType={setSelectedAssetType}
            />
          )}

          {activeTab === 'reports' && (
            <ReportExport
              clients={clients.filter(c => !c.is_deleted)}
              packages={packages.filter(p => !p.is_deleted)}
              activities={activities.filter(a => !a.is_deleted)}
              onAddActivity={(clientId) => {
                setActivityToEdit(null);
                setPreselectedClientIdForForm(clientId);
                setIsActivityFormOpen(true);
              }}
              onGoToConfig={(clientId) => {
                setPreselectedClientIdForConfig(clientId);
                setActiveTab('config');
              }}
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              selectedYear={selectedYear}
              setSelectedYear={setSelectedYear}
              auditMonths={auditMonths}
              setAuditMonths={setAuditMonths}
              selectedAssetType={selectedAssetType}
              setSelectedAssetType={setSelectedAssetType}
            />
          )}

          {activeTab === 'config' && currentUser && (
            <ClientPackageConfig
              clients={clients}
              packages={packages}
              users={users}
              roles={roles}
              currentRole={currentUser.role}
              initialClientId={preselectedClientIdForConfig}
              onSaveClient={handleSaveClient}
              onDeleteClient={handleDeleteClient}
              onRestoreClient={handleRestoreClient}
              onSavePackage={handleSavePackage}
              onSaveUser={handleSaveUser}
              onDeleteUser={handleDeleteUser}
              onRestoreUser={handleRestoreUser}
              onCreateRole={handleCreateRole}
              onDeleteRole={handleDeleteRole}
            />
          )}

          {activeTab === 'tasks' && (
            <TasksTab
              tasks={tasks}
              clients={clients}
              users={users}
              currentUser={currentUser}
              onSaveTask={handleSaveTask}
              onDeleteTask={handleDeleteTask}
            />
          )}

          {activeTab === 'approvals' && (
            <ApprovalsTab
              tasks={tasks}
              clients={clients}
              users={users}
              onApprovalAction={handleTaskApproval}
            />
          )}

          {activeTab === 'invoices' && (
            <InvoicesTab
              invoices={invoices}
              clients={clients}
              currentUser={currentUser}
              onSaveInvoice={handleSaveInvoice}
              onDeleteInvoice={handleDeleteInvoice}
              onRecordPayment={handleRecordPayment}
            />
          )}

        </div>

        {/* Global Footer Stats */}
        <footer className="mt-auto h-12 bg-white border-t border-gray-200 px-4 sm:px-8 flex items-center justify-between flex-shrink-0 z-30">
          <div className="text-[10px] text-gray-400 uppercase tracking-widest font-bold font-mono">
            System Healthy — Last updated: Live Sync
          </div>
          <div className="flex gap-4 sm:gap-6 font-mono text-[10px] font-bold">
            <div className="text-gray-550 text-neutral-500 text-right sm:text-left">
              POSTERS: <span className="text-black">{totalPostersActive}/{totalPostersTarget}</span>
            </div>
            <div className="text-gray-550 text-neutral-500">
              REELS: <span className="text-black">{totalReelsActive}/{totalReelsTarget}</span>
            </div>
            <div className="text-gray-550 text-neutral-500">
              BLOGS: <span className="text-black">{totalBlogsActive}/{totalBlogsTarget}</span>
            </div>
          </div>
        </footer>

      </main>

    </div>
  );
}
