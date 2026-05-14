// save as scrape_ff_items.js

const { chromium } = require("playwright");
const fs = require("fs");

const BASE_URL = "https://ff-item.netlify.app/";
const TOTAL_PAGES = 33; // change if needed
const CONCURRENT_TABS = 80;

const results = [];
const visited = new Set();

async function scrapeCard(context, itemUrl) {
  if (visited.has(itemUrl)) return;
  visited.add(itemUrl);

  const page = await context.newPage();

  try {
    await page.goto(itemUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // wait modal/content
    await page.waitForSelector("text=Item id", {
      timeout: 15000,
    });

    // extract data
    const data = await page.evaluate(() => {
      const bodyText = document.body.innerText;

      const lines = bodyText
        .split("\n")
        .map(v => v.trim())
        .filter(Boolean);

      // Name usually first meaningful line
      let name = lines[0] || "Unknown";

      const itemIdMatch = bodyText.match(/Item id\s*:\s*([^\n]+)/i);
      const iconIdMatch = bodyText.match(/Icon id\s*:\s*([^\n]+)/i);

      let description = "";

      const descIndex = lines.findIndex(v =>
        v.toLowerCase().includes("description")
      );

      if (descIndex !== -1) {
        description = lines
          .slice(descIndex + 1)
          .join(" ")
          .replace(/Share|Close/g, "")
          .trim();
      }

      return {
        name,
        itemId: itemIdMatch?.[1]?.trim() || "",
        iconId: iconIdMatch?.[1]?.trim() || "",
        description,
      };
    });

    const formatted = `
name- ${data.name}
Item id :
${data.itemId}
Icon id : ${data.iconId}
Description :
${data.description}

========================================
`;

    console.log(formatted);

    results.push(formatted);

    // save instantly
    fs.appendFileSync("ff_items.txt", formatted);

  } catch (err) {
    console.log("FAILED:", itemUrl, err.message);
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext();

  const mainPage = await context.newPage();

  console.log("Opening website...");

  // collect all item URLs
  const allLinks = [];

  for (let pageNum = 1; pageNum <= TOTAL_PAGES; pageNum++) {
    const url = `${BASE_URL}?page=${pageNum}`;

    console.log(`Loading page ${pageNum}`);

    await mainPage.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await mainPage.waitForTimeout(2000);

    // collect all clickable cards
    const links = await mainPage.evaluate(() => {
      const anchors = [...document.querySelectorAll("a")];

      return anchors
        .map(a => a.href)
        .filter(href =>
          href &&
          href.includes(window.location.origin) &&
          href !== window.location.href
        );
    });

    for (const link of links) {
      if (!allLinks.includes(link)) {
        allLinks.push(link);
      }
    }

    console.log(`Collected ${links.length} links`);
  }

  console.log(`TOTAL LINKS: ${allLinks.length}`);

  // process 80 tabs concurrently
  for (let i = 0; i < allLinks.length; i += CONCURRENT_TABS) {
    const chunk = allLinks.slice(i, i + CONCURRENT_TABS);

    console.log(
      `Processing batch ${Math.floor(i / CONCURRENT_TABS) + 1}`
    );

    await Promise.all(
      chunk.map(link => scrapeCard(context, link))
    );
  }

  console.log("DONE");
  console.log(`Saved ${results.length} items`);

  await browser.close();
})();
