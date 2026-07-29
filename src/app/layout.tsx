import type { Metadata } from "next";
import { AppProvider } from "@/components/providers/app_provider";
import { display, mono, sans } from "./fonts";

export const metadata: Metadata = {
  title: "Inari",
  description: "Manage S3-compatible object storage.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning is required by next-themes: it writes the colour
    // mode class onto <html> before React hydrates, so the server and client
    // markup necessarily differ on this element.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
    >
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
