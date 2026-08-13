import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Smartphone, Share, SquarePlus } from 'lucide-react';

/**
 * Chrome fires `beforeinstallprompt` once, early in the page life - often
 * before the student has signed in. Capture it at module scope so the dialog
 * can replay it whenever it finally opens.
 */
let deferredInstallEvent:
  | (Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
    })
  | null = null;

// The -v2 suffix retires snoozes stored by the old version, which wrongly
// counted a completed install as "don't ask again".
const SNOOZE_KEY = 'cai112-install-snoozed-until-v2';
const SNOOZE_DAYS = 7;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallEvent = e as typeof deferredInstallEvent;
  });
  // A completed install clears any snooze, so a student who uninstalls
  // the app later gets offered it again on their next sign-in.
  window.addEventListener('appinstalled', () => {
    localStorage.removeItem(SNOOZE_KEY);
  });
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as { standalone?: boolean }).standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS reports as Mac but has touch
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

interface InstallPromptProps {
  /** Open the dialog only after the user has signed in. */
  signedIn: boolean;
}

/** Invites signed-in students to put the app on their phone's home screen. */
export const InstallPrompt = ({ signedIn }: InstallPromptProps) => {
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (!signedIn || isStandalone()) return;
    const snoozedUntil = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    if (Date.now() < snoozedUntil) return;

    const iosDevice = isIos();
    // Android/Chrome: only offer when the browser says installing is possible.
    // iOS never fires beforeinstallprompt, so show manual instructions.
    if (!iosDevice && !deferredInstallEvent) return;

    const timer = setTimeout(() => {
      setIos(iosDevice);
      setOpen(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [signedIn]);

  const snooze = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
    setOpen(false);
  };

  const install = async () => {
    if (!deferredInstallEvent) return snooze();
    const evt = deferredInstallEvent;
    deferredInstallEvent = null;
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      // Snooze only when the student declined Chrome's prompt; accepting
      // fires `appinstalled`, which clears any snooze instead.
      if (choice.outcome === 'dismissed') {
        localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
      }
    } catch {
      /* prompt already used or blocked - nothing to do */
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : snooze())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-primary" />
            Install CAI112 on your phone
          </DialogTitle>
          <DialogDescription>
            Add the app to your home screen to easily open it later.
          </DialogDescription>
        </DialogHeader>

        {ios ? (
          <ol className="space-y-3 py-2 text-sm">
            <li className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">1</span>
              <span className="flex items-center gap-1.5">
                Tap the <Share className="inline h-4 w-4 text-primary" /> <strong>Share</strong> button in Safari
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">2</span>
              <span className="flex items-center gap-1.5">
                Choose <SquarePlus className="inline h-4 w-4 text-primary" /> <strong>Add to Home Screen</strong>
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">3</span>
              <span>
                Tap <strong>Add</strong> - CAI112 appears on your home screen
              </span>
            </li>
          </ol>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={snooze}>
            Not now
          </Button>
          {!ios && (
            <Button onClick={install} className="gap-2">
              <SquarePlus className="w-4 h-4" />
              Install
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
