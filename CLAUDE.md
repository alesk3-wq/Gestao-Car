# CLAUDE.md — App de Checklist e Controle de Frota

Este arquivo dá o contexto do projeto para o Claude Code. Leia antes de gerar ou modificar código.

## 1. Contexto do Projeto

App web (mobile-first, PWA) para controle de uso de veículos da frota da empresa. Motoristas particulares fazem turnos com carros da empresa, atendendo demandas dos gestores (deslocamentos, compras, etc). A cada troca de turno é necessário registrar:

- Estado do veículo (avarias novas vs. pré-existentes)
- Nível de combustível (saída e retorno)
- KM inicial e final
- Paradas realizadas durante o turno
- Despesas do dia (refeições, pedágio, combustível, etc)

**Problema central que o app resolve:** identificar exatamente em qual turno / com qual condutor uma avaria surgiu. Hoje isso é registrado em papel (ver `checklist_veiculo_avarias.pdf` para referência do formato atual).

**Usuários:**
- **Condutores**: motoristas fixos da empresa (poucos, pré-cadastrados). Usam o app no celular durante o turno.
- **Gestor de frota**: acessa histórico, cadastra veículos/condutores, recebe alertas de avarias novas.

## 2. Stack Técnica

- **Frontend**: HTML + CSS + JavaScript vanilla (sem framework). Modularizado por telas.
- **PWA**: `manifest.json` + `service-worker.js` para instalação como app no celular. Página `instalar.html` com detecção iOS/Android/Desktop e fallback pra guia manual (mesma abordagem do repo T35 de referência do usuário).
- **Backend / DB**: Firebase
  - **Firebase Authentication** — email/senha apenas
  - **Cloud Firestore** — banco de dados
  - **Firebase Storage** — fotos de avarias e recibos
  - **Firebase Hosting** — deploy
- **Idioma da UI**: Português (BR). Textos de código (variáveis, funções) em inglês, comentários em português quando necessário.
- **Mobile-only**: layout 100% pensado para celular em orientação retrato. Admin acessa pelo próprio celular (não há layout desktop separado).

## 3. Estrutura de Pastas

```
projeto/
├── CLAUDE.md
├── firebase.json
├── .firebaserc
├── firestore.rules
├── storage.rules
└── public/
    ├── index.html                    # Splash/redirect (envia pra instalar ou login)
    ├── login.html                    # Tela de login
    ├── register.html                 # Cadastro (matrícula, nome, email, senha)
    ├── instalar.html                 # Página de instalação PWA (iOS/Android/Desktop)
    ├── manifest.json                 # PWA manifest
    ├── service-worker.js             # Service worker (cache offline básico)
    ├── pages/
    │   ├── home.html                 # Dashboard do condutor após login
    │   ├── vehicle.html              # Tela central do veículo (tabs avarias/combustível/km)
    │   ├── stops.html                # Registro de paradas
    │   ├── expenses.html             # Registro de despesas
    │   ├── summary.html              # Resumo/fechamento do turno
    │   └── admin/
    │       ├── vehicles.html         # Cadastro de veículos
    │       ├── drivers.html          # Cadastro de condutores
    │       └── history.html          # Histórico geral (visão gestor)
    ├── css/
    │   ├── design-system.css         # Variáveis CSS (cores, tipografia, spacing) — ver seção 5
    │   ├── components.css            # Botões, cards, inputs, modais, bottom-nav, tabs
    │   └── pages/
    │       ├── auth.css              # login + register + instalar (compartilham estilos)
    │       ├── home.css
    │       ├── vehicle.css
    │       ├── stops.css
    │       ├── expenses.css
    │       ├── summary.css
    │       └── admin.css
    ├── js/
    │   ├── firebase-config.js        # Inicialização do Firebase (config pública)
    │   ├── auth.js                   # Login, register, logout, guard de rota
    │   ├── db.js                     # Wrappers de Firestore (CRUD)
    │   ├── storage.js                # Upload de fotos
    │   ├── utils.js                  # Formatação de data/hora, moeda, etc
    │   ├── nav.js                    # Bottom-nav ativo por rota
    │   └── pages/
    │       ├── login.js
    │       ├── register.js
    │       ├── home.js
    │       ├── vehicle.js
    │       ├── stops.js
    │       ├── expenses.js
    │       ├── summary.js
    │       └── admin/
    │           ├── vehicles.js
    │           ├── drivers.js
    │           └── history.js
    └── assets/
        ├── icons/                    # Ícones PWA (192px, 512px) e favicon
        └── images/
            └── car-diagram.svg       # Diagrama do carro clicável pra marcar avarias
```

## 4. Design System (Uber-like, dark, mobile-first)

Referência estética: apps tipo Uber Driver / iFood Entregador — fundo preto, alto contraste, poucos elementos por tela, botão principal grande no fim da tela (thumb zone).

### Cores (variáveis CSS em `design-system.css`)

```css
:root {
  /* Backgrounds */
  --bg:              #0a0a0a;   /* fundo principal (quase preto) */
  --bg-surface:      #1a1a1a;   /* cards e inputs */
  --bg-elevated:     #242424;   /* modais, bottom-sheets, tabs ativas */

  /* Bordas */
  --border:          #2a2a2a;
  --border-strong:   #3a3a3a;

  /* Texto */
  --text:            #ffffff;
  --text-secondary:  #a0a0a0;
  --text-muted:      #6a6a6a;

  /* Cor de destaque (CTA principal) */
  --accent:          #00d47a;   /* verde vibrante — muda pra amber se preferir */
  --accent-hover:    #00b869;
  --on-accent:       #000000;   /* texto em cima do verde */

  /* Semânticos */
  --danger:          #ef4444;
  --warning:         #f59e0b;
  --success:         #22c55e;

  /* Tipografia */
  --font-sans:       -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  /* Espaçamento */
  --pad-sm: 0.5rem;
  --pad-md: 1rem;
  --pad-lg: 1.5rem;
  --pad-xl: 2rem;

  /* Border radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-full: 999px;
}
```

### Tipografia
- Título (h1): 24–28px, weight 700
- Subtítulo (h2): 18–20px, weight 600
- Corpo: 15–16px, weight 400
- Labels/hints: 13px, weight 500, `--text-secondary`
- **Nunca abaixo de 13px** em texto funcional.

### Componentes-chave

**Bottom Navigation (fixa no rodapé de toda tela pós-login):**
- Altura ~64px + safe-area-inset-bottom
- 5 ícones: Início, Veículo, Paradas, Despesas, Resumo
- Item ativo: ícone e label em `--accent`, demais em `--text-secondary`
- Fica em `position: fixed; bottom: 0` com `padding-bottom: env(safe-area-inset-bottom)` (importante pro notch/home-bar do iPhone).

**Botão primário (CTA):**
- Altura mínima **56px** (thumb-friendly)
- `background: var(--accent); color: var(--on-accent); border-radius: 12px`
- Ocupa toda largura, geralmente na parte de baixo da tela (`position: sticky; bottom: 80px` acima do bottom-nav)
- Fonte 16–17px, weight 600

**Botão secundário:**
- `background: transparent; border: 1px solid var(--border-strong); color: var(--text)`
- Mesma altura mínima.

**Card:**
- `background: var(--bg-surface); border-radius: 12px; padding: 1rem`
- Sem sombra (dark theme não precisa)
- Divisor interno: `border-top: 1px solid var(--border)`

**Input:**
- Altura mínima **52px**
- `background: var(--bg-surface); border: 1px solid var(--border); border-radius: 10px; padding: 0 16px; color: var(--text); font-size: 16px`
- **Importante**: `font-size: 16px` no input previne zoom automático no iOS
- Focus: `border-color: var(--accent)`
- Placeholder em `--text-muted`

**FAB (Floating Action Button) para "+ Parada" / "+ Despesa":**
- 56×56px, redondo (`border-radius: 50%`)
- `position: fixed; bottom: 88px; right: 16px` (acima do bottom-nav)
- Fundo `--accent`, ícone `--on-accent`

**Tabs (usadas na tela Veículo):**
- Fica no topo da tela abaixo do header
- Item ativo: fundo `--bg-elevated`, texto `--accent`, `border-bottom: 2px solid var(--accent)`

### Regras de layout

- **Safe areas**: sempre respeitar `env(safe-area-inset-top)` e `env(safe-area-inset-bottom)` (notch, home-bar).
- **Header**: 56px de altura, `position: sticky; top: 0`, com `padding-top: env(safe-area-inset-top)`. Fundo `--bg` para desaparecer visualmente.
- **Padding lateral do conteúdo**: 16px (nunca menor).
- **Espaçamento vertical entre seções**: 24px.
- **Alvos de toque**: mínimo 44×44px (Apple HIG) e preferência por 48×48px+.
- **Thumb zone**: ações principais SEMPRE no terço inferior da tela.

### Meta tags obrigatórias em toda página

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#0a0a0a">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Frota App">
<link rel="apple-touch-icon" href="assets/icons/icon-192.png">
<link rel="manifest" href="/manifest.json">
```

## 5. Modelo de Dados (Firestore)

### Coleção `drivers` (condutores)
```
{
  id: "auto",
  name: "João Silva",
  email: "joao@empresa.com",
  role: "driver" | "admin",
  defaultVehicleId: "veh_123" | null,
  active: true,
  createdAt: timestamp
}
```

### Coleção `vehicles` (veículos)
```
{
  id: "auto",
  model: "Toyota Corolla",
  plate: "ABC-1D23",
  fleetNumber: "FROTA-01",
  active: true,
  createdAt: timestamp
}
```

### Coleção `trips` (turnos/viagens) — documento principal do app
```
{
  id: "auto",
  driverId: "drv_123",
  driverName: "João Silva",           // desnormalizado para facilitar listagem
  vehicleId: "veh_456",
  vehiclePlate: "ABC-1D23",           // desnormalizado
  date: "2026-07-10",
  startTime: timestamp,
  endTime: timestamp | null,          // null enquanto turno aberto
  kmStart: 45230,
  kmEnd: 45412 | null,
  fuelStart: "1/2",                   // "vazio" | "1/4" | "1/2" | "3/4" | "cheio"
  fuelEnd: "1/4" | null,
  status: "open" | "closed",
  stops: [                            // array embutido (paradas sempre relacionadas ao turno)
    {
      id: "uuid",
      type: "escritório" | "fábrica" | "loja" | "shopping" | "restaurante" | "outro",
      name: "Shopping Bauru",
      arrivalTime: timestamp,
      departureTime: timestamp,
      notes: "Buscar documento"
    }
  ],
  expenses: [
    {
      id: "uuid",
      type: "refeição" | "água/lanche" | "pedágio" | "combustível" | "outro",
      value: 45.50,
      receiptNumber: "12345",
      description: "Almoço - restaurante X",
      receiptPhotoUrl: "storage://..." | null
    }
  ],
  totalExpenses: 145.30,               // calculado
  createdAt: timestamp,
  closedAt: timestamp | null
}
```

### Coleção `damages` (avarias) — separada para permitir histórico por veículo
```
{
  id: "auto",
  vehicleId: "veh_456",
  tripId: "trp_789",                   // turno em que foi registrada
  driverId: "drv_123",
  driverName: "João Silva",
  type: "new" | "preexisting",         // nova (surgiu no turno) ou pré-existente (herdada)
  location: "front-left" | "rear-bumper" | ... ,  // ponto do diagrama
  description: "Arranhão de ~10cm na porta dianteira esquerda",
  photoUrls: ["storage://...", "..."],
  reportedAt: timestamp,
  resolved: false                       // gestor pode marcar como resolvida depois
}
```

## 6. Telas e Fluxos

### 6.1 Splash / Redirect (`index.html`)
- Detecta se está em modo standalone (PWA instalado):
  - Não instalado → redireciona pra `instalar.html`
  - Instalado + não logado → `login.html`
  - Instalado + logado → `pages/home.html` (ou `pages/admin/history.html` se for admin)
- Nada de UI complexa aqui, só um loader curto e o redirect.

### 6.2 Instalar (`instalar.html`)
- Detecta iOS/Android/Desktop via user-agent + `display-mode: standalone`
- Android: usa evento `beforeinstallprompt` pra mostrar botão nativo. Fallback: guia manual (menu → adicionar à tela inicial) após timeout de 4s.
- iOS: guia manual (Safari → Compartilhar → Adicionar à Tela de Início)
- Desktop: mensagem "acesse pelo celular" + link direto pro login
- **Basear no `instalar.html` do repo T35 do usuário** (referência: `github.com/alesk3-wq/T35`).

### 6.3 Login (`login.html`)
- Email + senha (Firebase Auth)
- Link "Esqueceu a senha?" → Firebase `sendPasswordResetEmail`
- Link "Criar conta" → `register.html`
- Após login, verificar `role` do usuário no Firestore:
  - `driver` → `pages/home.html`
  - `admin` → `pages/admin/history.html`

### 6.4 Cadastro (`register.html`)
Campos, nesta ordem:
1. **Nome completo**
2. **Matrícula** (identificador interno da empresa — string, obrigatório, único)
3. **Email**
4. **Senha** (mínimo 6 caracteres — mínimo do Firebase Auth)

Fluxo:
- Cria user no Firebase Auth
- Cria documento em `drivers/{uid}` com `{ name, matricula, email, role: "driver", active: true, createdAt }`
- Valida `matricula` única antes de criar (query em `drivers` where `matricula == X`)
- Redireciona pra `pages/home.html`

### 6.5 Home do Condutor (`pages/home.html`)
- Saudação com nome do condutor (auto-preenchido do Auth)
- Card do veículo atribuído (se houver `defaultVehicleId`) ou dropdown pra escolher
- Botão grande **"Iniciar Turno"** (cria `trip` com `status: "open"`) — sticky no bottom, acima do nav
- Se já houver turno aberto: card grande do turno em andamento + botão **"Continuar Turno"**
- Bottom-nav com 5 abas: Início | Veículo | Paradas | Despesas | Resumo

### 6.6 Veículo (`pages/vehicle.html`) — tela central
Três sub-abas (tabs no topo, controladas por JS — não são páginas separadas):

**a) Avarias**
- Ao iniciar turno: mostra avarias já registradas no veículo (últimas 5, com fotos) pro condutor conferir
- Diagrama SVG do carro clicável (vistas: frente/traseira/laterais/topo) — condutor toca no local do dano
- Formulário: descrição + upload de foto(s) (usar `<input type="file" accept="image/*" capture="environment">` pra abrir a câmera direto no celular)
- Botão "Registrar Avaria Nova" grava em `damages` com `type: "new"` e dispara notificação pro gestor
- **Handoff visual**: no início do turno, mostrar lado a lado "última foto do veículo (turno anterior)" vs "sua foto agora" pra comparar

**b) Combustível**
- Slider visual com 5 posições (Vazio, 1/4, 1/2, 3/4, Cheio) — igual ao PDF de referência
- Registra `fuelStart` no início e `fuelEnd` no fechamento

**c) KM / Percurso**
- Input numérico para `kmStart` e `kmEnd` (`inputmode="numeric"` pra abrir teclado numérico)
- Mostra KM rodados quando o turno fecha

### 6.7 Paradas (`pages/stops.html`)
- Lista de paradas do turno atual (cards verticais)
- **FAB "+ Nova Parada"** flutuante no canto inferior direito → abre bottom-sheet modal:
  - Tipo (dropdown: escritório, fábrica, loja, shopping, restaurante, outro)
  - Nome do local
  - Hora chegada / hora saída (auto-preenche com "agora" mas editável)
  - Observações
- Cada parada aparece como card, tap-and-hold ou swipe pra editar/remover

### 6.8 Despesas (`pages/expenses.html`)
- Total do dia grande no topo (chamativo)
- Lista de despesas em cards
- **FAB "+ Nova Despesa"** flutuante → bottom-sheet:
  - Tipo, valor, nº recibo, descrição
  - Botão "Anexar foto do recibo" (opcional)

### 6.9 Resumo / Fechamento (`pages/summary.html`)
- Mostra todos os dados do turno consolidados (KM rodados, tempo, combustível saída/retorno, gastos totais, avarias registradas)
- Botão **"Fechar Turno"** grande, cor `--warning` (amarelo) → confirmação → grava `fuelEnd`, `kmEnd`, `endTime`, muda `status` para `closed`
- Após fechado: botão **"Exportar PDF"** → gera PDF com layout similar ao checklist original

### 6.10 Admin — Cadastros e Histórico
- `pages/admin/vehicles.html`: CRUD de veículos (lista + FAB pra adicionar)
- `pages/admin/drivers.html`: CRUD de condutores (email vira login no Auth). Aqui o admin pode pré-criar contas antes do motorista se cadastrar sozinho.
- `pages/admin/history.html`: lista de turnos com filtros (por veículo, por condutor, por período), timeline de avarias por veículo

## 7. Features Extras Combinadas

1. **Handoff automático de turno**: ao iniciar, mostrar fotos e avarias do fechamento anterior lado a lado com o que o condutor está registrando agora.
2. **Diagrama do carro clicável** para marcar localização de avarias (SVG em `assets/images/car-diagram.svg`).
3. **Timestamp + geolocalização** nas fotos (usar `navigator.geolocation` e gravar coords no Storage metadata).
4. **Notificação ao gestor** quando avaria nova é registrada (via Cloud Functions + FCM, ou simples email via SendGrid — deixar como TODO na v1).
5. **Alerta de combustível baixo** no fechamento de turno.
6. **Export PDF** do turno mantendo layout familiar do checklist atual.
7. **Histórico por veículo** com timeline de avarias e condutores.

## 8. Convenções de Código

- **Nomes de variáveis/funções**: inglês, camelCase
- **Nomes de arquivos**: kebab-case (`vehicle.html`, `firebase-config.js`)
- **Textos de UI**: português brasileiro
- **CSS**: usar variáveis CSS no `global.css` para cores, espaçamentos e tipografia. Evitar `!important`.
- **JS**: módulos ES6 (`import`/`export`), usar `type="module"` nos `<script>`.
- **Firebase SDK**: usar CDN modular v9+ (tree-shakable), não a versão namespaced antiga.
- **Comentários**: só onde a intenção não é óbvia. Sem redundância.
- **Sem dependências extras** na v1 além do Firebase SDK. Se precisar de PDF export, avaliar `jsPDF` via CDN.

## 9. Regras de Segurança Firestore (base)

- Condutor só lê/escreve seus próprios `trips` e `damages`
- Condutor lê `vehicles` (para saber qual está atribuído) mas não escreve
- Admin lê/escreve tudo
- Ninguém deleta `trips` fechados (auditoria)

Escrever regras em `firestore.rules` com essa lógica antes do deploy.

## 10. Roadmap Sugerido de Implementação

**Fase 1 — MVP funcional (foco em fluxo de ponta-a-ponta):**
1. Setup Firebase (Auth + Firestore + Hosting)
2. Setup PWA básico (`manifest.json` + página `instalar.html`)
3. Login + Cadastro (com matrícula)
4. Home + Cadastros admin (veículos e condutores)
5. Fluxo básico de turno: iniciar → registrar KM/combustível → fechar
6. Registro de paradas e despesas

**Fase 2 — Diferenciais (o que torna o app útil):**
7. Avarias com upload de foto e diagrama clicável
8. Handoff visual (comparação turno anterior vs atual)
9. Histórico e filtros no admin
10. Service worker completo (cache offline dos assets)

**Fase 3 — Polimento:**
11. Export PDF
12. Notificações ao gestor
13. Otimizações de performance e UX

## 11. Notas Importantes

- Não versionar chaves privadas. `firebase-config.js` só contém config pública (safe pra front-end).
- Antes de qualquer feature nova, verificar se já existe util em `js/utils.js` ou `js/db.js` — evitar duplicação.
- Todo `trip` fechado é imutável (auditoria). Correções são feitas por admin criando um registro de "ajuste".
- Fotos no Storage: organizar em pastas por `vehicleId/tripId/` pra facilitar limpeza futura.
- **Referência de código do usuário**: o repo `github.com/alesk3-wq/T35` tem exemplos práticos que devem ser reaproveitados — especialmente `instalar.html` (PWA install), `manifest.json`, padrão de `login.html` e a estrutura de `assets/css/design-system.css`. Reutilize a mesma abordagem de detecção de plataforma, overlay pós-install e fallback manual.
- **Testar sempre no celular real** (ou emulador Chrome DevTools mobile). Desktop pode enganar sobre altura de teclado, safe areas, tap targets.
