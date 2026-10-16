import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { createColumnHelper, flexRender, tableFeatures, useTable } from '@tanstack/react-table'
import { Briefcase, MoreHorizontal, Plus } from 'lucide-react'
import { type ReactNode, useCallback, useMemo, useState } from 'react'
import { type FieldError, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ConfirmDelete } from '@/admin/components/confirm-delete'
import { FieldMessage, fieldKey, fieldProps } from '@/admin/components/form-field'
import { useT } from '@/admin/i18n/use-t'
import { ApiError, errorMessage } from '@/admin/lib/errors'
import {
  type AdminExperience,
  createExperience,
  deleteExperience,
  EXPERIENCE_KINDS,
  type ExperienceInput,
  listExperience,
  updateExperience,
} from '@/admin/lib/experience'
import { monthFormatter } from '@/admin/lib/format'
import { type PanelLanguage, useLanguage } from '@/admin/lib/language'
import { refreshPublishStatus } from '@/admin/lib/publish'
import { Badge } from '@/admin/ui/badge'
import { Button } from '@/admin/ui/button'
import { Checkbox } from '@/admin/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/admin/ui/dropdown-menu'
import { Input } from '@/admin/ui/input'
import { Label } from '@/admin/ui/label'
import { NativeSelect } from '@/admin/ui/native-select'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/admin/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/admin/ui/table'
import { Textarea } from '@/admin/ui/textarea'

export const Route = createFileRoute('/admin/_authed/experience')({
  loader: async () => {
    try {
      return await listExperience()
    } catch (err) {
      // apiFetch already tried a refresh, so a 401 means the session is gone.
      if (err instanceof ApiError && err.status === 401) throw redirect({ to: '/admin/login' })
      // Other errors go to the error boundary. A 500 is no reason to ask for a password.
      throw err
    }
  },
  component: ExperiencePage,
})

// No sorting: rows stay in the API's order, newest start date first, as on the site.
const features = tableFeatures({})

const columnHelper = createColumnHelper<typeof features, AdminExperience>()

const KIND_LABEL = { work: 'kindWork', education: 'kindEducation' } as const

// The panel language picks which of the two translations a row shows.
const organizationIn = (row: AdminExperience, language: PanelLanguage) =>
  language === 'mn' ? row.organization_mn : row.organization_en

const positionIn = (row: AdminExperience, language: PanelLanguage) =>
  language === 'mn' ? row.position_mn : row.position_en

type Editing = { entry: AdminExperience | null } | null

function ExperiencePage() {
  const t = useT()
  const language = useLanguage()
  const router = useRouter()
  const items = Route.useLoaderData()

  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<AdminExperience | null>(null)

  const formatMonth = useMemo(() => monthFormatter(language), [language])
  const period = useCallback(
    (row: AdminExperience) =>
      `${formatMonth(row.start_date)} – ${row.end_date !== null ? formatMonth(row.end_date) : t.present}`,
    [formatMonth, t],
  )

  const confirmDelete = async () => {
    if (deleting === null) return
    try {
      await deleteExperience(deleting.id)
      toast.success(t.deleted)
      setDeleting(null)
      await router.invalidate()
      void refreshPublishStatus()
    } catch (err) {
      toast.error(errorMessage(err, t))
    }
  }

  // columnHelper.columns(), not a plain array. A plain array of mixed value types fails to type.
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: 'period',
          header: t.colPeriod,
          cell: (info) => (
            <span className="text-muted-foreground tabular-nums">{period(info.row.original)}</span>
          ),
        }),
        columnHelper.accessor((row) => organizationIn(row, language), {
          id: 'organization',
          header: t.colOrganization,
          // The name button stretches over the whole row: click anywhere, one tab stop per row.
          cell: (info) => (
            <button
              type="button"
              onClick={() => setEditing({ entry: info.row.original })}
              className="block max-w-full truncate text-left font-medium after:absolute after:inset-0 focus-visible:outline-none"
            >
              {info.getValue()}
            </button>
          ),
        }),
        columnHelper.accessor((row) => positionIn(row, language), {
          id: 'position',
          header: t.colPosition,
          cell: (info) => (
            <span className="text-muted-foreground block truncate">{info.getValue()}</span>
          ),
        }),
        columnHelper.accessor('kind', {
          header: t.colKind,
          cell: (info) => <Badge variant="outline">{t[KIND_LABEL[info.getValue()]]}</Badge>,
        }),
        columnHelper.accessor('published', {
          header: t.colStatus,
          cell: (info) =>
            info.getValue() ? (
              <Badge variant="secondary">{t.statusPublished}</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                {t.statusHidden}
              </Badge>
            ),
        }),
        columnHelper.display({
          id: 'actions',
          header: '',
          cell: (info) => (
            <RowActions
              onEdit={() => setEditing({ entry: info.row.original })}
              onDelete={() => setDeleting(info.row.original)}
            />
          ),
        }),
      ]),
    [t, language, period],
  )

  const table = useTable({ features, data: items, columns })
  const rows = table.getRowModel().rows

  return (
    <section className="mx-auto max-w-6xl">
      <div className="flex items-center gap-3">
        <h1 className="text-h3 font-bold">{t.experienceTitle}</h1>
        <span className="text-muted-foreground tabular-nums">{items.length}</span>
        <Button size="sm" className="ml-auto" onClick={() => setEditing({ entry: null })}>
          <Plus aria-hidden />
          {t.newExperience}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="border-border rounded-base mt-6 flex flex-col items-center border border-dashed px-6 py-16 text-center">
          <Briefcase className="text-muted-foreground size-8" aria-hidden />
          <p className="mt-4 font-medium">{t.noExperience}</p>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">{t.noExperienceHint}</p>
        </div>
      ) : (
        <>
          <ul className="border-border rounded-base mt-6 divide-border divide-y border md:hidden">
            {rows.map((row) => {
              const entry = row.original
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setEditing({ entry })}
                    className="hover:bg-muted block w-full px-4 py-3 text-left transition-colors"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {organizationIn(entry, language)}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {period(entry)}
                      </span>
                    </span>
                    <span className="text-muted-foreground mt-1 block truncate text-sm">
                      {positionIn(entry, language)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="border-border rounded-base mt-6 hidden overflow-hidden border md:block">
            <Table className="table-fixed">
              <colgroup>
                <col className="w-44" />
                <col className="w-[30%]" />
                <col />
                <col className="w-28" />
                <col className="w-32" />
                <col className="w-14" />
              </colgroup>
              <TableHeader className="bg-muted">
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id} className="hover:bg-transparent">
                    {group.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="text-muted-foreground h-10 px-4 text-xs font-medium"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  // `relative` holds the name button's stretched hit area inside this row.
                  <TableRow
                    key={row.id}
                    className="has-focus-visible:ring-ring relative cursor-pointer has-focus-visible:ring-2 has-focus-visible:ring-inset"
                  >
                    {row.getAllCells().map((cell) => (
                      <TableCell key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Sheet open={editing !== null} onOpenChange={(isOpen) => !isOpen && setEditing(null)}>
        <SheetContent className="w-full gap-0 sm:max-w-2xl" closeLabel={t.close}>
          {editing !== null ? (
            <ExperienceForm
              key={editing.entry?.id ?? 'new'}
              entry={editing.entry}
              onDone={() => setEditing(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDelete
        name={deleting !== null ? organizationIn(deleting, language) : null}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </section>
  )
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const t = useT()
  return (
    // Above the name button's stretched hit area, so the menu opens instead of the sheet.
    <div className="relative z-10 flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t.rowActions}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>{t.edit}</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            {t.delete}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// What a date input yields. An empty input gives ''.
const DATE = /^\d{4}-\d{2}-\d{2}$/

const name = z.string().trim().min(1, fieldKey('fieldRequired')).max(200, fieldKey('fieldTooLong'))
const description = z.string().trim().max(2000, fieldKey('fieldTooLong'))

const schema = z
  .object({
    kind: z.enum(EXPERIENCE_KINDS),
    organization_mn: name,
    organization_en: name,
    position_mn: name,
    position_en: name,
    description_mn: description,
    description_en: description,
    start_date: z.string().regex(DATE, fieldKey('fieldDateRequired')),
    // Undefined while `present` is ticked: react-hook-form leaves disabled fields out, and the
    // payload sends null anyway.
    end_date: z.string().optional(),
    present: z.boolean(),
    published: z.boolean(),
  })
  // On the object, not on `end_date`: the rule needs `present` and `start_date` too.
  .superRefine((v, ctx) => {
    if (v.present) return
    if (v.end_date === undefined || !DATE.test(v.end_date)) {
      ctx.addIssue({ code: 'custom', path: ['end_date'], message: fieldKey('fieldDateRequired') })
    } else if (DATE.test(v.start_date) && v.end_date < v.start_date) {
      // Plain string order is date order for YYYY-MM-DD.
      ctx.addIssue({ code: 'custom', path: ['end_date'], message: fieldKey('fieldEndBeforeStart') })
    }
  })

type Values = z.infer<typeof schema>

function toInput(values: Values): ExperienceInput {
  const { present, end_date, ...rest } = values
  return { ...rest, end_date: present ? null : (end_date ?? null) }
}

function ExperienceForm({ entry, onDone }: { entry: AdminExperience | null; onDone: () => void }) {
  const t = useT()
  const router = useRouter()

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: entry?.kind ?? 'work',
      organization_mn: entry?.organization_mn ?? '',
      organization_en: entry?.organization_en ?? '',
      position_mn: entry?.position_mn ?? '',
      position_en: entry?.position_en ?? '',
      description_mn: entry?.description_mn ?? '',
      description_en: entry?.description_en ?? '',
      start_date: entry?.start_date ?? '',
      end_date: entry?.end_date ?? '',
      present: entry !== null && entry.end_date === null,
      published: entry?.published ?? true,
    },
  })

  const present = form.watch('present')

  const onSubmit = async (values: Values) => {
    try {
      const input = toInput(values)
      if (entry === null) await createExperience(input)
      else await updateExperience(entry.id, input)
    } catch (err) {
      toast.error(errorMessage(err, t))
      return
    }
    toast.success(t.saved)
    onDone()
    void router.invalidate()
    void refreshPublishStatus()
  }

  const { errors, isSubmitting } = form.formState

  return (
    // The form wraps header, body and footer so the footer's submit button belongs to it.
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex min-h-0 flex-1 flex-col"
      noValidate
    >
      <SheetHeader className="border-border border-b px-6 pt-6 pb-5">
        <SheetTitle className="font-display pr-8 text-xl font-bold">
          {entry === null ? t.newExperience : t.editExperience}
        </SheetTitle>
      </SheetHeader>

      <div className="grid flex-1 content-start gap-5 overflow-y-auto px-6 py-5">
        <div className="grid gap-2 sm:w-1/2 sm:pr-2">
          <Label htmlFor="kind">{t.colKind}</Label>
          <NativeSelect id="kind" {...form.register('kind')}>
            {EXPERIENCE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t[KIND_LABEL[kind]]}
              </option>
            ))}
          </NativeSelect>
        </div>

        <PairedFields
          label={t.colOrganization}
          mn={
            <Input
              lang="mn"
              {...fieldProps('organization_mn', errors.organization_mn)}
              {...form.register('organization_mn')}
            />
          }
          en={
            <Input
              lang="en"
              {...fieldProps('organization_en', errors.organization_en)}
              {...form.register('organization_en')}
            />
          }
          mnError={errors.organization_mn}
          enError={errors.organization_en}
          id="organization"
        />

        <PairedFields
          label={t.colPosition}
          mn={
            <Input
              lang="mn"
              {...fieldProps('position_mn', errors.position_mn)}
              {...form.register('position_mn')}
            />
          }
          en={
            <Input
              lang="en"
              {...fieldProps('position_en', errors.position_en)}
              {...form.register('position_en')}
            />
          }
          mnError={errors.position_mn}
          enError={errors.position_en}
          id="position"
        />

        <PairedFields
          label={t.description}
          mn={
            <Textarea
              lang="mn"
              className="min-h-32"
              {...fieldProps('description_mn', errors.description_mn)}
              {...form.register('description_mn')}
            />
          }
          en={
            <Textarea
              lang="en"
              className="min-h-32"
              {...fieldProps('description_en', errors.description_en)}
              {...form.register('description_en')}
            />
          }
          mnError={errors.description_mn}
          enError={errors.description_en}
          id="description"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="start_date">{t.startDate}</Label>
            <Input
              type="date"
              className="dark:scheme-dark"
              {...fieldProps('start_date', errors.start_date)}
              {...form.register('start_date')}
            />
            <FieldMessage id="start_date" error={errors.start_date} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="end_date">{t.endDate}</Label>
            <Input
              type="date"
              className="dark:scheme-dark"
              {...fieldProps('end_date', present ? undefined : errors.end_date)}
              // The register option, not a `disabled` prop: react-hook-form owns the state.
              {...form.register('end_date', { disabled: present })}
            />
            <div className="flex items-center gap-2">
              <Checkbox id="present" {...form.register('present')} />
              <Label htmlFor="present" className="font-normal">
                {t.present}
              </Label>
            </div>
            {present ? null : <FieldMessage id="end_date" error={errors.end_date} />}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox id="published" {...form.register('published')} />
          <Label htmlFor="published">{t.publishedToggle}</Label>
        </div>
      </div>

      <SheetFooter className="border-border flex-row justify-end border-t px-6 py-4">
        <Button type="button" variant="outline" onClick={onDone}>
          {t.cancel}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t.saving : t.save}
        </Button>
      </SheetFooter>
    </form>
  )
}

// One field in both languages, side by side from `sm` up. The controls arrive built, so each
// keeps its own `register` call and id (`<id>_mn`, `<id>_en`).
function PairedFields({
  id,
  label,
  mn,
  en,
  mnError,
  enError,
}: {
  id: string
  label: string
  mn: ReactNode
  en: ReactNode
  mnError: FieldError | undefined
  enError: FieldError | undefined
}) {
  const t = useT()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid content-start gap-2">
        <Label htmlFor={`${id}_mn`}>
          {label} ({t.langMn})
        </Label>
        {mn}
        <FieldMessage id={`${id}_mn`} error={mnError} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${id}_en`}>
          {label} ({t.langEn})
        </Label>
        {en}
        <FieldMessage id={`${id}_en`} error={enError} />
      </div>
    </div>
  )
}
