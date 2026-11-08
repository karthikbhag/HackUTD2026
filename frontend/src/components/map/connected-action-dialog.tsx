"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function ConnectedActionDialog({ name, onClose, children }: { name: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className="area-review-dialog connected-action-dialog" aria-labelledby="connected-action-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="area-review-content">
      <header className="dialog-heading"><div><p className="eyebrow">Shared disaster response</p><h2 id="connected-action-title">{name} · Take action</h2></div><button className="dialog-close" aria-label="Close actions" onClick={onClose} autoFocus>×</button></header>
      {children}
    </div>
  </dialog>;
}
