import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Mind — Play Together",
  description: "A cooperative number-card game for friends.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
