
# Intro

# Quickstart
## 1. Install dependencies
```console
npm i --ignore-scripts
```
Important: If you do not pass `--ignore-scripts` flag, you'll encounter an error about `codegen.yml`.

## 2. Register Agents to ERC-8004 Identity Registry
```console
npm run register:a1
npm run register:a2
```

## 3. Add .env
```
cp .env.example .env
```
Get API keys:
- [［OPENROUTER_API_KEY］](https://openrouter.ai/settings/keys)
- [［TAVILY_API_KEY］](https://app.tavily.com/home)
- [［CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN］](https://dash.cloudflare.com/?to=/:account/workers-and-pages)
- [［IMGBB_API_KEY］](https://api.imgbb.com/)
- [［PINATA_JWT］](https://app.pinata.cloud/developers/api-keys)

## 4. Start agent1 and agent2 MCP & A2A server
```
npm run server:a1
npm run server:a2
```

## 5. Start agent3
```
npm run agent:a3
```
