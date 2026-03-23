"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  Play,
  AlertTriangle,
  Sparkles,
  HeartPulse,
  Settings,
  Upload,
  GitCompare,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Optional list of roles allowed to see this item. Undefined = visible to all. */
  roles?: string[];
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Assets", href: "/dashboard/assets", icon: Upload },
  { label: "Knowledge Explorer", href: "/dashboard/knowledge", icon: BookOpen },
  { label: "Traceability", href: "/dashboard/traceability", icon: GitCompare },
  { label: "Execution", href: "/dashboard/execution", icon: Play },
  { label: "Triage", href: "/dashboard/triage", icon: AlertTriangle },
  { label: "Generation", href: "/dashboard/generation", icon: Sparkles },
  { label: "Healing", href: "/dashboard/healing", icon: HeartPulse },
  { label: "Admin", href: "/dashboard/admin", icon: Settings, roles: ["admin"] },
];

interface SidebarProps {
  /** Current user role. When provided, nav items are filtered by `roles`. */
  userRole?: string;
}

export function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname();

  const visibleItems = navItems.filter(
    (item) => !item.roles || (userRole && item.roles.includes(userRole))
  );

  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2 px-5 border-b border-sidebar-border">
        <Sparkles className="h-5 w-5 text-sidebar-accent-foreground" />
        <span className="text-lg font-semibold tracking-tight">Agentic AI</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-5 py-3">
        <p className="text-xs text-sidebar-foreground/50">v0.1.0</p>
      </div>
    </aside>
  );
}
