import React, { useMemo, useState } from 'react';
import {
  Invoice, InvoiceLineItem, InvoiceStatus, Client, User,
  computeInvoiceTotals, deriveInvoiceStatus, formatINR,
} from '../types';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import { Plus, X, Check, Edit3, Trash2, Receipt, IndianRupee, Trash } from 'lucide-react';

interface InvoicesTabProps {
  invoices: Invoice[];
  clients: Client[];
  currentUser: User | null;
  onSaveInvoice: (inv: Partial<Invoice>) => void;
  onDeleteInvoice: (id: string) => void;
  onRecordPayment: (id: string, payment: { amount: number; date?: string; method?: string; note?: string }) => void;
}

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  'Draft': 'bg-gray-100 text-gray-600 border-gray-200',
  'Sent': 'bg-blue-50 text-blue-700 border-blue-100',
  'Partially Paid': 'bg-amber-50 text-amber-700 border-amber-100',
  'Paid': 'bg-green-50 text-green-700 border-green-100',
  'Overdue': 'bg-rose-50 text-rose-700 border-rose-100',
};

const LABEL = 'block text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1 font-mono';
const INPUT = 'w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-sans';

export default function InvoicesTab({ invoices, clients, currentUser, onSaveInvoice, onDeleteInvoice, onRecordPayment }: InvoicesTabProps) {
  const activeInvoices = useMemo(() => invoices.filter(i => !i.is_deleted), [invoices]);
  const isAdmin = currentUser?.role === 'Admin';

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);

  const clientName = (id?: string) => clients.find(c => c.id === id)?.client_name || '—';

  // Summary metrics
  const summary = useMemo(() => {
    let outstanding = 0, paid = 0, overdue = 0;
    for (const inv of activeInvoices) {
      const { balance, paid: p } = computeInvoiceTotals(inv);
      paid += p;
      if (deriveInvoiceStatus(inv) === 'Overdue') overdue += balance;
      else outstanding += balance;
    }
    return { outstanding, paid, overdue };
  }, [activeInvoices]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Receipt className="w-5 h-5 text-black" />
          <div>
            <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-black">Invoices & Payments</h2>
            <p className="text-[11px] text-gray-400 font-sans">Billing, payment tracking and outstanding revenue.</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing(null); setIsFormOpen(true); }}
          className="px-4 py-2 bg-black hover:bg-neutral-800 text-white rounded text-xs font-bold font-mono flex items-center gap-1.5 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> NEW INVOICE
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="Total Outstanding" value={formatINR(summary.outstanding)} accent="text-blue-700" />
        <SummaryCard label="Collected" value={formatINR(summary.paid)} accent="text-green-700" />
        <SummaryCard label="Overdue" value={formatINR(summary.overdue)} accent="text-rose-700" />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-800">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-400 font-mono uppercase text-[10px] font-bold">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-3">Client</th>
                <th className="py-3 px-3">Issued</th>
                <th className="py-3 px-3">Due</th>
                <th className="py-3 px-3 text-right">Total</th>
                <th className="py-3 px-3 text-right">Balance</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeInvoices.length === 0 && (
                <tr><td colSpan={8} className="py-10 text-center text-gray-400 font-mono text-xs uppercase tracking-wider">No invoices yet.</td></tr>
              )}
              {activeInvoices.map(inv => {
                const { total, balance } = computeInvoiceTotals(inv);
                const status = deriveInvoiceStatus(inv);
                return (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors align-middle group">
                    <td className="py-3 px-4 font-mono font-bold text-[#111827]">{inv.invoice_number}</td>
                    <td className="py-3 px-3 text-gray-600">{clientName(inv.client_id)}</td>
                    <td className="py-3 px-3 font-mono text-[11px] text-gray-500">{inv.issue_date || '—'}</td>
                    <td className="py-3 px-3 font-mono text-[11px] text-gray-500">{inv.due_date || '—'}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold">{formatINR(total)}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatINR(balance)}</td>
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${STATUS_BADGE[status]}`}>{status}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                        {balance > 0 && (
                          <button onClick={() => setPayTarget(inv)} className="p-1 px-2 text-xs text-green-700 hover:bg-green-50 rounded border border-green-200 flex items-center gap-1 font-bold font-mono">
                            <IndianRupee className="w-3.5 h-3.5" /> PAY
                          </button>
                        )}
                        <button onClick={() => { setEditing(inv); setIsFormOpen(true); }} className="p-1 px-2 text-xs text-gray-500 hover:text-black rounded border border-gray-200 hover:bg-gray-50 flex items-center gap-1 font-bold font-mono">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && (
                          <button onClick={() => setDeleteTarget(inv)} className="p-1 px-2 text-xs text-red-600 hover:bg-red-50 border border-transparent rounded flex items-center gap-1 font-bold font-mono">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isFormOpen && (
        <InvoiceFormModal
          invoice={editing}
          clients={clients}
          onCancel={() => setIsFormOpen(false)}
          onSave={(data) => { onSaveInvoice(data); setIsFormOpen(false); }}
        />
      )}

      {payTarget && (
        <PaymentModal
          invoice={payTarget}
          onCancel={() => setPayTarget(null)}
          onSubmit={(payment) => { onRecordPayment(payTarget.id, payment); setPayTarget(null); }}
        />
      )}

      <DeleteConfirmationModal
        isOpen={!!deleteTarget}
        title="Remove Invoice"
        message={`Delete invoice ${deleteTarget?.invoice_number}? This soft-deletes it.`}
        onConfirm={() => { if (deleteTarget) onDeleteInvoice(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded p-4">
      <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold font-mono">{label}</div>
      <div className={`text-xl font-bold font-mono mt-1 ${accent}`}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Create / Edit invoice modal with a line-items editor
// ---------------------------------------------------------------------
interface InvoiceFormModalProps {
  invoice: Invoice | null;
  clients: Client[];
  onCancel: () => void;
  onSave: (data: Partial<Invoice>) => void;
}

function InvoiceFormModal({ invoice, clients, onCancel, onSave }: InvoiceFormModalProps) {
  const [clientId, setClientId] = useState(invoice?.client_id || '');
  const [issueDate, setIssueDate] = useState(invoice?.issue_date || new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(invoice?.due_date || '');
  const [taxPercent, setTaxPercent] = useState<number>(invoice?.tax_percent ?? 18);
  const [status, setStatus] = useState<InvoiceStatus>(invoice?.status || 'Draft');
  const [notes, setNotes] = useState(invoice?.notes || '');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(
    invoice?.line_items?.length ? invoice.line_items : [{ description: '', quantity: 1, unit_price: 0 }]
  );

  const updateItem = (idx: number, patch: Partial<InvoiceLineItem>) => {
    setLineItems(prev => prev.map((li, i) => i === idx ? { ...li, ...patch } : li));
  };
  const addItem = () => setLineItems(prev => [...prev, { description: '', quantity: 1, unit_price: 0 }]);
  const removeItem = (idx: number) => setLineItems(prev => prev.filter((_, i) => i !== idx));

  const totals = computeInvoiceTotals({ line_items: lineItems, tax_percent: taxPercent, payments: invoice?.payments || [] });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) return;
    const cleanItems = lineItems.filter(li => li.description.trim() || li.unit_price > 0);
    onSave({
      ...(invoice ? { id: invoice.id } : {}),
      client_id: clientId,
      issue_date: issueDate,
      due_date: dueDate || undefined,
      tax_percent: Number(taxPercent) || 0,
      status,
      notes,
      line_items: cleanItems,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/75 sticky top-0">
          <h3 className="text-xs font-bold text-black font-mono uppercase tracking-wider">{invoice ? `Edit ${invoice.invoice_number}` : 'Create Invoice'}</h3>
          <button onClick={onCancel} type="button" className="text-gray-400 hover:text-black p-1 rounded hover:bg-gray-100 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Client <span className="text-red-500">*</span></label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={INPUT + ' font-mono'} required>
                <option value="" disabled>Select client...</option>
                {clients.filter(c => !c.is_deleted).map(c => <option key={c.id} value={c.id}>{c.client_name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus)} className={INPUT + ' font-mono'}>
                <option value="Draft">Draft</option>
                <option value="Sent">Sent</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>Issue Date</label>
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={INPUT + ' font-mono'} />
            </div>
            <div>
              <label className={LABEL}>Due Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={INPUT + ' font-mono'} />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={LABEL + ' mb-0'}>Line Items</label>
              <button type="button" onClick={addItem} className="text-[10px] font-mono font-bold text-black hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> ADD ROW</button>
            </div>
            <div className="border border-gray-200 rounded divide-y divide-gray-100">
              <div className="grid grid-cols-12 gap-2 px-2 py-1.5 bg-gray-50 text-[10px] font-mono font-bold uppercase text-gray-400">
                <div className="col-span-6">Description</div>
                <div className="col-span-2 text-right">Qty</div>
                <div className="col-span-3 text-right">Unit (₹)</div>
                <div className="col-span-1"></div>
              </div>
              {lineItems.map((li, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 px-2 py-1.5 items-center">
                  <input className="col-span-6 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-black" placeholder="Service / deliverable" value={li.description} onChange={(e) => updateItem(idx, { description: e.target.value })} />
                  <input type="number" min={0} className="col-span-2 border border-gray-200 rounded px-2 py-1 text-xs text-right font-mono focus:outline-none focus:border-black" value={li.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                  <input type="number" min={0} className="col-span-3 border border-gray-200 rounded px-2 py-1 text-xs text-right font-mono focus:outline-none focus:border-black" value={li.unit_price} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })} />
                  <button type="button" onClick={() => removeItem(idx)} className="col-span-1 text-gray-300 hover:text-rose-600 flex justify-center"><Trash className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-56 space-y-1 text-xs font-mono">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatINR(totals.subtotal)}</span></div>
              <div className="flex justify-between items-center text-gray-500">
                <span className="flex items-center gap-1">Tax
                  <input type="number" min={0} value={taxPercent} onChange={(e) => setTaxPercent(Number(e.target.value))} className="w-12 border border-gray-200 rounded px-1 py-0.5 text-right" />%
                </span>
                <span>{formatINR(totals.tax)}</span>
              </div>
              <div className="flex justify-between font-bold text-black border-t border-gray-200 pt-1"><span>Total</span><span>{formatINR(totals.total)}</span></div>
            </div>
          </div>

          <div>
            <label className={LABEL}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT} rows={2} placeholder="Payment terms, PO number..." />
          </div>

          <div className="flex justify-end items-center gap-3 border-t border-gray-200 pt-4">
            <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 rounded text-xs font-bold font-mono text-black transition-colors">CANCEL</button>
            <button type="submit" className="px-4 py-2 bg-black hover:bg-neutral-800 text-white rounded text-xs font-bold font-mono flex items-center gap-1 transition-colors"><Check className="w-4 h-4" /> {invoice ? 'SAVE' : 'CREATE'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Record payment modal
// ---------------------------------------------------------------------
function PaymentModal({ invoice, onCancel, onSubmit }: {
  invoice: Invoice;
  onCancel: () => void;
  onSubmit: (p: { amount: number; date?: string; method?: string; note?: string }) => void;
}) {
  const { balance } = computeInvoiceTotals(invoice);
  const [amount, setAmount] = useState<number>(balance);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('Bank Transfer');
  const [note, setNote] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) return;
    onSubmit({ amount, date, method, note });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded max-w-md w-full shadow-2xl animate-scale-in">
        <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/75">
          <h3 className="text-xs font-bold text-black font-mono uppercase tracking-wider">Record Payment — {invoice.invoice_number}</h3>
          <button onClick={onCancel} type="button" className="text-gray-400 hover:text-black p-1 rounded hover:bg-gray-100 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="text-xs font-mono text-gray-500">Outstanding balance: <span className="font-bold text-black">{formatINR(balance)}</span></div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Amount (₹) <span className="text-red-500">*</span></label>
              <input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={INPUT + ' font-mono'} required />
            </div>
            <div>
              <label className={LABEL}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT + ' font-mono'} />
            </div>
          </div>
          <div>
            <label className={LABEL}>Method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={INPUT + ' font-mono'}>
              <option>Bank Transfer</option>
              <option>UPI</option>
              <option>Card</option>
              <option>Cash</option>
              <option>Cheque</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Note</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} placeholder="Reference / transaction id" />
          </div>
          <div className="flex justify-end items-center gap-3 border-t border-gray-200 pt-4">
            <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 rounded text-xs font-bold font-mono text-black transition-colors">CANCEL</button>
            <button type="submit" className="px-4 py-2 bg-black hover:bg-neutral-800 text-white rounded text-xs font-bold font-mono flex items-center gap-1 transition-colors"><Check className="w-4 h-4" /> RECORD</button>
          </div>
        </form>
      </div>
    </div>
  );
}
