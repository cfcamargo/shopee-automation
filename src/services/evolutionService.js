// src/services/evolutionService.js
const axios = require("axios");
const { evolution } = require("../config");

function getBase() {
  if (!evolution.baseUrl || !evolution.instance) {
    throw new Error("Evolution API não configurada (.env).");
  }
  return `${evolution.baseUrl.replace(/\/$/, "")}/message`;
}

async function sendText(to, text) {
  const base = getBase();

  const payload = {
    number: to,
    text,
    delay: 0,
    linkPreview: true,
  };

  const url = `${base}/sendText/${evolution.instance}`;

  const headers = {
    "Content-Type": "application/json",
  };

  if (evolution.token) {
    headers["apikey"] = evolution.token;
    // ou Authorization, se o teu precisar
  }

  const { data } = await axios.post(url, payload, {
    headers,
    timeout: 8000,
  });

  return data;
}

function formatOffersMessage(keyword, offers = []) {
  if (!offers.length) {
    return `❌ Não achei ofertas para: *${keyword}*`;
  }

  const top = offers.slice(0, 5);

  let txt = `🔥 Ofertas para *${keyword}*\n`;
  txt += `(${offers.length} encontradas, mostrando ${top.length})\n\n`;

  top.forEach((o, idx) => {
    const price = o.price ? `R$ ${Number(o.price).toFixed(2)}` : "";
    const old =
      o.oldPrice && o.oldPrice > o.price
        ? ` ~R$ ${Number(o.oldPrice).toFixed(2)}~`
        : "";
    const discount = o.discount ? ` (-${o.discount}%)` : "";
    const link = o.offerLink || o.productLink || "";
    txt += `*${idx + 1}. ${o.title}*\n`;
    txt += `${price}${old} ${discount}\n`;
    if (link) txt += `${link}\n`;
    txt += `\n`;
  });

  txt += `— enviado pelo bot 🟠`;
  return txt;
}

module.exports = {
  sendText,
  formatOffersMessage,
};
