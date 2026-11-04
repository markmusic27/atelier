import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";



export const metadata: Metadata = {
  title: "Atelier",
  description: "Atelier is a workshop for robot learning.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The mobile toggles data-stacked on <html> after hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        {/* Marks <html> with .fk if FK Roman is installed (same local names as in globals.css). */}
        <Script id="fk-check" strategy="beforeInteractive">
          {`new FontFace("fk-check", 'local("FK Roman Standard Trial Regular"), local("FKRomanStandardTrial-Regular")').load().then(function () { document.documentElement.classList.add("fk"); }, function () {});`}
        </Script>
      </head>
      <body className="bg-paper font-serif text-[15.5px] leading-[1.7] text-ink antialiased md:text-[16.5px]">
        {children}
      </body>
    </html>
  );
}
