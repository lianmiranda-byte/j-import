# J-Iports · Oficina Mecânica

Sistema local para ordens de serviço, clientes, veículos e acompanhamento dos reparos. A interface usa grafite/preto, vermelho de destaque e branco para transmitir um visual automotivo forte, mantendo contraste e leitura confortável.

## Preparar

Instale uma versão LTS recente do Node.js. Na pasta `Documentos\j_imports`, abra o terminal e execute:

```powershell
npm install
```

## Abrir no computador

Depois de instalar as dependências, dê dois cliques em **Abrir J-Iports.bat** ou execute:

```powershell
npm run desktop
```

Isso abre uma janela de aplicativo para computador. O banco SQLite da versão desktop fica no diretório de dados de usuário do aplicativo no Windows.

Para gerar o executável portátil e colocá-lo na Área de Trabalho, execute:

```powershell
npm run build:desktop
```

O executável também fica em `release\portable`. Para gerar um instalador tradicional do Windows, use `npm run build:installer`; o instalador cria um atalho na Área de Trabalho e no menu Iniciar.

## Usar no navegador local

```powershell
npm start
```

Abra `http://127.0.0.1:3130`. Nesta modalidade, o banco fica na pasta `data\j-iports.sqlite`.

## Dados e cópia de segurança

Os registros são salvos em SQLite local; a aplicação não envia dados para um serviço externo. Use **Exportar cópia de segurança** no menu para baixar as ordens em JSON. Mantenha esse arquivo protegido, pois contém dados de clientes.

## Interface e referências

A paleta escolhida combina grafite/preto com vermelho e branco: o Canva descreve o vermelho como uma cor de alta intensidade e emoções fortes, usada aqui com moderação para ações e alertas, enquanto o grafite dá uma base sóbria. O contraste claro da área de trabalho prioriza a leitura prolongada.

Consultei também a página de [fluxo de trabalho da Shopmonkey](https://www.shopmonkey.io/product/workflow), que destaca quadro de etapas, cartões de serviço e visão rápida do andamento. O J-Iports segue esses padrões gerais de usabilidade com implementação e identidade visual próprias.

Referências de cor: [Canva — vermelho](https://www.canva.com/colors/color-meanings/red/) e [Canva — preto](https://www.canva.com/colors/color-meanings/black/).

## Testes

```powershell
npm test
```
