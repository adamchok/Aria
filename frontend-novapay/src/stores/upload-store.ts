import { create } from 'zustand';

export type BankStatementSource = 'upload' | 'ledger';

function mergeFilesByName(existing: File[], added: File[]): File[] {
  const byName = new Map(existing.map((f) => [f.name, f]));
  for (const f of added) byName.set(f.name, f);
  return Array.from(byName.values());
}

interface UploadStoreState {
  paymentProofs: File[];
  bankStatements: File[];
  bankStatementSource: BankStatementSource;
  selectedAccountId: string | null;
  baseCurrency: string;
  setPaymentProofs: (files: File[]) => void;
  addPaymentProofs: (files: File[]) => void;
  removePaymentProof: (name: string) => void;
  addBankStatements: (files: File[]) => void;
  removeBankStatement: (name: string) => void;
  setBankStatementSource: (source: BankStatementSource) => void;
  setSelectedAccountId: (id: string | null) => void;
  setBaseCurrency: (code: string) => void;
  reset: () => void;
}

const defaultState = {
  paymentProofs: [] as File[],
  bankStatements: [] as File[],
  bankStatementSource: 'upload' as BankStatementSource,
  selectedAccountId: null as string | null,
  baseCurrency: 'MYR',
};

export const useUploadStore = create<UploadStoreState>((set) => ({
  ...defaultState,
  setPaymentProofs: (files) => set({ paymentProofs: files }),
  addPaymentProofs: (files) =>
    set((s) => ({ paymentProofs: mergeFilesByName(s.paymentProofs, files) })),
  removePaymentProof: (name) =>
    set((s) => ({ paymentProofs: s.paymentProofs.filter((f) => f.name !== name) })),
  addBankStatements: (files) =>
    set((s) => ({ bankStatements: mergeFilesByName(s.bankStatements, files) })),
  removeBankStatement: (name) =>
    set((s) => ({ bankStatements: s.bankStatements.filter((f) => f.name !== name) })),
  setBankStatementSource: (source) =>
    set((_s) =>
      source === 'ledger'
        ? { bankStatementSource: source, bankStatements: [] }
        : {
            bankStatementSource: source,
            selectedAccountId: null,
          },
    ),
  setSelectedAccountId: (id) => set({ selectedAccountId: id }),
  setBaseCurrency: (code) => set({ baseCurrency: code.toUpperCase() }),
  reset: () => set(defaultState),
}));
