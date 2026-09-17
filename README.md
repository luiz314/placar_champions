# 🏐 Placar de Vôlei Online (Multi-Sessões & Tempo Real)

Aplicação web moderna, ultrarrápida e em tempo real para controle de placar de vôlei. Permite criar sessões isoladas com códigos de 6 dígitos para que um árbitro no celular controle o placar e uma Smart TV / telão exiba simultaneamente!

---

## ✨ Novas Funcionalidades

- 🔢 **Sessões Isoladas com Código de 6 Dígitos**:
  - Crie salas instantaneamente (ex: `839 214`).
  - Qualquer pessoa pode entrar digitando os 6 dígitos ou acessando o link direto.
  - Cada partida tem placar, cronômetro e histórico 100% isolados no servidor.
- 🔒 **Proteção Opcional por Senha**:
  - Ao criar uma nova sala, o anfitrião pode optar por definir uma senha de segurança.
  - Impede que pessoas não autorizadas com o link ou código acessem ou alterem o placar.
  - Indicador de cadeado na sala e aviso automático no modal de compartilhamento.
- 📲 **Conexão Rápida com QR Code & Link**:
  - Botão **"Conectar Aparelho"** gera um QR Code nítido e botão de copiar link com um toque.
  - Aponte a câmera do celular ou da Smart TV para sincronizar na mesma hora.
- 📺 **Modo Telão / Smart TV**:
  - Oculta botões de edição e maximiza os números para até 15rem, perfeito para visualização a grandes distâncias em TVs, projetores ou tablets na quadra.
- 💰 **Estrutura de Monetização Integrada**:
  - **Banner de Patrocínio / AdSense**: Espaço elegante reservado para anúncios do Google AdSense ou patrocínios de arenas locais e campeonatos.
  - **Planos PRO & Arenas**: Modal explicativo pronto para vendas de licenças premium (Telão limpo sem anúncios, Overlay transparente para transmissões OBS no YouTube/Twitch, Logo da arena e Súmula Digital).
- 🔵 **Lado A (Azul)** & 🔴 **Lado B (Vermelho)**:
  - Pontuação gigante estilo LED esportivo.
  - Botões **▲ +1 PONTO** e **▼ -1 Ponto** (ou toque direto no número).
  - Nomes das equipes editáveis diretamente na tela.
- ⏱️ **Cronômetro com Som de Apito**:
  - Sincronizado no servidor por sala.
  - Botão **▶ Iniciar / ⏸ Pausar** com som oficial de apito de árbitro.
  - Botão **↺ Reiniciar** (zera o tempo).
  - Botão **🏁 Encerrar Partida** (salva no histórico da sala e prepara o próximo jogo).
  - Botão **⚠️ Zerar Placar**.
- 📜 **Histórico das Partidas**: Salva placares, vencedores com troféu 🏆 e duração de cada partida na sala.
- 💡 **Tela Sempre Ativa (Screen Wake Lock API)**: Impede que o celular ou tablet apague ou bloqueie a tela durante os jogos.
- 🔊 **Efeitos Sonoros Web Audio API**: Apitos e bips nítidos e leves, com opção de Mudo no menu.

---

## ⌨️ Atalhos de Teclado

- `1` ou `A`: +1 Ponto para o **Lado A (Azul)**
- `2` ou `B`: +1 Ponto para o **Lado B (Vermelho)**
- `Espaço`: Iniciar / Pausar o **Cronômetro** (com apito)
- `T`: Alternar **Modo Telão / Smart TV**
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

## ☁️ Deploy no Railway & GitHub

- **Repositório GitHub:** [https://github.com/luiz314/placar_champions](https://github.com/luiz314/placar_champions)
- Conecte o repositório no [railway.app](https://railway.app/) para deploy automático em nuvem.
