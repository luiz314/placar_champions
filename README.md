# 🏐 Placar de Vôlei Online

Aplicação web direta, moderna e em tempo real para controle de placar de vôlei.
Hospedada no **Railway** e sincronizada no **GitHub**.

---

## ✨ Funcionalidades

- 🔵 **Lado A (Azul)**:
  - Pontuação gigante estilo LED esportivo.
  - Botões **▲ +1 PONTO** e **▼ -1 Ponto** (ou clique direto no número).
  - Nome editável diretamente na tela.
- 🔴 **Lado B (Vermelho)**:
  - Pontuação gigante estilo LED esportivo.
  - Botões **▲ +1 PONTO** e **▼ -1 Ponto** (ou clique direto no número).
  - Nome editável diretamente na tela.
- ⏱️ **Cronômetro com Som de Apito**:
  - Exibição de minutos e segundos (`MM:SS`).
  - Botão **▶ Iniciar / ⏸ Pausar** que toca apito oficial de árbitro ao ser iniciado!
  - Botão **↺ Reiniciar** (zera o tempo).
  - Botão **🏁 Encerrar Partida** (salva o placar final e prepara o próximo jogo).
  - Botão **⚠️ Zerar Placar** (zera a contagem atual).
- ☰ **Menu Superior Dropdown**:
  - 📜 **Histórico das Partidas**: Abre uma janela modal moderna com a listagem de todos os jogos anteriores, duração, placar e vencedor com troféu 🏆.
  - 🔊 **Som (Ativado / Mudo)**: Controle com um clique para silenciar ou ativar todos os efeitos sonoros.
  - ⛶ **Tela Cheia**: Expande o placar para exibição em TVs e telões.
- 📱 **100% Touch-Friendly (Tablets & Smartphones)**:
  - Botões grandes com áreas de toque ampliadas e sem atraso de toque (*zero tap lag* com `touch-action: manipulation`).
  - Toque direto no número gigante do placar para somar pontos.
  - Feedback tátil com vibração instantânea nos aparelhos móveis compatíveis.
  - Interface responsiva limpa sem barras ou legendas desnecessárias no rodapé.
- ⚡ **Sincronização em Tempo Real**:
  - Sincronização automática via WebSockets (Socket.io) entre todos os celulares ou computadores conectados.

---

## ⌨️ Atalhos de Teclado

- `1` ou `A`: +1 Ponto para o **Lado A (Azul)**
- `2` ou `B`: +1 Ponto para o **Lado B (Vermelho)**
- `Espaço`: Iniciar / Pausar o **Cronômetro** (com apito)
- `F`: Alternar **Tela Cheia**
- `H`: Abrir / Fechar **Histórico de Partidas**
- `Esc`: Fechar Janelas e Menus abertos

---

## 🚀 Como Rodar Localmente

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Inicie o servidor:
   ```bash
   npm start
   ```
3. Abra no navegador: [http://localhost:3000](http://localhost:3000)

---

## ☁️ Repositório & Deploy no Railway

- **Repositório GitHub:** [https://github.com/luiz314/placar_champions](https://github.com/luiz314/placar_champions)
- Conecte o repositório no [railway.app](https://railway.app/) para deploy automático em nuvem com zero-config.
