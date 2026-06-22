/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'Admin' | 'Manager';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
  is_deleted?: boolean;
  deleted_at?: string | null;
}

export type ClientStatus = 'Active' | 'Paused' | 'Closed';

export interface Client {
  id: string;
  client_name: string;
  logo_url: string;
  industry: string;
  start_date: string;
  status: ClientStatus;
  created_at: string;
  priority?: 'Low' | 'Medium' | 'High';
  is_deleted?: boolean;
  deleted_at?: string | null;
}

export interface MonthlyPackage {
  id: string;
  client_id: string;
  month: number; // 1 to 12
  year: number; // e.g. 2026
  
  // Targets
  posters_target: number;
  reels_target: number;
  video_target: number;
  ads_target: number;
  blogs_target: number;
  content_target: number;
  scripts_target: number;
  website_updates_target: number;
  
  created_at: string;
  is_deleted?: boolean;
  deleted_at?: string | null;
}

export type ActivityType = 
  | 'Poster' 
  | 'Reel' 
  | 'Video Editing' 
  | 'Ad Campaign' 
  | 'Blog' 
  | 'Content Writing' 
  | 'Script Writing' 
  | 'Website Update';

export interface ActivityFile {
  id: string;
  activity_id: string;
  file_name: string;
  file_path: string;
  storage_path?: string;
  file_type: string;
  uploaded_at: string;
}

export interface Activity {
  id: string;
  activity_id_code?: string; // Auto-generated unique format: ACT-2026-NNNN
  client_id: string;
  activity_type: ActivityType;
  sub_type?: string; 
  stage: string; 
  title: string;
  description: string;
  drive_link: string;
  activity_date: string;
  created_by: string; 
  remarks?: string;
  created_at: string;
  is_deleted?: boolean;
  deleted_at?: string | null;

  files?: ActivityFile[]; // List of attached files

  // Custom fields dependent on type
  blog_title?: string;
  blog_url?: string;
  
  // Future proof fields
  client_feedback?: string;
  approval_status?: 'Pending' | 'Approved' | 'Changes Requested';
  priority?: 'Low' | 'Medium' | 'High';
  estimated_completion?: string;
}

// Activity configs for validation and stages
export interface ActivityTypeConfig {
  type: ActivityType;
  label: string;
  stages: string[];
  completionStage: string;
  subTypes?: string[];
}

export const ACTIVITY_CONFIGS: Record<ActivityType, ActivityTypeConfig> = {
  'Poster': {
    type: 'Poster',
    label: 'Poster',
    stages: ['Designed', 'Uploaded'],
    completionStage: 'Uploaded'
  },
  'Reel': {
    type: 'Reel',
    label: 'Reel',
    stages: ['Edited', 'Uploaded'],
    completionStage: 'Uploaded'
  },
  'Video Editing': {
    type: 'Video Editing',
    label: 'Video Editing',
    stages: ['Editing Started', 'Completed', 'Delivered'],
    completionStage: 'Delivered'
  },
  'Ad Campaign': {
    type: 'Ad Campaign',
    label: 'Ad Campaign',
    stages: ['Created', 'Launched', 'Optimized'],
    completionStage: 'Launched'
  },
  'Blog': {
    type: 'Blog',
    label: 'Blog',
    stages: ['Topic Assigned', 'Written', 'Submitted', 'Published'],
    completionStage: 'Published'
  },
  'Content Writing': {
    type: 'Content Writing',
    label: 'Content Writing',
    stages: ['Draft Created', 'Submitted', 'Approved', 'Published'],
    completionStage: 'Published'
  },
  'Script Writing': {
    type: 'Script Writing',
    label: 'Script Writing',
    stages: ['Draft Created', 'Submitted', 'Approved', 'Published'],
    completionStage: 'Published'
  },
  'Website Update': {
    type: 'Website Update',
    label: 'Website Update',
    subTypes: ['Website Activity'],
    stages: ['Completed'],
    completionStage: 'Completed'
  }
};

export function isWithinAuditRange(
  targetMonth: number,
  targetYear: number,
  startMonth: number,
  startYear: number,
  durationMonths: number
): boolean {
  const startAbs = startYear * 12 + (startMonth - 1);
  const targetAbs = targetYear * 12 + (targetMonth - 1);
  const endAbs = startAbs + durationMonths - 1;
  return targetAbs >= startAbs && targetAbs <= endAbs;
}

export function getAuditPeriodLabel(startMonth: number, startYear: number, durationMonths: number): string {
  if (durationMonths === 1) {
    const date = new Date(startYear, startMonth - 1);
    return date.toLocaleString('default', { month: 'long' }).toUpperCase() + ' ' + startYear;
  }
  const startDate = new Date(startYear, startMonth - 1);
  const totalMonths = startYear * 12 + (startMonth - 1) + durationMonths - 1;
  const endYear = Math.floor(totalMonths / 12);
  const endMonth = totalMonths % 12;
  const endDate = new Date(endYear, endMonth);
  
  const startStr = startDate.toLocaleString('default', { month: 'short' }).toUpperCase() + ' ' + startYear;
  const endStr = endDate.toLocaleString('default', { month: 'short' }).toUpperCase() + ' ' + endYear;
  return `${startStr} — ${endStr} (${durationMonths} MONTHS)`;
}

// =====================================================================
// TASK MANAGEMENT + APPROVAL WORKFLOW
// =====================================================================

export type TaskStatus = 'To Do' | 'In Progress' | 'Blocked' | 'Done';
export type TaskPriority = 'Low' | 'Medium' | 'High';
export type ApprovalStage =
  | 'Draft'
  | 'Internal Review'
  | 'Sent to Client'
  | 'Revision Requested'
  | 'Approved'
  | 'Published';

export const TASK_STATUSES: TaskStatus[] = ['To Do', 'In Progress', 'Blocked', 'Done'];
export const TASK_PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High'];

// Ordered linear pipeline. 'Revision Requested' is a side branch reachable
// from review/client stages but does not sit between Approved/Published.
export const APPROVAL_STAGES: ApprovalStage[] = [
  'Draft',
  'Internal Review',
  'Sent to Client',
  'Revision Requested',
  'Approved',
  'Published',
];

export interface ApprovalEvent {
  stage: ApprovalStage;
  by: string; // user name or id
  at: string; // ISO timestamp
  note?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  client_id?: string;
  assignee_id?: string; // User.id
  due_date?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dependencies?: string[]; // Task.id[]
  approval_stage: ApprovalStage;
  approval_history?: ApprovalEvent[];
  created_by: string;
  created_at: string;
  is_deleted?: boolean;
  deleted_at?: string | null;
}

// Forward progression through the main pipeline (skips the Revision branch).
const MAIN_FLOW: ApprovalStage[] = [
  'Draft',
  'Internal Review',
  'Sent to Client',
  'Approved',
  'Published',
];

export function nextApprovalStage(stage: ApprovalStage): ApprovalStage | null {
  // From a revision request, the work re-enters internal review.
  if (stage === 'Revision Requested') return 'Internal Review';
  const idx = MAIN_FLOW.indexOf(stage);
  if (idx === -1 || idx === MAIN_FLOW.length - 1) return null;
  return MAIN_FLOW[idx + 1];
}

export function prevApprovalStage(stage: ApprovalStage): ApprovalStage | null {
  const idx = MAIN_FLOW.indexOf(stage);
  if (idx <= 0) return null;
  return MAIN_FLOW[idx - 1];
}

// =====================================================================
// INVOICING + PAYMENTS
// =====================================================================

export type InvoiceStatus = 'Draft' | 'Sent' | 'Partially Paid' | 'Paid' | 'Overdue';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface Payment {
  id: string;
  amount: number;
  date: string;
  method?: string;
  note?: string;
}

export interface Invoice {
  id: string;
  invoice_number: string; // INV-2026-0001
  client_id: string;
  issue_date: string;
  due_date: string;
  line_items: InvoiceLineItem[];
  tax_percent?: number;
  status: InvoiceStatus;
  payments: Payment[];
  notes?: string;
  created_by: string;
  created_at: string;
  is_deleted?: boolean;
  deleted_at?: string | null;
}

export interface InvoiceTotals {
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
}

export function computeInvoiceTotals(inv: Pick<Invoice, 'line_items' | 'tax_percent' | 'payments'>): InvoiceTotals {
  const subtotal = (inv.line_items || []).reduce(
    (sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.unit_price) || 0),
    0
  );
  const tax = subtotal * ((Number(inv.tax_percent) || 0) / 100);
  const total = subtotal + tax;
  const paid = (inv.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const balance = Math.max(0, total - paid);
  return { subtotal, tax, total, paid, balance };
}

// Derives the live status. A non-Draft invoice with an outstanding balance
// past its due date is Overdue; otherwise status follows the paid amount.
export function deriveInvoiceStatus(inv: Invoice): InvoiceStatus {
  if (inv.status === 'Draft') return 'Draft';
  const { total, paid, balance } = computeInvoiceTotals(inv);
  if (total > 0 && balance <= 0) return 'Paid';
  if (paid > 0) return 'Partially Paid';
  if (inv.due_date && new Date(inv.due_date) < new Date()) return 'Overdue';
  return 'Sent';
}

export function formatINR(amount: number): string {
  return '₹' + (Number(amount) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const ASSET_KEYS: Record<ActivityType, keyof MonthlyPackage> = {
  'Poster': 'posters_target',
  'Reel': 'reels_target',
  'Video Editing': 'video_target',
  'Ad Campaign': 'ads_target',
  'Blog': 'blogs_target',
  'Content Writing': 'content_target',
  'Script Writing': 'scripts_target',
  'Website Update': 'website_updates_target'
};
