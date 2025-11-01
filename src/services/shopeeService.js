// src/services/shopeeService.js
const axios = require("axios");
const crypto = require("crypto");
const { shopee } = require("../config");
const { flushQueue } = require("./queueService");

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------
function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

// interno pra filtro/score
function rateToPctInternal(rateStr) {
  if (rateStr === undefined || rateStr === null || rateStr === "") return 0;
  const n = Number(rateStr);
  if (!isFinite(n) || n < 0) return 0;
  // ⚠️ Shopee BR costuma mandar "0.25" para 2,5% → usamos x10
  // se vier "5" ou "12" (já em %) a gente mantém
  return n <= 1 ? n * 10 : n;
}

// extrai shopId e itemId de https://shopee.com.br/...-i.<shopId>.<itemId>
function extractShopAndItemFromLink(link) {
  if (!link) return null;
  const m = link.match(/-i\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { shopId: Number(m[1]), itemId: Number(m[2]) };
}

// pega dados públicos da Shopee (pra saber se é BR e/ou pegar catid do site)
async function fetchPublicItem(shopId, itemId) {
  const url = `https://shopee.com.br/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`;
  const { data } = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://shopee.com.br/",
      Accept: "application/json",
    },
    timeout: 8000,
  });
  return data && data.item ? data.item : null;
}

// filtra por BR e/ou por categoria do SITE (id grandão tipo 11059998)
async function filterByPublicData(
  items,
  { localOnly, siteCatId },
  maxParallel = 5
) {
  if (!localOnly && !siteCatId) return items;

  const result = [];

  for (let i = 0; i < items.length; i += maxParallel) {
    const slice = items.slice(i, i + maxParallel);

    const checked = await Promise.all(
      slice.map(async (it) => {
        const parsed =
          extractShopAndItemFromLink(it.offerLink) ||
          extractShopAndItemFromLink(it.productLink);
        if (!parsed) return null;

        let publicItem;
        try {
          publicItem = await fetchPublicItem(parsed.shopId, parsed.itemId);
        } catch (e) {
          return null;
        }
        if (!publicItem) return null;

        // filtro BR
        if (localOnly) {
          const loc =
            publicItem.shop_location ||
            publicItem.shop_loc ||
            publicItem.region ||
            publicItem.country ||
            "";
          const locNorm = String(loc).toLowerCase();
          const isBR =
            locNorm.includes("brasil") ||
            locNorm === "br" ||
            locNorm.endsWith(" br") ||
            locNorm.includes(", br");
          if (!isBR) return null;
        }

        // filtro por categoria do SITE (idão da URL)
        if (siteCatId) {
          const catid = publicItem.catid;
          if (Number(catid) !== Number(siteCatId)) return null;
        }

        return it;
      })
    );

    checked.forEach((ok) => ok && result.push(ok));
  }

  return result;
}

// -----------------------------------------------------------------------------
// função principal: busca ofertas
// -----------------------------------------------------------------------------
async function getOffers(params = {}) {
  // coerção defensiva (rota pode ter passado string)
  const keyword = params.keyword ? String(params.keyword).trim() : null;
  const rawCat =
    params.productCatId || params.categoryId || params.catId || null;

  const page = params.page ? Number(params.page) : 1;
  const limit = params.limit ? Number(params.limit) : 50;

  const minDiscount = params.minDiscount ? Number(params.minDiscount) : 0;
  const minCommission = params.minCommission ? Number(params.minCommission) : 5;
  const minSales = params.minSales ? Number(params.minSales) : 1;

  const wSales = params.wSales ? Number(params.wSales) : 0.45;
  const wComm = params.wComm ? Number(params.wComm) : 0.35;
  const wDisc = params.wDisc ? Number(params.wDisc) : 0.15;
  const wRate = params.wRate ? Number(params.wRate) : 0.05;

  const sortType = params.sortType ? Number(params.sortType) : 5;

  const extraOnly =
    params.extraOnly === true ||
    params.extraOnly === "true" ||
    params.extraOnly === 1 ||
    params.extraOnly === "1";

  const localOnly =
    params.localOnly === true ||
    params.localOnly === "true" ||
    params.localOnly === 1 ||
    params.localOnly === "1";

  // normaliza categoria (doc x site)
  let productCatId = null;
  let siteCatId = null;
  if (rawCat) {
    const n = Number(rawCat);
    if (n > 1_000_000) {
      siteCatId = n;
    } else {
      productCatId = n;
    }
  }

  // monta query gql
  const vars = [];
  const args = [];

  if (keyword) {
    vars.push("$keyword: String!");
    args.push("keyword: $keyword");
  }
  if (productCatId) {
    vars.push("$productCatId: Int!");
    args.push("productCatId: $productCatId");
  }

  vars.push("$sortType: Int!");
  vars.push("$page: Int!");
  vars.push("$limit: Int!");
  args.push("sortType: $sortType");
  args.push("page: $page");
  args.push("limit: $limit");

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
          shopeeCommissionRate
          priceMin
          priceMax
          priceDiscountRate
          productCatIds
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

  const variables = {
    ...(keyword ? { keyword } : {}),
    ...(productCatId ? { productCatId } : {}),
    sortType,
    page,
    limit,
  };

  const body = JSON.stringify({ query, variables });
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = sha256(shopee.appId + ts + body + shopee.secret);
  const Authorization = `SHA256 Credential=${shopee.appId}, Timestamp=${ts}, Signature=${signature}`;

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

  // ----------------- enrich -----------------
  let enriched = nodes.map((p) => {
    const nPriceMin = Number(p.priceMin || 0);
    const nPriceMax = Number(p.priceMax || 0);

    // desconto
    let discountPct = null;
    if (nPriceMax > nPriceMin && nPriceMin > 0) {
      discountPct = Math.round((1 - nPriceMin / nPriceMax) * 100);
    } else if (p.priceDiscountRate != null) {
      discountPct = Number(p.priceDiscountRate);
    }

    // valores crus pra devolver
    const rawCommissionRate = p.commissionRate ?? "";
    const rawSellerCommissionRate = p.sellerCommissionRate ?? "";
    const rawShopeeCommissionRate = p.shopeeCommissionRate ?? "";

    // convertidos pra filtro
    const commissionPct = rateToPctInternal(rawCommissionRate);
    const sellerXtraPct = rateToPctInternal(rawSellerCommissionRate);
    const shopeePct = rateToPctInternal(rawShopeeCommissionRate);

    const finalCommissionPct =
      commissionPct > 0 ? commissionPct : sellerXtraPct + shopeePct;

    const rating = Number(p.ratingStar || 0);
    const sales = Number(p.sales || 0);

    const score =
      wSales * Math.log1p(Math.max(0, sales)) +
      wComm * (finalCommissionPct || 0) +
      wDisc * (discountPct || 0) +
      wRate * (rating * 20);

    return {
      id: p.itemId,
      title: p.productName,
      price: nPriceMin,
      oldPrice: nPriceMax > 0 ? nPriceMax : null,
      discount: discountPct,
      imageUrl: p.imageUrl || null,
      offerLink: p.offerLink || p.productLink || null,
      productLink: p.productLink || null,
      productCatIds: Array.isArray(p.productCatIds) ? p.productCatIds : [],
      metrics: {
        sales,
        rating,
        rawCommissionRate,
        rawSellerCommissionRate,
        rawShopeeCommissionRate,
        finalCommissionPct,
        sellerXtraPct,
      },
      score,
    };
  });

  // ----------------- filtros baratos -----------------
  enriched = enriched.filter(
    (x) =>
      x.offerLink &&
      x.metrics.sales >= minSales &&
      (x.metrics.finalCommissionPct || 0) >= minCommission &&
      (x.discount || 0) >= minDiscount
  );

  // remove produtos sem desconto real
  enriched = enriched.filter((x) => {
    if (!x.oldPrice) return true;
    if (!x.price && x.price !== 0) return true;
    return x.price < x.oldPrice;
  });

  // reforça categoria da DOC se a Shopee tiver ignorado
  if (productCatId) {
    enriched = enriched.filter((x) => x.productCatIds.includes(productCatId));
  }

  // só “comissão extra”
  if (extraOnly) {
    enriched = enriched.filter((x) => (x.metrics.sellerXtraPct || 0) > 0);
  }

  // BR e/ou categoria do site
  if (localOnly || siteCatId) {
    enriched = await filterByPublicData(enriched, { localOnly, siteCatId }, 5);
  }

  // ordena
  const ranked = enriched.sort((a, b) => b.score - a.score);

  // pega fila (ofertas manuais)
  const queued = flushQueue(); // sempre devolve e limpa

  // monta resposta final
  const offers = [...queued, ...ranked.slice(0, limit)].map((o) => ({
    title: o.title,
    price: o.price,
    oldPrice: o.oldPrice,
    discount: o.discount,
    imageUrl: o.imageUrl,
    offerLink: o.offerLink,
    productLink: o.productLink,
    productCatIds: o.productCatIds,
    sales: o.metrics?.sales ?? o.sales ?? 0,
    rating: o.metrics?.rating ?? o.rating ?? 0,
    // devolvendo exatamente como a Shopee manda
    commissionRate: o.metrics?.rawCommissionRate ?? o.commissionRate ?? "",
    sellerCommissionRate:
      o.metrics?.rawSellerCommissionRate ?? o.sellerCommissionRate ?? "",
    shopeeCommissionRate:
      o.metrics?.rawShopeeCommissionRate ?? o.shopeeCommissionRate ?? "",
    score: Number((o.score ?? 0).toFixed ? o.score.toFixed(2) : o.score ?? 0),
  }));

  return {
    offers,
    pageInfo: conn?.pageInfo || null,
    applied: {
      keyword,
      productCatId,
      siteCatId,
      sortType,
      page,
      limit,
      minDiscount,
      minCommission,
      minSales,
      extraOnly,
      localOnly,
      weights: { wSales, wComm, wDisc, wRate },
    },
  };
}

// -----------------------------------------------------------------------------
// pegar oferta por LINK e transformar num item de fila
// -----------------------------------------------------------------------------
async function buildOfferFromLink(link) {
  const parsed = extractShopAndItemFromLink(link);
  if (!parsed) return null;

  const item = await fetchPublicItem(parsed.shopId, parsed.itemId);
  if (!item) return null;

  const query = `
    query GetProductOfferV2($itemId: Int!, $sortType: Int!, $page: Int!, $limit: Int!) {
      productOfferV2(
        itemId: $itemId,
        sortType: $sortType,
        page: $page,
        limit: $limit
      ) {
        nodes {
          offerLink
          productLink
          commissionRate
          sellerCommissionRate
          shopeeCommissionRate
        }
      }
    }
  `;
  const variables = {
    itemId: Number(parsed.itemId),
    sortType: 5,
    page: 1,
    limit: 1,
  };

  const body = JSON.stringify({ query, variables });
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = sha256(shopee.appId + ts + body + shopee.secret);
  const Authorization = `SHA256 Credential=${shopee.appId}, Timestamp=${ts}, Signature=${signature}`;

  let offerLink = null;
  let commissionRate = "";
  let sellerCommissionRate = "";
  let shopeeCommissionRate = "";

  try {
    const resp = await axios.post(shopee.gqlUrl, body, {
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "identity",
        Authorization,
      },
      timeout: 10000,
    });
    const node = resp.data?.data?.productOfferV2?.nodes?.[0];
    if (node) {
      offerLink = node.offerLink || null;
      commissionRate = node.commissionRate ?? "";
      sellerCommissionRate = node.sellerCommissionRate ?? "";
      shopeeCommissionRate = node.shopeeCommissionRate ?? "";
    }
  } catch (e) {
    // se falhar, a gente segue com o link puro
  }

  // API pública costuma vir em "preço * 100000" mesmo, vamos proteger
  const safePriceFromPublic =
    typeof item.price === "number" && item.price > 0
      ? item.price / 100000
      : null;

  return {
    title: item.name,
    price: safePriceFromPublic,
    oldPrice: null,
    discount: null,
    imageUrl:
      item.images && item.images.length
        ? `https://cf.shopee.com.br/file/${item.images[0]}`
        : null,
    offerLink: offerLink || link,
    productLink: link,
    productCatIds: item.categories || [],
    sales: item.historical_sold || 0,
    rating: item.item_rating?.rating_star || 0,
    commissionRate,
    sellerCommissionRate,
    shopeeCommissionRate,
  };
}

module.exports = {
  getOffers,
  buildOfferFromLink,
  extractShopAndItemFromLink,
};
