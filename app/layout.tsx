import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { headers } from "next/headers";
import { companyConfig } from "@/lib/config";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const title = `${companyConfig.company.name} — ${companyConfig.application.name}`;
  const description = companyConfig.application.description;

  return {
    metadataBase,
    title: {
      default: title,
      template: `%s — ${companyConfig.company.name}`,
    },
    description,
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: "/og-openchair.png", width: 1732, height: 908 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-openchair.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const brandStyles = {
    "--signal": companyConfig.branding.accent,
    "--signal-dark": companyConfig.branding.accentDark,
    "--paper": companyConfig.branding.background,
    "--ink": companyConfig.branding.foreground,
  } as CSSProperties;

  return (
    <html lang="en">
      <body style={brandStyles}>{children}</body>
    </html>
  );
}
