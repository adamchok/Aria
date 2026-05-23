import { create } from 'zustand';

interface UploadStoreState {
  paymentProofs: File[];
  bankStatement: File | null;
  baseCurrency: string;
  setPaymentProofs: (files: File[]) => void;
  addPaymentProofs: (files: File[]) => void;
  removePaymentProof: (name: string) => void;
  setBankStatement: (file: File | null) => void;
  setBaseCurrency: (code: string) => void;
  reset: () => void;
}

const defaultState = {
  paymentProofs: [],
  bankStatement: null,
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
  setBaseCurrency: (code) => set({ baseCurrency: code.toUpperCase() }),
  reset: () => set(defaultState),
}));
