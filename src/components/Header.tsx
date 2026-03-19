"use client";

import { useState, useEffect } from "react";
import { Bell, Search, HelpCircle, ChevronDown } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
}

export default function Header({ title, subtitle, breadcrumbs }: HeaderProps) {
  const [userName, setUserName] = useState("User");
  const [userRole, setUserRole] = useState("Member");

  useEffect(() => {
    import("../lib/api").then((api) => {
      const name = api.getUserName();
      const email = api.getUserEmail();
      const isLoggedIn = api.isAuthenticated();

      if (name) {
        setUserName(name);
        setUserRole("Member");
      } else if (email) {
        // Derive name from email if name wasn't saved
        const derived = email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
        setUserName(derived);
        setUserRole("Member");
      } else if (isLoggedIn) {
        setUserName("User");
        setUserRole("Member");
      } else {
        setUserName("User");
        setUserRole("Guest");
      }
    });
  }, []);

  // Get initials
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  const initials = getInitials(userName);

  return (
    <header className="h-14 bg-white border-b border-border-subtle flex items-center justify-between px-6 sticky top-0 z-20">
      {/* Left: Breadcrumbs / Title */}
      <div className="flex items-center gap-2">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav className="flex items-center gap-1.5 text-sm">
            {breadcrumbs.map((crumb, index) => (
              <span key={index} className="flex items-center gap-1.5">
                {index > 0 && <span className="text-text-muted">›</span>}
                {crumb.href ? (
                  <a
                    href={crumb.href}
                    className="text-text-muted hover:text-text-primary transition-colors"
                  >
                    {crumb.label}
                  </a>
                ) : (
                  <span className="text-text-primary font-medium">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : (
          <h1 className="text-sm font-semibold text-text-primary">{title}</h1>
        )}
      </div>

      {/* Right: Search, Notifications, Profile */}
      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search projects or devices..."
            className="pl-9 pr-4 py-2 bg-surface-muted border border-border-subtle rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 w-64 transition-all"
          />
        </div>

        <button className="relative p-2 rounded-lg text-text-muted hover:bg-surface-muted hover:text-text-secondary transition-colors">
          <Bell className="w-[18px] h-[18px]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
        </button>

        <button className="p-2 rounded-lg text-text-muted hover:bg-surface-muted hover:text-text-secondary transition-colors">
          <HelpCircle className="w-[18px] h-[18px]" />
        </button>

        <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-border-subtle">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center">
            <span className="text-xs font-semibold text-white">{initials}</span>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-text-primary leading-tight">{userName}</p>
            <p className="text-[10px] text-text-muted">{userRole}</p>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
        </div>
      </div>
    </header>
  );
}
