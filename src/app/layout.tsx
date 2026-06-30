import "./globals.css";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/theme/theme_provider";
import { isInitialDark, parseTheme, THEME_COOKIE } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Inari",
  description: "Manage S3-compatible object storage.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const preference = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  return (
    <html lang="en" className={isInitialDark(preference) ? "dark" : ""}>
      <body className="min-h-screen font-sans antialiased">
        <ThemeProvider initialPreference={preference}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
