"use client";

import { useCallback, useEffect, useRef } from "react";
import type { DriveStep } from "driver.js";
import { CAPTURE_TOUR_STORAGE_KEY, GUIDE_TIPS, guideImage } from "@/lib/onboarding";
import { useGuidedTour } from "./guided-tour";
import { NavIcon } from "./nav-icon";
import { btn } from "./ui";

function captureSteps(): DriveStep[] {
  return [
    { element: "#view-as", popover: { title: "Choose your trader", description: "Check whose notebook you are recording. Every debt you add belongs to this trader and one other person in the market.", side: "bottom" } },
    { element: '[data-capture-tour="camera"]', popover: {
      title: "Photograph your notebook",
      description: `<img class="tour-step-art" src="${guideImage("add")}" width="420" height="280" alt="${GUIDE_TIPS.add.alt}" />Keep the names and amounts clearly visible, in good light. On a phone, this button lets you take a photo. Selecting a photo starts its reading.`,
      side: "top",
    } },
    { element: '[data-capture-tour="photo"]', popover: { title: "Use an existing photo", description: "Already have a picture? Choose a photo from your device. Check the preview after selecting it. The AI or fallback label tells you how it was read.", side: "top" } },
    { element: "#capture-text", popover: { title: "Or type a sentence", description: "You can start without a photo. For example: ‘I owe Hery 50 for rice’. Include the other trader, the amount, and what the debt is for. Your text is kept when you close the guide.", side: "top" } },
    { element: '[data-capture-tour="read"]', popover: { title: "Read, then review", description: "Read the sentence to prepare draft debts. The button becomes available when you enter text. Reading does not save a debt: you review the result first.", side: "top" } },
    { element: '[data-capture-tour="guide"]', popover: { title: "Check before saving", description: "After reading, check who owes whom and the amount on each draft. Answer any missing information, then save the ready debts. The other trader must confirm them. Use Guide to replay these steps.", side: "bottom", doneBtnText: "Ready to add" } },
  ];
}

export function CaptureGuide({ onPrepare }: { onPrepare: () => void }) {
  const { startTour, stopTour } = useGuidedTour();
  const mounted = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const launch = useCallback((automatic = false) => startTour({
    storageKey: CAPTURE_TOUR_STORAGE_KEY,
    steps: captureSteps(),
    beforeStart: onPrepare,
    canStart: () => mounted.current,
    returnFocus: () => button.current,
    onlyIfUnseen: automatic,
  }), [startTour, onPrepare]);

  useEffect(() => {
    mounted.current = true;
    let seen = false;
    try { seen = localStorage.getItem(CAPTURE_TOUR_STORAGE_KEY) !== null; } catch { /* Storage is optional. */ }
    const timer = !seen ? window.setTimeout(() => void launch(true), 650) : undefined;
    return () => {
      mounted.current = false;
      window.clearTimeout(timer);
      stopTour(CAPTURE_TOUR_STORAGE_KEY);
    };
  }, [launch, stopTour]);

  return <button ref={button} type="button" className={btn.small} data-capture-tour="guide" aria-label="How to add a debt" title="How to add a debt" onClick={() => void launch()}><NavIcon name="help" width="18" height="18" /><span>Guide</span></button>;
}
