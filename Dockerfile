# 1) imagem base leve
FROM node:20-alpine AS base

# 2) diretório de trabalho dentro do container
WORKDIR /app

# 3) instalar dependências só com package.json + package-lock.json (ou pnpm-lock/yarn.lock)
#    isso ajuda o cache no Coolify
COPY package*.json ./

# se você usa npm:
RUN npm ci --omit=dev

# 4) copiar o restante do código
COPY . .

# 5) definir variáveis padrão (podem ser sobrescritas no Coolify)
ENV NODE_ENV=production
ENV PORT=3000

# 6) expor porta (mesma do teu app)
EXPOSE 3000

# 7) comando de execução
CMD ["npm", "run", "start"]
