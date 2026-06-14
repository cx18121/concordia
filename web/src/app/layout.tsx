import type { Metadata } from "next";
// globals.css imports shell.css into Tailwind's `base` layer (see globals.css),
// so the dark theme applies and Tailwind utilities still win on the ported pages.
import "./globals.css";
import { AppProviders } from "@/lib/providers";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Concordia",
  description: "A community hedge fund where skill, not just capital, decides where the money goes.",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* shell.css hardcodes the family strings "Inter" and "Outfit",
            so we load those exact families via the same Google Fonts link
            the mocks use (see redesign/mockups/cinematic.html). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* In the root layout this link applies to every route, so the
            "single page" warning is a false positive here. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Material Symbols — leaderboard/account/settings/forum ports use these
            icon glyphs. display=block is intentional: it renders the glyph blank
            until the font loads instead of flashing the raw ligature text (e.g.
            "north_east"). The rule prefers swap, but that's wrong for an icon font. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppProviders>
          {/* Global ambient background — layout owns it; pages must not duplicate .amb. */}
          <div className="amb">
            <i className="a" />
            <i className="b" />
          </div>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
