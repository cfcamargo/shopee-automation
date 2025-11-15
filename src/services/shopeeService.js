// src/services/shopeeService.js

const axios = require("axios");
const crypto = require("crypto");
const { shopee } = require("../config"); // Importa chaves e URL GQL
const { generatePersuasiveCopy } = require("./geminiService")


function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}


async function getProductOffers(params = {}) {
  // Coerção e Default de Parâmetros
  const keyword = params.keyword ? String(params.keyword).trim() : null;
  const productCatId = params.productCatId ? Number(params.productCatId) : null;
  const sortType = params.sortType ? Number(params.sortType) : 1; // 1 = RELEVANCE_DESC
  const page = params.page ? Number(params.page) : 1;
  const limit = params.limit ? Number(params.limit) : 10;

  // Parâmetros opcionais/avançados (usamos '??' para default, '||' para coerção booleana)
  const isAMSOffer = params.isAMSOffer === true || params.isAMSOffer === 'true' ? true : null;
  const isKeySeller = params.isKeySeller === true || params.isKeySeller === 'true' ? true : null;
  // shopId, itemId, listType, matchId, etc., podem ser passados via params se necessários

  // 1. Monta a Query GQL
  const vars = ["$sortType: Int!", "$page: Int!", "$limit: Int!"];
  const args = ["sortType: $sortType", "page: $page", "limit: $limit"];

  // Adiciona variáveis e argumentos se existirem
  if (keyword) {
    vars.push("$keyword: String!");
    args.push("keyword: $keyword");
  }
  if (productCatId) {
    vars.push("$productCatId: Int!");
    args.push("productCatId: $productCatId");
  }
  if (isAMSOffer !== null) {
    vars.push("$isAMSOffer: Boolean!");
    args.push("isAMSOffer: $isAMSOffer");
  }
  if (isKeySeller !== null) {
    vars.push("$isKeySeller: Boolean!");
    args.push("isKeySeller: $isKeySeller");
  }
  // Adicionar outros parâmetros (shopId, itemId, listType, etc.) se forem passados

  const query = `
    query GetProductOfferV2(${vars.join(", ")}) {
      productOfferV2(${args.join(", ")}) {
        nodes {
          itemId
          productName
          imageUrl
          productLink
          offerLink
          sales
          ratingStar
          commissionRate
          sellerCommissionRate
          priceMin
          priceMax
          priceDiscountRate
          shopId
        }
        pageInfo {
          page
          limit
          hasNextPage
        }
      }
    }
  `;

  // 2. Monta as Variáveis
  const variables = {
    ...(keyword ? { keyword } : {}),
    ...(productCatId ? { productCatId } : {}),
    ...(isAMSOffer !== null ? { isAMSOffer } : {}),
    ...(isKeySeller !== null ? { isKeySeller } : {}),
    sortType,
    page,
    limit,
  };

  // 3. Autenticação (SHA256)
  const body = JSON.stringify({ query, variables });
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = sha256(shopee.appId + ts + body + shopee.secret);
  const Authorization = `SHA256 Credential=${shopee.appId}, Timestamp=${ts}, Signature=${signature}`;

  // 4. Requisição
  try {
    const resp = await axios.post(shopee.gqlUrl, body, {
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "identity",
        Authorization,
      },
      timeout: 12000,
    });

    if (resp.data?.errors?.length) {
      throw new Error(JSON.stringify(resp.data.errors));
    }

    const conn = resp.data?.data?.productOfferV2;
    let nodes = Array.isArray(conn?.nodes) ? conn.nodes.filter(Boolean) : [];

    nodes = nodes.filter(p => {
        const priceMin = Number(p.priceMin || 0);
        const priceMax = Number(p.priceMax || 0);

        if (priceMin < priceMax) {
            return true;
        }

        if (Number(p.priceDiscountRate || 0) > 0) {
            return true;
        }
  
        return false;
    });

    const offersPromises = nodes.map(async (p) => {
      const priceMin = Number(p.priceMin || 0);
      const priceMax = Number(p.priceMax || 0);
      
      // Chama o Gemini, esperando o resultado
      // const copyOffer = await generatePersuasiveCopy(p); 

      return {
        id: p.itemId,
        title: copyOffer?.titulo ?? p.productName,
        price: priceMin.toFixed(2),
        oldPrice: priceMax > priceMin ? priceMax.toFixed(2) : null,
        discountRate: p.priceDiscountRate,
        imageUrl: p.imageUrl,
        offerLink: p.offerLink || p.productLink,
        sales: p.sales || 0,
        rating: p.ratingStar || 0,
        commissionRate: p.commissionRate,
        sellerCommissionRate: p.sellerCommissionRate,
        shopId: p.shopId,
        copy: copyOffer.copy ?? ''
      };
    });

    // 2. Esperar que todas as Promises sejam resolvidas
    const offers = await Promise.all(offersPromises);

    console.log(offers)

    return {
      offers,
      pageInfo: conn?.pageInfo || null,
      applied: { keyword, productCatId, sortType, page, limit, isAMSOffer, isKeySeller },
    };
  } catch (error) {
    console.error("Erro na Requisição GQL Shopee (Product Offer V2):", error.message);
    throw new Error(`Erro ao buscar ofertas de produto: ${error.message}`);
  }
}

module.exports = {
  getProductOffers
};

// itemId: 25885369912,
//   productName: 'Paleta De Sombras De 9 Cores De Chocolate – Marrom Brilhante , Fosco E Neutro , Multiuso , Adequado Para Orçamento',
//   imageUrl: 'https://cf.shopee.com.br/file/sg-11134201-821f1-mgz8dkqf3dvt6a',
//   productLink: 'https://shopee.com.br/product/1006215031/25885369912',
//   offerLink: 'https://s.shopee.com.br/7KpBgC6Eck',
//   sales: 463,
//   ratingStar: '4.8',
//   commissionRate: '0.07',
//   sellerCommissionRate: '0.04',
//   priceMin: '10.09',
//   priceMax: '10.09',
//   priceDiscountRate: 42,
//   shopId: 1006215031