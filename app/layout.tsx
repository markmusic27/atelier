import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

const description = "A workshop dedicated to asymmetric research bets in robot learning.";
// The title link previews show (iMessage shows only this, under the image); the tab says "Atelier".
const shareTitle = "Atelier: a workshop for asymmetric bets in robotics";

// The share image is app/opengraph-image.png (and twitter-image.png), a capture of app/thumbnail.
export const metadata: Metadata = {
  metadataBase: new URL("https://atelierlab.io"),
  title: "Atelier",
  description,
  openGraph: { title: shareTitle, description, url: "/", siteName: "Atelier", type: "website" },
  twitter: { card: "summary_large_image", title: shareTitle, description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
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
