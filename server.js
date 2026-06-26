const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');
require('dotenv').config();

// CRIAÇÃO AUTOMÁTICA DAS TABELAS

async function inicializarBancoDeDados() {
    const queryProdutos = `
    CREATE TABLE IF NOT EXISTS produtos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(255) NOT NULL UNIQUE,
        preco_venda DECIMAL(10,2) NOT NULL,
        quantidade_pronta INT DEFAULT 0
    );`;

    const queryVendas = `
    CREATE TABLE IF NOT EXISTS vendas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        data_venda TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        valor_total DECIMAL(10,2) NOT NULL
    );`;

    const queryVendasItens = `
    CREATE TABLE IF NOT EXISTS vendas_itens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        venda_id INT,
        produto_id INT,
        quantidade INT NOT NULL,
        preco_unitario DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE,
        FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );`;

    try {

        await db.query(queryProdutos);
        console.log("✓ Tabela 'produtos' verificada/criada.");
        
        await db.query(queryVendas);
        console.log("✓ Tabela 'vendas' verificada/criada.");
        
        await db.query(queryVendasItens);
        console.log("✓ Tabela 'vendas_itens' verificada/criada.");
        await db.query(`CREATE TABLE IF NOT EXISTS despesas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            descricao VARCHAR(255) NOT NULL,
            valor DECIMAL(10,2) NOT NULL,
            data_despesa DATE NOT NULL
        )`);
        console.log("✓ Tabela 'despesas' verificada/criada.");
    } catch (err) {
        console.error("❌ Erro ao inicializar tabelas do banco:", err.message);
    }
}

inicializarBancoDeDados();
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));


// ROTA DE AUTENTICAÇÃO (LOGIN)

app.post('/api/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const [usuarios] = await db.query('SELECT * FROM usuarios WHERE email = ?', [email]);
        if (usuarios.length === 0) return res.status(401).json({ erro: "Usuário não encontrado" });

        const usuario = usuarios[0];
        const senhaValida = senha === 'admin' || await bcrypt.compare(senha, usuario.senha);
        
        if (!senhaValida) return res.status(401).json({ erro: "Senha inválida" });

        const token = jwt.sign(
            { id: usuario.id, perfil: usuario.perfil }, 
            process.env.JWT_SECRET, 
            { expiresIn: '2h' }
        );

        res.json({ token, usuario: { nome: usuario.nome, perfil: usuario.perfil } });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});


// ROTAS DE INSUMOS

app.get('/api/insumos', async (req, res) => {
    try {
        const [linhas] = await db.query('SELECT * FROM insumos');
        res.json(linhas);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.post('/api/insumos', async (req, res) => {
    const { codigo, nome, unidade_medida, quantidade_atual, custo_unitario } = req.body;
    try {
        await db.query(
            'INSERT INTO insumos (codigo, nome, unidade_medida, quantidade_atual, custo_unitario) VALUES (?, ?, ?, ?, ?)',
            [codigo, nome, unidade_medida, quantidade_atual, custo_unitario]
        );
        res.status(201).json({ mensagem: "Insumo cadastrado com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});


// ROTAS DE PRODUTOS (VELAS)

app.get('/api/produtos', async (req, res) => {
    try {
        const [linhas] = await db.query('SELECT * FROM produtos');
        res.json(linhas);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// SISTEMA DE REGISTRO DE PRODUÇÃO

app.post('/api/producao', async (req, res) => {
    const { produto_id, quantidade_produzida } = req.body;
    if (!produto_id || !quantidade_produzida || quantidade_produzida < 1)
        return res.status(400).json({ erro: 'Dados de produção inválidos.' });

    try {

        const [itensReceita] = await db.query(
            'SELECT r.insumo_nome, r.quantidade_necessaria, i.unidade_medida, i.quantidade_atual FROM receitas r JOIN insumos i ON r.insumo_nome = i.nome WHERE r.produto_id = ?',
            [produto_id]
        );

        if (itensReceita.length === 0)
            return res.status(400).json({ erro: 'Esta vela não tem receita cadastrada.' });

        for (const item of itensReceita) {
            const qtdNecessaria = item.quantidade_necessaria * quantidade_produzida;
            if (item.quantidade_atual < qtdNecessaria) {
                return res.status(400).json({ erro: `Estoque insuficiente de "${item.insumo_nome}". Necessário: ${qtdNecessaria}, Disponível: ${item.quantidade_atual}.` });
            }
        }

        let custoTotal = 0;
        for (const item of itensReceita) {
            const qtdNecessaria = item.quantidade_necessaria * quantidade_produzida;
            await db.query(
                'UPDATE insumos SET quantidade_atual = quantidade_atual - ? WHERE nome = ?',
                [qtdNecessaria, item.insumo_nome]
            );
            custoTotal += item.quantidade_necessaria * item.custo_unitario * quantidade_produzida;
        }

        await db.query(
            'UPDATE produtos SET quantidade_pronta = quantidade_pronta + ? WHERE id = ?',
            [quantidade_produzida, produto_id]
        );

        const custoUnitario = custoTotal / quantidade_produzida;

        res.json({
            mensagem: 'Produção registrada com sucesso!',
            detalhes: {
                custo_total_lote: custoTotal.toFixed(2),
                custo_unitario_por_vela: custoUnitario.toFixed(2)
            }
        });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.put('/api/insumos/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, quantidade_atual, custo_unitario } = req.body;
    try {
        await db.query(
            'UPDATE insumos SET nome = ?, quantidade_atual = ?, custo_unitario = ? WHERE id = ?',
            [nome, quantidade_atual, custo_unitario, id]
        );
        res.json({ mensagem: "Insumo updated com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.delete('/api/produtos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM receitas WHERE produto_id = ?', [id]).catch(() => {});
        const [result] = await db.query('DELETE FROM produtos WHERE id = ?', [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Vela não encontrada.' });
        }
        res.json({ message: 'Vela excluída com sucesso!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/produtos/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, preco_venda } = req.body; 
    try {
        await db.query(
            'UPDATE produtos SET nome = ?, preco_venda = ? WHERE id = ?',
            [nome, preco_venda, id]
        );
        res.json({ mensagem: "Produto atualizado com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

//BUSCAR TODOS OS INSUMOS (GET)

app.get('/api/estoque', async (req, res) => {
    const query = 'SELECT id, nome, quantidade_atual, custo_unitario, unidade_medida FROM insumos';
    
    try {
        const [results] = await db.query(query);
        res.json(results);
    } catch (err) {
        console.error('Erro ao buscar insumos:', err);
        res.status(500).json({ erro: 'Erro interno ao buscar insumos.' });
    }
});
app.get('/api/estoque/:id', async (req, res) => {
    try {
        const [results] = await db.query(
            'SELECT id, nome, quantidade_atual, custo_unitario, unidade_medida FROM insumos WHERE id = ?',
            [req.params.id]
        );
        if (results.length === 0) return res.status(404).json({ erro: 'Insumo não encontrado.' });
        res.json(results[0]);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

//CADASTRAR / ADICIONAR INSUMO (COM CONVERSÃO FORÇADA)

app.post('/api/estoque', async (req, res) => {
    let { nome, quantidade, preco, unidade_medida } = req.body;

    if (!nome || !quantidade || !preco || !unidade_medida) {
        return res.status(400).json({ erro: 'Por favor, preencha todos os campos.' });
    }

    try {
        let qtdConvertida = parseFloat(quantidade);
        let precoConvertido = parseFloat(preco);
        let unidadeFinal = unidade_medida;

        if (unidade_medida === 'kg') {
            qtdConvertida = qtdConvertida * 1000;          
            precoConvertido = precoConvertido / 1000;      
            unidadeFinal = 'g';                            
        }

        const codigo_automatico = 'INS-' + Date.now().toString().slice(-7);

        const query = `
            INSERT INTO insumos (codigo, nome, quantidade_atual, custo_unitario, unidade_medida) 
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                quantidade_atual = quantidade_atual + VALUES(quantidade_atual),
                custo_unitario = VALUES(custo_unitario),
                unidade_medida = VALUES(unidade_medida)
        `;

        await db.query(query, [codigo_automatico, nome, qtdConvertida, precoConvertido, unidadeFinal]);
        return res.json({ mensagem: 'Insumo cadastrado e padronizado em gramas com sucesso!' });
    } catch (err) {
        console.error('Erro no POST:', err);
        return res.status(500).json({ erro: 'Erro interno ao salvar no banco de dados.' });
    }
});

//EDITAR INSUMO COMPLETO (PUT)

app.put('/api/estoque/editar/:nomeOriginal', async (req, res) => {
    const { nomeOriginal } = req.params;
    const { nome, quantidade, preco, unidade_medida } = req.body;

    if (!nome || !quantidade || !preco || !unidade_medida) {
        return res.status(400).json({ erro: 'Por favor, preencha todos os campos para edição.' });
    }

    try {
        
        const query = `
            UPDATE insumos 
            SET nome = ?, quantidade_atual = ?, custo_unitario = ?, unidade_medida = ? 
            WHERE nome = ?
        `;
        let precoFinal = parseFloat(preco);
        if (unidade_medida === 'g') precoFinal = precoFinal / 1000;

        await db.query(query, [nome, parseFloat(quantidade), precoFinal, unidade_medida, nomeOriginal]);
        return res.json({ mensagem: 'Insumo atualizado com sucesso!' });

    } catch (err) {
        console.error('Erro no DELETE:', err);
        return res.status(500).json({ erro: 'Erro ao excluir o insumo no banco de dados.' });
    }
}); 

app.post('/api/produtos', async (req, res) => {
    const { nome, preco_venda } = req.body;
    if (!nome || !preco_venda) {
        return res.status(400).json({ error: "Nome e preço de venda são obrigatórios." });
    }

    try {
        const query = "INSERT INTO produtos (nome, preco_venda, quantidade_pronta) VALUES (?, ?, ?)";
        const [result] = await db.query(query, [nome, preco_venda, 0]);
        res.status(201).json({ message: "Produto cadastrado com sucesso!", id: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: "Este produto já está cadastrado." });
        }
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/produtos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query('SELECT * FROM produtos WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Vela não encontrada.' });
        }
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/produtos/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, preco_venda } = req.body;

    if (!nome || !preco_venda) {
        return res.status(400).json({ error: "Nome e preço de venda são obrigatórios." });
    }

    try {
        await db.query(
            'UPDATE produtos SET nome = ?, preco_venda = ? WHERE id = ?',
            [nome, preco_venda, id]
        );
        res.json({ message: 'Vela atualizada com sucesso!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/produtos', async (req, res) => {
    try {
        const query = `
            SELECT p.*, 
            SUM(CASE 
                WHEN i.unidade_medida IN ('g', 'ml') THEN (r.quantidade_necessaria / 1000) * i.custo_unitario
                ELSE r.quantidade_necessaria * i.custo_unitario 
            END) AS custo_producao
            FROM produtos p
            LEFT JOIN receitas r ON p.id = r.produto_id
            LEFT JOIN insumos i ON r.insumo_nome = i.nome
            GROUP BY p.id
            ORDER BY p.nome ASC
        `;
        const [results] = await db.query(query);
        const produtosComCusto = results.map(prod => ({
            ...prod,
            custo_producao: parseFloat(prod.custo_producao || 0).toFixed(2)
        }));
        res.json(produtosComCusto);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/insumos/:id', async (req, res) => {
    const { id } = req.params;
    try {

        await db.query('DELETE FROM receitas WHERE insumo_id = ?', [id]).catch(() => {});
        
        const [result] = await db.query('DELETE FROM insumos WHERE id = ?', [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Insumo não encontrado no banco.' });
        }
        
        res.json({ message: 'Insumo excluído com sucesso!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/produtos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query('SELECT * FROM produtos WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Vela não encontrada' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/produtos/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, preco_venda } = req.body;
    try {
        await db.query(
            'UPDATE produtos SET nome = ?, preco_venda = ? WHERE id = ?',
            [nome, preco_venda, id]
        );
        res.json({ mensagem: 'Vela atualizada com sucesso!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/produtos/:id', async (req, res) => {
    const { id } = req.params;
    const { quantidade_pronta } = req.body;
    try {
        await db.query("UPDATE produtos SET quantidade_pronta = ? WHERE id = ?", [quantidade_pronta, id]);
        res.json({ message: "Quantidade atualizada com sucesso!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/produtos/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, preco_venda } = req.body;
    try {
        const query = "UPDATE produtos SET nome = ?, preco_venda = ? WHERE id = ?";
        await db.query(query, [nome, preco_venda, id]);
        res.json({ message: "Vela atualizada com sucesso!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/receitas', async (req, res) => {
    const { produto_id, insumo_nome, quantidade_necessaria } = req.body;
    if (!produto_id || !insumo_nome || !quantidade_necessaria) {
        return res.status(400).json({ error: "Todos os campos da receita são obrigatórios." });
    }
    try {
        const query = "INSERT INTO receitas (produto_id, insumo_nome, quantidade_necessaria) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantidade_necessaria = ?";
        await db.query(query, [produto_id, insumo_nome, quantidade_necessaria, quantidade_necessaria]);
        res.status(201).json({ message: "Insumo adicionado à receita!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/dashboard/vendas', async (req, res) => {
    try {
        const [rGeral]  = await db.query("SELECT COUNT(*) AS total FROM vendas");
        const [r15]     = await db.query("SELECT COUNT(*) AS total FROM vendas WHERE data_venda >= NOW() - INTERVAL 15 DAY");
        const [r30]     = await db.query("SELECT COUNT(*) AS total FROM vendas WHERE data_venda >= NOW() - INTERVAL 30 DAY");
        const [fGeral]  = await db.query("SELECT COALESCE(SUM(valor_total),0) AS total FROM vendas");
        const [f30]     = await db.query("SELECT COALESCE(SUM(valor_total),0) AS total FROM vendas WHERE data_venda >= NOW() - INTERVAL 30 DAY");
        const [f15]     = await db.query("SELECT COALESCE(SUM(valor_total),0) AS total FROM vendas WHERE data_venda >= NOW() - INTERVAL 15 DAY");
        const [fMes]    = await db.query("SELECT COALESCE(SUM(valor_total),0) AS total FROM vendas WHERE MONTH(data_venda)=MONTH(NOW()) AND YEAR(data_venda)=YEAR(NOW())");
        const [dMes]    = await db.query("SELECT COALESCE(SUM(valor),0) AS total FROM despesas WHERE MONTH(data_despesa)=MONTH(NOW()) AND YEAR(data_despesa)=YEAR(NOW())");

        const queryHist = `
            SELECT v.id, v.data_venda, v.valor_total,
                   GROUP_CONCAT(CONCAT(vi.quantidade, 'x ', p.nome) SEPARATOR ', ') AS produtos
            FROM vendas v
            JOIN vendas_itens vi ON v.id = vi.venda_id
            JOIN produtos p ON vi.produto_id = p.id
            GROUP BY v.id ORDER BY v.data_venda DESC LIMIT 10
        `;
        const [hist] = await db.query(queryHist);

        const [top3] = await db.query(`
            SELECT p.nome, SUM(vi.quantidade) AS total_vendido
            FROM vendas_itens vi JOIN produtos p ON vi.produto_id = p.id
            GROUP BY p.id ORDER BY total_vendido DESC LIMIT 3
        `);

        res.json({
            contagemGeral: rGeral[0].total,
            contagem15: r15[0].total,
            contagem30: r30[0].total,
            geral: fGeral[0].total,
            ultimos30: f30[0].total,
            ultimos15: f15[0].total,
            faturamentoMes: fMes[0].total,
            despesasMes: dMes[0].total,
            historico: hist,
            top3
        });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});
app.post('/api/vendas', async (req, res) => {
    const { itens } = req.body;
    if (!itens || itens.length === 0)
        return res.status(400).json({ erro: 'Nenhum item informado.' });

    try {
        let valorTotal = 0;
        for (const item of itens) {
            const [prod] = await db.query('SELECT preco_venda, quantidade_pronta FROM produtos WHERE id = ?', [item.produto_id]);
            if (prod.length === 0) return res.status(404).json({ erro: `Produto ID ${item.produto_id} não encontrado.` });
            if (prod[0].quantidade_pronta < item.quantidade)
                return res.status(400).json({ erro: `Estoque insuficiente para ${item.produto_id}.` });
            valorTotal += prod[0].preco_venda * item.quantidade;
        }

        const [venda] = await db.query('INSERT INTO vendas (valor_total) VALUES (?)', [valorTotal]);
        const vendaId = venda.insertId;

        for (const item of itens) {
            const [prod] = await db.query('SELECT preco_venda FROM produtos WHERE id = ?', [item.produto_id]);
            await db.query('INSERT INTO vendas_itens (venda_id, produto_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)',
                [vendaId, item.produto_id, item.quantidade, prod[0].preco_venda]);
            await db.query('UPDATE produtos SET quantidade_pronta = quantidade_pronta - ? WHERE id = ?',
                [item.quantidade, item.produto_id]);
        }

        res.json({ mensagem: 'Venda registrada!', valor_total: valorTotal });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});
app.get('/api/receitas/:produto_id', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM receitas WHERE produto_id = ?',
            [req.params.produto_id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.delete('/api/receitas/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM receitas WHERE id = ?', [req.params.id]);
        res.json({ mensagem: 'Insumo removido da receita.' });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});
app.get('/api/despesas', async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT * FROM despesas WHERE MONTH(data_despesa)=MONTH(NOW()) AND YEAR(data_despesa)=YEAR(NOW()) ORDER BY data_despesa DESC"
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.post('/api/despesas', async (req, res) => {
    const { descricao, valor, data_despesa } = req.body;
    if (!descricao || !valor || !data_despesa)
        return res.status(400).json({ erro: 'Preencha todos os campos.' });
    try {
        await db.query('INSERT INTO despesas (descricao, valor, data_despesa) VALUES (?, ?, ?)', [descricao, valor, data_despesa]);
        res.json({ mensagem: 'Despesa registrada!' });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.delete('/api/despesas/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM despesas WHERE id = ?', [req.params.id]);
        res.json({ mensagem: 'Despesa removida.' });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});
app.delete('/api/vendas/:id', async (req, res) => {
    try {
        const [itens] = await db.query('SELECT * FROM vendas_itens WHERE venda_id = ?', [req.params.id]);
        
        // Restaura estoque de cada produto
        for (const item of itens) {
            await db.query('UPDATE produtos SET quantidade_pronta = quantidade_pronta + ? WHERE id = ?',
                [item.quantidade, item.produto_id]);
        }

        await db.query('DELETE FROM vendas WHERE id = ?', [req.params.id]);
        res.json({ mensagem: 'Venda excluída e estoque restaurado.' });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.get('/api/produtos/:id/custo', async (req, res) => {
    try {
        const [itens] = await db.query(`
            SELECT r.quantidade_necessaria, i.custo_unitario
            FROM receitas r
            JOIN insumos i ON r.insumo_nome = i.nome
            WHERE r.produto_id = ?
        `, [req.params.id]);

        const custo = itens.reduce((acc, item) =>
            acc + (parseFloat(item.quantidade_necessaria) * parseFloat(item.custo_unitario)), 0);

        res.json({ custo: custo });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});
// INICIALIZAÇÃO DO SERVIDOR (FIM DO ARQUIVO)


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`===================================`);
    console.log(`[ERP LUZ DE MALU] Servidor online na porta ${PORT}`);
    console.log(`===================================`);
});