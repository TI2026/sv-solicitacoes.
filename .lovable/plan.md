

# Plan: Surgical Corrections and Hardening (7 Blocks)

## Summary

This plan addresses 7 targeted corrections across the existing system: approval chain dynamic types, master visibility, dashboard improvements, hiding Diária for colaborador, exam step 4 fix, profile photo resize, and route-level security hardening. All changes are incremental, non-destructive, and limited to the files specified.

---

## Block 1: Approval Chains Tab — Dynamic Approver Types

**Files:** `ApprovalChainsTab.tsx`, `usePermissionsData.ts`

**Current problem:** The `StepDraft` interface only has `approverUserId` + `stepOrder`. The DB table `approval_flow_steps` already has `approver_type`, `fixed_sector_id` columns, but the frontend ignores them.

**Changes in `usePermissionsData.ts`:**
- Update `useSaveApprovalFlow` mutation params to accept new `StepDraft` shape: `{ stepOrder, approverType, fixedUserId, fixedSectorId }`
- On insert, write `approver_type`, `approver_user_id` (set to `fixedUserId` for `usuario_fixo`, or a placeholder UUID for dynamic types since column is NOT NULL), `fixed_sector_id`
- Add `useSectors()` hook (simple query on `sectors` table, active only)

**Changes in `ApprovalChainsTab.tsx`:**
- Replace `StepDraft` interface with: `{ stepOrder, approverType, fixedUserId, fixedSectorId }`
- On load (`openEditFlow`): map existing steps with fallback — if `approver_type` is null, assume `usuario_fixo`; if `fixed_user_id` is null but `approver_user_id` exists, use it as `fixedUserId`
- Each step row renders:
  - Select for `approverType` (5 options with labels from `approvalLabels.ts`)
  - Conditionally: user select (for `usuario_fixo`), sector select (for `responsavel_do_setor_especifico`), or helper text (for the 3 automatic rules)
- Validation: block save if `usuario_fixo` without user, or `responsavel_do_setor_especifico` without sector
- Display in flow summary: Badge showing `[Type Label] User/Sector` per step

**Note on `approver_user_id` NOT NULL constraint:** The column `approver_user_id` on `approval_flow_steps` is NOT NULL. For dynamic types (non-fixed user), we'll need a DB migration to make it nullable, OR we store the `created_by` user as a placeholder. Migration approach is cleaner — we'll add a migration to `ALTER TABLE approval_flow_steps ALTER COLUMN approver_user_id DROP NOT NULL`.

---

## Block 2: Master Visibility & Permissions

**Files:** `AuthContext.tsx` (no change needed — master detection already via `useIsMaster` in DashboardPage), `AppLayout.tsx`, `PermissionsPage.tsx`

**Changes:**
- Create a small reusable hook `src/hooks/useIsMaster.ts` extracting the logic already in `DashboardPage.tsx` (query `user_role_assignments` joined with `roles.is_master`)
- In `PermissionsPage.tsx`: use `useIsMaster()` alongside `hasAnyRole(['diretoria'])` — show admin tabs if either is true
- In `AppLayout.tsx`: restrict "Auditoria", "Setores", "Permissões" nav items to `canManage` OR `isMaster` (currently Permissões shows for everyone — restrict admin tabs within the page, but keep menu visible for "Minhas Aprovações")

---

## Block 3: Dashboard — Master vs Non-Master

**File:** `DashboardPage.tsx`

**Current state:** Already has `useIsMaster()` hook and `canSeeFinancials` flag. Queries load all data for everyone.

**Changes:**
- For non-admin/non-master users: scope `fuel_requests` query to `requester_user_id = user.id` (RLS already does this, but we make the intent explicit)
- Remove the `admData` query entirely for non-RH users (already gated by `enabled: isRH`, good)
- For non-master: hide charts (byType, byStatus financial charts) — keep only count-based metrics
- Add a "Master" section at top when `isMaster`: quick stats row with total users count, pending approvals count, and a link to admin areas
- Keep existing structure, just conditionally render more for master

---

## Block 4: Hide Diária Tab for Colaborador

**File:** `FleetListPage.tsx`, `FleetNewPage.tsx`

**Changes in `FleetListPage.tsx`:**
- Add `const canSeeDiaria = hasAnyRole(['diretoria', 'administrativo']);`
- Wrap the `<TabsTrigger value="diaria">` and `<TabsContent value="diaria">` in `{canSeeDiaria && ...}`
- If `activeTab === 'diaria'` and `!canSeeDiaria`, force `activeTab` to `'abastecimento'`
- Hide "Nova" button when `activeTab === 'diaria' && !canCreateDiaria` (already partially done)

**Changes in `FleetNewPage.tsx`:**
- If `initialType === 'diaria'` and user doesn't have `['diretoria', 'administrativo']`, redirect to `/fleet/new?type=abastecimento` or navigate away
- Add a guard at top of component

---

## Block 5: Exam Step 4 — Visual Separation & Fix

**File:** `AdmissionDetailPage.tsx` (ExamSection component, lines ~893-1071)

**Current state:** The ExamSection already works with subparts (schedule → result → attachment → advance), but the `ExamAttachmentUpload` appears always (even before result is registered), and the visual separation is poor.

**Changes:**
- Only render `<ExamAttachmentUpload>` when `examResolved` is true (after result is registered) — this implements the "show attachment only after result" requirement
- Add clear visual section headers:
  - "A — Agendamento" (when no exam exists)
  - "B — Resultado" (after exam is past)
  - "C — Anexo do Exame" (after result registered)
  - "D — Avançar" (always visible but disabled when not ready, with reason text)
- Always show the advance button area but with clear disabled state and reason text (e.g., "Registre o resultado do exame" or "Anexe o exame admissional")
- The `ExamAttachmentUpload` component itself is fine — the query invalidation already works. The issue is likely that `useAdmissionFiles` data doesn't refresh immediately. Add explicit `await qc.refetchQueries({ queryKey: ['admission_files', admissionId, 'EXAM'] })` after the insert in `ExamAttachmentUpload.tsx` to guarantee immediate state update.

---

## Block 6: Profile Photo with Client-Side Resize

**File:** `ProfilePage.tsx`

**Current problem:** Uploads raw file to `fleet` bucket (which is private), then calls `getPublicUrl()` — but the bucket is NOT public, so the URL won't work. Also no resize.

**Changes:**
- Create inline `resizeImage()` helper using Canvas API: max 512x512, JPEG 0.85 quality, returns Blob
- Before upload: resize the image
- Fix bucket issue: either use `admissions` bucket or create a proper public `avatars` bucket via migration. Since we can't modify storage schema, we'll use signed URLs instead of public URLs — change `getPublicUrl` to `createSignedUrl` with long expiry, or upload with `upsert: true` and use a signed URL approach.
- Actually, simpler fix: upload to `fleet` bucket (already exists), but use `createSignedUrl()` for the avatar URL and store the path (not public URL) in `avatar_url`. Then in `AppLayout`/`ProfilePage`, resolve it to a signed URL. BUT this would require changing how avatar is displayed everywhere.
- **Simplest approach:** Create a public `avatars` bucket via SQL migration. Upload resized image there. Use `getPublicUrl()`.
- Add cache-busting `?t=timestamp` to avatar URL (already done)

---

## Block 7: Route-Level Security Hardening

**File:** `App.tsx`

**Changes:**
- Import `RoleGuard` from `src/lib/roleGuard.tsx`
- Wrap sensitive routes with `RoleGuard`:
  - `/auditoria` → `roles={['diretoria', 'administrativo']}`
  - `/setores` → `roles={['diretoria']}`
  - `/admin/maintenance` → `roles={['diretoria']}`
- `/permissoes` stays accessible (has its own tab-level gating via `isAdmin`)
- In `FleetNewPage.tsx`: add guard for `diaria` type

---

## Database Migration Required

One migration with:
1. `ALTER TABLE approval_flow_steps ALTER COLUMN approver_user_id DROP NOT NULL;` — allow null for dynamic approver types
2. Create public `avatars` storage bucket with appropriate RLS

---

## Files Changed Summary

| File | Change |
|------|--------|
| `src/hooks/useIsMaster.ts` | **NEW** — reusable hook |
| `src/modules/permissions/hooks/usePermissionsData.ts` | Add `useSectors`, update `useSaveApprovalFlow` params |
| `src/modules/permissions/components/ApprovalChainsTab.tsx` | Full rewrite of step editing UI for dynamic types |
| `src/pages/PermissionsPage.tsx` | Use `useIsMaster` for tab visibility |
| `src/pages/DashboardPage.tsx` | Conditional rendering for master, scope queries |
| `src/modules/fleet/pages/FleetListPage.tsx` | Hide Diária tab for colaborador |
| `src/modules/fleet/pages/FleetNewPage.tsx` | Guard against diaria creation by URL |
| `src/modules/admissions/pages/AdmissionDetailPage.tsx` | ExamSection visual separation, conditional attachment render |
| `src/modules/admissions/components/ExamAttachmentUpload.tsx` | Add `refetchQueries` after upload |
| `src/pages/ProfilePage.tsx` | Add canvas resize, fix bucket usage |
| `src/App.tsx` | Add `RoleGuard` to sensitive routes |
| `src/components/AppLayout.tsx` | Minor nav visibility adjustments |
| Migration SQL | `approver_user_id` nullable + `avatars` bucket |

