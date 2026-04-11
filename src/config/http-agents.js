import http from 'node:http';
import https from 'node:https';

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 20,
  timeout: 60_000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 20,
  timeout: 60_000,
});

export function getHttpAgents() {
  return { httpAgent, httpsAgent };
}
