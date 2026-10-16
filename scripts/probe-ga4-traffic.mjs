#!/usr/bin/env node
/**
 * probe-ga4-traffic.mjs — where did the September 2026 sessions surge come from?
 *
 * Run: node --env-file=.env scripts/probe-ga4-traffic.mjs [from] [to]
 *      (or with GA4_PROPERTY_ID / GA4_SERVICE_ACCOUNT already in the environment)
 *
 * Read-only. Never touches data.json. Breaks sessions down by the dimensions
 * that separate paid traffic from junk: source/medium and campaign, country,
 * landing page, hostname and device — each with engaged sessions alongside raw
 * sessions. GA4 counts a session as engaged only if it lasted 10s+, viewed 2+
 * pages or fired a key event, so a low engaged share marks traffic that
 * arrived and left without doing anything.
 */

import { googleAccessToken } from "./fetch.mjs";

const from = process.argv[2] ?? "2026-08-07";   // tracking restored
const to = process.argv[3] ?? "2026-10-15";
const propertyId = process.env.GA4_PROPERTY_ID;
if (!propertyId) throw new Error("GA4_PROPERTY_ID not set");

const token = await googleAccessToken();

async function report(dimensions, limit = 15) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: from, endDate: to }],
        dimensions: dimensions.map((name) => ({ name })),
        metrics: ["sessions", "engagedSessions", "screenPageViews", "averageSessionDuration"]
          .map((name) => ({ name })),
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit,
      }),
    }
  );
  if (!res.ok) throw new Error(`GA4 ${res.status}: ${await res.text()}`);
  return (await res.json()).rows ?? [];
}

function print(title, rows) {
  console.log(`\n== ${title}`);
  console.log("sessions  engaged%  pages/sess  avg secs  value");
  for (const r of rows) {
    const [s, e, pv, dur] = r.metricValues.map((m) => Number(m.value));
    console.log(
      String(s).padStart(8),
      `${(s ? (100 * e) / s : 0).toFixed(0)}%`.padStart(9),
      (s ? pv / s : 0).toFixed(2).padStart(11),
      dur.toFixed(0).padStart(9),
      " " + r.dimensionValues.map((d) => d.value).join(" · ")
    );
  }
}

console.log(`GA4 property ${propertyId}, ${from} to ${to}`);
print("By ISO week", (await report(["isoYearIsoWeek"], 30))
  .sort((a, b) => (a.dimensionValues[0].value < b.dimensionValues[0].value ? -1 : 1)));
print("By source / medium", await report(["sessionSourceMedium"]));
print("By campaign", await report(["sessionCampaignName"]));
print("By country", await report(["country"]));
print("By landing page", await report(["landingPage"]));
print("By hostname", await report(["hostName"]));
print("By device", await report(["deviceCategory"]));
