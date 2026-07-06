#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";

const LOGIN = process.env.PROFILE_LOGIN || "majiayu000";
const TOKEN =
  process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const OUTFILE = process.env.ACTIVITY_CARD_OUT || "assets/activity-card.svg";

if (!TOKEN) {
  console.error("Missing PROFILE_TOKEN, GITHUB_TOKEN, or GH_TOKEN.");
  process.exit(1);
}

const query = `
query ActivityCard($login: String!) {
  user(login: $login) {
    login
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            color
            contributionCount
            date
            weekday
          }
        }
      }
    }
  }
}`;

async function graphql(variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      "user-agent": "majiayu000-profile-activity-card",
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json();
  if (!response.ok || payload.errors) {
    throw new Error(JSON.stringify(payload.errors || payload, null, 2));
  }
  return payload.data.user;
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function fmt(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function shanghaiTimestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function heatmap(calendar) {
  const weeks = calendar.weeks;
  const size = 8;
  const gap = 3;
  return weeks
    .flatMap((week, weekIndex) =>
      week.contributionDays.map((day) => {
        const x = 326 + weekIndex * (size + gap);
        const y = 58 + day.weekday * (size + gap);
        const stroke = day.contributionCount ? "none" : "#30363d";
        return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="2" fill="${day.color}" stroke="${stroke}" />`;
      }),
    )
    .join("");
}

function renderSvg(user) {
  const calendar = user.contributionsCollection.contributionCalendar;
  const days = calendar.weeks.flatMap((week) => week.contributionDays);
  const activeDays = days.filter((day) => day.contributionCount > 0).length;
  const bestDay = days.reduce((best, day) =>
    day.contributionCount > best.contributionCount ? day : best,
  );
  const total = calendar.totalContributions;
  const updated = shanghaiTimestamp();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="920" height="150" viewBox="0 0 920 150" role="img" aria-labelledby="title desc">
  <title id="title">${fmt(total)} contributions in the last year</title>
  <desc id="desc">GitHub contribution activity card for ${escapeXml(user.login)}.</desc>
  <defs>
    <linearGradient id="border" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#00ffff"/>
      <stop offset="55%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#22c55e"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <style>
      text { font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace; }
      .label { fill: #7d8590; font-size: 12px; font-weight: 700; letter-spacing: 0; }
      .count { fill: #f0f6fc; font-size: 34px; font-weight: 800; letter-spacing: 0; }
      .meta { fill: #8b949e; font-size: 12px; }
      .cyan { fill: #00ffff; }
      .green { fill: #3fb950; }
    </style>
  </defs>
  <rect width="920" height="150" rx="18" fill="#0d1117"/>
  <rect x="1" y="1" width="918" height="148" rx="17" fill="none" stroke="url(#border)" stroke-width="2" opacity="0.9" filter="url(#glow)"/>
  <text x="28" y="38" class="label">ACTIVITY SIGNAL</text>
  <text x="28" y="78" class="count">${fmt(total)}</text>
  <text x="28" y="103" class="meta">contributions in the last year</text>
  <text x="28" y="128" class="meta"><tspan class="green">${activeDays}</tspan> active days / best day <tspan class="cyan">${bestDay.contributionCount}</tspan> on ${escapeXml(bestDay.date)}</text>
  <text x="326" y="38" class="label">CONTRIBUTION GRID</text>
  <text x="885" y="38" class="meta" text-anchor="end">sync ${escapeXml(updated)}</text>
  ${heatmap(calendar)}
</svg>
`;
}

try {
  const user = await graphql({ login: LOGIN });
  await mkdir(OUTFILE.split("/").slice(0, -1).join("/") || ".", {
    recursive: true,
  });
  await writeFile(OUTFILE, renderSvg(user), "utf8");
  console.log(`Rendered ${OUTFILE}`);
} catch (error) {
  console.error(error);
  process.exit(1);
}
