import { useState, useRef, useEffect } from 'react';
import {
  User as UserIcon,
  Settings as SettingsIcon,
  CreditCard,
  Crown,
  LogOut,
  ChevronUp,
  FileText,
} from 'lucide-react';

type AccountGroupProps = {
  email: string;
  onSettings: () => void;
  onSignOut: () => void;
};

type MenuItem = {
  icon: typeof UserIcon;
  label: string;
  onClick: () => void;
  iconClass: string;
};

export function AccountGroup({ email, onSettings, onSignOut }: AccountGroupProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const initials = email
    .split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('') || email[0]?.toUpperCase() || 'U';

  const items: MenuItem[] = [
    { icon: UserIcon, label: 'Profile', onClick: () => { setOpen(false); }, iconClass: 'text-sky-400' },
    { icon: SettingsIcon, label: 'Settings', onClick: () => { setOpen(false); onSettings(); }, iconClass: 'text-secondary' },
    { icon: Crown, label: 'Subscription', onClick: () => { setOpen(false); }, iconClass: 'text-amber-400' },
    { icon: CreditCard, label: 'Billing', onClick: () => { setOpen(false); }, iconClass: 'text-emerald-400' },
    { icon: FileText, label: 'Usage & Docs', onClick: () => { setOpen(false); }, iconClass: 'text-violet-400' },
  ];

  return (
    <div ref={menuRef} className="relative">
      {/* Trigger row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover-surface transition group"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center text-xs font-semibold text-white shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-xs font-medium text-primary truncate">{email || 'Signed in'}</div>
          <div className="text-[10px] text-muted">Account</div>
        </div>
        <ChevronUp className={`w-3.5 h-3.5 text-muted transition-transform ${open ? '' : 'rotate-180'}`} />
      </button>

      {/* Pop-up menu */}
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-account-menu border border-default rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
          <div className="p-1">
            {items.map((item) => (
              <button
                key={item.label}
                onClick={item.onClick}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-secondary hover-surface hover:text-white transition"
              >
                <item.icon className={`w-4 h-4 ${item.iconClass}`} />
                {item.label}
              </button>
            ))}
          </div>
          <div className="border-t border-default p-1">
            <button
              onClick={() => { setOpen(false); onSignOut(); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-rose-400 hover:bg-rose-500/10 transition"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
