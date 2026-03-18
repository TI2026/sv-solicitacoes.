# Corrected Implementation Plan — Surgical Corrections & Hardening

## Critical Schema Facts (from inspection)

1. **`approval_flow_steps`** has: `approver_user_id` (NOT NULL), `approver_type` (NOT NULL, default `'usuario_fixo'`), `fixed_sector_id` (nullable). There is **NO `fixed_user_id` column** — `approver_user_id` serves this role for `usuario_fixo`.
2. **RPCs `start_approval_flow` and `process_approval_action`** both use `approver_user_id` directly for runtime resolution. Dynamic approver types are **NOT yet supported at runtime**.
3. **Storage buckets**: `fleet` and `admissions` are both **private**. No public `avatars` bucket exists.
4. **`/permissoes`** route is accessible to all users — the page itself gates admin tabs via `isAdmin`, keeping "Minhas Aprovações" visible to everyone.

---

## Block 1 — Approval Chains: Dynamic Approver Configuration

### Problem
The UI only supports `usuario_fixo` (1 step = 1 fixed user). The DB already has `approver_type` and `fixed_sector_id` columns, but:
- The UI ignores them
- The RPCs (`start_approval_flow`, `process_approval_action`) still resolve approvers exclusively via `approver_user_id`

### Architecture Decision
**Phase 1 (this implementation):** Update the UI to read/write `approver_type` and `fixed_sector_id`. For `usuario_fixo`, continue using `approver_user_id` as the fixed user ID. For dynamic types, store the `approver_type` and `fixed_sector_id` but **leave `approver_user_id` populated** with a sensible fallback (the flow creator's ID) — this preserves the NOT NULL constraint and keeps legacy RPCs functional until Phase 2.

**Phase 2 (future, NOT this implementation):** Update the backend RPCs to resolve dynamic approvers at runtime based on `approver_type`. This requires updating `start_approval_flow` to look up sector responsibles / managers dynamically.

### Honest Limitation
Until Phase 2, dynamic approver types are **configuration-only** — the UI will store the intent, but runtime execution still falls back to `approver_user_id`. The UI must clearly communicate this: display a warning badge on dynamic steps saying "Resolução automática pendente de ativação no backend".

### Changes

**`usePermissionsData.ts`:**
- Add `useSectors()` hook (query `sectors` table, active only)
- Update `useSaveApprovalFlow` mutation params to accept `StepDraft` with `{ stepOrder, approverType, fixedUserId, fixedSectorId }`
- On insert: write `approver_type`, `approver_user_id` (= `fixedUserId` for `usuario_fixo`, or `createdBy` as fallback for dynamic types), `fixed_sector_id`
- Query in `useApprovalFlows` already returns `approval_flow_steps(*)` — ensure `approver_type` and `fixed_sector_id` are included (they are, via `*`)

**`ApprovalChainsTab.tsx`:**
- Replace `StepDraft` interface:
  ```ts
  interface StepDraft {
    stepOrder: number;
    approverType: 'usuario_fixo' | 'diretor_do_setor_do_solicitante' | 'diretor_do_setor_do_colaborador_relacionado' | 'responsavel_do_setor_especifico' | 'gestor_imediato';
    fixedUserId: string | null;
    fixedSectorId: string | null;
  }
  ```
- On load (`openEditFlow`): map existing steps with fallback:
  - If `approver_type` is `'usuario_fixo'` (or missing/null), use `approver_user_id` as `fixedUserId`
  - `fixedSectorId` from `fixed_sector_id`
- Conditional rendering per `approverType`:
  - `usuario_fixo` → user select
  - `responsavel_do_setor_especifico` → sector select
  - Others → helper text explaining automatic resolution
- Badge on dynamic steps: `⚠️ Resolução automática (pendente ativação backend)`
- Validation: block `usuario_fixo` without user, `responsavel_do_setor_especifico` without sector
- Display in flow summary: `[Type Label] User/Sector`

### Files Changed
- `src/modules/permissions/hooks/usePermissionsData.ts`
- `src/modules/permissions/components/ApprovalChainsTab.ts`

### No DB Migration Needed
`approver_type` (NOT NULL, default `'usuario_fixo'`) and `fixed_sector_id` (nullable) already exist. `approver_user_id` stays NOT NULL.

---

## Block 2 — Master Visibility & Permissions

### Problem
Master detection uses `useIsMaster()` in `DashboardPage.tsx` but isn't reusable. Admin tabs in `PermissionsPage.tsx` only check `hasAnyRole(['diretoria'])`, missing master users who may not have the `diretoria` app_role.

### Changes

**New file `src/hooks/useIsMaster.ts`:**
- Extract the `useIsMaster()` hook from `DashboardPage.tsx` into a reusable hook
- Query `user_role_assignments` joined with `roles(is_master)` for current user

**`DashboardPage.tsx`:**
- Import from `src/hooks/useIsMaster.ts` instead of inline definition

**`PermissionsPage.tsx`:**
- Import `useIsMaster`
- Show admin tabs if `isAdmin || isMaster`

**`AppLayout.tsx`:**
- No change needed — Permissões nav item already shows for everyone (line 29: `show: true`), which is correct since "Minhas Aprovações" is accessible to all

### Files Changed
- `src/hooks/useIsMaster.ts` (NEW)
- `src/pages/DashboardPage.tsx`
- `src/pages/PermissionsPage.tsx`

---

## Block 3 — Dashboard Master vs Non-Master

### Problem
Dashboard loads all `fuel_requests` for everyone (RLS scopes it, but the intent should be explicit). Financial values are masked for non-master but data is still fetched. No differentiated master view.

### Changes

**`DashboardPage.tsx`:**
- For non-admin users: the query already respects RLS (returns only own requests), so data scope is correct server-side. No query change needed for security.
- For non-master users: hide financial charts (`byType` value chart, salary totals). Keep count-based metrics only.
- For master users: add a small "Admin Quick Stats" row at top of overview:
  - Total active users count (query `profiles` count)
  - Pending approvals count (query `approval_requests` where `status LIKE 'awaiting%'`)
  - Quick links to `/permissoes`, `/setores`, `/auditoria`
- Users online section for master only (see Block 2 addendum below)

### Users Online for Master
- Use Supabase Realtime Presence on a dedicated channel (`system:presence`)
- Each authenticated user tracks presence in `AppLayout.tsx` on mount
- Only master dashboard renders and reads the presence state
- Non-master users still track (so master can see them), but never read/display the list
- No persistent table needed — purely ephemeral Realtime Presence
- Implementation:
  - In `AppLayout.tsx`: join presence channel on mount, track `{ user_id, full_name }`, untrack on unmount
  - In `DashboardPage.tsx` (master only): subscribe to presence state, render online user count + list

### Files Changed
- `src/pages/DashboardPage.tsx`
- `src/components/AppLayout.tsx` (add presence tracking)

---

## Block 4 — Hide Diária for Colaborador

### Problem
The "Diária" tab appears in `FleetListPage.tsx` for all users. Colaborador can also navigate to `/fleet/new?type=diaria` directly.

### Changes

**`FleetListPage.tsx`:**
- Add `const canSeeDiaria = hasAnyRole(['diretoria', 'administrativo']);`
- Wrap `<TabsTrigger value="diaria">` in `{canSeeDiaria && ...}`
- Wrap `<TabsContent value="diaria">` in `{canSeeDiaria && ...}`
- If `activeTab === 'diaria' && !canSeeDiaria`, force to `'abastecimento'`
- Conditionally load diária query: `enabled: !!user && canSeeDiaria` on `useFuelRequests(user?.id, isAdmin, 'diaria')`
- Adjust TabsList `gridTemplateColumns` or `w-full` styling to account for 2 vs 3 tabs

**`FleetNewPage.tsx`:**
- At top of component: if `initialType === 'diaria' && !hasAnyRole(['diretoria', 'administrativo'])`, redirect to `/fleet/new?type=abastecimento`

### Files Changed
- `src/modules/fleet/pages/FleetListPage.tsx`
- `src/modules/fleet/pages/FleetNewPage.tsx`

---

## Block 5 — Exam Step 4 Visual Separation & Fix

### Problem
The `ExamSection` component shows the attachment upload (`ExamAttachmentUpload`) immediately after exam creation, even before the result is registered. Visual separation between subparts is poor. The advance button only appears when all conditions are met but doesn't explain why it's missing.

### Changes

**`AdmissionDetailPage.tsx` (ExamSection, lines ~893-1071):**
- Add visual section headers:
  - **A — Agendamento** (when no exam exists)
  - **B — Resultado do Exame** (after exam is scheduled and past)
  - **C — Anexo do Exame** (only render `ExamAttachmentUpload` when `examResolved` is true)
  - **D — Avançar** (always visible area with disabled state + reason text)
- Always show the advance area but with clear disabled state and reason:
  - If `!examResolved`: "Registre o resultado do exame"
  - If `examResolved && !hasExamAttachment`: "Anexe o exame admissional"
  - If `canAdvance`: active button
- Move `ExamAttachmentUpload` render from line 1021 to inside `{examResolved && (...)}` block

**`ExamAttachmentUpload.tsx`:**
- After successful upload, add explicit refetch: `await qc.refetchQueries({ queryKey: ['admission_files', admissionId, 'EXAM'] })`
- This is already mostly done (lines 67-68) but ensure `refetchQueries` (not just `invalidateQueries`) for immediate UI update

### Files Changed
- `src/modules/admissions/pages/AdmissionDetailPage.tsx`
- `src/modules/admissions/components/ExamAttachmentUpload.tsx`

---

## Block 6 — Profile Photo with Client-Side Resize

### Problem
Avatar uploads go to `fleet` bucket (private), then calls `getPublicUrl()` which returns a non-functional URL since the bucket isn't public.

### Chosen Strategy: Create public `avatars` bucket + client-side resize

**DB Migration:**
- Create public `avatars` storage bucket
- Add RLS policy: authenticated users can upload/update/delete their own avatars (`(bucket_id = 'avatars') AND (auth.uid()::text = (storage.foldername(name))[1])`)

**`ProfilePage.tsx`:**
- Add inline `resizeImage()` helper using Canvas API: max 512×512, JPEG quality 0.85, returns Blob
- Before upload: resize the image
- Upload to `avatars` bucket (public) instead of `fleet`
- Use `getPublicUrl()` from `avatars` bucket (works because bucket is public)
- Path: `avatars/{user.id}/avatar.jpg` (always overwrite)
- Cache-busting: append `?t=timestamp` to URL
- Update `profiles.avatar_url` with the public URL

### Files Changed
- `src/pages/ProfilePage.tsx`
- DB migration (create `avatars` bucket + RLS)

---

## Block 7 — Route Security Hardening

### Problem
`ProtectedRoute` only checks authentication. Sensitive routes like `/auditoria`, `/setores`, `/admin/maintenance` have no role-based route guard.

### Changes

**`App.tsx`:**
- Import `RoleGuard` from `src/lib/roleGuard.tsx`
- Wrap sensitive routes:
  - `/auditoria` → `<RoleGuard roles={['diretoria', 'administrativo']}>`
  - `/setores` → `<RoleGuard roles={['diretoria']}>`
  - `/admin/maintenance` → `<RoleGuard roles={['diretoria']}>`
- **DO NOT** wrap `/permissoes` — it must remain accessible for "Minhas Aprovações"
- `/configuracoes` stays accessible to all (profile-level settings)

**`FleetNewPage.tsx`:**
- Guard already added in Block 4

### Files Changed
- `src/App.tsx`

---

## Summary of All Files Changed

| File | Change |
|------|--------|
| `src/hooks/useIsMaster.ts` | **NEW** — reusable hook for master detection |
| `src/modules/permissions/hooks/usePermissionsData.ts` | Add `useSectors()`, update `useSaveApprovalFlow` for dynamic step types |
| `src/modules/permissions/components/ApprovalChainsTab.tsx` | Dynamic approver type UI with conditional fields, validation, legacy fallback |
| `src/pages/PermissionsPage.tsx` | Use `useIsMaster` alongside `hasAnyRole` for tab visibility |
| `src/pages/DashboardPage.tsx` | Extract `useIsMaster`, master quick stats, presence display, hide financials for non-master |
| `src/components/AppLayout.tsx` | Add Supabase Realtime Presence tracking on mount |
| `src/modules/fleet/pages/FleetListPage.tsx` | Hide Diária tab/content/query for colaborador |
| `src/modules/fleet/pages/FleetNewPage.tsx` | Guard against diária creation by URL for unauthorized users |
| `src/modules/admissions/pages/AdmissionDetailPage.tsx` | ExamSection visual separation, conditional attachment render, always-visible advance area |
| `src/modules/admissions/components/ExamAttachmentUpload.tsx` | Add `refetchQueries` after upload for immediate state update |
| `src/pages/ProfilePage.tsx` | Canvas resize, upload to public `avatars` bucket, fix URL strategy |
| `src/App.tsx` | Add `RoleGuard` to `/auditoria`, `/setores`, `/admin/maintenance` |
| DB migration | Create public `avatars` storage bucket with user-scoped RLS |

## What This Plan Does NOT Do (by design)
- Does NOT make `approver_user_id` nullable (RPCs depend on it)
- Does NOT store placeholder/fake UUIDs for dynamic approvers (stores flow creator's ID as documented fallback)
- Does NOT update backend RPCs for dynamic resolution (Phase 2)
- Does NOT block `/permissoes` route (keeps "Minhas Aprovações" accessible)
- Does NOT recreate any module or page
- Does NOT remove any existing functionality
