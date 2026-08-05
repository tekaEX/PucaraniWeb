-- ============================================================================
-- 0023 — Guarda la geometría real (por calles) de la ruta
-- Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- generarRuta() ya le pedía a OSRM el polyline real de la ruta (para sacar
-- distancia/duración), pero lo descartaba — el mapa del chofer solo tenía
-- los puntos (paradas), no el trazado por calles para llegar de una a otra.
-- Se guarda como jsonb: array de [lng, lat] tal como lo entrega OSRM
-- (formato GeoJSON), sin tabla aparte porque es de solo lectura y siempre
-- se reemplaza entera junto con el resto de la ruta.
-- ============================================================================

alter table encomienda_rutas add column if not exists geometria jsonb;
