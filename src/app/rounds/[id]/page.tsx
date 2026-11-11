import { Suspense } from "react";
import { RoundView } from "@/components/round-view";
import { Loading } from "@/components/ui";

// `id` may be "latest": the API resolves it.
export default function RoundPage({ params }: PageProps<"/rounds/[id]">) {
  return <Suspense fallback={<Loading />}>{params.then(({ id }) => <RoundView id={id} />)}</Suspense>;
}
