import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppProvider, Header } from "@/components/app";
import { BottomBar } from "@/components/bottom-bar";
import { DemoGuide } from "@/components/demo-guide";
import { Footer } from "@/components/footer";
import { GuidedTourProvider } from "@/components/guided-tour";
import "driver.js/dist/driver.css";
import "./globals.css";

const inter = localFont({ src: "../../public/fonts/InterVariable.woff2", variable: "--font-inter", display: "swap", weight: "100 900" });

export const metadata: Metadata = {
  title: "Alamino",
  description: "Debt clearing for market traders: circles cancel with no money, PayPal settles the rest.",
};

// "cover" lets the phone bottom bar read env(safe-area-inset-bottom).
export const viewport: Viewport = { viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={`${inter.variable} flex min-h-full flex-col font-sans`}>
        <AppProvider>
          <GuidedTourProvider>
            <Header />
            <DemoGuide />
            <main className="app-main"><div className="app-content">{children}</div></main>
            <Footer />
            <BottomBar />
          </GuidedTourProvider>
        </AppProvider>
      </body>
    </html>
  );
}
