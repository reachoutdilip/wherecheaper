# Where's It Cheaper

Compares official store prices for Apple, Samsung and Google phones, laptops,
tablets and headphones (plus a few manual entries) across 12 countries, converts them to your
currency at today's exchange rates, and ranks them. Works on desktop and phones, and can be installed to a phone's home screen.

At the top, visitors pick where they live (the price they compare against, or
"Somewhere else") and the currency to show prices in: the 12 store currencies
plus about 45 other common ones.

Filters (left sidebar on desktop, a slide-out panel on phones): category, brand,
storage size, best-price cap, which countries to compare, tourist refund (never
applied to your own country), US/Canada sales tax, and live-prices-only. Results sort by biggest saving
abroad, lowest price, or name.

## Run it

Needs Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Where the numbers come from

| Data | Source | Refreshed |
| --- | --- | --- |
| Exchange rates | [ExchangeRate-API open endpoint](https://open.er-api.com), falling back to ECB rates via [Frankfurter](https://frankfurter.dev), then built-in rates | Every 6 hours (page revalidation), no API key |
| Apple (iPhone, iPad, MacBook, AirPods) | Apple's online store in each country (`scripts/sources/apple.mjs`) | Daily, by the GitHub Action |
| Samsung (Galaxy phones, tablets, Buds) | Samsung's online store in each country (`scripts/sources/samsung.mjs`) | Daily |
| Google (Pixel phones, Pixel Buds) | Google Store in the 8 countries it sells in (`scripts/sources/google.mjs`) | Daily |
| Anything with `"type": "manual"` (e.g. Sony) | Prices typed into `data/catalog.json` | When you edit the file |

`GET /api/prices` returns everything as JSON, for a native app or other clients.

## Update prices

```bash
npm run update-prices
```

This rewrites `data/prices.json`. If a store page fails, the last known price is
kept and shown as "Last seen …" instead of disappearing. The script exits with an
error when more than half the lookups fail, which usually means a store changed
its page layout. Each store's reader lives in `scripts/sources/`.

## Add a product or country

Storage prices: Apple iPhones and iPads, Samsung and Google phones are read per
storage size. The page compares the same size in every country; a country that
doesn't sell that size shows "… not sold here". `match` (optional) is the start
of the store's configuration name before the storage size, e.g.
`"11-inch iPad Pro Wi.Fi"` for "11-inch iPad Pro Wi‑Fi 256GB with standard
glass"; it defaults to the product name.

Every live product needs `usPrice`, its rough US price. Each store page also
shows accessories, monthly instalments and trade-in offers; only prices between
0.8× and 1.9× the US price (converted to local currency) count, so keep it roughly
right.

- **Apple device:** `"source": { "type": "apple", "page": "buy-iphone/<model>", "usPrice": 999 }`.
  `page` is the path after `/shop/` on apple.com.
- **Apple accessory (AirPods):** `"source": { "type": "apple", "list": "accessories/all/headphones-speakers", "name": "AirPods Pro 3", "usPrice": 249 }`.
  `name` is the product name as Apple lists it.
- **Samsung:** `"source": { "type": "samsung", "page": "smartphones/galaxy-s26/buy/", "usPrice": 699.99 }`.
  `page` is the path after `samsung.com/us/`.
- **Google:** `"source": { "type": "google", "page": "pixel_11", "usPrice": 899 }`.
  `page` is the product id in the Google Store URL.
- **Any other product:** use `"source": { "type": "manual", "checkedAt": "YYYY-MM-DD" }`
  and list `"prices"` per country in local currency.
- **Country:** add it to `data/countries.json`, then add its store address to
  `APPLE_STORES`, `SAMSUNG_STORES` and `GOOGLE_STORES` in `scripts/sources/`.

Then run `npm run update-prices`.

## Deploy

1. Push this folder to a GitHub repository.
2. Import the repository in [Vercel](https://vercel.com/new). No settings or
   environment variables are needed.
3. The workflow in `.github/workflows/update-prices.yml` runs daily, commits new
   prices, and the push triggers a Vercel redeploy. You can also run it by hand
   from the repository's Actions tab.

## Notes

- US and Canadian list prices exclude sales tax; the page can add a typical rate.
- Tourist refund percentages in `data/countries.json` are estimates after
  operator fees.
- Samsung prices can include the store's current promotions.
- Some pages can't be read: Samsung Korea puts some launches behind a waiting
  room, and Apple China's accessory listing has a different layout. Those
  countries show "No official store price" for that product.
- Reading the stores' public pages once a day is light traffic, but check that
  it fits how you plan to use the site.
