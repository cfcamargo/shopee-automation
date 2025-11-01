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
  // 1) tenta remoteJidAlt (no seu caso é o bom)
  const alt = body?.data?.key?.remoteJidAlt;
  if (alt) return normalizeWa(alt);

  // 2) tenta sender (também vem certo)
  const sender = body?.sender;
  if (sender) return normalizeWa(sender);

  // 3) por último, remoteJid (pode vir @lid)
  const rjid = body?.data?.key?.remoteJid;
  if (rjid) return normalizeWa(rjid);

  return "";
}

router.post("/webhook/MESSAGES_UPSERT", async (req, res) => {
  // log bruto pra depurar
  console.log("🔥 webhook recebido:", req.params.eventName || req.body?.event);
  // console.log(JSON.stringify(req.body, null, 2));

  const event =
    req.params.eventName /* /bot/webhook/messages.upsert */ ||
    req.body?.event /* { event: 'messages.upsert' } */ ||
    "";

  // a gente só quer tratar mensagens novas
  const isMessageUpsert =
    event.toLowerCase() === "messages.upsert" ||
    event.toLowerCase() === "messages_upsert";

  try {
    // quem mandou?
    const fromNormalized = extractSender(req.body);
    const rawFrom =
      req.body?.data?.key?.remoteJidAlt ||
      req.body?.sender ||
      req.body?.data?.key?.remoteJid;

    // texto da mensagem
    const text =
      req.body?.data?.message?.conversation ||
      req.body?.data?.message?.extendedTextMessage?.text ||
      "";

    console.log("📞 rawFrom:", rawFrom);
    console.log("📞 fromNormalized:", fromNormalized);
    console.log("💬 text:", text);

    // valida whitelist
    const isAllowed =
      botAllowedNumbers.length === 0 ||
      botAllowedNumbers.includes(fromNormalized);

    if (!isAllowed) {
      console.log("⛔ número não autorizado:", fromNormalized);
      try {
        await sendText(
          rawFrom,
          "👋 Este bot é restrito. Fale com o administrador para liberar seu número."
        );
      } catch (e) {
        console.error("erro ao responder não autorizado:", e.message);
      }
      return res.json({ ok: false, reason: "unauthorized" });
    }

    // se não for evento de mensagem, ignora
    if (!isMessageUpsert) {
      return res.json({ ok: true, ignored: true, event });
    }

    const msg = String(text || "").trim();

    // 1) se for link da Shopee → fila
    if (msg.includes("shopee.com")) {
      const offer = await buildOfferFromLink(msg);
      if (offer) {
        addToQueue(offer);
        await sendText(
          rawFrom,
          "✅ Oferta adicionada à fila. Ela vai sair no próximo envio automático."
        );
        return res.json({ ok: true, type: "link", queued: true });
      } else {
        await sendText(
          rawFrom,
          "❌ Não consegui ler esse link da Shopee. Confere se é um link de produto."
        );
        return res.json({ ok: false, type: "link", queued: false });
      }
    }

    // 2) se for "ofertas xxx"
    if (msg.toLowerCase().startsWith("ofertas ")) {
      const keyword = msg.substring(8).trim();
      if (!keyword) {
        await sendText(
          rawFrom,
          "me manda assim 👉 *ofertas maquiagem* ou *ofertas roupa feminina*"
        );
        return res.json({ ok: false, reason: "empty_keyword" });
      }

      const data = await getOffers({
        keyword,
        limit: 20,
        minCommission: 0,
        minSales: 1,
      });

      if (!data.offers.length) {
        await sendText(
          rawFrom,
          `❌ Não encontrei ofertas para *${keyword}*. Tenta outro termo.`
        );
        return res.json({ ok: true, type: "keyword", found: 0 });
      }

      // responde no whatsapp
      const waMsg = formatOffersMessage(keyword, data.offers);
      await sendText(rawFrom, waMsg);

      // dispara pro n8n se tiver
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
          console.error("erro ao chamar n8n:", e.message);
        }
      }

      return res.json({
        ok: true,
        type: "keyword",
        sentTo: rawFrom,
        total: data.offers.length,
      });
    }

    // 3) fallback
    await sendText(
      rawFrom,
      [
        "oi 👋",
        "pra buscar ofertas me manda:",
        "👉 *ofertas maquiagem*",
        "👉 *ofertas roupa feminina*",
        "",
        "pra salvar uma oferta manual me manda o *link da Shopee*",
      ].join("\n")
    );

    return res.json({ ok: true, type: "fallback" });
  } catch (err) {
    console.error("ERR /bot/webhook:", err);
    return res.status(500).json({ error: true, message: err.message });
  }
});

module.exports = router;
