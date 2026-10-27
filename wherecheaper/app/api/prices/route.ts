import { countries, pricesGeneratedAt, products } from "@/lib/data";
import { getRates } from "@/lib/rates";

export const revalidate = 21600;

// Everything the page shows, as JSON, for a native app or other clients.
export async function GET() {
  const rates = await getRates();
  return Response.json({ pricesGeneratedAt, rates, countries, products });
}
