import { Injectable, signal } from '@angular/core';

export interface ModalConfig {
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closable?: boolean;
  content?: string;
  confirmText?: string;
  cancelText?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  private modals = signal<Map<string, ModalConfig>>(new Map());

  openModal(id: string, config: ModalConfig = {}): void {
    const currentModals = this.modals();
    currentModals.set(id, {
      title: '',
      size: 'md',
      closable: true,
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      ...config
    });
    this.modals.set(new Map(currentModals));
  }

  closeModal(id: string): void {
    const currentModals = this.modals();
    currentModals.delete(id);
    this.modals.set(new Map(currentModals));
  }

  isModalOpen(id: string): boolean {
    return this.modals().has(id);
  }

  getModalConfig(id: string): ModalConfig | undefined {
    return this.modals().get(id);
  }

  // Convenience methods for common modal types
  openConfirmModal(
    id: string, 
    title: string, 
    content: string, 
    onConfirm: () => void,
    onCancel?: () => void
  ): void {
    this.openModal(id, {
      title,
      content,
      size: 'md',
      confirmText: 'Confirm',
      cancelText: 'Cancel'
    });

    // Store callbacks (in a real app, you'd want a more sophisticated callback system)
    (window as any)[`modal_${id}_confirm`] = onConfirm;
    (window as any)[`modal_${id}_cancel`] = onCancel || (() => this.closeModal(id));
  }

  openAlertModal(id: string, title: string, content: string): void {
    this.openModal(id, {
      title,
      content,
      size: 'sm',
      confirmText: 'OK',
      cancelText: ''
    });
  }

  closeAllModals(): void {
    this.modals.set(new Map());
  }
}