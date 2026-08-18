import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Cifrado reversible AES-256-GCM (autenticado) para datos sensibles como la
// contraseña del certificado digital. La llave vive solo en el entorno.
// ENCRYPTION_KEY debe ser de 32 bytes en hexadecimal (64 caracteres).
// Generar con:
//   node -e "import('node:crypto').then(c=>console.log(c.randomBytes(32).toString('hex')))"
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
  // dataHex se compara contra undefined y no con "!": cifrar un texto VACÍO da
  // cero bytes de contenido, o sea "iv:tag:", y con "!dataHex" ese payload
  // —perfectamente válido, generado por este mismo módulo— se rechazaba como
  // corrupto. Hoy no se llega ahí (quien guarda la clave del certificado no
  // deja pasar el vacío), pero un cifrador que no puede leer lo que él mismo
  // escribió es una trampa esperando al próximo que lo use.
  if (!ivHex || !tagHex || dataHex === undefined) {
    throw new Error("Formato de dato cifrado inválido.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
