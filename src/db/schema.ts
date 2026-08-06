export const DATABASE_NAME = 'kate-lisi-studio'

export const schemaV1 = {
  profile: 'id',
  clients: 'id, [lastName+firstName], lastName, firstName, email, phoneE164, deletedAt',
  services: 'id, name, active, deletedAt',
  appointments:
    'id, startAt, endAt, clientId, serviceId, status, parentAppointmentId, contractId, deletedAt',
  contracts: 'id, &contractNumber, appointmentId, generatedAt, signedAt, deletedAt',
  invoices: 'id, &invoiceNumber, appointmentId, clientId, issuedAt, paidAt, deletedAt',
  meta: 'key, updatedAt',
} as const
