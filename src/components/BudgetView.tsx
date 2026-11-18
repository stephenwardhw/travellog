import React, { useEffect, useMemo, useState } from 'react';
import {
  CreditCard,
  Edit3,
  Plus,
  Receipt,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import type {
  ExpenseCategory,
  ExpenseRecord,
  PaymentMethod,
  TripRecord,
} from '../types/journal';

interface BudgetViewProps {
  trip: TripRecord | null;
  expenses: ExpenseRecord[];
  canEdit: boolean;
  onUpdateTripBudget: (targetBudget: number | null, budgetCurrency: string) => Promise<void>;
  onSaveExpense: (data: {
    clientId?: string;
    title: string;
    amount: number;
    currency: string;
    expenseDate: string;
    category: ExpenseCategory;
    paymentMethod: PaymentMethod;
    notes: string;
  }) => Promise<void>;
  onDeleteExpense: (clientId: string) => Promise<void>;
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Lodging',
  'Food & Dining',
  'Transport',
  'Activities',
  'Shopping',
  'Other',
];

const PAYMENT_METHODS: PaymentMethod[] = [
  'Credit Card',
  'Debit Card',
  'Cash',
  'Digital Wallet',
  'Bank Transfer',
  'Other',
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'MXN'];

export function formatMoney(amount: number, currency: string): string {
  const cleanCode = currency || 'USD';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: cleanCode,
      minimumFractionDigits: cleanCode === 'JPY' ? 0 : 2,
      maximumFractionDigits: cleanCode === 'JPY' ? 0 : 2,
    }).format(amount);
  } catch {
    return `${cleanCode} ${amount.toFixed(2)}`;
  }
}

export const BudgetView: React.FC<BudgetViewProps> = ({
  trip,
  expenses,
  canEdit,
  onUpdateTripBudget,
  onSaveExpense,
  onDeleteExpense,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const tripCurrency = trip?.budgetCurrency || 'USD';

  const [budgetInput, setBudgetInput] = useState('');
  const [currencyInput, setCurrencyInput] = useState(tripCurrency);
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetSavedMsg, setBudgetSavedMsg] = useState<string | null>(null);

  // Add/Edit Expense Form state
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseCurrency, setExpenseCurrency] = useState(tripCurrency);
  const [expenseDate, setExpenseDate] = useState(today);
  const [category, setCategory] = useState<ExpenseCategory>('Food & Dining');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Credit Card');
  const [notes, setNotes] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExpenseCategory>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');

  // Delete confirmation
  const [pendingDeleteExpense, setPendingDeleteExpense] = useState<ExpenseRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setBudgetInput(
      trip?.targetBudget !== null && trip?.targetBudget !== undefined
        ? String(trip.targetBudget)
        : ''
    );
    const nextCurrency = trip?.budgetCurrency || 'USD';
    setCurrencyInput(nextCurrency);
    if (!editingExpense) {
      setExpenseCurrency(nextCurrency);
      setExpenseDate(trip?.startDate || today);
    }
    setBudgetSavedMsg(null);
  }, [trip?.clientId, trip?.targetBudget, trip?.budgetCurrency, trip?.startDate]);

  const sortedExpenses = useMemo(() => {
    return [...expenses].sort((a, b) => {
      const d = b.expenseDate.localeCompare(a.expenseDate);
      if (d !== 0) return d;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    return sortedExpenses.filter((exp) => {
      if (categoryFilter !== 'all' && exp.category !== categoryFilter) return false;
      if (methodFilter !== 'all' && exp.paymentMethod !== methodFilter) return false;
      return true;
    });
  }, [sortedExpenses, categoryFilter, methodFilter]);

  const totalsByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const exp of expenses) {
      const cur = exp.currency || tripCurrency;
      map.set(cur, (map.get(cur) || 0) + (Number(exp.amount) || 0));
    }
    return map;
  }, [expenses, tripCurrency]);

  const primarySpent = totalsByCurrency.get(tripCurrency) || 0;
  const targetBudget =
    trip?.targetBudget !== null && trip?.targetBudget !== undefined ? Number(trip.targetBudget) : null;
  const remaining = targetBudget !== null ? targetBudget - primarySpent : null;
  const utilizationPct =
    targetBudget !== null && targetBudget > 0 ? Math.round((primarySpent / targetBudget) * 100) : null;

  const categoryTotals = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    for (const cat of EXPENSE_CATEGORIES) map.set(cat, 0);
    for (const exp of expenses) {
      if ((exp.currency || tripCurrency) !== tripCurrency) continue;
      const cat = EXPENSE_CATEGORIES.includes(exp.category) ? exp.category : 'Other';
      map.set(cat, (map.get(cat) || 0) + (Number(exp.amount) || 0));
    }
    return Array.from(map.entries()).filter(([, val]) => val > 0);
  }, [expenses, tripCurrency]);

  const methodTotals = useMemo(() => {
    const map = new Map<PaymentMethod, number>();
    for (const pm of PAYMENT_METHODS) map.set(pm, 0);
    for (const exp of expenses) {
      if ((exp.currency || tripCurrency) !== tripCurrency) continue;
      const pm = PAYMENT_METHODS.includes(exp.paymentMethod) ? exp.paymentMethod : 'Other';
      map.set(pm, (map.get(pm) || 0) + (Number(exp.amount) || 0));
    }
    return Array.from(map.entries()).filter(([, val]) => val > 0);
  }, [expenses, tripCurrency]);

  if (!trip) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center max-w-xl mx-auto mt-8">
        <Wallet className="w-8 h-8 text-teal-700 mx-auto mb-3" />
        <h2 className="font-display text-2xl font-semibold text-slate-900">
          Select or create a trip
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Define a target budget and track individual expenses across categories and payment methods.
        </p>
      </div>
    );
  }

  const handleSaveTargetBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const trimmed = budgetInput.trim();
    const numeric = trimmed === '' ? null : Number(trimmed);
    if (numeric !== null && (!Number.isFinite(numeric) || numeric < 0)) {
      setBudgetSavedMsg('Enter a valid non-negative budget amount.');
      return;
    }
    setSavingBudget(true);
    setBudgetSavedMsg(null);
    try {
      await onUpdateTripBudget(numeric !== null ? Number(numeric.toFixed(2)) : null, currencyInput);
      setBudgetSavedMsg('Target budget updated.');
    } finally {
      setSavingBudget(false);
    }
  };

  const resetExpenseForm = () => {
    setEditingExpense(null);
    setTitle('');
    setAmount('');
    setExpenseCurrency(tripCurrency);
    setExpenseDate(trip.startDate || today);
    setCategory('Food & Dining');
    setPaymentMethod('Credit Card');
    setNotes('');
    setFormError(null);
  };

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const amtNum = Number(amount);
    if (!title.trim()) {
      setFormError('Expense description is required.');
      return;
    }
    if (!Number.isFinite(amtNum) || amtNum < 0) {
      setFormError('Enter a valid expense amount.');
      return;
    }
    if (!expenseDate) {
      setFormError('Expense date is required.');
      return;
    }
    setSavingExpense(true);
    setFormError(null);
    try {
      await onSaveExpense({
        clientId: editingExpense?.clientId,
        title: title.trim(),
        amount: Number(amtNum.toFixed(2)),
        currency: expenseCurrency,
        expenseDate,
        category,
        paymentMethod,
        notes: notes.trim(),
      });
      resetExpenseForm();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Unable to save expense.');
    } finally {
      setSavingExpense(false);
    }
  };

  const handleEditExpense = (exp: ExpenseRecord) => {
    setEditingExpense(exp);
    setTitle(exp.title);
    setAmount(String(exp.amount));
    setExpenseCurrency(exp.currency || tripCurrency);
    setExpenseDate(exp.expenseDate);
    setCategory(exp.category);
    setPaymentMethod(exp.paymentMethod);
    setNotes(exp.notes || '');
    setFormError(null);
  };

  const confirmDeleteExpense = async () => {
    if (!pendingDeleteExpense) return;
    setDeleting(true);
    try {
      await onDeleteExpense(pendingDeleteExpense.clientId);
      if (editingExpense?.clientId === pendingDeleteExpense.clientId) {
        resetExpenseForm();
      }
      setPendingDeleteExpense(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Page Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-slate-900">
            Trip Budget &amp; Expenses
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            {trip.title} · {expenses.length} {expenses.length === 1 ? 'expense logged' : 'expenses logged'}
          </p>
        </div>
      </div>

      {/* Top Summary & Target Budget Editor */}
      <div className="grid lg:grid-cols-12 gap-5 items-stretch">
        <section className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 tabular-nums">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Target Budget
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {targetBudget !== null ? formatMoney(targetBudget, tripCurrency) : 'Not set'}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Total Spent ({tripCurrency})
              </p>
              <p className="text-2xl font-bold text-teal-800 mt-1">
                {formatMoney(primarySpent, tripCurrency)}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                {remaining !== null && remaining < 0 ? 'Over Budget' : 'Remaining'}
              </p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  remaining === null
                    ? 'text-slate-400'
                    : remaining < 0
                    ? 'text-red-600'
                    : 'text-emerald-700'
                }`}
              >
                {remaining !== null
                  ? formatMoney(Math.abs(remaining), tripCurrency)
                  : '—'}
              </p>
            </div>
          </div>

          {utilizationPct !== null && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs font-medium text-slate-600 tabular-nums">
                <span>Budget Utilization</span>
                <span
                  className={
                    utilizationPct > 100
                      ? 'text-red-700 font-semibold'
                      : utilizationPct >= 85
                      ? 'text-amber-700 font-semibold'
                      : 'text-teal-800 font-semibold'
                  }
                >
                  {utilizationPct}% used
                </span>
              </div>
              <div className="h-2.5 w-full rounded-lg bg-slate-100 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    utilizationPct > 100
                      ? 'bg-red-600'
                      : utilizationPct >= 85
                      ? 'bg-amber-500'
                      : 'bg-teal-700'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, utilizationPct))}%` }}
                />
              </div>
            </div>
          )}

          {totalsByCurrency.size > 1 && (
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 tabular-nums">
              <span className="font-medium text-slate-700">Other currencies logged:</span>
              {Array.from(totalsByCurrency.entries())
                .filter(([cur]) => cur !== tripCurrency)
                .map(([cur, total]) => (
                  <span key={cur} className="font-mono">
                    {formatMoney(total, cur)}
                  </span>
                ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Define Target Budget</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Set the spending target and primary currency for {trip.title}.
            </p>
          </div>

          <form onSubmit={handleSaveTargetBudget} className="space-y-3">
            <div className="grid grid-cols-12 gap-2">
              <select
                value={currencyInput}
                onChange={(e) => setCurrencyInput(e.target.value)}
                disabled={!canEdit || savingBudget}
                aria-label="Trip budget currency"
                className="col-span-4 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-900 focus:border-teal-700 focus:outline-none min-h-[42px]"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min="0"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                disabled={!canEdit || savingBudget}
                placeholder="e.g. 2500.00"
                aria-label="Target budget amount"
                className="col-span-8 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none min-h-[42px] disabled:bg-slate-50"
              />
            </div>

            {canEdit && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-teal-800 font-medium">{budgetSavedMsg || ''}</span>
                <button
                  type="submit"
                  disabled={savingBudget}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 min-h-[40px]"
                >
                  {savingBudget ? 'Saving...' : 'Save Target'}
                </button>
              </div>
            )}
          </form>
        </section>
      </div>

      {/* Add / Edit Expense Form + Category / Payment Breakdown */}
      <div className="grid lg:grid-cols-12 gap-5 items-start">
        {canEdit && (
          <section className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-teal-700" />
                {editingExpense ? 'Edit Expense' : 'Log New Expense'}
              </h3>
              {editingExpense && (
                <button
                  type="button"
                  onClick={resetExpenseForm}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel edit
                </button>
              )}
            </div>

            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmitExpense} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Expense Description
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Shinkansen tickets, Ryokan dinner, Museum entry..."
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-12 gap-2.5">
                <div className="col-span-4">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Currency
                  </label>
                  <select
                    value={expenseCurrency}
                    onChange={(e) => setExpenseCurrency(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-900 focus:border-teal-700 focus:outline-none min-h-[40px]"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-4">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none min-h-[40px]"
                  />
                </div>

                <div className="col-span-4">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none min-h-[40px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none min-h-[40px]"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none min-h-[40px]"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Receipt # or split details..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={savingExpense}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                {savingExpense
                  ? 'Saving...'
                  : editingExpense
                  ? 'Update Expense'
                  : 'Add Expense'}
              </button>
            </form>
          </section>
        )}

        {/* Category + Payment Method Breakdown */}
        <section
          className={`${
            canEdit ? 'lg:col-span-7' : 'lg:col-span-12'
          } grid sm:grid-cols-2 gap-5`}
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              By Category ({tripCurrency})
            </h3>
            {categoryTotals.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">
                No {tripCurrency} expenses logged yet.
              </p>
            ) : (
              <div className="space-y-3">
                {categoryTotals.map(([cat, total]) => {
                  const pct = primarySpent > 0 ? Math.round((total / primarySpent) * 100) : 0;
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex items-center justify-between text-xs tabular-nums">
                        <span className="font-medium text-slate-800">{cat}</span>
                        <span className="text-slate-600 font-semibold">
                          {formatMoney(total, tripCurrency)} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-teal-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-indigo-700" />
              By Payment Method ({tripCurrency})
            </h3>
            {methodTotals.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">
                No {tripCurrency} expenses logged yet.
              </p>
            ) : (
              <div className="space-y-3">
                {methodTotals.map(([pm, total]) => {
                  const pct = primarySpent > 0 ? Math.round((total / primarySpent) * 100) : 0;
                  return (
                    <div key={pm} className="space-y-1">
                      <div className="flex items-center justify-between text-xs tabular-nums">
                        <span className="font-medium text-slate-800">{pm}</span>
                        <span className="text-slate-600 font-semibold">
                          {formatMoney(total, tripCurrency)} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-indigo-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Expense Ledger */}
      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Expense Log ({filteredExpenses.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as 'all' | ExpenseCategory)
              }
              aria-label="Filter expenses by category"
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-teal-700 focus:outline-none min-h-[36px]"
            >
              <option value="all">All Categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={methodFilter}
              onChange={(e) =>
                setMethodFilter(e.target.value as 'all' | PaymentMethod)
              }
              aria-label="Filter expenses by payment method"
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-teal-700 focus:outline-none min-h-[36px]"
            >
              <option value="all">All Payment Methods</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {expenses.length === 0
              ? 'No expenses recorded for this trip yet.'
              : 'No expenses match the selected filters.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredExpenses.map((exp) => (
              <div
                key={exp.clientId}
                className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 tabular-nums">
                    <span className="font-semibold text-slate-700">{exp.expenseDate}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-teal-800">{exp.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{exp.paymentMethod}</span>
                    {exp.syncStatus === 'pending' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-700 font-medium">Queued for sync</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-900 truncate">{exp.title}</p>
                  {exp.notes && (
                    <p className="text-xs text-slate-600 line-clamp-2">{exp.notes}</p>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <span className="text-base font-bold text-slate-900 tabular-nums">
                    {formatMoney(exp.amount, exp.currency || tripCurrency)}
                  </span>

                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEditExpense(exp)}
                        className="p-2 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-slate-100"
                        aria-label={`Edit expense ${exp.title}`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteExpense(exp)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                        aria-label={`Delete expense ${exp.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(pendingDeleteExpense)}
        title="Delete Expense"
        message={
          pendingDeleteExpense
            ? `Permanently delete "${pendingDeleteExpense.title}" (${formatMoney(
                pendingDeleteExpense.amount,
                pendingDeleteExpense.currency || tripCurrency
              )}) from your trip budget?`
            : ''
        }
        confirmLabel="Delete Expense"
        busy={deleting}
        onConfirm={confirmDeleteExpense}
        onCancel={() => {
          if (!deleting) setPendingDeleteExpense(null);
        }}
      />
    </div>
  );
};
