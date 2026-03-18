import { Hono } from "hono";
import { cors } from "hono/cors";

import { setupTables } from "./db";
import invoiceRoute from "./routes/invoice";
import reportRoute from "./routes/report";

const app = new Hono();

app.use("*", cors({ origin: "http://localhost:3000" }));

app.get("/", (c) => c.text("Geri Care Invoice API"));

app.get("/health", async (c) => {
	return c.json({ status: "ok" });
});

app.route("/api/invoice", invoiceRoute);
app.route("/api/report", reportRoute);

// Setup DB tables then start server
await setupTables();
console.log("DB tables ready");

export default {
	port: 8000,
	fetch: app.fetch,
};
