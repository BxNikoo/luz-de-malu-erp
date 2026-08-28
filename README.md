# Luz de Malu — Sistema ERP

Sistema de gestão interna desenvolvido para um pequeno negócio de velas artesanais. Permite controlar produtos, insumos, receitas de produção, estoque, vendas e fluxo de caixa.

---

## Funcionalidades

- **Dashboard** — Contagem de vendas (geral, últimos 15 e 30 dias) e histórico recente
- **Produtos & Receitas** — Cadastro de velas com preço de venda, montagem de receitas com insumos e lançamento de produção com baixa automática no estoque
- **Estoque** — Controle de velas prontas e insumos/matérias-primas com cálculo de custo unitário
- **Caixa** — Faturamento, top 3 mais vendidas e registro de despesas mensais
- **Autenticação** — Login com e-mail e senha protegido por JWT e bcrypt

---

## Tecnologias

- **Backend:** Node.js + Express
- **Banco de dados:** MySQL
- **Autenticação:** JWT + bcrypt
- **Frontend:** HTML, CSS e JavaScript puro
- **Deploy:** Railway

---

## Estrutura do Projeto

```
luz-de-malu-erp/
├── public/
│   ├── index.html        # Tela de login
│   ├── style.css         # Estilos da tela de login
│   ├── dashboard.html    # Painel principal
│   └── dashboard.css     # Estilos do painel
├── server.js             # Backend e rotas da API
├── database.js           # Conexão com o MySQL
├── package.json
└── .env                  # Variáveis de ambiente (não sobe pro GitHub)
```

---

## Como rodar localmente

### Pré-requisitos

- Node.js instalado
- MySQL instalado e rodando

### Passo a passo

1. Clone o repositório:
```bash
git clone https://github.com/BxNikoo/luz-de-malu-erp.git
cd luz-de-malu-erp
```

2. Instale as dependências:
```bash
npm install
```

3. Crie um arquivo `.env` na raiz com as seguintes variáveis:
```
DB_HOST=localhost
DB_USER=root
DB_PASS=sua_senha
DB_NAME=luz_de_malu_erp
JWT_SECRET=qualquer_texto_secreto
```

4. Crie o banco de dados no MySQL:
```sql
CREATE DATABASE luz_de_malu_erp;
```

5. Inicie o servidor:
```bash
node server.js
```

6. Acesse no navegador:
```
http://localhost:3000
```

As tabelas são criadas automaticamente na primeira execução.

---

## Deploy

O sistema está hospedado no Railway com banco de dados MySQL gerenciado.

As variáveis de ambiente configuradas no Railway são:

| Variável | Descrição |
|---|---|
| `DB_HOST` | Host do banco MySQL |
| `DB_USER` | Usuário do banco |
| `DB_PASS` | Senha do banco |
| `DB_NAME` | Nome do banco |
| `JWT_SECRET` | Chave secreta para geração de tokens |

---

## Observações

- O arquivo `.env` não deve ser enviado ao GitHub — ele está listado no `.gitignore`
- As tabelas do banco são criadas automaticamente ao iniciar o servidor
- O sistema foi desenvolvido para uso interno em desktop; a adaptação para mobile está planejada para versões futuras

---

## Desenvolvido por

Nicolas Bryan — Curso de Engenharia de Software, Universidade Positivo (UP)
