import React, { createContext, useContext, useState, useCallback } from 'react';
import DeleteConfirmModal from '../components/DeleteConfirmModal';

const DeleteConfirmContext = createContext(null);

export function DeleteConfirmProvider({ children }) {
  const [pending, setPending] = useState(null); // { label, onConfirmed }

  const requestDelete = useCallback((label, onConfirmed) => {
    setPending({ label, onConfirmed });
  }, []);

  const handleConfirmed = useCallback(() => {
    const cb = pending?.onConfirmed;
    setPending(null);
    cb?.();
  }, [pending]);

  const handleCancel = useCallback(() => {
    setPending(null);
  }, []);

  return (
    <DeleteConfirmContext.Provider value={{ requestDelete }}>
      {children}
      {pending && (
        <DeleteConfirmModal
          label={pending.label}
          onConfirmed={handleConfirmed}
          onCancel={handleCancel}
        />
      )}
    </DeleteConfirmContext.Provider>
  );
}

export function useDeleteConfirm() {
  const ctx = useContext(DeleteConfirmContext);
  if (!ctx) throw new Error('useDeleteConfirm must be used inside DeleteConfirmProvider');
  return ctx;
}
