import Compare from "@/components/Compare";
import { pricesGeneratedAt, products } from "@/lib/data";
import { getRates } from "@/lib/rates";

// Re-render at most every 6 hours so exchange rates stay current.
export const revalidate = 21600;

export default async function Page() {
  const rates = await getRates();
  return <Compare products={products} rates={rates} pricesGeneratedAt={pricesGeneratedAt} renderedAt={Date.now()} />;
}
