import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Practice Streaks",
  description: "A.F.M's daily somatic practice tracker",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0f",
};

// Inline script to apply saved theme before first paint (prevents flash)
const themeScript = `
(function() {
  var t = localStorage.getItem('theme');
  if (t === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', '#f5f5f7');
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
