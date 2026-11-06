/** UI-only state that is not part of the document (toasts, recording, drawers). */
import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error';
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface UiState {
  toasts: Toast[];
  recording: boolean;
  recordStartedAt: number;
  pickerOpen: boolean;
  drawer: 'left' | 'right' | null;
  renamingId: string | null;
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
  renamingId: null,
  setPickerOpen: (pickerOpen) => set({ pickerOpen }),
  setDrawer: (drawer) => set({ drawer }),
  setRenaming: (renamingId) => set({ renamingId }),
}));

let toastId = 0;
export function toast(message: string, kind: ToastKind = 'info', ms = kind === 'error' ? 5200 : 2800) {
  const id = ++toastId;
  useUi.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message }] }));
  setTimeout(() => dismissToast(id), ms);
}

export function dismissToast(id: number) {
  useUi.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}
