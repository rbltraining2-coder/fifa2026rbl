import { supabase } from "@/integrations/supabase/client";

/**
 * Crop to centered square, resize to 200x200, encode WebP at ~80% quality.
 * Returns the file URL after uploading to the `avatars` bucket under
 * `{userId}/avatar.webp`.
 */
export async function compressAndUploadAvatar(file: File, userId: string): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Read failed"));
    r.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Image decode failed"));
    i.src = dataUrl;
  });

  const size = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - size) / 2;
  const sy = (img.naturalHeight - size) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, size, size, 0, 0, 200, 200);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Encode failed"))),
      "image/webp",
      0.82,
    );
  });

  const path = `${userId}/avatar.webp`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, blob, { upsert: true, contentType: "image/webp", cacheControl: "3600" });
  if (error) throw error;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  // Cache-bust so the new image appears immediately.
  return `${data.publicUrl}?v=${Date.now()}`;
}