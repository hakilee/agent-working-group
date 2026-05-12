import { Dialog } from '@base-ui/react/dialog';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';

export function AppDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <AnimatePresence>
          {open && (
            <>
              <Dialog.Backdrop
                render={<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} />}
                className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]"
              />
              <Dialog.Popup
                render={<motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.14, ease: 'easeOut' }} />}
                className="fixed left-1/2 top-1/2 z-50 grid max-h-[82dvh] w-[min(720px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 gap-3 overflow-hidden border border-ops-line bg-ops-paper p-3 shadow-[0_20px_60px_rgb(0_0_0/.22)] outline-none dark:border-white/15 dark:bg-[#18201c]"
              >
                <header className="flex flex-wrap items-end justify-between gap-3">
                  <div className="grid gap-1">
                    <Dialog.Title className="text-lg font-bold leading-tight tracking-[-.03em] text-ops-ink dark:text-[#eef3ec] md:text-xl">{title}</Dialog.Title>
                    {description && <Dialog.Description className="text-[10px] text-ops-muted dark:text-[#839087]">{description}</Dialog.Description>}
                  </div>
                  <Dialog.Close className="inline-flex items-center gap-1.5 border border-transparent bg-[#ebe6da] px-2.5 py-1.5 text-xs font-bold text-ops-ink transition hover:border-ops-line hover:bg-emerald-50 dark:bg-white/10 dark:text-[#eef3ec] dark:hover:border-white/15 dark:hover:bg-emerald-400/15">Close</Dialog.Close>
                </header>
                {children}
              </Dialog.Popup>
            </>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
