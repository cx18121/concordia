import type { Metadata } from "next";
// globals.css FIRST so shell.css's body/reset rules win the dark theme.
import "./globals.css";
import "../styles/shell.css";
import { MockAuthProvider } from "@/lib/mockAuth";
import { MockDataProvider } from "@/lib/data";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Concordia",
  description: "A community hedge fund DAO.",
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
      </head>
      <body>
        <MockAuthProvider>
          <MockDataProvider>
            {/* Global ambient background — layout owns it; pages must not duplicate .amb. */}
            <div className="amb">
              <i className="a" />
              <i className="b" />
            </div>
            <Nav />
            {children}
          </MockDataProvider>
        </MockAuthProvider>
      </body>
    </html>
  );
}
