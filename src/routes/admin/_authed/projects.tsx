import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { createColumnHelper, flexRender, tableFeatures, useTable } from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  FolderKanban,
  ImageIcon,
  MoreHorizontal,
  Plus,
  Upload,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ConfirmDelete } from '@/admin/components/confirm-delete'
import { FieldMessage, fieldKey, fieldProps } from '@/admin/components/form-field'
import { useT } from '@/admin/i18n/use-t'
import { ApiError, errorMessage } from '@/admin/lib/errors'
import {
  type AdminProject,
  createProject,
  deleteProject,
  deleteProjectLogo,
  isLogoType,
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  listProjects,
  reorderProjects,
  updateProject,
  uploadProjectLogo,
} from '@/admin/lib/projects'
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
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/admin/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/admin/ui/table'
import { Textarea } from '@/admin/ui/textarea'

export const Route = createFileRoute('/admin/_authed/projects')({
  loader: async () => {
    try {
      return await listProjects()
    } catch (err) {
      // apiFetch already tried a refresh, so a 401 means the session is gone.
      if (err instanceof ApiError && err.status === 401) throw redirect({ to: '/admin/login' })
      // Other errors go to the error boundary. A 500 is no reason to ask for a password.
      throw err
    }
  },
  component: ProjectsPage,
})

// No sorting: the row order is the site's order, changed only with the arrows.
const features = tableFeatures({})

const columnHelper = createColumnHelper<typeof features, AdminProject>()

// `null` opens an empty form.
type Editing = { project: AdminProject | null } | null

function ProjectsPage() {
  const t = useT()
  const router = useRouter()
  const items = Route.useLoaderData()

  const [editing, setEditing] = useState<Editing>(null)
  // Bumped on every open. The form remounts per open, not per project, so pointing the sheet at
  // a project that was just created keeps the logo the admin picked.
  const [formKey, setFormKey] = useState(0)
  const [deleting, setDeleting] = useState<AdminProject | null>(null)
  const [reordering, setReordering] = useState(false)

  const open = useCallback((project: AdminProject | null) => {
    setFormKey((k) => k + 1)
    setEditing({ project })
  }, [])

  // Swap with the neighbour and send the whole list. The API takes nothing smaller.
  const move = useCallback(
    async (index: number, delta: -1 | 1) => {
      const ids = items.map((p) => p.id)
      const a = ids[index]
      const b = ids[index + delta]
      if (a === undefined || b === undefined) return
      ids[index] = b
      ids[index + delta] = a

      setReordering(true)
      try {
        await reorderProjects(ids)
        await router.invalidate()
        void refreshPublishStatus()
      } catch (err) {
        toast.error(errorMessage(err, t))
        // Another tab may have added or removed a project. Reload so the next try sends the
        // real list.
        void router.invalidate()
      } finally {
        setReordering(false)
      }
    },
    [items, router, t],
  )

  const confirmDelete = async () => {
    if (deleting === null) return
    try {
      await deleteProject(deleting.id)
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
          id: 'order',
          header: t.colOrder,
          cell: (info) => (
            <MoveButtons
              index={info.row.index}
              count={items.length}
              disabled={reordering}
              onMove={move}
            />
          ),
        }),
        columnHelper.accessor('logo_url', {
          header: t.colLogo,
          cell: (info) => <LogoThumb url={info.getValue()} />,
        }),
        columnHelper.accessor('title', {
          header: t.colTitle,
          // The title button stretches over the whole row: click anywhere, one tab stop per row.
          cell: (info) => (
            <button
              type="button"
              onClick={() => open(info.row.original)}
              className="block max-w-full truncate text-left font-medium after:absolute after:inset-0 focus-visible:outline-none"
            >
              {info.getValue()}
            </button>
          ),
        }),
        columnHelper.accessor('url', {
          header: t.colUrl,
          cell: (info) => (
            // Above the stretched title button, so the link opens instead of the sheet.
            <a
              href={info.getValue()}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground relative z-10 block truncate underline-offset-4 hover:underline"
            >
              {displayUrl(info.getValue())}
            </a>
          ),
        }),
        columnHelper.accessor('published', {
          header: t.colStatus,
          cell: (info) => <PublishedBadge published={info.getValue()} />,
        }),
        columnHelper.display({
          id: 'actions',
          header: '',
          cell: (info) => (
            <RowActions
              onEdit={() => open(info.row.original)}
              onDelete={() => setDeleting(info.row.original)}
            />
          ),
        }),
      ]),
    [t, items.length, reordering, move, open],
  )

  const table = useTable({ features, data: items, columns })
  const rows = table.getRowModel().rows

  return (
    <section className="mx-auto max-w-6xl">
      <div className="flex items-center gap-3">
        <h1 className="text-h3 font-bold">{t.projectsTitle}</h1>
        <span className="text-muted-foreground tabular-nums">{items.length}</span>
        <Button size="sm" className="ml-auto" onClick={() => open(null)}>
          <Plus aria-hidden />
          {t.newProject}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="border-border rounded-base mt-6 flex flex-col items-center border border-dashed px-6 py-16 text-center">
          <FolderKanban className="text-muted-foreground size-8" aria-hidden />
          <p className="mt-4 font-medium">{t.noProjects}</p>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">{t.noProjectsHint}</p>
        </div>
      ) : (
        <>
          <ul className="border-border rounded-base mt-6 divide-border divide-y border md:hidden">
            {rows.map((row) => {
              const project = row.original
              return (
                <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                  <LogoThumb url={project.logo_url} />
                  <button
                    type="button"
                    onClick={() => open(project)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate font-medium">{project.title}</span>
                    <span className="text-muted-foreground block truncate text-sm">
                      {displayUrl(project.url)}
                    </span>
                  </button>
                  <MoveButtons
                    index={row.index}
                    count={items.length}
                    disabled={reordering}
                    onMove={move}
                  />
                </li>
              )
            })}
          </ul>

          <div className="border-border rounded-base mt-6 hidden overflow-hidden border md:block">
            <Table className="table-fixed">
              <colgroup>
                <col className="w-24" />
                <col className="w-20" />
                <col className="w-[28%]" />
                <col />
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
                  // `relative` holds the title button's stretched hit area inside this row.
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
            <ProjectForm
              key={formKey}
              project={editing.project}
              onRetarget={(project) => setEditing({ project })}
              onDone={() => setEditing(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDelete
        name={deleting?.title ?? null}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </section>
  )
}

function MoveButtons({
  index,
  count,
  disabled,
  onMove,
}: {
  index: number
  count: number
  disabled: boolean
  onMove: (index: number, delta: -1 | 1) => void
}) {
  const t = useT()
  return (
    // Above the title button's stretched hit area, so a click moves the row instead of opening it.
    <div className="relative z-10 flex gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t.moveUp}
        disabled={disabled || index === 0}
        onClick={() => onMove(index, -1)}
      >
        <ArrowUp aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t.moveDown}
        disabled={disabled || index === count - 1}
        onClick={() => onMove(index, 1)}
      >
        <ArrowDown aria-hidden />
      </Button>
    </div>
  )
}

function LogoThumb({ url }: { url: string | null }) {
  return (
    <div className="bg-muted border-border flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border">
      {url !== null ? (
        // Decorative: the title next to it names the project.
        <img src={url} alt="" className="size-full object-contain" loading="lazy" />
      ) : (
        <ImageIcon className="text-muted-foreground size-4" aria-hidden />
      )}
    </div>
  )
}

function PublishedBadge({ published }: { published: boolean }) {
  const t = useT()
  return published ? (
    <Badge variant="secondary">{t.statusPublished}</Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      {t.statusHidden}
    </Badge>
  )
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const t = useT()
  return (
    // Above the title button's stretched hit area, so the menu opens instead of the sheet.
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

// `https://tetgeleg.mn/` reads better as `tetgeleg.mn`.
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

// The API's rules, checked here so a typo fails at the field instead of as a generic 400.
const isHttpUrl = (value: string) => /^https?:\/\//i.test(value) && URL.canParse(value)

const description = z.string().trim().max(2000, fieldKey('fieldTooLong'))

const schema = z.object({
  title: z.string().trim().min(1, fieldKey('fieldRequired')).max(200, fieldKey('fieldTooLong')),
  url: z
    .string()
    .trim()
    .min(1, fieldKey('fieldRequired'))
    .refine(isHttpUrl, fieldKey('fieldUrlInvalid')),
  description_mn: description,
  description_en: description,
  published: z.boolean(),
})

type Values = z.infer<typeof schema>

// What Save does to the logo. `keep` leaves the server's alone.
type LogoChange =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'replace'; file: File; preview: string }

function ProjectForm({
  project,
  onRetarget,
  onDone,
}: {
  project: AdminProject | null
  onRetarget: (project: AdminProject) => void
  onDone: () => void
}) {
  const t = useT()
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [logo, setLogo] = useState<LogoChange>({ kind: 'keep' })
  const [logoError, setLogoError] = useState<'fieldLogoType' | 'fieldLogoSize' | null>(null)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: project?.title ?? '',
      url: project?.url ?? '',
      description_mn: project?.description_mn ?? '',
      description_en: project?.description_en ?? '',
      published: project?.published ?? true,
    },
  })

  // Free the preview's blob when it is replaced or the sheet closes.
  useEffect(() => {
    if (logo.kind !== 'replace') return
    return () => URL.revokeObjectURL(logo.preview)
  }, [logo])

  const pickFile = (file: File | undefined) => {
    if (file === undefined) return
    if (!isLogoType(file.type)) {
      setLogoError('fieldLogoType')
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError('fieldLogoSize')
      return
    }
    setLogoError(null)
    setLogo({ kind: 'replace', file, preview: URL.createObjectURL(file) })
  }

  const onSubmit = async (values: Values) => {
    let saved: AdminProject
    try {
      saved =
        project === null ? await createProject(values) : await updateProject(project.id, values)
    } catch (err) {
      toast.error(errorMessage(err, t))
      return
    }

    try {
      if (logo.kind === 'replace') await uploadProjectLogo(saved.id, logo.file)
      if (logo.kind === 'remove' && saved.logo_url !== null) await deleteProjectLogo(saved.id)
    } catch (err) {
      toast.error(t.logoUploadFailed, { description: errorMessage(err, t) })
      // The project exists now. Point the sheet at it, so the next Save updates it rather than
      // creating a second one. The picked file stays, so Save retries the upload.
      onRetarget(saved)
      void router.invalidate()
      void refreshPublishStatus()
      return
    }

    toast.success(t.saved)
    onDone()
    void router.invalidate()
    void refreshPublishStatus()
  }

  const { errors, isSubmitting } = form.formState

  let shownLogo: string | null = null
  if (logo.kind === 'replace') shownLogo = logo.preview
  else if (logo.kind === 'keep') shownLogo = project?.logo_url ?? null

  return (
    // The form wraps header, body and footer so the footer's submit button belongs to it.
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex min-h-0 flex-1 flex-col"
      noValidate
    >
      <SheetHeader className="border-border border-b px-6 pt-6 pb-5">
        <SheetTitle className="font-display pr-8 text-xl font-bold">
          {project === null ? t.newProject : t.editProject}
        </SheetTitle>
      </SheetHeader>

      <div className="grid flex-1 content-start gap-5 overflow-y-auto px-6 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="title">{t.colTitle}</Label>
            <Input {...fieldProps('title', errors.title)} {...form.register('title')} />
            <FieldMessage id="title" error={errors.title} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="url">{t.colUrl}</Label>
            <Input
              type="url"
              inputMode="url"
              placeholder="https://"
              spellCheck={false}
              {...fieldProps('url', errors.url)}
              {...form.register('url')}
            />
            <FieldMessage id="url" error={errors.url} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="description_mn">
              {t.description} ({t.langMn})
            </Label>
            <Textarea
              lang="mn"
              className="min-h-32"
              {...fieldProps('description_mn', errors.description_mn)}
              {...form.register('description_mn')}
            />
            <FieldMessage id="description_mn" error={errors.description_mn} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description_en">
              {t.description} ({t.langEn})
            </Label>
            <Textarea
              lang="en"
              className="min-h-32"
              {...fieldProps('description_en', errors.description_en)}
              {...form.register('description_en')}
            />
            <FieldMessage id="description_en" error={errors.description_en} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="logo">{t.logo}</Label>
          <div className="flex items-center gap-4">
            <div className="bg-muted border-border flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border">
              {shownLogo !== null ? (
                <img src={shownLogo} alt="" className="size-full object-contain" />
              ) : (
                <ImageIcon className="text-muted-foreground size-6" aria-hidden />
              )}
            </div>
            <div className="grid gap-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload aria-hidden />
                  {shownLogo !== null ? t.logoReplace : t.logoChoose}
                </Button>
                {shownLogo !== null ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLogoError(null)
                      setLogo({ kind: 'remove' })
                    }}
                  >
                    <X aria-hidden />
                    {t.logoRemove}
                  </Button>
                ) : null}
              </div>
              <p className="text-muted-foreground text-xs">{t.logoHint}</p>
            </div>
          </div>
          <input
            ref={fileInput}
            id="logo"
            type="file"
            accept={LOGO_TYPES.join(',')}
            className="sr-only"
            aria-invalid={logoError !== null}
            aria-describedby={logoError !== null ? 'logo-error' : undefined}
            onChange={(e) => {
              pickFile(e.target.files?.[0])
              // Cleared so picking the same file again after a removal still fires onChange.
              e.target.value = ''
            }}
          />
          {logoError !== null ? (
            <p id="logo-error" role="alert" className="text-destructive text-sm">
              {t[logoError]}
            </p>
          ) : null}
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
