# Elementar

Dados abertos sobre elementos básicos da vida, por município:

- **água:** vigilância e controle fora do padrão, do SISAGUA/OpenDataSUS;
- **ar:** estimativas diárias de poluentes do SISAM/INPE;
- **queimadas:** focos detectados por satélite, do Programa Queimadas/INPE;
- **desmatamento:** alertas validados do MapBiomas Alerta.

## Requisitos

- Git, para clonar o repositório.
- Python 3.13 e [uv](https://docs.astral.sh/uv/), para baixar os dados e rodar a API.
- Node.js 22 com npm, para compilar o front.
- Docker com Docker Compose, para rodar e publicar o container.
- Conta gratuita no [MapBiomas Alerta](https://plataforma.alerta.mapbiomas.org), só para os dados de desmatamento.

## Ferramentas

Backend e dados:

- **uv:** instala as dependências e roda os comandos do projeto.
- **httpx:** baixa os arquivos e chama as APIs das fontes.
- **DuckDB:** converte os CSVs em Parquet e consulta os dados.
- **Parquet:** formato em que os dados ficam gravados, por ano ou mês.
- **pandas:** monta as tabelas do SISAM antes de gravar.
- **FastAPI e Uvicorn:** servem a API e o site.
- **Ruff:** formata e checa o Python.

Front:

- **React, TypeScript e Vite:** interface e build do site.
- **TanStack Router, Query e Table:** rotas, chamadas à API e tabelas.
- **Tailwind CSS:** estilos.
- **D3 e TopoJSON:** mapas dos estados e municípios.
- **Recharts:** gráficos.
- **oxlint:** checa o TypeScript.

Publicação:

- **Docker e Docker Compose:** empacotam o site e a API numa imagem.
- **Cloudflare Tunnel:** publica o site num link `trycloudflare.com`.

Os dados ficam em `data/`. Todos os comandos aceitam `--dados <pasta>` para usar outra pasta.

## Passo a passo

1. Instale os requisitos acima.
2. Clone o repositório com Git ou baixe os arquivos.
3. Entre na pasta do projeto.
4. Para instalar as dependências do Python, execute `uv sync`.
5. Copie o `.env.example` para `.env` e coloque o e-mail e a senha da sua conta do MapBiomas.
6. Para baixar todos os dados, execute `uv run elementar-dados`.

> São muitos dados e pode levar mais de 10 h. Para baixar só uma amostra, use os comandos de teste de cada fonte, abaixo.

7. Para instalar as dependências do front, entre em `frontend/` e execute `npm install`.
8. Para compilar o front, ainda em `frontend/`, execute `npm run build`.
9. Volte para a raiz, execute `uv run elementar-api` e abra http://127.0.0.1:8000.

### Todos os dados

- Para baixar água, ar, queimadas e desmatamento em sequência, execute `uv run elementar-dados`. Uma etapa que falha não interrompe as seguintes.
- Para rodar só algumas etapas, execute `uv run elementar-dados --etapa queimadas --etapa desmatamento`. As etapas são `agua`, `ar`, `queimadas` e `desmatamento`.
- Para ignorar os manifestos e baixar tudo de novo, execute `uv run elementar-dados --forcar`.

### Água (OpenDataSUS)

- Para baixar tudo, execute `uv run elementar-arquivos`.
- Para baixar uma tabela só, execute `uv run elementar-arquivos --tabela agua_controle_mensal_amostras_fora_padrao`. A opção pode ser repetida para mais de uma tabela.
- Para ignorar o manifesto e baixar tudo de novo, execute `uv run elementar-arquivos --forcar`.

Os CSVs viram Parquet por ano em duas camadas:

- `data/parquet/bruto/<tabela>/`: todas as colunas;
- `data/parquet/servido/<tabela>/`: só os campos do `endpoints.toml`, que a API lê.

### Ar (SISAM/INPE)

- Para baixar de 2014 até ontem, execute `uv run elementar-sisam`.
- Para testar com um mês da previsão (cerca de 3 min), execute `uv run elementar-sisam --inicio 2026-10 --fim 2026-10`.
- Para testar com um mês da reanálise (cerca de 3 min), execute `uv run elementar-sisam --inicio 2025-12 --fim 2025-12`.
- Para ignorar o manifesto e baixar os meses de novo, execute `uv run elementar-sisam --forcar`. Combine com `--inicio` e `--fim` para limitar o período.

O início padrão é o `ano_inicial` da vigilância em `src/elementar/endpoints/arquivos.toml`. Os dados ficam em `data/parquet/bruto/ar_sisam/ano=AAAA/mes=MM/`. O manifesto fica em `data/parquet/bruto/ar_sisam/manifesto.json`.

O manifesto evita baixar de novo o que já está gravado:

- meses já completos são pulados;
- no mês em andamento, só os dias novos são buscados;
- um mês baixado da previsão é refeito quando a reanálise passa a cobri-lo.

### Queimadas (Programa Queimadas/INPE)

Os focos vêm do servidor de dados do INPE, o mesmo do BDQueimadas. Só entra o satélite de referência (AQUA, passagem da tarde), que é a série usada pelo INPE para comparar períodos.

- Para baixar de 2014 até hoje, execute `uv run elementar-queimadas`.
- Para testar com um ano, execute `uv run elementar-queimadas --inicio 2025 --fim 2025`.
- Para ignorar o manifesto e baixar tudo de novo, execute `uv run elementar-queimadas --forcar`.

Anos fechados vêm do arquivo anual. O ano corrente vem dos arquivos mensais até o INPE publicar o anual, que então os substitui. Os dados ficam em `data/parquet/bruto/queimadas_focos/ano=AAAA/mes=MM/`. O manifesto fica em `data/parquet/bruto/queimadas_focos/manifesto.json` e guarda o ETag de cada arquivo, então só é baixado o que mudou.

### Desmatamento (MapBiomas Alerta)

Os alertas vêm da API da plataforma MapBiomas Alerta, que pede uma conta gratuita em https://plataforma.alerta.mapbiomas.org.

- Para configurar a conta, coloque `MAPBIOMAS_EMAIL` e `MAPBIOMAS_SENHA` no `.env` (veja o `.env.example`).
- Para baixar todos os alertas publicados desde 2019, execute `uv run elementar-desmatamento`.
- Para ignorar o manifesto e baixar de novo, execute `uv run elementar-desmatamento --forcar`.

A API entrega um relatório único com todos os alertas, regerado pelo MapBiomas de tempos em tempos. O manifesto (`data/parquet/bruto/desmatamento_alertas/manifesto.json`) guarda o MD5 do relatório: se ele não mudou, nada é baixado. Os dados ficam em `data/parquet/bruto/desmatamento_alertas/ano=AAAA/`, por ano de detecção.

## API e site

- Para subir a API com o front compilado, execute `uv run elementar-api`.
- Para mudar endereço ou porta, execute `uv run elementar-api --host 0.0.0.0 --porta 8080`.
- Para ver a documentação da API, abra http://127.0.0.1:8000/docs.

A API monta as tabelas de consulta quando inicia. Depois de atualizar os dados, reinicie a API.

## Docker

A imagem compila o front e instala a API. Os dados ficam em `data/`, compartilhada com o container.

- Para subir o site em http://127.0.0.1:8000, execute `docker compose up -d --build elementar`.
- Para subir também o túnel e publicar na internet, execute `docker compose up -d --build`. O link `https://*.trycloudflare.com` aparece em `docker compose logs tunel` e muda a cada reinício do túnel.
- Para baixar os dados dentro do container, execute `docker compose exec elementar elementar-dados`. Depois, reinicie com `docker compose restart elementar`.
- Para liberar o acesso pela rede local, coloque `ELEMENTAR_ENDERECO=0.0.0.0` no `.env`. Para mudar a porta, use `ELEMENTAR_PORTA`.
- Para parar, execute `docker compose down`.

## Consultas rápidas

Para ver uma amostra das linhas, execute:

```bash
uv run python -c "import duckdb; duckdb.sql(\"FROM read_parquet('data/parquet/servido/agua_vigilancia_parametros_basicos/*/dados.parquet', hive_partitioning = true) LIMIT 10\").show()"
```

Para ver colunas e tipos, execute:

```bash
uv run python -c "import duckdb; duckdb.sql(\"DESCRIBE FROM read_parquet('data/parquet/servido/agua_vigilancia_parametros_basicos/*/dados.parquet', hive_partitioning = true)\").show()"
```

Para contar linhas por ano, execute:

```bash
uv run python -c "import duckdb; duckdb.sql(\"SELECT ano, count(*) AS linhas FROM read_parquet('data/parquet/servido/agua_vigilancia_parametros_basicos/*/dados.parquet', hive_partitioning = true) GROUP BY ano ORDER BY ano\").show()"
```

Para resumir as colunas (nulos, mínimo, máximo e valores distintos), execute:

```bash
uv run python -c "import duckdb; duckdb.sql(\"SUMMARIZE FROM read_parquet('data/parquet/servido/agua_controle_mensal_amostras_fora_padrao/*/dados.parquet', hive_partitioning = true)\").show()"
```

Para conferir a cobertura do ar por ano, execute:

```bash
uv run python -c "import duckdb; duckdb.sql(\"SELECT ano, count(*) AS linhas, count(DISTINCT codigo_ibge) AS municipios, count(DISTINCT data) AS dias FROM read_parquet('data/parquet/bruto/ar_sisam/*/*/dados.parquet', hive_partitioning = true) GROUP BY ano ORDER BY ano\").show()"
```

## Desenvolvimento

- Para formatar o Python, execute `uv run ruff format`.
- Para checar o Python, execute `uv run ruff check`.