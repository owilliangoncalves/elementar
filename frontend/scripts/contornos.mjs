// Gera src/dados/contornos.json: o contorno de cada município, já enquadrado
// e simplificado num quadrado de 100 × 100, para os cartões do índice de A a Z.
// Os municípios vêm da malha do IBGE (qualidade intermediária, a mesma do mapa
// da UF); as Regiões Administrativas do DF, da malha do IPEDF que já está no
// projeto, e ficam pela chave do nome.
//
// Uso: node scripts/contornos.mjs
import { geoArea, geoCentroid, geoDistance, geoMercator, geoPath } from 'd3-geo'
import { readFile, writeFile } from 'node:fs/promises'
import { feature } from 'topojson-client'

const LADO = 100
const MALHA_BR =
  'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/json&intrarregiao=municipio&qualidade=intermediaria'

// A mesma chave de nome do MapaUf para casar as RAs do DF: "SOL NASCENTE E
// POR DO SOL" e "SOL NASCENTE/POR DO SOL" viram a mesma chave.
const chaveNome = (nome) =>
  nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p && p !== 'e')
    .join(' ')

// Tolerância da simplificação, em unidades do quadrado de 100: abaixo disso
// o ponto não muda o desenho no tamanho do cartão.
const TOLERANCIA = 1.1

// Só entram no enquadramento as partes perto da maior (até algumas vezes o
// "raio" dela): ilhas oceânicas distantes, como Trindade e Martim Vaz em
// Vitória, encolheriam o continente até virar um ponto.
const VIZINHANCA = 4

function contorno(f) {
  const partes =
    f.geometry.type === 'MultiPolygon'
      ? f.geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }))
      : [f.geometry]
  const maior = partes.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a))
  const centro = geoCentroid(maior)
  const raio = Math.max(...maior.coordinates[0].map((ponto) => geoDistance(centro, ponto)))
  const vizinhas = partes.filter((p) => geoDistance(centro, geoCentroid(p)) <= raio * VIZINHANCA)
  const projecao = geoMercator().fitExtent(
    [
      [2, 2],
      [LADO - 2, LADO - 2],
    ],
    { type: 'GeometryCollection', geometries: vizinhas },
  )
  const aneis = []
  const desenhar = geoPath(projecao, {
    moveTo: (x, y) => aneis.push([[x, y]]),
    lineTo: (x, y) => aneis.at(-1).push([x, y]),
    closePath: () => {},
  })
  for (const p of vizinhas) desenhar(p)
  return relativo(
    aneis
      .map((anel) => simplificar(anel, TOLERANCIA).map(([x, y]) => [Math.round(x), Math.round(y)]))
      .filter((anel) => anel.length >= 3),
  )
}

// Douglas–Peucker: mantém só os pontos que se afastam mais que a tolerância
// da reta entre os vizinhos que ficaram.
function simplificar(pontos, tolerancia) {
  if (pontos.length < 4) return pontos
  const manter = new Uint8Array(pontos.length)
  manter[0] = manter[pontos.length - 1] = 1
  const pilha = [[0, pontos.length - 1]]
  while (pilha.length) {
    const [a, b] = pilha.pop()
    const [ax, ay] = pontos[a]
    const [bx, by] = pontos[b]
    const comprimento = Math.hypot(bx - ax, by - ay) || 1
    let maior = 0
    let indice = -1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pontos[i]
      const distancia = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / comprimento
      if (distancia > maior) [maior, indice] = [distancia, i]
    }
    if (maior > tolerancia) {
      manter[indice] = 1
      pilha.push([a, indice], [indice, b])
    }
  }
  return pontos.filter((_, i) => manter[i])
}

// Escreve os anéis com deslocamentos relativos (m, l), que são números menores,
// e descarta pontos repetidos: o arquivo fica bem mais leve.
function relativo(aneis) {
  let saida = ''
  let x = 0
  let y = 0
  for (const anel of aneis) {
    let anterior = ''
    for (const [i, [nx, ny]] of anel.entries()) {
      const dx = nx - x
      const dy = ny - y
      if (i > 0 && !dx && !dy) continue
      const par = `${dx}${dy < 0 ? '' : ','}${dy}`
      if (i === 0) saida += `m${par}`
      else saida += anterior === 'l' ? `${par.startsWith('-') ? '' : ' '}${par}` : `l${par}`
      anterior = i === 0 ? 'm' : 'l'
      x = nx
      y = ny
    }
    saida += 'z'
    // Depois do z o ponto atual volta ao começo do anel.
    ;[x, y] = anel[0]
  }
  return saida
}

async function baixar(url, tentativas = 3) {
  for (let i = 1; ; i++) {
    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(120_000) })
      if (!resposta.ok) throw new Error(`Malha do IBGE indisponível (${resposta.status})`)
      return await resposta.json()
    } catch (erro) {
      if (i >= tentativas) throw erro
    }
  }
}

const br = await baixar(MALHA_BR)
const municipios = feature(br, br.objects.BRMU).features

const df = JSON.parse(await readFile(new URL('../src/dados/df-ras.topo.json', import.meta.url)))
const ras = feature(df, df.objects.RAS).features

const contornos = {}
// O código do SISAGUA tem 6 dígitos: o do IBGE sem o verificador.
for (const f of municipios) contornos[f.properties.codarea.slice(0, 6)] = contorno(f)
for (const f of ras) contornos[`DF:${chaveNome(f.properties.nome)}`] = contorno(f)

await writeFile(new URL('../src/dados/contornos.json', import.meta.url), JSON.stringify(contornos))
console.log(`${Object.keys(contornos).length} contornos`)
