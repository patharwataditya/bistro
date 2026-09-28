import { zodResolver } from '@hookform/resolvers/zod'
import { UserPlus } from 'lucide-react'
import { useId, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useAction } from '@/features/common/useAction'
import { Button } from '@/ui/Button'
import { TextField } from '@/ui/Field'
import { Drawer } from '@/ui/Overlay'
import { staffApi } from './api'
import { applyServerErrors, DrawerActions, GroupLabel, Notice, PASSWORD_HINT, passwordProblem, useDiscardConfirm } from './manage-kit'
import { RolePicker } from './RolePicker'
import type { RoleOption } from './roleAssign'

const schema = z.object({
  full_name: z.string().trim().min(1, 'Enter their name').max(120, 'At most 120 characters'),
  username: z
    .string()
    .trim()
    .min(3, 'At least 3 characters')
    .max(40, 'At most 40 characters')
    .regex(/^[A-Za-z0-9._-]+$/, 'Letters, numbers, dots, dashes and underscores only'),
  password: z.string().superRefine((v, ctx) => {
    const problem = passwordProblem(v)
    if (problem) ctx.addIssue({ code: 'custom', message: problem })
  }),
  role_ids: z.array(z.number()).min(1, 'Pick at least one role.').max(20, 'At most 20 roles'),
})
type Form = z.infer<typeof schema>
const FIELDS = ['full_name', 'username', 'password', 'role_ids'] as const

export function AddStaffDrawer({ open, onClose, roles }: {
  open: boolean
  onClose: () => void
  roles: readonly (RoleOption & { description?: string | null })[]
}) {
  const [general, setGeneral] = useState<string | null>(null)
  const rolesLabel = useId()
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: '', username: '', password: '', role_ids: [] },
    mode: 'onTouched',
  })
  const { register, handleSubmit, control, formState, reset, setError } = form
  const password = useWatch({ control, name: 'password' })
  const create = useAction(staffApi.create, {
    invalidate: [['users']],
    success: (m) => `${m.full_name} can sign in now`,
    toastError: false,
    onSuccess: () => {
      reset()
      setGeneral(null)
      onClose()
    },
    onError: (e) => setGeneral(applyServerErrors(e, setError, FIELDS, { conflictField: 'username' })),
  })
  const discard = useDiscardConfirm(formState.isDirty)
  const close = () => discard.request(() => {
    reset()
    setGeneral(null)
    onClose()
  })

  const submit = handleSubmit((v) => {
    if (create.isPending) return
    setGeneral(null)
    create.mutate({ full_name: v.full_name.trim(), username: v.username.trim(), password: v.password, role_ids: v.role_ids })
  })

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(o) => !o && close()}
        title="Add staff"
        description="They sign in with this username and password."
        busy={create.isPending}
        footer={
          <DrawerActions
            secondary={<Button variant="secondary" onClick={close} disabled={create.isPending}>Cancel</Button>}
            primary={<Button type="submit" form="add-staff" variant="accent" icon={UserPlus} loading={create.isPending}>Create account</Button>}
          />
        }
      >
        <form id="add-staff" noValidate onSubmit={submit} className="flex flex-col gap-4 pb-4">
          {general && <Notice tone="danger" live>{general}</Notice>}
          <TextField label="Full name" autoComplete="off" maxLength={120} error={formState.errors.full_name?.message} {...register('full_name')} />
          <TextField
            label="Username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            hint="3–40 letters, numbers, dots, dashes or underscores"
            error={formState.errors.username?.message}
            {...register('username')}
          />
          <TextField
            label="Temporary password"
            type="password"
            autoComplete="new-password"
            maxLength={128}
            hint={password ? (passwordProblem(password) ?? 'Looks good') : PASSWORD_HINT}
            error={formState.errors.password?.message}
            {...register('password')}
          />
          <div>
            <GroupLabel id={rolesLabel}>Roles</GroupLabel>
            {roles.length === 0 ? (
              <Notice icon={UserPlus}>No roles are available to assign. Create a role first.</Notice>
            ) : (
              <Controller
                control={control}
                name="role_ids"
                render={({ field, fieldState }) => (
                  <RolePicker options={roles} value={field.value} onChange={field.onChange} error={fieldState.error?.message} labelledBy={rolesLabel} />
                )}
              />
            )}
          </div>
        </form>
      </Drawer>
      {discard.dialog}
    </>
  )
}
