"use client";

import { useEffect, useRef } from "react";
import type { DriveStep } from "driver.js";
import { CAPTURE_TOUR_STORAGE_KEY, GUIDE_TIPS, guideImage } from "@/lib/onboarding";
import { useGuidedTour } from "./guided-tour";
import { NavIcon } from "./nav-icon";

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
    { element: '[data-capture-tour="guide"]', popover: { title: "Check before saving", description: "After reading, check who owes whom and the amount on each draft. Answer any missing information, then save the ready debts. The other trader must confirm them. Use the help button to see these steps again.", side: "bottom", doneBtnText: "Ready to add" } },
  ];
}

// Opens only from its "?" button: an automatic tour would cover the page during the demo.
export function CaptureGuide({ onPrepare }: { onPrepare: () => void }) {
  const { startTour, stopTour } = useGuidedTour();
  const mounted = useRef(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopTour(CAPTURE_TOUR_STORAGE_KEY);
    };
  }, [stopTour]);

  return (
    <button
      ref={button}
      type="button"
      className="bell-button guide-help-button"
      data-capture-tour="guide"
      aria-label="How to add a debt"
      title="How to add a debt"
      onClick={() => void startTour({
        storageKey: CAPTURE_TOUR_STORAGE_KEY,
        steps: captureSteps(),
        beforeStart: onPrepare,
        canStart: () => mounted.current,
        returnFocus: () => button.current,
      })}
    >
      <NavIcon name="help" width="20" height="20" />
    </button>
  );
}
