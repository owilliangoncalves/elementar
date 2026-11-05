uv run elementar-coleta                   # baixa todos os dados
uv run elementar-coleta --max-paginas 3   # só baixa os dados de 3 páginas
uv run elementar-carga                    # só monta o DuckDB
uv run elementar-verifica                 # confere o resultado

uv run elementar-coleta && uv run elementar-carga && uv run elementar-verifica   # tudo em sequência


uv run python -c "import duckdb; duckdb.connect('data/elementar.duckdb', read_only=True).sql('FROM agua_parametros_basicos LIMIT 20').show()"

uv run python -c "import duckdb; duckdb.connect('data/elementar.duckdb', read_only=True).sql('FROM agua_controle_mensal_de_amostras_fora_do_padrao LIMIT 20').show()"