// image.js — client-side media prep for the Lizetka editor.
// Images are inlined as base64 into the post JSON, so we compress hard before
// encoding to fight multi-MB post bloat. PDFs are committed as separate files.

// Resize a chosen image File so its largest side is ≤ `max` px, then re-encode
// as JPEG at `quality`. Returns a `data:image/jpeg;base64,…` URL ready to drop
// straight into an `image`/gallery block's `src`.
export function compressImage(file, max = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const longest = Math.max(width, height);
      if (longest > max) {
        const scale = max / longest;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Nepodařilo se načíst obrázek: " + file.name));
    };
    img.src = url;
  });
}

// Read any File (used for PDFs) as raw base64 — no `data:…;base64,` prefix —
// which is exactly what a GitHub git blob with `encoding:'base64'` expects.
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("Čtení souboru selhalo"));
    reader.readAsDataURL(file);
  });
}

// Rough byte size of a base64 (or data-URL) string, for the size hints in the UI.
export function base64Bytes(s) {
  const b64 = String(s).split(",").pop() || "";
  return Math.round((b64.length * 3) / 4);
}
