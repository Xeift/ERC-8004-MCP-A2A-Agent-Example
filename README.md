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

| env name                                                                                                     | description                                                      |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| [OPENROUTER_API_KEY](https://openrouter.ai/settings/keys)                                                    | To make request to LLM.                                          |
| [TAVILY_API_KEY](https://app.tavily.com/home)                                                                | Let agent1 use their MCP tool to search web.                     |
| [CLOUDFLARE_ACCOUNT_ID<br>CLOUDFLARE_API_TOKEN](https://dash.cloudflare.com/?to=/:account/workers-and-pages) | Let agent2 generate image using Cloudflare Workers AI.           |
| [IMGBB_API_KEY](https://api.imgbb.com/)                                                                      | Let agent2 update the generated image to ImgBB.                  |
| [PINATA_JWT](https://app.pinata.cloud/developers/api-keys)                                                   | For ERC-8004 to store agent registration file and feedback file. |
| \_ADDRESS                                                                                                    | EVM address. Starts with `0x`.                                   |
| \_PRIVATE_KEY                                                                                                | EVM private key. Starts with `0x`.                               |
| \_PORT                                                                                                       | The port you wish to run the server on.                          |
| [\_MODEL](https://openrouter.ai/models?fmt=table&max_price=0&supported_parameters=reasoning%2Ctools)         | The LLM you want to use for that agent.                          |
| CHAIN_ID                                                                                                     | The chain you want your agent to register / interact on.         |
| [RPC_URL](https://chainlist.org/)                                                                            | The RPC you want to use. Must be consistent with `CHAIN_ID`.     |

## 4. Start x402 facilitator

```
npm run facilitator
```

## 5. Start agent1 and agent2 MCP & A2A server

```
npm run server:a1
npm run server:a2
```

## 6. Start agent3

```
npm run agent:a3
```
