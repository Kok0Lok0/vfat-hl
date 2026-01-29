# VFAT ↔ HL Hedgeability Scanner

A tool to scan DeFi yield farms and identify which assets can be hedged on Hyperliquid perpetuals.

## Features

- **Multi-chain farm scanning**: Fetches yield farming opportunities across multiple chains
- **Hyperliquid perp matching**: Checks which non-major assets have corresponding perp markets on HL
- **Smart filtering**: Excludes major stablecoins and wrapped assets (ETH, USDC, USDT, etc.)
- **Token normalization**: Handles wrapped tokens, bridged variants, and symbol aliases
- **Confidence scoring**: Rates match quality based on data availability
- **Export options**: Download results as CSV or JSON
- **Caching**: 10-minute cache to reduce API load

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

## Configuration

### Token Aliases (`config/aliases.json`)

Maps wrapped/bridged tokens to their canonical symbols:

```json
{
  "WETH": "ETH",
  "WBTC": "BTC",
  "USDC.E": "USDC"
}
```

### Excluded Majors (`config/excludedMajors.json`)

Tokens to exclude from hedgeability checks (these are assumed to be stable or already hedged):

```json
["ETH", "WETH", "USDC", "USDT", "DAI"]
```

### Wrapper Patterns (`config/wrapperPatterns.json`)

Patterns to detect receipt/wrapper tokens that can't be directly evaluated:

```json
{
  "prefixes": ["st", "c", "a", "v", "moo", "yv"],
  "contains": ["LP", "UNI-V2", "GAUGE", "VAULT"]
}
```

## API Endpoints

### GET /api/scan

Main scanning endpoint. Returns farm analysis results.

**Query Parameters:**
- `onlyHedgeable=1` - Filter to only show hedgeable farms
- `minTvl=<number>` - Minimum TVL filter
- `minApy=<number>` - Minimum APY filter
- `search=<string>` - Search across tokens, protocols, chains
- `chain=<string>` - Filter by chain name
- `protocol=<string>` - Filter by protocol name
- `refresh=1` - Bypass cache and fetch fresh data

**Response:**
```json
{
  "meta": {
    "vfatFetchedAt": "2024-01-01T00:00:00Z",
    "hlFetchedAt": "2024-01-01T00:00:00Z",
    "farmsTotal": 1000,
    "farmsEvaluated": 950,
    "farmsHedgeable": 150,
    "cacheHit": false
  },
  "data": [
    {
      "farm_id": "base-123",
      "chain": "Base",
      "protocol": "Aerodrome",
      "pool_name": "WETH/DOGE",
      "farm_type": "lp_pair",
      "pair_symbols": ["WETH", "DOGE"],
      "normalized_assets": ["ETH", "DOGE"],
      "excluded_assets": ["WETH"],
      "non_major_assets": ["DOGE"],
      "hedgeable_assets_on_hl": ["DOGE"],
      "hedgeable": true,
      "match_confidence": "high",
      "tvl": 500000,
      "apy": 25.5
    }
  ]
}
```

### GET /api/export/csv

Download scan results as CSV file. Same query parameters as `/api/scan`.

### GET /api/export/json

Download scan results as JSON file. Same query parameters as `/api/scan`.

## Data Sources

### VFAT API

The primary data source for yield farming opportunities:
- **Endpoint:** `GET https://api.vfat.io/v4/farms`
- **Optional filter:** `?chainId=<number>` to fetch farms for a specific chain
- **Response:** Array of `FarmDisplayInfo` objects containing:
  - `chainId`, `address`, `protocol` (id, name, url)
  - `pool` with `underlying` tokens array (symbol, address, decimals, price, reserve)
  - `rewards` and `offChainRewards` for APY estimation
  - `isKilled` flag to filter inactive farms

The app extracts underlying tokens from `pool.underlying[]` and uses them for hedgeability matching.

### Hyperliquid API

Fetches the list of available perpetual markets from:
- `https://api.hyperliquid.xyz/info` with `type: "meta"`

## Farm Classification

Farms are classified into types:

- **lp_pair**: Standard 2-token liquidity pool
- **single**: Single-asset stake/vault
- **multi**: 3+ token pool (e.g., Curve tri-pools)
- **receipt_or_wrapper**: LP token or receipt token that needs unwrapping
- **unknown**: Could not determine structure

## Confidence Levels

- **high**: Token addresses available, clean symbols, no wrapper detected
- **medium**: Symbol-only but looks clean
- **low**: Wrapper detected, suspicious formatting, or missing data

## Development

### Project Structure

```
vfat-hl-scanner/
├── app/
│   ├── api/
│   │   ├── scan/route.ts       # Main scan endpoint
│   │   └── export/
│   │       ├── csv/route.ts    # CSV export
│   │       └── json/route.ts   # JSON export
│   ├── globals.css             # Global styles
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Main UI
├── config/
│   ├── aliases.json            # Token alias mapping
│   ├── excludedMajors.json     # Excluded tokens
│   └── wrapperPatterns.json    # Wrapper detection
├── lib/
│   ├── cache.ts                # In-memory cache
│   ├── hl.ts                   # Hyperliquid API client
│   ├── match.ts                # Matching logic
│   ├── types.ts                # TypeScript types
│   └── vfat.ts                 # VFAT API client
└── README.md
```

### Adding New Token Aliases

Edit `config/aliases.json` to add new mappings. No code changes required.

### Adding New Excluded Majors

Edit `config/excludedMajors.json` to add tokens that should be excluded from hedgeability checks.

## Deployment

### Vercel

1. Push to GitHub
2. Import project in Vercel
3. Deploy

The app works without any environment variables.

### Self-hosted

```bash
npm run build
npm start
```

## License

MIT

## Notes

- Uses VFAT API v4 (`/v4/farms` endpoint)
- Hyperliquid perps fetched via `POST https://api.hyperliquid.xyz/info` with `type: "meta"`
- Cache TTL is 10 minutes by default (adjustable in `lib/cache.ts`)
- Killed/inactive farms are automatically filtered out
- No wallet integration or trading functionality - this is a read-only scanner
