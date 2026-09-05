import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "MD2YT — Dashboard",
  description: "Pipeline control for markdown-to-YouTube video generation.",
};

/* ================================================================
   ROOT LAYOUT
   Wraps all pages with the persistent sidebar navigation.
   ================================================================ */

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden bg-bg">
        {/* ================================================================
           SIDEBAR NAVIGATION
           Fixed sidebar with user profile and navigation links.
           ================================================================ */}
        <Sidebar />

        {/* ================================================================
           MAIN CONTENT AREA
           Scrollable content area that fills remaining width.
           ================================================================ */}
        <main className="flex-1 overflow-hidden rounded-3xl my-4 mr-4 bg-bg-elevated">
          {children}
        </main>
      </body>
    </html>
  );
}
