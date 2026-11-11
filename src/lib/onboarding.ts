export const ONBOARDING_STORAGE_KEY = "alamino.onboarding.v1";
export const CAPTURE_TOUR_STORAGE_KEY = "alamino.onboarding.add.v1";

export const GUIDE_TIPS = {
  market: {
    label: "Market",
    title: "Start with the bigger picture.",
    summary: "Follow the debts between traders. On clearing day, cancel the circles and see what still needs to be paid.",
    steps: ["Add and confirm the debts in your market.", "Review the clearing preview before starting a round.", "Open Payments to settle the remaining amounts."],
    alt: "Your guide presents the connections between traders.",
  },
  add: {
    label: "Add a debt",
    title: "A clear photo makes a better draft.",
    summary: "Keep names and amounts in frame, or type a sentence. Always check the draft before saving it.",
    steps: ["Photograph the notebook in good light, or type a sentence.", "Check who owes whom, the amount, and any unmatched names.", "Save the debt. The other trader must confirm it before clearing."],
    alt: "Your guide photographs an open notebook with a phone.",
  },
  confirm: {
    label: "Confirm",
    title: "A quick check, on both sides.",
    summary: "Review the trader, amount and note. Approve what is correct, or flag a mistake before the debt enters clearing.",
    steps: ["Look for debts waiting for you.", "Check the amount and the other trader before approving.", "Flag an incorrect debt so both sides can agree on the correction."],
    alt: "Your guide holds an approval card and gives a thumbs-up.",
  },
  payments: {
    label: "Payments",
    title: "The circles clear. The rest gets paid.",
    summary: "Follow the remaining pay-ins and payouts. Check the Sandbox or simulated label before paying.",
    steps: ["Start a clearing round from Market if there is no round yet.", "Each trader who owes pays their remaining amount through PayPal.", "Once all pay-ins are captured, send payouts and check their final status."],
    alt: "Your guide explains the arrows for incoming and outgoing payments.",
  },
  statement: {
    label: "Statement",
    title: "Every amount has a story.",
    summary: "See your debts before and after clearing, what was cancelled, and why you pay or receive the remaining amount.",
    steps: ["Run a clearing round from Market first.", "Compare the before and after amounts in your statement.", "Read the explanation and open the round to follow payment statuses."],
    alt: "Your guide points to the lines of a settlement statement.",
  },
} as const;

export type GuideTopic = keyof typeof GUIDE_TIPS;
export const guideImage = (topic: GuideTopic) => `/illustrations/guide-${topic}.webp`;
