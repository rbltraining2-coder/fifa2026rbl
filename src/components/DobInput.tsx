import { useRef, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";

type Props = {
  value: string;
  onChange: (v: string) => void;
};

// Auto-formats DD/MM/YYYY as the user types and exposes a native date picker
// (dark-themed via color-scheme) through a calendar icon trigger.
export function DobInput({ value, onChange }: Props) {
  const dateRef = useRef<HTMLInputElement>(null);
  const [iso, setIso] = useState<string>("");

  const handleText = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Keep only digits, cap at 8 (DDMMYYYY), then re-insert slashes.
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    onChange(out);

    // Mirror to the hidden native picker once a full date is typed.
    if (digits.length === 8) {
      const d = digits.slice(0, 2);
      const m = digits.slice(2, 4);
      const y = digits.slice(4);
      setIso(`${y}-${m}-${d}`);
    }
  };

  const handlePicker = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value; // YYYY-MM-DD
    setIso(v);
    if (!v) return;
    const [y, m, d] = v.split("-");
    onChange(`${d}/${m}/${y}`);
  };

  const openPicker = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const el = dateRef.current;
    if (!el) return;
    type WithShow = HTMLInputElement & { showPicker?: () => void };
    const withShow = el as WithShow;
    try {
      if (typeof withShow.showPicker === "function") {
        withShow.showPicker();
        return;
      }
    } catch {
      // some browsers throw if input isn't focusable yet
    }
    el.focus();
    el.click();
  };

  return (
    <div className="relative mt-2" onClick={() => {
        // Default click anywhere in the field opens the picker when the
        // value is empty, but lets the user keep typing once digits exist.
        if (!value) openPicker();
      }}
    >
      <input
        value={value}
        onChange={handleText}
        autoComplete="off"
        placeholder="DD/MM/YYYY"
        inputMode="numeric"
        maxLength={10}
        className="w-full rounded-xl bg-black/30 border border-white/10 pl-4 pr-12 py-3 text-lg font-mono tracking-widest text-foreground outline-none focus:border-[var(--primary-glow)]"
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label="Open calendar"
        className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-white/80 hover:text-white transition z-20"
        style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow-primary)" }}
      >
        <CalendarIcon size={16} />
      </button>
      {/* Native date picker overlays the calendar icon area; clicking it
          opens the dark-themed system date picker reliably even when
          showPicker() is blocked by the browser. */}
      <input
        ref={dateRef}
        type="date"
        value={iso}
        onChange={handlePicker}
        max={new Date().toISOString().slice(0, 10)}
        min="1900-01-01"
        style={{ colorScheme: "dark" }}
        aria-label="Pick date of birth"
        className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 opacity-0 cursor-pointer z-30"
      />
    </div>
  );
}