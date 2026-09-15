# 🏐 Placar de Vôlei Online (Tempo Real)

Placar eletrônico moderno para partidas de vôlei com sincronização em tempo real via **WebSockets (Socket.io)**, cronômetro oficial, controle de sets, pedidos de tempo técnico (30s) e efeitos sonoros gerados por sintetizador Web Audio.

Pronto para rodar localmente, versionar no **GitHub** e hospedar no **Railway**.

---

## ✨ Funcionalidades

- 🔵 **Lado A (Azul)** e 🔴 **Lado B (Vermelho)** com tema escuro de arena esportiva e efeitos luminosos (LED / Glow).
- ⏱️ **Cronômetro da Partida**: Iniciar, pausar e zerar com sincronização precisa em todos os dispositivos conectados.
- 📺 **Modo Telão / Visualizador (`/`)**: Interface gigante e limpa para TVs, projetores, telões de ginásio ou overlays de transmissão (OBS Studio).
- ⚙️ **Mesa de Controle (`/control`)**: Interface prática para o mesário ou árbitro com botões grandes de toque para celular/tablet e atalhos de teclado.
- 🏐 **Indicador de Saque**: Marca visualmente quem está na posse de saque e transfere automaticamente ao pontuar.
- ⇄ **Inversão de Lados**: Troca as equipes de quadra na tela mantendo cores e pontuações intactas.
- ⏱️ **Pedidos de Tempo (Timeouts)**: 2 pedidos por set para cada equipe com contagem regressiva de 30 segundos em tela cheia.
- 🏆 **Regras Oficiais de Vôlei**:
  - Sets até 25 pontos com exigência de 2 pontos de vantagem.
  - Tie-break configurado automaticamente até 15 pontos.
  - Detecção automática de **SET POINT** e **MATCH POINT**.
  - Suporte a partidas em **Melhor de 5** ou **Melhor de 3 sets**.
- 🔊 **Efeitos Sonoros Integrados (Web Audio API)**:
  - Apito de árbitro realista (frequência dupla Fox 40).
  - Buzina de estádio para encerramento de tempos e sets.
  - Sem necessidade de download de arquivos MP3 pesados.

---

## ⌨️ Atalhos de Teclado (na Mesa de Controle)

- `1`: Adicionar +1 ponto para o **Time A**
- `2`: Adicionar +1 ponto para o **Time B**
- `Espaço`: Iniciar / Pausar o **Cronômetro**
- `T`: **Inverter lados** da quadra

---

## 🚀 Como Rodar Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) instalado (versão 18 ou superior).

### Passo a passo
1. Instale as dependências:
   ```bash
   npm install
   ```
2. Inicie o servidor:
   ```bash
   npm start
   ```
3. Acesse no navegador:
   - **Telão / Placar Principal:** [http://localhost:3000](http://localhost:3000)
   - **Mesa de Controle (Celular/PC):** [http://localhost:3000/control](http://localhost:3000/control)

---

## ☁️ Como Hospedar no Railway

O projeto já está configurado com `PORT = process.env.PORT || 3000` e scripts prontos para deploy automático no **Railway**:

1. **Suba o código para o seu GitHub:**
   ```bash
   git add .
   git commit -m "feat: placar de volei online em tempo real"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
   git push -u origin main
   ```
2. **Acesse o Railway:**
   - Entre em [railway.app](https://railway.app/) e faça login com seu GitHub.
   - Clique em **New Project** > **Deploy from GitHub repo**.
   - Selecione o repositório deste projeto.
3. **Gerar o Domínio Público:**
   - No painel do seu projeto no Railway, clique no serviço criado.
   - Vá na aba **Settings** > **Networking** > **Generate Domain**.
   - Pronto! Seu placar estará online no mundo todo em um link como `https://seu-placar.up.railway.app`.

---

## 📱 Utilização em Jogos Reais
- **No Ginásio / Quadra:** Abra o link principal (`/`) na Smart TV, projetor ou notebook conectado via HDMI.
- **No Celular do Árbitro:** Abra o link `/control` no celular para pontuar e controlar o cronômetro sem sair da beira da quadra.
