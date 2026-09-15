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
  - Botão **▶ Iniciar / ⏸ Pausar** que **toca apito oficial de árbitro** ao ser iniciado!
  - Botão **↺ Reiniciar** (zera o tempo).
- 🏁 **Encerrar Partida & Histórico de Resultados**:
  - Botão para finalizar a partida atual com apito final.
  - Salva automaticamente no **Histórico de Partidas**: número da partida, horário, duração total, placar final e vencedor com troféu 🏆.
  - Prepara o placar e cronômetro para o início do próximo jogo.
  - Botão para limpar o histórico quando desejar.
- ⚠️ **Zerar Placar Atual**:
  - Reseta os pontos sem gravar no histórico.
- ⚡ **Sincronização em Tempo Real**:
  - Sincronização automática via WebSockets (Socket.io) entre todos os celulares ou computadores conectados.

---

## ⌨️ Atalhos de Teclado

- `1` ou `A`: +1 Ponto para o **Lado A (Azul)**
- `2` ou `B`: +1 Ponto para o **Lado B (Vermelho)**
- `Espaço`: Iniciar / Pausar o **Cronômetro** (com apito)

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
