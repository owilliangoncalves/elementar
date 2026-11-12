-- Elementar: modelo relacional
-- SGBD: DuckDB.
-- Ordem: domínios, geografia, água, ar, queimadas, desmatamento, carga, visões.
-- Tudo se liga pelo município do IBGE (código de 7 dígitos, com o verificador).

------------------------------------------------------------------------------
-- Geografia
------------------------------------------------------------------------------

-- Grandes regiões do IBGE. O id é o primeiro dígito do código da UF.
CREATE TABLE regiao (
    id   SMALLINT PRIMARY KEY CHECK (id BETWEEN 1 AND 5),
    nome VARCHAR  NOT NULL UNIQUE
);

CREATE TABLE uf (
    codigo    SMALLINT PRIMARY KEY CHECK (codigo BETWEEN 11 AND 53),
    sigla     VARCHAR  NOT NULL UNIQUE CHECK (regexp_full_match(sigla, '[A-Z]{2}')),
    nome      VARCHAR  NOT NULL UNIQUE,
    regiao_id SMALLINT NOT NULL REFERENCES regiao (id),
    -- Regra do IBGE: o primeiro dígito da UF é a região.
    CHECK (codigo // 10 = regiao_id)
);

CREATE TABLE municipio (
    codigo_ibge INTEGER  PRIMARY KEY CHECK (codigo_ibge BETWEEN 1100000 AND 5399999),
    nome        VARCHAR  NOT NULL,
    uf_codigo   SMALLINT NOT NULL REFERENCES uf (codigo),
    -- Os dois primeiros dígitos do município são a UF.
    CHECK (codigo_ibge // 100000 = uf_codigo),
    UNIQUE (uf_codigo, nome)
);

-- O SISAGUA usa o código de 6 dígitos e divide o DF em Regiões
-- Administrativas (530000, 530001...), que não são municípios do IBGE.
-- Cada localidade aponta para o município a que pertence.
CREATE TABLE localidade_agua (
    codigo_sisagua INTEGER PRIMARY KEY CHECK (codigo_sisagua BETWEEN 110000 AND 539999),
    nome           VARCHAR NOT NULL,
    codigo_ibge    INTEGER NOT NULL REFERENCES municipio (codigo_ibge),
    -- A localidade fica na mesma UF do município.
    CHECK (codigo_sisagua // 10000 = codigo_ibge // 100000)
);

CREATE TABLE bioma (
    id   SMALLINT PRIMARY KEY,
    nome VARCHAR  NOT NULL UNIQUE
);

------------------------------------------------------------------------------
-- Água (SISAGUA)
------------------------------------------------------------------------------

-- Catálogo único de parâmetros para vigilância e controle.
CREATE TABLE parametro_agua (
    id      SMALLINT PRIMARY KEY,
    nome    VARCHAR  NOT NULL UNIQUE,
    unidade VARCHAR,
    tipo    VARCHAR  NOT NULL CHECK (tipo IN ('fisico-quimico', 'microbiologico'))
);

-- As fontes escrevem o mesmo parâmetro de jeitos diferentes
-- ("Cor Aparente (uH)" na vigilância, "Cor (uH)" no controle).
CREATE TABLE parametro_agua_nome (
    nome_fonte   VARCHAR  PRIMARY KEY,
    parametro_id SMALLINT NOT NULL REFERENCES parametro_agua (id)
);

CREATE TABLE motivo_coleta (
    id   SMALLINT PRIMARY KEY,
    nome VARCHAR  NOT NULL UNIQUE
);

CREATE SEQUENCE seq_amostra_vigilancia;

-- Uma coleta da vigilância. O número da amostra só é único dentro da
-- localidade e da data de coleta.
CREATE TABLE amostra_vigilancia (
    id             BIGINT   PRIMARY KEY DEFAULT nextval('seq_amostra_vigilancia'),
    codigo_sisagua INTEGER  NOT NULL REFERENCES localidade_agua (codigo_sisagua),
    numero         VARCHAR  NOT NULL,
    data_coleta    DATE     NOT NULL CHECK (data_coleta >= DATE '2014-01-01'),
    data_laudo     DATE,
    motivo_id      SMALLINT NOT NULL REFERENCES motivo_coleta (id),
    local          VARCHAR,
    UNIQUE (codigo_sisagua, numero, data_coleta),
    -- O laudo não pode ser anterior à coleta.
    CHECK (data_laudo IS NULL OR data_laudo >= data_coleta)
);

-- Resultado de um parâmetro em uma amostra.
CREATE TABLE analise_vigilancia (
    amostra_id   BIGINT   NOT NULL REFERENCES amostra_vigilancia (id),
    parametro_id SMALLINT NOT NULL REFERENCES parametro_agua (id),
    resultado    VARCHAR,  -- texto original da fonte; NULL quando não informado
    valor        DOUBLE CHECK (valor >= 0),  -- parâmetros físico-químicos
    presenca     BOOLEAN,  -- parâmetros microbiológicos (PRESENTE/AUSENTE)
    providencia  VARCHAR,
    PRIMARY KEY (amostra_id, parametro_id),
    -- Um resultado é numérico ou de presença, nunca os dois.
    CHECK (valor IS NULL OR presenca IS NULL)
);

CREATE SEQUENCE seq_instituicao;

-- Prestador do serviço de abastecimento, que informa o controle.
CREATE TABLE instituicao (
    id    INTEGER PRIMARY KEY DEFAULT nextval('seq_instituicao'),
    sigla VARCHAR,
    nome  VARCHAR NOT NULL,
    cnpj  VARCHAR UNIQUE CHECK (regexp_full_match(cnpj, '[0-9]{14}'))
);

CREATE SEQUENCE seq_amostra_fora_padrao;

-- Controle mensal: só as amostras fora do padrão, informadas pelo prestador.
CREATE TABLE amostra_fora_padrao (
    id             BIGINT   PRIMARY KEY DEFAULT nextval('seq_amostra_fora_padrao'),
    codigo_sisagua INTEGER  NOT NULL REFERENCES localidade_agua (codigo_sisagua),
    instituicao_id INTEGER  REFERENCES instituicao (id),
    ano            SMALLINT NOT NULL CHECK (ano >= 2014),
    mes            SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
    parametro_id   SMALLINT NOT NULL REFERENCES parametro_agua (id),
    ponto          VARCHAR  NOT NULL
        CHECK (ponto IN ('SISTEMA DE DISTRIBUIÇÃO', 'PONTO DE CONSUMO')),
    zona           VARCHAR  CHECK (zona IN ('Urbana', 'Rural')),
    area           VARCHAR,
    resultado      VARCHAR,
    providencia    VARCHAR
);

------------------------------------------------------------------------------
-- Ar (SISAM/INPE)
------------------------------------------------------------------------------

CREATE TABLE poluente (
    codigo  VARCHAR PRIMARY KEY,
    nome    VARCHAR NOT NULL UNIQUE,
    unidade VARCHAR NOT NULL CHECK (unidade IN ('µg/m³', 'ppm'))
);

-- Um valor por município, poluente e dia. A reanálise substitui a previsão
-- quando passa a cobrir o dia, então nunca há duas linhas para o mesmo dia.
CREATE TABLE medicao_ar (
    codigo_ibge INTEGER NOT NULL REFERENCES municipio (codigo_ibge),
    poluente    VARCHAR NOT NULL REFERENCES poluente (codigo),
    data        DATE    NOT NULL CHECK (data >= DATE '2014-01-01'),
    valor       DOUBLE  NOT NULL CHECK (valor >= 0),
    origem      VARCHAR NOT NULL CHECK (origem IN ('reanalise', 'previsao')),
    PRIMARY KEY (codigo_ibge, poluente, data)
);

------------------------------------------------------------------------------
-- Queimadas (Programa Queimadas/INPE)
------------------------------------------------------------------------------

-- Só focos do satélite de referência (AQUA, passagem da tarde): somar
-- satélites contaria o mesmo fogo mais de uma vez.
CREATE TABLE foco_queimada (
    foco_id     VARCHAR   PRIMARY KEY,
    codigo_ibge INTEGER   NOT NULL REFERENCES municipio (codigo_ibge),
    data_hora   TIMESTAMP NOT NULL CHECK (data_hora >= TIMESTAMP '2014-01-01'),
    -- Caixa que contém o território brasileiro.
    lat         DOUBLE    NOT NULL CHECK (lat BETWEEN -34 AND 6),
    lon         DOUBLE    NOT NULL CHECK (lon BETWEEN -74 AND -28),
    bioma_id    SMALLINT  NOT NULL REFERENCES bioma (id)
);

------------------------------------------------------------------------------
-- Desmatamento (MapBiomas Alerta)
------------------------------------------------------------------------------

-- Só alertas validados e publicados. Cada alerta é atribuído a um município;
-- area_ha é o alerta inteiro e area_municipio_ha a parte dentro do município.
CREATE TABLE alerta_desmatamento (
    codigo            BIGINT   PRIMARY KEY,
    codigo_ibge       INTEGER  NOT NULL REFERENCES municipio (codigo_ibge),
    detectado_em      DATE     NOT NULL CHECK (detectado_em >= DATE '2019-01-01'),
    area_ha           DOUBLE   NOT NULL CHECK (area_ha > 0),
    area_municipio_ha DOUBLE   NOT NULL CHECK (area_municipio_ha >= 0),
    bioma_id          SMALLINT NOT NULL REFERENCES bioma (id),
    -- A parte no município não passa do alerta (tolerância para arredondamento).
    CHECK (area_municipio_ha <= area_ha + 0.001)
);

CREATE TABLE tipo_cruzamento (
    codigo    VARCHAR PRIMARY KEY,
    descricao VARCHAR NOT NULL
);

-- Áreas protegidas ou cadastros que o alerta atinge (CAR, terra indígena...).
CREATE TABLE alerta_cruzamento (
    alerta_codigo BIGINT  NOT NULL REFERENCES alerta_desmatamento (codigo),
    cruzamento    VARCHAR NOT NULL REFERENCES tipo_cruzamento (codigo),
    PRIMARY KEY (alerta_codigo, cruzamento)
);

------------------------------------------------------------------------------
-- Carga (manifestos)
------------------------------------------------------------------------------

CREATE TABLE fonte (
    codigo VARCHAR PRIMARY KEY
        CHECK (codigo IN ('agua', 'ar', 'queimadas', 'desmatamento')),
    nome   VARCHAR NOT NULL,
    orgao  VARCHAR NOT NULL,
    url    VARCHAR NOT NULL
);

-- Cada arquivo remoto e a versão gravada (ETag ou MD5). Uma nova carga só
-- baixa o arquivo quando a versão muda.
CREATE TABLE arquivo_fonte (
    url          VARCHAR   PRIMARY KEY,
    fonte_codigo VARCHAR   NOT NULL REFERENCES fonte (codigo),
    versao       VARCHAR   NOT NULL,
    baixado_em   TIMESTAMP NOT NULL
);

------------------------------------------------------------------------------
-- Dados de domínio
------------------------------------------------------------------------------

INSERT INTO regiao VALUES
    (1, 'Norte'), (2, 'Nordeste'), (3, 'Sudeste'), (4, 'Sul'), (5, 'Centro-Oeste');

INSERT INTO uf VALUES
    (11, 'RO', 'Rondônia', 1), (12, 'AC', 'Acre', 1), (13, 'AM', 'Amazonas', 1),
    (14, 'RR', 'Roraima', 1), (15, 'PA', 'Pará', 1), (16, 'AP', 'Amapá', 1),
    (17, 'TO', 'Tocantins', 1),
    (21, 'MA', 'Maranhão', 2), (22, 'PI', 'Piauí', 2), (23, 'CE', 'Ceará', 2),
    (24, 'RN', 'Rio Grande do Norte', 2), (25, 'PB', 'Paraíba', 2),
    (26, 'PE', 'Pernambuco', 2), (27, 'AL', 'Alagoas', 2), (28, 'SE', 'Sergipe', 2),
    (29, 'BA', 'Bahia', 2),
    (31, 'MG', 'Minas Gerais', 3), (32, 'ES', 'Espírito Santo', 3),
    (33, 'RJ', 'Rio de Janeiro', 3), (35, 'SP', 'São Paulo', 3),
    (41, 'PR', 'Paraná', 4), (42, 'SC', 'Santa Catarina', 4),
    (43, 'RS', 'Rio Grande do Sul', 4),
    (50, 'MS', 'Mato Grosso do Sul', 5), (51, 'MT', 'Mato Grosso', 5),
    (52, 'GO', 'Goiás', 5), (53, 'DF', 'Distrito Federal', 5);

INSERT INTO bioma VALUES
    (1, 'Amazônia'), (2, 'Caatinga'), (3, 'Cerrado'),
    (4, 'Mata Atlântica'), (5, 'Pampa'), (6, 'Pantanal');

INSERT INTO motivo_coleta VALUES
    (1, 'Rotina'), (2, 'Denúncia'), (3, 'Desastre'), (4, 'Surto');

INSERT INTO parametro_agua VALUES
    (1, 'Turbidez', 'uT', 'fisico-quimico'),
    (2, 'Escherichia coli', NULL, 'microbiologico'),
    (3, 'Coliformes totais', NULL, 'microbiologico'),
    (4, 'Cloro residual livre', 'mg/L', 'fisico-quimico'),
    (5, 'pH', NULL, 'fisico-quimico'),
    (6, 'Cor aparente', 'uH', 'fisico-quimico'),
    (7, 'Fluoreto', 'mg/L', 'fisico-quimico'),
    (8, 'Bactérias heterotróficas', 'UFC/mL', 'microbiologico'),
    (9, 'Dióxido de cloro', 'mg/L', 'fisico-quimico'),
    (10, 'Cloro residual combinado', 'mg/L', 'fisico-quimico');

INSERT INTO parametro_agua_nome VALUES
    ('Turbidez (uT)', 1),
    ('Escherichia coli', 2),
    ('Coliformes totais', 3),
    ('Cloro residual livre (mg/L)', 4),
    ('Cloro Residual Livre (mg/L)', 4),
    ('pH', 5),
    ('Cor Aparente (uH)', 6),
    ('Cor (uH)', 6),
    ('Fluoreto (mg/L)', 7),
    ('Bactérias Heterotróficas', 8),
    ('Bactérias Heterotróficas (UFC/mL)', 8),
    ('Dióxido de Cloro (mg/L)', 9),
    ('Dióxido de Cloro', 9),
    ('Cloro residual combinado (mg/L)', 10),
    ('Cloro Residual Combinado (mg/L)', 10);

INSERT INTO poluente VALUES
    ('co', 'Monóxido de carbono', 'ppm'),
    ('no2', 'Dióxido de nitrogênio', 'µg/m³'),
    ('o3', 'Ozônio', 'µg/m³'),
    ('pm10', 'Material particulado (PM10)', 'µg/m³'),
    ('pm25', 'Material particulado fino (PM2,5)', 'µg/m³'),
    ('so2', 'Dióxido de enxofre', 'µg/m³');

INSERT INTO tipo_cruzamento VALUES
    ('car', 'Imóvel no Cadastro Ambiental Rural'),
    ('reserva_legal', 'Reserva legal'),
    ('app', 'Área de preservação permanente'),
    ('nascente', 'Nascente'),
    ('embargo', 'Imóvel embargado'),
    ('autorizacao', 'Autorização de supressão'),
    ('terra_indigena', 'Terra indígena'),
    ('unidade_conservacao', 'Unidade de conservação'),
    ('assentamento', 'Assentamento'),
    ('quilombo', 'Território quilombola');

INSERT INTO fonte VALUES
    ('agua', 'SISAGUA', 'Ministério da Saúde', 'https://dadosabertos.saude.gov.br'),
    ('ar', 'SISAM', 'INPE', 'https://data.inpe.br/queimadas/sisam'),
    ('queimadas', 'Programa Queimadas', 'INPE',
     'https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/'),
    ('desmatamento', 'MapBiomas Alerta', 'MapBiomas',
     'https://plataforma.alerta.mapbiomas.org');

------------------------------------------------------------------------------
-- Visões
------------------------------------------------------------------------------

-- Município com UF e região, e o código de 6 dígitos usado pelo SISAGUA.
CREATE VIEW vw_municipio AS
SELECT m.codigo_ibge,
       m.codigo_ibge // 10 AS codigo_ibge6,
       m.nome,
       u.sigla AS uf,
       r.nome AS regiao
FROM municipio AS m
JOIN uf AS u ON u.codigo = m.uf_codigo
JOIN regiao AS r ON r.id = u.regiao_id;

-- Faixa de tamanho do alerta, calculada (guardar seria redundante).
CREATE VIEW vw_alerta_faixa AS
SELECT a.*,
       CASE
           WHEN a.area_ha < 1 THEN 'até 1 ha'
           WHEN a.area_ha < 5 THEN '1 a 5 ha'
           WHEN a.area_ha < 10 THEN '5 a 10 ha'
           WHEN a.area_ha < 25 THEN '10 a 25 ha'
           WHEN a.area_ha < 50 THEN '25 a 50 ha'
           WHEN a.area_ha < 100 THEN '50 a 100 ha'
           ELSE '100 ha ou mais'
       END AS faixa
FROM alerta_desmatamento AS a;

------------------------------------------------------------------------------
-- Consultas de uso
------------------------------------------------------------------------------

-- 1. Municípios com mais focos de queimada em 2024.
SELECT m.codigo_ibge,
       m.nome AS municipio,
       u.sigla AS uf,
       r.nome AS regiao,
       count(*) AS focos,
       count(DISTINCT CAST(f.data_hora AS DATE)) AS dias_com_foco
FROM foco_queimada AS f
JOIN municipio AS m ON m.codigo_ibge = f.codigo_ibge
JOIN uf AS u ON u.codigo = m.uf_codigo
JOIN regiao AS r ON r.id = u.regiao_id
WHERE f.data_hora >= TIMESTAMP '2024-01-01'
  AND f.data_hora < TIMESTAMP '2025-01-01'
GROUP BY m.codigo_ibge, m.nome, u.sigla, r.nome
ORDER BY focos DESC
LIMIT 10;

-- 2. Presença de E. coli na água por UF em 2024.
SELECT u.sigla AS uf,
       count(*) AS analises,
       count(*) FILTER (WHERE a.presenca) AS com_presenca,
       round(100.0 * count(*) FILTER (WHERE a.presenca) / count(*), 2) AS pct_presenca,
       count(DISTINCT l.codigo_ibge) AS municipios
FROM analise_vigilancia AS a
JOIN parametro_agua AS p ON p.id = a.parametro_id
JOIN amostra_vigilancia AS s ON s.id = a.amostra_id
JOIN localidade_agua AS l ON l.codigo_sisagua = s.codigo_sisagua
JOIN municipio AS m ON m.codigo_ibge = l.codigo_ibge
JOIN uf AS u ON u.codigo = m.uf_codigo
WHERE p.nome = 'Escherichia coli'
  AND a.presenca IS NOT NULL
  AND s.data_coleta BETWEEN DATE '2024-01-01' AND DATE '2024-12-31'
GROUP BY u.sigla
ORDER BY pct_presenca DESC;

-- 3. PM2,5 por região e mês em 2024, com os municípios-dia acima de
--    15 µg/m³ (limite diário recomendado pela OMS).
SELECT r.nome AS regiao,
       strftime(a.data, '%Y-%m') AS mes,
       round(avg(a.valor), 1) AS media,
       round(max(a.valor), 1) AS maximo,
       count(*) FILTER (WHERE a.valor > 15) AS municipios_dia_acima_oms
FROM medicao_ar AS a
JOIN municipio AS m ON m.codigo_ibge = a.codigo_ibge
JOIN uf AS u ON u.codigo = m.uf_codigo
JOIN regiao AS r ON r.id = u.regiao_id
WHERE a.poluente = 'pm25'
  AND a.data >= DATE '2024-01-01'
  AND a.data < DATE '2025-01-01'
GROUP BY r.nome, strftime(a.data, '%Y-%m')
ORDER BY regiao, mes;

-- 4. Área de alertas por bioma e ano, separando os que atingem terra indígena.
SELECT b.nome AS bioma,
       year(a.detectado_em) AS ano,
       count(*) AS alertas,
       round(sum(a.area_municipio_ha), 1) AS area_ha,
       round(coalesce(sum(a.area_municipio_ha) FILTER (WHERE c.cruzamento IS NOT NULL), 0), 1)
           AS area_com_terra_indigena_ha
FROM alerta_desmatamento AS a
JOIN bioma AS b ON b.id = a.bioma_id
LEFT JOIN alerta_cruzamento AS c
       ON c.alerta_codigo = a.codigo AND c.cruzamento = 'terra_indigena'
GROUP BY b.nome, year(a.detectado_em)
ORDER BY bioma, ano;

-- 5. Painel dos municípios do Pará em 2024: as quatro fontes lado a lado.
WITH agua AS (
    SELECT l.codigo_ibge, count(*) AS analises
    FROM analise_vigilancia AS a
    JOIN amostra_vigilancia AS s ON s.id = a.amostra_id
    JOIN localidade_agua AS l ON l.codigo_sisagua = s.codigo_sisagua
    WHERE year(s.data_coleta) = 2024
    GROUP BY l.codigo_ibge
),
pm25 AS (
    SELECT codigo_ibge, avg(valor) AS media
    FROM medicao_ar
    WHERE poluente = 'pm25' AND year(data) = 2024
    GROUP BY codigo_ibge
),
focos AS (
    SELECT codigo_ibge, count(*) AS focos
    FROM foco_queimada
    WHERE year(data_hora) = 2024
    GROUP BY codigo_ibge
),
alertas AS (
    SELECT codigo_ibge, count(*) AS alertas, sum(area_municipio_ha) AS area_ha
    FROM alerta_desmatamento
    WHERE year(detectado_em) = 2024
    GROUP BY codigo_ibge
)
SELECT m.codigo_ibge,
       m.nome AS municipio,
       coalesce(agua.analises, 0) AS analises_agua,
       round(pm25.media, 1) AS pm25_media,
       coalesce(focos.focos, 0) AS focos,
       coalesce(alertas.alertas, 0) AS alertas,
       round(coalesce(alertas.area_ha, 0), 1) AS area_desmatada_ha
FROM municipio AS m
JOIN uf AS u ON u.codigo = m.uf_codigo
LEFT JOIN agua ON agua.codigo_ibge = m.codigo_ibge
LEFT JOIN pm25 ON pm25.codigo_ibge = m.codigo_ibge
LEFT JOIN focos ON focos.codigo_ibge = m.codigo_ibge
LEFT JOIN alertas ON alertas.codigo_ibge = m.codigo_ibge
WHERE u.sigla = 'PA'
ORDER BY area_desmatada_ha DESC, focos DESC;

-- 6. Amostras fora do padrão em São Paulo em 2024, por prestador e parâmetro.
SELECT coalesce(i.sigla, i.nome, 'Não informado') AS instituicao,
       p.nome AS parametro,
       count(*) AS amostras,
       count(DISTINCT l.codigo_ibge) AS municipios,
       round(100.0 * count(*) FILTER (WHERE f.zona = 'Rural') / count(*), 1) AS pct_rural
FROM amostra_fora_padrao AS f
JOIN parametro_agua AS p ON p.id = f.parametro_id
JOIN localidade_agua AS l ON l.codigo_sisagua = f.codigo_sisagua
JOIN municipio AS m ON m.codigo_ibge = l.codigo_ibge
JOIN uf AS u ON u.codigo = m.uf_codigo
LEFT JOIN instituicao AS i ON i.id = f.instituicao_id
WHERE f.ano = 2024 AND u.sigla = 'SP'
GROUP BY coalesce(i.sigla, i.nome, 'Não informado'), p.nome
HAVING count(*) >= 100
ORDER BY amostras DESC;

-- 7. Municípios com fogo e desmatamento no mesmo ano: os 10 com mais área
--    desmatada em 2024.
WITH focos AS (
    SELECT codigo_ibge, year(data_hora) AS ano, count(*) AS focos
    FROM foco_queimada
    GROUP BY codigo_ibge, year(data_hora)
),
alertas AS (
    SELECT codigo_ibge, year(detectado_em) AS ano,
           count(*) AS alertas, sum(area_municipio_ha) AS area_ha
    FROM alerta_desmatamento
    GROUP BY codigo_ibge, year(detectado_em)
)
SELECT m.nome AS municipio,
       u.sigla AS uf,
       a.alertas,
       round(a.area_ha, 1) AS area_desmatada_ha,
       f.focos
FROM alertas AS a
JOIN focos AS f ON f.codigo_ibge = a.codigo_ibge AND f.ano = a.ano
JOIN municipio AS m ON m.codigo_ibge = a.codigo_ibge
JOIN uf AS u ON u.codigo = m.uf_codigo
WHERE a.ano = 2024
ORDER BY a.area_ha DESC
LIMIT 10;
