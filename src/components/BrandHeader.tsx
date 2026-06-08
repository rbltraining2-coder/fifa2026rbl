import rblLogo from "@/assets/rbl-logo.png";
import superdryAsset from "@/assets/superdry-logo.png.asset.json";

export default function BrandHeader({
  size = 32,
  textClass = "text-sm",
}: {
  size?: number;
  textClass?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src={rblLogo}
        alt="RBL FIFA 2026 League"
        width={size}
        height={size}
        className="rounded-md object-contain"
        style={{ width: size, height: size }}
      />
      <span className={`${textClass} font-semibold tracking-wide text-white/95 leading-tight`}>
        RBL FIFA 2026 League
        <span className="text-white/55"> — Powered by </span>
        <img
          src={superdryAsset.url}
          alt="Superdry"
          className="inline-block w-auto align-middle h-4"
        />
      </span>
    </div>
  );
}