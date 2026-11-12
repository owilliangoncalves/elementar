#=================================================================
# Estágio 1 - Build do front
#=================================================================

FROM node:22-alpine AS web
WORKDIR /build/frontend

# 1) Copia só os arquivos de dependências
COPY frontend/package.json frontend/package-lock.json ./

# 2) Instala dependências
RUN npm ci --ignore-scripts --no-audit --no-fund

# 3) Copia o resto do front
COPY frontend ./

# 4) Gera /build/src/elementar/web (outDir do vite.config.ts)
RUN npm run build

#=================================================================
# Estágio 2 - Imagem final
#=================================================================

FROM python:3.13-slim
WORKDIR /app

# 5) uv para instalar as dependências do uv.lock
COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never

# 6) Instala só as dependências (camada reaproveitada se o código mudar)
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project

# 7) Copia o código do backend e instala o projeto
COPY src ./src
RUN uv sync --frozen --no-dev

# 8) Copia o front compilado do estágio 1
COPY --from=web /build/src/elementar/web ./src/elementar/web

# 9) Comandos do projeto (elementar-api, elementar-arquivos...) no PATH
ENV PATH="/app/.venv/bin:$PATH" TZ="America/Sao_Paulo"

# 10) Documenta a porta
EXPOSE 8000

# 11) Processo que roda quando o container inicia
CMD ["elementar-api", "--host", "0.0.0.0", "--porta", "8000"]
