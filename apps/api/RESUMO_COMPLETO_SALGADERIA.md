# Resumo completo do projeto — Salgaderia Crocante

## Visão geral
Este projeto é um backend NestJS que integra:
- WhatsApp como canal de entrada e saída
- OpenRouter como motor de IA
- PostgreSQL como memória persistente
- Google Calendar para apoio operacional após confirmação de pedido
- Baileys para conexão local com WhatsApp Web

A direção atual do projeto é:
**não tratar a salgaderia como um bot de fluxo fixo**, e sim como um **motor de integração orientado por IA**, onde a IA interpreta contexto, decide como responder e pode solicitar ações estruturadas ao backend.

---

## Objetivo atual do sistema
O sistema foi reformulado para que:
- a IA seja o cérebro do atendimento
- o backend seja o runtime de memória, ferramentas, persistência e transporte
- não existam respostas hardcoded de fallback simulando IA
- o histórico e os dados do cliente sejam usados como contexto real
- os testes possam ser feitos internamente, sem depender do WhatsApp real

---

## O que está rodando hoje
### Backend principal
- Framework: **NestJS**
- Linguagem: **TypeScript**
- Porta local: **http://localhost:3000**
- Endpoint de simulação interna: `POST /api/salgaderia/simular`

### Banco de dados
- **PostgreSQL** via TypeORM
- `synchronize: false` para evitar problemas de permissão no banco

### IA
- Provedor: **OpenRouter**
- Variáveis usadas:
  - `OPENROUTER_API_KEY`
  - `OPENROUTER_MODEL` (fallback atual: `openrouter/free`)

### Canal WhatsApp
- Integração por **Baileys**
- O WhatsApp real pode subir junto no processo, mas a validação pedida agora está sendo feita por **simulação interna**, não por mensagens reais

### Calendar
- O sistema mantém integração com **Google Calendar** para criar evento após confirmação do pedido

---

## Como o projeto está rodando hoje
### Fluxo principal atual
1. chega uma mensagem ao runtime
2. o backend carrega:
   - histórico recente
   - dados persistidos da conversa
   - memória operacional
   - configurações do negócio
3. a IA recebe esse contexto
4. a IA responde em JSON estruturado
5. o backend sanitiza e aplica:
   - resposta ao cliente
   - atualizações de memória
   - possíveis tool calls
6. se houver confirmação explícita, o pedido pode ser criado
7. se houver handoff, o sistema marca escalada para humano

---

## Arquitetura atual por arquivo
### `src/modules/salgaderia/ai.service.ts`
Responsável por:
- montar o contexto para a IA
- carregar a base de conhecimento local
- chamar OpenRouter
- reparar JSON quando o modelo retorna quebras inválidas
- sanitizar o retorno da IA
- normalizar dados como:
  - sabores
  - bebidas
  - data de exibição
  - tool calls

Contrato atual esperado da IA:
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
- criar pedido confirmado
- acionar Google Calendar
- acionar handoff humano
- integrar com o transporte do WhatsApp

### `src/modules/salgaderia/script-atendimento.md`
Hoje virou uma **base de conhecimento operacional**, não mais um roteiro de bot.
Contém:
- cardápio oficial
- regras comerciais
- mínimos por sabor
- descontos
- regras de pagamento
- quando escalar para humano
- dados do estabelecimento

### `src/modules/salgaderia/salgaderia.controller.ts`
Responsável por endpoints do módulo.
Destaques:
- `POST /api/salgaderia/simular` → principal endpoint para teste interno
- `GET /api/salgaderia/pedidos`
- `GET /api/salgaderia/clientes`
- `GET /api/salgaderia/configuracoes`

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
### 1. O projeto não pode simular IA com fallback de bot
Foi removida a ideia de respostas prontas do tipo:
- saudação fixa
- regex de intenção
- parser simples de item como substituto da IA
- fallback com texto hardcoded quando a IA falha

### 2. A IA precisa devolver decisão estruturada
Em vez de devolver somente “resposta + etapa”, agora a IA devolve um envelope que permite:
- resposta ao cliente
- memória operacional
- sinais de handoff
- sinal de criação de pedido
- tool calls controladas pelo backend

### 3. O histórico persistido é essencial
A conversa salva em banco é a base para o atendimento contextual.
Sem isso, a IA fica parecendo fluxo isolado.

### 4. O backend deve validar, não conversar no lugar da IA
O backend continua responsável por:
- integridade dos dados
- persistência
- criação de pedido
- cálculo de preço
- integração com outros serviços

Mas não deve inventar a conversa no lugar do modelo.

### 5. Teste offline deve acontecer por simulação interna
O modo correto de validar este projeto, conforme orientação atual, é:
- **sem WhatsApp real**
- usando endpoint local
- observando logs e respostas do runtime

---

## Estado atual dos testes internos
Os testes mais recentes foram feitos com:
`POST /api/salgaderia/simular`

### Cenários já testados internamente
1. Saudação simples (`oi`)
2. Pergunta de cardápio (`Quais sabores vocês têm de assado?`)
3. Pedido parcial (`Quero 25 coxinhas para amanhã às 18:00, retirada`)

### Resultado observado
O runtime está:
- subindo corretamente
- respondendo via IA pelo endpoint interno
- persistindo memória e histórico
- convertendo data relativa em data absoluta em alguns cenários
- normalizando sabor `coxinha` para `Coxinha`

### Problemas ainda observados nos testes
Apesar da estrutura ter melhorado, a qualidade da resposta da IA ainda oscila em cenários simples, por exemplo:
- saudação às vezes vem excessivamente longa
- pergunta sobre assados pode vir genérica demais
- pedido parcial pode responder sem pedir todos os dados faltantes

Ou seja:
**a arquitetura está mais correta, mas o comportamento da IA ainda precisa de refinamento de prompt e regressão interna contínua.**

---

## Regras de negócio atuais da salgaderia
### Fritos
- Coxinha
- Quibe
- Risole
- Bolinha de queijo
- R$ 25,00 por pacote de 25 unidades
- mínimo de 25 por sabor
- múltiplos de 25
- 10% de desconto a partir de 100 fritos somados

### Assados
- Pizza
- Quatro queijos
- Frango com catupiry
- Carne
- Brócolis com catupiry
- R$ 25,00 por pacote de 10 unidades
- mínimo de 10 por sabor
- múltiplos de 10
- 15% de desconto a partir de 50 assados somados

### Bebidas
- Coca-Cola 2L — R$ 18,00
- Guaraná Antarctica 2L — R$ 15,00

### Não oferecer
- doces
- sabores fora da lista
- outros tamanhos/marcas não listados
- quantidades abaixo do mínimo por sabor

---

## Script/base de atendimento atual sintetizado
A base atual orienta a IA com estes princípios:
- agir como agente de atendimento da Salgaderia Crocante
- não agir como bot de fluxo fixo
- usar histórico e memória antes de perguntar de novo
- não inventar status, itens, preços ou dados do cliente
- responder naturalmente
- não forçar fechamento quando a pessoa está só consultando
- só considerar pedido confirmado com confirmação explícita
- escalar para humano em reclamação séria, exceção operacional, pedido grande ou impasse

---

## Como testar internamente hoje
### Subir backend
No diretório `apps/api`:
```bash
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
