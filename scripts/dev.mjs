// 开发服务器：监听客户端源码 + 启动服务端
import { watchClient } from './build-client.mjs';
import { startServer } from '../server/index.js';

const port = parseInt(process.env.PORT || '8080', 10);
const bots = parseInt(process.env.BOTS || '6', 10);

await watchClient();
startServer({ port, bots });
console.log(`[dev] 开发服务器: http://127.0.0.1:${port}`);
