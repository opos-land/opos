import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type MerchandiseItem } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { notifySuccess } from '../../../shared/lib/notify'
import {
  Button,
  Checkbox,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/ui'
import { useCurrentTenant } from '../../tenants'
import { catalogKey, putStockOptions, putVariantsOptions } from '../api/catalog'
import { variantOf, type VariantRow, variantRows, variantsPlan } from '../model/merchandise'

const SAVED = { success: msg`The variants and their stock are saved.` }

/**
 * The variants of an item and the stock of each: every combination of its axes as a row, ticked
 * while it exists. Saving sets which variants exist, then the stock of each one that changed; the
 * outcome is told once, when all of it is done.
 */
export function VariantsEditor({ item, canWrite }: { item: MerchandiseItem; canWrite: boolean }) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<VariantRow[]>(() => variantRows(item))
  const [problem, setProblem] = useState<'stock' | 'limit' | null>(null)
  const [pending, setPending] = useState(false)
  const params = { editionId: item.editionId, itemId: item.id }
  // Each write stays quiet: the editor tells one outcome for all of them.
  const putVariants = useMutation({ ...putVariantsOptions(api), meta: { success: false } })
  const putStock = useMutation({ ...putStockOptions(api), meta: { success: false } })
  const bare = item.axes.length === 0
  const change = (index: number, changes: Partial<VariantRow>) =>
    setRows(rows.map((row, at) => (at === index ? { ...row, ...changes } : row)))

  const save = async () => {
    const plan = variantsPlan(rows)
    setProblem('problem' in plan ? plan.problem : null)
    if ('problem' in plan) return
    setPending(true)
    try {
      // An item without axes keeps its one variant: only its stock is set.
      const saved = bare
        ? item
        : await putVariants.mutateAsync({ params, body: { variants: plan.variants } })
      for (const { valueIds, stock } of plan.stocks) {
        const variant = variantOf(saved, valueIds)
        if (variant && variant.stock !== stock) {
          await putStock.mutateAsync({
            params: { ...params, variantId: variant.id },
            body: { stock },
          })
        }
      }
      notifySuccess(SAVED, undefined)
    } catch {
      // The failed write told its own failure; what was saved before it is read again below.
    } finally {
      setPending(false)
      await queryClient.invalidateQueries({ queryKey: catalogKey(api) })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm">
        <Trans>
          A combination that is not ticked does not exist and cannot be bought. A variant at zero
          stock shows as unavailable. An unlimited variant sells only until the pre-order deadline
          of the edition.
        </Trans>
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">
              <Trans>Variant</Trans>
            </TableHead>
            {!bare && (
              <TableHead scope="col">
                <Trans>Exists</Trans>
              </TableHead>
            )}
            <TableHead scope="col">
              <Trans>Stock</Trans>
            </TableHead>
            <TableHead scope="col">
              <Trans>Unlimited</Trans>
            </TableHead>
            {!bare && (
              <TableHead scope="col">
                <Trans context="a variant">Hidden</Trans>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const name = bare ? t`The item itself` : row.labels.join(' · ')
            const off = !canWrite || !row.exists
            return (
              <TableRow key={row.valueIds.join(' ')}>
                <TableHead scope="row">{name}</TableHead>
                {!bare && (
                  <TableCell>
                    <Checkbox
                      aria-label={t`${name}: exists`}
                      checked={row.exists}
                      disabled={!canWrite}
                      onCheckedChange={(exists) => change(index, { exists })}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <Input
                    aria-label={t`${name}: stock`}
                    inputMode="numeric"
                    className="w-24"
                    value={row.unlimited ? '' : row.stock}
                    disabled={off || row.unlimited}
                    onChange={(event) => change(index, { stock: event.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Checkbox
                    aria-label={t`${name}: unlimited`}
                    checked={row.unlimited}
                    disabled={off}
                    onCheckedChange={(unlimited) =>
                      change(index, { unlimited, stock: unlimited ? '' : row.stock || '0' })
                    }
                  />
                </TableCell>
                {!bare && (
                  <TableCell>
                    <Checkbox
                      aria-label={t`${name}: hidden`}
                      checked={row.hidden}
                      disabled={off}
                      onCheckedChange={(hidden) => change(index, { hidden })}
                    />
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {problem === 'stock' && (
        <p className="text-destructive text-sm">
          <Trans>
            Enter the stock of every variant that exists as a whole number from 0, or mark it
            unlimited.
          </Trans>
        </p>
      )}
      {problem === 'limit' && (
        <p className="text-destructive text-sm">
          <Trans>An item holds at most 100 variants. Untick some of the combinations.</Trans>
        </p>
      )}
      {canWrite && (
        <div>
          <Button disabled={pending} onClick={() => void save()}>
            <Trans>Save the variants and their stock</Trans>
          </Button>
        </div>
      )}
    </div>
  )
}
