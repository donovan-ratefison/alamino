import Image from "next/image";
import { GUIDE_TIPS, guideImage, type GuideTopic } from "@/lib/onboarding";

export function GuideTip({ topic }: { topic: GuideTopic }) {
  const guide = GUIDE_TIPS[topic];
  return (
    <aside className="guide-tip" data-guide-topic={topic} aria-label={`${guide.label} guide`}>
      <Image src={guideImage(topic)} width={420} height={280} sizes="200px" alt={guide.alt} className="guide-tip-art" />
      <div className="guide-tip-copy">
        <p className="guide-tip-kicker">A little guidance</p>
        <p className="guide-tip-title">{guide.title}</p>
        <p className="guide-tip-summary">{guide.summary}</p>
        <details className="guide-tip-details"><summary>Show the steps<span className="sr-only"> for {guide.label}</span></summary><ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol></details>
      </div>
    </aside>
  );
}
