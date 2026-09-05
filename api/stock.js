export default async function handler(req, res) {
    // 開啟跨域請求與 Vercel 邊緣快取機制
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: '請提供股票代碼' });

    const cleanSymbol = symbol.toUpperCase().trim();

    try {
        // 向全球金融數據源即時抓取過去 3 年的歷史圖表與派息事件
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?interval=1mo&range=3y`;
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });

        if (!response.ok) throw new Error('Yahoo Finance 連線失敗');
        const data = await response.json();
        const result = data.chart?.result?.[0];
        if (!result) return res.status(404).json({ error: '找不到該股票代碼' });

        const currentPrice = result.meta.regularMarketPrice || 0;

        // 1. 精算 TTM 股息率 (過去 12 個月現金派息總和 / 現價)
        let ttmDividends = 0;
        if (result.events && result.events.dividends) {
            const oneYearAgo = Math.floor(Date.now() / 1000) - (365 * 24 * 3600);
            for (const key in result.events.dividends) {
                const div = result.events.dividends[key];
                if (div.date >= oneYearAgo) ttmDividends += (div.amount || 0);
            }
        }
        const dividendYield = currentPrice > 0 ? Number(((ttmDividends / currentPrice) * 100).toFixed(2)) : 0;

        // 2. 精算 CAGR 年化複合回報率 (長期複利計算器使用)
        let cagrReturn = 8.0; 
        const adjclose = result.indicators?.adjclose?.[0]?.adjclose;
        if (adjclose && adjclose.length > 12) {
            const validPrices = adjclose.filter(p => p !== null);
            if (validPrices.length >= 12) {
                const startP = validPrices[0];
                const endP = validPrices[validPrices.length - 1];
                const years = validPrices.length / 12;
                if (startP > 0 && endP > 0) {
                    cagrReturn = Number(((Math.pow(endP / startP, 1 / years) - 1) * 100).toFixed(2));
                }
            }
        }

        // 3. 內扣費用率 TER 自動對照表
        const terMap = {
            'VOO': 0.03, 'SPY': 0.09, 'QQQ': 0.20, 'QQQM': 0.15,
            'SPYI': 0.68, 'QQQI': 0.68, 'JEPI': 0.35, 'DIVO': 0.55,
            'SGOV': 0.07, 'VT': 0.07, 'VXUS': 0.08, 'SOXX': 0.35,
            'SCHD': 0.06, 'CSPX.L': 0.07, 'VUAA.L': 0.07, 'VWRA.L': 0.22,
            '0941.HK': 0.00
        };
        const ter = terMap[cleanSymbol] !== undefined ? terMap[cleanSymbol] : (cleanSymbol.includes('.HK') ? 0.0 : 0.15);

        // 回傳即時運算結果
        return res.status(200).json({
            symbol: cleanSymbol,
            price: currentPrice,
            dividendYield: dividendYield,
            cagrReturn: cagrReturn,
            ter: ter
        });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
