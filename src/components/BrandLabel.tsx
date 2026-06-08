import superdryAsset from "@/assets/superdry-logo.png.asset.json";

export default function BrandLabel({
  brand,
  fallback = "Not Assigned",
  imgClassName = "h-4",
}: {
  brand: string | null | undefined;
  fallback?: string;
  imgClassName?: string;
}) {
  if (!brand) return <>{fallback}</>;
  if (brand.trim().toLowerCase() === "superdry") {
    return (
      <img
        src={superdryAsset.url}
        alt="Superdry"
        className={`inline-block w-auto align-middle ${imgClassName}`}
      />
    );
  }
  return <>{brand}</>;
}