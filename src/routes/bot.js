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

// normaliza número vindo de várias formas
function normalizeWa(raw) {
  if (!raw) return "";
  return String(raw)
    .replace(/@s\.whatsapp\.net$/i, "")
    .replace(/@c\.us$/i, "")
    .replace(/@g\.us$/i, "")
    .replace(/@lid$/i, "")
    .trim();
}

// extrai o remetente REAL do payload do evolution
function extractSender(body) {
  const alt = body?.data?.key?.remoteJidAlt;
  if (alt) return normalizeWa(alt);

  const sender = body?.sender;
  if (sender) return normalizeWa(sender);

  const rjid = body?.data?.key?.remoteJid;
  if (rjid) return normalizeWa(rjid);

  return "";
}

async function handleWebhook(req, res) {
  const event = req.params.eventName || req.body?.event || "";
  console.log("🔥 Webhook recebido:", event || "(sem evento)");

  // log inicial de debug
  console.log(JSON.stringify(req.body, null, 2));

  const isMessageUpsert =
    event.toLowerCase() === "messages.upsert" ||
    req.body?.event?.toLowerCase() === "messages.upsert";

  try {
    const fromNormalized = extractSender(req.body);
    const rawFrom =
      req.body?.data?.key?.remoteJidAlt ||
      req.body?.sender ||
      req.body?.data?.key?.remoteJid;

    const text =
      req.body?.data?.message?.conversation ||
      req.body?.data?.message?.extendedTextMessage?.text ||
      "";

    console.log("📞 De:", rawFrom, "| Normalizado:", fromNormalized);
    console.log("💬 Mensagem:", text);

    // se não for mensagem nova, ignora
    if (!isMessageUpsert) {
      console.log("⚪ Evento ignorado:", event);
      return res.json({ ok: true, ignored: true });
    }

    // valida número
    const isAllowed =
      botAllowedNumbers.length === 0 ||
      botAllowedNumbers.includes(fromNormalized);

    if (!isAllowed) {
      console.log("⛔ Número não autorizado:", fromNormalized);
      await sendText(
        rawFrom,
        "👋 Este bot é restrito. Fale com o administrador para liberar seu número."
      );
      return res.json({ ok: false, reason: "unauthorized" });
    }

    const msg = String(text || "")
      .trim()
      .toLowerCase();

    // ------------------------- caso 1: link da Shopee -------------------------
    if (msg.includes("shopee.com")) {
      console.log("🛒 Link Shopee detectado:", msg);
      const offer = await buildOfferFromLink(msg);
      if (offer) {
        addToQueue(offer);
        await sendText(
          rawFrom,
          "✅ Oferta adicionada à fila. Ela será enviada no próximo envio automático."
        );
        return res.json({ ok: true, type: "link", queued: true });
      } else {
        await sendText(
          rawFrom,
          "❌ Não consegui ler esse link da Shopee. Confirme se é um link válido de produto."
        );
        return res.json({ ok: false, type: "link", queued: false });
      }
    }

    // ------------------------- caso 2: ofertas <keyword> -------------------------
    if (msg.startsWith("ofertas ")) {
      const keyword = msg.replace("ofertas ", "").trim();
      if (!keyword) {
        await sendText(
          rawFrom,
          "Envie algo como 👉 *ofertas maquiagem* ou *ofertas roupa feminina*"
        );
        return res.json({ ok: false, reason: "empty_keyword" });
      }

      console.log("🔍 Buscando ofertas para:", keyword);

      const data = await getOffers({
        keyword,
        limit: 20,
        minCommission: 0,
        minSales: 1,
      });

      if (!data.offers.length) {
        await sendText(
          rawFrom,
          `❌ Não encontrei ofertas para *${keyword}*. Tente outro termo.`
        );
        return res.json({ ok: true, type: "keyword", found: 0 });
      }

      const waMsg = formatOffersMessage(keyword, data.offers);
      await sendText(rawFrom, waMsg);

      if (n8nWebhookUrl) {
        try {
          await axios.post(
            n8nWebhookUrl,
            {
              source: "shopee-bot",
              from: rawFrom,
              fromNormalized,
              keyword,
              offers: data.offers,
            },
            { timeout: 5000 }
          );
        } catch (e) {
          console.error("❌ Erro ao chamar N8N:", e.message);
        }
      }

      return res.json({
        ok: true,
        type: "keyword",
        sentTo: rawFrom,
        total: data.offers.length,
      });
    }

    // ------------------------- fallback -------------------------
    await sendText(
      rawFrom,
      [
        "👋 Olá!",
        "",
        "Para buscar ofertas me envie:",
        "👉 *ofertas maquiagem*",
        "👉 *ofertas roupa feminina*",
        "",
        "Ou envie um *link da Shopee* para adicionar manualmente.",
      ].join("\n")
    );

    return res.json({ ok: true, type: "fallback" });
  } catch (err) {
    console.error("❌ ERRO /bot/webhook:", err);
    return res.status(500).json({ error: true, message: err.message });
  }
}

// define ambas rotas sem “?”
router.post("/webhook", handleWebhook);
router.post("/webhook/:eventName", handleWebhook);

module.exports = router;
