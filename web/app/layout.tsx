import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MD2YT — brief uploader",
  description: "Drop a markdown content brief, generate a spec, render to MP4.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}