// src/server.js
const express = require("express");
const { port } = require("./config");
const offersRoute = require("./routes/offers");
const botRoute = require("./routes/bot");

const app = express();
app.use(express.json());

// rotas
app.use("/offers", offersRoute);
app.use("/bot", botRoute);

app.listen(port, () => {
  console.log(`✅ API on http://localhost:${port}`);
});
