# SV SOLICITAÇÕES 

Atue como um Desenvolvedor Full-Stack Sênior. Preciso que você crie uma aplicação web completa para "Gestão Corporativa" (Gestão Corp) focada em controle de despesas, abastecimentos e diárias.

### 🛠️ Stack Tecnológico
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, React Router DOM, Lucide React (para ícones).
- **Backend**: Node.js, Express, TypeScript.
- **Banco de Dados**: SQLite (usando `better-sqlite3`).
- **Tempo Real**: Socket.io (para atualizações de status em tempo real).
- **Autenticação**: JWT (JSON Web Tokens) e bcryptjs.
- **Upload de Arquivos**: Multer (salvando localmente na pasta `/uploads`).

### 🗄️ Estrutura do Banco de Dados (SQLite)
Crie as seguintes tabelas:
1. **users**: `id`, `name`, `email`, `password` (hash), `role` (COLABORADOR, DIRETOR, ADMINISTRATIVO, ADMIN), `department`.
2. **requests**: `id`, `type` (FUEL, REIMBURSEMENT, ALLOWANCE), `category` (ex: Viagem, Faxineira, etc), `solicitanteId` (FK), `veiculoPlaca`, `kmAtual`, `valor`, `status`, `dataSolicitacao`.
3. **attachments**: `id`, `solicitacaoId` (FK), `tipoDocumento` (ex: FOTO_PAINEL, NOTA_FISCAL, RECIBO), `url`, `dataUpload`.
4. **status_history**: `id`, `solicitacaoId` (FK), `statusAnterior`, `statusNovo`, `data`, `usuarioResponsavel` (FK), `comentario`.
5. **audit_logs**: `id`, `userId` (FK), `action` (ex: LOGIN, CREATE_REQUEST), `entityType`, `entityId`, `details` (JSON), `timestamp`.
6. **notifications**: `id`, `userId` (FK), `message`, `read` (boolean), `createdAt`.

### 🔄 Fluxo de Status das Solicitações (Workflow)
As solicitações devem seguir o seguinte fluxo de aprovação:
1. `PENDENTE_CONFERENCIA_INICIAL` (Criado pelo Colaborador)
2. `AGUARDANDO_APROVACAO_DIRETORIA` (Aprovado pelo Administrativo)
3. `AGUARDANDO_ANEXOS` (Aprovado pelo Diretor - libera para o colaborador anexar notas/recibos)
4. `PENDENTE_CONFERENCIA_FINAL` (Colaborador enviou os anexos)
5. `CONCLUIDO` (Administrativo validou os anexos finais)
*Status alternativos*: `DEVOLVIDO` (precisa de correção) e `REJEITADO`.

### 📝 Tipos de Solicitação e Formulário Dinâmico
O formulário de criação (`RequestForm`) deve ser dinâmico baseado no `type`:
- **Abastecimento (FUEL)**: Exige `veiculoPlaca`, `kmAtual` e `valor`.
- **Reembolso (REIMBURSEMENT)**: Exige `valor` e `category` (Opções: Viagem, Alimentação, Hospedagem, Transporte, Outros).
- **Diária (ALLOWANCE)**: Exige `valor` e `category` (Opções: Faxineira, Pedreiro, Ajudante, Pintor, Eletricista, Encanador, Outros).

### 🖥️ Telas do Frontend
1. **Login / Registro**: Autenticação de usuários.
2. **Dashboard**: 
   - Lista todas as solicitações.
   - Filtro de busca (por placa, categoria, nome do solicitante ou status).
   - Atualização em tempo real via Socket.io quando um status muda.
3. **Nova Solicitação**: Formulário dinâmico descrito acima.
4. **Detalhes da Solicitação**:
   - Mostra os dados da solicitação.
   - Mostra a linha do tempo (histórico de status).
   - Permite upload de anexos (se o status for `AGUARDANDO_ANEXOS`).
   - Botões de ação baseados no `role` do usuário (ex: Diretor vê botão "Aprovar", Administrativo vê "Conferência Inicial/Final").
5. **Log de Auditoria (AuditLogs)**:
   - Rota protegida apenas para `ADMINISTRATIVO` e `ADMIN`.
   - Tabela mostrando quem fez o quê, quando e detalhes da ação (lido da tabela `audit_logs`).

### ⚙️ Requisitos do Backend (Express)
- **Middlewares**: Autenticação via JWT (`req.user`).
- **Rotas de Auth**: `/api/auth/login`, `/api/auth/register`.
- **Rotas de Requests**: 
  - `GET /api/requests` (lista filtrada por role: colaborador vê os dele, diretor/admin vê todos).
  - `POST /api/requests` (cria solicitação e gera log de auditoria).
  - `GET /api/requests/:id` (traz detalhes, histórico e anexos).
  - `PUT /api/requests/:id/status` (atualiza status, salva no histórico, gera log e emite evento via socket).
  - `POST /api/requests/:id/attachments` (upload de arquivos usando multer).
  - `GET /api/requests/audit` (lista logs de auditoria).

Por favor, gere a estrutura de pastas, os arquivos de configuração (Vite, Tailwind, tsconfig), o servidor Express integrado com Vite e os componentes React necessários para fazer essa aplicação funcionar perfeitamente. quero um desgn limpo e facil de ser utilizado, faça uma dashboard ja funcional e interativa seja inteligente melhore o codigo adicione novas ferramentas,continue na mesma ideia, revise o codigo, monte um front end bnt e seguro,  USE O AUDIO COMO REFERENCIA

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://svsolicitacoess.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/28820c9c-7445-412c-89b0-8d12e30a1547).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
