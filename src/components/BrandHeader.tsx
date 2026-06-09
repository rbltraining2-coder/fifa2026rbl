import rblLogoAsset from "@/assets/new-rbl-logo.png.asset.json";
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
        src={rblLogoAsset.url}
        alt="RBL World Cup League 2026"
        width={size}
        height={size}
        className="rounded-md object-contain"
        style={{ width: size, height: size }}
      />
      <span className={`${textClass} font-semibold tracking-wide text-white/95 leading-tight`}>
        RBL World Cup League 2026
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