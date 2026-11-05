# Front do elementar

```
npm install
npm run dev     # http://localhost:5173, repassa a API de http://127.0.0.1:8000
npm run build   # gera src/elementar/web, servido pela API em http://127.0.0.1:8000/
```

O comando `uv run elementar-api` inicia a API que será usado com `npm run dev`.

A malha dos estados fica em `src/dados/ufs.topo.json`; a dos municípios é buscada na API de malhas do IBGE quando a página do estado é aberta.

