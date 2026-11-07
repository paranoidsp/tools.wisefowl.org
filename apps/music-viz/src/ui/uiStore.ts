/** UI-only state that is not part of the document (toasts, recording, drawers). */
import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error';
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** optional button, e.g. "Rename" */
  action?: { label: string; run(): void };
}

interface UiState {
  toasts: Toast[];
  recording: boolean;
  recordStartedAt: number;
  pickerOpen: boolean;
  drawer: 'left' | 'right' | null;
  /** left panel view */
  leftView: 'layers' | 'history';
  setLeftView(v: 'layers' | 'history'): void;
  renamingId: string | null;
  /** print each setting's explanation under it (learning mode) */
  showDescriptions: boolean;
  setShowDescriptions(on: boolean): void;
  setPickerOpen(on: boolean): void;
  setDrawer(d: 'left' | 'right' | null): void;
  setRenaming(id: string | null): void;
}

export const useUi = create<UiState>()((set) => ({
  toasts: [],
  recording: false,
  recordStartedAt: 0,
  pickerOpen: false,
  drawer: null,
  leftView: 'layers',
  setLeftView: (leftView) => set({ leftView }),
  renamingId: null,
  showDescriptions: localStorage.getItem('mvs:showDescriptions') === '1',
  setShowDescriptions: (showDescriptions) => {
    localStorage.setItem('mvs:showDescriptions', showDescriptions ? '1' : '0');
    set({ showDescriptions });
  },
  setPickerOpen: (pickerOpen) => set({ pickerOpen }),
  setDrawer: (drawer) => set({ drawer }),
  setRenaming: (renamingId) => set({ renamingId }),
}));

let toastId = 0;
export function toast(message: string, kind: ToastKind = 'info', ms = kind === 'error' ? 5200 : 2800, action?: Toast['action']) {
  const id = ++toastId;
  useUi.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message, action }] }));
  setTimeout(() => dismissToast(id), ms);
}

export function dismissToast(id: number) {
  useUi.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}
