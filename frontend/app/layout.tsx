"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Sora, Inter } from "next/font/google";
import { useTheme } from "next-themes";
import {
  BarChart3, Bot, Database, FileText, Gauge, Map,
  MessageSquare, WandSparkles, ChevronDown, LogOut,
  User, Bell, Menu, X, Zap, Globe, Sun, Moon
} from "lucide-react";
import "./globals.css";
import { Providers } from "./providers";

const sora = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const nav = [
  { label: "Dashboard",   href: "/dashboard",   icon: Gauge },
  { label: "Analytics",   href: "/analytics",   icon: BarChart3 },
  { label: "Forecasting", href: "/forecasting", icon: Map },
  { label: "Planning",    href: "/planning",    icon: WandSparkles },
  { label: "Simulation",  href: "/simulation",  icon: Bot },
  { label: "Chat",        href: "/chat",        icon: MessageSquare },
  { label: "Reports",     href: "/reports",     icon: FileText },
  { label: "Admin",       href: "/admin",       icon: Database },
] as const;

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button className="btn-icon" aria-label="Toggle theme">
        <Sun size={15} />
      </button>
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      className="btn-icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const isAuth = pathname?.startsWith("/login") || pathname?.startsWith("/register");
  if (isAuth) return null;

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        {/* Logo */}
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--city-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #7C5CFC, #5C3CFC)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 20px rgba(124,92,252,0.35)"
            }}>
              <Globe size={18} color="white" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--city-text)", fontFamily: "var(--font-display)" }}>CityTwin AI</div>
              <div style={{ fontSize: 11, color: "var(--city-text-muted)" }}>Urban Intelligence</div>
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--city-violet)", boxShadow: "0 0 8px var(--city-violet)" }} />
            <span style={{ fontSize: 11, color: "var(--city-violet)", fontWeight: 600 }}>System Online</span>
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--city-text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", padding: "6px 12px 10px" }}>
            Navigation
          </div>
          {nav.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(href);
            return (
              <Link key={href} href={href} onClick={onClose}
                className={`nav-link ${active ? "active" : ""}`}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 7, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  background: active ? "rgba(124, 92, 252, 0.12)" : "var(--city-surface-3)",
                  border: "1px solid",
                  borderColor: active ? "rgba(124, 92, 252, 0.25)" : "var(--city-border-light)",
                  flexShrink: 0,
                }}>
                  <Icon size={14} color={active ? "var(--city-violet)" : "var(--city-text-muted)"} />
                </div>
                {label}
                {active && (
                  <div style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: "50%", background: "var(--city-violet)" }} />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div style={{ padding: "14px 10px", borderTop: "1px solid var(--city-border)" }}>
          <div className="nav-link" style={{ cursor: "default" }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "linear-gradient(135deg, #7C5CFC, #5C3CFC)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
            }}>
              <User size={14} color="white" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--city-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>City Analyst</div>
              <div style={{ fontSize: 10, color: "var(--city-text-muted)" }}>admin@citytwin.ai</div>
            </div>
            <Link href="/login" onClick={() => localStorage.removeItem("access_token")} style={{ color: "var(--city-text-muted)", display: "flex" }}>
              <LogOut size={14} />
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}

function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const isAuth = pathname?.startsWith("/login") || pathname?.startsWith("/register");
  if (isAuth) return null;

  const current = nav.find(n => pathname === n.href || pathname?.startsWith(n.href));

  const [selectedCity, setSelectedCity] = useState("Metro City");
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, type: "critical", title: "Traffic Congestion", desc: "Route 4 interchange delay is now ~22 mins.", time: "5 mins ago", read: false },
    { id: 2, type: "warning", title: "Air Quality Alert", desc: "PM2.5 levels exceeding safety limits in East Suburbs.", time: "1 hr ago", read: false },
    { id: 3, type: "info", title: "Simulation Done", desc: "Digital twin scenario model completed successfully.", time: "2 hrs ago", read: false },
  ]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleNotificationClick = (id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".city-selector-trigger")) {
        setCityDropdownOpen(false);
      }
      if (!target.closest(".notifications-trigger")) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  return (
    <header className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="btn-icon lg:hidden" onClick={onMenuClick}>
          <Menu size={16} />
        </button>
        <div>
          <div style={{ fontSize: 11, color: "var(--city-text-muted)", letterSpacing: "0.04em" }}>
            {current ? "Module" : "CityTwin AI"}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--city-text)", display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-display)" }}>
            {current?.label || "Dashboard"}
            <Zap size={13} color="var(--city-violet)" />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Theme Switcher */}
        <ThemeToggle />

        {/* City selector */}
        <div style={{ position: "relative" }} className="city-selector-trigger">
          <button
            onClick={() => setCityDropdownOpen(prev => !prev)}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
              background: "var(--city-surface)", border: "1px solid var(--city-border)",
              borderRadius: 8, fontSize: 12, color: "var(--city-text)", cursor: "pointer",
              transition: "all 0.15s"
            }}
          >
            <Globe size={13} color="var(--city-violet)" />
            <span>{selectedCity}</span>
            <ChevronDown size={12} color="var(--city-text-muted)" style={{ transform: cityDropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
          </button>
          
          {cityDropdownOpen && (
            <div style={{
              position: "absolute", right: 0, top: "calc(100% + 8px)", width: 180,
              background: "var(--city-surface)", border: "1px solid var(--city-border)",
              borderRadius: 10, boxShadow: "0 10px 25px rgba(0, 0, 0, 0.12)",
              padding: "6px", display: "flex", flexDirection: "column", gap: 2,
              zIndex: 100, backdropFilter: "blur(12px)"
            }}>
              {["Metro City", "West Coast Hub", "East Coast Sector", "Industrial Zone"].map(city => (
                <button
                  key={city}
                  onClick={() => {
                    setSelectedCity(city);
                    setCityDropdownOpen(false);
                  }}
                  style={{
                    width: "100%", padding: "8px 10px", textAlign: "left", fontSize: 12,
                    borderRadius: 6, border: "none", background: selectedCity === city ? "rgba(124, 92, 252, 0.08)" : "transparent",
                    color: selectedCity === city ? "var(--city-violet)" : "var(--city-text)",
                    fontWeight: selectedCity === city ? 600 : 500, cursor: "pointer",
                    transition: "all 0.15s"
                  }}
                  onMouseEnter={(e) => {
                    if (selectedCity !== city) e.currentTarget.style.background = "var(--city-surface-3)";
                  }}
                  onMouseLeave={(e) => {
                    if (selectedCity !== city) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {city}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notification bell */}
        <div style={{ position: "relative" }} className="notifications-trigger">
          <button 
            className="btn-icon" 
            onClick={() => setNotificationsOpen(prev => !prev)}
            style={{ position: "relative" }}
            aria-label="Notifications"
          >
            <Bell size={15} />
            {unreadCount > 0 && (
              <span style={{
                position: "absolute", top: 6, right: 6, width: 6, height: 6,
                borderRadius: "50%", background: "var(--city-coral)",
                boxShadow: "0 0 6px var(--city-coral)"
              }} />
            )}
          </button>

          {notificationsOpen && (
            <div style={{
              position: "absolute", right: 0, top: "calc(100% + 8px)", width: 320,
              background: "var(--city-surface)", border: "1px solid var(--city-border)",
              borderRadius: 12, boxShadow: "0 10px 30px rgba(0, 0, 0, 0.15)",
              padding: "12px 0 0", zIndex: 100, display: "flex", flexDirection: "column",
              overflow: "hidden"
            }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 14px 10px", borderBottom: "1px solid var(--city-border-light)" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--city-text)", fontFamily: "var(--font-display)" }}>Notifications</span>
                {unreadCount > 0 && (
                  <button 
                    onClick={markAllRead}
                    style={{ fontSize: 11, color: "var(--city-violet)", fontWeight: 600, border: "none", background: "none", cursor: "pointer" }}
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              {/* List */}
              <div style={{ maxHeight: 250, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                {notifications.map(n => {
                  let badgeBg = "rgba(124, 92, 252, 0.12)";
                  let badgeText = "var(--city-violet)";
                  let borderLeftColor = "transparent";
                  if (n.type === "critical") {
                    badgeBg = "rgba(251, 113, 133, 0.12)";
                    badgeText = "var(--city-coral)";
                    borderLeftColor = "var(--city-coral)";
                  } else if (n.type === "warning") {
                    badgeBg = "rgba(251, 191, 36, 0.12)";
                    badgeText = "var(--city-amber)";
                    borderLeftColor = "var(--city-amber)";
                  } else {
                    borderLeftColor = "var(--city-violet)";
                  }

                  return (
                    <div 
                      key={n.id} 
                      onClick={() => handleNotificationClick(n.id)}
                      style={{ 
                        padding: "10px 14px", 
                        borderBottom: "1px solid var(--city-border-light)", 
                        cursor: "pointer",
                        background: n.read ? "transparent" : "var(--city-surface-3)",
                        borderLeft: `3px solid ${borderLeftColor}`,
                        transition: "background 0.15s"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--city-surface-3)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = n.read ? "transparent" : "var(--city-surface-2)";
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--city-text)" }}>{n.title}</span>
                        {!n.read && (
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--city-violet)" }} />
                        )}
                      </div>
                      <p style={{ fontSize: 11, color: "var(--city-text-dim)", lineHeight: 1.4, marginBottom: 4 }}>{n.desc}</p>
                      <span style={{ fontSize: 9, color: "var(--city-text-muted)" }}>{n.time}</span>
                    </div>
                  );
                })}
                {notifications.length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--city-text-muted)" }}>
                    No notifications
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Avatar */}
        <Link href="/login" onClick={() => localStorage.removeItem("access_token")}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "linear-gradient(135deg, #7C5CFC, #5C3CFC)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", boxShadow: "0 0 12px rgba(124,92,252,0.35)"
          }}>
            <User size={15} color="white" />
          </div>
        </Link>
      </div>
    </header>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const isAuth = pathname?.startsWith("/login") || pathname?.startsWith("/register");
    if (isAuth) return;
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.replace("/login");
    }
  }, [pathname, router]);

  return (
    <html lang="en" className={`${sora.variable} ${inter.variable}`}>
      <head>
        <title>CityTwin AI — Smart City Intelligence Platform</title>
        <meta name="description" content="AI-powered urban intelligence: analytics, forecasting, digital twin simulation, and planning recommendations." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌆</text></svg>" />
      </head>
      <body>
        <Providers>
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <div className="main-content">
            <TopBar onMenuClick={() => setSidebarOpen(v => !v)} />
            <main className="page-body animate-fade-in">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
