import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Database
const db = new Database("boatrace.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    venue TEXT,
    raceNum TEXT,
    trifecta TEXT,
    dividend INTEGER,
    UNIQUE(date, venue, raceNum)
  );
  CREATE TABLE IF NOT EXISTS scraped_dates (
    date TEXT PRIMARY KEY
  );
  CREATE INDEX IF NOT EXISTS idx_results_date ON results(date);
  CREATE INDEX IF NOT EXISTS idx_results_trifecta_date ON results(trifecta, date);
  CREATE INDEX IF NOT EXISTS idx_results_venue_date ON results(venue, date);
`);

const insertResult = db.prepare(`
  INSERT OR IGNORE INTO results (date, venue, raceNum, trifecta, dividend)
  VALUES (?, ?, ?, ?, ?)
`);

const insertScrapedDate = db.prepare(`
  INSERT OR IGNORE INTO scraped_dates (date)
  VALUES (?)
`);

const getResultsByDateRange = db.prepare(`
  SELECT 
    date, 
    venue, 
    raceNum, 
    trifecta, 
    dividend
  FROM results
  WHERE date BETWEEN ? AND ?
  ORDER BY date DESC, venue ASC, raceNum ASC
`);

const isDateScraped = db.prepare(`
  SELECT 1 FROM scraped_dates WHERE date = ?
`);

const getLastAppearances = db.prepare(`
  SELECT trifecta, MAX(date) as lastDate
  FROM results
  WHERE date < ? AND (venue = ? OR ? = 'all')
  GROUP BY trifecta
`);

async function fetchDayResults(dateStr: string) {
  const fetchFromBoaters = async (dStr: string) => {
    const formattedDate = `${dStr.substring(0, 4)}-${dStr.substring(4, 6)}-${dStr.substring(6, 8)}`;
    const url = `https://boaters-boatrace.com/race/repay-list?date=${formattedDate}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    $('style, script').remove();
    
    const boatersResults: any[] = [];

    $("h2").each((i, h2) => {
      let venue = $(h2).text().trim();
      if (venue.length > 10 || venue.includes("BOATERS")) return;
      venue = venue.split(/\s+/)[0];

      let container: any = null;
      let currentEl = $(h2).parent();
      while (currentEl.length > 0 && !currentEl.is("body")) {
        const nextSiblings = currentEl.nextAll();
        nextSiblings.each((j, sib) => {
          const text = $(sib).text().trim();
          if (text.includes("1R") && text.includes("円")) {
            container = $(sib);
            return false;
          }
        });
        if (container) break;
        currentEl = currentEl.parent();
      }
      
      if (container) {
        const children = container.children();
        let currentRace: any = null;
        let collectedDigits: string[] = [];
        
        children.each((j: number, child: any) => {
          const text = $(child).text().trim();
          const raceMatch = text.match(/^(\d+R)$/);
          if (raceMatch) {
            currentRace = { date: dStr, venue, raceNum: raceMatch[1], trifecta: "", dividend: 0 };
            collectedDigits = [];
            return;
          }
          if (!currentRace) return;
          const dividendMatch = text.match(/([\d,]+)円/);
          if (dividendMatch) {
            currentRace.dividend = parseInt(dividendMatch[1].replace(/,/g, ''));
            if (collectedDigits.length >= 3) {
              currentRace.trifecta = collectedDigits.slice(0, 3).join("-");
            } else {
              const digits = text.match(/[1-6]/g);
              if (digits && digits.length >= 3) currentRace.trifecta = digits.slice(0, 3).join("-");
            }
            if (currentRace.trifecta && currentRace.dividend > 0) {
              boatersResults.push({...currentRace});
              currentRace = null;
              collectedDigits = [];
            }
          } else {
            const digits = text.match(/[1-6]/g);
            if (digits && (text.length < 5 || (digits.length === 1 && text.includes(digits[0])))) {
              collectedDigits.push(...digits);
            }
          }
        });
      }
    });
    return boatersResults;
  };

  const fetchFromSakura = async (dStr: string) => {
    const url = `https://sakura-boatrace.com/race-result?date=${dStr}`;
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
      responseType: 'arraybuffer',
      timeout: 10000
    });
    const html = iconv.decode(Buffer.from(response.data), 'Shift_JIS');
    const $ = cheerio.load(html);
    const pageResults: any[] = [];
    function processRow(venue: string, raceNumRaw: string, trifectaTd: any, dividendRaw: string) {
      let digits: string[] | null = $(trifectaTd).text().trim().match(/[1-6]/g);
      if (!digits || digits.length < 3) {
        const imgDigits: string[] = [];
        $(trifectaTd).find("img").each((k, img) => {
          const src = $(img).attr("src") || "";
          const alt = $(img).attr("alt") || "";
          const match = src.match(/[1-6]/) || alt.match(/[1-6]/);
          if (match) imgDigits.push(match[0]);
        });
        if (imgDigits.length >= 3) digits = imgDigits;
      }
      if (venue && raceNumRaw && digits && digits.length >= 3) {
        const trifecta = digits.slice(0, 3).join("-");
        const dividend = parseInt(dividendRaw.replace(/[¥,円]/g, "")) || 0;
        if (dividend > 0) {
          pageResults.push({ date: dateStr, venue, raceNum: raceNumRaw.includes("R") ? raceNumRaw : `${raceNumRaw}R`, trifecta, dividend });
        }
      }
    }
    let currentVenue = "不明";
    $("table tr").each((i, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 3) return;
      let dividendIdx = -1;
      tds.each((j, td) => {
        const text = $(td).text().trim().replace(/[¥,円]/g, '');
        if (text.match(/^\d+$/)) {
          const val = parseInt(text);
          if (val >= 70) { dividendIdx = j; return false; }
        }
      });
      if (dividendIdx >= 2) {
        const trifectaIdx = dividendIdx - 1;
        const raceIdx = dividendIdx - 2;
        const firstColText = $(tds[0]).text().trim();
        if (dividendIdx >= 3 && firstColText && !firstColText.match(/^\d+$/) && !firstColText.includes('R')) {
          currentVenue = firstColText.replace(/\s+/g, '');
        }
        processRow(currentVenue, $(tds[raceIdx]).text().trim(), tds[trifectaIdx], $(tds[dividendIdx]).text().trim());
      }
    });
    return pageResults;
  };

  try {
    let dayResults = await fetchFromBoaters(dateStr);
    if (dayResults.length === 0) {
      dayResults = await fetchFromSakura(dateStr);
    }
    return dayResults;
  } catch (error) {
    console.error(`Error fetching results for ${dateStr}:`, error);
    return [];
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes
  app.get("/api/hamari", (req, res) => {
    const date = req.query.date as string; // YYYYMMDD
    const venue = (req.query.venue as string) || 'all';
    if (!date) return res.status(400).json({ error: "Date is required" });
    
    try {
      const appearances = getLastAppearances.all(date, venue, venue);
      res.json({ appearances });
    } catch (error) {
      console.error("Hamari API error:", error);
      res.status(500).json({ error: "Failed to fetch hamari data" });
    }
  });

  app.get("/api/hotness", (req, res) => {
    const venue = (req.query.venue as string) || 'all';
    const todayJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayStr = todayJST.toISOString().slice(0, 10).replace(/-/g, '');

    try {
      // Fetch all results for the venue to calculate statistics
      const query = venue === 'all' 
        ? "SELECT trifecta, date FROM results ORDER BY date ASC"
        : "SELECT trifecta, date FROM results WHERE venue = ? ORDER BY date ASC";
      
      const allResults = venue === 'all' ? db.prepare(query).all() : db.prepare(query).all(venue);
      
      const trifectaHistory: Record<string, string[]> = {};
      allResults.forEach((r: any) => {
        if (!trifectaHistory[r.trifecta]) trifectaHistory[r.trifecta] = [];
        // Only add unique dates for gap calculation
        if (trifectaHistory[r.trifecta][trifectaHistory[r.trifecta].length - 1] !== r.date) {
          trifectaHistory[r.trifecta].push(r.date);
        }
      });

      const parseDate = (d: string) => new Date(`${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`).getTime();
      const oneDay = 24 * 60 * 60 * 1000;
      const todayTs = parseDate(todayStr);

      const hotnessData = Object.entries(trifectaHistory).map(([trifecta, dates]) => {
        const gaps: number[] = [];
        for (let i = 1; i < dates.length; i++) {
          const diff = (parseDate(dates[i]) - parseDate(dates[i-1])) / oneDay;
          gaps.push(diff);
        }

        const lastDate = dates[dates.length - 1];
        const currentGap = (todayTs - parseDate(lastDate)) / oneDay;
        
        if (gaps.length === 0) {
          return {
            trifecta,
            currentGap,
            averageGap: 0,
            maxGap: 0,
            score: 0,
            count: dates.length
          };
        }

        const averageGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const maxGap = Math.max(...gaps);
        
        // Hotness Score Calculation
        // 1. Overdue Ratio (Current / Average) - Weight 50%
        const overdueRatio = currentGap / averageGap;
        // 2. Max Proximity (Current / Max) - Weight 50%
        const maxProximity = currentGap / maxGap;
        
        // Normalize and combine
        let score = (overdueRatio * 40) + (maxProximity * 60);
        // Cap at 100 for display, but allow higher for sorting
        
        return {
          trifecta,
          currentGap,
          averageGap: Math.round(averageGap * 10) / 10,
          maxGap,
          score: Math.round(score),
          count: dates.length,
          lastDate
        };
      });

      // Filter out those with very little data (less than 3 appearances) to avoid noise
      const filtered = hotnessData
        .filter(d => d.count >= 2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 50);

      res.json({ hotness: filtered });
    } catch (error) {
      console.error("Hotness API error:", error);
      res.status(500).json({ error: "Failed to calculate hotness" });
    }
  });

  app.get("/api/stats", (req, res) => {
    try {
      const count = db.prepare("SELECT COUNT(*) as count FROM results").get() as { count: number };
      const dates = db.prepare("SELECT COUNT(*) as count FROM scraped_dates").get() as { count: number };
      const lastScraped = db.prepare("SELECT MAX(date) as date FROM scraped_dates").get() as { date: string };
      res.json({ 
        totalResults: count.count, 
        totalDays: dates.count,
        lastScraped: lastScraped.date
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.post("/api/scrape-history", async (req, res) => {
    const days = parseInt(req.query.days as string) || 30;
    const today = new Date();
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let isAborted = false;
    req.on('close', () => {
      isAborted = true;
    });

    for (let i = 1; i <= days; i++) {
      if (isAborted) break;
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - i);
      const y = targetDate.getFullYear();
      const m = String(targetDate.getMonth() + 1).padStart(2, '0');
      const d = String(targetDate.getDate()).padStart(2, '0');
      const dStr = `${y}${m}${d}`;

      const alreadyScraped = isDateScraped.get(dStr);
      if (alreadyScraped) {
        res.write(`data: ${JSON.stringify({ date: dStr, status: 'skipped' })}\n\n`);
        continue;
      }

      try {
        const dayResults = await fetchDayResults(dStr);
        if (dayResults.length > 0) {
          db.transaction(() => {
            for (const r of dayResults) {
              insertResult.run(r.date, r.venue, r.raceNum, r.trifecta, r.dividend);
            }
            insertScrapedDate.run(dStr);
          })();
        }
        res.write(`data: ${JSON.stringify({ date: dStr, status: 'success', count: dayResults.length })}\n\n`);
      } catch (error) {
        res.write(`data: ${JSON.stringify({ date: dStr, status: 'error' })}\n\n`);
      }
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    res.write('data: {"done": true}\n\n');
    res.end();
  });

  app.get("/api/results", async (req, res) => {
    const startDate = req.query.startDate as string; // YYYYMMDD
    const endDate = req.query.endDate as string; // YYYYMMDD
    const singleDate = req.query.date as string; // YYYYMMDD

    const start = startDate || singleDate;
    const end = endDate || singleDate;

    if (!start) {
      return res.status(400).json({ error: "Date is required" });
    }

    try {
      // Generate list of dates to check
      const datesToFetch: string[] = [];
      let current = new Date(`${start.substring(0, 4)}-${start.substring(4, 6)}-${start.substring(6, 8)}`);
      const last = new Date(`${end.substring(0, 4)}-${end.substring(4, 6)}-${end.substring(6, 8)}`);

      // Limit range to 31 days to prevent abuse/timeout
      let count = 0;
      while (current <= last && count < 31) {
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        datesToFetch.push(`${y}${m}${d}`);
        current.setDate(current.getDate() + 1);
        count++;
      }

      // Parallelize scraping with limited concurrency
      const todayJST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
      const concurrency = 3;
      for (let i = 0; i < datesToFetch.length; i += concurrency) {
        const chunk = datesToFetch.slice(i, i + concurrency);
        await Promise.all(chunk.map(async (dateStr) => {
          // Allow re-scraping if it's today (JST) to get latest results
          if (isDateScraped.get(dateStr) && dateStr !== todayJST) return;

          try {
            const dayResults = await fetchDayResults(dateStr);
            if (dayResults.length > 0) {
              db.transaction(() => {
                for (const r of dayResults) {
                  insertResult.run(r.date, r.venue, r.raceNum, r.trifecta, r.dividend);
                }
                // Only mark as fully scraped if it's a past date
                if (dateStr !== todayJST) {
                  insertScrapedDate.run(dateStr);
                }
              })();
            } else {
              if (dateStr < todayJST) {
                insertScrapedDate.run(dateStr);
              }
            }
          } catch (error) {
            console.error(`Error fetching results for ${dateStr}:`, error);
          }
        }));
      }

      const finalResults = getResultsByDateRange.all(start, end);
      res.json({ results: finalResults });
    } catch (error) {
      console.error("API error:", error);
      res.status(500).json({ error: "Failed to fetch results" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
