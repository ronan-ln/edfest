This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## EdFest Times Giveaway Browser

### Local development
npm run dev

The app reads event data from public/offers.json and availability from the path set in DATA_PATH (.env).

### Data pipeline
Run the crawler (from repo root) to populate availability data:
  python3 fetch_availability.py
This writes data/availability.json (keyed by slug). It resumes where it left off.
Re-run anytime to refresh — already-fetched slugs are skipped unless you delete the file.

### Railway deployment
1. Connect the edfest-browser/ directory as the Railway service root
2. Set env var: DATA_PATH=/data/availability.json
3. Mount a Railway Volume at /data so the crawler output persists across deploys
4. Run the crawler locally or in a one-off Railway job to populate the volume
