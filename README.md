# 🛍️ Shopee Affiliate Bot API

Automação completa para buscar ofertas da **Shopee Afiliados**, filtrar por categoria ou palavra-chave e enviar automaticamente para grupos ou contatos do WhatsApp via **Evolution API** e **n8n**.

---

## 🚀 Funcionalidades

- 🔎 Busca de ofertas via **Shopee Affiliate GraphQL API**
- 🧮 Filtros por:
  - Palavra-chave (`keyword`)
  - Categoria Shopee (`productCatId`)
  - Categoria pública (`siteCatId` — ex: `11059998` para roupas femininas)
  - Comissão mínima (`minCommission`)
  - Desconto mínimo (`minDiscount`)
  - Número mínimo de vendas (`minSales`)
- 🧠 Cálculo de score ponderado com base em vendas, comissão, desconto e avaliação
- 📤 Integração com **Evolution API** para envio e recebimento de mensagens no WhatsApp
- 🤖 Integração com **n8n** para disparo automatizado de ofertas
- 🗂️ Fila de ofertas manuais (links enviados pelo WhatsApp)
- 🔐 Validação de acesso por lista de números autorizados

---

## 🧩 Estrutura do Projeto

```
src/
├── server.js                # servidor Express principal
├── routes/
│   └── bot.js               # webhook do WhatsApp (Evolution API)
├── services/
│   ├── shopeeService.js     # comunicação com Shopee Affiliate API
│   ├── queueService.js      # fila local de ofertas manuais
│   └── evolutionService.js  # integração com Evolution API
└── config.js                # configuração de ambiente
```

---

## ⚙️ Variáveis de Ambiente

Crie um arquivo `.env` (ou configure direto no Coolify):

```bash
# Shopee Affiliate
SHOPEE_APP_ID=seu_app_id
SHOPEE_APP_SECRET=seu_app_secret

# Evolution API
EVOLUTION_BASE_URL=https://seu-servidor-evolution.com
EVOLUTION_INSTANCE=nome_da_instancia
EVOLUTION_TOKEN=token_de_acesso

# n8n Webhook
N8N_WEBHOOK_URL=https://seu-n8n.com/webhook/shopee-bot

# Bot
BOT_ALLOWED_NUMBERS=5511999999999,5567999999999

# Servidor
PORT=3000
NODE_ENV=production
```

---

## 🐳 Deploy com Docker (Coolify)

**Dockerfile:**

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "run", "start"]
```

**.dockerignore:**

```dockerignore
node_modules
.git
.env
```

Basta conectar o repositório no **Coolify**, escolher “Dockerfile” como método de build e preencher as variáveis de ambiente.

---

## 🔗 Endpoints

### `GET /offers`

Busca e filtra ofertas da Shopee.

**Exemplo:**

```
GET /offers?keyword=maquiagem&minCommission=8&limit=10
```

**Retorno:**

```json
{
  "offers": [
    {
      "title": "Base Líquida Matte",
      "price": 29.9,
      "oldPrice": 59.9,
      "discount": 50,
      "offerLink": "https://s.shopee.com.br/abc123",
      "commissionRate": "0.25"
    }
  ]
}
```

---

### `POST /bot/webhook`

Webhook que recebe mensagens do WhatsApp via **Evolution API**.
Para utilizar o webhook é necessario o evolution api configurado.

**Funcionalidades:**

- `ofertas maquiagem` → busca e envia ofertas
- `https://shopee.com/...` → adiciona link à fila de envio manual
- mensagens de desconhecidos → responde automaticamente com aviso amigável

---

## 🔔 Integração com n8n

Crie um **Webhook Node** em `POST` no n8n (ex: `/webhook/shopee-bot`)  
e configure no `.env`:

```bash
N8N_WEBHOOK_URL=https://seu-n8n.com/webhook/shopee-bot
```

O n8n receberá payloads assim:

```json
{
  "source": "shopee-bot",
  "keyword": "maquiagem",
  "offers": [...],
  "fromNormalized": "5511999999999"
}
```

---

## 🧠 Exemplo de Fluxo no n8n

1. **Webhook (POST)** → recebe dados do bot
2. **Split In Batches** → itera em `offers`
3. **HTTP Request (POST)** → envia mensagens usando Evolution API

---

## 🛠️ Scripts úteis

```bash
# rodar local
npm install
npm run start

# build Docker local
docker build -t shopee-bot .
docker run -p 3000:3000 --env-file .env shopee-bot
```

---

## 💬 Comandos disponíveis no WhatsApp

| Comando                     | Função                                          |
| --------------------------- | ----------------------------------------------- |
| `ofertas maquiagem`         | Busca e envia ofertas da Shopee sobre maquiagem |
| `ofertas roupas femininas`  | Busca e envia ofertas relacionadas              |
| `https://shopee.com.br/...` | Adiciona link de produto à fila manual          |
| (qualquer outro texto)      | Envia mensagem de ajuda                         |

---

## 🧑‍💻 Autor

**Cristian Camargo**  
Full Stack Developer • Vue / Nuxt / Node • RM Agro / ZapLead  
📸 Instagram: [@camargodev](https://instagram.com/camargodev)  
🌐 Site: [ccamargo.dev](https://ccamargo.dev)

---

## 🪪 Licença

Este projeto é de uso pessoal e experimental.  
Sinta-se livre para adaptar e expandir conforme suas necessidades.
