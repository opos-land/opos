import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type PaymentProvider, type ProviderAccountState } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  Badge,
  Button,
  CheckboxField,
  ErrorMessage,
  FormField,
  Input,
  IrreversibleAction,
  LoadingView,
  NativeSelect,
  NativeSelectOption,
  Section,
} from '../../../shared/ui'
import { useCurrentTenant, useTenantTime } from '../../tenants'
import {
  connectProviderAccountOptions,
  disconnectProviderAccountOptions,
  providerAccountOptions,
  shopKey,
} from '../api/shop'
import { credentialsBody, missingMessage, PROVIDERS } from '../model/providers'

/**
 * The convention's own payment provider account: buyers pay into it, and OPOS holds no money. Its
 * credentials are given here, checked with the provider, stored encrypted and never shown again.
 */
export function ProviderAccountSection({ canWrite }: { canWrite: boolean }) {
  const { api } = useCurrentTenant()
  const state = useQuery(providerAccountOptions(api))

  return (
    <Section title={<Trans>Payment provider account</Trans>}>
      <p className="max-w-xl text-sm">
        <Trans>
          Buyers pay straight into the convention’s own account with a payment provider. OPOS holds
          no money.
        </Trans>
      </p>
      {state.isPending ? (
        <LoadingView />
      ) : state.isError ? (
        <ErrorMessage error={state.error} />
      ) : (
        <>
          <Account state={state.data} />
          {canWrite && <Credentials state={state.data} />}
        </>
      )}
    </Section>
  )
}

/** The account as it is: its provider, when it was connected and whether it is ready to sell. */
function Account({ state: { account } }: { state: ProviderAccountState }) {
  const { i18n } = useLingui()
  const time = useTenantTime()
  if (!account) {
    return (
      <p className="text-sm">
        <Trans>No payment provider account is connected.</Trans>
      </p>
    )
  }
  // What the provider's check of the credentials left unchecked, once the account sells.
  const readyNote = account.ready ? PROVIDERS[account.provider].readyNote : undefined
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid max-w-lg grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">
          <Trans>Provider</Trans>
        </dt>
        <dd>{i18n._(PROVIDERS[account.provider].name)}</dd>
        <dt className="text-muted-foreground">
          <Trans>Connected</Trans>
        </dt>
        <dd>{time.format(account.connectedAt)}</dd>
        <dt className="text-muted-foreground">
          <Trans>Status</Trans>
        </dt>
        <dd>
          {account.ready ? (
            <Badge>
              <Trans>Ready to sell</Trans>
            </Badge>
          ) : (
            <Badge variant="destructive">
              <Trans>Not ready to sell</Trans>
            </Badge>
          )}
        </dd>
      </dl>
      {readyNote && <p className="max-w-xl text-sm">{i18n._(readyNote)}</p>}
      {account.missing.length > 0 && (
        <ul className="list-disc pl-5 text-sm">
          {account.missing.map((code) => {
            const message = missingMessage(code)
            return (
              <li key={code}>
                {message ? (
                  i18n._(message)
                ) : (
                  // A provider's module may name a condition this panel has no words for yet.
                  <Trans>
                    The provider reports a condition this panel cannot describe yet (code: {code}).
                  </Trans>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Connecting an account, giving its credentials again, and disconnecting it. */
function Credentials({
  state: { account, providers, callsFrom },
}: {
  state: ProviderAccountState
}) {
  const { t, i18n } = useLingui()
  const { tenant, api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const [chosen, setChosen] = useState<PaymentProvider | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const name = tenant.name

  // The shop of each edition reads whether the account is ready.
  const refresh = () => queryClient.invalidateQueries({ queryKey: shopKey(api) })
  const connect = useMutation({
    ...connectProviderAccountOptions(api),
    meta: { success: msg`The payment provider account is connected.` },
    onSuccess: async (saved) => {
      queryClient.setQueryData(providerAccountOptions(api).queryKey, saved)
      setValues({})
      await refresh()
    },
  })
  const disconnect = useMutation({
    ...disconnectProviderAccountOptions(api),
    meta: { success: msg`The payment provider account is disconnected.` },
    onSuccess: refresh,
  })

  if (providers.length === 0) {
    return (
      <p className="text-sm">
        <Trans>No payment provider can be connected in this environment yet.</Trans>
      </p>
    )
  }
  const provider =
    chosen && providers.includes(chosen)
      ? chosen
      : account && providers.includes(account.provider)
        ? account.provider
        : providers[0]!
  const body = credentialsBody(provider, values)

  return (
    <div className="flex max-w-lg flex-col gap-4">
      {providers.length > 1 && (
        <FormField label={t`Provider`}>
          {(control) => (
            <NativeSelect
              {...control}
              value={provider}
              onChange={(event) => {
                setChosen(event.target.value as PaymentProvider)
                setValues({})
              }}
            >
              {providers.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {i18n._(PROVIDERS[option].name)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
      )}
      {PROVIDERS[provider].needsAddress && (
        <p className="text-sm">
          {callsFrom ? (
            <Trans>
              This provider answers only calls from the IP addresses entered in its panel. Enter
              this one there before you connect the account: <strong>{callsFrom}</strong>
            </Trans>
          ) : (
            <Trans>
              This provider answers only calls from the IP addresses entered in its panel. Ask the
              OPOS administrators for the address to enter there before you connect the account.
            </Trans>
          )}
        </p>
      )}
      {PROVIDERS[provider].fields.map((field) =>
        field.kind === 'choice' ? (
          <CheckboxField
            key={field.name}
            label={i18n._(field.label)}
            hint={field.hint && i18n._(field.hint)}
            checked={values[field.name] === 'true'}
            disabled={connect.isPending}
            onChange={(ticked) =>
              setValues((held) => ({ ...held, [field.name]: ticked ? 'true' : 'false' }))
            }
          />
        ) : (
          <FormField
            key={field.name}
            label={i18n._(field.label)}
            hint={field.hint && i18n._(field.hint)}
          >
            {(control) => (
              <Input
                {...control}
                // A key is typed blind; an identifier is shown as it is typed.
                type={field.kind === 'text' ? 'text' : 'password'}
                inputMode={field.kind === 'text' ? 'numeric' : undefined}
                autoComplete="off"
                value={values[field.name] ?? ''}
                disabled={connect.isPending}
                onChange={(event) =>
                  setValues((held) => ({ ...held, [field.name]: event.target.value }))
                }
              />
            )}
          </FormField>
        ),
      )}
      <p className="text-muted-foreground text-sm">
        <Trans>
          The credentials are checked with the provider, stored encrypted and never shown again.
        </Trans>
      </p>
      <div className="flex flex-wrap gap-3">
        {account ? (
          <>
            <IrreversibleAction
              label={<Trans>Replace the credentials</Trans>}
              title={<Trans>Replace the credentials of the payment provider account?</Trans>}
              action={<Trans>Replace the credentials</Trans>}
              disabled={!body}
              onConfirm={() => (body ? connect.mutateAsync({ body }) : Promise.resolve())}
            >
              <Trans>
                The credentials stored now go. Once the provider accepts the new ones, payments use
                them.
              </Trans>
            </IrreversibleAction>
            <IrreversibleAction
              label={<Trans>Disconnect the account</Trans>}
              title={<Trans>Disconnect the payment provider account of {name}?</Trans>}
              action={<Trans>Disconnect the account</Trans>}
              onConfirm={() => disconnect.mutateAsync({})}
            >
              <Trans>
                Its credentials are removed, and no shop of the convention can open until an account
                is connected again.
              </Trans>
            </IrreversibleAction>
          </>
        ) : (
          <Button
            disabled={!body || connect.isPending}
            onClick={() => body && connect.mutate({ body })}
          >
            <Trans>Connect the account</Trans>
          </Button>
        )}
      </div>
    </div>
  )
}
