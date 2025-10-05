import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";

export default defineConfig({
    appType: "mpa",
    optimizeDeps: {
        exclude: ["onnxruntime-web"],
    },
    plugins: [
        {
            name: "fix-wasm-mime",
            configureServer(server) {
                server.middlewares.use((req, res, next) => {
                    if (req.url && /\.wasm(\?|$)/.test(req.url)) {
                        console.log("url:", req.url);
                        res.setHeader("Content-Type", "application/wasm");
                    }
                    next();
                });
            },
        },
    ],
    server: {
        host: "yuri.localhost.com",
        port: 443,
        https: {
            key: fs.readFileSync(
                path.resolve(__dirname, ".cert/localhost.key")
            ),
            cert: fs.readFileSync(
                path.resolve(__dirname, ".cert/localhost.crt")
            ),
        },
    },
});
