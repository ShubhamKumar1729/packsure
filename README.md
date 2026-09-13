# PackSure

PackSure is an evidence-first, GovTech-oriented compliance workspace for packaged commodity inspections. It connects real package evidence, provider-independent AI assessment, configurable server-side rules, human review, product history, online listing comparison, dashboards, Compliance AI, and audit-ready reports.

The application intentionally does **not** seed products, inspections, users, reports, rules, analytics, demo credentials, or fake business data.

## Feature overview

### Authentication and access

- MongoDB-backed login with bcrypt password verification.
- Signed HTTP-only JWT session cookie with an eight-hour lifetime.
- Roles: `admin`, `inspector`, `reviewer`, and `viewer`.
- No public signup route and no default user.
- Server-side authorization is enforced on pages, APIs, evidence images, reports, product history, review actions, and assistant tools.

### Inspection capture and persistence

- New inspection workflow:

  `Dashboard → New Inspection → Product Information → Camera/Upload → Review → Save`

- Product name is required; other package fields are optional.
- Real browser camera capture through `navigator.mediaDevices.getUserMedia()`.
- Rear-camera preference for mobile devices.
- Permission, unavailable-camera, unsupported-browser, and camera-error states have upload fallback.
- Camera captures become JPEG `File` objects and use the same structure as uploaded images.
- Up to 10 package images, with `front`, `back`, `side`, `top`, and `bottom` labels.
- Images can be relabeled, reordered, removed, retaken, and reviewed before saving.
- Save creates real MongoDB documents:
  - `Product`
  - `Inspection`
  - One `InspectionImage` per image
- Image bytes are stored in MongoDB and served through authenticated image routes.
- Camera versus upload provenance is preserved.

### AI analysis

- Server-side provider abstraction in `src/lib/ai/types.ts`.
- Current `MockAIProvider` accepts real stored image bytes but intentionally returns no inferred OCR, fields, declarations, or business values.
- It cannot invent MRP, quantity, manufacturer, or contact information.
- A real model can replace it by implementing the `AIProvider` interface and registering it in `src/lib/ai/provider.ts`.
- The browser never calls an AI provider directly.

AI flow:

`Stored images → Provider → OCR/fields/declarations/measurements → Stored InspectionAnalysis`

### Compliance rules

- Compliance decisions are made only by the server-side rule engine.
- AI output is evidence for rules; it does not decide compliance.
- Exact statuses:
  - `PASS`
  - `VIOLATION`
  - `REVIEW_REQUIRED`
  - `NOT_APPLICABLE`
- Supported configurable rule kinds include field presence, declaration presence, numeric checks, measurements, patterns, and manual review.
- Rules store verified references, jurisdiction, severity, version, definition, and enabled state.
- Rules begin disabled and the database starts without legal thresholds or declarations.
- Administrators must supply verified legal references before enabling rules.
- Re-evaluating an inspection creates a new compliance run linked to the analysis used.

### Human review and final decision

The workflow is intentionally separated:

1. **AI Assessment** — provider output and server-side rule results.
2. **Human Review** — authorized reviewers accept/reject findings, correct values, and add comments.
3. **Final Decision** — authorized reviewers mark the inspection `COMPLIANT` or `VIOLATION`.

Human finding decisions:

- `PENDING`
- `ACCEPTED`
- `REJECTED`

Final decisions:

- `PENDING`
- `COMPLIANT`
- `VIOLATION`

Every human action is written to `ReviewAuditLog` with actor, timestamp, previous value/decision, new value/decision, and comments. Re-running AI analysis or compliance after finalization reopens the final decision and records that transition.

### Products and history

- Products page backed by MongoDB.
- Search by product name, brand, manufacturer, and batch/lot number.
- Product detail pages show:
  - Product metadata
  - Previous inspections
  - Compliance status and score
  - Findings and evidence history
  - Rule references and versions
  - Confidence information
  - Repeated finding signals
- Product and inspection history respects role ownership scope.

### Online listing comparison

Officers can enter an online product/listing URL during inspection capture or on an inspection detail page.

- Provider abstraction in `src/lib/marketplace/types.ts`.
- Generic server-side HTML/JSON-LD/meta extraction provider.
- Provider registry is ready for marketplace-specific adapters later.
- MRP is extracted only when the source explicitly labels it as MRP, maximum retail price, list price, or MSRP.
- Selling price is never automatically treated as MRP.
- Compared fields:
  - Product name
  - Brand
  - MRP
  - Net quantity/pack size
  - Manufacturer information
  - Important declarations
- Results use:
  - `MATCHED`
  - `MISMATCH`
  - `REVIEW_REQUIRED`
- Package evidence and online listing evidence are shown side by side.
- `MockMarketplaceProvider` exists only as an injected integration-test seam and is not used by production retrieval.

### Reports

- Reports are generated only from persisted inspection records.
- Reports contain product details, inspection details, stored images, AI metadata, declarations, compliance results, findings, rule references/versions, confidence, review decisions, final decision, and audit history.
- Reports can be viewed in the application and downloaded as self-contained HTML.
- Downloaded reports embed the real stored image bytes.
- Downloads refuse to generate when stored evidence images are unavailable instead of inserting blank placeholders.

### Dashboard

The dashboard reads directly from MongoDB and shows:

- Total inspections
- Compliance rate
- Violations
- Review required
- Recent inspections
- Compliance trend
- Most common violations
- Repeat violations by product and rule
- Transparent risk indicator

The risk indicator uses deterministic factors from real records:

- Repeated violations
- Violations in the last 30 days
- Finding severity
- Unresolved pending findings

No `Math.random()`, seeded analytics, fake charts, or placeholder business statistics are used. An empty database shows professional empty states. If MongoDB is unavailable, the dashboard shows a live-data connection state instead of making up values.

### Compliance AI assistant

A floating **Compliance AI** assistant is available inside authenticated record pages.

It is context-aware for:

- Inspections
- Individual findings
- Products and product history
- Reports

Example questions:

- Why did this inspection fail?
- Explain this violation.
- Show the evidence.
- Which finding is more serious?
- What happened in the previous inspection?
- Which rule caused this result?

All assistant data access goes through authorized backend tools in `src/lib/assistant/tools.ts` for:

- Inspections
- Findings
- Product history
- Evidence
- Rules
- Reports

The assistant provider never receives MongoDB access. The current `MockAssistantProvider` only summarizes returned records and clearly reports missing information. Responses are marked **AI Assessment** and explicitly do not change human review, final decisions, or audit history.

## Important routes

### Application pages

- `/login` — administrator-provisioned sign in
- `/app` — live dashboard
- `/app/new-inspection` — capture and save a real inspection
- `/app/inspections` — inspection queue
- `/app/inspections/:inspectionId` — inspection detail, evidence, analysis, rules, and listing comparison
- `/app/inspections/:inspectionId/review` — reviewer workspace
- `/app/products` — searchable product records
- `/app/products/:productId` — product history and repeated findings
- `/app/reports` — report generation and list
- `/app/reports/:reportId` — report view and download
- `/app/rules` — administrator-only rule configuration

### Main APIs

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/inspections`
- `GET /api/inspections`
- `POST /api/inspections/:id/analyze`
- `GET /api/inspections/:id/analysis`
- `POST /api/inspections/:id/compliance`
- `GET /api/inspections/:id/compliance`
- `GET/PATCH /api/inspections/:id/review`
- `POST /api/inspections/:id/review/final-decision`
- `GET /api/inspections/:id/images/:imageId`
- `GET /api/products?search=...`
- `GET/POST /api/inspections/:id/listing-comparison`
- `GET/POST /api/reports`
- `GET /api/reports/:id`
- `GET /api/reports/:id/download`
- `POST /api/assistant`
- `GET/POST /api/rules`

## Run locally in VS Code

### Prerequisites

- Node.js 20 or newer
- npm
- MongoDB running locally or a MongoDB Atlas connection
- VS Code
- A browser with camera support if testing camera capture

### 1. Open the project

In VS Code:

1. Open the PackSure project folder.
2. Open **Terminal → New Terminal**.
3. Confirm the terminal is at the project root, where `package.json` is located.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Edit `.env.local`:

```env
AUTH_SECRET=replace-with-a-long-random-secret
MONGODB_URI=mongodb://127.0.0.1:27017/packsure
AI_PROVIDER=mock
NODE_ENV=development
```

Generate a local secret on macOS/Linux with:

```bash
openssl rand -base64 32
```

Do not commit `.env.local`. It is ignored by `.gitignore`.

### 4. Start MongoDB

Use either a local MongoDB installation or MongoDB Atlas.

Example with Docker:

```bash
docker run --name packsure-mongo -p 27017:27017 -d mongo:7
```

Then use:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/packsure
```

If the container already exists:

```bash
docker start packsure-mongo
```

### 5. Provision a real local user

PackSure intentionally has no public signup route and does not create a default user. Use your approved administrator process to create a real user document in MongoDB.

The required `users` fields are:

- `email`
- `passwordHash` — bcrypt hash, not plaintext
- `role` — `admin`, `inspector`, `reviewer`, or `viewer`
- `isActive: true`
- `createdAt`
- `updatedAt`

For local-only testing, generate a bcrypt hash without saving it to the project:

```bash
node -e "const bcrypt=require('bcryptjs'); bcrypt.hash(process.argv[1], 12).then(console.log)" "REPLACE_WITH_YOUR_LOCAL_PASSWORD"
```

Insert the resulting hash through your approved local administration process. Do not commit real passwords, hashes, or credentials.

### 6. Start the development server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Then select **Sign in** and use the provisioned local user.

### 7. Test the complete journey

After signing in:

1. Open **Dashboard**.
2. Select **New inspection**.
3. Enter the real package information.
4. Enable the browser camera or use image upload.
5. Add at least one package image.
6. Review labels and image order.
7. Save the inspection.
8. Run **Analyze inspection**.
9. Run **Rule engine decision**.
10. Open **Human review** if findings were created.
11. Accept/reject findings, correct values, or add comments.
12. Set the final decision.
13. Generate and view a report.
14. Open the product record to review inspection history.
15. Return to the dashboard to see real metrics.
16. Open **Compliance AI** on the inspection, product, finding, or report page.

With `AI_PROVIDER=mock`, analysis will complete but intentionally return no inferred business values. This is expected. To test extracted fields and meaningful compliance statuses, implement and register a real server-side `AIProvider`.

### 8. Verify the project locally

```bash
npm run lint
npm run typecheck
npm run build
```

For a production-style local run after building:

```bash
npm run start
```

## Troubleshooting

### Login says authentication is not configured

Check that both `AUTH_SECRET` and `MONGODB_URI` are present in `.env.local`, then restart `npm run dev`.

### Dashboard shows live-data connection required

MongoDB is unreachable or the connection string is invalid. The dashboard intentionally does not substitute fake statistics.

### Dashboard is empty

The database is reachable but has no records in the current user’s access scope. Create a real inspection; do not seed demo data.

### Camera is unavailable

- Use `http://localhost:3000`, which browsers treat as a secure development origin.
- Allow camera permission.
- Check that a camera is available.
- Use the upload fallback when working in a browser or preview without camera hardware.

### AI returns no fields

This is expected with `AI_PROVIDER=mock`. The mock provider processes real image bytes but does not invent OCR or business values.

### Compliance is `NOT_APPLICABLE`

No enabled rules were available, or all configured rules were not applicable. An administrator must add verified rule definitions and enable them before meaningful compliance statuses can be produced.

## Security and source-control rules

- Never commit `.env.local`, secrets, passwords, database URLs, or credentials.
- Never add seed products, sample inspections, fake reports, demo users, or fake statistics.
- Keep AI and marketplace providers server-side.
- Keep MongoDB access inside backend routes and authorized backend tools.
- Use real stored evidence for inspections and reports.
- Review role permissions before deploying outside local development.
#   p a c k s u r e  
 