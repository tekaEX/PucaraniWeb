"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Wallet,
  Users,
  Settings,
  Bus,
  UserRound,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/login/actions";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/facturas", label: "Facturas", icon: Receipt },
  { href: "/cobranzas", label: "Cobranzas", icon: Wallet },
  { href: "/vehiculos", label: "Vehículos", icon: Bus },
  { href: "/choferes", label: "Choferes", icon: UserRound },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export function AppShell({
  children,
  userEmail,
  empresaNombre,
  demo = false,
}: {
  children: React.ReactNode;
  userEmail: string;
  empresaNombre: string;
  demo?: boolean;
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

      <nav className="flex-1 space-y-1 px-3 py-2">
        {nav.map((item) => {
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
      </nav>

      <div className="border-t border-white/10 px-3 py-3">
        <div className="px-2 pb-2 text-xs text-white/60 truncate" title={userEmail}>
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
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Sidebar de escritorio */}
      <aside className="hidden bg-[#1d1d1f] text-white lg:block">
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

      <main className="min-w-0 p-4 sm:p-6 lg:p-8">
        {demo ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <strong>Modo demostración.</strong> Estás viendo datos de ejemplo. Para
            guardar datos reales, conecta Supabase (ver{" "}
            <code className="rounded bg-amber-100 px-1">README.md</code>).
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
