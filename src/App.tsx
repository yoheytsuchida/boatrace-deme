/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Calendar, Trophy, Hash, MapPin, Loader2, AlertCircle, ChevronRight, LineChart as LineChartIcon, List, Filter, ArrowUpDown, Target, Banknote, Percent, Zap, BarChart3, Clock, Heart, Map, Activity, TrendingUp, Flame, Info, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface RaceResult {
  date: string;
  venue: string;
  raceNum: string;
  trifecta: string;
  dividend: number;
  lastDate?: string;
}

const VENUES = [
  '桐生', '戸田', '江戸川', '平和島', '多摩川', '浜名湖', '蒲郡', '常滑', 
  '津', '三国', 'びわこ', '住之江', '尼崎', '鳴門', '丸亀', '児島', 
  '宮島', '徳山', '下関', '若松', '芦屋', '福岡', '唐津', '大村'
];

export default function App() {
  const [results, setResults] = useState<RaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Date states
  const [isRangeMode, setIsRangeMode] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14); // Default to 2 weeks for better line chart
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  });
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  });
  const [singleDate, setSingleDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date_desc' | 'dividend_desc' | 'dividend_asc' | 'days_desc'>('date_desc');
  const [activeTab, setActiveTab] = useState<'results' | 'hamari' | 'manshu' | 'recovery' | 'portfolio' | 'hotness'>('results');
  const [expandedHamari, setExpandedHamari] = useState<string | null>(null);
  const [selectedHamariVenue, setSelectedHamariVenue] = useState<string>('all');
  const [lastAppearances, setLastAppearances] = useState<Record<string, string>>({});
  const [selectedRecoveryVenue, setSelectedRecoveryVenue] = useState<string>('all');
  const [selectedHotnessVenue, setSelectedHotnessVenue] = useState<string>('all');
  const [hotnessData, setHotnessData] = useState<any[]>([]);
  const [scraping, setScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<{ date: string, status: string, count?: number } | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [dbStats, setDbStats] = useState<{ totalResults: number, totalDays: number, lastScraped: string } | null>(null);
  const [visibleResultsCount, setVisibleResultsCount] = useState(60);
  const [portfolio, setPortfolio] = useState<string[]>(() => {
    const saved = localStorage.getItem('boatrace_portfolio');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('boatrace_portfolio', JSON.stringify(portfolio));
  }, [portfolio]);

  const togglePortfolio = (trifecta: string) => {
    setPortfolio(prev => 
      prev.includes(trifecta) 
        ? prev.filter(t => t !== trifecta) 
        : [...prev, trifecta]
    );
  };

  const fetchResults = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = '/api/results';
      if (isRangeMode) {
        url += `?startDate=${startDate}&endDate=${endDate}`;
      } else {
        url += `?date=${singleDate}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('データの取得に失敗しました');
      const data = await response.json();
      setResults(data.results || []);
      fetchStats(); // Refresh stats after fetching results
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/stats');
      if (response.ok) {
        const data = await response.json();
        setDbStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchHamariData = async () => {
    try {
      const targetDate = isRangeMode ? endDate : singleDate;
      const url = `/api/hamari?date=${targetDate}&venue=${selectedHamariVenue}`;
      const response = await fetch(url);
      if (!response.ok) return;
      const data = await response.json();
      const map: Record<string, string> = {};
      data.appearances.forEach((a: { trifecta: string, lastDate: string }) => {
        map[a.trifecta] = a.lastDate;
      });
      setLastAppearances(map);
    } catch (err) {
      console.error("Failed to fetch hamari data:", err);
    }
  };

  const fetchHotnessData = async () => {
    setLoading(true);
    try {
      const url = `/api/hotness?venue=${selectedHotnessVenue}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('指数の取得に失敗しました');
      const data = await response.json();
      setHotnessData(data.hotness || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
    setVisibleResultsCount(60); // Reset count when dates change
  }, [singleDate, startDate, endDate, isRangeMode]);

  useEffect(() => {
    fetchHamariData();
  }, [singleDate, endDate, isRangeMode, selectedHamariVenue]);

  useEffect(() => {
    if (activeTab === 'hotness') {
      fetchHotnessData();
    } else if (activeTab === 'hamari') {
      // Also fetch hotness data for hamari tab to unify indices
      const fetchHamariHotness = async () => {
        try {
          const url = `/api/hotness?venue=${selectedHamariVenue}`;
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            setHotnessData(data.hotness || []);
          }
        } catch (err) {
          console.error("Failed to fetch hotness for hamari:", err);
        }
      };
      fetchHamariHotness();
    }
  }, [activeTab, selectedHotnessVenue, selectedHamariVenue]);

  const calculateDaysDiff = (date1: string, date2: string) => {
    const d1 = new Date(`${date1.substring(0, 4)}-${date1.substring(4, 6)}-${date1.substring(6, 8)}`);
    const d2 = new Date(`${date2.substring(0, 4)}-${date2.substring(4, 6)}-${date2.substring(6, 8)}`);
    const diffTime = Math.abs(d1.getTime() - d2.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const filteredResults = useMemo(() => {
    const cleanQuery = searchQuery.trim();
    const queries = cleanQuery.split(',').map(q => q.trim()).filter(q => q.length > 0);
    
    let filtered = results;
    if (queries.length > 0) {
      filtered = results.filter(r => {
        return queries.some(q => {
          const digits = q.replace(/[^1-6]/g, '');
          const isTrifectaSearch = digits.length >= 3;
          const normalizedTrifecta = isTrifectaSearch ? digits.substring(0, 3).split('').join('-') : null;
          
          const venueMatch = r.venue.includes(q);
          const trifectaMatch = normalizedTrifecta ? r.trifecta === normalizedTrifecta : r.trifecta.replace(/-/g, '').includes(digits);
          
          return venueMatch || (digits.length > 0 && trifectaMatch);
        });
      });
    }

    // Calculate lastDate for each item (since it's removed from server)
    // We need to sort by date ascending to calculate this correctly
    const sortedAsc = [...filtered].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.raceNum.localeCompare(b.raceNum);
    });

    const lastSeenMap: Record<string, string> = { ...lastAppearances };
    const resultsWithLastDate = sortedAsc.map(r => {
      const lastDate = lastSeenMap[r.trifecta];
      lastSeenMap[r.trifecta] = r.date;
      return { ...r, lastDate };
    });

    // Apply sorting
    return resultsWithLastDate.sort((a, b) => {
      if (sortBy === 'date_desc') {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return b.raceNum.localeCompare(a.raceNum);
      } else if (sortBy === 'dividend_desc') {
        return b.dividend - a.dividend;
      } else if (sortBy === 'dividend_asc') {
        return a.dividend - b.dividend;
      } else if (sortBy === 'days_desc') {
        const daysA = a.lastDate ? calculateDaysDiff(a.date, a.lastDate) : 0;
        const daysB = b.lastDate ? calculateDaysDiff(b.date, b.lastDate) : 0;
        if (daysA !== daysB) return daysB - daysA;
        return b.date.localeCompare(a.date);
      }
      return 0;
    });
  }, [results, searchQuery, sortBy, calculateDaysDiff, lastAppearances]);

  const { chartData, activeTrifectas, trifectaCounts } = useMemo(() => {
    const dateMap: Record<string, Record<string, number>> = {};
    const counts: Record<string, number> = {};
    
    filteredResults.forEach(r => {
      if (!dateMap[r.date]) dateMap[r.date] = {};
      dateMap[r.date][r.trifecta] = (dateMap[r.date][r.trifecta] || 0) + 1;
      counts[r.trifecta] = (counts[r.trifecta] || 0) + 1;
    });

    // Determine which trifectas to show as lines
    // If user searched for specific ones, show those. Otherwise show top 5.
    let trifectasToShow: string[] = [];
    if (searchQuery) {
      const queries = searchQuery.split(',').map(q => q.trim()).filter(q => q.length > 0);
      trifectasToShow = queries.map(q => {
        const digits = q.replace(/[^1-6]/g, '');
        return digits.length >= 3 ? digits.substring(0, 3).split('').join('-') : null;
      }).filter((t): t is string => t !== null);
    }

    if (trifectasToShow.length === 0) {
      trifectasToShow = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(e => e[0]);
    }

    // Ensure unique
    trifectasToShow = Array.from(new Set(trifectasToShow));

    const sortedDates = Object.keys(dateMap).sort();
    const data = sortedDates.map(date => {
      const entry: any = { 
        fullDate: date,
        displayDate: `${date.substring(4, 6)}/${date.substring(6, 8)}` 
      };
      trifectasToShow.forEach(t => {
        entry[t] = dateMap[date][t] || 0;
      });
      return entry;
    });

    return { chartData: data, activeTrifectas: trifectasToShow, trifectaCounts: counts };
  }, [filteredResults, searchQuery]);

  const isToday = useMemo(() => {
    const todayJST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
    return !isRangeMode && singleDate === todayJST;
  }, [singleDate, isRangeMode]);

  const stats = useMemo(() => {
    if (!searchQuery || results.length === 0) return [];

    const cleanQuery = searchQuery.trim();
    const queries = cleanQuery.split(',').map(q => q.trim()).filter(q => q.length > 0);
    
    const uniqueTrifectas = queries.map(q => {
      const digits = q.replace(/[^1-6]/g, '');
      return digits.length >= 3 ? digits.substring(0, 3).split('').join('-') : null;
    }).filter((t): t is string => t !== null);

    const trifectaList = Array.from(new Set(uniqueTrifectas));
    const totalRaces = results.length;

    return trifectaList.map(t => {
      const occurrences = results.filter(r => r.trifecta === t);
      const hitCount = occurrences.length;
      const totalDividend = occurrences.reduce((sum, r) => sum + r.dividend, 0);
      
      const hitRate = (hitCount / totalRaces) * 100;
      const recoveryRate = (totalDividend / (totalRaces * 100)) * 100;

      return {
        trifecta: t,
        hitCount,
        totalDividend,
        hitRate,
        recoveryRate
      };
    });
  }, [results, searchQuery]);

  const hamariRanking = useMemo(() => {
    if (results.length === 0) return [];

    // Filter results by selected venue if not 'all'
    const targetResults = selectedHamariVenue === 'all' 
      ? results 
      : results.filter(r => r.venue === selectedHamariVenue);

    // Generate all 120 trifectas (static, could be moved outside)
    const allTrifectas: string[] = [];
    for (let i = 1; i <= 6; i++) {
      for (let j = 1; j <= 6; j++) {
        if (i === j) continue;
        for (let k = 1; k <= 6; k++) {
          if (k === i || k === j) continue;
          allTrifectas.push(`${i}-${j}-${k}`);
        }
      }
    }

    const latestDate: string | undefined = isRangeMode ? endDate : singleDate;
    if (!latestDate) return [];

    const parseDate = (d: string) => new Date(`${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`).getTime();
    const latestTime = parseDate(latestDate);
    const msPerDay = 1000 * 60 * 60 * 24;
    
    // Pre-group results by trifecta for performance
    const resultsByTrifecta: Record<string, RaceResult[]> = {};
    targetResults.forEach(r => {
      if (!resultsByTrifecta[r.trifecta]) resultsByTrifecta[r.trifecta] = [];
      resultsByTrifecta[r.trifecta].push(r);
    });

    return allTrifectas.map(t => {
      const trifectaResults = resultsByTrifecta[t] || [];
      const lastAppearance = lastAppearances[t];
      
      // Look up hotness score from fetched data for unification
      const hotnessInfo = hotnessData.find(h => h.trifecta === t);
      const score = hotnessInfo ? hotnessInfo.score : 0;

      if (!lastAppearance) {
        return {
          trifecta: t,
          days: 999,
          lastDate: null,
          lastResult: null,
          isNever: true,
          score: score
        };
      }

      const lastTime = parseDate(lastAppearance);
      const diffDays = Math.ceil(Math.abs(latestTime - lastTime) / msPerDay);

      return {
        trifecta: t,
        days: diffDays,
        lastDate: lastAppearance,
        lastResult: trifectaResults.sort((a, b) => b.date.localeCompare(a.date))[0] || null,
        isNever: false,
        score: score
      };
    })
    .sort((a, b) => b.days - a.days);
  }, [results, selectedHamariVenue, lastAppearances, singleDate, endDate, isRangeMode, hotnessData]);

  const manshuHunter = useMemo(() => {
    if (results.length === 0) return [];
    
    const highPayouts = results.filter(r => r.dividend >= 10000);
    const counts: Record<string, { count: number, total: number, max: number }> = {};
    
    highPayouts.forEach(r => {
      if (!counts[r.trifecta]) {
        counts[r.trifecta] = { count: 0, total: 0, max: 0 };
      }
      counts[r.trifecta].count++;
      counts[r.trifecta].total += r.dividend;
      counts[r.trifecta].max = Math.max(counts[r.trifecta].max, r.dividend);
    });

    return Object.entries(counts)
      .map(([trifecta, data]) => ({
        trifecta,
        manshuCount: data.count,
        avgManshu: Math.round(data.total / data.count),
        maxManshu: data.max,
        manshuRate: (data.count / results.filter(r => r.trifecta === trifecta).length) * 100
      }))
      .sort((a, b) => b.manshuCount - a.manshuCount)
      .slice(0, 30);
  }, [results]);

  const recoveryRanking = useMemo(() => {
    if (results.length === 0) return [];

    const targetResults = selectedRecoveryVenue === 'all' 
      ? results 
      : results.filter(r => r.venue === selectedRecoveryVenue);

    if (targetResults.length === 0) return [];

    const totalRaces = targetResults.length;
    const investmentPerTrifecta = totalRaces * 100;

    // Generate all 120 trifectas
    const allTrifectas: string[] = [];
    for (let i = 1; i <= 6; i++) {
      for (let j = 1; j <= 6; j++) {
        if (i === j) continue;
        for (let k = 1; k <= 6; k++) {
          if (k === i || k === j) continue;
          allTrifectas.push(`${i}-${j}-${k}`);
        }
      }
    }

    return allTrifectas.map(t => {
      const hits = targetResults.filter(r => r.trifecta === t);
      const totalReturn = hits.reduce((acc, curr) => acc + curr.dividend, 0);
      const recoveryRate = (totalReturn / investmentPerTrifecta) * 100;

      return {
        trifecta: t,
        hitCount: hits.length,
        totalReturn,
        recoveryRate,
        maxDividend: hits.length > 0 ? Math.max(...hits.map(h => h.dividend)) : 0
      };
    })
    .filter(item => item.hitCount > 0)
    .sort((a, b) => b.recoveryRate - a.recoveryRate)
    .slice(0, 50);
  }, [results, selectedRecoveryVenue]);

  const portfolioStats = useMemo(() => {
    if (results.length === 0 || portfolio.length === 0) return [];

    return portfolio.map(t => {
      const hits = results.filter(r => r.trifecta === t);
      const totalInvestment = results.length * 100;
      const totalReturn = hits.reduce((acc, curr) => acc + curr.dividend, 0);
      return {
        trifecta: t,
        hits: hits.length,
        recovery: (totalReturn / totalInvestment) * 100,
        profit: totalReturn - totalInvestment
      };
    }).sort((a, b) => b.profit - a.profit);
  }, [results, portfolio]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const y = dateStr.substring(0, 4);
    const m = dateStr.substring(4, 6);
    const d = dateStr.substring(6, 8);
    return `${y}年${m}月${d}日`;
  };

  const toInputDate = (dateStr: string) => {
    return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
  };

  const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const startScraping = async (days: number) => {
    const controller = new AbortController();
    setAbortController(controller);
    setScraping(true);
    setScrapeProgress(null);
    try {
      const response = await fetch(`/api/scrape-history?days=${days}`, { 
        method: 'POST',
        signal: controller.signal
      });
      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.done) {
                setScraping(false);
                setAbortController(null);
                fetchResults();
                fetchHamariData();
              } else {
                setScrapeProgress(data);
              }
            } catch (e) {
              // Ignore partial JSON
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log("Scraping aborted");
      } else {
        console.error("Scraping error:", err);
      }
      setScraping(false);
      setAbortController(null);
    }
  };

  const stopScraping = () => {
    if (abortController) {
      abortController.abort();
      setScraping(false);
      setAbortController(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#212529] font-sans selection:bg-blue-100 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Trophy className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">ボートレース出目検索</h1>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-center md:justify-end">
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button 
                onClick={() => setIsRangeMode(false)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${!isRangeMode ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                単日
              </button>
              <button 
                onClick={() => setIsRangeMode(true)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${isRangeMode ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                期間
              </button>
            </div>

            <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
              <Calendar className="w-4 h-4 text-gray-500 ml-2" />
              {!isRangeMode ? (
                <input 
                  type="date" 
                  className="bg-transparent border-none focus:ring-0 text-sm py-1 pr-2 outline-none"
                  value={toInputDate(singleDate)}
                  onChange={(e) => setSingleDate(e.target.value.replace(/-/g, ''))}
                />
              ) : (
                <div className="flex items-center gap-1">
                  <input 
                    type="date" 
                    className="bg-transparent border-none focus:ring-0 text-sm py-1 outline-none w-32"
                    value={toInputDate(startDate)}
                    onChange={(e) => setStartDate(e.target.value.replace(/-/g, ''))}
                  />
                  <span className="text-gray-400">~</span>
                  <input 
                    type="date" 
                    className="bg-transparent border-none focus:ring-0 text-sm py-1 pr-2 outline-none w-32"
                    value={toInputDate(endDate)}
                    onChange={(e) => setEndDate(e.target.value.replace(/-/g, ''))}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Search Section */}
        <section className="mb-6">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
            <input 
              type="text"
              placeholder="出目を検索 (例: 123, 124, 125)"
              className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-lg"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Data Management Section (Moved and Compacted) */}
          <div className="mt-4 bg-gray-50/50 border border-gray-100 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-white rounded-lg border border-gray-100">
                <Activity className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">データ管理</span>
                  {dbStats && (
                    <div className="flex gap-2 text-[10px] text-gray-400 font-mono">
                      <span>{dbStats.totalResults.toLocaleString()}件</span>
                      <span>/</span>
                      <span>{dbStats.totalDays}日分</span>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 leading-tight">
                  取得済みデータは永続保存されます。
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {scraping ? (
                <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                  <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />
                  <span className="text-[10px] font-bold text-blue-600">
                    {scrapeProgress?.date} ({scrapeProgress?.count !== undefined ? `${scrapeProgress.count}件` : '取得中'})
                  </span>
                  <button 
                    onClick={stopScraping}
                    className="ml-1 text-[10px] text-red-500 hover:text-red-700 font-bold"
                  >
                    中止
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap justify-center gap-1.5">
                  <button 
                    onClick={() => startScraping(30)}
                    className="bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                  >
                    30日
                  </button>
                  <button 
                    onClick={() => startScraping(90)}
                    className="bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                  >
                    90日
                  </button>
                  <button 
                    onClick={() => startScraping(365)}
                    className="bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                  >
                    1年
                  </button>
                  <button 
                    onClick={() => startScraping(730)}
                    className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                  >
                    2年
                  </button>
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-4 flex flex-wrap gap-2">
            {searchQuery && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 text-blue-600 font-medium bg-blue-50 px-4 py-2 rounded-full text-sm"
              >
                <Hash className="w-4 h-4" />
                <span>出現回数: {filteredResults.length}回</span>
              </motion.div>
            )}
            {isRangeMode && (
              <div className="flex items-center gap-2 text-gray-600 font-medium bg-gray-100 px-4 py-2 rounded-full text-sm">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(startDate)} 〜 {formatDate(endDate)}</span>
              </div>
            )}
          </div>
        </section>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-8 overflow-x-auto no-scrollbar scroll-smooth">
          <div className="flex min-w-max">
            <button
              onClick={() => setActiveTab('results')}
              className={`px-6 py-3 text-sm font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'results' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              <BarChart3 className="w-4 h-4" />
              結果・分析
            </button>
            <button
              onClick={() => setActiveTab('hamari')}
              className={`px-6 py-3 text-sm font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'hamari' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              <Clock className="w-4 h-4" />
              ハマり目
            </button>
            <button
              onClick={() => setActiveTab('hotness')}
              className={`px-6 py-3 text-sm font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'hotness' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              <Flame className="w-4 h-4" />
              出目期待値
            </button>
            <button
              onClick={() => setActiveTab('manshu')}
              className={`px-6 py-3 text-sm font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'manshu' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              <TrendingUp className="w-4 h-4" />
              万舟ハンター
            </button>
            <button
              onClick={() => setActiveTab('recovery')}
              className={`px-6 py-3 text-sm font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'recovery' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              <Percent className="w-4 h-4" />
              回収率ランキング
            </button>
            <button
              onClick={() => setActiveTab('portfolio')}
              className={`px-6 py-3 text-sm font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'portfolio' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              <Heart className="w-4 h-4" />
              マイ投資
            </button>
          </div>
        </div>

        {activeTab === 'results' ? (
          <>
            {/* Stats Section */}
        <AnimatePresence>
          {stats.length > 0 && (
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-12"
            >
              <div className="flex items-center gap-2 mb-6">
                <Zap className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-gray-800">的中率・回収率分析</h3>
                <span className="text-xs text-gray-400 font-normal">※1点100円購入想定 / 全{results.length}レース対象</span>
              </div>
              
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {stats.map((stat) => (
                  <div 
                    key={stat.trifecta}
                    className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-blue-500"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-2xl font-black tracking-tighter text-gray-900">
                        {stat.trifecta}
                      </div>
                      <div className="bg-blue-50 text-blue-600 text-xs font-bold px-2 py-1 rounded-lg">
                        的中 {stat.hitCount}回
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-[10px] text-gray-400 font-bold uppercase">
                          <Target className="w-3 h-3" />
                          的中率
                        </div>
                        <div className="text-xl font-bold text-gray-800">
                          {stat.hitRate.toFixed(1)}<span className="text-sm ml-0.5">%</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-[10px] text-gray-400 font-bold uppercase">
                          <Banknote className="w-3 h-3" />
                          回収率
                        </div>
                        <div className={`text-xl font-bold ${stat.recoveryRate >= 100 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {stat.recoveryRate.toFixed(1)}<span className="text-sm ml-0.5">%</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-50 flex justify-between items-center text-[10px]">
                      <span className="text-gray-400 font-bold uppercase tracking-wider">投資: ¥{(results.length * 100).toLocaleString()}</span>
                      <span className="text-gray-900 font-bold">払戻: ¥{stat.totalDividend.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Visualization Section */}
        {isRangeMode && chartData.length > 0 && (
          <section className="mb-12">
            <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <LineChartIcon className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-gray-800">出現回数推移</h3>
              </div>
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 30, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="displayDate" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fontWeight: 600 }}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="top" height={36}/>
                    {activeTrifectas.map((t, i) => (
                      <Line 
                        key={t}
                        name={`${t} (計${trifectaCounts[t]}回)`}
                        type="monotone" 
                        dataKey={t} 
                        stroke={colors[i % colors.length]} 
                        strokeWidth={3}
                        dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                        activeDot={{ r: 6 }}
                        animationDuration={1000}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        )}

        {/* Results Section */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <List className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-bold text-gray-800">
                レース結果一覧
                <span className="ml-2 text-sm font-normal text-gray-400">({filteredResults.length}件)</span>
              </h2>
            </div>
            
            <div className="flex items-center gap-4">
              {isToday && (
                <button 
                  onClick={fetchResults}
                  disabled={loading}
                  className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-1.5 rounded-lg font-bold text-sm hover:bg-blue-700 transition-all shadow-md shadow-blue-100 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  最新に更新
                </button>
              )}

              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                <ArrowUpDown className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-bold text-gray-400 whitespace-nowrap hidden sm:inline">並び替え:</span>
                <select 
                  className="text-sm font-bold text-gray-700 outline-none bg-transparent cursor-pointer pr-1"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                >
                  <option value="date_desc">最新順</option>
                  <option value="days_desc">久しぶり順</option>
                  <option value="dividend_desc">高配当順</option>
                  <option value="dividend_asc">低配当順</option>
                </select>
              </div>

              <button 
                onClick={fetchResults}
                disabled={loading}
                className="text-sm text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-bold transition-colors disabled:opacity-50"
              >
                再読み込み
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
              <p className="text-gray-500 font-medium animate-pulse">データを取得中...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-100 rounded-3xl p-12 text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h3 className="text-red-800 font-bold text-xl mb-2">エラーが発生しました</h3>
              <p className="text-red-600 mb-6">{error}</p>
              <button 
                onClick={fetchResults}
                className="bg-red-600 text-white px-8 py-3 rounded-full font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200"
              >
                再試行
              </button>
            </div>
          ) : results.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-3xl p-16 text-center shadow-sm">
              <div className="bg-amber-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-10 h-10 text-amber-400" />
              </div>
              <p className="text-gray-900 text-xl font-bold">データが見つかりません</p>
              <p className="text-gray-500 mt-2 max-w-sm mx-auto">
                {isRangeMode ? `${formatDate(startDate)} 〜 ${formatDate(endDate)}` : formatDate(singleDate)} の結果はまだ公開されていないか、取得できませんでした。
              </p>
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-3xl p-16 text-center shadow-sm">
              <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Search className="w-10 h-10 text-gray-300" />
              </div>
              <p className="text-gray-900 text-xl font-bold">該当する出目はありません</p>
              <p className="text-gray-500 mt-2">「{searchQuery}」に一致する結果は見つかりませんでした。</p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence>
                  {filteredResults.slice(0, visibleResultsCount).map((result, idx) => {
                    const daysSince = result.lastDate ? calculateDaysDiff(result.date, result.lastDate) : null;
                    const showDaysSince = !isRangeMode && daysSince !== null && daysSince >= 5;

                    return (
                      <motion.div
                        key={`${result.date}-${result.venue}-${result.raceNum}-${idx}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-blue-300 hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden"
                      >
                        <div className="absolute top-1/2 right-0 -translate-y-1/2 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight className="w-4 h-4 text-blue-400" />
                        </div>
                        
                        <div className="flex flex-col h-full">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex items-center gap-1.5 text-gray-400 text-xs font-bold uppercase tracking-wider">
                                <Calendar className="w-3 h-3" />
                                <span>{formatDate(result.date)}</span>
                              </div>
                              {!!showDaysSince && (
                                <motion.span 
                                  initial={{ scale: 0.9, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  className="flex items-center gap-1 bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm shadow-orange-200 whitespace-nowrap"
                                >
                                  <Flame className="w-2.5 h-2.5 fill-current" />
                                  <span>{daysSince}日振り</span>
                                </motion.span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePortfolio(result.trifecta);
                                }}
                                className={`p-1 rounded-full transition-colors ${portfolio.includes(result.trifecta) ? 'text-red-500 bg-red-50' : 'text-gray-300 hover:text-gray-400'}`}
                              >
                                <Heart className={`w-4 h-4 ${portfolio.includes(result.trifecta) ? 'fill-current' : ''}`} />
                              </button>
                              <span className="bg-blue-50 text-blue-600 text-[10px] font-black px-2 py-0.5 rounded-md uppercase">
                                {result.raceNum}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 mb-4">
                            <div className="bg-gray-100 p-1.5 rounded-lg group-hover:bg-blue-50 transition-colors">
                              <MapPin className="w-4 h-4 text-gray-500 group-hover:text-blue-500" />
                            </div>
                            <span className="font-bold text-gray-800">{result.venue}</span>
                          </div>

                          <div className="mt-auto pt-4 border-t border-gray-50 flex items-end justify-between">
                            <div>
                              <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">三連単</div>
                              <div className="text-2xl font-black tracking-tighter text-gray-900 group-hover:text-blue-600 transition-colors">
                                {result.trifecta}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">配当</div>
                              <div className="text-lg font-bold text-emerald-600">
                                ¥{result.dividend.toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              {filteredResults.length > visibleResultsCount && (
                <div className="mt-8 text-center">
                  <button 
                    onClick={() => setVisibleResultsCount(prev => prev + 60)}
                    className="bg-white border border-gray-200 text-gray-600 px-8 py-3 rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm"
                  >
                    さらに読み込む ({filteredResults.length - visibleResultsCount}件)
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </>
    ) : activeTab === 'hamari' ? (
      <section className="mb-12">
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-gray-800">ハマり目ランキング (TOP 30)</h3>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 text-[10px] text-gray-400 font-bold uppercase">
                <Flame className="w-3 h-3 text-orange-500" />
                出目期待値
              </div>
              <span className="text-xs text-gray-400">※統計的に算出された出現期待度</span>
            </div>
          </div>

          {/* Venue Selector for Hamari */}
          <div className="mb-8 overflow-x-auto no-scrollbar pb-2">
            <div className="flex gap-2 min-w-max">
              <button
                onClick={() => setSelectedHamariVenue('all')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedHamariVenue === 'all' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                全場
              </button>
              {VENUES.map(v => (
                <button
                  key={v}
                  onClick={() => setSelectedHamariVenue(v)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedHamariVenue === v ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {hamariRanking.length === 0 ? (
            <div className="py-20 text-center">
              <Search className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-bold">データが見つかりません</p>
              <p className="text-xs text-gray-400 mt-1">選択した場または期間の結果がありません</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {hamariRanking.slice(0, 30).map((item, index) => (
                <div 
                  key={item.trifecta}
                  onClick={() => setExpandedHamari(expandedHamari === item.trifecta ? null : item.trifecta)}
                  className={`p-4 bg-gray-50 rounded-2xl border transition-all group cursor-pointer ${expandedHamari === item.trifecta ? 'border-amber-400 bg-amber-50 shadow-md ring-1 ring-amber-400' : 'border-transparent hover:border-amber-200 hover:bg-amber-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-black ${index < 3 ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                        {index + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-lg font-black tracking-tighter text-gray-900 group-hover:text-amber-600">
                            {item.trifecta}
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePortfolio(item.trifecta);
                            }}
                            className={`p-1 rounded-full transition-colors ${portfolio.includes(item.trifecta) ? 'text-red-500 bg-red-50' : 'text-gray-300 hover:text-gray-400'}`}
                          >
                            <Heart className={`w-3 h-3 ${portfolio.includes(item.trifecta) ? 'fill-current' : ''}`} />
                          </button>
                        </div>
                        <div className="text-[10px] text-gray-400 font-bold uppercase">
                          {item.isNever ? '期間中出現なし' : `最終: ${item.lastDate?.substring(4, 6)}/${item.lastDate?.substring(6, 8)}`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-black text-amber-600">
                        {item.days}<span className="text-xs ml-0.5">日</span>
                      </div>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <div className="w-12 h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-orange-500" 
                            style={{ width: `${Math.min(item.score, 100)}%` }}
                          />
                        </div>
                        <span className="text-[9px] font-black text-orange-500">{item.score}</span>
                      </div>
                      <div className="text-[8px] font-bold text-gray-400 uppercase mt-0.5">出目期待値</div>
                    </div>
                  </div>

                  {expandedHamari === item.trifecta && !item.isNever && item.lastResult && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-4 pt-4 border-t border-amber-200/50 text-xs"
                    >
                      <div className="grid grid-cols-2 gap-y-2">
                        <div className="flex flex-col">
                          <span className="text-gray-400 font-bold uppercase text-[9px]">開催場</span>
                          <span className="font-bold text-gray-700">{item.lastResult.venue}</span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-gray-400 font-bold uppercase text-[9px]">レース</span>
                          <span className="font-bold text-gray-700">{item.lastResult.raceNum}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray-400 font-bold uppercase text-[9px]">日付</span>
                          <span className="font-bold text-gray-700">{formatDate(item.lastResult.date)}</span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-gray-400 font-bold uppercase text-[9px]">配当</span>
                          <span className="font-bold text-emerald-600">¥{item.lastResult.dividend.toLocaleString()}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    ) : activeTab === 'hotness' ? (
      <section className="mb-12">
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-500" />
              <h3 className="font-bold text-gray-800">出目期待値指数 (Hotness Index)</h3>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 text-[10px] text-gray-400 font-bold uppercase">
                <Info className="w-3 h-3" />
                統計的に出現が期待される出目
              </div>
            </div>
          </div>

          {/* Venue Selector for Hotness */}
          <div className="mb-8 overflow-x-auto no-scrollbar pb-2">
            <div className="flex gap-2 min-w-max">
              <button
                onClick={() => setSelectedHotnessVenue('all')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedHotnessVenue === 'all' ? 'bg-orange-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                全場
              </button>
              {VENUES.map(v => (
                <button
                  key={v}
                  onClick={() => setSelectedHotnessVenue(v)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedHotnessVenue === v ? 'bg-orange-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-500 font-bold">指数を計算中...</p>
            </div>
          ) : hotnessData.length === 0 ? (
            <div className="py-20 text-center">
              <Search className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-bold">データが不足しています</p>
              <p className="text-xs text-gray-400 mt-1">統計計算には少なくとも2回以上の出現データが必要です</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {hotnessData.map((item, index) => (
                <div key={item.trifecta} className="p-5 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                  {/* Hotness Gauge Background */}
                  <div 
                    className="absolute bottom-0 left-0 h-1 bg-orange-500 transition-all duration-1000" 
                    style={{ width: `${Math.min(item.score, 100)}%`, opacity: 0.3 + (Math.min(item.score, 100) / 150) }}
                  />
                  
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-black text-gray-900">{item.trifecta}</span>
                      <button onClick={() => togglePortfolio(item.trifecta)} className={`p-1 ${portfolio.includes(item.trifecta) ? 'text-red-500' : 'text-gray-300'}`}>
                        <Heart className={`w-3 h-3 ${portfolio.includes(item.trifecta) ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className={`text-2xl font-black flex items-center gap-1 ${item.score >= 80 ? 'text-orange-600' : 'text-gray-700'}`}>
                        {item.score >= 80 && <Flame className="w-5 h-5 fill-current animate-pulse" />}
                        {item.score}
                      </div>
                      <span className="text-[9px] font-bold text-gray-400 uppercase">HOTNESS INDEX</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-y-3">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">現在のハマり</span>
                      <span className="font-bold text-gray-700">{Math.round(item.currentGap)}日</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">平均間隔</span>
                      <span className="font-bold text-gray-700">{item.averageGap}日</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">過去最大ハマり</span>
                      <span className="font-bold text-gray-700">{item.maxGap}日</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">出現回数</span>
                      <span className="font-bold text-gray-700">{item.count}回</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
                    <div className="text-[9px] text-gray-400 font-bold uppercase">超過倍率</div>
                    <div className={`text-xs font-bold ${(item.currentGap / item.averageGap) > 1.5 ? 'text-orange-600' : 'text-gray-600'}`}>
                      {(item.currentGap / item.averageGap).toFixed(2)}x
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    ) : activeTab === 'manshu' ? (
      <section className="mb-12">
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-8">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            <h3 className="font-bold text-gray-800">万舟ハンター (高配当ランキング)</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {manshuHunter.map((item, index) => (
              <div key={item.trifecta} className="p-5 bg-emerald-50/30 border border-emerald-100 rounded-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-black text-gray-900">{item.trifecta}</span>
                    <button onClick={() => togglePortfolio(item.trifecta)} className={`p-1 ${portfolio.includes(item.trifecta) ? 'text-red-500' : 'text-gray-300'}`}>
                      <Heart className={`w-3 h-3 ${portfolio.includes(item.trifecta) ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                  <span className="bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded-md">
                    万舟 {item.manshuCount}回
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[9px] text-gray-400 font-bold uppercase">平均配当</div>
                    <div className="text-lg font-black text-emerald-600">¥{item.avgManshu.toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-gray-400 font-bold uppercase">最大配当</div>
                    <div className="text-lg font-black text-emerald-700">¥{item.maxManshu.toLocaleString()}</div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-emerald-100 flex justify-between items-center">
                  <span className="text-[9px] text-gray-400 font-bold uppercase">出現時万舟確率</span>
                  <span className="text-xs font-bold text-emerald-600">{item.manshuRate.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    ) : activeTab === 'recovery' ? (
      <section className="mb-12">
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div className="flex items-center gap-2">
              <Percent className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-gray-800">回収率ランキング (TOP 50)</h3>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 text-[10px] text-gray-400 font-bold uppercase">
                <Info className="w-3 h-3" />
                1点100円購入想定
              </div>
              <span className="text-xs text-gray-400">※選択期間内の全レースを対象に算出</span>
            </div>
          </div>

          {/* Venue Selector for Recovery */}
          <div className="mb-8 overflow-x-auto no-scrollbar pb-2">
            <div className="flex gap-2 min-w-max">
              <button
                onClick={() => setSelectedRecoveryVenue('all')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedRecoveryVenue === 'all' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                全場
              </button>
              {VENUES.map(v => (
                <button
                  key={v}
                  onClick={() => setSelectedRecoveryVenue(v)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedRecoveryVenue === v ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {recoveryRanking.length === 0 ? (
            <div className="py-20 text-center">
              <Search className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-bold">データが見つかりません</p>
              <p className="text-xs text-gray-400 mt-1">選択した条件に一致する的中結果がありません</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recoveryRanking.map((item, index) => (
                <div key={item.trifecta} className="p-5 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all border-l-4 border-l-blue-500">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-black ${index < 3 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                        {index + 1}
                      </span>
                      <span className="text-xl font-black text-gray-900">{item.trifecta}</span>
                      <button onClick={() => togglePortfolio(item.trifecta)} className={`p-1 ${portfolio.includes(item.trifecta) ? 'text-red-500' : 'text-gray-300'}`}>
                        <Heart className={`w-3 h-3 ${portfolio.includes(item.trifecta) ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                    <div className={`text-xl font-black ${item.recoveryRate >= 100 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {Math.round(item.recoveryRate)}<span className="text-xs ml-0.5">%</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-y-3">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">的中数</span>
                      <span className="font-bold text-gray-700">{item.hitCount}回</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">最大配当</span>
                      <span className="font-bold text-gray-700">¥{item.maxDividend.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">払戻合計</span>
                      <span className="font-bold text-gray-700">¥{item.totalReturn.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">投資合計</span>
                      <span className="font-bold text-gray-700">¥{(results.filter(r => selectedRecoveryVenue === 'all' || r.venue === selectedRecoveryVenue).length * 100).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    ) : (
      <section className="mb-12">
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500 fill-current" />
              <h3 className="font-bold text-gray-800">マイ投資ポートフォリオ (収支シミュレーター)</h3>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase">
              <Info className="w-3 h-3" />
              1点100円購入想定
            </div>
          </div>

          {portfolio.length === 0 ? (
            <div className="py-12 text-center">
              <Heart className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-bold">お気に入りの出目が登録されていません</p>
              <p className="text-xs text-gray-400 mt-1">結果一覧やランキングからハートアイコンを押して追加してください</p>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="grid grid-cols-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                <span>出目</span>
                <span className="text-center">的中数</span>
                <span className="text-center">回収率</span>
                <span className="text-right">収支</span>
              </div>
              {portfolioStats.map((stat) => (
                <div key={stat.trifecta} className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between border border-transparent hover:border-red-100 transition-all">
                  <div className="flex items-center gap-4 w-1/4">
                    <button onClick={() => togglePortfolio(stat.trifecta)} className="text-red-500">
                      <Heart className="w-4 h-4 fill-current" />
                    </button>
                    <span className="text-lg font-black text-gray-900">{stat.trifecta}</span>
                  </div>
                  <div className="w-1/4 text-center font-bold text-gray-700">{stat.hits}回</div>
                  <div className={`w-1/4 text-center font-bold ${stat.recovery >= 100 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {stat.recovery.toFixed(1)}%
                  </div>
                  <div className={`w-1/4 text-right font-black ${stat.profit >= 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {stat.profit >= 0 ? '+' : ''}{stat.profit.toLocaleString()}円
                  </div>
                </div>
              ))}
              <div className="mt-6 p-6 bg-gray-900 rounded-3xl text-white flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">トータル収支</div>
                  <div className="text-3xl font-black">
                    {portfolioStats.reduce((acc, curr) => acc + curr.profit, 0) >= 0 ? '+' : ''}
                    {portfolioStats.reduce((acc, curr) => acc + curr.profit, 0).toLocaleString()}
                    <span className="text-sm ml-1">円</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">総合回収率</div>
                  <div className="text-2xl font-black text-amber-400">
                    {((portfolioStats.reduce((acc, curr) => acc + curr.profit, 0) + (portfolio.length * results.length * 100)) / (portfolio.length * results.length * 100) * 100).toFixed(1)}
                    <span className="text-sm ml-1">%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    )}
  </main>

      <footer className="max-w-5xl mx-auto px-4 py-12 text-center text-gray-400 text-xs border-t border-gray-100 mt-12">
        <div className="flex justify-center gap-4 mb-4">
          <Trophy className="w-5 h-5 opacity-20" />
          <LineChartIcon className="w-5 h-5 opacity-20" />
          <Search className="w-5 h-5 opacity-20" />
        </div>
        <p>© {new Date().getFullYear()} BoatRace Result Tracker</p>
        <p className="mt-1">データ出典: BOAT RACE 公式サイト / BOATERS / 競艇サクラ</p>
      </footer>
    </div>
  );
}
