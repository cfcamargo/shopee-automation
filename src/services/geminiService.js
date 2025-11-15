// src/services/geminiService.js

const { GoogleGenAI, Type } = require('@google/genai');
const { gemini } = require('../config');

// Inicializa o cliente Gemini
const ai = new GoogleGenAI(gemini.apiKey);
const model = "gemini-2.5-flash"; 

// ... (responseSchema permanece o mesmo)
const responseSchema = {
    type: Type.OBJECT,
    properties: {
        titulo_otimizado: {
            type: Type.STRING,
            description: "Um título curto (máx. 10 palavras) e chamativo para o WhatsApp, com 1 ou 2 emojis.",
        },
        copy_whatsapp: {
            type: Type.STRING,
            description: "O texto persuasivo (máx. 4 parágrafos), focado no grande desconto e urgência.",
        }
    },
    required: ["titulo_otimizado", "copy_whatsapp"],
};


async function generatePersuasiveCopy(oferta) {
  // No seu getProductOffers, você retorna a propriedade 'title' (normalizada) 
  // do GQL. Vamos usar 'title' ou 'productName' aqui para sermos flexíveis.
  const title = oferta.productName; 
  if (!oferta || !title) {
      throw new Error("Dados da oferta incompletos para geração de texto (Título/Nome ausente).");
  }
  
  // O seu GQL retorna o preço em p.priceMin / 100000 e p.priceMax / 100000. 
  // Vamos usar o desconto em porcentagem, que é mais persuasivo.
  // Assumindo que você normalizou p.priceDiscountRate ou pode calcular a diferença:
  const precoMin = (Number(oferta.priceMin || 0) / 100000).toFixed(2);
  const precoMax = (Number(oferta.priceMax || 0) / 100000).toFixed(2);
  let descontoPct = 0;
  if (parseFloat(precoMax) > parseFloat(precoMin) && parseFloat(precoMin) > 0) {
      descontoPct = ((1 - (parseFloat(precoMin) / parseFloat(precoMax))) * 100).toFixed(0);
  }

  // A comissão ainda é útil para o Gemini entender que é uma ótima oferta para promover
  // mas o texto FINAL não deve mencioná-la.

  // ----------------------------------------------------------------------
  // PROMPT CORRIGIDO E FOCADO NO CLIENTE
  // ----------------------------------------------------------------------
  const prompt = `
      Gere um título de impacto e um corpo de texto.
      - Role: Copywriter especialista em vendas rápidas de 'achadinhos'.
      - Audiência: Compradores de grupo de ofertas.
      - Foco: Destaque o ${descontoPct}% de desconto, a qualidade/avaliações (se houver) e a urgência da oferta.
      - O corpo de texto deve ter no máximo 4 parágrafos.
      - O TÍTULO deve ser curto e urgente.
      - NÃO mencione comissão ou afiliação no texto final.
      
      Dados da Oferta:
      - Título Original: ${title}
      - Preço Atual: R$ ${precoMin}
      - Preço Antigo: R$ ${precoMax}
      - Desconto: ${descontoPct}%
      - Vendas Registradas: ${oferta.sales || 'Não informado'}
  `;

  try {
      const response = await ai.models.generateContent({
          model: model,
          contents: prompt,
          config: {
              systemInstruction: "Você é um Copywriter especialista. Sua resposta DEVE ser um objeto JSON válido, seguindo estritamente o esquema fornecido. Seja conciso e use emojis.",
              responseMimeType: "application/json", 
              responseSchema: responseSchema,
          },
      });
      
      const result = JSON.parse(response.text.trim());      

      // 🚨 CORREÇÃO: Usar result.titulo_otimizado, não titulo_otimizado.
      return {
        titulo: result.titulo_otimizado,
        copy: result.copy_whatsapp
      };
      
  } catch (error) {
      console.error("Erro na chamada da API Gemini (JSON ou Parse):", error);
      
      // Retorna um fallback seguro
      return {
        titulo: `🔥 ${title} EM OFERTA! (${descontoPct}% OFF)`,
        copy: `Corra! Preço de R$ ${precoMax} caiu para apenas R$ ${precoMin}. Uma oportunidade relâmpago para seu público. Não perca!`
      };
  }
}

module.exports = {
    generatePersuasiveCopy
};