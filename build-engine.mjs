// 把规则引擎 RPC 打包为单文件 Node 脚本（FastAPI 子进程使用）
import { build } from 'esbuild';

await build({
  entryPoints: ['server/engine-rpc.ts'],
  outfile: 'server/engine-bundle.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  logLevel: 'info',
});
