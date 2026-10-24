import { Inject, Injectable } from '@nestjs/common'
import {
  type AcceptedInvitation,
  type InvitationOutcome,
  type InvitationPreview,
  type InviteMember,
} from '@opos/contract'
import { invitationEmail, joinedTeamEmail } from '@opos/i18n/emails'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { ApiError, notFound } from '../../common/errors/api-error'
import { postgresConstraint } from '../../common/filters/http-exception.filter'
import { AccessRepository } from '../../common/permissions/access.repository'
import { type EditionAccess } from '../../common/permissions/permissions'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { ENV, type Env } from '../../config/env'
import { AccountsRepository } from '../accounts/accounts.repository'
import { MailService } from '../mail/mail.service'
import { recipientLocale } from '../mail/recipient-locale'
import { assertMayInvite, type InvitationGrant } from './anti-escalation'
import { claimsOf, grantFromClaims, grantOf } from './invitation-grant'
import {
  type InvitationClaims,
  invitationExpired,
  invitationKey,
  signInvitation,
  verifyInvitation,
} from './invitation-token'
import { InvitationsRepository } from './invitations.repository'
import { currentActor, lockActor } from './member-lock'
import { MembersRepository } from './members.repository'

const memberExists = () =>
  new ApiError(409, 'member.exists', 'The account already holds a membership in this tenant')

const used = () => new ApiError(409, 'invitation.used', 'The invitation has been accepted already')

const revoked = () =>
  new ApiError(410, 'invitation.revoked', 'The sender of the invitation may no longer grant it')

// The invitee's own answer: member.exists is written for the one who sends the invitation.
const alreadyMember = () =>
  new ApiError(409, 'invitation.already-member', 'The account is already in the team')

/** A membership expiry that has passed by now leaves the invitation nothing to grant. */
const assertGrantsAccess = (claims: InvitationClaims) => {
  if (claims.expiresAt && new Date(claims.expiresAt) <= new Date()) throw invitationExpired()
}

/** Organizer invitations (PLAN.md 7.7). */
@Injectable()
export class InvitationsService {
  private readonly key: Uint8Array
  private readonly panelUrl: string

  constructor(
    @Inject(ENV) env: Env,
    private readonly context: TenantContextService,
    private readonly members: MembersRepository,
    private readonly invitations: InvitationsRepository,
    private readonly access: AccessRepository,
    private readonly accounts: AccountsRepository,
    private readonly mail: MailService,
    private readonly rateLimiter: RouteRateLimiter,
  ) {
    this.key = invitationKey(env.INVITE_SECRET)
    this.panelUrl = env.PANEL_URL.replace(/\/$/, '')
  }

  /**
   * `POST /tenants/current/members`, inside the tenant transaction. A known account with a
   * confirmed email joins at once and gets a notification; any other address gets the link to
   * accept. Both emails go out after the commit.
   */
  async invite(body: InviteMember): Promise<InvitationOutcome> {
    const tenant = this.context.tenant()
    await this.rateLimiter.consume('invitations', `tenant:${tenant.id}`)
    const actor = await lockActor(this.members, this.context.membership()!.id)
    const grant = grantOf(body)
    const existing = await this.invitations.existingEditions(grant.editions.map((e) => e.editionId))
    if (grant.editions.some(({ editionId }) => !existing.has(editionId))) throw notFound('edition')
    const actorEditions =
      actor.role === 'head'
        ? new Map<string, EditionAccess>()
        : await this.access.editionRows(actor.id)
    assertMayInvite(actor, actorEditions, grant)

    const email = body.email.toLowerCase()
    const account = await this.invitations.confirmedAccount(email)
    if (account) {
      if (await this.invitations.isMember(account.id)) throw memberExists()
      const id = await this.invitations.addMember(tenant.id, account.id, grant)
      this.context.afterCommit(() =>
        this.mail.sendLinkEmail({
          to: account.email,
          locale: recipientLocale({ account: account.locale, tenant: tenant.defaultLocale }),
          content: joinedTeamEmail(tenant.name),
          link: `${this.panelUrl}/${tenant.slug}`,
        }),
      )
      return { outcome: 'added', member: (await this.members.find(id))! }
    }

    const { token, validUntil } = await signInvitation(
      claimsOf({ tenantId: tenant.id, email, invitedBy: actor.id }, grant),
      this.key,
    )
    this.context.afterCommit(() =>
      this.mail.sendLinkEmail({
        to: email,
        locale: recipientLocale({ tenant: tenant.defaultLocale }),
        content: invitationEmail(tenant.name),
        link: `${this.panelUrl}/invitation?token=${encodeURIComponent(token)}`,
      }),
    )
    return { outcome: 'invited', email, validUntil: validUntil.toISOString() }
  }

  /**
   * What an invitation still grants, inside withTenant: the edition rows of editions that exist,
   * and only while the membership that sent it could send it now — it exists, has not expired,
   * holds settings=write and passes assertMayInvite on its current rows. Otherwise 410
   * `invitation.revoked`: removing or demoting the sender withdraws what they sent. Acceptance
   * locks the sender's membership, so a demotion committed meanwhile is seen.
   */
  private async standingGrant(
    claims: InvitationClaims,
    { lock }: { lock: boolean },
  ): Promise<InvitationGrant> {
    try {
      const inviter = lock
        ? await lockActor(this.members, claims.invitedBy)
        : await currentActor(this.members, claims.invitedBy)
      const grant = grantFromClaims(claims)
      const existing = await this.invitations.existingEditions(
        grant.editions.map((e) => e.editionId),
      )
      const standing = {
        ...grant,
        editions: grant.editions.filter(({ editionId }) => existing.has(editionId)),
      }
      const inviterEditions =
        inviter.role === 'head'
          ? new Map<string, EditionAccess>()
          : await this.access.editionRows(inviter.id)
      assertMayInvite(inviter, inviterEditions, standing)
      return standing
    } catch (error) {
      if (error instanceof ApiError && error.getStatus() === 403) throw revoked()
      throw error
    }
  }

  /** `GET /invitations/preview`: what the invitation page shows before anyone signs in. */
  async preview(token: string): Promise<InvitationPreview> {
    await this.rateLimiter.consume('invitationPreview', `ip:${this.context.clientAddress()}`)
    const { claims, jti, validUntil } = await verifyInvitation(token, this.key)
    return this.context.withTenant(claims.tenantId, async () => {
      const tenant = await this.invitations.tenant()
      if (!tenant) throw notFound('tenant')
      if (await this.invitations.isAccepted(jti)) throw used()
      assertGrantsAccess(claims)
      await this.standingGrant(claims, { lock: false })
      return {
        tenant: { name: tenant.name },
        email: claims.email,
        validUntil: validUntil.toISOString(),
      }
    })
  }

  /**
   * `POST /invitations/accept`: the signed-in account joins the team, once its confirmed email is
   * the invited one. An edition deleted since the invitation went out is skipped.
   */
  async accept(token: string): Promise<AcceptedInvitation> {
    const { claims, jti } = await verifyInvitation(token, this.key)
    if ((await this.accounts.confirmedEmail()) !== claims.email) {
      throw new ApiError(
        403,
        'invitation.email-mismatch',
        "The invitation names another email than the account's confirmed one",
      )
    }
    const accountId = this.context.account().id
    return this.context.withTenant(claims.tenantId, async () => {
      const tenant = await this.invitations.tenant()
      if (!tenant) throw notFound('tenant')
      if (await this.invitations.isAccepted(jti)) throw used()
      assertGrantsAccess(claims)
      if (await this.invitations.isMember(accountId)) throw alreadyMember()
      const grant = await this.standingGrant(claims, { lock: true })
      await this.invitations.recordAcceptance(tenant.id, jti)
      try {
        await this.invitations.addMember(tenant.id, accountId, grant)
      } catch (error) {
        // Another invitation the account accepted at the same time won the unique constraint.
        if (postgresConstraint(error) === 'tenant_memberships_account_tenant_unique') {
          throw alreadyMember()
        }
        throw error
      }
      return { tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name } }
    })
  }
}
