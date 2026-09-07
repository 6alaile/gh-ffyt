"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ================================================================
   SIDEBAR NAVIGATION
   Persistent sidebar with user profile and navigation links.
   ================================================================ */

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { label: "New Video", href: "/new-video", icon: "M12 4v16m8-8H4" },
  { label: "History", href: "/history", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  { label: "Channel Stats", href: "/channel-stats", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { label: "Settings", href: "/settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
  { label: "Brief", href: "/brief-form", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-52 flex-shrink-0 flex flex-col px-6 py-8 bg-bg">
      {/* ================================================================
         USER PROFILE SECTION
         Displays user avatar, name, and notification badge.
         ================================================================ */}
      <div className="flex flex-col items-start mb-10">
        <div className="relative mb-4">
          <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-white/10">
            <div
              className="w-full h-full flex items-end justify-center"
              style={{ background: "linear-gradient(to bottom, #FFD700, #B8860B)" }}
            >
              <svg viewBox="0 0 64 64" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <rect width="64" height="64" fill="#B8860B" />
                <ellipse cx="32" cy="24" rx="12" ry="13" fill="#FFD700" />
                <ellipse cx="32" cy="62" rx="22" ry="18" fill="#FFD700" />
                <path d="M20 24 Q20 10 32 10 Q44 10 44 24" fill="#1a1500" />
                <path d="M18 26 Q20 18 32 16 Q44 18 46 26 Q44 30 32 30 Q20 30 18 26" fill="#B8860B" />
              </svg>
            </div>
          </div>
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-accent text-bg text-[10px] font-bold flex items-center justify-center">
            4
          </span>
        </div>
        <p className="text-fg font-bold text-lg leading-tight">MD2YT</p>
        <p className="text-fg-muted text-[12px] mt-0.5">Faceless Video Factory</p>
      </div>

      {/* ================================================================
         NAVIGATION LINKS
         Main navigation with active state highlighting.
         ================================================================ */}
      <nav className="flex flex-col gap-1" role="navigation" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] font-semibold transition-all duration-fast ease-out-expo ${
                isActive
                  ? "text-fg bg-bg-elevated"
                  : "text-fg-muted hover:text-fg hover:bg-bg-elevated/50"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
