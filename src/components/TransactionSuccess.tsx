import { useEffect } from "react";
import { motion } from "motion/react";

export default function TransactionSuccess({
  onComplete,
  duration = 1800,
}: {
  onComplete?: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([15, 50, 15]);
      } catch {
        /* ignore */
      }
    }
    const t = setTimeout(() => onComplete?.(), duration);
    return () => clearTimeout(t);
  }, [onComplete, duration]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        background: "rgba(10,10,12,0.55)",
        backdropFilter: "blur(24px) saturate(160%)",
      }}
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        className="relative"
      >
        <svg width="132" height="132" viewBox="0 0 132 132" fill="none">
          <motion.circle
            cx="66"
            cy="66"
            r="58"
            stroke="#ffffff"
            strokeWidth="5"
            strokeLinecap="round"
            fill="transparent"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.55, ease: "easeInOut" }}
            style={{ rotate: -90, transformOrigin: "66px 66px" }}
          />
          <motion.path
            d="M40 68 L58 86 L92 50"
            stroke="#ffffff"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="transparent"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, ease: "easeOut", delay: 0.5 }}
          />
        </svg>
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0, duration: 0.35 }}
        className="mt-6 text-white text-xl font-semibold tracking-wide"
      >
        Done
      </motion.p>
    </motion.div>
  );
}