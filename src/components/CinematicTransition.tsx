import { motion } from "framer-motion";
import { useEffect } from "react";
import rblLogoAsset from "@/assets/new-rbl-logo.png.asset.json";

export default function CinematicTransition({
  onComplete,
  durationMs = 2200,
}: {
  onComplete: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onComplete, durationMs);
    return () => clearTimeout(t);
  }, [onComplete, durationMs]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at center, #0b1530 0%, #050813 65%, #000 100%)",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Stadium light sweep */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)",
          mixBlendMode: "screen",
        }}
        initial={{ x: "-100%" }}
        animate={{ x: "100%" }}
        transition={{ duration: 1.6, ease: "easeInOut", delay: 0.2 }}
      />

      {/* Soft vignette glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at center, rgba(96,165,250,0.25) 0%, transparent 55%)",
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0, 1, 0.7], scale: [0.8, 1.2, 1] }}
        transition={{ duration: 2, ease: "easeOut" }}
      />

      <div className="relative flex flex-col items-center gap-6 px-6 text-center">
        <motion.div
          className="relative"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: [0.6, 1.05, 1], opacity: 1 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            className="absolute inset-0 rounded-full blur-3xl"
            style={{ background: "rgba(96,165,250,0.55)" }}
            animate={{ opacity: [0.4, 0.9, 0.4], scale: [0.9, 1.15, 0.9] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
          <img
            src={rblLogoAsset.url}
            alt="RBL World Cup League 2026"
            className="relative w-40 h-40 object-contain drop-shadow-[0_12px_40px_rgba(96,165,250,0.6)]"
          />
        </motion.div>

        <motion.h2
          className="relative text-white text-2xl sm:text-3xl font-black tracking-[0.2em] uppercase"
          initial={{ opacity: 0, y: 12, letterSpacing: "0.05em" }}
          animate={{ opacity: 1, y: 0, letterSpacing: "0.2em" }}
          transition={{ duration: 0.9, delay: 0.5, ease: "easeOut" }}
        >
          Welcome to the RBL World Cup League 2026
        </motion.h2>

        <motion.div
          className="h-[2px] w-40 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(147,197,253,0.9), transparent)",
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.7, ease: "easeOut" }}
        />

        <motion.p
          className="text-xs uppercase tracking-[0.4em] text-white/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.1 }}
        >
          RBL World Cup League 2026
        </motion.p>
      </div>
    </motion.div>
  );
}