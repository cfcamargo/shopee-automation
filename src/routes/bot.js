// src/routes/bot.js
const express = require("express");
const axios = require("axios");
const { getOffers, buildOfferFromLink } = require("../services/shopeeService");
const { addToQueue } = require("../services/queueService");
const { n8nWebhookUrl, botAllowedNumbers } = require("../config");
const {
  sendText,
  formatOffersMessage,
} = require("../services/evolutionService");

const router = express.Router();

// normaliza "5511999999999@c.us" -> "5511999999999"
function normalizeWaNumber(raw) {
  if (!raw) return "";
  return String(raw)
    .replace(/@c\.us$/i, "")
    .replace(/@g\.us$/i, "")
    .trim();
}

router.post("/webhook", async (req, res) => {
  try {
    const { text = "", from = "" } = req.body || {};
    const msg = String(text).trim();
    const fromNormalized = normalizeWaNumber(from);

    const isAllowed =
      botAllowedNumbers.length === 0 ||
      botAllowedNumbers.includes(fromNormalized);

    if (!isAllowed) {
      try {
        await sendText(
          from,
          "👋 Olá! Este bot está restrito. Se você precisa de acesso, fale com o administrador. 😉"
        );
      } catch (e) {
        console.error("erro ao responder usuário não autorizado:", e.message);
      }

      return res.status(200).json({
        ok: false,
        reason: "unauthorized_sender",
      });
    }

    // 1) se for um link da Shopee → vai pra fila
    if (msg.includes("shopee.com")) {
      const offer = await buildOfferFromLink(msg);
      if (offer) {
        addToQueue(offer);

        try {
          await sendText(
            from,
            "✅ Oferta adicionada à fila. Ela vai sair no próximo envio automático."
          );
        } catch (e) {
          console.error("erro ao responder no WA:", e.message);
        }

        return res.json({
          ok: true,
          type: "link",
          message: "Oferta adicionada à fila.",
          offer,
        });
      }

      try {
        await sendText(
          from,
          "❌ Não consegui ler esse link da Shopee. Confere se é um link de produto."
        );
      } catch (e) {
        console.error("erro ao responder no WA:", e.message);
      }

      return res.json({
        ok: false,
        type: "link",
        message: "Não consegui ler esse link da Shopee.",
      });
    }

    // 2) se for "ofertas xxx"
    if (msg.toLowerCase().startsWith("ofertas ")) {
      const keyword = msg.substring(8).trim();
      if (!keyword) {
        await sendText(
          from,
          "me manda assim 👉 *ofertas maquiagem* ou *ofertas roupa feminina*"
        );
        return res.json({
          ok: false,
          type: "keyword",
          message: "keyword vazia",
        });
      }

      const data = await getOffers({
        keyword,
        limit: 20,
        minCommission: 0,
        minSales: 1,
      });

      if (!data.offers.length) {
        await sendText(
          from,
          `❌ Não encontrei ofertas para *${keyword}*. Tenta outro termo.`
        );
        return res.json({
          ok: true,
          type: "keyword",
          message: `não encontrei ofertas para ${keyword}`,
        });
      }

      const waMsg = formatOffersMessage(keyword);
      await sendText(from, waMsg);

      if (n8nWebhookUrl) {
        try {
          await axios.post(
            n8nWebhookUrl,
            {
              source: "shopee-bot",
              keyword,
              offers: data.offers,
              from,
            },
            { timeout: 5000 }
          );
        } catch (e) {
          console.error("Erro ao chamar n8n:", e.message);
        }
      }

      return res.json({
        ok: true,
        type: "keyword",
        message: `enviado para ${from}`,
        total: data.offers.length,
      });
    }

    // 3) fallback
    await sendText(
      from,
      [
        "oi 👋",
        "pra buscar ofertas me manda:",
        "👉 *ofertas maquiagem*",
        "👉 *ofertas roupa feminina*",
        "",
        "pra salvar uma oferta manual me manda o *link da Shopee*",
      ].join("\n")
    );

    return res.json({
      ok: true,
      type: "unknown",
      message: "comando desconhecido",
    });
  } catch (err) {
    console.error("ERR /bot/webhook:", err);
    return res.status(500).json({
      error: true,
      message: err.message,
    });
  }
});

module.exports = router;
