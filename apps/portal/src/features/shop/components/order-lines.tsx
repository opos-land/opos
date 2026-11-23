import { Trans, useLingui } from '@lingui/react/macro'
import { type LinkedOrder } from '@opos/contract'
import { useMoney } from '../hooks/use-money'
import { lineName } from './summary-step'

/**
 * The lines of a placed order with their amounts and its total, as its buyer reads them: what a
 * discount code took off is a line of its own, under the code.
 */
export function OrderLines({
  lines,
  totalMinor,
  currency,
}: Pick<LinkedOrder, 'lines' | 'totalMinor' | 'currency'>) {
  const { t } = useLingui()
  const money = useMoney(currency)
  const nameOf = (line: LinkedOrder['lines'][number]) => {
    const code = line.name.toUpperCase()
    return line.kind === 'discount' ? t`Discount code ${code}` : lineName(line)
  }

  return (
    <table className="w-full text-left">
      <caption className="sr-only">
        <Trans>What the order holds</Trans>
      </caption>
      <tbody>
        {lines.map((line, index) => (
          // A placed order's lines never change place.
          <tr key={index}>
            <th scope="row" className="py-1 pr-2 font-normal">
              {nameOf(line)}
            </th>
            <td className="py-1 text-right whitespace-nowrap">{money(line.amountMinor)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t font-semibold">
          <th scope="row" className="py-2 pr-2">
            <Trans>Total</Trans>
          </th>
          <td className="py-2 text-right whitespace-nowrap">{money(totalMinor)}</td>
        </tr>
      </tfoot>
    </table>
  )
}
