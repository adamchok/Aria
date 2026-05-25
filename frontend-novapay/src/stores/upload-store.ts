import { create } from 'zustand';

export type BankStatementSource = 'upload' | 'ledger';

interface UploadStoreState {
  paymentProofs: File[];
  bankStatement: File | null;
  bankStatementSource: BankStatementSource;
  selectedAccountId: string | null;
  baseCurrency: string;
  setPaymentProofs: (files: File[]) => void;
  addPaymentProofs: (files: File[]) => void;
  removePaymentProof: (name: string) => void;
  setBankStatement: (file: File | null) => void;
  setBankStatementSource: (source: BankStatementSource) => void;
  setSelectedAccountId: (id: string | null) => void;
  setBaseCurrency: (code: string) => void;
  reset: () => void;
}

const defaultState = {
  paymentProofs: [] as File[],
  bankStatement: null as File | null,
  bankStatementSource: 'upload' as BankStatementSource,
  selectedAccountId: null as string | null,
  baseCurrency: 'MYR',
};

export const useUploadStore = create<UploadStoreState>((set) => ({
  ...defaultState,
  setPaymentProofs: (files) => set({ paymentProofs: files }),
  addPaymentProofs: (files) =>
    set((s) => {
      const byName = new Map(s.paymentProofs.map((f) => [f.name, f]));
      for (const f of files) byName.set(f.name, f);
      return { paymentProofs: Array.from(byName.values()) };
    }),
  removePaymentProof: (name) =>
    set((s) => ({ paymentProofs: s.paymentProofs.filter((f) => f.name !== name) })),
  setBankStatement: (file) => set({ bankStatement: file }),
  setBankStatementSource: (source) =>
    set((s) =>
      source === 'ledger'
        ? { bankStatementSource: source, bankStatement: null }
        : {
            bankStatementSource: source,
            selectedAccountId: null,
          },
    ),
  setSelectedAccountId: (id) => set({ selectedAccountId: id }),
  setBaseCurrency: (code) => set({ baseCurrency: code.toUpperCase() }),
  reset: () => set(defaultState),
}));
