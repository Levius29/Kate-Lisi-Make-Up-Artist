/**
 * Issuing a contract: take the snapshot, take the next number, write both in one
 * transaction.
 *
 * The numbering must be gapless and sequential (SPEC.md §3.5). Reading the
 * counter, building the document and writing it back as separate steps would let
 * two issues in quick succession claim the same number, so the read, the
 * increment and the insert all happen inside a single StorageAdapter
 * transaction.
 */
import type {
  Appointment,
  BusinessProfile,
  Client,
  Contract,
  ContractLocale,
  Service,
} from '../types'
import type { StorageAdapter } from '../storage/StorageAdapter'
import { TEMPLATE_VERSION } from './template'

export class ContractIssueError extends Error {}

export function formatContractNumber(prefix: string, sequence: number): string {
  return `${prefix}${String(sequence).padStart(4, '0')}`
}

/**
 * Builds the frozen record. Exported separately from the write so it can be
 * tested without a database.
 */
export function buildContract(input: {
  contractNumber: string
  appointment: Appointment
  client: Client
  service: Service
  profile: BusinessProfile
  language: ContractLocale
  generatedAt: string
}): Omit<Contract, 'id' | 'createdAt' | 'updatedAt'> {
  const { appointment: a } = input
  return {
    contractNumber: input.contractNumber,
    appointmentId: a.id,
    // Structured clones: later edits to these records must not reach back into
    // an issued contract through a shared object reference.
    clientSnapshot: structuredClone(input.client),
    businessSnapshot: structuredClone(input.profile),
    serviceSnapshot: structuredClone(input.service),
    financialSnapshot: structuredClone({
      startAt: a.startAt,
      locationName: a.locationName,
      locationAddress: a.locationAddress,
      peopleCount: a.peopleCount,
      lineItems: a.lineItems,
      subtotal: a.subtotal,
      total: a.total,
      depositPercent: a.depositPercent,
      depositAmount: a.depositAmount,
      cancellationCutoffs: a.cancellationCutoffs,
      ...(a.balanceDueAt === undefined ? {} : { balanceDueAt: a.balanceDueAt }),
    }),
    language: input.language,
    templateVersion: TEMPLATE_VERSION,
    generatedAt: input.generatedAt,
  }
}

export async function issueContract(
  storage: StorageAdapter,
  appointmentId: string,
  language: ContractLocale,
): Promise<Contract> {
  return storage.transaction(async (tx) => {
    const appointment = await tx.appointments.get(appointmentId)
    if (!appointment) throw new ContractIssueError('That appointment no longer exists.')

    const [client, service, profile] = await Promise.all([
      tx.clients.get(appointment.clientId),
      tx.services.get(appointment.serviceId),
      tx.profile.get(),
    ])

    if (!client) throw new ContractIssueError('The client for this appointment is missing.')
    if (!service) throw new ContractIssueError('The service for this appointment is missing.')
    if (!profile) {
      throw new ContractIssueError(
        'Fill in the business profile in Settings before issuing a contract.',
      )
    }
    if (appointment.locationName.trim() === '' || appointment.locationAddress.trim() === '') {
      throw new ContractIssueError(
        'The contract states where the service is performed, so the venue name and address are required.',
      )
    }
    if (profile.email.trim() === '') {
      // The GDPR block has to name a contact for the rights under Articles 15
      // to 22. Issuing without one would print a clause the client cannot use.
      throw new ContractIssueError(
        'Add a contact email in Settings: the contract names it for data-protection requests.',
      )
    }

    const sequence = profile.nextContractNumber
    const contract = await tx.contracts.create(
      buildContract({
        contractNumber: formatContractNumber(profile.contractPrefix, sequence),
        appointment,
        client,
        service,
        profile,
        language,
        generatedAt: new Date().toISOString(),
      }),
    )

    await tx.profile.save({ ...profile, nextContractNumber: sequence + 1 })
    await tx.appointments.put({ ...appointment, contractId: contract.id })

    return contract
  })
}
