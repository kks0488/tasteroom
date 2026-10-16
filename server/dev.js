import http from "node:http";
import { createServer } from "vite";
import handler from "../api/design.js";
import configHandler from "../api/config.js";
const vite = await createServer({
  server: { middlewareMode: true, host: "127.0.0.1" },
  appType: "spa",
});
const server = http.createServer(async (req, res) => {
  if (["/api/design", "/api/config"].includes(req.url?.split("?")[0])) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 12000) {
        res.writeHead(413);
        res.end("Request too large");
        return;
      }
      chunks.push(chunk);
    }
    try {
      req.body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString())
        : {};
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Send a valid JSON request." }));
      return;
    }
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    };
    return req.url.split("?")[0] === "/api/config"
      ? configHandler(req, res)
      : handler(req, res);
  }
  vite.middlewares(req, res);
});
server.listen(Number(process.env.PORT) || 4173, "127.0.0.1", () =>
  console.log(
    "TasteRoom listening on http://127.0.0.1:" + (process.env.PORT || 4173),
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await vite.close();
    server.close();
    process.exit(0);
  });
