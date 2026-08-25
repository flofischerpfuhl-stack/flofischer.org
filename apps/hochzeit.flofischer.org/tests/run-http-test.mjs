import { spawn } from "node:child_process";
import net from "node:net";

const port = await freePort();
const hostPin = "ci-only-pin";
const env = { ...process.env, PORT: String(port), HOST_PIN: hostPin };
const server = spawn(process.execPath, ["server.mjs"], { env, stdio: ["ignore", "pipe", "pipe"] });

try {
  await waitUntilReady(server);
  const status = await run(process.execPath, ["tests/http-test.mjs"], {
    ...env,
    BASE_URL: `http://127.0.0.1:${port}`,
  });
  if (status !== 0) process.exitCode = status;
} finally {
  server.kill();
}

function freePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      listener.close(() => resolve(address.port));
    });
  });
}

function waitUntilReady(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Local HTTP server did not become ready")), 10_000);
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("READY ")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Local HTTP server exited early with code ${code}`));
    });
    child.once("error", reject);
  });
}

function run(command, args, childEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: childEnv, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
