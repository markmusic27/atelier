import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

const description = "A research workshop for people exploring unconventional ideas in robot learning.";
// The page calls itself Atelier; the tab and link previews use the fuller "Atelier Robotics". (No
// separator in it: iMessage cuts "Atelier | " or "Atelier: " off a title, taking it for the site
// name since it matches the domain.)
const title = "Atelier Robotics";

// The share image is app/opengraph-image.png (and twitter-image.png), a capture of app/thumbnail.
export const metadata: Metadata = {
  metadataBase: new URL("https://atelierlab.io"),
  title,
  description,
  openGraph: { title, description, url: "/", type: "website" },
  twitter: { card: "summary_large_image", title, description },
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
