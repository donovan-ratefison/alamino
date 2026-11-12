"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { showLink, useApp } from "./app";
import { Brand } from "./brand";
import { btn } from "./ui";

// Same rule as the menu: each role sees only its own links. The house has no debt to add.
const FOOTER_LINKS = [{ href: "/", label: "Market" }, { href: "/finance", label: "AI Finance" }, { href: "/statement", label: "Statement" }];

function FullFooter() {
  const { isHouse } = useApp();
  return <footer className="site-footer">
    <div className="band-content">
      <div className="footer-top">
        <div><p className="eyebrow text-blue-200">Your market. Moving forward.</p><p className="mt-5 text-3xl font-medium leading-tight tracking-tight sm:text-5xl">Better together.<br />Clearer with Alamino.</p></div>
        {isHouse ? <Link href="/finance" className={btn.inverse}>Open AI Finance <span aria-hidden="true">↗</span></Link> : <Link href="/add" className={btn.inverse}>Add a debt <span aria-hidden="true">↗</span></Link>}
      </div>
      <div className="footer-bottom">
        <div className="space-y-3"><Link href="/" className="footer-logo"><Brand /></Link><p>AI assisted capture. Transparent clearing. PayPal settlement.</p></div>
        <nav aria-label="Footer" className="flex flex-wrap items-start gap-x-6 gap-y-3">{FOOTER_LINKS.filter((l) => showLink(l.href, isHouse)).map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}</nav>
        <p>Hackathon prototype<br /><span className="mt-2 inline-block">Sandbox and demo modes are labelled in the app.</span></p>
      </div>
    </div>
  </footer>;
}

// Task pages: one line on a desktop, hidden with CSS on a phone (the bottom bar is the navigation).
function LineFooter() {
  return <footer className="footer-line">
    <div className="band-content">
      <span className="font-medium text-brand">Alamino</span>
      <span>Hackathon prototype</span>
      <span>Sandbox and demo modes are labelled in the app.</span>
    </div>
  </footer>;
}

function PageFooter() {
  const pathname = usePathname();
  return pathname === "/" ? <FullFooter /> : <LineFooter />;
}

// The full footer only on the market and AI Finance pages.
export function Footer() {
  return (
    <Suspense fallback={<LineFooter />}>
      <PageFooter />
    </Suspense>
  );
}
