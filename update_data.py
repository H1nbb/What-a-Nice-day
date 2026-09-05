import json
import pandas as pd
import yfinance as yf

# 涵蓋您網站中所有的核心標的
tickers = [
    "SPYI", "QQQI", "QQQY", "DIVO", "JEPI", "SGOV", 
    "SPY", "QQQ", "VOO", "VT", "VXUS", "SPMO", 
    "QQQM", "SPYM", "SOXX", "SCHD", 
    "VWRA.L", "CSPX.L", "VUAA.L", # 倫敦交易所的 UCITS
    "0941.HK"                     # 港股
]

market_data = {}

for ticker in tickers:
    try:
        clean_ticker = ticker.upper().strip()
        stock = yf.Ticker(clean_ticker)
        
        history = stock.history(period="1y")
        divs = stock.dividends
        
        if not history.empty:
            current_price = float(history["Close"].iloc[-1])
            
            # 計算 TTM (過去 12 個月真實派息總和)
            ttm_div = 0.0
            if not divs.empty:
                one_year_ago = pd.Timestamp.now(tz=divs.index.tz) - pd.DateOffset(years=1)
                recent_divs = divs[divs.index >= one_year_ago]
                ttm_div = float(recent_divs.sum())
                
            yield_rate = round((ttm_div / current_price) * 100, 2) if current_price > 0 else 0.0
            
            # 抓取內扣費用率 TER (若無資料則預設 0.1%)
            ter = stock.info.get("expenseRatio")
            ter = round(ter * 100, 2) if ter else 0.1
            
            market_data[clean_ticker] = {
                "price": round(current_price, 2),
                "dividend_yield": yield_rate,
                "ter": ter
            }
            print(f"成功更新: {clean_ticker} | 殖利率: {yield_rate}% | TER: {ter}%")
            
    except Exception as e:
        print(f"抓取 {ticker} 失敗: {e}")

# 將結果覆寫為 JSON 檔案，供前端網頁讀取
with open("data.json", "w", encoding="utf-8") as f:
    json.dump(market_data, f, ensure_ascii=False, indent=4)

print("✅ data.json 全站數據更新完畢！")
