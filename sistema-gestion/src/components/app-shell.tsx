"use client";

import { useState } from "react";
// "Route" ya lo ocupa el icono de lucide (el de Viajes), así que el tipo de
// ruta de Next entra con otro nombre.
import type { Route as Ruta } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Users,
  Settings,
  Bus,
  UserRound,
  LogOut,
  Menu,
  X,
  CalendarDays,
  Route,
  Car,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/login/actions";
import { PeriodoSelector } from "@/components/periodo-selector";
import { Notificaciones } from "@/components/notificaciones";
import type { Alerta } from "@/lib/vencimientos";

type NavItem = {
  // Con typedRoutes, cada literal de `grupos` se valida acá abajo: una ruta que
  // no existe deja de compilar en vez de dar 404 en producción.
  href: Ruta;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const grupos: { label?: string; items: NavItem[] }[] = [
  { items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true }] },
  {
    label: "Operación",
    items: [
      { href: "/cotizaciones", label: "Cotizaciones", icon: FileText },
      { href: "/viajes", label: "Viajes", icon: Route },
      { href: "/facturas", label: "Facturas", icon: Receipt },
    ],
  },
  // NO va acá un grupo "Finanzas". Se agregó uno y era menú de más: sus dos
  // entradas apuntaban a rutas que ya no son pantallas —/finanzas redirige al
  // Dashboard y /cobranzas a Clientes— porque su contenido se fusionó ahí. Eran
  // dos ítems que llevaban a otros dos ítems del mismo menú.
  //
  // El resumen financiero ESTÁ en el Dashboard, y el estado de cuenta de cada
  // cliente está en su acordeón dentro de Clientes. Las dos rutas se conservan
  // como redirección para los enlaces guardados, no como sección.
  {
    label: "Taxis",
    items: [{ href: "/taxis", label: "Gestión de taxis", icon: Car }],
  },
  {
    label: "Datos",
    items: [
      { href: "/vehiculos", label: "Vehículos", icon: Bus },
      { href: "/choferes", label: "Choferes", icon: UserRound },
      { href: "/clientes", label: "Clientes", icon: Users },
    ],
  },
];

export function AppShell({
  children,
  userEmail,
  empresaNombre,
  periodoAnio,
  periodoMes,
  alertas,
}: {
  children: React.ReactNode;
  userEmail: string;
  empresaNombre: string;
  periodoAnio: number;
  periodoMes: number | null;
  alertas: Alerta[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand text-brand-foreground">
          <Bus className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">{empresaNombre}</div>
          <div className="text-[11px] text-white/60">Gestión interna</div>
        </div>
      </div>

      <nav className="flex-1 space-y-3 overflow-y-auto px-3 py-2">
        {grupos.map((grupo, gi) => (
          <div key={gi} className="space-y-1">
            {grupo.label ? (
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                {grupo.label}
              </p>
            ) : null}
            {grupo.items.map((item) => {
              const active = isActive(item.href, item.exact);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:bg-white/[0.06] hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Pie del menú, en el orden en que se lee: primero DE QUIÉN es la sesión,
          después cómo salir de ella, y al final Configuración. */}
      <div className="space-y-1 border-t border-white/10 px-3 py-3">
        <div className="px-2 py-1 text-xs text-white/60 truncate" title={userEmail}>
          {userEmail}
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </form>
        <Link
          href="/configuracion"
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive("/configuracion")
              ? "bg-white/10 text-white"
              : "text-white/60 hover:bg-white/[0.06] hover:text-white",
          )}
        >
          <Settings className="h-4 w-4" />
          Configuración
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Sidebar de escritorio: fijo; solo scrollea el contenido */}
      <aside className="hidden bg-[#1d1d1f] text-white lg:sticky lg:top-0 lg:block lg:h-screen">
        {SidebarContent}
      </aside>

      {/* Barra superior móvil */}
      <header className="flex items-center justify-between bg-[#1d1d1f] px-4 py-3 text-white lg:hidden">
        <div className="flex items-center gap-2">
          <Bus className="h-5 w-5" />
          <span className="text-sm font-semibold">{empresaNombre}</span>
        </div>
        <button onClick={() => setOpen(true)} aria-label="Abrir menú">
          <Menu className="h-6 w-6" />
        </button>
      </header>

      {/* Drawer móvil */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 bg-[#1d1d1f] text-white shadow-xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 text-white/70"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
            {SidebarContent}
          </div>
        </div>
      ) : null}

      <main className="min-w-0">
        {/* Barra de periodo global (siempre visible) */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur lg:px-8">
          <div className="flex items-center gap-2 text-xs text-muted">
            <CalendarDays className="h-4 w-4 text-brand" />
            <span className="hidden sm:inline">Periodo</span>
          </div>
          <div className="flex items-center gap-2">
            <Notificaciones alertas={alertas} />
            <PeriodoSelector anio={periodoAnio} mes={periodoMes} />
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
