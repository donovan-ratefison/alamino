import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppProvider, Header } from "@/components/app";
import { Footer } from "@/components/footer";
import "./globals.css";

const inter = localFont({ src: "../../public/fonts/InterVariable.woff2", variable: "--font-inter", display: "swap", weight: "100 900" });

export const metadata: Metadata = {
  title: "Alamino",
  description: "Debt clearing for market traders: circles cancel with no money, PayPal settles the rest.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={`${inter.variable} flex min-h-full flex-col font-sans`}>
        <AppProvider>
          <Header />
          <main className="app-main"><div className="app-content">{children}</div></main>
          <Footer />
        </AppProvider>
      </body>
    </html>
  );
}
