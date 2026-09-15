# 🏐 Placar de Vôlei Online

Aplicação web direta, moderna e em tempo real para controle de placar de vôlei.
Construída para ser hospedada no **Railway** e versionada no **GitHub**.

---

## ✨ Funcionalidades

- 🔵 **Lado A (Azul)**:
  - Pontuação gigante estilo LED esportivo.
  - Botão **▲ +1 Ponto** e **▼ -1 Ponto**.
  - Nome editável diretamente na tela.
- 🔴 **Lado B (Vermelho)**:
  - Pontuação gigante estilo LED esportivo.
  - Botão **▲ +1 Ponto** e **▼ -1 Ponto**.
  - Nome editável diretamente na tela.
- ⏱️ **Cronômetro**:
  - Exibição de minutos e segundos (`MM:SS`).
  - Botão **▶ Iniciar / ⏸ Pausar**.
  - Botão **↺ Reiniciar** (zera o tempo).
- ⚠️ **Zerar Placar Geral**:
  - Botão direto para resetar a pontuação de ambas as equipes para `0 x 0`.
- ⚡ **Sincronização em Tempo Real**:
  - Usa WebSockets (Socket.io) para sincronizar instantaneamente entre qualquer celular ou computador conectado.

---

## ⌨️ Atalhos de Teclado

- `1` ou `A`: +1 Ponto para o **Lado A (Azul)**
- `2` ou `B`: +1 Ponto para o **Lado B (Vermelho)**
- `Espaço`: Iniciar / Pausar o **Cronômetro**

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

## ☁️ Como Hospedar no Railway

1. **Suba para o GitHub:**
   ```bash
   git add .
   git commit -m "feat: placar de volei direto com cronometro e reset"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
   git push -u origin main
   ```
2. **Conecte no Railway:**
   - Acesse [railway.app](https://railway.app/).
   - Clique em **New Project** > **Deploy from GitHub repo**.
   - Selecione este repositório.
   - Na aba **Settings** > **Networking**, clique em **Generate Domain**.
   - Pronto! Seu placar estará online em um link seguro `https://seu-placar.up.railway.app`.
