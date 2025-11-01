// src/config.js
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

function parseWhitelist(str) {
  if (!str) return [];
  // exemplo de .env:
  // BOT_ALLOWED_NUMBERS=5511999999999,5567999999999
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = {
  port: process.env.PORT || 3000,
  shopee: {
    appId: process.env.SHOPEE_APP_ID,
    secret: process.env.SHOPEE_APP_SECRET,
    gqlUrl: "https://open-api.affiliate.shopee.com.br/graphql",
  },
  n8nWebhookUrl: process.env.N8N_WEBHOOK_URL || null,
  evolution: {
    baseUrl: process.env.EVOLUTION_BASE_URL || "",
    instance: process.env.EVOLUTION_INSTANCE || "",
    token: process.env.EVOLUTION_TOKEN || "",
  },
  botAllowedNumbers: parseWhitelist(process.env.BOT_ALLOWED_NUMBERS || ""),
};
