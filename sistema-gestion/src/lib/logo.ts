import fs from "node:fs";
import path from "node:path";
import type { Empresa } from "@/types/db";

export type LogoData = { buffer: Buffer; ext: "png" | "jpeg" };

// Obtiene el logo para incrustar en documentos:
// 1) el logo subido por la empresa (URL en Supabase Storage), si existe;
// 2) si no, un archivo local en public/logo.png (útil en modo demostración).
export async function loadLogo(empresa: Empresa | null): Promise<LogoData | null> {
  const url = empresa?.logo_url;
  if (url && /^https?:\/\//i.test(url)) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const ab = await res.arrayBuffer();
        const lower = url.toLowerCase();
        const ext: "png" | "jpeg" =
          lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "jpeg" : "png";
        return { buffer: Buffer.from(ab), ext };
      }
    } catch {
      // ignorar; probamos el fallback local
    }
  }

  for (const file of ["logo.png", "logo.jpg", "logo.jpeg"]) {
    try {
      const p = path.join(process.cwd(), "public", file);
      if (fs.existsSync(p)) {
        const ext: "png" | "jpeg" = file.endsWith(".png") ? "png" : "jpeg";
        return { buffer: fs.readFileSync(p), ext };
      }
    } catch {
      // continuar
    }
  }

  return null;
}
