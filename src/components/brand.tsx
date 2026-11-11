import Image from "next/image";

export function Brand({ preload = false }: { preload?: boolean }) {
  return <Image src="/alamino-logo.png" alt="Alamino" width={462} height={154} preload={preload} className="brand-logo" />;
}
