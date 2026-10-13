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

### Variáveis de ambiente

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `DATABASE_URL` | Sim (produção) | Conexão com o PostgreSQL. Sem ela, os dados ficam em `data/db_fallback.json` (somente para desenvolvimento). |
| `GOOGLE_CLIENT_ID` | Não | Ativa o botão "Entrar com Google". Sem ela, o botão não aparece. |
| `SUPER_ADMIN_EMAILS` | Não | E-mails (separados por vírgula) com acesso de administrador a todas as peladas. Padrão: `luix314@gmail.com`. |
| `AUTH_SECRET` | Não | Segredo que assina as sessões de login. Se ausente, um segredo aleatório é gerado e guardado no banco. |

#### Configurar o login com Google

1. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crie uma credencial **ID do cliente OAuth** do tipo **Aplicativo da Web**.
2. Em **Origens JavaScript autorizadas**, adicione o domínio do Railway (ex: `https://seu-app.up.railway.app`) e `http://localhost:3000` para testes locais. Não é preciso URI de redirecionamento.
3. Copie o **ID do cliente** e cadastre-o no Railway como `GOOGLE_CLIENT_ID`.

### Permissões

- **Visitante**: apenas assiste/controla o placar ao vivo.
- **Usuário logado**: avalia jogadores, vota no MVP, confirma presença e pode criar peladas.
- **Criador da pelada**: administra a pelada e pode dar acesso de administrador a outras contas (botão **👥 Admins**).
- **Administrador da pelada**: cadastra, edita e exclui jogadores, renomeia a pelada e gerencia a lista de presença.
- **Super admin** (`SUPER_ADMIN_EMAILS`): administra todas as peladas.
