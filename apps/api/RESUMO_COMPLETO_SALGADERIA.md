# Resumo completo do projeto — Duzzi Salgados

## Visão geral
Este projeto é um backend NestJS que integra:
- WhatsApp como canal de entrada e saída
- backend local **9router** como motor de IA
- PostgreSQL como memória persistente
- Google Calendar para apoio operacional após confirmação de pedido
- Baileys para conexão local com WhatsApp Web

A direção atual do projeto é:
**não tratar a salgaderia como bot de fluxo fixo**, e sim como um **runtime de agente de IA**, onde a IA decide como responder e o backend cuida de memória, ferramentas, persistência, auditoria e integrações.

---

## Objetivo atual do sistema
O sistema foi consolidado para que:
- a IA seja o cérebro do atendimento
- o backend seja o runtime de memória, saneamento, ferramentas, persistência e transporte
- não existam múltiplas versões espalhadas das instruções do agente
- o contrato JSON da IA seja estável e auditável
- os testes possam ser feitos internamente, sem depender do WhatsApp real

---

## O que está rodando hoje
### Backend principal
- Framework: **NestJS**
- Linguagem: **TypeScript**
- Porta local: **http://localhost:3000**
- Script de desenvolvimento: `npm run dev`
- Endpoint de simulação interna: `POST /api/salgaderia/simular`
- Endpoint de diagnóstico do prompt: `GET /api/salgaderia/diagnostico-prompt`

### Banco de dados
- **PostgreSQL** via TypeORM
- persistência de clientes, conversas, pedidos e configurações

### IA
- Provedor operacional atual: **9router**
- Variáveis principais em uso:
  - `AI_API_KEY`
  - `AI_BASE_URL`
  - `AI_MODEL`
- Configuração validada em auditoria:
  - `AI_BASE_URL=http://127.0.0.1:20128/v1`
  - `AI_MODEL=meucombo`
- Modelo efetivo observado nos logs de execução: **gpt-5.4**
- `OPENROUTER_*` ficou apenas como fallback

### Canal WhatsApp
- Integração por **Baileys**
- O transporte real pode subir junto no processo, mas a validação desta fase foi feita por **simulação interna**, não por mensagens reais

### Calendar
- Integração com **Google Calendar** para criar evento após confirmação do pedido

---

## Como o projeto está rodando hoje
### Fluxo principal atual
1. chega uma mensagem ao runtime
2. o backend carrega:
   - histórico recente
   - dados persistidos da conversa
   - memória operacional
   - configurações do negócio
3. a IA recebe esse contexto + base de conhecimento + contrato estrutural
4. a IA responde em JSON estruturado
5. o backend sanitiza e aplica:
   - resposta ao cliente
   - atualizações de memória
   - tool calls válidas
6. guardrails determinísticos do backend corrigem casos específicos sem robotizar resposta boa
7. se houver confirmação explícita, o pedido pode ser criado
8. se houver handoff legítimo, o sistema marca escalada para humano

---

## Arquitetura atual por arquivo
### `src/modules/salgaderia/salgaderia-agent.config.ts`
É a principal fonte de verdade do runtime.
Concentra:
- nomes das tools válidas
- schema esperado da IA
- regras de formato
- regras de decisão
- regras de estilo
- regras de handoff
- regex de saneamento
- textos operacionais centralizados
- builders de mensagens operacionais
- etapas válidas da conversa

### `src/modules/salgaderia/ai.service.ts`
Responsável por:
- montar o contexto para a IA
- carregar `script-atendimento.md`
- acoplar a base de conhecimento ao contrato estrutural
- chamar o backend 9router
- registrar auditoria de prompt e saída
- reparar JSON quando necessário
- sanitizar resposta, tool calls e memory updates

Contrato esperado da IA:
- `replyToCustomer`
- `toolCalls`
- `memoryUpdates`
- `needsHuman`
- `shouldCreateOrder`

### `src/modules/salgaderia/salgaderia.service.ts`
Responsável por:
- orquestrar o atendimento
- recuperar ou criar cliente e conversa
- construir memória operacional
- chamar `ai.service`
- persistir histórico e dados
- decidir confirmação final do pedido
- criar pedido confirmado
- acionar Google Calendar
- acionar handoff humano
- integrar com o transporte do WhatsApp

### `src/modules/salgaderia/script-atendimento.md`
Hoje é a **base de conhecimento operacional** do agente.
Contém:
- papel da IA
- regras gerais de atendimento
- cardápio oficial
- regras comerciais
- dados necessários para fechar pedido
- modalidade de retirada
- regras de pagamento
- escalada humana
- dados do estabelecimento

### `src/modules/salgaderia/salgaderia.controller.ts`
Responsável por endpoints do módulo.
Destaques:
- `POST /api/salgaderia/simular` → principal endpoint para teste interno
- `GET /api/salgaderia/diagnostico-prompt`
- `GET /api/salgaderia/pedidos`
- `GET /api/salgaderia/clientes`
- `GET /api/salgaderia/configuracoes`

### `src/modules/salgaderia/google-calendar.service.ts`
Responsável por criar evento após pedido confirmado.
Hoje consome textos centralizados do config global.

### `src/modules/salgaderia/entities/conversa.entity.ts`
Memória persistente da conversa:
- `etapa_atual`
- `dados_parciais`
- `pedido_em_aberto`
- `historico_mensagens`
- `ultima_interacao`

### `src/modules/salgaderia/entities/pedido.entity.ts`
Persistência dos pedidos confirmados.

### `src/modules/whatsapp/whatsapp.service.ts`
Camada de transporte do WhatsApp.
Mantém:
- conexão por sessão
- envio de mensagem
- envio de reply com presença
- listener de mensagens

---

## O que foi aprendido e ajustado até aqui
### 1. O projeto não pode simular IA com bot disfarçado
Foi removida a lógica que robotizava ou duplicava o agente, inclusive:
- saudação fixa forçada
- redundâncias estruturais entre script e prompt montado
- textos operacionais soltos em múltiplos arquivos
- sobras que faziam o backend conversar no lugar da IA

### 2. A IA precisa devolver decisão estruturada auditável
Agora o runtime opera com envelope estável que permite:
- resposta ao cliente
- memória operacional
- sinais de handoff
- sinal de criação de pedido
- tool calls controladas pelo backend

### 3. O backend deve validar e proteger, não substituir a IA
O backend continua responsável por:
- integridade dos dados
- persistência
- criação de pedido
- integração com outros serviços
- saneamento de vazamentos
- guardrails determinísticos

Mas deixou de carregar múltiplas versões paralelas do comportamento do agente.

### 4. Teste offline correto é por simulação interna
A forma correta de validar esta fase foi:
- **sem WhatsApp real**
- usando `POST /api/salgaderia/simular`
- relendo logs de prompt e saída
- encerrando a instância ao final de cada ciclo

### 5. Centralização virou regra do runtime
As partes críticas agora ficam centralizadas em `salgaderia-agent.config.ts`, incluindo:
- schema
- tool names
- textos operacionais
- fallback de confirmação
- builders de lembrete e calendar
- etapas válidas

---

## Estado atual dos testes internos
Os testes mais recentes foram feitos com:
- `POST /api/salgaderia/simular`
- `GET /api/salgaderia/diagnostico-prompt`
- leitura direta de logs do runtime

### Cenários validados internamente
1. Saudação simples (`oi`)
2. Quantidade inválida (`30 coxinhas`)
3. Pergunta sobre PIX (`me passa o pix`)
4. Pedido parcial válido (`quero 50 coxinhas para amanhã às 18:00`)
5. Nome + resumo (`meu nome é Eduardo`)
6. Confirmação explícita (`confirmo`)
7. Handoff legítimo (`quero falar com um humano agora`)

### Resultado observado
O runtime está:
- subindo corretamente
- respondendo via IA pelo endpoint interno
- preservando respostas naturais válidas
- persistindo memória e histórico
- convertendo datas relativas em datas absolutas
- preservando etapas semânticas corretas
- auditando prompt e saída final

### Bugs reais corrigidos nesta fase
- `ai.service.ts` quebrado e duplicado
- diagnóstico ainda preso ao OpenRouter
- saudação fixa robotizando resposta boa
- duplicação estrutural do script no prompt
- schema excessivamente verboso no prompt
- `mergeDados()` priorizando valor antigo em vez de valor novo saneado
- `POST /api/salgaderia/simular` quebrando sem `body.phone`
- etapas válidas incompletas rebaixando estados da IA (`aguardando_nome`, `aguardando_confirmacao_final`, `handoff`, `pedido_confirmado`)

### Estado técnico atual
**As pendências estruturais reais foram reduzidas a zero nesta fase.**
O que resta agora são apenas refinamentos opcionais de naturalidade ou futura limpeza, caso apareça nova regressão.

---

## Regras de negócio atuais da Duzzi Salgados
- produto único: **Coxinha**
- preço: **R$ 1,00 por unidade**
- pedido mínimo: **25 unidades**
- quantidade deve ser múltiplo de 25
- modalidade: **somente retirada no balcão**
- pagamento: **somente no balcão na retirada**
- não oferecer entrega, frete, motoboy, PIX ou pagamento antecipado

---

## Script/base de atendimento atual sintetizado
A base atual orienta a IA com estes princípios:
- agir como agente de atendimento da Duzzi Salgados
- não agir como bot de fluxo fixo
- usar histórico e memória antes de perguntar de novo
- não inventar itens, preços, horários ou dados do cliente
- responder naturalmente
- não forçar fechamento quando a pessoa está só consultando
- só considerar pedido confirmado com confirmação explícita
- escalar para humano em reclamação séria, impasse real, pedido fora do cardápio ou situação não resolvível

---

## Como testar internamente hoje
### Subir backend
No diretório `apps/api`:
```bash
npm run dev
```

### Validar diagnóstico do prompt
```bash
curl http://localhost:3000/api/salgaderia/diagnostico-prompt
```

### Rodar simulação interna
Exemplo:
```bash
curl -X POST http://localhost:3000/api/salgaderia/simular \
  -H 'Content-Type: application/json' \
  -d '{"text":"quero 50 coxinhas para amanhã às 18:00"}'
```

### Observação operacional
Ao terminar cada ciclo de teste local, a instância deve ser encerrada para não deixar ambiente sujo.

---

## Fechamento técnico desta fase
Hoje o módulo da Duzzi Salgados está em uma base estável com:
- runtime centralizado
- prompt auditável
- provider 9router ativo
- contrato JSON estável
- guardrails concentrados
- simulador offline funcional
- etapas semânticas preservadas
- build íntegro

Recomendação de uso a partir daqui:
- tratar esta fase como **tecnicamente fechada**
- só reabrir mudanças estruturais se aparecer nova regressão em teste offline ou comportamento real fora dos cenários já validados

---

## Caminho completo deste arquivo
`/home/eduardo/whatsapp-flow/apps/api/RESUMO_COMPLETO_SALGADERIA.md`

### Arquivos-chave para navegar rapidamente
- `/home/eduardo/whatsapp-flow/apps/api/src/modules/salgaderia/salgaderia-agent.config.ts`
- `/home/eduardo/whatsapp-flow/apps/api/src/modules/salgaderia/ai.service.ts`
- `/home/eduardo/whatsapp-flow/apps/api/src/modules/salgaderia/salgaderia.service.ts`
- `/home/eduardo/whatsapp-flow/apps/api/src/modules/salgaderia/salgaderia.controller.ts`
- `/home/eduardo/whatsapp-flow/apps/api/src/modules/salgaderia/script-atendimento.md`
- `/home/eduardo/whatsapp-flow/apps/api/salgaderia-task-log.txt`

---

## Observação final
Este arquivo foi atualizado para refletir o estado real consolidado do módulo após a limpeza, auditoria, centralização e regressão offline final.

Se o comportamento futuro divergir deste resumo, o código e os logs atuais passam a ser a fonte de verdade.
npm run build
node dist/main.js
```

### Simular mensagem interna
Exemplo:
```bash
curl -s -X POST "http://localhost:3000/api/salgaderia/simular" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+5511999999999","text":"Quero 25 coxinhas para amanhã às 18:00, retirada"}'
```

### O que observar
- resposta JSON do endpoint
- logs do `AiService`
- logs do `SalgaderiaService`
- persistência em banco
- coerência entre dados faltantes e resposta da IA

---

## Situação atual resumida
### Já está melhor resolvido
- remoção dos fallbacks de bot mais explícitos
- IA devolvendo envelope estruturado
- base de conhecimento sem roteiro engessado
- fluxo interno por simulador funcionando
- build funcionando
- backend subindo

### Ainda precisa de refinamento
- estabilidade da resposta da IA em saudações simples
- qualidade da resposta para perguntas de cardápio
- consistência ao pedir dados faltantes
- regressão interna repetida até estabilizar o comportamento

---

## Próxima direção recomendada
1. continuar testando exclusivamente via simulador interno
2. criar bateria de cenários de regressão local
3. refinar o prompt com exemplos negativos/positivos de comportamento
4. avaliar se vale introduzir camada de validação semântica leve apenas para impedir respostas claramente incoerentes
5. só depois voltar a validar no canal WhatsApp real

---

## Resumo final
Hoje o projeto já está mais próximo de um **runtime de integração WhatsApp + IA** do que de um bot tradicional.
A arquitetura principal foi corrigida para colocar a IA no centro da decisão.
O backend está funcionando como motor de contexto, memória, persistência e execução.

O ponto que ainda precisa de trabalho não é mais a estrutura-base, e sim o **refinamento do comportamento do modelo** nos testes internos.
