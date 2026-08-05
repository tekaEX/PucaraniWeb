"use client";

// TRASPASO ÚNICO, DE VIDA CORTA. Trae al teléfono los pedidos pendientes que
// quedaron en encomienda_pedidos cuando la operación vivía en la base. Existe
// solo para que el cambio no pierda trabajo en curso.
//
// ⚠️ ESTE ARCHIVO SE BORRA junto con la migración 0027, que retira
// encomienda_pedidos. Después de eso la tabla no existe y todo esto sobra: si
// queda, no rompe nada (los errores se tragan a propósito, ver abajo), pero es
// código muerto que confunde.
//
// Por qué es un botón y NO automático: encomienda_pedidos no tiene dueño —los
// pedidos son de la empresa y generarRuta le daba TODOS al chofer que la
// ejecutara. Si el traspaso corriera solo al abrir la app, dos choferes se
// llevarían los mismos paquetes y saldrían a repartir lo mismo. Con un botón, el
// administrador le dice a UNO que lo apriete, una vez.

import { createClient } from "@/lib/supabase/client";
import { agregarFaltantes, idsGuardados, type PedidoLocal } from "./almacen";
import type { EncomiendaPedido } from "@/types/db";

function aPedidoLocal(fila: EncomiendaPedido): PedidoLocal {
  return {
    // Se conserva el id de la base: hace que apretar el botón dos veces no
    // duplique nada, sin necesidad de recordar que ya se hizo.
    id: fila.id,
    nombre: fila.destinatario_nombre,
    telefono: fila.destinatario_telefono,
    direccion: fila.destinatario_direccion,
    lat: fila.destinatario_lat,
    lng: fila.destinatario_lng,
    notas: fila.notas,
    estado: "pendiente",
    // La fecha original, no la de hoy: así el orden de la lista y "cuánto lleva
    // sin entregarse" siguen siendo verdad después del traspaso.
    cargadoEn: fila.created_at,
  };
}

// Los pendientes de la base que todavía NO están en este teléfono. Devuelve []
// ante cualquier error —sin señal, o la tabla ya retirada por la 0027— porque
// esto es un aviso de transición: no tiene por qué interrumpir la jornada ni
// mostrarle un problema al chofer.
export async function pendientesPorTraer(): Promise<PedidoLocal[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("encomienda_pedidos")
      .select("*")
      .eq("estado", "pendiente")
      .returns<EncomiendaPedido[]>();
    if (error || !data) return [];

    const yaEstan = await idsGuardados();
    return data.filter((f) => !yaEstan.has(f.id)).map(aPedidoLocal);
  } catch {
    return [];
  }
}

/** Guarda en el teléfono los pendientes que falten. Devuelve cuántos entraron. */
export async function traerPendientes(): Promise<number> {
  const porTraer = await pendientesPorTraer();
  return agregarFaltantes(porTraer);
}
