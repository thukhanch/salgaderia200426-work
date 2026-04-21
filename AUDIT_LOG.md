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

---

## AUDITORIA APROFUNDADA — Leitura completa do código-fonte

**Data:** 2026-04-21 (segunda passagem — leitura linha a linha de todos os arquivos)

---

## 11. BUGS CRÍTICOS ADICIONAIS

### [NEW-CRIT-01] Histórico de Tool Calls reconstruído incorretamente — agent.ts:196-201
- **Arquivo:** `src/agent/agent.ts`
- **Problema:** Ao salvar uma mensagem de assistant com tool calls (linha 231-232), o código faz:
  ```typescript
  const assistantContent = JSON.stringify(msg.tool_calls);
  await saveMessage(convo.id, 'assistant', assistantContent);
  ```
  Ao recarregar do banco (linhas 196-201), todas as mensagens de `role === 'assistant'` são reconstruídas como `{ role: 'assistant', content: <string> }`. Mas a API da OpenAI exige o formato:
  ```json
  { "role": "assistant", "content": null, "tool_calls": [...] }
  ```
- **Impacto:** Na segunda mensagem em diante de qualquer conversa que usou tool calls, o histórico enviado à OpenAI é inválido. A API pode rejeitar a requisição ou o modelo pode se comportar incorretamente, gerando respostas fora de contexto ou loops.
- **Correção:** Ao salvar, distinguir entre mensagem de texto e tool call (ex: com campo `role = 'assistant_tool'`). Ao reconstruir, recriar o objeto correto com `tool_calls`.

### [NEW-CRIT-02] cancelOrder sem verificação de businessId ou phone — orders.ts:186-190
- **Arquivo:** `src/agent/tools/orders.ts:186-190`
- **Problema:**
  ```typescript
  export async function cancelOrder(orderId: string) {
    const order = await prisma.order.findFirst({ where: { id: { endsWith: orderId } } });
    // Sem filtro por businessId ou phone do solicitante
    await prisma.order.update({ where: { id: order.id }, data: { status: 'cancelled' } });
  }
  ```
- **Impacto:** Um cliente de qualquer negócio pode cancelar pedidos de qualquer outro cliente ou negócio, desde que o LLM forneça o orderId correto (que é apenas 6 chars). Vulnerabilidade de autorização crítica.
- **Correção:** Passar `phone` e `businessId` para `cancelOrder` e filtrar na query.

### [NEW-CRIT-03] choices[0] sem verificação de array vazio — agent.ts:220
- **Arquivo:** `src/agent/agent.ts:220`
- **Problema:** `const choice = response.choices[0];` — se a API retornar 0 choices (rate limit, content filter, erro de modelo), a linha seguinte `choice.message` lança `TypeError: Cannot read properties of undefined`.
- **Correção:** Verificar `if (!response.choices?.length) throw new Error('API retornou resposta vazia');`

---

## 12. FALHAS DE SEGURANÇA ADICIONAIS

### [NEW-SEC-01] Owner não reconhecido durante bootstrap — whatsapp/client.ts:112-115
- **Arquivo:** `src/whatsapp/client.ts:112-115`
- **Problema:**
  ```typescript
  const isOwner = await ownerChecker(rawPhone, currentBusinessId || '__dynamic__');
  ```
  `isOwner` chama `prisma.business.findUnique({ where: { id: '__dynamic__' } })` — retorna null — owner nunca é reconhecido até o `currentBusinessId` ser preenchido. O dono pode enviar mensagem logo após o boot e ser tratado como cliente normal.
- **Correção:** `ownerChecker` deve usar `resolveBusinessId()` internamente se businessId não estiver definido.

### [NEW-SEC-02] DELETE /motoboys/:phone sem validação de formato
- **Arquivo:** `src/server.ts:155-163`
- **Problema:** Outros endpoints validam telefone com `isPhone()`, mas o DELETE não valida o parâmetro `:phone`. Qualquer string pode ser passada (ex: SQL-like strings, payloads muito longos).
- **Correção:** Adicionar `if (!isPhone(req.params.phone)) return reply.status(400).send(...)`.

### [NEW-SEC-03] Comando `reabrir` do painel do dono sem validação de telefone
- **Arquivo:** `src/admin/admin.service.ts:180-193`
- **Problema:** `const clientPhone = parts[1]` é usado diretamente em `updateMany({ where: { phone: clientPhone } })` sem nenhuma validação de formato.
- **Correção:** Validar com regex antes de usar.

---

## 13. BUGS DE LÓGICA ADICIONAIS

### [NEW-BUG-01] Total do pedido como Float com aritmética de ponto flutuante
- **Arquivo:** `src/agent/tools/orders.ts:51`, `prisma/schema.prisma:73`
- **Problema:** `const total = params.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)` — aritmética de ponto flutuante em valores monetários causa erros de centavos (ex: 2.99 × 3 = 8.969999...).
- **Schema:** `total Float?` é nullable, mas é sempre calculado. Se nulo, `Number(null).toFixed(2)` exibe R$0.00.
- **Correção:** Calcular em centavos (inteiros) e converter apenas para exibição. Remover nullable do campo.

### [NEW-BUG-02] Regex de aceitação de motoboy pode capturar palavras comuns
- **Arquivo:** `src/motoboy/motoboy.service.ts:129`
- **Problema:** `const idPattern = /\b([a-z0-9]{6})\b/i;` — qualquer palavra de 6 caracteres alfanuméricos é tratada como ID de pedido. Se um motoboy escreve "ok agora1" ("agora1" = 6 chars) um orderId inválido é extraído e a resposta é confusa.
- **Correção:** Exigir formato explícito (ex: maiúsculas + dígitos) ou instrução mais clara no protocolo.

### [NEW-BUG-03] Motoboy recebe aviso não solicitado em qualquer mensagem
- **Arquivo:** `src/motoboy/motoboy.service.ts:162-172`
- **Problema:** Se o motoboy envia qualquer mensagem que não seja aceitação ou conclusão (ex: "oi", "tudo bem"), recebe aviso de entregas pendentes mesmo sem ter pedido. Pode ser irritante e gerar confusão.
- **Sugestão:** Limitar o aviso apenas se o motoboy enviar algo parecido com "ok" ou perguntar sobre pedidos.

### [NEW-BUG-04] Reconexão WhatsApp sem backoff ou limite máximo
- **Arquivo:** `src/whatsapp/client.ts:81`
- **Problema:** `setTimeout(connect, 3000)` — reconecta a cada 3s indefinidamente. Se o número foi banido ou há problema permanente, retenta para sempre, podendo agravar o bloqueio.
- **Correção:** Implementar exponential backoff com número máximo de tentativas (ex: 5, depois alertar o operador).

### [NEW-BUG-05] Loop de tool calls sem log quando limite é atingido
- **Arquivo:** `src/agent/agent.ts:212`
- **Problema:** `for (let i = 0; i < 8; i++)` — se o modelo fizer 8 chamadas de tool sem retornar `stop`, o loop encerra silenciosamente e retorna a mensagem de fallback. Nenhum log de aviso indica o loop infinito.
- **Correção:** `if (i === 7) console.warn('Max tool call iterations reached for', phone);`

### [NEW-BUG-06] Upsert de negócio pode criar duplicatas em corrida simultânea
- **Arquivo:** `src/server.ts:101-119`
- **Problema:** `where: { id: id || 'placeholder' }` — se duas requisições `POST /business` chegam simultaneamente enquanto `businessId` ainda é `''`, ambas usam `'placeholder'` como chave e criam dois registros distintos.
- **Correção:** Usar `upsert` com campo único real (ex: `ownerPhone`) ou adicionar lock/transação.

---

## 14. PROBLEMAS DE LÓGICA NO SCHEMA

### [NEW-SCHEMA-01] Status de Order, Conversation e Motoboy sem enum no banco
- **Arquivo:** `prisma/schema.prisma`
- **Problema:** Campos `status`, `motoboyStatus`, `deliveryType` são `String` ou `String?` — qualquer valor é aceito pelo banco. Um typo no código ('canceld' em vez de 'cancelled') passa silenciosamente.
- **Correção:** Usar enums do Prisma:
  ```prisma
  enum OrderStatus { pending confirmed cancelled delivered }
  enum MotoboyStatus { notified accepted in_transit delivered }
  enum DeliveryType { pickup delivery }
  ```

### [NEW-SCHEMA-02] Order criado com status 'confirmed' mas default do schema é 'pending'
- **Arquivo:** `src/agent/tools/orders.ts:63`, `prisma/schema.prisma:76`
- **Problema:** O schema define `status String @default("pending")`, mas `createOrder` sempre passa `status: 'confirmed'`. O default 'pending' nunca é usado — código e schema estão desalinhados.
- **Correção:** Alinhar: remover default do schema ou mudar createOrder para não passar status explícito.

---

## 15. PROBLEMAS COM INTEGRAÇÕES EXTERNAS

### [NEW-INT-01] Modelo padrão 'gpt-4.5' não existe na API real da OpenAI
- **Arquivo:** `src/agent/agent.ts:17`
- **Problema:** `const MODEL = process.env.MODEL_NAME ?? 'gpt-4.5';` — 'gpt-4.5' não é um model ID válido da OpenAI. Em produção sem a variável, toda requisição falharia.
- **Correção:** Usar 'gpt-4o' ou 'gpt-4-turbo' como default, ou tornar obrigatório.

### [NEW-INT-02] API key padrão 'no-key' falha silenciosamente
- **Arquivo:** `src/agent/agent.ts:12-14`
- **Problema:** `apiKey: process.env.OPENAI_API_KEY ?? 'no-key'` — sem a variável, usa 'no-key'. Para proxy local OK, mas em produção falha na primeira chamada ao invés de no startup.
- **Correção:** `if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não configurada');`

### [NEW-INT-03] MercadoPago pode retornar status undefined — mercadopago.ts:69-70
- **Arquivo:** `src/payment/mercadopago.ts:69-70`
- **Problema:** `return data.status as string;` — se a resposta da API do MP mudar ou tiver erro, `data.status` pode ser `undefined`. Isso seria salvo no banco como `undefined` (convertido para string 'undefined').
- **Correção:** Validar: `if (!data.status) return null;`

### [NEW-INT-04] WhatsApp só processa mensagens de texto — client.ts:102-106
- **Arquivo:** `src/whatsapp/client.ts:102-106`
- **Problema:** Apenas `msg.message.conversation` e `msg.message.extendedTextMessage?.text` são lidos. Áudios, imagens, botões, respostas de lista e stickers são silenciosamente ignorados — o cliente não recebe nenhum feedback.
- **Correção:** Adicionar handler para pelo menos enviar "Por favor, envie mensagens de texto." quando tipo não suportado.

---

## 16. QUALIDADE E MANUTENIBILIDADE ADICIONAIS

### [NEW-QUAL-01] Log de resposta com '...' sempre presente — client.ts:145
- **Arquivo:** `src/whatsapp/client.ts:145`
- **Problema:** `` `📤 [${rawPhone}]: ${response.slice(0, 80)}...` `` — o `...` é appended mesmo se a resposta tem menos de 80 chars, sugerindo truncamento quando não houve.
- **Correção:** `` response.length > 80 ? `${response.slice(0, 80)}...` : response ``

### [NEW-QUAL-02] Padrão Prisma singleton desnecessário fora do Next.js — db/client.ts
- **Arquivo:** `src/db/client.ts:3-13`
- **Problema:** O padrão `globalThis.prisma` existe para evitar múltiplas instâncias em hot-reload do Next.js. Este projeto é um servidor Node.js puro — o código nunca reutiliza a instância de `globalThis` e o bloco é código morto.
- **Correção:** Simplificar para `export const prisma = new PrismaClient({ ... });`

### [NEW-QUAL-03] Impressora cria nova conexão TCP por pedido — printer.service.ts:52
- **Arquivo:** `src/printer/printer.service.ts:52`
- **Problema:** `const printer = buildPrinter()` instancia um novo `ThermalPrinter` a cada pedido, abrindo uma nova conexão TCP a cada impressão. Em alta carga, gera acúmulo de conexões pendentes.
- **Correção:** Reutilizar instância ou usar pool de conexões.

### [NEW-QUAL-04] Ausência completa de testes
- **Problema:** Nenhum arquivo de teste existe no projeto. Funções críticas como `parseAcceptance`, `parseDeliveryCompletion`, `createOrder`, `cancelOrder` e `processMessage` não têm cobertura alguma.
- **Impacto:** Regressões passam despercebidas. A lógica de parseAcceptance com regex tem 3 bugs identificados nesta auditoria que testes teriam capturado.
- **Correção:** Adicionar Jest ou Vitest com testes unitários para funções de parse, validação e lógica de negócio.

### [NEW-QUAL-05] Nenhum arquivo .env.example no repositório
- **Problema:** Não há `.env.example` documentando variáveis necessárias. Novos desenvolvedores não sabem quais variáveis configurar.
- **Correção:** Criar `.env.example` com todas as variáveis e comentários explicativos.

### [NEW-QUAL-06] Nenhuma configuração de ESLint/Prettier
- **Problema:** TypeScript strict está habilitado, mas não há linter de estilo ou qualidade. Código pode divergir em padrão entre arquivos.
- **Correção:** Adicionar `.eslintrc` + `eslint-plugin-@typescript-eslint` e `prettier`.

---

## RESUMO CONSOLIDADO DA AUDITORIA COMPLETA

| Categoria | ID | Severidade |
|-----------|-----|-----------|
| Histórico tool calls inválido para OpenAI | NEW-CRIT-01 | CRÍTICA |
| cancelOrder sem autorização | NEW-CRIT-02 | CRÍTICA |
| choices[0] sem verificação | NEW-CRIT-03 | CRÍTICA |
| Owner invisível no bootstrap | NEW-SEC-01 | ALTA |
| DELETE sem validação de phone | NEW-SEC-02 | MÉDIA |
| Reabrir sem validação de phone | NEW-SEC-03 | MÉDIA |
| Aritmética float em valores monetários | NEW-BUG-01 | ALTA |
| Regex de ID captura palavras comuns | NEW-BUG-02 | MÉDIA |
| Aviso não solicitado ao motoboy | NEW-BUG-03 | BAIXA |
| Reconexão sem backoff | NEW-BUG-04 | MÉDIA |
| Loop tool call sem log | NEW-BUG-05 | BAIXA |
| Race condition em upsert do negócio | NEW-BUG-06 | MÉDIA |
| Status sem enum no banco | NEW-SCHEMA-01 | MÉDIA |
| Status 'confirmed' vs default 'pending' | NEW-SCHEMA-02 | BAIXA |
| Modelo padrão inválido | NEW-INT-01 | ALTA |
| API key silenciosa | NEW-INT-02 | MÉDIA |
| MercadoPago status pode ser undefined | NEW-INT-03 | MÉDIA |
| Mensagens não-texto ignoradas sem aviso | NEW-INT-04 | MÉDIA |
| Log '...' sempre presente | NEW-QUAL-01 | BAIXA |
| Singleton Prisma desnecessário | NEW-QUAL-02 | BAIXA |
| Conexão TCP por pedido na impressora | NEW-QUAL-03 | BAIXA |
| Ausência de testes | NEW-QUAL-04 | ALTA |
| Sem .env.example | NEW-QUAL-05 | BAIXA |
| Sem ESLint/Prettier | NEW-QUAL-06 | BAIXA |

### Total consolidado (ambas as passagens)

| Severidade | Contagem |
|------------|---------|
| CRÍTICA    | 6       |
| ALTA       | 9       |
| MÉDIA      | 14      |
| BAIXA      | 15+     |
