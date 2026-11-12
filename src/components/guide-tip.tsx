import Image from "next/image";
import { GUIDE_TIPS, guideImage, type GuideTopic } from "@/lib/onboarding";
import { NavIcon } from "./nav-icon";

// Closed by default: one "How it works" line. Open: the art, the summary and the steps.
export function GuideTip({ topic }: { topic: GuideTopic }) {
  const guide = GUIDE_TIPS[topic];
  return (
    <details className="guide-tip" data-guide-topic={topic}>
      <summary className="text-sm font-medium text-accent">
        <NavIcon name="help" width="16" height="16" />
        How it works<span className="sr-only">: {guide.label}</span>
      </summary>
      <div className="guide-tip-body">
        <Image src={guideImage(topic)} width={420} height={280} sizes="200px" alt={guide.alt} className="guide-tip-art" />
        <div className="guide-tip-copy">
          <p className="guide-tip-title">{guide.title}</p>
          <p className="guide-tip-summary">{guide.summary}</p>
          <ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        </div>
      </div>
    </details>
  );
}
