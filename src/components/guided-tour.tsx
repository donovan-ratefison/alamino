"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Driver, DriveStep } from "driver.js";
import { NavIcon } from "./nav-icon";
import { GUIDE_TIPS, guideImage, ONBOARDING_STORAGE_KEY, type GuideTopic } from "@/lib/onboarding";

interface TourOptions {
  steps?: DriveStep[];
  storageKey?: string;
  beforeStart?: () => void;
  canStart?: () => boolean;
  returnFocus?: () => HTMLElement | null;
}

const TourContext = createContext<{
  startTour: (options?: TourOptions) => Promise<void>;
  stopTour: (storageKey: string) => void;
} | null>(null);

export function useGuidedTour() {
  const context = useContext(TourContext);
  if (!context) throw new Error("useGuidedTour must be used inside GuidedTourProvider");
  return context;
}

// Resolve the visible navigation at each step: desktop links and the phone bar
// share targets, but only one is displayed at a time.
const visible = (id: string) => Array.from(document.querySelectorAll(`[data-tour="${id}"]`)).find((element) => element.getClientRects().length > 0);

function target(id: string): () => Element {
  return () => visible(id) ?? document.querySelector("main") ?? document.body;
}

function steps(): DriveStep[] {
  const illustration = (topic: GuideTopic) => `<img class="tour-step-art" src="${guideImage(topic)}" width="420" height="280" alt="${GUIDE_TIPS[topic].alt}" />`;
  // The menu shows only the links of the current role: skip the steps whose link is not there.
  const tasks = ["market", "add", "confirm", "payments", "statement"] as const;
  const all: DriveStep[] = [
    { popover: {
      title: "Welcome to Alamino",
      description: '<img class="tour-welcome-art" src="/illustrations/alamino-guide.webp" width="420" height="280" alt="A friendly guide presents a notebook, a confirmation and payments." /><p class="tour-kicker">A little guidance. A clearer start.</p><p>Record debts, confirm them together, and settle only what remains. Let us show you around in a few short steps.</p>',
      nextBtnText: "Show me around",
    } },
    { element: target("market"), popover: { title: "Your market, together", description: illustration("market") + "Market brings your shared ledger and debt connections together. On clearing day, the engine cancels debt circles and calculates what still needs to be paid.", side: "bottom" } },
    { element: target("add"), popover: { title: "Start with a debt", description: illustration("add") + "Photograph a notebook page or type a sentence, such as ‘I owe Hery 50 for rice’. AI prepares a draft. Review the names and amount before saving it.", side: "top" } },
    { element: target("confirm"), popover: { title: "Both sides have a say", description: illustration("confirm") + "Open Confirm to review debts waiting for you. Approve a correct debt or flag a mistake. A debt can enter clearing only after both traders agree.", side: "top" } },
    { element: target("payments"), popover: { title: "Pay only what remains", description: illustration("payments") + "After running clearing from Market, follow the pay-ins and payouts here. Check the Sandbox or simulated label before paying. Payouts start once all remaining pay-ins are captured.", side: "top" } },
    { element: target("statement"), popover: { title: "Understand your result", description: illustration("statement") + "Your Statement explains your debts before and after clearing, the amounts cancelled, and what you need to pay or receive.", side: "top" } },
    { element: target("profile"), popover: { title: "Try another trader’s view", description: "In this demo, use View as to explore each trader’s debts, confirmations and statement. Switching views helps you follow the same debt from both sides.", side: "bottom" } },
    { element: target("help"), popover: { title: "You’re ready to begin", description: "Start by adding a debt as a trader, or explore the existing market. Replay this guide with the help button here. On a phone, it is inside More. The tour does not change your debts or payments.", side: "bottom", doneBtnText: "Let’s get started" } },
  ];
  return all.filter((_, i) => i < 1 || i > tasks.length || visible(tasks[i - 1]));
}

export function GuidedTourProvider({ children }: { children: ReactNode }) {
  const active = useRef<Driver | null>(null);
  const activeKey = useRef<string | null>(null);
  const mounted = useRef(false);
  const loading = useRef(false);
  const seenInSession = useRef(new Set<string>());
  const [error, setError] = useState("");

  const startTour = useCallback(async (options: TourOptions = {}) => {
    if (loading.current || active.current?.isActive() || options.canStart?.() === false) return;
    const storageKey = options.storageKey ?? ONBOARDING_STORAGE_KEY;
    loading.current = true;
    activeKey.current = storageKey;
    setError("");
    try {
      options.beforeStart?.();
      // Load the tour code on first visit or when Help is opened.
      const { driver } = await import("driver.js");
      // Let a page reveal responsive controls before measuring the tour targets.
      if (options.beforeStart) await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!mounted.current || activeKey.current !== storageKey || options.canStart?.() === false) return;
      const returnFocus = options.returnFocus?.() ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      const tour = driver({
        steps: options.steps ?? steps(),
        animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        duration: 200,
        smoothScroll: false,
        disableActiveInteraction: true,
        overlayClickBehavior: "none",
        overlayColor: "#052969",
        overlayOpacity: 0.55,
        stagePadding: 6,
        stageRadius: 16,
        popoverClass: "alamino-tour",
        showProgress: true,
        progressText: "{{current}} of {{total}}",
        nextBtnText: "Next",
        prevBtnText: "Back",
        closeBtnLabel: "Skip tour",
        allowClose: true,
        allowKeyboardControl: true,
        onDestroyed: (_element, _step, { reason }) => {
          active.current = null;
          activeKey.current = null;
          if (reason !== "api" && reason !== "replaced") {
            seenInSession.current.add(storageKey);
            try { localStorage.setItem(storageKey, reason === "done" ? "completed" : "dismissed"); } catch { /* Private browsing can disable storage. */ }
          }
          if (mounted.current) {
            const focus = returnFocus?.isConnected && returnFocus !== document.body ? returnFocus : target("help")();
            if (focus instanceof HTMLElement) focus.focus({ preventScroll: true });
          }
        },
      });
      active.current = tour;
      tour.drive();
    } catch {
      if (mounted.current && options.canStart?.() !== false) setError("The guide could not load. Please try the help button again.");
    } finally { loading.current = false; }
  }, []);

  const stopTour = useCallback((storageKey: string) => {
    if (activeKey.current !== storageKey) return;
    active.current?.destroy();
    activeKey.current = null;
  }, []);
  const controls = useMemo(() => ({ startTour, stopTour }), [startTour, stopTour]);

  useEffect(() => {
    mounted.current = true;
    let seen = seenInSession.current.has(ONBOARDING_STORAGE_KEY);
    try { seen ||= localStorage.getItem(ONBOARDING_STORAGE_KEY) !== null; } catch { /* The guide also works without storage. */ }
    const timer = !seen ? window.setTimeout(() => {
      // Add can still be loading its profile before its page marker is mounted.
      // Recheck after the lazy import as well, in case navigation happens meanwhile.
      const canAutoStart = () => window.location.pathname.replace(/\/+$/, "") !== "/add"
        && !document.querySelector("[data-page-tour]") && !seenInSession.current.has(ONBOARDING_STORAGE_KEY);
      if (canAutoStart()) void startTour({ canStart: canAutoStart });
    }, 600) : undefined;
    return () => {
      mounted.current = false;
      window.clearTimeout(timer);
      active.current?.destroy();
      active.current = null;
      activeKey.current = null;
    };
  }, [startTour]);

  return <TourContext.Provider value={controls}>{children}{error && <p role="alert" className="tour-load-error">{error}</p>}</TourContext.Provider>;
}

export function TourTrigger({ menu = false, onStart }: { menu?: boolean; onStart?: () => void }) {
  const { startTour } = useGuidedTour();
  return <button type="button" className={menu ? "nav-link w-full" : "bell-button tour-help-button"} data-tour={menu ? undefined : "help"} aria-label="Take a guided tour" title="Take a guided tour"
    onClick={() => { onStart?.(); void startTour(); }}><NavIcon name="help" />{menu && <span>Take a guided tour</span>}</button>;
}
