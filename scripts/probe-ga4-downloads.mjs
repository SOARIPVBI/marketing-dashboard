#!/usr/bin/env node
/**
 * probe-ga4-downloads.mjs — how often is each PDF on the site downloaded?
 *
 * Run: node --env-file=.env scripts/probe-ga4-downloads.mjs [from] [to]
 *      (or with GA4_PROPERTY_ID / GA4_SERVICE_ACCOUNT already in the environment)
 *
 * Read-only. Never touches data.json. Reads GA4's enhanced-measurement
 * `file_download` event, which fires when someone clicks a link to a file on
 * the site. Two limits worth knowing before quoting the numbers:
 *   - Only clicks FROM a tracked page count. A PDF opened straight from Google,
 *     an email or a bookmark never loads the GA4 tag, so it is invisible here.
 *   - The tag was missing 2026-02-25 to 2026-08-06, so nothing before
 *     2026-08-07 is usable. That is the default start date.
 */

import { googleAccessToken } from "./fetch.mjs";

const from = process.argv[2] ?? "2026-08-07";   // tracking restored
const to = process.argv[3] ?? "yesterday";
const propertyId = process.env.GA4_PROPERTY_ID;
if (!propertyId) throw new Error("GA4_PROPERTY_ID not set");

const token = await googleAccessToken();

const DOWNLOADS = { filter: { fieldName: "eventName", stringFilter: { value: "file_download" } } };
const PDF = { filter: { fieldName: "fileExtension", stringFilter: { value: "pdf", caseSensitive: false } } };

async function report(dimensions, filter, limit = 250) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: from, endDate: to }],
        dimensions: dimensions.map((name) => ({ name })),
        metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
        dimensionFilter: filter,
        orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        limit,
      }),
    }
  );
  if (!res.ok) throw new Error(`GA4 ${res.status}: ${await res.text()}`);
  return (await res.json()).rows ?? [];
}

const cols = (r) => [...r.metricValues.map((m) => m.value.padStart(9)), " " +
  r.dimensionValues.map((d) => d.value).join(" · ")].join("");

console.log(`GA4 property ${propertyId}, ${from} to ${to}`);

/* Is download tracking on at all? Zero here means enhanced measurement's
   "File downloads" toggle is off, not that nobody downloaded anything. */
const byType = await report(["fileExtension"], DOWNLOADS);
console.log("\n== All file downloads by type\ndownloads    users  extension");
byType.forEach((r) => console.log(cols(r)));
if (!byType.length) {
  console.log("  none — check GA4 Admin → Data streams → Enhanced measurement → File downloads");
  process.exit(0);
}

const both = { andGroup: { expressions: [DOWNLOADS, PDF] } };
console.log("\n== PDFs, by file\ndownloads    users  file · link");
(await report(["fileName", "linkUrl"], both)).forEach((r) => console.log(cols(r)));

console.log("\n== PDFs, by month\ndownloads    users  month · file");
(await report(["yearMonth", "fileName"], both))
  .sort((a, b) => (a.dimensionValues[0].value < b.dimensionValues[0].value ? -1 : 1))
  .forEach((r) => console.log(cols(r)));

console.log("\n== Which pages the PDF downloads were clicked from\ndownloads    users  page");
(await report(["pagePath"], both, 25)).forEach((r) => console.log(cols(r)));
