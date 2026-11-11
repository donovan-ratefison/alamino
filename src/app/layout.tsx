import type { Metadata } from "next";
import { AppProvider, Header } from "@/components/app";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alamino",
  description: "Debt clearing for market traders: circles cancel with no money, PayPal settles the rest.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <AppProvider>
          <Header />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        </AppProvider>
      </body>
    </html>
  );
}
