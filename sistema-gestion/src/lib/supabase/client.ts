import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

// Cliente de Supabase para componentes del navegador ("use client").
export function createClient() {
  const { url, anonKey } = supabaseEnv();
  return createBrowserClient(url, anonKey);
}
