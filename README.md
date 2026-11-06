# Elementar

Dados abertos sobre elementos básicos da vida, por município:

- **água:** vigilância e controle fora do padrão, do SISAGUA/OpenDataSUS;
- **ar:** estimativas diárias de poluentes do SISAM/INPE.

## Requisitos

- Python 3.13 e [uv](https://docs.astral.sh/uv/)
- Node.js com npm, para o front

Os dados ficam em `data/`, que não é versionada. Todos os comandos aceitam `--dados <pasta>` para usar outra pasta.

## Passo a passo

1. clone esse repositorio com Git ou através do download de arquivos.
2. Certifique-se de quem instalado os ## Requisitos
3. Na pasta do projeto
4. Para instalar as dependências do Python, execute `uv sync`.
5. Para baixar os dados da água, execute `uv run elementar-arquivos`.
6. Os dados sobre a qualidade da agua precisam ser "tratados", então execute `uv run elementar-servido`
7. Para baixar os dados do ar, execute `uv run elementar-sisam`. A primeira carga leva cerca de 7 horas.
8. Para subir o site e a API, execute `uv run elementar-api` e abra http://127.0.0.1:8000.
9. Para instalar as dependências do front, entre em `frontend/` e execute `npm install`.
10. Dentro da pasta `frontend/` execute `npm run dev` ou para compilar o front.

## Água (OpenDataSUS)

- Para baixar tudo, execute `uv run elementar-arquivos`.
- Para baixar uma tabela só, execute `uv run elementar-arquivos --tabela agua_controle_mensal_amostras_fora_padrao`. A opção pode ser repetida para mais de uma tabela.
- Para ignorar o manifesto e baixar tudo de novo, execute `uv run elementar-arquivos --forcar`.

Os CSVs viram Parquet por ano em duas camadas:

- `data/parquet/bruto/<tabela>/`: todas as colunas;
- `data/parquet/servido/<tabela>/`: só os campos do `endpoints.toml`, que a API lê.

## Ar (SISAM/INPE)

O SISAM não pede chave. O coletor faz no máximo 1 chamada por segundo.

- Para baixar de 2014 até ontem, execute `uv run elementar-sisam`.
- Para testar com um mês da previsão (cerca de 3 min), execute `uv run elementar-sisam --inicio 2026-10 --fim 2026-10`.
- Para testar com um mês da reanálise (cerca de 3 min), execute `uv run elementar-sisam --inicio 2025-12 --fim 2025-12`.
- Para ignorar o manifesto e baixar os meses de novo, execute `uv run elementar-sisam --forcar`. Combine com `--inicio` e `--fim` para limitar o período.

O início padrão é o `ano_inicial` da vigilância em `src/elementar/endpoints/arquivos.toml`. Os dados ficam em `data/parquet/bruto/ar_sisam/ano=AAAA/mes=MM/`. O manifesto fica em `data/parquet/bruto/ar_sisam/manifesto.json`.

O manifesto evita baixar de novo o que já está gravado:

- meses já completos são pulados;
- no mês em andamento, só os dias novos são buscados;
- um mês baixado da previsão é refeito quando a reanálise passa a cobri-lo.

## API e site

- Para subir a API com o front compilado, execute `uv run elementar-api`.
- Para mudar endereço ou porta, execute `uv run elementar-api --host 0.0.0.0 --porta 8080`.
- Para ver a documentação da API, abra http://127.0.0.1:8000/docs.

A API monta as tabelas de consulta quando inicia. Depois de atualizar os dados, reinicie a API.

## Front (em `frontend/`)

- Para desenvolver com recarga automática, execute `npm run dev` com a API rodando. O Vite repassa as rotas da API para a porta 8000.
- Para compilar para `src/elementar/web/`, que a API serve, execute `npm run build`.
- Para checar o código, execute `npm run lint`.

## Coleta pela API do OpenDataSUS (alternativa)

Esta coleta baixa página por página e grava em `data/elementar.duckdb`. O site não depende dela.

- Para baixar tudo, execute `uv run elementar-coleta`.
- Para testar com poucas páginas, execute `uv run elementar-coleta --max-paginas 3`.
- Para montar o DuckDB a partir do que foi baixado, execute `uv run elementar-carga`.
- Para conferir o DuckDB, execute `uv run elementar-verifica`. Use `--amostra 0` para não mostrar linhas de exemplo.
- Para fazer as três etapas em sequência, execute `uv run elementar-coleta && uv run elementar-carga && uv run elementar-verifica`.

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
