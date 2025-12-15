
# Intro

# Quickstart
## 1. Install dependencies
```
npm i
```
## 2. Start agent1 and agent2 MCP & A2A server
```
npm run server:a1
npm run server:a2
```
## 3. Start agent1 or agent2
```
npm run agent:a1
npm run agent:a2
```
Note: You can run both servers and agents. However, since `agent:a1` uses the MCP tool from `server:a2`, `server:a2` must be running before you start `agent:a1`. If you want to run `agent:a1` by itself, make sure that `server:a2` has been started.
