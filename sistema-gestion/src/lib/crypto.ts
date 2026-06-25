import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Cifrado reversible AES-256-GCM (autenticado) para datos sensibles como la
// contraseña del certificado digital. La llave vive solo en el entorno.
// ENCRYPTION_KEY debe ser de 32 bytes en hexadecimal (64 caracteres).
// Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
function getKey(): Buffer {
  const key = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "hex");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY debe ser 32 bytes en hexadecimal (64 caracteres).",
    );
  }
  return key;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Formato de dato cifrado inválido.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
