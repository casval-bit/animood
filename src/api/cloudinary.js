// ─── Cloudinary upload helper ─────────────────────────────────────────────────
const CLOUD_NAME    = "feuvpnj8";
const UPLOAD_PRESET = "animoodpic";
const UPLOAD_URL    = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

/**
 * Upload a File or Blob to Cloudinary.
 * Returns the secure URL string, or throws on error.
 * @param {File} file
 * @param {"avatar"|"post"} type  — controls max resize dimensions
 */
export async function uploadToCloudinary(file, type = "post", lang = "fr") {
  // Validate
  if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)) {
    throw new Error(lang === "en" ? "Unsupported format — JPG, PNG, WebP or GIF only" : "Format non supporté — JPG, PNG, WebP ou GIF uniquement");
  }
  if(file.size > 10 * 1024 * 1024) {
    throw new Error(lang === "en" ? "File too large — max 10MB" : "Fichier trop lourd — max 10 Mo");
  }

  // Resize client-side before upload to save bandwidth
  const resized = await resizeImage(file, type === "avatar" ? 256 : 800);

  const fd = new FormData();
  fd.append("file",         resized);
  fd.append("upload_preset", UPLOAD_PRESET);

  const res = await fetch(UPLOAD_URL, { method: "POST", body: fd });
  if(!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err?.error?.message || `Cloudinary error ${res.status}`);
  }
  const data = await res.json();
  return data.secure_url;
}

/**
 * Resize an image file to maxPx on the longest side.
 * Returns a Blob (JPEG).
 */
function resizeImage(file, maxPx) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1);
        const w = Math.round(img.width  * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width  = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => {
          if(!blob) { reject(new Error("Resize failed")); return; }
          resolve(new File([blob], file.name, { type: "image/jpeg" }));
        }, "image/jpeg", 0.85);
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
