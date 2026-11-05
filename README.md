uv run elementar-coleta                   # baixa todos os dados
uv run elementar-coleta --max-paginas 3   # só baixa os dados de 3 páginas
uv run elementar-carga                    # só monta o DuckDB
uv run elementar-verifica                 # confere o resultado

uv run elementar-coleta && uv run elementar-carga && uv run elementar-verifica   # tudo em sequência


uv run python -c "import duckdb; duckdb.connect('data/elementar.duckdb', read_only=True).sql('FROM agua_parametros_basicos LIMIT 20').show()"

uv run python -c "import duckdb; duckdb.connect('data/elementar.duckdb', read_only=True).sql('FROM agua_controle_mensal_de_amostras_fora_do_padrao LIMIT 20').show()"




uv run elementar-arquivos --tabela agua_controle_mensal_amostras_fora_padrao   # teste com o menor arquivo
uv run elementar-arquivos                # tudo; nas próximas execuções, só o que mudou
uv run elementar-arquivos --forcar       # ignora o manifesto e baixa tudo de novo


Amostra das linhas
uv run python -c "import duckdb; duckdb.sql(\"FROM read_parquet('data/parquet/agua_vigilancia_parametros_basicos/*/dados.parquet', hive_partitioning = true) LIMIT 10\").show()"

Colunas e tipos
uv run python -c "import duckdb; duckdb.sql(\"DESCRIBE FROM read_parquet('data/parquet/agua_vigilancia_parametros_basicos/*/dados.parquet', hive_partitioning = true)\").show()"

Linhas por ano
uv run python -c "import duckdb; duckdb.sql(\"SELECT ano, count(*) AS linhas FROM read_parquet('data/parquet/agua_vigilancia_parametros_basicos/*/dados.parquet', hive_partitioning = true) GROUP BY ano ORDER BY ano\").show()"

Resumo por coluna (nulos, mínimo, máximo e valores distintos)
uv run python -c "import duckdb; duckdb.sql(\"SUMMARIZE FROM read_parquet('data/parquet/agua_controle_mensal_amostras_fora_padrao/*/dados.parquet', hive_partitioning = true)\").show()"

Resumo por coluna (nulos, mínimo, máximo e valores distintos)
uv run python -c "import duckdb; duckdb.sql(\"SUMMARIZE FROM read_parquet('data/parquet/agua_controle_mensal_amostras_fora_padrao/*/dados.parquet', hive_partitioning = true)\").show()"