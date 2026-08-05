// Script de un solo uso: carga pedidos de PRUEBA con direcciones reales de
// Arica (geocodificadas con Nominatim, igual que hace la app) para poder
// probar generarRuta() y el modo navegación del chofer sin tener que
// tipearlos a mano uno por uno. Se borra después de usarse.
//
// Uso: node --env-file=.env.local scripts/seed-encomiendas-prueba.js

const { createClient } = require("@supabase/supabase-js");

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "sistema-gestion-pucarani/1.0 (encomiendas; contacto: admin de la empresa)";

const PEDIDOS_PRUEBA = [
  { nombre: "Prueba — Centro", telefono: "+56911111111", direccion: "Sotomayor 300" },
  { nombre: "Prueba — 18 de Septiembre", telefono: "+56911111112", direccion: "Av. 18 de Septiembre 1000" },
  { nombre: "Prueba — Costanera", telefono: "+56911111113", direccion: "Av. Comandante San Martín 100" },
  { nombre: "Prueba — Terminal", telefono: "+56911111114", direccion: "Av. Argentina 300" },
  { nombre: "Prueba — Sector Alto", telefono: "+56911111115", direccion: "Av. Capitán Ávalos 1500" },
  { nombre: "Prueba — Diego Portales", telefono: "+56911111116", direccion: "Av. Diego Portales 2000" },
  { nombre: "Prueba — Chacabuco", telefono: "+56911111117", direccion: "Chacabuco 500" },
];

async function geocodificar(direccion) {
  const params = new URLSearchParams({ q: `${direccion}, Arica, Chile`, format: "json", limit: "1" });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  const primero = data[0];
  if (!primero) return null;
  return { lat: Number(primero.lat), lng: Number(primero.lon) };
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno.");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  for (const pedido of PEDIDOS_PRUEBA) {
    const geo = await geocodificar(pedido.direccion);
    if (!geo) {
      console.warn(`⚠️  No se pudo geocodificar: ${pedido.direccion} — se omite.`);
      continue;
    }

    const { error } = await supabase.from("encomienda_pedidos").insert({
      destinatario_nombre: pedido.nombre,
      destinatario_telefono: pedido.telefono,
      destinatario_direccion: pedido.direccion,
      destinatario_lat: geo.lat,
      destinatario_lng: geo.lng,
      notas: "Pedido de prueba (cargado por script, ver scripts/seed-encomiendas-prueba.js)",
    });

    if (error) {
      console.error(`❌ ${pedido.direccion}: ${error.message}`);
    } else {
      console.log(`✅ ${pedido.direccion} → ${geo.lat}, ${geo.lng}`);
    }

    // Nominatim pide no golpearlo en paralelo/seguido — un pedido por segundo.
    await esperar(1100);
  }
}

main();
