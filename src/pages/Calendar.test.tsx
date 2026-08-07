import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { storage } from '../storage'
import type { Appointment, AppointmentRecall, Client, Service } from '../types'
import { Calendar, WeekGrid, createCalendarItems } from './Calendar'

const timestamp = '2026-08-01T08:00:00.000Z'

function makeClient(id: string, firstName: string): Client {
  return {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    firstName,
    lastName: 'Sample',
    nationality: 'British',
    timezone: 'Europe/London',
    phoneE164: '+447700900001',
    email: `${firstName.toLowerCase()}@example.invalid`,
    addressLine: '',
    city: 'London',
    country: 'United Kingdom',
    allergies: '',
    patchTestDone: false,
    productPreferences: { halal: false, vegan: false, crueltyFree: false, other: '' },
    imageReleaseLevel: 'none',
    gdprConsentAt: timestamp,
    notes: '',
  }
}

function makeService(id: string, name: string): Service {
  return {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    name,
    description: '',
    durationMinutes: 90,
    basePrice: 30_000,
    defaultDepositPercent: 30,
    cancellationTiers: [],
    recallTemplates: [],
    requiresTrial: false,
    requiresPatchTest: false,
    contractTemplateId: 'default',
    active: true,
  }
}

function makeRecall(id: string, channel: AppointmentRecall['channel']): AppointmentRecall {
  return {
    id,
    daysBefore: 3,
    channel,
    messageTemplate: 'Hello {firstName}, a reminder for {serviceName} on {dateLong}.',
    dueAt: '2026-08-08T08:00:00.000Z',
  }
}

function makeAppointment(
  id: string,
  clientId: string,
  serviceId: string,
  hour: string,
  recalls: AppointmentRecall[],
): Appointment {
  return {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    clientId,
    serviceId,
    status: id === 'appointment-one' ? 'confirmed' : 'balance_paid',
    startAt: `2026-08-08T${hour}:00:00.000Z`,
    endAt: `2026-08-08T${String(Number(hour) + 1).padStart(2, '0')}:30:00.000Z`,
    locationName: 'Rome venue',
    locationAddress: 'Rome, Italy',
    peopleCount: 1,
    lineItems: [{ label: 'Service', quantity: 1, unitPrice: 30_000 }],
    subtotal: 30_000,
    total: 30_000,
    depositPercent: 30,
    depositAmount: 9_000,
    payments: [],
    cancellationCutoffs: [],
    balanceDueAt: '2026-08-09T08:00:00.000Z',
    recalls,
    internalNotes: '',
  }
}

const clients = [makeClient('client-one', 'Anna'), makeClient('client-two', 'Bea')]
const services = [
  makeService('service-one', 'Bridal make-up'),
  makeService('service-two', 'Wedding trial'),
]
const appointments = [
  makeAppointment('appointment-one', 'client-one', 'service-one', '08', [
    makeRecall('recall-one', 'whatsapp'),
    makeRecall('recall-two', 'email'),
  ]),
  makeAppointment('appointment-two', 'client-two', 'service-two', '09', [
    makeRecall('recall-three', 'whatsapp'),
    makeRecall('recall-four', 'email'),
  ]),
  makeAppointment('appointment-three', 'client-one', 'service-one', '10', []),
]

function renderCalendar(): string {
  vi.spyOn(storage, 'live').mockReturnValue({
    appointments,
    clients,
    services,
    contracts: [],
    profile: undefined,
  })

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/calendar']}>
      <Routes>
        <Route path="calendar/*" element={<Calendar />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-08T10:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('calendar day summaries', () => {
  it('keeps both bookings ahead of one collapsed four-milestone marker in the month grid', () => {
    const markup = renderCalendar()
    const monthGrid = markup.slice(
      markup.indexOf('calendar-month-grid'),
      markup.indexOf('Selected day'),
    )

    expect(monthGrid).not.toContain('aria-label="4 milestones"')
    expect(monthGrid).toContain('<span class="sr-only"> milestones</span>')
    expect(monthGrid).toContain('+1 booking')
    expect(monthGrid.match(/aria-label="\d\d:\d\d, (Anna|Bea) Sample"/g)).toHaveLength(2)
    expect(monthGrid.indexOf('10:00, Anna Sample')).toBeLessThan(
      monthGrid.indexOf('calendar-month-milestone'),
    )
    expect(monthGrid.indexOf('11:00, Bea Sample')).toBeLessThan(
      monthGrid.indexOf('calendar-month-milestone'),
    )
  })

  it('uses the same bookings-first collapse in the week grid', () => {
    const itemsByDate = new Map<string, ReturnType<typeof createCalendarItems>>()
    createCalendarItems(appointments).forEach((item) => {
      itemsByDate.set(item.dateKey, [...(itemsByDate.get(item.dateKey) ?? []), item])
    })
    const weekGrid = renderToStaticMarkup(
      <WeekGrid
        anchorKey="2026-08-08"
        selectedKey="2026-08-08"
        itemsByDate={itemsByDate}
        clientsById={new Map(clients.map((client) => [client.id, client]))}
        childAppointments={new Map()}
        onSelectDay={() => undefined}
        onOpen={() => undefined}
      />,
    )

    expect(weekGrid.match(/>10:00<br\/>Anna Sample</g)).toHaveLength(1)
    expect(weekGrid.match(/>11:00<br\/>Bea Sample</g)).toHaveLength(1)
    expect(weekGrid).toContain('+1 booking')
    expect(weekGrid).toContain('+4 milestones')
    expect(weekGrid).not.toContain('WhatsApp recall')
    expect(weekGrid).not.toContain('line-clamp')
    expect(weekGrid.indexOf('Anna Sample')).toBeLessThan(weekGrid.indexOf('+4 milestones'))
    expect(weekGrid.indexOf('Bea Sample')).toBeLessThan(weekGrid.indexOf('+4 milestones'))
  })

  it('shows full day details and recall work actions without hiding the appointment link', () => {
    const markup = renderCalendar()
    const agenda = markup.slice(markup.indexOf('Selected day'))

    expect(agenda.indexOf('10:00 · Anna Sample')).toBeLessThan(
      agenda.indexOf('WhatsApp recall'),
    )
    expect(agenda).toContain('Bridal make-up')
    expect(agenda).toContain('Confirmed')
    expect(agenda).toContain('Open WhatsApp')
    expect(agenda).toContain('Open email')
    expect(agenda).toContain('Mark as sent')
    expect(agenda).toContain('View appointment')
  })
})
