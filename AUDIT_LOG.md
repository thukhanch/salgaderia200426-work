# AUDIT LOG — Avaliação do Projeto Salgaderia200426

**Data da Auditoria:** 2026-04-21  
**Auditor:** Claude Code (claude-sonnet-4-6)  
**Projeto:** salgaderia200426-work  

---

## RESUMO EXECUTIVO

| Severidade | Quantidade |
|------------|-----------|
| CRÍTICA    | 3         |
| ALTA       | 5         |
| MÉDIA      | 8         |
| BAIXA      | 10+       |

---

## 1. PROBLEMAS CRÍTICOS

### [CRIT-01] JSON.parse sem try-catch — Google Calendar
- **Arquivo:** `src/calendar/google.ts:15`
- **Problema:** `JSON.parse(raw)` sem try-catch. Se `GOOGLE_SERVICE_ACCOUNT_JSON` estiver malformado, o servidor crasha.
- **Correção:** Envolver em try-catch com mensagem de erro clara.

### [CRIT-02] JSON.parse sem try-catch — Tool Calls do Agente
- **Arquivo:** `src/agent/agent.ts:235`
- **Problema:** `JSON.parse(call.function.arguments || '{}')` pode falhar com JSON inválido retornado pelo LLM.
- **Correção:** Usar try-catch e retornar erro controlado ao usuário.

### [CRIT-03] Identificação de Pedidos por Sufixo de 6 Caracteres é Frágil
- **Arquivos:** `src/admin/admin.service.ts:154`, `src/motoboy/motoboy.service.ts:183`, `src/server.ts:214`
- **Problema:** O sistema usa `order.id.slice(-6)` para exibir e buscar pedidos (`endsWith`, `contains`). Com volume alto de pedidos, colisões são altamente prováveis — um cliente pode acessar o pedido de outro.
- **Correção:** Usar UUID completo ou campo de número sequencial indexado.

---

## 2. VULNERABILIDADES DE SEGURANÇA

### [SEC-01] Busca por Sufixo de ID Expõe Pedidos de Outros Clientes
- **Arquivos:** `src/admin/admin.service.ts:154`, `src/server.ts:214`
- **Problema:** Busca por `endsWith` e `contains` em IDs permite que um usuário que conhece parte do ID de outro acesse dados alheios.
- **Correção:** Usar busca exata por ID completo.

### [SEC-02] Ausência de Rate Limiting em Endpoints Críticos
- **Arquivo:** `src/server.ts`
- **Endpoints vulneráveis:** `POST /business`, `POST /send`, `POST /motoboys`
- **Problema:** Sem proteção contra brute force ou flood de requisições.
- **Correção:** Adicionar `@fastify/rate-limit`.

### [SEC-03] Validação de Tamanho de Mensagem Ausente
- **Arquivo:** `src/server.ts:234-236`
- **Problema:** O campo `message` aceita qualquer tamanho, podendo ser usado para flood de mensagens WhatsApp.
- **Correção:** Adicionar `message.length <= 1000` ou similar.

### [SEC-04] Exposição de Número de Telefone em Logs
- **Arquivo:** `src/agent/agent.ts:191`
- **Problema:** `console.warn(...phone...: "${text.slice(0, 100)}")` registra telefone completo em log.
- **Correção:** Mascarar telefone: exibir apenas últimos 4 dígitos.

### [SEC-05] OPENAI_BASE_URL com Fallback para localhost
- **Arquivo:** `src/agent/agent.ts:9`
- **Problema:** `process.env.OPENAI_BASE_URL ?? 'http://localhost:20128'` — em produção sem a env, aponta para localhost sem aviso.
- **Correção:** Lançar erro se variável não estiver definida.

---

## 3. BUGS DE LÓGICA

### [BUG-01] Timeout de Escalação de Motoboy Não é Cancelável
- **Arquivo:** `src/motoboy/motoboy.service.ts:97-115`
- **Problema:** `setTimeout` é chamado sem guardar referência. Se o pedido for cancelado antes de 5 minutos, o timeout ainda dispara e envia notificação desnecessária ao dono.
- **Correção:** Guardar `timeoutId` (em Map ou banco) e chamar `clearTimeout` no cancelamento.

### [BUG-02] Agendamento Sem Limite Máximo de Data
- **Arquivo:** `src/agent/tools/orders.ts:40-45`
- **Problema:** Valida que `scheduledAt` é pelo menos 1h no futuro, mas não impede agendamentos para daqui a 10 anos.
- **Correção:** Adicionar limite máximo (ex: 30 dias).

### [BUG-03] Evento do Google Calendar Não é Removido ao Cancelar Pedido
- **Arquivo:** `src/agent/tools/orders.ts` (função `cancelOrder`)
- **Problema:** Ao cancelar um pedido agendado, o evento do Google Calendar não é excluído — fica como "evento fantasma".
- **Correção:** Adicionar chamada a `deleteEvent(order.calendarEventId)` no cancelamento.

### [BUG-04] Cache de Motoboy com TTL Global Compartilhado
- **Arquivo:** `src/motoboy/motoboy.service.ts:5-7`
- **Problema:** `cacheExpiry` é uma variável global única. Se houver múltiplos negócios, o cache expira para todos ao mesmo tempo.
- **Correção:** Armazenar TTL por `businessId` dentro do Map.

### [BUG-05] businessId Pode Ser `'__dynamic__'` em Produção
- **Arquivo:** `src/server.ts:284-285`
- **Problema:** `setMotoboyHandler(..., id || '__dynamic__')` — se nenhum negócio está cadastrado, passa string inválida para queries.
- **Correção:** Retornar erro explícito se `id` for nulo.

### [BUG-06] Pedidos Concorrentes do Mesmo Cliente
- **Problema:** Se o mesmo cliente envia múltiplas mensagens simultaneamente, podem ser criados múltiplos pedidos antes de qualquer confirmação.
- **Correção:** Adicionar flag de "pedido em progresso" por telefone.

---

## 4. QUALIDADE DE CÓDIGO

### [CODE-01] Uso Excessivo de `any` (32 ocorrências)
- **Arquivos:** `src/agent/agent.ts`, `src/motoboy/motoboy.service.ts`, `src/printer/printer.service.ts`
- **Problema:** Perde type safety, dificulta refatoração e debugging.
- **Correção:** Criar interfaces `OrderItem`, `BusinessData`, etc.

### [CODE-02] Empty Catch Blocks
- **Arquivo:** `src/motoboy/motoboy.service.ts:234,242,252`
- **Problema:** `try { ... } catch {}` — erros são silenciados sem log.
- **Correção:** Sempre logar: `catch (err) { console.error('[motoboy]', err); }`

### [CODE-03] Import Dinâmico Redundante
- **Arquivo:** `src/server.ts:238`
- **Problema:** `await import('./whatsapp/client')` é feito dinamicamente, mas `sendMessage` já está importado estaticamente no topo do arquivo.
- **Correção:** Remover import dinâmico e usar o import estático existente.

### [CODE-04] Falta de Validação de Schema (sem Zod/Joi)
- **Arquivo:** `src/server.ts` (todos os endpoints)
- **Problema:** Validações manuais e repetitivas são propensas a erros.
- **Correção:** Adotar `zod` para validação declarativa de entrada.

### [CODE-05] Hardcoded Magic Numbers e Strings
- **Arquivos:** Múltiplos
- **Exemplos:** `MAX_HISTORY = 30`, `TIMEOUT_MS = 5 * 60 * 1000`, slice de 6 chars de ID
- **Correção:** Centralizar em arquivo `src/constants.ts`.

### [CODE-06] Normalização de Telefone Inconsistente
- **Arquivos:** `src/admin/admin.service.ts:35` vs outros arquivos
- **Problema:** Alguns lugares usam `replace(/[\s+\-()]/g, '')`, outros usam `.trim()` ou nada.
- **Correção:** Criar função única `normalizePhone(p: string): string` e usá-la em todo o projeto.

---

## 5. INCONSISTÊNCIAS DE NOMENCLATURA

### [NAMING-01] Typo: `processMoboyMessage` → `processMotoboyMessage`
- **Arquivo:** `src/server.ts:7`
- **Problema:** "Moboy" ao invés de "Motoboy".
- **Correção:** Renomear função e import.

### [NAMING-02] `deliveryType` vs Valores `'pickup'` e `'delivery'`
- **Problema:** Campo se chama `deliveryType`, mas o valor "delivery" é redundante com o próprio nome do campo.
- **Sugestão:** Renomear para `fulfillmentType` ou mudar valores para `'pickup'` e `'home-delivery'`.

### [NAMING-03] Variável Global Inicializada com String Vazia
- **Arquivo:** `src/whatsapp/client.ts:28`
- **Código:** `let currentBusinessId = '';`
- **Problema:** String vazia é diferente de `null` — dificulta checagem de "não inicializado".
- **Correção:** Usar `let currentBusinessId: string | null = null;`.

---

## 6. BANCO DE DADOS

### [DB-01] Índices Compostos Faltando
- **Arquivo:** `prisma/schema.prisma`
- **Problema:** Queries comuns filtram por `(businessId, status)` e `(businessId, motoboyStatus)`, mas esses índices compostos não existem.
- **Correção:**
  ```prisma
  @@index([businessId, status])
  @@index([businessId, motoboyStatus])
  @@index([motoboyPhone])
  ```

### [DB-02] Campo `Json` Sem Validação no App
- **Arquivo:** `prisma/schema.prisma:16-17,62`
- **Campos:** `menu Json`, `hours Json`, `toolArgs Json?`
- **Problema:** Dados inválidos podem ser salvos sem validação de estrutura.
- **Correção:** Validar via Zod antes de persistir.

### [DB-03] Sem Soft Delete Consistente
- **Problema:** Motoboys têm `active: false` para "deletar", mas não há `deletedAt`. Orders ainda referenciam `motoboyPhone` de motoboys inativos sem registro de quando foram desativados.
- **Correção:** Adicionar `deletedAt DateTime?` ao model `Motoboy`.

---

## 7. OBSERVABILIDADE E LOGGING

### [OBS-01] Logger Estruturado Importado mas Não Usado
- **Arquivo:** `src/whatsapp/client.ts:10`
- **Problema:** `pino` é importado e criado com `level: 'silent'` — nunca usado de verdade.
- **Correção:** Usar pino com level configurável via env, ou remover.

### [OBS-02] Logging Inconsistente (log vs warn vs error)
- **Problema:** Projeto mistura `console.log`, `console.error`, `console.warn` sem critério claro.
- **Correção:** Adotar logger estruturado único com níveis semânticos.

### [OBS-03] Health Check Superficial
- **Arquivo:** `src/server.ts:79`
- **Problema:** `/health` retorna apenas `{ status: 'ok' }` sem verificar banco, WhatsApp ou serviços externos.
- **Correção:** Verificar `prisma.$queryRaw`, estado do cliente Baileys, etc.

---

## 8. PERFORMANCE

### [PERF-01] Endpoint `/conversations` Sem Paginação
- **Arquivo:** `src/server.ts`
- **Problema:** Pode retornar todas as conversas sem limite, causando lentidão com volume alto.
- **Correção:** Adicionar `take` e `skip` para paginação.

### [PERF-02] N+1 Query na Notificação de Outros Motoboys
- **Arquivo:** `src/motoboy/motoboy.service.ts:228-235`
- **Problema:** `findMany` seguido de `sendMessage` individual por motoboy em loop.
- **Correção:** Paralelizar com `Promise.all`.

---

## 9. DOCUMENTAÇÃO

### [DOC-01] README ou CLAUDE.md Ausente
- **Problema:** Não há documentação de setup, arquitetura, variáveis de ambiente ou decisões técnicas.
- **Correção:** Criar `README.md` com instruções de instalação e `CLAUDE.md` com contexto da arquitetura.

### [DOC-02] Regras de Detecção de Prompt Injection Sem Documentação
- **Arquivo:** `src/agent/agent.ts:20-39`
- **Problema:** 35 regex patterns sem comentários explicando a motivação de cada um.
- **Correção:** Agrupar por categoria e adicionar comentário por grupo.

### [DOC-03] Hook de Socket.IO Legado Sem Explicação
- **Arquivo:** `src/server.ts:71-76`
- **Problema:** Hook que silencia requisições `/socket.io` existe sem explicação do contexto.
- **Correção:** Documentar ou remover se o frontend antigo não existe mais.

---

## 10. INTEGRAÇÃO

### [INT-01] Credenciais Google em Variável de Ambiente como JSON Raw
- **Arquivo:** `.env.example`
- **Problema:** `GOOGLE_SERVICE_ACCOUNT_JSON` armazena JSON completo em variável de ambiente — difícil de gerir e propenso a erros de escape.
- **Correção:** Usar caminho para arquivo JSON: `GOOGLE_SERVICE_ACCOUNT_PATH=/secrets/google.json`.

---

## PRIORIDADE DE CORREÇÃO

### Imediato (bloqueia produção segura)
1. [CRIT-01] JSON.parse sem try-catch no Google Calendar
2. [CRIT-02] JSON.parse sem try-catch no agente
3. [CRIT-03] + [SEC-01] Busca de pedidos por sufixo de ID
4. [SEC-02] Rate limiting ausente

### Urgente (risco de bug ou segurança em uso normal)
5. [BUG-01] Timeout de escalação não cancelável
6. [BUG-03] Evento Google Calendar não removido ao cancelar pedido
7. [SEC-04] Telefone exposto em logs
8. [CODE-02] Empty catch blocks

### Importante (qualidade e manutenibilidade)
9. [CODE-01] Remover `any` e criar interfaces
10. [DB-01] Adicionar índices compostos
11. [CODE-06] Centralizar normalização de telefone
12. [NAMING-01] Corrigir typo `processMoboyMessage`

### Melhorias (a médio prazo)
13. [CODE-04] Adotar Zod para validação
14. [OBS-01/02/03] Estruturar logging e health check
15. [DOC-01] Criar README/CLAUDE.md
16. [PERF-01] Adicionar paginação em `/conversations`
